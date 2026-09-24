import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';

import { NativeUpdateService } from './native-update.service';

/*
 * 869f6tczy. A player without "Install unknown apps" - Android's default - tapped
 * Update, waited for the ~207 MB download, was sent to the permission screen, allowed
 * it, came back and tapped again. That second tap downloaded the whole file again:
 * measured with the real service, 2 downloads and 1 install, 414 MB for one update.
 * Cancelling Android's installer and tapping again did the same.
 *
 * The file and the version it holds are now remembered, and the next tap installs it.
 */

const DIGEST = 'C84493C014A64336728B76BAC3ED86494ACADC38195737AEC9BDE53D1A1F8B13';

function release(version: string, digest?: string) {
  return {
    tag_name: `v${version}`,
    html_url: `https://github.com/JohnChourp/optc-team-builder/releases/tag/v${version}`,
    assets: [
      {
        name: `optc-team-builder-v${version}.apk`,
        size: 1000,
        content_type: 'application/vnd.android.package-archive',
        browser_download_url: `https://github.com/JohnChourp/optc-team-builder/releases/download/v${version}/optc-team-builder-v${version}.apk`,
        ...(digest ? { digest } : {}),
      },
    ],
  };
}

/** A rejection shaped the way Capacitor delivers one: an Error carrying the native code. */
function pluginError(message: string, code?: string): Error {
  return Object.assign(new Error(message), code ? { code } : {});
}

function createService(options: { latest: ReturnType<typeof release>; canInstall?: boolean }) {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

  let latest = options.latest;
  const fetch = vi.fn(async () => ({ ok: true, json: async () => latest }));
  const documentStub = { defaultView: { fetch, open: vi.fn() } } as unknown as Document;

  let granted = options.canInstall ?? false;
  const apkUpdater = {
    download: vi.fn(async (request: { fileName?: string }) => ({
      path: `/cache/updates/${request.fileName}`,
      bytes: 1000,
    })),
    install: vi.fn(async (_request: { path: string; sha256?: string }) => undefined),
    canInstall: vi.fn(async () => ({ granted })),
    openInstallSettings: vi.fn(async () => undefined),
    addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
  };

  const service = new NativeUpdateService(documentStub, async () => '0.6.4', apkUpdater as never);

  return {
    service,
    apkUpdater,
    /** The player allows "Install unknown apps" in Android's settings. */
    grant: () => {
      granted = true;
    },
    publish: (next: ReturnType<typeof release>) => {
      latest = next;
    },
  };
}

describe('NativeUpdateService - the APK already downloaded', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('installs the downloaded file when the player comes back from allowing the install', async () => {
    const { service, apkUpdater, grant } = createService({ latest: release('0.6.5') });

    await service.check();
    await service.downloadAndInstall();

    expect(apkUpdater.openInstallSettings).toHaveBeenCalledOnce();
    expect(service.updatePhase()).toBe('ready');
    expect(service.readyToInstall()).toBe(true);

    grant();
    // Coming back to the app re-checks, and finds the same release.
    await service.check();
    await service.downloadAndInstall();

    expect(apkUpdater.download).toHaveBeenCalledOnce();
    expect(apkUpdater.install).toHaveBeenCalledOnce();
    expect(apkUpdater.install).toHaveBeenCalledWith({ path: '/cache/updates/optc-team-builder-v0.6.5.apk' });
    expect(service.updatePhase()).toBe('ready');
  });

  it('installs it again, without a download, after the player cancels the Android installer', async () => {
    const { service, apkUpdater } = createService({ latest: release('0.6.5'), canInstall: true });

    await service.check();
    await service.downloadAndInstall();
    await service.downloadAndInstall();

    expect(apkUpdater.download).toHaveBeenCalledOnce();
    expect(apkUpdater.install).toHaveBeenCalledTimes(2);
  });

  it('hands the digest the release publishes to the native check, on every install', async () => {
    const { service, apkUpdater } = createService({
      latest: release('0.6.5', `sha256:${DIGEST}`),
      canInstall: true,
    });

    await service.check();
    expect(service.availableUpdate()?.apkSha256).toBe(DIGEST.toLowerCase());

    await service.downloadAndInstall();
    await service.downloadAndInstall();

    expect(apkUpdater.install).toHaveBeenNthCalledWith(1, {
      path: '/cache/updates/optc-team-builder-v0.6.5.apk',
      sha256: DIGEST.toLowerCase(),
    });
    expect(apkUpdater.install).toHaveBeenNthCalledWith(2, {
      path: '/cache/updates/optc-team-builder-v0.6.5.apk',
      sha256: DIGEST.toLowerCase(),
    });
  });

  it('invents no digest when the release publishes none, or one that is not SHA-256', async () => {
    for (const digest of [undefined, 'md5:0123456789abcdef0123456789abcdef', 'sha256:tooshort']) {
      const { service, apkUpdater } = createService({ latest: release('0.6.5', digest), canInstall: true });

      await service.check();
      await service.downloadAndInstall();

      expect(service.availableUpdate()?.apkSha256, String(digest)).toBeUndefined();
      expect(apkUpdater.install, String(digest)).toHaveBeenCalledWith({
        path: '/cache/updates/optc-team-builder-v0.6.5.apk',
      });
    }
  });

  it('downloads afresh, once, when the remembered file is gone', async () => {
    const { service, apkUpdater, grant } = createService({ latest: release('0.6.5') });

    await service.check();
    await service.downloadAndInstall();

    grant();
    apkUpdater.install.mockRejectedValueOnce(
      pluginError('Downloaded apk is missing: /cache/updates/optc-team-builder-v0.6.5.apk', 'APK_MISSING'),
    );
    await service.downloadAndInstall();

    expect(apkUpdater.download).toHaveBeenCalledTimes(2);
    expect(apkUpdater.install).toHaveBeenCalledTimes(2);
    expect(service.updatePhase()).toBe('ready');
    expect(service.downloadError()).toBeNull();
  });

  it('downloads afresh when the remembered file no longer matches its digest', async () => {
    const { service, apkUpdater, grant } = createService({ latest: release('0.6.5', `sha256:${DIGEST}`) });

    await service.check();
    await service.downloadAndInstall();

    grant();
    apkUpdater.install.mockRejectedValueOnce(
      pluginError('Downloaded apk does not match its published digest.', 'APK_DIGEST_MISMATCH'),
    );
    await service.downloadAndInstall();

    expect(apkUpdater.download).toHaveBeenCalledTimes(2);
    expect(apkUpdater.install).toHaveBeenCalledTimes(2);
  });

  it('reports any other install failure rather than downloading again', async () => {
    const { service, apkUpdater, grant } = createService({ latest: release('0.6.5') });

    await service.check();
    await service.downloadAndInstall();

    grant();
    apkUpdater.install.mockRejectedValueOnce(pluginError('Unable to open the package installer: no activity'));
    await service.downloadAndInstall();

    expect(apkUpdater.download).toHaveBeenCalledOnce();
    expect(service.updatePhase()).toBe('failed');
    expect(service.downloadError()).toBe('Unable to open the package installer: no activity');
    // Failed is not "ready to install": the banner goes back through the alert.
    expect(service.readyToInstall()).toBe(false);

    // Trying again still uses the bytes on disk, and says so.
    await service.downloadAndInstall();

    expect(apkUpdater.download).toHaveBeenCalledOnce();
    expect(apkUpdater.install).toHaveBeenCalledTimes(2);
    expect(service.updatePhase()).toBe('ready');
    expect(service.downloadError()).toBeNull();
  });

  it('downloads a newer release instead of installing the one on disk', async () => {
    const { service, apkUpdater, grant, publish } = createService({ latest: release('0.6.5') });

    await service.check();
    await service.downloadAndInstall();
    expect(service.readyToInstall()).toBe(true);

    publish(release('0.6.6'));
    await service.check();

    // The file on disk is 0.6.5; the update on offer is now 0.6.6.
    expect(service.readyToInstall()).toBe(false);

    grant();
    await service.downloadAndInstall();

    expect(apkUpdater.download).toHaveBeenCalledTimes(2);
    expect(apkUpdater.download).toHaveBeenLastCalledWith(
      expect.objectContaining({ fileName: 'optc-team-builder-v0.6.6.apk' }),
    );
    expect(apkUpdater.install).toHaveBeenCalledOnce();
    expect(apkUpdater.install).toHaveBeenCalledWith({ path: '/cache/updates/optc-team-builder-v0.6.6.apk' });
  });

  it('remembers nothing from a download that failed', async () => {
    const { service, apkUpdater } = createService({ latest: release('0.6.5'), canInstall: true });

    apkUpdater.download.mockRejectedValueOnce(pluginError('Download truncated: expected 1000 bytes, received 10'));
    await service.check();
    await service.downloadAndInstall();

    expect(service.updatePhase()).toBe('failed');
    expect(apkUpdater.install).not.toHaveBeenCalled();

    await service.downloadAndInstall();

    expect(apkUpdater.download).toHaveBeenCalledTimes(2);
    expect(apkUpdater.install).toHaveBeenCalledOnce();
  });
});

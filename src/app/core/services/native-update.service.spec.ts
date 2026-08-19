import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';

import { NativeUpdateService } from './native-update.service';

// The running native version is injected per instance (a deterministic
// `NativeVersionReader`) rather than read from the globally-shared `@capacitor/app`
// mock. Reading the shared `App.getInfo` mock made `current` race a sibling
// spec's `beforeEach` re-arm under the shared Angular unit-test module registry
// (`current` briefly fell back to the '1.0.0' default), an order/timing-dependent
// full-suite flake; injecting the version removes that shared dependency.
/** Release payload carrying a downloadable APK asset, as GitHub returns it. */
const APK_RELEASE = {
  tag_name: 'v1.1.0',
  html_url: 'https://github.com/JohnChourp/optc-team-builder/releases/tag/v1.1.0',
  assets: [
    {
      name: 'optc-team-builder-v1.1.0.apk',
      size: 1000,
      content_type: 'application/vnd.android.package-archive',
      browser_download_url:
        'https://github.com/JohnChourp/optc-team-builder/releases/download/v1.1.0/optc-team-builder-v1.1.0.apk',
    },
  ],
};

function createService(options?: {
  native?: boolean;
  currentVersion?: string;
  latest?: { tag_name?: string; html_url?: string; assets?: unknown[] } | null;
  ok?: boolean;
  canInstall?: boolean;
  downloadRejects?: Error;
}) {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(options?.native ?? true);

  const open = vi.fn();
  const fetch = vi.fn().mockResolvedValue({
    ok: options?.ok ?? true,
    json: async () =>
      options?.latest ?? {
        tag_name: 'v1.1.0',
        html_url: 'https://github.com/JohnChourp/optc-team-builder/releases/tag/v1.1.0',
      },
  });
  const documentStub = { defaultView: { fetch, open } } as unknown as Document;

  // Captures the progress listener so a test can drive byte progress deterministically.
  let emitProgress: (progress: { loaded: number; total: number }) => void = () => {};
  const removeListener = vi.fn().mockResolvedValue(undefined);
  const apkUpdater = {
    download: vi.fn(async () => {
      if (options?.downloadRejects) {
        throw options.downloadRejects;
      }

      return { path: '/cache/updates/optc.apk', bytes: 1000 };
    }),
    install: vi.fn().mockResolvedValue(undefined),
    canInstall: vi.fn().mockResolvedValue({ granted: options?.canInstall ?? true }),
    openInstallSettings: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(
      async (_event: string, listener: (p: { loaded: number; total: number }) => void) => {
        emitProgress = listener;

        return { remove: removeListener };
      },
    ),
  };

  const service = new NativeUpdateService(
    documentStub,
    async () => options?.currentVersion ?? '1.0.0',
    apkUpdater as never,
  );

  return {
    service,
    open,
    fetch,
    apkUpdater,
    removeListener,
    emit: (p: { loaded: number; total: number }) => emitProgress(p),
  };
}

describe('NativeUpdateService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // restore (not just clear) so the `Capacitor.isNativePlatform` spy this spec
    // installs does not leak `isNativePlatform → true` into sibling spec files
    // (e.g. app.component's browser-install-banner tests) under the shared
    // Angular unit-test builder.
    vi.restoreAllMocks();
  });

  it('stays inert on web platforms', () => {
    const { service, fetch } = createService({ native: false });

    service.init();

    expect(fetch).not.toHaveBeenCalled();
    expect(service.availableUpdate()).toBeNull();
  });

  it('flags an update when the latest release is newer than the running version', async () => {
    const { service } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.2.0', html_url: 'https://rel/1.2.0' },
    });

    await service.check();

    expect(service.availableUpdate()).toEqual({ version: '1.2.0', url: 'https://rel/1.2.0' });
  });

  it('ignores releases that are not newer', async () => {
    const { service } = createService({
      currentVersion: '2.0.0',
      latest: { tag_name: 'v1.9.9', html_url: 'https://rel/1.9.9' },
    });

    await service.check();

    expect(service.availableUpdate()).toBeNull();
  });

  it('ignores a non-ok GitHub response', async () => {
    const { service } = createService({ currentVersion: '1.0.0', ok: false });

    await service.check();

    expect(service.availableUpdate()).toBeNull();
  });

  it('opens the release download page for the pending update', async () => {
    const { service, open } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.1.0', html_url: 'https://rel/1.1.0' },
    });

    await service.check();
    service.openReleasePage();

    expect(open).toHaveBeenCalledWith('https://rel/1.1.0', '_blank');
  });

  it('resolves the apk asset from the release so it can be downloaded in-app', async () => {
    const { service } = createService({ latest: APK_RELEASE });

    await service.check();

    const update = service.availableUpdate();
    expect(update?.apkUrl).toBe(
      'https://github.com/JohnChourp/optc-team-builder/releases/download/v1.1.0/optc-team-builder-v1.1.0.apk',
    );
    expect(update?.apkFileName).toBe('optc-team-builder-v1.1.0.apk');
    // The release API's size is authoritative; a CDN content-length may be missing.
    expect(update?.apkBytes).toBe(1000);
  });

  it('reports real byte progress while downloading the apk in-app', async () => {
    const { service, emit, apkUpdater } = createService({ latest: APK_RELEASE });

    await service.check();
    expect(service.updatePhase()).toBe('idle');

    const pending = service.downloadAndInstall();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.updatePhase()).toBe('downloading');

    emit({ loaded: 250, total: 1000 });
    expect(service.downloadProgress()).toBeCloseTo(0.25, 10);

    emit({ loaded: 750, total: 1000 });
    expect(service.downloadProgress()).toBeCloseTo(0.75, 10);

    await pending;

    // The bar stays full once the bytes are on disk.
    expect(service.downloadProgress()).toBe(1);
    expect(service.updatePhase()).toBe('ready');
    expect(apkUpdater.download).toHaveBeenCalledWith(
      expect.objectContaining({ expectedBytes: 1000, fileName: 'optc-team-builder-v1.1.0.apk' }),
    );
    expect(apkUpdater.install).toHaveBeenCalledWith({ path: '/cache/updates/optc.apk' });
  });

  it('never lets apk progress regress', async () => {
    const { service, emit } = createService({ latest: APK_RELEASE });

    await service.check();
    const pending = service.downloadAndInstall();
    await Promise.resolve();
    await Promise.resolve();

    emit({ loaded: 800, total: 1000 });
    expect(service.downloadProgress()).toBeCloseTo(0.8, 10);

    emit({ loaded: 100, total: 1000 });
    expect(service.downloadProgress()).toBeCloseTo(0.8, 10);

    await pending;
  });

  it('sends the user to install settings instead of installing when not permitted', async () => {
    const { service, apkUpdater } = createService({ latest: APK_RELEASE, canInstall: false });

    await service.check();
    await service.downloadAndInstall();

    expect(apkUpdater.openInstallSettings).toHaveBeenCalledOnce();
    expect(apkUpdater.install).not.toHaveBeenCalled();
    // The download itself succeeded, so the bar stays full.
    expect(service.updatePhase()).toBe('ready');
    expect(service.downloadProgress()).toBe(1);
  });

  it('falls back to the release page when the in-app download fails', async () => {
    const { service, open, apkUpdater } = createService({
      latest: APK_RELEASE,
      downloadRejects: new Error('network died'),
    });

    await service.check();
    await service.downloadAndInstall();

    expect(service.updatePhase()).toBe('idle');
    expect(service.downloadProgress()).toBe(0);
    expect(service.downloadError()).toBe('network died');
    expect(apkUpdater.install).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(
      'https://github.com/JohnChourp/optc-team-builder/releases/tag/v1.1.0',
      '_blank',
    );
  });

  it('falls back to the release page when the release publishes no apk asset', async () => {
    const { service, open, apkUpdater } = createService();

    await service.check();
    await service.downloadAndInstall();

    expect(apkUpdater.download).not.toHaveBeenCalled();
    expect(service.updatePhase()).toBe('idle');
    expect(open).toHaveBeenCalledOnce();
  });

  it('removes the progress listener when the download settles', async () => {
    const { service, removeListener } = createService({ latest: APK_RELEASE });

    await service.check();
    await service.downloadAndInstall();

    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('snoozes and re-surfaces the same pending update after the interval', async () => {
    const { service } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.1.0', html_url: 'https://rel/1.1.0' },
    });

    await service.check();
    expect(service.availableUpdate()).not.toBeNull();

    service.snooze();
    expect(service.availableUpdate()).toBeNull();

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(service.availableUpdate()?.version).toBe('1.1.0');
  });

  it('keeps a snoozed update hidden when a later poll finds the same version', async () => {
    const { service } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.1.0', html_url: 'https://rel/1.1.0' },
    });

    await service.check();
    service.snooze();
    expect(service.availableUpdate()).toBeNull();

    await service.check();
    expect(service.availableUpdate()).toBeNull();
  });

  it('overrides an active snooze when an even newer version appears', async () => {
    const { service, fetch } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.1.0', html_url: 'https://rel/1.1.0' },
    });

    await service.check();
    service.snooze();
    expect(service.availableUpdate()).toBeNull();

    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v1.2.0', html_url: 'https://rel/1.2.0' }),
    });

    await service.check();
    expect(service.availableUpdate()).toEqual({ version: '1.2.0', url: 'https://rel/1.2.0' });
  });
});

import { Capacitor } from '@capacitor/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CACHE_EXPORT_URI,
  Filesystem,
  Share,
} from '../../../test-mocks/capacitor-files';
import {
  JSON_EXPORT_MIME_TYPE,
  SHARE_SHEET_DISMISSED_MESSAGE,
  givePlayerFile,
  playerFileNotice,
  type PlayerFile,
} from './player-file-delivery.utils';

/*
 * 869f63gqg. In the published APK every export clicked an `<a download>` link that nothing
 * handled, so it produced no file, no message and no log line. These pin the two halves of
 * the fix: the website keeps the exact download it always had, and a phone writes the file
 * to the app cache and opens the share sheet instead.
 */

const FILE: PlayerFile = {
  filename: 'optc-all-data-20260925-101500.json',
  contents: '{\n  "schemaVersion": 1\n}\n',
  mimeType: JSON_EXPORT_MIME_TYPE,
};

function createBrowser() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const anchors: HTMLAnchorElement[] = [];
  const click = vi
    .spyOn(dom.window.HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      // Captured AT the click, so what is asserted is the anchor as the browser saw it.
      expect(this.isConnected).toBe(true);
      anchors.push(this);
    });
  const blobs: Blob[] = [];
  const urlRef = {
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:player-file';
    }),
    revokeObjectURL: vi.fn(),
  };

  return { anchors, blobs, click, document: dom.window.document, urlRef };
}

function onPhone(): void {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
}

afterEach(() => {
  // Restore, not clear: a leaked `isNativePlatform -> true` would send every later spec in
  // this worker down the native path.
  vi.restoreAllMocks();
});

describe('givePlayerFile on the website', () => {
  it('downloads through a hidden anchor, exactly as every export did before', async () => {
    const browser = createBrowser();

    const outcome = givePlayerFile(FILE, browser.document, browser.urlRef);

    // Synchronous: the click has happened before the call returns, inside the tap.
    expect(browser.click).toHaveBeenCalledOnce();
    expect(browser.anchors[0]?.href).toBe('blob:player-file');
    expect(browser.anchors[0]?.download).toBe(FILE.filename);
    expect(browser.anchors[0]?.style.display).toBe('none');
    expect(browser.anchors[0]?.isConnected).toBe(false);
    expect(browser.urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:player-file');
    await expect(outcome).resolves.toBe('downloaded');
  });

  it('downloads the contents byte for byte, with the type the exports always carried', async () => {
    const browser = createBrowser();

    await givePlayerFile(FILE, browser.document, browser.urlRef);

    expect(browser.blobs).toHaveLength(1);
    expect(browser.blobs[0]?.type).toBe('application/json;charset=utf-8');
    await expect(browser.blobs[0]!.text()).resolves.toBe(FILE.contents);
  });

  it('never reaches for the phone plugins or the notice', async () => {
    const browser = createBrowser();

    await givePlayerFile(FILE, browser.document, browser.urlRef);

    expect(Filesystem.writeFile).not.toHaveBeenCalled();
    expect(Share.share).not.toHaveBeenCalled();
    expect(playerFileNotice()).toBeNull();
  });

  it('still removes the anchor and frees the URL when the click throws, and throws where it did', () => {
    const browser = createBrowser();

    browser.click.mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => givePlayerFile(FILE, browser.document, browser.urlRef)).toThrow('blocked');
    expect(browser.document.querySelectorAll('a')).toHaveLength(0);
    expect(browser.urlRef.revokeObjectURL).toHaveBeenCalledWith('blob:player-file');
  });
});

describe('givePlayerFile in the Android app', () => {
  it('writes the file to the app cache and shares that file, without a download link', async () => {
    const browser = createBrowser();

    onPhone();

    await expect(givePlayerFile(FILE, browser.document, browser.urlRef)).resolves.toBe('shared');

    expect(Filesystem.writeFile).toHaveBeenCalledExactlyOnceWith({
      path: FILE.filename,
      data: FILE.contents,
      directory: 'CACHE',
      encoding: 'utf8',
    });
    expect(Share.share).toHaveBeenCalledExactlyOnceWith({
      title: FILE.filename,
      files: [CACHE_EXPORT_URI],
    });
    expect(browser.click).not.toHaveBeenCalled();
    expect(browser.urlRef.createObjectURL).not.toHaveBeenCalled();
  });

  it('says what the share sheet is for while it is open, and nothing once it closes', async () => {
    let closeSheet: (value: { activityType: string }) => void = () => undefined;

    onPhone();
    Share.share.mockImplementation(
      () => new Promise((settle: (value: { activityType: string }) => void) => (closeSheet = settle)),
    );

    const outcome = givePlayerFile(FILE);

    await vi.waitFor(() => expect(Share.share).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(playerFileNotice()).toBe('choose-destination'));

    closeSheet({ activityType: 'com.google.android.apps.docs' });

    await expect(outcome).resolves.toBe('shared');
    expect(playerFileNotice()).toBeNull();
  });

  it('treats backing out of the share sheet as a decision, not a failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    onPhone();
    Share.share.mockRejectedValue(new Error(SHARE_SHEET_DISMISSED_MESSAGE));

    await expect(givePlayerFile(FILE)).resolves.toBe('dismissed');
    expect(playerFileNotice()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('says so when the file cannot be written, and never opens the sheet', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('No space left on device');

    onPhone();
    Filesystem.writeFile.mockRejectedValue(failure);

    await expect(givePlayerFile(FILE)).resolves.toBe('failed');
    expect(Share.share).not.toHaveBeenCalled();
    expect(playerFileNotice()).toBe('failed');
    expect(consoleError).toHaveBeenCalledWith(failure);
  });

  it('says so when the sheet itself fails, even if the reason mentions a cancel', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    onPhone();
    // Only the plugin's exact dismissal message is a dismissal; a substring match would
    // swallow this one as a decision the player never made.
    Share.share.mockRejectedValue(new Error('Share canceled: the file could not be attached'));

    await expect(givePlayerFile(FILE)).resolves.toBe('failed');
    expect(playerFileNotice()).toBe('failed');
  });
});

/*
 * The native path rests on three facts outside this repository's TypeScript. Each is read
 * from the file that states it, so a plugin upgrade or a manifest edit that breaks one fails
 * here instead of on a phone.
 */
describe('what the Android path relies on', () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

  it('matches the exact message the Share plugin rejects with when the sheet is dismissed', () => {
    const plugin = read(
      'node_modules/@capacitor/share/android/src/main/java/com/capacitorjs/plugins/share/SharePlugin.java',
    );

    expect(plugin).toContain(`call.reject("${SHARE_SHEET_DISMISSED_MESSAGE}")`);
  });

  it('shares through the FileProvider the app already declares, whose paths include the cache', () => {
    const plugin = read(
      'node_modules/@capacitor/share/android/src/main/java/com/capacitorjs/plugins/share/SharePlugin.java',
    );
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const paths = read('android/app/src/main/res/xml/file_paths.xml');

    expect(plugin).toContain('getContext().getPackageName() + ".fileprovider"');
    expect(manifest).toContain('android:authorities="${applicationId}.fileprovider"');
    expect(paths).toMatch(/<cache-path\b[^>]*\bpath="\."/u);
  });

  it('adds no Android permission: both plugin manifests are empty', () => {
    for (const plugin of ['filesystem', 'share']) {
      const manifest = read(`node_modules/@capacitor/${plugin}/android/src/main/AndroidManifest.xml`);

      expect(manifest, plugin).toContain('<manifest');
      expect(manifest, plugin).not.toContain('<uses-permission');
    }
  });
});

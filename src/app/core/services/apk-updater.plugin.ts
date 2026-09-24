import { type PluginListenerHandle, registerPlugin } from '@capacitor/core';

/** Byte progress of an in-app APK download. */
export interface ApkDownloadProgress {
  loaded: number;
  /** Total bytes, or 0 when the size could not be determined. */
  total: number;
}

/**
 * 869f6tczy. The codes `install` rejects with when the file it was handed cannot be
 * installed as it is. Both mean "download it again", which is why they are codes rather
 * than message text.
 */
export const APK_MISSING = 'APK_MISSING';
export const APK_DIGEST_MISMATCH = 'APK_DIGEST_MISMATCH';

export interface ApkDownloadResult {
  /** Absolute path of the finished file inside the app's cache directory. */
  path: string;
  bytes: number;
}

/**
 * Android-only bridge to {@link ApkUpdaterPlugin}, which downloads a release APK and
 * hands it to the system package installer.
 *
 * The download is native rather than a WebView `fetch`: the release APK is ~200 MB,
 * and accumulating that in the JS heap would OOM a lot of devices. Streaming to a
 * file natively costs one 64 KB buffer and is what makes honest byte-level progress
 * available at all.
 */
export interface ApkUpdaterPlugin {
  /** Streams `url` to app storage, emitting `downloadProgress` while it runs. */
  download(options: {
    url: string;
    fileName?: string;
    /**
     * Asset size from the GitHub release API. Preferred over the response's
     * `content-length`, which a CDN may omit.
     */
    expectedBytes?: number;
  }): Promise<ApkDownloadResult>;

  /**
   * Opens the system package installer for a downloaded file.
   *
   * Rejects with {@link APK_MISSING} when the file is gone, and - when `sha256` is given -
   * hashes the file natively first and rejects with {@link APK_DIGEST_MISMATCH}, deleting
   * it, when it no longer matches.
   */
  install(options: { path: string; sha256?: string }): Promise<void>;

  /**
   * Whether this app may request package installs. From Android 8 the manifest
   * permission is not enough on its own — the user must also allow this app to
   * install unknown apps.
   */
  canInstall(): Promise<{ granted: boolean }>;

  /** Deep-links to the "install unknown apps" settings screen for this app. */
  openInstallSettings(): Promise<void>;

  addListener(
    eventName: 'downloadProgress',
    listener: (progress: ApkDownloadProgress) => void,
  ): Promise<PluginListenerHandle>;
}

export const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');

import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, InjectionToken, type Signal, computed, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { ApkUpdater, type ApkUpdaterPlugin } from './apk-updater.plugin';

export interface NativeAppUpdate {
  version: string;
  /** Release page, used as the fallback when the APK cannot be fetched in-app. */
  url: string;
  /** Direct APK asset download, when the release publishes one. */
  apkUrl?: string;
  apkFileName?: string;
  /** Asset size from the release API — authoritative, unlike a CDN header. */
  apkBytes?: number;
}

/** Lifecycle of an in-app APK download, mirroring the web update phases. */
export type NativeUpdatePhase = 'idle' | 'downloading' | 'ready';

/**
 * Injectable APK-updater bridge. Injecting it (rather than importing the plugin
 * singleton inline) lets unit tests drive download progress deterministically
 * without a native shell.
 */
export const NATIVE_APK_UPDATER = new InjectionToken<ApkUpdaterPlugin>('NATIVE_APK_UPDATER', {
  providedIn: 'root',
  factory: () => ApkUpdater,
});

/** Resolves the running native app version (null when unavailable). */
export type NativeVersionReader = () => Promise<string | null>;

/**
 * Injectable source of the running native version. Defaults to Capacitor's
 * `App.getInfo()`; injecting it (rather than calling `App.getInfo` inline) lets
 * unit tests supply a deterministic version without racing the shared global
 * `@capacitor/app` mock across concurrently-running spec files.
 */
export const NATIVE_APP_VERSION = new InjectionToken<NativeVersionReader>('NATIVE_APP_VERSION', {
  providedIn: 'root',
  factory: () => async () => {
    try {
      const { version } = await App.getInfo();

      return version ?? null;
    } catch {
      return null;
    }
  },
});

/**
 * Native (Capacitor) counterpart to {@link AppUpdateService}. The installed
 * Android/iOS shell can't hot-swap its bundle through the service worker, so on
 * native platforms we instead poll the GitHub "latest release" — the same
 * artifact the OPTC release workflow publishes the signed APK to — and, when a
 * newer version is found, surface the shared update banner whose action opens
 * the release download page. Inert on the web (where the service worker path in
 * {@link AppUpdateService} owns updates) and during Node prerender.
 */
@Injectable({ providedIn: 'root' })
export class NativeUpdateService {
  private readonly availableSignal = signal<NativeAppUpdate | null>(null);
  public readonly availableUpdate = this.availableSignal.asReadonly();

  private readonly phaseSignal = signal<NativeUpdatePhase>('idle');
  private readonly downloadProgressSignal = signal(0);
  private readonly downloadErrorSignal = signal<string | null>(null);

  /** 'idle' | 'downloading' | 'ready' for the in-app APK download. */
  public readonly updatePhase: Signal<NativeUpdatePhase> = this.phaseSignal.asReadonly();

  /** Download progress as a FRACTION in `[0, 1]` — never a percentage. */
  public readonly downloadProgress: Signal<number> = this.downloadProgressSignal.asReadonly();

  /** True while the APK is being fetched in-app. */
  public readonly downloading: Signal<boolean> = computed(
    () => this.phaseSignal() === 'downloading',
  );

  /** Last download failure, surfaced so the banner can fall back to the release page. */
  public readonly downloadError: Signal<string | null> = this.downloadErrorSignal.asReadonly();

  private started = false;
  private progressListener: { remove: () => Promise<void> } | null = null;
  private lastEmittedProgress = 0;
  private snoozeHandle: ReturnType<typeof setTimeout> | null = null;
  private snoozedUntil = 0;
  private snoozedVersion: string | null = null;

  private readonly releasesApiUrl =
    'https://api.github.com/repos/JohnChourp/optc-team-builder/releases/latest';
  private readonly pollIntervalMs = 6 * 60 * 60 * 1000;
  private readonly snoozeIntervalMs = 24 * 60 * 60 * 1000;

  public constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(NATIVE_APP_VERSION) private readonly readNativeVersion: NativeVersionReader,
    @Inject(NATIVE_APK_UPDATER) private readonly apkUpdater: ApkUpdaterPlugin,
  ) {}

  /** Starts native release polling. No-op on web and safe to call twice. */
  public init(): void {
    if (this.started || !Capacitor.isNativePlatform()) {
      return;
    }

    this.started = true;

    void this.check();
    setInterval(() => {
      void this.check();
    }, this.pollIntervalMs);
    // Re-check whenever the app returns to the foreground.
    void App.addListener('resume', () => {
      void this.check();
    });
  }

  /** Compares the running version against the latest GitHub release. */
  public async check(): Promise<void> {
    try {
      const current = this.normalizeVersion((await this.currentVersion()) ?? undefined);

      if (!current) {
        return;
      }

      const latest = await this.fetchLatestRelease();

      if (latest && this.isNewer(latest.version, current) && !this.isSnoozed(latest.version)) {
        this.clearSnooze();
        this.availableSignal.set(latest);
      }
    } catch {
      // Offline / rate-limited / unpublished release — retried on the next poll.
    }
  }

  /** Opens the release download page for the pending update. */
  public openReleasePage(): void {
    const update = this.availableSignal();

    if (!update) {
      return;
    }

    this.document.defaultView?.open(update.url, '_blank');
  }

  /**
   * Downloads the release APK inside the app, reporting byte progress, then hands
   * it to the system package installer.
   *
   * Falls back to {@link openReleasePage} whenever the in-app path cannot work —
   * no APK asset on the release, the plugin missing (iOS, web, an older shell), or
   * the download failing — so the user always has a way forward.
   */
  public async downloadAndInstall(): Promise<void> {
    const update = this.availableSignal();

    if (!update) {
      return;
    }

    if (!update.apkUrl || this.phaseSignal() === 'downloading') {
      if (!update.apkUrl) {
        this.openReleasePage();
      }

      return;
    }

    this.downloadErrorSignal.set(null);
    this.lastEmittedProgress = 0;
    this.downloadProgressSignal.set(0);
    this.phaseSignal.set('downloading');

    try {
      await this.listenForProgress();

      const result = await this.apkUpdater.download({
        url: update.apkUrl,
        ...(update.apkFileName ? { fileName: update.apkFileName } : {}),
        ...(update.apkBytes ? { expectedBytes: update.apkBytes } : {}),
      });

      // The bar stays mounted and full once the bytes are on disk; installing is a
      // separate, user-confirmed step in Android's own installer UI.
      this.emitProgress(1);
      this.phaseSignal.set('ready');

      const permission = await this.apkUpdater.canInstall();

      if (!permission.granted) {
        // Nothing to install into until the user allows this source, so send them
        // straight to the screen that grants it.
        await this.apkUpdater.openInstallSettings();

        return;
      }

      await this.apkUpdater.install({ path: result.path });
    } catch (error) {
      this.downloadErrorSignal.set(error instanceof Error ? error.message : String(error));
      this.phaseSignal.set('idle');
      this.downloadProgressSignal.set(0);
      this.lastEmittedProgress = 0;
      this.openReleasePage();
    } finally {
      await this.stopListeningForProgress();
    }
  }

  private async listenForProgress(): Promise<void> {
    await this.stopListeningForProgress();

    try {
      this.progressListener = await this.apkUpdater.addListener('downloadProgress', (progress) => {
        if (!progress || progress.total <= 0) {
          return;
        }

        this.emitProgress(progress.loaded / progress.total);
      });
    } catch {
      // A shell without the plugin still downloads; it just cannot report progress.
      this.progressListener = null;
    }
  }

  private async stopListeningForProgress(): Promise<void> {
    const listener = this.progressListener;
    this.progressListener = null;

    if (!listener) {
      return;
    }

    try {
      await listener.remove();
    } catch {
      // A listener that is already gone is not an error worth surfacing.
    }
  }

  /** Writes progress clamped to `[0, 1]` and never allowed to regress. */
  private emitProgress(next: number): void {
    if (!Number.isFinite(next)) {
      return;
    }

    const monotonic = Math.max(this.lastEmittedProgress, Math.min(1, Math.max(0, next)));

    this.lastEmittedProgress = monotonic;
    this.downloadProgressSignal.set(monotonic);
  }

  /** Hides the prompt for now and re-surfaces the same update after the interval. */
  public snooze(): void {
    const pending = this.availableSignal();
    this.availableSignal.set(null);
    this.phaseSignal.set('idle');
    this.downloadProgressSignal.set(0);
    this.lastEmittedProgress = 0;
    this.clearSnooze();

    if (!pending) {
      return;
    }

    this.snoozedVersion = pending.version;
    this.snoozedUntil = Date.now() + this.snoozeIntervalMs;
    this.snoozeHandle = setTimeout(() => {
      this.resetSnoozeState();
      this.availableSignal.set(pending);
    }, this.snoozeIntervalMs);
  }

  private async currentVersion(): Promise<string | null> {
    try {
      return await this.readNativeVersion();
    } catch {
      return null;
    }
  }

  private async fetchLatestRelease(): Promise<NativeAppUpdate | null> {
    const view = this.document.defaultView;

    if (!view?.fetch) {
      return null;
    }

    const response = await view.fetch(this.releasesApiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      assets?: {
        name?: string;
        size?: number;
        content_type?: string;
        browser_download_url?: string;
      }[];
    };
    const version = this.normalizeVersion(data.tag_name);

    if (!version || !data.html_url) {
      return null;
    }

    const apk = (data.assets ?? []).find(
      (asset) =>
        asset.content_type === 'application/vnd.android.package-archive' ||
        (asset.name ?? '').toLowerCase().endsWith('.apk'),
    );

    return {
      version,
      url: data.html_url,
      ...(apk?.browser_download_url
        ? {
            apkUrl: apk.browser_download_url,
            apkFileName: apk.name ?? `optc-team-builder-${version}.apk`,
            ...(typeof apk.size === 'number' && apk.size > 0 ? { apkBytes: apk.size } : {}),
          }
        : {}),
    };
  }

  private normalizeVersion(tag?: string): string | null {
    if (!tag) {
      return null;
    }

    const trimmed = tag.trim().replace(/^v/iu, '');

    return /^\d+(\.\d+)*$/u.test(trimmed) ? trimmed : null;
  }

  private isNewer(latest: string, current: string): boolean {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);
    const length = Math.max(latestParts.length, currentParts.length);

    for (let index = 0; index < length; index++) {
      const latestPart = latestParts[index] ?? 0;
      const currentPart = currentParts[index] ?? 0;

      if (latestPart > currentPart) {
        return true;
      }

      if (latestPart < currentPart) {
        return false;
      }
    }

    return false;
  }

  private isSnoozed(candidateVersion: string): boolean {
    // A release strictly newer than the snoozed one overrides an active snooze.
    return (
      this.snoozedVersion !== null &&
      Date.now() < this.snoozedUntil &&
      !this.isNewer(candidateVersion, this.snoozedVersion)
    );
  }

  private clearSnooze(): void {
    if (this.snoozeHandle !== null) {
      clearTimeout(this.snoozeHandle);
    }

    this.resetSnoozeState();
  }

  private resetSnoozeState(): void {
    this.snoozeHandle = null;
    this.snoozedUntil = 0;
    this.snoozedVersion = null;
  }
}

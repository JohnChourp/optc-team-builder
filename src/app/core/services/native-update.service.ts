import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export interface NativeAppUpdate {
  version: string;
  url: string;
}

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

  private started = false;
  private snoozeHandle: ReturnType<typeof setTimeout> | null = null;
  private snoozedUntil = 0;
  private snoozedVersion: string | null = null;

  private readonly releasesApiUrl =
    'https://api.github.com/repos/JohnChourp/optc-team-builder/releases/latest';
  private readonly pollIntervalMs = 6 * 60 * 60 * 1000;
  private readonly snoozeIntervalMs = 24 * 60 * 60 * 1000;

  public constructor(@Inject(DOCUMENT) private readonly document: Document) {}

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

  /** Hides the prompt for now and re-surfaces the same update after the interval. */
  public snooze(): void {
    const pending = this.availableSignal();
    this.availableSignal.set(null);
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
      const { version } = await App.getInfo();

      return version ?? null;
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

    const data = (await response.json()) as { tag_name?: string; html_url?: string };
    const version = this.normalizeVersion(data.tag_name);

    if (!version || !data.html_url) {
      return null;
    }

    return { version, url: data.html_url };
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

import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * Watches the Angular service worker for freshly deployed builds and surfaces a
 * single `updateAvailable` flag the shell can render a prompt from.
 *
 * This mirrors the Codeliver POS panel update flow: when a new version is
 * published (e.g. after the OPTC release workflow ships a new GitHub Pages
 * build) the running PWA detects the `VERSION_READY` event and asks the user to
 * refresh. Only relevant to the web/PWA build — native (Capacitor) shells ship
 * their own binary and never enable the service worker, so this stays inert.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updateAvailableSignal = signal(false);
  public readonly updateAvailable = this.updateAvailableSignal.asReadonly();

  private started = false;
  private snoozeHandle: ReturnType<typeof setTimeout> | null = null;

  // Codeliver POS cadence: poll hourly, re-surface a snoozed prompt after a day.
  private readonly pollIntervalMs = 60 * 60 * 1000;
  private readonly snoozeIntervalMs = 24 * 60 * 60 * 1000;

  public constructor(
    private readonly swUpdate: SwUpdate,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {}

  /** Starts listening for new versions. Safe to call more than once. */
  public init(): void {
    if (this.started || !this.swUpdate.isEnabled) {
      return;
    }

    this.started = true;

    // ngsw runs its own update check once the app stabilizes and emits
    // VERSION_READY for a build that was already newer at startup, so we rely on
    // versionUpdates for the initial signal rather than an eager checkForUpdate()
    // (an eager check perturbs ngsw's controlled version assignment). The periodic
    // poll then covers long-lived sessions where a new build ships mid-session.
    this.swUpdate.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        this.markAvailable();
      }
    });

    setInterval(() => {
      void this.checkForUpdate();
    }, this.pollIntervalMs);
  }

  /** Activates the pending version and reloads so the new shell takes over. */
  public async applyUpdate(): Promise<void> {
    try {
      if (this.swUpdate.isEnabled) {
        await this.swUpdate.activateUpdate();
      }
    } catch {
      // Even if activation fails we still reload so the browser fetches the new shell.
    } finally {
      this.reload();
    }
  }

  /** Hides the prompt for now and re-surfaces it after the snooze interval. */
  public snooze(): void {
    this.updateAvailableSignal.set(false);
    this.clearSnooze();
    this.snoozeHandle = setTimeout(() => {
      this.snoozeHandle = null;
      this.updateAvailableSignal.set(true);
    }, this.snoozeIntervalMs);
  }

  private async checkForUpdate(): Promise<void> {
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();

      if (hasUpdate) {
        this.markAvailable();
      }
    } catch {
      // Transient network/registration failures are retried by the next poll tick.
    }
  }

  private markAvailable(): void {
    this.clearSnooze();
    this.updateAvailableSignal.set(true);
  }

  private clearSnooze(): void {
    if (this.snoozeHandle !== null) {
      clearTimeout(this.snoozeHandle);
      this.snoozeHandle = null;
    }
  }

  private reload(): void {
    this.document.defaultView?.location?.reload();
  }
}

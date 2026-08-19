import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, type Signal, computed, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { type Subscription } from 'rxjs';

import { SwDownloadProgressTracker, resolveCacheStorage } from './sw-download-progress.tracker';

/** Lifecycle of the pending web (PWA) update, as the shell renders it. */
export type AppUpdatePhase = 'idle' | 'downloading' | 'ready';

/**
 * Progress shown the instant the banner appears, so the bar reads as "started"
 * rather than as an empty track that might be broken.
 */
export const UPDATE_PROGRESS_MIN = 0.04;

/**
 * Ceiling for a MEASURED download. A real byte census can legitimately reach the
 * whole payload a moment before `VERSION_READY` lands, and painting a full bar
 * before the version is actually installable would be the one lie this feature
 * must not tell. Only `VERSION_READY` writes exactly `1`.
 */
export const UPDATE_PROGRESS_MEASURED_CEILING = 0.99;

/**
 * Ceiling for a MODELLED download. Lower than the measured ceiling on purpose:
 * the modelled curve is an estimate, so it must stay visibly short of done.
 */
export const UPDATE_PROGRESS_MODELLED_CEILING = 0.92;

/** Time constant of the modelled fallback curve. */
const UPDATE_PROGRESS_TAU_MS = 5_000;

/** Sampling cadence. Matches the bar's CSS transition so the fill interpolates. */
export const UPDATE_PROGRESS_TICK_MS = 500;

/**
 * Smallest measured advance SINCE THE LAST WATCHDOG RE-ARM that counts as "this
 * download is still moving".
 *
 * Deliberately tiny and deliberately cumulative. A per-tick threshold would
 * declare a healthy download stalled whenever the link is slower than
 * `threshold * payload / tick` — at 0.5% of a ~2.1 MB payload every 500 ms that is
 * ~22 KB/s, which a poor mobile connection is genuinely below. Measured
 * cumulatively, any real transfer clears it, while a census that has SATURATED
 * reports the same value forever and correctly stops re-arming.
 */
const UPDATE_PROGRESS_ADVANCE_EPSILON = 0.000_5;

/**
 * How long without progress before the copy admits the download is slow.
 *
 * The census advances one asset at a time, and this app's prefetch payload is
 * dominated by a single ~2.1 MB gzipped `optc-seed.sql`, so a genuinely healthy
 * install on a slow link shows NO motion for as long as that one file takes. The
 * stall state therefore only changes copy — "this is taking longer than usual" is
 * true and useful in exactly that case, and nothing is torn down.
 */
export const UPDATE_DOWNLOAD_STALL_MS = 120_000;

/**
 * How long without progress before the banner stops showing a bar and resets.
 *
 * Generous for the same single-large-file reason above, and safe because it is
 * RECOVERABLE rather than destructive: the `versionUpdates` subscription stays
 * live, so an install that really was still running restores the banner as
 * ready-at-100% when its `VERSION_READY` finally lands, and a genuinely failed one
 * arrives as `VERSION_INSTALLATION_FAILED`. Its job is only to stop a bar sitting
 * on screen forever when ngsw suppresses `VERSION_READY` for this client — a state
 * `checkForUpdate()` provably cannot rescue.
 */
export const UPDATE_DOWNLOAD_ABANDON_MS = 1_800_000;

/**
 * Watches the Angular service worker for freshly deployed builds and exposes the
 * install as a phase plus a download-progress fraction, so the shell can show the
 * update banner the moment a new version starts downloading rather than only once
 * it is ready.
 *
 * The banner therefore has three visible states:
 *
 * 1. `idle` — nothing pending, or the user pressed "Later".
 * 2. `downloading` — `VERSION_DETECTED` has fired and the worker is fetching the
 *    new version. The bar animates from {@link UPDATE_PROGRESS_MIN} upwards and
 *    the primary action is disabled, because reloading mid-install would drop the
 *    partially-fetched version.
 * 3. `ready` — `VERSION_READY` has fired. The bar stays mounted at exactly `1`
 *    (a full bar) and the primary action reloads into the new version.
 *
 * Progress comes from {@link SwDownloadProgressTracker}, which weighs the new
 * version's asset caches by bytes. When that is not measurable — no
 * `CacheStorage`, a first install with no outgoing version to weigh against, or
 * responses without `content-length` — it falls back to a modelled curve over
 * elapsed install time. The two are never blended, and `measuredProgress`
 * reports which source is live so the fallback is never mistaken for a reading.
 *
 * Only relevant to the web/PWA build: native (Capacitor) shells ship their own
 * binary and never enable the service worker, so this stays inert there — the
 * native banner has no bar because `NativeUpdateService.openReleasePage()` hands
 * the APK to the system browser and the app never sees a byte of it.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly rawPhaseSignal = signal<AppUpdatePhase>('idle');
  private readonly downloadProgressSignal = signal(0);
  private readonly measuredSignal = signal(false);
  private readonly stalledSignal = signal(false);
  private readonly snoozedSignal = signal(false);
  /** Hash of the last version that actually became installable, if any. */
  private readonly readyHashSignal = signal<string | null>(null);

  /** 'idle' | 'downloading' | 'ready'. Collapses to 'idle' while snoozed. */
  public readonly updatePhase: Signal<AppUpdatePhase> = computed(() =>
    this.snoozedSignal() ? 'idle' : this.rawPhaseSignal(),
  );

  /**
   * True while an update is downloading or ready and not snoozed. Kept as the
   * banner's gate so every existing consumer reads the same flag it always did.
   */
  public readonly updateAvailable: Signal<boolean> = computed(() => this.updatePhase() !== 'idle');

  /** Download progress as a FRACTION in `[0, 1]` — never a percentage. */
  public readonly downloadProgress: Signal<number> = this.downloadProgressSignal.asReadonly();

  /** True when {@link downloadProgress} reflects a real byte census. */
  public readonly measuredProgress: Signal<boolean> = this.measuredSignal.asReadonly();

  /** True when a download has run past {@link UPDATE_DOWNLOAD_STALL_MS}. */
  public readonly updateStalled: Signal<boolean> = computed(
    () => !this.snoozedSignal() && this.stalledSignal(),
  );

  /**
   * True when {@link applyUpdate} would actually do something.
   *
   * Note this is NOT the same as `updatePhase() === 'ready'`: ngsw only advances
   * `latestHash` after a successful install, so a version that already reported
   * `VERSION_READY` stays activatable while a NEWER version downloads behind it.
   * Disabling the banner's action for that whole second download would take away a
   * usable update the user already had.
   */
  public readonly updateActivatable: Signal<boolean> = computed(
    () => !this.snoozedSignal() && this.readyHashSignal() !== null,
  );

  private readonly progressTracker: SwDownloadProgressTracker;

  private started = false;
  private destroyed = false;
  private trackedHash: string | null = null;
  private snoozedHash: string | null = null;
  private detectedAtMs = 0;
  private lastEmittedProgress = 0;
  /** Raw census reading at the last watchdog re-arm, used to detect real motion. */
  private progressAtLastRearm = 0;
  /** True while the first measurability answer for this download is outstanding. */
  private measurabilityPending = false;
  private sampleInFlight = false;
  private versionSubscription: Subscription | null = null;

  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private stallHandle: ReturnType<typeof setTimeout> | null = null;
  private abandonHandle: ReturnType<typeof setTimeout> | null = null;
  private snoozeHandle: ReturnType<typeof setTimeout> | null = null;

  // Codeliver POS cadence: poll hourly, re-surface a snoozed prompt after a day.
  private readonly pollIntervalMs = 60 * 60 * 1000;
  private readonly snoozeIntervalMs = 24 * 60 * 60 * 1000;

  public constructor(
    private readonly swUpdate: SwUpdate,
    @Inject(DOCUMENT) private readonly document: Document,
  ) {
    this.progressTracker = new SwDownloadProgressTracker(resolveCacheStorage(this.document));
  }

  /** Starts listening for new versions. Safe to call more than once. */
  public init(): void {
    if (this.started || this.destroyed || !this.swUpdate.isEnabled) {
      return;
    }

    this.started = true;

    // ngsw runs its own update check once the app stabilizes and emits
    // VERSION_DETECTED then VERSION_READY for a build that was already newer at
    // startup, so we rely on versionUpdates for the initial signal rather than an
    // eager checkForUpdate() (an eager check perturbs ngsw's controlled version
    // assignment). The periodic poll then covers long-lived sessions where a new
    // build ships mid-session.
    this.versionSubscription = this.swUpdate.versionUpdates.subscribe((event) => {
      switch (event.type) {
        case 'VERSION_DETECTED':
          this.beginDownload(event.version.hash);
          break;
        case 'VERSION_READY':
          this.completeDownload(event.latestVersion.hash);
          break;
        case 'VERSION_INSTALLATION_FAILED':
          this.failDownload(event.version.hash);
          break;
        default:
          // NO_NEW_VERSION_DETECTED, and any event type a later ngsw adds, are
          // deliberately inert.
          break;
      }
    });

    this.pollHandle = setInterval(() => {
      void this.checkForUpdate();
    }, this.pollIntervalMs);
  }

  /**
   * Activates the pending version and reloads so the new shell takes over.
   *
   * Refuses while the new version is still downloading: reloading mid-install
   * throws away the partially-fetched version and starts over.
   */
  public async applyUpdate(): Promise<void> {
    if (this.readyHashSignal() === null) {
      // Nothing is installable yet. Reloading now would only throw away the
      // partially-fetched version and start the download over.
      return;
    }

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
    this.clearSnoozeTimer();
    this.snoozedHash = this.trackedHash;
    this.snoozedSignal.set(true);
    this.snoozeHandle = setTimeout(() => {
      this.snoozeHandle = null;
      this.snoozedSignal.set(false);
    }, this.snoozeIntervalMs);
  }

  /** Releases every timer when the root injector is destroyed. */
  public ngOnDestroy(): void {
    this.destroyed = true;
    this.versionSubscription?.unsubscribe();
    this.versionSubscription = null;
    this.stopTicker();
    this.clearWatchdogs();
    this.clearSnoozeTimer();

    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  /**
   * A new version was detected and the worker has started fetching it. Fires
   * before the first byte lands, which is exactly what makes the bar meaningful.
   */
  private beginDownload(hash: string): void {
    if (!this.started || this.destroyed) {
      return;
    }

    if (this.rawPhaseSignal() === 'downloading') {
      // Superseded: a second deploy landed mid-install. Re-target the hash and
      // restart the watchdogs, but keep the elapsed clock and the last emitted
      // value — rewinding a bar the user is watching is worse than a stale one.
      if (hash !== this.trackedHash) {
        this.trackedHash = hash;
        this.progressAtLastRearm = 0;
        this.measurabilityPending = true;
        this.stalledSignal.set(false);

        if (!this.isSnoozeFor(hash)) {
          // A "Later" taken on the version this one supersedes must not keep the
          // banner hidden for the whole of the new download.
          this.cancelSnooze();
        }

        void this.retargetTracker(hash);
        // markStalled() may already have stopped the modelled ticker; a fresh
        // version must not inherit a frozen bar.
        this.startTicker();
        this.armWatchdogs();
      }

      return;
    }

    this.trackedHash = hash;

    if (!this.isSnoozeFor(hash)) {
      // A version other than the snoozed one overrides an active snooze.
      this.cancelSnooze();
    }

    this.detectedAtMs = Date.now();
    this.lastEmittedProgress = 0;
    this.progressAtLastRearm = 0;
    this.measurabilityPending = true;
    this.sampleInFlight = false;
    this.measuredSignal.set(false);
    this.stalledSignal.set(false);
    this.rawPhaseSignal.set('downloading');
    // Emitted synchronously, in the same frame the banner appears.
    this.emitProgress(UPDATE_PROGRESS_MIN);
    this.startTicker();
    this.armWatchdogs();
    void this.retargetTracker(hash);
  }

  /**
   * The new version finished installing. Reached from `VERSION_READY` and from an
   * hourly poll that resolves `true` (which also means the worker installed it).
   */
  private completeDownload(hash: string | null): void {
    this.stopTicker();
    this.clearWatchdogs();
    this.trackedHash = hash ?? this.trackedHash;
    this.readyHashSignal.set(this.trackedHash);

    if (!this.isSnoozeFor(this.trackedHash)) {
      // Honour a "Later" pressed during *this* download; un-snooze when a
      // different (newer) version is what became ready.
      this.cancelSnooze();
    }

    this.stalledSignal.set(false);
    this.rawPhaseSignal.set('ready');
    // The bar does not disappear when the download finishes: it stays mounted,
    // full, at exactly 1.
    this.emitProgress(1);
    this.progressTracker.reset();
  }

  /**
   * The worker failed to install the version. ngsw broadcasts this to every
   * client without the `clientVersionMap` guard the other events carry, so it is
   * only honoured for the version this tab is actually tracking.
   */
  private failDownload(hash: string): void {
    if (this.rawPhaseSignal() !== 'downloading' || hash !== this.trackedHash) {
      return;
    }

    this.giveUpOnDownload();
  }

  /** Returns the banner to idle and forgets the in-flight download. */
  private resetDownload(): void {
    this.stopTicker();
    this.clearWatchdogs();
    this.progressTracker.reset();
    this.trackedHash = null;
    this.readyHashSignal.set(null);
    this.detectedAtMs = 0;
    this.lastEmittedProgress = 0;
    this.progressAtLastRearm = 0;
    this.measurabilityPending = false;
    this.sampleInFlight = false;
    this.measuredSignal.set(false);
    this.stalledSignal.set(false);
    this.downloadProgressSignal.set(0);
    this.rawPhaseSignal.set('idle');
  }

  private async checkForUpdate(): Promise<void> {
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();

      if (hasUpdate) {
        this.completeDownload(null);
      }
    } catch {
      // Transient network/registration failures are retried by the next poll tick.
    }
  }

  /** Asks the tracker to weigh `hash` against the outgoing version. */
  private async retargetTracker(hash: string): Promise<void> {
    const measurable = await this.progressTracker.begin(hash);

    // Only adopt the answer while this hash is still the one being downloaded.
    if (this.rawPhaseSignal() === 'downloading' && this.trackedHash === hash) {
      this.measurabilityPending = false;
      this.setMeasured(measurable);
    }
  }

  /**
   * Adopts a measurability answer, routing a true -> false transition through
   * {@link degradeToModelled} so the bar never teleports to the modelled curve.
   */
  private setMeasured(measurable: boolean): void {
    if (measurable) {
      this.measuredSignal.set(true);

      return;
    }

    if (this.measuredSignal()) {
      this.degradeToModelled();

      return;
    }

    this.measuredSignal.set(false);
  }

  private startTicker(): void {
    this.stopTicker();
    this.tickHandle = setInterval(() => {
      this.tickProgress();
    }, UPDATE_PROGRESS_TICK_MS);
  }

  private stopTicker(): void {
    if (this.tickHandle !== null) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private tickProgress(): void {
    if (this.rawPhaseSignal() !== 'downloading') {
      this.stopTicker();

      return;
    }

    if (this.measuredSignal()) {
      void this.sampleMeasuredProgress();

      return;
    }

    if (this.measurabilityPending) {
      // Measurability is still being resolved. Emitting the modelled curve here
      // would raise the bar above the census's true starting point, and the
      // monotonic clamp would then freeze it until the real reading caught up.
      return;
    }

    this.emitProgress(this.modelledProgress());
  }

  /** Reads real cached bytes; drops to the modelled curve if a sample fails. */
  private async sampleMeasuredProgress(): Promise<void> {
    if (this.sampleInFlight) {
      return;
    }

    this.sampleInFlight = true;

    try {
      const trackedHash = this.trackedHash;
      const sampled = await this.progressTracker.sample();

      if (this.rawPhaseSignal() !== 'downloading' || this.trackedHash !== trackedHash) {
        return;
      }

      if (sampled === null) {
        if (this.progressTracker.measurable) {
          // A transient cache read failure carries no new information. Keeping the
          // last value beats flipping to the modelled curve, whose value at this
          // point in the install can be tens of points higher and would visibly
          // teleport the bar.
          return;
        }

        this.degradeToModelled();

        return;
      }

      // Measured against the RAW reading at the last re-arm, never against the
      // emitted value: once the census saturates the emitted value is pinned to the
      // ceiling, so a `sampled - emitted` test would report motion on every tick
      // forever and the abandon watchdog could never fire.
      const advanced = sampled - this.progressAtLastRearm >= UPDATE_PROGRESS_ADVANCE_EPSILON;

      this.emitProgress(Math.min(sampled, UPDATE_PROGRESS_MEASURED_CEILING));

      if (advanced) {
        // A slow-but-moving download must never be declared stalled or abandoned,
        // so real forward motion pushes both watchdogs back.
        this.progressAtLastRearm = sampled;
        this.stalledSignal.set(false);
        this.armWatchdogs();
      }
    } finally {
      this.sampleInFlight = false;
    }
  }

  /**
   * Abandons the census for the modelled curve without a visible jump.
   *
   * The curve's clock is re-anchored so its value *now* equals what the bar already
   * shows, which keeps the handover continuous in both directions — the monotonic
   * clamp in {@link emitProgress} covers downward motion, this covers upward.
   */
  private degradeToModelled(): void {
    this.measuredSignal.set(false);
    this.reanchorModelledClock();
    this.emitProgress(this.modelledProgress());
  }

  /** Solves the modelled curve for the elapsed time that yields the shown value. */
  private reanchorModelledClock(): void {
    const span = UPDATE_PROGRESS_MODELLED_CEILING - UPDATE_PROGRESS_MIN;
    const shown = Math.min(this.lastEmittedProgress, UPDATE_PROGRESS_MODELLED_CEILING);
    const ratio = Math.min(0.999_9, Math.max(0, (shown - UPDATE_PROGRESS_MIN) / span));

    this.detectedAtMs = Date.now() + UPDATE_PROGRESS_TAU_MS * Math.log(1 - ratio);
  }

  /**
   * Modelled fallback: an asymptotic curve over elapsed install time.
   *
   * This models ELAPSED TIME, not bytes, and it is only ever used when a byte
   * census is impossible. Do not promote it to the primary source — on a slow
   * connection the real payload (~2.1 MB gzipped, dominated by
   * `optc-seed.sql`) takes far longer than any fixed time constant, which is
   * exactly the frozen-near-the-end experience the bar exists to remove.
   */
  private modelledProgress(): number {
    const elapsedMs = Math.max(0, Date.now() - this.detectedAtMs);
    const span = UPDATE_PROGRESS_MODELLED_CEILING - UPDATE_PROGRESS_MIN;

    return UPDATE_PROGRESS_MIN + span * (1 - Math.exp(-elapsedMs / UPDATE_PROGRESS_TAU_MS));
  }

  /** Writes a progress value, clamped to `[0, 1]` and never allowed to regress. */
  private emitProgress(next: number): void {
    if (!Number.isFinite(next)) {
      return;
    }

    const clamped = Math.min(1, Math.max(0, next));
    // Monotonic on purpose: a backwards system-clock step, a re-targeted hash or a
    // cache eviction must never visibly rewind the bar. Do not "simplify" away.
    const monotonic = Math.max(this.lastEmittedProgress, clamped);

    this.lastEmittedProgress = monotonic;
    this.downloadProgressSignal.set(monotonic);
  }

  private armWatchdogs(): void {
    this.clearWatchdogs();
    this.stallHandle = setTimeout(() => {
      this.stallHandle = null;
      this.markStalled();
    }, UPDATE_DOWNLOAD_STALL_MS);
    this.abandonHandle = setTimeout(() => {
      this.abandonHandle = null;
      this.abandonDownload();
    }, UPDATE_DOWNLOAD_ABANDON_MS);
  }

  private clearWatchdogs(): void {
    if (this.stallHandle !== null) {
      clearTimeout(this.stallHandle);
      this.stallHandle = null;
    }

    if (this.abandonHandle !== null) {
      clearTimeout(this.abandonHandle);
      this.abandonHandle = null;
    }
  }

  /**
   * Swaps the copy for a slow download.
   *
   * Deliberately does NOT probe `swUpdate.checkForUpdate()`. ngsw only inserts a
   * version into `this.versions` AFTER `initializeFully` resolves, so during an
   * in-flight install the probe does not find the hash, emits a second
   * `VERSION_DETECTED` and calls `setupUpdate` again — a second concurrent install
   * of the same manifest, doubling traffic at exactly the moment the connection has
   * already proven slow. And it cannot achieve what it was for: once a version IS
   * installed, `checkForUpdate()` returns false without re-emitting
   * `VERSION_READY`, so a suppressed ready event is unrecoverable this way. The
   * abandon watchdog bounds the state instead.
   */
  private markStalled(): void {
    if (this.rawPhaseSignal() !== 'downloading') {
      return;
    }

    this.stalledSignal.set(true);

    if (!this.measuredSignal()) {
      // A modelled curve has nothing left to say past this point, so stop burning
      // a timer on it; the measured path keeps sampling because it can still move.
      this.stopTicker();
    }
  }

  /** Gives up on a download that has not advanced for a very long time. */
  private abandonDownload(): void {
    if (this.rawPhaseSignal() !== 'downloading') {
      return;
    }

    this.giveUpOnDownload();
  }

  /**
   * Abandons the in-flight download.
   *
   * ngsw only advances `latestHash` after a successful install, so a version that
   * already reported `VERSION_READY` before this download started is still
   * activatable. Falling back to it beats throwing away a usable update.
   */
  private giveUpOnDownload(): void {
    const previousReadyHash = this.readyHashSignal();

    if (previousReadyHash !== null && previousReadyHash !== this.trackedHash) {
      this.completeDownload(previousReadyHash);

      return;
    }

    this.resetDownload();
  }

  /** True when an active snooze belongs to exactly this version. */
  private isSnoozeFor(hash: string | null): boolean {
    return this.snoozedSignal() && this.snoozedHash === hash;
  }

  private cancelSnooze(): void {
    this.clearSnoozeTimer();
    this.snoozedHash = null;
    this.snoozedSignal.set(false);
  }

  private clearSnoozeTimer(): void {
    if (this.snoozeHandle !== null) {
      clearTimeout(this.snoozeHandle);
      this.snoozeHandle = null;
    }
  }

  private reload(): void {
    this.document.defaultView?.location?.reload();
  }
}

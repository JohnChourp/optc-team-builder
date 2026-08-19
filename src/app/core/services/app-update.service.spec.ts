import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { type VersionEvent } from '@angular/service-worker';

import {
  AppUpdateService,
  UPDATE_DOWNLOAD_ABANDON_MS,
  UPDATE_DOWNLOAD_STALL_MS,
  UPDATE_PROGRESS_MEASURED_CEILING,
  UPDATE_PROGRESS_MIN,
  UPDATE_PROGRESS_MODELLED_CEILING,
  UPDATE_PROGRESS_TICK_MS,
} from './app-update.service';

interface FakeEntry {
  url: string;
  bytes: number;
}

/**
 * Minimal in-memory CacheStorage double, matching the members
 * SwDownloadProgressTracker reads: top-level `keys()`/`open()`, and per-cache
 * `keys()`/`match()`.
 */
class FakeCacheStorage {
  private readonly caches = new Map<string, FakeEntry[]>();
  private readonly throwingCaches = new Set<string>();

  public constructor(shape: Record<string, FakeEntry[]>) {
    for (const [name, entries] of Object.entries(shape)) {
      this.caches.set(name, entries);
    }
  }

  public setEntries(name: string, entries: FakeEntry[]): void {
    this.caches.set(name, entries);
  }

  /** Makes one cache unreadable, modelling a transient storage failure. */
  public throwOn(name: string): void {
    this.throwingCaches.add(name);
  }

  public async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  public async open(name: string): Promise<unknown> {
    const entries = this.caches.get(name) ?? [];
    const shouldThrow = this.throwingCaches.has(name);

    return {
      keys: async () => {
        if (shouldThrow) {
          throw new Error(`cache ${name} is unreadable`);
        }

        return entries.map((entry) => ({ url: entry.url }));
      },
      match: async (request: { url: string }) => {
        const entry = entries.find((candidate) => candidate.url === request.url);

        if (!entry) {
          return undefined;
        }

        return {
          url: entry.url,
          headers: {
            get: (header: string) => (header === 'content-length' ? String(entry.bytes) : null),
          },
        };
      },
    };
  }
}

function createService(options?: {
  isEnabled?: boolean;
  hasUpdate?: boolean;
  cacheStorage?: FakeCacheStorage;
}) {
  const versionUpdates = new Subject<VersionEvent>();
  const swUpdate = {
    isEnabled: options?.isEnabled ?? true,
    versionUpdates,
    checkForUpdate: vi.fn().mockResolvedValue(options?.hasUpdate ?? false),
    activateUpdate: vi.fn().mockResolvedValue(true),
  };
  const reload = vi.fn();
  const documentStub = {
    defaultView: { location: { reload }, caches: options?.cacheStorage },
  } as unknown as Document;

  const service = new AppUpdateService(swUpdate as never, documentStub);

  return { service, swUpdate, versionUpdates, reload };
}

function versionDetectedEvent(hash = 'new'): VersionEvent {
  return { type: 'VERSION_DETECTED', version: { hash } } as VersionEvent;
}

function versionReadyEvent(currentHash = 'old', latestHash = 'new'): VersionEvent {
  return {
    type: 'VERSION_READY',
    currentVersion: { hash: currentHash },
    latestVersion: { hash: latestHash },
  } as VersionEvent;
}

function versionFailedEvent(hash = 'new'): VersionEvent {
  return {
    type: 'VERSION_INSTALLATION_FAILED',
    version: { hash },
    error: 'boom',
  } as VersionEvent;
}

const OLD_HASH = 'old';
const NEW_HASH = 'new';

function assetCache(hash: string, group = 'app'): string {
  return `ngsw:/:${hash}:assets:${group}:cache`;
}

/** Outgoing version holds 4000 bytes; the incoming one starts empty. */
function measurableCacheStorage(): FakeCacheStorage {
  return new FakeCacheStorage({
    [assetCache(OLD_HASH)]: [
      { url: 'https://app/index.html', bytes: 1000 },
      { url: 'https://app/main.js', bytes: 3000 },
    ],
    [assetCache(NEW_HASH)]: [],
  });
}

describe('AppUpdateService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('stays inert and never polls when the service worker is disabled', () => {
    const { service, swUpdate } = createService({ isEnabled: false });

    service.init();

    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    expect(service.updateAvailable()).toBe(false);
    expect(service.updatePhase()).toBe('idle');
    expect(service.downloadProgress()).toBe(0);
  });

  it('ignores version events when init() never armed the service', () => {
    const { service, versionUpdates } = createService({ isEnabled: false });

    service.init();
    versionUpdates.next(versionDetectedEvent());

    expect(service.updatePhase()).toBe('idle');
    expect(service.downloadProgress()).toBe(0);
  });

  it('marks an update available on a VERSION_READY event', () => {
    const { service, versionUpdates } = createService();

    service.init();
    expect(service.updateAvailable()).toBe(false);

    versionUpdates.next(versionReadyEvent());

    expect(service.updateAvailable()).toBe(true);
  });

  it('does not eagerly check on init but marks an update when a later poll finds one', async () => {
    const { service, swUpdate } = createService({ hasUpdate: true });

    service.init();
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    expect(service.updateAvailable()).toBe(false);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(swUpdate.checkForUpdate).toHaveBeenCalled();
    expect(service.updateAvailable()).toBe(true);
    expect(service.updatePhase()).toBe('ready');
    expect(service.downloadProgress()).toBe(1);
  });

  it('activates the pending version and reloads when applying the update', async () => {
    const { service, swUpdate, versionUpdates, reload } = createService();

    service.init();
    versionUpdates.next(versionReadyEvent());

    await service.applyUpdate();

    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('still reloads even if activating the update fails', async () => {
    const { service, swUpdate, versionUpdates, reload } = createService();
    swUpdate.activateUpdate.mockRejectedValueOnce(new Error('boom'));

    service.init();
    versionUpdates.next(versionReadyEvent());

    await service.applyUpdate();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('hides the prompt when snoozed and re-surfaces it after the interval', () => {
    const { service, versionUpdates } = createService();

    service.init();
    versionUpdates.next(versionReadyEvent());
    expect(service.updateAvailable()).toBe(true);

    service.snooze();
    expect(service.updateAvailable()).toBe(false);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(service.updateAvailable()).toBe(true);
  });

  describe('download phase', () => {
    it('surfaces the banner and a non-zero bar the moment a version is detected', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());

      expect(service.updatePhase()).toBe('downloading');
      expect(service.updateAvailable()).toBe(true);
      // Emitted synchronously, in the same frame the banner appears.
      expect(service.downloadProgress()).toBe(UPDATE_PROGRESS_MIN);
    });

    it('leaves the bar full at exactly 1 when the download completes', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      await vi.advanceTimersByTimeAsync(2_000);
      expect(service.downloadProgress()).toBeGreaterThan(UPDATE_PROGRESS_MIN);

      versionUpdates.next(versionReadyEvent());

      expect(service.updatePhase()).toBe('ready');
      expect(service.downloadProgress()).toBe(1);
    });

    it('keeps the bar at 1 and stops ticking after the version is ready', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      versionUpdates.next(versionReadyEvent());

      await vi.advanceTimersByTimeAsync(10 * UPDATE_PROGRESS_TICK_MS);

      expect(service.downloadProgress()).toBe(1);
      expect(service.updatePhase()).toBe('ready');
    });

    it('reports a ready-at-100% banner when VERSION_READY arrives with no VERSION_DETECTED', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionReadyEvent());

      expect(service.updatePhase()).toBe('ready');
      expect(service.downloadProgress()).toBe(1);
    });

    it('animates a second download in the same session after the first completed', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent('v1'));
      versionUpdates.next(versionReadyEvent('old', 'v1'));
      expect(service.downloadProgress()).toBe(1);

      versionUpdates.next(versionDetectedEvent('v2'));

      expect(service.updatePhase()).toBe('downloading');
      expect(service.downloadProgress()).toBe(UPDATE_PROGRESS_MIN);
    });

    it('drops back to idle when the install fails for the tracked version', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent('v1'));
      versionUpdates.next(versionFailedEvent('v1'));

      expect(service.updatePhase()).toBe('idle');
      expect(service.updateAvailable()).toBe(false);
      expect(service.downloadProgress()).toBe(0);
    });

    it('ignores an install failure broadcast for a version this tab is not tracking', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent('v1'));
      versionUpdates.next(versionFailedEvent('someone-elses-version'));

      expect(service.updatePhase()).toBe('downloading');
    });

    it('never rewinds the bar when a second version supersedes the download', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent('v1'));
      await vi.advanceTimersByTimeAsync(3_000);
      const beforeSupersede = service.downloadProgress();

      versionUpdates.next(versionDetectedEvent('v2'));

      expect(service.updatePhase()).toBe('downloading');
      expect(service.downloadProgress()).toBeGreaterThanOrEqual(beforeSupersede);
    });

    it('honours "Later" pressed mid-download and restores a ready banner afterwards', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      service.snooze();
      expect(service.updateAvailable()).toBe(false);
      expect(service.updatePhase()).toBe('idle');

      // The same version finishing must NOT re-surface the banner immediately.
      versionUpdates.next(versionReadyEvent(OLD_HASH, NEW_HASH));
      expect(service.updateAvailable()).toBe(false);

      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(service.updatePhase()).toBe('ready');
      expect(service.downloadProgress()).toBe(1);
    });

    it('overrides an active snooze when a newer version starts downloading', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionReadyEvent(OLD_HASH, 'v1'));
      service.snooze();
      expect(service.updateAvailable()).toBe(false);

      versionUpdates.next(versionDetectedEvent('v2'));

      expect(service.updateAvailable()).toBe(true);
      expect(service.updatePhase()).toBe('downloading');
    });

    it('refuses to apply an update while the new version is still downloading', async () => {
      const { service, swUpdate, versionUpdates, reload } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());

      await service.applyUpdate();

      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it('refuses to apply an update when nothing is installable at all', async () => {
      const { service, swUpdate, reload } = createService();

      // Not reachable from the banner (it only renders when something is pending),
      // but reloading here would be a pointless refresh.
      await service.applyUpdate();

      expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    });

    it('releases every timer on destroy', () => {
      const { service, swUpdate, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      service.ngOnDestroy();

      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    });
  });

  describe('modelled progress (no measurable cache)', () => {
    it('advances monotonically without ever reaching the modelled ceiling', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());

      const first = service.downloadProgress();
      let previous = first;

      for (let tick = 0; tick < 20; tick++) {
        await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
        const current = service.downloadProgress();

        // Strictly increasing, not merely non-decreasing: a frozen bar must fail.
        expect(current).toBeGreaterThan(previous);
        expect(current).toBeLessThan(UPDATE_PROGRESS_MODELLED_CEILING);
        previous = current;
      }

      expect(previous).toBeGreaterThan(first + 0.5);
    });

    it('reports that progress is modelled, not measured', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      expect(service.measuredProgress()).toBe(false);
    });

    it('flags a stalled download without starting a second install of it', async () => {
      const { service, swUpdate, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      expect(service.updateStalled()).toBe(false);

      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_STALL_MS);

      expect(service.updateStalled()).toBe(true);
      expect(service.updatePhase()).toBe('downloading');
      // ngsw only inserts a version into `versions` after initializeFully resolves,
      // so probing mid-install makes it call setupUpdate a second time for the same
      // manifest — a duplicate concurrent download on an already-slow connection.
      expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    });

    it('hides the stall copy while the banner is snoozed', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_STALL_MS);
      expect(service.updateStalled()).toBe(true);

      service.snooze();

      expect(service.updateStalled()).toBe(false);
    });

    it('abandons a download that never finishes so the banner cannot stick', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());

      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_ABANDON_MS);

      expect(service.updatePhase()).toBe('idle');
      expect(service.updateAvailable()).toBe(false);
      expect(service.downloadProgress()).toBe(0);
      expect(service.updateStalled()).toBe(false);
    });

    it('clears the stall flag once the version becomes ready', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_STALL_MS);
      expect(service.updateStalled()).toBe(true);

      versionUpdates.next(versionReadyEvent());

      expect(service.updateStalled()).toBe(false);
      expect(service.downloadProgress()).toBe(1);
    });
  });

  describe('activatability', () => {
    it('is not activatable during a first download', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());

      expect(service.updateActivatable()).toBe(false);
    });

    it('stays activatable while a newer version downloads behind a ready one', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionReadyEvent(OLD_HASH, 'v1'));
      expect(service.updateActivatable()).toBe(true);

      versionUpdates.next(versionDetectedEvent('v2'));

      // ngsw only advances latestHash after a successful install, so v1 is still
      // what activateUpdate() would apply.
      expect(service.updatePhase()).toBe('downloading');
      expect(service.updateActivatable()).toBe(true);
    });

    it('applies the still-installable version while a newer one downloads', async () => {
      const { service, swUpdate, versionUpdates, reload } = createService();

      service.init();
      versionUpdates.next(versionReadyEvent(OLD_HASH, 'v1'));
      versionUpdates.next(versionDetectedEvent('v2'));

      await service.applyUpdate();

      expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
      expect(reload).toHaveBeenCalledOnce();
    });

    it('is not activatable while snoozed', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionReadyEvent());
      expect(service.updateActivatable()).toBe(true);

      service.snooze();

      expect(service.updateActivatable()).toBe(false);
    });

    it('un-snoozes a supersede so the banner is not hidden for the new download', () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent('v1'));
      service.snooze();
      expect(service.updateAvailable()).toBe(false);

      // A second deploy lands while the snoozed first one is still downloading.
      versionUpdates.next(versionDetectedEvent('v2'));

      expect(service.updateAvailable()).toBe(true);
      expect(service.updatePhase()).toBe('downloading');
    });
  });

  describe('watchdogs', () => {
    it('restores the banner at 100% when an abandoned install finishes anyway', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));

      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_ABANDON_MS);
      expect(service.updatePhase()).toBe('idle');

      // Abandoning only stops showing a bar; the subscription is still live, so a
      // download that really was still running comes back as ready-at-100%.
      versionUpdates.next(versionReadyEvent(OLD_HASH, NEW_HASH));

      expect(service.updatePhase()).toBe('ready');
      expect(service.downloadProgress()).toBe(1);
      expect(service.updateActivatable()).toBe(true);
    });

    it('does not abandon a download whose census creeps forward very slowly', async () => {
      // 40 assets of 1000 bytes: each one is 2.5% of the payload, arriving every
      // 4 minutes. A per-tick advance threshold would call this stalled; measured
      // cumulatively since the last re-arm it is plainly still moving.
      const baseline = Array.from({ length: 40 }, (_, index) => ({
        url: `https://app/part-${index}.js`,
        bytes: 1000,
      }));
      const cacheStorage = new FakeCacheStorage({
        [assetCache(OLD_HASH)]: baseline,
        [assetCache(NEW_HASH)]: [],
      });
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
      expect(service.measuredProgress()).toBe(true);

      for (let cached = 1; cached <= 10; cached++) {
        cacheStorage.setEntries(assetCache(NEW_HASH), baseline.slice(0, cached));
        await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
      }

      // Well past the abandon window in wall-clock terms, but never stuck.
      expect(service.updatePhase()).toBe('downloading');
      expect(service.downloadProgress()).toBeCloseTo(0.25, 10);
    });

    it('does not raise the bar above the census start while measurability is pending', async () => {
      const cacheStorage = measurableCacheStorage();
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));

      // Fire several ticks without flushing, so begin() is still outstanding. The
      // modelled curve must not run ahead here: the monotonic clamp would then
      // freeze the bar until the real reading caught up.
      vi.advanceTimersByTime(4 * UPDATE_PROGRESS_TICK_MS);
      expect(service.downloadProgress()).toBe(UPDATE_PROGRESS_MIN);

      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
      expect(service.measuredProgress()).toBe(true);
      expect(service.downloadProgress()).toBe(UPDATE_PROGRESS_MIN);
    });
  });

  describe('measured progress (byte census)', () => {
    it('tracks real cached bytes instead of the modelled curve', async () => {
      const cacheStorage = measurableCacheStorage();
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      expect(service.measuredProgress()).toBe(true);
      // Still only the seed value: nothing has been cached yet.
      expect(service.downloadProgress()).toBe(UPDATE_PROGRESS_MIN);

      // 3000 of 4000 bytes land.
      cacheStorage.setEntries(assetCache(NEW_HASH), [{ url: 'https://app/main.js', bytes: 3000 }]);
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      expect(service.downloadProgress()).toBeCloseTo(0.75, 10);
    });

    it('holds a fully cached but not-yet-ready version below 100%', async () => {
      const cacheStorage = measurableCacheStorage();
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      cacheStorage.setEntries(assetCache(NEW_HASH), [
        { url: 'https://app/index.html', bytes: 1000 },
        { url: 'https://app/main.js', bytes: 3000 },
      ]);
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      expect(service.downloadProgress()).toBe(UPDATE_PROGRESS_MEASURED_CEILING);
      expect(service.updatePhase()).toBe('downloading');

      versionUpdates.next(versionReadyEvent(OLD_HASH, NEW_HASH));
      expect(service.downloadProgress()).toBe(1);
    });

    it('never rewinds when cached bytes are evicted mid-download', async () => {
      const cacheStorage = measurableCacheStorage();
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      cacheStorage.setEntries(assetCache(NEW_HASH), [{ url: 'https://app/main.js', bytes: 3000 }]);
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
      const peak = service.downloadProgress();

      cacheStorage.setEntries(assetCache(NEW_HASH), []);
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      expect(service.downloadProgress()).toBe(peak);
    });

    it('does not abandon a slow download that is still making real progress', async () => {
      const cacheStorage = new FakeCacheStorage({
        [assetCache(OLD_HASH)]: Array.from({ length: 20 }, (_, index) => ({
          url: `https://app/chunk-${index}.js`,
          bytes: 1000,
        })),
        [assetCache(NEW_HASH)]: [],
      });
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
      expect(service.measuredProgress()).toBe(true);

      // One chunk every ~10 minutes: past the abandon watchdog, but never stuck.
      for (let index = 0; index < 4; index++) {
        cacheStorage.setEntries(
          assetCache(NEW_HASH),
          Array.from({ length: index + 1 }, (_, cached) => ({
            url: `https://app/chunk-${cached}.js`,
            bytes: 1000,
          })),
        );
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      }

      expect(service.updatePhase()).toBe('downloading');
      expect(service.downloadProgress()).toBeCloseTo(0.2, 10);
    });

    it('still abandons a measured download whose census saturated but never went ready', async () => {
      const cacheStorage = measurableCacheStorage();
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      // Everything is cached, so every later sample reads exactly 1 while the
      // emitted value stays pinned at the ceiling. A saturated census must NOT keep
      // re-arming the watchdogs — otherwise a suppressed VERSION_READY sticks the
      // banner at 99% forever.
      cacheStorage.setEntries(assetCache(NEW_HASH), [
        { url: 'https://app/index.html', bytes: 1000 },
        { url: 'https://app/main.js', bytes: 3000 },
      ]);
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
      expect(service.downloadProgress()).toBe(UPDATE_PROGRESS_MEASURED_CEILING);

      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_STALL_MS);
      expect(service.updateStalled()).toBe(true);

      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_ABANDON_MS);
      expect(service.updatePhase()).toBe('idle');
    });

    it('never emits a non-finite value when a version supersedes an in-flight sample', async () => {
      const cacheStorage = measurableCacheStorage();
      cacheStorage.setEntries(assetCache('v2'), []);
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
      expect(service.measuredProgress()).toBe(true);

      // Fire the ticker WITHOUT flushing microtasks, so a census sample is parked on
      // its first await, then land a superseding version. The synchronous reset
      // inside the tracker's begin() is what used to zero the denominator under the
      // in-flight sample.
      vi.advanceTimersByTime(UPDATE_PROGRESS_TICK_MS);
      versionUpdates.next(versionDetectedEvent('v2'));
      await vi.advanceTimersByTimeAsync(4 * UPDATE_PROGRESS_TICK_MS);

      expect(Number.isFinite(service.downloadProgress())).toBe(true);
      expect(service.downloadProgress()).toBeGreaterThanOrEqual(UPDATE_PROGRESS_MIN);
      expect(service.downloadProgress()).toBeLessThanOrEqual(1);
    });

    it('restarts a frozen bar and clears the stall copy when a version supersedes', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent('v1'));
      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_STALL_MS);
      expect(service.updateStalled()).toBe(true);
      const frozen = service.downloadProgress();

      versionUpdates.next(versionDetectedEvent('v2'));

      expect(service.updateStalled()).toBe(false);

      // The modelled ticker was stopped by markStalled(); a superseding version must
      // get it back rather than inherit a dead bar.
      await vi.advanceTimersByTimeAsync(2 * UPDATE_PROGRESS_TICK_MS);
      expect(service.downloadProgress()).toBeGreaterThan(frozen);
    });

    it('keeps a previously ready version when a later download fails', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent('v1'));
      versionUpdates.next(versionReadyEvent(OLD_HASH, 'v1'));
      expect(service.updatePhase()).toBe('ready');

      versionUpdates.next(versionDetectedEvent('v2'));
      expect(service.updatePhase()).toBe('downloading');

      versionUpdates.next(versionFailedEvent('v2'));

      // v1 is still what ngsw would activate, so the banner must not vanish.
      expect(service.updatePhase()).toBe('ready');
      expect(service.downloadProgress()).toBe(1);
    });

    it('keeps a previously ready version when a later download is abandoned', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionReadyEvent(OLD_HASH, 'v1'));
      versionUpdates.next(versionDetectedEvent('v2'));

      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_ABANDON_MS);

      expect(service.updatePhase()).toBe('ready');
      expect(service.downloadProgress()).toBe(1);
    });

    it('un-snoozes a poll-derived ready state when a genuinely new version downloads', async () => {
      const { service, swUpdate, versionUpdates } = createService({ hasUpdate: true });

      service.init();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(service.updatePhase()).toBe('ready');

      // The poll path knows no hash, so the snooze is recorded against null.
      service.snooze();
      expect(service.updateAvailable()).toBe(false);

      versionUpdates.next(versionDetectedEvent('v9'));

      expect(service.updateAvailable()).toBe(true);
      expect(service.updatePhase()).toBe('downloading');
      expect(swUpdate.checkForUpdate).toHaveBeenCalled();
    });

    it('does not let a repeated poll defeat a snooze taken on the same state', async () => {
      const { service } = createService({ hasUpdate: true });

      service.init();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      service.snooze();
      expect(service.updateAvailable()).toBe(false);

      // Another hourly poll resolves true for the same unknown-hash state.
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      expect(service.updateAvailable()).toBe(false);
    });

    it('ignores a version event that arrives after the service was destroyed', () => {
      const { service, versionUpdates } = createService();

      service.init();
      service.ngOnDestroy();

      versionUpdates.next(versionDetectedEvent());

      expect(service.updatePhase()).toBe('idle');
      expect(service.downloadProgress()).toBe(0);
    });

    it('holds the last measured value through a transient cache read failure', async () => {
      const cacheStorage = measurableCacheStorage();
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      cacheStorage.setEntries(assetCache(NEW_HASH), [
        { url: 'https://app/index.html', bytes: 1000 },
      ]);
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
      const measured = service.downloadProgress();
      expect(measured).toBeCloseTo(0.25, 10);

      // The incoming cache becomes unreadable. Flipping to the modelled curve here
      // would teleport the bar to roughly 0.6 for a download that is 25% done.
      cacheStorage.throwOn(assetCache(NEW_HASH));
      await vi.advanceTimersByTimeAsync(6 * UPDATE_PROGRESS_TICK_MS);

      expect(service.downloadProgress()).toBe(measured);
      expect(service.measuredProgress()).toBe(true);
    });

    it('re-anchors the modelled curve so a structural handover does not jump', async () => {
      const cacheStorage = measurableCacheStorage();
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      cacheStorage.setEntries(assetCache(NEW_HASH), [
        { url: 'https://app/index.html', bytes: 1000 },
      ]);

      // A genuinely slow download: 15 s of wall clock with the census parked at 25%.
      // By now the elapsed-time curve would read ~0.90, so an un-anchored handover
      // teleports the bar from a quarter full to almost complete.
      await vi.advanceTimersByTimeAsync(15_000);
      const measured = service.downloadProgress();
      expect(measured).toBeCloseTo(0.25, 10);

      // The whole storage stops answering, so the next begin() is structurally
      // unmeasurable rather than transiently unreadable.
      cacheStorage.throwOn(assetCache(OLD_HASH));
      cacheStorage.throwOn(assetCache(NEW_HASH));
      versionUpdates.next(versionDetectedEvent('v2'));
      // Flush the pending begin() without letting the ticker fire, so the handover
      // value is observable on its own.
      await vi.advanceTimersByTimeAsync(0);

      expect(service.measuredProgress()).toBe(false);
      expect(service.downloadProgress()).toBeGreaterThanOrEqual(measured);
      expect(service.downloadProgress()).toBeLessThan(measured + 0.001);

      // From the re-anchored point it resumes easing at the curve's normal rate
      // rather than sitting frozen or snapping to the un-anchored ~0.90.
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
      const oneTickLater = service.downloadProgress();

      expect(oneTickLater).toBeGreaterThan(measured);
      expect(oneTickLater).toBeLessThan(0.4);
    });

    it('falls back to the modelled curve when the cache holds nothing to weigh', async () => {
      const cacheStorage = new FakeCacheStorage({ [assetCache(NEW_HASH)]: [] });
      const { service, versionUpdates } = createService({ cacheStorage });

      service.init();
      versionUpdates.next(versionDetectedEvent(NEW_HASH));
      await vi.advanceTimersByTimeAsync(4 * UPDATE_PROGRESS_TICK_MS);

      expect(service.measuredProgress()).toBe(false);
      expect(service.downloadProgress()).toBeGreaterThan(UPDATE_PROGRESS_MIN);
      expect(service.downloadProgress()).toBeLessThan(UPDATE_PROGRESS_MODELLED_CEILING);
    });
  });
});

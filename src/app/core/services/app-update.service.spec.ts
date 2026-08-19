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
 * Minimal in-memory CacheStorage double, matching the shape
 * SwDownloadProgressTracker reads: top-level `keys()`/`open()`, and per-cache
 * `keys()`/`matchAll()`.
 */
class FakeCacheStorage {
  private readonly caches = new Map<string, FakeEntry[]>();

  public constructor(shape: Record<string, FakeEntry[]>) {
    for (const [name, entries] of Object.entries(shape)) {
      this.caches.set(name, entries);
    }
  }

  public setEntries(name: string, entries: FakeEntry[]): void {
    this.caches.set(name, entries);
  }

  public async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  public async open(name: string): Promise<unknown> {
    const entries = this.caches.get(name) ?? [];

    return {
      keys: async () => entries.map((entry) => ({ url: entry.url })),
      matchAll: async () =>
        entries.map((entry) => ({
          url: entry.url,
          headers: {
            get: (header: string) => (header === 'content-length' ? String(entry.bytes) : null),
          },
        })),
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
    const { service, swUpdate, reload } = createService();

    await service.applyUpdate();

    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('still reloads even if activating the update fails', async () => {
    const { service, swUpdate, reload } = createService();
    swUpdate.activateUpdate.mockRejectedValueOnce(new Error('boom'));

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

      let previous = service.downloadProgress();

      for (let tick = 0; tick < 20; tick++) {
        await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);
        const current = service.downloadProgress();

        expect(current).toBeGreaterThanOrEqual(previous);
        expect(current).toBeLessThan(UPDATE_PROGRESS_MODELLED_CEILING);
        previous = current;
      }
    });

    it('reports that progress is modelled, not measured', async () => {
      const { service, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      await vi.advanceTimersByTimeAsync(UPDATE_PROGRESS_TICK_MS);

      expect(service.measuredProgress()).toBe(false);
    });

    it('flags a stalled download and probes for a suppressed VERSION_READY', async () => {
      const { service, swUpdate, versionUpdates } = createService();

      service.init();
      versionUpdates.next(versionDetectedEvent());
      expect(service.updateStalled()).toBe(false);

      await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_STALL_MS);

      expect(service.updateStalled()).toBe(true);
      expect(service.updatePhase()).toBe('downloading');
      expect(swUpdate.checkForUpdate).toHaveBeenCalled();
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

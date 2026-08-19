import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { SwDownloadProgressTracker, resolveCacheStorage } from './sw-download-progress.tracker';

interface FakeEntry {
  url: string;
  bytes: number | null;
}

/**
 * Minimal in-memory CacheStorage double. Only the four members the tracker uses
 * are implemented — `keys()`, `open()`, and per-cache `keys()` / `matchAll()`.
 */
class FakeCacheStorage {
  public openCalls: string[] = [];

  public constructor(private readonly caches = new Map<string, FakeEntry[]>()) {}

  public static from(shape: Record<string, FakeEntry[]>): FakeCacheStorage {
    return new FakeCacheStorage(new Map(Object.entries(shape)));
  }

  public setEntries(name: string, entries: FakeEntry[]): void {
    this.caches.set(name, entries);
  }

  public async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  public async open(name: string): Promise<unknown> {
    this.openCalls.push(name);
    const entries = this.caches.get(name) ?? [];

    return {
      keys: async () => entries.map((entry) => ({ url: entry.url })),
      matchAll: async () =>
        entries.map((entry) => ({
          url: entry.url,
          headers: {
            get: (header: string) =>
              header === 'content-length' && entry.bytes !== null ? String(entry.bytes) : null,
          },
        })),
    };
  }
}

function asCacheStorage(fake: FakeCacheStorage): CacheStorage {
  return fake as unknown as CacheStorage;
}

const OLD_HASH = 'oldhash';
const NEW_HASH = 'newhash';

function assetCache(hash: string, group: string): string {
  return `ngsw:/:${hash}:assets:${group}:cache`;
}

/** Old version fully populated; new version empty. 1000 + 3000 = 4000 bytes. */
function baselineShape(): Record<string, FakeEntry[]> {
  return {
    'ngsw:/:db:control': [],
    'ngsw:/:1:data:runtime-media:cache': [{ url: 'https://app/img/a.png', bytes: 500_000 }],
    [assetCache(OLD_HASH, 'app')]: [
      { url: 'https://app/index.html', bytes: 1000 },
      { url: 'https://app/main.js', bytes: 3000 },
    ],
    [assetCache(NEW_HASH, 'app')]: [],
  };
}

describe('SwDownloadProgressTracker', () => {
  it('is not measurable without a CacheStorage', async () => {
    const tracker = new SwDownloadProgressTracker(null);

    expect(await tracker.begin(NEW_HASH)).toBe(false);
    expect(tracker.measurable).toBe(false);
    expect(await tracker.sample()).toBeNull();
  });

  it('is not measurable on a first install with no outgoing version', async () => {
    const fake = FakeCacheStorage.from({ [assetCache(NEW_HASH, 'app')]: [] });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(false);
    expect(await tracker.sample()).toBeNull();
  });

  it('weighs progress by bytes rather than by file count', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);
    expect(await tracker.sample()).toBe(0);

    // The small file lands first: 1 of 2 files, but only 1000 of 4000 bytes.
    fake.setEntries(assetCache(NEW_HASH, 'app'), [{ url: 'https://app/index.html', bytes: 1000 }]);
    expect(await tracker.sample()).toBeCloseTo(0.25, 10);

    fake.setEntries(assetCache(NEW_HASH, 'app'), [
      { url: 'https://app/index.html', bytes: 1000 },
      { url: 'https://app/main.js', bytes: 3000 },
    ]);
    expect(await tracker.sample()).toBe(1);
  });

  it('sums bytes across every asset group of the tracked version', async () => {
    const fake = FakeCacheStorage.from({
      [assetCache(OLD_HASH, 'app')]: [{ url: 'https://app/main.js', bytes: 1000 }],
      [assetCache(OLD_HASH, 'data')]: [{ url: 'https://app/seed.sql', bytes: 9000 }],
      [assetCache(NEW_HASH, 'app')]: [{ url: 'https://app/main.js', bytes: 1000 }],
      [assetCache(NEW_HASH, 'data')]: [],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);
    expect(await tracker.sample()).toBeCloseTo(0.1, 10);
  });

  it('ignores data-group and control caches when weighing a version', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);

    // The 500_000-byte runtime-media entry would swamp the ratio if it counted.
    fake.setEntries(assetCache(NEW_HASH, 'app'), [{ url: 'https://app/main.js', bytes: 3000 }]);
    expect(await tracker.sample()).toBeCloseTo(0.75, 10);
  });

  it('prices a URL the outgoing version did not have at the average asset size', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);

    // Average of the 2 baseline entries is 2000 bytes -> 2000 / 4000.
    fake.setEntries(assetCache(NEW_HASH, 'app'), [{ url: 'https://app/brand-new.js', bytes: 7 }]);
    expect(await tracker.sample()).toBeCloseTo(0.5, 10);
  });

  it('clamps a version that outgrew its baseline to 1', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);

    fake.setEntries(assetCache(NEW_HASH, 'app'), [
      { url: 'https://app/index.html', bytes: 1000 },
      { url: 'https://app/main.js', bytes: 3000 },
      { url: 'https://app/extra.js', bytes: 12_000 },
    ]);
    expect(await tracker.sample()).toBe(1);
  });

  it('picks the most complete outgoing version when several old ones linger', async () => {
    const fake = FakeCacheStorage.from({
      [assetCache('ancient', 'app')]: [{ url: 'https://app/stale.js', bytes: 10 }],
      [assetCache(OLD_HASH, 'app')]: [{ url: 'https://app/main.js', bytes: 4000 }],
      [assetCache(NEW_HASH, 'app')]: [{ url: 'https://app/main.js', bytes: 4000 }],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);
    // Weighed against OLD_HASH (4000), not `ancient` (10), so this is exactly 1.
    expect(await tracker.sample()).toBe(1);
  });

  it('is not measurable when the outgoing responses carry no content-length', async () => {
    const fake = FakeCacheStorage.from({
      [assetCache(OLD_HASH, 'app')]: [{ url: 'https://app/main.js', bytes: null }],
      [assetCache(NEW_HASH, 'app')]: [],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(false);
    expect(await tracker.sample()).toBeNull();
  });

  it('never opens a cache that CacheStorage.keys() did not report', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);
    await tracker.sample();

    const reported = await fake.keys();

    expect(fake.openCalls.length).toBeGreaterThan(0);
    for (const name of fake.openCalls) {
      expect(reported).toContain(name);
    }
  });

  it('reports null instead of throwing when a cache read rejects', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);

    const exploding = {
      keys: async () => {
        throw new Error('storage denied');
      },
      open: async () => ({}),
    } as unknown as CacheStorage;
    const brokenTracker = new SwDownloadProgressTracker(exploding);

    expect(await brokenTracker.begin(NEW_HASH)).toBe(false);
    expect(await brokenTracker.sample()).toBeNull();
  });

  it('stops reporting once reset', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);
    expect(tracker.measurable).toBe(true);

    tracker.reset();

    expect(tracker.measurable).toBe(false);
    expect(await tracker.sample()).toBeNull();
  });

  it('resolves the window CacheStorage and null during prerender', () => {
    const withCaches = { defaultView: { caches: {} } } as unknown as Document;
    const withoutView = { defaultView: null } as unknown as Document;
    const withoutCaches = { defaultView: {} } as unknown as Document;

    expect(resolveCacheStorage(withCaches)).not.toBeNull();
    expect(resolveCacheStorage(withoutView)).toBeNull();
    expect(resolveCacheStorage(withoutCaches)).toBeNull();
  });
});

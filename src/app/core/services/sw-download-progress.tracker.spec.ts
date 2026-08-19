import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { SwDownloadProgressTracker, resolveCacheStorage } from './sw-download-progress.tracker';

interface FakeEntry {
  /** The cache KEY url — what `cache.keys()` reports. */
  url: string;
  /** `content-length`, or null for a response served without one. */
  bytes: number | null;
  /**
   * The stored response's own url when it differs from the key, which is what ngsw
   * produces for a cache-busted or redirected fetch.
   */
  responseUrl?: string;
}

/**
 * Minimal in-memory CacheStorage double covering exactly the members the tracker
 * uses: `keys()` / `open()` on the storage, and `keys()` / `match()` on a cache.
 *
 * It deliberately keeps the request url and the response url separate so a
 * regression that keys byte weights by `Response.url` fails here.
 */
class FakeCacheStorage {
  public openCalls: string[] = [];

  public constructor(
    private readonly caches = new Map<string, FakeEntry[]>(),
    private readonly throwingCaches = new Set<string>(),
  ) {}

  public static from(shape: Record<string, FakeEntry[]>): FakeCacheStorage {
    return new FakeCacheStorage(new Map(Object.entries(shape)));
  }

  public setEntries(name: string, entries: FakeEntry[]): void {
    this.caches.set(name, entries);
  }

  public throwOn(name: string): void {
    this.throwingCaches.add(name);
  }

  public async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  public async open(name: string): Promise<unknown> {
    this.openCalls.push(name);
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
          url: entry.responseUrl ?? entry.url,
          headers: {
            get: (header: string) =>
              header === 'content-length' && entry.bytes !== null ? String(entry.bytes) : null,
          },
        };
      },
    };
  }
}

function asCacheStorage(fake: FakeCacheStorage): CacheStorage {
  return fake as unknown as CacheStorage;
}

const OLD_HASH = 'oldhash';
const NEW_HASH = 'newhash';

function assetCache(hash: string, group = 'app'): string {
  return `ngsw:/:${hash}:assets:${group}:cache`;
}

/** Old version fully populated; new version empty. 1000 + 3000 = 4000 bytes. */
function baselineShape(): Record<string, FakeEntry[]> {
  return {
    'ngsw:/:db:control': [],
    'ngsw:/:1:data:runtime-media:cache': [{ url: 'https://app/img/a.png', bytes: 500_000 }],
    [assetCache(OLD_HASH)]: [
      { url: 'https://app/index.html', bytes: 1000 },
      { url: 'https://app/main.js', bytes: 3000 },
    ],
    [assetCache(NEW_HASH)]: [],
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
    const fake = FakeCacheStorage.from({ [assetCache(NEW_HASH)]: [] });
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
    fake.setEntries(assetCache(NEW_HASH), [{ url: 'https://app/index.html', bytes: 1000 }]);
    expect(await tracker.sample()).toBeCloseTo(0.25, 10);

    fake.setEntries(assetCache(NEW_HASH), [
      { url: 'https://app/index.html', bytes: 1000 },
      { url: 'https://app/main.js', bytes: 3000 },
    ]);
    expect(await tracker.sample()).toBe(1);
  });

  it('keys byte weights by the request url, not the stored response url', async () => {
    // ngsw refetches a hash-mismatched asset with an `ngsw-cache-bust` query and
    // stores that response under the clean request, so the two urls diverge for
    // exactly the assets a deploy changed.
    const fake = FakeCacheStorage.from({
      [assetCache(OLD_HASH)]: [
        { url: 'https://app/index.html', bytes: 1000 },
        {
          url: 'https://app/main.js',
          bytes: 3000,
          responseUrl: 'https://app/main.js?ngsw-cache-bust=0.42',
        },
      ],
      [assetCache(NEW_HASH)]: [],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);

    // Keyed by Response.url this would miss the map and be priced at the 2000-byte
    // average, reporting 0.5 instead of the true 0.75.
    fake.setEntries(assetCache(NEW_HASH), [{ url: 'https://app/main.js', bytes: 3000 }]);
    expect(await tracker.sample()).toBeCloseTo(0.75, 10);
  });

  it('prices an unsized baseline entry on both sides of the ratio', async () => {
    // 1000 sized + one unsized priced at the 1000-byte average = a 2000-byte total.
    const fake = FakeCacheStorage.from({
      [assetCache(OLD_HASH)]: [
        { url: 'https://app/index.html', bytes: 1000 },
        { url: 'https://app/chunked.js', bytes: null },
      ],
      [assetCache(NEW_HASH)]: [],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);

    // Counting the unsized entry only in the numerator would report 1.0 here while
    // index.html has not been transferred at all.
    fake.setEntries(assetCache(NEW_HASH), [{ url: 'https://app/chunked.js', bytes: null }]);
    expect(await tracker.sample()).toBeCloseTo(0.5, 10);

    fake.setEntries(assetCache(NEW_HASH), [
      { url: 'https://app/chunked.js', bytes: null },
      { url: 'https://app/index.html', bytes: 1000 },
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

  it('parses a group literally named "assets" without confusing the hash segment', async () => {
    // The lazy group in ngsw-config.json is called `assets`, producing the
    // doubled-segment name `ngsw:/:<hash>:assets:assets:cache`.
    const fake = FakeCacheStorage.from({
      [assetCache(OLD_HASH, 'assets')]: [{ url: 'https://app/brand/logo.png', bytes: 800 }],
      [assetCache(NEW_HASH, 'assets')]: [{ url: 'https://app/brand/logo.png', bytes: 800 }],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);
    expect(await tracker.sample()).toBe(1);
  });

  it('ignores data-group and control caches when weighing a version', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);

    // The 500_000-byte runtime-media entry would swamp the ratio if it counted.
    fake.setEntries(assetCache(NEW_HASH), [{ url: 'https://app/main.js', bytes: 3000 }]);
    expect(await tracker.sample()).toBeCloseTo(0.75, 10);
  });

  it('prices a URL the outgoing version did not have at the average asset size', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);

    // Average of the 2 baseline entries is 2000 bytes -> 2000 / 4000.
    fake.setEntries(assetCache(NEW_HASH), [{ url: 'https://app/brand-new.js', bytes: 7 }]);
    expect(await tracker.sample()).toBeCloseTo(0.5, 10);
  });

  it('clamps a version that outgrew its baseline to 1', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);

    fake.setEntries(assetCache(NEW_HASH), [
      { url: 'https://app/index.html', bytes: 1000 },
      { url: 'https://app/main.js', bytes: 3000 },
      { url: 'https://app/extra.js', bytes: 12_000 },
    ]);
    expect(await tracker.sample()).toBe(1);
  });

  it('picks the most complete outgoing version when several old ones linger', async () => {
    const fake = FakeCacheStorage.from({
      [assetCache('ancient')]: [{ url: 'https://app/stale.js', bytes: 10 }],
      [assetCache(OLD_HASH)]: [
        { url: 'https://app/main.js', bytes: 3000 },
        { url: 'https://app/index.html', bytes: 1000 },
      ],
      [assetCache(NEW_HASH)]: [{ url: 'https://app/main.js', bytes: 3000 }],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);
    // Weighed against OLD_HASH (4000) this is 0.75. Weighed against `ancient` (10)
    // it would saturate at 1, and averaging the two would give something else again.
    expect(await tracker.sample()).toBeCloseTo(0.75, 10);
  });

  it('excludes the incoming version from its own baseline', async () => {
    // Only the tracked hash has caches, and they are already partly populated. If
    // the incoming version were allowed into the baseline the ratio would be a
    // meaningless 1.0 from the first sample.
    const fake = FakeCacheStorage.from({
      [assetCache(NEW_HASH)]: [{ url: 'https://app/main.js', bytes: 3000 }],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(false);
    expect(await tracker.sample()).toBeNull();
  });

  it('is not measurable when the outgoing responses carry no content-length', async () => {
    const fake = FakeCacheStorage.from({
      [assetCache(OLD_HASH)]: [{ url: 'https://app/main.js', bytes: null }],
      [assetCache(NEW_HASH)]: [],
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

  it('reports null instead of throwing when a sample read rejects', async () => {
    const fake = FakeCacheStorage.from(baselineShape());
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    expect(await tracker.begin(NEW_HASH)).toBe(true);
    expect(await tracker.sample()).toBe(0);

    // The incoming version's cache becomes unreadable mid-download.
    fake.throwOn(assetCache(NEW_HASH));

    expect(await tracker.sample()).toBeNull();
    // Still structurally measurable, so the caller must treat this as transient.
    expect(tracker.measurable).toBe(true);
  });

  it('reports not-measurable when the whole storage rejects', async () => {
    const exploding = {
      keys: async () => {
        throw new Error('storage denied');
      },
      open: async () => ({}),
    } as unknown as CacheStorage;
    const tracker = new SwDownloadProgressTracker(exploding);

    expect(await tracker.begin(NEW_HASH)).toBe(false);
    expect(tracker.measurable).toBe(false);
    expect(await tracker.sample()).toBeNull();
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

  it('discards a sample whose version was re-targeted mid-flight', async () => {
    const fake = FakeCacheStorage.from({
      ...baselineShape(),
      [assetCache('v2')]: [],
    });
    const tracker = new SwDownloadProgressTracker(asCacheStorage(fake));

    await tracker.begin(NEW_HASH);

    const pending = tracker.sample();
    // A superseding version resets the weights synchronously, under the pending read.
    const retarget = tracker.begin('v2');

    await expect(pending).resolves.toBeNull();
    await retarget;
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

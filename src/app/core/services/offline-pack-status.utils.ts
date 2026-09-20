import type { OfflinePackSummary } from '../models/optc.models';

/**
 * 869f138pr. What the offline image packs really are, and how much of one is really offline.
 *
 * Three packs ship with the app - `thumbnails-glo`, `thumbnails-jap`, `ship-thumbnails` - totalling
 * **161.6 MB across 11,039 files** (measured 2026-09-20, v0.5.3), and until this was measured
 * nothing on any screen mentioned them.
 *
 * This read **"189 MB"** until 2026-09-20, which is what `du -sh` reports. That is DISK USAGE, and it
 * counts the slack in the last block of each of eleven thousand small files - about 27 MB of nothing.
 * The packs' SIZE, the number that matters to a reader deciding whether to download them, is the sum
 * of the file lengths. Quote the sum; `du` answers a different question.
 * The audit on 869f138pj establishes what they actually do, which is not what the folder name
 * suggests:
 *
 * - they are NOT prefetched. A first visit does not pay for them; each image is fetched the first
 *   time a screen shows it.
 * - `ngsw-config.json` keeps them in the `runtime-media` data group, `strategy: performance`.
 *   Until 2026-09-17 that was **`maxSize: 750`, `maxAge: 30d`** - at most 750 of the 11,039 files,
 *   **6.79%** (this said "about 6.4%", which was wrong against either file count), each expiring
 *   after thirty days, so whatever a reader had seen was dropped to
 *   make room for what they looked at next. The owner raised both when that was measured; see
 *   {@link RUNTIME_MEDIA_MAX_ENTRIES}.
 * - `installed: true` in the manifest means "these files exist on the server", not "this reader
 *   installed them". Nothing activates a pack and nothing can remove one.
 *
 * That is a defensible design for an online-first app and an unusable one for a reader who wanted
 * their box available on a plane, and the honest first move is to stop it being invisible. This
 * module produces what a screen can say without claiming more than is true: the real size of each
 * pack, and how many of its images are cached **right now**, counted rather than estimated.
 */

/** ngsw names its caches `ngsw:<scope>:<hash>:data:<group>:cache`; the group name is the stable part. */
export const RUNTIME_MEDIA_CACHE_MARKER = 'runtime-media';

/**
 * The ceiling from `ngsw-config.json`.
 *
 * Duplicated here on purpose rather than parsed: the screen has to state the number, the config is
 * not shipped to the browser, and a spec keeps the two equal so this copy cannot drift.
 *
 * **Raised from 750 on 2026-09-17, on the owner's decision**, together with `maxAge` from 30 days
 * to a year. At 750 a reader could never keep even a seventh of one pack, and whatever they had
 * seen was dropped to make room for what they looked at next - which is the opposite of what an
 * offline pack is for. 12,000 clears the 11,072 files the runtime group can ever hold, so the cap
 * stops being the binding constraint and what a reader keeps is simply what they have opened.
 *
 * The device's own storage quota is the real ceiling now, and it always was the honest one: the
 * cache only ever fills with pictures somebody actually looked at.
 */
export const RUNTIME_MEDIA_MAX_ENTRIES = 12_000;

export interface OfflinePackStatus {
  readonly id: string;
  readonly label: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  /** How many of this pack's files are in the runtime cache at the moment of the count. */
  readonly cachedCount: number;
}

/** True for a URL that belongs to `packId`, whatever origin it was requested from. */
export function isPackUrl(url: string, packId: string): boolean {
  return url.includes(`/assets/offline-packs/${packId}/`);
}

export function summarizeOfflinePacks({
  packs,
  cachedUrls,
}: {
  packs: readonly OfflinePackSummary[];
  cachedUrls: readonly string[];
}): OfflinePackStatus[] {
  return packs.map((pack) => ({
    id: pack.id,
    label: pack.label,
    fileCount: pack.fileCount,
    totalBytes: pack.totalBytes,
    cachedCount: cachedUrls.filter((url) => isPackUrl(url, pack.id)).length,
  }));
}

/**
 * Every URL the service worker is currently holding in its runtime media cache.
 *
 * Returns an empty list wherever the answer cannot be had - no Cache Storage, a browser that blocks
 * it, a build with no service worker - because "none cached" and "cannot tell" look the same to a
 * reader and only one of them is worth a different sentence. The screen says what it counted.
 */
export async function readRuntimeMediaUrls(
  cacheStorage: CacheStorage | null | undefined,
): Promise<string[]> {
  if (!cacheStorage) {
    return [];
  }

  try {
    const names = (await cacheStorage.keys()).filter((name) =>
      name.includes(RUNTIME_MEDIA_CACHE_MARKER),
    );
    const urls: string[] = [];

    for (const name of names) {
      const cache = await cacheStorage.open(name);

      for (const request of await cache.keys()) {
        urls.push(request.url);
      }
    }

    return urls;
  } catch {
    return [];
  }
}

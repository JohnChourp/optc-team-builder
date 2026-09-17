import type { OfflinePackSummary } from '../models/optc.models';

/**
 * 869f138pr. What the offline image packs really are, and how much of one is really offline.
 *
 * Three packs ship with the app - `thumbnails-glo`, `thumbnails-jap`, `ship-thumbnails` - totalling
 * **189 MB across 11,023 files**, and until this was measured nothing on any screen mentioned them.
 * The audit on 869f138pj establishes what they actually do, which is not what the folder name
 * suggests:
 *
 * - they are NOT prefetched. A first visit does not pay for them; each image is fetched the first
 *   time a screen shows it.
 * - `ngsw-config.json` keeps them in the `runtime-media` data group, `strategy: performance`,
 *   **`maxSize: 750`, `maxAge: 30d`**. So at most 750 of the 11,023 files - about **6.4%** - are
 *   held for offline use at any moment, and each of those expires after thirty days.
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
 */
export const RUNTIME_MEDIA_MAX_ENTRIES = 750;

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

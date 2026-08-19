/**
 * Byte-weighted progress measurement for an in-flight Angular service worker
 * version install.
 *
 * The Angular service worker (22.0.5) emits no download, byte or per-asset
 * events at all — its complete client message vocabulary is ten `postMessage`
 * types and none of them is per-asset, so `VERSION_DETECTED` is followed by a
 * silent gap and then `VERSION_READY`. What the worker *does* do is fill its
 * caches incrementally and observably:
 *
 * - `PrefetchAssetGroup.initializeFully()` walks its URL list in a strictly
 *   sequential `reduce(async (previous, url) => { await previous; … })` chain and
 *   each iteration ends in a `cache.put`. There is no staging buffer and no
 *   end-of-install bulk write.
 * - The new version's caches are opened (created empty) in the `AssetGroup`
 *   constructor, which runs synchronously inside `new AppVersion(...)` at the top
 *   of `setupUpdate`, so the cache keys exist before the first byte lands.
 * - Cache names are `ngsw:<scopePath>:<manifestHash>:assets:<groupName>:cache`,
 *   and `<manifestHash>` is exactly the `version.hash` carried by
 *   `VERSION_DETECTED`. Old and new versions coexist during an install and are
 *   disambiguated by that hash segment.
 *
 * So the population of the new version's asset caches is a real, live signal. It
 * must be weighted by BYTES rather than by file count: for this app
 * `public/assets/data/optc-seed.sql` alone is ~25 MB (~2.1 MB gzipped) against 56
 * i18n files totalling ~60 KB, so a plain file-count ratio races to ~96% within a
 * few percent of the transfer and then sits frozen for the whole seed download —
 * precisely the "is it stuck?" experience the progress bar exists to remove.
 *
 * The byte weights come from the OUTGOING version's caches, which are still
 * present and fully populated when the new install starts: one pass over them at
 * {@link SwDownloadProgressTracker.begin} builds a URL → `content-length` map and
 * the total, and every later sample only needs the cheap `cache.keys()` of the
 * incoming version. Numerator and denominator are therefore measured the same way
 * over (essentially) the same asset set, which is what makes the ratio honest.
 *
 * When there is nothing to measure against — no `CacheStorage`, a first install
 * with no previous version, or responses served without `content-length` —
 * {@link SwDownloadProgressTracker.sample} reports `null` and the caller falls
 * back to a modelled curve. The two sources are never blended: a measured value
 * is real, a modelled value is admitted to be an estimate.
 */

/** Matches `ngsw:<scopePath>:<manifestHash>:assets:<groupName>:cache`. */
const ASSET_CACHE_NAME_PATTERN = /^ngsw:(?<scope>.*):(?<hash>[^:]+):assets:(?<group>[^:]+):cache$/u;

interface ParsedAssetCacheName {
  readonly name: string;
  readonly hash: string;
}

/**
 * Reads live install progress out of the service worker's own caches.
 *
 * Deliberately a plain class rather than an `@Injectable`: `AppUpdateService`
 * constructs it from the `Document` it already injects, so `AppComponent` gains no
 * new injection token.
 */
export class SwDownloadProgressTracker {
  private targetHash: string | null = null;
  private totalBytes = 0;
  private averageBytes = 0;
  private byteSizeByUrl = new Map<string, number>();

  public constructor(private readonly cacheStorage: CacheStorage | null) {}

  /** True once {@link begin} has found a previous version to weigh against. */
  public get measurable(): boolean {
    return this.targetHash !== null && this.totalBytes > 0;
  }

  /**
   * Prepares measurement for the version identified by `hash` (the
   * `VERSION_DETECTED` payload's `version.hash`).
   *
   * Resolves to `true` when subsequent {@link sample} calls can report real
   * numbers, and to `false` when the caller must fall back to a modelled curve.
   * Never rejects: a browser that denies cache access simply is not measurable.
   */
  public async begin(hash: string): Promise<boolean> {
    this.reset();
    this.targetHash = hash;

    if (!this.cacheStorage) {
      return false;
    }

    try {
      const outgoing = await this.resolveOutgoingBaseline(hash);

      if (!outgoing) {
        return false;
      }

      this.byteSizeByUrl = outgoing.byteSizeByUrl;
      this.totalBytes = outgoing.totalBytes;
      this.averageBytes =
        outgoing.byteSizeByUrl.size > 0 ? outgoing.totalBytes / outgoing.byteSizeByUrl.size : 0;

      return this.measurable;
    } catch {
      // A cache read can reject on a browser that blocks storage (private mode,
      // storage pressure). Treat it as "not measurable" rather than an error.
      this.reset();

      return false;
    }
  }

  /**
   * Samples the fraction of the tracked version's bytes already cached.
   *
   * Returns a value in `[0, 1]`, or `null` when the install is not measurable —
   * including when {@link begin} was never called for the current download.
   */
  public async sample(): Promise<number | null> {
    const hash = this.targetHash;

    if (!this.cacheStorage || hash === null || this.totalBytes <= 0) {
      return null;
    }

    try {
      const caches = await this.assetCachesForHash(hash);
      let cachedBytes = 0;

      for (const cache of caches) {
        // `cache.keys()` returns Request objects without touching any body, so a
        // sample stays cheap even for a cache holding hundreds of entries.
        const requests = await cache.keys();

        for (const request of requests) {
          cachedBytes += this.byteSizeByUrl.get(request.url) ?? this.averageBytes;
        }
      }

      return Math.min(1, Math.max(0, cachedBytes / this.totalBytes));
    } catch {
      return null;
    }
  }

  /** Forgets the tracked version and its byte weights. */
  public reset(): void {
    this.targetHash = null;
    this.totalBytes = 0;
    this.averageBytes = 0;
    this.byteSizeByUrl = new Map<string, number>();
  }

  /**
   * Builds the URL → byte-size map from the most complete version that is not
   * `excludedHash`, i.e. the version being replaced.
   */
  private async resolveOutgoingBaseline(
    excludedHash: string,
  ): Promise<{ byteSizeByUrl: Map<string, number>; totalBytes: number } | null> {
    const grouped = this.groupAssetCachesByHash(await this.cacheNames());
    let best: { byteSizeByUrl: Map<string, number>; totalBytes: number } | null = null;

    for (const [hash, caches] of grouped) {
      if (hash === excludedHash) {
        continue;
      }

      const candidate = await this.measureVersion(caches);

      if (candidate.totalBytes > (best?.totalBytes ?? 0)) {
        best = candidate;
      }
    }

    return best;
  }

  /** Sums `content-length` across every entry of one version's asset caches. */
  private async measureVersion(
    caches: readonly ParsedAssetCacheName[],
  ): Promise<{ byteSizeByUrl: Map<string, number>; totalBytes: number }> {
    const byteSizeByUrl = new Map<string, number>();
    let totalBytes = 0;

    for (const { name } of caches) {
      const cache = await this.openExisting(name);

      if (!cache) {
        continue;
      }

      // `matchAll()` is the one heavy read in this class, and it runs once per
      // download rather than once per sample.
      for (const response of await cache.matchAll()) {
        const bytes = readContentLength(response);

        if (bytes === null) {
          continue;
        }

        byteSizeByUrl.set(response.url, bytes);
        totalBytes += bytes;
      }
    }

    return { byteSizeByUrl, totalBytes };
  }

  /** Opens the asset caches belonging to one manifest hash. */
  private async assetCachesForHash(hash: string): Promise<Cache[]> {
    const caches: Cache[] = [];

    for (const parsed of this.groupAssetCachesByHash(await this.cacheNames()).get(hash) ?? []) {
      const cache = await this.openExisting(parsed.name);

      if (cache) {
        caches.push(cache);
      }
    }

    return caches;
  }

  /**
   * Opens a cache that `CacheStorage.keys()` already reported, so this never
   * creates one as a side effect.
   */
  private async openExisting(name: string): Promise<Cache | null> {
    if (!this.cacheStorage) {
      return null;
    }

    try {
      return await this.cacheStorage.open(name);
    } catch {
      return null;
    }
  }

  private async cacheNames(): Promise<readonly string[]> {
    if (!this.cacheStorage) {
      return [];
    }

    return await this.cacheStorage.keys();
  }

  private groupAssetCachesByHash(
    names: readonly string[],
  ): Map<string, readonly ParsedAssetCacheName[]> {
    const grouped = new Map<string, ParsedAssetCacheName[]>();

    for (const name of names) {
      const hash = ASSET_CACHE_NAME_PATTERN.exec(name)?.groups?.['hash'];

      if (hash === undefined) {
        // Data-group caches (`ngsw:/:<groupVersion>:data:<name>:cache`) and the
        // control DB (`ngsw:/:db:control`) never match, so they cannot pollute
        // either side of the ratio.
        continue;
      }

      const bucket = grouped.get(hash) ?? [];
      bucket.push({ name, hash });
      grouped.set(hash, bucket);
    }

    return grouped;
  }
}

/**
 * Reads the transferred size of a cached response.
 *
 * `content-length` is the compressed size for a gzipped asset, which is exactly
 * what we want: both sides of the ratio are measured the same way, so the units
 * cancel.
 */
function readContentLength(response: Response): number | null {
  const raw = response.headers.get('content-length');

  if (raw === null) {
    return null;
  }

  const bytes = Number.parseInt(raw, 10);

  return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
}

/** Resolves the window's `CacheStorage`, or `null` during prerender. */
export function resolveCacheStorage(document: Document): CacheStorage | null {
  return document.defaultView?.caches ?? null;
}

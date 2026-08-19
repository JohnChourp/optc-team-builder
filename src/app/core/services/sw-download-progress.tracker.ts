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
 * What this measures is INSTALL progress, not wire bytes. ngsw copies an unchanged
 * asset from the outgoing version's cache instead of re-fetching it, so on a deploy
 * that only changes the JS bundle the bar races through the copied assets and then
 * slows on the changed ones. That is the intended reading: the question the banner
 * answers is "how much of the new version is in place", not "how many bytes crossed
 * the network".
 *
 * GRANULARITY, and why a sample also reports an in-flight share. `PrefetchAssetGroup`
 * commits one `cache.put` per URL, so the confirmed count cannot move at all while a
 * single asset is being fetched — and this app's payload is dominated by one file:
 * live measurement showed `optc-seed.sql` accounting for ~76% of the prefetch bytes,
 * which left the bar frozen at 18% for 24 s and then snapping to 100%. Byte
 * weighting alone does not fix that; it only moves the freeze point.
 *
 * So {@link SwDownloadProgressTracker.sample} reports two numbers: the CONFIRMED
 * ratio, and the byte share of the next asset expected to land. The caller may
 * interpolate across that share while the confirmed value is static, which is
 * bounded rather than fabricated — the bar can never claim more than "the asset
 * currently being fetched is nearly done", and the moment it lands the confirmed
 * value takes over. What must never happen is easing the free-running MODELLED
 * curve on top of a measured reading; that is unbounded and the bar stops meaning
 * anything.
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

interface VersionByteWeights {
  readonly byteSizeByUrl: Map<string, number>;
  readonly totalBytes: number;
  /** Mean size of the sized entries, used to price a URL the baseline lacks. */
  readonly averageBytes: number;
}

/** One reading of an in-flight install. */
export interface SwDownloadSample {
  /** Fraction of the payload's bytes actually present in the new caches, `[0, 1]`. */
  readonly ratio: number;
  /**
   * Byte share of the next asset expected to land, as a fraction of the payload.
   *
   * This is the only amount a caller may interpolate across while {@link ratio} is
   * static: it bounds the interpolation to one asset's worth of optimism.
   */
  readonly inFlightShare: number;
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

      // A later begin() may have re-targeted the tracker while the baseline pass was
      // running. Committing this one would hand the newer version the older
      // version's weights, so drop it instead.
      if (this.targetHash !== hash) {
        return false;
      }

      if (!outgoing) {
        return false;
      }

      this.byteSizeByUrl = outgoing.byteSizeByUrl;
      this.totalBytes = outgoing.totalBytes;
      this.averageBytes = outgoing.averageBytes;

      return this.measurable;
    } catch {
      // A cache read can reject on a browser that blocks storage (private mode,
      // storage pressure). Treat it as "not measurable" rather than an error.
      if (this.targetHash === hash) {
        this.reset();
      }

      return false;
    }
  }

  /**
   * Samples the fraction of the tracked version's bytes already cached.
   *
   * Returns a value in `[0, 1]`, or `null` when the install is not measurable —
   * including when {@link begin} was never called for the current download.
   */
  public async sample(): Promise<SwDownloadSample | null> {
    // Every input is captured up front. A `begin()` for a superseding version can
    // land while the awaits below are pending, and reading `this.totalBytes` after
    // that reset would divide by zero and poison the signal with NaN forever.
    const hash = this.targetHash;
    const totalBytes = this.totalBytes;
    const averageBytes = this.averageBytes;
    const byteSizeByUrl = this.byteSizeByUrl;

    if (!this.cacheStorage || hash === null || totalBytes <= 0) {
      return null;
    }

    try {
      const caches = await this.assetCachesForHash(hash);
      const cachedUrls = new Set<string>();
      let cachedBytes = 0;

      for (const cache of caches) {
        // `cache.keys()` returns Request objects without touching any body, so a
        // sample stays cheap even for a cache holding hundreds of entries.
        const requests = await cache.keys();

        for (const request of requests) {
          cachedUrls.add(request.url);
          cachedBytes += byteSizeByUrl.get(request.url) ?? averageBytes;
        }
      }

      if (this.targetHash !== hash || this.byteSizeByUrl !== byteSizeByUrl) {
        // Re-targeted mid-sample: this reading belongs to a download nobody is
        // watching any more.
        return null;
      }

      return {
        ratio: Math.min(1, Math.max(0, cachedBytes / totalBytes)),
        inFlightShare: resolveInFlightShare(byteSizeByUrl, cachedUrls, totalBytes),
      };
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
  private async resolveOutgoingBaseline(excludedHash: string): Promise<VersionByteWeights | null> {
    const grouped = this.groupAssetCachesByHash(await this.cacheNames());
    let best: VersionByteWeights | null = null;

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

  /**
   * Weighs one version's asset caches by `content-length`.
   *
   * This is the one heavy read in this class and it runs once per download rather
   * than once per sample.
   */
  private async measureVersion(
    caches: readonly ParsedAssetCacheName[],
  ): Promise<VersionByteWeights> {
    // Keyed by the REQUEST url, never the response's. ngsw stores a cache-busted
    // or redirected response under the clean request it was asked for, so
    // `Response.url` can carry an `ngsw-cache-bust` query — or a redirect target —
    // that a later `cache.keys()` will never produce. Keying by the response would
    // silently drop exactly the assets that actually changed in this deploy.
    const rawSizeByUrl = new Map<string, number | null>();

    for (const { name } of caches) {
      const cache = await this.openExisting(name);

      if (!cache) {
        continue;
      }

      for (const request of await cache.keys()) {
        if (rawSizeByUrl.has(request.url)) {
          continue;
        }

        const response = await this.matchRequest(cache, request);
        rawSizeByUrl.set(request.url, response ? readContentLength(response) : null);
      }
    }

    const sizes = [...rawSizeByUrl.values()].filter((bytes): bytes is number => bytes !== null);
    const averageBytes =
      sizes.length > 0 ? sizes.reduce((total, bytes) => total + bytes, 0) / sizes.length : 0;

    const byteSizeByUrl = new Map<string, number>();
    let totalBytes = 0;

    for (const [url, bytes] of rawSizeByUrl) {
      // An entry served without `content-length` is priced at the average on BOTH
      // sides of the ratio. Counting it only in the numerator (as an unknown URL)
      // while omitting it from the denominator would let the bar reach 100% with
      // most of the payload still untransferred.
      const weight = bytes ?? averageBytes;

      if (weight <= 0) {
        continue;
      }

      byteSizeByUrl.set(url, weight);
      totalBytes += weight;
    }

    return { byteSizeByUrl, totalBytes, averageBytes };
  }

  /** Reads one cached response, tolerating a `Cache` double without `match()`. */
  private async matchRequest(cache: Cache, request: Request): Promise<Response | undefined> {
    try {
      return await cache.match(request);
    } catch {
      return undefined;
    }
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
   * Opens a cache whose name `CacheStorage.keys()` already reported.
   *
   * `CacheStorage.open()` CREATES a cache that does not exist, so every call site
   * must feed it a name that came from `keys()` — otherwise a census would litter
   * the origin with empty caches on every sample.
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
 * Byte share of the next asset expected to land.
 *
 * The baseline map preserves the outgoing version's cache insertion order, which is
 * the manifest order ngsw prefetches in, so the FIRST not-yet-cached entry is the
 * one being fetched right now. Taking the first rather than the largest is what
 * keeps the caller's interpolation bounded by reality instead of by the worst case.
 */
function resolveInFlightShare(
  byteSizeByUrl: ReadonlyMap<string, number>,
  cachedUrls: ReadonlySet<string>,
  totalBytes: number,
): number {
  for (const [url, bytes] of byteSizeByUrl) {
    if (!cachedUrls.has(url)) {
      return Math.min(1, Math.max(0, bytes / totalBytes));
    }
  }

  return 0;
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

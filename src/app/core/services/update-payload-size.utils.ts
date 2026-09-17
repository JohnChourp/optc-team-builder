/**
 * 869f138pt. How large the pending update is, before it starts downloading.
 *
 * The banner has measured its own progress since 869exmkf4 - a fraction, by bytes, because ngsw
 * emits no progress events. What it never said is SCALE. A player on mobile data could not tell a
 * 300 KB bundle change from the whole dataset, and by the time the bar moves slowly enough to
 * answer that, the bytes are already spent.
 *
 * The number is derivable without touching a single ngsw internal. `ngsw.json` is served from the
 * origin and never cached by the worker, so:
 *
 * - at startup the app reads the manifest of the version it is running and keeps it;
 * - when `VERSION_DETECTED` fires, it reads the manifest again - now the new one - and the URLs
 *   whose hash changed, plus the URLs that are new, are exactly what has to be fetched. Everything
 *   else ngsw copies out of the outgoing version's caches without a request.
 *
 * Sizes come from the outgoing version's cached responses, which `SwDownloadProgressTracker`
 * already measures for its own weights. For a changed asset that is an estimate - the same file,
 * new contents - and for a new one there is no size at all, which is why the result counts what it
 * could not size rather than quietly under-reporting. The banner says "about".
 *
 * What makes the estimate safe rather than merely approximate: it can only be WRONG LOW by an
 * asset that did not exist before, and those are counted and reported. It is never wrong high,
 * because an asset ngsw copies is not in the diff at all.
 */

export interface NgswManifestSnapshot {
  /** The manifest's own `timestamp`. Two reads with the same value are the same version. */
  readonly timestamp: number;
  /** URL -> content hash, straight out of `hashTable`. */
  readonly hashTable: Readonly<Record<string, string>>;
}

export interface UpdatePayloadEstimate {
  /** Bytes that have to be fetched, as far as the outgoing version's sizes can say. */
  readonly bytes: number;
  /** How many URLs changed or appeared. */
  readonly changedCount: number;
  /** Of those, how many had no size on this device - new files, so `bytes` is a floor. */
  readonly unsizedCount: number;
}

/** A parsed `ngsw.json`, or null when it is not one. */
export function parseNgswManifest(value: unknown): NgswManifestSnapshot | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const timestamp = record['timestamp'];
  const hashTable = record['hashTable'];

  if (typeof timestamp !== 'number' || typeof hashTable !== 'object' || hashTable === null) {
    return null;
  }

  const entries = Object.entries(hashTable as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  return { timestamp, hashTable: Object.fromEntries(entries) };
}

/**
 * What the new version has to fetch, given what the old one had.
 *
 * Returns null when the two snapshots are the same version, which is not a failure: it means the
 * app started after the new manifest was already being served, so there is nothing to compare and
 * nothing honest to say.
 */
/**
 * `hashTable` is keyed by path (`/assets/x.js`); the tracker's sizes are keyed by request URL
 * (`https://host/assets/x.js`). They are the same asset and the diff is meaningless unless the two
 * are compared on the same key.
 */
export function pathOf(url: string): string {
  try {
    return new URL(url, 'https://optc.invalid').pathname;
  } catch {
    return url;
  }
}

export function estimateUpdatePayload({
  previous,
  next,
  byteSizeByUrl,
}: {
  previous: NgswManifestSnapshot | null;
  next: NgswManifestSnapshot | null;
  byteSizeByUrl: ReadonlyMap<string, number>;
}): UpdatePayloadEstimate | null {
  if (!previous || !next || previous.timestamp === next.timestamp) {
    return null;
  }

  const sizeByPath = new Map<string, number>();

  for (const [url, size] of byteSizeByUrl) {
    sizeByPath.set(pathOf(url), size);
  }

  let bytes = 0;
  let changedCount = 0;
  let unsizedCount = 0;

  for (const [url, hash] of Object.entries(next.hashTable)) {
    if (previous.hashTable[url] === hash) {
      continue;
    }

    changedCount += 1;

    const size = sizeByPath.get(pathOf(url));

    if (typeof size === 'number' && size > 0) {
      bytes += size;
    } else {
      unsizedCount += 1;
    }
  }

  return { bytes, changedCount, unsizedCount };
}

/**
 * The size as a player reads it: one decimal above a megabyte, whole kilobytes below.
 *
 * Deliberately not `Intl.NumberFormat` with a unit - "8.7 MB" has to read the same in both
 * languages, because a download size is not a translated phrase and a reader comparing it against
 * their data plan should see the same string the plan uses.
 */
export function formatUpdateSize(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)} KB`;
  }

  return `${Math.max(bytes, 0)} B`;
}

/**
 * Below this, saying the size is noise: every update crosses it and no decision hangs on it.
 *
 * 300 KB is about what a routine bundle change costs, measured across the wave-5 releases. The
 * banner stays exactly as it was underneath.
 */
export const UPDATE_SIZE_WORTH_SAYING_BYTES = 300_000;

/**
 * 869f138pm. The same formatting, for the first-visit download.
 *
 * Shared deliberately: a reader who sees "2.3 MB" while the app first loads and "2.3 MB" when it
 * later updates is looking at the same file, and two spellings of one number would suggest
 * otherwise.
 */
export const formatDownloadSize = formatUpdateSize;

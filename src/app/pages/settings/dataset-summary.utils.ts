import { type DatasetManifest } from '../../core/models/optc.models';

/**
 * What the "App and data" card shows about the shipped dataset.
 *
 * Every field is already display-ready: the card renders it as-is, so a
 * manifest that arrives malformed is caught here rather than printing
 * "Invalid Date" or "NaN" at the player.
 */
export interface DatasetSummary {
  /** Upstream OPTC data revision the dataset was generated from. */
  readonly sourceVersion: string;
  /** ISO calendar date (YYYY-MM-DD) the dataset was generated on. */
  readonly generatedOn: string;
  readonly characterCount: number;
}

/**
 * `null` when the manifest cannot be trusted, so the card falls back to its
 * "unknown" label for the whole block. A half-filled card is worse than an
 * honest one: the number a player quotes in a bug report has to be real.
 */
export function buildDatasetSummary(
  manifest: DatasetManifest | null | undefined,
): DatasetSummary | null {
  if (!manifest) {
    return null;
  }

  const sourceVersion = String(manifest.sourceVersion ?? '').trim();
  const generatedOn = toIsoDate(manifest.generatedAt);
  const characterCount = Number(manifest.characterCount);

  if (!sourceVersion || !generatedOn || !Number.isInteger(characterCount) || characterCount < 0) {
    return null;
  }

  return { sourceVersion, generatedOn, characterCount };
}

/**
 * The date half of the manifest timestamp, in UTC.
 *
 * Deliberately not `toLocaleDateString`: the app runs in two languages and the
 * card is read back to us in bug reports, so the same dataset has to print the
 * same string for every reader, in every timezone.
 */
function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

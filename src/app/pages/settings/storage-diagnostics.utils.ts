import { type SyncScopeSummary } from '../../core/services/user-data-transfer.service';

/**
 * What is actually stored on this device, and how much room is left.
 *
 * 869f12x49. Settings already held the machinery to answer this -
 * `getSyncScopeSummary()` counts every scope, and `buildDatasetSummary()`
 * describes the shipped data - but the counts were only ever rendered on the
 * Account screen, beside Drive sync. A reader on Settings could not see what
 * their device was holding.
 *
 * The quota is the part that is not cosmetic. `browser-storage-error.utils.ts`
 * exists because this app has already had to handle a full or unavailable
 * store, which means a reader currently meets that condition as a FAILURE
 * rather than as a warning.
 */

export type StorageQuotaState =
  /** The browser gave real numbers. */
  | 'measured'
  /** The browser has the API but returned nothing usable. */
  | 'unavailable'
  /** No Storage Manager at all - older browsers, and some private modes. */
  | 'unsupported';

export interface StorageQuotaEstimate {
  state: StorageQuotaState;
  /** Bytes in use, or `null` when the browser would not say. */
  usageBytes: number | null;
  /** Bytes the origin may use, or `null`. */
  quotaBytes: number | null;
  /** 0-100, or `null`. Never inferred from a missing half. */
  usedPercent: number | null;
}

/**
 * Reads the browser's own estimate, degrading honestly.
 *
 * Three ways this can fail and all three are reported as themselves rather than
 * as a zero: no Storage Manager, a rejected promise, and a resolved estimate
 * with fields missing. A `0%` a reader cannot distinguish from "we do not know"
 * is worse than no number, because it invites them to keep saving.
 */
export async function readStorageQuotaEstimate(
  storageManager: StorageManager | undefined = globalThis.navigator?.storage,
): Promise<StorageQuotaEstimate> {
  const unknown = (state: StorageQuotaState): StorageQuotaEstimate => ({
    state,
    usageBytes: null,
    quotaBytes: null,
    usedPercent: null,
  });

  if (!storageManager || typeof storageManager.estimate !== 'function') {
    return unknown('unsupported');
  }

  let estimate: StorageEstimate;

  try {
    estimate = await storageManager.estimate();
  } catch {
    return unknown('unavailable');
  }

  const usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
  const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;

  if (usageBytes === null || quotaBytes === null || quotaBytes <= 0) {
    return { state: 'unavailable', usageBytes, quotaBytes, usedPercent: null };
  }

  return {
    state: 'measured',
    usageBytes,
    quotaBytes,
    usedPercent: Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10),
  };
}

/** Bytes as a reader would say them. Deliberately coarse - this is a rough gauge. */
export function formatStorageBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return '';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unitIndex]}`;
}

export interface StorageDiagnosticsPayload {
  schemaVersion: 1;
  source: 'storage-diagnostics';
  generatedAt: string;
  appVersion: string;
  dataset: { sourceVersion: string; generatedOn: string; characterCount: number } | null;
  counts: SyncScopeSummary;
  storage: StorageQuotaEstimate;
}

/**
 * A problem report that carries facts instead of a description.
 *
 * COUNTS ONLY. No team names, no character ids, no box contents, no account.
 * The point is to be safe to paste into an issue, and the way that promise gets
 * broken is by someone later adding "just the names" - so the payload is built
 * from the summary object, which holds numbers and nothing else, rather than
 * from the stored data itself.
 */
export function buildStorageDiagnosticsPayload(input: {
  appVersion: string;
  dataset: { sourceVersion: string; generatedOn: string; characterCount: number } | null;
  counts: SyncScopeSummary;
  storage: StorageQuotaEstimate;
  generatedAt?: string;
}): StorageDiagnosticsPayload {
  return {
    schemaVersion: 1,
    source: 'storage-diagnostics',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    appVersion: input.appVersion,
    dataset: input.dataset ? { ...input.dataset } : null,
    counts: { ...input.counts },
    storage: { ...input.storage },
  };
}

export function buildStorageDiagnosticsFilename(generatedAt: string): string {
  const match = generatedAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/u);

  if (!match) {
    return 'optc-diagnostics.json';
  }

  const [, year, month, day, hours, minutes, seconds] = match;

  return `optc-diagnostics-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
}

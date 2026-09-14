import { normalizeBoostedCharacterIds } from '../../core/services/user-state.service';

/**
 * 869f1q90b. The boosted-unit list in a backup file.
 *
 * Same envelope shape as every other transfer payload here - a version, a source and the data -
 * so the all-data export keeps one grammar rather than a special case for the one scope that
 * happens to be a list of numbers.
 */
export interface BoostedCharactersTransferPayload {
  schemaVersion: 1;
  source: 'boosted-characters';
  exportedAt: string;
  characterIds: number[];
}

export function buildBoostedCharactersTransferPayload(
  characterIds: readonly number[],
  exportedAt = new Date().toISOString(),
): BoostedCharactersTransferPayload {
  return {
    schemaVersion: 1,
    source: 'boosted-characters',
    exportedAt,
    characterIds: normalizeBoostedCharacterIds([...characterIds]),
  };
}

/**
 * Returns `null` for anything that is not this payload.
 *
 * A boost list quietly changes which characters the builder prefers, so a half-read one is worse
 * than none: the reader would see different teams and have nothing on screen to explain why.
 */
export function parseBoostedCharactersTransferPayload(
  value: unknown,
): BoostedCharactersTransferPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (record['schemaVersion'] !== 1 || record['source'] !== 'boosted-characters') {
    return null;
  }

  if (!Array.isArray(record['characterIds'])) {
    return null;
  }

  return {
    schemaVersion: 1,
    source: 'boosted-characters',
    exportedAt: typeof record['exportedAt'] === 'string' ? record['exportedAt'] : '',
    characterIds: normalizeBoostedCharacterIds(record['characterIds']),
  };
}

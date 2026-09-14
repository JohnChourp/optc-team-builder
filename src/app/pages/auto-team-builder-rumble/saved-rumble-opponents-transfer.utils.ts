import { type SavedRumbleOpponent } from '../../core/models/saved-rumble-opponent.models';

/**
 * Saved Rumble opponents as a transfer payload.
 *
 * 869f12x45. A new stored entity has to be in the full-data export from the
 * day it exists - 869f12x4p is what happens otherwise, where a category of the
 * reader's own work sat outside a "full backup" for months and nobody noticed
 * until somebody changed device.
 *
 * The shape is deliberately thin: ids and names, no settings and no results. An
 * opponent is a crew you expect to meet again, not a build.
 */
export interface SavedRumbleOpponentsTransferPayload {
  schemaVersion: 1;
  source: 'saved-rumble-opponents';
  exportedAt: string;
  opponents: SavedRumbleOpponent[];
}

export interface SavedRumbleOpponentsImportResult {
  opponents: SavedRumbleOpponent[];
  /** Later entries repeating an id already seen; dropped so an import cannot fork one. */
  duplicateIdCount: number;
  /** Entries that were not usable opponent records at all. */
  invalidOpponentCount: number;
}

export class SavedRumbleOpponentsImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'SavedRumbleOpponentsImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function buildSavedRumbleOpponentsTransferPayload(
  opponents: SavedRumbleOpponent[],
  exportedAt = new Date().toISOString(),
): SavedRumbleOpponentsTransferPayload {
  return {
    schemaVersion: 1,
    source: 'saved-rumble-opponents',
    exportedAt,
    opponents: opponents.map((opponent) => ({
      ...opponent,
      activeCharacterIds: [...opponent.activeCharacterIds],
      benchCharacterIds: [...opponent.benchCharacterIds],
    })),
  };
}

export function parseSavedRumbleOpponentsImportPayloadValue(
  parsedPayload: unknown,
): SavedRumbleOpponentsTransferPayload {
  if (!isRecord(parsedPayload)) {
    throw new SavedRumbleOpponentsImportError(
      'management.savedRumbleOpponents.errors.invalidPayload',
    );
  }

  if (
    parsedPayload['schemaVersion'] !== 1 ||
    parsedPayload['source'] !== 'saved-rumble-opponents'
  ) {
    throw new SavedRumbleOpponentsImportError(
      'management.savedRumbleOpponents.errors.unsupportedSchema',
    );
  }

  if (
    typeof parsedPayload['exportedAt'] !== 'string' ||
    !Array.isArray(parsedPayload['opponents'])
  ) {
    throw new SavedRumbleOpponentsImportError(
      'management.savedRumbleOpponents.errors.invalidPayload',
    );
  }

  return {
    schemaVersion: 1,
    source: 'saved-rumble-opponents',
    exportedAt: parsedPayload['exportedAt'],
    opponents: parsedPayload['opponents'] as SavedRumbleOpponent[],
  };
}

/**
 * Structural sanitation only.
 *
 * Field-level normalisation - trimming the name, rejecting an opponent with no
 * units, repairing timestamps - lives in `UserStateService`, which the import
 * calls per opponent. Re-implementing it here is how the two would drift.
 */
export function sanitizeSavedRumbleOpponentsImportPayload(
  payload: SavedRumbleOpponentsTransferPayload,
): SavedRumbleOpponentsImportResult {
  const opponents: SavedRumbleOpponent[] = [];
  const seenIds = new Set<string>();
  let duplicateIdCount = 0;
  let invalidOpponentCount = 0;

  for (const candidate of payload.opponents) {
    if (!isRecord(candidate) || typeof candidate['name'] !== 'string' || !candidate['name'].trim()) {
      invalidOpponentCount += 1;
      continue;
    }

    const candidateId = typeof candidate['id'] === 'string' ? candidate['id'] : '';

    if (candidateId && seenIds.has(candidateId)) {
      duplicateIdCount += 1;
      continue;
    }

    if (candidateId) {
      seenIds.add(candidateId);
    }

    opponents.push(candidate as unknown as SavedRumbleOpponent);
  }

  return { opponents, duplicateIdCount, invalidOpponentCount };
}

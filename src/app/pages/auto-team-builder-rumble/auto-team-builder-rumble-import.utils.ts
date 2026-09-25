import {
  RUMBLE_ACTIVE_SLOT_COUNT,
  RUMBLE_BENCH_SLOT_COUNT,
  type RumbleBuildInput,
  type RumbleTeamResult,
  type RumbleTeamSlot,
} from '../../core/models/auto-team-builder-rumble.models';
import {
  type SavedRumbleTeamResult,
  type SavedRumbleTeamSlot,
} from '../../core/models/saved-rumble-team.models';
import {
  type RumbleBuilderSettingsExportPayload,
  type RumbleTeamExportPayload,
  type RumbleTeamExportResult,
  type RumbleTeamExportSlot,
} from './auto-team-builder-rumble-export.utils';

export class RumbleBuilderImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'RumbleBuilderImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function cloneRumbleBuildInput(input: RumbleBuildInput): RumbleBuildInput {
  return {
    types: [...input.types],
    selectedClasses: [...input.selectedClasses],
    onlySelectedTypes: input.onlySelectedTypes,
    onlySelectedClasses: input.onlySelectedClasses,
    favoritesOnly: input.favoritesOnly,
    favoriteCharacterIds: [...input.favoriteCharacterIds],
    characterBoxId: input.characterBoxId ?? null,
    candidateCharacterIds: input.candidateCharacterIds
      ? [...input.candidateCharacterIds]
      : undefined,
    opponentSlots: [],
    buffFocus: input.buffFocus.map((preference) => ({ ...preference })),
    requireFullTeam: input.requireFullTeam,
  };
}

function parseJson(rawContent: string): unknown {
  try {
    return JSON.parse(rawContent) as unknown;
  } catch {
    throw new RumbleBuilderImportError('import.errors.invalidJson');
  }
}

export function parseRumbleBuilderSettingsImportPayload(
  rawContent: string,
): RumbleBuilderSettingsExportPayload {
  return parseRumbleBuilderSettingsImportPayloadValue(parseJson(rawContent));
}

function parseRumbleBuilderSettingsImportPayloadValue(
  parsedPayload: unknown,
): RumbleBuilderSettingsExportPayload {
  if (!isRecord(parsedPayload)) {
    throw new RumbleBuilderImportError('import.errors.invalidPayload');
  }

  if (
    parsedPayload['schemaVersion'] !== 2 ||
    parsedPayload['source'] !== 'auto-team-builder-rumble' ||
    parsedPayload['exportType'] !== 'settings'
  ) {
    throw new RumbleBuilderImportError('import.errors.unsupportedSchema');
  }

  if (typeof parsedPayload['exportedAt'] !== 'string' || !isRecord(parsedPayload['settings'])) {
    throw new RumbleBuilderImportError('import.errors.invalidPayload');
  }

  return parsedPayload as unknown as RumbleBuilderSettingsExportPayload;
}

export function parseRumbleTeamImportPayload(rawContent: string): RumbleTeamExportPayload {
  return parseRumbleTeamImportPayloadValue(parseJson(rawContent));
}

function parseRumbleTeamImportPayloadValue(parsedPayload: unknown): RumbleTeamExportPayload {
  if (!isRecord(parsedPayload)) {
    throw new RumbleBuilderImportError('import.errors.invalidPayload');
  }

  if (
    parsedPayload['schemaVersion'] !== 2 ||
    parsedPayload['source'] !== 'auto-team-builder-rumble' ||
    parsedPayload['exportType'] !== 'team'
  ) {
    throw new RumbleBuilderImportError('import.errors.unsupportedSchema');
  }

  if (typeof parsedPayload['exportedAt'] !== 'string' || !Array.isArray(parsedPayload['teams'])) {
    throw new RumbleBuilderImportError('import.errors.invalidPayload');
  }

  return parsedPayload as unknown as RumbleTeamExportPayload;
}

export function buildSavedRumbleTeamResultSnapshot(
  result: RumbleTeamResult,
): SavedRumbleTeamResult {
  return {
    activeSlots: result.activeSlots.map((slot) => buildSavedRumbleTeamSlotSnapshot(slot)),
    benchSlots: result.benchSlots.map((slot) => buildSavedRumbleTeamSlotSnapshot(slot)),
    candidateCount: result.candidateCount,
    classCoverage: [...result.classCoverage],
    droppedClasses: [...result.droppedClasses],
    droppedTypes: [...result.droppedTypes],
    input: cloneRumbleBuildInput(result.input),
    requestedClasses: [...result.requestedClasses],
    requestedTypes: [...result.requestedTypes],
    resolvedClasses: [...result.resolvedClasses],
    resolvedTypes: [...result.resolvedTypes],
    roleCoverage: [...result.roleCoverage],
    selectedCount: result.selectedCount,
    topFactors: [...result.topFactors],
    totalScore: result.totalScore,
    typeCoverage: [...result.typeCoverage],
  };
}

export function buildSavedRumbleTeamResultSnapshotsFromImportPayload(
  payload: RumbleTeamExportPayload,
): SavedRumbleTeamResult[] {
  const results = payload.teams
    .filter((result) => Array.isArray(result.team) && result.team.length > 0)
    .slice(0, 2)
    .map((result) => buildSavedRumbleTeamResultSnapshotFromExport(result));

  if (!results.length) {
    throw new RumbleBuilderImportError('import.errors.emptyTeam');
  }

  return results;
}

function buildSavedRumbleTeamResultSnapshotFromExport(
  result: RumbleTeamExportResult,
): SavedRumbleTeamResult {
  return {
    activeSlots: result.activeSlots
      .map((slot, index) => buildSavedRumbleTeamSlotSnapshotFromExport(slot, 'active', index))
      .filter((slot): slot is SavedRumbleTeamSlot => Boolean(slot)),
    benchSlots: result.benchSlots
      .map((slot, index) => buildSavedRumbleTeamSlotSnapshotFromExport(slot, 'bench', index))
      .filter((slot): slot is SavedRumbleTeamSlot => Boolean(slot)),
    candidateCount: result.candidateCount,
    classCoverage: [...result.classCoverage],
    droppedClasses: [...result.droppedClasses],
    droppedTypes: [...result.droppedTypes],
    input: cloneRumbleBuildInput(result.requestedInput),
    requestedClasses: [...result.requestedClasses],
    requestedTypes: [...result.requestedTypes],
    resolvedClasses: [...result.resolvedClasses],
    resolvedTypes: [...result.resolvedTypes],
    roleCoverage: [...result.roleCoverage],
    selectedCount: result.selectedCount,
    topFactors: [...result.topFactors],
    totalScore: result.totalScore,
    typeCoverage: [...result.typeCoverage],
  };
}

export function buildOpponentCharacterIdSlotsFromImportPayload(payload: RumbleTeamExportPayload): {
  active: Array<number | null>;
  bench: Array<number | null>;
  unknownSlotCount: number;
} {
  let unknownSlotCount = 0;
  const active = Array.from({ length: RUMBLE_ACTIVE_SLOT_COUNT }, () => null as number | null);
  const bench = Array.from({ length: RUMBLE_BENCH_SLOT_COUNT }, () => null as number | null);

  (payload.opponentTeam?.activeSlots ?? [])
    .slice(0, RUMBLE_ACTIVE_SLOT_COUNT)
    .forEach((slot, index) => {
      const characterId = normalizePositiveInteger(slot.unit?.character?.id);

      if (characterId) {
        active[resolveOpponentSeat(slot.position, index, active)] = characterId;
      } else {
        unknownSlotCount += 1;
      }
    });

  (payload.opponentTeam?.benchSlots ?? [])
    .slice(0, RUMBLE_BENCH_SLOT_COUNT)
    .forEach((slot, index) => {
      const characterId = normalizePositiveInteger(slot.unit?.character?.id);

      if (characterId) {
        bench[resolveOpponentSeat(slot.position, index, bench)] = characterId;
      } else {
        unknownSlotCount += 1;
      }
    });

  return { active, bench, unknownSlotCount };
}

/**
 * 869f6td6h. The seat an imported opponent unit goes back to: the board `position` the file
 * carries, when it is a seat on this row that is still free. A file from before positions were
 * written - or a hand-edited one naming a seat out of range or already taken - falls back to the
 * old reading, the unit's order in the list, and then to the first free seat. One is always free:
 * the lists are cut to the row's length, and each unit takes one seat.
 */
function resolveOpponentSeat(
  position: unknown,
  listIndex: number,
  seats: ReadonlyArray<number | null>,
): number {
  if (
    typeof position === 'number' &&
    Number.isInteger(position) &&
    position >= 0 &&
    position < seats.length &&
    seats[position] === null
  ) {
    return position;
  }

  return seats[listIndex] === null ? listIndex : seats.indexOf(null);
}

function buildSavedRumbleTeamSlotSnapshot(slot: RumbleTeamSlot): SavedRumbleTeamSlot {
  return {
    characterId: slot.unit.character.id,
    index: slot.index,
    reasonChips: [...slot.reasonChips],
    role: slot.role,
    score: slot.score,
  };
}

function buildSavedRumbleTeamSlotSnapshotFromExport(
  slot: RumbleTeamExportSlot,
  role: RumbleTeamSlot['role'],
  index: number,
): SavedRumbleTeamSlot | null {
  const characterId = normalizePositiveInteger(slot.unit?.character?.id);

  if (!characterId) {
    return null;
  }

  return {
    characterId,
    index,
    reasonChips: Array.isArray(slot.reasonChips) ? [...slot.reasonChips] : [],
    role,
    score: typeof slot.score === 'number' && Number.isFinite(slot.score) ? slot.score : 0,
  };
}

import { type SavedTeam } from '../models/optc.models';

export const SAVED_TEAM_SLOT_COUNT = 6;
export const SAVED_TEAM_NAME_MAX_LENGTH = 120;
export const SAVED_TEAM_NOTES_MAX_LENGTH = 4000;

export type SavedTeamValidationCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'NOTES_TOO_LONG'
  | 'SLOTS_INVALID_LENGTH'
  | 'SLOT_INVALID'
  | 'TEAM_EMPTY'
  | 'DUPLICATE_CHARACTER'
  | 'SHIP_ID_INVALID'
  | 'CHARACTER_UNKNOWN'
  | 'SHIP_UNKNOWN';

export type SavedTeamValidationSeverity = 'error' | 'warning';

export interface SavedTeamValidationIssue {
  code: SavedTeamValidationCode;
  severity: SavedTeamValidationSeverity;
  message: string;
  path?: string;
}

export interface SavedTeamValidationResult {
  valid: boolean;
  errors: SavedTeamValidationIssue[];
  warnings: SavedTeamValidationIssue[];
}

export interface SavedTeamValidationOptions {
  knownCharacterIds?: ReadonlySet<number>;
  knownShipIds?: ReadonlySet<number>;
  slotCount?: number;
  allowEmptyTeam?: boolean;
}

export type SavedTeamValidationInput = Partial<
  Pick<SavedTeam, 'name' | 'notes' | 'shipId' | 'slots'>
>;

export function validateSavedTeamInput(
  input: SavedTeamValidationInput,
  options: SavedTeamValidationOptions = {},
): SavedTeamValidationResult {
  const slotCount = options.slotCount ?? SAVED_TEAM_SLOT_COUNT;
  const errors: SavedTeamValidationIssue[] = [];
  const warnings: SavedTeamValidationIssue[] = [];
  const slots = input.slots;

  const trimmedName = typeof input.name === 'string' ? input.name.trim() : '';

  if (!trimmedName.length) {
    errors.push({
      code: 'NAME_REQUIRED',
      severity: 'error',
      message: 'Team name is required.',
      path: 'name',
    });
  } else if (trimmedName.length > SAVED_TEAM_NAME_MAX_LENGTH) {
    errors.push({
      code: 'NAME_TOO_LONG',
      severity: 'error',
      message: `Team name must be ${SAVED_TEAM_NAME_MAX_LENGTH} characters or fewer.`,
      path: 'name',
    });
  }

  if (typeof input.notes === 'string' && input.notes.length > SAVED_TEAM_NOTES_MAX_LENGTH) {
    errors.push({
      code: 'NOTES_TOO_LONG',
      severity: 'error',
      message: `Notes must be ${SAVED_TEAM_NOTES_MAX_LENGTH} characters or fewer.`,
      path: 'notes',
    });
  }

  if (!Array.isArray(slots)) {
    errors.push({
      code: 'SLOTS_INVALID_LENGTH',
      severity: 'error',
      message: `Team must have exactly ${slotCount} slots.`,
      path: 'slots',
    });

    return {
      valid: false,
      errors,
      warnings,
    };
  }

  if (slots.length !== slotCount) {
    errors.push({
      code: 'SLOTS_INVALID_LENGTH',
      severity: 'error',
      message: `Team must have exactly ${slotCount} slots.`,
      path: 'slots',
    });
  }

  const seenCharacterIds = new Set<number>();
  let filledSlotCount = 0;

  slots.forEach((value, index) => {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      errors.push({
        code: 'SLOT_INVALID',
        severity: 'error',
        message: `Slot ${index + 1} contains an invalid character reference.`,
        path: `slots[${index}]`,
      });
      return;
    }

    if (seenCharacterIds.has(value)) {
      errors.push({
        code: 'DUPLICATE_CHARACTER',
        severity: 'error',
        message: `Character ${value} appears more than once in the team.`,
        path: `slots[${index}]`,
      });
      return;
    }

    seenCharacterIds.add(value);
    filledSlotCount += 1;

    if (options.knownCharacterIds && !options.knownCharacterIds.has(value)) {
      warnings.push({
        code: 'CHARACTER_UNKNOWN',
        severity: 'warning',
        message: `Slot ${index + 1} references character ${value} which is not in the catalog.`,
        path: `slots[${index}]`,
      });
    }
  });

  if (!options.allowEmptyTeam && filledSlotCount === 0) {
    errors.push({
      code: 'TEAM_EMPTY',
      severity: 'error',
      message: 'Team must contain at least one character.',
      path: 'slots',
    });
  }

  if (input.shipId !== null && input.shipId !== undefined) {
    if (typeof input.shipId !== 'number' || !Number.isInteger(input.shipId) || input.shipId <= 0) {
      errors.push({
        code: 'SHIP_ID_INVALID',
        severity: 'error',
        message: 'Ship reference must be a positive integer.',
        path: 'shipId',
      });
    } else if (options.knownShipIds && !options.knownShipIds.has(input.shipId)) {
      warnings.push({
        code: 'SHIP_UNKNOWN',
        severity: 'warning',
        message: `Ship ${input.shipId} is not in the catalog.`,
        path: 'shipId',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateSavedTeam(
  team: SavedTeam,
  options: SavedTeamValidationOptions = {},
): SavedTeamValidationResult {
  return validateSavedTeamInput(team, options);
}

export interface SavedTeamCollectionValidationEntry {
  index: number;
  id: string | null;
  result: SavedTeamValidationResult;
}

export interface SavedTeamCollectionValidationResult {
  valid: boolean;
  entries: SavedTeamCollectionValidationEntry[];
  duplicateIds: string[];
}

export function validateSavedTeamCollection(
  teams: readonly SavedTeam[],
  options: SavedTeamValidationOptions = {},
): SavedTeamCollectionValidationResult {
  const entries: SavedTeamCollectionValidationEntry[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();

  teams.forEach((team, index) => {
    const id = typeof team.id === 'string' && team.id.trim().length ? team.id.trim() : null;

    if (id) {
      if (seenIds.has(id)) {
        duplicateIds.add(id);
      } else {
        seenIds.add(id);
      }
    }

    entries.push({
      index,
      id,
      result: validateSavedTeamInput(team, options),
    });
  });

  return {
    valid: entries.every((entry) => entry.result.valid) && duplicateIds.size === 0,
    entries,
    duplicateIds: [...duplicateIds],
  };
}

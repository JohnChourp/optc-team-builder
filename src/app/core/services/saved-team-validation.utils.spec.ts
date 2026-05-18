import { describe, expect, it } from 'vitest';

import { type SavedTeam } from '../models/optc.models';
import {
  SAVED_TEAM_NAME_MAX_LENGTH,
  SAVED_TEAM_NOTES_MAX_LENGTH,
  validateSavedTeam,
  validateSavedTeamCollection,
  validateSavedTeamInput,
} from './saved-team-validation.utils';

function createTeam(overrides: Partial<SavedTeam> = {}): SavedTeam {
  return {
    id: 'team-1',
    name: 'Whitebeard Pirates',
    notes: '',
    shipId: 1,
    slots: [1001, 1002, 1003, 1004, 1005, 1006],
    createdAt: '2026-05-18T10:00:00.000Z',
    updatedAt: '2026-05-18T10:00:00.000Z',
    ...overrides,
  };
}

describe('validateSavedTeamInput', () => {
  it('returns valid when a team has a name and at least one filled slot', () => {
    const result = validateSavedTeamInput({
      name: 'Strawhat Pirates',
      notes: '',
      shipId: null,
      slots: [1001, null, null, null, null, null],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('requires a non-empty team name', () => {
    const result = validateSavedTeamInput({
      name: '   ',
      slots: [1001, null, null, null, null, null],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('NAME_REQUIRED');
  });

  it('rejects names longer than the configured limit', () => {
    const result = validateSavedTeamInput({
      name: 'a'.repeat(SAVED_TEAM_NAME_MAX_LENGTH + 1),
      slots: [1001, null, null, null, null, null],
    });

    expect(result.errors.some((issue) => issue.code === 'NAME_TOO_LONG')).toBe(true);
  });

  it('rejects notes longer than the configured limit', () => {
    const result = validateSavedTeamInput({
      name: 'Crew',
      notes: 'x'.repeat(SAVED_TEAM_NOTES_MAX_LENGTH + 1),
      slots: [1001, null, null, null, null, null],
    });

    expect(result.errors.some((issue) => issue.code === 'NOTES_TOO_LONG')).toBe(true);
  });

  it('flags duplicate character IDs across slots', () => {
    const result = validateSavedTeamInput({
      name: 'Crew',
      slots: [1001, 1002, 1001, null, null, null],
    });

    expect(result.errors.some((issue) => issue.code === 'DUPLICATE_CHARACTER')).toBe(true);
  });

  it('flags fully empty teams unless allowEmptyTeam is set', () => {
    const empty = validateSavedTeamInput({
      name: 'Crew',
      slots: [null, null, null, null, null, null],
    });

    expect(empty.errors.some((issue) => issue.code === 'TEAM_EMPTY')).toBe(true);

    const allowed = validateSavedTeamInput(
      {
        name: 'Crew',
        slots: [null, null, null, null, null, null],
      },
      { allowEmptyTeam: true },
    );

    expect(allowed.errors.some((issue) => issue.code === 'TEAM_EMPTY')).toBe(false);
    expect(allowed.valid).toBe(true);
  });

  it('rejects invalid slot count', () => {
    const result = validateSavedTeamInput({
      name: 'Crew',
      slots: [1001, null] as unknown as Array<number | null>,
    });

    expect(result.errors.some((issue) => issue.code === 'SLOTS_INVALID_LENGTH')).toBe(true);
  });

  it('rejects non-positive shipId values', () => {
    const result = validateSavedTeamInput({
      name: 'Crew',
      shipId: -5,
      slots: [1001, null, null, null, null, null],
    });

    expect(result.errors.some((issue) => issue.code === 'SHIP_ID_INVALID')).toBe(true);
  });

  it('warns when character or ship references are not in the supplied catalog', () => {
    const result = validateSavedTeamInput(
      {
        name: 'Crew',
        shipId: 99,
        slots: [1001, 1002, null, null, null, null],
      },
      {
        knownCharacterIds: new Set([1001]),
        knownShipIds: new Set([1]),
      },
    );

    expect(result.valid).toBe(true);
    expect(result.warnings.some((issue) => issue.code === 'CHARACTER_UNKNOWN')).toBe(true);
    expect(result.warnings.some((issue) => issue.code === 'SHIP_UNKNOWN')).toBe(true);
  });
});

describe('validateSavedTeam', () => {
  it('runs the same rules on a normalized SavedTeam', () => {
    const team = createTeam();
    const result = validateSavedTeam(team);

    expect(result.valid).toBe(true);
  });
});

describe('validateSavedTeamCollection', () => {
  it('reports duplicate ids and aggregates per-team validation', () => {
    const teams = [
      createTeam({ id: 'a', slots: [1, 2, 3, 4, 5, 6] }),
      createTeam({ id: 'a', slots: [7, 8, 9, 10, 11, 12] }),
      createTeam({ id: 'b', name: '', slots: [13, null, null, null, null, null] }),
    ];
    const result = validateSavedTeamCollection(teams);

    expect(result.duplicateIds).toEqual(['a']);
    expect(result.entries.map((entry) => entry.result.valid)).toEqual([true, true, false]);
    expect(result.valid).toBe(false);
  });
});

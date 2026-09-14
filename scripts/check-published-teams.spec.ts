import { describe, expect, it } from 'vitest';

import {
  formatResult,
  MINIMUM_RATIONALE_LENGTH,
  parsePublishedTeams,
  readCharacterIds,
  readConflictKeys,
  SUB_SLOT_INDEXES,
  validatePublishedTeams,
} from './check-published-teams.mjs';
import { stageKey } from './check-content-ladder.mjs';

const REAL_RATIONALE =
  'All six carry the Free Spirit class at 5 stars or above, so this is what a single-class crew looks like out of the shipped dataset. Not a submitted team, and it claims no clear.';

const STAGES = new Set([stageKey('Raid', 'Clash!! Buster Call')]);
const CHARACTER_IDS = new Set([1, 2, 3, 4, 5, 6, 7]);
const CONFLICTS = new Map<number, string[]>([
  [1, ['monkey d. luffy', 'luffy']],
  [2, ['monkey d. luffy', 'luffy']],
  [3, ['nami']],
  [4, ['zoro']],
  [5, ['sanji']],
  [6, ['usopp']],
  [7, ['chopper']],
]);

function team(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'free-spirit-crew',
    group: 'Raid',
    stage: 'Clash!! Buster Call',
    slots: [1, 3, 4, 5, 6, 7],
    rationale: REAL_RATIONALE,
    curatedOn: '2026-09-14',
    workedExample: true,
    ...overrides,
  };
}

function check(entries: Record<string, unknown>[]) {
  return validatePublishedTeams({
    entries,
    found: true,
    stages: STAGES,
    characterIds: CHARACTER_IDS,
    conflictKeys: CONFLICTS,
    today: new Date('2026-09-14T12:00:00Z'),
  });
}

describe('published teams guard', () => {
  it('accepts a team of real characters against a real stage', () => {
    expect(check([team()]).ok).toBe(true);
  });

  it('MUTATION - a character the dataset no longer carries goes red', () => {
    const result = check([team({ slots: [1, 3, 4, 5, 6, 999] })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('which the dataset no longer carries');
  });

  it('MUTATION - a stage the dataset does not carry goes red', () => {
    const result = check([team({ stage: 'Clash!! Buster Call Reloaded' })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('which the dataset does not carry');
  });

  /*
   * The conflict rule the dataset encodes: keys are name-derived, so two cards of one character
   * cannot both sit in the SUB slots. Characters 1 and 2 are two Luffys here.
   */
  it('MUTATION - two subs sharing a conflict key go red', () => {
    const result = check([team({ slots: [3, 4, 1, 2, 5, 6] })]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('share the conflict key'))).toBe(true);
  });

  it('rejects the same character in two sub slots', () => {
    const result = check([team({ slots: [3, 4, 1, 1, 5, 6] })]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('in two sub slots'))).toBe(true);
  });

  /*
   * The exception that matters, and the one a naive conflict check gets wrong. The Friend Captain
   * is borrowed from another player, so the same character may legally hold BOTH leader seats -
   * owner-confirmed 2026-09-03. A guard that rejected this would reject a legal team.
   */
  it('leaves the two leader seats alone, where the same character is legal twice', () => {
    expect(check([team({ slots: [1, 1, 3, 4, 5, 6] })]).ok).toBe(true);
    expect(check([team({ slots: [1, 2, 3, 4, 5, 6] })]).ok).toBe(true);
  });

  it('only ever looks at slots 2 to 5', () => {
    expect(SUB_SLOT_INDEXES).toEqual([2, 3, 4, 5]);
  });

  it('MUTATION - an entry that stops saying it is a worked example goes red', () => {
    const result = check([team({ workedExample: false })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('implies a record nobody wrote');
  });

  it('rejects a placeholder rationale', () => {
    const result = check([team({ rationale: 'Good team' })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('no real rationale');
    expect('Good team'.length).toBeLessThan(MINIMUM_RATIONALE_LENGTH);
  });

  it.each([
    ['five slots', [1, 3, 4, 5, 6]],
    ['seven slots', [1, 3, 4, 5, 6, 7, 2]],
  ])('rejects %s', (_label, slots) => {
    const result = check([team({ slots })]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('does not have 6 slots'))).toBe(true);
  });

  it('allows an empty slot, because a team does not require a Friend Captain', () => {
    expect(check([team({ slots: [1, null, 3, 4, 5, 6] })]).ok).toBe(true);
  });

  it('rejects a repeated team id and a future date', () => {
    expect(check([team(), team()]).errors.some((e) => e.includes('repeats an id'))).toBe(true);
    expect(
      check([team({ curatedOn: '2027-01-01' })]).errors.some((e) => e.includes('in the future')),
    ).toBe(true);
  });

  it('rejects a file with no PUBLISHED_TEAMS at all', () => {
    const result = validatePublishedTeams({
      entries: [],
      found: false,
      stages: STAGES,
      characterIds: CHARACTER_IDS,
      conflictKeys: CONFLICTS,
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('no PUBLISHED_TEAMS array found');
  });

  describe('reading the seed', () => {
    it('pulls character ids out of an insert', () => {
      const sql = "INSERT INTO characters (id, name) VALUES (\n  4618, 'Someone');";

      expect(readCharacterIds({ sql })).toEqual(new Set([4618]));
    });

    it('pulls party conflict keys out of a detail row', () => {
      const sql =
        'INSERT INTO character_details (character_id, detail_json)\n' +
        `        VALUES (1, '{"partyConflictKeys":["monkey d. luffy","luffy"]}');`;

      expect(readConflictKeys({ sql }).get(1)).toEqual(['monkey d. luffy', 'luffy']);
    });

    it('reads slot arrays and a shared curatedOn constant out of the source', () => {
      const source = [
        "const CURATED_ON = '2026-09-14';",
        'export const PUBLISHED_TEAMS = [',
        "  { id: 'a', group: 'Raid', stage: 'Clash!! Buster Call', slots: [1, null, 3, 4, 5, 6],",
        `    rationale: '${REAL_RATIONALE}', curatedOn: CURATED_ON, workedExample: true },`,
        '];',
      ].join('\n');
      const { entries, found } = parsePublishedTeams({ source });

      expect(found).toBe(true);
      expect(entries[0].slots).toEqual([1, null, 3, 4, 5, 6]);
      expect(entries[0].curatedOn).toBe('2026-09-14');
      expect(check(entries as Record<string, unknown>[]).ok).toBe(true);
    });
  });

  it('says how many characters it checked against', () => {
    expect(formatResult({ ok: true, entryCount: 2, errors: [] }, 4618)).toContain('4618 characters');
  });
});

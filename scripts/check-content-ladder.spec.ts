import { describe, expect, it } from 'vitest';

import {
  formatResult,
  MINIMUM_NOTE_LENGTH,
  parseContentLadder,
  readDatasetStages,
  stageKey,
  validateContentLadder,
} from './check-content-ladder.mjs';

const REAL_NOTE =
  'Third island in story order. Team size only, which is a fact about the box rather than a claim about difficulty.';

function stages(pairs: [string, string][]): Set<string> {
  return new Set(pairs.map(([group, stage]) => stageKey(group, stage)));
}

function milestone(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'story-syrup-village',
    group: 'Story Island',
    stage: 'Syrup Village',
    requirement: { teamSize: 4 },
    curatedOn: '2026-09-14',
    sourceNote: REAL_NOTE,
    ...overrides,
  };
}

function check(entries: Record<string, unknown>[], known = stages([['Story Island', 'Syrup Village']])) {
  return validateContentLadder({
    entries,
    found: true,
    stages: known,
    today: new Date('2026-09-14T12:00:00Z'),
  });
}

describe('content ladder guard', () => {
  it('accepts a milestone that names a real stage, is dated and says where it came from', () => {
    expect(check([milestone()]).ok).toBe(true);
  });

  /*
   * The whole reason this guard exists. A stage renamed upstream keeps reading as a real goal and
   * nothing tells anyone - which is exactly the "unmaintainable ladder is worse than none"
   * objection 869f12xb1 raised.
   */
  it('MUTATION - a stage the dataset does not carry goes red', () => {
    const result = check([milestone({ stage: 'Syrup Village Reloaded' })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('which the dataset does not carry');
  });

  it('matches on the group as well, so a real stage under the wrong group still goes red', () => {
    const result = check([milestone({ group: 'Coliseum' })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Coliseum / Syrup Village');
  });

  it('MUTATION - a provisional entry whose note hides it goes red', () => {
    const result = check([milestone({ provisional: true })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('provisional but its note does not say so');
  });

  it('accepts a provisional entry that says so', () => {
    expect(
      check([milestone({ provisional: true, sourceNote: `${REAL_NOTE} PROVISIONAL.` })]).ok,
    ).toBe(true);
  });

  /*
   * 869f1t8wv. The inverse, added when the owner confirmed the first four floors. Flipping the
   * flag and leaving the note is a half-done edit that reads on screen as a warning the entry no
   * longer carries, and nothing else would have caught it.
   */
  it('MUTATION - a confirmed entry whose note still says provisional goes red', () => {
    const result = check([milestone({ sourceNote: `${REAL_NOTE} PROVISIONAL.` })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('no longer provisional but its note still says so');
  });

  it('rejects an entry claiming both provisional and confirmedOn', () => {
    const result = check([
      milestone({
        provisional: true,
        confirmedOn: '2026-09-14',
        sourceNote: `${REAL_NOTE} PROVISIONAL.`,
      }),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('claims both provisional and confirmedOn'))).toBe(
      true,
    );
  });

  it('accepts an owner-confirmed entry', () => {
    expect(
      check([
        milestone({
          confirmedOn: '2026-09-14',
          sourceNote: `${REAL_NOTE} Owner-confirmed on 2026-09-14.`,
        }),
      ]).ok,
    ).toBe(true);
  });

  it.each([
    ['a confirmation that is not an ISO date', '14/09/2026', 'not an ISO date'],
    ['a confirmation in the future', '2027-01-01', 'confirmed in the future'],
  ])('rejects %s', (_label, confirmedOn, expected) => {
    const result = check([milestone({ confirmedOn })]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes(expected))).toBe(true);
  });

  /*
   * 869f1t8wv. A confirmation older than the numbers it covers. Revising a requirement and moving
   * `curatedOn` without going back to the owner leaves an entry that shows no warning for a number
   * nobody confirmed - the same defect as a stale "provisional" note, in the other direction.
   */
  it('MUTATION - rejects a confirmation older than the curation it covers', () => {
    const result = check([
      milestone({
        curatedOn: '2026-09-14',
        confirmedOn: '2026-09-10',
        sourceNote: `${REAL_NOTE} Owner-confirmed on 2026-09-10.`,
      }),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('older than the numbers it covers');
  });

  it.each([
    ['confirmed the same day it was curated', '2026-09-13'],
    ['confirmed after it was curated', '2026-09-14'],
  ])('accepts an entry %s', (_label, confirmedOn) => {
    expect(
      check([
        milestone({
          curatedOn: '2026-09-13',
          confirmedOn,
          sourceNote: `${REAL_NOTE} Owner-confirmed on ${confirmedOn}.`,
        }),
      ]).ok,
    ).toBe(true);
  });

  it('rejects a placeholder note', () => {
    const result = check([milestone({ sourceNote: 'TODO' })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('no real sourceNote');
    expect('TODO'.length).toBeLessThan(MINIMUM_NOTE_LENGTH);
  });

  it('rejects a repeated id, because the reachability list is keyed by it', () => {
    const result = check([milestone(), milestone()]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('repeats an id'))).toBe(true);
  });

  it.each([
    ['no date', { curatedOn: undefined }],
    ['a date that is not ISO', { curatedOn: '14/09/2026' }],
  ])('rejects %s', (_label, overrides) => {
    const result = check([milestone(overrides)]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('curatedOn');
  });

  /* A future date would let a stale entry look freshly reviewed forever. */
  it('rejects a date in the future', () => {
    const result = check([milestone({ curatedOn: '2027-01-01' })]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('curated in the future');
  });

  it.each([
    ['a team of seven', { teamSize: 7 }],
    ['a team of none', { teamSize: 0 }],
    ['a fractional team', { teamSize: 2.5 }],
  ])('rejects %s', (_label, requirement) => {
    const result = check([milestone({ requirement })]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('A team is 1 to 6 slots'))).toBe(true);
  });

  it('rejects a rarity floor asking for more members than a team has', () => {
    const result = check([
      milestone({ requirement: { teamSize: 6, minStars: { stars: 5, count: 7 } } }),
    ]);

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('outside 1 to 6'))).toBe(true);
  });

  it('rejects an empty ladder rather than passing it silently', () => {
    const result = check([]);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('the ladder is empty');
  });

  it('rejects a file with no CONTENT_LADDER at all', () => {
    const result = validateContentLadder({ entries: [], found: false, stages: new Set() });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('no CONTENT_LADDER array found');
  });

  describe('reading the sources', () => {
    it('pulls group/stage pairs out of a character_drops insert', () => {
      const sql =
        "INSERT INTO character_drops (character_id, sources_json)\n" +
        `        VALUES (1, '[{"group":"Fortnight","stage":"Smoker''s Great Pursuit","dropId":"e9","slot":"1","global":true}]');`;

      expect(readDatasetStages({ sql })).toEqual(
        stages([['Fortnight', "Smoker's Great Pursuit"]]),
      );
    });

    it('keys pairs so a stage name containing punctuation cannot collide', () => {
      expect(stageKey('A', 'B')).not.toBe(stageKey('A"B', ''));
    });

    it('resolves a curatedOn that is a shared constant, not a literal', () => {
      const source = [
        "const CURATED_ON = '2026-09-14';",
        'export const CONTENT_LADDER = [',
        "  { id: 'a', group: 'Story Island', stage: 'Syrup Village', requirement: { teamSize: 4 },",
        `    curatedOn: CURATED_ON, sourceNote: '${REAL_NOTE}' },`,
        '];',
      ].join('\n');
      const { entries, found } = parseContentLadder({ source });

      expect(found).toBe(true);
      expect(entries[0].curatedOn).toBe('2026-09-14');
      expect(check(entries as Record<string, unknown>[]).ok).toBe(true);
    });
  });

  it('says how many stages it checked against, so a broken read is visible', () => {
    expect(formatResult({ ok: true, entryCount: 7, errors: [] }, 787)).toContain('787 known');
  });
});

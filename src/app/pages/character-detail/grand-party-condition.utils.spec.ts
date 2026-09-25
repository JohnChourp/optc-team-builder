import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  readGrandPartyConditions,
  type GrandPartyConditionReading,
} from './grand-party-condition.utils';

/*
 * 869f63gz7. A Grand Party Burst Condition, read into the sentence it stands for.
 *
 * The first half enumerates every condition shape the shipped seed carried on 2026-09-25 - each
 * type, with each team, comparator, attack, debuff and action it was written with - as literals, so
 * a release that stops carrying one cannot take a test with it. The second half runs the reader over
 * whatever the seed carries now and holds what must stay true of any shape.
 */

describe('readGrandPartyConditions over the condition shapes of the shipped seed', () => {
  const shapes: ReadonlyArray<{ condition: Record<string, unknown>; reading: GrandPartyConditionReading }> = [
    // The commonest shape - 391 of the 511 units on 2026-09-25 - written in two key orders.
    { condition: { count: 2, type: 'defeat', team: 'crew' }, reading: { key: 'defeatCrew', count: 2, names: {} } },
    { condition: { type: 'defeat', team: 'crew', count: 2 }, reading: { key: 'defeatCrew', count: 2, names: {} } },
    { condition: { count: 5, type: 'defeat', team: 'enemies' }, reading: { key: 'defeatEnemies', count: 5, names: {} } },
    { condition: { count: 7, type: 'special', team: 'crew' }, reading: { key: 'specialCrew', count: 7, names: {} } },
    { condition: { type: 'special', team: 'enemies', count: 6 }, reading: { key: 'specialEnemies', count: 6, names: {} } },
    // Two units write the enemy side as `enemy`.
    { condition: { count: 6, team: 'enemy', type: 'special' }, reading: { key: 'specialEnemies', count: 6, names: {} } },
    { condition: { count: 50, type: 'time', comparator: 'after' }, reading: { key: 'timeAfter', count: 50, names: {} } },
    // No comparator: upstream's own renderer reads it "At Exactly N seconds".
    { condition: { type: 'time', count: 20 }, reading: { key: 'timeExactly', count: 20, names: {} } },
    { condition: { count: 25, type: 'damage' }, reading: { key: 'damageTimes', count: 25, names: {} } },
    { condition: { count: 55000, type: 'dmgdealt' }, reading: { key: 'damageDealt', count: 55000, names: {} } },
    { condition: { count: 55000, type: 'dmgreceived' }, reading: { key: 'damageTaken', count: 55000, names: {} } },
    { condition: { count: 20, type: 'hitreceived' }, reading: { key: 'hitsTaken', count: 20, names: {} } },
    { condition: { count: 6, type: 'dbfreceived' }, reading: { key: 'debuffsTaken', count: 6, names: {} } },
    { condition: { count: 5, type: 'attack', attack: 'Power' }, reading: { key: 'attacksLanded', count: 5, names: { attack: 'Power' } } },
    { condition: { count: 5, type: 'attack', attack: 'Full' }, reading: { key: 'attacksLanded', count: 5, names: { attack: 'Full' } } },
    { condition: { type: 'attack', attack: 'Normal', count: 7 }, reading: { key: 'attacksLanded', count: 7, names: { attack: 'Normal' } } },
    { condition: { count: 15, type: 'attack', attack: 'non-Special' }, reading: { key: 'attacksLanded', count: 15, names: { attack: 'non-Special' } } },
    { condition: { count: 8, type: 'debuff', attribute: 'Critical Hit' }, reading: { key: 'debuffLanded', count: 8, names: { attribute: 'Critical Hit' } } },
    { condition: { count: 4, attribute: 'Blow Away', type: 'debuff' }, reading: { key: 'debuffLanded', count: 4, names: { attribute: 'Blow Away' } } },
    { condition: { count: 7, attribute: 'Status Effect', type: 'debuff' }, reading: { key: 'debuffLanded', count: 7, names: { attribute: 'Status Effect' } } },
    { condition: { count: 10, type: 'action', action: 'heal' }, reading: { key: 'actions', count: 10, names: { action: 'heal' } } },
    { condition: { type: 'action', count: 5, action: 'guard' }, reading: { key: 'actions', count: 5, names: { action: 'guard' } } },
  ];

  it('covers all eleven condition types', () => {
    expect(new Set(shapes.map(({ condition }) => condition['type'])).size).toBe(11);
  });

  it.each(shapes)('reads $condition', ({ condition, reading }) => {
    expect(readGrandPartyConditions([condition])).toEqual([reading]);
  });
});

describe('readGrandPartyConditions when it does not know a shape', () => {
  it.each([
    ['a type it does not list', { count: 3, type: 'healreceived' }],
    ['a team it does not know', { count: 2, type: 'defeat', team: 'allies' }],
    ['a defeat with no team', { count: 2, type: 'defeat' }],
    ['a comparator it does not know', { count: 30, type: 'time', comparator: 'before' }],
    ['a key its type does not use', { count: 2, type: 'defeat', team: 'crew', families: ['Straw Hat Crew'] }],
    ['no count', { type: 'hitreceived' }],
    ['a count of zero', { count: 0, type: 'hitreceived' }],
    ['a count that is text', { count: '20', type: 'hitreceived' }],
    ['a blank attack', { count: 5, type: 'attack', attack: ' ' }],
    ['an attack that is not text', { count: 5, type: 'attack', attack: 3 }],
    ['no type at all', { count: 5 }],
    ['a value that is not a record', 'after 2 crew members'],
  ])('hands %s back unread, for the screen to show as it is', (_label, condition) => {
    expect(readGrandPartyConditions([condition])).toEqual([{ key: null, value: condition }]);
  });

  it('reads a lone condition, and several as several - no joining word invented', () => {
    expect(readGrandPartyConditions({ count: 20, type: 'hitreceived' })).toEqual([
      { key: 'hitsTaken', count: 20, names: {} },
    ]);
    expect(
      readGrandPartyConditions([
        { count: 2, type: 'defeat', team: 'crew' },
        { count: 50, type: 'time', comparator: 'after' },
      ]).map((reading) => reading.key),
    ).toEqual(['defeatCrew', 'timeAfter']);
  });

  it('reads nothing where there is no condition', () => {
    expect(readGrandPartyConditions(null)).toEqual([]);
    expect(readGrandPartyConditions(undefined)).toEqual([]);
    expect(readGrandPartyConditions([])).toEqual([]);
  });
});

/** Every `gpcondition` in the committed seed, as the importer wrote it. */
function readSeedConditions(): unknown[] {
  const sql = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const conditions: unknown[] = [];

  for (const match of sql.matchAll(
    /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu,
  )) {
    const detail = JSON.parse(match[2]!.replace(/''/gu, "'")) as {
      rumbleData?: Record<string, unknown> | null;
    };
    const condition = detail.rumbleData?.['gpcondition'];

    if (condition !== undefined && condition !== null) {
      conditions.push(condition);
    }
  }

  return conditions;
}

describe('readGrandPartyConditions over every condition the shipped seed carries', () => {
  const conditions = readSeedConditions();

  it('has conditions to read', () => {
    expect(conditions.length).toBeGreaterThan(0);
  });

  it('gives one reading per condition, and loses none', () => {
    for (const condition of conditions) {
      expect(readGrandPartyConditions(condition)).toHaveLength(
        Array.isArray(condition) ? condition.length : 1,
      );
    }
  });

  it('keeps each count as the dataset wrote it, and hands back whatever it cannot read whole', () => {
    for (const condition of conditions) {
      const written = Array.isArray(condition) ? condition : [condition];

      readGrandPartyConditions(condition).forEach((reading, index) => {
        const source = written[index] as Record<string, unknown>;

        if (reading.key === null) {
          expect(reading.value).toBe(source);
        } else {
          expect(reading.count).toBe(source['count']);
        }
      });
    }
  });
});

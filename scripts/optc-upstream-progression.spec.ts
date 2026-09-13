import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  attachProgressionData,
  normalizeDropSources,
  normalizeEvolutions,
  normalizeSpecialCooldowns,
  PROGRESSION_UPSTREAM_SOURCES,
} from './lib/optc-upstream-progression.mjs';

/*
 * 869f1935z. Two traps in these files cost real measurements before the parser existed, and both
 * are driven here as mutations rather than described:
 *
 *  1. a drop slot is identified by its VALUE, never by its key. `gamewith` sits beside the slots
 *     and is an array of GameWith ARTICLE ids - a key-shape heuristic swallows them and invents
 *     drop sources for characters that have none;
 *  2. an evolver is not always a character. `"ink"` and `'skullQCK'` are materials a player farms;
 *     filtering to integers loses them and reports an evolution as cheaper than it is.
 */

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('normalizeSpecialCooldowns', () => {
  it('reads the max/min pair', () => {
    expect(normalizeSpecialCooldowns({ '1': [3, 2], '2': [12, 9] }).get(2)).toEqual({
      max: 12,
      min: 9,
    });
  });

  it('skips anything that is not a pair of positive integers, rather than guessing', () => {
    const cooldowns = normalizeSpecialCooldowns({ '1': [3], '2': 'nope', '3': [0, 5], '4': [8, 4] });

    expect([...cooldowns.keys()]).toEqual([4]);
  });
});

describe('normalizeEvolutions', () => {
  it('reads a single evolution and its materials', () => {
    expect(normalizeEvolutions({ '1': { evolution: 2, evolvers: [78] } }).forward.get(1)).toEqual([
      { toId: 2, materials: [{ characterId: 78, token: null }] },
    ]);
  });

  it('keeps branches and their materials paired', () => {
    const { forward } = normalizeEvolutions({
      '5': { evolution: [6, 7], evolvers: [[115, 80], [116, 97]] },
    });

    expect(forward.get(5)).toEqual([
      {
        toId: 6,
        materials: [
          { characterId: 115, token: null },
          { characterId: 80, token: null },
        ],
      },
      {
        toId: 7,
        materials: [
          { characterId: 116, token: null },
          { characterId: 97, token: null },
        ],
      },
    ]);
  });

  it('MUTATION - a non-numeric evolver is KEPT as a material, not dropped', () => {
    // `"ink"` and the skulls are farmed. An evolution that omits them reads as free.
    const { forward } = normalizeEvolutions({
      '10': { evolution: 11, evolvers: [78, 'ink', 'skullQCK'] },
    });

    expect(forward.get(10)?.[0]?.materials).toEqual([
      { characterId: 78, token: null },
      { characterId: null, token: 'ink' },
      { characterId: null, token: 'skullQCK' },
    ]);
  });

  it('builds the reverse edge, which is the direction a player asks in', () => {
    const { reverse } = normalizeEvolutions({
      '1': { evolution: 2, evolvers: [78] },
      '5': { evolution: [6, 2], evolvers: [[1], [2]] },
    });

    expect(reverse.get(2)).toEqual([1, 5]);
  });
});

describe('normalizeDropSources', () => {
  const STAGE = {
    name: 'Fushia Village',
    dropID: 'story1',
    thumb: 28,
    global: true,
    nakama: 1002800,
    completion: '5x Rainbow Gems',
    gamewith: [3417, 9999],
    '1': [119, 120],
    'All Bosses': [27],
  };

  it('reads every slot, whatever its key is called', () => {
    const sources = normalizeDropSources({ 'Story Island': [STAGE] });

    expect(sources.get(119)).toEqual([
      { group: 'Story Island', stage: 'Fushia Village', dropId: 'story1', slot: '1', global: true },
    ]);
    expect(sources.get(27)?.[0]?.slot).toBe('All Bosses');
  });

  it('MUTATION - gamewith article ids never become drop sources', () => {
    /*
     * The trap. `gamewith` is a numeric array sitting beside the slots, so "any array of numbers is
     * a slot" invents sources. Measured on the real file, a key-blind sweep reported 2,375 dropped
     * characters against the correct 1,620.
     */
    const sources = normalizeDropSources({ 'Story Island': [STAGE] });

    expect(sources.has(3417)).toBe(false);
    expect(sources.has(9999)).toBe(false);
    expect([...sources.keys()].sort((left, right) => left - right)).toEqual([27, 119, 120]);
  });

  it('records a character that drops in several places once per place', () => {
    const sources = normalizeDropSources({
      Raid: [
        { name: 'A', dropID: 'a', '1': [50] },
        { name: 'B', dropID: 'b', '3': [50] },
      ],
    });

    expect(sources.get(50)?.map((source) => source.stage)).toEqual(['A', 'B']);
  });
});

describe('attachProgressionData', () => {
  it('leaves a character the upstream graph never mentions with empty, not missing, data', () => {
    // "Nothing recorded" and "not farmable" are different answers, and only one of them is true.
    const [character] = attachProgressionData([{ id: 999 }], {
      cooldowns: new Map(),
      evolutions: { forward: new Map(), reverse: new Map() },
      dropSources: new Map(),
    });

    expect(character).toMatchObject({
      specialCooldownMax: null,
      specialCooldownMin: null,
      evolvesTo: [],
      evolvesFrom: [],
      dropSources: [],
    });
  });
});

describe('PROGRESSION_UPSTREAM_SOURCES', () => {
  it('names only fields this module really writes', () => {
    const source = readSource('scripts/lib/optc-upstream-progression.mjs');
    const attachBody = source.slice(source.indexOf('export function attachProgressionData'));

    for (const field of Object.keys(PROGRESSION_UPSTREAM_SOURCES)) {
      expect(attachBody, `${field} is assigned by attachProgressionData`).toContain(`${field}:`);
    }
  });

  it('names only columns the seed really ships', () => {
    // The provenance map reads this constant, so a drift here becomes a lie in a generated document.
    const dataset = readSource('scripts/lib/optc-dataset.mjs');

    for (const [field, source] of Object.entries(PROGRESSION_UPSTREAM_SOURCES)) {
      expect(dataset, `${field} -> ${source.table}`).toContain(`INSERT INTO ${source.table} (`);
      expect(dataset, `${field} -> ${source.column}`).toContain(source.column);
    }
  });
});

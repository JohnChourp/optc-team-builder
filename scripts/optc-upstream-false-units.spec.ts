import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeDropSources, normalizeEvolutions } from './lib/optc-upstream-progression.mjs';

/*
 * 869f63gm1. Two things upstream writes where a unit id sits that are not units: a unit's own skull
 * (`"1446-skull"`, the evolver a 3D2Y stage drops) and a score challenge's thresholds
 * (`challengeData`). The parser read both with `Number.parseInt`, so the Character screen listed 269
 * drop entries that were not drops - on 198 characters nothing else - and every one of the 863
 * unit-skull evolvers as a copy of the unit itself ("#2099 evolves with 5x #4000"). Each shape is
 * driven below as upstream writes it.
 */

// `common/data/drops.js`, the 3D2Y stage: a unit and a unit's skull share a slot.
const THREE_D_TWO_Y = {
  name: '3D2Y',
  dropID: 'story28',
  global: true,
  '6': [1346, '1446-skull'],
  '10': ['1550-skull'],
};

// `common/data/drops.js`, Smoker's Great Pursuit: the thresholds `parseInt` read as #600, #1, #3.
const SMOKERS_GREAT_PURSUIT = {
  name: "Smoker's Great Pursuit",
  dropID: 'event9',
  global: true,
  challenge: 'Cumulative Damage dealt to enemies in a single run',
  challengeData: [
    ['600,000 Damage', '1x Green Elder'],
    ['1,400,000 Damage', '1x Rainbow Gem & 1x HP Cotton Candy'],
    ['3,000,000 Damage', '2x Rainbow Gems, 1x Forbidden Tome'],
  ],
  'All Difficulties': [67, 69, -73, -219],
};

describe('a drop slot holds units, and nothing else becomes one', () => {
  it("never reads a score challenge's thresholds as units", () => {
    const sources = normalizeDropSources({ Special: [SMOKERS_GREAT_PURSUIT] });

    expect([...sources.keys()].sort((left, right) => left - right)).toEqual([67, 69]);
  });

  it('never reads a challenge written as bare numbers as units either', () => {
    // The id rule alone would let this through: `challengeData` is metadata by NAME.
    const sources = normalizeDropSources({
      Special: [{ name: 'Score', dropID: 'x', challengeData: [5, 15, 25], '1': [67] }],
    });

    expect([...sources.keys()]).toEqual([67]);
  });

  it("never reads a unit's skull as the unit: the skull drops, the unit does not", () => {
    const sources = normalizeDropSources({ 'Story Island': [THREE_D_TWO_Y] });

    expect([...sources.keys()]).toEqual([1346]);
  });

  it('reads an id written as digits, and nothing that only starts with digits', () => {
    const sources = normalizeDropSources({
      Raid: [{ name: 'R', dropID: 'r', '1': ['120', 122, '121 ', '12x', '1e3', '1,400'] }],
    });

    expect([...sources.keys()]).toEqual([120, 122]);
  });
});

describe("a unit's own skull stays a skull in its evolution", () => {
  it('keeps "1446-skull" as a token beside a material that is a unit', () => {
    const { forward } = normalizeEvolutions({
      '16': { evolution: 1446, evolvers: ['1446-skull', 267] },
    });

    expect(forward.get(16)).toEqual([
      {
        toId: 1446,
        materials: [
          { characterId: null, token: '1446-skull' },
          { characterId: 267, token: null },
        ],
      },
    ]);
  });

  it('keeps every copy, for the evolution that asks for five', () => {
    const { forward } = normalizeEvolutions({
      '2099': { evolution: 4000, evolvers: Array.from({ length: 5 }, () => '4000-skull') },
    });

    expect(forward.get(2099)?.[0]?.materials).toEqual(
      Array.from({ length: 5 }, () => ({ characterId: null, token: '4000-skull' })),
    );
  });
});

describe('the shipped seed', () => {
  const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');

  it('lists no challenge threshold as a drop', () => {
    // The control: the drop rows are there, so the absence below is about the slot.
    expect(seed).toMatch(/"slot":"All Difficulties"/u);
    expect(seed).not.toMatch(/"slot":"challengeData"/u);
  });

  it('names no unit as a material of its own evolution, and keeps the skulls as skulls', () => {
    let selfMaterials = 0;
    let ownSkulls = 0;

    for (const match of seed.matchAll(
      /INSERT INTO character_evolutions \(character_id, evolves_to_json, evolves_from_json\)\s*VALUES \(\s*\d+,\s*'((?:[^']|'')*)'/gu,
    )) {
      const branches = JSON.parse(match[1]!.replace(/''/gu, "'")) as Array<{
        toId: number;
        materials: Array<{ characterId: number | null; token: string | null }>;
      }>;

      for (const branch of branches) {
        for (const material of branch.materials) {
          selfMaterials += material.characterId === branch.toId ? 1 : 0;
          ownSkulls += material.token === `${branch.toId}-skull` ? 1 : 0;
        }
      }
    }

    // 863 on 2026-09-25, each one "character <target>" before 869f63gm1.
    expect(ownSkulls).toBeGreaterThan(0);
    expect(selfMaterials).toBe(0);
  });
});

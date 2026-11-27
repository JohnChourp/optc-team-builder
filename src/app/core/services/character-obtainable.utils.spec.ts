import { describe, expect, it } from 'vitest';

import {
  type CharacterObtainableSources,
  isDirectlyObtainable,
  resolveObtainableCharacterIds,
} from './character-obtainable.utils';

function entry(
  characterId: number,
  overrides: Partial<Omit<CharacterObtainableSources, 'characterId'>> & {
    flags?: string[];
    shops?: string[];
    banners?: string[];
    evolvesToIds?: number[];
  } = {},
): CharacterObtainableSources {
  return {
    characterId,
    acquisition: {
      flags: overrides.flags ?? [],
      shops: overrides.shops ?? [],
      banners: overrides.banners ?? [],
    },
    dropSources: overrides.dropSources ?? [],
    evolvesTo: (overrides.evolvesToIds ?? []).map((toId) => ({ toId, materials: [] })),
  };
}

const STAGE_DROP = {
  group: 'Story Island',
  stage: 'Whiskey Peak',
  dropId: 'story10',
  slot: '15',
  global: true,
};

describe('869f63h04 obtainable units', () => {
  it('counts a stage drop, a shop list, the two shop flags and the Friend Point banner', () => {
    expect(isDirectlyObtainable(entry(1, { dropSources: [STAGE_DROP] }))).toBe(true);
    expect(isDirectlyObtainable(entry(2, { shops: ['Medal'] }))).toBe(true);
    expect(isDirectlyObtainable(entry(3, { flags: ['shop'] }))).toBe(true);
    expect(isDirectlyObtainable(entry(4, { flags: ['tmshop'] }))).toBe(true);
    expect(isDirectlyObtainable(entry(5, { banners: ['FP'] }))).toBe(true);
  });

  it('does not count a Rare Recruit, a limited recruit, a login bonus, a promo or nothing at all', () => {
    for (const flags of [['rr'], ['rr', 'lrr', 'superlrr'], ['special'], ['promo'], []]) {
      expect(isDirectlyObtainable(entry(10, { flags }))).toBe(false);
    }
    expect(isDirectlyObtainable(entry(11, { banners: ['Sugo'] }))).toBe(false);
  });

  it('keeps a limited unit that a shop also sells', () => {
    expect(isDirectlyObtainable(entry(12, { flags: ['rr', 'lrr', 'tmlrr'], shops: ['TM'] }))).toBe(
      true,
    );
  });

  it('adds every form an obtainable unit evolves into, at any depth and on every branch', () => {
    const ids = resolveObtainableCharacterIds([
      entry(1, { dropSources: [STAGE_DROP], evolvesToIds: [2] }),
      entry(2, { evolvesToIds: [3, 4] }),
      entry(3),
      entry(4, { evolvesToIds: [5] }),
      entry(5),
      // A Rare Recruit evolving into a unit is not a channel for that unit.
      entry(20, { flags: ['rr'], evolvesToIds: [21] }),
      entry(21),
    ]);

    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('follows an evolution to a unit that has no row of its own', () => {
    expect(
      resolveObtainableCharacterIds([entry(7, { banners: ['FP'], evolvesToIds: [8] })]),
    ).toEqual([7, 8]);
  });

  it('ends on a cycle and ignores evolution targets that are not positive whole numbers', () => {
    const ids = resolveObtainableCharacterIds([
      entry(30, { shops: ['Ray'], evolvesToIds: [31, 0, -2, 1.5, Number.NaN] }),
      entry(31, { evolvesToIds: [30] }),
    ]);

    expect(ids).toEqual([30, 31]);
  });

  it('returns the ids sorted and once each, whatever the input order', () => {
    const ids = resolveObtainableCharacterIds([
      entry(9, { banners: ['FP'] }),
      entry(3, { shops: ['PKA'], evolvesToIds: [9] }),
      entry(6, { dropSources: [STAGE_DROP], evolvesToIds: [9] }),
    ]);

    expect(ids).toEqual([3, 6, 9]);
  });

  it('returns nothing for a dataset with nothing recorded', () => {
    expect(resolveObtainableCharacterIds([entry(1), entry(2, { flags: ['rr'] })])).toEqual([]);
    expect(resolveObtainableCharacterIds([])).toEqual([]);
  });
});

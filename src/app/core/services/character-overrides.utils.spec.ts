import { describe, expect, it } from 'vitest';

import { normalizeLocalCharacterOverride } from './character-overrides.utils';

function createOverrideInput(stats: Record<string, unknown> = {}) {
  return {
    characterId: 249,
    name: 'Tony Tony Chopper - Post-Rampage',
    type: 'PSY',
    classes: ['Powerhouse'],
    stars: 6,
    cost: 45,
    combo: 4,
    minHp: 1000,
    minAtk: 400,
    minRcv: -350,
    maxHp: 2500,
    maxAtk: 900,
    maxRcv: -900,
    growth: 1,
    ...stats,
  };
}

describe('normalizeLocalCharacterOverride stats', () => {
  it('keeps a negative stat, which 59 shipped characters have, instead of erasing it', () => {
    const override = normalizeLocalCharacterOverride(createOverrideInput());

    expect(override?.minRcv).toBe(-350);
    expect(override?.maxRcv).toBe(-900);
  });

  it('reads a blank or non-numeric field as unknown, never as zero', () => {
    const override = normalizeLocalCharacterOverride(
      createOverrideInput({ minHp: '', maxHp: '   ', maxAtk: 'abc', maxRcv: Number.NaN }),
    );

    expect(override?.minHp).toBeNull();
    expect(override?.maxHp).toBeNull();
    expect(override?.maxAtk).toBeNull();
    expect(override?.maxRcv).toBeNull();
    expect(override?.minAtk).toBe(400);
  });
});

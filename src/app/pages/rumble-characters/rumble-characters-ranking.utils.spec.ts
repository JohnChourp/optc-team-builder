import { describe, expect, it } from 'vitest';

import { type RumbleUnitScore } from '../../core/models/auto-team-builder-rumble.models';
import { rankRumbleCharacters } from './rumble-characters-ranking.utils';

describe('rumble characters ranking utils', () => {
  it('keeps full Rumble score as the base ranking when focus is ignored', () => {
    const ranked = rankRumbleCharacters(
      [createUnit({ id: 1001, baseScore: 120 }), createUnit({ id: 1002, baseScore: 180 })],
      [
        { stat: 'ATK', rank: 'ignored' },
        { stat: 'HP', rank: 'ignored' },
        { stat: 'DEF', rank: 'ignored' },
        { stat: 'SPD', rank: 'ignored' },
        { stat: 'RCV', rank: 'ignored' },
        { stat: 'Special CT', rank: 'ignored' },
      ],
    );

    expect(ranked.map((entry) => entry.unit.character.id)).toEqual([1002, 1001]);
    expect(ranked[0].focusBonus).toBe(0);
  });

  it('lets ATK focus and CT focus reorder otherwise comparable units', () => {
    const attackUnit = createUnit({
      id: 1001,
      baseScore: 100,
      atk: 3200,
      cooldown: 42,
    });
    const fastUnit = createUnit({
      id: 1002,
      baseScore: 100,
      atk: 500,
      cooldown: 10,
    });

    const attackFocused = rankRumbleCharacters([fastUnit, attackUnit], [
      { stat: 'ATK', rank: 'primary' },
      { stat: 'HP', rank: 'ignored' },
      { stat: 'DEF', rank: 'ignored' },
      { stat: 'SPD', rank: 'ignored' },
      { stat: 'RCV', rank: 'ignored' },
      { stat: 'Special CT', rank: 'ignored' },
    ]);
    const ctFocused = rankRumbleCharacters([fastUnit, attackUnit], [
      { stat: 'ATK', rank: 'ignored' },
      { stat: 'HP', rank: 'ignored' },
      { stat: 'DEF', rank: 'ignored' },
      { stat: 'SPD', rank: 'ignored' },
      { stat: 'RCV', rank: 'ignored' },
      { stat: 'Special CT', rank: 'primary' },
    ]);

    expect(attackFocused[0].unit.character.id).toBe(1001);
    expect(ctFocused[0].unit.character.id).toBe(1002);
  });

  it('adds focus value for matching Rumble buff effects', () => {
    const ranked = rankRumbleCharacters(
      [
        createUnit({ id: 1001, baseScore: 100, passiveText: 'Boost ATK of crew' }),
        createUnit({ id: 1002, baseScore: 100 }),
      ],
      [
        { stat: 'ATK', rank: 'primary' },
        { stat: 'HP', rank: 'ignored' },
        { stat: 'DEF', rank: 'ignored' },
        { stat: 'SPD', rank: 'ignored' },
        { stat: 'RCV', rank: 'ignored' },
        { stat: 'Special CT', rank: 'ignored' },
      ],
    );

    expect(ranked[0].unit.character.id).toBe(1001);
    expect(ranked[0].focusBonus).toBeGreaterThan(ranked[1].focusBonus);
  });
});

function createUnit(overrides: {
  atk?: number;
  baseScore?: number;
  cooldown?: number | null;
  id: number;
  passiveText?: string;
}): RumbleUnitScore {
  const baseScore = overrides.baseScore ?? 100;
  const passiveEffects = overrides.passiveText
    ? [
        {
          source: 'ability',
          sourceLevel: 5,
          maxSourceLevel: 5,
          effect: overrides.passiveText,
          attributes: ['ATK'],
          level: 5,
          amount: 7,
          chance: 100,
          duration: 20,
          type: null,
          target: 'crew',
          targetTokens: ['crew'],
          targetCount: null,
          targetPriority: null,
          targetStat: 'ATK',
          targetScope: 'crew',
          isConditional: false,
        },
      ]
    : [];

  return {
    character: {
      id: overrides.id,
      name: `Unit ${overrides.id}`,
      type: 'STR',
      classes: ['Fighter'],
      primaryClass: 'Fighter',
      secondaryClass: null,
      cost: 55,
      stats: {
        min: { hp: null, atk: null, rcv: null },
        max: {
          hp: 5000,
          atk: overrides.atk ?? 1500,
          rcv: 350,
        },
      },
    },
    normalized: {
      rumbleType: 'STR',
      def: 130,
      spd: 140,
      cost: 55,
      cooldown: overrides.cooldown ?? 30,
      passiveEffects,
      specialEffects: [],
      roleTags: [],
    },
    baseScore,
    breakdown: {
      statScore: 0,
      passiveScore: 0,
      specialScore: 0,
      synergyScore: 0,
      recencyScore: 0,
      total: baseScore,
    },
    reasonChips: [],
    conflictKeys: [],
  } as RumbleUnitScore;
}

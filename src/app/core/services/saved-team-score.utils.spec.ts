import { describe, expect, it } from 'vitest';

import { type CharacterRecord } from '../models/optc.models';
import {
  computeSavedTeamScore,
  summarizeSavedTeamScore,
} from './saved-team-score.utils';

function createCharacter(
  overrides: Partial<CharacterRecord> & Pick<CharacterRecord, 'id'>,
): CharacterRecord {
  return {
    id: overrides.id,
    name: overrides.name ?? `Character ${overrides.id}`,
    isIncomplete: false,
    type: overrides.type ?? 'STR',
    classes: overrides.classes ?? [],
    primaryClass: overrides.primaryClass ?? 'Fighter',
    secondaryClass: overrides.secondaryClass ?? null,
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 30,
    combo: overrides.combo ?? 5,
    captainHpBoost: overrides.captainHpBoost ?? 0,
    captainAtkBoost: overrides.captainAtkBoost ?? 0,
    captainAverageBoost: overrides.captainAverageBoost ?? 0,
    stats: overrides.stats ?? {
      min: { hp: 0, atk: 0, rcv: 0 },
      max: { hp: 1000, atk: 500, rcv: 100 },
      growth: 1,
    },
    regionAvailability: overrides.regionAvailability ?? {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: true,
    },
    assets: overrides.assets ?? {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
  };
}

describe('computeSavedTeamScore', () => {
  it('returns zero score and empty breakdown for an empty team', () => {
    const result = computeSavedTeamScore(
      { slots: [null, null, null, null, null, null] },
      { characterLookup: () => null },
    );

    expect(result.score).toBe(0);
    expect(result.breakdown.filledSlotCount).toBe(0);
    expect(result.breakdown.resolvedSlotCount).toBe(0);
    expect(result.breakdown.effectiveHpMax).toBe(0);
  });

  it('applies combined captain HP/ATK boosts from both captain slots to the team total', () => {
    const captainA = createCharacter({
      id: 1,
      captainHpBoost: 1,
      captainAtkBoost: 2,
      stats: {
        min: { hp: 0, atk: 0, rcv: 0 },
        max: { hp: 1000, atk: 500, rcv: 100 },
        growth: 1,
      },
    });
    const captainB = createCharacter({
      id: 2,
      captainHpBoost: 0.5,
      captainAtkBoost: 1,
      stats: {
        min: { hp: 0, atk: 0, rcv: 0 },
        max: { hp: 800, atk: 400, rcv: 80 },
        growth: 1,
      },
    });
    const subs = [3, 4, 5, 6].map((id) =>
      createCharacter({
        id,
        stats: {
          min: { hp: 0, atk: 0, rcv: 0 },
          max: { hp: 600, atk: 300, rcv: 60 },
          growth: 1,
        },
      }),
    );

    const characters = [captainA, captainB, ...subs];
    const lookup = (characterId: number) =>
      characters.find((character) => character.id === characterId) ?? null;

    const result = computeSavedTeamScore({ slots: [1, 2, 3, 4, 5, 6] }, { characterLookup: lookup });

    expect(result.breakdown.rawHpMax).toBe(1000 + 800 + 600 * 4);
    expect(result.breakdown.combinedCaptainHpBoost).toBe(1.5);
    expect(result.breakdown.combinedCaptainAtkBoost).toBe(3);
    expect(result.breakdown.effectiveHpMax).toBe(
      Math.round(result.breakdown.rawHpMax * (1 + 1.5)),
    );
    expect(result.breakdown.effectiveAtkMax).toBe(
      Math.round(result.breakdown.rawAtkMax * (1 + 3)),
    );
    expect(result.breakdown.resolvedSlotCount).toBe(6);
    expect(result.score).toBeGreaterThan(0);
  });

  it('skips characters that cannot be resolved without throwing', () => {
    const result = computeSavedTeamScore(
      { slots: [1, 2, null, null, null, null] },
      { characterLookup: () => null },
    );

    expect(result.breakdown.filledSlotCount).toBe(2);
    expect(result.breakdown.resolvedSlotCount).toBe(0);
    expect(result.breakdown.effectiveAtkMax).toBe(0);
    expect(result.score).toBe(0);
  });

  it('is deterministic for identical inputs', () => {
    const lookup = (id: number) =>
      createCharacter({
        id,
        stats: {
          min: { hp: 0, atk: 0, rcv: 0 },
          max: { hp: 1000, atk: 500, rcv: 100 },
          growth: 1,
        },
      });

    const first = computeSavedTeamScore({ slots: [1, 2, 3, 4, 5, 6] }, { characterLookup: lookup });
    const second = computeSavedTeamScore(
      { slots: [1, 2, 3, 4, 5, 6] },
      { characterLookup: lookup },
    );

    expect(first.score).toBe(second.score);
    expect(first.breakdown).toEqual(second.breakdown);
  });
});

describe('summarizeSavedTeamScore', () => {
  it('produces a compact human-readable summary string', () => {
    const lookup = () =>
      createCharacter({
        id: 1,
        stats: {
          min: { hp: 0, atk: 0, rcv: 0 },
          max: { hp: 1000, atk: 500, rcv: 100 },
          growth: 1,
        },
      });
    const score = computeSavedTeamScore(
      { slots: [1, null, null, null, null, null] },
      { characterLookup: lookup },
    );

    const summary = summarizeSavedTeamScore(score);

    expect(summary).toContain('score=');
    expect(summary).toContain('hp=1000');
    expect(summary).toContain('atk=500');
    expect(summary).toContain('filled=1/6');
  });
});

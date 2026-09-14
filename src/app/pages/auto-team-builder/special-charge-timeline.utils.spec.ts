import { describe, expect, it } from 'vitest';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import {
  buildSpecialChargeTimeline,
  clampTimelineTurns,
  DEFAULT_TIMELINE_TURNS,
  MAXIMUM_TIMELINE_TURNS,
  MINIMUM_TIMELINE_TURNS,
  type SpecialCooldownRecord,
} from './special-charge-timeline.utils';

function slot(
  role: 'captain' | 'friendCaptain' | 'sub',
  id: number,
  name: string,
  specialName: string | null = `${name}'s special`,
): AutoBuildResult['slots'][number] {
  return {
    role,
    reasonChips: [],
    character: { id, name, detail: { characterId: id, specialName } },
  } as unknown as AutoBuildResult['slots'][number];
}

function result(slots: AutoBuildResult['slots']): AutoBuildResult {
  return { slots } as unknown as AutoBuildResult;
}

function cooldowns(
  entries: [number, number | null, number | null][],
): ReadonlyMap<number, SpecialCooldownRecord> {
  return new Map(
    entries.map(([characterId, baseTurns, maxLevelTurns]) => [
      characterId,
      { characterId, baseTurns, maxLevelTurns },
    ]),
  );
}

describe('special charge timeline', () => {
  it('returns nothing without a built team', () => {
    expect(buildSpecialChargeTimeline(null, 20, cooldowns([]))).toBeNull();
  });

  it('reports charge turns at base and at max special level', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('captain', 1001, 'Luffy')]),
      20,
      cooldowns([[1001, 25, 18]]),
    );

    expect(timeline?.entries).toHaveLength(1);
    expect(timeline?.entries[0]).toMatchObject({
      characterId: 1001,
      characterName: 'Luffy',
      role: 'captain',
      specialName: "Luffy's special",
      baseTurns: 25,
      maxLevelTurns: 18,
      chargesInRun: true,
      spareTurns: 2,
      shortfallTurns: null,
    });
  });

  it('says how many turns short a special falls when the run is too quick', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('sub', 1002, 'Zoro')]),
      10,
      cooldowns([[1002, 25, 18]]),
    );

    expect(timeline?.entries[0]).toMatchObject({
      chargesInRun: false,
      spareTurns: null,
      shortfallTurns: 8,
    });
    expect(timeline?.readyCount).toBe(0);
    expect(timeline?.latestReadyTurns).toBeNull();
  });

  it('treats charging on the last turn as charging in time, with no turns to spare', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('sub', 1003, 'Nami')]),
      18,
      cooldowns([[1003, 25, 18]]),
    );

    expect(timeline?.entries[0].chargesInRun).toBe(true);
    expect(timeline?.entries[0].spareTurns).toBe(0);
  });

  it('sorts fastest first, because the question is what is available early', () => {
    const timeline = buildSpecialChargeTimeline(
      result([
        slot('captain', 1001, 'Luffy'),
        slot('sub', 1002, 'Zoro'),
        slot('sub', 1003, 'Nami'),
      ]),
      30,
      cooldowns([
        [1001, 25, 18],
        [1002, 20, 11],
        [1003, 30, 24],
      ]),
    );

    expect(timeline?.entries.map((entry) => entry.characterName)).toEqual(['Zoro', 'Luffy', 'Nami']);
    expect(timeline?.earliestTurns).toBe(11);
    expect(timeline?.latestReadyTurns).toBe(24);
    expect(timeline?.readyCount).toBe(3);
  });

  it('keeps slot order when two specials charge at the same speed', () => {
    const timeline = buildSpecialChargeTimeline(
      result([
        slot('captain', 1001, 'Luffy'),
        slot('friendCaptain', 1002, 'Zoro'),
        slot('sub', 1003, 'Nami'),
      ]),
      30,
      cooldowns([
        [1001, 20, 12],
        [1002, 20, 12],
        [1003, 20, 12],
      ]),
    );

    expect(timeline?.entries.map((entry) => entry.role)).toEqual([
      'captain',
      'friendCaptain',
      'sub',
    ]);
  });

  /*
   * 110 of 4,618 characters carry no cooldown - 96 of them low-rarity fodder, 10 of them Turtles.
   * A team member silently missing from the list reads as a special that charges instantly, which
   * is the opposite of the truth, so the gap is named instead.
   */
  it('names a team member whose cooldown the dataset does not carry', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('captain', 1001, 'Luffy'), slot('sub', 189, 'Red Elder Turtle', null)]),
      20,
      cooldowns([
        [1001, 25, 18],
        [189, null, null],
      ]),
    );

    expect(timeline?.entries.map((entry) => entry.characterName)).toEqual(['Luffy']);
    expect(timeline?.unknownCharacterNames).toEqual(['Red Elder Turtle']);
  });

  it('names a team member the cooldown lookup does not mention at all', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('sub', 4643, 'Blade')]),
      20,
      cooldowns([]),
    );

    expect(timeline?.entries).toEqual([]);
    expect(timeline?.unknownCharacterNames).toEqual(['Blade']);
  });

  it('carries a null special name through rather than inventing one', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('sub', 1004, 'Sanji', null)]),
      20,
      cooldowns([[1004, 14, 9]]),
    );

    expect(timeline?.entries[0].specialName).toBeNull();
  });

  describe('turn count', () => {
    it.each([
      [0, MINIMUM_TIMELINE_TURNS],
      [-5, MINIMUM_TIMELINE_TURNS],
      [500, MAXIMUM_TIMELINE_TURNS],
      [20, 20],
      [20.7, 20],
    ])('clamps %s to %s', (input, expected) => {
      expect(clampTimelineTurns(input)).toBe(expected);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY])('falls back for %s', (input) => {
      expect(clampTimelineTurns(input)).toBe(DEFAULT_TIMELINE_TURNS);
    });

    it('clamps the turn count it reports, not just the one it compares against', () => {
      const timeline = buildSpecialChargeTimeline(
        result([slot('sub', 1002, 'Zoro')]),
        0,
        cooldowns([[1002, 20, 11]]),
      );

      expect(timeline?.turns).toBe(MINIMUM_TIMELINE_TURNS);
      expect(timeline?.entries[0].chargesInRun).toBe(false);
    });
  });
});

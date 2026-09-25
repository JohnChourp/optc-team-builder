import { describe, expect, it } from 'vitest';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import { type StartCutPart } from './special-charge-start-cut.utils';
import {
  buildSpecialChargeTimeline,
  type SpecialCooldownRecord,
} from './special-charge-timeline.utils';

/*
 * 869f63gm7. The timeline measured every special from a full cooldown, so a unit the player has on
 * turn 1 read as "not ready until stage 4". These pin the arithmetic of the start-of-quest cut: it
 * comes off both numbers, never below zero, and "to MAX" leaves nothing.
 */

function slot(role: 'captain' | 'friendCaptain' | 'sub', id: number, name: string) {
  return {
    role,
    reasonChips: [],
    character: { id, name, detail: { characterId: id, specialName: `${name}'s special` } },
  } as unknown as AutoBuildResult['slots'][number];
}

function result(slots: AutoBuildResult['slots']): AutoBuildResult {
  return { slots } as unknown as AutoBuildResult;
}

function cooldowns(
  entries: [number, number, number][],
): ReadonlyMap<number, SpecialCooldownRecord> {
  return new Map(
    entries.map(([characterId, baseTurns, maxLevelTurns]) => [
      characterId,
      { characterId, baseTurns, maxLevelTurns },
    ]),
  );
}

const event = (turns: number): StartCutPart => ({ source: 'event', turns, fromName: null });
const captain = (turns: number | null): StartCutPart => ({
  source: 'captain',
  turns,
  fromName: null,
});

describe('special charge timeline after the start of the quest', () => {
  /* The brief's own "done when": a -10 event cut shows the specials ready on the right turn. */
  it('takes a -10 event cut off both special levels, for the units it reaches', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('captain', 1001, 'Luffy'), slot('sub', 1002, 'Zoro')]),
      8,
      cooldowns([
        [1001, 25, 18],
        [1002, 25, 18],
      ]),
      [[event(10)], []],
    );

    expect(timeline?.entries.find((entry) => entry.characterId === 1001)).toMatchObject({
      baseTurns: 15,
      maxLevelTurns: 8,
      chargesInRun: true,
      spareTurns: 0,
      startCut: [event(10)],
    });
    // Zoro is not boosted: the same special, still 10 turns short of an 8-stage run.
    expect(timeline?.entries.find((entry) => entry.characterId === 1002)).toMatchObject({
      maxLevelTurns: 18,
      chargesInRun: false,
      shortfallTurns: 10,
      startCut: [],
    });
    expect(timeline?.readyCount).toBe(1);
  });

  it('adds every source that reaches the unit', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('sub', 1003, 'Nami')]),
      20,
      cooldowns([[1003, 20, 14]]),
      [[event(10), captain(1), { source: 'ship', turns: 1, fromName: null }]],
    );

    expect(timeline?.entries[0]).toMatchObject({ baseTurns: 8, maxLevelTurns: 2 });
  });

  it('reads a special cut to zero or below as charged at the start, never as negative', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('sub', 1004, 'Sanji')]),
      20,
      cooldowns([[1004, 14, 9]]),
      [[event(12)]],
    );

    expect(timeline?.entries[0]).toMatchObject({
      baseTurns: 2,
      maxLevelTurns: 0,
      chargesInRun: true,
      spareTurns: 20,
    });
    expect(timeline?.earliestTurns).toBe(0);
  });

  it('reads "to MAX" as nothing left to charge, whatever else is cut', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('captain', 3533, 'Kaido')]),
      20,
      cooldowns([[3533, 30, 25]]),
      [[captain(2), captain(null)]],
    );

    expect(timeline?.entries[0]).toMatchObject({ baseTurns: 0, maxLevelTurns: 0 });
  });

  it('sorts by the charge time after the cut, so a boosted unit can move to the top', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('captain', 1001, 'Luffy'), slot('sub', 1002, 'Zoro')]),
      20,
      cooldowns([
        [1001, 12, 10],
        [1002, 25, 18],
      ]),
      [[], [event(10)]],
    );

    expect(timeline?.entries.map((entry) => entry.characterName)).toEqual(['Zoro', 'Luffy']);
    expect(timeline?.earliestTurns).toBe(8);
  });

  it('leaves the numbers alone when nothing is cut', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('sub', 1002, 'Zoro')]),
      20,
      cooldowns([[1002, 25, 18]]),
    );

    expect(timeline?.entries[0]).toMatchObject({ baseTurns: 25, maxLevelTurns: 18, startCut: [] });
  });

  it('still names a unit with no cooldown in the data, cut or not', () => {
    const timeline = buildSpecialChargeTimeline(
      result([slot('sub', 189, 'Red Elder Turtle')]),
      20,
      cooldowns([]),
      [[event(10)]],
    );

    expect(timeline?.entries).toEqual([]);
    expect(timeline?.unknownCharacterNames).toEqual(['Red Elder Turtle']);
  });
});

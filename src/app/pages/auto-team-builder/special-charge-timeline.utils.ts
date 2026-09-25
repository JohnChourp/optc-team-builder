import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import { type StartCutPart } from './special-charge-start-cut.utils';

/**
 * The two numbers this needs, keyed by character.
 *
 * They are NOT on the built team's records: `CharacterProgression` is loaded per character on
 * purpose, because its evolution and drop payloads would be dead weight in every list and builder
 * query that never asks for them. So the page reads the two columns for the six team members and
 * hands them in here, which also keeps this module pure.
 */
export interface SpecialCooldownRecord {
  readonly characterId: number;
  readonly baseTurns: number | null;
  readonly maxLevelTurns: number | null;
}

/**
 * 869f1k107. When each special on the built team is charged, against a run of a chosen length.
 *
 * 869f12xbm established the feasibility and, on the way, corrected the brief it arrived with.
 * `special_cooldown_max` and `special_cooldown_min` are first-class columns with **97.62%**
 * coverage - 4,508 of 4,618 characters - and **zero** rows where `max < min`. That last figure is
 * what settles the semantics without guessing: `max` is the untrained cooldown and `min` the
 * fully-levelled one. The 110 gaps are 96 low-rarity fodder plus 10 Turtles.
 *
 * The brief said the data "is used to pick a team, never to plan a run". It was not used to pick a
 * team either: its only consumer was `character-progression.presenter.ts`, rendering the pair as
 * the string `"25 → 18"` on Character Detail. This is the first thing that does anything with it.
 *
 * **What this deliberately does not claim.**
 *
 * Nothing anywhere in this app states how a cooldown maps onto a turn index, and the dataset
 * carries a count, not a convention. So this reports **turns to charge** - the number the dataset
 * actually holds - and measures it against a stage count the reader enters. It never says "ready
 * on turn N", because an off-by-one there would be wrong on every row and invisible.
 *
 * It also does not model a special being used and charging again, and it is not a damage
 * simulation - that is wave 1's calculator and a separate, larger question.
 *
 * **The Limit Break limit, which the UI must repeat.** Limit Break lowers a special's cooldown
 * in game two ways, and the dataset carries only one. The Cooldown Reduction potential is there,
 * as its max-level amount, and 869f63gm7 counts it behind "If Limit Broken". The Limit Break
 * path's own "Reduce base Special Cooldown by N turns" nodes are not - the importer does not read
 * upstream's `limit` list - so `min` stays the floor a fully levelled special reaches before them,
 * not the lowest number a real box can achieve. 869f63gm7 corrected the note that said the data
 * carried no Limit Break reduction at all.
 *
 * **869f63gm7: the start of the quest.** A special does not start from a full cooldown when the
 * event, the Captains, the ship or - Limit Broken - the unit's crewmates and Cooldown Reduction
 * potential cut it first. `special-charge-start-cut.utils.ts` works out those cuts per slot; this
 * takes them off both numbers, never below zero, and keeps them on the entry so the row can name
 * every source. Zero turns to charge means the special is charged at the start of the fight.
 */
export interface SpecialChargeEntry {
  readonly characterId: number;
  readonly characterName: string;
  readonly role: AutoBuildResult['slots'][number]['role'];
  /** The special's own name, when the dataset has one. */
  readonly specialName: string | null;
  /** Turns to charge at special level 1, after the cuts at the start of the quest. */
  readonly baseTurns: number;
  /** Turns to charge at max special level, after the cuts at the start of the quest. */
  readonly maxLevelTurns: number;
  /** What the start of the quest took off, source by source. Empty when nothing did. */
  readonly startCut: readonly StartCutPart[];
  /** True when `maxLevelTurns` fits inside the run the reader entered. */
  readonly chargesInRun: boolean;
  /**
   * Turns left over once it has charged, or `null` when it does not charge in time. Zero means it
   * charges on the last turn of the run.
   */
  readonly spareTurns: number | null;
  /** How many turns short it falls, or `null` when it charges in time. */
  readonly shortfallTurns: number | null;
}

export interface SpecialChargeTimeline {
  readonly turns: number;
  readonly entries: readonly SpecialChargeEntry[];
  /** Team members whose cooldown the dataset does not carry, named so the gap is visible. */
  readonly unknownCharacterNames: readonly string[];
  readonly readyCount: number;
  /** The fastest special's charge time at max level, or `null` when none is known. */
  readonly earliestTurns: number | null;
  /** The slowest one that still charges in time, or `null` when none does. */
  readonly latestReadyTurns: number | null;
}

/** Below this a run is not a run; the field is a count of stages the reader expects to fight. */
export const MINIMUM_TIMELINE_TURNS = 1;
export const MAXIMUM_TIMELINE_TURNS = 99;
export const DEFAULT_TIMELINE_TURNS = 20;

export function clampTimelineTurns(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TIMELINE_TURNS;
  }

  return Math.min(MAXIMUM_TIMELINE_TURNS, Math.max(MINIMUM_TIMELINE_TURNS, Math.trunc(value)));
}

/**
 * Sorted fastest first, because the question a reader arrives with is what they have EARLY. Ties
 * keep slot order, so the Captain stays above a sub that charges just as fast.
 */
export function buildSpecialChargeTimeline(
  result: AutoBuildResult | null,
  turns: number,
  cooldownsById: ReadonlyMap<number, SpecialCooldownRecord>,
  startCutsBySlot: readonly (readonly StartCutPart[])[] = [],
): SpecialChargeTimeline | null {
  if (!result) {
    return null;
  }

  const runTurns = clampTimelineTurns(turns);
  const entries: SpecialChargeEntry[] = [];
  const unknownCharacterNames: string[] = [];

  for (const [slotIndex, slot] of result.slots.entries()) {
    const { character } = slot;
    const cooldown = cooldownsById.get(character.id);
    const startCut = startCutsBySlot[slotIndex] ?? [];
    const baseTurns = afterStartCut(cooldown?.baseTurns ?? null, startCut);
    const maxLevelTurns = afterStartCut(cooldown?.maxLevelTurns ?? null, startCut);

    /*
     * A character with no cooldown is overwhelmingly fodder - Turtles and low-rarity units - but
     * it is named rather than dropped. A team member silently missing from the list reads as a
     * special that charges instantly, which is the opposite of the truth.
     */
    if (typeof baseTurns !== 'number' || typeof maxLevelTurns !== 'number') {
      unknownCharacterNames.push(character.name);
      continue;
    }

    const chargesInRun = maxLevelTurns <= runTurns;

    entries.push({
      characterId: character.id,
      characterName: character.name,
      role: slot.role,
      specialName: character.detail?.specialName ?? null,
      baseTurns,
      maxLevelTurns,
      startCut,
      chargesInRun,
      spareTurns: chargesInRun ? runTurns - maxLevelTurns : null,
      shortfallTurns: chargesInRun ? null : maxLevelTurns - runTurns,
    });
  }

  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) =>
      left.entry.maxLevelTurns === right.entry.maxLevelTurns
        ? left.index - right.index
        : left.entry.maxLevelTurns - right.entry.maxLevelTurns,
    )
    .map(({ entry }) => entry);
  const ready = sorted.filter((entry) => entry.chargesInRun);

  return {
    turns: runTurns,
    entries: sorted,
    unknownCharacterNames,
    readyCount: ready.length,
    earliestTurns: sorted[0]?.maxLevelTurns ?? null,
    latestReadyTurns: ready[ready.length - 1]?.maxLevelTurns ?? null,
  };
}

/** A source that charges it completely leaves nothing; otherwise every turn cut comes off. */
function afterStartCut(turns: number | null, startCut: readonly StartCutPart[]): number | null {
  if (turns === null || startCut.length === 0) {
    return turns;
  }

  if (startCut.some((part) => part.turns === null)) {
    return 0;
  }

  return Math.max(0, turns - startCut.reduce((total, part) => total + (part.turns ?? 0), 0));
}

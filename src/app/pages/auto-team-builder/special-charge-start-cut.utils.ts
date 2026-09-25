import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import {
  readStartOfQuestCooldownCuts,
  startOfQuestCutReaches,
  type StartOfQuestCooldownCut,
} from '../../core/services/start-of-quest-cooldown-cut.utils';

/**
 * 869f63gm7. What the start of the quest takes off each special on the built team, and where
 * every turn of it came from.
 *
 * Six sources, and the row names each one, so no number on the timeline is a black box:
 *
 *  - **event** - the cut the player enters for the event they are about to play, such as a
 *    Treasure Map booster's 10. There is no event data in the dataset, and the owner's 869f1q90b
 *    decision is that event data is entered by the player, so upstream's booster tables are NOT
 *    imported. It goes to the units on the player's Boosted list, because an event cut goes to
 *    boosted units - or to the whole team when the player says so.
 *  - **Captain** and **Friend Captain** - their captain ability, read from the shipped text.
 *  - **ship** - the ship on the result.
 *  - **Crewmate Ability** and the **Cooldown Reduction** potential - only with "If Limit Broken"
 *    on. Upstream's own Limit Break path lists both, as "Acquire Sailor Ability N" and "Acquire
 *    Potential N" nodes, and the app never assumes investment (owner, 869f13c8m). The potential's
 *    amount is its max level, the only one the dataset keeps.
 *
 * The Friend Captain's Crewmate Ability and potential are never counted: it is borrowed, and the
 * app cannot know how far its owner Limit Broke it. Its captain ability is not affected by that.
 */
export type StartCutSource =
  | 'event'
  | 'captain'
  | 'friendCaptain'
  | 'crewmate'
  | 'ship'
  | 'limitBreak';

export interface StartCutPart {
  readonly source: StartCutSource;
  /** Turns taken off the cooldown, or `null` when this source charges the special completely. */
  readonly turns: number | null;
  /** Whose Crewmate Ability it is; `null` for every other source. */
  readonly fromName: string | null;
}

export interface StartCutOptions {
  readonly eventCutTurns: number;
  readonly eventCutWholeTeam: boolean;
  readonly boostedCharacterIds: readonly number[];
  readonly countLimitBreak: boolean;
}

export const MAXIMUM_EVENT_CUT_TURNS = 99;

/**
 * A whole number of turns from 0 to 99. "-10" means a cut of 10 - it is how the game and the
 * brief both write it - so the sign is dropped rather than read as nothing.
 */
export function clampEventCutTurns(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(MAXIMUM_EVENT_CUT_TURNS, Math.trunc(Math.abs(value)));
}

/** One list per slot, in slot order and in source order within a slot. */
export function buildStartOfQuestCutsBySlot(
  result: AutoBuildResult | null,
  options: StartCutOptions,
): StartCutPart[][] {
  if (!result) {
    return [];
  }

  const { slots } = result;
  const parts: StartCutPart[][] = slots.map(() => []);
  const addCuts = (
    cuts: readonly StartOfQuestCooldownCut[],
    source: StartCutSource,
    sourceIndex: number | null,
    fromName: string | null = null,
  ): void => {
    for (const cut of cuts) {
      slots.forEach((slot, index) => {
        if (startOfQuestCutReaches(cut, slot.character, index === sourceIndex)) {
          parts[index]?.push({ source, turns: cut.turns, fromName });
        }
      });
    }
  };
  const eventTurns = clampEventCutTurns(options.eventCutTurns);
  const boosted = new Set(options.boostedCharacterIds);

  slots.forEach((slot, index) => {
    if (eventTurns > 0 && (options.eventCutWholeTeam || boosted.has(slot.character.id))) {
      parts[index]?.push({ source: 'event', turns: eventTurns, fromName: null });
    }
  });

  slots.forEach((slot, index) => {
    if (slot.role !== 'sub') {
      addCuts(
        readStartOfQuestCooldownCuts(slot.character.detail?.captainAbility),
        slot.role,
        index,
      );
    }
  });

  const ownSlots = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => options.countLimitBreak && slot.role !== 'friendCaptain');

  for (const { slot, index } of ownSlots) {
    for (const sailorText of slot.character.detail?.sailorAbilities ?? []) {
      addCuts(readStartOfQuestCooldownCuts(sailorText), 'crewmate', index, slot.character.name);
    }
  }

  const ship = result.shipSelection?.ship ?? null;

  if (ship) {
    addCuts(readStartOfQuestCooldownCuts(ship.description, { allowUntimed: true }), 'ship', null);
  }

  for (const { slot, index } of ownSlots) {
    for (const potential of slot.character.detail?.potentialAbilities ?? []) {
      addCuts(readStartOfQuestCooldownCuts(potential.description?.at(-1)), 'limitBreak', index);
    }
  }

  return parts;
}

import { describe, expect, it } from 'vitest';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import {
  buildStartOfQuestCutsBySlot,
  clampEventCutTurns,
  MAXIMUM_EVENT_CUT_TURNS,
  type StartCutOptions,
} from './special-charge-start-cut.utils';

/*
 * 869f63gm7. Which slot gets which cut, and from where. Every source is named on the row, so the
 * order and the attribution are part of what the player reads - not an implementation detail.
 */

interface MemberInput {
  role?: 'captain' | 'friendCaptain' | 'sub';
  id: number;
  name?: string;
  type?: string;
  classes?: string[];
  captainAbility?: string | null;
  sailorAbilities?: string[];
  potentialAbilities?: Array<{ Name: string; description: string[] }>;
}

function result(members: MemberInput[], shipDescription: string | null = null): AutoBuildResult {
  return {
    slots: members.map((member, index) => ({
      role: member.role ?? (index === 0 ? 'captain' : index === 1 ? 'friendCaptain' : 'sub'),
      reasonChips: [],
      character: {
        id: member.id,
        name: member.name ?? `Unit ${member.id}`,
        type: member.type ?? 'STR',
        classes: member.classes ?? ['Fighter'],
        detail: {
          characterId: member.id,
          captainAbility: member.captainAbility ?? null,
          sailorAbilities: member.sailorAbilities ?? [],
          potentialAbilities: member.potentialAbilities ?? [],
          characterTags: [],
        },
      },
    })),
    shipSelection: shipDescription
      ? {
          ship: { id: 1, name: 'Ship', description: shipDescription },
          source: 'manual',
          reasonChips: [],
        }
      : null,
  } as unknown as AutoBuildResult;
}

const NONE: StartCutOptions = {
  eventCutTurns: 0,
  eventCutWholeTeam: false,
  boostedCharacterIds: [],
  countLimitBreak: false,
};

const SIX = [101, 102, 103, 104, 105, 106].map((id) => ({ id }));

describe('start-of-quest cuts by slot', () => {
  it('is empty without a team, and a list per slot with nothing to cut', () => {
    expect(buildStartOfQuestCutsBySlot(null, NONE)).toEqual([]);
    expect(buildStartOfQuestCutsBySlot(result(SIX), NONE)).toEqual([[], [], [], [], [], []]);
  });

  describe('the event cut', () => {
    it('goes to the units on the Boosted list, and only those', () => {
      const cuts = buildStartOfQuestCutsBySlot(result(SIX), {
        ...NONE,
        eventCutTurns: 10,
        boostedCharacterIds: [103, 106, 999],
      });

      expect(cuts.map((slot) => slot.map((part) => part.turns))).toEqual([
        [],
        [],
        [10],
        [],
        [],
        [10],
      ]);
      expect(cuts[2]).toEqual([{ source: 'event', turns: 10, fromName: null }]);
    });

    it('goes to every unit when the player gives it to the whole team', () => {
      const cuts = buildStartOfQuestCutsBySlot(result(SIX), {
        ...NONE,
        eventCutTurns: 10,
        eventCutWholeTeam: true,
      });

      expect(cuts.every((slot) => slot.length === 1 && slot[0]?.source === 'event')).toBe(true);
    });

    it('reaches nobody at zero', () => {
      const cuts = buildStartOfQuestCutsBySlot(result(SIX), {
        ...NONE,
        eventCutWholeTeam: true,
      });

      expect(cuts.flat()).toEqual([]);
    });
  });

  describe('Captain and Friend Captain', () => {
    it('applies the Captain\'s cut to whoever its text names', () => {
      const cuts = buildStartOfQuestCutsBySlot(
        result([
          {
            id: 101,
            captainAbility:
              'Reduces Special Cooldown of Slasher characters by 2 turns at the start of the fight',
          },
          { id: 102, classes: ['Slasher'] },
          { id: 103, classes: ['Fighter', 'Slasher'] },
          { id: 104, classes: ['Shooter'] },
        ]),
        NONE,
      );

      expect(cuts.map((slot) => slot.map((part) => `${part.source}:${part.turns}`))).toEqual([
        [],
        ['captain:2'],
        ['captain:2'],
        [],
      ]);
    });

    it('leaves the Captain out of its own "all other characters"', () => {
      const cuts = buildStartOfQuestCutsBySlot(
        result([
          {
            id: 3792,
            captainAbility:
              'Reduces Special Cooldown of all other characters by 1 turn at the start of the fight',
          },
          { id: 102 },
        ]),
        NONE,
      );

      expect(cuts[0]).toEqual([]);
      expect(cuts[1]).toEqual([{ source: 'captain', turns: 1, fromName: null }]);
    });

    /*
     * The same character may hold both leader seats, and its captain ability then counts twice -
     * the project's rule, and the game's. "This character" is the SEAT, not the character id, or
     * the Friend Captain's copy would cut the Captain's special instead of its own.
     */
    it('counts the same character in both leader seats twice, each for its own seat', () => {
      const text =
        'Reduces Special Cooldown of this character by 4 turns at the start of the fight';
      const cuts = buildStartOfQuestCutsBySlot(
        result([
          { id: 3514, captainAbility: text },
          { id: 3514, captainAbility: text },
          { id: 103 },
        ]),
        NONE,
      );

      expect(cuts).toEqual([
        [{ source: 'captain', turns: 4, fromName: null }],
        [{ source: 'friendCaptain', turns: 4, fromName: null }],
        [],
      ]);
    });
  });

  describe('the ship', () => {
    it('counts a ship cut, timed or not, for every unit it names', () => {
      const cuts = buildStartOfQuestCutsBySlot(
        result(
          SIX,
          'Reduces cooldown of all specials by 1 turn, boosts ATK of Slasher and Free Spirit characters by 1.6x',
        ),
        NONE,
      );

      expect(cuts.every((slot) => slot.length === 1 && slot[0]?.source === 'ship')).toBe(true);
    });
  });

  describe('what Limit Break unlocks', () => {
    const team = result([
      {
        id: 4181,
        name: 'Onion & Pepper & Carrot',
        sailorAbilities: [
          'Reduces Special Cooldown of this character by 5 turns at the start of the fight.. Restores Special Cooldown of this character by 3 turns when it is rewinded.',
        ],
      },
      {
        id: 3792,
        name: 'Nico Robin',
        sailorAbilities: [
          'Reduces Special Cooldown of all characters by 1 turn at the start of the fight',
        ],
        potentialAbilities: [
          {
            Name: 'Cooldown Reduction',
            description: [
              'Reduces Special Cooldown of this character by 9 turns at the start of the fight',
            ],
          },
        ],
      },
      {
        id: 3613,
        name: 'Hancock & Nami & Robin',
        sailorAbilities: [
          'Reduces Special Cooldown of all characters by 1 turn at the start of the fight',
        ],
        potentialAbilities: [
          {
            Name: 'Cooldown Reduction',
            description: [
              "Reduces character's Special charge time by 3 turns at the start of the fight",
            ],
          },
        ],
      },
    ]);

    it('counts nothing of it until the player says the units are Limit Broken', () => {
      expect(buildStartOfQuestCutsBySlot(team, NONE).flat()).toEqual([]);
    });

    it("counts crewmates and the Cooldown Reduction potential, but never the Friend Captain's own", () => {
      const cuts = buildStartOfQuestCutsBySlot(team, { ...NONE, countLimitBreak: true });

      // Slot 1 is the borrowed Friend Captain: its Crewmate Ability and potential do not count.
      const read = cuts.map((slot) =>
        slot.map((part) => `${part.source}:${part.turns}:${part.fromName ?? ''}`),
      );

      expect(read).toEqual([
        ['crewmate:5:Onion & Pepper & Carrot', 'crewmate:1:Hancock & Nami & Robin'],
        ['crewmate:1:Hancock & Nami & Robin'],
        ['crewmate:1:Hancock & Nami & Robin', 'limitBreak:3:'],
      ]);
    });
  });

  it('lists the sources in reading order: event, Captain, Friend Captain, crewmate, ship, Limit Break', () => {
    const allCharacters =
      'Reduces Special Cooldown of all characters by 1 turn at the start of the fight';
    const cuts = buildStartOfQuestCutsBySlot(
      result(
        [
          { id: 101, captainAbility: allCharacters },
          { id: 102, captainAbility: allCharacters },
          {
            id: 103,
            sailorAbilities: [allCharacters],
            potentialAbilities: [
              {
                Name: 'Cooldown Reduction',
                description: [
                  'Reduces Special Cooldown of this character by 5 turns at the start of the fight',
                ],
              },
            ],
          },
        ],
        'Reduces cooldown of all specials by 1 turn at the start of the fight',
      ),
      { ...NONE, eventCutTurns: 10, eventCutWholeTeam: true, countLimitBreak: true },
    );

    expect(cuts[2]?.map((part) => part.source)).toEqual([
      'event',
      'captain',
      'friendCaptain',
      'crewmate',
      'ship',
      'limitBreak',
    ]);
  });
});

describe('the event cut the player types', () => {
  it.each([
    [10, 10],
    [-10, 10],
    [7.9, 7],
    [0, 0],
    [500, MAXIMUM_EVENT_CUT_TURNS],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('reads %s as %s', (input, expected) => {
    expect(clampEventCutTurns(input)).toBe(expected);
  });
});

import { describe, expect, it } from 'vitest';

import {
  readStartOfQuestCooldownCuts,
  startOfQuestCutReaches,
  type StartOfQuestCooldownCut,
  type StartOfQuestCutTarget,
} from './start-of-quest-cooldown-cut.utils';

/*
 * 869f63gm7. Every text below is shipped text from the dataset, cut to the sentence that matters,
 * with the character or ship id beside it, so a failure names a real unit rather than an invented
 * phrasing. Measured over the whole dataset on 2026-09-25: an amount is read for 597 Captains, 26
 * crewmates, 138 of the 139 Cooldown Reduction potentials and 16 of the 66 ships.
 */

const ALL = { kind: 'all' } as const;
const SELF = { kind: 'self' } as const;

function listed(
  types: string[] = [],
  classes: string[] = [],
  tags: string[] = [],
): StartOfQuestCooldownCut['scope'] {
  return { kind: 'listed', types, classes, tags } as StartOfQuestCooldownCut['scope'];
}

function unit(
  type: string,
  classes: string[],
  characterTags: string[] = [],
): StartOfQuestCutTarget {
  return { type, classes, detail: { characterTags } };
}

describe('reading a start-of-quest cooldown cut', () => {
  it('reads the common Captain phrasing with its amount and its target', () => {
    // #1519
    expect(
      readStartOfQuestCooldownCuts(
        'Reduces Special Cooldown of all characters by 1 turn at the start of the fight',
      ),
    ).toEqual([{ turns: 1, scope: ALL }]);
  });

  it('keeps a Type, a class and a tag target apart', () => {
    // #4034, #4379
    expect(
      readStartOfQuestCooldownCuts(
        'Reduces Special Cooldown of [INT], Powerhouse, and Driven characters by 1 turn at the start of the fight, reduces Special Cooldown of this character by 3 turns at the start of the fight, boosts ATK of [INT], Powerhouse and Driven characters by 4.5x',
      ),
    ).toEqual([
      { turns: 1, scope: listed(['INT'], ['Powerhouse', 'Driven']) },
      { turns: 3, scope: SELF },
    ]);
    expect(
      readStartOfQuestCooldownCuts(
        'Reduces Special Cooldown of [Five Elders] and [Celestial Dragon] characters by 15 turns at the start of the fight, boosts ATK of [Five Elders], [Celestial Dragon] and [Navy] characters by 1.1x',
      ),
    ).toEqual([{ turns: 15, scope: listed([], [], ['five elders', 'celestial dragon']) }]);
  });

  it('reads "all other characters" as everyone but the unit itself', () => {
    // #3792
    expect(
      readStartOfQuestCooldownCuts(
        'Reduces Special Cooldown of all other characters by 1 turn at the start of the fight, boosts ATK of [QCK], Cerebral and Free Spirit characters by 5.25x',
      ),
    ).toEqual([{ turns: 1, scope: { kind: 'allOthers' } }]);
  });

  it('reads "to MAX" as the whole cooldown, and lets one timing cover two joined cuts', () => {
    // #3533
    expect(
      readStartOfQuestCooldownCuts(
        'Reduces Special Cooldown of all characters by 2 turns and advances Special Cooldown of this character to MAX at the start of the fight. Reduces Special Cooldown of this character by 5 turns at the start of Stage 3.',
      ),
    ).toEqual([
      { turns: 2, scope: ALL },
      { turns: null, scope: SELF },
    ]);
  });

  it('times a list of effects by a "Launches the following effect at start of fight:" header', () => {
    // #4557
    expect(
      readStartOfQuestCooldownCuts(
        'Launches the following effect at start of fight: reduces Special Cooldown of [Straw Hat Pirates] and [Four Emperors] characters by 5 turns, reduces Special Cooldown of [DEX] and Fighter characters by 2 turns, and reduces VS Gauge of all characters by 2.',
      ),
    ).toEqual([
      { turns: 5, scope: listed([], [], ['straw hat pirates', 'four emperors']) },
      { turns: 2, scope: listed(['DEX'], ['Fighter']) },
    ]);
  });

  it('shares a timing at the end of a list of reductions', () => {
    // #4118
    expect(
      readStartOfQuestCooldownCuts(
        "Reduces crew's current HP by 25%, reduces Special Cooldown of all characters by 3 turns, and reduces Switch Effect of this character by 3 at the start of the fight.",
      ),
    ).toEqual([{ turns: 3, scope: ALL }]);
  });

  it('keeps the amount that holds without the condition, like the Captain boost grammar', () => {
    // #4536
    expect(
      readStartOfQuestCooldownCuts(
        'Reduces Special Cooldown of [STR] and [DEX] characters by 2 turns, by 3 turns instead if they are a Free Spirit character, at the start of the fight, boosts ATK of [STR], [DEX] and Free Spirit characters by 5x',
      ),
    ).toEqual([{ turns: 2, scope: listed(['STR', 'DEX']) }]);
  });

  it('does not let a boost condition later in the clause gate the cut', () => {
    // #652
    expect(
      readStartOfQuestCooldownCuts(
        'Reduces Special Cooldown of all characters by 1 turn at the start of the fight, boosts ATK of [DEX] characters by 2x if they have Matching orbs',
      ),
    ).toEqual([{ turns: 1, scope: ALL }]);
  });

  describe('refuses what the text does not settle', () => {
    it.each([
      [
        'a condition on the crew (#1433)',
        'If your crew has 6 Powerhouse characters, reduces Special Cooldown of Powerhouse characters by 1 turn at the start of the fight, boosts ATK of Powerhouse characters by 3x.',
      ],
      [
        'a condition after a header (#4476)',
        'Launches the following effect at start of fight: if there is a [STR], [DEX], [QCK], [PSY] and [INT] character in your crew, reduces Special Cooldown of Slasher and Striker characters by 5 turns.',
      ],
      [
        'a condition standing before the comma',
        'Boosts ATK of Slasher characters by 4x, and if your crew has 6 Slasher characters, reduces Special Cooldown of Slasher characters by 1 turn at the start of the fight.',
      ],
      [
        // Constructed: in the shipped text an inline condition only ever arrives as an "instead"
        // rider, which keeps its base amount. This pins the guard for the day one does not.
        'a condition inside the cut itself',
        'Reduces Special Cooldown of all characters by 1 turn at the start of the fight if your crew has 6 Slasher characters.',
      ],
      [
        'a percentage (#4154)',
        'Reduces Special Cooldown of [DEX], Shooter and Free Spirit characters by 50% of Max Cooldown, rounded down, at the start of the fight.',
      ],
      [
        "the ship's own special (#4194)",
        'Reduces Special Cooldown of Ship by 5 turns at the start of the fight, boosts ATK of Powerhouse characters by 3.5x.',
      ],
      [
        'a cut on another trigger (#3794)',
        'Changes orbs of all characters into [TND] orbs at the start of the fight. When any other Fighter or Free Spirit character uses a special, reduces special cooldown of this character by 1 turn',
      ],
      [
        'a restore on rewind (#3067)',
        'Restores Special Cooldown of this character by 2 turns when it is rewinded. Changes orbs of all characters into [RCV] orbs at the start of the fight',
      ],
      [
        'a target it cannot read (#4314, cost)',
        'Reduces Special Cooldown of Cost 40 or lower characters by 5 turns at the start of the fight.',
      ],
      [
        'a cut with no timing, outside a ship',
        'Reduces Special Cooldown of all characters by 1 turn.',
      ],
    ])('%s', (_label, text) => {
      expect(readStartOfQuestCooldownCuts(text)).toEqual([]);
    });
  });

  describe('Captain branches', () => {
    it('reads the Standard Captain and Always Active, never Powered Up', () => {
      expect(
        readStartOfQuestCooldownCuts(
          'Always Active: Reduces Special Cooldown of all characters by 1 turn at the start of the fight. Standard Captain: Reduces Special Cooldown of Slasher characters by 2 turns at the start of the fight. Powered Up Captain: Reduces Special Cooldown of all characters by 5 turns at the start of the fight.',
        ),
      ).toEqual([
        { turns: 1, scope: ALL },
        { turns: 2, scope: listed([], ['Slasher']) },
      ]);
    });

    it('reads the first Captain branch when there is no Standard Captain', () => {
      // #3895
      expect(
        readStartOfQuestCooldownCuts(
          'Always Active: Boosts HP of Slasher and Free Spirit characters by 1.5x. Sheathed Captain: Reduces Special Cooldown of [STR], [DEX], [QCK] characters by 2 turns at the start of the fight, reduces Special Cooldown of Slasher and Free Spirit characters by 1 turn at the start of the fight. Enma Captain: Reduces Special Cooldown of all characters by 3 turns at the start of the fight.',
        ),
      ).toEqual([
        { turns: 2, scope: listed(['STR', 'DEX', 'QCK']) },
        { turns: 1, scope: listed([], ['Slasher', 'Free Spirit']) },
      ]);
    });

    it('leaves out a Boosted Ability, which is event state', () => {
      // #3737
      expect(
        readStartOfQuestCooldownCuts(
          'Boosts ATK of [STR], Slasher and Powerhouse characters by 3.5x and reduces Special Cooldown of [STR], Slasher and Powerhouse characters by 1 turn at the start of the fight. Boosted Ability: Boosts ATK of [STR], Slasher and Powerhouse characters by 5.25x, reduces Special Cooldown of [STR], Slasher and Powerhouse characters by 2 turns at the start of the fight.',
        ),
      ).toEqual([{ turns: 1, scope: listed(['STR'], ['Slasher', 'Powerhouse']) }]);
    });
  });

  describe('crewmates and potentials', () => {
    it('reads a crewmate cut out of the joined Crewmate Ability text', () => {
      // #4496
      expect(
        readStartOfQuestCooldownCuts(
          'Changes orbs of all characters into [RCV] orbs at the start of the fight.. Reduces ATK Down duration by 1 turn, and reduces Special Cooldown of this character by 3 turns at the start of the fight.',
        ),
      ).toEqual([{ turns: 3, scope: SELF }]);
    });

    it.each([
      // #312 and #3974 - the two wordings of the Cooldown Reduction potential.
      ['Reduces Special Cooldown of this character by 9 turns at the start of the fight', 9],
      ["Reduces character's Special charge time by 3 turns at the start of the fight", 3],
    ])('reads the Cooldown Reduction potential "%s"', (text, turns) => {
      expect(readStartOfQuestCooldownCuts(text)).toEqual([{ turns, scope: SELF }]);
    });

    it('refuses the one Cooldown Reduction potential that is not a start cut (#3968)', () => {
      expect(
        readStartOfQuestCooldownCuts(
          "Once per adventure, reduces character's Special charge time by 5 turns after character uses Special",
        ),
      ).toEqual([]);
    });
  });

  describe('ships', () => {
    it.each([
      // #10, #12, #28, #29
      [
        'Reduces cooldown of all specials by 1 turn at the start of the fight, boosts ATK of QCK characters by 1.5x',
        1,
        ALL,
      ],
      [
        'Boosts ATK of Shooter characters by 1.5x and their HP by 1.3x, reduces cooldown of Shooter specials by 1 turn at the start of the fight',
        1,
        listed([], ['Shooter']),
      ],
      [
        'Boosts ATK of Shooter characters by 1.55x and their HP by 1.2x, reduces cooldown of Shooter characters specials by 2 turns at the start of the fight. Special: Cuts the current HP of each enemy by 7% (Cooldown: 15 turns).',
        2,
        listed([], ['Shooter']),
      ],
      [
        'Reduces special cooldown of Striker characters by 1 at the start of the adventure. Special: Reduces any damage received above 10,000 HP by 97% (Cooldown: 17 turns).',
        1,
        listed([], ['Striker']),
      ],
    ])('reads "%s"', (text, turns, scope) => {
      expect(readStartOfQuestCooldownCuts(text)).toEqual([{ turns, scope }]);
    });

    it('reads a ship cut with no timing only when asked to, and never its Special', () => {
      // #56
      const text =
        'Reduces cooldown of all specials by 1 turn, boosts captain\'s RCV by 500. Special: Reduces Special Cooldown of [PSY] characters by 1 turn (Cooldown: 10 turns).';

      expect(readStartOfQuestCooldownCuts(text)).toEqual([]);
      expect(readStartOfQuestCooldownCuts(text, { allowUntimed: true })).toEqual([
        { turns: 1, scope: ALL },
      ]);
    });

    it('reads only the Base Ability of a ship whose other abilities need boosting', () => {
      // #62
      expect(
        readStartOfQuestCooldownCuts(
          'Boosted Ability 1: At the start of the adventure, all specials start at MAX charge. Boosts ATK by 1.6x. Boosted Ability 2: Reduces Special Cooldown of all characters by 2 turns at the start of the fight, boosts ATK by 1.6x. Base Ability: Boosts ATK by 1.5x and makes PERFECTs easier to hit.',
          { allowUntimed: true },
        ),
      ).toEqual([]);
    });
  });

  it('returns nothing for no text at all', () => {
    expect(readStartOfQuestCooldownCuts(null)).toEqual([]);
    expect(readStartOfQuestCooldownCuts('')).toEqual([]);
  });
});

describe('who a start-of-quest cut reaches', () => {
  const cut = (scope: StartOfQuestCooldownCut['scope']): StartOfQuestCooldownCut => ({
    turns: 1,
    scope,
  });

  it('reaches everyone, everyone else, or only the unit itself', () => {
    const target = unit('STR', ['Fighter']);

    expect(startOfQuestCutReaches(cut(ALL), target, true)).toBe(true);
    expect(startOfQuestCutReaches(cut({ kind: 'allOthers' }), target, true)).toBe(false);
    expect(startOfQuestCutReaches(cut({ kind: 'allOthers' }), target, false)).toBe(true);
    expect(startOfQuestCutReaches(cut(SELF), target, true)).toBe(true);
    expect(startOfQuestCutReaches(cut(SELF), target, false)).toBe(false);
  });

  it('reads a listed target as a union of Types, classes and tags', () => {
    const scope = listed(['QCK'], ['Fighter'], ['straw hat pirates']);

    expect(startOfQuestCutReaches(cut(scope), unit('QCK', ['Slasher']), false)).toBe(true);
    expect(startOfQuestCutReaches(cut(scope), unit('STR', ['Fighter', 'Driven']), false)).toBe(
      true,
    );
    expect(
      startOfQuestCutReaches(cut(scope), unit('INT', ['Cerebral'], ['Straw Hat Pirates']), false),
    ).toBe(true);
    expect(startOfQuestCutReaches(cut(scope), unit('INT', ['Cerebral'], ['Navy']), false)).toBe(
      false,
    );
  });

  it('reaches a dual-Type unit when either Type is listed', () => {
    expect(startOfQuestCutReaches(cut(listed(['DEX'])), unit('QCK,DEX', ['Slasher']), false)).toBe(
      true,
    );
  });
});

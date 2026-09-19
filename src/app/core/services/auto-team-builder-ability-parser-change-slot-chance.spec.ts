import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/*
 * change_slot_chance on the captain source (869f13c62). OPTC-DB writes this one effect in three
 * shapes, and the matcher read only the first:
 *
 *   - "boosts chances of getting <orbs> orbs"                        the canonical spelling
 *   - "boosts chances of <scope> getting ..." / "boosts chances
 *     <scope> of getting ..."                                        S-Shark #4132, Fukaboshi #1725
 *   - "increase the rate of <orbs> orbs" / "boosts the rate of ..."  Vinsmoke Judge #1831, #1832,
 *                                                                    #2138, Luffy #2870, and Judge's
 *                                                                    own special
 *
 * OPTC-DB names the resulting buff "Orb Rate Up"; its opposite, "Orb Rate Down", is the
 * "reduces/lowers chances of getting" drawback, which must stay out.
 *
 * Its own file rather than the tail of auto-team-builder-ability-parser.spec.ts, so parallel
 * audits never append to the same place.
 */

type ParserSource = 'specialText' | 'superSpecialText' | 'captainAbility' | 'sailorAbilities';

let analyzeBuilderAbilityText: (
  value: unknown,
  source: ParserSource,
) => Array<{ key: string; source: ParserSource }>;
let enrichCharactersWithBuilderAbilities: (
  characters: Array<{
    id: number;
    detail: {
      specialText: string | null;
      captainAbility: string | null;
      captainAbilityVariants?: Array<{ key: string; label: string; text: string }>;
      builderAbilities: Array<Record<string, unknown>>;
    };
  }>,
  options?: { logger?: ((message: string) => void) | null },
) => Promise<Array<{ key: string; captainAbilityMatchingCharacterIds?: number[] }>>;

beforeAll(async () => {
  ({ analyzeBuilderAbilityText, enrichCharactersWithBuilderAbilities } = await import(
    pathToFileURL(resolve(process.cwd(), 'scripts/auto-team-builder-ability-parser.mjs')).href
  ));
});

function abilityKeys(text: string, source: ParserSource): string[] {
  return analyzeBuilderAbilityText(text, source).map((ability) => ability.key);
}

// Verbatim OPTC-DB texts, as the seed carries them.
const FUKABOSHI_1725_CAPTAIN =
  'Slightly boosts chances Powerhouse characters of getting Matching orbs, boosts ATK of Powerhouse characters by 1.5x';
const S_SHARK_4132_CAPTAIN =
  'Boosts HP of Fighter and Shooter characters by 1.5x, boosts ATK of Fighter and Shooter characters by 5x, by 5.5x if HP is below 30% at the start of the turn, boosts chances of Fighter and Shooter characters getting Matching orbs, reduces damage received by 10%, and makes crew immune to Blow Away.';
const JUDGE_1832_BASE_CAPTAIN =
  'Increase the rate of [PSY] orbs, reduces damage received by 15%, boosts HP of all characters by 1.25x. If there is a [STR], [DEX], [QCK], [PSY] and [INT] character in your crew, boosts ATK of all characters by 2.25x, by 3.9375x instead if they have a beneficial orb.';
const JUDGE_1832_LEVEL1_CAPTAIN =
  'Increase the rate of [PSY] orbs, reduces damage received by 15%, boosts HP of all characters by 1.25x and boosts ATK of all characters by 2.5x, by 4.375x instead if they have a beneficial orb.';
const JUDGE_1832_SPECIAL =
  'Reduces Bind duration by 7 turns and boosts Orb Effects of all characters by 2x for 1 turn. If this character is the captain or the Friend captain, slightly boosts the rate of [PSY] orbs and randomly shuffles all orbs, including [BLOCK] orbs';
const LUFFY_2870_CAPTAIN =
  'If there is a [STR], [DEX], [QCK], [PSY] and [INT] character in your crew, boosts ATK of all characters by 3x, by 3.5x instead if they have a beneficial orb, and increase the rate of Matching orbs';
const SANJI_2147_CAPTAIN =
  "If your crew has only Fighter characters, boosts Chain Multiplier Growth Rate by 4x and boosts ATK of Fighter characters by 1.75x. Lowers chances of getting Matching orbs depending on the crew's current HP.";
const SANJI_2148_LEVEL1_CAPTAIN =
  "If your crew has only Fighter characters, reduces Special Cooldown of all characters by 1 turn at the start of the fight, boosts Chain Multiplier Growth Rate by 4x and boosts ATK of Fighter characters by 1.75x and their HP by 1.2x. Boosts chances of getting Matching orbs inversely depending on the crew's current HP.";

describe('change_slot_chance captain wording (869f13c62)', () => {
  it('reads the scoped spelling "boosts chances of <scope> getting ... orbs"', () => {
    for (const text of [S_SHARK_4132_CAPTAIN, FUKABOSHI_1725_CAPTAIN]) {
      expect(abilityKeys(text, 'captainAbility')).toContain('change_slot_chance');
    }
  });

  it('reads the "rate of <orbs> orbs" spelling, on captains and on Judge\'s special', () => {
    for (const [text, source] of [
      [JUDGE_1832_BASE_CAPTAIN, 'captainAbility'],
      [LUFFY_2870_CAPTAIN, 'captainAbility'],
      [JUDGE_1832_SPECIAL, 'specialText'],
    ] as const) {
      expect(abilityKeys(text, source)).toContain('change_slot_chance');
    }
  });

  it('keeps the drawback direction and every non-orb chance or rate out', () => {
    for (const [text, source] of [
      // Orb Rate Down: the drawback direction, in both shapes upstream uses.
      [SANJI_2147_CAPTAIN, 'captainAbility'],
      [
        'Boosts ATK of Shooter characters by 2.5x-3.25x based on the timing of the attack of the previous unit in the chain and recovers 1,000 HP at the end of each turn. Greatly reduces chances of getting [TND] and [RCV] orbs.',
        'captainAbility',
      ],
      // A chance that is not an orb chance (Baccarat #1167, Katakuri #2112).
      [
        'Boosts ATK of all characters by 1.2x. Gives chance of duplicating a drop upon completion of the island.',
        'captainAbility',
      ],
      [
        'Boosts ATK of Fighter, Striker, Shooter, Cerebral and Powerhouse characters by 1.825x, reduces damage received by 20% and makes [QCK], [PSY], [RCV] and [TND] orbs beneficial for all characters. has a chance to ignore Debuff Protection and delays all enemies by 1 turn based on damage dealt in previous turn.',
        'captainAbility',
      ],
      // Removing the orb-rate buffs is a different effect (Don Krieg #1489).
      [
        "Deals 20x character's ATK in [STR] damage to one enemy and removes any Orb Rate Up and Orb Rate Down Buffs",
        'specialText',
      ],
      // Not upstream wording: pins the verb gate on the new "rate" spelling, and the bounded
      // scope gap, which must not run past another effect verb into a drawback.
      ['Reduces the rate of [INT] orbs', 'captainAbility'],
      ['Boosts chances of a Critical Hit and reduces chances of getting [INT] orbs', 'captainAbility'],
    ] as const) {
      expect(abilityKeys(text, source)).not.toContain('change_slot_chance');
    }
  });

  it('publishes both new spellings as captain matches, Limit Break variants included', async () => {
    const catalog = await enrichCharactersWithBuilderAbilities(
      [
        {
          id: 901725,
          detail: {
            specialText: null,
            captainAbility: FUKABOSHI_1725_CAPTAIN,
            captainAbilityVariants: [
              { key: 'captain', label: 'Captain Ability', text: FUKABOSHI_1725_CAPTAIN },
            ],
            builderAbilities: [],
          },
        },
        {
          id: 901832,
          detail: {
            specialText: null,
            captainAbility: JUDGE_1832_BASE_CAPTAIN,
            captainAbilityVariants: [
              { key: 'base', label: 'Base Captain Ability', text: JUDGE_1832_BASE_CAPTAIN },
              {
                key: 'level1',
                label: 'Limit Break Level 1 Captain Ability',
                text: JUDGE_1832_LEVEL1_CAPTAIN,
              },
            ],
            builderAbilities: [],
          },
        },
        {
          // The drawback in the base text, the boost only in the Limit Break variant.
          id: 902148,
          detail: {
            specialText: null,
            captainAbility: SANJI_2147_CAPTAIN,
            captainAbilityVariants: [
              { key: 'base', label: 'Base Captain Ability', text: SANJI_2147_CAPTAIN },
              {
                key: 'level1',
                label: 'Limit Break Level 1 Captain Ability',
                text: SANJI_2148_LEVEL1_CAPTAIN,
              },
            ],
            builderAbilities: [],
          },
        },
        {
          id: 902147,
          detail: {
            specialText: null,
            captainAbility: SANJI_2147_CAPTAIN,
            captainAbilityVariants: [
              { key: 'captain', label: 'Captain Ability', text: SANJI_2147_CAPTAIN },
            ],
            builderAbilities: [],
          },
        },
      ],
      { logger: null },
    );

    expect(
      catalog.find((item) => item.key === 'change_slot_chance')?.captainAbilityMatchingCharacterIds,
    ).toEqual([901725, 901832, 902148]);
  });
});

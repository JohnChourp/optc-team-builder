import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

let analyzeBuilderAbilityText: (value: unknown, source: 'specialText' | 'captainAbility') => Array<{
  key: string;
  label: string;
  minTurns: number | null;
  isCompleteRemoval: boolean;
  slotTokens: string[];
  source: 'specialText' | 'captainAbility';
  coverageMode?: 'explicit' | 'selectedDebuff';
}>;
let extractPrimaryAbilityBranchText: (value: unknown) => string;
let enrichCharactersWithBuilderAbilities: (
  characters: Array<{
    id: number;
    detail: {
      specialText: string | null;
      captainAbility: string | null;
      builderAbilities: Array<Record<string, unknown>>;
    };
  }>,
  options?: {
    batchSize?: number;
    logger?: ((message: string) => void) | null;
    abilityCorrections?: Map<number | string, Record<string, unknown>> | null;
  },
) => Promise<Array<{ key: string; label: string }>>;

beforeAll(async () => {
  ({
    analyzeBuilderAbilityText,
    extractPrimaryAbilityBranchText,
    enrichCharactersWithBuilderAbilities,
  } = await import(
    pathToFileURL(resolve(process.cwd(), 'scripts/auto-team-builder-ability-parser.mjs')).href
  ));
});

describe('auto team builder ability parser', () => {
  it('extracts bind and despair removal with the same turn count', () => {
    expect(
      analyzeBuilderAbilityText(
        'Reduces Bind and Despair duration by 5 turns and boosts ATK of the crew by 2x for 1 turn.',
        'specialText',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        source: 'specialText',
      }),
      expect.objectContaining({
        key: 'remove_despair',
        minTurns: 5,
        slotTokens: [],
        source: 'specialText',
      }),
    ]);
  });

  it('extracts slot bind removal as a dedicated ability family', () => {
    expect(analyzeBuilderAbilityText('Reduces Slot Bind duration by 3 turns.', 'specialText')).toEqual([
      expect.objectContaining({
        key: 'remove_slot_bind',
        minTurns: 3,
        slotTokens: [],
        source: 'specialText',
      }),
    ]);
  });

  it('extracts typed slot barrier tokens from bracketed targets', () => {
    expect(
      analyzeBuilderAbilityText(
        'Removes [DEX] and [STR] Slot Barrier completely and changes orbs.',
        'specialText',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_slot_barrier',
        minTurns: 99,
        isCompleteRemoval: true,
        slotTokens: ['DEX', 'STR'],
        source: 'specialText',
      }),
    ]);
  });

  it('extracts multiple unique effects from one special text without duplicates', () => {
    expect(
      analyzeBuilderAbilityText(
        'Reduces Bind duration by 5 turns, reduces Bind duration by 5 turns and reduces Paralysis duration by 2 turns.',
        'specialText',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_bind',
        minTurns: 5,
        source: 'specialText',
      }),
      expect.objectContaining({
        key: 'remove_paralysis',
        minTurns: 2,
        source: 'specialText',
      }),
    ]);
  });

  it('extracts multiple enemy defense counters from wrapped enemy buff text', () => {
    expect(
      analyzeBuilderAbilityText(
        "Reduces enemies' ATK Up, Barrier and Damage Nullification buffs duration by 5 turns.",
        'specialText',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_enemy_atk_up',
        minTurns: 5,
        source: 'specialText',
      }),
      expect.objectContaining({
        key: 'remove_enemy_barrier',
        minTurns: 5,
        source: 'specialText',
      }),
      expect.objectContaining({
        key: 'remove_enemy_damage_nullification',
        minTurns: 5,
        source: 'specialText',
      }),
    ]);
  });

  it('keeps only the primary special branch when upstream text concatenates alternate versions', () => {
    const text =
      "Deals 15x character's ATK in Typeless damage to one enemy, adds 0.3x to Chain multiplier for 1 turn, boosts Orb Effects of all characters by 1.5x for 1 turn. If Luffy is your Captain or Friend/Guest Captain, makes [STR], [DEX], [QCK], [PSY] and [INT] orbs beneficial for all characters for 3 turns. Deals 150x character's ATK in Typeless damage to one enemy, adds 0.7x to chain multiplier for 3 turns, boosts Orb Effects of all characters by 1.75x for 1 turn. If during that turn you score 3 PERFECT hits, boosts Orb Effects of all characters by 2x for 1 turn in the following turn. If Luffy is your Captain or Friend/Guest Captain, makes [STR], [DEX], [QCK], [PSY] and [INT] orbs beneficial for all characters for 3 turns. Reduces enemies' Increased Defense and Percent Damage Reduction duration by 2 turns.";

    expect(extractPrimaryAbilityBranchText(text)).not.toContain(
      'Reduces enemies\' Increased Defense and Percent Damage Reduction duration by 2 turns',
    );
    expect(analyzeBuilderAbilityText(text, 'specialText')).toEqual([]);
  });

  it('keeps only the primary captain branch when upstream text concatenates alternate versions', () => {
    const text =
      "Reduces Special Cooldown of all characters by 1 turn at the start of the fight, boosts ATK of all characters by 3.25x, their HP by 1.35x, makes [DEX] and [INT] orbs beneficial for all characters. If you use 'Gomu Gomu no King Cobra' for 3 turns, on this Luffy boosts ATK of all characters by 4x at the start of the chain, by 4.25x after 3 PERFECTs in a row.. Reduces Special Cooldown of this character by 4 turns at the start of the fight, reduces Special Cooldown of all characters by 2 turns at the start of the fight, boosts ATK of all characters by 4.5x, their HP by 1.45x, makes [DEX] and [INT] orbs beneficial for all characters. If you use 'Gomu Gomu no King Cobra' on this character, boosts ATK of all characters by 5x at the start of the chain, by 5.25x after 3 PERFECTs in a row and reduces Paralysis by 5 turns for 3 turns.";

    expect(extractPrimaryAbilityBranchText(text)).not.toContain(
      'reduces Paralysis by 5 turns for 3 turns',
    );
    expect(analyzeBuilderAbilityText(text, 'captainAbility')).toEqual([]);
  });

  it.each([
    [
      'increased defense',
      'Reduces enemies increased defense duration by 4 turns.',
      'remove_enemy_increased_defense',
      4,
    ],
    [
      'end of turn damage percent cut',
      'Reduces end of turn damage/percent cut duration by 6 turns.',
      'remove_enemy_end_of_turn_damage_percent_cut',
      6,
    ],
    [
      'end of turn heal',
      'Reduces enemy end of turn heal duration by 4 turns.',
      'remove_enemy_end_of_turn_heal',
      4,
    ],
    [
      'orb-based damage reduction',
      'Reduces orb-based damage reduction duration by 3 turns.',
      'remove_enemy_orb_based_damage_reduction',
      3,
    ],
    [
      'chain multiplier limit',
      'Reduces chain multiplier limit duration by 5 turns.',
      'remove_chain_multiplier_limit',
      5,
    ],
    [
      'healing reduction',
      'Reduces healing reduction duration by 7 turns.',
      'remove_healing_reduction',
      7,
    ],
    [
      'stun',
      'Reduces stun duration by 2 turns.',
      'remove_stun',
      2,
    ],
    [
      'enrage',
      'Reduces enemy enrage duration by 3 turns.',
      'remove_enemy_enrage',
      3,
    ],
  ])('extracts %s removal into the direct counter catalog', (_label, text, key, turns) => {
    expect(analyzeBuilderAbilityText(text, 'specialText')).toEqual([
      expect.objectContaining({
        key,
        minTurns: turns,
      }),
    ]);
  });

  it('extracts explicit pain removal from special text', () => {
    expect(
      analyzeBuilderAbilityText('Recovers HP and reduces Pain duration by 5 turns.', 'specialText'),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_pain',
        label: 'Remove Pain',
        minTurns: 5,
        coverageMode: 'explicit',
        source: 'specialText',
      }),
    ]);
  });

  it('extracts explicit pain removal from captain text', () => {
    expect(
      analyzeBuilderAbilityText(
        'Boosts ATK by 5x, reduces Pain duration by 10 turns and recovers HP at end of turn.',
        'captainAbility',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_pain',
        label: 'Remove Pain',
        minTurns: 10,
        coverageMode: 'explicit',
        source: 'captainAbility',
      }),
    ]);
  });

  it('extracts selected debuff counters as selectable pain coverage', () => {
    expect(
      analyzeBuilderAbilityText(
        'Reduces 2 selected debuffs duration by 10 turns and changes all orbs into Matching orbs.',
        'specialText',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_pain',
        label: 'Remove Pain',
        minTurns: 10,
        coverageMode: 'selectedDebuff',
        source: 'specialText',
      }),
    ]);
  });

  it('extracts singular selected debuff coverage with the actual turn count', () => {
    expect(
      analyzeBuilderAbilityText(
        'Delays all enemies by 1 turn and reduces 1 selected debuff duration by 5 turns.',
        'specialText',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_pain',
        label: 'Remove Pain',
        minTurns: 5,
        coverageMode: 'selectedDebuff',
        source: 'specialText',
      }),
    ]);
  });

  it('ignores unsupported boost-only text to avoid false positives', () => {
    expect(
      analyzeBuilderAbilityText(
        'Boosts ATK of Fighter characters by 2.5x for 1 turn and boosts Orb Effects by 2.25x for 1 turn.',
        'specialText',
      ),
    ).toEqual([]);
  });

  it('does not treat unrelated status wording as pain removal', () => {
    expect(
      analyzeBuilderAbilityText(
        'Increases duration of any Status ATK boosting buffs applied by Specials by 1 turn.',
        'specialText',
      ),
    ).toEqual([]);
  });

  it('extracts explicit NAO bypass from special text only when the effect ignores it', () => {
    expect(
      analyzeBuilderAbilityText(
        'Deals 1,000,000 Fixed True damage, ignoring Normal Attack Only, to all enemies.',
        'specialText',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'ignore_normal_attack_only',
          label: 'Ignore Normal Attack Only (NAO)',
          minTurns: null,
          slotTokens: [],
          source: 'specialText',
        }),
      ]),
    );
  });

  it('extracts explicit NAO bypass from captain text', () => {
    expect(
      analyzeBuilderAbilityText(
        "Boosts ATK by 5x and deals 10% of enemies' current HP in True damage, ignoring Normal Attack Only, to all enemies at the end of each turn.",
        'captainAbility',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'ignore_normal_attack_only',
        source: 'captainAbility',
      }),
    ]);
  });

  it('extracts fixed damage coverage from special text', () => {
    expect(
      analyzeBuilderAbilityText(
        'Deals 100,000 Fixed damage to one enemy and removes ATK DOWN duration completely.',
        'specialText',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'deal_fixed_damage',
          label: 'Deal Fixed Damage',
          minTurns: null,
          source: 'specialText',
        }),
      ]),
    );
  });

  it('extracts poison coverage from poison and toxic effects', () => {
    expect(
      analyzeBuilderAbilityText(
        'Inflicts Toxic to all enemies and poisons all enemies for 1 turn.',
        'specialText',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'inflict_poison',
        label: 'Inflict Poison',
        minTurns: null,
        source: 'specialText',
      }),
    ]);
  });

  it('extracts explicit NAO bypass from nested upgrade branches', () => {
    expect(
      analyzeBuilderAbilityText(
        {
          base: 'Deals 30% of enemies current HP in damage to all enemies.',
          llbbase:
            'If your crew has Normal Attack Only when the special is activated, deals 1,000,000 Fixed True damage, ignoring Normal Attack Only, to all enemies.',
        },
        'specialText',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'ignore_normal_attack_only',
          source: 'specialText',
        }),
      ]),
    );
  });

  it('does not treat NAO condition checks as bypass', () => {
    expect(
      analyzeBuilderAbilityText(
        'If your crew has Normal Attack Only when the special is activated, boosts ATK of Driven characters by 2.5x for 1 turn.',
        'specialText',
      ),
    ).toEqual([]);
  });

  it('preserves explicit builder abilities while deduping derived matches', async () => {
    const characters = [
      {
        id: 900000,
        detail: {
          specialText: 'Reduces Bind duration by 5 turns.',
          captainAbility: null,
          builderAbilities: [
            {
              key: 'remove_bind',
              label: 'Remove Bind',
              minTurns: 5,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
            },
          ],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual([
      expect.objectContaining({
        key: 'remove_bind',
        minTurns: 5,
        source: 'specialText',
      }),
    ]);
  });

  it('applies character-level corrections after deriving abilities', async () => {
    const characters = [
      {
        id: 2363,
        detail: {
          specialText: 'Reduces Bind duration by 5 turns.',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, {
      logger: null,
      abilityCorrections: new Map([
        [
          2363,
          {
            sourceScopes: ['specialText'],
            replaceAbilities: [],
          },
        ],
      ]),
    });

    expect(characters[0]?.detail.builderAbilities).toEqual([]);
  });

  it('preserves null minTurns for explicit existing abilities during normalization', async () => {
    const characters = [
      {
        id: 58,
        detail: {
          specialText: 'Poisons all enemies',
          captainAbility: null,
          builderAbilities: [
            {
              key: 'inflict_poison',
              label: 'Inflict Poison',
              minTurns: null,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
            },
          ],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual([
      expect.objectContaining({
        key: 'inflict_poison',
        minTurns: null,
      }),
    ]);
  });

  it('canonicalizes zero-turn explicit existing abilities before deduping derived matches', async () => {
    const kinemonSpecialText =
      'Reduces enemies\' Damage Nullification duration by 5 turns, changes all orbs, including [BLOCK] orbs, into Matching orbs and Boost ATK of [STR], Slasher and Free Spirit characters by 3x for 2 turns. If "Inherited Oden Two-Sword Style: Paradise Totsuka" or "Oden Two-Sword Style: Paradise Totsuka" was used in the same turn when special is activated, deals 1,000,000 Fixed True damage, ignoring Normal Attack Only, to all enemies, increases boost effects of ATK UP and Orb Amplification buffs by +0.25x and increases duration of any ATK boosting buffs and Orb Amplification buffs by 1 turn, including effects activated in the same Ability.';
    const characters = [
      {
        id: 3745,
        detail: {
          specialText: kinemonSpecialText,
          captainAbility: null,
          builderAbilities: [
            {
              key: 'ignore_normal_attack_only',
              label: 'Ignore Normal Attack Only (NAO)',
              minTurns: 0,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
            },
            {
              key: 'deal_fixed_damage',
              label: 'Deal Fixed Damage',
              minTurns: 0,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
            },
          ],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'ignore_normal_attack_only',
          minTurns: null,
          source: 'specialText',
        }),
        expect.objectContaining({
          key: 'deal_fixed_damage',
          minTurns: null,
          source: 'specialText',
        }),
      ]),
    );
    expect(
      characters[0]?.detail.builderAbilities.filter(
        (ability) =>
          ability &&
          typeof ability === 'object' &&
          'key' in ability &&
          (ability.key === 'ignore_normal_attack_only' || ability.key === 'deal_fixed_damage'),
      ),
    ).toHaveLength(2);
  });
});

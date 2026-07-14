import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import captainContractCases from './fixtures/captain-contract-cases.json';

let analyzeBuilderAbilityText: (
  value: unknown,
  source: 'specialText' | 'superSpecialText' | 'captainAbility' | 'sailorAbilities',
) => Array<{
  key: string;
  label: string;
  minTurns: number | null;
  isCompleteRemoval: boolean;
  slotTokens: string[];
  source: 'specialText' | 'superSpecialText' | 'captainAbility' | 'sailorAbilities';
  coverageMode?: 'explicit' | 'selectedDebuff';
  minEffectValue?: number | null;
  effectTargetScope?: 'any' | 'crew' | 'captains' | 'self' | 'subs';
}>;
let extractPrimaryAbilityBranchText: (value: unknown) => string;
let normalizeLegacyAbilityText: (value: unknown) => string;
let enrichCharactersWithBuilderAbilities: (
  characters: Array<{
    id: number;
    detail: {
      specialText: string | null;
      superSpecialText?: string | null;
      captainAbility: string | null;
      captainAbilityVariants?: Array<{ key: string; label: string; text: string }>;
      sailorAbilities?: string[];
      potentialAbilities?: Array<{ Name?: string; description?: string[] }>;
      supportData?: Array<{
        supportedCharactersText?: string;
        levelDescriptions?: string[];
      }>;
      superTandemData?: Record<string, unknown> | null;
      finalTapData?: Record<string, unknown> | null;
      rushSugoSpecialData?: Record<string, unknown> | null;
      builderAbilities: Array<Record<string, unknown> & { key?: string }>;
    };
  }>,
  options?: {
    batchSize?: number;
    logger?: ((message: string) => void) | null;
    abilityCorrections?: Map<number | string, Record<string, unknown>> | null;
  },
) => Promise<
  Array<
    Record<string, unknown> & {
      key: string;
      label: string;
      category: 'special' | 'crewmate' | 'potential' | 'support';
      groupLabel: string;
    }
  >
>;

type ParserCharacters = Parameters<typeof enrichCharactersWithBuilderAbilities>[0];

beforeAll(async () => {
  ({
    analyzeBuilderAbilityText,
    extractPrimaryAbilityBranchText,
    normalizeLegacyAbilityText,
    enrichCharactersWithBuilderAbilities,
  } = await import(
    pathToFileURL(resolve(process.cwd(), 'scripts/auto-team-builder-ability-parser.mjs')).href
  ));
});

function expectSourceOrder(filePath: string, orderedSnippets: string[]): void {
  const source = readFileSync(resolve(process.cwd(), filePath), 'utf8');
  let previousIndex = -1;

  for (const snippet of orderedSnippets) {
    const nextIndex = source.indexOf(snippet);

    expect(nextIndex, `${filePath} should contain ${snippet}`).toBeGreaterThanOrEqual(0);
    expect(nextIndex, `${snippet} should appear after the previous checkpoint`).toBeGreaterThan(
      previousIndex,
    );
    previousIndex = nextIndex;
  }
}

function extractAbilityKeys(
  abilities: Array<{
    key: string;
  }>,
): string[] {
  return abilities.map((ability) => ability.key);
}

describe('auto team builder ability parser', () => {
  it('parser contract: utility-effect', () => {
    const contractCase = getCaptainContractCase('utility-effect');
    const abilities = analyzeBuilderAbilityText(contractCase.captainAbility, 'captainAbility');

    expect(abilities, 'utility-effect parser ability metadata drifted').toEqual(
      expect.arrayContaining(
        (contractCase.expectedParserAbilities ?? []).map((ability) =>
          expect.objectContaining(ability),
        ),
      ),
    );
    expect(extractAbilityKeys(abilities), 'utility-effect should not expose stat boosts').not.toEqual(
      expect.arrayContaining(['boost_atk', 'boost_max_hp']),
    );
  });

  it('parser catalog contract: utility-effect', async () => {
    const contractCase = getCaptainContractCase('utility-effect');
    const characters: ParserCharacters = [
      {
        id: 910404,
        detail: {
          specialText: null,
          captainAbility: contractCase.captainAbility,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    for (const expectedCatalogEffect of contractCase.expectedCatalogEffects ?? []) {
      const catalogItem = catalog.find((item) => item.key === expectedCatalogEffect.key);

      expect(catalogItem, `${expectedCatalogEffect.key} catalog entry should exist`).toEqual(
        expect.objectContaining({
          captainAbilityMatchingCharacterIds: [910404],
          captainAbilityEffectMatches: expect.arrayContaining(
            expectedCatalogEffect.captainAbilityEffectMatches.map((effectMatch) =>
              expect.objectContaining(effectMatch),
            ),
          ),
        }),
      );
    }
  });

  it('normalizes legacy HTML ability text without dropping branch labels', () => {
    expect(
      normalizeLegacyAbilityText(
        '<b>Always Active: </b>Boosts HP by 1.3x.<br><b>Standard Captain: </b>Boosts ATK by 3.5x.',
      ),
    ).toBe('Always Active: Boosts HP by 1.3x. Standard Captain: Boosts ATK by 3.5x.');
  });

  it('normalizes block HTML and decodes entities exactly once', () => {
    expect(
      normalizeLegacyAbilityText(
        '<div><p><b>Always Active: </b>Boosts HP by 1.3x.</p><ul><li><b>Standard Captain: </b>Boosts ATK by 3.5x.</li></ul></div>',
      ),
    ).toBe('Always Active: Boosts HP by 1.3x. Standard Captain: Boosts ATK by 3.5x.');
    expect(
      normalizeLegacyAbilityText(
        'Keeps escaped text &amp;lt;script&amp;gt; visible.<script>Boosts ATK by 99x.</script><style>Boosts HP by 99x.</style>',
      ),
    ).toBe('Keeps escaped text &lt;script&gt; visible.');
  });

  it('enriches characters with builder abilities before generated dataset outputs are written', () => {
    expectSourceOrder('scripts/import-optc-data.mjs', [
      'await enrichCharactersWithBuilderAbilities(characters',
      'createSqlSeed(characters, ships, manifest)',
      'buildPreviewPayload(manifest.generatedAt, characters, ships)',
      'writeGeneratedDatasetFiles(',
    ]);
    expectSourceOrder('scripts/lib/manual-character-apply.mjs', [
      'await enrichCharactersWithBuilderAbilities(nextCharacters',
      'buildPreviewPayload(generatedAt, nextCharacters, ships)',
      'createSqlSeed(nextCharacters, ships, manifest)',
    ]);
  });

  it('extracts bind and despair removal with the same turn count', () => {
    expect(
      analyzeBuilderAbilityText(
        'Reduces Bind and Despair duration by 5 turns and boosts ATK of the crew by 2x for 1 turn.',
        'specialText',
      ),
    ).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it('extracts a Bind cure worded "reduces Bind duration completely"', () => {
    // RRG #4257 / S-Shark #4311 / Kizaru #4544: the "completely" pattern must
    // strip the trailing "duration" keyword (like the "by N turns" pattern) so
    // the target is "bind" (matched by remove_bind's exact rule), not
    // "bind duration" (which failed the match).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Reduces Bind duration completely on this character.', 'captainAbility'),
      ),
    ).toContain('remove_bind');
    // The same "duration completely" wording also recovers exact-match enemy-buff
    // removals (real data: Vivi & Rebecca #2600).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Removes enemies' Increased Defense and Percent Damage Reduction buffs duration completely.",
          'specialText',
        ),
      ),
    ).toContain('remove_damage_reduction');
    // Special Bind duration completely must still NOT be remove_bind.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Reduces Special Bind duration completely.', 'captainAbility'),
      ),
    ).not.toContain('remove_bind');
  });

  it('extracts paralysis and despair reduction when the upstream text drops "by" ("duration N turns")', () => {
    // OPTC-DB quirk (Luffy & Whitebeard #3728): "reduces Paralysis and Despair
    // duration 1 turn" with the "by" missing must still be detected.
    const abilities = analyzeBuilderAbilityText(
      'Boosts ATK of all characters by 3x and reduces Paralysis and Despair duration 1 turn.',
      'captainAbility',
    );

    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'remove_paralysis', minTurns: 1, source: 'captainAbility' }),
        expect.objectContaining({ key: 'remove_despair', minTurns: 1, source: 'captainAbility' }),
      ]),
    );
  });

  it('does not treat Sailor Despair as generic Despair', () => {
    const abilities = analyzeBuilderAbilityText(
      'Reduces Sailor Despair duration by 10 turns.',
      'captainAbility',
    );

    expect(abilities).toEqual([
      expect.objectContaining({
        key: 'remove_sailor_despair',
        minTurns: 10,
        source: 'captainAbility',
      }),
    ]);
    expect(extractAbilityKeys(abilities)).not.toContain('remove_despair');
  });

  it('keeps real Despair when text also includes Sailor Despair', () => {
    const abilities = analyzeBuilderAbilityText(
      'Reduces Despair and Sailor Despair duration by 6 turns.',
      'specialText',
    );

    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_despair',
          minTurns: 6,
          source: 'specialText',
        }),
        expect.objectContaining({
          key: 'remove_sailor_despair',
          minTurns: 6,
          source: 'specialText',
        }),
      ]),
    );
  });

  it('does not treat Special Bind as generic Bind', () => {
    const abilities = analyzeBuilderAbilityText(
      'Reduces Special Bind duration by 10 turns.',
      'specialText',
    );

    expect(abilities).toEqual([
      expect.objectContaining({
        key: 'remove_special_bind',
        minTurns: 10,
        source: 'specialText',
      }),
    ]);
    expect(extractAbilityKeys(abilities)).not.toContain('remove_bind');
  });

  it('extracts Paralysis and Special Bind without adding generic Bind', () => {
    const abilities = analyzeBuilderAbilityText(
      'Reduces Paralysis and Special Bind duration by 10 turns on this character.',
      'specialText',
    );

    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_paralysis',
          minTurns: 10,
          source: 'specialText',
        }),
        expect.objectContaining({
          key: 'remove_special_bind',
          minTurns: 10,
          source: 'specialText',
        }),
      ]),
    );
    expect(extractAbilityKeys(abilities)).not.toContain('remove_bind');
  });

  it('keeps real Bind when text also includes Special Bind', () => {
    expect(
      analyzeBuilderAbilityText(
        'Reduces Bind and Special Bind duration by 4 turns.',
        'specialText',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_bind',
          minTurns: 4,
          source: 'specialText',
        }),
        expect.objectContaining({
          key: 'remove_special_bind',
          minTurns: 4,
          source: 'specialText',
        }),
      ]),
    );
  });

  it('extracts slot bind removal as a dedicated ability family', () => {
    expect(
      analyzeBuilderAbilityText('Reduces Slot Bind duration by 3 turns.', 'specialText'),
    ).toEqual([
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
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_slot_barrier',
          minTurns: 99,
          isCompleteRemoval: true,
          slotTokens: ['DEX', 'STR'],
          source: 'specialText',
        }),
      ]),
    );
  });

  it('detects genuine orb-type changes but not "change the Orb Multiplier"', () => {
    // Genuine orb-type conversion → change_slots.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Changes [STR] orbs of Fighter characters into [TND] orbs.',
          'captainAbility',
        ),
      ),
    ).toContain('change_slots');

    // "change the Orb Multiplier of specific orbs" alters an orb's multiplier,
    // not its type — it must NOT be tagged as a slot/orb change (#4477).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'If a crew member uses a special to change the Orb Multiplier of specific orbs, replaces that buff with an ATK boost.',
          'captainAbility',
        ),
      ),
    ).not.toContain('change_slots');
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
      "Reduces enemies' Increased Defense and Percent Damage Reduction duration by 2 turns",
    );
    expect(analyzeBuilderAbilityText(text, 'specialText')).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_enemy_increased_defense',
        }),
      ]),
    );
  });

  it('keeps only the primary captain branch when upstream text concatenates alternate versions', () => {
    const text =
      "Reduces Special Cooldown of all characters by 1 turn at the start of the fight, boosts ATK of all characters by 3.25x, their HP by 1.35x, makes [DEX] and [INT] orbs beneficial for all characters. If you use 'Gomu Gomu no King Cobra' for 3 turns, on this Luffy boosts ATK of all characters by 4x at the start of the chain, by 4.25x after 3 PERFECTs in a row.. Reduces Special Cooldown of this character by 4 turns at the start of the fight, reduces Special Cooldown of all characters by 2 turns at the start of the fight, boosts ATK of all characters by 4.5x, their HP by 1.45x, makes [DEX] and [INT] orbs beneficial for all characters. If you use 'Gomu Gomu no King Cobra' on this character, boosts ATK of all characters by 5x at the start of the chain, by 5.25x after 3 PERFECTs in a row and reduces Paralysis by 5 turns for 3 turns.";

    expect(extractPrimaryAbilityBranchText(text)).not.toContain(
      'reduces Paralysis by 5 turns for 3 turns',
    );
    expect(analyzeBuilderAbilityText(text, 'captainAbility')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'reduce_special_charge', source: 'captainAbility' }),
        expect.objectContaining({ key: 'make_slots_favorable', source: 'captainAbility' }),
      ]),
    );
    // "boosts ATK ... at the start of the chain, by Nx" is a conditional ATK boost,
    // NOT a chain-multiplier boost — it must not be tagged multiplicative.
    expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'captainAbility'))).not.toContain(
      'chain_multiplier_multiplicative_boost',
    );
    expect(analyzeBuilderAbilityText(text, 'captainAbility')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'remove_paralysis' })]),
    );
  });

  it('detects chain_multiplier_multiplicative_boost only for genuine "chain multiplier by Nx"', () => {
    // Genuine multiplicative wording (the "Chain Multiplication" buff category).
    expect(
      extractAbilityKeys(analyzeBuilderAbilityText('boosts chain multiplier by 1.5x', 'captainAbility')),
    ).toContain('chain_multiplier_multiplicative_boost');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts the chain multiplier by 1.1x for 1 turn', 'specialText'),
      ),
    ).toContain('chain_multiplier_multiplicative_boost');
    // Growth-rate boost is a different key, not multiplicative.
    const growth = extractAbilityKeys(
      analyzeBuilderAbilityText('Boosts Chain Multiplier Growth Rate by 4x', 'captainAbility'),
    );
    expect(growth).toContain('chain_multiplier_growth_rate');
    expect(growth).not.toContain('chain_multiplier_multiplicative_boost');
  });

  it('detects special_damage_other for typeless damage incl. True/Fixed modifiers, but not pure typed True', () => {
    // Plain typeless (baseline) still matches.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("deals 20x character's ATK in typeless damage to all enemies", 'specialText'),
      ),
    ).toContain('special_damage_other');
    // Typeless with a True / Fixed True modifier between "typeless" and "damage" now matches.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("Deals 50x character's ATK in Typeless True damage to one enemy", 'specialText'),
      ),
    ).toContain('special_damage_other');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("Deals 50x character's ATK in Typeless Fixed True damage to all enemies", 'specialText'),
      ),
    ).toContain('special_damage_other');
    // Pure TYPED True / Fixed True damage (no "typeless") is a distinct axis (ignore-DEF, still typed) — NOT "Other".
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("Deals 25x character's ATK in [STR] True damage to one enemy", 'specialText'),
      ),
    ).not.toContain('special_damage_other');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Deals 200,000 Fixed True damage to one enemy', 'specialText'),
      ),
    ).not.toContain('special_damage_other');
  });

  it('detects boost_slot_effects only for the literal "Orb Effects"/"Slot Effects" grant', () => {
    // Genuine grants (modern, legacy lowercase, legacy possessive "Slot Effects").
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Boosts Orb Effects of all characters by 1.5x for 2 turns', 'captainAbility'),
      ),
    ).toContain('boost_slot_effects');
    expect(
      extractAbilityKeys(analyzeBuilderAbilityText('boosts orb effects by 1.25x for 2 turns', 'specialText')),
    ).toContain('boost_slot_effects');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("boosts [STR] and [INT] characters' slot effects by 3.25x for 3 turns", 'specialText'),
      ),
    ).toContain('boost_slot_effects');
    // Distinct orb mechanics that must NOT be tagged Boost Slot Effects (a Boost Damage key):
    //   orb drop-rate, makes-beneficial + ATK, and the RCV-orb HEAL boost.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Boosts chances of getting [PSY] orbs, boosts ATK of [PSY] characters by 2x",
          'captainAbility',
        ),
      ),
    ).not.toContain('boost_slot_effects');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'makes [RCV] orbs beneficial for all characters, boosts ATK of all characters by 2x',
          'captainAbility',
        ),
      ),
    ).not.toContain('boost_slot_effects');
    const rcvHeal = extractAbilityKeys(
      analyzeBuilderAbilityText('For 2 turns, boosts the amount healed by [RCV] orbs by 1.5x', 'specialText'),
    );
    expect(rcvHeal).not.toContain('boost_slot_effects');
    expect(rcvHeal).toContain('boost_rcv'); // the RCV-orb heal boost is a Boost RCV effect, not a damage orb-effect
  });

  it('detects percent_damage for both the "deals N% of HP damage" and "reduces enemy HP by N%" wordings', () => {
    // Canonical "deals N% of enemies' current HP in [True] damage" (captain + special).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Deals 20% of enemies' current HP in damage to all enemies at the end of each turn",
          'captainAbility',
        ),
      ),
    ).toContain('percent_damage');
    // Newer wording without "deals"/"damage": "Reduces one enemy's HP by N% (ignoring …)".
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Reduces one enemy's HP by 10% (ignoring all defensive effects), deals 200x character's ATK in [PSY] damage to enemies at end of turn for 3 turns",
          'specialText',
        ),
      ),
    ).toContain('percent_damage');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("reduces enemies' HP by 15%", 'specialText'),
      ),
    ).toContain('percent_damage');
    // Must NOT match the SELF HP-cost "Cutting special, reduces crew's current HP by N%".
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Cutting special, reduces crew's current HP by 20%",
          'specialText',
        ),
      ),
    ).not.toContain('percent_damage');
  });

  it('detects defeat_enemy only for the "instantly defeats" execute wording', () => {
    // Genuine execute (specials only): OPTC-DB "Instantly defeats all enemies with HP below N%".
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Instantly defeats all enemies with current HP equal to or below 20% their MAX HP',
          'specialText',
        ),
      ),
    ).toContain('defeat_enemy');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Has a small chance to instantly defeat each enemy', 'specialText'),
      ),
    ).toContain('defeat_enemy');
    // Conditional kill-streak captain boost ("if you defeat an enemy, ...") is NOT an execute.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'If you defeat an enemy, increases ATK boost slightly.',
          'captainAbility',
        ),
      ),
    ).not.toContain('defeat_enemy');
    // Defensive "Protects from defeat ... to one enemy" (Loss Prevention) is the opposite effect.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Protects from defeat for 1 turn and deals 1x-150x character's ATK in Typeless damage, depending on the crew's current HP, to one enemy.",
          'specialText',
        ),
      ),
    ).not.toContain('defeat_enemy');
  });

  it('detects chain_multiplier_growth_rate only for a genuine "by Nx" grant, not buff amplifiers', () => {
    // Canonical grant wording keeps matching (captain + special sources).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Boosts Chain Multiplier Growth Rate by 1.5x', 'captainAbility'),
      ),
    ).toContain('chain_multiplier_growth_rate');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'boosts Chain Multiplier Growth Rate by 1.75x for 1 turn',
          'specialText',
        ),
      ),
    ).toContain('chain_multiplier_growth_rate');
    // Amplifiers that only extend/strengthen OTHER sources' growth-rate buffs grant
    // no growth rate themselves — Edward Newgate #4216 (duration extend, "by N
    // turns") and Roger & Rayleigh & Gaban #4387 (condition + "buffs by +Nx").
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'increases duration of any Chain Multiplier Growth Rate buffs applied by Specials by 2 turns',
          'captainAbility',
        ),
      ),
    ).not.toContain('chain_multiplier_growth_rate');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'If a crew member uses a special to boost Chain Multiplier Growth Rate, increases duration of any Chain Multiplier Growth Rate buffs by 1 turn, and increases boost effects of Chain Multiplier Growth Rate buffs by +0.25x',
          'captainAbility',
        ),
      ),
    ).not.toContain('chain_multiplier_growth_rate');
    // Trigger CONDITION "you gain a ... buff" is not a grant either (Dorry & Broggy #4436).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'If your crew has 3+ [Giant] characters and you gain a Chain Multiplier Growth Rate buff, activates a follow-up special',
          'captainAbility',
        ),
      ),
    ).not.toContain('chain_multiplier_growth_rate');
  });

  it('detects boost_type_effects only for a genuine Color Affinity / Type Effects grant', () => {
    // Genuine grants keep matching.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts the Color Affinity of Fighter characters', 'captainAbility'),
      ),
    ).toContain('boost_type_effects');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts ATK by 3x, their Color Affinity by 1.75x', 'captainAbility'),
      ),
    ).toContain('boost_type_effects');
    // "boosts [Super] Type Effects of [scope]" stays via the type-effects pattern.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts Super Type Effects of [PSY] characters by 3x', 'specialText'),
      ),
    ).toContain('boost_type_effects');
    // Non-grant references to Color Affinity must NOT match: effect_boost,
    // duration extension, condition, convert, enhance-enable.
    for (const notGrant of [
      'increases boost effects of Color Affinity buffs by +0.25x',
      'increases duration of any Color Affinity buffs applied by Specials by 1 turn',
      'if a crew member uses a special with a Color Affinity buff, boosts ATK by 2x',
      'if a crew member uses a special to boost Color Affinity, increases duration of any Color Affinity buffs by 2 turns',
      'converts Color Affinity into a Stackable Color Affinity',
      'enables Color Affinity buffs to be enhanced up to 2 times',
    ]) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(notGrant, 'captainAbility'))).not.toContain(
        'boost_type_effects',
      );
    }
  });

  it('detects tap_timing_requirement across PERFECT wordings but not the orb-keep form', () => {
    // Genuine tap-timing-gated boosts (previously missed by the narrow
    // "PERFECT hits" matcher).
    for (const text of [
      'boosts ATK of all characters by 3x following a chain of good > great > perfect hits',
      'boosts ATK of all characters by 3x after the 3rd PERFECT in a row',
      'boosts ATK of all characters by 3x until the first hit other than PERFECT',
      'recovers 500 HP each time you hit a PERFECT',
      'boosts ATK by 2x following a chain of perfect > perfect > perfect for 1 turn',
    ]) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'captainAbility'))).toContain(
        'tap_timing_requirement',
      );
    }
    // The ubiquitous orb-keep form ("hit a PERFECT with X, keep X's orb") is a
    // conditional orb-keep, not a tap-timing boost requirement — out of scope.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'If this character has an [RCV] orb and you hit a PERFECT with them, keep their orb for the turn',
          'sailorAbilities',
        ),
      ),
    ).not.toContain('tap_timing_requirement');
  });

  it('keeps a cumulative second conditional captain clause with a different condition', () => {
    // Kurozumi Orochi (ids 3571/3572): two independent crew-composition conditions.
    // The 3-word fingerprint used to collapse both to "if your crew" and drop the
    // second clause as a duplicate restatement, losing its make_slots_favorable.
    const text =
      'If your crew has 6 Driven characters, boosts ATK of Driven characters by 3.5x. If your crew has 5 [STR] characters, boosts HP of [STR] characters by 1.3x and makes [QCK] and [DEX] orbs beneficial for all characters.';

    expect(extractPrimaryAbilityBranchText(text)).toContain(
      'makes [QCK] and [DEX] orbs beneficial for all characters',
    );
    expect(analyzeBuilderAbilityText(text, 'captainAbility')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'make_slots_favorable',
          source: 'captainAbility',
          slotTokens: ['QCK', 'DEX'],
          effectTargetScope: 'crew',
        }),
      ]),
    );
  });

  it('still drops a same-condition powered-up restatement branch', () => {
    // Guard the non-regression direction: when two branches share the SAME
    // condition, the later (higher-magnitude) restatement must still be dropped.
    const text =
      'If HP is above 50%, boosts ATK of all characters by 2x. If HP is above 50%, boosts ATK of all characters by 3x and reduces Bind duration by 5 turns.';

    expect(extractPrimaryAbilityBranchText(text)).not.toContain('reduces Bind duration by 5 turns');
    expect(analyzeBuilderAbilityText(text, 'captainAbility')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'remove_bind' })]),
    );
  });

  it('keeps distinct captain-conditioned sailor branches instead of deduping them', () => {
    // Jabra (id 4334) sailor text: three "If your Captain is a <class> character"
    // branches. The last branch's Chain Coefficient Reduction removal was dropped
    // when all three collapsed to the same "if your captain" fingerprint.
    const text =
      'If your Captain is a Shooter character, makes [STR] orbs beneficial for Shooter characters. If your Captain is a Fighter character, makes [QCK] orbs beneficial for Fighter characters, and reduces Chain Coefficient Reduction duration by 1 turn.';

    expect(analyzeBuilderAbilityText(text, 'sailorAbilities')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'remove_chain_coefficient_reduction' }),
      ]),
    );
  });

  it('extracts representable captain ability effects without standard leader stat boosts', () => {
    const abilities = analyzeBuilderAbilityText(
      'Boosts ATK of all characters by 5x, boosts RCV of crew by 1.5x, boosts max HP by 1.3x, reduces Special Cooldown of all characters by 1 turn, reduces damage received by 20%, makes [DEX] orbs beneficial for all characters, boosts chain multiplier by 1.5x, reduces Bind duration by 5 turns and guarantees duplicating a drop upon completion of the island.',
      'captainAbility',
    );
    const abilityKeys = extractAbilityKeys(abilities);

    expect(abilityKeys).toEqual(
      expect.arrayContaining([
        'remove_bind',
        'extra_drop_any',
        'extra_drop_guaranteed',
        'chain_multiplier_multiplicative_boost',
        'reduce_damage',
        'make_slots_favorable',
        'reduce_special_charge',
      ]),
    );
    expect(abilityKeys).not.toContain('boost_atk');
    expect(abilityKeys).not.toContain('boost_rcv');
    expect(abilityKeys).not.toContain('boost_max_hp');
    expect(new Set(abilities.map((ability) => ability.source))).toEqual(
      new Set(['captainAbility']),
    );
  });

  it('detects reduce_special_charge only when "reduces" directly governs "special cooldown"', () => {
    // Canonical OPTC-DB wording (crew-scoped and self-scoped) — must match.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Reduces Special Cooldown of all characters by 2 turns at the start of the fight, boosts ATK of all characters by 4x.',
          'captainAbility',
        ),
      ),
    ).toContain('reduce_special_charge');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Reduces Special Cooldown of this character by 3 turns at the start of the fight.',
          'captainAbility',
        ),
      ),
    ).toContain('reduce_special_charge');

    // Clause bridge: "reduces" governs Special Bind duration; the separate
    // "restores Special Cooldown ... when rewinded" (rewind-recovery) is a
    // DISTINCT mechanic and must NOT be reported as reduce_special_charge.
    const rewindBridge = analyzeBuilderAbilityText(
      'reduces Special Bind duration by 10 turns on this character and restores Special Cooldown of all characters by 2 turns when they are rewinded',
      'captainAbility',
    );
    expect(extractAbilityKeys(rewindBridge)).toContain('remove_special_bind');
    expect(extractAbilityKeys(rewindBridge)).not.toContain('reduce_special_charge');

    // HP-cost bridge on a special: "advances Special Cooldown ... to MAX" is a
    // distinct self max-charge effect, not a special-cooldown reduction.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "reduces crew's current HP by 50% crew's MAX HP and advances Special Cooldown of all characters to MAX",
          'specialText',
        ),
      ),
    ).not.toContain('reduce_special_charge');
  });

  it('detects restore_advance_special_charge for rewind-restore / advance, excluding ship scope', () => {
    // Rewind-recovery restore — matches the new key, NOT reduce_special_charge.
    const restore = extractAbilityKeys(
      analyzeBuilderAbilityText(
        'restores Special Cooldown of all characters by 2 turns when they are rewinded',
        'captainAbility',
      ),
    );
    expect(restore).toContain('restore_advance_special_charge');
    expect(restore).not.toContain('reduce_special_charge');

    // Proactive advance-to-MAX on this character — matches the new key.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'advances Special Cooldown of this character to MAX at the start of the fight',
          'captainAbility',
        ),
      ),
    ).toContain('restore_advance_special_charge');

    // Advance on a special (specialText source) is also covered.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'advances Special Cooldown of this character to MAX',
          'specialText',
        ),
      ),
    ).toContain('restore_advance_special_charge');

    // Ship special cooldown is a distinct mechanic and must be excluded.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Advances Special Cooldown of Ship to MAX at the start of the fight',
          'captainAbility',
        ),
      ),
    ).not.toContain('restore_advance_special_charge');
  });

  it('extracts structured captain utility metadata for damage reduction and favorable slots', () => {
    const abilities = analyzeBuilderAbilityText(
      'Reduces damage received by 20%, makes [RCV] orbs beneficial for all characters and makes [INT] slots favorable for this character.',
      'captainAbility',
    );

    expect(abilities.find((ability) => ability.key === 'reduce_damage')).toEqual(
      expect.objectContaining({
        minEffectValue: 20,
        effectTargetScope: 'crew',
      }),
    );
    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'make_slots_favorable',
          slotTokens: ['RCV'],
          effectTargetScope: 'crew',
        }),
        expect.objectContaining({
          key: 'make_slots_favorable',
          slotTokens: ['INT'],
          effectTargetScope: 'self',
        }),
      ]),
    );
  });

  it('preserves unknown captain damage reduction without a minimum effect value', () => {
    const abilities = analyzeBuilderAbilityText(
      'Boosts ATK of all characters by 3x and reduces damage received by ?%.',
      'captainAbility',
    );

    expect(abilities.find((ability) => ability.key === 'reduce_damage')).toEqual(
      expect.objectContaining({
        effectTargetScope: 'crew',
      }),
    );
    expect(abilities.find((ability) => ability.key === 'reduce_damage')).not.toHaveProperty(
      'minEffectValue',
    );
  });

  it('does not mis-tag glass-cannon / counter / heal clauses as reduce_damage', () => {
    // Glass-cannon downside: "reduces HP ..., Increases damage received" must NOT
    // be reduce_damage (the crew takes MORE damage). Regression for Dellinger.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'reduces HP of all characters by 20%, Increases damage received by 2x',
          'captainAbility',
        ),
      ),
    ).not.toContain('reduce_damage');
    // Counter: "reduces Despair ... and deals Nx the damage taken" is offensive, not reduction.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'reduces Despair duration by 10 turns and deals 100x the damage taken from enemies in the previous turn in [INT] damage to all enemies',
          'captainAbility',
        ),
      ),
    ).not.toContain('reduce_damage');
    // Debuff cure on a special: "Reduces ... Increase Damage Taken" is a status
    // cure (remove_increase_damage_taken), not a % reduction.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Reduces ATK DOWN and Increase Damage Taken by 2 turns', 'specialText'),
      ),
    ).not.toContain('reduce_damage');
  });

  it('excludes Minimum-/Maximum-Chain ATK Down from remove_atk_down (distinct chain debuffs)', () => {
    // "Minimum-Chain ATK Down" and "Maximum-Chain ATK Down" are DISTINCT
    // chain-conditional debuffs (OPTC-DB models them as separate matchers/
    // filters), not plain ATK Down. A plain "reduces ATK Down" cure does not
    // clear them, so the chain-only cures (Ace #4067/#4068, Burgess #4101/#4102,
    // Sanji & Reiju #4483) must NOT be tagged remove_atk_down. Mirrors
    // remove_bind excluding special/slot/orb/ship bind.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'reduces Minimum-Chain ATK Down duration by 10 turns',
          'captainAbility',
        ),
      ),
    ).not.toContain('remove_atk_down');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'reduces Chain Coefficient Reduction and Minimum-Chain ATK Down duration by 5 turns',
          'captainAbility',
        ),
      ),
    ).not.toContain('remove_atk_down');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'reduces Maximum-Chain ATK Down duration by 5 turns',
          'captainAbility',
        ),
      ),
    ).not.toContain('remove_atk_down');
    // Plain ATK Down cures still match — including a compound clause that also
    // names the chain variant (the plain segment must still register).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('reduces ATK DOWN duration by 10 turns', 'captainAbility'),
      ),
    ).toContain('remove_atk_down');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'reduces ATK Down and Minimum-Chain ATK Down duration by 3 turns',
          'captainAbility',
        ),
      ),
    ).toContain('remove_atk_down');
  });

  it('detects apply_resistance_reduction for both the "reduces" and "applies -N%" verb forms', () => {
    // Canonical enemy type/class damage-resistance-down debuff (reduces branch).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "reduces enemies' Slasher Resistance by -10% for 1 turn",
          'captainAbility',
        ),
      ),
    ).toContain('apply_resistance_reduction');
    // Same effect written with the alternate verb "applies -N% <Type> Resistance
    // to enemies" (e.g. Caesar & Monet #4126) — must not be missed.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'applies -10% [QCK] Resistance to all enemies for 1 turn',
          'specialText',
        ),
      ),
    ).toContain('apply_resistance_reduction');
    // Crew-side resistance GAINS use "boosts ... Resistance" and must NOT match
    // the enemy resistance-down key.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts Bind Resistance of all characters', 'captainAbility'),
      ),
    ).not.toContain('apply_resistance_reduction');
  });

  it('still detects genuine crew damage reduction (including the "damage take" typo)', () => {
    // Type-scoped and plain crew reductions.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Reduces damage received from [PSY] enemies by 20%', 'captainAbility'),
      ),
    ).toContain('reduce_damage');
    // Genuine reduction that co-occurs with a quoted "increases damage received"
    // penalty it removes (Orochi) must still match.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "reduces damage received by 10% and removes the following effect from this character's Captain Ability: increases damage received by 1.5x",
          'captainAbility',
        ),
      ),
    ).toContain('reduce_damage');
    // Upstream typo "damage take" (missing n) — Sanji "Grill Shot".
    const sanji = analyzeBuilderAbilityText(
      'Boosts ATK of Powerhouse characters by 2.5x and reduces damage take by 10%.',
      'captainAbility',
    );
    expect(sanji.find((a) => a.key === 'reduce_damage')).toEqual(
      expect.objectContaining({ minEffectValue: 10, effectTargetScope: 'crew' }),
    );
  });

  it('detects heal_hp across decimal RCV multipliers and the legacy "health" wording', () => {
    // Decimal RCV multiplier — the "." in "1.5x" must not break the match
    // (regression: bare [^.] stopped at the decimal and missed Marco/Rayleigh/etc.).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Boosts ATK of all characters by 5x and recovers 1.5x character's RCV in HP at the end of each turn",
          'captainAbility',
        ),
      ),
    ).toContain('heal_hp');
    // Ranged decimal multiplier (Marco).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "recovers 0.5x-3.5x character's RCV in HP at the end of each turn",
          'captainAbility',
        ),
      ),
    ).toContain('heal_hp');
    // Legacy "health" wording (Marguerite).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Boosts ATK of Shooter characters by 1.75x, recovers a small amount of health at the end of each turn',
          'captainAbility',
        ),
      ),
    ).toContain('heal_hp');
    // Plain fixed and integer forms still match.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Recovers 1,000 HP at the end of each turn', 'captainAbility'),
      ),
    ).toContain('heal_hp');
    // A max-HP boost is NOT a heal.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Boosts HP of all characters by 1.5x', 'captainAbility'),
      ),
    ).not.toContain('heal_hp');
  });

  it('detects special_damage for dealing damage, not defensive orb "less damage"', () => {
    // Genuine end-of-turn damage dealer.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Boosts ATK of all characters by 2x, deals 5x character's ATK in [STR] damage to all enemies at the end of each turn",
          'captainAbility',
        ),
      ),
    ).toContain('special_damage');
    // Counter form (deals the damage taken back to enemies).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'deals 5x the damage taken from enemies in the previous turn in [STR] damage to all enemies at the end of each turn',
          'captainAbility',
        ),
      ),
    ).toContain('special_damage');
    // "[BOMB]/[SUPERBOMB] orbs will deal N% less damage to the crew" is a defensive
    // orb-damage reduction, not the crew dealing damage — must NOT be special_damage,
    // even when a "reduces damage received" clause follows.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'makes [BOMB] and [SUPERBOMB] orbs beneficial for all characters, [BOMB] and [SUPERBOMB] orbs will deal 80% less damage to the crew, reduces damage received by 10%',
          'captainAbility',
        ),
      ),
    ).not.toContain('special_damage');
  });

  it('classifies favorable slots for non-captains as sub-member scoped', () => {
    const abilities = analyzeBuilderAbilityText(
      'Makes [RCV] orbs beneficial for non-captains.',
      'captainAbility',
    );

    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'make_slots_favorable',
          slotTokens: ['RCV'],
          effectTargetScope: 'subs',
        }),
      ]),
    );
  });

  it('detects favorable slots when the clause contains a [S. BOMB] (Super Bomb) orb token', () => {
    // The inner ". " of "[S. BOMB]" used to read as a sentence/clause boundary and
    // break the `[^.;]`-bounded matcher, dropping make_slots_favorable entirely
    // (e.g. Dr. Vegapunk - Flowers for the Deceased, id 4261).
    const abilities = analyzeBuilderAbilityText(
      'Changes all orbs into [BOMB] orbs at the start of the fight, boosts ATK of all character by 4x, makes [BOMB] and [S. BOMB] orbs beneficial for all characters, and restores Special Cooldown of all characters by 2 turns when they are rewinded.',
      'captainAbility',
    );

    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'make_slots_favorable',
          slotTokens: ['BOMB', 'SUPERBOMB'],
          effectTargetScope: 'crew',
        }),
      ]),
    );
  });

  it('extracts favorable slot tokens and scope from only the slot effect segment', () => {
    const abilities = analyzeBuilderAbilityText(
      "Makes [STR] and [QCK] orbs beneficial for all characters, recovers 0.5x this character's RCV and makes [DEX] orbs beneficial for [INT] characters.",
      'captainAbility',
    );

    expect(abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'make_slots_favorable',
          slotTokens: ['STR', 'QCK'],
          effectTargetScope: 'crew',
        }),
        expect.objectContaining({
          key: 'make_slots_favorable',
          slotTokens: ['DEX'],
        }),
      ]),
    );
    expect(abilities).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'make_slots_favorable',
          slotTokens: expect.arrayContaining(['INT']),
        }),
      ]),
    );
  });

  it('keeps captain damage reduction crew-scoped when unrelated self text appears later', () => {
    const abilities = analyzeBuilderAbilityText(
      "Reduces damage received by 30%, boosts ATK of Driven characters by 2.25x and reduces this character's ATK by 90%.",
      'captainAbility',
    );

    expect(abilities.find((ability) => ability.key === 'reduce_damage')).toEqual(
      expect.objectContaining({
        minEffectValue: 30,
        effectTargetScope: 'crew',
      }),
    );
  });

  it('extracts Territory only from provider wording', () => {
    expect(
      analyzeBuilderAbilityText(
        'Applies Territory: [QCK] to the field for 3 turns.',
        'specialText',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'territory',
          source: 'specialText',
        }),
      ]),
    );
    expect(
      analyzeBuilderAbilityText(
        'If your crew has 6+ Free Spirit characters and field has Territory: [QCK], boosts ATK of Free Spirit characters by 7x instead.',
        'captainAbility',
      ),
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: 'territory' })]));
    expect(
      analyzeBuilderAbilityText(
        'If a crew member uses a special to apply Territory: [QCK] to the field, boosts ATK by 5x.',
        'captainAbility',
      ),
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: 'territory' })]));
  });

  it('derives Super Special Territory providers from superSpecialText', async () => {
    expect(
      analyzeBuilderAbilityText(
        'Applies "Territory: Crew" to the field for 1 turn.',
        'superSpecialText',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'territory',
        source: 'superSpecialText',
      }),
    ]);

    const characters = [
      {
        id: 456100,
        detail: {
          specialText: null,
          superSpecialText: 'Applies "Territory: Crew" to the field for 1 turn.',
          captainAbility: null,
          sailorAbilities: [],
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual([
      expect.objectContaining({
        key: 'territory',
        source: 'superSpecialText',
      }),
    ]);
    expect(catalog.find((item) => item.key === 'territory')).toEqual(
      expect.objectContaining({
        availableSources: expect.arrayContaining(['superSpecialText']),
        matchingCharacterIds: [456100],
      }),
    );
  });

  it.each([
    [
      'increased defense',
      'Reduces enemies increased defense duration by 4 turns.',
      'remove_enemy_increased_defense',
      4,
    ],
    [
      'DEF Up',
      "Reduces all enemies' DEF Up duration by 5 turns.",
      'remove_enemy_increased_defense',
      5,
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
      'decrease chain multiplier growth rate',
      'Reduces decrease chain multiplier growth rate duration by 6 turns.',
      'remove_chain_coefficient_reduction',
      6,
    ],
    [
      'healing reduction',
      'Reduces healing reduction duration by 7 turns.',
      'remove_healing_reduction',
      7,
    ],
    ['stun', 'Reduces stun duration by 2 turns.', 'remove_stun', 2],
    ['enrage', 'Reduces enemy enrage duration by 3 turns.', 'remove_enemy_enrage', 3],
  ])('extracts %s removal into the direct counter catalog', (_label, text, key, turns) => {
    expect(analyzeBuilderAbilityText(text, 'specialText')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key,
          minTurns: turns,
        }),
      ]),
    );
  });

  it('extracts explicit pain removal from special text', () => {
    expect(
      analyzeBuilderAbilityText('Recovers HP and reduces Pain duration by 5 turns.', 'specialText'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_pain',
          label: 'Remove Pain',
          minTurns: 5,
          coverageMode: 'explicit',
          source: 'specialText',
        }),
      ]),
    );
  });

  it('extracts explicit pain removal from captain text', () => {
    expect(
      analyzeBuilderAbilityText(
        'Boosts ATK by 5x, reduces Pain duration by 10 turns and recovers HP at end of turn.',
        'captainAbility',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_pain',
          label: 'Remove Pain',
          minTurns: 10,
          coverageMode: 'explicit',
          source: 'captainAbility',
        }),
      ]),
    );
  });

  it('extracts guaranteed extra-drop coverage from captain text', () => {
    expect(
      analyzeBuilderAbilityText(
        'Boosts ATK of all characters by 3x and guarantees duplicating a drop upon completion of the island.',
        'captainAbility',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'extra_drop_any',
        label: 'Any Extra Drop',
        minTurns: null,
        source: 'captainAbility',
      }),
      expect.objectContaining({
        key: 'extra_drop_guaranteed',
        label: 'Guaranteed Extra Drop',
        minTurns: null,
        source: 'captainAbility',
      }),
    ]);
  });

  it('extracts chance-based extra-drop coverage without the guaranteed key', () => {
    expect(
      analyzeBuilderAbilityText(
        'Boosts ATK of all characters by 3x and gives chance of duplicating a drop upon completion of the island.',
        'captainAbility',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'extra_drop_any',
        label: 'Any Extra Drop',
        minTurns: null,
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
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_pain',
          label: 'Remove Pain',
          minTurns: 10,
          coverageMode: 'selectedDebuff',
          source: 'specialText',
        }),
      ]),
    );
  });

  it('extracts singular selected debuff coverage with the actual turn count', () => {
    expect(
      analyzeBuilderAbilityText(
        'Delays all enemies by 1 turn and reduces 1 selected debuff duration by 5 turns.',
        'specialText',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_pain',
          label: 'Remove Pain',
          minTurns: 5,
          coverageMode: 'selectedDebuff',
          source: 'specialText',
        }),
      ]),
    );
  });

  it('ignores unsupported boost-only text to avoid false positives', () => {
    expect(
      analyzeBuilderAbilityText(
        'Boosts ATK of Fighter characters by 2.5x for 1 turn and boosts Orb Effects by 2.25x for 1 turn.',
        'specialText',
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'boost_atk' }),
        expect.objectContaining({ key: 'boost_slot_effects' }),
      ]),
    );
  });

  it('does not treat unrelated status wording as pain removal', () => {
    expect(
      analyzeBuilderAbilityText(
        'Increases duration of any Status ATK boosting buffs applied by Specials by 1 turn.',
        'specialText',
      ),
    ).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: 'remove_pain' })]));
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
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'ignore_normal_attack_only',
          source: 'captainAbility',
        }),
      ]),
    );
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
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'ignore_normal_attack_only',
        }),
      ]),
    );
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

  it('generates the complete Special catalog with stable group counts and zero-match entries', async () => {
    const catalog = await enrichCharactersWithBuilderAbilities([], { logger: null });
    const specialCatalog = catalog.filter((item) => item.category === 'special');
    const groupCounts = specialCatalog.reduce<Record<string, number>>((counts, item) => {
      const groupLabel = String(item.groupLabel);
      counts[groupLabel] = (counts[groupLabel] ?? 0) + 1;
      return counts;
    }, {});

    expect(specialCatalog).toHaveLength(86);
    expect(groupCounts).toEqual({
      Damage: 6,
      'Boost Damage': 17,
      'Damage Reduction': 3,
      Slot: 4,
      'Slot Change': 4,
      'Reduce Status Effect Duration': 15,
      'Reduce Enemy Effect Duration': 9,
      'Apply Status Effect': 8,
      Reduction: 5,
      Other: 15,
    });
    expect(specialCatalog.slice(0, 3).map((item) => item.key)).toEqual([
      'special_damage',
      'deal_fixed_damage',
      'ignore_normal_attack_only',
    ]);
    expect(specialCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_sfx',
          category: 'special',
          groupLabel: 'Reduce Status Effect Duration',
          matchCount: 0,
          matchingCharacterIds: [],
        }),
      ]),
    );
  });

  it('indexes matching character ids for Special catalog entries', async () => {
    const characters: ParserCharacters = [
      {
        id: 910001,
        detail: {
          specialText: 'Reduces Bind duration by 5 turns.',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 910002,
        detail: {
          specialText: 'Boosts ATK of all characters by 2.5x for 1 turn.',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(catalog.find((item) => item.key === 'remove_bind')).toEqual(
      expect.objectContaining({
        category: 'special',
        supportsTurns: true,
        matchingCharacterIds: [910001],
        turnMatchingCharacterIds: [{ minTurns: 5, characterIds: [910001] }],
        matchCount: 1,
      }),
    );
    expect(catalog.find((item) => item.key === 'boost_atk')).toEqual(
      expect.objectContaining({
        category: 'special',
        matchingCharacterIds: [910002],
        matchCount: 1,
      }),
    );
  });

  it('tags Remove SFX from OPTC-DB "Blindness" wording across special, sailor and support', async () => {
    // In-game the enemy debuff is "Remove SFX" (hides tap-timing rings); OPTC-DB
    // ability text always names it "Blindness". The picker exposes `remove_sfx`,
    // so Blindness-cleanse wording must populate the SFX keys on every surface.
    const characters: ParserCharacters = [
      {
        id: 920001,
        detail: {
          specialText: 'Removes Blindness duration completely',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 920002,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: ['Reduces Blindness duration by 3 turns'],
          builderAbilities: [],
        },
      },
      {
        id: 920003,
        detail: {
          specialText: null,
          captainAbility: null,
          supportData: [
            {
              supportedCharactersText: 'Some Crew',
              levelDescriptions: [
                'Once per adventure, when an enemy inflicts you with ATK DOWN or Blindness, reduces ATK DOWN and Blindness duration by 2 turns',
              ],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(catalog.find((item) => item.key === 'remove_sfx')).toEqual(
      expect.objectContaining({
        category: 'special',
        label: 'Remove SFX',
        groupLabel: 'Reduce Status Effect Duration',
        matchingCharacterIds: expect.arrayContaining([920001]),
      }),
    );
    expect(catalog.find((item) => item.key === 'crewmate_recover_remove_sfx')).toEqual(
      expect.objectContaining({
        category: 'crewmate',
        matchingCharacterIds: expect.arrayContaining([920002]),
      }),
    );
    expect(catalog.find((item) => item.key === 'support_status_effect_recovery_remove_sfx')).toEqual(
      expect.objectContaining({
        category: 'support',
        matchingCharacterIds: [920003],
      }),
    );
    // The dead `remove_blindness` legacy key must no longer be emitted.
    expect(catalog.find((item) => item.key === 'remove_blindness')).toBeUndefined();
  });

  it('indexes structured captain utility matches in the ability catalog', async () => {
    const characters: ParserCharacters = [
      {
        id: 910003,
        detail: {
          specialText: null,
          captainAbility:
            'Reduces damage received by 10%, makes [RCV] orbs beneficial for all characters.',
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(catalog.find((item) => item.key === 'reduce_damage')).toEqual(
      expect.objectContaining({
        captainAbilityMatchingCharacterIds: [910003],
        captainAbilityEffectMatches: [
          {
            characterId: 910003,
            minEffectValue: 10,
            effectTargetScope: 'crew',
            slotTokens: [],
          },
        ],
      }),
    );
    expect(catalog.find((item) => item.key === 'make_slots_favorable')).toEqual(
      expect.objectContaining({
        supportsSlotTokens: true,
        availableSlotTokens: ['RCV'],
        captainAbilityMatchingCharacterIds: [910003],
        captainAbilityEffectMatches: [
          {
            characterId: 910003,
            effectTargetScope: 'crew',
            slotTokens: ['RCV'],
          },
        ],
      }),
    );
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

  it('derives captain abilities from structured captain variants without duplicate extra-drop matches', async () => {
    const characters: ParserCharacters = [
      {
        id: 2035,
        detail: {
          specialText: null,
          captainAbility:
            'Boosts ATK by 1.75x and guarantees duplicating a drop upon completion of the island.',
          captainAbilityVariants: [
            {
              key: 'base',
              label: 'Base Captain Ability',
              text: 'Boosts ATK by 1.75x and guarantees duplicating a drop upon completion of the island.',
            },
            {
              key: 'llbbase',
              label: 'LLB Base Captain Ability',
              text: 'Boosts ATK by 1.75x and guarantees duplicating a drop upon completion of the island.',
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'extra_drop_any',
          source: 'captainAbility',
        }),
        expect.objectContaining({
          key: 'extra_drop_guaranteed',
          source: 'captainAbility',
        }),
      ]),
    );
    expect(
      characters[0]?.detail.builderAbilities.filter(
        (ability) =>
          ability &&
          typeof ability === 'object' &&
          'key' in ability &&
          (ability.key === 'extra_drop_any' || ability.key === 'extra_drop_guaranteed'),
      ),
    ).toHaveLength(2);
  });

  it('seeds all 75 crewmate catalog entries with stable ordering even without matches', async () => {
    const catalog = await enrichCharactersWithBuilderAbilities([], { logger: null });
    const crewmateCatalog = catalog.filter((item) => item.category === 'crewmate');
    const groupCounts = new Map<string, number>();

    crewmateCatalog.forEach((item) => {
      groupCounts.set(item.groupLabel, (groupCounts.get(item.groupLabel) ?? 0) + 1);
    });

    expect(crewmateCatalog).toHaveLength(75);
    expect(crewmateCatalog[0]).toMatchObject({
      label: 'Damage Boost: STR Enemy',
      availableSources: ['sailorAbilities'],
      matchCount: 0,
    });
    expect(crewmateCatalog.at(-1)).toMatchObject({
      label: 'Hp Recovery at End of Turn',
      availableSources: ['sailorAbilities'],
      matchCount: 0,
    });
    expect(groupCounts).toEqual(
      new Map([
        ['Boost Damage', 6],
        ['Status Effect Recovery', 8],
        ['Slot', 5],
        ['Special Charge Reduction', 4],
        ['ATK Boost', 17],
        ['RCV Boost', 17],
        ['HP Boost', 17],
        ['Other', 1],
      ]),
    );
  });

  it.each([
    [
      'damage boost vs enemy type',
      'Boosts damage dealt to STR enemies by 1.1x.',
      'crewmate_damage_boost_str_enemy',
    ],
    [
      'status recovery',
      'Reduces Special Bind duration by 3 turns.',
      'crewmate_recover_special_bind',
    ],
    [
      'slot utility',
      'Makes [RCV] slots beneficial for all characters.',
      'crewmate_make_slots_favorable',
    ],
    [
      'special charge reduction',
      'Reduces Special Cooldown of this character by 2 turns at start of quest.',
      'crewmate_special_charge_start_of_quest',
    ],
    ['atk boost', 'Boosts ATK of Fighter characters by 75.', 'crewmate_atk_boost_fighter'],
    ['rcv boost', 'Boosts RCV of this character by 100.', 'crewmate_rcv_boost_self'],
    ['hp boost', 'Boosts HP of STR characters by 200.', 'crewmate_hp_boost_str'],
    [
      'end of turn recovery',
      'Recovers 1000 HP at the end of each turn.',
      'crewmate_hp_recovery_eot',
    ],
  ])('extracts crewmate %s from sailor text', (_label, text, key) => {
    expect(analyzeBuilderAbilityText(text, 'sailorAbilities')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key,
          source: 'sailorAbilities',
        }),
      ]),
    );
  });

  it('carries turn requirements onto structured crewmate recovery abilities', () => {
    expect(
      analyzeBuilderAbilityText('Reduces Special Bind duration by 3 turns.', 'sailorAbilities'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'crewmate_recover_special_bind',
          source: 'sailorAbilities',
          minTurns: 3,
        }),
      ]),
    );
  });

  it('does not add generic Bind from Garling-style Special Bind text across sources', async () => {
    const characters = [
      {
        id: 4410,
        detail: {
          specialText:
            'Deals 2,000,000 Fixed True damage, ignoring Normal Attack Only, to one enemy, and reduces Special Bind duration by 10 turns.',
          captainAbility:
            'Reduces Paralysis and Special Bind duration by 10 turns on [Five Elders] and [Celestial Dragon] characters.',
          sailorAbilities: [
            'Reduces Paralysis and Special Bind duration by 10 turns on this character; makes [RCV] and [TND] orbs beneficial for this character.',
          ],
          supportData: [
            {
              supportedCharactersText: 'Characters with cost 99 or more',
              levelDescriptions: [
                'Once per adventure, when an enemy inflicts you with Special Bind, reduces Special Bind duration by 6 turns on the supported character.',
              ],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    const abilityKeys = extractAbilityKeys(characters[0]?.detail.builderAbilities ?? []);
    expect(abilityKeys).toEqual(
      expect.arrayContaining([
        'remove_special_bind',
        'remove_paralysis',
        'crewmate_recover_special_bind',
        'crewmate_recover_paralysis',
        'support_status_effect_recovery_special_bind',
      ]),
    );
    expect(abilityKeys).not.toContain('remove_bind');
    expect(abilityKeys).not.toContain('support_status_effect_recovery_bind');
  });

  it('adds crewmate-derived builder abilities from sailor abilities to the character detail', async () => {
    const characters = [
      {
        id: 5001,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [
            'Boosts ATK of Fighter characters by 75.',
            'Reduces Special Cooldown of this character by 2 turns at start of quest.',
          ],
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'crewmate_atk_boost_fighter',
          source: 'sailorAbilities',
        }),
        expect.objectContaining({
          key: 'crewmate_special_charge_start_of_quest',
          source: 'sailorAbilities',
          minTurns: 2,
        }),
      ]),
    );
    expect(catalog.find((item) => item.key === 'crewmate_special_charge_start_of_quest')).toEqual(
      expect.objectContaining({
        supportsTurns: true,
        turnMatchingCharacterIds: [{ minTurns: 2, characterIds: [5001] }],
      }),
    );
  });

  it('seeds all 26 potential catalog entries with stable ordering even without matches', async () => {
    const catalog = await enrichCharactersWithBuilderAbilities([], { logger: null });
    const potentialCatalog = catalog.filter((item) => item.category === 'potential');
    const groupCounts = new Map<string, number>();

    potentialCatalog.forEach((item) => {
      groupCounts.set(item.groupLabel, (groupCounts.get(item.groupLabel) ?? 0) + 1);
    });

    expect(potentialCatalog).toHaveLength(26);
    expect(potentialCatalog[0]).toMatchObject({
      label: 'Super Tandem',
      availableSources: ['superTandemData'],
      matchCount: 0,
    });
    expect(potentialCatalog.at(-1)).toMatchObject({
      label: 'Damage Limit Break: Class',
      availableSources: ['potentialAbilities'],
      matchCount: 0,
    });
    expect(groupCounts).toEqual(
      new Map([
        ['Unique Abilities', 4],
        ['Status Effect Immunity', 9],
        ['Special Charge Reduction', 3],
        ['Damage Reduction', 5],
        ['Other', 5],
      ]),
    );
  });

  it('canonicalizes observed potential aliases from potential abilities', async () => {
    const characters = [
      {
        id: 6001,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          potentialAbilities: [
            { Name: 'Barrier Penetration', description: ['Ignores enemy barriers.'] },
            { Name: 'Critical Hit', description: ['Boosts critical rate.'] },
            { Name: 'Reduce Slot Bind duration', description: ['Reduces Slot Bind duration.'] },
            { Name: '[QCK] Damage Reduction', description: ['Reduces QCK damage.'] },
          ],
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'potential_barrier_pierce',
          label: 'Barrier Pierce',
          source: 'potentialAbilities',
        }),
        expect.objectContaining({
          key: 'potential_critical_atk',
          label: 'Critical ATK',
          source: 'potentialAbilities',
        }),
        expect.objectContaining({
          key: 'potential_slot_bind_resistance',
          label: 'Slot Bind Resistance',
          source: 'potentialAbilities',
        }),
        expect.objectContaining({
          key: 'potential_qck_damage_reduction',
          label: 'QCK Damage Reduction',
          source: 'potentialAbilities',
        }),
      ]),
    );
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'potential_barrier_pierce',
          matchingCharacterIds: [6001],
        }),
      ]),
    );
  });

  it('adds unique potential abilities from dedicated detail fields', async () => {
    const characters = [
      {
        id: 6002,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          potentialAbilities: [],
          superTandemData: {
            requirement: 'When a character performs Super Tandem',
            levels: [
              { level: 5, effect: 'Raises Boost Level of Slasher characters by 5 for 1 turn' },
            ],
          },
          finalTapData: {
            requirement: 'At final battle',
            levels: [{ level: 5, effect: 'Boosts base ATK by +800 for 1 turn' }],
          },
          rushSugoSpecialData: {
            requirement: 'At final battle',
            levels: [{ level: 5, effect: 'Allows to perform a Rush.' }],
          },
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'potential_super_tandem',
          source: 'superTandemData',
        }),
        expect.objectContaining({
          key: 'potential_super_tandem_boost',
          source: 'superTandemData',
          minTurns: 1,
        }),
        expect.objectContaining({
          key: 'potential_final_tap_sugo_special',
          source: 'finalTapData',
          minTurns: 1,
        }),
        expect.objectContaining({
          key: 'potential_rush_sugo_special',
          source: 'rushSugoSpecialData',
        }),
      ]),
    );
    expect(catalog.find((item) => item.key === 'potential_super_tandem_boost')).toEqual(
      expect.objectContaining({
        supportsTurns: true,
        turnMatchingCharacterIds: [{ minTurns: 1, characterIds: [6002] }],
      }),
    );
  });

  it('keeps unknown potential names unmatched and conservatively skips non-boost super tandem data', async () => {
    const characters = [
      {
        id: 6003,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          potentialAbilities: [{ Name: 'Unknown Potential', description: ['Unknown text'] }],
          superTandemData: {
            requirement: 'When a character performs Super Tandem',
            levels: [{ level: 5, effect: 'Deals typeless damage to one enemy.' }],
          },
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual([
      expect.objectContaining({
        key: 'potential_super_tandem',
        source: 'superTandemData',
      }),
    ]);
  });

  it('seeds all 67 support catalog entries with stable ordering even without matches', async () => {
    const catalog = await enrichCharactersWithBuilderAbilities([], { logger: null });
    const supportCatalog = catalog.filter((item) => item.category === 'support');
    const groupCounts = new Map<string, number>();

    supportCatalog.forEach((item) => {
      groupCounts.set(item.groupLabel, (groupCounts.get(item.groupLabel) ?? 0) + 1);
    });

    expect(supportCatalog).toHaveLength(67);
    expect(supportCatalog[0]).toMatchObject({
      label: 'End of Turn Additional Damage',
      availableSources: ['supportData'],
      matchCount: 0,
    });
    expect(supportCatalog.at(-1)).toMatchObject({
      label: 'Delay',
      availableSources: ['supportData'],
      matchCount: 0,
    });
    expect(groupCounts).toEqual(
      new Map([
        ['Damage', 1],
        ['Boost Damage', 14],
        ['Status Effect Recovery', 11],
        ['Slot', 5],
        ['Slot Change', 2],
        ['Damage Reduction', 4],
        ['Reduce Enemy Effect Duration', 12],
        ['ATK Boost', 2],
        ['RCV Boost', 2],
        ['HP Boost', 2],
        ['Other', 6],
        ['Apply Status Effect', 6],
      ]),
    );
  });

  it('parses support abilities from the highest canonical support level only', async () => {
    const characters = [
      {
        id: 7001,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          supportData: [
            {
              supportedCharactersText: 'Monkey D. Luffy',
              levelDescriptions: [
                '',
                'Boosts ATK of supported character by 1.3x for 1 turn',
                'Boosts type effects of supported character by 1.75x for 1 turn',
              ],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'support_type_effect_boost',
          source: 'supportData',
          minTurns: 1,
        }),
      ]),
    );
    expect(characters[0]?.detail.builderAbilities).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'support_atk_boost',
          source: 'supportData',
        }),
      ]),
    );
    expect(catalog.find((item) => item.key === 'support_type_effect_boost')).toEqual(
      expect.objectContaining({
        supportsTurns: true,
        turnMatchingCharacterIds: [{ minTurns: 1, characterIds: [7001] }],
      }),
    );
  });

  it('keeps support boost duration separate from status recovery turns in mixed support text', async () => {
    const characters = [
      {
        id: 7006,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          supportData: [
            {
              supportedCharactersText: 'Monkey D. Luffy',
              levelDescriptions: [
                'Boosts ATK of supported character by 1.75x for 1 turn and reduces Special Bind duration by 3 turns.',
              ],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'support_atk_boost',
          minTurns: 1,
          source: 'supportData',
        }),
        expect.objectContaining({
          key: 'support_status_effect_recovery_special_bind',
          minTurns: 3,
          source: 'supportData',
        }),
      ]),
    );
  });

  it('emits multiple support keys from one support row and uses provider ids for matching', async () => {
    const characters = [
      {
        id: 7002,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          supportData: [
            {
              supportedCharactersText: 'Zoro',
              levelDescriptions: [
                "Adds 5% of this character's base ATK and HP to the supported character's base ATK and HP. Reduces damage received by 5%.",
              ],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'support_base_atk_boost_additional',
          source: 'supportData',
        }),
        expect.objectContaining({ key: 'support_base_hp_boost_additional', source: 'supportData' }),
        expect.objectContaining({
          key: 'support_damage_reduction_permanent',
          source: 'supportData',
        }),
      ]),
    );
    expect(catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'support_base_atk_boost_additional',
          matchingCharacterIds: [7002],
        }),
      ]),
    );
  });

  it('distinguishes triggered support boosts and tap-timing enemy-effect reduction variants', async () => {
    const characters = [
      {
        id: 7003,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          supportData: [
            {
              supportedCharactersText: 'Sanji',
              levelDescriptions: [
                'Boosts ATK of supported character by 1.75x and boosts Slot Effects by 1.5x for 1 turn.',
              ],
            },
            {
              supportedCharactersText: 'Sanji',
              levelDescriptions: [
                'After scoring 3 PERFECTs, reduces enemy DEF Up duration by 1 turn.',
              ],
            },
            {
              supportedCharactersText: 'Sanji',
              levelDescriptions: ['Reduces enemy DEF Up duration by 1 turn.'],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'support_atk_boost', source: 'supportData' }),
        expect.objectContaining({ key: 'support_slot_effect_boost', source: 'supportData' }),
        expect.objectContaining({
          key: 'support_reduce_enemy_effect_turns_def_up_tap_timing',
          source: 'supportData',
        }),
        expect.objectContaining({
          key: 'support_reduce_enemy_effect_turns_def_up',
          source: 'supportData',
        }),
      ]),
    );
  });

  it('distinguishes passive and turn-bound support damage reduction wording', async () => {
    const characters = [
      {
        id: 7004,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          supportData: [
            {
              supportedCharactersText: 'Nami',
              levelDescriptions: ['Reduces damage received by 5%.'],
            },
            {
              supportedCharactersText: 'Nami',
              levelDescriptions: ['Reduces damage received by 50% for 1 turn.'],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'support_damage_reduction_permanent',
          source: 'supportData',
        }),
        expect.objectContaining({
          key: 'support_damage_reduction_turn',
          source: 'supportData',
        }),
      ]),
    );
  });

  it('keeps unknown support wording unmatched', async () => {
    const characters = [
      {
        id: 7005,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: [],
          supportData: [
            {
              supportedCharactersText: 'Usopp',
              levelDescriptions: ['Sometimes does a surprising thing with stars.'],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(characters[0]?.detail.builderAbilities).toEqual([]);
  });
});

function getCaptainContractCase(caseId: string) {
  const contractCase = captainContractCases.cases.find((item) => item.id === caseId);

  if (!contractCase) {
    throw new Error(`Missing captain contract case "${caseId}".`);
  }

  return contractCase;
}

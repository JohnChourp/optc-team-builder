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

  it('detects enemy Percent Damage Reduction removal when it is the FIRST buff after "enemies\'"', () => {
    // Regression: normalizeTargetText stripped only "enemies" and left the
    // possessive apostrophe, so the first buff after "enemies'" became a
    // "' percent damage reduction" segment that failed the exact-match matcher —
    // only a NON-first buff in the list was ever detected. #3762 (real data).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("Reduces enemies' Percent Damage Reduction duration by 3 turns.", 'captainAbility'),
      ),
    ).toContain('remove_damage_reduction');
    // First-buff plain "Damage Reduction" in a list too.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Reduces enemies' Damage Reduction and Increased Defense duration by 2 turns.",
          'specialText',
        ),
      ),
    ).toContain('remove_damage_reduction');
    // "Threshold Damage Reduction" as the first/sole buff must NOT be mis-tagged
    // as the distinct Percent-Damage-Reduction key (it stays remove_threshold_damage_reduction).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("Reduces enemies' Threshold Damage Reduction duration by 2 turns.", 'captainAbility'),
      ),
    ).not.toContain('remove_damage_reduction');
    // Crew's-OWN Percent Damage Reduction reference (a scaling clause, not a
    // duration removal) must stay excluded (#4293 Jozu/Oden variant).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Boosts ATK by 1x-2.5x, proportional to the strength of crew's Percent Damage Reduction buff, for 1 turn.",
          'captainAbility',
        ),
      ),
    ).not.toContain('remove_damage_reduction');
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

  it('folds the max-level tier when specialText concatenates a stronger version, but the captain branch stays primary-only', () => {
    const text =
      "Deals 15x character's ATK in Typeless damage to one enemy, adds 0.3x to Chain multiplier for 1 turn, boosts Orb Effects of all characters by 1.5x for 1 turn. If Luffy is your Captain or Friend/Guest Captain, makes [STR], [DEX], [QCK], [PSY] and [INT] orbs beneficial for all characters for 3 turns. Deals 150x character's ATK in Typeless damage to one enemy, adds 0.7x to chain multiplier for 3 turns, boosts Orb Effects of all characters by 1.75x for 1 turn. If during that turn you score 3 PERFECT hits, boosts Orb Effects of all characters by 2x for 1 turn in the following turn. If Luffy is your Captain or Friend/Guest Captain, makes [STR], [DEX], [QCK], [PSY] and [INT] orbs beneficial for all characters for 3 turns. Reduces enemies' Increased Defense and Percent Damage Reduction duration by 2 turns.";

    // extractPrimaryAbilityBranchText itself is unchanged: it still returns only the
    // FIRST (base 15x) tier, so the trailing enemy-debuff removal is not in it.
    expect(extractPrimaryAbilityBranchText(text)).not.toContain(
      "Reduces enemies' Increased Defense and Percent Damage Reduction duration by 2 turns",
    );
    // But a maxed character's special IS the last (150x) tier, so analyze now folds
    // the max-level tier and DOES surface its enemy-effect removal (design decision:
    // the last activation tier is canonical for a maxed unit).
    expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'specialText'))).toContain(
      'remove_enemy_increased_defense',
    );
    // captainAbility is NOT folded (multi-level tiers are a special-text mechanic), so
    // the sibling captain concatenation test below still keeps only its primary branch.
    expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'captainAbility'))).not.toContain(
      'remove_enemy_increased_defense',
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

  it('detects deal_fixed_damage across Fixed/True/Typeless modifier orderings', () => {
    for (const text of [
      'Deals 100x ATK in Fixed damage to all enemies',
      'Deals 100x ATK in Fixed True damage to all enemies',
      "Deals 56x character's ATK in Fixed True Typeless damage to one enemy", // Typeless wedged before "damage"
      "Deals 100x character's ATK in Typeless Fixed True damage to all enemies",
      'deals 9 Fixed damage to all enemies at the end of each turn', // captain end-of-turn flat Fixed damage
    ]) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'specialText'))).toContain(
        'deal_fixed_damage',
      );
    }
    // Not fixed damage: plain typeless / true damage without the "Fixed" token.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Deals 100x ATK in Typeless damage to all enemies', 'specialText'),
      ),
    ).not.toContain('deal_fixed_damage');
  });

  it('detects remove_beneficial_effect only for an offensive removal, not the "Nullifies Remove Beneficial Effects" self-protection', () => {
    // Defensive nullification of the enemy's "Remove Beneficial Effects" attack
    // (Gol D. Roger #3176 etc.) — the crew protects its OWN buffs, it does NOT
    // remove the enemy's, so it must NOT be tagged.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Nullifies Remove Beneficial Effects and Remove Accumulated Value effects once per adventure. Boosts ATK of all characters by 4.5x',
          'captainAbility',
        ),
      ),
    ).not.toContain('remove_beneficial_effect');
    // Genuine offensive removals still match (future-proofing; none exist upstream yet).
    for (const text of [
      "Removes all of enemies' beneficial effects",
      "Nullifies Bind and removes enemies' beneficial effects",
    ]) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'specialText'))).toContain(
        'remove_beneficial_effect',
      );
    }
  });

  it('detects remove_enemy_barrier for genuine Barrier-duration removal, not barrier penetration or slot/orb barrier', () => {
    // Genuine enemy-Barrier removals (incl. multi-item lists and the "Barrier
    // Penetration Enabled" trigger, whose ACTION is a real barrier-duration cut).
    for (const text of [
      "Reduces enemies' Barrier duration by 1 turn",
      "Reduces enemies' Barrier and Damage Nullification duration by 2 turns",
      "When a Barrier Penetration Enabled character hits an enemy, reduces enemies' Barrier duration by 1 turn",
    ]) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'specialText'))).toContain(
        'remove_enemy_barrier',
      );
    }
    // Barrier PENETRATION ("ignore … barriers") bypasses barriers without removing
    // them — a distinct mechanic, NOT a duration removal (Zoro & Sanji #4561/#4562).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Characters' normal attacks ignore damage reducing Barriers and Buffs for 1 turn",
          'specialText',
        ),
      ),
    ).not.toContain('remove_enemy_barrier');
    // Slot/Orb Barrier are distinct keys, not the enemy Barrier.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("Reduces Slot Barrier duration by 2 turns", 'specialText'),
      ),
    ).not.toContain('remove_enemy_barrier');
  });

  it('detects chain_multiplier_lock only for a genuine "locks the chain multiplier" grant', () => {
    // Genuine Chain Lock grant.
    for (const text of [
      'Locks the chain multiplier at 2.5x for 2 turns',
      'locks all orbs for 1 turn and locks the chain multiplier at 3x for 1 turn',
    ]) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'specialText'))).toContain(
        'chain_multiplier_lock',
      );
    }
    // "locks all orbs …" whose only later "chain" is an unrelated clause — the lock
    // is on ORBS, not the chain multiplier.
    for (const text of [
      'locks all orbs for 1 turn, reduces Chain Coefficient Reduction duration by 2 turns',
      'locks all orbs for 2 turns and boosts Chain Multiplier Growth Rate by 1.2x for 1 turn',
    ]) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, 'specialText'))).not.toContain(
        'chain_multiplier_lock',
      );
    }
    // References to the "Chain Lock" buff by name are not grants.
    for (const [text, source] of [
      ['increases boost effects of Chain Lock buffs by +0.25x', 'specialText'],
      ['If your crew has Chain Lock when the special is activated, boosts ATK by 2x', 'specialText'],
      ['enables Chain Lock and Color Affinity buffs to be enhanced up to 2 times', 'captainAbility'],
    ] as const) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, source))).not.toContain(
        'chain_multiplier_lock',
      );
    }
    // "locks the minimum/maximum chain multiplier" is the distinct min/max key.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Locks the minimum chain multiplier to 2x', 'specialText'),
      ),
    ).not.toContain('chain_multiplier_lock');
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

  it('detects boost_base_atk only when the verb directly grants "base ATK", not for Base ATK Boost buff references', () => {
    // Genuine flat Base ATK grants (captain + special, incl. scoped/typed forms).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Boosts base ATK of all characters by 1-1,000 for 1 turn, depending on your current HP',
          'captainAbility',
        ),
      ),
    ).toContain('boost_base_atk');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts base ATK of [Giant] characters by 750', 'captainAbility'),
      ),
    ).toContain('boost_base_atk');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Boosts Base ATK of [DEX], Slasher and Powerhouse characters by 1,250 for 1 turn', 'specialText'),
      ),
    ).toContain('boost_base_atk');
    // Non-grant forms that merely NAME the "Base ATK Boost" buff must NOT be tagged
    // as granting base ATK — they are effect_boost / extend_turn_duration / enhance.
    const amplifier = extractAbilityKeys(
      analyzeBuilderAbilityText('increases boost effects of Base ATK Boost buffs by +500', 'captainAbility'),
    );
    expect(amplifier).not.toContain('boost_base_atk');
    expect(amplifier).toContain('effect_boost');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('increases duration of any Base ATK Boost buffs by 1 turn', 'specialText'),
      ),
    ).not.toContain('boost_base_atk');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('enables Base ATK Boost buffs to be enhanced up to 2 times', 'specialText'),
      ),
    ).not.toContain('boost_base_atk');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('If your crew has Base ATK Boost when the special is activated, boosts ATK by 2x', 'specialText'),
      ),
    ).not.toContain('boost_base_atk');
  });

  it('detects end_of_turn_additional_damage only when damage is dealt to enemies at the end of a turn', () => {
    // Genuine end-of-turn damage dealers (damage BEFORE the timing; recurring + one-off;
    // no-"the" wording; percent-HP; single-target; damage-taken retaliation form).
    for (const [text, source] of [
      ['deals 400x character\'s ATK in DEX damage to all enemies at the end of each turn', 'captainAbility'],
      ['Deals 20% of enemies\' current HP in damage to all enemies at the end of the turn', 'specialText'],
      ['and deals 5x character\'s ATK in [INT] damage to all enemies at end of each turn', 'captainAbility'],
      ['deals 0x-500x character\'s ATK in Typeless damage to one enemy at the end of each turn depending on PERFECTs', 'captainAbility'],
      ['deals 100x the damage taken from enemies in the previous turn in Typeless damage to all enemies at the end of each turn', 'captainAbility'],
    ] as const) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, source))).toContain(
        'end_of_turn_additional_damage',
      );
    }
    // Non-dealing forms that must NOT match: enemy-buff removal ("End of Turn Damage"
    // is the ENEMY dealing to your crew), end-of-turn heal + reduce-damage bridge, and
    // damage dealt at the START of a stage (not the end of a turn).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("removes enemies' ATK Up, Enrage and End of Turn Damage/Percent Cut duration completely", 'specialText'),
      ),
    ).not.toContain('end_of_turn_additional_damage');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Recovers 500 HP at the end of each turn, reduces damage received by 10%', 'captainAbility'),
      ),
    ).not.toContain('end_of_turn_additional_damage');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("recovers 2,000 HP at the end of each turn, and deals 10% of enemies' current HP in damage to all enemies at the start of every stage", 'captainAbility'),
      ),
    ).not.toContain('end_of_turn_additional_damage');
  });

  it('detects lock_slots only when "locks" directly governs orbs/slots, not for Chain Lock references', () => {
    // Genuine orb locks (all / own / your Captain's / bare / [Type]).
    for (const [text, source] of [
      ['Locks all orbs for 1 turn', 'captainAbility'],
      ['locks own orb for 1 turn', 'specialText'],
      ["changes the orb of this character into an [INT] orb and locks your Captain's orb for 1 turn", 'specialText'],
    ] as const) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, source))).toContain('lock_slots');
    }
    // "locks the chain multiplier ... [later orb clause]" — object is the chain
    // multiplier, NOT orbs; and the "Chain Lock" buff referenced by name. Neither
    // is an orb lock.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('locks the chain multiplier at 3x for 1 turn, boosts Orb Effects of all characters by 2x for 1 turn', 'specialText'),
      ),
    ).not.toContain('lock_slots');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('increases duration of any Chain Lock buffs by 1 turn, and changes orbs, including [BLOCK] orbs, of adjacent characters into Matching orbs', 'specialText'),
      ),
    ).not.toContain('lock_slots');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('increases duration of any Chain Lock and Orb Amplification buffs by 1 turn', 'specialText'),
      ),
    ).not.toContain('lock_slots');
  });

  it('detects additional_damage_boost only for the "adds ... as Additional Damage" grant, not buff references', () => {
    // Genuine Additional Damage grants.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("Deals random Typeless damage to all enemies. Adds 55x character's ATK as Additional Typeless Damage for 2 turns", 'captainAbility'),
      ),
    ).toContain('additional_damage_boost');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("adds 300x character's ATK as Additional Typeless Damage for 1 turn", 'specialText'),
      ),
    ).toContain('additional_damage_boost');
    // References to the "Additional Damage" buff by name are NOT grants:
    // condition, duration-extend, and replace-trigger.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('If your crew has Additional Damage buff for 2 or more turns when the special is activated, boosts ATK by 2x', 'specialText'),
      ),
    ).not.toContain('additional_damage_boost');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('increases duration of any Additional Damage buffs by 1 turn', 'specialText'),
      ),
    ).not.toContain('additional_damage_boost');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('If a crew member uses a special with an Additional Damage buff, replaces those buffs', 'captainAbility'),
      ),
    ).not.toContain('additional_damage_boost');
  });

  it('detects other_damage_boosts only when "boosts" directly governs "damage dealt", not a damage-dealt scaling condition', () => {
    // Genuine catch-all conditional damage boost.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts damage dealt to enemies inflicted with Increase Damage Taken, Delay or Poison by 1.2x', 'captainAbility'),
      ),
    ).toContain('other_damage_boosts');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts the damage dealt by all characters against delayed enemies', 'specialText'),
      ),
    ).toContain('other_damage_boosts');
    // "boosts ATK ... depending on the amount of normal attack damage dealt" — the
    // "damage dealt" is the scaling INPUT, not the boosted object.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('boosts ATK of all characters by 2x-3x for 1 turn depending on the amount of normal attack damage dealt before this special was activated', 'specialText'),
      ),
    ).not.toContain('other_damage_boosts');
  });

  it('detects boost_against_poisoned_enemies for "boosts ATK against Poisoned enemies" without needing a "damage" token', () => {
    // Genuine boost-against-Poison forms (no "damage" token required).
    for (const [text, source] of [
      ['Boosts ATK against Poisoned and Strongly Poisoned enemies by 1.05x for 99 turns', 'specialText'],
      ['boosts ATK of [DEX], Cerebral and Striker characters against enemies inflicted with Increase Damage Taken, delayed enemies, Poisoned enemies by 1.5x', 'captainAbility'],
      ['boosts ATK against Poisoned enemies by 1.75x', 'specialText'],
      // verbose "inflicted with Poison" wording (semantically identical).
      ['boosts ATK against enemies inflicted with Poison or Strong Poison by 1.5x for 1 turn', 'specialText'],
    ] as const) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, source))).toContain(
        'boost_against_poisoned_enemies',
      );
    }
    // Not a boost against poisoned enemies: merely poisoning enemies.
    expect(
      extractAbilityKeys(analyzeBuilderAbilityText('Poisons all enemies for 3 turns', 'specialText')),
    ).not.toContain('boost_against_poisoned_enemies');
  });

  it('detects boost_against_delayed_enemies for "boosts ATK against delayed enemies" without needing a "damage" token', () => {
    // Genuine boost-against-Delay forms (no "damage" token required).
    for (const [text, source] of [
      ['Boosts ATK against delayed enemies by 1.75x for 1 turn', 'specialText'],
      ['boosts ATK of [DEX], Cerebral and Striker characters against enemies inflicted with Increase Damage Taken, delayed enemies by 1.5x', 'captainAbility'],
      ['boosts ATK against delayed enemies by 1.2x', 'captainAbility'],
    ] as const) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, source))).toContain(
        'boost_against_delayed_enemies',
      );
    }
    // Not a boost-against target: the "If there are delayed enemies ..." trigger
    // condition (Kaya #4180) merely gates a boost, it is not "against delayed enemies".
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('If there are delayed enemies, boosts ATK of all characters by 2x', 'specialText'),
      ),
    ).not.toContain('boost_against_delayed_enemies');
    // Merely delaying enemies is not a boost against them.
    expect(
      extractAbilityKeys(analyzeBuilderAbilityText('Delays all enemies by 1 turn', 'specialText')),
    ).not.toContain('boost_against_delayed_enemies');
  });

  it('detects boost_against_def_reduced_enemies for "boosts ATK against enemies with reduced defense"', () => {
    // Canonical upstream wording is "enemies with reduced defense" (NOT
    // "DEF reduced enemies", which never appears); no "damage" token required.
    for (const [text, source] of [
      ['Boosts ATK against enemies with reduced defense by 1.5x for 1 turn', 'specialText'],
      ['boosts ATK of all characters against enemies with reduced defense by 1.2x', 'captainAbility'],
    ] as const) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, source))).toContain(
        'boost_against_def_reduced_enemies',
      );
    }
    // Merely reducing enemy defense is not a boost against such enemies.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText("Reduces enemies' defense by 50% for 3 turns", 'specialText'),
      ),
    ).not.toContain('boost_against_def_reduced_enemies');
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

  it('scopes delayed_effect_launch to genuine launches, excluding "after N turns" ramp caps', () => {
    // Genuine delayed launches (kept): named-special activation, delayed boost,
    // "After N turns, <effect>" (comma), and the colon "launches ... after N turn:" form.
    for (const [text, src] of [
      ['activates "Pteranodon Raid" in the following turn', 'specialText'],
      ['boosts ATK of Slasher characters by 1.75x for 1 turn in the following turn', 'specialText'],
      ['After 1 turn, boosts ATK of this character by 8.25x', 'captainAbility'],
      ['After 3 turns, Binds and Despairs himself for 7 turns', 'specialText'],
      ['launches the following effects after 1 turn: ignores Debuff Protection', 'specialText'],
    ] as const) {
      expect(extractAbilityKeys(analyzeBuilderAbilityText(text, src))).toContain(
        'delayed_effect_launch',
      );
    }
    // False positive (excluded): a gradual per-turn ATK ramp whose "after N turns"
    // only marks when the ramp caps — nothing launches on turn N (Elizabello II).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Increases own ATK multiplier by 0.0875x at the end of each turn until it reaches a maximum 2.75x after 20 turns.',
          'captainAbility',
        ),
      ),
    ).not.toContain('delayed_effect_launch');
  });

  it('parses range turn counts "reduces X duration by N-M turns" using the min', () => {
    // Range turn counts record the FIRST (min) number as the guaranteed reduction.
    const barrier = analyzeBuilderAbilityText(
      "reduces enemies' Barrier duration by 1-5 turns",
      'specialText',
    ).find((a) => a.key === 'remove_enemy_barrier');
    expect(barrier?.minTurns).toBe(1);
    const despair = analyzeBuilderAbilityText(
      'reduces Despair and ATK DOWN duration by 2-6 turns',
      'specialText',
    );
    expect(despair.find((a) => a.key === 'remove_despair')?.minTurns).toBe(2);
    expect(despair.find((a) => a.key === 'remove_atk_down')?.minTurns).toBe(2);
    // A range whose min is 0 ("by 0-10 turns") has no guaranteed reduction and is
    // dropped by the minTurns > 0 guard.
    expect(
      extractAbilityKeys(analyzeBuilderAbilityText('reduces Bind duration by 0-10 turns', 'specialText')),
    ).not.toContain('remove_bind');
    // Non-range single counts are unaffected.
    expect(
      analyzeBuilderAbilityText('reduces Bind duration by 3 turns', 'specialText').find(
        (a) => a.key === 'remove_bind',
      )?.minTurns,
    ).toBe(3);
    // A range must not let the target bridge a first no-turn-count clause across a
    // SECOND "reduce(s)" verb into a later "by N turns": "reduce Paralysis duration
    // by half and reduces Special Cooldown ... by 1-99 turns" must not tag
    // remove_paralysis (Zeus & Prometheus & Big Mom #3902), and the special-cooldown
    // "by 1-99 turns" must not leak into a status key.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'reduce Paralysis duration by half and reduces Special Cooldown of this character by 1-99 turns',
          'captainAbility',
        ),
      ),
    ).not.toContain('remove_paralysis');
  });

  it('scopes inflict_poison to genuine infliction, excluding the immunity-piercing enabler', () => {
    // Genuine infliction on enemies (kept).
    expect(
      extractAbilityKeys(analyzeBuilderAbilityText('poisons all enemies', 'captainAbility')),
    ).toContain('inflict_poison');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'inflicts Poison, Strong Poison or Toxic, inflicts all enemies with Reiju Poison',
          'captainAbility',
        ),
      ),
    ).toContain('inflict_poison');
    // Enabler (excluded): "allows effects that inflict Poison to ignore Debuff
    // Protection" applies no Poison itself — it only lets other poison effects
    // bypass enemy immunity.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'allows effects that inflict Poison to ignore Debuff Protection',
          'captainAbility',
        ),
      ),
    ).not.toContain('inflict_poison');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'allows effects that inflict Defense Reduction, Paralysis, Burn, Delay, Negative, Poison, Increase Damage Taken, Weaken and ATK Down to ignore Debuff Protection',
          'captainAbility',
        ),
      ),
    ).not.toContain('inflict_poison');
    // Bounded bridge (excluded): a poison CURE or condition must not bridge to a
    // later unrelated "enemies" clause.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'removes Poison duration completely and reduces the defense of all enemies',
          'specialText',
        ),
      ),
    ).not.toContain('inflict_poison');
  });

  it('scopes apply_weakened to the "inflicts … Weaken" applier, not the "Weakened" transform-form name', () => {
    // Genuine Weaken infliction (the debuff is spelled "Weaken", never "-ed").
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'inflicts all enemies with Weaken by 1.5x, by 1.875x instead if enemies are inflicted with Increase Damage Taken, for 2 turns.',
          'specialText',
        ),
      ),
    ).toContain('apply_weakened');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Reduces Defense Reduction and inflicts all enemies with Weaken by 1.5x for 1 turn.',
          'captainAbility',
        ),
      ),
    ).toContain('apply_weakened');
    // The old /\bweakened\b/ matched ONLY this transform-form name (#3895/#3896) —
    // a character transformation, not a debuff applied to enemies.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Boosts ATK by 3x if enough HP is available, otherwise transforms into Weakened.',
          'captainAbility',
        ),
      ),
    ).not.toContain('apply_weakened');
    // Boost-against CONDITION ("inflicted", past tense) must stay excluded.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Boosts ATK against Delayed enemies and enemies inflicted with Weaken by 2.5x-3x for 2 turns.',
          'specialText',
        ),
      ),
    ).not.toContain('apply_weakened');
    // Immunity-pierce ENABLER must stay excluded.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Allows Increase Damage Taken, Weaken and ATK Down to ignore Debuff Protection.',
          'captainAbility',
        ),
      ),
    ).not.toContain('apply_weakened');
  });

  it('scopes apply_ally_status_effect to crew Immunity / Turn Progress Effect, not Territory-to-field or damage', () => {
    // Genuine crew status applications (kept).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('applies Burn and ATK DOWN Immunity for 5 turns.', 'specialText'),
      ),
    ).toContain('apply_ally_status_effect');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Applies a Turn Progress Effect for 3 turns that will apply the following effects: Start of Each Turn: recovers HP.',
          'specialText',
        ),
      ),
    ).toContain('apply_ally_status_effect');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Boosts ATK, and applies the following buff: Blindness Immunity for 10 turns.',
          'captainAbility',
        ),
      ),
    ).toContain('apply_ally_status_effect');
    // Territory-to-field provider (excluded): "characters" is the boost target,
    // the effect is Territory (own `territory` key), not an ally status.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Applies Territory: Powerhouse to the field for 3 turns, boosts Base ATK of Powerhouse characters by 1.5x.',
          'specialText',
        ),
      ),
    ).not.toContain('apply_ally_status_effect');
    // End-of-turn damage "applies the following: Deals …" (excluded).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "applies the following: Deals 300x character's ATK in [INT] damage to all enemies at the end of each turn for 3 turns.",
          'captainAbility',
        ),
      ),
    ).not.toContain('apply_ally_status_effect');
  });

  it('scopes class_change to a genuine Class 1/2/both-Classes reassignment, not "Advantageous Class"', () => {
    // Genuine in-battle class change (kept), incl. the plural "both Classes" form.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('changes Class 1 of all non-Fighter characters to Fighter class for 2 turns.', 'specialText'),
      ),
    ).toContain('class_change');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Changes own Type and both Classes to any selected combination.', 'specialText'),
      ),
    ).toContain('class_change');
    // "boosts Advantageous Class" is a damage boost bridged from a "changes orbs"
    // clause — NOT a class change. The old 120-char `changes … class` bridge
    // mis-tagged these (#4372 special, #4477 captainAbility — the lone captain match).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'changes orbs of right column characters into [RAINBOW] orbs, and boosts Advantageous Class by 2x for 1 turn.',
          'specialText',
        ),
      ),
    ).not.toContain('class_change');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'change the Orb Multiplier of specific orbs, replaces that buff with the following effect: boosts Advantageous Class.',
          'captainAbility',
        ),
      ),
    ).not.toContain('class_change');
  });

  it('scopes chain_multiplier_lock_min_max to the "minimum/maximum chain multiplier" object', () => {
    // Genuine min/max lock grant wording (the key must catch it if it appears).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Locks the minimum chain multiplier at 2x for 3 turns.', 'specialText'),
      ),
    ).toContain('chain_multiplier_lock_min_max');
    // "MAX" of "crew's MAX HP" near a "Chain …" clause must NOT match (old
    // /chain … (min|max)/ bridge false positives — #3293/#3776/#4429/#4430).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Reduces Chain Coefficient Reduction duration by 5 turns, recovers 30% of crew's MAX HP.",
          'specialText',
        ),
      ),
    ).not.toContain('chain_multiplier_lock_min_max');
    // "Minimum-Chain ATK Down" is a separate debuff, not a chain-multiplier lock
    // (#4067/#4068 — the entire prior captain count).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Reduces Chain Coefficient Reduction and Minimum-Chain ATK Down duration by 5 turns.',
          'captainAbility',
        ),
      ),
    ).not.toContain('chain_multiplier_lock_min_max');
    // Plain "locks the chain multiplier at Nx" stays with chain_multiplier_lock.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Locks the chain multiplier at 3.25x for 2 turns.', 'specialText'),
      ),
    ).not.toContain('chain_multiplier_lock_min_max');
  });

  it('scopes remove_chain_multiplier_limit to the enemy debuff, not the friendly "Chain Lock" buff extension', () => {
    // Genuine enemy Chain Multiplier Limit removal (kept), incl. multi-item list.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Reduces Chain Multiplier Limit duration by 4 turns.', 'specialText'),
      ),
    ).toContain('remove_chain_multiplier_limit');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText('Reduces Increased Defense and Chain Multiplier Limit duration by 2 turns.', 'captainAbility'),
      ),
    ).toContain('remove_chain_multiplier_limit');
    // "increases duration of any Chain Lock buffs" EXTENDS the friendly Chain Lock
    // buff (opposite of removing the enemy debuff) — the old `|| 'chain lock'`
    // alias mis-tagged these (#4000/#4128/#4289 — the entire prior captain count).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'recovers 2,000 HP at the end of each turn, and increases duration of any Chain Lock buffs applied by Specials by 1 turn.',
          'captainAbility',
        ),
      ),
    ).not.toContain('remove_chain_multiplier_limit');
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'increases duration of any Chain Lock/Limit/Boundary buffs/debuffs applied by Specials by 1 turn.',
          'specialText',
        ),
      ),
    ).not.toContain('remove_chain_multiplier_limit');
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

  it('derives duration-removal keys from superSpecialText via the shared TURN_PATTERNS pipeline', () => {
    // Genuine super-special enemy-effect duration removal (previously skipped:
    // the superSpecialText branch used to early-return before TURN_PATTERNS).
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Reduces enemies' Threshold Damage Reduction duration by 3 turns and transforms Fighter characters into Super Fighter characters.",
          'superSpecialText',
        ),
      ),
    ).toContain('remove_threshold_damage_reduction');
    // "removes <status> duration completely" variant.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          'Removes Despair duration completely on this character and transforms [STR] characters into Super [STR] characters.',
          'superSpecialText',
        ),
      ),
    ).toContain('remove_despair');
    // EXPLICIT builder ability (fixed damage) also derives from super text.
    expect(
      extractAbilityKeys(
        analyzeBuilderAbilityText(
          "Deals 100x character's ATK in Typeless Fixed True damage to all enemies and transforms [DEX] characters into Super [DEX] characters.",
          'superSpecialText',
        ),
      ),
    ).toContain('deal_fixed_damage');
  });

  it('folds the max-level (last) tier of a multi-tier special so late-tier removals are detected', () => {
    // Two same-fingerprint activation tiers ("Deals ..."): the base tier reduces
    // Increased Defense; the MAX tier additionally reduces Threshold Damage
    // Reduction. A maxed character's special is the last tier, so both must be
    // detected (extractPrimaryAbilityBranchText alone sees only the base tier).
    const twoTier =
      "Deals 200x character's ATK in Typeless Fixed True damage to enemies, reduces enemies' Increased Defense duration by 7 turns and becomes Zoro & Sanji for 3 turns.. " +
      "Deals 300x character's ATK in Typeless Fixed True damage to enemies, reduces enemies' Threshold Damage Reduction and Increased Defense duration by 7 turns and becomes Zoro & Sanji for 3 turns.";
    const keys = extractAbilityKeys(analyzeBuilderAbilityText(twoTier, 'specialText'));
    expect(keys).toContain('remove_enemy_increased_defense'); // base tier
    expect(keys).toContain('remove_threshold_damage_reduction'); // max-tier-only
  });

  it('does not fold intermediate-tier-only effects (max-level folding never over-claims)', () => {
    // Three same-fingerprint tiers where lock_slots appears ONLY in the middle
    // tier and is dropped at max. Only the primary (first) and max (last) tiers are
    // parsed, so a maxed character is not credited with the intermediate-only lock.
    const threeTier =
      "Deals 100x character's ATK in Typeless damage to all enemies, reduces enemies' Increased Defense duration by 1 turn and boosts ATK of all characters by 2x for 1 turn.. " +
      "Deals 100x character's ATK in Typeless damage to all enemies, locks all orbs for 1 turn and reduces enemies' Increased Defense duration by 2 turns.. " +
      "Deals 100x character's ATK in Typeless damage to all enemies, reduces enemies' Increased Defense duration by 3 turns and boosts ATK of all characters by 3x for 1 turn.";
    const keys = extractAbilityKeys(analyzeBuilderAbilityText(threeTier, 'specialText'));
    expect(keys).toContain('remove_enemy_increased_defense');
    expect(keys).toContain('boost_atk');
    expect(keys).not.toContain('lock_slots'); // intermediate-tier only → not folded
  });

  it('keeps superSpecialText restricted to territory-group special matchers (no full special catalog)', () => {
    // The line-1335 `specialText || captainAbility` guard must keep the broad
    // special-ability matchers (e.g. boost_atk) from firing on super text, so
    // super specials do not double-tag effects the base special already carries.
    const keys = extractAbilityKeys(
      analyzeBuilderAbilityText(
        'Boosts ATK of all characters by 2x for 1 turn and transforms [STR] characters into Super [STR] characters.',
        'superSpecialText',
      ),
    );
    expect(keys).not.toContain('boost_atk');
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

  it('detects NAO bypass in a "bypass ... Normal Attack Only" defensive-list phrasing', () => {
    expect(
      analyzeBuilderAbilityText(
        'Makes Damage Specials of all characters bypass all defensive Buffs, Barriers, Defense and Normal Attack Only, deals 500x character ATK in True damage to all enemies.',
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

    // 85, not 86: `remove_silence` was retired — "Silence" is the in-game name
    // for the same debuff as `remove_special_bind`, so it is one effect, one key.
    // 86: `remove_silence` was retired (== remove_special_bind), and
    // `change_slots_matching` was added (the wiki's "Favorable Slot Change" —
    // type-adaptive "into Matching orbs" — is a distinct, filterable family).
    expect(specialCatalog).toHaveLength(86);
    expect(groupCounts).toEqual({
      Damage: 6,
      'Boost Damage': 17,
      'Damage Reduction': 3,
      Slot: 4,
      'Slot Change': 5,
      'Reduce Status Effect Duration': 14,
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

  it('folds OPTC-DB "Silence" wording into remove_special_bind with its turn count', async () => {
    // "Silence" is the in-game label for the debuff OPTC-DB usually words as
    // "Special Bind" (specials locked) — one effect, two names, so both wordings
    // must land on the single `remove_special_bind` key WITH the turn count.
    // The retired `remove_silence` key produced a duplicate turn-less picker
    // entry that matched a strict subset, and must never be emitted again.
    const characters: ParserCharacters = [
      {
        id: 930001,
        detail: {
          specialText: 'Reduces Silence duration by 5 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 930002,
        detail: {
          specialText: 'Reduces Special Bind duration by 5 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // superSpecialText-only Silence (the wording the retired key missed).
        id: 930003,
        detail: {
          specialText: null,
          superSpecialText: 'Reduces Silence duration by 5 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(catalog.find((item) => item.key === 'remove_special_bind')).toEqual(
      expect.objectContaining({
        category: 'special',
        label: 'Special Bind (Silence)',
        groupLabel: 'Reduce Status Effect Duration',
        supportsTurns: true,
        matchingCharacterIds: expect.arrayContaining([930001, 930002, 930003]),
      }),
    );
    // Silence must carry the same turn count as the equivalent Special Bind wording.
    expect(catalog.find((item) => item.key === 'remove_special_bind')).toEqual(
      expect.objectContaining({
        turnMatchingCharacterIds: expect.arrayContaining([
          expect.objectContaining({
            minTurns: 5,
            characterIds: expect.arrayContaining([930001, 930002, 930003]),
          }),
        ]),
      }),
    );
    // Silence must NOT be mistaken for Despair (in-game "Gloom"): the key still
    // exists in the catalog, but no Silence unit may land on it.
    expect(catalog.find((item) => item.key === 'remove_despair')).toEqual(
      expect.objectContaining({ matchingCharacterIds: [] }),
    );
    // The retired duplicate key must no longer be emitted at all.
    expect(catalog.find((item) => item.key === 'remove_silence')).toBeUndefined();
  });

  it('scopes cure clauses by their own trailing qualifier, not a neighbouring clause', async () => {
    // "on this character" is the ONLY scope qualifier that ever attaches to a
    // cure clause; everything else in the sentence belongs to a different
    // clause. A whole-sentence scan would read the ATK boost's class wording or
    // an "If your Captain is ..." CONDITION as the cure's scope and mislabel it.
    const characters: ParserCharacters = [
      {
        id: 940001,
        detail: {
          // Scope wording present, but it belongs to the ATK boost clause.
          specialText: 'Boosts ATK of Slasher characters by 1.3x for 2 turns, reduces Bind duration by 2 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 940002,
        detail: {
          specialText: null,
          captainAbility: null,
          // Captain wording here is a CONDITION, not a target scope.
          sailorAbilities: [
            'If your Captain is a Free Spirit character, reduces Bind duration by 3 turns',
          ],
          builderAbilities: [],
        },
      },
      {
        id: 940003,
        detail: {
          specialText: null,
          captainAbility: null,
          sailorAbilities: ['Reduces Bind duration by 5 turns on this character'],
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });
    const removeBind = catalog.find((item) => item.key === 'remove_bind');

    expect(removeBind).toEqual(
      expect.objectContaining({
        // Only the real scopes, and never 'captains' from the condition wording.
        availableEffectTargetScopes: ['crew', 'self'],
        effectTargetScopeMatchingCharacterIds: expect.arrayContaining([
          expect.objectContaining({
            effectTargetScope: 'crew',
            characterIds: expect.arrayContaining([940001, 940002]),
          }),
          expect.objectContaining({
            effectTargetScope: 'self',
            characterIds: [940003],
          }),
        ]),
      }),
    );
  });

  it('records both scopes when one character cures on itself and crew-wide', async () => {
    // The self and crew entries must not collapse into one another: the dedupe
    // identity carries the scope, so both survive with their own turn counts.
    const characters: ParserCharacters = [
      {
        id: 940101,
        detail: {
          specialText: 'Reduces Paralysis duration by 3 turns',
          captainAbility: null,
          sailorAbilities: ['Reduces Paralysis duration by 5 turns on this character'],
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });
    const removeParalysis = catalog.find((item) => item.key === 'remove_paralysis');

    expect(removeParalysis).toEqual(
      expect.objectContaining({
        availableEffectTargetScopes: ['crew', 'self'],
        effectTargetScopeMatchingCharacterIds: expect.arrayContaining([
          expect.objectContaining({
            effectTargetScope: 'crew',
            turnMatchingCharacterIds: [{ minTurns: 3, characterIds: [940101] }],
          }),
          expect.objectContaining({
            effectTargetScope: 'self',
            turnMatchingCharacterIds: [{ minTurns: 5, characterIds: [940101] }],
          }),
        ]),
      }),
    );
  });

  it('does not bridge "makes" across a clause into an unrelated orb effect', async () => {
    // OPTC-DB canonical is "makes [X] orbs beneficial for <scope>" — the term sits
    // flush against "orbs". Letting either gap span another effect verb makes
    // "Makes PERFECTs harder to hit ..., changes ... orbs ... into Matching orbs"
    // (a tap-timing debuff + a slot CHANGE) report as a beneficial-orb effect.
    const characters: ParserCharacters = [
      {
        id: 960001,
        detail: {
          specialText:
            'Makes PERFECTs harder to hit for 1 turn, changes [STR] and [QCK] orbs of Powerhouse characters into Matching orbs',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 960002,
        detail: {
          // Penalty removal is not "beneficial".
          specialText:
            'makes Badly Matching and [BLOCK] orbs not reduce damage for 3 turns, changes [BLOCK] orbs into Matching orbs',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 960003,
        detail: {
          specialText: 'makes [STR], [DEX] and [QCK] orbs beneficial for all characters',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Same effect, worded "matching" instead of "beneficial" (Brook #3665).
        id: 960004,
        detail: {
          specialText: 'makes [RCV] and [TND] orbs matching for all characters by 1 turn',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(catalog.find((item) => item.key === 'make_slots_favorable')).toEqual(
      expect.objectContaining({
        label: 'Make Orbs Beneficial',
        matchingCharacterIds: [960003, 960004],
      }),
    );
    // The bridged units are genuine slot CHANGES and must still be tagged as such.
    expect(
      catalog.find((item) => item.key === 'change_slots')?.['matchingCharacterIds'],
    ).toEqual(expect.arrayContaining([960001, 960002]));
  });

  it('splits threshold and 100% damage reduction out of the reduce_damage umbrella', async () => {
    const characters: ParserCharacters = [
      {
        id: 990001,
        detail: {
          specialText: 'Reduces damage received by 50% for 3 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Threshold: only the excess above the amount is reduced. OPTC-DB says
        // "above", never "over" — the wording the dead matcher demanded.
        id: 990002,
        detail: {
          specialText: 'Reduces any damage received above 5,000 HP by 97% for 3 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Total nullification, worded as a 100% reduction (upstream calls this
        // "Damage Nullification" in its own notes).
        id: 990003,
        detail: {
          specialText: 'Reduces damage received by 100% for 1 turn',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Typed nullification ("only a single type").
        id: 990004,
        detail: {
          specialText: 'Reduces damage received from [INT] enemies by 100% for 1 turn',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // A 100% THRESHOLD cut is Threshold DR, NOT nullification — the corpus
        // lists the two as distinct buffs.
        id: 990005,
        detail: {
          specialText: 'reduces any damage received above 2,000 HP by 100% for 1 turn',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Threshold with neither "received" nor "HP" (Akainu #1848).
        id: 990006,
        detail: {
          specialText: 'reduces any damage above 3,000 by 80% for 1 turn',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Upstream typo (#4021).
        id: 990007,
        detail: {
          specialText: 'Reduces damage recieved by 60% for 2 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });
    const ids = (key: string) =>
      catalog.find((item) => item.key === key)?.['matchingCharacterIds'];

    // The umbrella keeps every one of them.
    expect(ids('reduce_damage')).toEqual([
      990001, 990002, 990003, 990004, 990005, 990006, 990007,
    ]);
    expect(ids('reduce_damage_over_threshold')).toEqual([990002, 990005, 990006]);
    // 990005 is a 100% THRESHOLD cut and must NOT be nullification.
    expect(ids('nullify_damage')).toEqual([990003, 990004]);
  });

  it('separates ATK-multiplier grants from buff amplifiers and clause bridges', async () => {
    const characters: ParserCharacters = [
      {
        id: 980001,
        detail: {
          specialText: 'Boosts ATK of [INT] characters by 1.5x for 1 turn',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Long enemy-state list: genuine, and the reason the ATK->multiplier
        // window is 160 rather than 80.
        id: 980002,
        detail: {
          specialText:
            'boosts ATK against Poisoned enemies, Strongly Poisoned enemies and enemies inflicted with Toxic by 1.75x',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Amplifier: scales OTHER characters' ATK Up buffs, grants no ATK.
        id: 980003,
        detail: {
          specialText: 'increases boost effects of ATK Up buffs by 1.5x',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Bridge: the multiplier belongs to Color Affinity, one clause later.
        id: 980004,
        detail: {
          specialText:
            'boosts Final Tap ATK of all characters by 50%; boosts Color Affinity of [DEX] characters by 3.25x',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // "Increase Damage Taken" is a buff NAME, not a verb — guarding on
        // "increases" would wrongly delete this genuine grant.
        id: 980005,
        detail: {
          specialText: 'boosts ATK against enemies inflicted with Increase Damage Taken by 2x',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(catalog.find((item) => item.key === 'boost_atk')?.['matchingCharacterIds']).toEqual([
      980001, 980002, 980005,
    ]);
    // The amplifier is still correctly reported as an effect boost.
    expect(
      catalog.find((item) => item.key === 'effect_boost')?.['matchingCharacterIds'],
    ).toEqual(expect.arrayContaining([980003]));
  });

  it('splits the adaptive "into Matching orbs" family out as change_slots_matching', async () => {
    // "Favorable Slot Change" on the wiki: the orb is changed INTO a Matching
    // orb per character (type-adaptive), distinct from fixed-type changes.
    // Umbrella membership in change_slots is kept (mirrors change_block_slots).
    const characters: ParserCharacters = [
      {
        id: 970001,
        detail: {
          specialText: 'Changes [RCV], [TND] and [BLOCK] orbs into Matching orbs',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 970002,
        detail: {
          specialText: 'Changes [PSY] and [INT] orbs into [STR] orbs',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Sabotage: "into Badly Matching orbs" must NOT count as adaptive.
        id: 970003,
        detail: {
          specialText: 'Changes all orbs of Cerebral characters into Badly Matching orbs',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(catalog.find((item) => item.key === 'change_slots_matching')).toEqual(
      expect.objectContaining({
        label: 'Change Slots into Matching (Favorable Slot Change)',
        groupLabel: 'Slot Change',
        matchingCharacterIds: [970001],
      }),
    );
    // All three remain plain slot changes.
    expect(
      catalog.find((item) => item.key === 'change_slots')?.['matchingCharacterIds'],
    ).toEqual([970001, 970002, 970003]);
  });

  it('does not count the "unable to change to [X] orbs" restriction as a slot change', async () => {
    const characters: ParserCharacters = [
      {
        // Dr. Vegapunk #4423 shape: the only "change" wording is the negative
        // self-restriction; the real orb effect is an undirected randomize,
        // which is deliberately not change_slots (OPTC-DB's own filter treats
        // "Randomizes all orbs" as a separate family).
        id: 970101,
        detail: {
          specialText:
            'Randomizes all orbs into [STR], [DEX], [QCK], [INT] or [RCV] orbs, and becomes unable to change to [PSY] and [TND] orbs for 1 turn',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // A genuine change alongside the restriction must still match (#4149).
        id: 970102,
        detail: {
          specialText:
            'Changes all orbs, including [BLOCK] orbs, into [INT] orbs, and becomes unable to change to [STR] and [BLOCK] orbs for 2 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(
      catalog.find((item) => item.key === 'change_slots')?.['matchingCharacterIds'],
    ).toEqual([970102]);
  });

  it('matches real orb switches and ignores unit-swap and Swap-cure clauses', async () => {
    // OPTC-DB's only orb-move wording is "switches orbs between slots N times";
    // "swaps" is reserved for unit/captain swaps and the Swap debuff, which the
    // old /swaps? ... orbs?/ matcher bridged into ("swaps this unit with your
    // captain ... boosts Orb Effects").
    const characters: ParserCharacters = [
      {
        id: 970201,
        detail: {
          specialText: 'Switches orbs between slots 2 times, boosts Orb Effects of all characters by 2x',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 970202,
        detail: {
          specialText:
            'Optionally swaps this unit with your captain for 1 turn, and boosts Orb Effects of all characters by 2x',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 970203,
        detail: {
          specialText:
            'Reduces Swap duration completely, and increases boost effects of ATK Up, Orb Amplification and Color Affinity buffs',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(catalog.find((item) => item.key === 'swap_slots')).toEqual(
      expect.objectContaining({
        label: 'Switch Orbs Between Slots (Slot Swap)',
        matchingCharacterIds: [970201],
      }),
    );
  });

  it('splits "Special Cooldown of Ship" from the crew special-cooldown reduce', async () => {
    // The SHIP's own Special has its own cooldown (Ship Bind is what disables
    // it), so OPTC-DB's "reduces Special Cooldown of Ship" is NOT a crew
    // head-start. The picker key for it was spelled the way players say it
    // ("ship special"), a phrase that never occurs upstream, so it matched
    // nothing while its characters were absorbed by the crew key.
    const characters: ParserCharacters = [
      {
        id: 950001,
        detail: {
          specialText: 'Reduces Special Cooldown of Ship by 1 turn',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        id: 950002,
        detail: {
          specialText: 'Reduces Special Cooldown of all characters by 2 turns at the start of the fight',
          captainAbility: null,
          builderAbilities: [],
        },
      },
      {
        // Both in one text: the crew clause still counts, the ship clause routes
        // to the ship key.
        id: 950003,
        detail: {
          specialText:
            'Reduces Special Cooldown of all characters by 1 turn at the start of the fight, reduces Special Cooldown of Ship by 3 turns',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    // The ship-only unit must NOT report as a crew special-cooldown reducer.
    expect(catalog.find((item) => item.key === 'reduce_special_charge')).toEqual(
      expect.objectContaining({
        label: 'Reduce Special Cooldown (Reduce Special Charge Time)',
        matchingCharacterIds: [950002, 950003],
      }),
    );
    expect(catalog.find((item) => item.key === 'reduce_ship_special_charge')).toEqual(
      expect.objectContaining({
        label: 'Reduce Ship Special Cooldown (Ship Special Charge)',
        matchingCharacterIds: [950001, 950003],
      }),
    );
  });

  it('gives enemy-targeted removals no team-role scope', async () => {
    // captains/subs/crew/self describe which of YOUR roles an effect lands on.
    // An enemy debuff stripped "for the crew" is meaningless, so enemy-facing
    // removals must carry no scope and offer no scope control.
    const characters: ParserCharacters = [
      {
        id: 940401,
        detail: {
          specialText:
            "Reduces enemies' Barrier duration by 3 turns and reduces Bind duration by 2 turns",
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    expect(
      catalog.find((item) => item.key === 'remove_enemy_barrier')?.['availableEffectTargetScopes'],
    ).toBeUndefined();
    // The crew-side cure in the same sentence still gets its scope.
    expect(catalog.find((item) => item.key === 'remove_bind')).toEqual(
      expect.objectContaining({ availableEffectTargetScopes: ['crew'] }),
    );
  });

  it('omits scope fields for abilities that carry no scope data', async () => {
    const characters: ParserCharacters = [
      {
        id: 940201,
        detail: {
          specialText: 'Deals 10x character’s ATK in damage to all enemies',
          captainAbility: null,
          builderAbilities: [],
        },
      },
    ];

    const catalog = await enrichCharactersWithBuilderAbilities(characters, { logger: null });
    const specialDamage = catalog.find((item) => item.key === 'special_damage');

    expect(specialDamage?.['availableEffectTargetScopes']).toBeUndefined();
    expect(specialDamage?.['effectTargetScopeMatchingCharacterIds']).toBeUndefined();
  });

  it('supersedes a stored scope-less ability with the derived scoped one', async () => {
    // apply-manual merges stored + derived abilities. A stored entry written
    // before cure scopes existed normalizes to scope 'any' — a different dedupe
    // identity from the same ability re-derived with a real scope — so a plain
    // merge would keep BOTH and double the entry.
    const characters: ParserCharacters = [
      {
        id: 940301,
        detail: {
          specialText: 'Reduces Bind duration by 2 turns',
          captainAbility: null,
          builderAbilities: [
            {
              key: 'remove_bind',
              label: 'Remove Bind',
              minTurns: 2,
              isCompleteRemoval: false,
              slotTokens: [],
              source: 'specialText',
              coverageMode: 'explicit',
            },
          ],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    const removeBindEntries = (characters[0]!.detail.builderAbilities as Array<
      Record<string, unknown>
    >).filter((ability) => ability['key'] === 'remove_bind');

    expect(removeBindEntries).toHaveLength(1);
    expect(removeBindEntries[0]).toEqual(expect.objectContaining({ effectTargetScope: 'crew' }));
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

  it('detects support_end_of_turn_additional_damage only for a support GRANT of end-of-turn damage, not enemy End-of-Turn-Damage-buff references', async () => {
    const characters = [
      {
        id: 900001,
        detail: {
          specialText: null,
          captainAbility: null,
          supportData: [
            {
              supportedCharactersText: 'Tester',
              levelDescriptions: [
                "Once per adventure, when the supported character uses their special, deals 7% of enemies' current HP in damage to all enemies at the end of the turn for 3 turns.",
              ],
            },
          ],
          builderAbilities: [],
        },
      },
      {
        id: 900002,
        detail: {
          specialText: null,
          captainAbility: null,
          supportData: [
            {
              supportedCharactersText: 'Tester',
              levelDescriptions: [
                'Once per adventure, when the enemy enables an End of Turn Damage buff, reduces Increase Damage Taken duration by 3 turns and recovers 3,000 HP.',
              ],
            },
          ],
          builderAbilities: [],
        },
      },
      {
        id: 900003,
        detail: {
          specialText: null,
          captainAbility: null,
          supportData: [
            {
              supportedCharactersText: 'Tester',
              levelDescriptions: [
                "Removes enemies' End of Turn Damage/Percent Cut duration completely.",
              ],
            },
          ],
          builderAbilities: [],
        },
      },
    ];

    await enrichCharactersWithBuilderAbilities(characters, { logger: null });

    // Genuine grant → tagged.
    expect(extractAbilityKeys(characters[0]?.detail.builderAbilities ?? [])).toContain(
      'support_end_of_turn_additional_damage',
    );
    // Enemy End-of-Turn-Damage-buff references (trigger / removal) → NOT tagged.
    expect(extractAbilityKeys(characters[1]?.detail.builderAbilities ?? [])).not.toContain(
      'support_end_of_turn_additional_damage',
    );
    expect(extractAbilityKeys(characters[2]?.detail.builderAbilities ?? [])).not.toContain(
      'support_end_of_turn_additional_damage',
    );
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

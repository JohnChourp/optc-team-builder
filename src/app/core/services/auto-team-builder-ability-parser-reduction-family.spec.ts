// Proposed NEW file: src/app/core/services/auto-team-builder-ability-parser.reduction-family.spec.ts
// (per-topic file on purpose - never append to the 6,300-line monolith suite; the
// duplicated preamble below is the deliberate cost of that rule).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

type ParserSource = 'specialText' | 'superSpecialText' | 'captainAbility' | 'sailorAbilities';

let analyzeBuilderAbilityText: (value: unknown, source: ParserSource) => Array<{ key: string }>;
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
) => Promise<Array<Record<string, unknown> & { key: string }>>;

beforeAll(async () => {
  ({ analyzeBuilderAbilityText, enrichCharactersWithBuilderAbilities } = await import(
    pathToFileURL(resolve(process.cwd(), 'scripts/auto-team-builder-ability-parser.mjs')).href
  ));
});

function keysOf(text: string, source: ParserSource): string[] {
  return analyzeBuilderAbilityText(text, source).map((ability) => ability.key);
}

// Queen #4647's captain ability, verbatim. It is written in the Japanese-derived
// register: "VS Effect gauge" (VS効果ゲージ, the name stage/enemy boons also use:
// "VS Effect gauge reduction: 15") and a bare "Switch Effect by 1" sitting 62
// characters after its verb. Both keys missed it.
const QUEEN_4647_CLAUSE =
  "Reduces crew's Special charge time by 1 turn and VS Effect gauge and Switch Effect by 1 at start of quest, boosts [DEX], Driven, and Powerhouse characters' ATK by 5.5x, HP by 1.35x";

describe('reduction family on the captain source (869f13c62)', () => {
  it('reads the VS Effect gauge register and a distant Switch Effect object', () => {
    const keys = keysOf(QUEEN_4647_CLAUSE, 'captainAbility');

    expect(keys).toContain('reduce_vs_effect_gauge');
    expect(keys).toContain('reduce_switch_effect_use');
    // Action-transform gauges are not the VS gauge (#2073/#2074, #3895/#3896).
    for (const text of [
      'Action: Based on how full Gear Power Gauge is, transforms Luffy.',
      'Action: Based on how full Enma Gauge is, transforms Zoro.',
    ]) {
      expect(keysOf(text, 'captainAbility')).not.toContain('reduce_vs_effect_gauge');
    }
  });

  it('counts "Advances Special Cooldown of Ship to MAX" as the ship cooldown reduction, and only there', () => {
    // Official JP text words both amounts with the same verb: 船の必殺ターンを2短縮 /
    // 船の必殺ターンをMAXまで短縮. Five captains carry the MAX form (#4152/#4153/#4293/#4333/#4422).
    const advance = keysOf(
      'Advances Special Cooldown of Ship to MAX at the start of the fight, boosts ATK of Powerhouse and Fighter characters by 5.25x',
      'captainAbility',
    );

    expect(advance).toContain('reduce_ship_special_charge');
    expect(advance).not.toContain('restore_advance_special_charge');
    expect(advance).not.toContain('reduce_special_charge');
    // A character advance never reaches the ship key.
    expect(
      keysOf('advances Special Cooldown of this character to MAX at the start of the fight', 'captainAbility'),
    ).not.toContain('reduce_ship_special_charge');
    // Ship Bind is the enemy debuff that disables the ship special - a different mechanic.
    expect(keysOf('Reduces Ship Bind duration by 2 turns', 'specialText')).not.toContain(
      'reduce_ship_special_charge',
    );
  });

  it('indexes all three as captain matches from captainAbilityVariants, with no turn control', async () => {
    const captain = (id: number, text: string) => ({
      id,
      detail: {
        specialText: null,
        captainAbility: text,
        captainAbilityVariants: [{ key: 'captain', label: 'Captain Ability', text }],
        builderAbilities: [],
      },
    });
    const catalog = await enrichCharactersWithBuilderAbilities(
      [
        captain(951001, QUEEN_4647_CLAUSE),
        captain(951002, 'Advances Special Cooldown of Ship to MAX at the start of the fight'),
        captain(951003, 'Reduces Special Cooldown of Ship by 5 turns at the start of the fight'),
      ],
      { logger: null },
    );
    const entry = (key: string) => catalog.find((item) => item.key === key);

    // supportsTurns stays false for all three: "by N" is an AMOUNT taken off a
    // countdown (Super Switch gauge, VS gauge, ship cooldown), never a duration.
    expect(entry('reduce_switch_effect_use')).toEqual(
      expect.objectContaining({ captainAbilityMatchingCharacterIds: [951001], supportsTurns: false }),
    );
    expect(entry('reduce_vs_effect_gauge')).toEqual(
      expect.objectContaining({ captainAbilityMatchingCharacterIds: [951001], supportsTurns: false }),
    );
    expect(entry('reduce_ship_special_charge')).toEqual(
      expect.objectContaining({ captainAbilityMatchingCharacterIds: [951002, 951003], supportsTurns: false }),
    );
  });
});

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// Per-topic regression for the max-tier fold of a multi-tier special (1amndjnqk7e).
// The harness preamble is duplicated from auto-team-builder-ability-parser.spec.ts on
// purpose: a new case gets its own file, so parallel branches never meet in the monolith.
type AbilitySource = 'specialText' | 'superSpecialText' | 'captainAbility' | 'sailorAbilities';

let analyzeBuilderAbilityText: (
  value: unknown,
  source: AbilitySource,
) => Array<{ key: string; minTurns: number | null }>;

beforeAll(async () => {
  ({ analyzeBuilderAbilityText } = await import(
    pathToFileURL(resolve(process.cwd(), 'scripts/auto-team-builder-ability-parser.mjs')).href
  ));
});

function keysOf(text: string, source: AbilitySource): string[] {
  return analyzeBuilderAbilityText(text, source).map((ability) => ability.key);
}

describe('the max-tier fold reads its already-normalised text once', () => {
  it('keeps a max-tier-only clause written as "&lt;...&gt;"', () => {
    // "&lt;" decodes to "<" on the first pass; a second pass would read the max tier's
    // clause as a tag and drop it, so remove_threshold_damage_reduction went missing.
    const twoTier =
      "Deals 200x character's ATK in Typeless Fixed True damage to enemies, reduces enemies' " +
      'Increased Defense duration by 7 turns and becomes Zoro & Sanji for 3 turns.. ' +
      "Deals 300x character's ATK in Typeless Fixed True damage to enemies, &lt;reduces " +
      "enemies' Threshold Damage Reduction duration by 7 turns&gt; and becomes Zoro & Sanji " +
      'for 3 turns.';
    const keys = keysOf(twoTier, 'specialText');

    expect(keys).toContain('remove_enemy_increased_defense'); // first tier
    expect(keys).toContain('remove_threshold_damage_reduction'); // max tier only
  });

  it('keeps a max-tier-only "&lt;...&gt;" clause of a sailor ability too', () => {
    const twoTier =
      'Boosts base ATK of Fighter characters by 50.. Boosts base ATK of Fighter characters ' +
      'by 75 &lt;and reduces Special Bind duration by 3 turns&gt;.';
    const keys = keysOf(twoTier, 'sailorAbilities');

    expect(keys).toContain('crewmate_atk_boost_fighter');
    expect(keys).toContain('crewmate_recover_special_bind'); // max tier only
  });
});

describe('a crewmate turn count reads its already-normalised text once', () => {
  it('counts the turns inside a "&lt;...&gt;" clause', () => {
    // resolveMaxTurnCountFromText takes the largest "by N turns" of the text; a second
    // pass dropped the decoded clause, so it read 2, not 4.
    const text =
      'Reduces Special Cooldown of this character by 2 turns at start of quest ' +
      '&lt;or by 4 turns with 3+ Fighter characters&gt;.';
    const turns = analyzeBuilderAbilityText(text, 'sailorAbilities')
      .filter((ability) => ability.key === 'crewmate_special_charge_start_of_quest')
      .map((ability) => ability.minTurns);

    expect(turns).toEqual([4]);
  });
});

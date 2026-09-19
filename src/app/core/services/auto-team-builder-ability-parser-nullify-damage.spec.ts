import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// Per-topic regression for the nullify_damage matcher (captain ability audit 869f13c62).
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

describe('nullify_damage stays inside its own clause', () => {
  it('does not claim the 100% of a neighbouring DEF Down clause (Nico Robin #4617)', () => {
    // Upstream #4617: a 70% cut, then a separate "reduces the defense of all enemies by
    // 100%" clause. Forbidding only "damage" in the gap let it cross the comma.
    const robin =
      'If your crew has 4+ [Straw Hat Pirates] or [Giant] characters, changes the orb of this ' +
      'character into a [TND] orb, reduces damage received by 70% for 3 turns, reduces the ' +
      'defense of all enemies by 100% for 1 turn, and increases duration of any Color Affinity ' +
      'buffs by 3 turns, including effects activated in the same ability.';
    const keys = keysOf(robin, 'specialText');

    expect(keys).not.toContain('nullify_damage');
    // Both real effects of that sentence are still detected.
    expect(keys).toEqual(expect.arrayContaining(['reduce_damage', 'apply_def_reduction']));
  });

  it('applies the same boundary on captainAbility, which runs the same matcher', () => {
    expect(
      keysOf(
        'Boosts ATK of Fighter characters by 4x, reduces damage received by 20%, reduces the ' +
          'defense of all enemies by 100% for 1 turn.',
        'captainAbility',
      ),
    ).not.toContain('nullify_damage');
  });

  it('keeps every genuine nullification wording', () => {
    for (const [text, source] of [
      // Typed list: the gap exists for this, and it carries commas but no verb.
      ['reduces damage received from [STR], [QCK] and [INT] enemies by 100% for 1 turn.', 'specialText'],
      // Captain start-of-fight form (Prince Grus #4528, Jinbe #4616).
      [
        'Launches the following effect at start of fight: reduces damage received by 100% for 1 attack.',
        'captainAbility',
      ],
      // A partial cut before the nullification in one sentence (Jinbe #3774/#3775).
      [
        'reduces damage received by 10% and reduces damage received by 100% for 1 attack.',
        'captainAbility',
      ],
    ] as const) {
      expect(keysOf(text, source)).toContain('nullify_damage');
    }
  });
});

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

beforeAll(async () => {
  ({ analyzeBuilderAbilityText } = await import(
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
    ).toEqual([
      expect.objectContaining({
        key: 'ignore_normal_attack_only',
        label: 'Ignore Normal Attack Only (NAO)',
        minTurns: null,
        slotTokens: [],
        source: 'specialText',
      }),
    ]);
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
    ).toEqual([
      expect.objectContaining({
        key: 'ignore_normal_attack_only',
        source: 'specialText',
      }),
    ]);
  });

  it('does not treat NAO condition checks as bypass', () => {
    expect(
      analyzeBuilderAbilityText(
        'If your crew has Normal Attack Only when the special is activated, boosts ATK of Driven characters by 2.5x for 1 turn.',
        'specialText',
      ),
    ).toEqual([]);
  });
});

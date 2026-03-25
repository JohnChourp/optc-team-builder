import { beforeAll, describe, expect, it } from 'vitest';

let analyzeSpecialText: (value: unknown) => Array<{
  key: string;
  label: string;
  minTurns: number | null;
  isCompleteRemoval: boolean;
  slotTokens: string[];
}>;

beforeAll(async () => {
  ({ analyzeSpecialText } = await import(
    new URL('../../../../scripts/auto-team-builder-ability-parser.mjs', import.meta.url).href
  ));
});

describe('auto team builder ability parser', () => {
  it('extracts bind and despair removal with the same turn count', () => {
    expect(
      analyzeSpecialText(
        'Reduces Bind and Despair duration by 5 turns and boosts ATK of the crew by 2x for 1 turn.',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
      }),
      expect.objectContaining({
        key: 'remove_despair',
        minTurns: 5,
        slotTokens: [],
      }),
    ]);
  });

  it('extracts slot bind removal as a dedicated ability family', () => {
    expect(analyzeSpecialText('Reduces Slot Bind duration by 3 turns.')).toEqual([
      expect.objectContaining({
        key: 'remove_slot_bind',
        minTurns: 3,
        slotTokens: [],
      }),
    ]);
  });

  it('extracts typed slot barrier tokens from bracketed targets', () => {
    expect(
      analyzeSpecialText('Removes [DEX] and [STR] Slot Barrier completely and changes orbs.'),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_slot_barrier',
        minTurns: 99,
        isCompleteRemoval: true,
        slotTokens: ['DEX', 'STR'],
      }),
    ]);
  });

  it('extracts multiple unique effects from one special text without duplicates', () => {
    expect(
      analyzeSpecialText(
        'Reduces Bind duration by 5 turns, reduces Bind duration by 5 turns and reduces Paralysis duration by 2 turns.',
      ),
    ).toEqual([
      expect.objectContaining({
        key: 'remove_bind',
        minTurns: 5,
      }),
      expect.objectContaining({
        key: 'remove_paralysis',
        minTurns: 2,
      }),
    ]);
  });

  it('ignores unsupported boost-only text to avoid false positives', () => {
    expect(
      analyzeSpecialText(
        'Boosts ATK of Fighter characters by 2.5x for 1 turn and boosts Orb Effects by 2.25x for 1 turn.',
      ),
    ).toEqual([]);
  });
});

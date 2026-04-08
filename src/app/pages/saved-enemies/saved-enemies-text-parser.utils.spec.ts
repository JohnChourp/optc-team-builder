import { describe, expect, it } from 'vitest';

import { parseSavedEnemyText } from './saved-enemies-text-parser.utils';

describe('saved enemies text parser utils', () => {
  it('parses multiline and comma-separated mechanics plus direct abilities from pasted text', () => {
    const result = parseSavedEnemyText(
      `
        Top-Row Special Reverse 2 turns(s),
        99 turns(s) DEF Down Immunity,
        4 turn(s) ATH 70% Down,
        3 turn(s) 10000 Damage Burn (take damage when performing PERFECT attacks),
        3 turn(s) DEF x 5000,
        Non-Normal Attacks deal 1 damage,
        [EMPTY][STR][DEX][QCK][PSY][INT][G][RCV][TND][BOMB] Slots to [BLOCK][EMPTY] Slots,
        4 turn(s) Special Bind,
        4 turn(s) Paralysis,
        1 turn(s) Nullify Damage
      `,
      {
        abilityCatalogItems: [
          createAbilityCatalogItem('ignore_normal_attack_only', false),
          createAbilityCatalogItem('deal_fixed_damage', false),
          createAbilityCatalogItem('inflict_poison', false),
        ],
      },
    );

    expect(result.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'enemy_immunity',
        minTurns: 99,
      }),
      expect.objectContaining({
        mechanicKey: 'crew_atk_down',
        minTurns: 4,
      }),
      expect.objectContaining({
        mechanicKey: 'crew_burn',
        minTurns: 3,
      }),
      expect.objectContaining({
        mechanicKey: 'enemy_increased_defense',
        minTurns: 3,
      }),
      expect.objectContaining({
        mechanicKey: 'orb_block',
        minTurns: null,
      }),
      expect.objectContaining({
        mechanicKey: 'crew_special_bind',
        minTurns: 4,
      }),
      expect.objectContaining({
        mechanicKey: 'crew_paralysis',
        minTurns: 4,
      }),
      expect.objectContaining({
        mechanicKey: 'enemy_damage_nullification',
        minTurns: 1,
      }),
    ]);
    expect(result.requiredAbilities).toEqual([
      expect.objectContaining({
        abilityKey: 'ignore_normal_attack_only',
      }),
    ]);
    expect(result.unmatchedLines).toEqual(['Top-Row Special Reverse 2 turns(s)']);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'precisionLoss',
          line: '99 turns(s) DEF Down Immunity',
          resolvedKey: 'enemy_immunity',
        }),
        expect.objectContaining({
          kind: 'precisionLoss',
          line: '4 turn(s) ATH 70% Down',
          resolvedKey: 'crew_atk_down',
        }),
        expect.objectContaining({
          kind: 'precisionLoss',
          line: '[EMPTY][STR][DEX][QCK][PSY][INT][G][RCV][TND][BOMB] Slots to [BLOCK][EMPTY] Slots',
          resolvedKey: 'orb_block',
        }),
        expect.objectContaining({
          kind: 'unmatched',
          line: 'Top-Row Special Reverse 2 turns(s)',
        }),
      ]),
    );
  });

  it('dedupes repeated mechanics and direct abilities using the maximum turn value', () => {
    const result = parseSavedEnemyText(
      `
        4 turn(s) Special Bind,
        6 turn(s) Special Bind,
        fixed damage,
        fixed damage,
        poison
      `,
      {
        abilityCatalogItems: [
          createAbilityCatalogItem('deal_fixed_damage', false),
          createAbilityCatalogItem('inflict_poison', false),
        ],
      },
    );

    expect(result.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'crew_special_bind',
        minTurns: 6,
      }),
    ]);
    expect(result.requiredAbilities).toEqual([
      expect.objectContaining({ abilityKey: 'deal_fixed_damage' }),
      expect.objectContaining({ abilityKey: 'inflict_poison' }),
    ]);
    expect(result.matchedMechanicCount).toBe(1);
    expect(result.matchedAbilityCount).toBe(2);
  });

  it('warns when positional detail is dropped but still keeps the supported core mechanic', () => {
    const result = parseSavedEnemyText('Top-Row 4 turn(s) Special Bind', {
      abilityCatalogItems: [],
    });

    expect(result.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'crew_special_bind',
        minTurns: 4,
      }),
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        kind: 'precisionLoss',
        line: 'Top-Row 4 turn(s) Special Bind',
        matchKind: 'mechanic',
        resolvedKey: 'crew_special_bind',
      }),
    ]);
  });
});

function createAbilityCatalogItem(abilityKey: string, supportsTurns: boolean) {
  return {
    key: abilityKey,
    label: abilityKey,
    supportsTurns,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    availableCoverageModes: ['explicit'],
    matchCount: 1,
    sampleCharacterIds: [1],
    sampleTexts: [abilityKey],
  };
}

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
          createAbilityCatalogItem('remove_special_bind', false),
          createAbilityCatalogItem('remove_paralysis', false),
          createAbilityCatalogItem('remove_enemy_damage_nullification', false),
          createAbilityCatalogItem('crewmate_recover_special_reverse', false),
          createAbilityCatalogItem('crewmate_recover_special_bind', false),
          createAbilityCatalogItem('crewmate_recover_paralysis', false),
          createAbilityCatalogItem('support_status_effect_recovery_special_bind', false),
          createAbilityCatalogItem('support_status_effect_recovery_paralysis', false),
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
    expect(result.parsedAbilityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          abilityKey: 'crewmate_recover_special_reverse',
          category: 'crewmate',
        }),
        expect.objectContaining({
          abilityKey: 'remove_special_bind',
          category: 'special',
        }),
        expect.objectContaining({
          abilityKey: 'crewmate_recover_special_bind',
          category: 'crewmate',
        }),
        expect.objectContaining({
          abilityKey: 'support_status_effect_recovery_special_bind',
          category: 'support',
        }),
        expect.objectContaining({
          abilityKey: 'remove_paralysis',
          category: 'special',
        }),
        expect.objectContaining({
          abilityKey: 'support_status_effect_recovery_paralysis',
          category: 'support',
        }),
      ]),
    );
    expect(result.unmatchedLines).toEqual([]);
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
          kind: 'precisionLoss',
          line: 'Top-Row Special Reverse 2 turns(s)',
          matchKind: 'ability',
          resolvedKey: 'crewmate_recover_special_reverse',
        }),
      ]),
    );
  });

  it('creates exact parsed candidates for derived mechanic abilities and support equivalents', () => {
    const bindResult = parseSavedEnemyText('4 turn(s) Bind', {
      abilityCatalogItems: [
        createAbilityCatalogItem('remove_bind', false),
        createAbilityCatalogItem('support_status_effect_recovery_bind', false),
      ],
    });
    const despairResult = parseSavedEnemyText('7 turn(s) Despair', {
      abilityCatalogItems: [createAbilityCatalogItem('remove_despair', false)],
    });

    expect(bindResult.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'crew_bind',
        derivedAbilityKey: 'remove_bind',
      }),
    ]);
    expect(bindResult.parsedAbilityCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        abilityKey: 'remove_bind',
        category: 'special',
      }),
      expect.objectContaining({
        abilityKey: 'support_status_effect_recovery_bind',
        category: 'support',
      }),
    ]));
    expect(despairResult.parsedAbilityCandidates).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_despair',
        category: 'special',
      }),
    ]);
  });

  it('creates exact parsed candidates for unmapped derived mechanic abilities', () => {
    const result = parseSavedEnemyText('4 turn(s) Chain Lock', {
      abilityCatalogItems: [createAbilityCatalogItem('remove_chain_multiplier_limit', false)],
    });

    expect(result.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'crew_chain_multiplier_limit',
        derivedAbilityKey: 'remove_chain_multiplier_limit',
      }),
    ]);
    expect(result.parsedAbilityCandidates).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_chain_multiplier_limit',
        category: 'special',
      }),
    ]);
  });

  it('does not duplicate exact candidates that are also listed as family equivalents', () => {
    const result = parseSavedEnemyText('4 turn(s) Special Bind', {
      abilityCatalogItems: [
        createAbilityCatalogItem('remove_special_bind', false),
        createAbilityCatalogItem('crewmate_recover_special_bind', false),
        createAbilityCatalogItem('support_status_effect_recovery_special_bind', false),
      ],
    });

    expect(
      result.parsedAbilityCandidates.filter(
        (candidate) => candidate.category === 'special' && candidate.abilityKey === 'remove_special_bind',
      ),
    ).toHaveLength(1);
    expect(result.parsedAbilityCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        abilityKey: 'crewmate_recover_special_bind',
        category: 'crewmate',
      }),
      expect.objectContaining({
        abilityKey: 'support_status_effect_recovery_special_bind',
        category: 'support',
      }),
    ]));
  });

  it('counts repeated mechanics and direct abilities inside the same section while keeping the maximum turn value', () => {
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
        requiredCharacterCount: 2,
      }),
    ]);
    expect(result.requiredAbilities).toEqual([
      expect.objectContaining({ abilityKey: 'deal_fixed_damage', requiredCharacterCount: 2 }),
      expect.objectContaining({ abilityKey: 'inflict_poison', requiredCharacterCount: 1 }),
    ]);
    expect(result.matchedMechanicCount).toBe(1);
    expect(result.matchedAbilityCount).toBe(2);
  });

  it('counts repeated mechanics and direct abilities across battle headers', () => {
    const result = parseSavedEnemyText(
      `
        Battle 3
        4 turn(s) Paralysis,
        fixed damage,
        Battle 4
        6 turn(s) Paralysis,
        fixed damage
      `,
      {
        abilityCatalogItems: [createAbilityCatalogItem('deal_fixed_damage', false)],
      },
    );

    expect(result.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'crew_paralysis',
        minTurns: 6,
        requiredCharacterCount: 2,
      }),
    ]);
    expect(result.requiredAbilities).toEqual([
      expect.objectContaining({
        abilityKey: 'deal_fixed_damage',
        requiredCharacterCount: 2,
      }),
    ]);
    expect(result.unmatchedLines).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('keeps ignore normal attack only at a single-character default across battle headers', () => {
    const result = parseSavedEnemyText(
      `
        Battle 3
        Non-Normal Attacks deal 1 damage,
        Battle 4
        Non-Normal Attacks deal 1 damage
      `,
      {
        abilityCatalogItems: [createAbilityCatalogItem('ignore_normal_attack_only', false)],
      },
    );

    expect(result.requiredAbilities).toEqual([
      expect.objectContaining({
        abilityKey: 'ignore_normal_attack_only',
        requiredCharacterCount: 1,
      }),
    ]);
    expect(result.unmatchedLines).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('keeps pre-header lines in the default section and ignores header-only lines', () => {
    const result = parseSavedEnemyText(
      `
        4 turn(s) Paralysis,
        Stage 3
        4 turn(s) Paralysis,
        Wave 4:
      `,
      {
        abilityCatalogItems: [],
      },
    );

    expect(result.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'crew_paralysis',
        minTurns: 4,
        requiredCharacterCount: 2,
      }),
    ]);
    expect(result.unmatchedLines).toEqual([]);
    expect(result.warnings).toEqual([]);
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

  it('parses whole-quest battle notes, keeps supported aliases, and leaves unsupported lines unmatched', () => {
    const result = parseSavedEnemyText(
      `
        BATTLE 1
        PREEMPTIVE
        Reduce Special Charge by 15
        Super Switch Effect requirement reduction: 15
        VS Effect gauge reduction: 15
        Retreat

        BATTLE 2
        PREEMPTIVE
        [EMPTY][STR][DEX][QCK][PSY][INT][G][RCVG][RCV][TND][BOMB] Slots to [BLOCK] Slots
        3 turn(s) Special Bind
        1 turn(s) Slot Barrier ([STR] Slots 2 time(s))
        Non-Normal Attacks deal 1 damage

        BATTLE 3
        STARTING STATE
        Eustass "Captain" Kid
        Status Effect Immunity (except Enemy's Poison)
        Immune to instant defeat Specials
        Percentage damage resistance 100%
        Weakness Class: Cerebral

        PREEMPTIVE
        3 turn(s) Special Bind
        7 turn(s) Top-Row Despair
        1 turn(s) Lock Slots
        For 10 turn(s) crew can only deal up to 80% of enemy's maximum HP damage per turn
        For 3 turn(s), apply Territory (Enemy) on 1 rn(s), apply Territory (Enemy) on the field62000 damage
        Non-Normal Attacks deal 1 damage

        INTERRUPTION When ally status is not applied (Switch Effect/Super Switch Effect)
        Unlimited number of times
        Full HP Recovery
        For 99 turn(s) Silence
        Beneficial Effects (including Super Status)/Accumulated Values Removal
        Non-Normal Attacks deal 1 damage

        NORMAL ACTION After 1 turn(s)
        Until using 1 [RCV] [SEMLA] slots, Reduce current HP by 10% each turn, ATK 90% Down
        Non-Normal Attacks deal 1 damage
      `,
      {
        abilityCatalogItems: [createAbilityCatalogItem('ignore_normal_attack_only', false)],
      },
    );

    expect(result.enemyMechanics).toEqual([
      expect.objectContaining({
        mechanicKey: 'orb_block',
        minTurns: null,
      }),
      expect.objectContaining({
        mechanicKey: 'crew_special_bind',
        minTurns: 99,
        requiredCharacterCount: 3,
      }),
      expect.objectContaining({
        mechanicKey: 'enemy_immunity',
        minTurns: null,
      }),
      expect.objectContaining({
        mechanicKey: 'enemy_percent_damage_reduction',
        minTurns: null,
      }),
      expect.objectContaining({
        mechanicKey: 'crew_despair',
        minTurns: 7,
      }),
      expect.objectContaining({
        mechanicKey: 'orb_slot_bind',
        minTurns: 1,
      }),
      expect.objectContaining({
        mechanicKey: 'crew_atk_down',
        minTurns: null,
      }),
    ]);
    expect(result.requiredAbilities).toEqual([
      expect.objectContaining({
        abilityKey: 'ignore_normal_attack_only',
        requiredCharacterCount: 1,
      }),
    ]);
    expect(result.unmatchedLines).toEqual(
      expect.arrayContaining([
        'Retreat',
        '1 turn(s) Slot Barrier ([STR] Slots 2 time(s))',
        'For 10 turn(s) crew can only deal up to 80% of enemy\'s maximum HP damage per turn',
        'For 3 turn(s)',
        'apply Territory (Enemy) on 1 rn(s)',
        'INTERRUPTION When ally status is not applied (Switch Effect/Super Switch Effect)',
        'Full HP Recovery',
        'Beneficial Effects (including Super Status)/Accumulated Values Removal',
      ]),
    );
    expect(result.unmatchedLines).not.toEqual(
      expect.arrayContaining(['PREEMPTIVE', 'STARTING STATE', 'Unlimited number of times']),
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'precisionLoss',
          line: 'Status Effect Immunity (except Enemy\'s Poison)',
          resolvedKey: 'enemy_immunity',
        }),
        expect.objectContaining({
          kind: 'precisionLoss',
          line: 'Percentage damage resistance 100%',
          resolvedKey: 'enemy_percent_damage_reduction',
        }),
        expect.objectContaining({
          kind: 'precisionLoss',
          line: '7 turn(s) Top-Row Despair',
          resolvedKey: 'crew_despair',
        }),
        expect.objectContaining({
          kind: 'precisionLoss',
          line: '1 turn(s) Lock Slots',
          resolvedKey: 'orb_slot_bind',
        }),
      ]),
    );
  });
});

function createAbilityCatalogItem(abilityKey: string, supportsTurns: boolean) {
  return {
    key: abilityKey,
    label: abilityKey,
    category: resolveAbilityCategory(abilityKey),
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

function resolveAbilityCategory(abilityKey: string): 'special' | 'crewmate' | 'potential' | 'support' {
  if (abilityKey.startsWith('crewmate_')) {
    return 'crewmate';
  }

  if (abilityKey.startsWith('potential_')) {
    return 'potential';
  }

  if (abilityKey.startsWith('support_')) {
    return 'support';
  }

  return 'special';
}

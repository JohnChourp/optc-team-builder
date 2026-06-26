import { describe, expect, it } from 'vitest';

import { type AutoBuildAbilityCatalogItem } from '../models/auto-team-builder-ability.models';
import {
  createCategoryAbilityDrafts,
  getCaptainAbilityCatalogItems,
  getAbilityCatalogItemsByCategory,
  intersectAbilityMatchingCharacterIds,
  resolveCaptainAbilityMatchingCharacterIds,
  resolveCategoryAbilityMatchingCharacterIds,
  resolveSpecialAbilityMatchingCharacterIds,
  serializeCategoryAbilityDrafts,
} from './special-ability-filter.utils';

const CATALOG_ITEMS: AutoBuildAbilityCatalogItem[] = [
  {
    key: 'boost_atk',
    label: 'Boost ATK',
    category: 'special',
    groupLabel: 'Boost Damage',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: true,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 2,
    matchingCharacterIds: [10, 20],
    turnMatchingCharacterIds: [
      { minTurns: 1, characterIds: [10] },
      { minTurns: 2, characterIds: [20] },
    ],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'territory',
    label: 'Territory',
    category: 'special',
    groupLabel: 'Field Effects',
    groupOrder: 8,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText', 'superSpecialText'],
    matchCount: 2,
    matchingCharacterIds: [4561, 5000],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'crewmate_atk_boost_fighter',
    label: 'ATK Boost: Fighter',
    category: 'crewmate',
    groupLabel: 'ATK Boost',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: true,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['sailorAbilities'],
    matchCount: 2,
    matchingCharacterIds: [20, 30],
    turnMatchingCharacterIds: [
      { minTurns: 3, characterIds: [20] },
      { minTurns: 7, characterIds: [30] },
    ],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'crewmate_hp_recovery_eot',
    label: 'Hp Recovery at End of Turn',
    category: 'crewmate',
    groupLabel: 'Other',
    groupOrder: 2,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['sailorAbilities'],
    matchCount: 0,
    matchingCharacterIds: [],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'potential_barrier_pierce',
    label: 'Barrier Pierce',
    category: 'potential',
    groupLabel: 'Other',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['potentialAbilities'],
    matchCount: 2,
    matchingCharacterIds: [30, 40],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'potential_final_tap_sugo_special',
    label: 'Final Tap Sugo Special',
    category: 'potential',
    groupLabel: 'Unique Abilities',
    groupOrder: 2,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['finalTapData'],
    matchCount: 0,
    matchingCharacterIds: [],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'support_atk_boost',
    label: 'ATK Boost',
    category: 'support',
    groupLabel: 'Boost Damage',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['supportData'],
    matchCount: 2,
    matchingCharacterIds: [20, 30],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'support_reduce_enemy_effect_turns_def_up',
    label: 'Reduce Enemy Effect Turns: DEF Up',
    category: 'support',
    groupLabel: 'Reduce Enemy Effect Duration',
    groupOrder: 2,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['supportData'],
    matchCount: 1,
    matchingCharacterIds: [30],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'support_apply_status_effect_delay',
    label: 'Delay',
    category: 'support',
    groupLabel: 'Apply Status Effect',
    groupOrder: 3,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['supportData'],
    matchCount: 0,
    matchingCharacterIds: [],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
];

describe('special ability filter utils', () => {
  it('returns only the requested category', () => {
    expect(
      getAbilityCatalogItemsByCategory(CATALOG_ITEMS, 'crewmate').map((item) => item.key),
    ).toEqual(['crewmate_atk_boost_fighter', 'crewmate_hp_recovery_eot']);
  });

  it('returns defensive category copies from the catalog index cache', () => {
    const firstResult = getAbilityCatalogItemsByCategory(CATALOG_ITEMS, 'crewmate');
    firstResult.pop();

    expect(
      getAbilityCatalogItemsByCategory(CATALOG_ITEMS, 'crewmate').map((item) => item.key),
    ).toEqual(['crewmate_atk_boost_fighter', 'crewmate_hp_recovery_eot']);
  });

  it('keeps Territory selectable for true Special and Super Special providers', () => {
    expect(
      getAbilityCatalogItemsByCategory(CATALOG_ITEMS, 'special').map((item) => item.key),
    ).toEqual(['boost_atk', 'territory']);
    expect(
      resolveSpecialAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'territory',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
      ),
    ).toEqual([5000, 4561]);
  });

  it('keeps Territory out of the captain picker unless a captain source truly provides it', () => {
    expect(getCaptainAbilityCatalogItems(CATALOG_ITEMS).map((item) => item.key)).not.toContain(
      'territory',
    );
    expect(
      getCaptainAbilityCatalogItems([
        ...CATALOG_ITEMS,
        {
          ...CATALOG_ITEMS.find((item) => item.key === 'territory')!,
          availableSources: ['captainAbility'],
        },
      ]).map((item) => item.key),
    ).toContain('territory');
  });

  it('resolves captain ability matches from captain-only catalog ids', () => {
    const catalogItems: AutoBuildAbilityCatalogItem[] = [
      ...CATALOG_ITEMS,
      {
        key: 'boost_orb',
        label: 'Boost Orb',
        category: 'special',
        groupLabel: 'Boost Damage',
        groupOrder: 1,
        effectOrder: 2,
        supportsTurns: true,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['captainAbility', 'specialText'],
        matchCount: 3,
        matchingCharacterIds: [10, 20, 30],
        turnMatchingCharacterIds: [
          { minTurns: 1, characterIds: [10, 20] },
          { minTurns: 2, characterIds: [30] },
        ],
        captainAbilityMatchingCharacterIds: [20],
        captainAbilityTurnMatchingCharacterIds: [{ minTurns: 2, characterIds: [20] }],
        sampleCharacterIds: [],
        sampleTexts: [],
      },
    ];

    expect(
      resolveCaptainAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'boost_orb',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          },
        ],
        catalogItems,
      ),
    ).toEqual([20]);
    expect(
      resolveCaptainAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'boost_orb',
            minTurns: 2,
            slotTokens: [],
            requiredCharacterCount: 1,
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          },
        ],
        catalogItems,
      ),
    ).toEqual([20]);
  });

  it('filters captain ability matches by structured effect metadata', () => {
    const catalogItems: AutoBuildAbilityCatalogItem[] = [
      ...CATALOG_ITEMS,
      {
        key: 'reduce_damage',
        label: 'Reduce Damage',
        category: 'special',
        groupLabel: 'Damage Reduction',
        groupOrder: 3,
        effectOrder: 1,
        supportsTurns: false,
        supportsSlotTokens: false,
        availableSlotTokens: [],
        availableSources: ['captainAbility'],
        matchCount: 3,
        matchingCharacterIds: [101, 202, 303],
        captainAbilityMatchingCharacterIds: [101, 202, 303],
        captainAbilityEffectMatches: [
          { characterId: 101, minEffectValue: 10, effectTargetScope: 'crew', slotTokens: [] },
          { characterId: 202, minEffectValue: 30, effectTargetScope: 'captains', slotTokens: [] },
          { characterId: 303, minEffectValue: 30, effectTargetScope: 'self', slotTokens: [] },
        ],
        sampleCharacterIds: [],
        sampleTexts: [],
      },
    ];

    expect(
      resolveCaptainAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'reduce_damage',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
            sourceScope: 'captainAbility',
            minEffectValue: 20,
            effectTargetScope: 'self',
          },
        ],
        catalogItems,
      ),
    ).toEqual([303, 202]);
  });

  it('filters captain favorable-slot matches by selected slot tokens', () => {
    const catalogItems: AutoBuildAbilityCatalogItem[] = [
      ...CATALOG_ITEMS,
      {
        key: 'make_slots_favorable',
        label: 'Make Slots Favorable',
        category: 'special',
        groupLabel: 'Slot',
        groupOrder: 4,
        effectOrder: 2,
        supportsTurns: false,
        supportsSlotTokens: true,
        availableSlotTokens: ['INT', 'RCV'],
        availableSources: ['captainAbility'],
        matchCount: 2,
        matchingCharacterIds: [101, 202],
        captainAbilityMatchingCharacterIds: [101, 202],
        captainAbilityEffectMatches: [
          { characterId: 101, effectTargetScope: 'crew', slotTokens: ['RCV'] },
          { characterId: 202, effectTargetScope: 'crew', slotTokens: ['INT'] },
        ],
        sampleCharacterIds: [],
        sampleTexts: [],
      },
    ];

    expect(
      resolveCaptainAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'make_slots_favorable',
            minTurns: null,
            slotTokens: ['RCV'],
            requiredCharacterCount: 1,
            sourceScope: 'captainAbility',
            effectTargetScope: 'crew',
          },
        ],
        catalogItems,
      ),
    ).toEqual([101]);
  });

  it('serializes category drafts with normalized strict-and fields', () => {
    const drafts = createCategoryAbilityDrafts(
      [
        {
          abilityKey: 'crewmate_atk_boost_fighter',
          minTurns: 7,
          slotTokens: ['RCV'],
          requiredCharacterCount: 4,
        },
      ],
      CATALOG_ITEMS,
      'crewmate',
    );

    expect(serializeCategoryAbilityDrafts(drafts, CATALOG_ITEMS, 'crewmate')).toEqual([
      {
        abilityKey: 'crewmate_atk_boost_fighter',
        minTurns: 7,
        slotTokens: [],
        requiredCharacterCount: 4,
      },
    ]);
  });

  it('preserves duplicate category drafts when dedupe is disabled', () => {
    expect(
      serializeCategoryAbilityDrafts(
        [
          {
            draftId: 'crewmate-1',
            abilityKey: 'crewmate_atk_boost_fighter',
            minTurns: 3,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
          {
            draftId: 'crewmate-2',
            abilityKey: 'crewmate_atk_boost_fighter',
            minTurns: 7,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'crewmate',
        { dedupe: false },
      ),
    ).toEqual([
      {
        abilityKey: 'crewmate_atk_boost_fighter',
        minTurns: 3,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
      {
        abilityKey: 'crewmate_atk_boost_fighter',
        minTurns: 7,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
  });

  it('returns only potential items for the potential category', () => {
    expect(
      getAbilityCatalogItemsByCategory(CATALOG_ITEMS, 'potential').map((item) => item.key),
    ).toEqual(['potential_barrier_pierce', 'potential_final_tap_sugo_special']);
  });

  it('returns only support items for the support category', () => {
    expect(
      getAbilityCatalogItemsByCategory(CATALOG_ITEMS, 'support').map((item) => item.key),
    ).toEqual([
      'support_atk_boost',
      'support_reduce_enemy_effect_turns_def_up',
      'support_apply_status_effect_delay',
    ]);
  });

  it('intersects matching ids strictly within the requested category', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'crewmate_atk_boost_fighter',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'crewmate',
      ),
    ).toEqual([30, 20]);
  });

  it('filters category matches by minimum turns when requested', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'crewmate_atk_boost_fighter',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'crewmate',
      ),
    ).toEqual([30]);
  });

  it('unions duplicate same-ability category matches before intersecting other groups', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'crewmate_atk_boost_fighter',
            minTurns: 3,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
          {
            abilityKey: 'crewmate_atk_boost_fighter',
            minTurns: 7,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'crewmate',
      ),
    ).toEqual([30, 20]);
  });

  it('returns no category matches when no turn bucket satisfies the requested turns', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'crewmate_atk_boost_fighter',
            minTurns: 9,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'crewmate',
      ),
    ).toEqual([]);
  });

  it('filters special matches by minimum turns through the special helper', () => {
    expect(
      resolveSpecialAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'boost_atk',
            minTurns: 2,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
      ),
    ).toEqual([20]);
  });

  it('returns no results when a selected category effect has no matches', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'crewmate_hp_recovery_eot',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'crewmate',
      ),
    ).toEqual([]);
  });

  it('strictly intersects selected potential effects', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'potential_barrier_pierce',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'potential',
      ),
    ).toEqual([40, 30]);
  });

  it('returns no results when a selected potential effect has no matches', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'potential_final_tap_sugo_special',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'potential',
      ),
    ).toEqual([]);
  });

  it('strictly intersects selected support effects', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'support_atk_boost',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
          {
            abilityKey: 'support_reduce_enemy_effect_turns_def_up',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'support',
      ),
    ).toEqual([30]);
  });

  it('serializes support drafts with normalized binary V1 requirements', () => {
    expect(
      serializeCategoryAbilityDrafts(
        [
          {
            draftId: 'support-1',
            abilityKey: 'support_atk_boost',
            minTurns: 9,
            slotTokens: ['RCV'],
            requiredCharacterCount: 3,
            slotScope: 'sub',
          },
        ],
        CATALOG_ITEMS,
        'support',
      ),
    ).toEqual([
      {
        abilityKey: 'support_atk_boost',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 3,
        slotScope: 'sub',
      },
    ]);
  });

  it('returns no results when a selected support effect has no matches', () => {
    expect(
      resolveCategoryAbilityMatchingCharacterIds(
        [
          {
            abilityKey: 'support_apply_status_effect_delay',
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        CATALOG_ITEMS,
        'support',
      ),
    ).toEqual([]);
  });

  it('intersects special, crewmate, potential, and support result sets together', () => {
    expect(
      intersectAbilityMatchingCharacterIds([
        [10, 20, 30],
        [20, 30],
        [30, 40],
        [20, 30],
      ]),
    ).toEqual([30]);
  });
});

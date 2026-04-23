import { describe, expect, it } from 'vitest';

import { type AutoBuildAbilityCatalogItem } from '../models/auto-team-builder-ability.models';
import {
  createCategoryAbilityDrafts,
  getAbilityCatalogItemsByCategory,
  intersectAbilityMatchingCharacterIds,
  resolveCategoryAbilityMatchingCharacterIds,
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
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 2,
    matchingCharacterIds: [10, 20],
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
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['sailorAbilities'],
    matchCount: 2,
    matchingCharacterIds: [20, 30],
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
];

describe('special ability filter utils', () => {
  it('returns only the requested category', () => {
    expect(getAbilityCatalogItemsByCategory(CATALOG_ITEMS, 'crewmate').map((item) => item.key)).toEqual([
      'crewmate_atk_boost_fighter',
      'crewmate_hp_recovery_eot',
    ]);
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
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
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

  it('intersects special and crewmate result sets together', () => {
    expect(
      intersectAbilityMatchingCharacterIds([
        [10, 20],
        [20, 30],
      ]),
    ).toEqual([20]);
  });
});

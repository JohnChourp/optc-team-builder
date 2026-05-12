import { describe, expect, it } from 'vitest';

import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import {
  buildCharacterAbilityGroups,
  type CharacterAbilityGroupLabels,
} from './character-ability-groups.utils';

describe('buildCharacterAbilityGroups', () => {
  it('groups abilities by picker category and catalog subgroup', () => {
    const groups = buildCharacterAbilityGroups(
      [
        createAbility({ key: 'boost_atk', label: 'Boost ATK', source: 'specialText' }),
        createAbility({
          key: 'crewmate_recover_bind',
          label: 'Status Effect Recovery: Bind',
          source: 'sailorAbilities',
        }),
      ],
      [
        createCatalogItem({
          key: 'boost_atk',
          label: 'Boost ATK',
          category: 'special',
          groupLabel: 'Boost Damage',
        }),
        createCatalogItem({
          key: 'crewmate_recover_bind',
          label: 'Status Effect Recovery: Bind',
          category: 'crewmate',
          groupLabel: 'Status Effect Recovery',
        }),
      ],
      [],
      labels,
    );

    expect(groups.map((group) => group.label)).toEqual(['Special', 'Crewmate Ability']);
    expect(groups[0]?.subgroups[0]?.label).toBe('Boost Damage');
    expect(groups[1]?.subgroups[0]?.label).toBe('Status Effect Recovery');
  });

  it('falls back to legacy and other groups when catalog metadata is missing', () => {
    const groups = buildCharacterAbilityGroups(
      [createAbility({ key: 'unknown', label: 'Unknown', source: 'specialText' })],
      [],
      [],
      labels,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Legacy');
    expect(groups[0]?.subgroups[0]?.label).toBe('Other');
  });

  it('dedupes repeated parsed abilities with identical metadata', () => {
    const ability = createAbility({ key: 'boost_atk', label: 'Boost ATK', source: 'specialText' });
    const groups = buildCharacterAbilityGroups(
      [ability, ability],
      [
        createCatalogItem({
          key: 'boost_atk',
          label: 'Boost ATK',
          category: 'special',
          groupLabel: 'Boost Damage',
        }),
      ],
      [],
      labels,
    );

    expect(groups[0]?.abilityCount).toBe(1);
    expect(groups[0]?.subgroups[0]?.abilities).toHaveLength(1);
  });

  it('marks abilities that match highlighted requirements', () => {
    const requirement: AutoBuildAbilityRequirement = {
      abilityKey: 'boost_atk',
      minTurns: null,
      slotTokens: [],
      requiredCharacterCount: 1,
    };
    const groups = buildCharacterAbilityGroups(
      [createAbility({ key: 'boost_atk', label: 'Boost ATK', source: 'specialText' })],
      [
        createCatalogItem({
          key: 'boost_atk',
          label: 'Boost ATK',
          category: 'special',
          groupLabel: 'Boost Damage',
        }),
      ],
      [requirement],
      labels,
    );

    expect(groups[0]?.subgroups[0]?.abilities[0]?.highlighted).toBe(true);
  });
});

const labels: CharacterAbilityGroupLabels = {
  categories: {
    special: 'Special',
    crewmate: 'Crewmate Ability',
    potential: 'Potential Ability',
    support: 'Support Ability',
    legacy: 'Legacy',
  },
  otherGroup: 'Other',
  selectableDebuff: 'Selectable debuff',
  turns: (count) => `${count} turns`,
  sources: {
    specialText: 'Special',
    superSpecialText: 'Super Special',
    captainAbility: 'Captain',
    sailorAbilities: 'Crewmate',
    potentialAbilities: 'Potential',
    supportData: 'Support',
    superTandemData: 'Super Tandem',
    finalTapData: 'Final Tap',
    rushSugoSpecialData: 'Rush Sugo',
  },
};

function createAbility(
  overrides: Partial<NormalizedBuilderAbility> &
    Pick<NormalizedBuilderAbility, 'key' | 'label' | 'source'>,
): NormalizedBuilderAbility {
  return {
    minTurns: null,
    isCompleteRemoval: false,
    slotTokens: [],
    ...overrides,
  };
}

function createCatalogItem(
  overrides: Partial<AutoBuildAbilityCatalogItem> &
    Pick<AutoBuildAbilityCatalogItem, 'key' | 'label'>,
): AutoBuildAbilityCatalogItem {
  return {
    category: 'special',
    groupLabel: null,
    groupOrder: null,
    effectOrder: null,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 0,
    sampleCharacterIds: [],
    sampleTexts: [],
    ...overrides,
  };
}

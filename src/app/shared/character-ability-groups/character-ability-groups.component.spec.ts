import '@angular/compiler';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  type AutoBuildAbilityCatalogItem,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import { CharacterAbilityGroupsComponent } from './character-ability-groups.component';

describe('CharacterAbilityGroupsComponent', () => {
  it('builds a compact table view with category columns and all subgroup rows', () => {
    const component = createComponent();

    component.catalogItems = [
      createCatalogItem({
        key: 'boost_atk',
        label: 'Boost ATK',
        category: 'special',
        groupLabel: 'Boost Damage',
      }),
      createCatalogItem({
        key: 'remove_bind',
        label: 'Remove Bind',
        category: 'special',
        groupLabel: 'Reduce Status Effect Duration',
      }),
      createCatalogItem({
        key: 'support_slot_change',
        label: 'Change BLOCK Slots',
        category: 'support',
        groupLabel: 'Slot Change',
      }),
    ];
    component.abilities = [
      createAbility({ key: 'boost_atk', label: 'Boost ATK', source: 'specialText' }),
      createAbility({ key: 'remove_bind', label: 'Remove Bind', source: 'specialText' }),
      createAbility({
        key: 'support_slot_change',
        label: 'Change BLOCK Slots',
        source: 'supportData',
      }),
    ];

    const table = component.tableView();

    expect(table.categories.map((category) => category.label)).toEqual([
      'Special',
      'Support Ability',
    ]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells.map((cell) => cell.subgroup?.label ?? null)).toEqual([
      'Boost Damage',
      'Slot Change',
    ]);
    expect(table.rows[1]?.cells.map((cell) => cell.subgroup?.label ?? null)).toEqual([
      'Reduce Status Effect Duration',
      null,
    ]);
  });

  it('keeps the template free of expansion controls and clipped overflow copy', () => {
    const template = readFileSync(
      'src/app/shared/character-ability-groups/character-ability-groups.component.html',
      'utf8',
    );
    const styles = readFileSync(
      'src/app/shared/character-ability-groups/character-ability-groups.component.scss',
      'utf8',
    );

    expect(template).toContain('ability-table__header');
    expect(template).toContain('ability-subgroup-label');
    expect(template).not.toContain('<details');
    expect(template).not.toContain('<summary');
    expect(template).not.toContain('more');
    expect(styles).not.toContain('overflow: hidden');
    expect(styles).not.toContain('max-height');
  });
});

function createComponent(): CharacterAbilityGroupsComponent {
  return new CharacterAbilityGroupsComponent({
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        'characterAbilityGroups.categories.special': 'Special',
        'characterAbilityGroups.categories.crewmate': 'Crewmate Ability',
        'characterAbilityGroups.categories.potential': 'Potential Ability',
        'characterAbilityGroups.categories.support': 'Support Ability',
        'characterAbilityGroups.categories.legacy': 'Other Abilities',
        'characterAbilityGroups.groups.other': 'Other',
        'characterAbilityGroups.coverageModes.selectedDebuff': 'Selectable debuff',
        'characterAbilityGroups.sources.specialText': 'Special',
        'characterAbilityGroups.sources.superSpecialText': 'Super Special',
        'characterAbilityGroups.sources.captainAbility': 'Captain',
        'characterAbilityGroups.sources.sailorAbilities': 'Crewmate',
        'characterAbilityGroups.sources.potentialAbilities': 'Potential',
        'characterAbilityGroups.sources.supportData': 'Support',
        'characterAbilityGroups.sources.superTandemData': 'Super Tandem',
        'characterAbilityGroups.sources.finalTapData': 'Final Tap',
        'characterAbilityGroups.sources.rushSugoSpecialData': 'Rush Sugo',
      };

      if (key === 'characterAbilityGroups.metadata.turns') {
        return `${params?.['count'] ?? 0} turns`;
      }

      return translations[key] ?? key;
    }),
  } as never);
}

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

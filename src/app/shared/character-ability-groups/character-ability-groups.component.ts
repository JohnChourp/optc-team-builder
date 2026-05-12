import { Component, Input } from '@angular/core';

import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityRequirement,
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  buildCharacterAbilityGroups,
  type CharacterAbilityCategoryGroup,
  type CharacterAbilityGroupDisplayMode,
  type CharacterAbilityGroupLabels,
  type CharacterAbilitySubcategoryGroup,
} from './character-ability-groups.utils';

interface CharacterAbilityTableCell {
  key: string;
  subgroup: CharacterAbilitySubcategoryGroup | null;
}

interface CharacterAbilityTableRow {
  key: string;
  cells: CharacterAbilityTableCell[];
}

export interface CharacterAbilityTableView {
  categories: CharacterAbilityCategoryGroup[];
  rows: CharacterAbilityTableRow[];
}

@Component({
  selector: 'app-character-ability-groups',
  standalone: true,
  templateUrl: './character-ability-groups.component.html',
  styleUrl: './character-ability-groups.component.scss',
})
export class CharacterAbilityGroupsComponent {
  @Input() public abilities: NormalizedBuilderAbility[] = [];
  @Input() public catalogItems: AutoBuildAbilityCatalogItem[] = [];
  @Input() public highlightedRequirements: AutoBuildAbilityRequirement[] = [];
  @Input() public displayMode: CharacterAbilityGroupDisplayMode = 'full';

  public constructor(private readonly i18n: AppI18nService) {}

  public tableView(): CharacterAbilityTableView {
    const categories = buildCharacterAbilityGroups(
      this.abilities,
      this.catalogItems,
      this.highlightedRequirements,
      this.labels(),
    );
    const maxRowCount = Math.max(0, ...categories.map((category) => category.subgroups.length));
    const rows = Array.from({ length: maxRowCount }, (_, rowIndex) => ({
      key: `row:${rowIndex}`,
      cells: categories.map((category) => ({
        key: `${category.key}:${rowIndex}`,
        subgroup: category.subgroups[rowIndex] ?? null,
      })),
    }));

    return {
      categories,
      rows,
    };
  }

  private labels(): CharacterAbilityGroupLabels {
    return {
      categories: {
        special: this.t('categories.special'),
        crewmate: this.t('categories.crewmate'),
        potential: this.t('categories.potential'),
        support: this.t('categories.support'),
        legacy: this.t('categories.legacy'),
      } satisfies Record<AutoBuildAbilityCategory, string>,
      otherGroup: this.t('groups.other'),
      selectableDebuff: this.t('coverageModes.selectedDebuff'),
      turns: (count) => this.t('metadata.turns', { count }),
      sources: {
        specialText: this.t('sources.specialText'),
        superSpecialText: this.t('sources.superSpecialText'),
        captainAbility: this.t('sources.captainAbility'),
        sailorAbilities: this.t('sources.sailorAbilities'),
        potentialAbilities: this.t('sources.potentialAbilities'),
        supportData: this.t('sources.supportData'),
        superTandemData: this.t('sources.superTandemData'),
        finalTapData: this.t('sources.finalTapData'),
        rushSugoSpecialData: this.t('sources.rushSugoSpecialData'),
      } satisfies Record<AutoBuildAbilitySource, string>,
    };
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(`characterAbilityGroups.${key}`, params);
  }
}

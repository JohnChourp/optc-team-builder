import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityCoverageMode,
  type AutoBuildAbilityRequirement,
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import { matchesAnyAbilityRequirement } from '../../core/services/auto-team-builder-ability-match.utils';

export type CharacterAbilityGroupDisplayMode = 'full' | 'collapsed';

export interface CharacterAbilityGroupLabels {
  categories: Record<AutoBuildAbilityCategory, string>;
  otherGroup: string;
  selectableDebuff: string;
  turns: (count: number) => string;
  sources: Record<AutoBuildAbilitySource, string>;
}

interface CharacterAbilityView {
  key: string;
  label: string;
  highlighted: boolean;
}

export interface CharacterAbilitySubcategoryGroup {
  key: string;
  label: string;
  abilities: CharacterAbilityView[];
}

export interface CharacterAbilityCategoryGroup {
  key: AutoBuildAbilityCategory;
  label: string;
  abilityCount: number;
  subgroups: CharacterAbilitySubcategoryGroup[];
}

const PICKER_CATEGORY_ORDER: AutoBuildAbilityCategory[] = [
  'special',
  'crewmate',
  'potential',
  'support',
  'legacy',
];

export function buildCharacterAbilityGroups(
  abilities: readonly NormalizedBuilderAbility[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  highlightedRequirements: readonly AutoBuildAbilityRequirement[],
  labels: CharacterAbilityGroupLabels,
): CharacterAbilityCategoryGroup[] {
  const catalogMap = new Map(catalogItems.map((item) => [item.key, item] as const));
  const categoryGroups = new Map<AutoBuildAbilityCategory, CharacterAbilityCategoryGroup>();
  const subcategoryGroups = new Map<string, CharacterAbilitySubcategoryGroup>();
  const highlightedRequirementList = [...highlightedRequirements];
  const seen = new Set<string>();

  for (const ability of abilities) {
    const item = catalogMap.get(ability.key);
    const category = item?.category ?? 'legacy';
    const subcategoryLabel = item?.groupLabel?.trim() || labels.otherGroup;
    const dedupeKey = [
      ability.key,
      ability.minTurns ?? 'none',
      ability.slotTokens.join(','),
      ability.source,
      ability.coverageMode ?? 'explicit',
    ].join('|');

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);

    const categoryGroup =
      categoryGroups.get(category) ??
      createCategoryGroup(category, labels.categories[category] ?? category);
    const subcategoryKey = `${category}:${subcategoryLabel}`;
    const subcategoryGroup =
      subcategoryGroups.get(subcategoryKey) ??
      createSubcategoryGroup(subcategoryKey, subcategoryLabel);

    subcategoryGroup.abilities.push({
      key: dedupeKey,
      label: formatCharacterAbility(ability, labels),
      highlighted:
        highlightedRequirementList.length > 0 &&
        matchesAnyAbilityRequirement(ability, highlightedRequirementList),
    });

    subcategoryGroups.set(subcategoryKey, subcategoryGroup);

    if (!categoryGroup.subgroups.includes(subcategoryGroup)) {
      categoryGroup.subgroups.push(subcategoryGroup);
    }

    categoryGroup.abilityCount += 1;
    categoryGroups.set(category, categoryGroup);
  }

  return [...categoryGroups.values()].sort(
    (left, right) =>
      PICKER_CATEGORY_ORDER.indexOf(left.key) - PICKER_CATEGORY_ORDER.indexOf(right.key),
  );
}

function createCategoryGroup(
  key: AutoBuildAbilityCategory,
  label: string,
): CharacterAbilityCategoryGroup {
  return {
    key,
    label,
    abilityCount: 0,
    subgroups: [],
  };
}

function createSubcategoryGroup(key: string, label: string): CharacterAbilitySubcategoryGroup {
  return {
    key,
    label,
    abilities: [],
  };
}

function formatCharacterAbility(
  ability: NormalizedBuilderAbility,
  labels: CharacterAbilityGroupLabels,
): string {
  const metadata: string[] = [];

  if (ability.minTurns !== null) {
    metadata.push(labels.turns(ability.minTurns));
  }

  if (ability.slotTokens.length > 0) {
    metadata.push(ability.slotTokens.join(' / '));
  }

  const sourceLabel = labels.sources[ability.source];

  if (sourceLabel) {
    metadata.push(sourceLabel);
  }

  const metadataSuffix = metadata.length > 0 ? ` (${metadata.join(' • ')})` : '';

  return `${formatCharacterAbilityLabel(ability, labels)}${metadataSuffix}`;
}

function formatCharacterAbilityLabel(
  ability: NormalizedBuilderAbility,
  labels: CharacterAbilityGroupLabels,
): string {
  const coverageSuffix = resolveCoverageModeLabel(ability.coverageMode ?? 'explicit', labels);

  return coverageSuffix ? `${ability.label} (${coverageSuffix})` : ability.label;
}

function resolveCoverageModeLabel(
  coverageMode: AutoBuildAbilityCoverageMode,
  labels: CharacterAbilityGroupLabels,
): string | null {
  return coverageMode === 'selectedDebuff' ? labels.selectableDebuff : null;
}

import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../models/auto-team-builder-ability.models';
import {
  createAbilityRequirementDrafts,
  serializeAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from './ability-requirement-draft.utils';

export function getSpecialAbilityCatalogItems(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoBuildAbilityCatalogItem[] {
  return catalogItems
    .filter((item) => item.category === 'special')
    .sort(
      (left, right) =>
        (left.groupOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.groupOrder ?? Number.MAX_SAFE_INTEGER) ||
        (left.effectOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.effectOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.label.localeCompare(right.label),
    );
}

export function createSpecialAbilityDrafts(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AbilityRequirementDraft[] {
  const specialKeys = new Set(getSpecialAbilityCatalogItems(catalogItems).map((item) => item.key));

  return createAbilityRequirementDrafts(
    requirements
      .filter((requirement) => specialKeys.has(requirement.abilityKey))
      .map((requirement) => ({
        abilityKey: requirement.abilityKey,
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
      })),
  );
}

export function serializeSpecialAbilityDrafts(
  drafts: readonly AbilityRequirementDraft[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoBuildAbilityRequirement[] {
  const specialKeys = new Set(getSpecialAbilityCatalogItems(catalogItems).map((item) => item.key));

  return serializeAbilityRequirementDrafts(
    drafts.filter((draft) => specialKeys.has(draft.abilityKey)),
    {
      dedupe: true,
      forceSingleCharacterCount: true,
      catalogMap: new Map(catalogItems.map((item) => [item.key, item] as const)),
    },
  ).map((requirement) => ({
    abilityKey: requirement.abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
  }));
}

export function resolveSpecialAbilityMatchingCharacterIds(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): number[] | undefined {
  if (requirements.length === 0) {
    return undefined;
  }

  const catalogMap = new Map(catalogItems.map((item) => [item.key, item] as const));
  let matchingIds: Set<number> | null = null;

  for (const requirement of requirements) {
    const item = catalogMap.get(requirement.abilityKey);
    const itemIds = item?.matchingCharacterIds ?? [];

    if (itemIds.length === 0) {
      return [];
    }

    const itemIdSet = new Set<number>(itemIds);
    const currentMatchingIds: number[] =
      matchingIds === null
        ? itemIds
        : [...matchingIds.values()].filter((characterId: number) => itemIdSet.has(characterId));

    matchingIds = new Set<number>(currentMatchingIds);

    if (matchingIds.size === 0) {
      return [];
    }
  }

  return [...(matchingIds ?? new Set<number>())].sort((left, right) => right - left);
}

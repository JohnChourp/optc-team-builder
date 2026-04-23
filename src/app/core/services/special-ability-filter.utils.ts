import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityRequirement,
} from '../models/auto-team-builder-ability.models';
import {
  createAbilityRequirementDrafts,
  serializeAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from './ability-requirement-draft.utils';

function sortCatalogItems(
  items: readonly AutoBuildAbilityCatalogItem[],
): AutoBuildAbilityCatalogItem[] {
  return [...items].sort(
    (left, right) =>
      (left.groupOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.groupOrder ?? Number.MAX_SAFE_INTEGER) ||
      (left.effectOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.effectOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.label.localeCompare(right.label),
  );
}

function getCategoryAbilityKeys(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): Set<string> {
  return new Set(getAbilityCatalogItemsByCategory(catalogItems, category).map((item) => item.key));
}

export function getAbilityCatalogItemsByCategory(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): AutoBuildAbilityCatalogItem[] {
  return sortCatalogItems(catalogItems.filter((item) => item.category === category));
}

export function createCategoryAbilityDrafts(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): AbilityRequirementDraft[] {
  const categoryKeys = getCategoryAbilityKeys(catalogItems, category);
  const catalogMap = new Map(catalogItems.map((item) => [item.key, item] as const));

  return createAbilityRequirementDrafts(
    requirements
      .filter((requirement) => categoryKeys.has(requirement.abilityKey))
      .map((requirement) => {
        const catalogItem = catalogMap.get(requirement.abilityKey);

        return {
          abilityKey: requirement.abilityKey,
          minTurns: catalogItem?.supportsTurns ? requirement.minTurns : null,
          slotTokens: catalogItem?.supportsSlotTokens ? [...requirement.slotTokens] : [],
          requiredCharacterCount: requirement.requiredCharacterCount,
        };
      }),
  );
}

export function serializeCategoryAbilityDrafts(
  drafts: readonly AbilityRequirementDraft[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): AutoBuildAbilityRequirement[] {
  const categoryKeys = getCategoryAbilityKeys(catalogItems, category);

  return serializeAbilityRequirementDrafts(
    drafts.filter((draft) => categoryKeys.has(draft.abilityKey)),
    {
      dedupe: true,
      catalogMap: new Map(catalogItems.map((item) => [item.key, item] as const)),
    },
  );
}

export function resolveCategoryAbilityMatchingCharacterIds(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): number[] | undefined {
  const categoryKeys = getCategoryAbilityKeys(catalogItems, category);
  const categoryRequirements = requirements.filter((requirement) =>
    categoryKeys.has(requirement.abilityKey),
  );

  if (categoryRequirements.length === 0) {
    return undefined;
  }

  const catalogMap = new Map(catalogItems.map((item) => [item.key, item] as const));
  let matchingIds: Set<number> | null = null;

  for (const requirement of categoryRequirements) {
    const itemIds = catalogMap.get(requirement.abilityKey)?.matchingCharacterIds ?? [];

    if (itemIds.length === 0) {
      return [];
    }

    const itemIdSet = new Set<number>(itemIds);
    const currentIds: number[] =
      matchingIds === null
        ? itemIds
        : [...matchingIds].filter((characterId) => itemIdSet.has(characterId));

    matchingIds = new Set<number>(currentIds);

    if (matchingIds.size === 0) {
      return [];
    }
  }

  return [...(matchingIds ?? new Set<number>())].sort((left, right) => right - left);
}

export function intersectAbilityMatchingCharacterIds(
  idLists: ReadonlyArray<readonly number[] | undefined>,
): number[] | undefined {
  const definedLists = idLists.filter((ids): ids is readonly number[] => ids !== undefined);

  if (definedLists.length === 0) {
    return undefined;
  }

  let intersection = [...definedLists[0]];

  for (const ids of definedLists.slice(1)) {
    const idSet = new Set(ids);
    intersection = intersection.filter((id) => idSet.has(id));

    if (intersection.length === 0) {
      return [];
    }
  }

  return [...new Set(intersection)];
}

export function getSpecialAbilityCatalogItems(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoBuildAbilityCatalogItem[] {
  return getAbilityCatalogItemsByCategory(catalogItems, 'special');
}

export function createSpecialAbilityDrafts(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AbilityRequirementDraft[] {
  return createCategoryAbilityDrafts(requirements, catalogItems, 'special');
}

export function serializeSpecialAbilityDrafts(
  drafts: readonly AbilityRequirementDraft[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoBuildAbilityRequirement[] {
  return serializeCategoryAbilityDrafts(drafts, catalogItems, 'special');
}

export function resolveSpecialAbilityMatchingCharacterIds(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): number[] | undefined {
  return resolveCategoryAbilityMatchingCharacterIds(requirements, catalogItems, 'special');
}

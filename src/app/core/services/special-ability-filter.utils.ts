import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityRequirement,
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
} from '../models/auto-team-builder-ability.models';
import { matchesAbilityRequirementMetadata } from './auto-team-builder-ability-match.utils';
import {
  createAbilityRequirementDrafts,
  normalizeAbilityRequirementTurns,
  serializeAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from './ability-requirement-draft.utils';

interface SerializeCategoryAbilityDraftOptions {
  dedupe?: boolean;
}

interface CatalogAbilityIndex {
  captainAbilityItems: AutoBuildAbilityCatalogItem[];
  captainAbilityKeys: Set<string>;
  catalogMap: Map<string, AutoBuildAbilityCatalogItem>;
  categoryItems: Map<AutoBuildAbilityCategory, AutoBuildAbilityCatalogItem[]>;
  categoryKeys: Map<AutoBuildAbilityCategory, Set<string>>;
}

const catalogAbilityIndexCache = new WeakMap<
  readonly AutoBuildAbilityCatalogItem[],
  CatalogAbilityIndex
>();

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

function getCatalogAbilityIndex(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): CatalogAbilityIndex {
  const existingIndex = catalogAbilityIndexCache.get(catalogItems);

  if (existingIndex) {
    return existingIndex;
  }

  const captainAbilityItems = sortCatalogItems(
    catalogItems.filter((item) => item.availableSources.includes('captainAbility')),
  );
  const index: CatalogAbilityIndex = {
    captainAbilityItems,
    captainAbilityKeys: new Set(captainAbilityItems.map((item) => item.key)),
    catalogMap: new Map(catalogItems.map((item) => [item.key, item] as const)),
    categoryItems: new Map(),
    categoryKeys: new Map(),
  };

  catalogAbilityIndexCache.set(catalogItems, index);

  return index;
}

function getCategoryAbilityItems(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): AutoBuildAbilityCatalogItem[] {
  const index = getCatalogAbilityIndex(catalogItems);
  const existingItems = index.categoryItems.get(category);

  if (existingItems) {
    return existingItems;
  }

  const items = sortCatalogItems(catalogItems.filter((item) => item.category === category));
  index.categoryItems.set(category, items);

  return items;
}

function getCategoryAbilityKeys(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): Set<string> {
  const index = getCatalogAbilityIndex(catalogItems);
  const existingKeys = index.categoryKeys.get(category);

  if (existingKeys) {
    return existingKeys;
  }

  const keys = new Set(getCategoryAbilityItems(catalogItems, category).map((item) => item.key));
  index.categoryKeys.set(category, keys);

  return keys;
}

export function getAbilityCatalogItemsByCategory(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): AutoBuildAbilityCatalogItem[] {
  return [...getCategoryAbilityItems(catalogItems, category)];
}

export function isCaptainAbilityRequirement(requirement: AutoBuildAbilityRequirement): boolean {
  return normalizeAbilityRequirementSourceScope(requirement.sourceScope) === 'captainAbility';
}

export function getCaptainAbilityCatalogItems(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoBuildAbilityCatalogItem[] {
  return [...getCatalogAbilityIndex(catalogItems).captainAbilityItems];
}

export function createCategoryAbilityDrafts(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): AbilityRequirementDraft[] {
  const categoryKeys = getCategoryAbilityKeys(catalogItems, category);
  const { catalogMap } = getCatalogAbilityIndex(catalogItems);

  return createAbilityRequirementDrafts(
    requirements
      .filter(
        (requirement) =>
          categoryKeys.has(requirement.abilityKey) && !isCaptainAbilityRequirement(requirement),
      )
      .map((requirement) => {
        const catalogItem = catalogMap.get(requirement.abilityKey);

        return {
          abilityKey: requirement.abilityKey,
          minTurns: catalogItem?.supportsTurns ? requirement.minTurns : null,
          slotTokens: catalogItem?.supportsSlotTokens ? [...requirement.slotTokens] : [],
          requiredCharacterCount: requirement.requiredCharacterCount,
          slotScope: normalizeAbilityRequirementSlotScope(requirement.slotScope),
        };
      }),
  );
}

export function serializeCategoryAbilityDrafts(
  drafts: readonly AbilityRequirementDraft[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
  options: SerializeCategoryAbilityDraftOptions = {},
): AutoBuildAbilityRequirement[] {
  const categoryKeys = getCategoryAbilityKeys(catalogItems, category);
  const { catalogMap } = getCatalogAbilityIndex(catalogItems);

  return serializeAbilityRequirementDrafts(
    drafts.filter(
      (draft) =>
        categoryKeys.has(draft.abilityKey) &&
        normalizeAbilityRequirementSourceScope(draft.sourceScope) !== 'captainAbility',
    ),
    {
      dedupe: options.dedupe ?? true,
      catalogMap,
    },
  );
}

export function resolveCategoryAbilityMatchingCharacterIds(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  category: AutoBuildAbilityCategory,
): number[] | undefined {
  const categoryKeys = getCategoryAbilityKeys(catalogItems, category);
  const categoryRequirements = requirements.filter(
    (requirement) =>
      categoryKeys.has(requirement.abilityKey) && !isCaptainAbilityRequirement(requirement),
  );

  if (categoryRequirements.length === 0) {
    return undefined;
  }

  const { catalogMap } = getCatalogAbilityIndex(catalogItems);
  const groupedRequirements = groupCategoryRequirements(categoryRequirements);
  let matchingIds: Set<number> | null = null;

  for (const requirements of groupedRequirements) {
    const itemIds = resolveRequirementGroupMatchingCharacterIds(requirements, catalogMap);

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

export function resolveCaptainAbilityMatchingCharacterIds(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): number[] | undefined {
  const { captainAbilityKeys, catalogMap } = getCatalogAbilityIndex(catalogItems);
  const captainRequirements = requirements.filter(
    (requirement) =>
      captainAbilityKeys.has(requirement.abilityKey) &&
      isCaptainAbilityRequirement(requirement),
  );

  if (captainRequirements.length === 0) {
    return undefined;
  }

  const groupedRequirements = groupCategoryRequirements(captainRequirements);
  let matchingIds: Set<number> | null = null;

  for (const requirements of groupedRequirements) {
    const itemIds = resolveRequirementGroupMatchingCharacterIds(requirements, catalogMap, true);

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

function groupCategoryRequirements(
  requirements: readonly AutoBuildAbilityRequirement[],
): AutoBuildAbilityRequirement[][] {
  const groups = new Map<string, AutoBuildAbilityRequirement[]>();

  for (const requirement of requirements) {
    const groupKey = `${requirement.abilityKey.trim()}|${normalizeAbilityRequirementSlotScope(requirement.slotScope)}|${normalizeAbilityRequirementSourceScope(requirement.sourceScope) ?? 'any'}`;
    const currentGroup = groups.get(groupKey);

    if (currentGroup) {
      currentGroup.push(requirement);
    } else {
      groups.set(groupKey, [requirement]);
    }
  }

  return [...groups.values()];
}

function resolveRequirementGroupMatchingCharacterIds(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogMap: ReadonlyMap<string, AutoBuildAbilityCatalogItem>,
  useCaptainAbilityIds = false,
): number[] {
  const groupIds = new Set<number>();

  for (const requirement of requirements) {
    const catalogItem = catalogMap.get(requirement.abilityKey);
    const itemIds = catalogItem
      ? resolveRequirementMatchingCharacterIds(catalogItem, requirement, useCaptainAbilityIds)
      : [];

    itemIds.forEach((characterId) => groupIds.add(characterId));
  }

  return [...groupIds];
}

function resolveRequirementMatchingCharacterIds(
  catalogItem: AutoBuildAbilityCatalogItem,
  requirement: AutoBuildAbilityRequirement,
  useCaptainAbilityIds = false,
): number[] {
  const minTurns = normalizeAbilityRequirementTurns(requirement.minTurns);
  if (useCaptainAbilityIds && captainRequirementNeedsEffectMatch(requirement)) {
    const matches = catalogItem.captainAbilityEffectMatches ?? [];

    return [
      ...new Set(
        matches
          .filter((match) =>
            matchesAbilityRequirementMetadata(
              {
                minEffectValue: match.minEffectValue,
                effectTargetScope: match.effectTargetScope,
                slotTokens: match.slotTokens,
              },
              requirement,
            ),
          )
          .map((match) => match.characterId),
      ),
    ];
  }

  const hasCaptainAbilityIds =
    useCaptainAbilityIds && catalogItem.captainAbilityMatchingCharacterIds !== undefined;
  const matchingCharacterIds = useCaptainAbilityIds
    ? hasCaptainAbilityIds
      ? catalogItem.captainAbilityMatchingCharacterIds!
      : (catalogItem.matchingCharacterIds ?? [])
    : (catalogItem.matchingCharacterIds ?? []);
  const turnMatchingCharacterIds = useCaptainAbilityIds
    ? hasCaptainAbilityIds
      ? (catalogItem.captainAbilityTurnMatchingCharacterIds ?? [])
      : (catalogItem.turnMatchingCharacterIds ?? [])
    : (catalogItem.turnMatchingCharacterIds ?? []);

  if (minTurns === null) {
    return matchingCharacterIds;
  }

  return [
    ...new Set(
      turnMatchingCharacterIds
        .filter((bucket) => bucket.minTurns >= minTurns)
        .flatMap((bucket) => bucket.characterIds),
    ),
  ];
}

function captainRequirementNeedsEffectMatch(requirement: AutoBuildAbilityRequirement): boolean {
  const hasEffectValue =
    requirement.minEffectValue !== null && requirement.minEffectValue !== undefined;
  const hasSlotTokens = requirement.slotTokens.length > 0;
  const hasEffectScope = Boolean(
    requirement.effectTargetScope && requirement.effectTargetScope !== 'any',
  );

  return hasEffectValue || hasSlotTokens || hasEffectScope;
}

export function intersectAbilityMatchingCharacterIds(
  idLists: ReadonlyArray<readonly number[] | undefined>,
): number[] | undefined {
  const definedLists = idLists.filter((ids): ids is readonly number[] => ids !== undefined);

  if (definedLists.length === 0) {
    return undefined;
  }

  let intersection = [...new Set(definedLists[0])];
  const comparisonLists = definedLists.slice(1).sort((left, right) => left.length - right.length);

  for (const ids of comparisonLists) {
    const idSet = new Set(ids);
    intersection = intersection.filter((id) => idSet.has(id));

    if (intersection.length === 0) {
      return [];
    }
  }

  return [...new Set(intersection)];
}

export function createSpecialAbilityDrafts(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AbilityRequirementDraft[] {
  return createCategoryAbilityDrafts(requirements, catalogItems, 'special');
}

export function createCaptainAbilityDrafts(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AbilityRequirementDraft[] {
  const { captainAbilityKeys } = getCatalogAbilityIndex(catalogItems);

  return createAbilityRequirementDrafts(
    requirements
      .filter(
        (requirement) =>
          captainAbilityKeys.has(requirement.abilityKey) &&
          isCaptainAbilityRequirement(requirement),
      )
      .map((requirement) => ({
        abilityKey: requirement.abilityKey,
        minTurns: requirement.minTurns,
        slotTokens: [...requirement.slotTokens],
        requiredCharacterCount: requirement.requiredCharacterCount,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
        minEffectValue: requirement.minEffectValue,
        effectTargetScope: requirement.effectTargetScope,
      })),
  );
}

export function serializeSpecialAbilityDrafts(
  drafts: readonly AbilityRequirementDraft[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  options: SerializeCategoryAbilityDraftOptions = {},
): AutoBuildAbilityRequirement[] {
  return serializeCategoryAbilityDrafts(drafts, catalogItems, 'special', options);
}

export function serializeCaptainAbilityDrafts(
  drafts: readonly AbilityRequirementDraft[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
  options: SerializeCategoryAbilityDraftOptions = {},
): AutoBuildAbilityRequirement[] {
  const { captainAbilityKeys, catalogMap } = getCatalogAbilityIndex(catalogItems);

  return serializeAbilityRequirementDrafts(
    drafts
      .filter((draft) => captainAbilityKeys.has(draft.abilityKey))
      .map((draft) => ({
        ...draft,
        slotScope: 'leader',
        sourceScope: 'captainAbility',
      })),
    {
      dedupe: options.dedupe ?? true,
      catalogMap,
    },
  ).map((requirement) => ({
    ...requirement,
    slotScope: 'leader',
    sourceScope: 'captainAbility',
  }));
}

export function resolveSpecialAbilityMatchingCharacterIds(
  requirements: readonly AutoBuildAbilityRequirement[],
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): number[] | undefined {
  return resolveCategoryAbilityMatchingCharacterIds(requirements, catalogItems, 'special');
}

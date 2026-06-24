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

export function isCaptainAbilityRequirement(requirement: AutoBuildAbilityRequirement): boolean {
  return normalizeAbilityRequirementSourceScope(requirement.sourceScope) === 'captainAbility';
}

export function getCaptainAbilityCatalogItems(
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): AutoBuildAbilityCatalogItem[] {
  return sortCatalogItems(
    catalogItems.filter((item) => item.availableSources.includes('captainAbility')),
  );
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

  return serializeAbilityRequirementDrafts(
    drafts.filter(
      (draft) =>
        categoryKeys.has(draft.abilityKey) &&
        normalizeAbilityRequirementSourceScope(draft.sourceScope) !== 'captainAbility',
    ),
    {
      dedupe: options.dedupe ?? true,
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
  const categoryRequirements = requirements.filter(
    (requirement) =>
      categoryKeys.has(requirement.abilityKey) && !isCaptainAbilityRequirement(requirement),
  );

  if (categoryRequirements.length === 0) {
    return undefined;
  }

  const catalogMap = new Map(catalogItems.map((item) => [item.key, item] as const));
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
  const captainAbilityKeys = new Set(
    getCaptainAbilityCatalogItems(catalogItems).map((item) => item.key),
  );
  const captainRequirements = requirements.filter(
    (requirement) =>
      captainAbilityKeys.has(requirement.abilityKey) &&
      isCaptainAbilityRequirement(requirement),
  );

  if (captainRequirements.length === 0) {
    return undefined;
  }

  const catalogMap = new Map(catalogItems.map((item) => [item.key, item] as const));
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
  const captainAbilityKeys = new Set(
    getCaptainAbilityCatalogItems(catalogItems).map((item) => item.key),
  );

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
  const captainAbilityKeys = new Set(
    getCaptainAbilityCatalogItems(catalogItems).map((item) => item.key),
  );

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
      catalogMap: new Map(catalogItems.map((item) => [item.key, item] as const)),
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

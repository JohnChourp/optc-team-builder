import {
  MAX_ABILITY_FILTER_TAG_SETS,
  normalizeAbilityEffectTargetScope,
  normalizeAbilityRequirementEffectValue,
  normalizeAbilityRequirementSlotScope,
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityTagSetOperator,
  type AbilityFilterTagSet,
  type AbilityFilterTagSetSelection,
  type AbilityTagSetOperator,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../models/auto-team-builder-ability.models';
import {
  groupCategoryRequirements,
  intersectAbilityMatchingCharacterIds,
  resolveAbilityRequirementMatchingCharacterIds,
  unionAbilityMatchingCharacterIds,
} from './special-ability-filter.utils';

export function createAbilityTagSetId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createAbilityFilterTagSet(
  requirements: readonly AutoBuildAbilityRequirement[] = [],
  operator: AbilityTagSetOperator = 'any',
  id = createAbilityTagSetId(),
): AbilityFilterTagSet {
  return {
    id,
    operator: normalizeAbilityTagSetOperator(operator),
    requirements: requirements.map((requirement) => cloneRequirement(requirement)),
  };
}

export function createEmptyAbilityFilterTagSetSelection(): AbilityFilterTagSetSelection {
  return { sets: [], operator: 'all' };
}

export function cloneAbilityFilterTagSetSelection(
  selection: AbilityFilterTagSetSelection,
): AbilityFilterTagSetSelection {
  return {
    operator: normalizeAbilityTagSetOperator(selection.operator),
    sets: selection.sets.map((set) => ({
      id: set.id,
      operator: normalizeAbilityTagSetOperator(set.operator),
      requirements: set.requirements.map((requirement) => cloneRequirement(requirement)),
    })),
  };
}

/**
 * Rebuilds a selection from persisted or imported data. Unknown fields are
 * dropped and malformed sets are skipped, matching the defensive
 * field-by-field normalizer convention used across user-state.service.ts.
 */
export function normalizeAbilityFilterTagSetSelection(
  value: unknown,
): AbilityFilterTagSetSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawSets = record['sets'];

  if (!Array.isArray(rawSets)) {
    return null;
  }

  const sets: AbilityFilterTagSet[] = [];

  for (const rawSet of rawSets) {
    if (!rawSet || typeof rawSet !== 'object' || Array.isArray(rawSet)) {
      continue;
    }

    const setRecord = rawSet as Record<string, unknown>;
    const rawRequirements = setRecord['requirements'];
    const requirements = Array.isArray(rawRequirements)
      ? rawRequirements
          .map((requirement) => normalizeTagSetRequirement(requirement))
          .filter((requirement): requirement is AutoBuildAbilityRequirement => Boolean(requirement))
      : [];

    if (!requirements.length) {
      continue;
    }

    const id = typeof setRecord['id'] === 'string' ? setRecord['id'].trim() : '';

    sets.push({
      id: id.length ? id : createAbilityTagSetId(),
      operator: normalizeAbilityTagSetOperator(
        typeof setRecord['operator'] === 'string' ? setRecord['operator'] : null,
      ),
      requirements,
    });

    if (sets.length >= MAX_ABILITY_FILTER_TAG_SETS) {
      break;
    }
  }

  if (!sets.length) {
    return null;
  }

  return {
    operator: normalizeAbilityTagSetOperator(
      typeof record['operator'] === 'string' ? record['operator'] : null,
    ),
    sets,
  };
}

/**
 * Expands a legacy flat requirement list into the equivalent tag sets.
 *
 * Reuses `groupCategoryRequirements` so the expansion reproduces the historical
 * "OR within the same ability key, AND across keys" behaviour bit-for-bit: one
 * set per bucket with `any`, joined with `all`.
 *
 * Deliberately NOT capped at `MAX_ABILITY_FILTER_TAG_SETS`. That cap governs how
 * many sets a user may author in the picker; truncating here would drop AND
 * constraints from an existing filter and silently WIDEN the user's results.
 * Use `isOverAbilityTagSetCap` to surface the over-cap state in the UI instead.
 */
export function expandRequirementsToTagSets(
  requirements: readonly AutoBuildAbilityRequirement[],
): AbilityFilterTagSetSelection {
  const buckets = groupCategoryRequirements(requirements).filter((bucket) => bucket.length > 0);

  return {
    operator: 'all',
    sets: buckets.map((bucket) => createAbilityFilterTagSet(bucket, 'any')),
  };
}

/** True when a selection already holds more sets than the picker lets a user add. */
export function isOverAbilityTagSetCap(selection: AbilityFilterTagSetSelection): boolean {
  return selection.sets.length > MAX_ABILITY_FILTER_TAG_SETS;
}

/** Flattens a selection back to the flat requirement list legacy call sites expect. */
export function flattenTagSetsToRequirements(
  selection: AbilityFilterTagSetSelection,
): AutoBuildAbilityRequirement[] {
  return selection.sets.flatMap((set) =>
    set.requirements.map((requirement) => cloneRequirement(requirement)),
  );
}

export function countTagSetRequirements(selection: AbilityFilterTagSetSelection): number {
  return selection.sets.reduce((total, set) => total + set.requirements.length, 0);
}

export function countPopulatedTagSets(selection: AbilityFilterTagSetSelection): number {
  return selection.sets.filter((set) => set.requirements.length > 0).length;
}

/**
 * Resolves the character ids matched by a whole selection.
 *
 * Sets are evaluated independently and joined by `selection.operator`; within a
 * set, requirements are joined by that set's own operator. Empty sets are
 * skipped rather than treated as "matches nothing", so a half-built set in the
 * modal never blanks the results.
 *
 * Returns `undefined` when the selection applies no filter at all, matching the
 * `undefined` contract of `intersectAbilityMatchingCharacterIds`.
 */
export function resolveTagSetSelectionMatchingCharacterIds(
  selection: AbilityFilterTagSetSelection,
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): number[] | undefined {
  const populatedSets = selection.sets.filter((set) => set.requirements.length > 0);

  if (!populatedSets.length) {
    return undefined;
  }

  const setIdLists = populatedSets.map((set) =>
    resolveTagSetMatchingCharacterIds(set, catalogItems),
  );

  return normalizeAbilityTagSetOperator(selection.operator) === 'any'
    ? unionAbilityMatchingCharacterIds(setIdLists)
    : intersectAbilityMatchingCharacterIds(setIdLists);
}

export function resolveTagSetMatchingCharacterIds(
  set: AbilityFilterTagSet,
  catalogItems: readonly AutoBuildAbilityCatalogItem[],
): number[] {
  if (!set.requirements.length) {
    return [];
  }

  const idLists = set.requirements.map((requirement) =>
    resolveAbilityRequirementMatchingCharacterIds(requirement, catalogItems),
  );

  const resolved =
    normalizeAbilityTagSetOperator(set.operator) === 'all'
      ? intersectAbilityMatchingCharacterIds(idLists)
      : unionAbilityMatchingCharacterIds(idLists);

  return resolved ?? [];
}

function cloneRequirement(requirement: AutoBuildAbilityRequirement): AutoBuildAbilityRequirement {
  return {
    ...requirement,
    slotTokens: [...requirement.slotTokens],
  };
}

function normalizeTagSetRequirement(value: unknown): AutoBuildAbilityRequirement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const abilityKey = typeof record['abilityKey'] === 'string' ? record['abilityKey'].trim() : '';

  if (!abilityKey.length) {
    return null;
  }

  const rawTurns = record['minTurns'];
  const rawCount = record['requiredCharacterCount'];
  const rawSlotTokens = record['slotTokens'];

  return {
    abilityKey,
    minTurns: typeof rawTurns === 'number' && Number.isFinite(rawTurns) ? rawTurns : null,
    slotTokens: Array.isArray(rawSlotTokens)
      ? rawSlotTokens
          .map((token) => (typeof token === 'string' ? token.trim() : ''))
          .filter((token) => token.length > 0)
      : [],
    requiredCharacterCount:
      typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0
        ? Math.floor(rawCount)
        : 1,
    slotScope: normalizeAbilityRequirementSlotScope(
      typeof record['slotScope'] === 'string' ? record['slotScope'] : null,
    ),
    ...(normalizeAbilityRequirementSourceScope(
      typeof record['sourceScope'] === 'string' ? record['sourceScope'] : null,
    )
      ? { sourceScope: 'captainAbility' as const }
      : {}),
    minEffectValue: normalizeAbilityRequirementEffectValue(
      typeof record['minEffectValue'] === 'number' || typeof record['minEffectValue'] === 'string'
        ? record['minEffectValue']
        : null,
    ),
    effectTargetScope: normalizeAbilityEffectTargetScope(
      typeof record['effectTargetScope'] === 'string' ? record['effectTargetScope'] : null,
    ),
  };
}

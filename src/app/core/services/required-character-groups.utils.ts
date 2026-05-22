import {
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityRequirement,
  type AutoBuildRequiredCharacterGroup,
} from '../models/auto-team-builder-ability.models';

export const MAX_REQUIRED_CHARACTER_GROUPS = 6;

export function createRequiredCharacterGroup(
  abilities: AutoBuildAbilityRequirement[] = [],
  id = createRequiredCharacterGroupId(),
): AutoBuildRequiredCharacterGroup {
  return {
    id,
    abilities: abilities
      .map((ability) => normalizeRequiredCharacterGroupAbility(ability))
      .filter((ability): ability is AutoBuildAbilityRequirement => Boolean(ability)),
  };
}

function createRequiredCharacterGroupId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeRequiredCharacterGroupAbility(
  requirement: Partial<AutoBuildAbilityRequirement> | null | undefined,
): AutoBuildAbilityRequirement | null {
  if (!requirement || typeof requirement !== 'object') {
    return null;
  }

  const abilityKey =
    typeof requirement.abilityKey === 'string' ? requirement.abilityKey.trim() : '';

  if (!abilityKey.length) {
    return null;
  }

  const minTurns =
    typeof requirement.minTurns === 'number' &&
    Number.isInteger(requirement.minTurns) &&
    requirement.minTurns >= 0
      ? requirement.minTurns
      : null;
  const slotTokens = Array.isArray(requirement.slotTokens)
    ? [
        ...new Set(
          requirement.slotTokens
            .filter((token): token is string => typeof token === 'string')
            .map((token) => token.trim().toUpperCase())
            .filter((token) => token.length > 0),
        ),
      ]
    : [];
  const slotScope = normalizeAbilityRequirementSlotScope(requirement.slotScope);
  const sourceScope = normalizeAbilityRequirementSourceScope(requirement.sourceScope);
  const normalized: AutoBuildAbilityRequirement = {
    abilityKey,
    minTurns,
    slotTokens,
    requiredCharacterCount: 1,
  };

  if (slotScope !== 'any') {
    normalized.slotScope = slotScope;
  }

  if (sourceScope) {
    normalized.sourceScope = sourceScope;
  }

  return normalized;
}

export function cloneRequiredCharacterGroup(
  group: AutoBuildRequiredCharacterGroup,
): AutoBuildRequiredCharacterGroup {
  return {
    id: group.id,
    abilities: group.abilities
      .map((ability) => normalizeRequiredCharacterGroupAbility(ability))
      .filter((ability): ability is AutoBuildAbilityRequirement => Boolean(ability)),
  };
}

export function cloneRequiredCharacterGroups(
  groups: readonly AutoBuildRequiredCharacterGroup[] | null | undefined,
): AutoBuildRequiredCharacterGroup[] {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => cloneRequiredCharacterGroup(group))
    .filter((group) => group.abilities.length > 0)
    .slice(0, MAX_REQUIRED_CHARACTER_GROUPS);
}

export function expandRequiredAbilitiesToCharacterGroups(
  requirements: readonly AutoBuildAbilityRequirement[] | null | undefined,
  maxGroups = MAX_REQUIRED_CHARACTER_GROUPS,
): {
  groups: AutoBuildRequiredCharacterGroup[];
  truncatedCount: number;
} {
  const groups: AutoBuildRequiredCharacterGroup[] = [];
  let truncatedCount = 0;

  for (const requirement of Array.isArray(requirements) ? requirements : []) {
    const normalizedRequirement = normalizeRequiredCharacterGroupAbility(requirement);

    if (!normalizedRequirement) {
      continue;
    }

    const requiredCount =
      Number.isInteger(requirement.requiredCharacterCount) && requirement.requiredCharacterCount > 0
        ? requirement.requiredCharacterCount
        : 1;

    for (let index = 0; index < requiredCount; index += 1) {
      if (groups.length >= maxGroups) {
        truncatedCount += 1;
        continue;
      }

      groups.push(createRequiredCharacterGroup([normalizedRequirement]));
    }
  }

  return {
    groups,
    truncatedCount,
  };
}

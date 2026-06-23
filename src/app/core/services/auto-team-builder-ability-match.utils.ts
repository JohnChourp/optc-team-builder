import {
  normalizeAbilityEffectTargetScope,
  normalizeAbilityRequirementEffectValue,
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityRequirement,
  type AutoBuildAbilityEffectTargetScope,
  type NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';

const LEGACY_ABILITY_KEY_ALIASES: Record<string, string> = {
  remove_defense_up: 'remove_enemy_increased_defense',
};

const SELECTABLE_DEBUFF_COUNTER_KEYS = new Set([
  'remove_damage_reduction',
  'remove_threshold_damage_reduction',
  'remove_resilience',
  'remove_enemy_barrier',
  'remove_enemy_damage_nullification',
  'remove_enemy_atk_up',
  'remove_enemy_enrage',
  'remove_enemy_increased_defense',
  'remove_enemy_end_of_turn_damage_percent_cut',
  'remove_enemy_end_of_turn_heal',
  'remove_enemy_orb_based_damage_reduction',
]);

export function buildAbilityRequirementIdentity(requirement: AutoBuildAbilityRequirement): string {
  return `${normalizeAbilityKey(requirement.abilityKey)}|${requirement.minTurns ?? 'none'}|${requirement.slotTokens.join(',')}|${requirement.requiredCharacterCount}|${normalizeAbilityRequirementSlotScope(requirement.slotScope)}|${normalizeAbilityRequirementSourceScope(requirement.sourceScope) ?? 'any'}|${normalizeAbilityRequirementEffectValue(requirement.minEffectValue) ?? 'none'}|${normalizeAbilityEffectTargetScope(requirement.effectTargetScope)}`;
}

export function matchesAbilityRequirement(
  ability: NormalizedBuilderAbility,
  requirement: AutoBuildAbilityRequirement,
): boolean {
  const normalizedAbilityKey = normalizeAbilityKey(ability.key);
  const normalizedRequirementKey = normalizeAbilityKey(requirement.abilityKey);
  const sourceScope = normalizeAbilityRequirementSourceScope(requirement.sourceScope);

  if (sourceScope && ability.source !== sourceScope) {
    return false;
  }

  if (
    normalizedAbilityKey !== normalizedRequirementKey &&
    !(
      normalizedAbilityKey === 'remove_pain' &&
      ability.coverageMode === 'selectedDebuff' &&
      SELECTABLE_DEBUFF_COUNTER_KEYS.has(normalizedRequirementKey)
    )
  ) {
    return false;
  }

  if (
    requirement.minTurns !== null &&
    (ability.minTurns === null || ability.minTurns < requirement.minTurns)
  ) {
    return false;
  }

  if (
    requirement.slotTokens.length &&
    requirement.slotTokens.some((slotToken) => !ability.slotTokens.includes(slotToken))
  ) {
    return false;
  }

  return matchesAbilityRequirementMetadata(ability, requirement);
}

export function matchesAnyAbilityRequirement(
  ability: NormalizedBuilderAbility,
  requirements: AutoBuildAbilityRequirement[],
): boolean {
  return requirements.some((requirement) => matchesAbilityRequirement(ability, requirement));
}

function normalizeAbilityKey(value: string): string {
  const normalizedValue = value.trim();

  return LEGACY_ABILITY_KEY_ALIASES[normalizedValue] ?? normalizedValue;
}

export function matchesAbilityRequirementMetadata(
  ability: Pick<NormalizedBuilderAbility, 'minEffectValue' | 'effectTargetScope' | 'slotTokens'>,
  requirement: Pick<
    AutoBuildAbilityRequirement,
    'minEffectValue' | 'effectTargetScope' | 'slotTokens'
  >,
): boolean {
  const requiredEffectValue = normalizeAbilityRequirementEffectValue(requirement.minEffectValue);

  if (requiredEffectValue !== null) {
    const abilityEffectValue = normalizeAbilityRequirementEffectValue(ability.minEffectValue);

    if (abilityEffectValue === null || abilityEffectValue < requiredEffectValue) {
      return false;
    }
  }

  if (
    requirement.slotTokens.length &&
    requirement.slotTokens.some((slotToken) => !ability.slotTokens.includes(slotToken))
  ) {
    return false;
  }

  return effectTargetScopeMatches(
    normalizeAbilityEffectTargetScope(ability.effectTargetScope),
    normalizeAbilityEffectTargetScope(requirement.effectTargetScope),
  );
}

function effectTargetScopeMatches(
  abilityScope: AutoBuildAbilityEffectTargetScope,
  requirementScope: AutoBuildAbilityEffectTargetScope,
): boolean {
  if (requirementScope === 'any') {
    return true;
  }

  if (abilityScope === 'any') {
    return false;
  }

  if (abilityScope === 'crew') {
    return true;
  }

  if (abilityScope === 'captains') {
    return requirementScope === 'captains' || requirementScope === 'self';
  }

  return abilityScope === requirementScope;
}

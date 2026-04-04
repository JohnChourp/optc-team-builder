import {
  type AutoBuildAbilityRequirement,
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

export function buildAbilityRequirementIdentity(
  requirement: AutoBuildAbilityRequirement,
): string {
  return `${normalizeAbilityKey(requirement.abilityKey)}|${requirement.minTurns ?? 'none'}|${requirement.slotTokens.join(',')}|${requirement.requiredCharacterCount}`;
}

export function matchesAbilityRequirement(
  ability: NormalizedBuilderAbility,
  requirement: AutoBuildAbilityRequirement,
): boolean {
  const normalizedAbilityKey = normalizeAbilityKey(ability.key);
  const normalizedRequirementKey = normalizeAbilityKey(requirement.abilityKey);

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

  return true;
}

export function matchesAnyAbilityRequirement(
  ability: NormalizedBuilderAbility,
  requirements: AutoBuildAbilityRequirement[],
): boolean {
  return requirements.some((requirement) => matchesAbilityRequirement(ability, requirement));
}

export function builderAbilitiesMatchAllRequirements(
  abilities: NormalizedBuilderAbility[],
  requirements: AutoBuildAbilityRequirement[],
): boolean {
  return requirements.every((requirement) =>
    Number(
      abilities.some((ability) => matchesAbilityRequirement(ability, requirement)),
    ) >= requirement.requiredCharacterCount,
  );
}

function normalizeAbilityKey(value: string): string {
  const normalizedValue = value.trim();

  return LEGACY_ABILITY_KEY_ALIASES[normalizedValue] ?? normalizedValue;
}

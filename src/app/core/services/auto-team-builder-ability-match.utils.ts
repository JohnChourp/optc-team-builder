import {
  type AutoBuildAbilityRequirement,
  type NormalizedSpecialAbility,
} from '../models/auto-team-builder-ability.models';

export function buildAbilityRequirementIdentity(
  requirement: AutoBuildAbilityRequirement,
): string {
  return `${requirement.abilityKey}|${requirement.minTurns ?? 'none'}|${requirement.slotTokens.join(',')}`;
}

export function matchesAbilityRequirement(
  ability: NormalizedSpecialAbility,
  requirement: AutoBuildAbilityRequirement,
): boolean {
  if (ability.key !== requirement.abilityKey) {
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
  ability: NormalizedSpecialAbility,
  requirements: AutoBuildAbilityRequirement[],
): boolean {
  return requirements.some((requirement) => matchesAbilityRequirement(ability, requirement));
}

export function specialAbilitiesMatchAllRequirements(
  abilities: NormalizedSpecialAbility[],
  requirements: AutoBuildAbilityRequirement[],
): boolean {
  return requirements.every((requirement) =>
    abilities.some((ability) => matchesAbilityRequirement(ability, requirement)),
  );
}

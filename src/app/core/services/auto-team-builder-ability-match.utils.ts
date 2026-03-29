import {
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';

export function buildAbilityRequirementIdentity(
  requirement: AutoBuildAbilityRequirement,
): string {
  return `${requirement.abilityKey}|${requirement.minTurns ?? 'none'}|${requirement.slotTokens.join(',')}|${requirement.requiredCharacterCount}`;
}

export function matchesAbilityRequirement(
  ability: NormalizedBuilderAbility,
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

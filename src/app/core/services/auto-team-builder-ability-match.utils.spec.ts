import { describe, expect, it } from 'vitest';

import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import type {
  AutoBuildAbilityRequirement,
  NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';

describe('auto-team-builder ability requirement matching', () => {
  it('matches captain damage reduction by minimum percent', () => {
    expect(
      matchesAbilityRequirement(
        createAbility({ minEffectValue: 20, effectTargetScope: 'crew' }),
        createRequirement({ minEffectValue: 10, effectTargetScope: 'crew' }),
      ),
    ).toBe(true);
    expect(
      matchesAbilityRequirement(
        createAbility({ minEffectValue: 10, effectTargetScope: 'crew' }),
        createRequirement({ minEffectValue: 20, effectTargetScope: 'crew' }),
      ),
    ).toBe(false);
  });

  it('matches compatible captain utility target scopes', () => {
    expect(
      matchesAbilityRequirement(
        createAbility({ effectTargetScope: 'crew' }),
        createRequirement({ effectTargetScope: 'self' }),
      ),
    ).toBe(true);
    expect(
      matchesAbilityRequirement(
        createAbility({ effectTargetScope: 'captains' }),
        createRequirement({ effectTargetScope: 'self' }),
      ),
    ).toBe(true);
    expect(
      matchesAbilityRequirement(
        createAbility({ effectTargetScope: 'self' }),
        createRequirement({ effectTargetScope: 'captains' }),
      ),
    ).toBe(false);
    expect(
      matchesAbilityRequirement(
        createAbility({ effectTargetScope: 'any' }),
        createRequirement({ effectTargetScope: 'crew' }),
      ),
    ).toBe(false);
  });

  it('matches captain slot-token metadata for favorable slot filters', () => {
    expect(
      matchesAbilityRequirement(
        createAbility({
          abilityKey: 'make_slots_favorable',
          slotTokens: ['INT', 'RCV'],
          effectTargetScope: 'crew',
        }),
        createRequirement({
          abilityKey: 'make_slots_favorable',
          slotTokens: ['RCV'],
          effectTargetScope: 'crew',
        }),
      ),
    ).toBe(true);
    expect(
      matchesAbilityRequirement(
        createAbility({
          abilityKey: 'make_slots_favorable',
          slotTokens: ['INT'],
          effectTargetScope: 'crew',
        }),
        createRequirement({
          abilityKey: 'make_slots_favorable',
          slotTokens: ['RCV'],
          effectTargetScope: 'crew',
        }),
      ),
    ).toBe(false);
  });
});

function createAbility(
  overrides: Partial<NormalizedBuilderAbility> & { abilityKey?: string } = {},
): NormalizedBuilderAbility {
  return {
    key: overrides.key ?? overrides.abilityKey ?? 'reduce_damage',
    label: overrides.label ?? 'Reduce Damage',
    minTurns: overrides.minTurns ?? null,
    isCompleteRemoval: overrides.isCompleteRemoval ?? false,
    slotTokens: overrides.slotTokens ?? [],
    source: overrides.source ?? 'captainAbility',
    coverageMode: overrides.coverageMode ?? 'explicit',
    ...(overrides.minEffectValue !== undefined
      ? { minEffectValue: overrides.minEffectValue }
      : {}),
    ...(overrides.effectTargetScope !== undefined
      ? { effectTargetScope: overrides.effectTargetScope }
      : {}),
  };
}

function createRequirement(
  overrides: Partial<AutoBuildAbilityRequirement> = {},
): AutoBuildAbilityRequirement {
  return {
    abilityKey: overrides.abilityKey ?? 'reduce_damage',
    minTurns: overrides.minTurns ?? null,
    slotTokens: overrides.slotTokens ?? [],
    requiredCharacterCount: overrides.requiredCharacterCount ?? 1,
    sourceScope: overrides.sourceScope ?? 'captainAbility',
    ...(overrides.minEffectValue !== undefined
      ? { minEffectValue: overrides.minEffectValue }
      : {}),
    ...(overrides.effectTargetScope !== undefined
      ? { effectTargetScope: overrides.effectTargetScope }
      : {}),
  };
}

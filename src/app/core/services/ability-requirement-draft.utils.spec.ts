import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  formatAbilityRequirementSummary,
  resolveAbilityRequirementPainSelectableDebuffBadges,
  resolveAbilityRequirementVisual,
  serializeAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from './ability-requirement-draft.utils';

describe('ability-requirement-draft utils', () => {
  it('resolves explicit visual metadata for curated picker abilities', () => {
    const abilityKeys = [
      'deal_fixed_damage',
      'special_damage',
      'extra_drop_any',
      'inflict_poison',
      'remove_bind',
      'remove_despair',
      'remove_special_bind',
      'remove_threshold_damage_reduction',
    ];

    for (const abilityKey of abilityKeys) {
      const visual = resolveAbilityRequirementVisual(abilityKey);

      expect(visual.isFallback, abilityKey).toBe(false);
      expect(visual.badge.length, abilityKey).toBeGreaterThan(0);
    }
  });

  it('returns usable visual metadata for every current catalog ability', () => {
    const catalog = loadAbilityCatalog();

    for (const ability of catalog.abilities) {
      const visual = resolveAbilityRequirementVisual(ability.key);

      expect(visual.badge.length, ability.key).toBeGreaterThan(0);
      expect(visual.icon.length, ability.key).toBeGreaterThan(0);
    }
  });

  it('falls back to a generic visual for unknown abilities', () => {
    expect(resolveAbilityRequirementVisual('future_unknown_ability').isFallback).toBe(true);
  });

  it('exposes selectable debuff mini badges for pain coverage', () => {
    expect(resolveAbilityRequirementPainSelectableDebuffBadges('remove_pain')).toEqual([
      expect.objectContaining({ abilityKey: 'remove_enemy_atk_up' }),
      expect.objectContaining({ abilityKey: 'remove_enemy_barrier' }),
      expect.objectContaining({ abilityKey: 'remove_enemy_damage_nullification' }),
      expect.objectContaining({ abilityKey: 'remove_enemy_end_of_turn_damage_percent_cut' }),
      expect.objectContaining({ abilityKey: 'remove_enemy_end_of_turn_heal' }),
      expect.objectContaining({ abilityKey: 'remove_enemy_enrage' }),
      expect.objectContaining({ abilityKey: 'remove_enemy_increased_defense' }),
      expect.objectContaining({ abilityKey: 'remove_enemy_orb_based_damage_reduction' }),
      expect.objectContaining({ abilityKey: 'remove_damage_reduction' }),
      expect.objectContaining({ abilityKey: 'remove_resilience' }),
      expect.objectContaining({ abilityKey: 'remove_threshold_damage_reduction' }),
    ]);
  });

  it('dedupes identical draft identities while keeping the largest character count', () => {
    const drafts: AbilityRequirementDraft[] = [
      {
        draftId: 'draft-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
      {
        draftId: 'draft-2',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 3,
      },
    ];

    expect(
      serializeAbilityRequirementDrafts(drafts, {
        dedupe: true,
      }),
    ).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 3,
      },
    ]);
  });

  it('serializes structured captain utility metadata', () => {
    const drafts: AbilityRequirementDraft[] = [
      {
        draftId: 'captain-damage-1',
        abilityKey: 'reduce_damage',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
        sourceScope: 'captainAbility',
        minEffectValue: 20,
        effectTargetScope: 'crew',
      },
    ];

    expect(
      serializeAbilityRequirementDrafts(drafts, {
        dedupe: true,
      }),
    ).toEqual([
      {
        abilityKey: 'reduce_damage',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: 1,
        sourceScope: 'captainAbility',
        minEffectValue: 20,
        effectTargetScope: 'crew',
      },
    ]);
  });

  it('preserves duplicate draft identities when dedupe is disabled', () => {
    const drafts: AbilityRequirementDraft[] = [
      {
        draftId: 'draft-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
      {
        draftId: 'draft-2',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 3,
      },
    ];

    expect(
      serializeAbilityRequirementDrafts(drafts, {
        dedupe: false,
      }),
    ).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 3,
      },
    ]);
  });

  it('formats a readable ability summary with counts, turns, and slot tokens', () => {
    expect(
      formatAbilityRequirementSummary(
        {
          abilityKey: 'remove_slot_barrier',
          minTurns: 2,
          slotTokens: ['DEX'],
          requiredCharacterCount: 2,
        },
        () => 'Remove Slot Barrier',
        {
          formatCharacters: (count) => `>=${count} chars`,
          formatTurns: (count) => `${count} turns`,
        },
      ),
    ).toBe('Remove Slot Barrier (>=2 chars • 2 turns • DEX)');
  });

  it('formats structured utility metadata in summaries', () => {
    expect(
      formatAbilityRequirementSummary(
        {
          abilityKey: 'reduce_damage',
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
          sourceScope: 'captainAbility',
          minEffectValue: 20,
          effectTargetScope: 'crew',
        },
        () => 'Reduce Damage',
        {
          formatCharacters: (count) => `>=${count} chars`,
          formatTurns: (count) => `${count} turns`,
          formatSourceScope: () => 'Captain Ability',
          formatMinEffectValue: (value) => `>=${value}%`,
          formatEffectTargetScope: (scope) => scope,
        },
      ),
    ).toBe('Reduce Damage (Captain Ability • >=20% • crew)');
  });
});

function loadAbilityCatalog(): {
  abilities: Array<{ key: string }>;
} {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), 'public/assets/data/optc-auto-builder-abilities.json'),
      'utf8',
    ),
  ) as {
    abilities: Array<{ key: string }>;
  };
}

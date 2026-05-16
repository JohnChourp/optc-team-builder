import { describe, expect, it } from 'vitest';

import {
  deriveAbilityRequirementsFromEnemyMechanics,
  formatEnemyMechanicSummary,
  getEnemyMechanicCatalogItems,
  resolveEnemyMechanicVisual,
  splitManualAbilityRequirementsFromEnemyMechanics,
} from './enemy-mechanic-draft.utils';

describe('enemy-mechanic-draft utils', () => {
  it('resolves explicit visuals for every catalog mechanic', () => {
    const mechanics = getEnemyMechanicCatalogItems();

    for (const mechanic of mechanics) {
      const visual = resolveEnemyMechanicVisual(mechanic.key);

      expect(visual.isFallback, mechanic.key).toBe(false);
      expect(visual.badge.length, mechanic.key).toBeGreaterThan(0);
    }
  });

  it('derives direct counters only for mechanics with explicit mappings', () => {
    expect(
      deriveAbilityRequirementsFromEnemyMechanics([
        {
          mechanicKey: 'enemy_barrier',
          category: 'enemyDefense',
          minTurns: 3,
          requiredCharacterCount: 2,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_enemy_barrier',
        },
        {
          mechanicKey: 'interrupt_special',
          category: 'interrupt',
          minTurns: null,
          triggerTags: ['onSpecial'],
          responseTags: ['removeBuffs'],
          conditionTags: [],
          derivedAbilityKey: null,
        },
      ]),
    ).toEqual([
      {
        abilityKey: 'remove_enemy_barrier',
        minTurns: 3,
        slotTokens: [],
        requiredCharacterCount: 2,
      },
    ]);
  });

  it('normalizes duplicate mechanics using the maximum turns and count', () => {
    expect(
      deriveAbilityRequirementsFromEnemyMechanics([
        {
          mechanicKey: 'crew_paralysis',
          category: 'crewDebuff',
          minTurns: 4,
          requiredCharacterCount: 2,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_paralysis',
        },
        {
          mechanicKey: 'crew_paralysis',
          category: 'crewDebuff',
          minTurns: 6,
          requiredCharacterCount: 3,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_paralysis',
        },
      ]),
    ).toEqual([
      {
        abilityKey: 'remove_paralysis',
        minTurns: 6,
        slotTokens: [],
        requiredCharacterCount: 3,
      },
    ]);
  });

  it('splits persisted effective counters back into manual overrides', () => {
    expect(
      splitManualAbilityRequirementsFromEnemyMechanics(
        [
          {
            abilityKey: 'remove_enemy_barrier',
            minTurns: 3,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
        [
          {
          mechanicKey: 'enemy_barrier',
          category: 'enemyDefense',
          minTurns: 3,
          triggerTags: [],
            responseTags: [],
            conditionTags: [],
            derivedAbilityKey: 'remove_enemy_barrier',
          },
        ],
      ),
    ).toEqual([
      {
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);
  });

  it('formats mechanic summaries with turns and tags', () => {
    expect(
      formatEnemyMechanicSummary(
        {
          mechanicKey: 'interrupt_special',
          category: 'interrupt',
          minTurns: null,
          triggerTags: ['onSpecial'],
          responseTags: ['removeBuffs'],
          conditionTags: [],
          derivedAbilityKey: null,
        },
        () => 'Interrupt on Special',
        {
          formatTurns: (count) => `${count} turns`,
          resolveTriggerTag: (tag) =>
            ({ onSpecial: 'On special' } as Partial<Record<typeof tag, string>>)[tag] ?? tag,
          resolveResponseTag: (tag) =>
            ({ removeBuffs: 'Remove buffs' } as Partial<Record<typeof tag, string>>)[tag] ?? tag,
          resolveConditionTag: (tag) => tag,
        },
      ),
    ).toBe('Interrupt on Special (On special • Remove buffs)');
  });
});

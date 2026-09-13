import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  /*
   * 869f1935z. The guard that would have caught `remove_healing_reduction`.
   *
   * A mechanic's `derivedAbilityKey` is the whole bridge between "the player ticked this" and "the
   * builder demands that". Nothing bound it to the shipped ability catalogue, so a key that never
   * existed sat in the catalogue silently: the requirement it derived matched no ability, imposed
   * no constraint, and reported nothing. It is the one defect shape a coverage checklist must not
   * have, because it reads as "answered" from every surface.
   */
  it('maps every mechanic to an ability key the shipped catalogue defines', () => {
    const defined = readShippedAbilityKeys();
    const dangling = findDanglingAbilityKeys(getEnemyMechanicCatalogItems(), defined);

    // Guard against the guard checking nothing, which is how this would rot.
    expect(defined.size).toBeGreaterThan(100);
    expect(dangling).toEqual([]);
  });

  it('MUTATION - an invented ability key is caught', () => {
    /*
     * Running the check over a correct catalogue proves nothing. This is the exact shape that
     * shipped: a plausible `remove_<something>` that the catalogue never declared.
     */
    const defined = readShippedAbilityKeys();
    const mutated = [
      ...getEnemyMechanicCatalogItems(),
      { key: 'crew_invented', derivedAbilityKey: 'remove_invented_debuff' },
    ] as ReadonlyArray<{ key: string; derivedAbilityKey: string | null }>;

    expect(findDanglingAbilityKeys(mutated, defined)).toEqual([
      { mechanicKey: 'crew_invented', derivedAbilityKey: 'remove_invented_debuff' },
    ]);
  });

  it('leaves Healing Reduction unmapped, because no shipped ability answers it', () => {
    /*
     * Not a tautology restating the constant - it pins the DECISION. `remove_no_healing` exists and
     * is the tempting fix; it is a different debuff, and pointing at it would report coverage the
     * team does not have. If a tag for "Reduce Healing Reduction duration" is ever parsed, this is
     * the test that should fail and be updated deliberately.
     */
    const healingReduction = getEnemyMechanicCatalogItems().find(
      (mechanic) => mechanic.key === 'crew_healing_reduction',
    );

    expect(healingReduction?.derivedAbilityKey).toBeNull();
    expect(readShippedAbilityKeys().has('remove_healing_reduction')).toBe(false);
  });
});

/** Every ability key the shipped catalogue declares - the only keys a mechanic may point at. */
function readShippedAbilityKeys(): Set<string> {
  const catalogue = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/assets/data/optc-auto-builder-abilities.json'), 'utf8'),
  ) as { abilities: Array<{ key: string }> };

  return new Set(catalogue.abilities.map((ability) => ability.key));
}

function findDanglingAbilityKeys(
  mechanics: ReadonlyArray<{ key: string; derivedAbilityKey: string | null }>,
  defined: ReadonlySet<string>,
): Array<{ mechanicKey: string; derivedAbilityKey: string }> {
  return mechanics
    .filter(
      (mechanic): mechanic is { key: string; derivedAbilityKey: string } =>
        mechanic.derivedAbilityKey !== null && !defined.has(mechanic.derivedAbilityKey),
    )
    .map((mechanic) => ({
      mechanicKey: mechanic.key,
      derivedAbilityKey: mechanic.derivedAbilityKey,
    }));
}

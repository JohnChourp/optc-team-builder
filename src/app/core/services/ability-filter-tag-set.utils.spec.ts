import { describe, expect, it } from 'vitest';

import {
  MAX_ABILITY_FILTER_TAG_SETS,
  normalizeAbilityTagSetOperator,
  type AbilityFilterTagSetSelection,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityRequirement,
} from '../models/auto-team-builder-ability.models';
import {
  cloneAbilityFilterTagSetSelection,
  countPopulatedTagSets,
  countTagSetRequirements,
  createAbilityFilterTagSet,
  createEmptyAbilityFilterTagSetSelection,
  expandRequirementsToTagSets,
  flattenTagSetsToRequirements,
  isOverAbilityTagSetCap,
  normalizeAbilityFilterTagSetSelection,
  resolveTagSetMatchingCharacterIds,
  resolveTagSetSelectionMatchingCharacterIds,
} from './ability-filter-tag-set.utils';
import {
  resolveAbilityRequirementMatchingCharacterIds,
  resolveCategoryAbilityMatchingCharacterIds,
  unionAbilityMatchingCharacterIds,
} from './special-ability-filter.utils';

const CATALOG_ITEMS: AutoBuildAbilityCatalogItem[] = [
  {
    key: 'boost_atk',
    label: 'Boost ATK',
    category: 'special',
    groupLabel: 'Boost Damage',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: true,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 2,
    matchingCharacterIds: [10, 20],
    turnMatchingCharacterIds: [
      { minTurns: 1, characterIds: [10] },
      { minTurns: 2, characterIds: [20] },
    ],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'territory',
    label: 'Territory',
    category: 'special',
    groupLabel: 'Field Effects',
    groupOrder: 8,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText', 'superSpecialText'],
    matchCount: 2,
    matchingCharacterIds: [4561, 5000],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    // #10 cures on itself (5 turns) AND crew-wide (2 turns); #20 is crew-only.
    key: 'remove_special_bind',
    label: 'Special Bind (Silence)',
    category: 'special',
    groupLabel: 'Reduce Status Effect Duration',
    supportsTurns: true,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText', 'sailorAbilities'],
    availableEffectTargetScopes: ['crew', 'self'],
    effectTargetScopeMatchingCharacterIds: [
      {
        effectTargetScope: 'crew',
        characterIds: [10, 20],
        turnMatchingCharacterIds: [{ minTurns: 2, characterIds: [10, 20] }],
      },
      {
        effectTargetScope: 'self',
        characterIds: [10],
        turnMatchingCharacterIds: [{ minTurns: 5, characterIds: [10] }],
      },
    ],
    matchCount: 2,
    matchingCharacterIds: [10, 20],
    turnMatchingCharacterIds: [
      { minTurns: 2, characterIds: [10, 20] },
      { minTurns: 5, characterIds: [10] },
    ],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'crewmate_atk_boost_fighter',
    label: 'ATK Boost: Fighter',
    category: 'crewmate',
    groupLabel: 'ATK Boost',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: true,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['sailorAbilities'],
    matchCount: 2,
    matchingCharacterIds: [20, 30],
    turnMatchingCharacterIds: [
      { minTurns: 3, characterIds: [20] },
      { minTurns: 7, characterIds: [30] },
    ],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'crewmate_hp_recovery_eot',
    label: 'Hp Recovery at End of Turn',
    category: 'crewmate',
    groupLabel: 'Other',
    groupOrder: 2,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['sailorAbilities'],
    matchCount: 0,
    matchingCharacterIds: [],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'potential_barrier_pierce',
    label: 'Barrier Pierce',
    category: 'potential',
    groupLabel: 'Other',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['potentialAbilities'],
    matchCount: 2,
    matchingCharacterIds: [30, 40],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'support_atk_boost',
    label: 'ATK Boost',
    category: 'support',
    groupLabel: 'Boost Damage',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['supportData'],
    matchCount: 2,
    matchingCharacterIds: [20, 30],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    key: 'support_reduce_enemy_effect_turns_def_up',
    label: 'Reduce Enemy Effect Turns: DEF Up',
    category: 'support',
    groupLabel: 'Reduce Enemy Effect Duration',
    groupOrder: 2,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['supportData'],
    matchCount: 1,
    matchingCharacterIds: [30],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
  {
    // A `legacy`-category key: dropped by BOTH the category and the captain
    // resolvers, so only resolveAbilityRequirementMatchingCharacterIds sees it.
    key: 'legacy_orb_boost',
    label: 'Legacy Orb Boost',
    category: 'legacy',
    groupLabel: 'Other',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 2,
    matchingCharacterIds: [10, 40],
    sampleCharacterIds: [],
    sampleTexts: [],
  },
];

/** Ids are a set, not a list — order carries no meaning, so compare sorted. */
const sortIds = (ids: readonly number[] | undefined): number[] | undefined =>
  ids === undefined ? undefined : [...ids].sort((left, right) => left - right);

const requirement = (
  overrides: Partial<AutoBuildAbilityRequirement> & { abilityKey: string },
): AutoBuildAbilityRequirement => ({
  minTurns: null,
  slotTokens: [],
  requiredCharacterCount: 1,
  ...overrides,
});

const setOf = (
  requirements: readonly AutoBuildAbilityRequirement[],
  operator: 'all' | 'any',
  id: string,
) => createAbilityFilterTagSet(requirements, operator, id);

const selectionOf = (
  operator: 'all' | 'any',
  sets: AbilityFilterTagSetSelection['sets'],
): AbilityFilterTagSetSelection => ({ operator, sets });

describe('ability filter tag set utils', () => {
  describe('golden replay against the legacy flat resolver', () => {
    // Every corpus is single-category and captain-free, which is exactly the
    // shape the legacy pickers persisted. If expand + tag-set resolution ever
    // disagrees with the legacy resolver on these, the migration is lossy.
    const CORPORA: ReadonlyArray<{
      name: string;
      category: AutoBuildAbilityCategory;
      requirements: AutoBuildAbilityRequirement[];
    }> = [
      {
        name: 'a single crewmate effect',
        category: 'crewmate',
        requirements: [requirement({ abilityKey: 'crewmate_atk_boost_fighter' })],
      },
      {
        name: 'the same crewmate key twice with different turn counts (OR within a key)',
        category: 'crewmate',
        requirements: [
          requirement({ abilityKey: 'crewmate_atk_boost_fighter', minTurns: 3 }),
          requirement({ abilityKey: 'crewmate_atk_boost_fighter', minTurns: 7 }),
        ],
      },
      {
        name: 'two distinct support keys (AND across keys)',
        category: 'support',
        requirements: [
          requirement({ abilityKey: 'support_atk_boost' }),
          requirement({ abilityKey: 'support_reduce_enemy_effect_turns_def_up' }),
        ],
      },
      {
        name: 'a crewmate effect nobody has',
        category: 'crewmate',
        requirements: [requirement({ abilityKey: 'crewmate_hp_recovery_eot' })],
      },
      {
        name: 'two special keys whose matches are disjoint',
        category: 'special',
        requirements: [
          requirement({ abilityKey: 'boost_atk' }),
          requirement({ abilityKey: 'territory' }),
        ],
      },
      {
        name: 'a special effect narrowed by minTurns',
        category: 'special',
        requirements: [requirement({ abilityKey: 'boost_atk', minTurns: 2 })],
      },
      {
        name: 'one key at two effect target scopes (same bucket, so still OR)',
        category: 'special',
        requirements: [
          requirement({ abilityKey: 'remove_special_bind', effectTargetScope: 'self' }),
          requirement({ abilityKey: 'remove_special_bind', effectTargetScope: 'crew' }),
        ],
      },
      {
        name: 'slot-scoped requirements that split into separate buckets',
        category: 'crewmate',
        requirements: [
          requirement({ abilityKey: 'crewmate_atk_boost_fighter', slotScope: 'leader' }),
          requirement({ abilityKey: 'crewmate_atk_boost_fighter', slotScope: 'sub', minTurns: 7 }),
        ],
      },
      {
        name: 'a required character count that must survive the round trip',
        category: 'support',
        requirements: [requirement({ abilityKey: 'support_atk_boost', requiredCharacterCount: 3 })],
      },
    ];

    for (const corpus of CORPORA) {
      it(`matches the legacy resolver for ${corpus.name}`, () => {
        const legacyIds = resolveCategoryAbilityMatchingCharacterIds(
          corpus.requirements,
          CATALOG_ITEMS,
          corpus.category,
        );
        const tagSetIds = resolveTagSetSelectionMatchingCharacterIds(
          expandRequirementsToTagSets(corpus.requirements),
          CATALOG_ITEMS,
        );

        expect(sortIds(tagSetIds)).toEqual(sortIds(legacyIds));
        // Guard the guard: a corpus that resolved to `undefined` on both sides
        // would pass vacuously without proving anything about the migration.
        expect(legacyIds).toBeDefined();
      });
    }

    it('expands legacy requirements into one any-set per bucket joined with all', () => {
      const selection = expandRequirementsToTagSets([
        requirement({ abilityKey: 'boost_atk', minTurns: 1 }),
        requirement({ abilityKey: 'boost_atk', minTurns: 2 }),
        requirement({ abilityKey: 'territory' }),
      ]);

      expect(selection.operator).toBe('all');
      expect(selection.sets.map((set) => set.operator)).toEqual(['any', 'any']);
      expect(selection.sets.map((set) => set.requirements.map((item) => item.abilityKey))).toEqual([
        ['boost_atk', 'boost_atk'],
        ['territory'],
      ]);
    });

    it('keeps every bucket past MAX_ABILITY_FILTER_TAG_SETS rather than widening the filter', () => {
      const bucketCount = MAX_ABILITY_FILTER_TAG_SETS + 3;
      const selection = expandRequirementsToTagSets(
        Array.from({ length: bucketCount }, (_unused, index) =>
          requirement({ abilityKey: `ability_${index}` }),
        ),
      );

      // Truncating here would drop AND constraints and silently match MORE
      // characters than the legacy filter did, so the cap is a UI concern only.
      expect(selection.sets).toHaveLength(bucketCount);
      expect(isOverAbilityTagSetCap(selection)).toBe(true);
    });

    it('reports a within-cap expansion as not over cap', () => {
      const selection = expandRequirementsToTagSets(
        Array.from({ length: MAX_ABILITY_FILTER_TAG_SETS }, (_unused, index) =>
          requirement({ abilityKey: `ability_${index}` }),
        ),
      );

      expect(isOverAbilityTagSetCap(selection)).toBe(false);
    });
  });

  describe('operator semantics', () => {
    it('unions requirements inside an any set', () => {
      expect(
        sortIds(
          resolveTagSetMatchingCharacterIds(
            setOf(
              [requirement({ abilityKey: 'boost_atk' }), requirement({ abilityKey: 'territory' })],
              'any',
              'set-any',
            ),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([10, 20, 4561, 5000]);
    });

    it('intersects requirements inside an all set', () => {
      expect(
        sortIds(
          resolveTagSetMatchingCharacterIds(
            setOf(
              [
                requirement({ abilityKey: 'crewmate_atk_boost_fighter' }),
                requirement({ abilityKey: 'potential_barrier_pierce' }),
              ],
              'all',
              'set-all',
            ),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([30]);
    });

    it('unions across sets when the selection operator is any', () => {
      expect(
        sortIds(
          resolveTagSetSelectionMatchingCharacterIds(
            selectionOf('any', [
              setOf([requirement({ abilityKey: 'boost_atk' })], 'any', 'set-a'),
              setOf([requirement({ abilityKey: 'potential_barrier_pierce' })], 'any', 'set-b'),
            ]),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([10, 20, 30, 40]);
    });

    it('intersects across sets when the selection operator is all', () => {
      expect(
        sortIds(
          resolveTagSetSelectionMatchingCharacterIds(
            selectionOf('all', [
              setOf([requirement({ abilityKey: 'crewmate_atk_boost_fighter' })], 'any', 'set-a'),
              setOf([requirement({ abilityKey: 'potential_barrier_pierce' })], 'any', 'set-b'),
            ]),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([30]);
    });

    it('mixes a per-set operator with a different selection operator', () => {
      // (boost_atk OR territory) AND (crewmate_atk_boost_fighter)
      expect(
        sortIds(
          resolveTagSetSelectionMatchingCharacterIds(
            selectionOf('all', [
              setOf(
                [
                  requirement({ abilityKey: 'boost_atk' }),
                  requirement({ abilityKey: 'territory' }),
                ],
                'any',
                'set-a',
              ),
              setOf([requirement({ abilityKey: 'crewmate_atk_boost_fighter' })], 'all', 'set-b'),
            ]),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([20]);
    });

    it('returns an empty list for a set nobody satisfies rather than undefined', () => {
      expect(
        resolveTagSetMatchingCharacterIds(
          setOf([requirement({ abilityKey: 'crewmate_hp_recovery_eot' })], 'any', 'set-empty'),
          CATALOG_ITEMS,
        ),
      ).toEqual([]);
    });

    it('returns an empty list for an unpopulated set', () => {
      expect(
        resolveTagSetMatchingCharacterIds(setOf([], 'any', 'set-blank'), CATALOG_ITEMS),
      ).toEqual([]);
    });
  });

  describe('empty sets', () => {
    it('skips a half-built empty set instead of blanking an all selection', () => {
      const withEmpty = resolveTagSetSelectionMatchingCharacterIds(
        selectionOf('all', [
          setOf([requirement({ abilityKey: 'crewmate_atk_boost_fighter' })], 'any', 'set-a'),
          setOf([], 'any', 'set-blank'),
        ]),
        CATALOG_ITEMS,
      );
      const withoutEmpty = resolveTagSetSelectionMatchingCharacterIds(
        selectionOf('all', [
          setOf([requirement({ abilityKey: 'crewmate_atk_boost_fighter' })], 'any', 'set-a'),
        ]),
        CATALOG_ITEMS,
      );

      expect(sortIds(withEmpty)).toEqual([20, 30]);
      expect(sortIds(withEmpty)).toEqual(sortIds(withoutEmpty));
    });

    it('skips an empty set in an any selection too', () => {
      expect(
        sortIds(
          resolveTagSetSelectionMatchingCharacterIds(
            selectionOf('any', [
              setOf([], 'all', 'set-blank'),
              setOf([requirement({ abilityKey: 'potential_barrier_pierce' })], 'any', 'set-b'),
            ]),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([30, 40]);
    });

    it('returns undefined when every set is empty', () => {
      expect(
        resolveTagSetSelectionMatchingCharacterIds(
          selectionOf('all', [setOf([], 'any', 'set-a'), setOf([], 'all', 'set-b')]),
          CATALOG_ITEMS,
        ),
      ).toBeUndefined();
    });

    it('returns undefined for a selection with no sets at all', () => {
      expect(
        resolveTagSetSelectionMatchingCharacterIds(
          createEmptyAbilityFilterTagSetSelection(),
          CATALOG_ITEMS,
        ),
      ).toBeUndefined();
    });
  });

  describe('normalizeAbilityTagSetOperator', () => {
    it('keeps any and all', () => {
      expect(normalizeAbilityTagSetOperator('any')).toBe('any');
      expect(normalizeAbilityTagSetOperator('all')).toBe('all');
      expect(normalizeAbilityTagSetOperator(' any ')).toBe('any');
    });

    it('defaults to all for undefined, null, empty, and garbage', () => {
      expect(normalizeAbilityTagSetOperator(undefined)).toBe('all');
      expect(normalizeAbilityTagSetOperator(null)).toBe('all');
      expect(normalizeAbilityTagSetOperator('')).toBe('all');
      expect(normalizeAbilityTagSetOperator('nonsense')).toBe('all');
    });

    it('does not accept the SQL-style AND/OR spellings', () => {
      // The model deliberately speaks 'all' | 'any', matching
      // CharacterSearchQuery.selectedTypesMatchMode, so 'OR' is NOT 'any'.
      expect(normalizeAbilityTagSetOperator('AND')).toBe('all');
      expect(normalizeAbilityTagSetOperator('OR')).toBe('all');
      expect(normalizeAbilityTagSetOperator('ANY')).toBe('all');
    });
  });

  describe('normalizeAbilityFilterTagSetSelection', () => {
    it('returns null for junk input', () => {
      expect(normalizeAbilityFilterTagSetSelection(null)).toBeNull();
      expect(normalizeAbilityFilterTagSetSelection(undefined)).toBeNull();
      expect(normalizeAbilityFilterTagSetSelection('sets')).toBeNull();
      expect(normalizeAbilityFilterTagSetSelection(42)).toBeNull();
      expect(normalizeAbilityFilterTagSetSelection([])).toBeNull();
      expect(normalizeAbilityFilterTagSetSelection({})).toBeNull();
      expect(normalizeAbilityFilterTagSetSelection({ sets: 'nope' })).toBeNull();
      expect(normalizeAbilityFilterTagSetSelection({ sets: [] })).toBeNull();
    });

    it('returns null when every set normalizes away', () => {
      expect(
        normalizeAbilityFilterTagSetSelection({
          operator: 'any',
          sets: [null, 'set', [], { requirements: [] }, { requirements: [{ abilityKey: '  ' }] }],
        }),
      ).toBeNull();
    });

    it('drops malformed sets and unknown fields', () => {
      expect(
        normalizeAbilityFilterTagSetSelection({
          operator: 'any',
          unknownTopLevel: true,
          sets: [
            null,
            { id: 'bad', operator: 'any', requirements: 'nope' },
            {
              id: '  set-1  ',
              operator: 'all',
              unknownSetField: 'x',
              requirements: [
                { abilityKey: 'boost_atk', unknownRequirementField: 'x' },
                { abilityKey: '' },
                'garbage',
              ],
            },
          ],
        }),
      ).toEqual({
        operator: 'any',
        sets: [
          {
            id: 'set-1',
            operator: 'all',
            requirements: [
              {
                abilityKey: 'boost_atk',
                minTurns: null,
                slotTokens: [],
                requiredCharacterCount: 1,
                slotScope: 'any',
                minEffectValue: null,
                effectTargetScope: 'any',
              },
            ],
          },
        ],
      });
    });

    it('normalizes requirement fields defensively and keeps captain source scope', () => {
      expect(
        normalizeAbilityFilterTagSetSelection({
          operator: 'nonsense',
          sets: [
            {
              operator: 'OR',
              requirements: [
                {
                  abilityKey: '  boost_atk  ',
                  minTurns: Number.NaN,
                  slotTokens: ['  RCV  ', '', 7],
                  requiredCharacterCount: 3.9,
                  slotScope: 'leader',
                  sourceScope: 'captainAbility',
                  minEffectValue: '30',
                  effectTargetScope: 'self',
                },
              ],
            },
          ],
        }),
      ).toEqual({
        // 'nonsense' and 'OR' both fall back to the 'all' default.
        operator: 'all',
        sets: [
          {
            id: expect.any(String),
            operator: 'all',
            requirements: [
              {
                abilityKey: 'boost_atk',
                minTurns: null,
                slotTokens: ['RCV'],
                requiredCharacterCount: 3,
                slotScope: 'leader',
                sourceScope: 'captainAbility',
                minEffectValue: 30,
                effectTargetScope: 'self',
              },
            ],
          },
        ],
      });
    });

    it('mints an id for a set that has none', () => {
      const selection = normalizeAbilityFilterTagSetSelection({
        sets: [{ requirements: [{ abilityKey: 'boost_atk' }] }],
      });

      expect(selection?.sets[0].id).toEqual(expect.any(String));
      expect(selection?.sets[0].id.length).toBeGreaterThan(0);
    });

    it('caps the restored sets at MAX_ABILITY_FILTER_TAG_SETS', () => {
      const selection = normalizeAbilityFilterTagSetSelection({
        operator: 'any',
        sets: Array.from({ length: MAX_ABILITY_FILTER_TAG_SETS + 4 }, (_unused, index) => ({
          id: `set-${index}`,
          operator: 'any',
          requirements: [{ abilityKey: 'boost_atk' }],
        })),
      });

      expect(selection?.sets).toHaveLength(MAX_ABILITY_FILTER_TAG_SETS);
      expect(selection?.sets.map((set) => set.id)).toEqual([
        'set-0',
        'set-1',
        'set-2',
        'set-3',
        'set-4',
        'set-5',
      ]);
    });
  });

  describe('expand / flatten round trip', () => {
    const byStableKey = (left: AutoBuildAbilityRequirement, right: AutoBuildAbilityRequirement) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right));

    it('flattens back to the same flat requirement multiset', () => {
      const legacy: AutoBuildAbilityRequirement[] = [
        requirement({ abilityKey: 'boost_atk', minTurns: 1 }),
        requirement({ abilityKey: 'territory', requiredCharacterCount: 2 }),
        requirement({ abilityKey: 'boost_atk', minTurns: 2 }),
        requirement({ abilityKey: 'crewmate_atk_boost_fighter', slotScope: 'leader' }),
        requirement({ abilityKey: 'remove_special_bind', effectTargetScope: 'self' }),
      ];

      const flattened = flattenTagSetsToRequirements(expandRequirementsToTagSets(legacy));

      expect([...flattened].sort(byStableKey)).toEqual([...legacy].sort(byStableKey));
      expect(flattened).toHaveLength(legacy.length);
    });

    it('preserves duplicates rather than deduping them away', () => {
      const legacy: AutoBuildAbilityRequirement[] = [
        requirement({ abilityKey: 'boost_atk' }),
        requirement({ abilityKey: 'boost_atk' }),
      ];

      expect(flattenTagSetsToRequirements(expandRequirementsToTagSets(legacy))).toHaveLength(2);
    });

    it('counts requirements and populated sets across the selection', () => {
      const selection = selectionOf('all', [
        setOf(
          [requirement({ abilityKey: 'boost_atk' }), requirement({ abilityKey: 'territory' })],
          'any',
          'set-a',
        ),
        setOf([], 'any', 'set-blank'),
        setOf([requirement({ abilityKey: 'potential_barrier_pierce' })], 'all', 'set-b'),
      ]);

      expect(countTagSetRequirements(selection)).toBe(3);
      expect(countPopulatedTagSets(selection)).toBe(2);
    });
  });

  describe('unionAbilityMatchingCharacterIds undefined semantics', () => {
    it('returns undefined when every list is undefined, mirroring intersect', () => {
      expect(unionAbilityMatchingCharacterIds([undefined, undefined])).toBeUndefined();
      expect(unionAbilityMatchingCharacterIds([])).toBeUndefined();
    });

    it('ignores undefined lists when at least one is defined', () => {
      expect(sortIds(unionAbilityMatchingCharacterIds([undefined, [10, 20], undefined]))).toEqual([
        10, 20,
      ]);
    });

    it('returns an empty list rather than undefined when the only list is empty', () => {
      expect(unionAbilityMatchingCharacterIds([[]])).toEqual([]);
    });

    it('dedupes overlapping lists', () => {
      expect(
        sortIds(
          unionAbilityMatchingCharacterIds([
            [10, 20],
            [20, 30],
          ]),
        ),
      ).toEqual([10, 20, 30]);
    });
  });

  describe('legacy-category requirements', () => {
    it('is invisible to the category resolver', () => {
      for (const category of ['special', 'crewmate', 'potential', 'support'] as const) {
        expect(
          resolveCategoryAbilityMatchingCharacterIds(
            [requirement({ abilityKey: 'legacy_orb_boost' })],
            CATALOG_ITEMS,
            category,
          ),
        ).toBeUndefined();
      }
    });

    it('resolves through resolveAbilityRequirementMatchingCharacterIds instead', () => {
      expect(
        sortIds(
          resolveAbilityRequirementMatchingCharacterIds(
            requirement({ abilityKey: 'legacy_orb_boost' }),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([10, 40]);
    });

    it('is honoured by a tag set instead of being silently dropped', () => {
      expect(
        sortIds(
          resolveTagSetSelectionMatchingCharacterIds(
            selectionOf('all', [
              setOf([requirement({ abilityKey: 'legacy_orb_boost' })], 'any', 'set-legacy'),
            ]),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([10, 40]);
    });

    it('mixes a legacy key with a category key in one all set', () => {
      expect(
        sortIds(
          resolveTagSetSelectionMatchingCharacterIds(
            selectionOf('all', [
              setOf(
                [
                  requirement({ abilityKey: 'legacy_orb_boost' }),
                  requirement({ abilityKey: 'boost_atk' }),
                ],
                'all',
                'set-mixed',
              ),
            ]),
            CATALOG_ITEMS,
          ),
        ),
      ).toEqual([10]);
    });

    it('resolves an unknown ability key to no matches', () => {
      expect(
        resolveAbilityRequirementMatchingCharacterIds(
          requirement({ abilityKey: 'not_in_catalog' }),
          CATALOG_ITEMS,
        ),
      ).toEqual([]);
    });
  });

  describe('clone helpers', () => {
    it('does not share requirement or slot token array references', () => {
      const source: AbilityFilterTagSetSelection = selectionOf('any', [
        setOf(
          [requirement({ abilityKey: 'boost_atk', slotTokens: ['RCV', 'INT'] })],
          'all',
          'set-a',
        ),
      ]);

      const clone = cloneAbilityFilterTagSetSelection(source);

      expect(clone).toEqual(source);
      expect(clone).not.toBe(source);
      expect(clone.sets).not.toBe(source.sets);
      expect(clone.sets[0]).not.toBe(source.sets[0]);
      expect(clone.sets[0].requirements).not.toBe(source.sets[0].requirements);
      expect(clone.sets[0].requirements[0]).not.toBe(source.sets[0].requirements[0]);
      expect(clone.sets[0].requirements[0].slotTokens).not.toBe(
        source.sets[0].requirements[0].slotTokens,
      );

      clone.sets[0].requirements[0].slotTokens.push('DEX');
      clone.sets[0].requirements.push(requirement({ abilityKey: 'territory' }));
      clone.sets.push(setOf([], 'any', 'set-b'));

      expect(source.sets).toHaveLength(1);
      expect(source.sets[0].requirements).toHaveLength(1);
      expect(source.sets[0].requirements[0].slotTokens).toEqual(['RCV', 'INT']);
    });

    it('normalizes the operators while cloning', () => {
      const clone = cloneAbilityFilterTagSetSelection({
        operator: 'OR' as never,
        sets: [{ id: 'set-a', operator: 'AND' as never, requirements: [] }],
      });

      expect(clone.operator).toBe('all');
      expect(clone.sets[0].operator).toBe('all');
    });

    it('copies requirements when creating a set', () => {
      const source = requirement({ abilityKey: 'boost_atk', slotTokens: ['RCV'] });
      const created = createAbilityFilterTagSet([source], 'any', 'set-a');

      expect(created.requirements[0]).not.toBe(source);
      expect(created.requirements[0].slotTokens).not.toBe(source.slotTokens);
      expect(created.requirements[0]).toEqual(source);
    });

    it('defaults a created set to any and mints an id when none is given', () => {
      const created = createAbilityFilterTagSet();

      expect(created.operator).toBe('any');
      expect(created.requirements).toEqual([]);
      expect(created.id.length).toBeGreaterThan(0);
      expect(createAbilityFilterTagSet().id).not.toBe(created.id);
    });

    it('creates an empty selection that applies no filter', () => {
      expect(createEmptyAbilityFilterTagSetSelection()).toEqual({ sets: [], operator: 'all' });
    });
  });
});

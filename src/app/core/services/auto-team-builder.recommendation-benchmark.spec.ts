import { describe, expect, it } from 'vitest';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  type AutoBuildInput,
  type AutoBuildManualSlotSelection,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type NormalizedBuilderAbility } from '../models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import { runAutoTeamBuildSearch } from './auto-team-builder.engine';

type BenchmarkAssertion = (result: AutoBuildResult) => void;

interface RecommendationBenchmarkCase {
  caseId: string;
  records: CharacterDetailRecord[];
  input: AutoBuildInput;
  expectedSlotIds: number[];
  assertResult: BenchmarkAssertion;
}

const BENCHMARK_CASES: RecommendationBenchmarkCase[] = [
  {
    caseId: 'utility-requirements-outrank-generic-fillers',
    records: createUtilityBenchmarkRecords(),
    input: createInput(['DEX'], ['Fighter'], {
      manualSlots: createManualSlots({
        captain: [7101],
        friendCaptain: [7102],
      }),
      requiredAbilities: [
        { abilityKey: 'remove_bind', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
        { abilityKey: 'remove_despair', minTurns: 5, slotTokens: [], requiredCharacterCount: 1 },
      ],
    }),
    expectedSlotIds: [7101, 7102, 7111, 7110, 7113, 7112],
    assertResult: (result) => {
      expect(result.coverage.abilityRequirements.matchesAll).toBe(true);
      expect(result.slots.map((slot) => slot.character.id)).not.toContain(7199);

      for (const characterId of [7110, 7111]) {
        expect(slotReasonCodes(result, characterId)).toEqual(
          expect.arrayContaining(['requiredAbilityMatch', 'utilityRole']),
        );
      }
    },
  },
  {
    caseId: 'strict-type-fallback-is-explained',
    records: createFallbackBenchmarkRecords(),
    input: createInput(['DEX', 'INT'], ['Fighter'], {
      manualSlots: createManualSlots({
        captain: [7201],
        friendCaptain: [7202],
      }),
      requireAllSelectedTypesInTeam: true,
    }),
    expectedSlotIds: [7201, 7202, 7213, 7212, 7211, 7210],
    assertResult: (result) => {
      expect(result.requestedInput.types).toEqual(['DEX', 'INT']);
      expect(result.input.types).toEqual(['DEX']);
      expect(result.relaxation.usedFallback).toBe(true);
      expect(result.relaxation.droppedTypes).toEqual(['INT']);
      expect(result.coverage.coversAllSelectedTypes).toBe(true);

      for (const characterId of [7201, 7202]) {
        expect(slotFallbackReasonCodes(result, characterId)).toEqual(
          expect.arrayContaining(['fallbackUsed', 'fallbackDroppedTypes']),
        );
      }
    },
  },
  {
    caseId: 'leader-scope-team-stays-coherent',
    records: createLeaderScopeBenchmarkRecords(),
    input: createInput(['DEX'], ['Fighter'], {
      manualSlots: createManualSlots({
        captain: [7301],
        friendCaptain: [7302],
      }),
    }),
    expectedSlotIds: [7301, 7302, 7313, 7312, 7311, 7310],
    assertResult: (result) => {
      expect(result.relaxation.usedFallback).toBe(false);
      expect(result.coverage.leaderCriteria.allSlotsMatch).toBe(true);
      expect(result.coverage.leaderCriteria.matchingSlots).toBe(6);
      expect(result.coverage.leaderCriteria.derivedAllowedTypes).toEqual(['DEX']);
      expect(result.coverage.leaderCriteria.derivedAllowedClasses).toEqual(['Fighter']);
    },
  },
];

describe('Auto Team Builder recommendation quality benchmark', () => {
  it.each(BENCHMARK_CASES)('$caseId', ({ records, input, expectedSlotIds, assertResult }) => {
    const result = runAutoTeamBuildSearch(records, input);

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('Expected benchmark case to produce a complete team.');
    }

    expect(result.slots.map((slot) => slot.character.id)).toEqual(expectedSlotIds);
    expect(result.slots).toHaveLength(6);
    assertResult(result);
  });
});

function createInput(
  types: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
  selectedClasses: string[] = ['Fighter'],
  overrides: Partial<
    Pick<
      AutoBuildInput,
      | 'battleRequirements'
      | 'excludedCharacterIds'
      | 'manualSlots'
      | 'requiredAbilities'
      | 'requireAllSelectedTypesInTeam'
      | 'requireUniqueBaseCharacterNames'
    >
  > = {},
): AutoBuildInput {
  return {
    types,
    selectedClasses,
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    requiredAbilities: overrides.requiredAbilities ?? [],
    requiredCharacterGroups: [],
    enemyMechanics: [],
    battleRequirements: overrides.battleRequirements ?? [],
    requireAllSelectedTypesInTeam: overrides.requireAllSelectedTypesInTeam ?? false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: false,
    requireBothLeadersFullCaptainAbilityCoverage: false,
    minimumLeaderSuperEffectMatchingSlots: null,
    requireLeaderSuperSpecialCriteria: false,
    strictSuperSpecialCriteriaCoverage: false,
    requireSuperTandemCriteria: false,
    strictSuperTandemCriteriaCoverage: false,
    requireUniqueBaseCharacterNames: overrides.requireUniqueBaseCharacterNames ?? false,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
    leaderBoostFilters: ['HP', 'ATK'],
    leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
    costRange: createEmptyAutoBuildCostRange(),
    leaderCostRange: createEmptyAutoBuildCostRange(),
    subCostRange: createEmptyAutoBuildCostRange(),
    maxTotalCost: null,
    manualSlots: overrides.manualSlots ?? createEmptyAutoBuildManualSlots(),
    lockedCharacterIds: [],
    excludedCharacterIds: overrides.excludedCharacterIds ?? [],
    captainCharacterId: null,
    friendCaptainCharacterId: null,
    manualShipId: null,
    requireManualShip: false,
    excludedShipIds: [],
    candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
  };
}

function createManualSlots(
  characterIdsByRole: Partial<Record<AutoBuildManualSlotSelection['role'], number[]>>,
): AutoBuildManualSlotSelection[] {
  return createEmptyAutoBuildManualSlots().map((slot) => {
    const characterIds = characterIdsByRole[slot.role] ?? [];

    return {
      ...slot,
      characterIds,
      requiredCharacterId: characterIds.length === 1 ? characterIds[0] : null,
    };
  });
}

function createUtilityBenchmarkRecords(): CharacterDetailRecord[] {
  return [
    createLeader(7101, 'Benchmark DEX Captain'),
    createLeader(7102, 'Benchmark DEX Friend'),
    createSub(7110, 'Bind Utility', {
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 5)],
      specialText: 'Reduces Bind duration by 5 turns.',
    }),
    createSub(7111, 'Despair Utility', {
      builderAbilities: [createBuilderAbility('remove_despair', 'Remove Despair', 5)],
      specialText: 'Reduces Despair duration by 5 turns.',
    }),
    createSub(7112, 'Orb Booster', {
      specialText: 'Boosts orb effects of DEX characters by 2.25x for 1 turn.',
    }),
    createSub(7113, 'Attack Booster', {
      specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
    }),
    createSub(7199, 'Generic Filler', {
      captainAverageBoost: 8,
      specialText: 'Deals 100x character ATK in type damage to one enemy.',
    }),
  ];
}

function createFallbackBenchmarkRecords(): CharacterDetailRecord[] {
  return [
    createLeader(7201, 'Fallback DEX Captain'),
    createLeader(7202, 'Fallback DEX Friend'),
    createSub(7210, 'Fallback Bind Utility', {
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 5)],
      specialText: 'Reduces Bind duration by 5 turns.',
    }),
    createSub(7211, 'Fallback Orb Booster', {
      specialText: 'Boosts orb effects of DEX characters by 2.25x for 1 turn.',
    }),
    createSub(7212, 'Fallback Attack Booster', {
      specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
    }),
    createSub(7213, 'Fallback Consistency', {
      specialText: 'Changes BLOCK orbs into Matching Orbs and reduces crew paralysis by 5 turns.',
    }),
  ];
}

function createLeaderScopeBenchmarkRecords(): CharacterDetailRecord[] {
  return [
    createLeader(7301, 'Scope DEX Captain'),
    createLeader(7302, 'Scope DEX Friend'),
    createSub(7310, 'Scope Bind Utility', {
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 5)],
      specialText: 'Reduces Bind duration by 5 turns.',
    }),
    createSub(7311, 'Scope Orb Booster', {
      specialText: 'Boosts orb effects of DEX characters by 2.25x for 1 turn.',
    }),
    createSub(7312, 'Scope Attack Booster', {
      specialText: 'Boosts ATK of Fighter characters by 2.25x for 1 turn.',
    }),
    createSub(7313, 'Scope Consistency', {
      specialText: 'Changes BLOCK orbs into Matching Orbs and reduces crew paralysis by 5 turns.',
    }),
  ];
}

function createLeader(id: number, name: string): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    primaryClass: 'Fighter',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x.',
      specialText: 'Boosts base ATK of DEX and Fighter characters by 1000 for 1 turn.',
    },
  });
}

function createSub(
  id: number,
  name: string,
  overrides: {
    builderAbilities?: NormalizedBuilderAbility[];
    captainAverageBoost?: number;
    specialText?: string;
  } = {},
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    captainAverageBoost: overrides.captainAverageBoost,
    primaryClass: 'Fighter',
    detail: {
      builderAbilities: overrides.builderAbilities ?? [],
      specialText: overrides.specialText ?? null,
    },
  });
}

function createCharacterRecord(
  overrides: Omit<Partial<CharacterDetailRecord>, 'detail' | 'id' | 'primaryClass'> & {
    id: number;
    detail?: Partial<CharacterDetailRecord['detail']>;
    primaryClass: string;
  },
): CharacterDetailRecord {
  const secondaryClass = overrides.secondaryClass ?? null;
  const classes = [overrides.primaryClass, secondaryClass].filter((value): value is string =>
    Boolean(value),
  );

  return {
    id: overrides.id,
    name: overrides.name ?? `Benchmark Unit ${overrides.id}`,
    searchText: overrides.searchText,
    isIncomplete: overrides.isIncomplete ?? false,
    type: overrides.type ?? AUTO_TEAM_BUILDER_DEFAULT_TYPE,
    classes,
    primaryClass: overrides.primaryClass,
    secondaryClass,
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: overrides.combo ?? 4,
    captainHpBoost: overrides.captainHpBoost ?? 1.3,
    captainAtkBoost: overrides.captainAtkBoost ?? 5,
    captainAverageBoost: overrides.captainAverageBoost ?? 3.15,
    stats: overrides.stats ?? {
      min: { hp: 1000, atk: 400, rcv: 120 },
      max: { hp: 3900, atk: 1900, rcv: 340 },
      growth: 3,
    },
    regionAvailability: overrides.regionAvailability ?? {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    assets: overrides.assets ?? {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: overrides.imageUrl ?? 'assets/placeholders/character-card.svg',
    detailImageUrl: overrides.detailImageUrl ?? 'assets/placeholders/character-card.svg',
    detail: {
      characterId: overrides.id,
      captainAbility: overrides.detail?.captainAbility ?? null,
      captainAbilityVariants: overrides.detail?.captainAbilityVariants ?? [],
      captainAbilityCoverage: overrides.detail?.captainAbilityCoverage,
      captainNotes: overrides.detail?.captainNotes ?? null,
      specialName: overrides.detail?.specialName ?? null,
      specialText: overrides.detail?.specialText ?? null,
      specialNotes: overrides.detail?.specialNotes ?? null,
      superSpecialText: overrides.detail?.superSpecialText ?? null,
      superSpecialCriteriaText: overrides.detail?.superSpecialCriteriaText ?? null,
      superSpecialNotes: overrides.detail?.superSpecialNotes ?? null,
      superSpecialCriteria: overrides.detail?.superSpecialCriteria ?? null,
      partyConflictKeys: overrides.detail?.partyConflictKeys ?? [],
      characterTags: overrides.detail?.characterTags ?? [],
      builderAbilities: overrides.detail?.builderAbilities ?? [],
      sailorAbilities: overrides.detail?.sailorAbilities ?? [],
      sailorNotes: overrides.detail?.sailorNotes ?? null,
      potentialAbilities: overrides.detail?.potentialAbilities ?? [],
      supportData: overrides.detail?.supportData ?? [],
      swapData: overrides.detail?.swapData ?? null,
      vsSpecial: overrides.detail?.vsSpecial ?? null,
      superType: overrides.detail?.superType ?? null,
      superTandemData: overrides.detail?.superTandemData ?? null,
      superClass: overrides.detail?.superClass ?? null,
      rumbleData: overrides.detail?.rumbleData ?? null,
    },
  };
}

function createBuilderAbility(
  key: string,
  label: string,
  minTurns: number,
): NormalizedBuilderAbility {
  return {
    key,
    label,
    minTurns,
    isCompleteRemoval: false,
    slotTokens: [],
    source: 'specialText',
  };
}

function slotReasonCodes(result: AutoBuildResult, characterId: number): string[] {
  return (
    result.slots
      .find((slot) => slot.character.id === characterId)
      ?.explanation?.reasons.map((reason) => reason.code) ?? []
  );
}

function slotFallbackReasonCodes(result: AutoBuildResult, characterId: number): string[] {
  return (
    result.slots
      .find((slot) => slot.character.id === characterId)
      ?.explanation?.fallbackReasons.map((reason) => reason.code) ?? []
  );
}

import { describe, expect, it } from 'vitest';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_TEAM_BUILDER_TYPES,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  AutoTeamBuildCancelledError,
  buildAutoTeamBuildTimingSnapshot,
  createAutoTeamBuildTimingState,
  createAutoTeamBuildFallbackPlanner,
  recordAutoTeamBuildFallbackTiming,
  runAutoTeamBuildSearch,
  satisfiesRequestedAutoTeamBuildCoverage,
} from './auto-team-builder.engine';

describe('auto team build fallback timing estimates', () => {
  it('uses a recent average that reacts faster than the lifetime average', () => {
    let now = 0;
    const timingState = createAutoTeamBuildTimingState(() => now);

    recordAutoTeamBuildFallbackTiming(timingState, 'single', 1000);
    recordAutoTeamBuildFallbackTiming(timingState, 'single', 100);
    recordAutoTeamBuildFallbackTiming(timingState, 'single', 100);
    recordAutoTeamBuildFallbackTiming(timingState, 'single', 100);
    recordAutoTeamBuildFallbackTiming(timingState, 'single', 100);
    recordAutoTeamBuildFallbackTiming(timingState, 'single', 100);
    recordAutoTeamBuildFallbackTiming(timingState, 'single', 100);

    const lifetimeAverage =
      timingState.totalCompletedFallbackMs / timingState.completedFallbackAttempts;
    const snapshot = buildAutoTeamBuildTimingSnapshot(timingState, 12, 5, {
      remainingCategories: ['double', 'double', 'double'],
    });

    expect(snapshot.averageFallbackAttemptMs).toBeLessThan(lifetimeAverage);
    expect(snapshot.estimatedRemainingMs).toBe(snapshot.averageFallbackAttemptMs! * 3);
  });

  it('uses category averages once enough samples exist', () => {
    const timingState = createAutoTeamBuildTimingState(() => 0);

    recordAutoTeamBuildFallbackTiming(timingState, 'meta', 10);
    recordAutoTeamBuildFallbackTiming(timingState, 'meta', 20);
    recordAutoTeamBuildFallbackTiming(timingState, 'subset', 100);
    recordAutoTeamBuildFallbackTiming(timingState, 'subset', 120);

    const metaSnapshot = buildAutoTeamBuildTimingSnapshot(timingState, 10, 5, {
      remainingCategories: ['meta', 'meta'],
    });
    const subsetSnapshot = buildAutoTeamBuildTimingSnapshot(timingState, 10, 5, {
      remainingCategories: ['subset', 'subset'],
    });

    expect(metaSnapshot.estimatedRemainingMs).toBe(30);
    expect(subsetSnapshot.estimatedRemainingMs).toBe(220);
  });

  it('accounts for elapsed in-flight fallback attempts', () => {
    let now = 0;
    const timingState = createAutoTeamBuildTimingState(() => now);

    recordAutoTeamBuildFallbackTiming(timingState, 'single', 100);
    recordAutoTeamBuildFallbackTiming(timingState, 'single', 100);
    now = 250;

    const snapshot = buildAutoTeamBuildTimingSnapshot(timingState, 10, 3, {
      remainingCategories: [],
      inFlightAttempts: [{ category: 'single', startedAt: 0 }],
    });

    expect(snapshot.estimatedRemainingMs).toBe(250);
  });

  it('scales category-aware estimates by active worker count', () => {
    const timingState = createAutoTeamBuildTimingState(() => 0);

    recordAutoTeamBuildFallbackTiming(timingState, 'single', 90);
    recordAutoTeamBuildFallbackTiming(timingState, 'single', 90);

    const twoWorkerSnapshot = buildAutoTeamBuildTimingSnapshot(timingState, 10, 3, {
      activeWorkerCount: 2,
      remainingCategories: ['single', 'single', 'single', 'single'],
    });
    const fourWorkerSnapshot = buildAutoTeamBuildTimingSnapshot(timingState, 10, 3, {
      activeWorkerCount: 4,
      remainingCategories: ['single', 'single', 'single', 'single'],
    });

    expect(twoWorkerSnapshot.estimatedRemainingMs).toBe(180);
    expect(fourWorkerSnapshot.estimatedRemainingMs).toBe(90);
  });
});

describe('runAutoTeamBuildSearch', () => {
  it('emits deterministic progress stages for exact and fallback attempts', () => {
    const snapshots: AutoBuildProgressSnapshot[] = [];

    const result = runAutoTeamBuildSearch(
      createSingleTypeRecords(),
      createInput(['DEX', 'INT'], ['Fighter']),
      {
        onProgress: (snapshot) => snapshots.push(snapshot),
      },
    );

    expect(result).not.toBeNull();
    const stageSnapshots = snapshots.filter(
      (snapshot) => typeof snapshot.completedWorkUnits !== 'number',
    );

    expect(stageSnapshots.map((snapshot) => snapshot.stage)).toEqual([
      'preparingSearch',
      'exactAttempt',
      'fallbackAttempt',
      'fallbackAttempt',
      'completed',
    ]);
    expect(stageSnapshots[1]).toMatchObject({
      completedAttempts: 0,
      totalAttempts: 7,
      attemptCountFinal: false,
      elapsedMs: expect.any(Number),
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
    });
    expect(stageSnapshots[2]).toMatchObject({
      completedAttempts: 1,
      totalAttempts: 7,
      attemptCountFinal: true,
      elapsedMs: expect.any(Number),
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: true,
      currentIgnoredLeaderSuperSpecialCriteria: false,
    });
    expect(stageSnapshots[3]).toMatchObject({
      completedAttempts: 2,
      totalAttempts: 7,
      attemptCountFinal: true,
      elapsedMs: expect.any(Number),
      estimatedRemainingMs: expect.any(Number),
      averageFallbackAttemptMs: expect.any(Number),
      completedFallbackAttempts: 1,
      currentDroppedTypes: ['INT'],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: true,
      currentIgnoredLeaderSuperSpecialCriteria: false,
    });
    expect(stageSnapshots[4]).toMatchObject({
      stage: 'completed',
      attemptCountFinal: true,
      totalAttempts: 7,
    });
  });

  it('keeps eta null until a fallback attempt finishes, then derives a decreasing estimate', () => {
    const snapshots: AutoBuildProgressSnapshot[] = [];

    runAutoTeamBuildSearch(
      createSingleTypeRecords(),
      {
        ...createInput(['DEX', 'INT'], ['Fighter']),
        requiredAbilities: [
          {
            abilityKey: 'remove_slot_barrier',
            minTurns: 3,
            slotTokens: ['DEX'],
            requiredCharacterCount: 1,
          },
        ],
      },
      {
        onProgress: (snapshot) => snapshots.push(snapshot),
        now: createClock([
          0, 5, 10, 15, 20, 60, 65, 70, 100, 105, 110, 140, 145, 150, 180, 185, 190, 220, 225,
        ]),
      },
    );

    const fallbackSnapshots = snapshots.filter(
      (snapshot) =>
        snapshot.stage === 'fallbackAttempt' && typeof snapshot.completedWorkUnits !== 'number',
    );

    expect(fallbackSnapshots[0]).toMatchObject({
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
    });
    expect(fallbackSnapshots[1]).toMatchObject({
      estimatedRemainingMs: expect.any(Number),
      averageFallbackAttemptMs: expect.any(Number),
      completedFallbackAttempts: 1,
    });
    expect(fallbackSnapshots[1].averageFallbackAttemptMs).toBeGreaterThan(0);
    expect(fallbackSnapshots[1].estimatedRemainingMs).toBeGreaterThan(0);
  });

  it('emits inner attempt progress without changing the selected result', () => {
    const records = createStrictMixedTeamRecords();
    const input = createInput(['DEX'], ['Fighter']);
    const snapshots: AutoBuildProgressSnapshot[] = [];
    const baselineResult = runAutoTeamBuildSearch(records, input);
    const progressResult = runAutoTeamBuildSearch(records, input, {
      onProgress: (snapshot) => snapshots.push(snapshot),
    });

    expect(progressResult?.slots.map((slot) => slot.character.id)).toEqual(
      baselineResult?.slots.map((slot) => slot.character.id),
    );
    expect(
      snapshots.find(
        (snapshot) =>
          snapshot.stage === 'exactAttempt' &&
          typeof snapshot.completedWorkUnits === 'number' &&
          snapshot.totalWorkUnits === records.length,
      ),
    ).toMatchObject({
      checkedCandidates: expect.any(Number),
      totalCandidatesToCheck: records.length,
    });
    expect(
      snapshots.find(
        (snapshot) =>
          snapshot.stage === 'exactAttempt' &&
          typeof snapshot.currentCaptainId === 'number' &&
          typeof snapshot.currentFriendCaptainId === 'number',
      ),
    ).toMatchObject({
      currentCaptainName: expect.any(String),
      currentFriendCaptainName: expect.any(String),
    });
  });

  it('skips impossible duplicate strict-battle leader pairs before sub DFS', () => {
    const snapshots: AutoBuildProgressSnapshot[] = [];
    const result = runAutoTeamBuildSearch(
      createStrictBattleGroupRecords(),
      createInput(['DEX'], ['Fighter'], {
        battleRequirements: createStrictSixGroupBattleRequirements(),
        requireUniqueBaseCharacterNames: true,
      }),
      {
        onProgress: (snapshot) => snapshots.push(snapshot),
      },
    );

    expect(result?.relaxation.usedFallback).toBe(false);
    expect(result?.slots.map((slot) => slot.character.id)).toEqual([
      9606, 9605, 9604, 9603, 9602, 9601,
    ]);

    const duplicateLeaderPairPrune = snapshots.find(
      (snapshot) =>
        snapshot.stage === 'exactAttempt' &&
        snapshot.currentCaptainId === 9606 &&
        snapshot.currentFriendCaptainId === 9606 &&
        snapshot.subPoolSize === 0 &&
        (snapshot.currentExclusionCounts?.missingRequiredGroup ?? 0) > 0,
    );
    const validLeaderPairSearch = snapshots.find(
      (snapshot) =>
        snapshot.stage === 'exactAttempt' &&
        snapshot.currentCaptainId === 9606 &&
        snapshot.currentFriendCaptainId === 9605 &&
        typeof snapshot.subPoolSize === 'number' &&
        snapshot.subPoolSize > 0,
    );

    expect(duplicateLeaderPairPrune).toMatchObject({
      leaderPairIndex: 1,
      totalLeaderPairs: 8,
      searchNodesVisited: 0,
      currentExclusionCounts: expect.objectContaining({
        missingRequiredGroup: 1,
        total: 1,
      }),
    });
    expect(validLeaderPairSearch).toMatchObject({
      leaderPairIndex: 2,
      totalLeaderPairs: 8,
      subPoolSize: 4,
      searchNodesVisited: expect.any(Number),
      permanentExclusionCounts: expect.objectContaining({
        alreadyUsed: 2,
      }),
    });
  });

  it('returns the first relaxed result that restores requested class and type coverage', () => {
    const records = createSingleTypeRecords();
    const requestedInput = createInput(['DEX', 'INT'], ['Fighter']);
    const result = runAutoTeamBuildSearch(records, requestedInput);

    expect(result).not.toBeNull();
    expect(result?.requestedInput.types).toEqual(['DEX', 'INT']);
    expect(result?.input.types).toEqual(['DEX']);
    expect(result?.relaxation).toEqual({
      usedFallback: true,
      droppedTypes: ['INT'],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
      ignoredSuperTandemCriteria: false,
    });
  });

  it('does not downgrade full captain coverage to simple coverage', () => {
    const result = runAutoTeamBuildSearch(
      createSimpleCaptainCoverageFallbackRecords(),
      createInput(['DEX'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        manualSlots: createCaptainCoverageManualSlots(9020),
        lockedCharacterIds: [9020],
        captainCharacterId: 9020,
        friendCaptainCharacterId: 9020,
      }),
    );

    expect(result).toBeNull();
  });

  it('does not downgrade captain coverage when strict both-leader coverage is required', () => {
    const result = runAutoTeamBuildSearch(
      createSimpleCaptainCoverageFallbackRecords(),
      createInput(['DEX'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        requireBothLeadersFullCaptainAbilityCoverage: true,
        manualSlots: createCaptainCoverageManualSlots(9020),
        lockedCharacterIds: [9020],
        captainCharacterId: 9020,
        friendCaptainCharacterId: 9020,
      }),
    );

    expect(result).toBeNull();
  });

  it('preserves strict both-leader coverage across unrelated fallback attempts', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        requireBothLeadersFullCaptainAbilityCoverage: true,
        requireLeaderSuperSpecialCriteria: true,
        manualSlots: createCaptainCoverageManualSlots(9020),
        lockedCharacterIds: [9020],
        captainCharacterId: 9020,
        friendCaptainCharacterId: 9020,
      }),
      createSimpleCaptainCoverageFallbackRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    const attempts = collectScheduledAttempts(planner);

    expect(attempts).toContainEqual(
      expect.objectContaining({
        droppedTypes: [],
        droppedClasses: [],
        ignoredLeaderSuperSpecialCriteria: true,
      }),
    );
    expect(
      attempts.every(
        (attempt) =>
          attempt.input.requireBothLeadersFullCaptainAbilityCoverage &&
          attempt.input.requireFullCaptainAbilityCoverage &&
          !attempt.input.allowPartialCaptainAbilityCoverage,
      ),
    ).toBe(true);
  });

  it('keeps a full captain coverage team ahead of relaxed partial coverage', () => {
    const result = runAutoTeamBuildSearch(
      createFullCaptainCoverageRecords(),
      createInput(['DEX', 'PSY'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        manualSlots: createCaptainCoverageManualSlots(9000),
        lockedCharacterIds: [9000],
        captainCharacterId: 9000,
        friendCaptainCharacterId: 9000,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.input.allowPartialCaptainAbilityCoverage).toBeUndefined();
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBeUndefined();
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
  });

  it('does not return ignored partial captain coverage when strict simple coverage is impossible', () => {
    const result = runAutoTeamBuildSearch(
      createPartialCaptainCoverageRecords({ extraUncoveredSubs: true }),
      createInput(['DEX', 'PSY'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        manualSlots: createCaptainCoverageManualSlots(9000),
        lockedCharacterIds: [9000],
        captainCharacterId: 9000,
        friendCaptainCharacterId: 9000,
      }),
    );

    expect(result).toBeNull();
  });

  it('does not accept fallback coverage when requested battle requirements are still missing', () => {
    const requestedInput: AutoBuildInput = {
      ...createInput(['DEX'], ['Fighter']),
      battleRequirements: [
        {
          id: 'battle-1',
          title: 'Battle 1',
          enemyMechanics: [],
          requiredCharacterGroups: [
            {
              id: 'battle-1-group',
              abilities: [
                {
                  abilityKey: 'remove_bind',
                  minTurns: 6,
                  slotTokens: [],
                  requiredCharacterCount: 1,
                },
              ],
            },
          ],
        },
      ],
    };
    const result = {
      input: requestedInput,
      requestedInput,
      candidateCount: 0,
      slots: [],
      shipSelection: null,
      relaxation: {
        usedFallback: true,
        droppedTypes: [],
        droppedClasses: [],
        droppedCharacterTags: [],
        droppedCharacterNames: [],
        minimumLeaderSuperEffectMatchingSlots: null,
        allowedLeadersWithSuperEffects: false,
        ignoredLeaderSuperEffectScope: false,
        ignoredLeaderSuperSpecialCriteria: false,
        ignoredSuperTandemCriteria: false,
      },
      coverage: {
        leaderCriteria: {
          source: 'captainAbility',
          coverageMode: 'simpleBoostScope',
          captainLeaderId: null,
          friendCaptainLeaderId: null,
          leaderIds: [],
          leaderNames: [],
          dualLeaderMode: 'single',
          derivedAllowedClasses: [],
          derivedAllowedTypes: [],
          derivedAllowedCharacterTags: [],
          hasCostRestriction: false,
          maxAllowedCost: null,
          hasClassRestriction: false,
          hasTypeRestriction: false,
          hasCharacterTagRestriction: false,
          tagConditionSets: [],
          matchingSlots: 0,
          totalSlots: 0,
          allSlotsMatch: true,
        },
        abilityRequirements: {
          requested: [],
          matched: [],
          missing: [],
          matchesAll: true,
        },
        requiredCharacterGroups: {
          requested: [],
          matched: [],
          missing: [],
          matchesAll: true,
        },
        battleRequirements: {
          requested: requestedInput.battleRequirements!,
          matched: [],
          missing: requestedInput.battleRequirements!,
          matchesAll: false,
        },
        burst: [],
        consistency: [],
        utility: [],
        coveredSelectedClasses: [],
        coveredSelectedTypes: [],
        coveredSelectedCharacterTags: [],
        coveredSelectedCharacterNames: [],
        coversAllSelectedClasses: true,
        coversAllSelectedTypes: true,
        coversAllSelectedCharacterTags: true,
        coversAllSelectedCharacterNames: true,
        selectedClassMatches: 0,
        selectedTypeMatches: 0,
        selectedCharacterTagMatches: 0,
        selectedCharacterNameMatches: 0,
      },
    } satisfies AutoBuildResult;

    expect(satisfiesRequestedAutoTeamBuildCoverage(result)).toBe(false);
  });

  it('throws cancellation before starting the next attempt', () => {
    let cancelled = false;
    const snapshots: AutoBuildProgressSnapshot[] = [];

    expect(() =>
      runAutoTeamBuildSearch(
        createSingleTypeRecords(),
        {
          ...createInput(['DEX', 'INT'], ['Fighter']),
          requiredAbilities: [
            {
              abilityKey: 'remove_slot_barrier',
              minTurns: 3,
              slotTokens: ['DEX'],
              requiredCharacterCount: 1,
            },
          ],
        },
        {
          onProgress: (snapshot) => {
            snapshots.push(snapshot);

            if (snapshot.stage === 'exactAttempt') {
              cancelled = true;
            }
          },
          isCancelled: () => cancelled,
        },
      ),
    ).toThrowError(AutoTeamBuildCancelledError);
    expect(
      snapshots
        .filter((snapshot) => typeof snapshot.completedWorkUnits !== 'number')
        .map((snapshot) => snapshot.stage),
    ).toEqual(['preparingSearch', 'exactAttempt']);
  });

  it('does not relax required abilities during fallback attempts', () => {
    const result = runAutoTeamBuildSearch(createSingleTypeRecords(), {
      ...createInput(['DEX', 'INT'], ['Fighter']),
      requiredAbilities: [
        {
          abilityKey: 'remove_slot_barrier',
          minTurns: 3,
          slotTokens: ['DEX'],
          requiredCharacterCount: 1,
        },
      ],
    });

    expect(result).toBeNull();
  });

  it('does not schedule extra fallback work when the exact attempt succeeds', () => {
    const snapshots: AutoBuildProgressSnapshot[] = [];
    const result = runAutoTeamBuildSearch(
      createStrictMixedTeamRecords(),
      createInput(['DEX'], ['Fighter']),
      {
        onProgress: (snapshot) => snapshots.push(snapshot),
      },
    );

    expect(result).not.toBeNull();
    const stageSnapshots = snapshots.filter(
      (snapshot) => typeof snapshot.completedWorkUnits !== 'number',
    );

    expect(stageSnapshots.map((snapshot) => snapshot.stage)).toEqual([
      'preparingSearch',
      'exactAttempt',
      'completed',
    ]);
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX'], ['Fighter']),
      createStrictMixedTeamRecords(),
    );
    expect(stageSnapshots[1]).toMatchObject({
      totalAttempts: planner.getProjectedTotalAttempts(),
      attemptCountFinal: false,
    });
    expect(stageSnapshots[2]).toMatchObject({
      totalAttempts: 1,
      attemptCountFinal: true,
      completedAttempts: 1,
    });
  });

  it('prioritizes zero-drop and single-drop fallbacks before broader subset drops', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX', 'INT'], ['Fighter', 'Slasher'], {
        requireLeaderSuperSpecialCriteria: true,
      }),
      createSingleTypeRecords(),
    );

    expect(planner.getTotalAttempts()).toBe(1);
    expect(planner.isAttemptCountFinal()).toBe(false);

    planner.scheduleInitialFallbackAttempts();

    expect(planner.isAttemptCountFinal()).toBe(true);

    const attempts = collectScheduledAttempts(planner);

    expect(attempts.slice(0, 6).map((attempt) => attempt.category)).toEqual([
      'meta',
      'meta',
      'single',
      'single',
      'single',
      'single',
    ]);
    expect(attempts.some((attempt) => attempt.category === 'double')).toBe(true);
  });

  it('preserves scoped cost ranges on every fallback attempt', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX', 'INT'], ['Fighter', 'Slasher'], {
        requireLeaderSuperSpecialCriteria: true,
        leaderCostRange: { min: 20, max: 60 },
        subCostRange: { min: 10, max: 40 },
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(
      collectScheduledAttempts(planner).every((attempt) => {
        return (
          attempt.input.leaderCostRange.min === 20 &&
          attempt.input.leaderCostRange.max === 60 &&
          attempt.input.subCostRange.min === 10 &&
          attempt.input.subCostRange.max === 40
        );
      }),
    ).toBe(true);
  });

  it('preserves max total cost on every fallback attempt', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX', 'INT'], ['Fighter', 'Slasher'], {
        requireLeaderSuperSpecialCriteria: true,
        maxTotalCost: 300,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(
      collectScheduledAttempts(planner).every((attempt) => attempt.input.maxTotalCost === 300),
    ).toBe(true);
  });

  it('allows Captain plus four subs at the exact max total cost while ignoring Friend Captain cost', () => {
    const records = createBudgetRecords();
    const result = runAutoTeamBuildSearch(
      records,
      createInput(['DEX'], ['Fighter'], {
        maxTotalCost: 300,
        manualSlots: createBudgetManualSlots(),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.cost)).toEqual([100, 999, 50, 50, 50, 50]);
  });

  it('rejects manual teams above the max total cost', () => {
    const result = runAutoTeamBuildSearch(
      createBudgetRecords(),
      createInput(['DEX'], ['Fighter'], {
        maxTotalCost: 299,
        manualSlots: createBudgetManualSlots(),
      }),
    );

    expect(result).toBeNull();
  });

  it('rejects auto-filled teams above the max total cost', () => {
    const result = runAutoTeamBuildSearch(
      createSingleTypeRecords(),
      createInput(['DEX'], ['Fighter'], {
        maxTotalCost: 100,
      }),
    );

    expect(result).toBeNull();
  });

  it('caps the bounded subset plan at 31,744 total attempts for now', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX', 'STR', 'QCK', 'PSY'], createSyntheticClasses(12), {
        requireLeaderSuperSpecialCriteria: true,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(planner.getScheduledFallbackAttemptCount()).toBe(31_743);
    expect(planner.getTotalAttempts()).toBe(31_744);
    expect(planner.getTotalAttempts()).toBeGreaterThan(1024);
    expect(planner.isAttemptCountFinal()).toBe(true);
  });

  it('treats all selected types and classes as neutral when strict coverage is off', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput([...AUTO_TEAM_BUILDER_TYPES], [...AUTO_TEAM_BUILDER_CLASSES], {
        requireLeaderSuperSpecialCriteria: true,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(planner.getScheduledFallbackAttemptCount()).toBe(2);
    expect(planner.getTotalAttempts()).toBe(3);
    expect(collectScheduledAttempts(planner)).toEqual([
      expect.objectContaining({
        category: 'meta',
        droppedTypes: [],
        droppedClasses: [],
        ignoredLeaderSuperSpecialCriteria: false,
      }),
      expect.objectContaining({
        category: 'meta',
        droppedTypes: [],
        droppedClasses: [],
        ignoredLeaderSuperSpecialCriteria: true,
      }),
    ]);
  });

  it('does not relax Super Special criteria or schedule hidden super-leader fallback when strict coverage is on', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput([...AUTO_TEAM_BUILDER_TYPES], [...AUTO_TEAM_BUILDER_CLASSES], {
        requireLeaderSuperSpecialCriteria: true,
        strictSuperSpecialCriteriaCoverage: true,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(collectScheduledAttempts(planner)).toEqual([]);
  });

  it('relaxes Super Tandem criteria only when strict coverage is off', () => {
    const flexiblePlanner = createAutoTeamBuildFallbackPlanner(
      createInput([...AUTO_TEAM_BUILDER_TYPES], [...AUTO_TEAM_BUILDER_CLASSES], {
        requireSuperTandemCriteria: true,
      }),
      createSingleTypeRecords(),
    );
    const strictPlanner = createAutoTeamBuildFallbackPlanner(
      createInput([...AUTO_TEAM_BUILDER_TYPES], [...AUTO_TEAM_BUILDER_CLASSES], {
        requireSuperTandemCriteria: true,
        strictSuperTandemCriteriaCoverage: true,
      }),
      createSingleTypeRecords(),
    );

    flexiblePlanner.scheduleInitialFallbackAttempts();
    strictPlanner.scheduleInitialFallbackAttempts();

    expect(collectScheduledAttempts(flexiblePlanner)).toEqual([
      expect.objectContaining({
        category: 'meta',
        input: expect.objectContaining({ requireSuperTandemCriteria: true }),
      }),
      expect.objectContaining({
        category: 'meta',
        input: expect.objectContaining({ requireSuperTandemCriteria: false }),
      }),
    ]);
    expect(collectScheduledAttempts(strictPlanner)).toEqual([]);
  });

  it('orders single-filter drops by ascending pool support', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX', 'INT'], ['Fighter'], {
        requireLeaderSuperSpecialCriteria: true,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    const attempts = collectScheduledAttempts(planner);

    expect(attempts[0]).toMatchObject({
      droppedTypes: [],
      droppedClasses: [],
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperSpecialCriteria: false,
    });
    expect(attempts[1]).toMatchObject({
      droppedTypes: [],
      droppedClasses: [],
      allowedLeadersWithSuperEffects: true,
      ignoredLeaderSuperSpecialCriteria: true,
    });
    expect(
      attempts.slice(2, 5).map((attempt) => ({
        droppedTypes: attempt.droppedTypes,
        droppedClasses: attempt.droppedClasses,
      })),
    ).toEqual([
      {
        droppedTypes: ['INT'],
        droppedClasses: [],
      },
      {
        droppedTypes: [],
        droppedClasses: ['Fighter'],
      },
      {
        droppedTypes: ['DEX'],
        droppedClasses: [],
      },
    ]);
  });

  it('does not create type/class drop attempts when strict constraints are enabled', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX', 'INT'], ['Fighter'], {
        requireAllSelectedTypesInTeam: true,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(collectScheduledAttempts(planner)).toEqual([
      expect.objectContaining({
        droppedTypes: [],
        droppedClasses: [],
        category: 'meta',
      }),
    ]);
  });

  it('schedules relaxed character tag and name drops in fallback attempts', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX'], ['Fighter'], {
        selectedCharacterTags: ['Minks'],
        selectedCharacterNames: ['zoro'],
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    const attempts = collectScheduledAttempts(planner);

    expect(attempts.some((attempt) => attempt.droppedCharacterTags.includes('Minks'))).toBe(true);
    expect(attempts.some((attempt) => attempt.droppedCharacterNames.includes('zoro'))).toBe(true);
    expect(
      attempts.some(
        (attempt) =>
          attempt.droppedCharacterTags.includes('Minks') &&
          attempt.droppedCharacterNames.includes('zoro'),
      ),
    ).toBe(true);
  });

  it('does not create character tag/name drop attempts when strict coverage is enabled', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX'], ['Fighter'], {
        selectedCharacterTags: ['Minks'],
        selectedCharacterNames: ['zoro'],
        requireAllSelectedCharacterTagsInTeam: true,
        requireAllSelectedCharacterNamesInTeam: true,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(
      collectScheduledAttempts(planner).every(
        (attempt) =>
          attempt.droppedCharacterTags.length === 0 && attempt.droppedCharacterNames.length === 0,
      ),
    ).toBe(true);
  });
});

function collectScheduledAttempts(planner: ReturnType<typeof createAutoTeamBuildFallbackPlanner>) {
  const attempts = [];

  for (
    let attempt = planner.takeNextScheduledAttempt();
    attempt;
    attempt = planner.takeNextScheduledAttempt()
  ) {
    attempts.push(attempt);
  }

  return attempts;
}

function createSyntheticClasses(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Synthetic Class ${index + 1}`);
}

function createInput(
  types: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
  selectedClasses: string[] = ['Fighter'],
  overrides: Partial<
    Pick<
      AutoBuildInput,
      | 'requireAllSelectedTypesInTeam'
      | 'requireAllSelectedClassesPerCharacter'
      | 'selectedCharacterTags'
      | 'selectedCharacterNames'
      | 'requireAllSelectedCharacterTagsInTeam'
      | 'requireAllSelectedCharacterNamesInTeam'
      | 'requireAllSlotsInLeaderSuperEffectScope'
      | 'requireFullCaptainAbilityCoverage'
      | 'requireBothLeadersFullCaptainAbilityCoverage'
      | 'minimumLeaderSuperEffectMatchingSlots'
      | 'requireLeaderSuperSpecialCriteria'
      | 'strictSuperSpecialCriteriaCoverage'
      | 'requireSuperTandemCriteria'
      | 'strictSuperTandemCriteriaCoverage'
      | 'requireUniqueBaseCharacterNames'
      | 'favoritesOnly'
      | 'allowAnyFriendCaptainAutoFill'
      | 'favoriteShipsOnly'
      | 'favoriteShipIds'
      | 'leaderBoostFilters'
      | 'leaderBoostRanges'
      | 'costRange'
      | 'leaderCostRange'
      | 'subCostRange'
      | 'maxTotalCost'
      | 'manualSlots'
      | 'lockedCharacterIds'
      | 'excludedCharacterIds'
      | 'captainCharacterId'
      | 'friendCaptainCharacterId'
      | 'excludedShipIds'
      | 'battleRequirements'
    >
  > = {},
): AutoBuildInput {
  const lockedCharacterIds = overrides.lockedCharacterIds ?? [];
  const excludedCharacterIds = overrides.excludedCharacterIds ?? [];
  const captainCharacterId = overrides.captainCharacterId ?? null;
  const friendCaptainCharacterId = overrides.friendCaptainCharacterId ?? null;

  return {
    types,
    selectedClasses,
    selectedCharacterTags: overrides.selectedCharacterTags ?? [],
    selectedCharacterNames: overrides.selectedCharacterNames ?? [],
    requiredAbilities: [],
    requiredCharacterGroups: [],
    enemyMechanics: [],
    battleRequirements: overrides.battleRequirements ?? [],
    requireAllSelectedTypesInTeam: overrides.requireAllSelectedTypesInTeam ?? false,
    requireAllSelectedClassesPerCharacter: overrides.requireAllSelectedClassesPerCharacter ?? false,
    requireAllSelectedCharacterTagsInTeam: overrides.requireAllSelectedCharacterTagsInTeam ?? false,
    requireAllSelectedCharacterNamesInTeam:
      overrides.requireAllSelectedCharacterNamesInTeam ?? false,
    requireAllSlotsInLeaderSuperEffectScope:
      overrides.requireAllSlotsInLeaderSuperEffectScope ?? false,
    requireFullCaptainAbilityCoverage: overrides.requireFullCaptainAbilityCoverage ?? false,
    requireBothLeadersFullCaptainAbilityCoverage:
      overrides.requireBothLeadersFullCaptainAbilityCoverage ?? false,
    minimumLeaderSuperEffectMatchingSlots: overrides.requireAllSlotsInLeaderSuperEffectScope
      ? (overrides.minimumLeaderSuperEffectMatchingSlots ?? 6)
      : null,
    requireLeaderSuperSpecialCriteria: overrides.requireLeaderSuperSpecialCriteria ?? false,
    strictSuperSpecialCriteriaCoverage: overrides.strictSuperSpecialCriteriaCoverage ?? false,
    requireSuperTandemCriteria: overrides.requireSuperTandemCriteria ?? false,
    strictSuperTandemCriteriaCoverage: overrides.strictSuperTandemCriteriaCoverage ?? false,
    requireUniqueBaseCharacterNames: overrides.requireUniqueBaseCharacterNames ?? false,
    favoritesOnly: overrides.favoritesOnly ?? false,
    allowAnyFriendCaptainAutoFill: overrides.allowAnyFriendCaptainAutoFill ?? false,
    favoriteShipsOnly: overrides.favoriteShipsOnly ?? false,
    favoriteShipIds: overrides.favoriteShipIds ?? [],
    leaderBoostFilters: overrides.leaderBoostFilters ?? ['HP', 'ATK'],
    leaderBoostRanges: overrides.leaderBoostRanges ?? createEmptyAutoBuildLeaderBoostRanges(),
    costRange: overrides.costRange ?? createEmptyAutoBuildCostRange(),
    leaderCostRange:
      overrides.leaderCostRange ?? overrides.costRange ?? createEmptyAutoBuildCostRange(),
    subCostRange: overrides.subCostRange ?? overrides.costRange ?? createEmptyAutoBuildCostRange(),
    maxTotalCost: overrides.maxTotalCost ?? null,
    manualSlots: overrides.manualSlots ?? createEmptyAutoBuildManualSlots(),
    lockedCharacterIds,
    excludedCharacterIds,
    captainCharacterId,
    friendCaptainCharacterId,
    manualShipId: null,
    excludedShipIds: overrides.excludedShipIds ?? [],
    candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
  };
}

function createClock(values: number[]): () => number {
  let index = 0;
  const lastValue = values.at(-1) ?? 0;

  return () => {
    const nextValue = values[index] ?? lastValue;

    index += 1;
    return nextValue;
  };
}

function createSingleTypeRecords(): CharacterDetailRecord[] {
  return [
    createCaptainRecord(),
    createAtkSubRecord(),
    createAffinitySubRecord(),
    createUtilitySubRecord(),
    createConsistencySubRecord(),
  ];
}

function createStrictSixGroupBattleRequirements(): NonNullable<
  AutoBuildInput['battleRequirements']
> {
  return [
    {
      id: 'strict-six-groups',
      title: 'Strict six groups',
      enemyMechanics: [],
      requiredCharacterGroups: [
        createBattleGroupRequirement('bind', 'remove_bind'),
        createBattleGroupRequirement('atk-down', 'remove_atk_down'),
        createBattleGroupRequirement('threshold', 'remove_threshold_damage_reduction'),
        createBattleGroupRequirement('resilience', 'remove_resilience'),
        createBattleGroupRequirement('defense', 'remove_enemy_increased_defense'),
        createBattleGroupRequirement('special-bind', 'remove_special_bind'),
      ],
    },
  ];
}

function createBattleGroupRequirement(
  id: string,
  abilityKey: string,
): NonNullable<AutoBuildInput['battleRequirements']>[number]['requiredCharacterGroups'][number] {
  return {
    id,
    abilities: [
      {
        abilityKey,
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ],
  };
}

function createStrictBattleGroupRecords(): CharacterDetailRecord[] {
  return [
    createStrictBattleGroupRecord(9606, 'King - Unleashing Tension', 'remove_bind', {
      isLeader: true,
    }),
    createStrictBattleGroupRecord(9605, 'S-Snake & S-Hawk & S-Shark', 'remove_atk_down', {
      isLeader: true,
    }),
    createStrictBattleGroupRecord(9604, 'Thresho', 'remove_threshold_damage_reduction'),
    createStrictBattleGroupRecord(9603, 'Resilio', 'remove_resilience'),
    createStrictBattleGroupRecord(9602, 'Defendo', 'remove_enemy_increased_defense'),
    createStrictBattleGroupRecord(9601, 'Specbind', 'remove_special_bind'),
  ];
}

function createStrictBattleGroupRecord(
  id: number,
  name: string,
  abilityKey: string,
  options: { isLeader?: boolean } = {},
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name,
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    detail: {
      captainAbility: options.isLeader
        ? 'Boosts ATK of Fighter characters by 5x and HP by 1.3x.'
        : null,
      specialText: `${abilityKey} by 5 turns.`,
      partyConflictKeys: [`strict-battle-${id}`],
      builderAbilities: [
        {
          key: abilityKey,
          label: abilityKey,
          minTurns: 5,
          isCompleteRemoval: false,
          slotTokens: [],
          source: 'specialText',
        },
      ],
    },
  });
}

function createCaptainCoverageManualSlots(captainId: number) {
  return createEmptyAutoBuildManualSlots().map((slot) => ({
    role: slot.role,
    characterIds: slot.role === 'captain' || slot.role === 'friendCaptain' ? [captainId] : [],
  }));
}

function createPartialCaptainCoverageRecords(
  options: { extraUncoveredSubs?: boolean } = {},
): CharacterDetailRecord[] {
  return [
    createCaptainCoverageCaptainRecord(),
    createCaptainCoverageDexSubRecord(9001),
    createCaptainCoverageDexSubRecord(9002),
    createCaptainCoverageDexSubRecord(9003),
    createCaptainCoveragePsySubRecord(9010),
    ...(options.extraUncoveredSubs
      ? [createCaptainCoveragePsySubRecord(9011), createCaptainCoveragePsySubRecord(9012)]
      : []),
  ];
}

function createFullCaptainCoverageRecords(): CharacterDetailRecord[] {
  return [...createPartialCaptainCoverageRecords(), createCaptainCoverageDexSubRecord(9004)];
}

function createSimpleCaptainCoverageFallbackRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 9020,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        captainAbility:
          'Boosts ATK of [DEX] characters by 5x and HP by 1.3x. If HP is below 50%, boosts ATK of [PSY] characters by 6x instead.',
        specialText: 'Boosts ATK of [DEX] characters by 2.25x for 1 turn.',
      },
    }),
    createCaptainCoverageDexSubRecord(9021),
    createCaptainCoverageDexSubRecord(9022),
    createCaptainCoverageDexSubRecord(9023),
    createCaptainCoverageDexSubRecord(9024),
  ];
}

function createCaptainCoverageCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 9000,
    type: 'DEX',
    primaryClass: 'Fighter',
    detail: {
      captainAbility: 'Boosts ATK of [DEX] characters by 5x and HP by 1.3x.',
      specialText: 'Boosts ATK of [DEX] characters by 2.25x for 1 turn.',
    },
  });
}

function createCaptainCoverageDexSubRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    type: 'DEX',
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts orb effects of [DEX] characters by 2.25x for 1 turn.',
    },
  });
}

function createCaptainCoveragePsySubRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    type: 'PSY',
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Reduces Bind duration by 5 turns.',
    },
  });
}

function createBudgetRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 7000,
      cost: 100,
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 5x.',
        specialText: 'Boosts ATK of crew by 2x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 7001,
      cost: 999,
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility: 'Boosts ATK of Fighter characters by 5x.',
        specialText: 'Boosts orb effects of crew by 2x for 1 turn.',
      },
    }),
    ...[7010, 7011, 7012, 7013].map((id) =>
      createCharacterRecord({
        id,
        cost: 50,
        primaryClass: 'Fighter',
        secondaryClass: 'Slasher',
        detail: {
          specialText:
            'Boosts ATK of Fighter characters by 2x and changes crew orbs into Matching Orbs.',
        },
      }),
    ),
  ];
}

function createBudgetManualSlots() {
  return createEmptyAutoBuildManualSlots().map((slot) => ({
    role: slot.role,
    characterIds:
      slot.role === 'captain'
        ? [7000]
        : slot.role === 'friendCaptain'
          ? [7001]
          : slot.role === 'sub1'
            ? [7010]
            : slot.role === 'sub2'
              ? [7011]
              : slot.role === 'sub3'
                ? [7012]
                : slot.role === 'sub4'
                  ? [7013]
                  : [],
  }));
}

function createStrictMixedTeamRecords(): CharacterDetailRecord[] {
  return [
    createCharacterRecord({
      id: 6100,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility: 'Boosts ATK of DEX and Fighter characters by 5x and HP by 1.3x.',
        specialText: 'Boosts ATK of crew by 2x for 1 turn and removes Despair by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 6101,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        captainAbility: 'Boosts ATK of DEX and PSY characters by 4.5x.',
        specialText: 'Boosts Orb Effects of crew by 2.25x for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 6102,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Adds 0.9x color affinity for DEX characters for 1 turn.',
      },
    }),
    createCharacterRecord({
      id: 6103,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Changes EMPTY and BLOCK orbs into matching orbs for crew.',
      },
    }),
    createCharacterRecord({
      id: 6104,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Reduces damage reduction by 5 turns.',
      },
    }),
    createCharacterRecord({
      id: 6105,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
      detail: {
        specialText: 'Reduces Bind duration by 5 turns.',
      },
    }),
  ];
}

function createCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5900,
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility:
        'Boosts ATK of DEX and Fighter characters by 5.25x and HP by 1.3x, reduces Special Cooldown of crew by 1 turn.',
      specialText:
        'Boosts orb effects of DEX and Fighter characters by 2.25x for 1 turn and changes orbs into Matching Orbs.',
    },
  });
}

function createAtkSubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5890,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts ATK of Fighter characters by 2.5x for 1 turn.',
    },
  });
}

function createAffinitySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5880,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Boosts color affinity of DEX characters by 2x for 1 turn.',
    },
  });
}

function createUtilitySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5870,
    primaryClass: 'Fighter',
    detail: {
      specialText:
        'Reduces Bind and Despair duration by 5 turns and reduces Threshold Damage Reduction duration by 5 turns.',
    },
  });
}

function createConsistencySubRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5860,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Changes crew orbs into Matching Orbs and reduces Special Cooldown by 1 turn.',
    },
  });
}

function createCharacterRecord(
  overrides: Omit<Partial<CharacterDetailRecord>, 'detail'> & {
    id: number;
    detail?: Partial<CharacterDetailRecord['detail']>;
  },
): CharacterDetailRecord {
  const id = overrides.id;
  const primaryClass = overrides.primaryClass ?? 'Fighter';
  const secondaryClass = overrides.secondaryClass ?? 'Slasher';

  return {
    id,
    name: overrides.name ?? `Character ${id}`,
    isIncomplete: overrides.isIncomplete ?? false,
    type: overrides.type ?? 'DEX',
    classes: overrides.classes ?? ([primaryClass, secondaryClass].filter(Boolean) as string[]),
    primaryClass,
    secondaryClass,
    stars: overrides.stars ?? 6,
    cost: overrides.cost ?? 55,
    combo: overrides.combo ?? 4,
    captainHpBoost: overrides.captainHpBoost ?? 1.3,
    captainAtkBoost: overrides.captainAtkBoost ?? 5,
    captainAverageBoost: overrides.captainAverageBoost ?? 3.15,
    stats: overrides.stats ?? {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 4200, atk: 1800, rcv: 320 },
      growth: 2.4,
    },
    regionAvailability: overrides.regionAvailability ?? {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    assets: overrides.assets ?? {
      exactLocal: `assets/characters/${id}.png`,
      thumbnailGlobal: `assets/characters/${id}-thumb.png`,
      thumbnailJapan: null,
    },
    imageUrl: overrides.imageUrl ?? `assets/characters/${id}-thumb.png`,
    detailImageUrl: overrides.detailImageUrl ?? `assets/characters/${id}.png`,
    detail: {
      characterId: id,
      captainAbility: overrides.detail?.captainAbility ?? null,
      captainAbilityVariants: overrides.detail?.captainAbilityVariants ?? [],
      captainNotes: overrides.detail?.captainNotes ?? null,
      specialName: overrides.detail?.specialName ?? `Special ${id}`,
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

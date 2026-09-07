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
  it('records close rejected leader and sub candidates with structured reasons', () => {
    const result = runAutoTeamBuildSearch(
      [
        createPreferredCaptainRecord(),
        createCaptainRecord(),
        createAlternateCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createLowCoverageSubRecord(5850),
        createLowCoverageSubRecord(5840),
        createLowCoverageSubRecord(5830),
        createLowCoverageSubRecord(5820),
      ],
      createInput(['DEX'], ['Fighter']),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.every((slot) => slot.explanation)).toBe(true);

    const captainRejectedCandidates = result?.slots[0]?.explanation?.rejectedCandidates ?? [];
    expect(captainRejectedCandidates).toHaveLength(2);
    expect(captainRejectedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          characterId: 5900,
          reasons: expect.arrayContaining([{ code: 'alreadySelected' }]),
        }),
        expect.objectContaining({
          characterId: 5810,
          characterName: 'Alternate Captain',
          reasons: expect.arrayContaining([{ code: 'rankingTieBreak' }]),
        }),
      ]),
    );

    const rejectedSubCandidates =
      result?.slots
        .filter((slot) => slot.role === 'sub')
        .flatMap((slot) => slot.explanation?.rejectedCandidates ?? []) ?? [];
    expect(
      result?.slots.every(
        (slot) => (slot.explanation?.rejectedCandidates.length ?? 0) <= 3,
      ),
    ).toBe(true);
    expect(rejectedSubCandidates.length).toBeGreaterThan(0);
    const rejectedSubReasonCodes = rejectedSubCandidates.flatMap((candidate) =>
      candidate.reasons.map((reason) => reason.code),
    );

    expect(rejectedSubReasonCodes).toContain('alreadySelected');
    expect(rejectedSubReasonCodes).toContain('lowerCoverageContribution');
  });

  it('records required-constraint tradeoffs for rejected sub candidates', () => {
    const result = runAutoTeamBuildSearch(
      [
        createCaptainRecord(),
        createAtkSubRecord(),
        createAffinitySubRecord(),
        createUtilitySubRecord(),
        createConsistencySubRecord(),
        createLowCoverageSubRecord(5850),
        createLowCoverageSubRecord(5840),
        createLowCoverageSubRecord(5830),
      ],
      createInput(['DEX'], ['Fighter'], {
        requiredAbilities: [
          {
            abilityKey: 'remove_bind',
            minTurns: 5,
            slotTokens: [],
            requiredCharacterCount: 1,
          },
        ],
      }),
    );

    expect(result).not.toBeNull();

    const rejectedSubReasonCodes =
      result?.slots
        .filter((slot) => slot.role === 'sub')
        .flatMap((slot) => slot.explanation?.rejectedCandidates ?? [])
        .flatMap((candidate) => candidate.reasons.map((reason) => reason.code)) ?? [];

    expect(rejectedSubReasonCodes).toContain('requiredConstraint');
    expect(rejectedSubReasonCodes).toContain('lowerRequirementDemand');
  });

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
    expect(result?.slots[0]?.explanation?.fallbackReasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        'fallbackUsed',
        'fallbackDroppedTypes',
        'fallbackAllowedSuperEffectLeaders',
      ]),
    );
  });

  it('relaxes full captain coverage after exact search fails', () => {
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

    expect(result).not.toBeNull();
    expect(result?.input.allowPartialCaptainAbilityCoverage).toBe(true);
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBe(true);
    expect(result?.slots[0].character.id).toBe(9020);
    expect(result?.slots[1].character.id).toBe(9020);
  });

  it('relaxes strict both-leader captain coverage after exact search fails', () => {
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

    expect(result).not.toBeNull();
    expect(result?.input.requireBothLeadersFullCaptainAbilityCoverage).toBe(false);
    expect(result?.input.allowPartialCaptainAbilityCoverage).toBe(true);
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBe(true);
  });

  it('schedules captain coverage relaxation separately from Super Special relaxation', () => {
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

    expect(
      attempts.some(
        (attempt) =>
          attempt.droppedTypes.length === 0 &&
          attempt.droppedClasses.length === 0 &&
          attempt.ignoredLeaderSuperSpecialCriteria &&
          attempt.input.requireBothLeadersFullCaptainAbilityCoverage &&
          attempt.input.requireFullCaptainAbilityCoverage &&
          attempt.input.allowPartialCaptainAbilityCoverage !== true,
      ),
    ).toBe(true);
    expect(attempts).toContainEqual(
      expect.objectContaining({
        droppedTypes: [],
        droppedClasses: [],
        input: expect.objectContaining({
          requireBothLeadersFullCaptainAbilityCoverage: false,
          requireFullCaptainAbilityCoverage: true,
          allowPartialCaptainAbilityCoverage: true,
        }),
      }),
    );
  });

  it('keeps a full captain coverage team ahead of relaxed partial coverage', () => {
    const result = runAutoTeamBuildSearch(
      createFullCaptainCoverageRecords(),
      createInput(['DEX'], ['Fighter'], {
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

  it('returns ignored partial captain coverage when strict simple coverage is impossible', () => {
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

    expect(result).not.toBeNull();
    expect(result?.input.allowPartialCaptainAbilityCoverage).toBe(true);
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBe(true);
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
          leaderBranchSelections: [],
          dualLeaderMode: 'single',
          derivedAllowedClasses: [],
          derivedAllowedTypes: [],
          derivedAllowedCharacterTags: [],
          dominantTypeRequirements: [],
          hasCostRestriction: false,
          maxAllowedCost: null,
          hasClassRestriction: false,
          hasTypeRestriction: false,
          hasCharacterTagRestriction: false,
          requiresDominantType: false,
          tagConditionSets: [],
          matchingSlots: 0,
          totalSlots: 0,
          allSlotsMatch: true,
          leaderTierCoverages: [],
          allLeaderTiersCovered: true,
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

  it('relaxes strict selected type coverage after exact search fails', () => {
    const result = runAutoTeamBuildSearch(
      createSingleTypeRecords(),
      createInput(['DEX', 'INT'], ['Fighter'], {
        requireAllSelectedTypesInTeam: true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.relaxation.droppedTypes).toContain('INT');
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
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

  it('allows manual teams above deprecated max total cost', () => {
    const result = runAutoTeamBuildSearch(
      createBudgetRecords(),
      createInput(['DEX'], ['Fighter'], {
        maxTotalCost: 299,
        manualSlots: createBudgetManualSlots(),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots.map((slot) => slot.character.cost)).toEqual([100, 999, 50, 50, 50, 50]);
  });

  it('allows auto-filled teams above deprecated max total cost', () => {
    const result = runAutoTeamBuildSearch(
      createSingleTypeRecords(),
      createInput(['DEX'], ['Fighter'], {
        maxTotalCost: 100,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots).toHaveLength(6);
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

  it('relaxes Super Special criteria as a zero-drop fallback when strict coverage is on', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput([...AUTO_TEAM_BUILDER_TYPES], [...AUTO_TEAM_BUILDER_CLASSES], {
        requireLeaderSuperSpecialCriteria: true,
        strictSuperSpecialCriteriaCoverage: true,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(collectScheduledAttempts(planner)).toEqual([
      expect.objectContaining({
        category: 'meta',
        droppedTypes: [],
        droppedClasses: [],
        ignoredLeaderSuperSpecialCriteria: true,
        input: expect.objectContaining({
          requireLeaderSuperSpecialCriteria: false,
          strictSuperSpecialCriteriaCoverage: true,
        }),
      }),
    ]);
  });

  it('relaxes Super Tandem criteria as a zero-drop fallback when strict coverage is on', () => {
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
    expect(collectScheduledAttempts(strictPlanner)).toEqual([
      expect.objectContaining({
        category: 'meta',
        droppedTypes: [],
        droppedClasses: [],
        input: expect.objectContaining({
          requireSuperTandemCriteria: false,
          strictSuperTandemCriteriaCoverage: true,
        }),
      }),
    ]);
  });

  it('relaxes Leader Super Type/Class scope as a zero-drop fallback', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        minimumLeaderSuperEffectMatchingSlots: 6,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    expect(collectScheduledAttempts(planner)).toContainEqual(
      expect.objectContaining({
        droppedTypes: [],
        droppedClasses: [],
        ignoredLeaderSuperEffectScope: true,
        input: expect.objectContaining({
          requireAllSlotsInLeaderSuperEffectScope: false,
          minimumLeaderSuperEffectMatchingSlots: null,
        }),
      }),
    );
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

  it('creates type/class drop attempts when strict constraints block exact search', () => {
    const planner = createAutoTeamBuildFallbackPlanner(
      createInput(['DEX', 'INT'], ['Fighter'], {
        requireAllSelectedTypesInTeam: true,
      }),
      createSingleTypeRecords(),
    );

    planner.scheduleInitialFallbackAttempts();

    const attempts = collectScheduledAttempts(planner);

    expect(attempts).toContainEqual(
      expect.objectContaining({
        droppedTypes: [],
        droppedClasses: [],
        category: 'meta',
      }),
    );
    expect(attempts.some((attempt) => attempt.droppedTypes.includes('INT'))).toBe(true);
    expect(attempts.some((attempt) => attempt.droppedClasses.includes('Fighter'))).toBe(true);
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

  it('creates character tag/name drop attempts when strict coverage blocks exact search', () => {
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
});

// Lane D filter interaction matrix, Tier 1. See
// optc-team-builder-brain/.codex/skills/optc-auto-team-builder-audit/references/filter-interaction-matrix.md
// and the coverage ledger at optc-team-builder-brain/audits/auto-team-builder/matrix-coverage.md.
describe('Lane D matrix - Tier 1 pairs', () => {
  // 5x7 - leader boost ranges (axis 5) against captain ability coverage (axis 7).
  //
  // These leaders must AUTO-FILL. `candidateMatchesLeaderConstraints(candidate, false)` is used
  // for the manual candidate pool, so a manually pinned leader skips
  // `candidateMatchesLeaderBoostRanges` entirely. Every other captain-coverage case in this file
  // pins its leader through `createCaptainCoverageManualSlots`, which is why axis 5 has never
  // been exercised alongside axis 7 - pinning the leader here would silently disable axis 5.
  it('keeps the leader boost range while relaxing captain ability coverage (5x7)', () => {
    const result = runAutoTeamBuildSearch(
      createLeaderBoostRangeCoverageRecords(),
      createInput(['DEX'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        leaderBoostRanges: {
          ATK: { min: 5, max: null },
          HP: { min: null, max: null },
        },
      }),
    );

    // Invariant 3 - relaxation honesty: coverage was the constraint given up, and it is reported.
    expect(result).not.toBeNull();
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBe(true);

    // Invariant 1 - soundness: axis 5 was never relaxed, so the out-of-range leader stays out
    // even though it is the only one that would have satisfied axis 7.
    expect(result?.slots[0].character.captainAtkBoost).toBeGreaterThanOrEqual(5);
    expect(result?.slots[0].character.id).toBe(9030);
    expect(result?.slots.every((slot) => slot.character.id !== 9031)).toBe(true);
  });

  it('returns the covering leader when the boost range admits it (5x7 control)', () => {
    // The same fixtures with axis 5 opened up: the covering leader wins and nothing is relaxed.
    // Without this control the case above proves only that 9031 is absent, not that axis 5 is
    // what excluded it.
    const result = runAutoTeamBuildSearch(
      createLeaderBoostRangeCoverageRecords(),
      createInput(['DEX'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0].character.id).toBe(9031);
    // `ignoredCaptainAbilityCoverage` is spread into `relaxation` only when it is true, so the
    // not-relaxed assertion is absence plus `usedFallback`, never `toBe(false)`.
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBeUndefined();
    expect(result?.relaxation.usedFallback).toBe(false);
  });

  // 6x7 - leader super-effect scope (axis 6) against captain ability coverage (axis 7).
  // Both are leader-side and both are relaxation-eligible. The pair's question is invariant 3:
  // when neither can be satisfied, are BOTH give-ups reported, or is one relaxed and the other
  // dropped silently?
  //
  // Axis 6 only binds when a leader actually carries a super effect - `resolveActiveLeaderSuperEffectScope`
  // returns `hasSuperEffects: false` for a leader with no `superType`, and the constraint is then
  // trivially satisfied. The fixture below scopes the two axes orthogonally: axis 6 by TYPE
  // (superType DEX) and axis 7 by CLASS (captain ability scoped to [Fighter]), so each sub is
  // independently in or out of each axis.
  it('reports the super-effect-scope and captain-coverage relaxations independently (6x7)', () => {
    const result = runAutoTeamBuildSearch(
      createSuperScopeCoverageRecords(),
      createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        requireFullCaptainAbilityCoverage: true,
        requireAllSlotsInLeaderSuperEffectScope: true,
        manualSlots: createCaptainCoverageManualSlots(9040),
        lockedCharacterIds: [9040],
        captainCharacterId: 9040,
        friendCaptainCharacterId: 9040,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.relaxation.usedFallback).toBe(true);
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBe(true);
    expect(result?.relaxation.ignoredLeaderSuperEffectScope).toBe(true);
  });

  // Lane D Tier 2, invariant 3 in the over-reporting direction. `buildBaseSubsetInput` turns
  // every relaxable leader constraint off on EVERY subset attempt whenever it is allowed to,
  // so a plain filter drop used to be reported as also conceding the leader constraints - on a
  // team that satisfied them. Measured before the fix: identical team in both runs, yet
  // `ignoredLeaderSuperEffectScope` flipped to true purely because a type was dropped.
  // The same over-reporting shape for axes 9 and 10. These need a fixture with NO criteria
  // carriers at all: the constraint is then trivially satisfiable, the subset planner is still
  // allowed to switch it off, and reporting from that permission would claim a Super Special or
  // Super Tandem requirement had been given up when there was nothing to give up. Written
  // separately from the Tier 2 pair table on purpose - in that table the criteria genuinely are
  // violated, so permission and outcome agree there and the mutation is invisible.
  // Axis 7's half of the same shape. The Tier 2 fixture's subs are PSY but Fighter, so the
  // [Fighter] captain covers all of them and full coverage genuinely holds - while dropping a
  // type still sends the search down the subset lane, where the planner is allowed to concede
  // coverage. Reporting from that permission would claim coverage was given up on a team that
  // has it. The Tier 2 pair table cannot catch this: there axis 7 uses the uncovered-subs
  // fixture, so permission and outcome agree and the mutation is invisible.
  // Gap G from run 2: the `sourceScope` gate in auto-team-builder-ability-match.utils.ts could
  // be deleted without failing a single test in the repository. It stayed uncovered because the
  // only value the normalizer accepts is `'captainAbility'` - anything else, including
  // `'specialText'`, normalizes to null and filters nothing - and that one value ALSO makes the
  // requirement leader-scoped via `isLeaderScopedAbilityRequirement`. So every earlier attempt
  // was really exercising the slot-scope branch, which masked the source check entirely.
  //
  // The isolation is to put the ability on a LEADER but from the wrong source. Leader scoping is
  // then satisfied either way, and the source check is the only thing left that can reject it.
  // The open question carried since Lane D run 1, now answered.
  //
  // The discriminator is the CAPTAIN'S CLASS SCOPE, not the leader count. With a captain
  // scoping [Fighter], a team needs four Fighter subs; three Fighter plus three Slasher returns
  // null, six Fighter builds. A bisect over leader count, sub count and superType moved the
  // boundary not at all. The old "a second leader fixes it" reading was a coincidence - that
  // leader was also Fighter, so it was simply a fifth covered record.
  //
  // The mechanism is captain coverage, enforced at THREE independent points, which is why it
  // resisted three separate mutations. Disabling any one or two changes nothing, because the
  // remaining one still excludes; only disabling all three lets Slasher subs into a team:
  //   1. `matchesLeaderBuildScopeForAttempt` - reduces to a coverage check because
  //      `allowPartialCaptainAbilityCoverage` defaults to false;
  //   2. the pool-construction `leaderScope` filter, itself a five-way `||` whose other
  //      disjuncts exclude the same candidates;
  //   3. `allSubSlotsMatchLeaderBuildScope`, the team-level check, which calls the direct
  //      helper rather than the wrapper and so survives mutations aimed at (1).
  //
  // The methodological point, recorded in the ledger: a single mutation cannot falsify a
  // redundantly-enforced rule. Failing to kill with one mutation is not evidence of absence.
  //
  // This stays a characterisation test rather than a guard for exactly that reason - no single
  // gate's removal makes it fail. It fails if the boundary moves, which is the useful property.
  it('needs four captain-covered subs to fill a team (run 1 open question, characterised)', () => {
    const withCoveredSubs = (coveredSubCount: number) =>
      runAutoTeamBuildSearch(
        createCoverageFloorRecords(coveredSubCount),
        createInput(['DEX'], ['Fighter', 'Slasher'], {}),
      );

    expect(withCoveredSubs(4)).not.toBeNull();
    expect(withCoveredSubs(3)).toBeNull();
  });

  it('rejects a captainAbility-scoped requirement met only from special text (gap G)', () => {
    const result = runAutoTeamBuildSearch(
      createSourceScopedAbilityRecords('specialText'),
      createInput(['DEX'], ['Fighter'], {
        requiredAbilities: [
          {
            abilityKey: GAP_G_ABILITY_KEY,
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
            sourceScope: 'captainAbility',
          },
        ],
      } as never),
    );

    // The leader holds the ability, and a leader-scoped requirement may be met from a leader
    // seat - but the ability comes from special text, so the source scope must reject it.
    expect(result).toBeNull();
  });

  it('accepts the same requirement when the leader holds it from its captain ability (gap G control)', () => {
    const result = runAutoTeamBuildSearch(
      createSourceScopedAbilityRecords('captainAbility'),
      createInput(['DEX'], ['Fighter'], {
        requiredAbilities: [
          {
            abilityKey: GAP_G_ABILITY_KEY,
            minTurns: null,
            slotTokens: [],
            requiredCharacterCount: 1,
            sourceScope: 'captainAbility',
          },
        ],
      } as never),
    );

    // Identical fixture and identical requirement; only the ability's `source` differs. Without
    // this control the null above would prove only that the fixture cannot build.
    expect(result).not.toBeNull();
    expect(result?.coverage.abilityRequirements.matchesAll).toBe(true);
    // A leader seat carries it - which leader is not the point, and both records hold the
    // ability, so the search is free to fill both seats from either one.
    expect(
      result?.slots
        .filter((slot) => slot.role === 'captain' || slot.role === 'friendCaptain')
        .every((slot) => [9500, 9501].includes(slot.character.id)),
    ).toBe(true);
  });

  it('does not report a captain-coverage relaxation the team did not need (Tier 2)', () => {
    const result = runAutoTeamBuildSearch(
      createTier2Records(),
      createInput(['DEX', 'PSY', 'INT'], ['Fighter'], {
        requireFullCaptainAbilityCoverage: true,
        requireAllSelectedTypesInTeam: true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.relaxation.droppedTypes).toEqual(['INT']);
    expect(result?.relaxation.usedFallback).toBe(true);
    // The team fully satisfies the coverage that was requested...
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(result?.coverage.leaderCriteria.allLeaderTiersCovered).toBe(true);
    // ...so neither coverage flag may appear. Optional flags are absent, never false.
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBeUndefined();
    expect(result?.relaxation.downgradedCaptainAbilityCoverageToSimple).toBeUndefined();
  });

  it('does not report criteria relaxations when the fixture has no carriers (Tier 2)', () => {
    const result = runAutoTeamBuildSearch(
      createInScopeSuperEffectRecords(),
      createInput(['DEX', 'INT'], ['Fighter'], {
        requireAllSelectedTypesInTeam: true,
        requireLeaderSuperSpecialCriteria: true,
        requireSuperTandemCriteria: true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.relaxation.droppedTypes).toEqual(['INT']);
    expect(result?.relaxation.usedFallback).toBe(true);
    // No record carries either kind of criteria, so nothing was conceded.
    expect(result?.relaxation.ignoredLeaderSuperSpecialCriteria).toBe(false);
    expect(result?.relaxation.ignoredSuperTandemCriteria).toBe(false);
  });

  it('does not report a leader-scope relaxation when only a filter was dropped (Tier 2)', () => {
    const baseline = runAutoTeamBuildSearch(
      createInScopeSuperEffectRecords(),
      createInput(['DEX'], ['Fighter'], { requireAllSlotsInLeaderSuperEffectScope: true }),
    );
    const withDroppedType = runAutoTeamBuildSearch(
      createInScopeSuperEffectRecords(),
      createInput(['DEX', 'INT'], ['Fighter'], {
        requireAllSlotsInLeaderSuperEffectScope: true,
        requireAllSelectedTypesInTeam: true,
      }),
    );

    expect(baseline).not.toBeNull();
    expect(withDroppedType).not.toBeNull();

    // The dropped type is reported, and it is the only thing given up.
    expect(withDroppedType?.relaxation.droppedTypes).toEqual(['INT']);
    expect(withDroppedType?.relaxation.usedFallback).toBe(true);

    // Same team as the un-dropped run, and every slot is still inside the leader's DEX super
    // scope - so claiming the scope was ignored would be a false report.
    expect(withDroppedType?.slots.map((slot) => slot.character.id)).toEqual(
      baseline?.slots.map((slot) => slot.character.id),
    );
    expect(withDroppedType?.slots.every((slot) => slot.character.type === 'DEX')).toBe(true);
    expect(withDroppedType?.relaxation.ignoredLeaderSuperEffectScope).toBe(false);
  });

  it('does not report a super-effect-scope relaxation when only coverage was required (6x7 control)', () => {
    // Differential control: same fixture, axis 6 off. Coverage is relaxed and reported while the
    // super-effect-scope flag stays false - that is what proves the two flags in the case above
    // are independent rather than one implying the other.
    //
    // The mirror control (axis 6 on, axis 7 off) is deliberately absent: on this fixture it
    // returns null, and an unexplained null proves nothing. That null is recorded as an open
    // question in optc-team-builder-brain/audits/auto-team-builder/matrix-coverage.md rather
    // than asserted here as though it were intended behaviour.
    const result = runAutoTeamBuildSearch(
      createSuperScopeCoverageRecords(),
      createInput(['DEX', 'PSY'], ['Fighter', 'Slasher'], {
        requireFullCaptainAbilityCoverage: true,
        manualSlots: createCaptainCoverageManualSlots(9040),
        lockedCharacterIds: [9040],
        captainCharacterId: 9040,
        friendCaptainCharacterId: 9040,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBe(true);
    expect(result?.relaxation.ignoredLeaderSuperEffectScope).toBe(false);
  });

  // 7x8x19 - captain ability coverage (axis 7) x captain branch mode (axis 8) x manual slots
  // (axis 19). Trap 7 in the matrix, and the promoted triple in the coverage ledger.
  //
  // Branch mode lives at `manualSlots[].branchSelections[].mode`, so axis 8 is unreachable without
  // axis 19 - that is what makes this a triple rather than a pair. `resolveManualLeaderBranchMode`
  // reads the mode off the leader's own manual slot and `matchesActiveLeaderCriteria` hands it to
  // `resolveCaptainCoverage`, where `'both'` suppresses the VS alternative-branch merge (the
  // `options.branchMode !== 'both'` guard) and falls through to `mergeCaptainCoverageBranchResults`,
  // whose `matches` is an `every`. So `'both'` means a slot must be covered by BOTH branches, while
  // an unset mode on a VS captain means EITHER branch is enough - which is exactly the difference
  // these cases measure.
  //
  // The fixture keeps the two branches orthogonal by scope: branch 1 boosts [INT], Slasher and Free
  // Spirit; branch 2 boosts [STR], Driven and Cerebral. Every sub is therefore independently inside
  // or outside each branch. 'Free Spirit' is deliberately NOT in the selected classes: the
  // three-sub variant below drops the only Free Spirit record, and leaving the class selected made
  // the search report a `droppedClasses: ['Free Spirit']` relaxation that had nothing to do with
  // axis 8.
  it('evaluates captain ability coverage against branch mode both (7x8x19)', () => {
    const result = runAutoTeamBuildSearch(
      createVsBranchModeCoverageRecords(),
      createInput(VS_BRANCH_MODE_TYPES, VS_BRANCH_MODE_CLASSES, {
        requireFullCaptainAbilityCoverage: true,
        manualSlots: createVsBranchModeManualSlots(9100, 'both'),
        lockedCharacterIds: [9100],
        captainCharacterId: 9100,
        friendCaptainCharacterId: 9100,
      }),
    );

    expect(result).not.toBeNull();

    // Axis 8 actually reached the search: the branch came from the manual slot, not from
    // `resolveAutomaticCaptainBranchMode`. Without this the rest could pass on an auto branch.
    expect(result?.slots[0]?.captainBranchSelection).toMatchObject({
      mode: 'both',
      source: 'manual',
    });
    expect(result?.slots[1]?.captainBranchSelection).toMatchObject({
      mode: 'both',
      source: 'manual',
    });

    // Invariant 1 - soundness: nothing was relaxed, so every slot has to satisfy the coverage that
    // 'both' actually demands - covered by branch 1 AND branch 2. The branch-1-only subs (9105,
    // 9106) and the uncovered filler (9107) must therefore be absent.
    expect(result?.relaxation.usedFallback).toBe(false);
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBeUndefined();
    expect(result?.input.allowPartialCaptainAbilityCoverage).toBeUndefined();
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(
      result?.slots
        .slice(2)
        .map((slot) => slot.character.id)
        .sort((left, right) => left - right),
    ).toEqual([9101, 9102, 9103, 9104]);
  });

  it('admits a single-branch sub once branch mode picks one branch (7x8x19 control)', () => {
    // Same records, same coverage flag - only the branch mode changes. 9105 and 9106 are covered by
    // branch 1 and by nothing in branch 2, so their appearance here is what proves that 'both' (and
    // not the type/class selection, the pool, or the pin) is what excluded them above.
    const result = runAutoTeamBuildSearch(
      createVsBranchModeCoverageRecords(),
      createInput(VS_BRANCH_MODE_TYPES, VS_BRANCH_MODE_CLASSES, {
        requireFullCaptainAbilityCoverage: true,
        manualSlots: createVsBranchModeManualSlots(9100, 'character1'),
        lockedCharacterIds: [9100],
        captainCharacterId: 9100,
        friendCaptainCharacterId: 9100,
      }),
    );

    const subIds = result?.slots.slice(2).map((slot) => slot.character.id) ?? [];

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.captainBranchSelection).toMatchObject({
      mode: 'character1',
      source: 'manual',
    });
    expect(result?.relaxation.usedFallback).toBe(false);
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBeUndefined();
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
    expect(subIds).toEqual(expect.arrayContaining([9105, 9106]));
  });

  it('reports the coverage relaxation when branch mode both cannot be satisfied (7x8x19)', () => {
    // One both-branch sub short of a legal strict team. Invariant 3 - relaxation honesty: coverage
    // is the thing given up, and it is reported rather than quietly dropped, while no unrelated
    // axis is relaxed to get there.
    const result = runAutoTeamBuildSearch(
      createVsBranchModeCoverageRecords({ bothBranchSubCount: 3 }),
      createInput(VS_BRANCH_MODE_TYPES, VS_BRANCH_MODE_CLASSES, {
        requireFullCaptainAbilityCoverage: true,
        manualSlots: createVsBranchModeManualSlots(9100, 'both'),
        lockedCharacterIds: [9100],
        captainCharacterId: 9100,
        friendCaptainCharacterId: 9100,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.slots[0]?.captainBranchSelection).toMatchObject({
      mode: 'both',
      source: 'manual',
    });
    expect(result?.relaxation.usedFallback).toBe(true);
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBe(true);
    expect(result?.input.allowPartialCaptainAbilityCoverage).toBe(true);
    expect(result?.relaxation.droppedTypes).toEqual([]);
    expect(result?.relaxation.droppedClasses).toEqual([]);

    // The relaxed team really is short of coverage - 5 of 6 slots - and the slot it had to take is
    // the one no branch covers.
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(false);
    expect(result?.coverage.leaderCriteria.matchingSlots).toBe(5);
    expect(result?.slots.some((slot) => slot.character.id === 9107)).toBe(true);
  });

  it('does not relax coverage on the same thin pool under branch mode character1 (7x8x19 control)', () => {
    // The differential for the case above: identical records, identical flags, only the mode moves
    // from 'both' to 'character1'. It builds strictly, so the relaxation above was caused by axis 8
    // and not by the smaller pool.
    const result = runAutoTeamBuildSearch(
      createVsBranchModeCoverageRecords({ bothBranchSubCount: 3 }),
      createInput(VS_BRANCH_MODE_TYPES, VS_BRANCH_MODE_CLASSES, {
        requireFullCaptainAbilityCoverage: true,
        manualSlots: createVsBranchModeManualSlots(9100, 'character1'),
        lockedCharacterIds: [9100],
        captainCharacterId: 9100,
        friendCaptainCharacterId: 9100,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.relaxation.usedFallback).toBe(false);
    expect(result?.relaxation.ignoredCaptainAbilityCoverage).toBeUndefined();
    expect(result?.input.allowPartialCaptainAbilityCoverage).toBeUndefined();
    expect(result?.coverage.leaderCriteria.allSlotsMatch).toBe(true);
  });
});

function createSuperScopeCoverageRecords(): CharacterDetailRecord[] {
  return [
    // Leader: super effect scopes the team to DEX (axis 6); captain ability scopes [Fighter] (axis 7).
    createSuperScopeCoverageLeaderRecord(9040),
    // A second eligible leader is required, not decorative: with only one leader-eligible record
    // in the pool this fixture returns null even with no constraints at all and with the same
    // character pinned to both leader seats. Measured 2026-09-07 - see the open question in
    // optc-team-builder-brain/audits/auto-team-builder/matrix-coverage.md.
    createSuperScopeCoverageLeaderRecord(9047),
    // Six subs, so an unconstrained search can fill the four sub slots comfortably. Only two are
    // DEX and only two are Fighter, so axis 6 (all slots in the DEX super scope) and axis 7 (all
    // slots covered by a [Fighter] captain) are each individually unsatisfiable - which is what
    // forces both relaxations without either axis depending on the other.
    createSuperScopeCoverageSubRecord(9041, 'DEX', 'Fighter'), // in scope, covered
    createSuperScopeCoverageSubRecord(9042, 'DEX', 'Slasher'), // in scope, not covered
    createSuperScopeCoverageSubRecord(9043, 'PSY', 'Fighter'), // out of scope, covered
    createSuperScopeCoverageSubRecord(9044, 'PSY', 'Slasher'), // out of both
    createSuperScopeCoverageSubRecord(9045, 'PSY', 'Slasher'), // out of both
    createSuperScopeCoverageSubRecord(9046, 'PSY', 'Slasher'), // out of both
  ];
}

// Every record is DEX and the leaders scope DEX, so the super-effect scope is satisfiable and
// stays satisfied even when an unrelated filter is dropped. Two leader-eligible records because
// one is not enough for this shape to build - see the ledger's open question.
/**
 * One leader whose captain ability scopes [Fighter], `coveredSubCount` Fighter subs it covers,
 * and Slasher subs it does not. Total record count is held constant so the only variable is how
 * many of them the captain covers.
 */
function createCoverageFloorRecords(coveredSubCount: number): CharacterDetailRecord[] {
  const plainSub = (id: number, primaryClass: string): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'DEX',
      primaryClass,
      secondaryClass: null,
      detail: { specialText: 'Boosts ATK by 2x for 1 turn.' },
    });

  return [
    createCharacterRecord({
      id: 9900,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: null,
      detail: {
        captainAbility: 'Boosts ATK of [Fighter] characters by 5x and HP by 1.3x.',
        specialText: 'Boosts ATK of [Fighter] characters by 2.25x for 1 turn.',
      },
    }),
    ...Array.from({ length: coveredSubCount }, (_, index) => plainSub(9910 + index, 'Fighter')),
    ...Array.from({ length: 6 - coveredSubCount }, (_, index) =>
      plainSub(9950 + index, 'Slasher'),
    ),
  ];
}

const GAP_G_ABILITY_KEY = 'remove_paralysis';

/**
 * A leader that carries `GAP_G_ABILITY_KEY` from the given source, plus plain subs that carry
 * it from nowhere. Only the leader's ability `source` changes between the two variants, so a
 * difference in outcome can only come from the source-scope check.
 */
function createSourceScopedAbilityRecords(
  source: 'specialText' | 'captainAbility',
): CharacterDetailRecord[] {
  const leader = (id: number): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 5x and HP by 1.3x.',
        specialText: 'Reduces Paralysis duration by 5 turns.',
        builderAbilities: [
          {
            key: GAP_G_ABILITY_KEY,
            label: GAP_G_ABILITY_KEY,
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source,
          },
        ],
      },
    });
  const sub = (id: number): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: { specialText: 'Boosts orb effects of [DEX] characters by 2.25x for 1 turn.' },
    });

  return [leader(9500), leader(9501), sub(9502), sub(9503), sub(9504), sub(9505), sub(9506)];
}

function createInScopeSuperEffectRecords(): CharacterDetailRecord[] {
  const leader = (id: number): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 5x and HP by 1.3x.',
        specialText: 'Boosts orb effects of [DEX] characters by 2.25x for 1 turn.',
        superType: { specialEffect: 'Changes DEX characters to Super DEX.' },
      },
    });
  const sub = (id: number): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'DEX',
      primaryClass: 'Fighter',
      detail: { specialText: 'Boosts orb effects of [DEX] characters by 2.25x for 1 turn.' },
    });

  return [leader(9200), leader(9201), sub(9202), sub(9203), sub(9204), sub(9205), sub(9206)];
}

function createSuperScopeCoverageLeaderRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    type: 'DEX',
    primaryClass: 'Fighter',
    detail: {
      captainAbility: 'Boosts ATK of [Fighter] characters by 5x and HP by 1.3x.',
      specialText: 'Boosts ATK of [Fighter] characters by 2.25x for 1 turn.',
      superType: { specialEffect: 'Changes DEX characters to Super DEX.' },
    },
  });
}

function createSuperScopeCoverageSubRecord(
  id: number,
  type: string,
  primaryClass: string,
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    type,
    primaryClass,
    detail: { specialText: 'Boosts orb effects of [DEX] characters by 2.25x for 1 turn.' },
  });
}

function createLeaderBoostRangeCoverageRecords(): CharacterDetailRecord[] {
  return [
    // In the ATK range, but its captain ability scopes [PSY] so it covers none of the DEX subs.
    createCharacterRecord({
      id: 9030,
      type: 'DEX',
      primaryClass: 'Fighter',
      captainAtkBoost: 5.5,
      captainHpBoost: 1.3,
      detail: {
        captainAbility: 'Boosts ATK of [PSY] characters by 5.5x and HP of [PSY] characters by 1.3x.',
      },
    }),
    // Covers every DEX sub, but its ATK boost sits below the range floor.
    createCharacterRecord({
      id: 9031,
      type: 'DEX',
      primaryClass: 'Fighter',
      captainAtkBoost: 4.25,
      captainHpBoost: 1.3,
      detail: {
        captainAbility: 'Boosts ATK of [DEX] characters by 4.25x and HP of [DEX] characters by 1.3x.',
      },
    }),
    createCaptainCoverageDexSubRecord(9032),
    createCaptainCoverageDexSubRecord(9033),
    createCaptainCoverageDexSubRecord(9034),
    createCaptainCoverageDexSubRecord(9035),
  ];
}

// 7x8x19 fixture - a VS-style dual-branch leader plus subs that sit inside branch 1 only, inside
// both branches, or inside neither.
//
// The two branch texts are ported from the service spec's `createVsEitherBranchLeaderRecords`
// (auto-team-builder.service.spec.ts:39556); spec helpers are module-local, so they cannot be
// imported. The "VS Gauge" wording in both texts is load-bearing, not decoration:
// `shouldUseAlternativeCaptainCoverageBranches` looks for /\bvs\b/i across the name and the branch
// texts, and only a VS captain merges its branches as ALTERNATIVES. On a non-VS dual leader an
// unset branch mode already behaves like 'both', so the controls below would prove nothing.
const VS_BRANCH_MODE_CHARACTER1_TEXT =
  'Reduces Switch Effect of all characters by 3 and reduces VS Gauge of all characters by 6 at the start of the fight, changes all orbs into [TND] orbs at the start of the fight, boosts ATK of [INT], Slasher and Free Spirit characters by 5.5x, by 6x instead after the 3rd PERFECTs in a row, boosts ATK of all other characters by 3.5x, boosts HP of [INT], Slasher and Free Spirit characters by 1.35x, and makes [INT] and [TND] orbs beneficial for all characters.';
const VS_BRANCH_MODE_CHARACTER2_TEXT =
  'Reduces Switch Effect of all characters by 3 and reduces VS Gauge of all characters by 6 at the start of the fight, changes all orbs into [RCV] orbs at the start of the fight, boosts ATK of [STR], Driven and Cerebral characters by 5.5x, by 6x instead after the 3rd PERFECTs in a row, boosts ATK of all other characters by 3.5x, boosts HP of [STR], Driven and Cerebral characters by 1.35x, and makes [STR] and [RCV] orbs beneficial for all characters.';

const VS_BRANCH_MODE_TYPES: AutoTeamBuilderType[] = ['DEX', 'QCK', 'PSY', 'STR', 'INT'];
// 'Free Spirit' is deliberately absent - see the comment on the first 7x8x19 case.
const VS_BRANCH_MODE_CLASSES = ['Cerebral', 'Driven', 'Powerhouse', 'Shooter', 'Slasher'];

function createVsBranchModeCoverageRecords(
  options: { bothBranchSubCount?: number } = {},
): CharacterDetailRecord[] {
  const bothBranchSubs = [
    createVsBranchModeSubRecord(9101, 'INT', 'Driven', 'Shooter'), // branch 1 via [INT], branch 2 via Driven
    createVsBranchModeSubRecord(9102, 'STR', 'Slasher', 'Shooter'), // branch 1 via Slasher, branch 2 via [STR]
    createVsBranchModeSubRecord(9103, 'INT', 'Cerebral', 'Powerhouse'), // branch 1 via [INT], branch 2 via Cerebral
    createVsBranchModeSubRecord(9104, 'STR', 'Free Spirit', 'Shooter'), // branch 1 via Free Spirit, branch 2 via [STR]
  ].slice(0, options.bothBranchSubCount ?? 4);

  return [
    // One leader-eligible record is enough here, unlike `createSuperScopeCoverageRecords` - measured
    // 2026-09-07, all four cases build. The difference is that this leader is pinned into both
    // leader seats by the manual slots, which is also the only way axis 8 can be expressed.
    createVsBranchModeLeaderRecord(9100),
    ...bothBranchSubs,
    // Branch 1 only: [INT] is in branch 1's scope, and neither Shooter nor Powerhouse is in branch
    // 2's [STR]/Driven/Cerebral. Two of them, so a 'character1' search can fill four sub slots even
    // when only three both-branch subs exist.
    createVsBranchModeSubRecord(9105, 'INT', 'Shooter', 'Powerhouse'),
    createVsBranchModeSubRecord(9106, 'INT', 'Shooter', 'Powerhouse'),
    // Covered by neither branch - the filler a relaxed team is forced to take.
    createVsBranchModeSubRecord(9107, 'QCK', 'Shooter', 'Powerhouse'),
  ];
}

function createVsBranchModeLeaderRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    name: 'Zoro VS Lucci - Battling Swords and Hand Pistols',
    type: 'INT,STR',
    primaryClass: 'Slasher',
    secondaryClass: 'Driven',
    detail: {
      captainAbility: VS_BRANCH_MODE_CHARACTER1_TEXT,
      captainAbilityVariants: [
        {
          key: 'character1',
          label: 'Captain Ability (Character 1)',
          text: VS_BRANCH_MODE_CHARACTER1_TEXT,
        },
        {
          key: 'character2',
          label: 'Captain Ability (Character 2)',
          text: VS_BRANCH_MODE_CHARACTER2_TEXT,
        },
      ],
      specialText: "Reduces enemies' Increased Defense and Threshold Damage Reduction by 7 turns.",
    },
  });
}

function createVsBranchModeSubRecord(
  id: number,
  type: string,
  primaryClass: string,
  secondaryClass: string,
): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    type,
    primaryClass,
    secondaryClass,
    detail: { specialText: 'Boosts orb effects of crew by 2.25x for 1 turn.' },
  });
}

// Axis 8 is only expressible through axis 19: the mode has to ride on the leader's manual slot.
function createVsBranchModeManualSlots(
  captainId: number,
  mode: 'character1' | 'character2' | 'both',
) {
  return createEmptyAutoBuildManualSlots().map((slot) =>
    slot.role === 'captain' || slot.role === 'friendCaptain'
      ? {
          ...slot,
          characterIds: [captainId],
          branchSelections: [{ characterId: captainId, mode }],
        }
      : slot,
  );
}

// Lane D matrix, Tier 2 - pairs that interact through relaxation.
// Contract: one axis is relaxation-eligible, the other is not; the failure is invariant 3,
// something given up and never reported. Run 3 established that the mirror - reported and
// never given up - was also live, and fixed it, so these pairs are now assertable.
//
// The table generates the cross product instead of hand-writing dozens of near-identical
// tests. Every relaxation-eligible axis is forced to relax against the SAME fixture, which
// violates axes 6, 7, 9 and 10 simultaneously, so each one honestly reports when switched on.
// Axes 1-4 need no fixture support: they are forced with a value nothing in the pool carries.
const TIER2_BASE_TYPES: AutoTeamBuilderType[] = ['DEX', 'PSY'];
const TIER2_BASE_CLASSES = ['Fighter'];
const TIER2_REQUIRED_ABILITY_KEY = 'remove_paralysis';

const TIER2_UNSATISFIABLE_CRITERIA = {
  rawText: 'Your crew must consist of any 3 of the following: [Ghost Crew].',
  requiresCaptain: false,
  hasNonRosterBranches: false,
  parserStatus: 'roster_only' as const,
  rosterBranches: [
    {
      branchType: 'character_count_any' as const,
      requiredCount: 3,
      matchMode: 'any_candidate' as const,
      options: [{ label: '[Ghost Crew]', acceptedKeys: ['ghost crew that does not exist'] }],
    },
  ],
};

interface Tier2RelaxableAxis {
  id: string;
  label: string;
  extraTypes?: AutoTeamBuilderType[];
  extraClasses?: string[];
  overrides: Record<string, unknown>;
  wasReported: (relaxation: AutoBuildResult['relaxation']) => boolean;
}

interface Tier2HardAxis {
  id: string;
  label: string;
  overrides: Record<string, unknown>;
  stillSatisfied: (result: AutoBuildResult) => boolean;
}

const RELAXABLE: Tier2RelaxableAxis[] = [
  {
    id: 'a1',
    label: 'types',
    extraTypes: ['INT'],
    overrides: { requireAllSelectedTypesInTeam: true },
    wasReported: (r) => r.droppedTypes.includes('INT'),
  },
  {
    id: 'a2',
    label: 'classes',
    extraClasses: ['Striker'],
    overrides: { requireAllSelectedClassesPerCharacter: false },
    wasReported: (r) => r.droppedClasses.includes('Striker'),
  },
  {
    id: 'a3',
    label: 'character tags',
    overrides: {
      selectedCharacterTags: ['Minks'],
      requireAllSelectedCharacterTagsInTeam: true,
    },
    wasReported: (r) => r.droppedCharacterTags.includes('Minks'),
  },
  {
    id: 'a4',
    label: 'character names',
    overrides: {
      selectedCharacterNames: ['Nefertari Vivi'],
      requireAllSelectedCharacterNamesInTeam: true,
    },
    wasReported: (r) => r.droppedCharacterNames.length > 0,
  },
  {
    id: 'a6',
    label: 'leader super-effect scope',
    overrides: { requireAllSlotsInLeaderSuperEffectScope: true },
    wasReported: (r) => r.ignoredLeaderSuperEffectScope,
  },
  {
    id: 'a7',
    label: 'captain ability coverage',
    overrides: { requireFullCaptainAbilityCoverage: true },
    wasReported: (r) => r.ignoredCaptainAbilityCoverage === true,
  },
  {
    id: 'a9',
    label: 'super special criteria',
    overrides: { requireLeaderSuperSpecialCriteria: true },
    wasReported: (r) => r.ignoredLeaderSuperSpecialCriteria,
  },
  {
    id: 'a10',
    label: 'Super Tandem criteria',
    overrides: { requireSuperTandemCriteria: true },
    wasReported: (r) => r.ignoredSuperTandemCriteria,
  },
];

const HARD: Tier2HardAxis[] = [
  {
    id: 'a12',
    label: 'ability requirements',
    overrides: {
      requiredAbilities: [
        {
          abilityKey: TIER2_REQUIRED_ABILITY_KEY,
          minTurns: null,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
    },
    stillSatisfied: (result) => result.coverage.abilityRequirements.matchesAll,
  },
  {
    id: 'a13',
    label: 'battle requirements',
    overrides: {
      battleRequirements: [
        {
          id: 'tier2-battle',
          title: 'Tier 2 battle',
          enemyMechanics: [],
          requiredCharacterGroups: [
            {
              id: 'tier2-battle-group',
              abilities: [
                {
                  abilityKey: TIER2_REQUIRED_ABILITY_KEY,
                  minTurns: null,
                  slotTokens: [],
                  requiredCharacterCount: 1,
                },
              ],
            },
          ],
        },
      ],
    },
    stillSatisfied: (result) => result.coverage.battleRequirements?.matchesAll === true,
  },
];

describe('Lane D matrix - Tier 2 pairs', () => {
  function runPair(axes: Tier2RelaxableAxis[], hard?: Tier2HardAxis): AutoBuildResult | null {
    const types: AutoTeamBuilderType[] = [
      ...TIER2_BASE_TYPES,
      ...axes.flatMap((axis) => axis.extraTypes ?? []),
    ];
    const classes = [...TIER2_BASE_CLASSES, ...axes.flatMap((axis) => axis.extraClasses ?? [])];
    const overrides = axes.reduce(
      (acc, axis) => ({ ...acc, ...axis.overrides }),
      { ...(hard?.overrides ?? {}) } as Record<string, unknown>,
    );

    const needsUncoveredSubs = axes.some((axis) => axis.id === 'a7');

    return runAutoTeamBuildSearch(
      createTier2Records({ uncoveredSubs: needsUncoveredSubs }),
      createInput(types, classes, overrides as never),
    );
  }

  // Every unordered pair of relaxation-eligible axes: both must be reported, independently.
  for (let left = 0; left < RELAXABLE.length; left += 1) {
    for (let right = left + 1; right < RELAXABLE.length; right += 1) {
      const a = RELAXABLE[left];
      const b = RELAXABLE[right];

      it(`reports both give-ups for ${a.id}x${b.id} (${a.label} vs ${b.label})`, () => {
        const result = runPair([a, b]);

        expect(result).not.toBeNull();
        expect(result?.relaxation.usedFallback).toBe(true);
        // Invariant 3, both directions: each axis under test is reported...
        expect({ [a.id]: a.wasReported(result!.relaxation) }).toEqual({ [a.id]: true });
        expect({ [b.id]: b.wasReported(result!.relaxation) }).toEqual({ [b.id]: true });
        // ...and no axis that was never switched on is reported as given up.
        for (const other of RELAXABLE) {
          if (other.id === a.id || other.id === b.id) {
            continue;
          }
          expect({ [other.id]: other.wasReported(result!.relaxation) }).toEqual({
            [other.id]: false,
          });
        }
      });
    }
  }

  // Every relaxation-eligible axis against every hard axis: the soft one is reported, the hard
  // one survives untouched. A hard axis has no relaxation flag at all - that is the point.
  for (const soft of RELAXABLE) {
    for (const hard of HARD) {
      it(`relaxes ${soft.id} while ${hard.id} holds (${soft.label} vs ${hard.label})`, () => {
        const result = runPair([soft], hard);

        expect(result).not.toBeNull();
        expect(result?.relaxation.usedFallback).toBe(true);
        expect({ [soft.id]: soft.wasReported(result!.relaxation) }).toEqual({ [soft.id]: true });
        // Invariant 1: the hard axis was never relaxed, so the team still satisfies it.
        expect({ [hard.id]: hard.stillSatisfied(result!) }).toEqual({ [hard.id]: true });
      });
    }
  }
});

// Lane D matrix, Tier 3 - the remainder, rotated.
//
// Tier 3 is every live pair that is neither Tier 1 nor Tier 2: 80 of them. It is defined as
// rotated across runs, and the written cursor lives in the brain ledger - without one it never
// rotates. This run covers the engine-expressible slice built on the three axes that belong to
// no other tier: 5 (leader boost ranges), 11 (unique base names) and 16 (friend auto-fill),
// plus axis 19 against the two hard axes the engine can express.
//
// Axes 14, 15, 18 and 20 are read ZERO times in the engine and in auto-team-builder.utils.ts,
// so their pairs are service-side and are recorded as such rather than faked here. Writing an
// engine case for an axis the engine never reads passes while proving nothing.
//
// Every row carries its own CONTROL: the same fixture with the Tier 3 axis switched off, which
// must FAIL the same predicate. Without it the assertion is unfalsifiable - the fixture
// factory defaults every record to a unique `Character <id>` name and to captainAtkBoost 5 /
// captainHpBoost 1.3, so a naive axis-11 or axis-5 row passes with the enforcement deleted.
describe('Lane D matrix - Tier 3 pairs', () => {
  interface Tier3NeitherAxis {
    id: string;
    label: string;
    overrides: Record<string, unknown>;
    records: Tier2RecordOptions;
    /** True only when the returned team honours this axis. */
    holds: (result: AutoBuildResult) => boolean;
    /** Relaxation-eligible axes this row cannot be paired with, and why. */
    skip?: Record<string, string>;
  }

  const NEITHER: Tier3NeitherAxis[] = [
    {
      id: 'a5',
      label: 'leader boost ranges',
      // Both conjuncts. `candidateMatchesLeaderBoostRanges` is ATK && HP, so a range that
      // constrains only ATK still passes with the HP conjunct deleted.
      overrides: {
        leaderBoostRanges: { ATK: { min: 5, max: null }, HP: { min: 1.3, max: null } },
      },
      records: { leaderBoostSpread: true },
      holds: (result) =>
        [result.slots[0], result.slots[1]].every(
          (slot) => slot.character.captainAtkBoost >= 5 && slot.character.captainHpBoost >= 1.3,
        ),
      skip: {
        // The spread leaders are `leader()` clones and therefore [Fighter]-covering, so they
        // cannot be added to the uncovered-subs branch without satisfying the captain-coverage
        // floor that branch exists to violate. 5x7 is a Tier 1 pair and is covered there.
        a7: 'Tier 1 covers 5x7; the axis-5 spread cannot share the uncovered-subs fixture',
      },
    },
    {
      id: 'a11',
      label: 'unique base names',
      overrides: { requireUniqueBaseCharacterNames: true },
      records: { duplicateBaseNames: true },
      // Sub slots ONLY. The Captain and the Friend Captain may legally be the same character,
      // and every run of this fixture returns exactly that, so a predicate over all six slots
      // would assert a bug. `leaderPartyConflictKeySet` is built from the captain alone.
      holds: (result) => {
        const subs = result.slots.filter((slot) => slot.role === 'sub');

        return (
          subs.length === 4 &&
          new Set(subs.map((slot) => resolveBaseNameKeyForTest(slot.character.name))).size === 4
        );
      },
    },
  ];

  function runTier3(
    neither: Tier3NeitherAxis,
    partners: { soft?: Tier2RelaxableAxis; hard?: Tier2HardAxis; other?: Tier3NeitherAxis },
    enabled: boolean,
  ): AutoBuildResult | null {
    const { soft, hard, other } = partners;
    const types: AutoTeamBuilderType[] = [...TIER2_BASE_TYPES, ...(soft?.extraTypes ?? [])];
    const classes = [...TIER2_BASE_CLASSES, ...(soft?.extraClasses ?? [])];
    const overrides: Record<string, unknown> = {
      ...(hard?.overrides ?? {}),
      ...(soft?.overrides ?? {}),
      ...(other?.overrides ?? {}),
      // The control differs in exactly one thing: this axis's own override.
      ...(enabled ? neither.overrides : {}),
    };

    // The records never differ between control and treatment. If they did, a failing control
    // would prove only that the two fixtures differ.
    return runAutoTeamBuildSearch(
      createTier2Records({
        ...neither.records,
        ...(other?.records ?? {}),
        uncoveredSubs: soft?.id === 'a7',
      }),
      createInput(types, classes, overrides as never),
    );
  }

  // Every Tier 3 axis against every relaxation-eligible axis: the soft one is relaxed and
  // reported, the Tier 3 axis still holds on the finished team, and the control proves the
  // fixture could have violated it.
  for (const neither of NEITHER) {
    for (const soft of RELAXABLE) {
      if (neither.skip?.[soft.id]) {
        continue;
      }

      it(`holds ${neither.id} while ${soft.id} relaxes (${neither.label} vs ${soft.label})`, () => {
        const control = runTier3(neither, { soft }, false);
        const result = runTier3(neither, { soft }, true);

        expect(result).not.toBeNull();
        expect(control).not.toBeNull();
        // Invariant 1: the Tier 3 axis was never relaxed, so the team still satisfies it...
        expect({ [neither.id]: neither.holds(result!) }).toEqual({ [neither.id]: true });
        // ...and the same fixture without it does not, which is what makes that assertion mean
        // something.
        expect({ [`${neither.id}-control`]: neither.holds(control!) }).toEqual({
          [`${neither.id}-control`]: false,
        });
        // Invariant 3: the relaxation-eligible partner is still reported...
        expect({ [soft.id]: soft.wasReported(result!.relaxation) }).toEqual({ [soft.id]: true });
        // ...and no axis that was never switched on is reported as given up.
        for (const other of RELAXABLE) {
          if (other.id === soft.id) {
            continue;
          }

          expect({ [other.id]: other.wasReported(result!.relaxation) }).toEqual({
            [other.id]: false,
          });
        }
      });
    }
  }

  // Every Tier 3 axis against the two hard axes the engine can express. Neither is relaxable,
  // so both must simply hold together - and the control still has to fail.
  for (const neither of NEITHER) {
    for (const hard of HARD) {
      it(`holds ${neither.id} together with ${hard.id} (${neither.label} vs ${hard.label})`, () => {
        const control = runTier3(neither, { hard }, false);
        const result = runTier3(neither, { hard }, true);

        expect(result).not.toBeNull();
        expect(control).not.toBeNull();
        expect({ [neither.id]: neither.holds(result!) }).toEqual({ [neither.id]: true });
        expect({ [`${neither.id}-control`]: neither.holds(control!) }).toEqual({
          [`${neither.id}-control`]: false,
        });
        expect({ [hard.id]: hard.stillSatisfied(result!) }).toEqual({ [hard.id]: true });
      });
    }
  }

  // 5x11 - the two Tier 3 axes against each other. They bind on opposite ends of the team, so
  // the interesting question is whether the leader gate and the sub gate can both hold at once
  // on one fixture; each control is run separately so a failure names which one broke.
  it('holds a5 and a11 together (leader boost ranges vs unique base names)', () => {
    const [a5, a11] = NEITHER;
    const result = runTier3(a5, { other: a11 }, true);
    const withoutA5 = runTier3(a5, { other: a11 }, false);

    expect(result).not.toBeNull();
    expect(withoutA5).not.toBeNull();
    expect({ a5: a5.holds(result!), a11: a11.holds(result!) }).toEqual({ a5: true, a11: true });
    // Dropping axis 5 alone breaks axis 5 and leaves axis 11 intact: the two are independent,
    // which is the pair's actual claim.
    expect({ a5: a5.holds(withoutA5!), a11: a11.holds(withoutA5!) }).toEqual({
      a5: false,
      a11: true,
    });
  });
});


// Lane D matrix, Tier 3 - axis 16, which needs a differential rather than a predicate.
//
// `allowAnyFriendCaptainAutoFill` WIDENS the friend-captain pool instead of narrowing it, so
// "the team still satisfies it" is the wrong frame: there is nothing to violate. What the pair
// asserts is that the widening happened, that it reached only the friend seat, and that the
// widened candidate still had to clear the gates an explicitly chosen friend captain clears.
//
// Three things make a naive version of this case vacuous, all of them measured:
//
//   - With the flag on and NO roster, the ternary that injects `leaderAutoFillCharacterIds`
//     still fires, re-sorting the friend seat from newest-id to record order. The friend
//     captain changes and nothing was widened. "The result changed when I toggled the axis"
//     is not evidence for this axis.
//   - A roster whose records are all already in the box pool adds nothing, and produces the
//     same visible change for the same wrong reason.
//   - A roster of records with no readable captain text is dropped before the union, and
//     produces it again.
//
// So the assertion is identity-based, and BOTH runs ship: mutating the union guard to widen
// unconditionally leaves the ON run green and is caught only by the OFF control, while the
// other three mutations leave the OFF control green and are caught only by the ON run. Either
// run alone is blind to half the mutation set.
describe('Lane D matrix - Tier 3 pairs, axis 16', () => {
  const BOX_IDS = new Set([9400, 9401, 9402, 9403, 9404, 9405, 9406, 9498, 9499, 9411, 9412]);
  // The same range axis 5 uses. It is not decoration: it is the gate the widened friend
  // captain has to clear, so these rows also cover the pair 5x16.
  const LEADER_GATE = { ATK: { min: 5, max: null }, HP: { min: 1.3, max: null } };

  function runAxis16(
    partner: { soft?: Tier2RelaxableAxis; hard?: Tier2HardAxis; overrides?: Record<string, unknown> },
    enabled: boolean,
  ): AutoBuildResult | null {
    const types: AutoTeamBuilderType[] = [...TIER2_BASE_TYPES, ...(partner.soft?.extraTypes ?? [])];
    const classes = [...TIER2_BASE_CLASSES, ...(partner.soft?.extraClasses ?? [])];

    return runAutoTeamBuildSearch(
      createTier2Records({ duplicateBaseNames: Boolean(partner.overrides) }),
      createInput(types, classes, {
        ...(partner.hard?.overrides ?? {}),
        ...(partner.soft?.overrides ?? {}),
        ...(partner.overrides ?? {}),
        leaderBoostRanges: LEADER_GATE,
        allowAnyFriendCaptainAutoFill: enabled,
      } as never),
      // The roster is passed in BOTH runs. If it were passed only when the flag is on, the
      // control would differ in two things and could not isolate the axis.
      { friendCaptainRecords: createAxis16FriendCaptainRoster() },
    );
  }

  function expectWidenedOnlyAtTheFriendSeat(
    onResult: AutoBuildResult,
    offResult: AutoBuildResult,
  ): void {
    // The widening happened, and it produced a character the box pool does not contain.
    expect(onResult.slots[1]!.role).toBe('friendCaptain');
    expect(onResult.slots[1]!.character.id).toBe(9100);
    // It reached ONLY the friend seat.
    expect(onResult.slots.slice(2).every((slot) => BOX_IDS.has(slot.character.id))).toBe(true);
    expect(BOX_IDS.has(onResult.slots[0]!.character.id)).toBe(true);
    // Trap 8: the auto-filled friend captain still had to clear the leader gate. 9199 sits
    // first in roster order and would take the seat if the gate were dropped.
    expect(
      onResult.slots
        .slice(0, 2)
        .every(
          (slot) => slot.character.captainAtkBoost >= 5 && slot.character.captainHpBoost >= 1.3,
        ),
    ).toBe(true);
    // The control never widens - this is the only clause that fails when the guard is mutated
    // to widen unconditionally.
    expect(offResult.slots.every((slot) => BOX_IDS.has(slot.character.id))).toBe(true);
  }

  for (const soft of RELAXABLE) {
    if (soft.id === 'a7') {
      // The roster leaders are [Fighter]-covering, so on the uncovered-subs branch they would
      // satisfy the captain-coverage floor that branch exists to violate and axis 7 would stop
      // reporting. 16x7 is left to the service spec, where the roster is a repository result.
      continue;
    }

    it(`widens only the friend seat for a16 while ${soft.id} relaxes (friend auto-fill vs ${soft.label})`, () => {
      const onResult = runAxis16({ soft }, true);
      const offResult = runAxis16({ soft }, false);

      expect(onResult).not.toBeNull();
      expect(offResult).not.toBeNull();
      expectWidenedOnlyAtTheFriendSeat(onResult!, offResult!);
      expect({ [soft.id]: soft.wasReported(onResult!.relaxation) }).toEqual({ [soft.id]: true });
    });
  }

  for (const hard of HARD) {
    it(`widens only the friend seat for a16 while ${hard.id} holds (friend auto-fill vs ${hard.label})`, () => {
      const onResult = runAxis16({ hard }, true);
      const offResult = runAxis16({ hard }, false);

      expect(onResult).not.toBeNull();
      expect(offResult).not.toBeNull();
      expectWidenedOnlyAtTheFriendSeat(onResult!, offResult!);
      expect({ [hard.id]: hard.stillSatisfied(onResult!) }).toEqual({ [hard.id]: true });
    });
  }

  it('widens only the friend seat for a16 while a11 holds (friend auto-fill vs unique base names)', () => {
    const overrides = { requireUniqueBaseCharacterNames: true };
    const onResult = runAxis16({ overrides }, true);
    const offResult = runAxis16({ overrides }, false);

    expect(onResult).not.toBeNull();
    expect(offResult).not.toBeNull();
    expectWidenedOnlyAtTheFriendSeat(onResult!, offResult!);

    const subs = onResult!.slots.filter((slot) => slot.role === 'sub');

    expect(new Set(subs.map((slot) => resolveBaseNameKeyForTest(slot.character.name))).size).toBe(
      4,
    );
  });
});


// Lane D matrix, Tier 3 - axis 19 against the hard axes the engine can express, plus the two
// Tier 3 axes.
//
// Axis 19's trap is that it looks covered and is not. Eleven existing engine-spec cases pair
// `manualSlots` with `lockedCharacterIds`, `captainCharacterId` and `friendCaptainCharacterId`,
// and in every one of them the locked set is the same size as the manual set, so the overflow
// branch never fires and the two legacy leader ids are inert: only `manualSlots` binds. Three
// more ways to write a vacuous axis-19 case, all measured:
//
//   - pinning a character the ranking would have chosen anyway (9403-9406 here);
//   - using `characterIds` without `requiredCharacterId`, which makes the role skippable, so
//     the case asserts a preference rather than a pin;
//   - asserting on the `Manual pick` chip, which is granted to every id in the list - a decoy
//     that merely sits in `characterIds` gets it too.
//
// So the pin is 9390, the lowest id in the fixture, which the newest-id ranking never reaches;
// it is required rather than listed; and the assertion is positional.
describe('Lane D matrix - Tier 3 pairs, axis 19', () => {
  function createPinnedSubSlots(
    pins: { role: 'sub2' | 'sub3'; characterId: number }[],
    captainId?: number,
  ) {
    return createEmptyAutoBuildManualSlots().map((slot) => {
      const pin = pins.find((entry) => entry.role === slot.role);

      if (pin) {
        // The decoy is not decoration. `requiredCharacterId` narrows the role's pool to the
        // one pin; `characterIds` is the wider list the role would otherwise rank over. With
        // the pin alone in the list the two are indistinguishable, and the mutation that
        // ignores `requiredCharacterId` entirely changes nothing - measured: it killed zero
        // tests. 9406 is the top-ranked sub, so it wins the moment the pin stops binding.
        return {
          ...slot,
          characterIds: [pin.characterId, 9406],
          requiredCharacterId: pin.characterId,
        };
      }

      if (captainId && slot.role === 'captain') {
        return { ...slot, characterIds: [captainId], requiredCharacterId: captainId };
      }

      return slot;
    });
  }

  function runAxis19(
    overrides: Record<string, unknown>,
    records: Tier2RecordOptions = {},
  ): AutoBuildResult | null {
    return runAutoTeamBuildSearch(
      createTier2Records({ manualPinSub: true, ...records }),
      createInput(TIER2_BASE_TYPES, TIER2_BASE_CLASSES, overrides as never),
    );
  }

  for (const hard of HARD) {
    it(`honours an a19 pin while ${hard.id} holds (manual slots vs ${hard.label})`, () => {
      const control = runAxis19({ ...hard.overrides });
      const result = runAxis19({
        ...hard.overrides,
        manualSlots: createPinnedSubSlots([{ role: 'sub2', characterId: 9390 }]),
      });

      expect(result).not.toBeNull();
      expect(control).not.toBeNull();
      // `orderSelectedSubCandidates` puts a constrained role at its own position, so a sub2
      // pin lands at slots[3]. Positional, not "is 9390 anywhere in the team".
      expect(result!.slots[3]!.role).toBe('sub');
      expect(result!.slots[3]!.character.id).toBe(9390);
      // The control proves the ranking never reaches 9390 on its own.
      expect(control!.slots.map((slot) => slot.character.id)).not.toContain(9390);
      expect({ [hard.id]: hard.stillSatisfied(result!) }).toEqual({ [hard.id]: true });
      // Axis 19 has no field in the relaxation summary at all, so it can never be
      // over-reported - there is nothing to assert, and that is the honest statement.
    });
  }

  it('honours an a19 pin while a11 holds (manual slots vs unique base names)', () => {
    const result = runAxis19(
      {
        requireUniqueBaseCharacterNames: true,
        manualSlots: createPinnedSubSlots([{ role: 'sub2', characterId: 9390 }]),
      },
      { duplicateBaseNames: true },
    );

    expect(result).not.toBeNull();
    expect(result!.slots[3]!.character.id).toBe(9390);

    const subs = result!.slots.filter((slot) => slot.role === 'sub');

    expect(new Set(subs.map((slot) => resolveBaseNameKeyForTest(slot.character.name))).size).toBe(
      4,
    );
  });

  it('applies a5 to the un-pinned leader seat while a19 pins the other (manual slots vs leader boost ranges)', () => {
    // The carve-out this pair exists for: `candidateMatchesLeaderConstraints` is called with
    // `applyAutoFillLeaderRanges: false` for the manual pool, so a pinned leader never sees the
    // boost range. Pin ONE seat and the axis still has to bind on the other; pin both and the
    // axis is silently disabled, which is what makes a two-seat pin the wrong case to write.
    const overrides = {
      leaderBoostRanges: { ATK: { min: 5, max: null }, HP: { min: 1.3, max: null } },
      manualSlots: createPinnedSubSlots([], 9412),
    };
    const result = runAxis19(overrides, { leaderBoostSpread: true });

    expect(result).not.toBeNull();
    // The pinned captain is out of range and is seated anyway - the manual pool skips the gate.
    expect(result!.slots[0]!.character.id).toBe(9412);
    expect(result!.slots[0]!.character.captainHpBoost).toBe(1.2);
    // The auto-filled friend seat does NOT skip it.
    expect(result!.slots[1]!.character.captainAtkBoost).toBeGreaterThanOrEqual(5);
    expect(result!.slots[1]!.character.captainHpBoost).toBeGreaterThanOrEqual(1.3);
  });

  it('returns no team when two required a19 pins need the same character', () => {
    // The companion the positive cases need. A required role is not skippable; without this
    // case, mutating the skip guard to always skip leaves every positive case green.
    const result = runAxis19({
      manualSlots: createPinnedSubSlots([
        { role: 'sub2', characterId: 9390 },
        { role: 'sub3', characterId: 9390 },
      ]),
    });

    expect(result).toBeNull();
  });
});

/**
 * A friend-captain roster that shares no id with the box pool.
 *
 * Order is load-bearing. `resolveFriendCaptainCandidatePool` builds the widened pool in roster
 * order and `comparePreferredLeaderIdOrder` then prefers that order over newest-id, so 9199 is
 * the record the search reaches first - and the only reason it does not take the seat is the
 * leader boost gate. Drop that gate and 9199 wins, which is exactly what trap 8 warns about.
 */
function createAxis16FriendCaptainRoster(): CharacterDetailRecord[] {
  const rosterLeader = (id: number, atk: number): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: null,
      captainAtkBoost: atk,
      captainHpBoost: 1.3,
      detail: {
        // The same [Fighter] scope as the box leaders, so the intersected coverage stays
        // [Fighter] and the PSY/Fighter subs remain admissible whichever leader is chosen.
        captainAbility: 'Boosts ATK of [Fighter] characters by 5x and HP by 1.3x.',
        specialText: 'Boosts ATK of [Fighter] characters by 2.25x for 1 turn.',
      },
    });

  return [
    // Fails the ATK floor. First in roster order on purpose.
    rosterLeader(9199, 2),
    // The legal roster record the widening is expected to produce.
    rosterLeader(9100, 5),
    // Newest id in the roster: it wins if the roster-order preference is dropped.
    rosterLeader(9500, 5),
  ];
}

/**
 * The party-conflict base name, reimplemented for the assertion side only.
 *
 * `resolveCharacterBaseNameKey` is not exported, and asserting through the production helper
 * would make the test agree with the code by construction: a mutation of the derivation would
 * move both sides together and the case could not fail.
 */
function resolveBaseNameKeyForTest(name: string): string {
  return name.split(' - ', 1)[0]!.trim().toLowerCase();
}


interface Tier2RecordOptions {
  /** Subs the captain cannot cover, so axis 7 can be violated (see the comment below). */
  uncoveredSubs?: boolean;
  /** Two subs whose names collide under the party-conflict keys, so axis 11 can bind. */
  duplicateBaseNames?: boolean;
  /** Leader candidates the axis-5 boost range can split on BOTH its conjuncts. */
  leaderBoostSpread?: boolean;
  /** A [Fighter]-covered sub the ranking never reaches, so an axis-19 pin is observable. */
  manualPinSub?: boolean;
}

/**
 * One fixture that violates axes 6, 7, 9 and 10 at once, so each reports honestly when it is
 * switched on: the leaders scope DEX and boost [Fighter] only, while every sub is PSY/Slasher -
 * out of the super-effect scope and outside the captain's coverage - and both leaders carry
 * criteria nothing in the pool can satisfy. Two leader-eligible records because one is not
 * enough for this shape to build; see the ledger's open question.
 */
function createTier2Records(options: Tier2RecordOptions = {}): CharacterDetailRecord[] {
  const {
    uncoveredSubs: withUncoveredSubs = false,
    duplicateBaseNames: withDuplicateBaseNames = false,
    leaderBoostSpread: withLeaderBoostSpread = false,
    manualPinSub: withManualPinSub = false,
  } = options;
  const leader = (
    id: number,
    boosts: { atk?: number; hp?: number } = {},
  ): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: null,
      // `createCharacterRecord` already defaults these to 5 / 1.3; naming them here is what
      // lets the axis-5 spread below move one of them without touching the captain text, so
      // the leader's [Fighter] coverage scope stays identical across the whole fixture.
      captainAtkBoost: boosts.atk ?? 5,
      captainHpBoost: boosts.hp ?? 1.3,
      detail: {
        captainAbility: 'Boosts ATK of [Fighter] characters by 5x and HP by 1.3x.',
        specialText: 'Boosts ATK of [Fighter] characters by 2.25x for 1 turn.',
        superType: { specialEffect: 'Changes DEX characters to Super DEX.' },
        superSpecialCriteria: TIER2_UNSATISFIABLE_CRITERIA,
        superTandemData: {
          requirement: TIER2_UNSATISFIABLE_CRITERIA.rawText,
          levels: [{ level: 5, effect: 'Boosts Tandem ATK of crew by 3x for 1 turn.' }],
          criteria: TIER2_UNSATISFIABLE_CRITERIA,
        },
      },
    });
  // PSY so they sit OUTSIDE the leader's DEX super-effect scope (axis 6 violated), but Fighter
  // so the [Fighter] captain still covers them - without that the default non-partial auto-fill
  // pool admits no subs at all and the team cannot be built, which would make every pair null.
  const sub = (id: number, specialText: string): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: null,
      detail: { specialText },
    });
  // The engine spec does not derive abilities from text - `createCharacterRecord` defaults
  // `builderAbilities` to `[]` - so the hard axes' carrier declares its ability explicitly.
  const abilityCarrier = (id: number): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'PSY',
      primaryClass: 'Fighter',
      secondaryClass: null,
      detail: {
        specialText: 'Reduces Paralysis duration by 5 turns.',
        builderAbilities: [
          {
            key: TIER2_REQUIRED_ABILITY_KEY,
            label: TIER2_REQUIRED_ABILITY_KEY,
            minTurns: 5,
            isCompleteRemoval: false,
            slotTokens: [],
            source: 'specialText',
          },
        ],
      },
    });

  // Axis 7 needs the opposite of what every other axis needs. To violate captain coverage the
  // team must CONTAIN an uncovered slot, but an uncovered sub is not admitted to the default
  // non-partial auto-fill pool at all - so a fixture that violates coverage cannot be built
  // until coverage is relaxed. That is why axis 7 gets its own record set rather than sharing.
  const uncoveredSub = (id: number): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'PSY',
      primaryClass: 'Slasher',
      secondaryClass: null,
      detail: { specialText: 'Boosts ATK by 2x for 1 turn.' },
    });

  // Axis 11 binds only when two SUB-eligible records share a party-conflict key. The keys are
  // name-derived: `resolveCharacterBaseNameKey` splits at the first ' - ', so both of these
  // reduce to 'monkey d. luffy' and collide. The default `Character <id>` names never collide,
  // which is why the stock fixture makes `requireUniqueBaseCharacterNames: true` vacuous.
  //
  // Their ids are the HIGHEST in the set on purpose. Sub ranking ends in
  // `compareCandidatesByNewestId` (`right.id - left.id`), so twins ranked at the tail would
  // never both be selected even with the axis off - control and treatment would return the
  // identical team and no mutation could fail the case. They must outrank the rest.
  //
  // Appended rather than substituted, so one distinct spare sub survives: with the axis on the
  // team still has slack, and a partner axis that removes one more candidate does not turn the
  // pair into a spurious `null`.
  //
  // The class mirrors the branch. Hard-coding 'Fighter' would put the twins inside the
  // captain's [Fighter] coverage and silently defuse the axis-7 premise on the one branch that
  // depends on it.
  const duplicateBaseNameSub = (id: number, suffix: string): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      name: `Monkey D. Luffy - ${suffix}`,
      type: 'PSY',
      primaryClass: withUncoveredSubs ? 'Slasher' : 'Fighter',
      secondaryClass: null,
      detail: { specialText: 'Boosts ATK by 2x for 1 turn.' },
    });

  const duplicateBaseNameSubs = withDuplicateBaseNames
    ? [duplicateBaseNameSub(9498, 'Gear Third'), duplicateBaseNameSub(9499, 'Gear Fourth')]
    : [];

  // Axis 5 binds only when the boost range can SPLIT the auto-fill leader pool, and it has to
  // split on both conjuncts: `candidateMatchesLeaderBoostRanges` is `ATK && HP`, so a fixture
  // that varies only ATK still passes with the HP conjunct deleted. 9411 fails the ATK floor,
  // 9412 fails the HP floor. Both carry higher ids than the base leaders, so with the range
  // off they take the leader seats - which is what makes the range's effect observable.
  //
  // Only on the covered branch. These are `leader()` clones and therefore [Fighter]-covering,
  // so on the uncovered-subs branch they would satisfy the very captain-coverage floor that
  // branch exists to violate, and axis 7 would stop reporting.
  const leaderBoostSpreadLeaders =
    withLeaderBoostSpread && !withUncoveredSubs
      ? [leader(9411, { atk: 4.25 }), leader(9412, { hp: 1.2 })]
      : [];

  // Axis 19 is only observable on a record the search would NOT have chosen by itself. Sub
  // ranking ends in newest-id, so the lowest id in the fixture is never reached: the stock
  // team is 9406, 9405, 9404, 9403 and this record sits below all of them. It is [Fighter]
  // so the captain still covers it - an uncovered pin is rejected outright and, being
  // required and therefore non-skippable, takes the whole build to null for the wrong reason.
  const manualPinSubs = withManualPinSub
    ? [
        createCharacterRecord({
          id: 9390,
          type: 'PSY',
          primaryClass: 'Fighter',
          secondaryClass: null,
          detail: { specialText: 'Boosts ATK by 2x for 1 turn.' },
        }),
      ]
    : [];

  if (withUncoveredSubs) {
    return [
      leader(9400),
      leader(9401),
      abilityCarrier(9402),
      uncoveredSub(9407),
      uncoveredSub(9408),
      uncoveredSub(9409),
      uncoveredSub(9410),
      ...duplicateBaseNameSubs,
    ];
  }

  return [
    leader(9400),
    leader(9401),
    // One sub carries the ability the hard axes require, so axes 12 and 13 stay satisfiable.
    abilityCarrier(9402),
    sub(9403, 'Boosts ATK by 2x for 1 turn.'),
    sub(9404, 'Boosts ATK by 2x for 1 turn.'),
    sub(9405, 'Boosts ATK by 2x for 1 turn.'),
    sub(9406, 'Boosts ATK by 2x for 1 turn.'),
    ...duplicateBaseNameSubs,
    ...leaderBoostSpreadLeaders,
    ...manualPinSubs,
  ];
}

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
      | 'requiredAbilities'
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
    requiredAbilities: overrides.requiredAbilities ?? [],
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
    requireManualShip: false,
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

function createPreferredCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5910,
    name: 'Preferred Captain',
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

function createAlternateCaptainRecord(): CharacterDetailRecord {
  return createCharacterRecord({
    id: 5810,
    name: 'Alternate Captain',
    primaryClass: 'Fighter',
    secondaryClass: 'Free Spirit',
    detail: {
      captainAbility: 'Boosts ATK of DEX and Fighter characters by 4.5x and HP by 1.2x.',
      specialText: 'Deals 75x character ATK in typeless damage to one enemy.',
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

function createLowCoverageSubRecord(id: number): CharacterDetailRecord {
  return createCharacterRecord({
    id,
    primaryClass: 'Fighter',
    detail: {
      specialText: 'Deals 50x character ATK in typeless damage to one enemy.',
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
      builderAbilities: [
        {
          key: 'remove_bind',
          label: 'Remove Bind',
          minTurns: 5,
          isCompleteRemoval: false,
          slotTokens: [],
          source: 'specialText',
        },
      ],
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

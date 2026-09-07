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

// NOTE ON IMPORTS: no import changes are needed. `createEmptyAutoBuildManualSlots`,
// `AutoTeamBuilderType`, `CharacterDetailRecord` and `runAutoTeamBuildSearch` are all already
// imported by the engine spec (:1-25). `createVsBranchModeManualSlots` deliberately spreads
// `createEmptyAutoBuildManualSlots()` slots rather than rebuilding them, so its return type stays
// assignable to `AutoBuildManualSlotSelection[]` without importing that type or
// `AutoBuildCaptainBranchMode`; the literal-union `mode` parameter is exactly
// `AutoBuildCaptainBranchMode`.
//
// NOTE ON QUOTES: the two branch-text constants must use SINGLE quotes (they contain no
// apostrophe) or prettier rewrites them; the leader's `specialText` keeps DOUBLE quotes because of
// "enemies'". Verified with `npx prettier --check`: with these quotes the new block adds zero
// prettier diff lines. The file already has 3 pre-existing prettier warnings (:145 and the two
// `captainAbility:` lines inside `createLeaderBoostRangeCoverageRecords`, both from run 1) - do not
// mistake those for damage from this paste.

// Lane D matrix, Tier 2 - pairs that interact through relaxation.
// Contract: one axis is relaxation-eligible, the other is not; the failure is invariant 3,
// something given up and never reported. Run 3 established that the mirror - reported and
// never given up - was also live, and fixed it, so these pairs are now assertable.
//
// The table generates the cross product instead of hand-writing dozens of near-identical
// tests. Every relaxation-eligible axis is forced to relax against the SAME fixture, which
// violates axes 6, 7, 9 and 10 simultaneously, so each one honestly reports when switched on.
// Axes 1-4 need no fixture support: they are forced with a value nothing in the pool carries.
describe('Lane D matrix - Tier 2 pairs', () => {
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
      createTier2Records(needsUncoveredSubs),
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

/**
 * One fixture that violates axes 6, 7, 9 and 10 at once, so each reports honestly when it is
 * switched on: the leaders scope DEX and boost [Fighter] only, while every sub is PSY/Slasher -
 * out of the super-effect scope and outside the captain's coverage - and both leaders carry
 * criteria nothing in the pool can satisfy. Two leader-eligible records because one is not
 * enough for this shape to build; see the ledger's open question.
 */
function createTier2Records(withUncoveredSubs = false): CharacterDetailRecord[] {
  const leader = (id: number): CharacterDetailRecord =>
    createCharacterRecord({
      id,
      type: 'DEX',
      primaryClass: 'Fighter',
      secondaryClass: null,
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

  if (withUncoveredSubs) {
    return [
      leader(9400),
      leader(9401),
      abilityCarrier(9402),
      uncoveredSub(9407),
      uncoveredSub(9408),
      uncoveredSub(9409),
      uncoveredSub(9410),
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

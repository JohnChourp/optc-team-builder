import { Injectable } from '@angular/core';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_TYPES,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_BUILD_TOTAL_SLOT_COUNT,
  AUTO_BUILD_LEADER_BOOST_FILTERS,
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  type AutoBuildConstraints,
  type AutoBuildCostRange,
  type AutoBuildRankedResult,
  type AutoBuildRankedResults,
  type AutoBuildRosterInput,
  type AutoBuildInput,
  type AutoBuildLeaderBoostFilter,
  type AutoBuildLeaderBoostRange,
  type AutoBuildLeaderBoostRanges,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  MAX_AUTO_BUILD_RANKED_RESULT_COUNT,
  type AutoTeamBuilderType,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
} from '../models/auto-team-builder.models';
import { type AutoBuildAbilityRequirement } from '../models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  AutoTeamBuildCancelledError,
  createAutoTeamBuildFallbackPlanner,
  isAutoTeamBuildCancelledError,
  normalizeSelectedTypes,
  runAutoTeamBuildSearch,
  satisfiesRequestedAutoTeamBuildCoverage,
  type AutoTeamBuildFallbackPlanner,
} from './auto-team-builder.engine';
import { resolveAutoBuildShipSelection } from './auto-team-builder-ship.utils';
import { normalizeEnemyMechanicRequirements } from './enemy-mechanic-draft.utils';
import { OptcRepositoryService } from './optc-repository.service';
import {
  buildAutoBuildAbilityCoverageBreakdown,
  buildAutoTeamResult,
  resolveAutoBuildTeamPowerPreferenceScore,
} from './auto-team-builder.utils';
import {
  type AutoTeamBuilderWorkerRequest,
  type AutoTeamBuilderWorkerResponse,
} from './auto-team-builder.worker.models';

export interface AutoTeamBuildExecutionOptions {
  onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
  signal?: AbortSignal;
  workerCount?: number;
  getWorkerCount?: () => number;
}

const LEGACY_ABILITY_KEY_ALIASES: Record<string, string> = {
  remove_defense_up: 'remove_enemy_increased_defense',
};

interface AutoTeamBuildTimingState {
  searchStartedAt: number;
  totalCompletedFallbackMs: number;
  completedFallbackAttempts: number;
  now: () => number;
}

interface PooledFallbackAttemptResult {
  result: AutoBuildResult | null;
}

interface PooledWorkerState {
  worker: Worker;
  busy: boolean;
  retiring: boolean;
}

@Injectable({ providedIn: 'root' })
export class AutoTeamBuilderService {
  public constructor(private readonly repository: OptcRepositoryService) {}

  public async buildTeam(
    selectedClasses: string[] = [],
    selectedTypes: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
    constraints: AutoBuildConstraints = {},
    executionOptions: AutoTeamBuildExecutionOptions = {},
  ): Promise<AutoBuildResult | null> {
    const favoritesOnly = constraints.favoritesOnly ?? false;
    const allowAnyFriendCaptainAutoFill = constraints.allowAnyFriendCaptainAutoFill ?? false;
    const favoriteShipsOnly = constraints.favoriteShipsOnly ?? false;
    const requireAllSlotsInLeaderSuperEffectScope =
      constraints.requireAllSlotsInLeaderSuperEffectScope ?? false;
    const normalizedTypes = normalizeSelectedTypes(selectedTypes);
    const normalizedClasses: string[] = [];

    for (const currentClass of selectedClasses) {
      const nextClass = currentClass.trim();

      if (
        nextClass.length === 0 ||
        normalizedClasses.some((entry) => entry.toLowerCase() === nextClass.toLowerCase())
      ) {
        continue;
      }

      normalizedClasses.push(nextClass);
    }
    const favoriteCharacterIds = new Set(
      (constraints.favoriteCharacterIds ?? []).filter(
        (characterId) => Number.isInteger(characterId) && characterId > 0,
      ),
    );
    const candidateCharacterIds = this.normalizeCharacterIds(constraints.candidateCharacterIds);
    const favoriteShipIds = this.normalizeCharacterIds(constraints.favoriteShipIds);
    const requiredAbilities = this.normalizeRequiredAbilities(constraints.requiredAbilities ?? []);
    const enemyMechanics = normalizeEnemyMechanicRequirements(constraints.enemyMechanics ?? []);
    const normalizedManualSlots = this.normalizeManualSlots(constraints.manualSlots);
    const hasManualSlots = normalizedManualSlots.some((slot) => slot.characterIds.length > 0);
    const legacyManualSelection = this.normalizeLegacyManualSelection(
      constraints.lockedCharacterIds,
      constraints.captainCharacterId,
      constraints.friendCaptainCharacterId,
    );
    if (!hasManualSlots && legacyManualSelection.hasInvalidLeaderSelection) {
      return null;
    }
    const manualSlots = hasManualSlots
      ? normalizedManualSlots
      : this.createManualSlotsFromLegacySelection(legacyManualSelection);
    const derivedManualSelection = this.deriveLegacyManualSelectionFromManualSlots(manualSlots);
    const lockedCharacterIds = derivedManualSelection.lockedCharacterIds;
    const excludedCharacterIds = this.normalizeCharacterIds(constraints.excludedCharacterIds);
    const captainCharacterId = derivedManualSelection.captainCharacterId;
    const friendCaptainCharacterId = derivedManualSelection.friendCaptainCharacterId;
    const manualShipId = this.normalizeCharacterId(constraints.manualShipId);
    const excludedShipIds = this.normalizeCharacterIds(constraints.excludedShipIds);
    const leaderBoostFilters = this.normalizeLeaderBoostFilters(constraints.leaderBoostFilters);
    const leaderBoostRanges = this.normalizeLeaderBoostRanges(constraints.leaderBoostRanges);
    const costRange = this.normalizeCostRange(constraints.costRange);

    const input: AutoBuildInput = {
      types: normalizedTypes.length > 0 ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClasses: normalizedClasses,
      requireAllSelectedTypesInTeam: constraints.requireAllSelectedTypesInTeam ?? false,
      requireAllSelectedClassesPerCharacter:
        constraints.requireAllSelectedClassesPerCharacter ?? false,
      requireAllSlotsInLeaderSuperEffectScope,
      minimumLeaderSuperEffectMatchingSlots: requireAllSlotsInLeaderSuperEffectScope
        ? (constraints.minimumLeaderSuperEffectMatchingSlots ?? AUTO_BUILD_TOTAL_SLOT_COUNT)
        : null,
      requireLeaderSuperSpecialCriteria: constraints.requireLeaderSuperSpecialCriteria ?? true,
      requireUniqueBaseCharacterNames: constraints.requireUniqueBaseCharacterNames ?? false,
      requiredAbilities,
      enemyMechanics,
      favoritesOnly,
      allowAnyFriendCaptainAutoFill,
      favoriteShipsOnly,
      favoriteShipIds,
      leaderBoostFilters,
      leaderBoostRanges,
      costRange,
      manualSlots,
      lockedCharacterIds,
      excludedCharacterIds,
      captainCharacterId,
      friendCaptainCharacterId,
      manualShipId,
      excludedShipIds,
      candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
    };
    const requestedInput: AutoBuildInput = {
      ...input,
      types: [...input.types],
      selectedClasses: [...input.selectedClasses],
      requiredAbilities: input.requiredAbilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
      })),
      enemyMechanics: input.enemyMechanics.map((mechanic) => ({
        ...mechanic,
        triggerTags: [...mechanic.triggerTags],
        responseTags: [...mechanic.responseTags],
        conditionTags: [...mechanic.conditionTags],
      })),
      favoriteShipIds: [...input.favoriteShipIds],
      leaderBoostFilters: [...input.leaderBoostFilters],
      leaderBoostRanges: this.cloneLeaderBoostRanges(input.leaderBoostRanges),
      costRange: { ...input.costRange },
      manualSlots: input.manualSlots.map((slot) => ({
        role: slot.role,
        characterIds: [...slot.characterIds],
      })),
      lockedCharacterIds: [...input.lockedCharacterIds],
      excludedCharacterIds: [...input.excludedCharacterIds],
      excludedShipIds: [...input.excludedShipIds],
    };

    if (favoritesOnly && favoriteCharacterIds.size === 0) {
      return null;
    }

    const hasExplicitCandidateScope = constraints.candidateCharacterIds !== undefined;
    const allowedCharacterIds = hasExplicitCandidateScope
      ? candidateCharacterIds.filter(
          (characterId) => !favoritesOnly || favoriteCharacterIds.has(characterId),
        )
      : favoritesOnly
        ? [...favoriteCharacterIds]
        : undefined;

    if (hasExplicitCandidateScope && (allowedCharacterIds?.length ?? 0) === 0) {
      return null;
    }

    const requestedLeaderIds = [captainCharacterId, friendCaptainCharacterId].filter(
      (characterId): characterId is number =>
        characterId !== null && Number.isInteger(characterId) && characterId > 0,
    );

    if (requestedLeaderIds.some((characterId) => !lockedCharacterIds.includes(characterId))) {
      return null;
    }

    this.throwIfCancelled(executionOptions.signal);
    this.emitProgress(executionOptions, {
      stage: 'loadingCandidates',
      candidateCount: 0,
      completedAttempts: 0,
      totalAttempts: 0,
      attemptCountFinal: false,
      elapsedMs: 0,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.loadingCandidates',
    });

    const hasManualFriendCaptain =
      manualSlots.find((slot) => slot.role === 'friendCaptain')?.characterIds.length ?? 0;
    const shouldFetchAnyFriendCaptainRecords =
      requestedInput.allowAnyFriendCaptainAutoFill && !hasManualFriendCaptain;
    const records = await this.repository.getAutoBuilderCandidates(
      requestedInput.types,
      requestedInput.candidateLimit,
      {
        selectedClasses: requestedInput.selectedClasses,
        allowedCharacterIds,
        lockedCharacterIds,
        excludedCharacterIds,
        costRange: this.hasActiveCostRange(requestedInput.costRange)
          ? requestedInput.costRange
          : undefined,
      },
    );
    const friendCaptainRecords = shouldFetchAnyFriendCaptainRecords
      ? await this.repository.getAutoBuilderCandidates([...AUTO_TEAM_BUILDER_TYPES], null, {
          lockedCharacterIds,
          excludedCharacterIds,
          costRange: this.hasActiveCostRange(requestedInput.costRange)
            ? requestedInput.costRange
            : undefined,
        })
      : undefined;
    const scopedFriendCaptainRecords =
      friendCaptainRecords && this.hasActiveCostRange(requestedInput.costRange)
        ? friendCaptainRecords.filter((record) =>
            this.characterMatchesCostRange(record, requestedInput.costRange),
          )
        : friendCaptainRecords;
    const resolvedAutoFillCharacterIds = this.resolveAutoFillCharacterIds(
      records,
      allowedCharacterIds,
      requestedInput.costRange,
    );

    this.throwIfCancelled(executionOptions.signal);

    const shipsPromise =
      typeof this.repository.getShips === 'function'
        ? this.repository.getShips()
        : Promise.resolve([]);
    const [result, ships] = await Promise.all([
      this.executeSearch(
        records,
        requestedInput,
        executionOptions,
        scopedFriendCaptainRecords,
        resolvedAutoFillCharacterIds,
      ),
      shipsPromise,
    ]);

    if (!result) {
      return null;
    }

    return {
      ...result,
      shipSelection: resolveAutoBuildShipSelection(result, ships),
    };
  }

  public async buildRankedTeamsFromRoster(
    rosterInput: AutoBuildRosterInput,
    executionOptions: AutoTeamBuildExecutionOptions = {},
  ): Promise<AutoBuildRankedResults> {
    const normalizedRosterIds = this.normalizeCharacterIds(rosterInput.rosterCharacterIds);
    const resultLimit = this.normalizeRankedResultLimit(rosterInput.resultLimit);
    const requiredAbilities = this.normalizeRequiredAbilities(rosterInput.requiredAbilities ?? []);
    const enemyMechanics = normalizeEnemyMechanicRequirements(rosterInput.enemyMechanics ?? []);
    const excludedCharacterIds = this.normalizeCharacterIds(rosterInput.excludedCharacterIds);
    const favoriteCharacterIds = new Set(
      this.normalizeCharacterIds(rosterInput.favoriteCharacterIds),
    );
    const candidateCharacterIds = this.normalizeCharacterIds(rosterInput.candidateCharacterIds);
    const rosterCostRange = this.normalizeCostRange(rosterInput.costRange);
    const favoritesOnly = rosterInput.favoritesOnly ?? false;
    const scopedRosterIds = normalizedRosterIds.filter((characterId) => {
      if (excludedCharacterIds.includes(characterId)) {
        return false;
      }

      if (
        favoritesOnly &&
        favoriteCharacterIds.size > 0 &&
        !favoriteCharacterIds.has(characterId)
      ) {
        return false;
      }

      if (
        rosterInput.candidateCharacterIds !== undefined &&
        candidateCharacterIds.length > 0 &&
        !candidateCharacterIds.includes(characterId)
      ) {
        return false;
      }

      return true;
    });
    const captainCharacterId = this.normalizeCharacterId(rosterInput.captainCharacterId);
    const friendCaptainCharacterId = this.normalizeCharacterId(
      rosterInput.friendCaptainCharacterId,
    );
    const lockedLeaderIds = [
      ...new Set(
        [captainCharacterId, friendCaptainCharacterId].filter(
          (characterId): characterId is number => characterId !== null,
        ),
      ),
    ];

    if (
      normalizedRosterIds.length === 0 ||
      lockedLeaderIds.some((characterId) => !normalizedRosterIds.includes(characterId))
    ) {
      return {
        results: [],
        totalResults: 0,
        limit: resultLimit,
      };
    }

    this.throwIfCancelled(executionOptions.signal);

    const records = await this.repository.getAutoBuilderCandidates(
      [...AUTO_TEAM_BUILDER_TYPES],
      null,
      {
        allowedCharacterIds: scopedRosterIds,
        lockedCharacterIds: lockedLeaderIds,
        excludedCharacterIds,
        costRange: this.hasActiveCostRange(rosterCostRange) ? rosterCostRange : undefined,
      },
    );

    this.throwIfCancelled(executionOptions.signal);

    const recordById = new Map(records.map((record) => [record.id, record] as const));
    const availableRosterIds = [
      ...new Set(
        scopedRosterIds
          .filter((characterId) => recordById.has(characterId))
          .concat(lockedLeaderIds),
      ),
    ].filter((characterId, index, values) => values.indexOf(characterId) === index);

    if (availableRosterIds.length < 5) {
      return {
        results: [],
        totalResults: 0,
        limit: resultLimit,
      };
    }

    const orderById = new Map(records.map((record, index) => [record.id, index] as const));
    const rankedResults = new Map<string, AutoBuildRankedResult>();
    const leaderPairs = this.enumerateRosterLeaderPairs(
      availableRosterIds,
      captainCharacterId,
      friendCaptainCharacterId,
    );

    for (const leaderPair of leaderPairs) {
      this.throwIfCancelled(executionOptions.signal);

      const excludedSubIds = new Set<number>([leaderPair.captainId, leaderPair.friendCaptainId]);
      const subPoolIds = availableRosterIds.filter(
        (characterId) => !excludedSubIds.has(characterId),
      );

      if (subPoolIds.length < AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.length) {
        continue;
      }

      for (const subIds of this.enumerateSubCombinations(
        subPoolIds,
        AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.length,
      )) {
        this.throwIfCancelled(executionOptions.signal);

        const teamCharacterIds = [
          ...new Set([leaderPair.captainId, leaderPair.friendCaptainId, ...subIds]),
        ];
        const teamRecords = teamCharacterIds
          .map((characterId) => recordById.get(characterId) ?? null)
          .filter((record): record is CharacterDetailRecord => Boolean(record))
          .sort((left, right) => (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0));

        if (teamRecords.length !== teamCharacterIds.length) {
          continue;
        }

        const input = this.createRosterTeamInput(
          leaderPair.captainId,
          leaderPair.friendCaptainId,
          subIds,
          {
            ...rosterInput,
            requiredAbilities,
            enemyMechanics,
          },
        );
        const result = buildAutoTeamResult(teamRecords, input);

        if (!result) {
          continue;
        }

        const teamKey = this.buildRankedTeamKey(result);

        if (rankedResults.has(teamKey)) {
          continue;
        }

        const characters = result.slots.map((slot) => slot.character);
        const abilityBreakdown = buildAutoBuildAbilityCoverageBreakdown(characters);
        const recencyScore = characters.reduce((total, character) => {
          const index = orderById.get(character.id) ?? 0;
          const nextScore = records.length <= 1 ? 1 : 1 - index / (records.length - 1);

          return total + nextScore;
        }, 0);

        rankedResults.set(teamKey, {
          ...result,
          teamKey,
          abilityBreakdown,
          ranking: {
            distinctAbilityCount: abilityBreakdown.distinctAbilityCount,
            utilityCoverageCount: result.coverage.utility.length,
            burstCoverageCount: result.coverage.burst.length,
            consistencyCoverageCount: result.coverage.consistency.length,
            powerScore: resolveAutoBuildTeamPowerPreferenceScore(characters),
            recencyScore,
          },
        });
      }
    }

    const sortedResults = [...rankedResults.values()]
      .sort((left, right) => this.compareRankedResults(left, right))
      .slice(0, resultLimit);

    return {
      results: sortedResults,
      totalResults: sortedResults.length,
      limit: resultLimit,
    };
  }

  private async executeSearch(
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
    friendCaptainRecords?: CharacterDetailRecord[],
    autoFillCharacterIds?: number[],
  ): Promise<AutoBuildResult | null> {
    const fallbackPlanner = createAutoTeamBuildFallbackPlanner(requestedInput, records);
    const requestedWorkerCount = this.normalizeWorkerCount(executionOptions.workerCount);

    if (requestedWorkerCount > 1 && fallbackPlanner.hasPotentialFallbackAttempts()) {
      try {
        return await this.runSearchWithWorkerPool(
          records,
          requestedInput,
          executionOptions,
          fallbackPlanner,
          requestedWorkerCount,
          friendCaptainRecords,
          autoFillCharacterIds,
        );
      } catch (error) {
        if (isAutoTeamBuildCancelledError(error)) {
          throw error;
        }

        return runAutoTeamBuildSearch(records, requestedInput, {
          onProgress: executionOptions.onProgress,
          isCancelled: () => executionOptions.signal?.aborted ?? false,
          friendCaptainRecords,
          autoFillCharacterIds,
        });
      }
    }

    const worker = this.createWorker();

    if (!worker) {
      return runAutoTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
        isCancelled: () => executionOptions.signal?.aborted ?? false,
        friendCaptainRecords,
        autoFillCharacterIds,
      });
    }

    try {
      return await this.runSearchInWorker(
        worker,
        records,
        requestedInput,
        executionOptions,
        friendCaptainRecords,
        autoFillCharacterIds,
      );
    } catch (error) {
      worker.terminate();

      if (isAutoTeamBuildCancelledError(error)) {
        throw error;
      }

      return runAutoTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
        isCancelled: () => executionOptions.signal?.aborted ?? false,
        friendCaptainRecords,
        autoFillCharacterIds,
      });
    }
  }

  private async runSearchWithWorkerPool(
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
    fallbackPlanner: AutoTeamBuildFallbackPlanner,
    requestedWorkerCount: number,
    friendCaptainRecords?: CharacterDetailRecord[],
    autoFillCharacterIds?: number[],
  ): Promise<AutoBuildResult | null> {
    const workers = this.createWorkerPool(requestedWorkerCount);

    if (workers.length <= 1) {
      workers.forEach((worker) => worker.terminate());
      const singleWorker = this.createWorker();

      if (!singleWorker) {
        return runAutoTeamBuildSearch(records, requestedInput, {
          onProgress: executionOptions.onProgress,
          isCancelled: () => executionOptions.signal?.aborted ?? false,
          friendCaptainRecords,
          autoFillCharacterIds,
        });
      }

      return this.runSearchInWorker(
        singleWorker,
        records,
        requestedInput,
        executionOptions,
        friendCaptainRecords,
        autoFillCharacterIds,
      );
    }

    try {
      await Promise.all(
        workers.map((worker) =>
          this.initializeWorker(
            worker,
            records,
            executionOptions.signal,
            friendCaptainRecords,
            autoFillCharacterIds,
          ),
        ),
      );

      const timingState = this.createTimingState();
      const projectedTotalAttempts = fallbackPlanner.getProjectedTotalAttempts();

      this.throwIfCancelled(executionOptions.signal);
      this.emitProgress(executionOptions, {
        stage: 'preparingSearch',
        candidateCount: records.length,
        completedAttempts: 0,
        totalAttempts: 0,
        attemptCountFinal: false,
        elapsedMs: 0,
        estimatedRemainingMs: null,
        averageFallbackAttemptMs: null,
        completedFallbackAttempts: 0,
        currentDroppedTypes: [],
        currentDroppedClasses: [],
        currentAllowedLeadersWithSuperEffects: false,
        currentIgnoredLeaderSuperSpecialCriteria: false,
        messageKey: 'progress.preparingSearch',
      });

      this.emitProgress(executionOptions, {
        stage: 'exactAttempt',
        candidateCount: records.length,
        completedAttempts: 0,
        totalAttempts: projectedTotalAttempts,
        attemptCountFinal: fallbackPlanner.isAttemptCountFinal(),
        ...this.buildTimingSnapshot(timingState, projectedTotalAttempts, 0, workers.length),
        currentDroppedTypes: [],
        currentDroppedClasses: [],
        currentAllowedLeadersWithSuperEffects: false,
        currentIgnoredLeaderSuperSpecialCriteria: false,
        messageKey: 'progress.exactAttempt',
        messageParams: {
          current: 1,
          total: projectedTotalAttempts,
        },
      });

      // Wait point 1: the exact attempt always runs first so pooled fallbacks only start once
      // the strictest search has definitively failed to satisfy the requested coverage.
      const exactResult = await this.runAttemptInInitializedWorker(
        workers[0],
        requestedInput,
        requestedInput,
        !requestedInput.requireAllSlotsInLeaderSuperEffectScope,
        executionOptions.signal,
        friendCaptainRecords,
        autoFillCharacterIds,
      );

      if (satisfiesRequestedAutoTeamBuildCoverage(exactResult)) {
        this.emitProgress(executionOptions, {
          stage: 'completed',
          candidateCount: records.length,
          completedAttempts: 1,
          totalAttempts: 1,
          attemptCountFinal: true,
          ...this.buildTimingSnapshot(timingState, 1, 1, workers.length),
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentAllowedLeadersWithSuperEffects: false,
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: 'progress.completed',
        });
        return exactResult;
      }

      fallbackPlanner.scheduleInitialFallbackAttempts();

      if (!fallbackPlanner.hasPendingScheduledAttempts()) {
        this.emitProgress(executionOptions, {
          stage: 'completed',
          candidateCount: records.length,
          completedAttempts: 1,
          totalAttempts: fallbackPlanner.getTotalAttempts(),
          attemptCountFinal: true,
          ...this.buildTimingSnapshot(
            timingState,
            fallbackPlanner.getTotalAttempts(),
            1,
            workers.length,
          ),
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentAllowedLeadersWithSuperEffects: false,
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: 'progress.completed',
        });
        return null;
      }

      const result = await this.runPooledFallbackAttempts(
        workers,
        records,
        fallbackPlanner,
        requestedInput,
        executionOptions,
        timingState,
        records.length,
        friendCaptainRecords,
        autoFillCharacterIds,
      );

      return result;
    } finally {
      workers.forEach((worker) => worker.terminate());
    }
  }

  private runSearchInWorker(
    worker: Worker,
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
    friendCaptainRecords?: CharacterDetailRecord[],
    autoFillCharacterIds?: number[],
  ): Promise<AutoBuildResult | null> {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise<AutoBuildResult | null>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        executionOptions.signal?.removeEventListener('abort', handleAbort);
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      };
      const resolveOnce = (result: AutoBuildResult | null): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        worker.terminate();
        resolve(result);
      };
      const rejectOnce = (error: unknown): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        worker.terminate();
        reject(error);
      };
      const handleAbort = (): void => {
        rejectOnce(new AutoTeamBuildCancelledError());
      };
      const handleError = (event: ErrorEvent): void => {
        rejectOnce(new Error(event.message || 'Auto team builder worker failed.'));
      };
      const handleMessage = ({ data }: MessageEvent<AutoTeamBuilderWorkerResponse>): void => {
        if (!data || data.type === 'ready' || data.runId !== runId) {
          return;
        }

        if (data.type === 'progress') {
          executionOptions.onProgress?.(data.snapshot);
          return;
        }

        if (data.type === 'result') {
          resolveOnce(data.result);
          return;
        }

        if (data.type === 'error') {
          rejectOnce(new Error(data.errorMessage));
        }
      };

      if (executionOptions.signal?.aborted) {
        handleAbort();
        return;
      }

      executionOptions.signal?.addEventListener('abort', handleAbort, { once: true });
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      const request: AutoTeamBuilderWorkerRequest = {
        type: 'run',
        runId,
        records,
        friendCaptainRecords,
        autoFillCharacterIds,
        requestedInput,
      };

      worker.postMessage(request);
    });
  }

  private initializeWorker(
    worker: Worker,
    records: CharacterDetailRecord[],
    signal?: AbortSignal,
    friendCaptainRecords?: CharacterDetailRecord[],
    autoFillCharacterIds?: number[],
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        signal?.removeEventListener('abort', handleAbort);
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      };
      const resolveOnce = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve();
      };
      const rejectOnce = (error: unknown): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      };
      const handleAbort = (): void => {
        rejectOnce(new AutoTeamBuildCancelledError());
      };
      const handleError = (event: ErrorEvent): void => {
        rejectOnce(new Error(event.message || 'Auto team builder worker failed.'));
      };
      const handleMessage = ({ data }: MessageEvent<AutoTeamBuilderWorkerResponse>): void => {
        if (!data) {
          return;
        }

        if (data.type === 'ready') {
          resolveOnce();
          return;
        }

        if (data.type === 'error' && typeof data.runId === 'undefined') {
          rejectOnce(new Error(data.errorMessage));
        }
      };

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      signal?.addEventListener('abort', handleAbort, { once: true });
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.postMessage({
        type: 'init',
        records,
        friendCaptainRecords,
        autoFillCharacterIds,
      } satisfies AutoTeamBuilderWorkerRequest);
    });
  }

  private runAttemptInInitializedWorker(
    worker: Worker,
    input: AutoBuildInput,
    requestedInput: AutoBuildInput,
    requireLeadersWithoutSuperEffects: boolean,
    signal?: AbortSignal,
    friendCaptainRecords?: CharacterDetailRecord[],
    autoFillCharacterIds?: number[],
  ): Promise<AutoBuildResult | null> {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise<AutoBuildResult | null>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        signal?.removeEventListener('abort', handleAbort);
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      };
      const resolveOnce = (result: AutoBuildResult | null): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(result);
      };
      const rejectOnce = (error: unknown): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      };
      const handleAbort = (): void => {
        rejectOnce(new AutoTeamBuildCancelledError());
      };
      const handleError = (event: ErrorEvent): void => {
        rejectOnce(new Error(event.message || 'Auto team builder worker failed.'));
      };
      const handleMessage = ({ data }: MessageEvent<AutoTeamBuilderWorkerResponse>): void => {
        if (!data || data.type === 'ready' || data.runId !== runId) {
          return;
        }

        if (data.type === 'result') {
          resolveOnce(data.result);
          return;
        }

        if (data.type === 'error') {
          rejectOnce(new Error(data.errorMessage));
        }
      };

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      signal?.addEventListener('abort', handleAbort, { once: true });
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      worker.postMessage({
        type: 'runAttempt',
        runId,
        input,
        requestedInput,
        requireLeadersWithoutSuperEffects,
        friendCaptainRecords,
        autoFillCharacterIds,
      } satisfies AutoTeamBuilderWorkerRequest);
    });
  }

  private runPooledFallbackAttempts(
    workers: Worker[],
    records: CharacterDetailRecord[],
    fallbackPlanner: AutoTeamBuildFallbackPlanner,
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
    timingState: AutoTeamBuildTimingState,
    candidateCount: number,
    friendCaptainRecords?: CharacterDetailRecord[],
    autoFillCharacterIds?: number[],
  ): Promise<AutoBuildResult | null> {
    return new Promise<AutoBuildResult | null>((resolve, reject) => {
      const completedAttempts = new Map<number, PooledFallbackAttemptResult>();
      const managedWorkers = new Map<Worker, PooledWorkerState>();
      const availableWorkers: PooledWorkerState[] = [];
      let settled = false;
      let inFlightCount = 0;
      let pendingWorkerInitializations = 0;
      let growthDisabled = false;

      workers.forEach((worker) => {
        const state: PooledWorkerState = {
          worker,
          busy: false,
          retiring: false,
        };

        managedWorkers.set(worker, state);
        availableWorkers.push(state);
      });

      const getActiveWorkerCount = (): number => Math.max(1, managedWorkers.size);
      const getDesiredWorkerCount = (): number =>
        this.resolveDesiredWorkerCount(executionOptions, workers.length);
      const removeAvailableWorker = (state: PooledWorkerState): void => {
        const index = availableWorkers.indexOf(state);

        if (index >= 0) {
          availableWorkers.splice(index, 1);
        }
      };
      const terminateWorkerState = (state: PooledWorkerState): void => {
        removeAvailableWorker(state);
        managedWorkers.delete(state.worker);
        state.busy = false;
        state.retiring = true;
        state.worker.terminate();
      };
      const reconcilePoolSize = (): void => {
        if (settled) {
          return;
        }

        const desiredWorkerCount = getDesiredWorkerCount();
        let shrinkBy = managedWorkers.size + pendingWorkerInitializations - desiredWorkerCount;

        while (shrinkBy > 0 && availableWorkers.length > 0) {
          const state = availableWorkers.pop();

          if (!state) {
            break;
          }

          terminateWorkerState(state);
          shrinkBy -= 1;
        }

        if (shrinkBy > 0) {
          for (const state of managedWorkers.values()) {
            if (shrinkBy <= 0) {
              break;
            }

            if (state.busy && !state.retiring) {
              state.retiring = true;
              shrinkBy -= 1;
            }
          }
        }

        if (
          growthDisabled ||
          pendingWorkerInitializations > 0 ||
          !fallbackPlanner.hasPendingScheduledAttempts() ||
          managedWorkers.size >= desiredWorkerCount
        ) {
          return;
        }

        const missingWorkerCount = desiredWorkerCount - managedWorkers.size;

        for (let index = 0; index < missingWorkerCount; index += 1) {
          const worker = this.createWorker();

          if (!worker) {
            growthDisabled = true;
            break;
          }

          workers.push(worker);
          pendingWorkerInitializations += 1;

          void this.initializeWorker(
            worker,
            records,
            executionOptions.signal,
            friendCaptainRecords,
            autoFillCharacterIds,
          )
            .then(() => {
              pendingWorkerInitializations -= 1;

              if (settled) {
                worker.terminate();
                return;
              }

              const state: PooledWorkerState = {
                worker,
                busy: false,
                retiring: false,
              };

              managedWorkers.set(worker, state);
              availableWorkers.push(state);
              reconcilePoolSize();

              if (!settled) {
                dispatchAvailableAttempts();
              }
            })
            .catch(() => {
              pendingWorkerInitializations -= 1;
              growthDisabled = true;
              worker.terminate();

              if (!settled) {
                reconcilePoolSize();
              }
            });
        }
      };

      const resolveOnce = (result: AutoBuildResult | null, completedAttemptCount: number): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.emitProgress(executionOptions, {
          stage: 'completed',
          candidateCount,
          completedAttempts: completedAttemptCount,
          totalAttempts: fallbackPlanner.getTotalAttempts(),
          attemptCountFinal: true,
          ...this.buildTimingSnapshot(
            timingState,
            fallbackPlanner.getTotalAttempts(),
            completedAttemptCount,
            getActiveWorkerCount(),
          ),
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentAllowedLeadersWithSuperEffects: false,
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: 'progress.completed',
        });
        resolve(result);
      };
      const rejectOnce = (error: unknown): void => {
        if (settled) {
          return;
        }

        settled = true;
        reject(error);
      };
      const tryResolveOrderedResult = (): void => {
        // Wait point 2: pooled fallback results resolve in planned order on purpose, so a later
        // successful attempt can still wait behind earlier unfinished attempts.
        for (
          let index = 0;
          index < fallbackPlanner.getScheduledFallbackAttemptCount();
          index += 1
        ) {
          const currentAttempt = completedAttempts.get(index);

          if (!currentAttempt) {
            return;
          }

          if (satisfiesRequestedAutoTeamBuildCoverage(currentAttempt.result)) {
            resolveOnce(currentAttempt.result, index + 2);
            return;
          }
        }

        if (
          fallbackPlanner.isAttemptCountFinal() &&
          !fallbackPlanner.hasPendingScheduledAttempts() &&
          inFlightCount === 0
        ) {
          resolveOnce(null, fallbackPlanner.getTotalAttempts());
        }
      };
      const dispatchAvailableAttempts = (): void => {
        if (settled) {
          return;
        }

        if (executionOptions.signal?.aborted) {
          rejectOnce(new AutoTeamBuildCancelledError());
          return;
        }

        reconcilePoolSize();

        while (availableWorkers.length > 0) {
          const nextAttempt = fallbackPlanner.takeNextScheduledAttempt();

          if (!nextAttempt) {
            break;
          }

          const workerState = availableWorkers.shift();

          if (!workerState || workerState.retiring || !managedWorkers.has(workerState.worker)) {
            break;
          }

          workerState.busy = true;
          inFlightCount += 1;
          this.emitProgress(executionOptions, {
            stage: 'fallbackAttempt',
            candidateCount,
            completedAttempts: 1 + timingState.completedFallbackAttempts,
            totalAttempts: fallbackPlanner.getTotalAttempts(),
            attemptCountFinal: fallbackPlanner.isAttemptCountFinal(),
            ...this.buildTimingSnapshot(
              timingState,
              fallbackPlanner.getTotalAttempts(),
              1 + timingState.completedFallbackAttempts,
              getActiveWorkerCount(),
            ),
            currentDroppedTypes: nextAttempt.droppedTypes,
            currentDroppedClasses: nextAttempt.droppedClasses,
            currentAllowedLeadersWithSuperEffects: nextAttempt.allowedLeadersWithSuperEffects,
            currentIgnoredLeaderSuperSpecialCriteria: Boolean(
              nextAttempt.ignoredLeaderSuperSpecialCriteria,
            ),
            messageKey: 'progress.fallbackAttempt',
            messageParams: {
              current: nextAttempt.sequence + 2,
              total: fallbackPlanner.getTotalAttempts(),
            },
          });

          const startedAt = timingState.now();
          void this.runAttemptInInitializedWorker(
            workerState.worker,
            nextAttempt.input,
            requestedInput,
            nextAttempt.requireLeadersWithoutSuperEffects,
            executionOptions.signal,
            friendCaptainRecords,
            autoFillCharacterIds,
          )
            .then((result) => {
              if (settled) {
                return;
              }

              inFlightCount -= 1;
              timingState.totalCompletedFallbackMs += Math.max(0, timingState.now() - startedAt);
              timingState.completedFallbackAttempts += 1;
              completedAttempts.set(nextAttempt.sequence, {
                result,
              });
              workerState.busy = false;

              if (workerState.retiring) {
                terminateWorkerState(workerState);
              } else {
                availableWorkers.push(workerState);
              }

              if (!satisfiesRequestedAutoTeamBuildCoverage(result)) {
                fallbackPlanner.recordFailedFallbackAttempt(nextAttempt);
              }

              reconcilePoolSize();
              tryResolveOrderedResult();

              if (!settled) {
                // Wait point 3: as soon as a worker finishes, dispatch the next queued fallback in
                // the same promise chain without adding any timer-based delay.
                dispatchAvailableAttempts();
              }
            })
            .catch((error) => {
              rejectOnce(error);
            });
        }

        tryResolveOrderedResult();
      };

      dispatchAvailableAttempts();
    });
  }

  private createWorker(): Worker | null {
    if (typeof Worker === 'undefined') {
      return null;
    }

    try {
      return new Worker(new URL('auto-team-builder.worker', import.meta.url), {
        type: 'module',
      });
    } catch {
      return null;
    }
  }

  private createWorkerPool(workerCount: number): Worker[] {
    const workers: Worker[] = [];

    for (let index = 0; index < workerCount; index += 1) {
      const worker = this.createWorker();

      if (!worker) {
        break;
      }

      workers.push(worker);
    }

    return workers;
  }

  private createTimingState(): AutoTeamBuildTimingState {
    const now =
      typeof globalThis.performance?.now === 'function'
        ? (): number => globalThis.performance.now()
        : (): number => Date.now();

    return {
      searchStartedAt: now(),
      totalCompletedFallbackMs: 0,
      completedFallbackAttempts: 0,
      now,
    };
  }

  private buildTimingSnapshot(
    timingState: AutoTeamBuildTimingState,
    totalAttempts: number,
    completedAttempts: number,
    activeWorkerCount: number,
  ): Pick<
    AutoBuildProgressSnapshot,
    'elapsedMs' | 'estimatedRemainingMs' | 'averageFallbackAttemptMs' | 'completedFallbackAttempts'
  > {
    const elapsedMs = Math.max(0, timingState.now() - timingState.searchStartedAt);
    const averageFallbackAttemptMs =
      timingState.completedFallbackAttempts > 0
        ? timingState.totalCompletedFallbackMs / timingState.completedFallbackAttempts
        : null;
    const remainingFallbackAttempts = Math.max(totalAttempts - completedAttempts - 1, 0);
    const estimatedRemainingMs =
      averageFallbackAttemptMs !== null && remainingFallbackAttempts > 0
        ? averageFallbackAttemptMs *
          Math.ceil(remainingFallbackAttempts / Math.max(activeWorkerCount, 1))
        : null;

    return {
      elapsedMs,
      estimatedRemainingMs,
      averageFallbackAttemptMs,
      completedFallbackAttempts: timingState.completedFallbackAttempts,
    };
  }

  private emitProgress(
    executionOptions: AutoTeamBuildExecutionOptions,
    snapshot: AutoBuildProgressSnapshot,
  ): void {
    executionOptions.onProgress?.(snapshot);
  }

  private throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new AutoTeamBuildCancelledError();
    }
  }

  private normalizeWorkerCount(workerCount: number | undefined): number {
    if (!Number.isFinite(workerCount)) {
      return 1;
    }

    return Math.max(1, Math.floor(workerCount ?? 1));
  }

  private resolveDesiredWorkerCount(
    executionOptions: AutoTeamBuildExecutionOptions,
    fallbackWorkerCount: number,
  ): number {
    try {
      return this.normalizeWorkerCount(
        executionOptions.getWorkerCount?.() ?? executionOptions.workerCount ?? fallbackWorkerCount,
      );
    } catch {
      return this.normalizeWorkerCount(executionOptions.workerCount ?? fallbackWorkerCount);
    }
  }

  private normalizeRankedResultLimit(resultLimit: number | null | undefined): number {
    if (!Number.isFinite(resultLimit)) {
      return MAX_AUTO_BUILD_RANKED_RESULT_COUNT;
    }

    return Math.max(1, Math.min(MAX_AUTO_BUILD_RANKED_RESULT_COUNT, Math.floor(resultLimit ?? 1)));
  }

  private compareRankedResults(left: AutoBuildRankedResult, right: AutoBuildRankedResult): number {
    if (right.ranking.distinctAbilityCount !== left.ranking.distinctAbilityCount) {
      return right.ranking.distinctAbilityCount - left.ranking.distinctAbilityCount;
    }

    if (right.ranking.utilityCoverageCount !== left.ranking.utilityCoverageCount) {
      return right.ranking.utilityCoverageCount - left.ranking.utilityCoverageCount;
    }

    if (right.ranking.burstCoverageCount !== left.ranking.burstCoverageCount) {
      return right.ranking.burstCoverageCount - left.ranking.burstCoverageCount;
    }

    if (right.ranking.consistencyCoverageCount !== left.ranking.consistencyCoverageCount) {
      return right.ranking.consistencyCoverageCount - left.ranking.consistencyCoverageCount;
    }

    if (right.ranking.recencyScore !== left.ranking.recencyScore) {
      return right.ranking.recencyScore - left.ranking.recencyScore;
    }

    return left.teamKey.localeCompare(right.teamKey);
  }

  private createRosterTeamInput(
    captainCharacterId: number,
    friendCaptainCharacterId: number,
    subIds: number[],
    rosterInput: AutoBuildRosterInput & {
      requiredAbilities: AutoBuildAbilityRequirement[];
      enemyMechanics: AutoBuildInput['enemyMechanics'];
    },
  ): AutoBuildInput {
    const requireAllSlotsInLeaderSuperEffectScope =
      rosterInput.requireAllSlotsInLeaderSuperEffectScope ?? false;

    return {
      types: [...AUTO_TEAM_BUILDER_TYPES],
      selectedClasses: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSlotsInLeaderSuperEffectScope,
      minimumLeaderSuperEffectMatchingSlots: requireAllSlotsInLeaderSuperEffectScope
        ? (rosterInput.minimumLeaderSuperEffectMatchingSlots ?? AUTO_BUILD_TOTAL_SLOT_COUNT)
        : null,
      requireLeaderSuperSpecialCriteria: rosterInput.requireLeaderSuperSpecialCriteria ?? true,
      requireUniqueBaseCharacterNames: rosterInput.requireUniqueBaseCharacterNames ?? false,
      requiredAbilities: rosterInput.requiredAbilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
      })),
      enemyMechanics: rosterInput.enemyMechanics.map((mechanic) => ({
        ...mechanic,
        triggerTags: [...mechanic.triggerTags],
        responseTags: [...mechanic.responseTags],
        conditionTags: [...mechanic.conditionTags],
      })),
      favoritesOnly: false,
      allowAnyFriendCaptainAutoFill: false,
      favoriteShipsOnly: false,
      favoriteShipIds: [],
      leaderBoostFilters: this.normalizeLeaderBoostFilters(rosterInput.leaderBoostFilters),
      leaderBoostRanges: this.normalizeLeaderBoostRanges(rosterInput.leaderBoostRanges),
      costRange: this.normalizeCostRange(rosterInput.costRange),
      manualSlots: this.createExactManualSlots(
        captainCharacterId,
        friendCaptainCharacterId,
        subIds,
      ),
      lockedCharacterIds: [...new Set([captainCharacterId, friendCaptainCharacterId, ...subIds])],
      excludedCharacterIds: [],
      captainCharacterId,
      friendCaptainCharacterId,
      manualShipId: null,
      excludedShipIds: [],
      candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
    };
  }

  private createExactManualSlots(
    captainCharacterId: number,
    friendCaptainCharacterId: number,
    subIds: number[],
  ): AutoBuildManualSlotSelection[] {
    const manualSlots = createEmptyAutoBuildManualSlots();

    manualSlots.find((slot) => slot.role === 'captain')!.characterIds = [captainCharacterId];
    manualSlots.find((slot) => slot.role === 'friendCaptain')!.characterIds = [
      friendCaptainCharacterId,
    ];

    AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.forEach((role, index) => {
      const characterId = subIds[index];
      const slot = manualSlots.find((entry) => entry.role === role);

      if (slot && characterId) {
        slot.characterIds = [characterId];
      }
    });

    return manualSlots;
  }

  private buildRankedTeamKey(result: Pick<AutoBuildRankedResult, 'slots'>): string {
    const leaderIds = result.slots
      .filter((slot) => slot.role === 'captain' || slot.role === 'friendCaptain')
      .map((slot) => slot.character.id)
      .sort((left, right) => left - right);
    const subIds = result.slots
      .filter((slot) => slot.role === 'sub')
      .map((slot) => slot.character.id)
      .sort((left, right) => left - right);

    return `${leaderIds.join(',')}|${subIds.join(',')}`;
  }

  private enumerateRosterLeaderPairs(
    rosterCharacterIds: number[],
    captainCharacterId: number | null,
    friendCaptainCharacterId: number | null,
  ): Array<{ captainId: number; friendCaptainId: number }> {
    if (captainCharacterId !== null && friendCaptainCharacterId !== null) {
      return [
        {
          captainId: captainCharacterId,
          friendCaptainId: friendCaptainCharacterId,
        },
      ];
    }

    if (captainCharacterId !== null) {
      return rosterCharacterIds.map((characterId) => ({
        captainId: captainCharacterId,
        friendCaptainId: characterId,
      }));
    }

    if (friendCaptainCharacterId !== null) {
      return rosterCharacterIds.map((characterId) => ({
        captainId: characterId,
        friendCaptainId: friendCaptainCharacterId,
      }));
    }

    const leaderPairs: Array<{ captainId: number; friendCaptainId: number }> = [];

    rosterCharacterIds.forEach((captainId, captainIndex) => {
      rosterCharacterIds.slice(captainIndex).forEach((friendCaptainId) => {
        leaderPairs.push({
          captainId,
          friendCaptainId,
        });
      });
    });

    return leaderPairs;
  }

  private *enumerateSubCombinations(
    candidateIds: number[],
    requiredCount: number,
    startIndex = 0,
    currentSelection: number[] = [],
  ): Generator<number[]> {
    if (currentSelection.length === requiredCount) {
      yield [...currentSelection];
      return;
    }

    for (let index = startIndex; index < candidateIds.length; index += 1) {
      currentSelection.push(candidateIds[index]);
      yield* this.enumerateSubCombinations(
        candidateIds,
        requiredCount,
        index + 1,
        currentSelection,
      );
      currentSelection.pop();
    }
  }

  private normalizeCharacterId(characterId: number | null | undefined): number | null {
    return Number.isInteger(characterId) && Number(characterId) > 0 ? Number(characterId) : null;
  }

  private normalizeCharacterIds(characterIds: number[] | undefined): number[] {
    return [
      ...new Set(
        (characterIds ?? [])
          .map((characterId) => this.normalizeCharacterId(characterId))
          .filter((characterId): characterId is number => characterId !== null),
      ),
    ];
  }

  private resolveAutoFillCharacterIds(
    records: CharacterDetailRecord[],
    allowedCharacterIds: number[] | undefined,
    costRange: AutoBuildCostRange,
  ): number[] | undefined {
    const hasCostRange = this.hasActiveCostRange(costRange);

    if (!allowedCharacterIds && !hasCostRange) {
      return undefined;
    }

    const allowedCharacterIdSet = allowedCharacterIds ? new Set(allowedCharacterIds) : null;

    return records
      .filter((record) => {
        if (allowedCharacterIdSet && !allowedCharacterIdSet.has(record.id)) {
          return false;
        }

        return !hasCostRange || this.characterMatchesCostRange(record, costRange);
      })
      .map((record) => record.id);
  }

  private normalizeLeaderBoostFilters(
    filters: AutoBuildLeaderBoostFilter[] | undefined,
  ): AutoBuildLeaderBoostFilter[] {
    const normalizedFilters = [
      ...new Set(
        (Array.isArray(filters) ? filters : AUTO_BUILD_LEADER_BOOST_FILTERS).filter(
          (filter): filter is AutoBuildLeaderBoostFilter =>
            AUTO_BUILD_LEADER_BOOST_FILTERS.includes(filter as AutoBuildLeaderBoostFilter),
        ),
      ),
    ];

    return normalizedFilters.length > 0 ? normalizedFilters : [...AUTO_BUILD_LEADER_BOOST_FILTERS];
  }

  private normalizeLeaderBoostRanges(
    ranges: AutoBuildConstraints['leaderBoostRanges'],
  ): AutoBuildLeaderBoostRanges {
    const normalizedRanges = createEmptyAutoBuildLeaderBoostRanges();

    for (const filter of AUTO_BUILD_LEADER_BOOST_FILTERS) {
      normalizedRanges[filter] = this.normalizeLeaderBoostRange(ranges?.[filter]);
    }

    return normalizedRanges;
  }

  private normalizeLeaderBoostRange(
    range: Partial<AutoBuildLeaderBoostRange> | null | undefined,
  ): AutoBuildLeaderBoostRange {
    return {
      min: this.normalizeLeaderBoostRangeBound(range?.min),
      max: this.normalizeLeaderBoostRangeBound(range?.max),
    };
  }

  private normalizeLeaderBoostRangeBound(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
  }

  private normalizeCostRange(range: AutoBuildConstraints['costRange']): AutoBuildCostRange {
    const normalizedRange = createEmptyAutoBuildCostRange();

    normalizedRange.min = this.normalizeCostRangeBound(range?.min);
    normalizedRange.max = this.normalizeCostRangeBound(range?.max);

    return normalizedRange;
  }

  private normalizeCostRangeBound(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsedValue = Number(value);

    return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null;
  }

  private hasActiveCostRange(range: AutoBuildCostRange): boolean {
    return range.min !== null || range.max !== null;
  }

  private characterMatchesCostRange(
    character: Pick<CharacterDetailRecord, 'cost'>,
    range: AutoBuildCostRange,
  ): boolean {
    if (range.min !== null && character.cost < range.min) {
      return false;
    }

    if (range.max !== null && character.cost > range.max) {
      return false;
    }

    return true;
  }

  private cloneLeaderBoostRanges(ranges: AutoBuildLeaderBoostRanges): AutoBuildLeaderBoostRanges {
    return {
      HP: { ...ranges.HP },
      ATK: { ...ranges.ATK },
    };
  }

  private normalizeManualSlots(
    manualSlots: AutoBuildManualSlotSelection[] | undefined,
  ): AutoBuildManualSlotSelection[] {
    const roleMap = new Map<AutoBuildManualSlotRole, number[]>();

    for (const slot of manualSlots ?? []) {
      if (!slot || typeof slot !== 'object' || !AUTO_BUILD_MANUAL_SLOT_ROLES.includes(slot.role)) {
        continue;
      }

      const normalizedCharacterIds = [
        ...new Set(
          (Array.isArray(slot.characterIds) ? slot.characterIds : [])
            .map((characterId) => this.normalizeCharacterId(characterId))
            .filter((characterId): characterId is number => characterId !== null),
        ),
      ];

      roleMap.set(slot.role, normalizedCharacterIds);
    }

    const normalizedSlots = createEmptyAutoBuildManualSlots();
    const usedLeaderIds = new Set<number>();
    const usedSubIds = new Set<number>();

    for (const slot of normalizedSlots) {
      const nextIds: number[] = [];

      for (const characterId of roleMap.get(slot.role) ?? []) {
        if (
          AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.includes(
            slot.role as (typeof AUTO_BUILD_MANUAL_SUB_SLOT_ROLES)[number],
          )
        ) {
          if (usedLeaderIds.has(characterId) || usedSubIds.has(characterId)) {
            continue;
          }

          usedSubIds.add(characterId);
          nextIds.push(characterId);
          continue;
        }

        if (usedSubIds.has(characterId) || nextIds.includes(characterId)) {
          continue;
        }

        usedLeaderIds.add(characterId);
        nextIds.push(characterId);
      }

      slot.characterIds = nextIds;
    }

    return normalizedSlots;
  }

  private normalizeLegacyManualSelection(
    rawLockedCharacterIds: number[] | undefined,
    rawCaptainCharacterId: number | null | undefined,
    rawFriendCaptainCharacterId: number | null | undefined,
  ): {
    lockedCharacterIds: number[];
    captainCharacterId: number | null;
    friendCaptainCharacterId: number | null;
    hasInvalidLeaderSelection: boolean;
  } {
    const lockedCharacterIds = this.normalizeCharacterIds(rawLockedCharacterIds);
    const lockedCharacterIdSet = new Set(lockedCharacterIds);
    let hasInvalidLeaderSelection = false;
    let captainCharacterId = this.normalizeCharacterId(rawCaptainCharacterId);
    let friendCaptainCharacterId = this.normalizeCharacterId(rawFriendCaptainCharacterId);

    if (captainCharacterId && !lockedCharacterIdSet.has(captainCharacterId)) {
      captainCharacterId = null;
      hasInvalidLeaderSelection = true;
    }

    if (friendCaptainCharacterId && !lockedCharacterIdSet.has(friendCaptainCharacterId)) {
      friendCaptainCharacterId = null;
      hasInvalidLeaderSelection = true;
    }

    if (!captainCharacterId && friendCaptainCharacterId) {
      captainCharacterId = friendCaptainCharacterId;
    }

    if (captainCharacterId && !friendCaptainCharacterId) {
      friendCaptainCharacterId = captainCharacterId;
    }

    return {
      lockedCharacterIds,
      captainCharacterId,
      friendCaptainCharacterId,
      hasInvalidLeaderSelection,
    };
  }

  private createManualSlotsFromLegacySelection(selection: {
    lockedCharacterIds: number[];
    captainCharacterId: number | null;
    friendCaptainCharacterId: number | null;
  }): AutoBuildManualSlotSelection[] {
    const manualSlots = createEmptyAutoBuildManualSlots();
    const captainSlot = manualSlots.find((slot) => slot.role === 'captain');
    const friendCaptainSlot = manualSlots.find((slot) => slot.role === 'friendCaptain');
    const leaderIds = new Set(
      [selection.captainCharacterId, selection.friendCaptainCharacterId].filter(
        (characterId): characterId is number => characterId !== null,
      ),
    );

    if (captainSlot && selection.captainCharacterId) {
      captainSlot.characterIds = [selection.captainCharacterId];
    }

    if (friendCaptainSlot && selection.friendCaptainCharacterId) {
      friendCaptainSlot.characterIds = [selection.friendCaptainCharacterId];
    }

    const remainingSubIds = selection.lockedCharacterIds.filter(
      (characterId) => !leaderIds.has(characterId),
    );

    for (const [index, role] of AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.entries()) {
      const slot = manualSlots.find((entry) => entry.role === role);
      const characterId = remainingSubIds[index];

      if (slot && characterId) {
        slot.characterIds = [characterId];
      }
    }

    return manualSlots;
  }

  private deriveLegacyManualSelectionFromManualSlots(manualSlots: AutoBuildManualSlotSelection[]): {
    lockedCharacterIds: number[];
    captainCharacterId: number | null;
    friendCaptainCharacterId: number | null;
  } {
    const captainCharacterId =
      manualSlots.find((slot) => slot.role === 'captain')?.characterIds[0] ?? null;
    const friendCaptainCharacterId =
      manualSlots.find((slot) => slot.role === 'friendCaptain')?.characterIds[0] ??
      captainCharacterId;
    const lockedCharacterIds = [...new Set(manualSlots.flatMap((slot) => slot.characterIds))];

    return {
      lockedCharacterIds,
      captainCharacterId,
      friendCaptainCharacterId,
    };
  }

  private normalizeRequiredAbilities(
    requirements: AutoBuildAbilityRequirement[],
  ): AutoBuildAbilityRequirement[] {
    const normalizedRequirements = new Map<string, AutoBuildAbilityRequirement>();

    for (const requirement of requirements) {
      const abilityKey = requirement.abilityKey.trim();
      const normalizedAbilityKey = LEGACY_ABILITY_KEY_ALIASES[abilityKey] ?? abilityKey;
      const minTurns =
        requirement.minTurns !== null &&
        Number.isFinite(requirement.minTurns) &&
        requirement.minTurns > 0
          ? Math.floor(requirement.minTurns)
          : null;
      const slotTokens = [
        ...new Set(requirement.slotTokens.map((token) => token.trim().toUpperCase())),
      ]
        .filter((token) => token.length)
        .sort((left, right) => left.localeCompare(right));
      const requiredCharacterCount =
        Number.isFinite(requirement.requiredCharacterCount) &&
        requirement.requiredCharacterCount > 0
          ? Math.floor(requirement.requiredCharacterCount)
          : 1;

      if (normalizedAbilityKey.length === 0) {
        continue;
      }

      const identity = `${normalizedAbilityKey}|${minTurns ?? 'none'}|${slotTokens.join(',')}`;
      const existingRequirement = normalizedRequirements.get(identity);

      if (existingRequirement) {
        existingRequirement.requiredCharacterCount = Math.max(
          existingRequirement.requiredCharacterCount,
          requiredCharacterCount,
        );
        continue;
      }

      normalizedRequirements.set(identity, {
        abilityKey: normalizedAbilityKey,
        minTurns,
        slotTokens,
        requiredCharacterCount,
      });
    }

    return [...normalizedRequirements.values()];
  }
}

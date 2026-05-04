import { Injectable } from '@angular/core';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_CLASSES,
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
import {
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityRequirement,
  type AutoBuildRequiredCharacterGroup,
} from '../models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  AutoTeamBuildCancelledError,
  buildAutoTeamBuildTimingSnapshot,
  createAutoTeamBuildTimingState,
  createAutoTeamBuildFallbackPlanner,
  isAutoTeamBuildCancelledError,
  normalizeSelectedTypes,
  recordAutoTeamBuildFallbackTiming,
  runAutoTeamBuildSearch,
  satisfiesRequestedAutoTeamBuildCoverage,
  type AutoTeamBuildFallbackAttemptCategory,
  type AutoTeamBuildFallbackPlanner,
  type AutoTeamBuildInFlightFallbackTiming,
  type AutoTeamBuildTimingState,
} from './auto-team-builder.engine';
import { resolveAutoBuildShipSelection } from './auto-team-builder-ship.utils';
import { normalizeEnemyMechanicRequirements } from './enemy-mechanic-draft.utils';
import { OptcRepositoryService } from './optc-repository.service';
import { cloneRequiredCharacterGroups } from './required-character-groups.utils';
import {
  cloneBattleRequirements,
  normalizeBattleRequirementsWithLegacyFallback,
} from './auto-team-builder-battle.utils';
import {
  buildAutoBuildAbilityCoverageBreakdown,
  buildAutoTeamResult,
  resolveAutoBuildTeamPowerPreferenceScore,
} from './auto-team-builder.utils';
import { resolveCaptainCoverage } from './captain-coverage.utils';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
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
const DEEP_FALLBACK_ATTEMPT_THRESHOLD = 30_000;
const DEEP_FALLBACK_WORKER_COUNT = 2;
const PREFERRED_LEADER_MAX_SCHEDULED_FALLBACK_ATTEMPTS = 256;
const MAX_DYNAMIC_TOTAL_ATTEMPTS = 31_744;
const PREFERRED_LEADER_AUTO_FILL_LIMIT = 8;

interface PooledFallbackAttemptResult {
  result: AutoBuildResult | null;
}

interface PooledWorkerState {
  worker: Worker;
  busy: boolean;
  retiring: boolean;
}

interface AutoTeamBuildScopedAutoFillCharacterIds {
  leaderAutoFillCharacterIds?: number[];
  subAutoFillCharacterIds?: number[];
}

export interface AutoTeamBuildCaptainCoverageScopeOptions {
  captainCharacterId?: number | null;
  friendCaptainCharacterId?: number | null;
  requireFullCaptainAbilityCoverage?: boolean;
}

export class AutoTeamBuildSearchTooLargeError extends Error {
  public constructor(
    message = 'This exhaustive auto team search is too large for this browser session.',
  ) {
    super(message);
    this.name = 'AutoTeamBuildSearchTooLargeError';
  }
}

export function isAutoTeamBuildSearchTooLargeError(
  error: unknown,
): error is AutoTeamBuildSearchTooLargeError {
  return error instanceof AutoTeamBuildSearchTooLargeError;
}

@Injectable({ providedIn: 'root' })
export class AutoTeamBuilderService {
  public constructor(private readonly repository: OptcRepositoryService) {}

  public resolveCaptainCoveredCandidateRecords(
    records: CharacterDetailRecord[],
    options: AutoTeamBuildCaptainCoverageScopeOptions,
  ): CharacterDetailRecord[] {
    const leaderIds = [
      options.captainCharacterId ?? null,
      options.friendCaptainCharacterId ?? null,
    ].filter(
      (characterId, index, values): characterId is number =>
        characterId !== null &&
        Number.isInteger(characterId) &&
        characterId > 0 &&
        values.indexOf(characterId) === index,
    );

    if (!leaderIds.length || !records.length) {
      return records;
    }

    const recordById = new Map(records.map((record) => [record.id, record] as const));
    const leaders = leaderIds
      .map((characterId) => recordById.get(characterId))
      .filter((record): record is CharacterDetailRecord => Boolean(record));

    if (!leaders.length) {
      return records;
    }

    const retainedLeaderIds = new Set(leaders.map((leader) => leader.id));
    const coverageMode = options.requireFullCaptainAbilityCoverage
      ? 'fullAbilityCoverage'
      : 'simpleBoostScope';

    return records.filter((record) => {
      if (retainedLeaderIds.has(record.id)) {
        return true;
      }

      return leaders.every(
        (leader) =>
          resolveCaptainCoverage(leader, record, {
            coverageMode,
            targetCharacterTags: record.detail.characterTags ?? [],
            includeTeamTagClauses: false,
          }).matches,
      );
    });
  }

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
    const requireFullCaptainAbilityCoverage =
      constraints.requireFullCaptainAbilityCoverage ?? false;
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
    const normalizedRequiredAbilities = this.normalizeRequiredAbilities(
      constraints.requiredAbilities ?? [],
    );
    const requiredCharacterGroups = cloneRequiredCharacterGroups(
      constraints.requiredCharacterGroups,
    );
    const enemyMechanics = normalizeEnemyMechanicRequirements(constraints.enemyMechanics ?? []);
    const battleRequirements = normalizeBattleRequirementsWithLegacyFallback({
      battles: constraints.battleRequirements,
      requiredCharacterGroups,
      enemyMechanics,
    });
    const hasBattleRequirementInput =
      battleRequirements.length > 0 || (constraints.battleRequirements?.length ?? 0) > 0;
    const requiredAbilities = hasBattleRequirementInput
      ? this.filterBattleInputRequiredAbilities(normalizedRequiredAbilities)
      : normalizedRequiredAbilities;
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
    const leaderCostRange =
      constraints.leaderCostRange !== undefined
        ? this.normalizeCostRange(constraints.leaderCostRange)
        : { ...costRange };
    const subCostRange =
      constraints.subCostRange !== undefined
        ? this.normalizeCostRange(constraints.subCostRange)
        : { ...costRange };
    const maxTotalCost = this.normalizeMaxTotalCost(constraints.maxTotalCost);

    const input: AutoBuildInput = {
      types: normalizedTypes.length > 0 ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClasses: normalizedClasses,
      requireAllSelectedTypesInTeam: constraints.requireAllSelectedTypesInTeam ?? false,
      requireAllSelectedClassesPerCharacter:
        constraints.requireAllSelectedClassesPerCharacter ?? false,
      requireAllSlotsInLeaderSuperEffectScope,
      requireFullCaptainAbilityCoverage,
      minimumLeaderSuperEffectMatchingSlots: requireAllSlotsInLeaderSuperEffectScope
        ? (constraints.minimumLeaderSuperEffectMatchingSlots ?? AUTO_BUILD_TOTAL_SLOT_COUNT)
        : null,
      requireLeaderSuperSpecialCriteria: constraints.requireLeaderSuperSpecialCriteria ?? true,
      requireUniqueBaseCharacterNames: constraints.requireUniqueBaseCharacterNames ?? false,
      requiredAbilities,
      requiredCharacterGroups: hasBattleRequirementInput ? [] : requiredCharacterGroups,
      battleRequirements,
      enemyMechanics,
      favoritesOnly,
      allowAnyFriendCaptainAutoFill,
      favoriteShipsOnly,
      favoriteShipIds,
      leaderBoostFilters,
      leaderBoostRanges,
      costRange,
      leaderCostRange,
      subCostRange,
      maxTotalCost,
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
        ...(normalizeAbilityRequirementSlotScope(requirement.slotScope) !== 'any'
          ? { slotScope: normalizeAbilityRequirementSlotScope(requirement.slotScope) }
          : {}),
      })),
      requiredCharacterGroups: cloneRequiredCharacterGroups(input.requiredCharacterGroups),
      battleRequirements: cloneBattleRequirements(input.battleRequirements),
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
      leaderCostRange: { ...input.leaderCostRange },
      subCostRange: { ...input.subCostRange },
      maxTotalCost: input.maxTotalCost,
      manualSlots: input.manualSlots.map((slot) => ({
        role: slot.role,
        characterIds: [...slot.characterIds],
        requiredCharacterId: slot.requiredCharacterId,
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
      },
    );
    const friendCaptainRecords = shouldFetchAnyFriendCaptainRecords
      ? await this.repository.getAutoBuilderCandidates([...AUTO_TEAM_BUILDER_TYPES], null, {
          lockedCharacterIds,
          excludedCharacterIds,
        })
      : undefined;
    const captainCoveredRecords = this.resolveCaptainCoveredCandidateRecords(records, {
      captainCharacterId,
      friendCaptainCharacterId,
      requireFullCaptainAbilityCoverage,
    });
    const captainCoveredFriendCaptainRecords = friendCaptainRecords
      ? this.resolveCaptainCoveredCandidateRecords(friendCaptainRecords, {
          captainCharacterId,
          friendCaptainCharacterId,
          requireFullCaptainAbilityCoverage,
        })
      : undefined;
    const scopedAutoFillCharacterIds = {
      leaderAutoFillCharacterIds: this.resolveLeaderAutoFillCharacterIds(
        captainCoveredRecords,
        captainCoveredFriendCaptainRecords,
        allowedCharacterIds,
        requestedInput,
      ),
      subAutoFillCharacterIds: this.resolveAutoFillCharacterIds(
        captainCoveredRecords,
        allowedCharacterIds,
        requestedInput.subCostRange,
      ),
    };

    const legacyAutoFillCharacterIds = this.resolveAutoFillCharacterIds(
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
        friendCaptainRecords,
        scopedAutoFillCharacterIds,
        legacyAutoFillCharacterIds,
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
    const normalizedRequiredAbilities = this.normalizeRequiredAbilities(
      rosterInput.requiredAbilities ?? [],
    );
    const requiredCharacterGroups = cloneRequiredCharacterGroups(
      rosterInput.requiredCharacterGroups,
    );
    const enemyMechanics = normalizeEnemyMechanicRequirements(rosterInput.enemyMechanics ?? []);
    const battleRequirements = normalizeBattleRequirementsWithLegacyFallback({
      battles: rosterInput.battleRequirements,
      requiredCharacterGroups,
      enemyMechanics,
    });
    const hasBattleRequirementInput =
      battleRequirements.length > 0 || (rosterInput.battleRequirements?.length ?? 0) > 0;
    const requiredAbilities = hasBattleRequirementInput
      ? this.filterBattleInputRequiredAbilities(normalizedRequiredAbilities)
      : normalizedRequiredAbilities;
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
            requiredCharacterGroups: hasBattleRequirementInput ? [] : requiredCharacterGroups,
            battleRequirements,
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
    scopedAutoFillCharacterIds: AutoTeamBuildScopedAutoFillCharacterIds = {},
    autoFillCharacterIds?: number[],
  ): Promise<AutoBuildResult | null> {
    const usesPreferredLeaderFastPath = this.usesPreferredLeaderFastPath(
      requestedInput,
      scopedAutoFillCharacterIds,
    );
    const maxScheduledFallbackAttempts = usesPreferredLeaderFastPath
      ? PREFERRED_LEADER_MAX_SCHEDULED_FALLBACK_ATTEMPTS
      : undefined;
    const projectedUnboundedTotalAttempts =
      this.resolveProjectedUnboundedTotalAttempts(requestedInput);
    const fallbackPlanner = createAutoTeamBuildFallbackPlanner(requestedInput, records, {
      maxScheduledFallbackAttempts,
    });
    const requestedWorkerCount = this.normalizeWorkerCount(executionOptions.workerCount);
    const projectedTotalAttempts = fallbackPlanner.getProjectedTotalAttempts();
    const isDeepFallbackSearch = this.isDeepFallbackSearch(
      Math.max(projectedTotalAttempts, projectedUnboundedTotalAttempts),
    );
    const pooledWorkerCount = this.resolvePooledWorkerCount(
      requestedWorkerCount,
      Math.max(projectedTotalAttempts, projectedUnboundedTotalAttempts),
    );

    if (requestedWorkerCount > 1 && fallbackPlanner.hasPotentialFallbackAttempts()) {
      try {
        const result = await this.runSearchWithWorkerPool(
          records,
          requestedInput,
          executionOptions,
          fallbackPlanner,
          pooledWorkerCount,
          isDeepFallbackSearch ? DEEP_FALLBACK_WORKER_COUNT : null,
          friendCaptainRecords,
          scopedAutoFillCharacterIds,
          autoFillCharacterIds,
          maxScheduledFallbackAttempts,
        );

        return this.resolveBoundedFallbackResult(
          result,
          usesPreferredLeaderFastPath,
          projectedUnboundedTotalAttempts,
        );
      } catch (error) {
        if (isAutoTeamBuildCancelledError(error)) {
          throw error;
        }

        if (isDeepFallbackSearch) {
          throw new AutoTeamBuildSearchTooLargeError();
        }

        return runAutoTeamBuildSearch(records, requestedInput, {
          onProgress: executionOptions.onProgress,
          isCancelled: () => executionOptions.signal?.aborted ?? false,
          friendCaptainRecords,
          autoFillCharacterIds,
          leaderAutoFillCharacterIds: scopedAutoFillCharacterIds.leaderAutoFillCharacterIds,
          subAutoFillCharacterIds: scopedAutoFillCharacterIds.subAutoFillCharacterIds,
          maxScheduledFallbackAttempts,
        });
      }
    }

    const worker = this.createWorker();

    if (!worker) {
      if (isDeepFallbackSearch) {
        throw new AutoTeamBuildSearchTooLargeError();
      }

      return runAutoTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
        isCancelled: () => executionOptions.signal?.aborted ?? false,
        friendCaptainRecords,
        autoFillCharacterIds,
        leaderAutoFillCharacterIds: scopedAutoFillCharacterIds.leaderAutoFillCharacterIds,
        subAutoFillCharacterIds: scopedAutoFillCharacterIds.subAutoFillCharacterIds,
        maxScheduledFallbackAttempts,
      });
    }

    try {
      const result = await this.runSearchInWorker(
        worker,
        records,
        requestedInput,
        executionOptions,
        friendCaptainRecords,
        scopedAutoFillCharacterIds,
        autoFillCharacterIds,
        maxScheduledFallbackAttempts,
      );

      return this.resolveBoundedFallbackResult(
        result,
        usesPreferredLeaderFastPath,
        projectedUnboundedTotalAttempts,
      );
    } catch (error) {
      worker.terminate();

      if (isAutoTeamBuildCancelledError(error)) {
        throw error;
      }

      if (isDeepFallbackSearch) {
        throw new AutoTeamBuildSearchTooLargeError();
      }

      return runAutoTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
        isCancelled: () => executionOptions.signal?.aborted ?? false,
        friendCaptainRecords,
        autoFillCharacterIds,
        leaderAutoFillCharacterIds: scopedAutoFillCharacterIds.leaderAutoFillCharacterIds,
        subAutoFillCharacterIds: scopedAutoFillCharacterIds.subAutoFillCharacterIds,
        maxScheduledFallbackAttempts,
      });
    }
  }

  private async runSearchWithWorkerPool(
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
    fallbackPlanner: AutoTeamBuildFallbackPlanner,
    requestedWorkerCount: number,
    maxWorkerCount: number | null,
    friendCaptainRecords?: CharacterDetailRecord[],
    scopedAutoFillCharacterIds: AutoTeamBuildScopedAutoFillCharacterIds = {},
    autoFillCharacterIds?: number[],
    maxScheduledFallbackAttempts?: number,
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
          leaderAutoFillCharacterIds: scopedAutoFillCharacterIds.leaderAutoFillCharacterIds,
          subAutoFillCharacterIds: scopedAutoFillCharacterIds.subAutoFillCharacterIds,
          maxScheduledFallbackAttempts,
        });
      }

      return this.runSearchInWorker(
        singleWorker,
        records,
        requestedInput,
        executionOptions,
        friendCaptainRecords,
        scopedAutoFillCharacterIds,
        autoFillCharacterIds,
        maxScheduledFallbackAttempts,
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
            scopedAutoFillCharacterIds,
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

      const result = await this.runPooledFallbackAttempts(
        workers,
        records,
        fallbackPlanner,
        requestedInput,
        executionOptions,
        timingState,
        records.length,
        maxWorkerCount,
        friendCaptainRecords,
        scopedAutoFillCharacterIds,
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
    scopedAutoFillCharacterIds: AutoTeamBuildScopedAutoFillCharacterIds = {},
    autoFillCharacterIds?: number[],
    maxScheduledFallbackAttempts?: number,
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
        leaderAutoFillCharacterIds: scopedAutoFillCharacterIds.leaderAutoFillCharacterIds,
        subAutoFillCharacterIds: scopedAutoFillCharacterIds.subAutoFillCharacterIds,
        maxScheduledFallbackAttempts,
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
    scopedAutoFillCharacterIds: AutoTeamBuildScopedAutoFillCharacterIds = {},
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
        leaderAutoFillCharacterIds: scopedAutoFillCharacterIds.leaderAutoFillCharacterIds,
        subAutoFillCharacterIds: scopedAutoFillCharacterIds.subAutoFillCharacterIds,
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
    scopedAutoFillCharacterIds: AutoTeamBuildScopedAutoFillCharacterIds = {},
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
        leaderAutoFillCharacterIds: scopedAutoFillCharacterIds.leaderAutoFillCharacterIds,
        subAutoFillCharacterIds: scopedAutoFillCharacterIds.subAutoFillCharacterIds,
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
    maxWorkerCount: number | null,
    friendCaptainRecords?: CharacterDetailRecord[],
    scopedAutoFillCharacterIds: AutoTeamBuildScopedAutoFillCharacterIds = {},
    autoFillCharacterIds?: number[],
  ): Promise<AutoBuildResult | null> {
    return new Promise<AutoBuildResult | null>((resolve, reject) => {
      const completedAttempts = new Map<number, PooledFallbackAttemptResult>();
      const managedWorkers = new Map<Worker, PooledWorkerState>();
      const availableWorkers: PooledWorkerState[] = [];
      const inFlightFallbackTimings = new Map<number, AutoTeamBuildInFlightFallbackTiming>();
      let settled = false;
      let exactAttemptCompleted = false;
      let inFlightCount = 0;
      let pendingWorkerInitializations = 0;
      let growthDisabled = false;
      let speculativeFallbackError: unknown = null;

      workers.forEach((worker) => {
        const state: PooledWorkerState = {
          worker,
          busy: false,
          retiring: false,
        };

        managedWorkers.set(worker, state);
        availableWorkers.push(state);
      });

      const exactWorkerState = availableWorkers.shift()!;

      exactWorkerState.busy = true;
      fallbackPlanner.scheduleInitialFallbackAttempts();

      const getActiveWorkerCount = (): number => Math.max(1, managedWorkers.size);
      const getInFlightFallbackTimings = (): AutoTeamBuildInFlightFallbackTiming[] => [
        ...inFlightFallbackTimings.values(),
      ];
      const getPendingFallbackCategories = (): AutoTeamBuildFallbackAttemptCategory[] =>
        fallbackPlanner.getPendingScheduledFallbackAttemptCategories();
      const getDesiredWorkerCount = (): number =>
        this.resolveDesiredWorkerCount(executionOptions, workers.length, maxWorkerCount);
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
            scopedAutoFillCharacterIds,
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

      const completeExactAttempt = (result: AutoBuildResult | null): void => {
        if (settled) {
          return;
        }

        exactAttemptCompleted = true;
        exactWorkerState.busy = false;

        if (satisfiesRequestedAutoTeamBuildCoverage(result)) {
          resolveOnce(result, 1);
          return;
        }

        if (speculativeFallbackError !== null) {
          rejectOnce(speculativeFallbackError);
          return;
        }

        if (exactWorkerState.retiring) {
          terminateWorkerState(exactWorkerState);
        } else if (managedWorkers.has(exactWorkerState.worker)) {
          availableWorkers.push(exactWorkerState);
        }

        reconcilePoolSize();
        tryResolveOrderedResult();

        if (!settled) {
          dispatchAvailableAttempts();
        }
      };
      const handleFallbackAttemptError = (error: unknown): void => {
        if (!exactAttemptCompleted) {
          speculativeFallbackError = error;
          return;
        }

        rejectOnce(error);
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
            [],
            [],
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
        if (!exactAttemptCompleted) {
          return;
        }

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
      const haveAllEarlierAttemptsCompleted = (sequence: number): boolean => {
        for (let index = 0; index < sequence; index += 1) {
          if (!completedAttempts.has(index)) {
            return false;
          }
        }

        return true;
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
          const startedAt = timingState.now();
          inFlightFallbackTimings.set(nextAttempt.sequence, {
            category: nextAttempt.category,
            startedAt,
          });
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
              getPendingFallbackCategories(),
              getInFlightFallbackTimings(),
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

          void this.runAttemptInInitializedWorker(
            workerState.worker,
            nextAttempt.input,
            requestedInput,
            nextAttempt.requireLeadersWithoutSuperEffects,
            executionOptions.signal,
            friendCaptainRecords,
            scopedAutoFillCharacterIds,
            autoFillCharacterIds,
          )
            .then((result) => {
              if (settled) {
                return;
              }

              inFlightCount -= 1;
              inFlightFallbackTimings.delete(nextAttempt.sequence);
              recordAutoTeamBuildFallbackTiming(
                timingState,
                nextAttempt.category,
                Math.max(0, timingState.now() - startedAt),
              );
              completedAttempts.set(nextAttempt.sequence, {
                result,
              });
              workerState.busy = false;

              if (workerState.retiring) {
                terminateWorkerState(workerState);
              } else {
                availableWorkers.push(workerState);
              }

              const attemptSatisfiesRequestedCoverage =
                satisfiesRequestedAutoTeamBuildCoverage(result);

              if (
                exactAttemptCompleted &&
                attemptSatisfiesRequestedCoverage &&
                (!result?.relaxation.ignoredCaptainAbilityCoverage ||
                  haveAllEarlierAttemptsCompleted(nextAttempt.sequence))
              ) {
                resolveOnce(result, 1 + timingState.completedFallbackAttempts);
                return;
              }

              if (!attemptSatisfiesRequestedCoverage) {
                fallbackPlanner.recordFailedFallbackAttempt(nextAttempt);
              }

              reconcilePoolSize();
              tryResolveOrderedResult();

              if (!settled && (exactAttemptCompleted || !attemptSatisfiesRequestedCoverage)) {
                // Wait point 3: as soon as a worker finishes, dispatch the next queued fallback in
                // the same promise chain without adding any timer-based delay.
                dispatchAvailableAttempts();
              }
            })
            .catch((error) => {
              if (settled) {
                return;
              }

              inFlightCount = Math.max(0, inFlightCount - 1);
              inFlightFallbackTimings.delete(nextAttempt.sequence);
              workerState.busy = false;

              if (managedWorkers.has(workerState.worker)) {
                terminateWorkerState(workerState);
              } else {
                workerState.worker.terminate();
              }

              handleFallbackAttemptError(error);
            });
        }

        tryResolveOrderedResult();
      };

      void this.runAttemptInInitializedWorker(
        exactWorkerState.worker,
        requestedInput,
        requestedInput,
        !requestedInput.requireAllSlotsInLeaderSuperEffectScope,
        executionOptions.signal,
        friendCaptainRecords,
        scopedAutoFillCharacterIds,
        autoFillCharacterIds,
      )
        .then((result) => {
          completeExactAttempt(result);
        })
        .catch((error) => {
          rejectOnce(error);
        });
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

    return createAutoTeamBuildTimingState(now);
  }

  private buildTimingSnapshot(
    timingState: AutoTeamBuildTimingState,
    totalAttempts: number,
    completedAttempts: number,
    activeWorkerCount: number,
    remainingCategories?: AutoTeamBuildFallbackAttemptCategory[],
    inFlightAttempts?: AutoTeamBuildInFlightFallbackTiming[],
  ): Pick<
    AutoBuildProgressSnapshot,
    'elapsedMs' | 'estimatedRemainingMs' | 'averageFallbackAttemptMs' | 'completedFallbackAttempts'
  > {
    return buildAutoTeamBuildTimingSnapshot(timingState, totalAttempts, completedAttempts, {
      activeWorkerCount,
      remainingCategories,
      inFlightAttempts,
    });
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

  private isDeepFallbackSearch(projectedTotalAttempts: number): boolean {
    return projectedTotalAttempts >= DEEP_FALLBACK_ATTEMPT_THRESHOLD;
  }

  private usesPreferredLeaderFastPath(
    input: AutoBuildInput,
    scopedAutoFillCharacterIds: AutoTeamBuildScopedAutoFillCharacterIds,
  ): boolean {
    const hasManualLeader = input.manualSlots.some(
      (slot) =>
        (slot.role === 'captain' || slot.role === 'friendCaptain') && slot.characterIds.length > 0,
    );

    return (
      hasManualLeader || (scopedAutoFillCharacterIds.leaderAutoFillCharacterIds?.length ?? 0) > 0
    );
  }

  private resolveProjectedUnboundedTotalAttempts(input: AutoBuildInput): number {
    const typeSubsetCount = this.shouldTreatSelectedTypesAsNeutral(input)
      ? 1
      : this.resolveBoundedSubsetCount(input.types.length, true);
    const classSubsetCount = this.shouldTreatSelectedClassesAsNeutral(input)
      ? 1
      : this.resolveBoundedSubsetCount(input.selectedClasses.length, false);

    return this.multiplyWithCap(typeSubsetCount, classSubsetCount, MAX_DYNAMIC_TOTAL_ATTEMPTS);
  }

  private shouldTreatSelectedTypesAsNeutral(input: AutoBuildInput): boolean {
    return (
      !input.requireAllSelectedTypesInTeam &&
      this.sameUnorderedValues(input.types, AUTO_TEAM_BUILDER_TYPES)
    );
  }

  private shouldTreatSelectedClassesAsNeutral(input: AutoBuildInput): boolean {
    return (
      !input.requireAllSelectedClassesPerCharacter &&
      this.sameUnorderedValues(input.selectedClasses, AUTO_TEAM_BUILDER_CLASSES)
    );
  }

  private sameUnorderedValues<T>(left: readonly T[], right: readonly T[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    const rightValues = new Set(right);
    return left.every((value) => rightValues.has(value));
  }

  private resolveBoundedSubsetCount(length: number, excludeEmptySubset: boolean): number {
    let total = 1;

    for (let index = 0; index < length; index += 1) {
      if (total >= MAX_DYNAMIC_TOTAL_ATTEMPTS) {
        return MAX_DYNAMIC_TOTAL_ATTEMPTS;
      }

      total *= 2;
    }

    if (!excludeEmptySubset) {
      return Math.min(total, MAX_DYNAMIC_TOTAL_ATTEMPTS);
    }

    return Math.max(Math.min(total, MAX_DYNAMIC_TOTAL_ATTEMPTS) - 1, 0);
  }

  private multiplyWithCap(left: number, right: number, cap: number): number {
    if (left === 0 || right === 0) {
      return 0;
    }

    if (left > Math.floor(cap / right)) {
      return cap;
    }

    return left * right;
  }

  private resolveBoundedFallbackResult(
    result: AutoBuildResult | null,
    usesPreferredLeaderFastPath: boolean,
    projectedUnboundedTotalAttempts: number,
  ): AutoBuildResult | null {
    if (
      result === null &&
      usesPreferredLeaderFastPath &&
      this.isDeepFallbackSearch(projectedUnboundedTotalAttempts)
    ) {
      throw new AutoTeamBuildSearchTooLargeError();
    }

    return result;
  }

  private resolvePooledWorkerCount(
    requestedWorkerCount: number,
    projectedTotalAttempts: number,
  ): number {
    if (!this.isDeepFallbackSearch(projectedTotalAttempts)) {
      return requestedWorkerCount;
    }

    return Math.min(requestedWorkerCount, DEEP_FALLBACK_WORKER_COUNT);
  }

  private resolveDesiredWorkerCount(
    executionOptions: AutoTeamBuildExecutionOptions,
    fallbackWorkerCount: number,
    maxWorkerCount: number | null = null,
  ): number {
    const clampWorkerCount = (workerCount: number): number =>
      maxWorkerCount === null ? workerCount : Math.min(workerCount, maxWorkerCount);

    try {
      return clampWorkerCount(
        this.normalizeWorkerCount(
          executionOptions.getWorkerCount?.() ??
            executionOptions.workerCount ??
            fallbackWorkerCount,
        ),
      );
    } catch {
      return clampWorkerCount(
        this.normalizeWorkerCount(executionOptions.workerCount ?? fallbackWorkerCount),
      );
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
      requiredCharacterGroups: AutoBuildRequiredCharacterGroup[];
      battleRequirements: AutoBuildInput['battleRequirements'];
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
      requireFullCaptainAbilityCoverage: rosterInput.requireFullCaptainAbilityCoverage ?? false,
      minimumLeaderSuperEffectMatchingSlots: requireAllSlotsInLeaderSuperEffectScope
        ? (rosterInput.minimumLeaderSuperEffectMatchingSlots ?? AUTO_BUILD_TOTAL_SLOT_COUNT)
        : null,
      requireLeaderSuperSpecialCriteria: rosterInput.requireLeaderSuperSpecialCriteria ?? true,
      requireUniqueBaseCharacterNames: rosterInput.requireUniqueBaseCharacterNames ?? false,
      requiredAbilities: rosterInput.requiredAbilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
      })),
      requiredCharacterGroups: cloneRequiredCharacterGroups(rosterInput.requiredCharacterGroups),
      battleRequirements: cloneBattleRequirements(rosterInput.battleRequirements),
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
      leaderCostRange:
        rosterInput.leaderCostRange !== undefined
          ? this.normalizeCostRange(rosterInput.leaderCostRange)
          : this.normalizeCostRange(rosterInput.costRange),
      subCostRange:
        rosterInput.subCostRange !== undefined
          ? this.normalizeCostRange(rosterInput.subCostRange)
          : this.normalizeCostRange(rosterInput.costRange),
      maxTotalCost: this.normalizeMaxTotalCost(rosterInput.maxTotalCost),
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

  private resolveLeaderAutoFillCharacterIds(
    records: CharacterDetailRecord[],
    friendCaptainRecords: CharacterDetailRecord[] | undefined,
    allowedCharacterIds: number[] | undefined,
    input: Pick<
      AutoBuildInput,
      | 'leaderCostRange'
      | 'leaderBoostFilters'
      | 'leaderBoostRanges'
      | 'allowAnyFriendCaptainAutoFill'
      | 'requiredAbilities'
    >,
  ): number[] | undefined {
    const baseCharacterIds = this.resolvePreferredLeaderAutoFillCharacterIds(
      records,
      allowedCharacterIds,
      input,
    );

    if (!input.allowAnyFriendCaptainAutoFill || !friendCaptainRecords?.length) {
      return baseCharacterIds;
    }

    const friendCaptainCharacterIds = this.resolvePreferredLeaderAutoFillCharacterIds(
      friendCaptainRecords,
      allowedCharacterIds,
      input,
    );

    return [...new Set([...(baseCharacterIds ?? []), ...(friendCaptainCharacterIds ?? [])])];
  }

  private resolvePreferredLeaderAutoFillCharacterIds(
    records: CharacterDetailRecord[],
    allowedCharacterIds: number[] | undefined,
    input: Pick<
      AutoBuildInput,
      'leaderCostRange' | 'leaderBoostFilters' | 'leaderBoostRanges' | 'requiredAbilities'
    >,
  ): number[] | undefined {
    if (!records.length) {
      return undefined;
    }

    const allowedCharacterIdSet = allowedCharacterIds ? new Set(allowedCharacterIds) : null;
    const rankedIds = records
      .filter((record) => {
        if (allowedCharacterIdSet && !allowedCharacterIdSet.has(record.id)) {
          return false;
        }

        return (
          this.characterMatchesCostRange(record, input.leaderCostRange) &&
          this.characterMatchesLeaderBoostRanges(record, input.leaderBoostRanges)
        );
      })
      .sort((left, right) => this.comparePreferredLeaderAutoFillRecords(left, right, input))
      .slice(0, PREFERRED_LEADER_AUTO_FILL_LIMIT)
      .map((record) => record.id);

    return rankedIds.length ? rankedIds : undefined;
  }

  private comparePreferredLeaderAutoFillRecords(
    left: CharacterDetailRecord,
    right: CharacterDetailRecord,
    input: Pick<AutoBuildInput, 'leaderBoostFilters' | 'requiredAbilities'>,
  ): number {
    const captainAbilityRequirementDifference =
      this.resolveCaptainAbilityRequirementPriorityScore(right, input.requiredAbilities) -
      this.resolveCaptainAbilityRequirementPriorityScore(left, input.requiredAbilities);

    if (captainAbilityRequirementDifference !== 0) {
      return captainAbilityRequirementDifference;
    }

    const boostDifference =
      this.resolveLeaderBoostPriorityScore(right, input.leaderBoostFilters) -
      this.resolveLeaderBoostPriorityScore(left, input.leaderBoostFilters);

    if (boostDifference !== 0) {
      return boostDifference;
    }

    if (right.id !== left.id) {
      return right.id - left.id;
    }

    if (right.cost !== left.cost) {
      return right.cost - left.cost;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  }

  private resolveCaptainAbilityRequirementPriorityScore(
    character: CharacterDetailRecord,
    requirements: AutoBuildAbilityRequirement[],
  ): number {
    return requirements.reduce((score, requirement) => {
      if (normalizeAbilityRequirementSourceScope(requirement.sourceScope) !== 'captainAbility') {
        return score;
      }

      const matchesRequirement = character.detail.builderAbilities.some(
        (ability) =>
          ability.source === 'captainAbility' && matchesAbilityRequirement(ability, requirement),
      );

      return matchesRequirement ? score + Math.max(1, requirement.requiredCharacterCount) : score;
    }, 0);
  }

  private resolveLeaderBoostPriorityScore(
    character: Pick<
      CharacterDetailRecord,
      'captainHpBoost' | 'captainAtkBoost' | 'captainAverageBoost'
    >,
    filters: AutoBuildLeaderBoostFilter[],
  ): number {
    const selectedFilters = filters.length ? filters : [...AUTO_BUILD_LEADER_BOOST_FILTERS];

    if (selectedFilters.includes('HP') && selectedFilters.includes('ATK')) {
      return this.normalizeBoostScore(character.captainAverageBoost);
    }

    if (selectedFilters.includes('HP')) {
      return this.normalizeBoostScore(character.captainHpBoost);
    }

    if (selectedFilters.includes('ATK')) {
      return this.normalizeBoostScore(character.captainAtkBoost);
    }

    return this.normalizeBoostScore(character.captainAverageBoost);
  }

  private normalizeBoostScore(value: number): number {
    return Number.isFinite(value) ? value : 0;
  }

  private characterMatchesLeaderBoostRanges(
    character: Pick<CharacterDetailRecord, 'captainHpBoost' | 'captainAtkBoost'>,
    ranges: AutoBuildLeaderBoostRanges,
  ): boolean {
    return (
      this.captainBoostMatchesRange(character.captainAtkBoost, ranges.ATK) &&
      this.captainBoostMatchesRange(character.captainHpBoost, ranges.HP)
    );
  }

  private captainBoostMatchesRange(boost: number, range: AutoBuildLeaderBoostRange): boolean {
    const hasActiveRange = range.min !== null || range.max !== null;

    if (!hasActiveRange) {
      return true;
    }

    if (!Number.isFinite(boost) || boost <= 0) {
      return false;
    }

    if (range.min !== null && boost < range.min) {
      return false;
    }

    if (range.max !== null && boost > range.max) {
      return false;
    }

    return true;
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

  private normalizeMaxTotalCost(value: unknown): number | null {
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
    const roleMap = new Map<
      AutoBuildManualSlotRole,
      { characterIds: number[]; requiredCharacterId: number | null }
    >();

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
      const requiredCharacterId = this.normalizeCharacterId(slot.requiredCharacterId);

      roleMap.set(slot.role, {
        characterIds: normalizedCharacterIds,
        requiredCharacterId:
          requiredCharacterId !== null && normalizedCharacterIds.includes(requiredCharacterId)
            ? requiredCharacterId
            : null,
      });
    }

    const normalizedSlots = createEmptyAutoBuildManualSlots();

    for (const slot of normalizedSlots) {
      const roleSelection = roleMap.get(slot.role);

      slot.characterIds = [...new Set(roleSelection?.characterIds ?? [])];
      slot.requiredCharacterId = roleSelection?.requiredCharacterId ?? null;
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
    const normalizedRequirements: AutoBuildAbilityRequirement[] = [];

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
      const slotScope = normalizeAbilityRequirementSlotScope(requirement.slotScope);
      const sourceScope = normalizeAbilityRequirementSourceScope(requirement.sourceScope);

      if (normalizedAbilityKey.length === 0) {
        continue;
      }

      normalizedRequirements.push({
        abilityKey: normalizedAbilityKey,
        minTurns,
        slotTokens,
        requiredCharacterCount,
        ...(slotScope !== 'any' ? { slotScope } : {}),
        ...(sourceScope ? { sourceScope } : {}),
      });
    }

    return normalizedRequirements;
  }

  private filterBattleInputRequiredAbilities(
    requirements: AutoBuildAbilityRequirement[],
  ): AutoBuildAbilityRequirement[] {
    return requirements.filter(
      (requirement) =>
        normalizeAbilityRequirementSlotScope(requirement.slotScope) === 'leader' ||
        normalizeAbilityRequirementSourceScope(requirement.sourceScope) === 'captainAbility',
    );
  }
}

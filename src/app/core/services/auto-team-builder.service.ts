import { Injectable } from '@angular/core';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_TYPES,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_BUILD_TOTAL_SLOT_COUNT,
  AUTO_BUILD_LEADER_BOOST_FILTERS,
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  type AutoBuildAttemptProgressSnapshot,
  type AutoBuildConstraints,
  type AutoBuildCostRange,
  type AutoBuildCaptainBranchMode,
  type AutoBuildRankedResult,
  type AutoBuildRankedResults,
  type AutoBuildRosterInput,
  type AutoBuildInput,
  type AutoBuildLeaderBoostFilter,
  type AutoBuildLeaderBoostRange,
  type AutoBuildLeaderBoostRanges,
  type AutoBuildLeaderSlotRole,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoBuildProgressSnapshot,
  type AutoTeamBuildExecutionPath,
  type AutoBuildResult,
  MAX_AUTO_BUILD_RANKED_RESULT_COUNT,
  type AutoTeamBuilderType,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  resolveAutoBuildAvoidMode,
  shouldTreatSelectedClassesAsNeutral,
} from '../models/auto-team-builder.models';
import {
  normalizeAbilityEffectTargetScope,
  normalizeAbilityRequirementEffectValue,
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityRequirement,
  type AutoBuildRequiredCharacterGroup,
} from '../models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  normalizeAvoidPreferRules,
  toSparseAvoidPreferFields,
} from './auto-team-builder-avoid-prefer.utils';
import { cloneCharacterTagSetSelection } from './character-tag-set.utils';
import {
  AutoTeamBuildCancelledError,
  buildAutoTeamBuildTimingSnapshot,
  createAutoTeamBuildTimingState,
  createAutoTeamBuildFallbackPlanner,
  isAutoTeamBuildCancelledError,
  normalizeSelectedTypes,
  recordAutoTeamBuildFallbackTiming,
  resolveExactAttemptRequiresNoSuperLeaders,
  applyReplacedCaptainRelaxation,
  runAutoTeamBuildAttempt,
  runAutoTeamBuildSearch,
  satisfiesRequestedAutoTeamBuildCoverage,
  type AutoTeamBuildFallbackAttemptCategory,
  type AutoTeamBuildFallbackPlanner,
  type AutoTeamBuildInFlightFallbackTiming,
  type AutoTeamBuildScheduledAttempt,
  type AutoTeamBuildTimingState,
} from './auto-team-builder.engine';
import { resolveAutoBuildShipSelection } from './auto-team-builder-ship.utils';
import {
  createPinnedCaptainProver,
  resolvePinnedCaptainImpossibility,
  type AutoBuildPinnedCaptainImpossibility,
} from './auto-team-builder-captain-feasibility.utils';
import { normalizeEnemyMechanicRequirements } from './enemy-mechanic-draft.utils';
import {
  collectPinnedLeaderScopes,
  diagnoseAutoBuildInfeasibility,
  type AutoBuildInfeasibilityDiagnosis,
} from './auto-team-builder-infeasibility.utils';
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
  resolveCharacterFacetMatches,
} from './auto-team-builder.utils';
import {
  createCaptainBoostScopeCache,
  hasSelfOnlyCaptainCoverageText,
  resolveCaptainCoverage,
  type CaptainBoostScopeCache,
} from './captain-coverage.utils';
import { matchesAbilityRequirement } from './auto-team-builder-ability-match.utils';
import { normalizeHtmlToText } from './html-text.utils';
import {
  type AutoTeamBuilderWorkerRequest,
  type AutoTeamBuilderWorkerResponse,
} from './auto-team-builder.worker.models';
import {
  resolveNextPreviewState,
  type AutoTeamBuildPreviewState,
} from './auto-team-builder-preview.utils';
import { reportWorkerFallback } from './worker-fallback.utils';

export interface AutoTeamBuildExecutionOptions {
  onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
  /** Called as the build picks a path, and again if a failed worker sends it to the main thread. */
  onExecutionPath?: (path: AutoTeamBuildExecutionPath) => void;
  /**
   * 869f127cc. A provisional team to look at while the search is still running, replaced only by an
   * attempt earlier in the plan - see `auto-team-builder-preview.utils.ts` for why planned order
   * and not finishing order.
   *
   * A READ-ONLY side channel: nothing downstream of this callback feeds back into which result is
   * finally resolved, so the returned team is byte-identical with and without a listener. That is
   * the property the whole feature rests on, and it holds by construction rather than by test.
   */
  onPreviewResult?: (result: AutoBuildResult) => void;
  /*
   * Issue #523. Called only when the search found nothing, with which requirement had no candidate
   * behind it in the pool it just searched. A READ-ONLY side channel like `onPreviewResult`: it is
   * computed after the result is already null, so nothing it says can change what was returned.
   */
  onInfeasibility?: (diagnosis: AutoBuildInfeasibilityDiagnosis) => void;
  signal?: AbortSignal;
  workerCount?: number;
  getWorkerCount?: () => number;
}

const LEGACY_ABILITY_KEY_ALIASES: Record<string, string> = {
  remove_defense_up: 'remove_enemy_increased_defense',
};
/**
 * 869f135t5. `DEEP_FALLBACK_ATTEMPT_THRESHOLD` arrived in `4110f777`
 * (2026-05-02) with no recorded benchmark. What it decides is the worker count:
 * a search projected at or above it gets `DEEP_FALLBACK_WORKER_COUNT`.
 *
 * It is NOT an alias for `MAX_DYNAMIC_TOTAL_ATTEMPTS` below, and reading it as
 * one is the trap. Off the preferred-leader fast path the two are close enough
 * that the distinction rarely shows; ON that fast path the planner's own
 * projection is clamped to `PREFERRED_LEADER_MAX_SCHEDULED_FALLBACK_ATTEMPTS`
 * (<= 257 total), so the deep decision rests entirely on
 * `resolveProjectedUnboundedTotalAttempts` - the product form - and 30_000 is a
 * real boundary with searches on both sides of it. `auto-team-builder.service.spec.ts`
 * pins both sides.
 *
 * `MAX_DYNAMIC_TOTAL_ATTEMPTS = 31_744` is the SECOND declaration of the cap;
 * the first is in `auto-team-builder.engine.ts`, where its provenance is
 * recorded. Neither is exported and nothing imports the other, so
 * `auto-team-builder.engine.spec.ts` reads both literals out of the source and
 * asserts they are equal.
 */
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

/** 869f333ey. What the alternative-Captain proof found, including when it found nothing. */
interface AutoTeamBuildAlternativeCaptainOutcome {
  /** Null when no Captain was pinned. */
  pinnedCaptainId: number | null;
  /** Empty when the pinned Captain passed the proof - the pass then does nothing at all. */
  impossibility: AutoBuildPinnedCaptainImpossibility[];
  /** The Captains proven able instead, in preference order. Empty when there is nothing to try. */
  alternativeCaptainIds: number[];
  manualFriendCaptainId: number | null;
}

interface AutoTeamBuildScopedAutoFillCharacterIds {
  leaderAutoFillCharacterIds?: number[];
  subAutoFillCharacterIds?: number[];
}

export interface AutoTeamBuildCaptainCoverageScopeOptions {
  captainCharacterId?: number | null;
  friendCaptainCharacterId?: number | null;
  requireFullCaptainAbilityCoverage?: boolean;
  requireBothLeadersFullCaptainAbilityCoverage?: boolean;
  manualSlots?: AutoBuildManualSlotSelection[];
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
    const covers = this.createCaptainCoveragePredicate(records, options);

    return covers ? records.filter(covers) : records;
  }

  /*
   * 869f333ey. The per-character half of `resolveCaptainCoveredCandidateRecords`, split out so the
   * alternative-Captain proof asks exactly the question the real search scopes with. Null when no
   * leader is pinned, which means every candidate is in scope.
   */
  private createCaptainCoveragePredicate(
    records: CharacterDetailRecord[],
    options: AutoTeamBuildCaptainCoverageScopeOptions,
    scopeCache?: CaptainBoostScopeCache,
  ): ((record: CharacterDetailRecord) => boolean) | null {
    const leaderEntries = this.resolveCaptainCoverageLeaderEntries(records, options);

    if (!leaderEntries.length || !records.length) {
      return null;
    }
    const retainedLeaderIds = new Set(leaderEntries.map((leader) => leader.character.id));
    const coverageMode =
      options.requireFullCaptainAbilityCoverage ||
      options.requireBothLeadersFullCaptainAbilityCoverage
        ? 'fullAbilityCoverage'
        : 'simpleBoostScope';

    return (record) => {
      if (retainedLeaderIds.has(record.id)) {
        return true;
      }

      return leaderEntries.every((leader) => {
        const coverage = resolveCaptainCoverage(leader.character, record, {
          coverageMode,
          branchMode: leader.branchMode,
          targetCharacterTags: record.detail.characterTags ?? [],
          includeTeamTagClauses: false,
          scopeCache,
        });

        return coverage.targetableClauseCount === 0 && coverageMode === 'simpleBoostScope'
          ? !hasSelfOnlyCaptainCoverageText(leader.character, { branchMode: leader.branchMode })
          : coverage.matches;
      });
    };
  }

  private resolveCaptainCoverageLeaderEntries(
    records: CharacterDetailRecord[],
    options: AutoTeamBuildCaptainCoverageScopeOptions,
  ): Array<{
    role: AutoBuildLeaderSlotRole;
    character: CharacterDetailRecord;
    branchMode: AutoBuildCaptainBranchMode | null;
  }> {
    const recordById = new Map(records.map((record) => [record.id, record] as const));
    const manualSlots = options.manualSlots ?? [];
    const entries = (['captain', 'friendCaptain'] as const)
      .map((role) => {
        const characterId =
          role === 'captain'
            ? (options.captainCharacterId ?? null)
            : (options.friendCaptainCharacterId ?? null);

        if (characterId === null || !Number.isInteger(characterId) || characterId <= 0) {
          return null;
        }

        const character = recordById.get(characterId);

        if (!character) {
          return null;
        }

        return {
          role,
          character,
          branchMode: this.resolveManualLeaderBranchMode(manualSlots, role, characterId),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (options.requireBothLeadersFullCaptainAbilityCoverage) {
      return entries;
    }

    const seenIds = new Set<number>();

    return entries.filter((entry) => {
      if (seenIds.has(entry.character.id)) {
        return false;
      }

      seenIds.add(entry.character.id);
      return true;
    });
  }

  public async buildTeam(
    selectedClasses: string[] = [],
    selectedTypes: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
    constraints: AutoBuildConstraints = {},
    executionOptions: AutoTeamBuildExecutionOptions = {},
  ): Promise<AutoBuildResult | null> {
    const favoritesOnly = constraints.favoritesOnly ?? false;
    /*
     * 869f1q90b. Copied rather than referenced: the input is handed to a worker and must not
     * alias a signal the page keeps mutating.
     */
    const boostedCharacterIds = [...(constraints.boostedCharacterIds ?? [])];
    // 869f63gma. Normalised once and sent sparse: a build without a rule sends what it always did.
    const avoidPreferRules = normalizeAvoidPreferRules(constraints);
    const allowAnyFriendCaptainAutoFill = constraints.allowAnyFriendCaptainAutoFill ?? false;
    const favoriteShipsOnly = constraints.favoriteShipsOnly ?? false;
    const requireAllSlotsInLeaderSuperEffectScope =
      constraints.requireAllSlotsInLeaderSuperEffectScope ?? false;
    let requireFullCaptainAbilityCoverage =
      constraints.requireFullCaptainAbilityCoverage ?? false;
    let requireBothLeadersFullCaptainAbilityCoverage =
      constraints.requireBothLeadersFullCaptainAbilityCoverage ?? false;
    let strictSuperSpecialCriteriaCoverage =
      constraints.strictSuperSpecialCriteriaCoverage ?? false;
    let strictSuperTandemCriteriaCoverage =
      constraints.strictSuperTandemCriteriaCoverage ?? false;
    const normalizedTypes = normalizeSelectedTypes(selectedTypes);
    const normalizedClasses: string[] = [];
    const normalizedCharacterTags = this.normalizeSelectedTextFilters(
      constraints.selectedCharacterTags,
    );
    const normalizedCharacterNames = this.normalizeSelectedTextFilters(
      constraints.selectedCharacterNames,
    );

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
      // Only when a battle is going to be synthesised from the mechanics anyway. The fallback
      // folds typed requirements into the battle it builds, and passing them unconditionally
      // would synthesise a battle out of `requiredAbilities` ALONE - moving every flattened
      // requirement out of `coverage.abilityRequirements.requested` and into a battle group for
      // every caller that never asked for one. The defect being fixed is narrower: when a
      // mechanic IS present, `hasBattleRequirementInput` flips and the leader-only filter below
      // drops the player's own sub requirements, and nothing reports it.
      requiredAbilities: enemyMechanics.length > 0 ? normalizedRequiredAbilities : [],
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
    const requireManualShip = (constraints.requireManualShip ?? false) && manualShipId !== null;
    const excludedShipIds = this.normalizeCharacterIds(constraints.excludedShipIds);
    const leaderBoostFilters = this.normalizeLeaderBoostFilters(constraints.leaderBoostFilters);
    const leaderBoostRanges = this.normalizeLeaderBoostRanges(constraints.leaderBoostRanges);
    const costRange = createEmptyAutoBuildCostRange();
    const leaderCostRange = createEmptyAutoBuildCostRange();
    const subCostRange = createEmptyAutoBuildCostRange();
    const maxTotalCost = null;

    const input: AutoBuildInput = {
      types: normalizedTypes.length > 0 ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClasses: normalizedClasses,
      selectedCharacterTags: normalizedCharacterTags,
      characterTagSets: constraints.characterTagSets
        ? cloneCharacterTagSetSelection(constraints.characterTagSets)
        : undefined,
      selectedCharacterNames: normalizedCharacterNames,
      requireAllSelectedTypesInTeam: constraints.requireAllSelectedTypesInTeam ?? false,
      requireAllSelectedClassesPerCharacter:
        constraints.requireAllSelectedClassesPerCharacter ?? false,
      requireAllSelectedClassesInTeam: constraints.requireAllSelectedClassesInTeam ?? true,
      requireAllSelectedCharacterTagsInTeam:
        constraints.requireAllSelectedCharacterTagsInTeam ?? false,
      requireAllSelectedCharacterNamesInTeam:
        constraints.requireAllSelectedCharacterNamesInTeam ?? false,
      requireAllSlotsInLeaderSuperEffectScope,
      requireFullCaptainAbilityCoverage,
      requireBothLeadersFullCaptainAbilityCoverage,
      minimumLeaderSuperEffectMatchingSlots: requireAllSlotsInLeaderSuperEffectScope
        ? (constraints.minimumLeaderSuperEffectMatchingSlots ?? AUTO_BUILD_TOTAL_SLOT_COUNT)
        : null,
      requireLeaderSuperSpecialCriteria: constraints.requireLeaderSuperSpecialCriteria ?? true,
      strictSuperSpecialCriteriaCoverage,
      requireSuperTandemCriteria: constraints.requireSuperTandemCriteria ?? true,
      strictSuperTandemCriteriaCoverage,
      requireUniqueBaseCharacterNames: constraints.requireUniqueBaseCharacterNames ?? false,
      requiredAbilities,
      requiredCharacterGroups: hasBattleRequirementInput ? [] : requiredCharacterGroups,
      battleRequirements,
      enemyMechanics,
      favoritesOnly,
      boostedCharacterIds,
      ...toSparseAvoidPreferFields(avoidPreferRules),
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
      requireManualShip,
      excludedShipIds,
      candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
    };
    const requestedInput: AutoBuildInput = {
      ...input,
      types: [...input.types],
      selectedClasses: [...input.selectedClasses],
      selectedCharacterTags: [...input.selectedCharacterTags],
      characterTagSets: input.characterTagSets
        ? cloneCharacterTagSetSelection(input.characterTagSets)
        : undefined,
      selectedCharacterNames: [...input.selectedCharacterNames],
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
      ...toSparseAvoidPreferFields(avoidPreferRules),
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
        ...(slot.branchSelections?.length
          ? {
              branchSelections: slot.branchSelections.map((selection) => ({
                characterId: selection.characterId,
                mode: selection.mode,
              })),
            }
          : {}),
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

    const mutableRequestedInput = requestedInput as {
      -readonly [K in keyof AutoBuildInput]: AutoBuildInput[K];
    };
    mutableRequestedInput.requireFullCaptainAbilityCoverage = requireFullCaptainAbilityCoverage;
    mutableRequestedInput.requireBothLeadersFullCaptainAbilityCoverage =
      requireBothLeadersFullCaptainAbilityCoverage;
    mutableRequestedInput.strictSuperSpecialCriteriaCoverage = strictSuperSpecialCriteriaCoverage;
    mutableRequestedInput.strictSuperTandemCriteriaCoverage = strictSuperTandemCriteriaCoverage;

    const captainCoveredRecords = this.resolveCaptainCoveredCandidateRecords(records, {
      captainCharacterId,
      friendCaptainCharacterId,
      requireFullCaptainAbilityCoverage,
      requireBothLeadersFullCaptainAbilityCoverage,
      manualSlots,
    });
    const captainCoveredFriendCaptainRecords = friendCaptainRecords
      ? this.resolveCaptainCoveredCandidateRecords(friendCaptainRecords, {
          captainCharacterId,
          friendCaptainCharacterId,
          requireFullCaptainAbilityCoverage,
          requireBothLeadersFullCaptainAbilityCoverage,
          manualSlots,
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
    const alternativeCaptain = this.resolveAlternativeCaptainOutcome({
      records,
      requestedInput,
      captainCoveredRecords,
      allowedCharacterIds,
      signal: executionOptions.signal,
    });
    /*
     * Awaited only when there is a Captain to try. Without one - no Captain pinned, or one the proof
     * found able - the search starts on the same microtask it always did; the pooled-worker specs
     * pin that timing to the tick.
     */
    const replacedCaptainResult = alternativeCaptain.alternativeCaptainIds.length
      ? await this.runReplacementCaptains({
          records,
          requestedInput,
          allowedCharacterIds,
          friendCaptainRecords,
          legacyAutoFillCharacterIds,
          executionOptions,
          alternativeCaptain,
        })
      : null;

    if (replacedCaptainResult) {
      return {
        ...replacedCaptainResult,
        shipSelection: resolveAutoBuildShipSelection(replacedCaptainResult, await shipsPromise),
      };
    }

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
      this.reportInfeasibility(records, requestedInput, executionOptions, alternativeCaptain);

      return null;
    }

    return {
      ...result,
      shipSelection: resolveAutoBuildShipSelection(result, ships),
    };
  }

  /*
   * Issue #523. A search that fails says what was asked for and never what was impossible. This
   * walks the pool it just searched and reports the first requirement nothing in it satisfies - or
   * satisfies only outside the pinned leaders' boost scope, which is the case that report was.
   *
   * Guarded, and deliberately: a diagnosis that throws must not turn "no team found" into "the auto
   * build failed unexpectedly", which is a different and wronger message.
   */
  private reportInfeasibility(
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
    alternativeCaptain?: AutoTeamBuildAlternativeCaptainOutcome,
  ): void {
    if (!executionOptions.onInfeasibility) {
      return;
    }

    try {
      const manualLeaderCharacterIds = (requestedInput.manualSlots ?? [])
        .filter((slot) => slot.role === 'captain' || slot.role === 'friendCaptain')
        .flatMap((slot) => slot.characterIds);
      const diagnosis = diagnoseAutoBuildInfeasibility({
        poolRecords: records,
        requiredAbilities: requestedInput.requiredAbilities,
        requiredCharacterGroups: requestedInput.requiredCharacterGroups,
        battleRequirements: requestedInput.battleRequirements,
        leaderScopes: collectPinnedLeaderScopes({
          records,
          manualLeaderCharacterIds,
          requireFullCoverage:
            requestedInput.requireFullCaptainAbilityCoverage ||
            requestedInput.requireBothLeadersFullCaptainAbilityCoverage,
        }),
      });
      const pinnedCaptainId = alternativeCaptain?.pinnedCaptainId ?? null;

      executionOptions.onInfeasibility(
        pinnedCaptainId !== null && alternativeCaptain?.impossibility.length
          ? {
              ...diagnosis,
              pinnedCaptain: {
                characterId: pinnedCaptainId,
                name:
                  records.find((record) => record.id === pinnedCaptainId)?.name ??
                  String(pinnedCaptainId),
                impossibility: alternativeCaptain.impossibility,
                alternativeCaptainIds: alternativeCaptain.alternativeCaptainIds,
              },
            }
          : diagnosis,
      );
    } catch {
      /* A failed diagnosis is one missing sentence, never a failed build. */
    }
  }

  /*
   * 869f333ey (D1-D3, D8, D9) - issue #523. When the pinned Captain provably cannot lead the crew
   * that was asked for, try the Captains that can, before anything is relaxed.
   *
   * The report pinned Loki over DEX/STR/PSY Strikers with full coverage on. Loki covers none of
   * them, so every attempt that keeps Loki AND keeps the coverage was already lost, and the only
   * team the search could still return dropped the coverage - which guided mode then rejected. The
   * owner's words for what should happen instead: find the team "or with another leader", as long
   * as the crew is boosted by both leaders across every tier.
   *
   * - D2: only on a proof (`resolvePinnedCaptainImpossibility`), never on a failed search. A Captain
   *   that can lead the crew never reaches this, so nothing changes for it.
   * - D3: the attempts this skips are exactly the ones the proof has already lost - every attempt
   *   that keeps the Captain and keeps the coverage - so running the alternatives now is the order
   *   the owner asked for: after those, before anything that relaxes coverage or drops a filter.
   *   If no alternative works, the original search runs untouched, relaxations and all.
   * - D8: up to eight alternatives, from the same candidate pool, in the existing leader preference
   *   order, each one proven able on the same terms first. They run as ONE exact attempt with no
   *   Captain pinned and the leader auto-fill limited to them, so the same list feeds the auto-fill
   *   Friend Captain - which is how the search already treats leaders nobody pinned.
   * - D9: only the Captain changes. A Friend Captain the reader pinned stays in its slot, and it
   *   scopes the alternatives' proofs exactly as it scoped the original.
   * - D4: the team comes back as a relaxation (`replacedCaptain`), with the reader's own request.
   */
  private resolveAlternativeCaptainOutcome(context: {
    records: CharacterDetailRecord[];
    requestedInput: AutoBuildInput;
    captainCoveredRecords: CharacterDetailRecord[];
    allowedCharacterIds: number[] | undefined;
    signal?: AbortSignal;
  }): AutoTeamBuildAlternativeCaptainOutcome {
    const { records, requestedInput } = context;
    const pinnedCaptainId = requestedInput.captainCharacterId;
    const captainSlot = requestedInput.manualSlots.find((slot) => slot.role === 'captain');
    const manualFriendCaptainId =
      requestedInput.manualSlots.find((slot) => slot.role === 'friendCaptain')?.characterIds[0] ??
      null;

    if (pinnedCaptainId === null || !captainSlot?.characterIds.length) {
      return {
        pinnedCaptainId: null,
        impossibility: [],
        alternativeCaptainIds: [],
        manualFriendCaptainId,
      };
    }

    const pinnedLeaderIdsFor = (captainId: number): number[] =>
      [captainId, manualFriendCaptainId].filter((id): id is number => id !== null);
    const proofInput = {
      types: requestedInput.types,
      requireEveryType:
        Boolean(requestedInput.requireAllSelectedTypesInTeam) &&
        !this.shouldTreatSelectedTypesAsNeutral(requestedInput),
      requiredAbilities: requestedInput.requiredAbilities,
      requiredCharacterGroups: requestedInput.requiredCharacterGroups,
      battleRequirements: requestedInput.battleRequirements,
    };
    const impossibility = resolvePinnedCaptainImpossibility({
      ...proofInput,
      coveredRecords: context.captainCoveredRecords,
      pinnedLeaderIds: pinnedLeaderIdsFor(pinnedCaptainId),
    });

    if (!impossibility.length) {
      return { pinnedCaptainId, impossibility, alternativeCaptainIds: [], manualFriendCaptainId };
    }

    const alternativeCaptainIds = this.resolveAlternativeCaptainIds({
      records,
      requestedInput,
      pinnedCaptainId,
      manualFriendCaptainId,
      allowedCharacterIds: context.allowedCharacterIds,
      prove: createPinnedCaptainProver({ ...proofInput, records }),
      pinnedLeaderIdsFor,
      signal: context.signal,
    });

    return { pinnedCaptainId, impossibility, alternativeCaptainIds, manualFriendCaptainId };
  }

  /** Runs the alternatives the proof found, and returns their team as the relaxation it is. */
  private async runReplacementCaptains(context: {
    records: CharacterDetailRecord[];
    requestedInput: AutoBuildInput;
    allowedCharacterIds: number[] | undefined;
    friendCaptainRecords: CharacterDetailRecord[] | undefined;
    legacyAutoFillCharacterIds: number[] | undefined;
    executionOptions: AutoTeamBuildExecutionOptions;
    alternativeCaptain: AutoTeamBuildAlternativeCaptainOutcome;
  }): Promise<AutoBuildResult | null> {
    const { records, requestedInput, alternativeCaptain } = context;
    const pinnedCaptainId = alternativeCaptain.pinnedCaptainId;
    const found = await this.runAlternativeCaptainAttempt({
      ...context,
      alternativeCaptainIds: alternativeCaptain.alternativeCaptainIds,
      manualFriendCaptainId: alternativeCaptain.manualFriendCaptainId,
    });
    const captainSlotResult = found?.slots.find((slot) => slot.role === 'captain');

    if (pinnedCaptainId === null || !found || !captainSlotResult?.character) {
      return null;
    }

    return applyReplacedCaptainRelaxation(found, requestedInput, {
      fromCharacterId: pinnedCaptainId,
      fromName:
        records.find((record) => record.id === pinnedCaptainId)?.name ?? String(pinnedCaptainId),
      toCharacterId: captainSlotResult.character.id,
      toName: captainSlotResult.character.name,
    });
  }

  /** Up to eight Captains from the same pool, preference order, each proven able on the same terms. */
  private resolveAlternativeCaptainIds(context: {
    records: CharacterDetailRecord[];
    requestedInput: AutoBuildInput;
    pinnedCaptainId: number;
    manualFriendCaptainId: number | null;
    allowedCharacterIds: number[] | undefined;
    prove: (covers: (record: CharacterDetailRecord) => boolean, pinnedLeaderIds: readonly number[]) => boolean;
    pinnedLeaderIdsFor: (captainId: number) => number[];
    signal?: AbortSignal;
  }): number[] {
    const { records, requestedInput } = context;
    const allowed = context.allowedCharacterIds ? new Set(context.allowedCharacterIds) : null;
    const locked = new Set(requestedInput.lockedCharacterIds);
    const candidates = records
      .filter(
        (record) =>
          record.id !== context.pinnedCaptainId &&
          // Already placed somewhere in the team by the reader.
          !locked.has(record.id) &&
          (!allowed || allowed.has(record.id)) &&
          // 869f63gma. A hard avoid keeps it out of the seat anyway, so it must not take one of eight.
          !this.isHardAvoidedRecord(record, requestedInput) &&
          this.characterHasReadableCaptainAbility(record) &&
          this.characterMatchesCostRange(record, requestedInput.leaderCostRange) &&
          this.characterMatchesLeaderBoostRanges(record, requestedInput.leaderBoostRanges),
      )
      .sort((left, right) => this.comparePreferredLeaderAutoFillRecords(left, right, requestedInput));
    const alternatives: number[] = [];
    /*
     * One Captain resolved against many targets is exactly what this cache is for (see its note in
     * captain-coverage.utils.ts). Created per pass, so nothing outlives the search.
     */
    const scopeCache = createCaptainBoostScopeCache();

    for (const candidate of candidates) {
      this.throwIfCancelled(context.signal);

      const covers = this.createCaptainCoveragePredicate(records, {
        captainCharacterId: candidate.id,
        friendCaptainCharacterId: context.manualFriendCaptainId ?? candidate.id,
        requireFullCaptainAbilityCoverage: requestedInput.requireFullCaptainAbilityCoverage,
        requireBothLeadersFullCaptainAbilityCoverage:
          requestedInput.requireBothLeadersFullCaptainAbilityCoverage,
        manualSlots: requestedInput.manualSlots.map((slot) =>
          slot.role === 'captain'
            ? { role: slot.role, characterIds: [candidate.id], requiredCharacterId: candidate.id }
            : slot,
        ),
      }, scopeCache);

      if (covers && context.prove(covers, context.pinnedLeaderIdsFor(candidate.id))) {
        alternatives.push(candidate.id);

        if (alternatives.length >= PREFERRED_LEADER_AUTO_FILL_LIMIT) {
          break;
        }
      }
    }

    return alternatives;
  }

  /**
   * One exact attempt with no Captain pinned and the leader auto-fill limited to the alternatives:
   * every filter and the coverage kept, nothing relaxed. In a worker when there is one, so the
   * page stays responsive; on the main thread otherwise, like every other search here.
   */
  private async runAlternativeCaptainAttempt(context: {
    records: CharacterDetailRecord[];
    requestedInput: AutoBuildInput;
    allowedCharacterIds: number[] | undefined;
    friendCaptainRecords: CharacterDetailRecord[] | undefined;
    legacyAutoFillCharacterIds: number[] | undefined;
    executionOptions: AutoTeamBuildExecutionOptions;
    alternativeCaptainIds: number[];
    manualFriendCaptainId: number | null;
  }): Promise<AutoBuildResult | null> {
    const { records, requestedInput, executionOptions } = context;
    /*
     * D9, and the harness caught the first draft breaking it: a pinned Friend Captain that is not
     * `required` is only a preference to the engine, and with the leader auto-fill open to eight
     * alternatives it swapped the reader's Ripley for a Luffy & Zoro pair - in 137 s, having tried
     * every alternative against every one of them. Only the Captain may change, so a single pinned
     * Friend Captain is held as required here. Several candidates in that slot keep the engine's own
     * meaning for them.
     */
    const manualSlots = requestedInput.manualSlots.map((slot) => {
      if (slot.role === 'captain') {
        return { role: slot.role, characterIds: [], requiredCharacterId: null };
      }

      return slot.role === 'friendCaptain' && slot.characterIds.length === 1
        ? { ...slot, requiredCharacterId: slot.characterIds[0]! }
        : slot;
    });
    const derived = this.deriveLegacyManualSelectionFromManualSlots(manualSlots);
    const attemptInput: AutoBuildInput = {
      ...requestedInput,
      manualSlots,
      lockedCharacterIds: derived.lockedCharacterIds,
      captainCharacterId: null,
      friendCaptainCharacterId: derived.friendCaptainCharacterId,
    };
    const subScope = this.resolveCaptainCoveredCandidateRecords(records, {
      captainCharacterId: null,
      friendCaptainCharacterId: context.manualFriendCaptainId,
      requireFullCaptainAbilityCoverage: requestedInput.requireFullCaptainAbilityCoverage,
      requireBothLeadersFullCaptainAbilityCoverage:
        requestedInput.requireBothLeadersFullCaptainAbilityCoverage,
      manualSlots,
    });
    const scopedAutoFillCharacterIds: AutoTeamBuildScopedAutoFillCharacterIds = {
      leaderAutoFillCharacterIds: context.alternativeCaptainIds,
      subAutoFillCharacterIds: this.resolveAutoFillCharacterIds(
        subScope,
        context.allowedCharacterIds,
        requestedInput.subCostRange,
      ),
    };
    const requireLeadersWithoutSuperEffects = resolveExactAttemptRequiresNoSuperLeaders(attemptInput);

    this.emitProgress(executionOptions, {
      stage: 'exactAttempt',
      candidateCount: records.length,
      completedAttempts: 0,
      totalAttempts: 1,
      attemptCountFinal: false,
      elapsedMs: 0,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentAllowedLeadersWithSuperEffects: false,
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: 'progress.alternativeCaptain',
      messageParams: { count: context.alternativeCaptainIds.length },
    });

    const runOnMainThread = (): AutoBuildResult | null =>
      runAutoTeamBuildAttempt(
        records,
        attemptInput,
        attemptInput,
        requireLeadersWithoutSuperEffects,
        context.friendCaptainRecords,
        context.legacyAutoFillCharacterIds,
        scopedAutoFillCharacterIds.leaderAutoFillCharacterIds,
        scopedAutoFillCharacterIds.subAutoFillCharacterIds,
      );
    const worker = this.createWorker();
    let result: AutoBuildResult | null;

    // Where it ran goes into the debug report like every other search's, or a build this pass
    // answered carries no executionPath at all.
    if (!worker) {
      executionOptions.onExecutionPath?.('mainThread');
      result = runOnMainThread();
    } else {
      executionOptions.onExecutionPath?.('worker');

      try {
        await this.initializeWorker(
          worker,
          records,
          executionOptions.signal,
          context.friendCaptainRecords,
          scopedAutoFillCharacterIds,
          context.legacyAutoFillCharacterIds,
        );
        result = await this.runAttemptInInitializedWorker(
          worker,
          attemptInput,
          attemptInput,
          requireLeadersWithoutSuperEffects,
          executionOptions.signal,
          context.friendCaptainRecords,
          scopedAutoFillCharacterIds,
          context.legacyAutoFillCharacterIds,
        );
      } catch (error) {
        if (isAutoTeamBuildCancelledError(error)) {
          throw error;
        }

        reportWorkerFallback('auto-team-builder', 'worker-failed', error);
        executionOptions.onExecutionPath?.('mainThreadAfterWorkerFailure');
        result = runOnMainThread();
      } finally {
        worker.terminate();
      }
    }

    return result && satisfiesRequestedAutoTeamBuildCoverage(result) ? result : null;
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
      // Only when a battle is going to be synthesised from the mechanics anyway. The fallback
      // folds typed requirements into the battle it builds, and passing them unconditionally
      // would synthesise a battle out of `requiredAbilities` ALONE - moving every flattened
      // requirement out of `coverage.abilityRequirements.requested` and into a battle group for
      // every caller that never asked for one. The defect being fixed is narrower: when a
      // mechanic IS present, `hasBattleRequirementInput` flips and the leader-only filter below
      // drops the player's own sub requirements, and nothing reports it.
      requiredAbilities: enemyMechanics.length > 0 ? normalizedRequiredAbilities : [],
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

        // Every way into this catch had a worker: a pool that never got one runs the search
        // itself and returns, so it never fails here.
        reportWorkerFallback('auto-team-builder', 'worker-failed', error);
        executionOptions.onExecutionPath?.('mainThreadAfterWorkerFailure');

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

      executionOptions.onExecutionPath?.('mainThread');

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

    executionOptions.onExecutionPath?.('worker');

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

      reportWorkerFallback('auto-team-builder', 'worker-failed', error);
      executionOptions.onExecutionPath?.('mainThreadAfterWorkerFailure');

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
        executionOptions.onExecutionPath?.('mainThread');

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

      executionOptions.onExecutionPath?.('worker');

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

    executionOptions.onExecutionPath?.('pool');

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
    onProgress?: (progress: AutoBuildAttemptProgressSnapshot) => void,
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

        if (data.type === 'attemptProgress') {
          onProgress?.(data.progress);
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
      // Set once any fallback satisfies. Dispatch is strictly in plan order, so every attempt not yet
      // started comes after that one and can never win; starting them only takes cores from the
      // earlier attempts the build is now waiting for.
      let satisfyingFallbackFound = false;
      /*
       * 869f127cc. The provisional team on screen, on ONE ordering scale: the exact attempt is 0
       * and fallback attempt n is n + 1, matching the progress line's own 1-based numbering
       * (`sequence + 2`). Nothing below this reads it back - it exists only to feed
       * `onPreviewResult`, so the resolved result is identical with and without a listener.
       */
      let previewState: AutoTeamBuildPreviewState<AutoBuildResult> | null = null;
      const offerPreview = (sequence: number, result: AutoBuildResult | null): void => {
        if (!executionOptions.onPreviewResult || settled) {
          return;
        }

        const next = resolveNextPreviewState(previewState, { sequence, result });

        if (next) {
          previewState = next;
          executionOptions.onPreviewResult(next.result);
        }
      };

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
      const emitExactAttemptProgress = (progress: AutoBuildAttemptProgressSnapshot): void => {
        this.emitProgress(executionOptions, {
          stage: 'exactAttempt',
          candidateCount,
          completedAttempts: 0,
          totalAttempts: fallbackPlanner.getTotalAttempts(),
          attemptCountFinal: fallbackPlanner.isAttemptCountFinal(),
          ...this.buildTimingSnapshot(
            timingState,
            fallbackPlanner.getTotalAttempts(),
            0,
            getActiveWorkerCount(),
            getPendingFallbackCategories(),
            getInFlightFallbackTimings(),
          ),
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentAllowedLeadersWithSuperEffects: false,
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: 'progress.exactAttempt',
          messageParams: {
            current: 1,
            total: fallbackPlanner.getTotalAttempts(),
          },
          ...progress,
        });
      };
      const emitFallbackAttemptProgress = (
        attempt: AutoTeamBuildScheduledAttempt,
        progress: AutoBuildAttemptProgressSnapshot,
      ): void => {
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
          currentDroppedTypes: attempt.droppedTypes,
          currentDroppedClasses: attempt.droppedClasses,
          currentAllowedLeadersWithSuperEffects: attempt.allowedLeadersWithSuperEffects,
          currentIgnoredLeaderSuperSpecialCriteria: Boolean(
            attempt.ignoredLeaderSuperSpecialCriteria,
          ),
          messageKey: 'progress.fallbackAttempt',
          messageParams: {
            current: attempt.sequence + 2,
            total: fallbackPlanner.getTotalAttempts(),
          },
          ...progress,
        });
      };
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

        // It did not satisfy, so it cannot be the answer - but it is a team, and it is the earliest
        // one the plan has. Nothing that follows can beat it as a preview.
        offerPreview(0, result);

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

        while (availableWorkers.length > 0 && !satisfyingFallbackFound) {
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
            (progress) => emitFallbackAttemptProgress(nextAttempt, progress),
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
              offerPreview(nextAttempt.sequence + 1, result);
              workerState.busy = false;

              if (workerState.retiring) {
                terminateWorkerState(workerState);
              } else {
                availableWorkers.push(workerState);
              }

              const attemptSatisfiesRequestedCoverage =
                satisfiesRequestedAutoTeamBuildCoverage(result);

              if (attemptSatisfiesRequestedCoverage) {
                satisfyingFallbackFound = true;
              }

              // Planned order decides, never finishing order (owner, 2026-09-11: the same filters
              // always give the same team). A later attempt that finished first used to win as long
              // as it kept captain coverage, so the team depended on core count, the live worker
              // count and timing. It resolves here only once every earlier attempt has finished -
              // and since any earlier success would already have resolved, that makes it the first
              // satisfying attempt in the plan. Otherwise tryResolveOrderedResult() waits.
              if (
                exactAttemptCompleted &&
                attemptSatisfiesRequestedCoverage &&
                haveAllEarlierAttemptsCompleted(nextAttempt.sequence)
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
        // The engine's own rule, so the pool and a single worker run the same exact attempt.
        resolveExactAttemptRequiresNoSuperLeaders(requestedInput),
        executionOptions.signal,
        friendCaptainRecords,
        scopedAutoFillCharacterIds,
        autoFillCharacterIds,
        emitExactAttemptProgress,
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
    } catch (error) {
      reportWorkerFallback('auto-team-builder', 'construction-failed', error);
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
    | 'elapsedMs'
    | 'estimatedRemainingMs'
    | 'averageFallbackAttemptMs'
    | 'completedFallbackAttempts'
    | 'activeWorkerCount'
  > {
    return {
      ...buildAutoTeamBuildTimingSnapshot(timingState, totalAttempts, completedAttempts, {
        activeWorkerCount,
        remainingCategories,
        inFlightAttempts,
      }),
      activeWorkerCount,
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
    const classSubsetCount = shouldTreatSelectedClassesAsNeutral(input)
      ? 1
      : this.resolveBoundedSubsetCount(input.selectedClasses.length, false);
    const characterTagCount = (input.selectedCharacterTags ?? []).length;
    const characterNameCount = (input.selectedCharacterNames ?? []).length;
    const characterTagSubsetCount = characterTagCount
      ? this.resolveBoundedSubsetCount(characterTagCount, false)
      : 1;
    const characterNameSubsetCount = characterNameCount
      ? this.resolveBoundedSubsetCount(characterNameCount, false)
      : 1;

    return [
      typeSubsetCount,
      classSubsetCount,
      characterTagSubsetCount,
      characterNameSubsetCount,
    ].reduce(
      (total, current) => this.multiplyWithCap(total, current, MAX_DYNAMIC_TOTAL_ATTEMPTS),
      1,
    );
  }

  private shouldTreatSelectedTypesAsNeutral(input: AutoBuildInput): boolean {
    return (
      !input.requireAllSelectedTypesInTeam &&
      this.sameUnorderedValues(input.types, AUTO_TEAM_BUILDER_TYPES)
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
      selectedCharacterTags: this.normalizeSelectedTextFilters(rosterInput.selectedCharacterTags),
      characterTagSets: rosterInput.characterTagSets
        ? cloneCharacterTagSetSelection(rosterInput.characterTagSets)
        : undefined,
      selectedCharacterNames: this.normalizeSelectedTextFilters(rosterInput.selectedCharacterNames),
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedCharacterTagsInTeam:
        rosterInput.requireAllSelectedCharacterTagsInTeam ?? false,
      requireAllSelectedCharacterNamesInTeam:
        rosterInput.requireAllSelectedCharacterNamesInTeam ?? false,
      requireAllSlotsInLeaderSuperEffectScope,
      requireFullCaptainAbilityCoverage: rosterInput.requireFullCaptainAbilityCoverage ?? false,
      requireBothLeadersFullCaptainAbilityCoverage:
        rosterInput.requireBothLeadersFullCaptainAbilityCoverage ?? false,
      minimumLeaderSuperEffectMatchingSlots: requireAllSlotsInLeaderSuperEffectScope
        ? (rosterInput.minimumLeaderSuperEffectMatchingSlots ?? AUTO_BUILD_TOTAL_SLOT_COUNT)
        : null,
      requireLeaderSuperSpecialCriteria: rosterInput.requireLeaderSuperSpecialCriteria ?? true,
      strictSuperSpecialCriteriaCoverage: rosterInput.strictSuperSpecialCriteriaCoverage ?? false,
      requireSuperTandemCriteria: rosterInput.requireSuperTandemCriteria ?? true,
      strictSuperTandemCriteriaCoverage: rosterInput.strictSuperTandemCriteriaCoverage ?? false,
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
      /*
       * 869f1q90b. The roster path answers "what could this pairing field", not "what should I
       * play this week", so an event boost has no bearing on it.
       */
      boostedCharacterIds: [],
      allowAnyFriendCaptainAutoFill: false,
      favoriteShipsOnly: false,
      favoriteShipIds: [],
      leaderBoostFilters: this.normalizeLeaderBoostFilters(rosterInput.leaderBoostFilters),
      leaderBoostRanges: this.normalizeLeaderBoostRanges(rosterInput.leaderBoostRanges),
      costRange: createEmptyAutoBuildCostRange(),
      leaderCostRange: createEmptyAutoBuildCostRange(),
      subCostRange: createEmptyAutoBuildCostRange(),
      maxTotalCost: null,
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
      requireManualShip: false,
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
      const candidateId = candidateIds[index];

      if (candidateId === undefined) {
        continue;
      }

      currentSelection.push(candidateId);
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

  private normalizeSelectedTextFilters(values: string[] | undefined): string[] {
    const normalizedValues: string[] = [];

    for (const value of values ?? []) {
      const normalizedValue = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ');

      if (
        normalizedValue.length === 0 ||
        normalizedValues.some((entry) => entry.toLowerCase() === normalizedValue.toLowerCase())
      ) {
        continue;
      }

      normalizedValues.push(normalizedValue);
    }

    return normalizedValues;
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
      undefined,
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
          this.characterHasReadableCaptainAbility(record) &&
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
    input: Pick<AutoBuildInput, 'requiredAbilities'>,
  ): number {
    const captainAbilityRequirementDifference =
      this.resolveCaptainAbilityRequirementPriorityScore(right, input.requiredAbilities) -
      this.resolveCaptainAbilityRequirementPriorityScore(left, input.requiredAbilities);

    if (captainAbilityRequirementDifference !== 0) {
      return captainAbilityRequirementDifference;
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

  private characterMatchesLeaderBoostRanges(
    character: Pick<CharacterDetailRecord, 'captainHpBoost' | 'captainAtkBoost'>,
    ranges: AutoBuildLeaderBoostRanges,
  ): boolean {
    return (
      this.captainBoostMatchesRange(character.captainAtkBoost, ranges.ATK) &&
      this.captainBoostMatchesRange(character.captainHpBoost, ranges.HP)
    );
  }

  private characterHasReadableCaptainAbility(character: CharacterDetailRecord): boolean {
    return normalizeHtmlToText(character.detail.captainAbility).trim().length > 0;
  }

  /** 869f63gma. The record-level twin of the search's own hard-avoid check. */
  private isHardAvoidedRecord(character: CharacterDetailRecord, input: AutoBuildInput): boolean {
    return (
      resolveAutoBuildAvoidMode(input) === 'hard' &&
      resolveCharacterFacetMatches(character, input.avoidedTypes, input.avoidedClasses).length > 0
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
      {
        characterIds: number[];
        requiredCharacterId: number | null;
        branchSelections: Array<{ characterId: number; mode: AutoBuildCaptainBranchMode }>;
      }
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
      const branchSelections = this.normalizeManualSlotBranchSelections(
        slot.branchSelections,
        normalizedCharacterIds,
      );

      roleMap.set(slot.role, {
        characterIds: normalizedCharacterIds,
        requiredCharacterId:
          requiredCharacterId !== null && normalizedCharacterIds.includes(requiredCharacterId)
            ? requiredCharacterId
            : null,
        branchSelections,
      });
    }

    const normalizedSlots = createEmptyAutoBuildManualSlots();

    for (const slot of normalizedSlots) {
      const roleSelection = roleMap.get(slot.role);

      slot.characterIds = [...new Set(roleSelection?.characterIds ?? [])];
      slot.requiredCharacterId = roleSelection?.requiredCharacterId ?? null;
      slot.branchSelections = roleSelection?.branchSelections.length
        ? [...roleSelection.branchSelections]
        : undefined;
    }

    return normalizedSlots;
  }

  private normalizeManualSlotBranchSelections(
    value: AutoBuildManualSlotSelection['branchSelections'],
    characterIds: readonly number[],
  ): Array<{ characterId: number; mode: AutoBuildCaptainBranchMode }> {
    const selectedIds = new Set(characterIds);
    const seenIds = new Set<number>();
    const normalizedSelections: Array<{ characterId: number; mode: AutoBuildCaptainBranchMode }> =
      [];

    for (const selection of Array.isArray(value) ? value : []) {
      const characterId = this.normalizeCharacterId(selection?.characterId);
      const mode = selection?.mode;

      if (
        characterId === null ||
        !selectedIds.has(characterId) ||
        seenIds.has(characterId) ||
        !this.isAutoBuildCaptainBranchMode(mode)
      ) {
        continue;
      }

      seenIds.add(characterId);
      normalizedSelections.push({ characterId, mode });
    }

    return normalizedSelections;
  }

  private resolveManualLeaderBranchMode(
    manualSlots: readonly AutoBuildManualSlotSelection[],
    role: AutoBuildLeaderSlotRole,
    characterId: number,
  ): AutoBuildCaptainBranchMode | null {
    const mode = manualSlots
      .find((slot) => slot.role === role)
      ?.branchSelections?.find((selection) => selection.characterId === characterId)?.mode;

    return this.isAutoBuildCaptainBranchMode(mode) ? mode : null;
  }

  private isAutoBuildCaptainBranchMode(
    value: string | null | undefined,
  ): value is AutoBuildCaptainBranchMode {
    return value === 'character1' || value === 'character2' || value === 'both';
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
      const minEffectValue = normalizeAbilityRequirementEffectValue(requirement.minEffectValue);
      const effectTargetScope = normalizeAbilityEffectTargetScope(requirement.effectTargetScope);

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
        ...(minEffectValue !== null ? { minEffectValue } : {}),
        ...(effectTargetScope !== 'any' ? { effectTargetScope } : {}),
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

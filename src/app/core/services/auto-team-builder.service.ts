import { Injectable } from "@angular/core";

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_BUILD_TOTAL_SLOT_COUNT,
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  type AutoBuildConstraints,
  type AutoBuildInput,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
  createEmptyAutoBuildManualSlots,
} from "../models/auto-team-builder.models";
import {
  type AutoBuildAbilityRequirement,
} from "../models/auto-team-builder-ability.models";
import { type CharacterDetailRecord } from "../models/optc.models";
import {
  AutoTeamBuildCancelledError,
  hasStrictAutoTeamBuildConstraints,
  isAutoTeamBuildCancelledError,
  normalizeSelectedTypes,
  planAutoTeamBuildFallbackAttempts,
  runAutoTeamBuildSearch,
  satisfiesRequestedAutoTeamBuildCoverage,
  type AutoTeamBuildPlannedAttempt,
} from "./auto-team-builder.engine";
import { resolveAutoBuildShipSelection } from "./auto-team-builder-ship.utils";
import { normalizeEnemyMechanicRequirements } from "./enemy-mechanic-draft.utils";
import { OptcRepositoryService } from "./optc-repository.service";
import {
  type AutoTeamBuilderWorkerRequest,
  type AutoTeamBuilderWorkerResponse,
} from "./auto-team-builder.worker.models";

export interface AutoTeamBuildExecutionOptions {
  onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
  signal?: AbortSignal;
  workerCount?: number;
}

const LEGACY_ABILITY_KEY_ALIASES: Record<string, string> = {
  remove_defense_up: "remove_enemy_increased_defense",
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

@Injectable({ providedIn: "root" })
export class AutoTeamBuilderService {
  public constructor(private readonly repository: OptcRepositoryService) {}

  public async buildTeam(
    selectedClasses: string[] = [],
    selectedTypes: AutoTeamBuilderType[] = [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
    constraints: AutoBuildConstraints = {},
    executionOptions: AutoTeamBuildExecutionOptions = {},
  ): Promise<AutoBuildResult | null> {
    const favoritesOnly = constraints.favoritesOnly ?? false;
    const favoriteShipsOnly = constraints.favoriteShipsOnly ?? false;
    const requireLeadersWithoutSuperEffects = constraints.requireLeadersWithoutSuperEffects ?? false;
    const requireAllSlotsInLeaderSuperEffectScope = requireLeadersWithoutSuperEffects
      ? false
      : (constraints.requireAllSlotsInLeaderSuperEffectScope ?? false);
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

    const input: AutoBuildInput = {
      types: normalizedTypes.length > 0 ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClasses: normalizedClasses,
      requireAllSelectedTypesInTeam: constraints.requireAllSelectedTypesInTeam ?? false,
      requireAllSelectedClassesPerCharacter:
        constraints.requireAllSelectedClassesPerCharacter ?? false,
      requireAllSlotsInLeaderSuperEffectScope,
      requireLeadersWithoutSuperEffects,
      minimumLeaderSuperEffectMatchingSlots:
        requireAllSlotsInLeaderSuperEffectScope
          ? constraints.minimumLeaderSuperEffectMatchingSlots ?? AUTO_BUILD_TOTAL_SLOT_COUNT
          : null,
      requireLeaderSuperSpecialCriteria: constraints.requireLeaderSuperSpecialCriteria ?? true,
      requireUniqueBaseCharacterNames: constraints.requireUniqueBaseCharacterNames ?? false,
      requiredAbilities,
      enemyMechanics,
      favoritesOnly,
      favoriteShipsOnly,
      favoriteShipIds,
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
    const allowedCharacterIds =
      hasExplicitCandidateScope
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
      stage: "loadingCandidates",
      candidateCount: 0,
      completedAttempts: 0,
      totalAttempts: 0,
      elapsedMs: 0,
      estimatedRemainingMs: null,
      averageFallbackAttemptMs: null,
      completedFallbackAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      currentIgnoredLeaderSuperSpecialCriteria: false,
      messageKey: "progress.loadingCandidates",
    });

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

    this.throwIfCancelled(executionOptions.signal);

    const shipsPromise =
      typeof this.repository.getShips === "function"
        ? this.repository.getShips()
        : Promise.resolve([]);
    const [result, ships] = await Promise.all([
      this.executeSearch(records, requestedInput, executionOptions),
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

  private async executeSearch(
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
  ): Promise<AutoBuildResult | null> {
    const plannedFallbackAttempts = planAutoTeamBuildFallbackAttempts(requestedInput, records);
    const requestedWorkerCount = this.normalizeWorkerCount(executionOptions.workerCount);

    if (requestedWorkerCount > 1 && plannedFallbackAttempts.length > 0) {
      try {
        return await this.runSearchWithWorkerPool(
          records,
          requestedInput,
          executionOptions,
          plannedFallbackAttempts,
          requestedWorkerCount,
        );
      } catch (error) {
        if (isAutoTeamBuildCancelledError(error)) {
          throw error;
        }

        return runAutoTeamBuildSearch(records, requestedInput, {
          onProgress: executionOptions.onProgress,
          isCancelled: () => executionOptions.signal?.aborted ?? false,
        });
      }
    }

    const worker = this.createWorker();

    if (!worker) {
      return runAutoTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
        isCancelled: () => executionOptions.signal?.aborted ?? false,
      });
    }

    try {
      return await this.runSearchInWorker(worker, records, requestedInput, executionOptions);
    } catch (error) {
      worker.terminate();

      if (isAutoTeamBuildCancelledError(error)) {
        throw error;
      }

      return runAutoTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
        isCancelled: () => executionOptions.signal?.aborted ?? false,
      });
    }
  }

  private async runSearchWithWorkerPool(
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
    plannedFallbackAttempts: AutoTeamBuildPlannedAttempt[],
    requestedWorkerCount: number,
  ): Promise<AutoBuildResult | null> {
    const workers = this.createWorkerPool(requestedWorkerCount);

    if (workers.length <= 1) {
      workers.forEach((worker) => worker.terminate());
      const singleWorker = this.createWorker();

      if (!singleWorker) {
        return runAutoTeamBuildSearch(records, requestedInput, {
          onProgress: executionOptions.onProgress,
          isCancelled: () => executionOptions.signal?.aborted ?? false,
        });
      }

      return this.runSearchInWorker(singleWorker, records, requestedInput, executionOptions);
    }

    try {
      await Promise.all(
        workers.map((worker) => this.initializeWorker(worker, records, executionOptions.signal)),
      );

      const timingState = this.createTimingState();
      const totalAttempts = 1 + plannedFallbackAttempts.length;

      this.throwIfCancelled(executionOptions.signal);
      this.emitProgress(executionOptions, {
        stage: "preparingSearch",
        candidateCount: records.length,
        completedAttempts: 0,
        totalAttempts: 0,
        elapsedMs: 0,
        estimatedRemainingMs: null,
        averageFallbackAttemptMs: null,
        completedFallbackAttempts: 0,
        currentDroppedTypes: [],
        currentDroppedClasses: [],
        currentIgnoredLeaderSuperSpecialCriteria: false,
        messageKey: "progress.preparingSearch",
      });

      this.emitProgress(executionOptions, {
        stage: "exactAttempt",
        candidateCount: records.length,
        completedAttempts: 0,
        totalAttempts,
        ...this.buildTimingSnapshot(timingState, totalAttempts, 0, workers.length),
        currentDroppedTypes: [],
        currentDroppedClasses: [],
        currentIgnoredLeaderSuperSpecialCriteria: false,
        messageKey: "progress.exactAttempt",
        messageParams: {
          current: 1,
          total: Math.max(totalAttempts, 1),
        },
      });

      const exactResult = await this.runAttemptInInitializedWorker(
        workers[0],
        requestedInput,
        requestedInput,
        executionOptions.signal,
      );

      if (hasStrictAutoTeamBuildConstraints(requestedInput) && plannedFallbackAttempts.length === 0) {
        this.emitProgress(executionOptions, {
          stage: "completed",
          candidateCount: records.length,
          completedAttempts: totalAttempts,
          totalAttempts,
          ...this.buildTimingSnapshot(timingState, totalAttempts, totalAttempts, workers.length),
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: "progress.completed",
        });
        return exactResult;
      }

      if (satisfiesRequestedAutoTeamBuildCoverage(exactResult)) {
        this.emitProgress(executionOptions, {
          stage: "completed",
          candidateCount: records.length,
          completedAttempts: 1,
          totalAttempts,
          ...this.buildTimingSnapshot(timingState, totalAttempts, 1, workers.length),
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: "progress.completed",
        });
        return exactResult;
      }

      if (plannedFallbackAttempts.length === 0) {
        this.emitProgress(executionOptions, {
          stage: "completed",
          candidateCount: records.length,
          completedAttempts: 1,
          totalAttempts,
          ...this.buildTimingSnapshot(timingState, totalAttempts, 1, workers.length),
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: "progress.completed",
        });
        return null;
      }

      const result = await this.runPooledFallbackAttempts(
        workers,
        plannedFallbackAttempts,
        requestedInput,
        executionOptions,
        timingState,
        records.length,
        totalAttempts,
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
  ): Promise<AutoBuildResult | null> {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise<AutoBuildResult | null>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        executionOptions.signal?.removeEventListener("abort", handleAbort);
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
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
        rejectOnce(new Error(event.message || "Auto team builder worker failed."));
      };
      const handleMessage = ({ data }: MessageEvent<AutoTeamBuilderWorkerResponse>): void => {
        if (!data || data.type === "ready" || data.runId !== runId) {
          return;
        }

        if (data.type === "progress") {
          executionOptions.onProgress?.(data.snapshot);
          return;
        }

        if (data.type === "result") {
          resolveOnce(data.result);
          return;
        }

        if (data.type === "error") {
          rejectOnce(new Error(data.errorMessage));
        }
      };

      if (executionOptions.signal?.aborted) {
        handleAbort();
        return;
      }

      executionOptions.signal?.addEventListener("abort", handleAbort, { once: true });
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);

      const request: AutoTeamBuilderWorkerRequest = {
        type: "run",
        runId,
        records,
        requestedInput,
      };

      worker.postMessage(request);
    });
  }

  private initializeWorker(
    worker: Worker,
    records: CharacterDetailRecord[],
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        signal?.removeEventListener("abort", handleAbort);
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
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
        rejectOnce(new Error(event.message || "Auto team builder worker failed."));
      };
      const handleMessage = ({ data }: MessageEvent<AutoTeamBuilderWorkerResponse>): void => {
        if (!data) {
          return;
        }

        if (data.type === "ready") {
          resolveOnce();
          return;
        }

        if (data.type === "error" && typeof data.runId === "undefined") {
          rejectOnce(new Error(data.errorMessage));
        }
      };

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      signal?.addEventListener("abort", handleAbort, { once: true });
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.postMessage({
        type: "init",
        records,
      } satisfies AutoTeamBuilderWorkerRequest);
    });
  }

  private runAttemptInInitializedWorker(
    worker: Worker,
    input: AutoBuildInput,
    requestedInput: AutoBuildInput,
    signal?: AbortSignal,
  ): Promise<AutoBuildResult | null> {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise<AutoBuildResult | null>((resolve, reject) => {
      let settled = false;
      const cleanup = (): void => {
        signal?.removeEventListener("abort", handleAbort);
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
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
        rejectOnce(new Error(event.message || "Auto team builder worker failed."));
      };
      const handleMessage = ({ data }: MessageEvent<AutoTeamBuilderWorkerResponse>): void => {
        if (!data || data.type === "ready" || data.runId !== runId) {
          return;
        }

        if (data.type === "result") {
          resolveOnce(data.result);
          return;
        }

        if (data.type === "error") {
          rejectOnce(new Error(data.errorMessage));
        }
      };

      if (signal?.aborted) {
        handleAbort();
        return;
      }

      signal?.addEventListener("abort", handleAbort, { once: true });
      worker.addEventListener("message", handleMessage);
      worker.addEventListener("error", handleError);
      worker.postMessage({
        type: "runAttempt",
        runId,
        input,
        requestedInput,
      } satisfies AutoTeamBuilderWorkerRequest);
    });
  }

  private runPooledFallbackAttempts(
    workers: Worker[],
    plannedFallbackAttempts: AutoTeamBuildPlannedAttempt[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
    timingState: AutoTeamBuildTimingState,
    candidateCount: number,
    totalAttempts: number,
  ): Promise<AutoBuildResult | null> {
    const fallbackWorkerCount = Math.max(
      1,
      Math.min(workers.length, plannedFallbackAttempts.length),
    );

    return new Promise<AutoBuildResult | null>((resolve, reject) => {
      const completedAttempts = new Map<number, PooledFallbackAttemptResult>();
      let settled = false;
      let nextAttemptIndex = 0;
      let inFlightCount = 0;

      const resolveOnce = (result: AutoBuildResult | null, completedAttemptCount: number): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.emitProgress(executionOptions, {
          stage: "completed",
          candidateCount,
          completedAttempts: completedAttemptCount,
          totalAttempts,
          ...this.buildTimingSnapshot(
            timingState,
            totalAttempts,
            completedAttemptCount,
            fallbackWorkerCount,
          ),
          currentDroppedTypes: [],
          currentDroppedClasses: [],
          currentIgnoredLeaderSuperSpecialCriteria: false,
          messageKey: "progress.completed",
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
        for (let index = 0; index < plannedFallbackAttempts.length; index += 1) {
          const currentAttempt = completedAttempts.get(index);

          if (!currentAttempt) {
            return;
          }

          if (satisfiesRequestedAutoTeamBuildCoverage(currentAttempt.result)) {
            resolveOnce(currentAttempt.result, index + 2);
            return;
          }
        }

        if (nextAttemptIndex >= plannedFallbackAttempts.length && inFlightCount === 0) {
          resolveOnce(null, totalAttempts);
        }
      };
      const dispatchAttempt = (worker: Worker): void => {
        if (settled) {
          return;
        }

        if (executionOptions.signal?.aborted) {
          rejectOnce(new AutoTeamBuildCancelledError());
          return;
        }

        if (nextAttemptIndex >= plannedFallbackAttempts.length) {
          if (inFlightCount === 0) {
            tryResolveOrderedResult();
          }
          return;
        }

        const attemptIndex = nextAttemptIndex;
        const plannedAttempt = plannedFallbackAttempts[attemptIndex];

        nextAttemptIndex += 1;
        inFlightCount += 1;
        this.emitProgress(executionOptions, {
          stage: "fallbackAttempt",
          candidateCount,
          completedAttempts: 1 + timingState.completedFallbackAttempts,
          totalAttempts,
          ...this.buildTimingSnapshot(
            timingState,
            totalAttempts,
            1 + timingState.completedFallbackAttempts,
            fallbackWorkerCount,
          ),
          currentDroppedTypes: plannedAttempt.droppedTypes,
          currentDroppedClasses: plannedAttempt.droppedClasses,
          currentIgnoredLeaderSuperSpecialCriteria: Boolean(
            plannedAttempt.ignoredLeaderSuperSpecialCriteria,
          ),
          messageKey: "progress.fallbackAttempt",
          messageParams: {
            current: attemptIndex + 2,
            total: totalAttempts,
          },
        });

        const startedAt = timingState.now();
        void this.runAttemptInInitializedWorker(
          worker,
          plannedAttempt.input,
          requestedInput,
          executionOptions.signal,
        )
          .then((result) => {
            if (settled) {
              return;
            }

            inFlightCount -= 1;
            timingState.totalCompletedFallbackMs += Math.max(0, timingState.now() - startedAt);
            timingState.completedFallbackAttempts += 1;
            completedAttempts.set(attemptIndex, {
              result,
            });
            tryResolveOrderedResult();

            if (!settled) {
              dispatchAttempt(worker);
            }
          })
          .catch((error) => {
            rejectOnce(error);
          });
      };

      for (const worker of workers) {
        dispatchAttempt(worker);
      }
    });
  }

  private createWorker(): Worker | null {
    if (typeof Worker === "undefined") {
      return null;
    }

    try {
      return new Worker(new URL("auto-team-builder.worker", import.meta.url), {
        type: "module",
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
      typeof globalThis.performance?.now === "function"
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
    "elapsedMs" | "estimatedRemainingMs" | "averageFallbackAttemptMs" | "completedFallbackAttempts"
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

  private normalizeManualSlots(
    manualSlots: AutoBuildManualSlotSelection[] | undefined,
  ): AutoBuildManualSlotSelection[] {
    const roleMap = new Map<AutoBuildManualSlotRole, number[]>();

    for (const slot of (manualSlots ?? [])) {
      if (!slot || typeof slot !== "object" || !AUTO_BUILD_MANUAL_SLOT_ROLES.includes(slot.role)) {
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

      for (const characterId of (roleMap.get(slot.role) ?? [])) {
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
    const captainSlot = manualSlots.find((slot) => slot.role === "captain");
    const friendCaptainSlot = manualSlots.find((slot) => slot.role === "friendCaptain");
    const leaderIds = new Set([
      selection.captainCharacterId,
      selection.friendCaptainCharacterId,
    ].filter((characterId): characterId is number => characterId !== null));

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
      manualSlots.find((slot) => slot.role === "captain")?.characterIds[0] ?? null;
    const friendCaptainCharacterId =
      manualSlots.find((slot) => slot.role === "friendCaptain")?.characterIds[0] ??
      captainCharacterId;
    const lockedCharacterIds = [
      ...new Set(manualSlots.flatMap((slot) => slot.characterIds)),
    ];

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

      const identity = `${normalizedAbilityKey}|${minTurns ?? "none"}|${slotTokens.join(",")}`;
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

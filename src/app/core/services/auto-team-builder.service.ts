import { Injectable } from '@angular/core';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  type AutoBuildConstraints,
  type AutoBuildInput,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type AutoBuildAbilityRequirement } from '../models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  AutoTeamBuildCancelledError,
  isAutoTeamBuildCancelledError,
  normalizeSelectedTypes,
  runAutoTeamBuildSearch,
} from './auto-team-builder.engine';
import { OptcRepositoryService } from './optc-repository.service';
import {
  type AutoTeamBuilderWorkerRequest,
  type AutoTeamBuilderWorkerResponse,
} from './auto-team-builder.worker.models';

export interface AutoTeamBuildExecutionOptions {
  onProgress?: (snapshot: AutoBuildProgressSnapshot) => void;
  signal?: AbortSignal;
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
    const normalizedTypes = normalizeSelectedTypes(selectedTypes);
    const normalizedClasses = selectedClasses.reduce<string[]>((classes, currentClass) => {
      const nextClass = currentClass.trim();

      if (
        !nextClass.length ||
        classes.some((entry) => entry.toLowerCase() === nextClass.toLowerCase())
      ) {
        return classes;
      }

      classes.push(nextClass);
      return classes;
    }, []);
    const favoriteCharacterIds = new Set(
      (constraints.favoriteCharacterIds ?? []).filter(
        (characterId) => Number.isInteger(characterId) && characterId > 0,
      ),
    );
    const requiredAbilities = this.normalizeRequiredAbilities(constraints.requiredAbilities ?? []);
    const lockedCharacterIds = [
      ...new Set(
        (constraints.lockedCharacterIds ?? []).filter(
          (characterId) => Number.isInteger(characterId) && characterId > 0,
        ),
      ),
    ];
    let captainCharacterId = this.normalizeCharacterId(constraints.captainCharacterId);
    let friendCaptainCharacterId = this.normalizeCharacterId(constraints.friendCaptainCharacterId);

    if (!captainCharacterId && friendCaptainCharacterId) {
      captainCharacterId = friendCaptainCharacterId;
    }

    if (captainCharacterId && !friendCaptainCharacterId) {
      friendCaptainCharacterId = captainCharacterId;
    }

    const input: AutoBuildInput = {
      types: normalizedTypes.length ? normalizedTypes : [AUTO_TEAM_BUILDER_DEFAULT_TYPE],
      selectedClasses: normalizedClasses,
      requireAllSelectedTypesInTeam: constraints.requireAllSelectedTypesInTeam ?? false,
      requireAllSelectedClassesPerCharacter:
        constraints.requireAllSelectedClassesPerCharacter ?? false,
      requireAllSpecialsSupportTeam: constraints.requireAllSpecialsSupportTeam ?? false,
      requiredAbilities,
      favoritesOnly,
      lockedCharacterIds,
      captainCharacterId,
      friendCaptainCharacterId,
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
      lockedCharacterIds: [...input.lockedCharacterIds],
    };

    if (favoritesOnly && !favoriteCharacterIds.size) {
      return null;
    }

    if (
      favoritesOnly &&
      lockedCharacterIds.some((characterId) => !favoriteCharacterIds.has(characterId))
    ) {
      return null;
    }

    const requestedLeaderIds = [captainCharacterId, friendCaptainCharacterId].filter(
      (characterId): characterId is number =>
        characterId !== null && Number.isInteger(characterId) && characterId > 0,
    );

    if (requestedLeaderIds.some((characterId) => !lockedCharacterIds.includes(characterId))) {
      return null;
    }

    if (
      favoritesOnly &&
      requestedLeaderIds.some((characterId) => !favoriteCharacterIds.has(characterId))
    ) {
      return null;
    }

    this.throwIfCancelled(executionOptions.signal);
    this.emitProgress(executionOptions, {
      stage: 'loadingCandidates',
      candidateCount: 0,
      completedAttempts: 0,
      totalAttempts: 0,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      message: 'Φόρτωση candidate pool...',
    });

    const records = await this.repository.getAutoBuilderCandidates(
      requestedInput.types,
      requestedInput.candidateLimit,
      {
        allowedCharacterIds: favoritesOnly ? [...favoriteCharacterIds] : undefined,
        lockedCharacterIds,
      },
    );

    this.throwIfCancelled(executionOptions.signal);

    return this.executeSearch(records, requestedInput, executionOptions);
  }

  private async executeSearch(
    records: CharacterDetailRecord[],
    requestedInput: AutoBuildInput,
    executionOptions: AutoTeamBuildExecutionOptions,
  ): Promise<AutoBuildResult | null> {
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
        if (!data || data.runId !== runId) {
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

        rejectOnce(new Error(data.errorMessage));
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
        requestedInput,
      };

      worker.postMessage(request);
    });
  }

  private createWorker(): Worker | null {
    if (typeof Worker === 'undefined') {
      return null;
    }

    try {
      return new Worker(new URL('./auto-team-builder.worker', import.meta.url), {
        type: 'module',
      });
    } catch {
      return null;
    }
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

  private normalizeCharacterId(characterId: number | null | undefined): number | null {
    return Number.isInteger(characterId) && Number(characterId) > 0 ? Number(characterId) : null;
  }

  private normalizeRequiredAbilities(
    requirements: AutoBuildAbilityRequirement[],
  ): AutoBuildAbilityRequirement[] {
    const normalizedRequirements = new Map<string, AutoBuildAbilityRequirement>();

    requirements.forEach((requirement) => {
      const abilityKey = requirement.abilityKey.trim();
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

      if (!abilityKey.length) {
        return;
      }

      const identity = `${abilityKey}|${minTurns ?? 'none'}|${slotTokens.join(',')}`;
      const existingRequirement = normalizedRequirements.get(identity);

      if (existingRequirement) {
        existingRequirement.requiredCharacterCount = Math.max(
          existingRequirement.requiredCharacterCount,
          requiredCharacterCount,
        );
        return;
      }

      normalizedRequirements.set(identity, {
        abilityKey,
        minTurns,
        slotTokens,
        requiredCharacterCount,
      });
    });

    return [...normalizedRequirements.values()];
  }
}

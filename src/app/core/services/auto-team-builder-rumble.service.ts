import { Injectable } from '@angular/core';

import {
  type NormalizedRumbleData,
  type RumbleBuildInput,
  type RumbleBuildProgressSnapshot,
  type RumbleTeamResult,
  type RumbleUnitScore,
} from '../models/auto-team-builder-rumble.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  RumbleTeamBuilderEngine,
  normalizeRumbleBuildInput,
  runRumbleTeamBuildSearch,
} from './auto-team-builder-rumble.engine';
import { OptcRepositoryService } from './optc-repository.service';
import {
  type AutoTeamBuilderRumbleWorkerRequest,
  type AutoTeamBuilderRumbleWorkerResponse,
} from './auto-team-builder-rumble.worker.models';

export interface RumbleTeamBuildExecutionOptions {
  onProgress?: (snapshot: RumbleBuildProgressSnapshot) => void;
  signal?: AbortSignal;
  workerCount?: number;
  getWorkerCount?: () => number;
}

@Injectable({ providedIn: 'root' })
export class AutoTeamBuilderRumbleService {
  private readonly engine = new RumbleTeamBuilderEngine();

  public constructor(private readonly repository: OptcRepositoryService) {}

  public async buildBestTeam(
    input: Partial<RumbleBuildInput> = {},
    executionOptions: RumbleTeamBuildExecutionOptions = {},
  ): Promise<RumbleTeamResult> {
    const requestedInput = normalizeRumbleBuildInput(input);

    if (requestedInput.favoritesOnly && requestedInput.favoriteCharacterIds.length === 0) {
      return this.engine.createEmptyResult(0, requestedInput);
    }

    executionOptions.onProgress?.({
      stage: 'loadingCandidates',
      candidateCount: 0,
      completedAttempts: 0,
      totalAttempts: 0,
      attemptCountFinal: false,
      currentDroppedTypes: [],
      currentDroppedClasses: [],
      elapsedMs: 0,
      estimatedRemainingMs: null,
      messageKey: 'progress.loadingCandidates',
    });
    this.throwIfCancelled(executionOptions.signal);

    const records = await this.repository.getRumbleBuilderCandidates();
    this.throwIfCancelled(executionOptions.signal);

    return this.runBuild(records, requestedInput, executionOptions);
  }

  public buildTeamFromCandidates(
    candidates: CharacterDetailRecord[],
    input: Partial<RumbleBuildInput> = {},
  ): RumbleTeamResult {
    return this.engine.buildTeamFromCandidates(candidates, input);
  }

  public scoreCandidates(candidates: CharacterDetailRecord[]): RumbleUnitScore[] {
    return this.engine.scoreCandidates(candidates);
  }

  public normalizeRumbleData(
    character: CharacterDetailRecord,
    charactersById: ReadonlyMap<number, CharacterDetailRecord>,
  ): NormalizedRumbleData | null {
    return this.engine.normalizeRumbleData(character, charactersById);
  }

  private async runBuild(
    records: CharacterDetailRecord[],
    requestedInput: RumbleBuildInput,
    executionOptions: RumbleTeamBuildExecutionOptions,
  ): Promise<RumbleTeamResult> {
    const workerCount = this.normalizeWorkerCount(executionOptions.workerCount);

    if (workerCount > 1) {
      const workerResult = await this.runSearchInWorker(records, requestedInput, executionOptions);

      this.throwIfCancelled(executionOptions.signal);

      if (workerResult) {
        return workerResult;
      }
    }

    const worker = this.createWorker();

    if (!worker) {
      this.throwIfCancelled(executionOptions.signal);

      return runRumbleTeamBuildSearch(records, requestedInput, {
        onProgress: executionOptions.onProgress,
      });
    }

    try {
      return await this.runSearchInWorkerInstance(
        worker,
        records,
        requestedInput,
        executionOptions,
      );
    } finally {
      worker.terminate();
    }
  }

  private async runSearchInWorker(
    records: CharacterDetailRecord[],
    requestedInput: RumbleBuildInput,
    executionOptions: RumbleTeamBuildExecutionOptions,
  ): Promise<RumbleTeamResult | null> {
    const worker = this.createWorker();

    if (!worker) {
      return null;
    }

    try {
      return await this.runSearchInWorkerInstance(
        worker,
        records,
        requestedInput,
        executionOptions,
      );
    } catch {
      return null;
    } finally {
      worker.terminate();
    }
  }

  private runSearchInWorkerInstance(
    worker: Worker,
    records: CharacterDetailRecord[],
    requestedInput: RumbleBuildInput,
    executionOptions: RumbleTeamBuildExecutionOptions,
  ): Promise<RumbleTeamResult> {
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise<RumbleTeamResult>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        executionOptions.signal?.removeEventListener('abort', handleAbort);
      };
      const resolveOnce = (result: RumbleTeamResult) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(result);
      };
      const rejectOnce = (error: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        worker.terminate();
        reject(error);
      };
      const handleAbort = () => rejectOnce(new Error('Rumble team build cancelled.'));
      const handleError = (event: ErrorEvent) =>
        rejectOnce(new Error(event.message || 'Auto Rumble builder worker failed.'));
      const handleMessage = ({ data }: MessageEvent<AutoTeamBuilderRumbleWorkerResponse>) => {
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

        if (data.type === 'error') {
          rejectOnce(new Error(data.errorMessage));
        }
      };

      if (executionOptions.signal?.aborted) {
        handleAbort();
        return;
      }

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      executionOptions.signal?.addEventListener('abort', handleAbort, { once: true });

      const request: AutoTeamBuilderRumbleWorkerRequest = {
        type: 'run',
        runId,
        records,
        requestedInput,
        workerCount: this.resolveDesiredWorkerCount(executionOptions),
      };

      worker.postMessage(request);
    });
  }

  private createWorker(): Worker | null {
    if (typeof Worker === 'undefined') {
      return null;
    }

    try {
      return new Worker(new URL('auto-team-builder-rumble.worker', import.meta.url), {
        type: 'module',
      });
    } catch {
      return null;
    }
  }

  private resolveDesiredWorkerCount(executionOptions: RumbleTeamBuildExecutionOptions): number {
    try {
      return this.normalizeWorkerCount(
        executionOptions.getWorkerCount?.() ?? executionOptions.workerCount,
      );
    } catch {
      return this.normalizeWorkerCount(executionOptions.workerCount);
    }
  }

  private normalizeWorkerCount(workerCount: number | undefined): number {
    if (!Number.isFinite(workerCount)) {
      return 1;
    }

    return Math.max(1, Math.floor(workerCount ?? 1));
  }

  private throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('Rumble team build cancelled.');
    }
  }
}

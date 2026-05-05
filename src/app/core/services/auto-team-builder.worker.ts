/// <reference lib="webworker" />

import { runAutoTeamBuildAttempt, runAutoTeamBuildSearch } from './auto-team-builder.engine';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  prepareAutoTeamBuildContext,
  type PreparedAutoTeamBuildContext,
} from './auto-team-builder.utils';
import {
  type AutoTeamBuilderWorkerRequest,
  type AutoTeamBuilderWorkerResponse,
} from './auto-team-builder.worker.models';

let cachedRecords: CharacterDetailRecord[] | null = null;
let cachedFriendCaptainRecords: CharacterDetailRecord[] | undefined;
let cachedContext: PreparedAutoTeamBuildContext | null = null;
let cachedFriendCaptainContext: PreparedAutoTeamBuildContext | undefined;
let cachedAutoFillCharacterIds: number[] | undefined;
let cachedLeaderAutoFillCharacterIds: number[] | undefined;
let cachedSubAutoFillCharacterIds: number[] | undefined;

addEventListener('message', ({ data }: MessageEvent<AutoTeamBuilderWorkerRequest>) => {
  if (data.type === 'init') {
    cachedRecords = data.records;
    cachedFriendCaptainRecords = data.friendCaptainRecords;
    cachedContext = prepareAutoTeamBuildContext(data.records);
    cachedFriendCaptainContext = data.friendCaptainRecords
      ? prepareAutoTeamBuildContext(data.friendCaptainRecords)
      : undefined;
    cachedAutoFillCharacterIds = data.autoFillCharacterIds;
    cachedLeaderAutoFillCharacterIds = data.leaderAutoFillCharacterIds;
    cachedSubAutoFillCharacterIds = data.subAutoFillCharacterIds;

    const response: AutoTeamBuilderWorkerResponse = {
      type: 'ready',
    };

    postMessage(response);
    return;
  }

  if (data.type === 'runAttempt') {
    if (!cachedRecords) {
      const response: AutoTeamBuilderWorkerResponse = {
        type: 'error',
        runId: data.runId,
        errorMessage: 'Auto team builder worker is not initialized.',
      };

      postMessage(response);
      return;
    }

    try {
      const result = runAutoTeamBuildAttempt(
        cachedRecords,
        data.input,
        data.requestedInput,
        data.requireLeadersWithoutSuperEffects,
        data.friendCaptainRecords ?? cachedFriendCaptainRecords,
        data.autoFillCharacterIds ?? cachedAutoFillCharacterIds,
        data.leaderAutoFillCharacterIds ?? cachedLeaderAutoFillCharacterIds,
        data.subAutoFillCharacterIds ?? cachedSubAutoFillCharacterIds,
        cachedContext ?? prepareAutoTeamBuildContext(cachedRecords),
        data.friendCaptainRecords
          ? prepareAutoTeamBuildContext(data.friendCaptainRecords)
          : cachedFriendCaptainContext,
        {
          onProgress: (progress) => {
            const response: AutoTeamBuilderWorkerResponse = {
              type: 'attemptProgress',
              runId: data.runId,
              progress,
            };

            postMessage(response);
          },
        },
      );
      const response: AutoTeamBuilderWorkerResponse = {
        type: 'result',
        runId: data.runId,
        result,
      };

      postMessage(response);
    } catch (error) {
      const response: AutoTeamBuilderWorkerResponse = {
        type: 'error',
        runId: data.runId,
        errorMessage: error instanceof Error ? error.message : 'Unknown worker error',
      };

      postMessage(response);
    }
    return;
  }

  if (data.type !== 'run') {
    return;
  }

  try {
    const result = runAutoTeamBuildSearch(data.records, data.requestedInput, {
      friendCaptainRecords: data.friendCaptainRecords,
      preparedContext: prepareAutoTeamBuildContext(data.records),
      friendCaptainContext: data.friendCaptainRecords
        ? prepareAutoTeamBuildContext(data.friendCaptainRecords)
        : undefined,
      autoFillCharacterIds: data.autoFillCharacterIds,
      leaderAutoFillCharacterIds: data.leaderAutoFillCharacterIds,
      subAutoFillCharacterIds: data.subAutoFillCharacterIds,
      maxScheduledFallbackAttempts: data.maxScheduledFallbackAttempts,
      onProgress: (snapshot) => {
        const response: AutoTeamBuilderWorkerResponse = {
          type: 'progress',
          runId: data.runId,
          snapshot,
        };

        postMessage(response);
      },
    });
    const response: AutoTeamBuilderWorkerResponse = {
      type: 'result',
      runId: data.runId,
      result,
    };

    postMessage(response);
  } catch (error) {
    const response: AutoTeamBuilderWorkerResponse = {
      type: 'error',
      runId: data.runId,
      errorMessage: error instanceof Error ? error.message : 'Unknown worker error',
    };

    postMessage(response);
  }
});

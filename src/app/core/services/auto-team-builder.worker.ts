/// <reference lib="webworker" />

import { runAutoTeamBuildAttempt, runAutoTeamBuildSearch } from './auto-team-builder.engine';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  type AutoTeamBuilderWorkerRequest,
  type AutoTeamBuilderWorkerResponse,
} from './auto-team-builder.worker.models';

let cachedRecords: CharacterDetailRecord[] | null = null;

addEventListener('message', ({ data }: MessageEvent<AutoTeamBuilderWorkerRequest>) => {
  if (data.type === 'init') {
    cachedRecords = data.records;

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
      const result = runAutoTeamBuildAttempt(cachedRecords, data.input, data.requestedInput);
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

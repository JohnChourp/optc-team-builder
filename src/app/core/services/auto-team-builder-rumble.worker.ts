/// <reference lib="webworker" />

import { runRumbleTeamBuildSearches } from './auto-team-builder-rumble.engine';
import {
  type AutoTeamBuilderRumbleWorkerRequest,
  type AutoTeamBuilderRumbleWorkerResponse,
} from './auto-team-builder-rumble.worker.models';

addEventListener('message', ({ data }: MessageEvent<AutoTeamBuilderRumbleWorkerRequest>) => {
  if (!data || data.type !== 'run') {
    return;
  }

  try {
    const results = runRumbleTeamBuildSearches(
      data.records,
      data.requestedInput,
      {
        activeWorkerCount: 1,
        onProgress: (snapshot) => {
          const response: AutoTeamBuilderRumbleWorkerResponse = {
            type: 'progress',
            runId: data.runId,
            snapshot,
          };

          postMessage(response);
        },
      },
      data.limit,
    );
    const response: AutoTeamBuilderRumbleWorkerResponse = {
      type: 'result',
      runId: data.runId,
      results,
    };

    postMessage(response);
  } catch (error) {
    const response: AutoTeamBuilderRumbleWorkerResponse = {
      type: 'error',
      runId: data.runId,
      errorMessage: error instanceof Error ? error.message : 'Unknown worker error',
    };

    postMessage(response);
  }
});

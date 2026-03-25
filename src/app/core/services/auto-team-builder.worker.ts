/// <reference lib="webworker" />

import { runAutoTeamBuildSearch } from './auto-team-builder.engine';
import {
  type AutoTeamBuilderWorkerRequest,
  type AutoTeamBuilderWorkerResponse,
} from './auto-team-builder.worker.models';

addEventListener('message', ({ data }: MessageEvent<AutoTeamBuilderWorkerRequest>) => {
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

/// <reference lib="webworker" />

import {
  type CaptainCoverageResultPassDataset,
  runCaptainCoverageResultPass,
} from './captain-coverage-result-pass.utils';
import {
  type CaptainCoverageFilterWorkerRequest,
  type CaptainCoverageFilterWorkerResponse,
} from './captain-coverage-filter.worker.models';

/**
 * Runs the Captain Coverage result pass off the main thread.
 *
 * The whole point is that this file contains no logic of its own: it holds the
 * catalog and calls `runCaptainCoverageResultPass`, the same function the page
 * calls directly when no Worker is available. Anything clever added here would
 * exist only in the worker path and be invisible to every unit test in the
 * repo, which runs the in-thread one.
 */
let dataset: CaptainCoverageResultPassDataset | null = null;

function reply(response: CaptainCoverageFilterWorkerResponse): void {
  postMessage(response);
}

addEventListener('message', ({ data }: MessageEvent<CaptainCoverageFilterWorkerRequest>) => {
  if (data.type === 'init') {
    dataset = data.dataset;
    reply({ type: 'ready' });

    return;
  }

  if (data.type !== 'filter') {
    return;
  }

  if (!dataset) {
    /*
     * The service always sends `init` before the first `filter`, so this is a
     * bug rather than a race - but it is reported rather than thrown, because
     * an unhandled throw in a worker surfaces as an opaque ErrorEvent with no
     * request id, and the page would have nothing to fall back for.
     */
    reply({
      type: 'error',
      requestId: data.requestId,
      message: 'Captain Coverage filter worker received a filter request before its dataset.',
    });

    return;
  }

  try {
    const outcome = runCaptainCoverageResultPass(dataset, data.params);

    reply({
      type: 'result',
      requestId: data.requestId,
      ids: outcome.ids,
      boostedCount: outcome.boostedCount,
    });
  } catch (error) {
    reply({
      type: 'error',
      requestId: data.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

import {
  type CaptainCoverageResultPassDataset,
  type CaptainCoverageResultPassOutcome,
  type CaptainCoverageResultPassParams,
  runCaptainCoverageResultPass,
} from './captain-coverage-result-pass.utils';
import {
  type CaptainCoverageFilterWorkerRequest,
  type CaptainCoverageFilterWorkerResponse,
} from './captain-coverage-filter.worker.models';

/**
 * The Captain Coverage worker's message protocol, separated from the worker so
 * a spec can drive it.
 *
 * The worker module itself cannot be imported by a test: importing it registers
 * a `message` listener on the global and calls `postMessage`, so the file has
 * side effects at import time and needs a Worker-shaped global that this test
 * environment does not have - the page spec builds the page class directly, in
 * an environment with no `Worker` at all.
 *
 * That left the protocol untested, and the protocol is the part with branches.
 * The pass itself is pure and covered by `captain-coverage-result-pass.utils`;
 * what nothing exercised was the dataset caching, the request routing, the
 * pre-init guard, the error mapping, and above all the requestId echo - the one
 * branch whose failure a reader would actually see, since the runner resolves
 * strictly on an exact id match and a wrong id strands the promise.
 *
 * `reply` and `run` are injected so the spec can assert what was posted without
 * a Worker, and so production keeps calling the same function the in-thread
 * fallback calls.
 */
export function createCaptainCoverageFilterWorkerHandler(
  reply: (response: CaptainCoverageFilterWorkerResponse) => void,
  run: (
    dataset: CaptainCoverageResultPassDataset,
    params: CaptainCoverageResultPassParams,
  ) => CaptainCoverageResultPassOutcome = runCaptainCoverageResultPass,
): (request: CaptainCoverageFilterWorkerRequest) => void {
  let dataset: CaptainCoverageResultPassDataset | null = null;

  return (request: CaptainCoverageFilterWorkerRequest): void => {
    if (request.type === 'init') {
      dataset = request.dataset;
      reply({ type: 'ready' });

      return;
    }

    if (request.type !== 'filter') {
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
        requestId: request.requestId,
        message: 'Captain Coverage filter worker received a filter request before its dataset.',
      });

      return;
    }

    try {
      const outcome = run(dataset, request.params);

      reply({
        type: 'result',
        requestId: request.requestId,
        ids: outcome.ids,
        boostedCount: outcome.boostedCount,
      });
    } catch (error) {
      reply({
        type: 'error',
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

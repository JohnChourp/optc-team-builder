/// <reference lib="webworker" />

import { createCaptainCoverageFilterWorkerHandler } from './captain-coverage-filter.worker.handler';
import {
  type CaptainCoverageFilterWorkerRequest,
  type CaptainCoverageFilterWorkerResponse,
} from './captain-coverage-filter.worker.models';

/**
 * Runs the Captain Coverage result pass off the main thread.
 *
 * The whole point is that this file contains no logic of its own: the protocol
 * lives in `captain-coverage-filter.worker.handler.ts`, which a spec can drive,
 * and the pass itself is `runCaptainCoverageResultPass` - the same function the
 * page calls directly when no Worker is available. Anything clever added here
 * would exist only in the worker path and be invisible to every unit test in
 * the repo, which runs the in-thread one.
 *
 * What remains here is the part that cannot be tested without a Worker: binding
 * the handler to `addEventListener` and `postMessage`.
 */
const handle = createCaptainCoverageFilterWorkerHandler(
  (response: CaptainCoverageFilterWorkerResponse) => {
    postMessage(response);
  },
);

addEventListener('message', ({ data }: MessageEvent<CaptainCoverageFilterWorkerRequest>) => {
  handle(data);
});

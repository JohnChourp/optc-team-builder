import { Injectable } from '@angular/core';

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

interface PendingCaptainCoverageFilterRequest {
  resolve: (outcome: CaptainCoverageResultPassOutcome) => void;
  dataset: CaptainCoverageResultPassDataset;
  params: CaptainCoverageResultPassParams;
}

/**
 * Runs the Captain Coverage result pass, in a Worker when the browser has one.
 *
 * Two things are deliberate:
 *
 * 1. **The fallback runs the same function the worker runs.** It is not a
 *    degraded path - it is what every unit test in this repo exercises, because
 *    the page spec constructs the page class directly in an environment with no
 *    `Worker` at all. A separate in-thread implementation would be untested in
 *    the browser and untestable on the main thread at the same time.
 * 2. **A failing worker is abandoned, not retried.** If construction throws, a
 *    message fails to clone, or the worker reports an error, the request is
 *    answered in-thread and the worker is dropped for the rest of the session.
 *    Retrying a worker that has already failed once turns a slow page into a
 *    page that never answers.
 */
@Injectable({ providedIn: 'root' })
export class CaptainCoverageFilterRunnerService {
  private worker: Worker | null = null;
  private workerUnavailable = false;
  /**
   * The dataset identity last sent to the worker. The page rebuilds its dataset
   * only when the catalog changes, so reference equality is exactly the right
   * test for "does the worker already have this?".
   */
  private initializedDataset: CaptainCoverageResultPassDataset | null = null;
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingCaptainCoverageFilterRequest>();

  public async run(
    dataset: CaptainCoverageResultPassDataset,
    params: CaptainCoverageResultPassParams,
  ): Promise<CaptainCoverageResultPassOutcome> {
    const worker = this.ensureWorker();

    if (!worker) {
      return runCaptainCoverageResultPass(dataset, params);
    }

    try {
      if (this.initializedDataset !== dataset) {
        this.post(worker, { type: 'init', dataset });
        this.initializedDataset = dataset;
      }

      const requestId = this.nextRequestId;

      this.nextRequestId += 1;

      return await new Promise<CaptainCoverageResultPassOutcome>((resolve) => {
        this.pending.set(requestId, { resolve, dataset, params });
        this.post(worker, { type: 'filter', requestId, params });
      });
    } catch {
      // A clone failure or a dead worker: answer this request in-thread and
      // stop using the worker rather than failing every later press too.
      this.abandonWorker();

      return runCaptainCoverageResultPass(dataset, params);
    }
  }

  /** Drops the worker so the next run rebuilds it. Used when the catalog is replaced. */
  public reset(): void {
    this.terminateWorker();
    this.workerUnavailable = false;
  }

  private ensureWorker(): Worker | null {
    if (this.workerUnavailable) {
      return null;
    }

    if (this.worker) {
      return this.worker;
    }

    const worker = this.createWorker();

    if (!worker) {
      this.workerUnavailable = true;

      return null;
    }

    worker.addEventListener('message', (event: MessageEvent) => {
      this.onWorkerMessage(event.data as CaptainCoverageFilterWorkerResponse);
    });
    worker.addEventListener('error', () => {
      this.abandonWorker();
    });
    worker.addEventListener('messageerror', () => {
      this.abandonWorker();
    });
    this.worker = worker;
    this.initializedDataset = null;

    return worker;
  }

  private createWorker(): Worker | null {
    if (typeof Worker === 'undefined') {
      return null;
    }

    try {
      return new Worker(new URL('captain-coverage-filter.worker', import.meta.url), {
        type: 'module',
      });
    } catch {
      return null;
    }
  }

  private post(worker: Worker, request: CaptainCoverageFilterWorkerRequest): void {
    worker.postMessage(request);
  }

  private onWorkerMessage(response: CaptainCoverageFilterWorkerResponse): void {
    if (response.type === 'ready') {
      return;
    }

    if (response.type === 'result') {
      const request = this.pending.get(response.requestId);

      if (!request) {
        return;
      }

      this.pending.delete(response.requestId);
      request.resolve({ ids: response.ids, boostedCount: response.boostedCount });

      return;
    }

    /*
     * An error answers only the request it names, in-thread, so the reader still
     * gets a list. An error with no request id means the worker is unusable for
     * everything, so every waiter is answered the same way.
     */
    if (response.requestId === null) {
      this.abandonWorker();

      return;
    }

    const request = this.pending.get(response.requestId);

    if (!request) {
      return;
    }

    this.pending.delete(response.requestId);
    request.resolve(runCaptainCoverageResultPass(request.dataset, request.params));
  }

  /**
   * Stops using the worker and answers everyone still waiting in-thread, so a
   * worker that dies mid-flight cannot leave the page pending forever.
   */
  private abandonWorker(): void {
    this.workerUnavailable = true;

    const waiting = [...this.pending.values()];

    this.pending.clear();
    this.terminateWorker();

    for (const request of waiting) {
      request.resolve(runCaptainCoverageResultPass(request.dataset, request.params));
    }
  }

  private terminateWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.initializedDataset = null;
  }
}

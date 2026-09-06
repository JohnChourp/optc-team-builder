import {
  type CaptainCoverageResultPassDataset,
  type CaptainCoverageResultPassOutcome,
  type CaptainCoverageResultPassParams,
} from './captain-coverage-result-pass.utils';

/**
 * The wire format between the page and `captain-coverage-filter.worker.ts`.
 *
 * Everything here has to survive the structured clone algorithm. It does: the
 * dataset is plain objects and arrays, and the one non-obvious member -
 * `params.filterState.requiredAbilityCharacterIds` - is a `Set`, which the
 * algorithm handles natively. Nothing carries a function, a class instance or
 * an Angular signal.
 */
export type CaptainCoverageFilterWorkerRequest =
  | {
      type: 'init';
      /**
       * Sent once per catalog, not per filter press. It is the projected
       * dataset rather than the character records, which is what keeps this
       * message small enough to be worth sending at all.
       */
      dataset: CaptainCoverageResultPassDataset;
    }
  | {
      type: 'filter';
      requestId: number;
      params: CaptainCoverageResultPassParams;
    };

export type CaptainCoverageFilterWorkerResponse =
  | { type: 'ready' }
  | ({ type: 'result'; requestId: number } & CaptainCoverageResultPassOutcome)
  | {
      type: 'error';
      /** Null when the failure was not tied to one request, e.g. a bad init. */
      requestId: number | null;
      message: string;
    };

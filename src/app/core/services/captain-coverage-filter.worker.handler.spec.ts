import { describe, expect, it, vi } from 'vitest';

import { createCaptainCoverageFilterWorkerHandler } from './captain-coverage-filter.worker.handler';
import {
  type CaptainCoverageResultPassDataset,
  type CaptainCoverageResultPassOutcome,
  type CaptainCoverageResultPassParams,
} from './captain-coverage-result-pass.utils';
import { type CaptainCoverageFilterWorkerResponse } from './captain-coverage-filter.worker.models';

function createDataset(label: string): CaptainCoverageResultPassDataset {
  return { label } as unknown as CaptainCoverageResultPassDataset;
}

function createParams(): CaptainCoverageResultPassParams {
  return {} as unknown as CaptainCoverageResultPassParams;
}

function createHarness(
  run: (
    dataset: CaptainCoverageResultPassDataset,
    params: CaptainCoverageResultPassParams,
  ) => CaptainCoverageResultPassOutcome = () => ({ ids: [1], boostedCount: 0 }),
) {
  const replies: CaptainCoverageFilterWorkerResponse[] = [];
  const runSpy = vi.fn(run);
  const handle = createCaptainCoverageFilterWorkerHandler(
    (response) => replies.push(response),
    runSpy,
  );

  return { handle, replies, runSpy };
}

describe('captain coverage filter worker handler', () => {
  it('acknowledges init before any filter runs', () => {
    const { handle, replies, runSpy } = createHarness();

    handle({ type: 'init', dataset: createDataset('a') });

    expect(replies).toEqual([{ type: 'ready' }]);
    expect(runSpy).not.toHaveBeenCalled();
  });

  /*
   * The branch whose failure a reader would actually see. The runner resolves
   * strictly on an exact id match (`pending.get(response.requestId)`) and
   * `nextRequestId` only ever increases, so echoing the wrong id strands the
   * promise: no reply is ever matched, the loader is never cleared, and the
   * results list never returns. Until this spec existed, the only thing
   * exercising it was a browser lane that `verify:local` does not run by
   * default.
   */
  it('echoes the request id it was given, not a counter of its own', () => {
    const { handle, replies } = createHarness();

    handle({ type: 'init', dataset: createDataset('a') });
    handle({ type: 'filter', requestId: 7, params: createParams() });
    handle({ type: 'filter', requestId: 4, params: createParams() });

    expect(replies.slice(1)).toEqual([
      { type: 'result', requestId: 7, ids: [1], boostedCount: 0 },
      { type: 'result', requestId: 4, ids: [1], boostedCount: 0 },
    ]);
  });

  it('runs the pass against the dataset init gave it, and keeps it across filters', () => {
    const { handle, runSpy } = createHarness();
    const dataset = createDataset('catalog-1');

    handle({ type: 'init', dataset });
    handle({ type: 'filter', requestId: 1, params: createParams() });
    handle({ type: 'filter', requestId: 2, params: createParams() });

    expect(runSpy).toHaveBeenCalledTimes(2);
    expect(runSpy.mock.calls[0]?.[0]).toBe(dataset);
    expect(runSpy.mock.calls[1]?.[0]).toBe(dataset);
  });

  it('replaces the dataset when init arrives again', () => {
    const { handle, runSpy } = createHarness();
    const first = createDataset('catalog-1');
    const second = createDataset('catalog-2');

    handle({ type: 'init', dataset: first });
    handle({ type: 'filter', requestId: 1, params: createParams() });
    handle({ type: 'init', dataset: second });
    handle({ type: 'filter', requestId: 2, params: createParams() });

    expect(runSpy.mock.calls[0]?.[0]).toBe(first);
    expect(runSpy.mock.calls[1]?.[0]).toBe(second);
  });

  /*
   * Reported rather than thrown, deliberately: an unhandled throw inside a
   * worker surfaces as an opaque ErrorEvent with no request id, and the runner
   * would have nothing to answer - it abandons the worker and settles every
   * waiter, which is a much bigger hammer than answering one request.
   */
  it('reports a filter that arrives before its dataset instead of throwing', () => {
    const { handle, replies, runSpy } = createHarness();

    expect(() => handle({ type: 'filter', requestId: 3, params: createParams() })).not.toThrow();
    expect(runSpy).not.toHaveBeenCalled();
    expect(replies).toEqual([
      {
        type: 'error',
        requestId: 3,
        message: 'Captain Coverage filter worker received a filter request before its dataset.',
      },
    ]);
  });

  it('maps a thrown pass into an error naming the request that failed', () => {
    const { handle, replies } = createHarness(() => {
      throw new Error('catalog exploded');
    });

    handle({ type: 'init', dataset: createDataset('a') });
    handle({ type: 'filter', requestId: 11, params: createParams() });

    expect(replies[1]).toEqual({ type: 'error', requestId: 11, message: 'catalog exploded' });
  });

  it('survives a thrown non-Error', () => {
    const { handle, replies } = createHarness(() => {
      throw 'plain string';
    });

    handle({ type: 'init', dataset: createDataset('a') });
    handle({ type: 'filter', requestId: 12, params: createParams() });

    expect(replies[1]).toEqual({ type: 'error', requestId: 12, message: 'plain string' });
  });

  it('ignores a message type it does not know', () => {
    const { handle, replies, runSpy } = createHarness();

    handle({ type: 'init', dataset: createDataset('a') });
    handle({ type: 'nonsense' } as never);

    expect(replies).toEqual([{ type: 'ready' }]);
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('keeps each handler\'s dataset to itself', () => {
    const first = createHarness();
    const second = createHarness();

    first.handle({ type: 'init', dataset: createDataset('first') });
    second.handle({ type: 'filter', requestId: 1, params: createParams() });

    expect(second.replies[0]?.type).toBe('error');
    expect(second.runSpy).not.toHaveBeenCalled();
  });
});

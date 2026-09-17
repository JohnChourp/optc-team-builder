import { afterEach, describe, expect, it, vi } from 'vitest';

import { WORKER_FALLBACK_CODE, reportWorkerFallback } from './worker-fallback.utils';

describe('reportWorkerFallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns with a stable code, the worker, the reason and the cause', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    reportWorkerFallback('captain-coverage-filter', 'construction-failed', new Error('blocked by CSP'));
    reportWorkerFallback('auto-team-builder', 'worker-failed', 'worker crashed');
    reportWorkerFallback('auto-team-builder-rumble', 'worker-failed');

    expect(warn.mock.calls).toEqual([
      [
        WORKER_FALLBACK_CODE,
        'captain-coverage-filter construction-failed (blocked by CSP); running on the main thread instead.',
      ],
      [WORKER_FALLBACK_CODE, 'auto-team-builder worker-failed (worker crashed); running on the main thread instead.'],
      [WORKER_FALLBACK_CODE, 'auto-team-builder-rumble worker-failed; running on the main thread instead.'],
    ]);
  });
});

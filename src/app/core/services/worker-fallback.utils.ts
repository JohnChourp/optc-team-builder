/*
 * 869f138qj. A worker that cannot start, or that fails, is replaced by the same function running on
 * the main thread. The answer is right either way, which is exactly why the switch was silent: all
 * three services caught the failure in a bare `catch` and carried on, so a worker that stopped being
 * bundled would have slowed every search with nothing anywhere saying so. `check-worker-bundling`
 * guards the build; this reports the run.
 *
 * `console.warn` with a stable first argument, the same shape the dataset loader uses, so a debug
 * report or a devtools filter can find it.
 */

export const WORKER_FALLBACK_CODE = 'optc:worker-fallback';

export type WorkerFallbackSource =
  | 'auto-team-builder'
  | 'auto-team-builder-rumble'
  | 'captain-coverage-filter';

/** `construction-failed`: the Worker constructor threw. `worker-failed`: it ran and then failed. */
export type WorkerFallbackReason = 'construction-failed' | 'worker-failed';

export function reportWorkerFallback(
  source: WorkerFallbackSource,
  reason: WorkerFallbackReason,
  error?: unknown,
): void {
  const cause = error === undefined ? '' : ` (${error instanceof Error ? error.message : String(error)})`;

  console.warn(WORKER_FALLBACK_CODE, `${source} ${reason}${cause}; running on the main thread instead.`);
}

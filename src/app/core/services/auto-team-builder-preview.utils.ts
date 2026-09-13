/**
 * 869f127cc. A long search reported a percentage and nothing to look at, then delivered everything
 * at once. This is the rule deciding which team may be shown WHILE the search is still running.
 *
 * The rule is planned order, not finishing order - and that is not a preference. The pool already
 * resolves its final answer that way, for a reason recorded in `auto-team-builder.service.ts`:
 *
 *   "Planned order decides, never finishing order (owner, 2026-09-11: the same filters always give
 *    the same team). A later attempt that finished first used to win as long as it kept captain
 *    coverage, so the team depended on core count, the live worker count and timing."
 *
 * Showing "the first team any worker finishes" would reintroduce exactly that, on a new surface:
 * two readers with the same filters and different core counts would watch different teams appear.
 * So a preview is replaced only by an attempt STRICTLY EARLIER IN THE PLAN, which makes the
 * sequence of previews a reader sees depend on the plan alone.
 *
 * There is deliberately no time-based throttle. Planned order is its own throttle - a preview can
 * only be replaced by a strictly smaller sequence, so the repaints are bounded by the sequence it
 * started at, and in practice the exact attempt is sequence 0 and ends the matter the moment it
 * succeeds. A timer here would add a window in which the best preview can arrive, be suppressed as
 * "too soon", and then never be offered again because nothing better follows it.
 */

/** What is currently on screen as a provisional team, or null before the first one. */
export interface AutoTeamBuildPreviewState<TResult> {
  /** The attempt's position in the fallback plan. Lower is earlier, and 0 is the exact attempt. */
  sequence: number;
  result: TResult;
}

export interface AutoTeamBuildPreviewCandidate<TResult> {
  sequence: number;
  result: TResult | null;
}

/**
 * The next preview state, or `null` when the candidate does not earn the screen.
 *
 * Returning the state rather than a boolean keeps the caller from having to rebuild it, and keeps
 * "what is shown" and "why it was shown" in the same value.
 */
export function resolveNextPreviewState<TResult>(
  current: AutoTeamBuildPreviewState<TResult> | null,
  candidate: AutoTeamBuildPreviewCandidate<TResult>,
): AutoTeamBuildPreviewState<TResult> | null {
  // An attempt that found nothing is not a team. Clearing the preview on it would also be wrong:
  // the reader would watch a team they were shown disappear for a reason nothing explains.
  if (candidate.result === null) {
    return null;
  }

  if (!Number.isInteger(candidate.sequence) || candidate.sequence < 0) {
    return null;
  }

  if (!current) {
    return { sequence: candidate.sequence, result: candidate.result };
  }

  // Strictly earlier only. Equal sequence means the same planned attempt reported twice, and
  // replacing on equality would let a retry repaint the screen with no change of meaning.
  return candidate.sequence < current.sequence
    ? { sequence: candidate.sequence, result: candidate.result }
    : null;
}

/**
 * True once no attempt can improve on what is shown, so the caller can stop offering candidates.
 * Sequence 0 is the exact attempt - the first entry in every plan - and nothing precedes it.
 */
export function isPreviewFinal<TResult>(
  current: AutoTeamBuildPreviewState<TResult> | null,
): boolean {
  return current?.sequence === 0;
}

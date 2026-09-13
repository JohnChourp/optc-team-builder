import {
  type AutoBuildRejectedCandidateExplanation,
  type AutoBuildRejectedCandidateReasonCode,
} from '../models/auto-team-builder.models';

/**
 * A group's key. `'unknown'` is not a reason the engine emits - it is the bucket for a candidate
 * that arrived carrying no reason at all, which the i18n already names
 * (`rejectedReasons.unknown`: *"Rejected for an unrecognized recorded reason."*). Folding that
 * case into a real code instead would report a decision nobody made.
 */
export type RejectedCandidateGroupCode = AutoBuildRejectedCandidateReasonCode | 'unknown';

/** One decisive reason, and how many rejected candidates it decided against. */
export interface RejectedCandidateReasonGroup {
  code: RejectedCandidateGroupCode;
  count: number;
}

/**
 * The reason that decided, for grouping: the FIRST entry, never the last.
 *
 * `buildRejectedCandidateReasons()` pushes hard constraints first and the decisive rank preference
 * after them, so a candidate blocked by the cost cap AND ranked lower carries both - and only the
 * cost cap is why it could never have been picked. Grouping on the tail would file that candidate
 * under a preference it never got close enough to lose on.
 *
 * `rankingTieBreak` is that builder's documented empty case: it is pushed only when nothing else
 * was found, so it is already first whenever it is present.
 */
export function resolveRejectedCandidateGroupCode(
  candidate: AutoBuildRejectedCandidateExplanation,
): RejectedCandidateGroupCode {
  return candidate.reasons[0]?.code ?? 'unknown';
}

/**
 * The rejected pool folded into one line per decisive reason - `88 type filter - 39 crew conflict`
 * - so a thin result says why it was thin without the reader scanning candidate by candidate.
 *
 * Ordered by count descending, then by code so a tie never reorders between two renders of the
 * same result. Both halves matter: the first is the answer the reader wants, the second is what
 * keeps a re-render from shuffling chips under a pointer.
 */
export function groupRejectedCandidatesByDecisiveReason(
  candidates: readonly AutoBuildRejectedCandidateExplanation[],
): RejectedCandidateReasonGroup[] {
  const countsByCode = new Map<RejectedCandidateGroupCode, number>();

  for (const candidate of candidates) {
    const code = resolveRejectedCandidateGroupCode(candidate);

    countsByCode.set(code, (countsByCode.get(code) ?? 0) + 1);
  }

  return [...countsByCode.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

/**
 * The pool narrowed to one group, or the whole pool when nothing is selected.
 *
 * Generic over the carried `groupCode` rather than over the engine's explanation shape: the page
 * filters view models it has already labelled, and resolving the decisive reason a second time
 * there would be a second place for the FIRST-not-last rule above to be got wrong.
 *
 * A code that grouped nothing returns an empty list rather than the full pool: a chip the reader
 * can no longer see - because the result was rebuilt under it - must not silently widen back to
 * everything, which would read as the filter having been ignored.
 */
export function filterByRejectedGroupCode<T extends { readonly groupCode: RejectedCandidateGroupCode }>(
  entries: readonly T[],
  selectedCode: RejectedCandidateGroupCode | null,
): T[] {
  if (!selectedCode) {
    return [...entries];
  }

  return entries.filter((entry) => entry.groupCode === selectedCode);
}

/**
 * 869f127c1. The Final team report already says a rule was `Relaxed` and which values it gave up.
 * What it never said is what would un-relax it, so the reader leaves with the verdict and not the
 * move.
 *
 * Every remedy here is DERIVED from the relaxation record the engine already wrote, never
 * re-scored: nothing in this file runs a search, ranks a candidate, or predicts whether the
 * suggested change would in fact succeed. It says what the search gave up and the smallest change
 * that removes the conflict it gave up on - which is a fact about the request, not a promise about
 * the next build.
 *
 * A rule with nothing derivable returns `null` and prints no line. That is deliberate and tested:
 * a remedy invented to fill the row would be the one thing worse than no remedy.
 */

/** The remedy kinds, each carrying only values the relaxation record already holds. */
export type FinalReportRemedy =
  /**
   * More DISTINCT values were asked for than the team has seats. No team of that size covers them
   * all, whatever the pool holds, so the count is an honest minimum rather than a prediction.
   */
  | { kind: 'reduceSelectionBy'; count: number; values: string[] }
  /** The seats were enough, so the pool - not arithmetic - is what failed. Name what to drop. */
  | { kind: 'deselectValues'; values: string[] }
  /** The leader scope is bounded by the two leader seats, and one of them can be widened. */
  | { kind: 'allowAnyFriendCaptain' }
  /**
   * Carries the COUNT, not the labels. The relaxed detail already prints those labels verbatim and
   * they are whole sentences, so repeating them produced a remedy that restated the row above it
   * and ended in a double full stop. Captain Ability coverage is a property of the leader pair, so
   * the move is a leader - which is what the count is worded around.
   */
  | { kind: 'coverCaptainAbilitySlots'; missingCount: number }
  | { kind: 'meetActivationCriteria'; characterNames: string[] };

export interface FinalReportRemedyContext {
  /** The report row's own key, e.g. `types`, `captainAbility`. */
  ruleKey: string;
  /** What the search gave up, for the selected-filter families. */
  droppedValues?: readonly string[];
  /** Everything the reader asked that rule for, before the search relaxed any of it. */
  requestedValues?: readonly string[];
  /**
   * How many seats the team has - NOT how many the search was free to choose.
   *
   * A manually locked sub still carries whatever type, class or tag its character has, so it can
   * satisfy a selected value the search never picked it for. Counting only free seats would claim
   * a shortfall that locked seats already cover, and that claim would be wrong rather than merely
   * unhelpful. Team size is the one denominator that holds no matter what is locked or what the
   * pool contains.
   */
  teamSlotCount?: number;
  /** Coverage slots a captain-ability relaxation left uncovered. */
  missingCaptainAbilityLabels?: readonly string[];
  /** Characters whose activation criteria the search ignored. */
  criteriaCharacterNames?: readonly string[];
  /** True when the reader has NOT already allowed any Friend Captain. */
  canAllowAnyFriendCaptain?: boolean;
}

/** The report keys whose relaxation is "we dropped some of what you selected". */
const SELECTED_FILTER_RULE_KEYS = new Set(['types', 'classes', 'characterTags', 'characterNames']);

function nonEmpty(values: readonly string[] | undefined): string[] {
  return (values ?? []).filter((value) => value.trim().length > 0);
}

export function resolveFinalReportRemedy(
  context: FinalReportRemedyContext,
): FinalReportRemedy | null {
  if (SELECTED_FILTER_RULE_KEYS.has(context.ruleKey)) {
    const dropped = nonEmpty(context.droppedValues);

    if (!dropped.length) {
      return null;
    }

    const requestedCount = new Set(nonEmpty(context.requestedValues)).size;
    const teamSlotCount = context.teamSlotCount;

    // Arithmetic first, because it is the one case where the answer does not depend on which units
    // exist: a team of N seats cannot carry more than N distinct values, so `remove at least
    // requested - N` is true before a single candidate is read.
    if (
      typeof teamSlotCount === 'number' &&
      Number.isFinite(teamSlotCount) &&
      teamSlotCount > 0 &&
      requestedCount > teamSlotCount
    ) {
      return {
        kind: 'reduceSelectionBy',
        count: requestedCount - teamSlotCount,
        values: dropped,
      };
    }

    return { kind: 'deselectValues', values: dropped };
  }

  if (context.ruleKey === 'leaderSuperScope') {
    // Only worth saying while it is still available. Suggesting a toggle the reader already turned
    // on reads as the report not having looked.
    return context.canAllowAnyFriendCaptain ? { kind: 'allowAnyFriendCaptain' } : null;
  }

  if (context.ruleKey === 'captainAbility') {
    const missing = nonEmpty(context.missingCaptainAbilityLabels);

    // A captain-ability row can be relaxed with nothing named - the coverage was downgraded rather
    // than left short. There is no slot to point at, so it declines.
    return missing.length
      ? { kind: 'coverCaptainAbilitySlots', missingCount: missing.length }
      : null;
  }

  if (context.ruleKey === 'superSpecial' || context.ruleKey === 'superTandem') {
    const characterNames = nonEmpty(context.criteriaCharacterNames);

    return characterNames.length ? { kind: 'meetActivationCriteria', characterNames } : null;
  }

  return null;
}

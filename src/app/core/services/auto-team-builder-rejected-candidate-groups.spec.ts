import { describe, expect, it } from 'vitest';

import {
  type AutoBuildRejectedCandidateExplanation,
  type AutoBuildRejectedCandidateReasonCode,
} from '../models/auto-team-builder.models';
import {
  filterByRejectedGroupCode,
  groupRejectedCandidatesByDecisiveReason,
  resolveRejectedCandidateGroupCode,
} from './auto-team-builder-rejected-candidate-groups.utils';

/*
 * 869f127by. Per-candidate reasons already ship (869exmmgk); this is the aggregate that says why a
 * thin result was thin. The two properties worth holding are that the group key is the reason that
 * DECIDED - the first, not the last - and that the order is stable, because a chip that moves
 * between renders is a chip the reader clicks by accident.
 */

function candidate(
  characterId: number,
  ...codes: AutoBuildRejectedCandidateReasonCode[]
): AutoBuildRejectedCandidateExplanation {
  return {
    characterId,
    characterName: `Character ${characterId}`,
    reasons: codes.map((code) => ({ code })),
  };
}

describe('resolveRejectedCandidateGroupCode', () => {
  it('groups on the first reason, because hard constraints are pushed before rank preferences', () => {
    // Blocked by the cost cap AND ranked lower. Only the cap is why it could never be picked.
    expect(
      resolveRejectedCandidateGroupCode(candidate(1, 'costConstraint', 'lowerCoverageContribution')),
    ).toBe('costConstraint');
  });

  it('does not group on the tail', () => {
    const both = candidate(2, 'duplicateBaseConflict', 'lowerSelectedFilterScore');

    expect(resolveRejectedCandidateGroupCode(both)).not.toBe('lowerSelectedFilterScore');
  });

  it('keeps rankingTieBreak, which the builder pushes only when nothing else decided', () => {
    expect(resolveRejectedCandidateGroupCode(candidate(3, 'rankingTieBreak'))).toBe(
      'rankingTieBreak',
    );
  });

  it('buckets a candidate carrying no reason at all as unknown rather than inventing one', () => {
    expect(resolveRejectedCandidateGroupCode(candidate(4))).toBe('unknown');
  });
});

describe('groupRejectedCandidatesByDecisiveReason', () => {
  it('counts each decisive reason once per candidate', () => {
    const groups = groupRejectedCandidatesByDecisiveReason([
      candidate(1, 'costConstraint'),
      candidate(2, 'costConstraint', 'rankingTieBreak'),
      candidate(3, 'duplicateBaseConflict'),
    ]);

    expect(groups).toEqual([
      { code: 'costConstraint', count: 2 },
      { code: 'duplicateBaseConflict', count: 1 },
    ]);
  });

  it('orders by count descending', () => {
    const groups = groupRejectedCandidatesByDecisiveReason([
      candidate(1, 'rankingTieBreak'),
      candidate(2, 'costConstraint'),
      candidate(3, 'costConstraint'),
      candidate(4, 'costConstraint'),
      candidate(5, 'duplicateBaseConflict'),
      candidate(6, 'duplicateBaseConflict'),
    ]);

    expect(groups.map((group) => group.code)).toEqual([
      'costConstraint',
      'duplicateBaseConflict',
      'rankingTieBreak',
    ]);
  });

  it('breaks a count tie on the code, so two renders of one result agree', () => {
    const pool = [
      candidate(1, 'requiredConstraint'),
      candidate(2, 'alreadySelected'),
      candidate(3, 'leaderScopeConstraint'),
    ];

    const first = groupRejectedCandidatesByDecisiveReason(pool);
    const reversed = groupRejectedCandidatesByDecisiveReason([...pool].reverse());

    expect(first.map((group) => group.code)).toEqual([
      'alreadySelected',
      'leaderScopeConstraint',
      'requiredConstraint',
    ]);
    expect(reversed).toEqual(first);
  });

  it('sums to the size of the pool, so the total line can never disagree with its own groups', () => {
    const pool = [
      candidate(1, 'costConstraint'),
      candidate(2, 'lowerCoverageContribution'),
      candidate(3, 'manualSlotLocked'),
      candidate(4, 'costConstraint'),
      candidate(5),
    ];

    const total = groupRejectedCandidatesByDecisiveReason(pool).reduce(
      (sum, group) => sum + group.count,
      0,
    );

    expect(total).toBe(pool.length);
  });

  it('returns nothing for an empty pool', () => {
    expect(groupRejectedCandidatesByDecisiveReason([])).toEqual([]);
  });
});

describe('filterByRejectedGroupCode', () => {
  /** Shaped like the page's view model: already labelled with the reason that decided. */
  const labelled = [
    { characterId: 1, groupCode: 'costConstraint' as const },
    { characterId: 2, groupCode: 'duplicateBaseConflict' as const },
    { characterId: 3, groupCode: 'costConstraint' as const },
  ];

  it('returns the whole pool when nothing is selected', () => {
    expect(filterByRejectedGroupCode(labelled, null)).toEqual(labelled);
  });

  it('narrows to the selected group', () => {
    expect(
      filterByRejectedGroupCode(labelled, 'costConstraint').map((entry) => entry.characterId),
    ).toEqual([1, 3]);
  });

  it('returns empty - never the full pool - for a code that grouped nothing', () => {
    // A stale chip after a rebuild must not read as "the filter was ignored".
    expect(filterByRejectedGroupCode(labelled, 'requiredConstraint')).toEqual([]);
  });

  it('copies rather than aliasing, so a caller cannot mutate the result pool', () => {
    expect(filterByRejectedGroupCode(labelled, null)).not.toBe(labelled);
  });

  it('agrees with the grouping it filters: every group count is reproducible by filtering', () => {
    // The two functions are only useful together, and only honest when one cannot drift from the
    // other. Drive the real engine shape through both and assert they report the same partition.
    const pool = [
      candidate(1, 'costConstraint', 'lowerSelectedFilterScore'),
      candidate(2, 'duplicateBaseConflict'),
      candidate(3, 'costConstraint'),
      candidate(4),
    ];
    const labelledPool = pool.map((entry) => ({
      ...entry,
      groupCode: resolveRejectedCandidateGroupCode(entry),
    }));

    for (const group of groupRejectedCandidatesByDecisiveReason(pool)) {
      expect(filterByRejectedGroupCode(labelledPool, group.code)).toHaveLength(group.count);
    }
  });
});

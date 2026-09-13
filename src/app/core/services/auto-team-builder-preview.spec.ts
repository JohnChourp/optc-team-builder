import { describe, expect, it } from 'vitest';

import {
  isPreviewFinal,
  resolveNextPreviewState,
  type AutoTeamBuildPreviewState,
} from './auto-team-builder-preview.utils';

/*
 * 869f127cc. The property under test is determinism, not liveness: two readers with the same
 * filters and different core counts must watch the same sequence of provisional teams. That holds
 * exactly while planned order - never finishing order - decides, which is the same rule the pool's
 * final answer already uses (owner, 2026-09-11).
 */

function state(sequence: number, result = `team-${sequence}`): AutoTeamBuildPreviewState<string> {
  return { sequence, result };
}

describe('resolveNextPreviewState', () => {
  it('accepts the first team it is offered', () => {
    expect(resolveNextPreviewState<string>(null, { sequence: 4, result: 'team-4' })).toEqual(
      state(4),
    );
  });

  it('replaces a preview with an attempt EARLIER in the plan', () => {
    expect(resolveNextPreviewState(state(4), { sequence: 1, result: 'team-1' })).toEqual(state(1));
  });

  it('refuses an attempt later in the plan, however early it finished', () => {
    // The whole point: finishing order depends on core count, and the reader must not.
    expect(resolveNextPreviewState(state(1), { sequence: 7, result: 'team-7' })).toBeNull();
  });

  it('refuses the same planned attempt reported twice', () => {
    expect(resolveNextPreviewState(state(3), { sequence: 3, result: 'team-3-again' })).toBeNull();
  });

  it('refuses an attempt that found no team', () => {
    expect(resolveNextPreviewState(state(5), { sequence: 1, result: null })).toBeNull();
  });

  it('does not clear a shown team when a later attempt finds nothing', () => {
    // The reader would watch a team disappear for a reason nothing on screen explains.
    const current = state(5);

    expect(resolveNextPreviewState(current, { sequence: 0, result: null })).toBeNull();
    expect(current).toEqual(state(5));
  });

  it('refuses a malformed sequence rather than ordering against NaN', () => {
    expect(resolveNextPreviewState(state(5), { sequence: Number.NaN, result: 'x' })).toBeNull();
    expect(resolveNextPreviewState(state(5), { sequence: -1, result: 'x' })).toBeNull();
    expect(resolveNextPreviewState(state(5), { sequence: 1.5, result: 'x' })).toBeNull();
  });

  it('reaches the same preview whatever order the attempts finish in', () => {
    // Two readers, two core counts, one plan. Drive the same attempts in opposite finishing orders
    // and assert both end on the plan's earliest - this is the determinism claim, tested.
    const attempts = [
      { sequence: 6, result: 'team-6' },
      { sequence: 2, result: 'team-2' },
      { sequence: 9, result: 'team-9' },
      { sequence: 4, result: 'team-4' },
    ];

    const fold = (order: typeof attempts): AutoTeamBuildPreviewState<string> | null =>
      order.reduce<AutoTeamBuildPreviewState<string> | null>(
        (current, candidate) => resolveNextPreviewState(current, candidate) ?? current,
        null,
      );

    expect(fold(attempts)).toEqual(state(2));
    expect(fold([...attempts].reverse())).toEqual(state(2));
    expect(fold([attempts[2]!, attempts[0]!, attempts[3]!, attempts[1]!])).toEqual(state(2));
  });

  it('repaints at most once per strictly earlier attempt', () => {
    // Planned order is its own throttle; there is no timer to get wrong.
    let current: AutoTeamBuildPreviewState<string> | null = null;
    let repaints = 0;

    for (const sequence of [8, 9, 7, 9, 3, 5, 3, 1]) {
      const next: AutoTeamBuildPreviewState<string> | null = resolveNextPreviewState(current, {
        sequence,
        result: `team-${sequence}`,
      });

      if (next) {
        repaints += 1;
        current = next;
      }
    }

    expect(repaints).toBe(4);
    expect(current).toEqual(state(1));
  });
});

describe('isPreviewFinal', () => {
  it('is final on the exact attempt, which nothing precedes', () => {
    expect(isPreviewFinal(state(0))).toBe(true);
  });

  it('is not final on any fallback attempt', () => {
    expect(isPreviewFinal(state(1))).toBe(false);
  });

  it('is not final with nothing shown', () => {
    expect(isPreviewFinal(null)).toBe(false);
  });
});

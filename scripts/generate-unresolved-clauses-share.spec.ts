import { describe, expect, it } from 'vitest';

import {
  collectUnresolvedClauseStats,
  createUnresolvedClauseCatalog,
} from './lib/unresolved-clauses.mjs';

/*
 * 869f13er3. The DENOMINATORS, and the proportions built from them.
 *
 * The catalogue counted only what fell through, which makes the number unreadable
 * on its own: 587 unresolved clauses is a different fact depending on whether the
 * dataset holds 700 of them or 7,000. Measured on 2026-09-21 it is 587 of 1,159 -
 * **50.6%**, and 60.6% of trigger clauses alone. Nothing said so.
 *
 * Its own file rather than appended to `generate-unresolved-clauses.spec.ts`:
 * that file is about WHICH clauses are collected, and this is about what they are
 * divided by. The two go wrong in different ways.
 */

function detail(characterId: number, tier: Record<string, unknown>) {
  return {
    characterId,
    detail: { captainAbilityCoverage: { entries: [{ key: 'captain', tiers: [tier] }] } },
  };
}

const MAPPED = 'if they have a beneficial orb';

describe('unresolved clause denominators', () => {
  it('counts EVERY trigger clause, mapped or not, as the denominator', () => {
    const stats = collectUnresolvedClauseStats([
      detail(1, { triggerConditions: [{ rawClause: MAPPED }, { rawClause: 'HP is above 99%' }] }),
    ]);

    expect(stats.totalTriggerClauses).toBe(2);
    expect(stats.items).toHaveLength(1);
  });

  it('counts every team condition, structured or not', () => {
    const stats = collectUnresolvedClauseStats([
      detail(1, {
        teamConditions: [{ rawClause: 'a raw one' }, { types: ['DEX'], rawClause: 'structured' }],
      }),
    ]);

    expect(stats.totalTeamConditions).toBe(2);
    expect(stats.items).toHaveLength(1);
  });

  it('keeps the two denominators apart, because the two rates differ a lot', () => {
    const stats = collectUnresolvedClauseStats([
      detail(1, {
        triggerConditions: [{ rawClause: 'HP is above 99%' }],
        teamConditions: [{ types: ['DEX'], rawClause: 'structured' }],
      }),
    ]);

    expect(stats.totalTriggerClauses).toBe(1);
    expect(stats.totalTeamConditions).toBe(1);
  });
});

describe('unresolved clause shares', () => {
  const catalog = (rows: ReturnType<typeof detail>[]) =>
    createUnresolvedClauseCatalog(rows, 1, '2026-09-21T00:00:00.000Z');

  it('divides each kind by its OWN denominator, not by the combined total', () => {
    /* 1 of 2 triggers unresolved; 0 of 2 team conditions. */
    const result = catalog([
      detail(1, {
        triggerConditions: [{ rawClause: MAPPED }, { rawClause: 'HP is above 99%' }],
        teamConditions: [
          { types: ['DEX'], rawClause: 'a' },
          { classes: ['Fighter'], rawClause: 'b' },
        ],
      }),
    ]);

    expect(result.totals).toEqual({ triggerClauses: 2, teamConditions: 2, clauses: 4 });
    expect(result.unresolvedShare.triggerClause).toBe(0.5);
    expect(result.unresolvedShare.teamConditionRawOnly).toBe(0);
    expect(result.unresolvedShare.overall).toBe(0.25);
  });

  /*
   * The case the rule exists for: the same numerator, a bigger denominator, a
   * smaller share. A count alone cannot tell these two datasets apart.
   */
  it('reports a smaller share when the dataset grows and the fall-through does not', () => {
    const one = catalog([detail(1, { triggerConditions: [{ rawClause: 'HP is above 99%' }] })]);
    const two = catalog([
      detail(1, {
        triggerConditions: [{ rawClause: 'HP is above 99%' }, { rawClause: MAPPED }, { rawClause: MAPPED }],
      }),
    ]);

    expect(one.total).toBe(two.total);
    expect(one.unresolvedShare.overall).toBe(1);
    expect(two.unresolvedShare.overall).toBeCloseTo(0.3333, 4);
  });

  it('reports 0 rather than dividing by zero on an empty dataset', () => {
    const result = catalog([]);

    expect(result.totals).toEqual({ triggerClauses: 0, teamConditions: 0, clauses: 0 });
    expect(result.unresolvedShare).toEqual({
      triggerClause: 0,
      teamConditionRawOnly: 0,
      overall: 0,
    });
  });
});

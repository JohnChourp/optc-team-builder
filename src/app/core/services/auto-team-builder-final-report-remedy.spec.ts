import { describe, expect, it } from 'vitest';

import {
  resolveFinalReportRemedy,
  type FinalReportRemedyContext,
} from './auto-team-builder-final-report-remedy.utils';

/*
 * 869f127c1. The property that matters is not that a remedy is produced - it is that a remedy is
 * produced ONLY from what the relaxation record already holds, and that a rule with nothing
 * derivable declines instead of inventing one. Both halves are asserted per rule family.
 */

function context(overrides: Partial<FinalReportRemedyContext>): FinalReportRemedyContext {
  return { ruleKey: 'types', ...overrides };
}

describe('resolveFinalReportRemedy - selected filter families', () => {
  for (const ruleKey of ['types', 'classes', 'characterTags', 'characterNames']) {
    it(`names what to drop for ${ruleKey} when the seats were not the problem`, () => {
      expect(
        resolveFinalReportRemedy(
          context({
            ruleKey,
            requestedValues: ['A', 'B'],
            droppedValues: ['B'],
            teamSlotCount: 6,
          }),
        ),
      ).toEqual({ kind: 'deselectValues', values: ['B'] });
    });
  }

  it('counts the shortfall when more distinct values were asked for than the team has seats', () => {
    // 7 asked across 6 seats: no team of that size carries all seven, whatever the pool holds.
    expect(
      resolveFinalReportRemedy(
        context({
          requestedValues: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          droppedValues: ['g'],
          teamSlotCount: 6,
        }),
      ),
    ).toEqual({ kind: 'reduceSelectionBy', count: 1, values: ['g'] });
  });

  it('counts a shortfall of more than one', () => {
    expect(
      resolveFinalReportRemedy(
        context({
          requestedValues: ['a', 'b', 'c', 'd', 'e'],
          droppedValues: ['d', 'e'],
          teamSlotCount: 2,
        }),
      ),
    ).toEqual({ kind: 'reduceSelectionBy', count: 3, values: ['d', 'e'] });
  });

  it('does not claim a shortfall when the seats exactly cover the request', () => {
    expect(
      resolveFinalReportRemedy(
        context({ requestedValues: ['a', 'b'], droppedValues: ['b'], teamSlotCount: 2 }),
      ),
    ).toEqual({ kind: 'deselectValues', values: ['b'] });
  });

  it('counts distinct values, so a repeated selection cannot fake a shortfall', () => {
    expect(
      resolveFinalReportRemedy(
        context({ requestedValues: ['a', 'a', 'a'], droppedValues: ['a'], teamSlotCount: 2 }),
      ),
    ).toEqual({ kind: 'deselectValues', values: ['a'] });
  });

  it('never claims a shortfall against a team with no seats at all', () => {
    // A zero-slot result would otherwise report "remove at least 2", which is not a move.
    expect(
      resolveFinalReportRemedy(
        context({ requestedValues: ['a', 'b'], droppedValues: ['b'], teamSlotCount: 0 }),
      ),
    ).toEqual({ kind: 'deselectValues', values: ['b'] });
  });

  it('falls back to naming values when the team size is unknown', () => {
    expect(
      resolveFinalReportRemedy(context({ requestedValues: ['a', 'b'], droppedValues: ['b'] })),
    ).toEqual({ kind: 'deselectValues', values: ['b'] });
  });

  it('declines when nothing was dropped, rather than inventing a change', () => {
    expect(
      resolveFinalReportRemedy(context({ requestedValues: ['a'], droppedValues: [] })),
    ).toBeNull();
  });

  it('ignores blank values on both sides, so whitespace cannot inflate a count', () => {
    expect(
      resolveFinalReportRemedy(
        context({ requestedValues: ['a', '  ', 'b'], droppedValues: ['  '], teamSlotCount: 1 }),
      ),
    ).toBeNull();
  });
});

describe('resolveFinalReportRemedy - leader Super scope', () => {
  it('offers the Friend Captain seat while it is still bounded', () => {
    expect(
      resolveFinalReportRemedy({ ruleKey: 'leaderSuperScope', canAllowAnyFriendCaptain: true }),
    ).toEqual({ kind: 'allowAnyFriendCaptain' });
  });

  it('declines once the reader has already allowed any Friend Captain', () => {
    // Suggesting a toggle that is already on reads as the report not having looked.
    expect(
      resolveFinalReportRemedy({ ruleKey: 'leaderSuperScope', canAllowAnyFriendCaptain: false }),
    ).toBeNull();
  });
});

describe('resolveFinalReportRemedy - captain ability coverage', () => {
  it('counts the uncovered slots rather than repeating their labels', () => {
    // The relaxed detail already prints these labels verbatim, as whole sentences.
    expect(
      resolveFinalReportRemedy({
        ruleKey: 'captainAbility',
        missingCaptainAbilityLabels: ['Captain misses Sub 2.', 'Friend Captain misses Sub 4.'],
      }),
    ).toEqual({ kind: 'coverCaptainAbilitySlots', missingCount: 2 });
  });

  it('declines when coverage was downgraded with no slot left short', () => {
    expect(
      resolveFinalReportRemedy({ ruleKey: 'captainAbility', missingCaptainAbilityLabels: [] }),
    ).toBeNull();
  });
});

describe('resolveFinalReportRemedy - activation criteria', () => {
  for (const ruleKey of ['superSpecial', 'superTandem']) {
    it(`names the characters whose criteria ${ruleKey} ignored`, () => {
      expect(
        resolveFinalReportRemedy({ ruleKey, criteriaCharacterNames: ['Roronoa Zoro'] }),
      ).toEqual({ kind: 'meetActivationCriteria', characterNames: ['Roronoa Zoro'] });
    });

    it(`declines for ${ruleKey} when no character was recorded`, () => {
      expect(resolveFinalReportRemedy({ ruleKey })).toBeNull();
    });
  }
});

describe('resolveFinalReportRemedy - rules it does not speak for', () => {
  /* 869f333ey. The pinned Captain could not lead the crew; asking for it again restores nothing. */
  it('offers to pin the replacement Captain, or to change the crew for the original', () => {
    expect(
      resolveFinalReportRemedy({
        ruleKey: 'captain',
        replacedCaptain: { fromName: 'Loki', toName: 'Ripley' },
      }),
    ).toEqual({ kind: 'pinReplacementCaptain', fromName: 'Loki', toName: 'Ripley' });
  });

  it('declines for the Captain row when no replacement was recorded', () => {
    expect(resolveFinalReportRemedy({ ruleKey: 'captain' })).toBeNull();
  });

  it('declines for an unknown rule key instead of guessing', () => {
    expect(
      resolveFinalReportRemedy({ ruleKey: 'somethingAddedLater', droppedValues: ['x'] }),
    ).toBeNull();
  });
});

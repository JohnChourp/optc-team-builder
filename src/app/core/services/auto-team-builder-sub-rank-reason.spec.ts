import { describe, expect, it } from 'vitest';

import {
  type AutoBuildInput,
  type AutoBuildRejectedCandidateReason,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../models/optc.models';
import {
  type AutoBuildSubCandidateRank,
  type RankedAutoBuildSubCandidate,
  type SubAbilityDemandContext,
  compareAutoFillSubCandidateRanks,
  resolveDecisiveSubRankReason,
} from './auto-team-builder.utils';

/*
 * 869exmmgk. A rejected sub is told the one rank dimension that decided against it, and that is
 * only honest while the reason walks the comparator's own order, directions and activation
 * conditions. Nothing but this spec holds the two together: it drives every dimension in every
 * context they can be active in, and asserts they agree on both the winner and the reason.
 */

/** Each dimension, in comparator order, with the side that wins and the reason it earns. */
const DIMENSIONS: Array<{
  key: keyof AutoBuildSubCandidateRank;
  /** True when a lower score ranks first, as the strict battle-group spread does. */
  lowerWins?: boolean;
  reason: AutoBuildRejectedCandidateReason['code'];
  /** The contexts this dimension is compared in. */
  needsDemand?: boolean;
  needsStrict?: boolean;
  needsPartialCaptainCoverage?: boolean;
}> = [
  {
    key: 'strictBattleGroupPreferenceScore',
    reason: 'lowerRequirementDemand',
    needsDemand: true,
    needsStrict: true,
  },
  { key: 'demandScore', reason: 'lowerRequirementDemand', needsDemand: true },
  { key: 'leaderTagConditionScore', reason: 'lowerLeaderCoverageScore', needsDemand: true },
  {
    key: 'strictBattleGroupSpreadScore',
    lowerWins: true,
    reason: 'lowerRequirementDemand',
    needsDemand: true,
    needsStrict: true,
  },
  { key: 'coverageRoleScore', reason: 'lowerCoverageContribution', needsDemand: true },
  {
    key: 'leaderCriteriaCoveragePreferenceScore',
    reason: 'lowerLeaderCoverageScore',
    needsPartialCaptainCoverage: true,
  },
  { key: 'selectedFilterScore', reason: 'lowerSelectedFilterScore' },
];

describe('a rejected sub names the dimension the ranking actually used', () => {
  it('agrees with the comparator on every dimension, in every context it is compared in', () => {
    for (const demand of ['requirements', 'battles', 'tagConditions', 'none'] as const) {
      for (const strict of [false, true]) {
        for (const partialCaptainCoverage of [false, true]) {
          const context = createContext(demand, strict);
          const input = createInput(partialCaptainCoverage);

          for (const dimension of DIMENSIONS) {
            const active =
              (!dimension.needsDemand || demand !== 'none') &&
              (!dimension.needsStrict || strict) &&
              (!dimension.needsPartialCaptainCoverage || partialCaptainCoverage);
            const where = `${demand}/${strict ? 'strict' : 'flexible'}/${
              partialCaptainCoverage ? 'partial' : 'full'
            }/${dimension.key}`;
            // The picked sub is ahead on this dimension alone, and behind on the newest id, so a
            // dimension that is not compared leaves the tie-break to decide - against the pick.
            const picked = createRanked(2001, { [dimension.key]: dimension.lowerWins ? 0 : 1 });
            const rejected = createRanked(2002, { [dimension.key]: dimension.lowerWins ? 1 : 0 });
            const comparison = compareAutoFillSubCandidateRanks(picked, rejected, input, context);
            const reason = resolveDecisiveSubRankReason(picked, rejected, input, context);

            expect(comparison < 0, `${where}: comparator`).toBe(active);
            expect(reason, `${where}: reason`).toBe(active ? dimension.reason : null);

            // Turned around: the other one only ranks ahead where this dimension is not compared,
            // and then it is the newest id that put it there.
            const flipped = resolveDecisiveSubRankReason(rejected, picked, input, context);

            expect(
              compareAutoFillSubCandidateRanks(rejected, picked, input, context) < 0,
              `${where}: flipped comparator`,
            ).toBe(!active);
            expect(flipped, `${where}: flipped reason`).toBe(active ? null : 'rankingTieBreak');
          }

          // Equal on every dimension: the newest id decides, and only then is it a tie-break.
          const older = createRanked(2001, {});
          const newer = createRanked(2002, {});

          expect(resolveDecisiveSubRankReason(newer, older, input, context)).toBe(
            'rankingTieBreak',
          );
          expect(resolveDecisiveSubRankReason(older, newer, input, context)).toBeNull();
        }
      }
    }
  });

  it('lets an earlier dimension settle it, whatever the later ones say', () => {
    const context = createContext('requirements', false);
    const input = createInput(true);
    // Behind on coverage, leader coverage and filters, ahead on demand: demand comes first.
    const picked = createRanked(2001, { demandScore: 5 });
    const rejected = createRanked(2002, {
      coverageRoleScore: 9,
      leaderCriteriaCoveragePreferenceScore: 9,
      selectedFilterScore: 9,
    });

    expect(compareAutoFillSubCandidateRanks(picked, rejected, input, context)).toBeLessThan(0);
    expect(resolveDecisiveSubRankReason(picked, rejected, input, context)).toBe(
      'lowerRequirementDemand',
    );

    // Demand is compared before the leader tag conditions, even when they point the other way.
    const aheadOnTagConditions = createRanked(2002, { leaderTagConditionScore: 9 });

    expect(
      compareAutoFillSubCandidateRanks(picked, aheadOnTagConditions, input, context),
    ).toBeLessThan(0);
    expect(resolveDecisiveSubRankReason(picked, aheadOnTagConditions, input, context)).toBe(
      'lowerRequirementDemand',
    );
  });
});

function createContext(
  demand: 'requirements' | 'battles' | 'tagConditions' | 'none',
  strict: boolean,
): SubAbilityDemandContext {
  const requirement = {
    abilityKey: 'atkUp',
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
  };

  return {
    requirements: demand === 'requirements' ? [requirement] : [],
    battleRequirements:
      demand === 'battles'
        ? [
            {
              id: 'battle-1',
              title: 'Battle',
              enemyMechanics: [],
              requiredCharacterGroups: [{ id: 'group-1', abilities: [requirement] }],
            },
          ]
        : [],
    leaderTagConditionSets:
      demand === 'tagConditions'
        ? ([
            { operator: 'all', conditions: [] },
          ] as unknown as SubAbilityDemandContext['leaderTagConditionSets'])
        : [],
    leaderTagConditionPrefix: [],
    battleAssignmentMode: strict ? 'strict' : 'flexible',
  };
}

function createInput(allowPartialCaptainAbilityCoverage: boolean): AutoBuildInput {
  return { allowPartialCaptainAbilityCoverage } as AutoBuildInput;
}

function createRanked(
  characterId: number,
  rank: Partial<AutoBuildSubCandidateRank>,
): RankedAutoBuildSubCandidate {
  return {
    candidate: {
      character: { id: characterId } as CharacterDetailRecord,
    } as RankedAutoBuildSubCandidate['candidate'],
    rank: {
      strictBattleGroupPreferenceScore: 0,
      demandScore: 0,
      leaderTagConditionScore: 0,
      strictBattleGroupSpreadScore: 0,
      coverageRoleScore: 0,
      leaderCriteriaCoveragePreferenceScore: 0,
      selectedFilterScore: 0,
      ...rank,
    },
  };
}

import { describe, expect, it } from 'vitest';

import type { CharacterDetailRecord } from '../models/optc.models';

import {
  collectAutoBuildRequirementGroups,
  collectPinnedLeaderScopes,
  diagnoseAutoBuildInfeasibility,
} from './auto-team-builder-infeasibility.utils';

/**
 * Issue #523. Every reason is proved by removing the thing that made the pool feasible.
 *
 * The pool below is deliberately small and deliberately feasible: each test breaks exactly one
 * property and expects exactly one reason. The quiet cases matter as much - a diagnosis that fires
 * on a pool that was fine would send a reader to change a setting that was never the problem.
 */

function requirement(abilityKey: string, minTurns: number | null = null, requiredCharacterCount = 1) {
  return { abilityKey, minTurns, slotTokens: [], requiredCharacterCount };
}

function record(
  id: number,
  type: string,
  classes: string[],
  abilities: Array<{ key: string; minTurns: number | null }>,
  captainScope?: { types: string[]; classes: string[]; universal?: boolean },
): CharacterDetailRecord {
  return {
    id,
    name: `Character ${id}`,
    type,
    classes,
    detail: {
      builderAbilities: abilities.map((ability) => ({
        key: ability.key,
        label: ability.key,
        minTurns: ability.minTurns,
        isCompleteRemoval: false,
        slotTokens: [],
        source: 'specialText',
      })),
      characterTags: [],
      ...(captainScope
        ? {
            captainAbilityCoverage: {
              entries: [
                {
                  key: 'captain',
                  label: 'Captain Ability',
                  tiers: [
                    {
                      tier: 1,
                      kind: 'baseline',
                      scope: 'subset',
                      characterConditions: {
                        universal: captainScope.universal ?? false,
                        fallbackOther: false,
                        selfOnly: false,
                        types: captainScope.types,
                        classes: captainScope.classes,
                        characterTags: [],
                      },
                      teamConditions: [],
                      fieldConditions: [],
                      triggerConditions: [],
                      clauses: [],
                    },
                  ],
                },
              ],
            },
          }
        : {}),
    },
  } as unknown as CharacterDetailRecord;
}

const CURES = record(1, 'STR', ['Striker'], [
  { key: 'remove_atk_down', minTurns: 3 },
  { key: 'remove_enemy_barrier', minTurns: 2 },
]);
const BINDS = record(2, 'DEX', ['Striker'], [{ key: 'remove_special_bind', minTurns: 5 }]);
const FILLER = record(3, 'PSY', ['Striker'], [{ key: 'boost_atk', minTurns: null }]);
const LOKI = record(
  9,
  'QCK',
  ['Driven'],
  [{ key: 'boost_atk', minTurns: null }],
  { types: ['QCK'], classes: ['Driven'] },
);
const DRIVEN_CURES = record(4, 'STR', ['Striker', 'Driven'], [
  { key: 'remove_atk_down', minTurns: 3 },
  { key: 'remove_enemy_barrier', minTurns: 2 },
]);
/* Battle 2's only satisfier, inside the leader scope, so the leader tests isolate Battle 1. */
const DRIVEN_BINDS = record(8, 'DEX', ['Striker', 'Driven'], [
  { key: 'remove_special_bind', minTurns: 5 },
]);

const BATTLES = [
  {
    id: 'b1',
    title: 'Battle 1',
    enemyMechanics: [],
    requiredCharacterGroups: [
      {
        id: 'g1',
        abilities: [requirement('remove_atk_down', 2), requirement('remove_enemy_barrier', 1)],
      },
    ],
  },
  {
    id: 'b2',
    title: 'Battle 2',
    enemyMechanics: [],
    requiredCharacterGroups: [{ id: 'g2', abilities: [requirement('remove_special_bind', 5)] }],
  },
] as never;

function diagnose(pool: CharacterDetailRecord[], leaderIds: number[] = []) {
  return diagnoseAutoBuildInfeasibility({
    poolRecords: pool,
    battleRequirements: BATTLES,
    leaderScopes: collectPinnedLeaderScopes({
      records: pool,
      manualLeaderCharacterIds: leaderIds,
      requireFullCoverage: leaderIds.length > 0,
    }),
  });
}

describe('collectAutoBuildRequirementGroups', () => {
  it('keeps a battle group together and names its battle', () => {
    const groups = collectAutoBuildRequirementGroups({ battleRequirements: BATTLES });

    expect(groups).toHaveLength(2);
    expect(groups[0].abilities).toHaveLength(2);
    expect(groups[0].battleTitle).toBe('Battle 1');
    expect(groups[0].battleIndex).toBe(0);
  });

  it('treats a standalone required ability as a group of one', () => {
    const groups = collectAutoBuildRequirementGroups({
      requiredAbilities: [requirement('remove_paralysis')],
    });

    expect(groups).toEqual([
      {
        id: 'ability:remove_paralysis',
        abilities: [requirement('remove_paralysis')],
        battleTitle: null,
        battleIndex: null,
      },
    ]);
  });
});

describe('diagnoseAutoBuildInfeasibility', () => {
  it('says nothing about a pool that satisfies every requirement', () => {
    expect(diagnose([CURES, BINDS, FILLER]).reasons).toEqual([]);
  });

  it('names the requirement nothing in the pool can do', () => {
    const { reasons } = diagnose([CURES, FILLER]);

    expect(reasons).toHaveLength(1);
    expect(reasons[0].kind).toBe('noCandidateForRequirement');
    expect(reasons[0].subject.battleTitle).toBe('Battle 2');
    expect(reasons[0].poolMatchCount).toBe(0);
  });

  it('will not accept two characters that cover a group between them', () => {
    const halfA = record(5, 'STR', ['Striker'], [{ key: 'remove_atk_down', minTurns: 3 }]);
    const halfB = record(6, 'STR', ['Striker'], [{ key: 'remove_enemy_barrier', minTurns: 2 }]);
    const { reasons } = diagnose([halfA, halfB, BINDS]);

    expect(reasons.map((reason) => reason.subject.battleTitle)).toEqual(['Battle 1']);
    expect(reasons[0].kind).toBe('noCandidateForRequirement');
  });

  it('counts an ability whose turns fall short as not having it', () => {
    const tooShort = record(7, 'STR', ['Striker'], [
      { key: 'remove_atk_down', minTurns: 1 },
      { key: 'remove_enemy_barrier', minTurns: 2 },
    ]);
    const { reasons } = diagnose([tooShort, BINDS]);

    expect(reasons).toHaveLength(1);
    expect(reasons[0].subject.battleTitle).toBe('Battle 1');
  });

  it('reports the pinned leader when every satisfier is outside its boost scope', () => {
    const { reasons } = diagnose([CURES, DRIVEN_BINDS, LOKI], [9]);
    const outside = reasons.filter((reason) => reason.kind === 'requirementOutsideLeaderScope');

    expect(outside).toHaveLength(1);
    expect(outside[0].subject.battleTitle).toBe('Battle 1');
    expect(outside[0].poolMatchCount).toBe(1);
    expect(outside[0].kind === 'requirementOutsideLeaderScope' && outside[0].leader.characterId).toBe(9);
  });

  it('stays quiet when one satisfier is inside the leader scope', () => {
    expect(diagnose([CURES, DRIVEN_CURES, DRIVEN_BINDS, LOKI], [9]).reasons).toEqual([]);
  });

  it('reports every requirement the leader cannot cover, not only the first', () => {
    const outside = diagnose([CURES, BINDS, LOKI], [9]).reasons;

    expect(outside.map((reason) => reason.subject.battleTitle)).toEqual(['Battle 1', 'Battle 2']);
    expect(outside.every((reason) => reason.kind === 'requirementOutsideLeaderScope')).toBe(true);
  });

  it('stays quiet about a leader the reader did not pin', () => {
    expect(diagnose([CURES, BINDS, LOKI]).reasons).toEqual([]);
  });

  it('stays quiet about a leader that boosts everyone', () => {
    const universal = record(
      10,
      'QCK',
      ['Driven'],
      [{ key: 'boost_atk', minTurns: null }],
      { types: [], classes: [], universal: true },
    );

    expect(diagnose([CURES, BINDS, universal], [10]).reasons).toEqual([]);
  });

  it('reports a requirement with fewer satisfiers than characters asked for', () => {
    const { reasons } = diagnoseAutoBuildInfeasibility({
      poolRecords: [BINDS, FILLER],
      requiredAbilities: [requirement('remove_special_bind', 5, 2)],
    });

    expect(reasons).toHaveLength(1);
    expect(reasons[0].kind).toBe('notEnoughCandidatesForRequirement');
    expect(reasons[0].poolMatchCount).toBe(1);
    expect(
      reasons[0].kind === 'notEnoughCandidatesForRequirement' && reasons[0].requiredCharacterCount,
    ).toBe(2);
  });

  it('puts a requirement nothing satisfies ahead of one that is merely short', () => {
    const { reasons } = diagnoseAutoBuildInfeasibility({
      poolRecords: [BINDS],
      requiredAbilities: [requirement('remove_special_bind', 5, 2), requirement('remove_paralysis')],
    });

    expect(reasons.map((reason) => reason.kind)).toEqual([
      'noCandidateForRequirement',
      'notEnoughCandidatesForRequirement',
    ]);
  });

  it('reports the pool it was given, so a message can quote it', () => {
    expect(diagnose([CURES, BINDS, FILLER]).poolSize).toBe(3);
  });

  it('has nothing to say when no requirement was asked for', () => {
    expect(diagnoseAutoBuildInfeasibility({ poolRecords: [CURES] })).toEqual({
      reasons: [],
      poolSize: 1,
    });
  });
});

describe('collectPinnedLeaderScopes', () => {
  it('ignores a leader with no captain coverage data', () => {
    expect(
      collectPinnedLeaderScopes({
        records: [CURES],
        manualLeaderCharacterIds: [1],
        requireFullCoverage: true,
      }),
    ).toEqual([]);
  });

  it('ignores every leader when full coverage was not asked for', () => {
    expect(
      collectPinnedLeaderScopes({
        records: [LOKI],
        manualLeaderCharacterIds: [9],
        requireFullCoverage: false,
      }),
    ).toEqual([]);
  });

  it('carries the leader name so the message can say who', () => {
    const [scope] = collectPinnedLeaderScopes({
      records: [LOKI],
      manualLeaderCharacterIds: [9],
      requireFullCoverage: true,
    });

    expect(scope.name).toBe('Character 9');
    expect(scope.tiers[0].types).toEqual(['QCK']);
  });
});

/**
 * The copy contract. The message is built in the page, which has no TestBed here, so the part that
 * can silently break - a placeholder the copy asks for and the resolver never supplies, or the
 * reverse - is checked against the shipped translation files directly. A missing `{{leader}}` reads
 * as the literal braces on screen and no test above would notice.
 */
describe('failure copy', () => {
  const EXPECTED: Record<string, string[]> = {
    battle: ['battle'],
    noCandidate: ['requirement', 'battle', 'poolSize'],
    notEnough: ['requiredCount', 'requirement', 'battle', 'matchCount'],
    outsideLeaderScope: ['matchCount', 'requirement', 'battle', 'leader'],
    separator: [],
  };

  for (const language of ['en', 'el']) {
    it(`supplies every placeholder the ${language} copy asks for, and no other`, async () => {
      const { readFile } = await import('node:fs/promises');
      const copy = JSON.parse(
        await readFile(`public/i18n/auto-team-builder/${language}.json`, 'utf8'),
      ).errors.impossible as Record<string, string>;

      expect(Object.keys(copy).sort()).toEqual(Object.keys(EXPECTED).sort());

      for (const [key, text] of Object.entries(copy)) {
        const used = [...text.matchAll(/\{\{(\w+)\}\}/gu)].map((match) => match[1]);

        expect([...new Set(used)].sort(), `${language}.${key}`).toEqual(
          [...new Set(EXPECTED[key])].sort(),
        );
      }
    });
  }
});

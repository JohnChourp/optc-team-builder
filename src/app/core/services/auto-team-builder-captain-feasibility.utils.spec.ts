import { describe, expect, it, vi } from 'vitest';

import type { CharacterDetailRecord } from '../models/optc.models';

import {
  createPinnedCaptainProver,
  resolvePinnedCaptainImpossibility,
} from './auto-team-builder-captain-feasibility.utils';

/**
 * 869f333ey (D2). The proof decides whether the builder may look for another Captain, so a false
 * "impossible" would replace a Captain that could have led the team. Every reason is therefore
 * proved against a pool that passes, by breaking exactly one property of it - and the pool that
 * passes is itself a test, because an empty list is the answer for every Captain that can do the job.
 */

function requirement(abilityKey: string, minTurns: number | null = null, requiredCharacterCount = 1) {
  return { abilityKey, minTurns, slotTokens: [], requiredCharacterCount };
}

function record(
  id: number,
  type: string,
  abilities: Array<{ key: string; minTurns: number | null }> = [],
): CharacterDetailRecord {
  return {
    id,
    name: `Character ${id}`,
    type,
    classes: ['Striker'],
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
    },
  } as unknown as CharacterDetailRecord;
}

const CAPTAIN = 1;

/** A Captain (1), and five covered characters carrying DEX and STR and the battle pair. */
function feasiblePool(): CharacterDetailRecord[] {
  return [
    record(CAPTAIN, 'DEX'),
    record(2, 'DEX', [
      { key: 'remove_atk_down', minTurns: 2 },
      { key: 'remove_enemy_barrier', minTurns: 1 },
    ]),
    record(3, 'STR'),
    record(4, 'STR'),
    record(5, 'DEX'),
    record(6, 'DEX'),
  ];
}

const BATTLE_PAIR = [
  {
    id: 'b1',
    title: 'The one the reader named',
    enemyMechanics: [],
    requiredCharacterGroups: [
      { id: 'g1', abilities: [requirement('remove_atk_down', 2), requirement('remove_enemy_barrier', 1)] },
    ],
  },
];

function prove(coveredRecords: CharacterDetailRecord[], overrides = {}) {
  return resolvePinnedCaptainImpossibility({
    coveredRecords,
    pinnedLeaderIds: [CAPTAIN],
    types: ['DEX', 'STR'],
    requireEveryType: true,
    battleRequirements: BATTLE_PAIR,
    ...overrides,
  });
}

describe('resolvePinnedCaptainImpossibility', () => {
  it('finds nothing wrong with a Captain that can lead the crew', () => {
    expect(prove(feasiblePool())).toEqual([]);
  });

  /* #523's first cause: no covered character carries a type the team must contain. */
  it('names every required type nobody inside the scope carries', () => {
    const pool = feasiblePool().filter((character) => character.type !== 'STR');

    expect(prove([...pool, record(7, 'QCK')])).toEqual([
      { kind: 'selectedTypeOutsideCaptainScope', types: ['STR'] },
    ]);
  });

  it('does not ask for every type when the reader did not', () => {
    const pool = [...feasiblePool().filter((character) => character.type !== 'STR'), record(7, 'QCK')];

    expect(prove(pool, { requireEveryType: false })).toEqual([]);
  });

  it('counts both halves of a dual type', () => {
    const pool = [...feasiblePool().filter((character) => character.type !== 'STR'), record(7, 'STR,QCK')];

    expect(prove(pool)).toEqual([]);
  });

  /* #523's second cause: the battle group's only carriers are outside the scope. */
  it('names a requirement group nobody inside the scope satisfies', () => {
    const pool = feasiblePool().map((character) => (character.id === 2 ? record(2, 'DEX') : character));
    const reasons = prove(pool);

    expect(reasons).toEqual([
      expect.objectContaining({ kind: 'requirementOutsideCaptainScope', coveredMatchCount: 0, requiredCharacterCount: 1 }),
    ]);
  });

  it('needs ONE character carrying the whole group, not the pieces spread across two', () => {
    const pool = feasiblePool().map((character) => {
      if (character.id === 2) return record(2, 'DEX', [{ key: 'remove_atk_down', minTurns: 2 }]);
      if (character.id === 5) return record(5, 'DEX', [{ key: 'remove_enemy_barrier', minTurns: 1 }]);
      return character;
    });

    expect(prove(pool).map((reason) => reason.kind)).toEqual(['requirementOutsideCaptainScope']);
  });

  it('reports a group with fewer carriers than it asks for', () => {
    const reasons = prove(feasiblePool(), {
      battleRequirements: [],
      requiredAbilities: [requirement('remove_atk_down', 2, 2)],
    });

    expect(reasons).toEqual([
      expect.objectContaining({ kind: 'requirementOutsideCaptainScope', coveredMatchCount: 1, requiredCharacterCount: 2 }),
    ]);
  });

  /* The pinned leaders sit in the covered pool (they are retained) but cannot also fill a sub seat. */
  it('needs four covered characters besides the pinned leaders', () => {
    const pool = feasiblePool().filter((character) => character.id !== 6);

    expect(prove(pool, { pinnedLeaderIds: [CAPTAIN, 5] })).toEqual([
      { kind: 'tooFewCoveredCandidates', coveredCandidateCount: 3 },
    ]);
    expect(prove(pool)).toEqual([]);
  });

  it('reports every cause at once, the most useful first', () => {
    expect(prove([record(CAPTAIN, 'QCK')]).map((reason) => reason.kind)).toEqual([
      'selectedTypeOutsideCaptainScope',
      'requirementOutsideCaptainScope',
      'tooFewCoveredCandidates',
    ]);
  });
});

describe('createPinnedCaptainProver', () => {
  const everyone = [...feasiblePool(), record(10, 'QCK'), record(11, 'INT'), record(12, 'PSY')];
  const proverInput = {
    records: everyone,
    types: ['DEX', 'STR'] as const,
    requireEveryType: true,
    battleRequirements: BATTLE_PAIR,
  };

  /* The prover is an optimisation of the proof; it must never disagree with it. */
  it('agrees with the full proof for every way of covering the pool', () => {
    const prover = createPinnedCaptainProver({ ...proverInput, types: [...proverInput.types] });
    const ids = everyone.map((character) => character.id);

    for (let mask = 0; mask < 1 << ids.length; mask += 1) {
      const covered = new Set(ids.filter((_, index) => mask & (1 << index)));
      covered.add(CAPTAIN);
      const covers = (character: CharacterDetailRecord) => covered.has(character.id);
      const expected =
        resolvePinnedCaptainImpossibility({
          coveredRecords: everyone.filter(covers),
          pinnedLeaderIds: [CAPTAIN],
          types: [...proverInput.types],
          requireEveryType: true,
          battleRequirements: BATTLE_PAIR,
        }).length === 0;

      expect(prover(covers, [CAPTAIN]), `mask ${mask}`).toBe(expected);
    }
  });

  /*
   * The point of it: in #523 only two characters carried the battle pair, so a Captain covering
   * neither is rejected without scoping the whole pool.
   */
  it('rejects a Captain that covers no carrier of a group without asking about anyone else', () => {
    const prover = createPinnedCaptainProver({ ...proverInput, types: [...proverInput.types] });
    const covers = vi.fn((character: CharacterDetailRecord) => character.id !== 2);

    expect(prover(covers, [CAPTAIN])).toBe(false);
    expect(covers.mock.calls.map(([character]) => character.id)).toEqual([2]);
  });
});

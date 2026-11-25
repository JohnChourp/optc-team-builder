import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { SqlJsStatic } from 'sql.js';
import { describe, expect, it } from 'vitest';

import { type CharacterEvolutionLinks } from '../../core/models/optc.models';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import {
  collectEarlierFormIds,
  findOwnedEvolutionPath,
  planTeamEvolutionMaterials,
  type EvolutionLinksById,
} from './team-evolution-materials.utils';

/*
 * 869f63gzu. The owner chose "from the box": a team unit the box holds only in an earlier form
 * needs every evolution from that form up to the team's form, summed.
 */

const unit = (characterId: number) => ({ characterId, token: null });
const token = (value: string) => ({ characterId: null, token: value });

/*
 * A chain 1 → 2 → 3, and a second branch 1 → 4. 5 evolves into 3 too (a second earlier form).
 * Materials: 80/81/97 are evolvers, "ink" and "3-skull" are tokens.
 */
const LINKS: EvolutionLinksById = new Map([
  [
    1,
    {
      evolvesTo: [
        { toId: 2, materials: [unit(80), unit(80), unit(81)] },
        { toId: 4, materials: [unit(97)] },
      ],
      evolvesFrom: [],
    },
  ],
  [
    2,
    {
      evolvesTo: [{ toId: 3, materials: [unit(80), token('ink'), token('3-skull')] }],
      evolvesFrom: [1],
    },
  ],
  [3, { evolvesTo: [], evolvesFrom: [2, 5] }],
  [4, { evolvesTo: [], evolvesFrom: [1] }],
  [5, { evolvesTo: [{ toId: 3, materials: [unit(81)] }], evolvesFrom: [] }],
]);

describe('findOwnedEvolutionPath', () => {
  it('walks back to the owned form, owned form first', () => {
    expect(findOwnedEvolutionPath(3, new Set([1]), LINKS)).toEqual([1, 2, 3]);
  });

  it('takes the nearest owned form', () => {
    expect(findOwnedEvolutionPath(3, new Set([1, 2]), LINKS)).toEqual([2, 3]);
    expect(findOwnedEvolutionPath(3, new Set([1, 5]), LINKS)).toEqual([5, 3]);
  });

  it('finds nothing when no earlier form is owned', () => {
    expect(findOwnedEvolutionPath(3, new Set([4]), LINKS)).toBeNull();
    expect(findOwnedEvolutionPath(99, new Set([1]), LINKS)).toBeNull();
  });

  it('never follows a step the earlier form does not list', () => {
    const broken: EvolutionLinksById = new Map([
      [1, { evolvesTo: [], evolvesFrom: [] }],
      [2, { evolvesTo: [], evolvesFrom: [1] }],
    ]);

    expect(findOwnedEvolutionPath(2, new Set([1]), broken)).toBeNull();
  });

  it('stops on a cycle in bad data', () => {
    const cycle: EvolutionLinksById = new Map([
      [1, { evolvesTo: [{ toId: 2, materials: [] }], evolvesFrom: [2] }],
      [2, { evolvesTo: [{ toId: 1, materials: [] }], evolvesFrom: [1] }],
    ]);

    expect(findOwnedEvolutionPath(2, new Set([9]), cycle)).toBeNull();
  });
});

describe('planTeamEvolutionMaterials', () => {
  it('sums every step from the owned form, most needed first', () => {
    const plan = planTeamEvolutionMaterials([3], new Set([1]), LINKS);

    expect(plan.units).toEqual([{ characterId: 3, state: 'evolve', fromId: 1, path: [1, 2, 3] }]);
    expect(plan.materials).toEqual([
      { key: 'c:80', characterId: 80, token: null, count: 3 },
      { key: 'c:81', characterId: 81, token: null, count: 1 },
      { key: 't:ink', characterId: null, token: 'ink', count: 1 },
      { key: 't:3-skull', characterId: null, token: '3-skull', count: 1 },
    ]);
  });

  it('adds nothing for a unit in the box or with no owned earlier form', () => {
    const plan = planTeamEvolutionMaterials([1, 4, 99], new Set([1]), LINKS);

    expect(plan.units).toEqual([
      { characterId: 1, state: 'owned' },
      { characterId: 4, state: 'evolve', fromId: 1, path: [1, 4] },
      { characterId: 99, state: 'notInBox' },
    ]);
    expect(plan.materials).toEqual([{ key: 'c:97', characterId: 97, token: null, count: 1 }]);
  });

  it('counts a unit two teams share once', () => {
    const plan = planTeamEvolutionMaterials([4, 4], new Set([1]), LINKS);

    expect(plan.units).toHaveLength(1);
    expect(plan.materials[0]?.count).toBe(1);
  });
});

describe('collectEarlierFormIds', () => {
  it('lists the earlier forms of what is loaded', () => {
    expect(collectEarlierFormIds([3, 4], LINKS).sort()).toEqual([1, 2, 5]);
    expect(collectEarlierFormIds([99], LINKS)).toEqual([]);
  });
});

describe('over the shipped seed, through the repository', () => {
  it('reads evolutions and drops for several characters, and sums a real chain', async () => {
    const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
    const schema = seed.slice(0, seed.indexOf('INSERT INTO'));
    const inserts = [
      ...seed.matchAll(
        /INSERT INTO character_(?:evolutions|drops) \([^)]*\)\s*VALUES \(\s*\d+,[\s\S]*?\);/gu,
      ),
    ].map((match) => match[0]);
    const initSqlJs = (await import('sql.js')).default;
    const SQL: SqlJsStatic = await initSqlJs();
    const database = new SQL.Database();

    try {
      database.run(`${schema}\n${inserts.join('\n')}`);

      const repository = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;

      Object.assign(repository, { databasePromise: Promise.resolve(database) });

      // Every unit with an earlier form two steps back, through the repository's own query.
      const evolved = database
        .exec(`SELECT character_id FROM character_evolutions WHERE evolves_from_json <> '[]'`)[0]!
        .values.map(([id]) => Number(id));
      const links = new Map<number, CharacterEvolutionLinks>();
      let pending = evolved;

      for (let step = 0; step < 6 && pending.length; step += 1) {
        for (const entry of await repository.getCharacterEvolutionsByIds(pending)) {
          links.set(entry.characterId, entry);
        }

        pending = collectEarlierFormIds(pending, links).filter((id) => !links.has(id));
      }

      const twoSteps = evolved.find((id) =>
        links
          .get(id)!
          .evolvesFrom.some((earlier) => (links.get(earlier)?.evolvesFrom.length ?? 0) > 0),
      )!;
      const middle = links
        .get(twoSteps)!
        .evolvesFrom.find((earlier) => (links.get(earlier)?.evolvesFrom.length ?? 0) > 0)!;
      const base = links.get(middle)!.evolvesFrom[0]!;
      const plan = planTeamEvolutionMaterials([twoSteps], new Set([base]), links);
      const expected =
        links.get(base)!.evolvesTo.find((branch) => branch.toId === middle)!.materials.length +
        links.get(middle)!.evolvesTo.find((branch) => branch.toId === twoSteps)!.materials.length;

      expect(plan.units[0]).toMatchObject({ state: 'evolve', fromId: base });
      expect(plan.materials.reduce((sum, material) => sum + material.count, 0)).toBe(expected);

      // Evolvers have drop sources: the materials of that chain that are characters read some.
      const evolverIds = plan.materials.flatMap((material) =>
        material.characterId !== null ? [material.characterId] : [],
      );
      const drops = await repository.getCharacterDropSourcesByIds(evolverIds);

      expect(drops.length).toBeGreaterThan(0);
      expect(drops.every((entry) => entry.dropSources.length > 0)).toBe(true);
      expect(await repository.getCharacterEvolutionsByIds([])).toEqual([]);
      expect(await repository.getCharacterDropSourcesByIds([])).toEqual([]);
    } finally {
      database.close();
    }
  });
});

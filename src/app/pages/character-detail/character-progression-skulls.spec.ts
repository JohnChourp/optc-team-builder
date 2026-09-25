import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { SqlJsStatic } from 'sql.js';
import { describe, expect, it } from 'vitest';

import { type CharacterProgression } from '../../core/models/optc.models';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import {
  buildEvolutionCard,
  collectProgressionCharacterIds,
  resolveSkullCharacterId,
  type ProgressionDisplayList,
} from './character-progression.presenter';

/*
 * 869f63gm1. Upstream names 189 evolvers after a unit - `"4000-skull"`, that unit's own skull - and
 * uses them 863 times, always for the unit the evolution produces. They were stored as the unit
 * itself, so the Character screen's evolution card said one unit evolves with five copies of the
 * unit it becomes. It now says "Skull of <name> ×5", in English and Greek.
 */

function progression(overrides: Partial<CharacterProgression> = {}): CharacterProgression {
  return {
    characterId: 2099,
    maxSockets: null,
    specialCooldownMax: null,
    specialCooldownMin: null,
    evolvesTo: [],
    evolvesFrom: [],
    dropSources: [],
    ...overrides,
  };
}

const NAMES = new Map([
  [267, 'Rainbow Striped Dragon'],
  [1446, 'Usopp - Platanus Shuriken'],
  [4000, 'Gild Tesoro - Remains of Love and Regret'],
]);
const resolveName = (characterId: number): string | null => NAMES.get(characterId) ?? null;

describe('resolveSkullCharacterId', () => {
  it('reads the unit a skull belongs to, and nothing from another token', () => {
    expect(resolveSkullCharacterId('4000-skull')).toBe(4000);
    expect(resolveSkullCharacterId('skullQCK')).toBeNull();
    expect(resolveSkullCharacterId('ink')).toBeNull();
    expect(resolveSkullCharacterId('4000-skull-x')).toBeNull();
    expect(resolveSkullCharacterId(null)).toBeNull();
  });
});

describe("the evolution card names a unit's skull", () => {
  it('as "Skull of <name>", beside a material that is a unit', () => {
    const [list] = buildEvolutionCard(
      progression({
        evolvesTo: [
          {
            toId: 1446,
            materials: [
              { characterId: null, token: '1446-skull' },
              { characterId: 267, token: null },
            ],
          },
        ],
      }),
      resolveName,
    )!.lists;

    expect(list).toEqual({
      labelKey: 'progression.evolvesInto',
      items: ['Usopp - Platanus Shuriken', '1446-skull', 'Rainbow Striped Dragon'],
      texts: [
        null,
        { key: 'progression.skullOf', params: { name: 'Usopp - Platanus Shuriken' } },
        null,
      ],
    } satisfies ProgressionDisplayList);
  });

  it('with its count, for the evolution that asks for five', () => {
    const [list] = buildEvolutionCard(
      progression({
        evolvesTo: [
          {
            toId: 4000,
            materials: Array.from({ length: 5 }, () => ({
              characterId: null,
              token: '4000-skull',
            })),
          },
        ],
      }),
      resolveName,
    )!.lists;

    expect(list?.items).toEqual(['Gild Tesoro - Remains of Love and Regret', '4000-skull ×5']);
    expect(list?.texts?.[1]).toEqual({
      key: 'progression.skullOfCount',
      params: { name: 'Gild Tesoro - Remains of Love and Regret', count: 5 },
    });
  });

  it('leaves the type skulls and ink as they were, with no phrase to add', () => {
    const [list] = buildEvolutionCard(
      progression({
        evolvesTo: [
          {
            toId: 4000,
            materials: [
              { characterId: null, token: 'skullQCK' },
              { characterId: null, token: 'ink' },
            ],
          },
        ],
      }),
      resolveName,
    )!.lists;

    expect(list).toEqual({
      labelKey: 'progression.evolvesInto',
      items: ['Gild Tesoro - Remains of Love and Regret', 'skullQCK', 'ink'],
    });
  });

  it("asks for the skull's unit by name in the one query the page makes", () => {
    const ids = collectProgressionCharacterIds(
      progression({
        evolvesTo: [{ toId: 12, materials: [{ characterId: null, token: '4000-skull' }] }],
      }),
    );

    expect(ids.sort((left, right) => left - right)).toEqual([12, 4000]);
  });

  it('says it in English and in Greek, with the name and the count', () => {
    for (const language of ['en', 'el']) {
      const copy = JSON.parse(
        readFileSync(
          resolve(process.cwd(), `public/i18n/character-detail/${language}.json`),
          'utf8',
        ),
      ) as { progression: Record<string, string> };

      expect(copy.progression['skullOf'], language).toMatch(/\{\{name\}\}/u);
      expect(copy.progression['skullOfCount'], language).toMatch(/\{\{name\}\}.*×\{\{count\}\}/u);
    }
  });
});

describe('over the shipped seed, through the repository', () => {
  it('the evolution that asked for "five copies of the unit" asks for its skull', async () => {
    const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
    const row =
      /INSERT INTO character_evolutions \(character_id, evolves_to_json, evolves_from_json\)\s*VALUES \(\s*2099,[\s\S]*?\);/u.exec(
        seed,
      );
    const schema = seed.slice(0, seed.indexOf('INSERT INTO'));
    const initSqlJs = (await import('sql.js')).default;
    const SQL: SqlJsStatic = await initSqlJs();
    const database = new SQL.Database();

    try {
      database.run(
        `${schema}\n${row![0]}\nINSERT INTO characters (id, name, is_incomplete, type, primary_class, classes_json, stars, stars_label, cost, combo, region_json, region_release_json, assets_json, search_text, families_json) VALUES (2099, 'x', 0, 'STR', 'Fighter', '[]', 5, '5', 30, 4, '{}', '{}', '{}', 'x', '[]');`,
      );

      const repository = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;

      Object.assign(repository, { databasePromise: Promise.resolve(database) });

      const loaded = await repository.getCharacterProgression(2099);
      const branch = loaded?.evolvesTo[0];

      expect(branch?.toId).toBe(4000);
      expect(branch?.materials).toEqual(
        Array.from({ length: 5 }, () => ({ characterId: null, token: '4000-skull' })),
      );
      expect(buildEvolutionCard(loaded!, resolveName)?.lists.at(-1)?.texts?.[1]).toEqual({
        key: 'progression.skullOfCount',
        params: { name: 'Gild Tesoro - Remains of Love and Regret', count: 5 },
      });
    } finally {
      database.close();
    }
  });
});

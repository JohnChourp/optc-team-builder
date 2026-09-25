import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Database, SqlJsStatic } from 'sql.js';
import { afterEach, describe, expect, it } from 'vitest';

import { type CharacterDetailRecord, type DatasetManifest } from '../models/optc.models';
import { OptcRepositoryService } from './optc-repository.service';

/*
 * 869f63gv6. The repository reads every dual or VS unit's forms once, attaches them to the unit's
 * record, and its SQL class filter counts them the way its in-memory one does - so a reader with a
 * local edit and one without get the same cards under Driven.
 */

let databases: Database[] = [];

afterEach(() => {
  databases.forEach((database) => database.close());
  databases = [];
});

describe('the repository and a dual unit', () => {
  it('attaches the forms to #1983 and to no other card', async () => {
    const service = createService(await openDatabase(), new Map());
    const characters = await service.getAllCharacters();
    const dual = characters.find((character) => character.id === 1983);
    const single = characters.find((character) => character.id === 8);

    expect(dual?.forms?.map((form) => [form.key, form.name, form.type, form.classes])).toEqual([
      ['1', 'Smoker', 'INT', ['Striker', 'Driven']],
      ['2', 'Tashigi', 'PSY', ['Slasher', 'Cerebral']],
    ]);
    expect(dual?.forms?.[0]?.stats.max).toEqual({ hp: 1828, atk: 1348, rcv: 62 });
    expect(single).not.toHaveProperty('forms');
  });

  it('finds #1983 under Driven in SQL and in memory alike', async () => {
    const database = await openDatabase();

    for (const overrides of [new Map(), new Map([[999999, {}]])]) {
      const service = createService(database, overrides);

      expect(await classIds(service, ['Driven'], 'any')).toEqual([8, 1983]);
      expect(await classIds(service, ['Striker', 'Driven'], 'all')).toEqual([1983]);
      expect(await classIds(service, ['Driven', 'Cerebral'], 'all')).toEqual([]);
      expect(await classIds(service, ['Fighter'], 'any')).toEqual([20]);
    }
  });

  it('carries the forms on the records a search returns', async () => {
    const service = createService(await openDatabase(), new Map());
    const [record] = await service.searchDetailedCharacters(query(['Cerebral'], 'any'));

    expect(record?.id).toBe(1983);
    expect(record?.forms?.map((form) => form.name)).toEqual(['Smoker', 'Tashigi']);
  });
});

async function classIds(
  service: OptcRepositoryService,
  selectedClasses: string[],
  matchMode: 'any' | 'all',
): Promise<number[]> {
  return (await service.searchDetailedCharacters(query(selectedClasses, matchMode))).map(
    (record: CharacterDetailRecord) => record.id,
  );
}

function query(selectedClasses: string[], matchMode: 'any' | 'all') {
  return {
    searchTerm: '',
    selectedTypes: [],
    selectedClasses,
    selectedClassesMatchMode: matchMode,
    sortMode: 'idAsc' as const,
    limit: 100,
    offset: 0,
  };
}

function createService(
  database: Database,
  overridesByCharacterId: Map<number, unknown>,
): OptcRepositoryService {
  const service = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;

  Object.assign(service, {
    databasePromise: Promise.resolve(database),
    userState: { activeRegionFilter: () => 'all' },
    characterOverrides: {
      ready: async () => undefined,
      revision: () => overridesByCharacterId.size,
      overridesByCharacterId: () => overridesByCharacterId,
    },
    getDatasetManifest: async () => ({ packs: [] }) as unknown as DatasetManifest,
  });

  return service;
}

async function openDatabase(): Promise<Database> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL: SqlJsStatic = await initSqlJs();
  const database = new SQL.Database();
  const character = (id: number, name: string, type: string, classes: string[]) =>
    `INSERT INTO characters (id, name, is_incomplete, type, primary_class, secondary_class, classes_json, stars, stars_label, cost, combo, region_json, region_release_json, assets_json, search_text, families_json) VALUES (${id}, '${name}', 0, '${type}', '${classes[0] ?? ''}', ${classes[1] ? `'${classes[1]}'` : 'NULL'}, '${JSON.stringify(classes)}', 5, '5', 30, 4, '{}', '{}', '{}', '${name.toLowerCase()}', '[]');
     INSERT INTO character_details (character_id, detail_json) VALUES (${id}, '{}');`;

  database.run(`
    ${readSeedSchema()}
    CREATE TABLE IF NOT EXISTS character_forms (
      character_id INTEGER NOT NULL,
      form_key TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      classes_json TEXT NOT NULL,
      combo INTEGER NOT NULL,
      min_hp INTEGER,
      min_atk INTEGER,
      min_rcv INTEGER,
      max_hp INTEGER,
      max_atk INTEGER,
      max_rcv INTEGER,
      PRIMARY KEY (character_id, form_key)
    );
    ${character(8, 'Roronoa Zoro', 'DEX', ['Slasher', 'Driven'])}
    ${character(20, 'Plain Fighter', 'STR', ['Fighter'])}
    ${character(1983, 'Smoker and Tashigi', 'INT,PSY', ['Striker', 'Slasher'])}
    INSERT INTO character_forms VALUES (1983, '2', 'Tashigi', 'PSY', '["Slasher","Cerebral"]', 6, 188, 89, 19, 1704, 1028, 324);
    INSERT INTO character_forms VALUES (1983, '1', 'Smoker', 'INT', '["Striker","Driven"]', 4, 194, 98, 15, 1828, 1348, 62);
  `);
  databases.push(database);

  return database;
}

/** The shipped seed's own CREATE TABLE statements, so every column the queries name exists. */
function readSeedSchema(): string {
  const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');

  return seed.slice(0, seed.indexOf('INSERT INTO'));
}

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Database, SqlJsStatic } from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { OptcRepositoryService } from './optc-repository.service';

/*
 * 869f63h04. The Auto Team Builder's "only units I can still get" filter reads its list from the
 * shipped seed. These rows are picked for one reason each, and named so a dataset change that
 * moves one of them reads as that, not as a broken filter.
 */
const ROWS = {
  friendPoint: 39, // Buggy the Clown: banners.js FP, nothing else.
  rayleighShop: 779, // Rebecca - Coliseum Sword Fighter: shops.js Ray, nothing else.
  sugoOnly: 3177, // Gol D. Roger - Captain of the Roger Pirates: rr + lrr, nothing else.
  sugoEvolved: 3786, // Roger's evolution: reachable only from a Sugo unit.
  nothingRecorded: 1, // Monkey D. Luffy: no drop, shop or banner since 869f63gm1.
  dropsFromStory: 2, // Luffy's evolution, which drops from story stages.
  farmable: 652, // Iron Mask Duval: drops from a stage.
  evolvedOnce: 653, // Duval - Flying Fish Riders Leader: only by evolving 652.
  evolvedTwice: 654, // Duval - Rosy Life Riders Leader: only by evolving 653.
} as const;

/** Unit 2's evolution. Its own rows are not loaded: it is in the list only through unit 2. */
const EVOLVED_FROM_STORY = 3;

describe('869f63h04 getObtainableCharacterIds, over the shipped seed', () => {
  let database: Database;
  let repository: OptcRepositoryService;

  beforeAll(async () => {
    database = await openSeedRows(Object.values(ROWS));
    repository = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;
    Object.assign(repository, { databasePromise: Promise.resolve(database) });
  });

  afterAll(() => database.close());

  it('keeps farmable, shop and Friend Point units and every form they evolve into', async () => {
    expect(await repository.getObtainableCharacterIds()).toEqual([
      ROWS.dropsFromStory,
      EVOLVED_FROM_STORY,
      ROWS.friendPoint,
      ROWS.farmable,
      ROWS.evolvedOnce,
      ROWS.evolvedTwice,
      ROWS.rayleighShop,
    ]);
  });

  it('leaves out a Sugo-only unit, its evolution and a unit with nothing recorded', async () => {
    const ids = await repository.getObtainableCharacterIds();

    expect(ids).not.toContain(ROWS.sugoOnly);
    expect(ids).not.toContain(ROWS.sugoEvolved);
    expect(ids).not.toContain(ROWS.nothingRecorded);
  });
});

async function openSeedRows(ids: readonly number[]): Promise<Database> {
  const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const wanted = new Set(ids);
  const statements = splitSqlStatements(seed).filter((statement) => {
    if (statement.startsWith('CREATE TABLE')) {
      return true;
    }

    const match = /^INSERT INTO character\w*\s*\([^)]*\)\s*VALUES\s*\(\s*(\d+),/u.exec(statement);

    return match !== null && wanted.has(Number(match[1]));
  });
  const initSqlJs = (await import('sql.js')).default;
  const SQL: SqlJsStatic = await initSqlJs();
  const database = new SQL.Database();

  database.run(statements.join('\n'));

  return database;
}

/** Statements split on `;` outside quoted strings, each trimmed. */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let inString = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];

    if (character === "'") {
      inString = !inString;
    } else if (character === ';' && !inString) {
      statements.push(sql.slice(start, index + 1).trim());
      start = index + 1;
    }
  }

  return statements.filter((statement) => statement.length > 0);
}

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { checkDatasetBinary, writeDatasetBinary } from './build-dataset-binary.mjs';
import {
  GZIP_OS_BYTE_OFFSET,
  GZIP_OS_UNIX,
  buildDatasetDatabaseBytes,
  gunzipDatasetDatabase,
  gzipDatasetDatabase,
  hasSqliteFileHeader,
  loadSqlJs,
  splitSeedStatements,
} from './lib/dataset-binary.mjs';

/*
 * Three tables, one of them with a JSON column and a multi-line INSERT, the way the importer writes
 * them - a one-table fixture could not tell a reader that skips statements from one that does not.
 */
const SEED = `PRAGMA foreign_keys = OFF;
DROP TABLE IF EXISTS characters;
DROP TABLE IF EXISTS ships;
DROP TABLE IF EXISTS meta;

      CREATE TABLE characters (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        classes_json TEXT NOT NULL
      );

      CREATE TABLE ships (id INTEGER PRIMARY KEY, name TEXT NOT NULL);

      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

      INSERT INTO characters (
        id, name, classes_json
      ) VALUES (
        1,
        'Monkey D. Luffy',
        '["Fighter"]'
      );

      INSERT INTO characters (id, name, classes_json)
      VALUES (2, 'Roronoa Zoro; the swordsman', '["Slasher"]');

      INSERT INTO ships (id, name) VALUES (1, 'Merry Go');

    INSERT INTO meta (key, value)
    VALUES ('manifest', '{"schemaVersion":2}');
`;

type SqlJs = Awaited<ReturnType<typeof loadSqlJs>>;

let SQL: SqlJs;
let tempDirs: string[] = [];

beforeAll(async () => {
  SQL = await loadSqlJs();
});

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-dataset-binary-'));
  tempDirs.push(dir);
  return dir;
}

function rowsOf(bytes: Uint8Array, query: string) {
  const database = new SQL.Database(bytes);

  try {
    return database.exec(query)[0]?.values ?? [];
  } finally {
    database.close();
  }
}

describe('dataset binary', () => {
  it('splits the seed into every statement, including multi-line ones', () => {
    const statements = splitSeedStatements(SEED);

    expect(statements).toHaveLength(11);
    expect(statements.filter((statement) => statement.startsWith('INSERT INTO'))).toHaveLength(4);
    /* A semicolon inside a value is not followed by a newline, so it does not split. */
    expect(statements.some((statement) => statement.includes('Zoro; the swordsman'))).toBe(true);
  });

  it('builds a database holding exactly the rows the seed inserts', () => {
    const bytes = buildDatasetDatabaseBytes(SQL, SEED);

    expect(hasSqliteFileHeader(bytes)).toBe(true);
    expect(rowsOf(bytes, 'SELECT id, name, classes_json FROM characters ORDER BY id')).toEqual([
      [1, 'Monkey D. Luffy', '["Fighter"]'],
      [2, 'Roronoa Zoro; the swordsman', '["Slasher"]'],
    ]);
    expect(rowsOf(bytes, 'SELECT name FROM ships')).toEqual([['Merry Go']]);
    expect(rowsOf(bytes, "SELECT value FROM meta WHERE key = 'manifest'")).toEqual([
      ['{"schemaVersion":2}'],
    ]);
  });

  /*
   * The service worker hashes the file. A database that differed between two builds of the same
   * seed would be downloaded again by every installed client after every deploy.
   */
  it('is byte-identical across builds of the same seed', () => {
    const first = buildDatasetDatabaseBytes(SQL, SEED);
    const second = buildDatasetDatabaseBytes(SQL, SEED);

    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
    expect(Buffer.from(gzipDatasetDatabase(second)).equals(Buffer.from(gzipDatasetDatabase(first)))).toBe(
      true,
    );
  });

  it('pins the gzip operating-system byte, which zlib otherwise sets per platform', () => {
    const database = buildDatasetDatabaseBytes(SQL, SEED);
    const plain = gzipSync(database, { level: 9 });
    const pinned = gzipDatasetDatabase(database);

    expect(pinned[GZIP_OS_BYTE_OFFSET]).toBe(GZIP_OS_UNIX);
    expect(Buffer.from(gunzipDatasetDatabase(pinned)).equals(Buffer.from(database))).toBe(true);
    /* Only that byte may differ from what zlib wrote. */
    expect(pinned.length).toBe(plain.length);
    expect([...pinned].filter((byte, index) => byte !== plain[index]).length).toBeLessThanOrEqual(1);
  });

  it('writes the gzipped database and leaves an identical file untouched', async () => {
    const dir = await makeDir();
    const seedPath = path.join(dir, 'optc-seed.sql');
    const outputPath = path.join(dir, 'nested', 'optc-seed.sqlite.gz');
    await writeFile(seedPath, SEED);

    const first = await writeDatasetBinary({ seedPath, outputPath, SQL });
    const second = await writeDatasetBinary({ seedPath, outputPath, SQL });

    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
    expect(first.compressedBytes).toBe((await readFile(outputPath)).length);
    expect(first.compressedBytes).toBeLessThan(first.databaseBytes);
    expect(await checkDatasetBinary({ seedPath, compressedPath: outputPath, SQL })).toBeNull();
  });

  describe('check', () => {
    it('rejects a database built from an older seed', async () => {
      const dir = await makeDir();
      const seedPath = path.join(dir, 'optc-seed.sql');
      const outputPath = path.join(dir, 'optc-seed.sqlite.gz');
      await writeFile(seedPath, SEED);
      await writeDatasetBinary({ seedPath, outputPath, SQL });

      /* The seed moves on; the shipped database does not. */
      await writeFile(seedPath, SEED.replace("'Merry Go'", "'Thousand Sunny'"));

      expect(await checkDatasetBinary({ seedPath, compressedPath: outputPath, SQL })).toMatch(
        /is not the database/u,
      );
    });

    it('rejects a missing file, a file that is not gzip, and gzip that is not a database', async () => {
      const dir = await makeDir();
      const seedPath = path.join(dir, 'optc-seed.sql');
      const compressedPath = path.join(dir, 'optc-seed.sqlite.gz');
      await writeFile(seedPath, SEED);

      expect(await checkDatasetBinary({ seedPath, compressedPath, SQL })).toMatch(/does not exist/u);

      await writeFile(compressedPath, SEED);
      expect(await checkDatasetBinary({ seedPath, compressedPath, SQL })).toMatch(/is not gzip/u);

      await writeFile(compressedPath, gzipSync(Buffer.from(SEED)));
      expect(await checkDatasetBinary({ seedPath, compressedPath, SQL })).toMatch(
        /does not hold a SQLite database/u,
      );

      const truncated = gzipDatasetDatabase(buildDatasetDatabaseBytes(SQL, SEED)).subarray(0, 40);
      await writeFile(compressedPath, truncated);
      expect(await checkDatasetBinary({ seedPath, compressedPath, SQL })).toMatch(/does not decompress/u);
    });
  });
});

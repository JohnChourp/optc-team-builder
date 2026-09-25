import { describe, expect, it } from 'vitest';

import {
  buildDatasetSchemaDocument,
  countSeedStatements,
  detectJsonColumn,
  readDatasetSchema,
} from './lib/dataset-schema.mjs';
import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';

/**
 * 869f138qt. The schema is read out of a real database, so the tests build real databases.
 *
 * The JSON detection is the part with judgement in it, and both directions matter: a TEXT column
 * that really holds objects has to be labelled, and one that merely contains a value starting with
 * a brace must not be - a reader sent looking for a shape that is not there has been misled by the
 * document that was supposed to help.
 */

const SEED = `
CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  region_json TEXT NOT NULL,
  notes TEXT
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO characters (id, name, cost, region_json, notes) VALUES (1, 'Luffy', 5, '["glo","jap"]', 'plain text');
INSERT INTO characters (id, name, cost, region_json, notes) VALUES (2, 'Nami', 3, '{"glo":true}', '{not json');
INSERT INTO meta (key, value) VALUES ('schemaVersion', '2');
`;

async function open() {
  const SQL = await loadSqlJs();

  return new SQL.Database(buildDatasetDatabaseBytes(SQL, SEED));
}

describe('readDatasetSchema', () => {
  it('reports every table with its rows and columns', async () => {
    const database = await open();

    try {
      const schema = readDatasetSchema(database);

      expect(schema.tableCount).toBe(2);
      expect(schema.tables.map((table) => table.name)).toEqual(['characters', 'meta']);

      const characters = schema.tables[0];

      expect(characters.rowCount).toBe(2);
      expect(characters.columns).toHaveLength(5);
    } finally {
      database.close();
    }
  });

  it('records the column facts a reader cannot see from a type', async () => {
    const database = await open();

    try {
      const [characters] = readDatasetSchema(database).tables;
      const byName = Object.fromEntries(characters.columns.map((column) => [column.name, column]));

      expect(byName['id']).toMatchObject({ type: 'INTEGER', primaryKey: true });
      expect(byName['name']).toMatchObject({ notNull: true, primaryKey: false });
      expect(byName['cost']).toMatchObject({ defaultValue: '0' });
      expect(byName['notes']).toMatchObject({ notNull: false, defaultValue: null });
    } finally {
      database.close();
    }
  });

  it('labels a column that really holds JSON', async () => {
    const database = await open();

    try {
      expect(detectJsonColumn(database, 'characters', 'region_json')).toBe(true);
    } finally {
      database.close();
    }
  });

  it('does not label a column where only some values look like JSON', async () => {
    const database = await open();

    try {
      /* `notes` holds 'plain text' and '{not json'. One brace is not a shape. */
      expect(detectJsonColumn(database, 'characters', 'notes')).toBe(false);
    } finally {
      database.close();
    }
  });

  it('does not label a column that is empty of samples', async () => {
    const SQL = await loadSqlJs();
    const database = new SQL.Database(
      buildDatasetDatabaseBytes(SQL, 'CREATE TABLE t (a TEXT);\n'),
    );

    try {
      expect(detectJsonColumn(database, 't', 'a')).toBe(false);
    } finally {
      database.close();
    }
  });

  it('reports the absence of indexes rather than staying silent', async () => {
    const database = await open();

    try {
      const [characters] = readDatasetSchema(database).tables;

      /* An INTEGER PRIMARY KEY is the rowid and creates no index object. */
      expect(characters.indexes).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('reports an index that really exists', async () => {
    const SQL = await loadSqlJs();
    const database = new SQL.Database(
      buildDatasetDatabaseBytes(
        SQL,
        'CREATE TABLE t (a TEXT, b TEXT);\nCREATE INDEX t_a ON t (a);\n',
      ),
    );

    try {
      const [table] = readDatasetSchema(database).tables;

      expect(table.indexes).toEqual([{ name: 't_a', unique: false, origin: 'c' }]);
    } finally {
      database.close();
    }
  });
});

describe('countSeedStatements', () => {
  it('counts what the seed text declares', () => {
    expect(countSeedStatements(SEED)).toEqual({
      createTableStatements: 2,
      insertStatements: 3,
      createIndexStatements: 0,
    });
  });

  it('counts indexes when there are any', () => {
    expect(countSeedStatements('CREATE INDEX a ON t (x);\nCREATE INDEX b ON t (y);').createIndexStatements).toBe(2);
  });
});

describe('buildDatasetSchemaDocument', () => {
  it('carries the dataset timestamp rather than the clock', () => {
    const document = buildDatasetSchemaDocument({
      schema: { tableCount: 0, tables: [] },
      generatedAt: '2026-09-16T14:35:32.004Z',
      statementCounts: { createTableStatements: 0, insertStatements: 0, createIndexStatements: 0 },
    });

    expect(document.generatedAt).toBe('2026-09-16T14:35:32.004Z');
    expect(document.note).toContain('Do not edit by hand');
  });
});

describe('the committed document', () => {
  it('is the schema the committed seed actually has', async () => {
    const { readFile } = await import('node:fs/promises');
    const document = JSON.parse(await readFile('docs/dataset-schema.json', 'utf8'));

    /* The numbers the task got wrong, pinned to what the artifact says. */
    // 869f63gm1 added `character_acquisition`: how a unit is obtained besides a drop.
    expect(document.tableCount).toBe(7);
    expect(document.createIndexStatements).toBe(0);
    expect(document.tables.map((table: { name: string }) => table.name)).toEqual([
      'character_acquisition',
      'character_details',
      'character_drops',
      'character_evolutions',
      'characters',
      'meta',
      'ships',
    ]);

    const characters = document.tables.find((table: { name: string }) => table.name === 'characters');

    expect(characters.rowCount).toBeGreaterThan(4000);
    expect(
      characters.columns
        .filter((column: { holdsJson: boolean }) => column.holdsJson)
        .map((column: { name: string }) => column.name),
    ).toContain('region_json');
  });
});

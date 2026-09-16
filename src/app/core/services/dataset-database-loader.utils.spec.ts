import { gzipSync } from 'node:zlib';

import type { Database, SqlJsStatic } from 'sql.js';
import { describe, expect, it } from 'vitest';

import {
  DATASET_DATABASE_PATH,
  DATASET_READY_MARK,
  DATASET_SEED_PATH,
  SEED_STATEMENT_YIELD_INTERVAL,
  type DatasetDatabaseFetchResponse,
  type DatasetDatabaseLoaderDependencies,
  type DecompressionStreamConstructor,
  gunzipBytes,
  hasGzipHeader,
  hasSqliteFileHeader,
  loadDatasetDatabase,
  markDatasetReady,
  splitSeedStatements,
} from './dataset-database-loader.utils';

const SQLITE_BYTES = new Uint8Array([
  ...new TextEncoder().encode('SQLite format 3\u0000'),
  ...new Uint8Array(84).fill(7),
]);

const SEED = `CREATE TABLE characters (id INTEGER PRIMARY KEY);
INSERT INTO characters (id) VALUES (1);
INSERT INTO characters (id) VALUES (2);
`;

class FakeDatabase {
  readonly statements: string[] = [];
  closed = false;

  constructor(
    readonly bytes: Uint8Array | null | undefined,
    private readonly failOnExec: boolean,
    private readonly failOnRun: string | null = null,
  ) {}

  run(sql: string): void {
    this.statements.push(sql);

    if (this.failOnRun !== null && sql.includes(this.failOnRun)) {
      throw new Error(`near "${this.failOnRun}": syntax error`);
    }
  }

  exec(sql: string): [] {
    this.statements.push(sql);

    if (this.failOnExec) {
      throw new Error('file is not a database');
    }

    return [];
  }

  close(): void {
    this.closed = true;
  }
}

function response(status: number, body: Uint8Array | string): DatasetDatabaseFetchResponse {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;

  return {
    ok: status >= 200 && status < 300,
    status,
    /* A copy with its own ArrayBuffer: a Node Buffer is a view into a shared pool. */
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    text: async () => new TextDecoder().decode(bytes),
  };
}

function setUp(
  options: {
    database?: DatasetDatabaseFetchResponse | Error;
    seed?: DatasetDatabaseFetchResponse;
    decompressionStream?: DecompressionStreamConstructor | undefined;
    failOnExec?: boolean;
    failOnRun?: string;
  } = {},
) {
  const databases: FakeDatabase[] = [];
  const requested: string[] = [];
  const warnings: Array<{ code: string; detail: string }> = [];
  let yields = 0;

  const sql = {
    Database: class {
      constructor(data?: Uint8Array | null) {
        const database = new FakeDatabase(
          data,
          options.failOnExec ?? false,
          options.failOnRun ?? null,
        );
        databases.push(database);
        return database;
      }
    },
  } as unknown as SqlJsStatic;

  const dependencies: DatasetDatabaseLoaderDependencies = {
    sql,
    fetch: async (path) => {
      requested.push(path);

      if (path === DATASET_DATABASE_PATH) {
        const answer = options.database ?? response(200, gzipSync(SQLITE_BYTES));

        if (answer instanceof Error) {
          throw answer;
        }

        return answer;
      }

      return options.seed ?? response(200, SEED);
    },
    decompressionStream:
      'decompressionStream' in options
        ? options.decompressionStream
        : DecompressionStream,
    yieldToMainThread: async () => {
      yields += 1;
    },
    warn: (code, detail) => warnings.push({ code, detail }),
  };

  return {
    dependencies,
    databases,
    requested,
    warnings,
    yields: () => yields,
  };
}

function asFake(database: Database): FakeDatabase {
  return database as unknown as FakeDatabase;
}

describe('dataset database loader', () => {
  it('opens the gzipped database file without executing a single statement', async () => {
    const { dependencies, databases, requested, warnings } = setUp();

    const loaded = await loadDatasetDatabase(dependencies);

    expect(loaded.source).toBe('database-file');
    expect(requested).toEqual([DATASET_DATABASE_PATH]);
    expect(warnings).toEqual([]);
    expect(databases).toHaveLength(1);
    expect(Array.from(asFake(loaded.database).bytes ?? [])).toEqual(Array.from(SQLITE_BYTES));
    /* Only the read that proves the pages are there - no seed statement ran. */
    expect(asFake(loaded.database).statements).toEqual(['SELECT COUNT(*) FROM characters']);
  });

  it('accepts a database the host already decoded, going by the header rather than the name', async () => {
    const { dependencies, warnings } = setUp({ database: response(200, SQLITE_BYTES) });

    const loaded = await loadDatasetDatabase(dependencies);

    expect(loaded.source).toBe('database-file');
    expect(warnings).toEqual([]);
    expect(Array.from(asFake(loaded.database).bytes ?? [])).toEqual(Array.from(SQLITE_BYTES));
  });

  describe('falls back to the SQL seed, and says so', () => {
    const cases: Array<{
      name: string;
      options: Parameters<typeof setUp>[0];
      detail: RegExp;
    }> = [
      { name: 'a missing file', options: { database: response(404, 'not found') }, detail: /answered 404/u },
      {
        name: 'a failed download',
        options: { database: new TypeError('Failed to fetch') },
        detail: /could not be downloaded \(Failed to fetch\)/u,
      },
      {
        name: 'a dev server answering with index.html',
        options: { database: response(200, '<!doctype html><title>OPTC</title>') },
        detail: /is not a SQLite database/u,
      },
      {
        name: 'gzip that holds something else',
        options: { database: response(200, gzipSync(Buffer.from(SEED))) },
        detail: /is not a SQLite database/u,
      },
      {
        name: 'gzip that is cut short',
        options: { database: response(200, gzipSync(SQLITE_BYTES).subarray(0, 20)) },
        detail: /did not decompress/u,
      },
      {
        name: 'a damaged database behind a valid header',
        options: { failOnExec: true },
        detail: /did not open \(file is not a database\)/u,
      },
    ];

    for (const { name, options, detail } of cases) {
      it(`on ${name}`, async () => {
        const { dependencies, databases, requested, warnings } = setUp(options);

        const loaded = await loadDatasetDatabase(dependencies);

        expect(loaded.source).toBe('seed-statements');
        expect(requested).toEqual([DATASET_DATABASE_PATH, DATASET_SEED_PATH]);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.code).toBe('optc:dataset-database-fallback');
        expect(warnings[0]?.detail).toMatch(detail);
        /* A database that was opened and rejected is closed, not leaked. */
        expect(databases.filter((database) => database !== asFake(loaded.database)).every((d) => d.closed)).toBe(
          true,
        );
        expect(asFake(loaded.database).statements).toEqual([
          'BEGIN',
          'CREATE TABLE characters (id INTEGER PRIMARY KEY);',
          'INSERT INTO characters (id) VALUES (1);',
          'INSERT INTO characters (id) VALUES (2);',
          'COMMIT',
        ]);
      });
    }
  });

  it('goes straight to the seed where DecompressionStream does not exist', async () => {
    const { dependencies, requested, warnings } = setUp({ decompressionStream: undefined });

    const loaded = await loadDatasetDatabase(dependencies);

    expect(loaded.source).toBe('seed-statements');
    expect(requested).toEqual([DATASET_SEED_PATH]);
    expect(warnings.map((warning) => warning.code)).toEqual(['optc:dataset-database-unsupported']);
  });

  it('yields to the main thread while executing the seed, and fails when the seed is missing too', async () => {
    const seed = Array.from(
      { length: SEED_STATEMENT_YIELD_INTERVAL * 2 + 10 },
      (_, index) => `INSERT INTO characters (id) VALUES (${index});`,
    ).join('\n');
    const withSeed = setUp({ database: response(404, ''), seed: response(200, `${seed}\n`) });

    const loaded = await loadDatasetDatabase(withSeed.dependencies);

    /* Every statement, plus the BEGIN and COMMIT around them. */
    expect(asFake(loaded.database).statements).toHaveLength(SEED_STATEMENT_YIELD_INTERVAL * 2 + 12);
    expect(withSeed.yields()).toBe(2);

    const withoutSeed = setUp({ database: response(404, ''), seed: response(503, '') });

    await expect(loadDatasetDatabase(withoutSeed.dependencies)).rejects.toThrow(
      `Failed to fetch ${DATASET_SEED_PATH}: 503`,
    );
  });

  it('closes the half-built database and fails when a seed statement fails', async () => {
    const { dependencies, databases } = setUp({
      database: response(404, ''),
      failOnRun: 'VALUES (2)',
    });

    await expect(loadDatasetDatabase(dependencies)).rejects.toThrow('near "VALUES (2)": syntax error');
    expect(databases).toHaveLength(1);
    expect(databases[0]?.closed).toBe(true);
    /* It stopped at the failing statement and never committed. */
    expect(databases[0]?.statements.at(-1)).toBe('INSERT INTO characters (id) VALUES (2);');
    expect(databases[0]?.statements).not.toContain('COMMIT');
  });

  it('marks the moment the database is ready, with the way it was built', () => {
    const marks: Array<{ name: string; options: PerformanceMarkOptions | undefined }> = [];
    const timeline = {
      mark: (name: string, options?: PerformanceMarkOptions) => {
        marks.push({ name, options });
        return undefined as unknown as PerformanceMark;
      },
    };

    markDatasetReady('database-file', timeline);
    markDatasetReady('seed-statements', timeline);

    expect(marks).toEqual([
      { name: DATASET_READY_MARK, options: { detail: { source: 'database-file' } } },
      { name: DATASET_READY_MARK, options: { detail: { source: 'seed-statements' } } },
    ]);
    /* A timeline without `mark` (an old engine) is skipped, not an error. */
    expect(() =>
      markDatasetReady('database-file', { mark: undefined } as unknown as Pick<Performance, 'mark'>),
    ).not.toThrow();
  });

  it('decompresses real gzip with the platform DecompressionStream', async () => {
    const original = new Uint8Array(200_000).map((_, index) => (index * 31) % 251);

    const decompressed = await gunzipBytes(
      new Uint8Array(gzipSync(original)),
      DecompressionStream,
    );

    expect(decompressed.length).toBe(original.length);
    expect(Array.from(decompressed.subarray(0, 50))).toEqual(Array.from(original.subarray(0, 50)));
    expect(decompressed.every((byte, index) => byte === original[index])).toBe(true);
  });

  it('recognises the two headers and splits statements like the build does', () => {
    expect(hasGzipHeader(new Uint8Array([0x1f, 0x8b, 8]))).toBe(true);
    expect(hasGzipHeader(new Uint8Array([0x1f]))).toBe(false);
    expect(hasSqliteFileHeader(SQLITE_BYTES)).toBe(true);
    expect(hasSqliteFileHeader(SQLITE_BYTES.subarray(0, 10))).toBe(false);
    expect(hasSqliteFileHeader(new TextEncoder().encode('SQLite format 2\u0000xxxx'))).toBe(false);
    expect(splitSeedStatements("A;\n  B ;  \nC 'x; y';\n\n")).toEqual(['A', 'B', "C 'x; y'"]);
  });
});

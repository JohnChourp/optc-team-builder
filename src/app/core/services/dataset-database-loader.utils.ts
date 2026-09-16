import type { Database, SqlJsStatic } from 'sql.js';

/*
 * 869f138q7. How the app gets its database.
 *
 * The dataset ships as `optc-seed.sqlite.gz`: a SQLite file built from the committed SQL seed at
 * build time (`scripts/build-dataset-binary.mjs`), gzipped. The app decompresses it with
 * `DecompressionStream` and opens it directly. Before this, the app downloaded the 27.7 MB text
 * seed - uncompressed, because the host does not compress `.sql` - and executed its 13,863
 * statements on every start: 1.6 s of main-thread work at 4x CPU throttling, against 0.12 s now.
 *
 * The text seed is still in the build, outside the service worker's prefetch group, and is the
 * fallback when the database cannot be used: a browser without `DecompressionStream` (below every
 * version Angular supports), a missing or damaged file, or a dev server that answers a missing
 * file with `index.html`. The fallback builds the same rows the slow way, so the answer is right
 * either way - which is also why it must never be silent (see `warn`).
 */

export const DATASET_DATABASE_PATH = 'assets/data/optc-seed.sqlite.gz';
export const DATASET_SEED_PATH = 'assets/data/optc-seed.sql';

/** Statements executed between two yields on the fallback path. */
export const SEED_STATEMENT_YIELD_INTERVAL = 250;

/** `scripts/lib/dataset-binary.mjs` splits the seed the same way when it builds the database. */
const SEED_STATEMENT_SEPARATOR = /;\s*\n/u;
const SQLITE_FILE_HEADER = 'SQLite format 3\u0000';

export type DatasetDatabaseSource = 'database-file' | 'seed-statements';

export interface DatasetDatabaseFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export type DecompressionStreamConstructor = typeof DecompressionStream;

export interface DatasetDatabaseLoaderDependencies {
  readonly sql: SqlJsStatic;
  readonly fetch: (path: string) => Promise<DatasetDatabaseFetchResponse>;
  /** `undefined` where the browser has none; the loader then goes straight to the seed. */
  readonly decompressionStream: DecompressionStreamConstructor | undefined;
  readonly yieldToMainThread: () => Promise<void>;
  /**
   * A fallback is correct but slow, and a slow path nobody is told about is how the seed stayed
   * uncompressed for the life of the project. Every fallback reports here, with a stable code.
   */
  readonly warn: (code: string, detail: string) => void;
}

export interface LoadedDatasetDatabase {
  readonly database: Database;
  readonly source: DatasetDatabaseSource;
}

export function hasGzipHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function hasSqliteFileHeader(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_FILE_HEADER.length) {
    return false;
  }

  for (let index = 0; index < SQLITE_FILE_HEADER.length; index += 1) {
    if (bytes[index] !== SQLITE_FILE_HEADER.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

export function splitSeedStatements(seed: string): string[] {
  return seed
    .split(SEED_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function gunzipBytes(
  bytes: Uint8Array<ArrayBuffer>,
  decompressionStream: DecompressionStreamConstructor,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new decompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    length += value.length;
  }

  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

export async function loadDatasetDatabase(
  dependencies: DatasetDatabaseLoaderDependencies,
): Promise<LoadedDatasetDatabase> {
  if (dependencies.decompressionStream) {
    const database = await openDatabaseFile(dependencies, dependencies.decompressionStream);

    if (database) {
      return { database, source: 'database-file' };
    }
  } else {
    dependencies.warn(
      'optc:dataset-database-unsupported',
      'DecompressionStream is unavailable; building the database from the SQL seed.',
    );
  }

  return { database: await buildDatabaseFromSeed(dependencies), source: 'seed-statements' };
}

async function openDatabaseFile(
  dependencies: DatasetDatabaseLoaderDependencies,
  decompressionStream: DecompressionStreamConstructor,
): Promise<Database | null> {
  const reject = (detail: string): null => {
    dependencies.warn('optc:dataset-database-fallback', `${detail}; building it from the SQL seed.`);
    return null;
  };

  let received: Uint8Array<ArrayBuffer>;

  try {
    const response = await dependencies.fetch(DATASET_DATABASE_PATH);

    if (!response.ok) {
      return reject(`${DATASET_DATABASE_PATH} answered ${response.status}`);
    }

    received = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return reject(`${DATASET_DATABASE_PATH} could not be downloaded (${describe(error)})`);
  }

  let bytes = received;

  /*
   * A host that serves the file with `content-encoding: gzip` would hand over the database
   * already decoded; the header, not the file name, says which of the two arrived.
   */
  if (hasGzipHeader(received)) {
    try {
      bytes = await gunzipBytes(received, decompressionStream);
    } catch (error) {
      return reject(`${DATASET_DATABASE_PATH} did not decompress (${describe(error)})`);
    }
  }

  if (!hasSqliteFileHeader(bytes)) {
    return reject(`${DATASET_DATABASE_PATH} is not a SQLite database`);
  }

  let database: Database | null = null;

  try {
    database = new dependencies.sql.Database(bytes);
    /* A damaged file can carry a valid header; reading one table proves the pages are there. */
    database.exec('SELECT COUNT(*) FROM characters');
    return database;
  } catch (error) {
    database?.close();
    return reject(`${DATASET_DATABASE_PATH} did not open (${describe(error)})`);
  }
}

export async function buildDatabaseFromSeed(
  dependencies: Pick<DatasetDatabaseLoaderDependencies, 'sql' | 'fetch' | 'yieldToMainThread'>,
): Promise<Database> {
  const response = await dependencies.fetch(DATASET_SEED_PATH);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${DATASET_SEED_PATH}: ${response.status}`);
  }

  const seed = await response.text();
  const database = new dependencies.sql.Database();

  for (const [index, statement] of splitSeedStatements(seed).entries()) {
    database.run(`${statement};`);

    if (index > 0 && index % SEED_STATEMENT_YIELD_INTERVAL === 0) {
      await dependencies.yieldToMainThread();
    }
  }

  return database;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

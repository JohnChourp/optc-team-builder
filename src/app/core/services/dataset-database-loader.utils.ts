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

/**
 * The same database under the name the ANDROID build leaves it at.
 *
 * 869f4kxrm, measured on an API 35 emulator. `cap sync` copies `optc-seed.sqlite.gz` into the
 * Android assets correctly, and then **AAPT unpacks a `.gz` asset and strips the extension when it
 * packages the APK**. So the APK holds `optc-seed.sqlite` - byte-identical to the gunzipped file,
 * verified - while the app asked for the `.gz` name, got a 404, and rebuilt the whole database from
 * the 27.8 MB SQL seed on EVERY launch: the slow path 869f138q7 existed to remove, 1.6 s of
 * main-thread work against 0.12 s. Nothing in `android/app/build.gradle` asks for this; it is
 * AAPT's own behaviour, and the web is unaffected (the site serves the `.gz` with a 200).
 *
 * Trying this second name costs one extra request only where the first genuinely 404s, and the
 * reader below already decides gzip-or-not from the BYTES rather than the file name, so an
 * already-unpacked file needs no other special case.
 */
export const DATASET_DATABASE_UNPACKED_PATH = 'assets/data/optc-seed.sqlite';

/** Tried in order. The first that answers and parses wins; the SQL seed is the last resort. */
export const DATASET_DATABASE_PATHS = [DATASET_DATABASE_PATH, DATASET_DATABASE_UNPACKED_PATH] as const;

export const DATASET_SEED_PATH = 'assets/data/optc-seed.sql';

/**
 * Statements executed between two yields on the fallback path.
 *
 * 869f138qd. The value predates any measurement; it is kept because the measurement supports it.
 * In Chromium at 4x CPU, inside the transaction below, the 13,863 statements took 882 ms in 56
 * chunks - about 16 ms a chunk, so the page gets a frame roughly every 16 ms. Chunk cost follows
 * bytes rather than statement count, and the newest characters carry the longest detail JSON, so
 * the last chunks are the slowest: the longest task measured was 81 ms.
 */
export const SEED_STATEMENT_YIELD_INTERVAL = 250;

/** `performance.mark` name set when the database is ready; scripts/perf-route-load.mjs reads it. */
export const DATASET_READY_MARK = 'optc:dataset-ready';

/** `scripts/lib/dataset-binary.mjs` splits the seed the same way when it builds the database. */
const SEED_STATEMENT_SEPARATOR = /;\s*\n/u;
const SQLITE_FILE_HEADER = 'SQLite format 3\u0000';

export type DatasetDatabaseSource = 'database-file' | 'seed-statements';

export interface DatasetDatabaseFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  /*
   * 869f138pm. Present on a real `Response` and absent from the test doubles, which is exactly the
   * distinction the reader below makes: streaming is how the download reports progress, and
   * `arrayBuffer()` stays the path when there is no body to stream.
   */
  readonly body?: ReadableStream<Uint8Array> | null;
  readonly headers?: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

/** 869f138pm. Bytes so far and, when the host says so, the total. */
export interface DatasetDownloadProgress {
  readonly receivedBytes: number;
  readonly totalBytes: number | null;
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
  /**
   * 869f138pm. Called as the database downloads, so the first visit can say how far along it is.
   *
   * The wait it reports is the one a reader actually sits through: on a throttled mobile profile
   * the database is seconds of the first visit and a spinner cannot tell them apart from a hang.
   * Optional because every caller that is not the app - specs, benchmarks - has nobody to tell.
   */
  readonly onProgress?: (progress: DatasetDownloadProgress) => void;
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

/**
 * 869f138pm. The body, read in chunks so the download can be reported while it happens.
 *
 * Falls back to `arrayBuffer()` whenever there is no stream to read - an old browser, a test double,
 * a response the host buffered - and the reader then simply sees no progress rather than an error.
 * `content-length` is the compressed length on a `.gz` served as-is, which is what this file is, so
 * the two numbers are the same units; a host that recompresses it sends no length at all and the
 * total is reported as unknown rather than guessed.
 */
export async function readResponseBytes(
  response: DatasetDatabaseFetchResponse,
  onProgress?: (progress: DatasetDownloadProgress) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const body = response.body;

  if (!body || typeof body.getReader !== 'function') {
    return new Uint8Array(await response.arrayBuffer());
  }

  const declared = Number(response.headers?.get('content-length') ?? '');
  const totalBytes = Number.isFinite(declared) && declared > 0 ? declared : null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    chunks.push(value);
    receivedBytes += value.length;
    onProgress?.({ receivedBytes, totalBytes });
  }

  const output = new Uint8Array(receivedBytes);
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
  /*
   * Every candidate's failure is collected and reported together. Warning on the FIRST one would
   * make the Android path - where the `.gz` name always 404s - log a fallback warning on every
   * launch while the database in fact opened from the second name, which is worse than silence
   * because it trains the reader to ignore the one warning that matters.
   */
  const failures: string[] = [];

  for (const candidate of DATASET_DATABASE_PATHS) {
    const database = await openDatabaseCandidate(dependencies, decompressionStream, candidate, failures);

    if (database) {
      return database;
    }
  }

  dependencies.warn(
    'optc:dataset-database-fallback',
    `${failures.join('; ')}; building it from the SQL seed.`,
  );

  return null;
}

async function openDatabaseCandidate(
  dependencies: DatasetDatabaseLoaderDependencies,
  decompressionStream: DecompressionStreamConstructor,
  databasePath: string,
  failures: string[],
): Promise<Database | null> {
  const reject = (detail: string): null => {
    failures.push(detail);
    return null;
  };

  let received: Uint8Array<ArrayBuffer>;

  try {
    const response = await dependencies.fetch(databasePath);

    if (!response.ok) {
      return reject(`${databasePath} answered ${response.status}`);
    }

    received = await readResponseBytes(response, dependencies.onProgress);
  } catch (error) {
    return reject(`${databasePath} could not be downloaded (${describe(error)})`);
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
      return reject(`${databasePath} did not decompress (${describe(error)})`);
    }
  }

  if (!hasSqliteFileHeader(bytes)) {
    return reject(`${databasePath} is not a SQLite database`);
  }

  let database: Database | null = null;

  try {
    database = new dependencies.sql.Database(bytes);
    /* A damaged file can carry a valid header; reading one table proves the pages are there. */
    database.exec('SELECT COUNT(*) FROM characters');
    return database;
  } catch (error) {
    database?.close();
    return reject(`${databasePath} did not open (${describe(error)})`);
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

  /*
   * 869f138qd. One transaction around the whole seed. Without it every INSERT commits on its own:
   * 1,584 ms against 1,003 ms in Chromium at 4x CPU. The database file is the normal path now, so
   * this only speeds up the fallback, but the fallback is exactly when a player is already waiting
   * longer than they should. Nothing else can reach the database before it is returned, so the
   * transaction may stay open across the yields.
   */
  try {
    database.run('BEGIN');

    for (const [index, statement] of splitSeedStatements(seed).entries()) {
      database.run(`${statement};`);

      if (index > 0 && index % SEED_STATEMENT_YIELD_INTERVAL === 0) {
        await dependencies.yieldToMainThread();
      }
    }

    database.run('COMMIT');
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

/**
 * 869f138qd. Records when the database became usable, and which way it was built, so a browser
 * harness can budget it and a report can tell a slow fallback from a slow download.
 */
export function markDatasetReady(
  source: DatasetDatabaseSource,
  timeline: Pick<Performance, 'mark'> | undefined = globalThis.performance,
): void {
  if (typeof timeline?.mark !== 'function') {
    return;
  }

  timeline.mark(DATASET_READY_MARK, { detail: { source } });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

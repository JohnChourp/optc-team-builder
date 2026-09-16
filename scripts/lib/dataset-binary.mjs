import { createRequire } from 'node:module';
import { gunzipSync, gzipSync } from 'node:zlib';

/**
 * 869f138q7. The dataset ships as a SQLite database, built from the committed SQL seed.
 *
 * `public/assets/data/optc-seed.sql` stays the source of truth: it is diffable, it is what the
 * importer writes, and about twenty scripts read it as text. What a browser downloads is this
 * module's output - the same rows, as a database file, gzipped - because on 2026-09-16 the seed
 * went over the wire at 27,722,752 bytes with no `content-encoding`, and executing its 13,863
 * statements took 1.6 s of main-thread time on every app start at 4x CPU throttling. The database
 * opens in about 0.1 s and gzips to 2,289,988 bytes.
 *
 * Two properties are load-bearing, and both are asserted by the dataset-delivery lane:
 *
 * - DETERMINISTIC. The service worker hashes every prefetched file, so a byte that changes for no
 *   reason re-downloads the whole database on every installed client. The same seed must always
 *   produce the same bytes.
 * - EQUIVALENT. The database must hold exactly what executing the seed holds, because the app
 *   falls back to executing the seed when it cannot open the database.
 */

/** The app splits the seed the same way (`dataset-database-loader.utils.ts`). */
export const SEED_STATEMENT_SEPARATOR = /;\s*\n/u;

export const SQLITE_FILE_HEADER = 'SQLite format 3\u0000';

/*
 * Byte 9 of a gzip header names the operating system that wrote it. It is informational only, but
 * zlib fills it in per platform, so the same database gzipped on macOS and on the Linux runner
 * would hash differently and a deploy from one after the other would re-download it everywhere.
 * 3 is "Unix".
 */
export const GZIP_OS_BYTE_OFFSET = 9;
export const GZIP_OS_UNIX = 3;

export function splitSeedStatements(seedText) {
  return String(seedText)
    .split(SEED_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function loadSqlJs() {
  const require = createRequire(import.meta.url);
  const initSqlJs = require('sql.js');
  return initSqlJs();
}

/**
 * Executes the seed inside one transaction, compacts the file, and exports it.
 *
 * `VACUUM` must run after `COMMIT` - SQLite refuses it inside a transaction - and it is what makes
 * the page layout a function of the rows alone rather than of the order they were written in.
 */
export function buildDatasetDatabaseBytes(SQL, seedText) {
  const database = new SQL.Database();

  try {
    database.run('BEGIN');

    for (const statement of splitSeedStatements(seedText)) {
      database.run(`${statement};`);
    }

    database.run('COMMIT');
    database.run('VACUUM');

    return database.export();
  } finally {
    database.close();
  }
}

export function gzipDatasetDatabase(databaseBytes) {
  const compressed = gzipSync(databaseBytes, { level: 9 });
  compressed[GZIP_OS_BYTE_OFFSET] = GZIP_OS_UNIX;
  return compressed;
}

export function gunzipDatasetDatabase(compressedBytes) {
  return new Uint8Array(gunzipSync(compressedBytes));
}

export function hasSqliteFileHeader(bytes) {
  if (!bytes || bytes.length < SQLITE_FILE_HEADER.length) {
    return false;
  }

  for (let index = 0; index < SQLITE_FILE_HEADER.length; index += 1) {
    if (bytes[index] !== SQLITE_FILE_HEADER.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

export function hasGzipHeader(bytes) {
  return Boolean(bytes) && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function bytesEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}

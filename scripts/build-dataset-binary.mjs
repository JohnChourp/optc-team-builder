#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildDatasetDatabaseBytes,
  bytesEqual,
  gunzipDatasetDatabase,
  gzipDatasetDatabase,
  hasGzipHeader,
  hasSqliteFileHeader,
  loadSqlJs,
} from './lib/dataset-binary.mjs';

/**
 * 869f138q7. Turns the committed SQL seed into the gzipped SQLite database the app downloads.
 *
 * It runs before every `npm run build`, `npm run build:pages` and `npm start`, each of which
 * chains `npm run dataset:binary` (a BARE `ng build` or `ng serve` does NOT run it), writing into
 * `public/`, which Angular copies. The output is gitignored: it is derived
 * entirely from `optc-seed.sql`, and committing a 2.3 MB binary on every data change would grow the
 * repository for no information.
 *
 *   node ./scripts/build-dataset-binary.mjs                 write public/assets/data/optc-seed.sqlite.gz
 *   node ./scripts/build-dataset-binary.mjs --check <gz>    exit 1 unless <gz> holds exactly the seed
 *
 * `--check` compares the DECOMPRESSED bytes, not the gzip: the database file is deterministic on
 * every machine, while zlib's output differs between Node releases (measured: 2,289,988 B on Node
 * 26 against 2,296,133 B on Node 24 for the same database).
 */

export const DEFAULT_SEED_PATH = 'public/assets/data/optc-seed.sql';
export const DEFAULT_OUTPUT_PATH = 'public/assets/data/optc-seed.sqlite.gz';

export async function writeDatasetBinary({ seedPath, outputPath, SQL }) {
  const seedText = readFileSync(seedPath, 'utf8');
  const databaseBytes = buildDatasetDatabaseBytes(SQL, seedText);
  const compressed = gzipDatasetDatabase(databaseBytes);
  const unchanged = existsSync(outputPath) && bytesEqual(readFileSync(outputPath), compressed);

  if (!unchanged) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, compressed);
  }

  return {
    seedBytes: Buffer.byteLength(seedText),
    databaseBytes: databaseBytes.length,
    compressedBytes: compressed.length,
    written: !unchanged,
  };
}

/**
 * Returns `null` when `compressedPath` is exactly the database `seedPath` builds, otherwise a
 * sentence saying what is wrong with it.
 */
export async function checkDatasetBinary({ seedPath, compressedPath, SQL }) {
  if (!existsSync(compressedPath)) {
    return `${compressedPath} does not exist`;
  }

  const shipped = readFileSync(compressedPath);

  if (!hasGzipHeader(shipped)) {
    return `${compressedPath} is not gzip`;
  }

  let databaseBytes;

  try {
    databaseBytes = gunzipDatasetDatabase(shipped);
  } catch (error) {
    return `${compressedPath} does not decompress: ${error instanceof Error ? error.message : error}`;
  }

  if (!hasSqliteFileHeader(databaseBytes)) {
    return `${compressedPath} does not hold a SQLite database`;
  }

  const expected = buildDatasetDatabaseBytes(SQL, readFileSync(seedPath, 'utf8'));

  if (!bytesEqual(databaseBytes, expected)) {
    return `${compressedPath} is not the database ${seedPath} builds (${databaseBytes.length} B shipped, ${expected.length} B expected) - rebuild it with npm run dataset:binary`;
  }

  return null;
}

async function main() {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const argument = (flag) => {
    const index = process.argv.indexOf(flag);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const seedPath = path.resolve(appRoot, argument('--seed') ?? DEFAULT_SEED_PATH);
  const SQL = await loadSqlJs();
  const checkPath = argument('--check');

  if (checkPath) {
    const problem = await checkDatasetBinary({
      seedPath,
      compressedPath: path.resolve(appRoot, checkPath),
      SQL,
    });

    if (problem) {
      process.stderr.write(`Dataset binary check FAILED: ${problem}\n`);
      process.exitCode = 1;
      return;
    }

    process.stdout.write(`Dataset binary check passed: ${checkPath} is exactly the seed.\n`);
    return;
  }

  const outputPath = path.resolve(appRoot, argument('--out') ?? DEFAULT_OUTPUT_PATH);
  const result = await writeDatasetBinary({ seedPath, outputPath, SQL });

  process.stdout.write(
    `Dataset binary ${result.written ? 'written' : 'unchanged'}: ${path.relative(appRoot, outputPath)} ` +
      `(${result.compressedBytes} B gzip; database ${result.databaseBytes} B; seed ${result.seedBytes} B)\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}

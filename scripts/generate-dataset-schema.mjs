#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';
import {
  buildDatasetSchemaDocument,
  countSeedStatements,
  readDatasetSchema,
} from './lib/dataset-schema.mjs';
import { readManifestGeneratedAt } from './lib/optc-dataset.mjs';

/**
 * 869f138qt. Writes `docs/dataset-schema.json` from the committed seed.
 *
 * What it records and why it is generated rather than written is in
 * `scripts/lib/dataset-schema.mjs`.
 *
 * Run: npm run dataset:schema           (write)
 *      npm run dataset:schema -- --check (fail when the file is stale)
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_PATH = path.join(APP_ROOT, 'public/assets/data/optc-seed.sql');
const DATA_DIR = path.join(APP_ROOT, 'public/assets/data');
const OUTPUT_PATH = path.join(APP_ROOT, 'docs/dataset-schema.json');

/*
 * The dataset's own `generatedAt`, not the clock. A file that re-stamps itself on every run is a
 * diff on every release for no reason, and 869f138qb spent a subtask removing exactly that.
 */
async function buildDocument() {
  const SQL = await loadSqlJs();
  const seedText = readFileSync(SEED_PATH, 'utf8');
  const database = new SQL.Database(buildDatasetDatabaseBytes(SQL, seedText));

  try {
    return buildDatasetSchemaDocument({
      schema: readDatasetSchema(database),
      generatedAt: readManifestGeneratedAt(
        readFileSync(path.join(DATA_DIR, 'optc-manifest.json'), 'utf8'),
      ),
      statementCounts: countSeedStatements(seedText),
    });
  } finally {
    database.close();
  }
}

function serialize(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function main() {
  const check = process.argv.includes('--check');
  const next = serialize(await buildDocument());

  if (!check) {
    writeFileSync(OUTPUT_PATH, next, 'utf8');
    console.log(
      `[dataset-schema] wrote docs/dataset-schema.json (${JSON.parse(next).tableCount} tables).`,
    );

    return;
  }

  let current = '';

  try {
    current = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    current = '';
  }

  if (current === next) {
    const document = JSON.parse(next);

    console.log(
      `[dataset-schema] OK - ${document.tableCount} tables, ${document.insertStatements} inserts, ${document.createIndexStatements} indexes, all as the seed reports them.`,
    );

    return;
  }

  console.error(
    '[dataset-schema] docs/dataset-schema.json does not match the seed. It is GENERATED - run `npm run dataset:schema`.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

export { buildDocument, serialize };

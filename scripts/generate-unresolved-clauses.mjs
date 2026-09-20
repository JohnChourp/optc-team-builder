#!/usr/bin/env node
/**
 * 869f127f6. Writes `public/assets/data/optc-unresolved-clauses.json` from the shipped dataset,
 * the same shape and for the same reason as `optc-unresolved-images.json`.
 *
 * Reads the seed rather than re-running the import, so it can be regenerated and checked without
 * network access - and so the committed record is provably a function of the committed dataset.
 *
 * `--check` compares instead of writing, which is what the lane and the release chain run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createUnresolvedClauseCatalog } from './lib/unresolved-clauses.mjs';
import { pathToFileURL } from 'node:url';

export const SEED_PATH = 'public/assets/data/optc-seed.sql';
export const MANIFEST_PATH = 'public/assets/data/optc-manifest.json';
export const CATALOG_PATH = 'public/assets/data/optc-unresolved-clauses.json';

const DETAIL_ROW_PATTERN =
  /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu;

export function readDetailRows({ appRoot = process.cwd(), sql } = {}) {
  const source = sql ?? readFileSync(path.join(appRoot, SEED_PATH), 'utf8');
  const rows = [];

  DETAIL_ROW_PATTERN.lastIndex = 0;

  let match;

  while ((match = DETAIL_ROW_PATTERN.exec(source)) !== null) {
    try {
      rows.push({ characterId: Number(match[1]), detail: JSON.parse(match[2].replace(/''/gu, "'")) });
    } catch {
      // A row this cannot parse is skipped rather than failing the run: the seed is generated, so
      // an unparseable row is a dataset defect the integrity checks own, not this one's to report.
    }
  }

  return rows;
}

export function buildCatalog({ appRoot = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  let sourceVersion = 'unknown';

  try {
    sourceVersion = String(JSON.parse(readFileSync(path.join(appRoot, MANIFEST_PATH), 'utf8')).sourceVersion ?? 'unknown');
  } catch {
    sourceVersion = 'unknown';
  }

  return createUnresolvedClauseCatalog(readDetailRows({ appRoot }), sourceVersion, generatedAt);
}

/**
 * Everything except `generatedAt`, which changes on every run by design and would make the check
 * fail for the one reason that means nothing.
 */
export function comparableCatalog(catalog) {
  const { generatedAt, ...rest } = catalog ?? {};

  return rest;
}

function parseArgs(argv) {
  const options = { appRoot: process.cwd(), check: false };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--app-root') {
      options.appRoot = argv[index + 1] ?? options.appRoot;
      index += 1;
    } else if (argv[index] === '--check') {
      options.check = true;
    }
  }

  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { appRoot, check } = parseArgs(process.argv.slice(2));
  const target = path.join(appRoot, CATALOG_PATH);
  const catalog = buildCatalog({ appRoot });

  if (!check) {
    writeFileSync(target, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    console.log(
      `[unresolved-clauses] wrote ${CATALOG_PATH}: ${catalog.total} instance(s) across ${catalog.distinctClauses} distinct clause(s).`,
    );
    process.exit(0);
  }

  let committed;

  try {
    committed = JSON.parse(readFileSync(target, 'utf8'));
  } catch (error) {
    console.error(`[unresolved-clauses] ${CATALOG_PATH} could not be read (${error.message}).`);
    console.error('[unresolved-clauses] Run `npm run dataset:unresolved-clauses` to regenerate it.');
    process.exit(1);
  }

  if (JSON.stringify(comparableCatalog(committed)) !== JSON.stringify(comparableCatalog(catalog))) {
    console.error(
      `[unresolved-clauses] ${CATALOG_PATH} is out of step with the dataset: it records ${committed.total} instance(s) across ${committed.distinctClauses} clause(s); the dataset has ${catalog.total} across ${catalog.distinctClauses}.`,
    );
    console.error(
      '[unresolved-clauses] This is NOT a defect to fix in the parser. Degrading to the game own',
    );
    console.error(
      '[unresolved-clauses] English is the owner rule; the record exists so a CHANGE in it is visible.',
    );
    console.error('[unresolved-clauses] Run `npm run dataset:unresolved-clauses` and commit the result.');
    process.exit(1);
  }

  console.log(
    `[unresolved-clauses] ${CATALOG_PATH} matches the dataset: ${catalog.total} instance(s) across ${catalog.distinctClauses} distinct clause(s).`,
  );
}

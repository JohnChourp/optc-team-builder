#!/usr/bin/env node
/**
 * 869f13288. Writes the consumer census, and checks it.
 *
 * `--check` compares instead of writing, and fails when a column is read by nothing, or read only
 * by specs with no declared reason. See `scripts/lib/dataset-consumers.mjs` for why that is three
 * outcomes rather than two.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { buildConsumerCensus, findCensusFailures } from './lib/dataset-consumers.mjs';
import { pathToFileURL } from 'node:url';

export const DATASET_LIB_PATH = 'scripts/lib/optc-dataset.mjs';
export const REPOSITORY_PATH = 'src/app/core/services/optc-repository.service.ts';
export const CENSUS_JSON_PATH = 'docs/dataset-consumers.json';

const SCANNED_EXTENSIONS = new Set(['.ts', '.html']);

export function readSourceFiles(appRoot) {
  const files = [];

  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const absolute = path.join(directory, entry);

      if (statSync(absolute).isDirectory()) {
        walk(absolute);
        continue;
      }

      if (!SCANNED_EXTENSIONS.has(path.extname(entry))) {
        continue;
      }

      files.push([
        path.relative(appRoot, absolute).split(path.sep).join('/'),
        readFileSync(absolute, 'utf8'),
      ]);
    }
  };

  walk(path.join(appRoot, 'src'));

  return files;
}

export function readCensus({ appRoot = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  return buildConsumerCensus({
    datasetSource: readFileSync(path.join(appRoot, DATASET_LIB_PATH), 'utf8'),
    repositorySource: readFileSync(path.join(appRoot, REPOSITORY_PATH), 'utf8'),
    files: readSourceFiles(appRoot),
    generatedAt,
  });
}

/** Everything but `generatedAt`, which changes every run and means nothing on its own. */
export function comparable(census) {
  const { generatedAt, ...rest } = census ?? {};

  return rest;
}

async function main() {
  const appRoot = process.cwd();
  const census = readCensus({ appRoot });
  const failures = findCensusFailures(census);
  const targetPath = path.join(appRoot, CENSUS_JSON_PATH);
  const serialized = `${JSON.stringify(census, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const existing = JSON.parse(readFileSync(targetPath, 'utf8'));

    if (JSON.stringify(comparable(existing)) !== JSON.stringify(comparable(census))) {
      console.error(
        `[dataset-consumers] ${CENSUS_JSON_PATH} is stale. Run \`npm run dataset:consumers\`.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    writeFileSync(targetPath, serialized, 'utf8');
    console.log(`[dataset-consumers] wrote ${CENSUS_JSON_PATH} (${census.columnCount} columns).`);
  }

  if (failures.length) {
    console.error('[dataset-consumers] unresolved fields:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[dataset-consumers] OK - every one of ${census.columnCount} columns has a named consumer or a recorded reason.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}

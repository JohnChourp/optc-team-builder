#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildImportPipelineDocument,
  findUnexplainedDataFiles,
} from './lib/import-pipeline.mjs';

/**
 * 869f138r4. Writes `docs/import-pipeline.json` from the importer and `scripts/data/`.
 *
 * What it records, and why the format question is answered rather than re-opened, is in
 * `scripts/lib/import-pipeline.mjs`.
 *
 * Run: npm run dataset:pipeline           (write)
 *      npm run dataset:pipeline -- --check (fail when it is stale, or a data file has no reader)
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPORTER_PATH = path.join(APP_ROOT, 'scripts/import-optc-data.mjs');
const OUTPUT_PATH = path.join(APP_ROOT, 'docs/import-pipeline.json');

export function buildDocument() {
  return buildImportPipelineDocument({ appRoot: APP_ROOT, importerPath: IMPORTER_PATH });
}

function serialize(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const document = buildDocument();
  const unexplained = findUnexplainedDataFiles(document);

  if (unexplained.length) {
    console.error('[import-pipeline] a data file is read by nobody and explained by nothing:');

    for (const finding of unexplained) {
      console.error(`- [${finding.kind}] ${finding.name} - ${finding.detail}`);
    }

    process.exitCode = 1;

    return;
  }

  const next = serialize(document);

  if (!check) {
    writeFileSync(OUTPUT_PATH, next, 'utf8');
    console.log(
      `[import-pipeline] wrote docs/import-pipeline.json (${document.stages.length} stages, ${document.dataFileCount} data files).`,
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
    console.log(
      `[import-pipeline] OK - ${document.stages.length} stages, ${document.dataFileCount} data files, ${document.readerlessDataFileCount} read by a person rather than by code.`,
    );

    return;
  }

  console.error(
    '[import-pipeline] docs/import-pipeline.json does not match the importer. It is GENERATED - run `npm run dataset:pipeline`.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { serialize };

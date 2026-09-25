#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildImportPipelineDocument,
  findUnexplainedDataFiles,
} from './lib/import-pipeline.mjs';
import {
  buildUpstreamFileRegister,
  fetchUpstreamDataListing,
  findUpstreamRegisterDisagreements,
  readRecordedListing,
} from './lib/upstream-file-register.mjs';

/**
 * 869f138r4. Writes `docs/import-pipeline.json` from the importer and `scripts/data/`.
 *
 * What it records, and why the format question is answered rather than re-opened, is in
 * `scripts/lib/import-pipeline.mjs`.
 *
 * 869f63gtp. It also writes `upstreamFiles`, the register of every file in upstream's
 * `common/data` - see `scripts/lib/upstream-file-register.mjs`. Which files are read comes from the
 * importer on every run; the listing of what upstream holds is fetched only with
 * `--refresh-upstream` (network) and otherwise reused from the committed document, so the check
 * stays offline.
 *
 * Run: npm run dataset:pipeline                      (write)
 *      npm run dataset:pipeline -- --check           (fail when it is stale, a data file has no
 *                                                     reader, or the upstream register disagrees)
 *      npm run dataset:pipeline -- --refresh-upstream (re-list upstream, then write)
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPORTER_PATH = path.join(APP_ROOT, 'scripts/import-optc-data.mjs');
const OUTPUT_PATH = path.join(APP_ROOT, 'docs/import-pipeline.json');

function readCommittedDocument() {
  try {
    return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function buildDocument({
  upstreamListing = readRecordedListing(readCommittedDocument()?.upstreamFiles),
} = {}) {
  return {
    ...buildImportPipelineDocument({ appRoot: APP_ROOT, importerPath: IMPORTER_PATH }),
    upstreamFiles: buildUpstreamFileRegister({
      importerSource: readFileSync(IMPORTER_PATH, 'utf8'),
      listing: upstreamListing,
    }),
  };
}

export function findUpstreamRegisterProblems(document) {
  return findUpstreamRegisterDisagreements({
    importerSource: readFileSync(IMPORTER_PATH, 'utf8'),
    register: document.upstreamFiles,
  });
}

/**
 * The live listing, read at one commit so the sizes and dates agree with each other. The commit
 * comes from the importer's own resolver, which the import itself uses.
 */
async function fetchRegisterListing() {
  const { dataImportSources, resolveSourceCommit } = await import('./import-optc-data.mjs');
  const source = dataImportSources['2shankz'];
  const commit = await resolveSourceCommit(source);
  const listing = await fetchUpstreamDataListing({
    repository: source.repository,
    ref: commit,
    withLastChange: true,
  });

  return { ...listing, commit, listedAt: new Date().toISOString().slice(0, 10) };
}

function serialize(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function main() {
  const check = process.argv.includes('--check');
  const refresh = process.argv.includes('--refresh-upstream');

  if (check && refresh) {
    console.error('[import-pipeline] --check never touches the network; run --refresh-upstream on its own.');
    process.exitCode = 1;

    return;
  }

  const upstreamListing = refresh
    ? await fetchRegisterListing()
    : readRecordedListing(readCommittedDocument()?.upstreamFiles);

  if (!upstreamListing) {
    console.error(
      '[import-pipeline] docs/import-pipeline.json records no upstream listing - run `npm run dataset:pipeline -- --refresh-upstream` once, with network.',
    );
    process.exitCode = 1;

    return;
  }

  const document = buildDocument({ upstreamListing });
  const unexplained = findUnexplainedDataFiles(document);

  if (unexplained.length) {
    console.error('[import-pipeline] a data file is read by nobody and explained by nothing:');

    for (const finding of unexplained) {
      console.error(`- [${finding.kind}] ${finding.name} - ${finding.detail}`);
    }

    process.exitCode = 1;

    return;
  }

  const disagreements = findUpstreamRegisterProblems(document);

  if (disagreements.length) {
    console.error('[import-pipeline] the upstream file register and the importer disagree:');

    for (const finding of disagreements) {
      console.error(`- [${finding.kind}] ${finding.name} - ${finding.detail}`);
    }

    process.exitCode = 1;

    return;
  }

  const next = serialize(document);
  const counts = Object.entries(document.upstreamFiles.statusCounts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');

  if (!check) {
    writeFileSync(OUTPUT_PATH, next, 'utf8');
    console.log(
      `[import-pipeline] wrote docs/import-pipeline.json (${document.stages.length} stages, ${document.dataFileCount} data files, ${document.upstreamFiles.fileCount} upstream files: ${counts}).`,
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
      `[import-pipeline] OK - ${document.stages.length} stages, ${document.dataFileCount} data files, ${document.readerlessDataFileCount} read by a person rather than by code; ${document.upstreamFiles.fileCount} upstream files: ${counts}.`,
    );

    return;
  }

  console.error(
    '[import-pipeline] docs/import-pipeline.json does not match the importer. It is GENERATED - run `npm run dataset:pipeline`.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { serialize };

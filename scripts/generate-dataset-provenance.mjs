#!/usr/bin/env node
/**
 * 869f127eg. Writes the provenance map from the importer, and checks it.
 *
 * `--check` compares instead of writing, and fails when a shipped column resolves to neither an
 * upstream field nor a declared derived transform - which is the rule the task asked for: a field
 * with no provenance fails.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { buildProvenance, formatProvenanceMarkdown } from './lib/dataset-provenance.mjs';
import { pathToFileURL } from 'node:url';

export const IMPORTER_PATH = 'scripts/import-optc-data.mjs';
export const DATASET_LIB_PATH = 'scripts/lib/optc-dataset.mjs';
export const PROVENANCE_JSON_PATH = 'docs/dataset-provenance.json';
export const SCHEMAS_DOC_PATH = 'docs/data-schemas.md';

const SECTION_START = '<!-- generated:dataset-provenance start -->';
const SECTION_END = '<!-- generated:dataset-provenance end -->';

export function readProvenance({ appRoot = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  return buildProvenance({
    importerSource: readFileSync(path.join(appRoot, IMPORTER_PATH), 'utf8'),
    datasetSource: readFileSync(path.join(appRoot, DATASET_LIB_PATH), 'utf8'),
    generatedAt,
  });
}

/** Everything but `generatedAt`, which changes every run and means nothing on its own. */
export function comparable(provenance) {
  const { generatedAt, ...rest } = provenance ?? {};

  return rest;
}

export function replaceGeneratedSection(markdown, section) {
  const start = markdown.indexOf(SECTION_START);
  const end = markdown.indexOf(SECTION_END);

  if (start === -1 || end === -1) {
    // Appended under its own heading the first time, so the document keeps its hand-written shape
    // above and the generated table stays clearly separated from it.
    return `${markdown.trimEnd()}\n\n## Dataset Provenance\n\n${section}\n`;
  }

  return `${markdown.slice(0, start)}${section}${markdown.slice(end + SECTION_END.length)}`;
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
  const provenance = readProvenance({ appRoot });
  const jsonPath = path.join(appRoot, PROVENANCE_JSON_PATH);
  const docPath = path.join(appRoot, SCHEMAS_DOC_PATH);
  const section = formatProvenanceMarkdown(provenance);

  if (provenance.unknownColumns.length > 0) {
    console.error(
      `[dataset:provenance] ${provenance.unknownColumns.length} shipped column(s) resolve to nothing: ${provenance.unknownColumns.join(', ')}`,
    );
    console.error(
      '[dataset:provenance] Every shipped column must come from an upstream field the importer reads,',
    );
    console.error(
      '[dataset:provenance] or be declared in DERIVED_COLUMNS with the transform that produces it.',
    );
    process.exit(1);
  }

  if (!check) {
    writeFileSync(jsonPath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
    writeFileSync(docPath, replaceGeneratedSection(readFileSync(docPath, 'utf8'), section), 'utf8');
    console.log(
      `[dataset:provenance] wrote ${PROVENANCE_JSON_PATH} and the generated section of ${SCHEMAS_DOC_PATH}: ${provenance.shippedColumns} shipped column(s), ${provenance.droppedBeforeShipping.length} read and dropped.`,
    );
    process.exit(0);
  }

  let committed;

  try {
    committed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (error) {
    console.error(`[dataset:provenance] ${PROVENANCE_JSON_PATH} could not be read (${error.message}).`);
    console.error('[dataset:provenance] Run `npm run dataset:provenance`.');
    process.exit(1);
  }

  if (JSON.stringify(comparable(committed)) !== JSON.stringify(comparable(provenance))) {
    console.error(`[dataset:provenance] ${PROVENANCE_JSON_PATH} is out of step with the importer.`);
    console.error('[dataset:provenance] Run `npm run dataset:provenance` and commit the result.');
    process.exit(1);
  }

  if (!readFileSync(docPath, 'utf8').includes(section)) {
    console.error(
      `[dataset:provenance] The generated section of ${SCHEMAS_DOC_PATH} is out of step with the importer.`,
    );
    console.error('[dataset:provenance] Run `npm run dataset:provenance` and commit the result.');
    process.exit(1);
  }

  console.log(
    `[dataset:provenance] ${provenance.shippedColumns} shipped column(s) all resolve; ${provenance.droppedBeforeShipping.length} upstream field(s) read and dropped.`,
  );
}

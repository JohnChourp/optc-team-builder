#!/usr/bin/env node
/**
 * 869f1328q. Writes the Saved Enemies vocabulary, and checks it.
 *
 * `--check` compares instead of writing, and fails when a catalogue mechanic has no declared
 * meaning, when a declared meaning outlives its mechanic, or when the checklist's own prose count
 * of unanswerable mechanics has drifted from the catalogue.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  buildEnemyMechanicVocabulary,
  findChecklistProseDrift,
  findVocabularyFailures,
} from './lib/enemy-mechanic-vocabulary.mjs';

export const DRAFT_UTILS_PATH = 'src/app/core/services/enemy-mechanic-draft.utils.ts';
export const CHECKLIST_UTILS_PATH =
  'src/app/core/services/auto-team-builder-mechanic-checklist.utils.ts';
export const VOCABULARY_JSON_PATH = 'docs/enemy-mechanic-vocabulary.json';

export function readVocabulary({ appRoot = process.cwd(), generatedAt = new Date().toISOString() } = {}) {
  return buildEnemyMechanicVocabulary({
    draftSource: readFileSync(path.join(appRoot, DRAFT_UTILS_PATH), 'utf8'),
    generatedAt,
  });
}

/** Everything but `generatedAt`, which changes every run and means nothing on its own. */
export function comparable(vocabulary) {
  const { generatedAt, ...rest } = vocabulary ?? {};

  return rest;
}

async function main() {
  const appRoot = process.cwd();
  const vocabulary = readVocabulary({ appRoot });
  const failures = [
    ...findVocabularyFailures(vocabulary),
    ...findChecklistProseDrift(
      readFileSync(path.join(appRoot, CHECKLIST_UTILS_PATH), 'utf8'),
      vocabulary,
    ),
  ];
  const targetPath = path.join(appRoot, VOCABULARY_JSON_PATH);

  if (process.argv.includes('--check')) {
    const existing = JSON.parse(readFileSync(targetPath, 'utf8'));

    if (JSON.stringify(comparable(existing)) !== JSON.stringify(comparable(vocabulary))) {
      console.error(
        `[enemy-vocabulary] ${VOCABULARY_JSON_PATH} is stale. Run \`npm run dataset:enemy-vocabulary\`.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    writeFileSync(targetPath, `${JSON.stringify(vocabulary, null, 2)}\n`, 'utf8');
    console.log(
      `[enemy-vocabulary] wrote ${VOCABULARY_JSON_PATH} (${vocabulary.mechanicCount} mechanics).`,
    );
  }

  if (failures.length) {
    console.error('[enemy-vocabulary] refused:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[enemy-vocabulary] OK - ${vocabulary.mechanicCount} mechanics, all with a declared meaning; ${vocabulary.constrainingCount} constrain the search and ${vocabulary.checklistOnlyCount} are reported by the checklist only.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}

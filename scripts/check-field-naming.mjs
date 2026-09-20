#!/usr/bin/env node
/**
 * 869f1328c. Fails a character-model name that claims a fact about the game while measuring our
 * own data, and fails the return of a name retired for exactly that reason.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  extractModelFieldNames,
  findRetiredNameReturns,
  findWorldClaimViolations,
} from './lib/field-naming.mjs';

export const MODEL_PATHS = [
  'src/app/core/models/optc.models.ts',
  'src/app/core/models/auto-team-builder-ability.models.ts',
];

export function readModelNames(appRoot = process.cwd()) {
  return MODEL_PATHS.flatMap((modelPath) =>
    extractModelFieldNames(readFileSync(path.join(appRoot, modelPath), 'utf8')),
  );
}

async function main() {
  const names = readModelNames();
  const failures = [...findWorldClaimViolations(names), ...findRetiredNameReturns(names)];

  if (failures.length) {
    console.error('[field-naming] refused:');
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[field-naming] OK - ${names.length} model names; no name claims a fact about the game that it does not measure.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}

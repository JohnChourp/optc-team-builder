#!/usr/bin/env node
/**
 * 869f127dh. Folds one browser run's failures into the committed flake ledger, so the second
 * occurrence of a failure is visible as the second occurrence instead of being re-derived by hand.
 *
 * Reads the SAME Playwright JSON report the failure summariser reads, and reuses its
 * `collectFailures` - including its normalized error signature - so there is one place that decides
 * when two failures are the same failure.
 *
 * It writes `e2e/flake-ledger.json` and nothing else. It never touches `e2e/quarantine.json`:
 * quarantine is a deliberate act, and a ledger that could quarantine on its own would hide the
 * regressions it exists to help tell apart from flakes.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { collectFailures } from './summarize-playwright-failures.mjs';
import {
  createEmptyFlakeLedger,
  formatFlakeLedgerSummary,
  mergeFlakeObservations,
  toFlakeObservation,
  validateFlakeLedger,
} from './lib/playwright-flake-ledger.mjs';

export const DEFAULT_LEDGER_PATH = 'e2e/flake-ledger.json';

async function collectJsonFiles(inputPath) {
  let entries;

  try {
    entries = await readdir(inputPath, { withFileTypes: true });
  } catch {
    return /\.json$/u.test(inputPath) ? [inputPath] : [];
  }

  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(inputPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(entryPath)));
    } else if (entry.isFile() && /\.json$/u.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export async function readLedger(ledgerPath) {
  try {
    const parsed = JSON.parse(await readFile(ledgerPath, 'utf8'));
    const { ok, errors, ledger } = validateFlakeLedger(parsed);

    if (!ok) {
      throw new Error(`${ledgerPath} is not a valid flake ledger:\n- ${errors.join('\n- ')}`);
    }

    return ledger;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return createEmptyFlakeLedger();
    }

    throw error;
  }
}

export async function recordPlaywrightFlakes({
  appRoot = process.cwd(),
  input = 'playwright-artifacts',
  ledgerPath = DEFAULT_LEDGER_PATH,
  runId = process.env.GITHUB_RUN_ID ?? null,
  at = new Date().toISOString(),
  dryRun = false,
} = {}) {
  const resolvedLedgerPath = path.isAbsolute(ledgerPath) ? ledgerPath : path.join(appRoot, ledgerPath);
  const ledger = await readLedger(resolvedLedgerPath);
  const reportFiles = await collectJsonFiles(path.isAbsolute(input) ? input : path.join(appRoot, input));
  const observations = [];

  for (const file of reportFiles) {
    let report;

    try {
      report = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      // A JSON file that is not a Playwright report is not an error here - artifact directories
      // collect several kinds - so it is skipped rather than failing a run that otherwise passed.
      continue;
    }

    for (const failure of collectFailures(report)) {
      observations.push(toFlakeObservation(failure, { runId, at }));
    }
  }

  const next = mergeFlakeObservations(ledger, observations);

  if (!dryRun) {
    await writeFile(resolvedLedgerPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  return { ledgerPath: resolvedLedgerPath, reportFiles, observations, ledger: next };
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--app-root') {
      options.appRoot = argv[index + 1];
      index += 1;
    } else if (arg === '--input') {
      options.input = argv[index + 1];
      index += 1;
    } else if (arg === '--ledger') {
      options.ledgerPath = argv[index + 1];
      index += 1;
    } else if (arg === '--run-id') {
      options.runId = argv[index + 1];
      index += 1;
    } else if (arg === '--at') {
      options.at = argv[index + 1];
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  recordPlaywrightFlakes(parseArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(
        `[flake-ledger] read ${result.reportFiles.length} report file(s), ${result.observations.length} failure(s).`,
      );
      console.log(formatFlakeLedgerSummary(result.ledger));
    })
    .catch((error) => {
      console.error(`[flake-ledger] ${error.message}`);
      process.exit(1);
    });
}

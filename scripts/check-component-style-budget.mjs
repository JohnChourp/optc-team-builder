#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * How close each component stylesheet is to the `anyComponentStyle` budget, and
 * how fast it got there.
 *
 * 869f135rr. The subtask said this was "the one budget in this repo actually
 * doing something", at **86% of its warning**, and would fire on a normal working
 * day with no context. Measured 2026-09-15 on v0.4.48, that is not the case, and
 * the reason is the same one that produced the wrong bundle budget in 869f135rq:
 * the number quoted is not the number the budget reads.
 *
 * `anyComponentStyle` measures the **compiled** stylesheet. The 10,344 bytes
 * quoted is the **source** of
 * `captain-coverage-result-badges-panel.component.scss`, 94 of whose 331 lines
 * are comments. Compiled, that file is **4,300 bytes - 35.8%** of the 12 kB
 * warning, and it is not even the largest: that is
 * `ability-tag-set-picker-set-panel.component.scss` at **5,790 bytes, 48.2%**.
 *
 * So nothing is near firing, the file named is not the problem, and "reduce it or
 * justify its size" had no defect under it. What the subtask asked for that DOES
 * stand is the third item: make approaching the threshold visible before it is
 * hit, rather than discovering it as an unexplained warning on an unrelated
 * change.
 *
 * Getting the real number needs Angular, not a re-implementation: a Sass compile
 * plus whatever minifier the CLI happens to use would produce a number that is
 * merely similar, which is how the last two wrong budgets happened. So this runs
 * the real production build with the `style-budget-probe` configuration - the
 * same build, with `anyComponentStyle` lowered to 1 kB so every stylesheet worth
 * knowing about reports its size - and reads Angular's own figures. Stylesheets
 * under 1 kB are 8% of the warning and are deliberately not tracked.
 *
 * Three failures:
 *
 *   A. a stylesheet reaches EARLY_WARNING_SHARE of the real budget. This is the
 *      early signal the subtask asked for: it fires at 70%, while there is still
 *      room to decide, instead of at 100% on somebody else's change.
 *   B. a stylesheet drifts more than DRIFT_TOLERANCE from its recorded size. That
 *      forces the baseline to be refreshed in the same commit, so growth appears
 *      as a reviewable diff - the trend, kept in git rather than in a parallel
 *      history store.
 *   C. a baseline entry names a stylesheet the build no longer reports, so the
 *      file cannot shrink below the probe threshold or vanish unnoticed.
 *
 * The budget itself is read from `angular.json` rather than copied here, because
 * a check that hardcodes the number it guards is the next thing to go stale.
 *
 * Run: npm run styles:component-budget [-- --write]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const BASELINE_PATH = path.join(HERE, 'data', 'component-style-budget-baseline.json');
const ANGULAR_JSON_PATH = path.join(REPO_ROOT, 'angular.json');

/** Fires while there is still room to decide, rather than at 100% on an unrelated change. */
export const EARLY_WARNING_SHARE = 0.7;

/** Large enough that ordinary edits stay quiet, small enough that real growth must be recorded. */
export const DRIFT_TOLERANCE = 0.15;

const BUDGET_LINE = /(src\/\S+\.scss) exceeded maximum budget\..*?with a total of ([\d.]+) (bytes|kB|MB)/u;

const UNIT_BYTES = { bytes: 1, kB: 1000, MB: 1000 * 1000 };

/**
 * Angular prints sizes already rounded to three significant figures, so a parsed
 * value is the reported number and not a byte count. That is why DRIFT_TOLERANCE
 * is a percentage and not an absolute byte delta.
 */
export function parseBudgetOutput(output) {
  const sizes = new Map();

  for (const line of String(output).split('\n')) {
    const match = BUDGET_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, file, total, unit] = match;
    sizes.set(file, Math.round(Number.parseFloat(total) * UNIT_BYTES[unit]));
  }

  return [...sizes.entries()]
    .map(([file, compiledBytes]) => ({ file, compiledBytes }))
    .sort((a, b) => b.compiledBytes - a.compiledBytes || a.file.localeCompare(b.file));
}

export function parseBudgetSize(value) {
  const match = /^([\d.]+)\s*(b|kb|mb)$/iu.exec(String(value).trim());
  if (!match) {
    throw new Error(`Unrecognised budget size: ${value}`);
  }
  const scale = { b: 1, kb: 1000, mb: 1000 * 1000 }[match[2].toLowerCase()];
  return Math.round(Number.parseFloat(match[1]) * scale);
}

export function readAnyComponentStyleBudget(angularJsonText) {
  const config = JSON.parse(angularJsonText);
  const budgets =
    config.projects?.['optc-team-builder']?.architect?.build?.configurations?.production?.budgets ?? [];
  const budget = budgets.find((entry) => entry.type === 'anyComponentStyle');

  if (!budget) {
    throw new Error('angular.json production configuration declares no anyComponentStyle budget.');
  }

  return {
    warningBytes: parseBudgetSize(budget.maximumWarning),
    errorBytes: parseBudgetSize(budget.maximumError),
  };
}

export function compareWithBaseline(measured, baseline, budget) {
  const recorded = new Map(baseline.stylesheets.map((entry) => [entry.file, entry]));
  const measuredFiles = new Set(measured.map((entry) => entry.file));

  const nearBudget = measured
    .filter((entry) => entry.compiledBytes >= budget.warningBytes * EARLY_WARNING_SHARE)
    .map((entry) => ({ ...entry, share: entry.compiledBytes / budget.warningBytes }));

  const drifted = [];
  for (const entry of measured) {
    const previous = recorded.get(entry.file);
    if (!previous) {
      drifted.push({ ...entry, recordedBytes: null });
      continue;
    }
    const change = Math.abs(entry.compiledBytes - previous.compiledBytes) / previous.compiledBytes;
    if (change > DRIFT_TOLERANCE) {
      drifted.push({ ...entry, recordedBytes: previous.compiledBytes });
    }
  }

  const missing = baseline.stylesheets.filter((entry) => !measuredFiles.has(entry.file));

  return { nearBudget, drifted, missing };
}

export function buildBaseline(measured, budget) {
  return {
    note: [
      'Compiled size of every component stylesheet over 1 kB. 869f135rr.',
      '',
      'Angular budgets the COMPILED stylesheet, not the source - the distinction that',
      'made this subtask report 86% for a file that is really at 35.8%. These are',
      "Angular's own figures, read from a production build with the",
      '`style-budget-probe` configuration, which is the production build with',
      '`anyComponentStyle` lowered so every stylesheet reports.',
      '',
      'This file is the trend. Growth shows up as a diff here, in git, rather than in a',
      'parallel history store. Refresh it with `npm run styles:component-budget -- --write`',
      'in the same commit as the change that moved a number.',
    ],
    measuredOn: new Date().toISOString().slice(0, 10),
    budget,
    earlyWarningShare: EARLY_WARNING_SHARE,
    driftTolerance: DRIFT_TOLERANCE,
    stylesheets: measured,
  };
}

function runProbeBuild() {
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxBin, ['ng', 'build', '--configuration', 'production,style-budget-probe'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      `Probe build failed with exit code ${result.status ?? 'unknown'}.\n${result.stderr ?? ''}`,
    );
  }

  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function parseArgs(argv) {
  const args = { write: false, fromLog: null };

  for (const arg of argv) {
    if (arg === '--write') {
      args.write = true;
    } else if (arg.startsWith('--from-log=')) {
      args.fromLog = arg.slice('--from-log='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const budget = readAnyComponentStyleBudget(readFileSync(ANGULAR_JSON_PATH, 'utf8'));
  const output = args.fromLog ? readFileSync(args.fromLog, 'utf8') : runProbeBuild();
  const measured = parseBudgetOutput(output);

  if (measured.length === 0) {
    process.stderr.write(
      'No component stylesheet sizes were reported. The style-budget-probe configuration is\n' +
        'missing from angular.json, or the build printed nothing - either way this check is\n' +
        'measuring nothing and must not report success.\nFAIL component style budget\n',
    );
    process.exitCode = 1;
    return;
  }

  if (args.write) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(buildBaseline(measured, budget), null, 2)}\n`);
    process.stdout.write(`[styles] wrote ${measured.length} stylesheet sizes to ${path.relative(REPO_ROOT, BASELINE_PATH)}.\n`);
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const { nearBudget, drifted, missing } = compareWithBaseline(measured, baseline, budget);
  const problems = [];

  if (nearBudget.length > 0) {
    problems.push(
      `${nearBudget.length} component stylesheet(s) are at or past ${Math.round(EARLY_WARNING_SHARE * 100)}% of the ` +
        `${budget.warningBytes.toLocaleString('en-US')}-byte warning budget.\n` +
        `This is the early signal, not the Angular warning - there is still room to decide.\n` +
        nearBudget
          .map((e) => `  ${e.file}: ${e.compiledBytes.toLocaleString('en-US')} bytes, ${(e.share * 100).toFixed(1)}%`)
          .join('\n'),
    );
  }

  if (drifted.length > 0) {
    problems.push(
      `${drifted.length} component stylesheet(s) moved more than ${Math.round(DRIFT_TOLERANCE * 100)}% from the recorded size.\n` +
        `Refresh the baseline in this commit so the growth is a reviewable diff:\n` +
        `  npm run styles:component-budget -- --write\n` +
        drifted
          .map(
            (e) =>
              `  ${e.file}: ${e.recordedBytes === null ? 'new' : `${e.recordedBytes.toLocaleString('en-US')} ->`} ${e.compiledBytes.toLocaleString('en-US')} bytes`,
          )
          .join('\n'),
    );
  }

  if (missing.length > 0) {
    problems.push(
      `${missing.length} recorded stylesheet(s) were not reported by the build. Refresh the baseline.\n` +
        missing.map((e) => `  ${e.file}`).join('\n'),
    );
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      process.stderr.write(`${problem}\n\n`);
    }
    process.stderr.write('FAIL component style budget\n');
    process.exitCode = 1;
    return;
  }

  const largest = measured[0];
  process.stdout.write(
    `OK component style budget: ${measured.length} stylesheet(s) tracked, largest ` +
      `${largest.file.split('/').pop()} at ${largest.compiledBytes.toLocaleString('en-US')} bytes ` +
      `(${((largest.compiledBytes / budget.warningBytes) * 100).toFixed(1)}% of warning).\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

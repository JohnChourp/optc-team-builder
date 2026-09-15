#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { SCRIPT_SUITES } from './ci-check-routing.mjs';
import { NPM_SCRIPT_REGISTRY } from './npm-script-registry.mjs';

/**
 * Every npm script, what runs it, and therefore what breaks without it.
 *
 * 869f17h73. There are 138 scripts and no way to tell what any given one is for,
 * who calls it, or whether it still matters. The subtask asks for four columns:
 * name, purpose, caller, and what breaks.
 *
 * Three of those are derivable and one is not, and the difference decides the
 * shape of this file. The caller is readable from the repository; "what breaks"
 * follows from the caller, because a script that IS a lane's command breaks that
 * lane and nothing else. Purpose is the odd one out: 138 hand-written purpose
 * lines would mostly restate the command - `test:ci-routing` "runs the CI routing
 * tests" tells a reader nothing they could not see - and would rot the moment a
 * command changed.
 *
 * So the table is generated, and authored prose appears only where it already
 * earns its place: the entries in `npm-script-registry.mjs`, which exist to
 * explain the scripts that LOOK orphaned and are not. That is the same split the
 * style-panel and component inventories use.
 *
 * Enforced:
 *
 *   A. the table matches package.json - a new script without a row fails, which
 *      is the subtask's done-condition;
 *   B. every script resolves to a caller kind, so "nobody calls this" is a
 *      classification rather than a gap in the check;
 *   C. every lane in SCRIPT_SUITES points at a script that exists, so the source
 *      of the CI matrix cannot name something package.json dropped.
 *
 * Run: npm run scripts:inventory
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DOC_PATH = 'docs/npm-script-inventory.md';
export const TABLE_START = '<!-- npm-script-inventory:start -->';
export const TABLE_END = '<!-- npm-script-inventory:end -->';

/** Files that describe scripts rather than running them. */
const MECHANISM_FILES = new Set([
  'package.json',
  'package-lock.json',
  'scripts/npm-script-registry.mjs',
  'scripts/check-npm-script-references.mjs',
  'scripts/check-npm-script-references.spec.ts',
  'scripts/check-npm-script-inventory.mjs',
  'scripts/check-npm-script-inventory.spec.ts',
  DOC_PATH,
]);

export function listFiles(root = projectRoot) {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !MECHANISM_FILES.has(file));
}

export function readAll(files, root = projectRoot) {
  const sources = new Map();

  for (const file of files) {
    try {
      sources.set(file, readFileSync(path.join(root, file), 'utf8'));
    } catch {
      /* unreadable files call nothing */
    }
  }

  return sources;
}

/**
 * How a script is reached, in the order that decides what breaks without it.
 *
 * A lane is checked first because it is the strongest answer: the lane is both
 * the caller and the thing that breaks. A workflow is next, then another script,
 * then documentation - a runbook naming a script is a real reference, and it is
 * the one kind where "what breaks" is a human following a doc.
 */
export function classify({ name, scripts, sources, lanes, registered }) {
  const lane = lanes.find(([, suite]) => suite.command.includes(name));

  if (lane) {
    return { kind: 'lane', detail: lane[0], breaks: `the \`${lane[0]}\` lane` };
  }

  const workflows = [...sources.entries()]
    .filter(([file, contents]) => file.startsWith('.github/workflows/') && contents.includes(name))
    .map(([file]) => path.basename(file));

  if (workflows.length) {
    return {
      kind: 'workflow',
      detail: workflows.join(', '),
      breaks: `the ${workflows.join(', ')} workflow`,
    };
  }

  const callers = Object.keys(scripts).filter(
    (other) => other !== name && scripts[other].includes(name),
  );

  if (callers.length) {
    return {
      kind: 'npm script',
      detail: callers.join(', '),
      breaks: `\`${callers.join('`, `')}\``,
    };
  }

  /*
   * A plain script file is a caller too. `verify-local.mjs` composes lane commands
   * and `run-playwright-e2e.mjs` is reached the same way, so a script invoked only
   * from one of these is wired - it is just wired in JavaScript rather than in
   * package.json. Leaving this out classified such a script as `unclassified`,
   * which would have demanded a registry entry for something that genuinely runs.
   */
  const scriptFiles = [...sources.entries()]
    .filter(
      ([file, contents]) =>
        file.startsWith('scripts/') &&
        /\.(?:mjs|js|ts)$/u.test(file) &&
        contents.includes(name),
    )
    .map(([file]) => path.basename(file));

  if (scriptFiles.length) {
    return {
      kind: 'script file',
      detail: scriptFiles.join(', '),
      breaks: `whatever ${scriptFiles.join(', ')} drives`,
    };
  }

  const docs = [...sources.entries()]
    .filter(([file, contents]) => file.endsWith('.md') && contents.includes(name))
    .map(([file]) => file);

  if (docs.length) {
    return {
      kind: 'documented',
      detail: docs.map((file) => path.basename(file)).join(', '),
      breaks: 'a documented manual step',
    };
  }

  const entry = registered.get(name);

  if (entry) {
    return { kind: entry.class, detail: '—', breaks: entry.reason };
  }

  return { kind: 'unclassified', detail: '—', breaks: 'unknown' };
}

export function buildInventory({ scripts, sources, suites = SCRIPT_SUITES, registry = NPM_SCRIPT_REGISTRY }) {
  const lanes = Object.entries(suites);
  const registered = new Map(registry.map((entry) => [entry.script, entry]));

  const rows = Object.keys(scripts)
    .sort()
    .map((name) => ({
      name,
      ...classify({ name, scripts, sources, lanes, registered }),
    }));

  const counts = {};

  for (const row of rows) {
    counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  }

  return { rows, counts, total: rows.length };
}

export function renderTable({ rows }) {
  return [
    '| Script | Reached by | What breaks without it |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| \`${row.name}\` | ${row.kind} · ${row.detail} | ${row.breaks} |`),
  ].join('\n');
}

export function checkNpmScriptInventory({ scripts, sources, doc, suites = SCRIPT_SUITES, registry }) {
  const errors = [];
  const inventory = buildInventory({ scripts, sources, suites, ...(registry ? { registry } : {}) });

  /* B. */
  for (const row of inventory.rows) {
    if (row.kind === 'unclassified') {
      errors.push(
        `${row.name} resolves to no caller and has no registry entry. Wire it, or register it in npm-script-registry.mjs with a reason.`,
      );
    }
  }

  /* C. */
  for (const [id, suite] of Object.entries(suites)) {
    const named = Object.keys(scripts).some((name) => suite.command.includes(name));

    if (!named) {
      errors.push(`The \`${id}\` lane runs \`${suite.command}\`, which names no script package.json has.`);
    }
  }

  /* A. */
  const start = doc.indexOf(TABLE_START);
  const end = doc.indexOf(TABLE_END);

  if (start === -1 || end === -1) {
    errors.push(`${DOC_PATH} is missing the generated-table markers.`);

    return { errors, inventory };
  }

  if (doc.slice(start + TABLE_START.length, end).trim() !== renderTable(inventory)) {
    errors.push(
      `${DOC_PATH} is out of date. Regenerate it with \`npm run scripts:inventory -- --write\`.`,
    );
  }

  return { errors, inventory };
}

function main() {
  const scripts = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).scripts;
  const sources = readAll(listFiles());
  const docPath = path.join(projectRoot, DOC_PATH);
  const doc = readFileSync(docPath, 'utf8');

  if (process.argv.includes('--write')) {
    const inventory = buildInventory({ scripts, sources });
    const start = doc.indexOf(TABLE_START);
    const end = doc.indexOf(TABLE_END);

    writeFileSync(
      docPath,
      `${doc.slice(0, start + TABLE_START.length)}\n${renderTable(inventory)}\n${doc.slice(end)}`,
    );
    console.log(`[scripts] wrote ${inventory.total} rows to ${DOC_PATH}.`);

    return;
  }

  const { errors, inventory } = checkNpmScriptInventory({ scripts, sources, doc });

  if (errors.length) {
    console.error('npm script inventory check failed:\n');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const summary = Object.entries(inventory.counts)
    .sort(([, left], [, right]) => right - left)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');

  console.log(`[scripts] ${inventory.total} scripts: ${summary}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

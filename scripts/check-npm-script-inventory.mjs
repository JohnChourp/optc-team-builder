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
 *      of the CI matrix cannot name something package.json dropped;
 *   D. every `test:<id>` script IS a lane, so a guard that is merely mentioned
 *      somewhere cannot ship green and never run.
 *
 * 869f135tn. C and D are the two directions of one claim, and until this task
 * only one of them existed - while the doc said both did.
 *
 * C could not fail. It asked whether the lane's command CONTAINS any of the 161
 * script names as a substring, and two of those names are `ng` and `test`: every
 * lane command is `npm run <something>`, every one of them contains `test`
 * somewhere, and several contain `ng`. Deleting a lane's real script left it
 * green. It now extracts the `npm run <name>` tokens and matches them exactly.
 *
 * The same substring bug sat in `classify`'s lane branch, where it mis-attributed
 * callers rather than failing to fail.
 *
 * D is new and is the direction the subtask actually names. 56 of the 57 suites
 * map 1:1 onto a `test:<id>` script; 8 `test:` scripts are deliberately not
 * lanes and are allowlisted below with the reason. Without D, adding
 * `test:my-new-guard` to package.json and forgetting the SCRIPT_SUITES entry
 * produces a guard nobody ever runs - and every existing check stays green,
 * because the script IS classified: something references it.
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

/**
 * The npm scripts a lane command actually invokes.
 *
 * 869f135tn. `command.includes(name)` is not this, and the difference is the
 * whole of check C: `test` and `ng` are real script names, so the substring test
 * matched every lane command that had ever been written.
 *
 * 56 of the 57 commands are a bare `npm run <name>`; the 57th (`source-data`)
 * runs an inline `npx vitest ...` and then `npm run dataset:spec-pins`, which is
 * why this returns every occurrence rather than the first.
 */
export function extractInvokedScriptNames(command) {
  return [...String(command).matchAll(/npm run ([\w:@./-]+)/gu)].map((match) => match[1]);
}

/**
 * `test:` scripts that are deliberately NOT lanes, each with the reason.
 *
 * 869f135tn. Measured 2026-09-16: these 8 are exactly the `test:` scripts with no
 * SCRIPT_SUITES entry of the same id, and every one of them is intentional. The
 * allowlist is small and each row must stay justifiable - it is the escape hatch
 * for check D, so a row added to silence a failure is the failure.
 */
/**
 * Whether a file names this script as a script, rather than merely containing its
 * letters.
 *
 * 869f135tn. The same substring bug that made check C unfailable also made the
 * caller column wrong, and more visibly: `ng` is a real script name, so
 * `contents.includes('ng')` matched the word "running" and the generated table
 * published `ng` as reached by eleven workflows.
 *
 * The boundary is `[\w:@./-]`, not `\b`, because script names contain colons and
 * dots - a plain word boundary would let `test:e2e` match inside
 * `test:e2e:chromium`, which is a different script with a different lane.
 *
 * Deliberately NOT narrowed to `npm run <name>`. A bare mention is a real
 * reference here: workflows reach lanes through `${{ matrix.suite }}`
 * interpolation, and a runbook naming a script is exactly the `documented` kind.
 * Requiring the prefix was measured to strand six scripts as unclassified,
 * including `test:e2e`, which genuinely runs.
 */
export function mentionsScript(text, name) {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

  return new RegExp(String.raw`(?<![\w:@./-])${escaped}(?![\w:@./-])`, 'u').test(text);
}

export const NON_LANE_TEST_SCRIPTS = new Map([
  ['test:ci', 'The aggregate that runs the lanes. Making it a lane would nest the matrix inside itself.'],
  ['test:e2e', 'Browser e2e. Runs in verify:local:full, not in the script-lane matrix.'],
  ['test:e2e:install', 'Installs Playwright browsers. Setup, not a suite.'],
  ['test:e2e:chromium', 'One browser projection of test:e2e.'],
  ['test:e2e:firefox', 'One browser projection of test:e2e.'],
  ['test:e2e:webkit', 'One browser projection of test:e2e.'],
  ['test:public-entry-visual', 'Visual check on a scheduled workflow, not a verify:local lane.'],
  ['test:post-merge-smoke', 'Runs after a merge against the deployed site, on its own workflow.'],
  [
    'test:drive-sync-server',
    'FROZEN, not deleted (869f13c92, owner 2026-09-19). The Drive-sync backend is out of the default '
      + 'checks, so this is no longer a lane - but server/ stays in the repository and this suite still '
      + 'passes. Run it by hand when you touch server/. Thawing means restoring the drive-sync-server '
      + 'entry in SCRIPT_SUITES, both test.yml lists and the routing spec, and removing this row.',
  ],
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
  /*
   * 869f33bru. npm itself runs a lifecycle script, which is a stronger answer than any file that
   * merely mentions the word: `prepare` appears in the hook installer's comment and in the spec that
   * asserts it is wired, and neither of those RUNS it. `check-npm-script-references.mjs` accepts
   * this class only for npm's own lifecycle names, so it cannot be used to hide an ordinary script.
   */
  if (registered.get(name)?.class === 'lifecycle') {
    const entry = registered.get(name);
    return { kind: 'lifecycle', detail: 'npm', breaks: entry.reason };
  }

  const lane = lanes.find(([, suite]) => extractInvokedScriptNames(suite.command).includes(name));

  if (lane) {
    return { kind: 'lane', detail: lane[0], breaks: `the \`${lane[0]}\` lane` };
  }

  const workflows = [...sources.entries()]
    .filter(([file, contents]) => file.startsWith('.github/workflows/') && mentionsScript(contents, name))
    .map(([file]) => path.basename(file));

  if (workflows.length) {
    return {
      kind: 'workflow',
      detail: workflows.join(', '),
      breaks: `the ${workflows.join(', ')} workflow`,
    };
  }

  const callers = Object.keys(scripts).filter(
    (other) => other !== name && mentionsScript(scripts[other], name),
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
        mentionsScript(contents, name),
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
    .filter(([file, contents]) => file.endsWith('.md') && mentionsScript(contents, name))
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
    const invoked = extractInvokedScriptNames(suite.command);

    if (!invoked.length) {
      errors.push(
        `The \`${id}\` lane runs \`${suite.command}\`, which invokes no npm script at all, so package.json cannot own it.`,
      );
      continue;
    }

    for (const name of invoked) {
      if (!Object.hasOwn(scripts, name)) {
        errors.push(
          `The \`${id}\` lane runs \`npm run ${name}\`, which package.json does not have.`,
        );
      }
    }
  }

  /* D. */
  for (const name of Object.keys(scripts)) {
    if (!name.startsWith('test:') || NON_LANE_TEST_SCRIPTS.has(name)) {
      continue;
    }

    const laneId = name.slice('test:'.length);

    if (!Object.hasOwn(suites, laneId)) {
      errors.push(
        `\`${name}\` is not the \`${laneId}\` lane in SCRIPT_SUITES, so it never runs in verify:local. Add the lane, or add it to NON_LANE_TEST_SCRIPTS with the reason.`,
      );
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

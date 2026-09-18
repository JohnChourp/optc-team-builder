#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { NPM_SCRIPT_REGISTRY } from './npm-script-registry.mjs';

/**
 * Every npm script is either referenced, or registered with a falsifiable reason.
 *
 * 869f17h48. The naive version of this check - grep for the script name, fail on
 * zero - is the one that produced the wrong answer this guard exists to prevent.
 * `test:e2e:webkit` has zero literal references and runs on every
 * `verify:local:full`, because verify-local.mjs writes
 * `npm run test:e2e:${browser}`. A guard built on literal counting would have
 * made that mistake permanent and enforced.
 *
 * So a script counts as referenced when any of these holds:
 *
 *   1. its name appears literally in a tracked file other than package.json;
 *   2. another npm script's body contains it;
 *   3. a tracked file interpolates a prefix of it, e.g. `npm run test:e2e:${x}`.
 *
 * Anything left must be in `npm-script-registry.mjs`, and the entry has to earn
 * its place. Failure modes:
 *
 *   A. a script is neither referenced nor registered - a new orphan, which is
 *      the case this guard is for;
 *   B. the registry names a script that no longer exists in package.json;
 *   C. an `interpolated` entry names an `invokedBy` file that does not exist, or
 *      that does not actually interpolate a prefix of the script - without this
 *      the annotation is a rubber stamp and the guard proves nothing;
 *   D. an entry is registered but the script IS now referenced, so the entry is
 *      stale and hides a real reference behind a manual label;
 *   E. an entry carries no substantive reason, or an `unwired` entry names no
 *      owning task - "should run and does not" is a finding, and a finding
 *      without an owner is how it stops being one.
 *
 * Run: npm run scripts:references
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A prefix ending in `${`, e.g. `npm run test:e2e:` from `npm run test:e2e:${browser}`. */
const INTERPOLATED_RUN = /npm run ([a-z0-9:_-]*)\$\{/gu;

const MIN_REASON_LENGTH = 20;

/**
 * 869f33bru. The names npm itself runs during install, pack, publish and version. A `lifecycle`
 * registry entry is legitimate for one of these and for nothing else.
 */
export const NPM_LIFECYCLE_SCRIPTS = Object.freeze([
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'prepack',
  'postpack',
  'prepublishOnly',
  'preversion',
  'version',
  'postversion',
  'dependencies',
]);

/**
 * Files that name scripts without calling them, so counting them as references
 * would make this check contradict itself.
 *
 * `package.json` holds the definitions. The registry describes the very scripts
 * it registers - left in, every `manual` entry reported itself as referenced by
 * its own entry and demanded its own removal. That did not appear until the
 * registry was committed, because `git ls-files` cannot see an untracked file:
 * the check passed while the file was new and failed on the next run.
 *
 * The spec is here for the same reason - its fixtures are script names as data -
 * and so is this file, whose comments name scripts to explain the classes. All
 * four describe scripts; none of them runs one.
 *
 * Nothing else is excluded. A doc naming a script still counts as a reference for
 * the orphan clause, because a runbook knowing about a script is exactly what
 * stops it being orphaned; it just does not count as an INVOCATION - see clause D.
 */
const MECHANISM_FILES = new Set([
  'package.json',
  'package-lock.json',
  'scripts/npm-script-registry.mjs',
  'scripts/check-npm-script-references.mjs',
  'scripts/check-npm-script-references.spec.ts',
  /*
   * 869f17h73. The generated inventory lists EVERY script, so leaving it in would
   * make the orphan clause vacuous - every script would be "known" by the table
   * that exists to describe them. Measured: with it included, un-wiring
   * `dataset:spec-pins` left this check green.
   */
  'docs/npm-script-inventory.md',
  'scripts/check-npm-script-inventory.mjs',
  'scripts/check-npm-script-inventory.spec.ts',
]);

export function collectTrackedFiles(root = projectRoot) {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !MECHANISM_FILES.has(file));
}

/**
 * Prefixes some tracked file builds a script name from. An empty prefix (`npm run
 * ${suite}`) would match every script, so it is deliberately ignored: it proves
 * nothing about any particular script.
 */
export function collectInterpolatedPrefixes(sources) {
  const prefixes = new Set();

  for (const contents of sources.values()) {
    for (const match of contents.matchAll(INTERPOLATED_RUN)) {
      if (match[1]) {
        prefixes.add(match[1]);
      }
    }
  }

  return prefixes;
}

/**
 * The file a script's own command points at.
 *
 * `dataset:spec-pins` is `node ./scripts/check-dataset-spec-pins.mjs`, and that
 * file's docblock ends with `Run: npm run dataset:spec-pins`. Counting that as a
 * reference makes every well-documented checker its own caller - which is how two
 * genuinely unwired scripts passed this check until the inventory in 869f17h73
 * classified them from the other direction.
 *
 * Same shape as the registry and this guard being in MECHANISM_FILES: a file that
 * NAMES a script is not a file that RUNS it.
 */
export function ownImplementation(command) {
  return command.match(/(?:^|\s)\.?\/?(scripts\/[\w./-]+\.(?:mjs|js|ts|sh))/u)?.[1] ?? null;
}

export function analyse({ scripts, sources }) {
  const names = Object.keys(scripts);
  /*
   * Decided here rather than only at collection time, so the exclusion holds
   * however the sources were gathered - the bug it fixes was invisible for
   * exactly as long as the registry happened to be untracked.
   */
  const callers = new Map(
    [...sources.entries()].filter(([file]) => !MECHANISM_FILES.has(file)),
  );
  const prefixes = collectInterpolatedPrefixes(callers);
  const status = new Map();

  for (const name of names) {
    const own = ownImplementation(scripts[name]);
    const literalIn = [...callers.entries()]
      .filter(([file, contents]) => contents.includes(name) && file !== own)
      .map(([file]) => file);
    const calledBy = names.filter((other) => other !== name && scripts[other].includes(name));
    const viaPrefix = [...prefixes].filter((prefix) => name.startsWith(prefix));

    /* Prose can name a script; only these can run one. */
    const invokedIn = literalIn.filter((file) => !file.toLowerCase().endsWith('.md'));

    status.set(name, {
      referenced: literalIn.length > 0 || calledBy.length > 0 || viaPrefix.length > 0,
      invoked: invokedIn.length > 0 || calledBy.length > 0 || viaPrefix.length > 0,
      literalIn: invokedIn,
      calledBy,
      viaPrefix,
    });
  }

  return { names, prefixes, status };
}

export function checkNpmScriptReferences({ scripts, sources, registry = NPM_SCRIPT_REGISTRY }) {
  const errors = [];
  const { names, status } = analyse({ scripts, sources });
  const registered = new Map(registry.map((entry) => [entry.script, entry]));

  for (const entry of registry) {
    /* B. The registry describes package.json, so it cannot outlive it. */
    if (!Object.hasOwn(scripts, entry.script)) {
      errors.push(
        `${entry.script} is registered in npm-script-registry.mjs but no longer exists in package.json. Remove the entry.`,
      );
      continue;
    }

    /* E. An entry with no reason is an entry that explains nothing. */
    if (!entry.reason || entry.reason.trim().length < MIN_REASON_LENGTH) {
      errors.push(`${entry.script} needs a substantive reason in npm-script-registry.mjs.`);
    }

    if (entry.class === 'lifecycle' && !NPM_LIFECYCLE_SCRIPTS.includes(entry.script)) {
      errors.push(
        `${entry.script} is registered as lifecycle, but npm never runs a script by that name. Only npm's own lifecycle names qualify.`,
      );
    }

    if (entry.class === 'unwired' && !entry.owner) {
      errors.push(
        `${entry.script} is registered as unwired, which is a finding, so it needs an \`owner\` task id.`,
      );
    }

    const state = status.get(entry.script);

    /*
     * D. A real reference behind a `manual` label hides the reference, and an
     * `unwired` entry that has since been wired is a finding someone fixed. Both
     * are stale, and the entry has to go rather than outlive what it described.
     *
     * Documentation is excluded here and only here, because the two clauses ask
     * different questions. Clause A asks whether anything KNOWS about the script,
     * and a runbook naming it is a perfectly good answer. This clause asks whether
     * automation INVOKES it, and prose never does. Counting both the same way made
     * `docs/ios-platform-footprint.md` - an inventory written precisely to explain
     * why `ios:open` is unreferenced - demand the deletion of the entry that says
     * the same thing.
     */
    if ((entry.class === 'manual' || entry.class === 'unwired') && state.invoked) {
      errors.push(
        `${entry.script} is registered as ${entry.class} but is invoked by ${describeReferences(state)}. Remove the entry.`,
      );
    }

    /* C. The half that makes an interpolated claim falsifiable. */
    if (entry.class === 'interpolated') {
      for (const file of entry.invokedBy ?? []) {
        const contents = sources.get(file);

        if (contents === undefined) {
          errors.push(
            `${entry.script} claims to be invoked by ${file}, which is not a tracked file.`,
          );
          continue;
        }

        if (!buildsName(contents, entry.script)) {
          errors.push(
            `${entry.script} claims to be invoked by ${file}, but that file neither names it nor interpolates a prefix of it.`,
          );
        }
      }

      if (!(entry.invokedBy ?? []).length) {
        errors.push(`${entry.script} is registered as interpolated but names no \`invokedBy\` file.`);
      }
    }
  }

  /* A. The case this guard is for. */
  for (const name of names) {
    if (!status.get(name).referenced && !registered.has(name)) {
      errors.push(
        `${name} is called by nothing and is not in npm-script-registry.mjs. Wire it, or register it as manual, interpolated or unwired with a reason.`,
      );
    }
  }

  return { errors };
}

/**
 * Does this file build the script's name - literally, or by interpolating a
 * prefix of it?
 *
 * Deliberately strict, and it did not start that way. The first version also
 * accepted the name's last segment appearing anywhere in the file, to cover a
 * workflow passing `${{ matrix.browser }}` to a runner. Mutation-tested against
 * the real tree: rewriting verify-local.mjs's ``npm run test:e2e:${browser}``
 * into a fixed `chromium` string left the guard green, because the word
 * `webkit` still sat in the browser array beside it. That is the annotation
 * becoming unfalsifiable - the one thing this entry class exists to prevent.
 *
 * A workflow that runs `node ./scripts/run-playwright-e2e.mjs --e2e-project=x`
 * does not invoke the npm script at all; it invokes what the npm script wraps.
 * That belongs in the entry's prose, not in `invokedBy`.
 */
function buildsName(contents, script) {
  if (contents.includes(script)) {
    return true;
  }

  for (const match of contents.matchAll(INTERPOLATED_RUN)) {
    if (match[1] && script.startsWith(match[1])) {
      return true;
    }
  }

  return false;
}

function describeReferences({ literalIn, calledBy, viaPrefix }) {
  const parts = [];

  if (literalIn.length) {
    parts.push(literalIn.slice(0, 3).join(', '));
  }

  if (calledBy.length) {
    parts.push(`npm script(s) ${calledBy.join(', ')}`);
  }

  if (viaPrefix.length) {
    parts.push(`interpolated prefix(es) ${viaPrefix.join(', ')}`);
  }

  return parts.join('; ');
}

export function readSources(files, root = projectRoot) {
  const sources = new Map();

  for (const file of files) {
    const absolute = path.join(root, file);

    if (!existsSync(absolute)) {
      continue;
    }

    try {
      sources.set(file, readFileSync(absolute, 'utf8'));
    } catch {
      /* A binary or unreadable file cannot reference a script name. */
    }
  }

  return sources;
}

function main() {
  const scripts = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).scripts;
  const sources = readSources(collectTrackedFiles());
  const { errors } = checkNpmScriptReferences({ scripts, sources });

  if (errors.length) {
    console.error('npm script reference check failed:\n');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    console.error(`\n${errors.length} problem(s). See scripts/npm-script-registry.mjs.`);
    process.exit(1);
  }

  const registered = NPM_SCRIPT_REGISTRY.length;

  console.log(
    `npm script reference check passed: ${Object.keys(scripts).length} scripts, ${registered} registered (${countClass('interpolated')} interpolated, ${countClass('manual')} manual, ${countClass('unwired')} unwired, ${countClass('lifecycle')} lifecycle).`,
  );
}

function countClass(kind) {
  return NPM_SCRIPT_REGISTRY.filter((entry) => entry.class === kind).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ENGINE_LADDER, PLATFORM_LADDER, SUPPORT_LEVELS } from './support-ladder.mjs';

/**
 * A support level is a claim, and this holds each one to the automation.
 *
 * 869f17h7w / 869f17h7a. The levels are defined by CADENCE precisely so they can
 * be checked: `verified` means something runs with no human involved, which is
 * readable from the workflow files.
 *
 *   A. every Playwright project has a level, and every levelled engine is a real
 *      project - a configured-but-unlevelled engine is the gap this lane is for;
 *   B. a `verified` engine names at least one workflow that runs unattended, and
 *      every named workflow really installs it;
 *   C. a `supported` engine names none - claiming less than the automation does
 *      is drift too, and it is how "all three are tested automatically" was
 *      written on a player-facing screen while only Chromium was;
 *   D. every platform level is one of the four, and its evidence path exists;
 *   E. the player-facing screen's engine claims are exactly the engines on this
 *      ladder, so what players are told cannot drift from what we promise.
 *
 * Run: npm run platforms:support-ladder
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PLAYWRIGHT_PATH = 'playwright.config.ts';
export const SUPPORTED_DATA_PATH = 'src/app/pages/supported/supported.data.ts';
export const DOC_PATH = 'docs/platform-support-ladder.md';

/** A workflow runs an engine unattended only if it installs it. */
export function installsEngine(workflow, engine) {
  return new RegExp(`playwright install[^\\n]*\\b${engine}\\b`, 'u').test(workflow);
}

export function parsePlaywrightProjects(config) {
  return [...config.slice(config.indexOf('projects:')).matchAll(/name: '([a-z]+)'/gu)].map(
    (match) => match[1],
  );
}

export function parseClaimedEngines(source) {
  const match = source.match(/TESTED_BROWSER_ENGINES = \[([\s\S]*?)\]/u);

  return match ? [...match[1].matchAll(/'([^']+)'/gu)].map((entry) => entry[1]) : [];
}

/** Words that promise a cadence, in both languages the screen ships. */
const CADENCE_CLAIM =
  /every release|automatically|on a schedule|κάθε έκδοση|αυτόματα|προγραμματισμένα/iu;

export function checkSupportLadder({
  projects,
  workflows,
  claimedEngines,
  browserCopy = {},
  engines = ENGINE_LADDER,
  platforms = PLATFORM_LADDER,
  fileExists = (relative) => existsSync(path.join(projectRoot, relative)),
}) {
  const errors = [];
  const levelled = new Set(engines.map((entry) => entry.engine));

  /* A. */
  for (const project of projects) {
    if (!levelled.has(project)) {
      errors.push(
        `${PLAYWRIGHT_PATH} configures the project '${project}', which has no level on the support ladder. Give it one, or stop configuring it.`,
      );
    }
  }

  for (const entry of engines) {
    if (!projects.includes(entry.engine)) {
      errors.push(
        `The ladder levels '${entry.engine}', which ${PLAYWRIGHT_PATH} no longer configures.`,
      );
    }

    if (!SUPPORT_LEVELS.includes(entry.level)) {
      errors.push(`${entry.engine} has the level '${entry.level}', which is not on the ladder.`);
    }

    const unattended = entry.unattendedIn ?? [];

    /* B. */
    if (entry.level === 'verified') {
      if (!unattended.length) {
        errors.push(
          `${entry.engine} is claimed as verified but names no workflow that runs it unattended. Verified means nobody has to press anything.`,
        );
      }

      for (const file of unattended) {
        const contents = workflows.get(file);

        if (contents === undefined) {
          errors.push(`${entry.engine} names ${file}, which is not a tracked workflow.`);
          continue;
        }

        if (!installsEngine(contents, entry.engine)) {
          errors.push(
            `${entry.engine} is claimed as verified through ${file}, but that workflow never installs it.`,
          );
        }
      }
    }

    /* C. Under-claiming is drift too. */
    if (entry.level === 'supported') {
      for (const [file, contents] of workflows) {
        if (installsEngine(contents, entry.engine)) {
          errors.push(
            `${entry.engine} is only claimed as supported, but ${file} installs it unattended. Raise it to verified.`,
          );
        }
      }
    }
  }

  /* D. */
  for (const entry of platforms) {
    if (!SUPPORT_LEVELS.includes(entry.level)) {
      errors.push(`${entry.platform} has the level '${entry.level}', which is not on the ladder.`);
    }

    if (!entry.evidence || !fileExists(entry.evidence)) {
      errors.push(
        `${entry.platform} rests on '${entry.evidence}', which does not exist. A level cannot outlive its evidence.`,
      );
    }

    if (!entry.meaning || entry.meaning.trim().length < 40) {
      errors.push(`${entry.platform} needs a substantive meaning, not a label.`);
    }
  }

  /*
   * F. The defect this clause was written after.
   *
   * The screen shipped "Every release is tested automatically on all three major
   * browser engines" in v0.4.40. Only Chromium is installed by a release, so the
   * sentence named the right engines and lied about when they run - which clause
   * E cannot see, because clause E compares lists.
   *
   * So a cadence promise is only allowed when every engine on the ladder earns
   * it. Checked in both languages, because a claim corrected in one and left in
   * the other is the failure this project has already had with quoted labels.
   */
  const everyEngineVerified = engines.every((entry) => entry.level === 'verified');

  if (!everyEngineVerified) {
    for (const [language, copy] of Object.entries(browserCopy)) {
      const match = CADENCE_CLAIM.exec(copy);

      if (match) {
        errors.push(
          `The supported screen's ${language} browser copy promises a cadence ("${match[0]}") that the ladder does not support: only ${engines.filter((entry) => entry.level === 'verified').map((entry) => entry.engine).join(', ')} runs unattended.`,
        );
      }
    }
  }

  /* E. */
  const laddered = engines.map((entry) => entry.engine).sort();
  const claimed = [...claimedEngines].sort();

  if (JSON.stringify(laddered) !== JSON.stringify(claimed)) {
    errors.push(
      `The supported screen claims [${claimed.join(', ')}] but the ladder levels [${laddered.join(', ')}]. What players are told and what we promise ourselves have drifted.`,
    );
  }

  return { errors };
}

function main() {
  const read = (relative) => readFileSync(path.join(projectRoot, relative), 'utf8');
  const workflowFiles = execFileSync('git', ['ls-files', '.github/workflows'], {
    cwd: projectRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);

  const workflows = new Map(workflowFiles.map((file) => [file, read(file)]));

  const browserCopy = Object.fromEntries(
    ['en', 'el'].map((language) => [
      language,
      Object.values(
        JSON.parse(read(`public/i18n/supported/${language}.json`)).sections.browsers.rows,
      ).join(' '),
    ]),
  );

  const { errors } = checkSupportLadder({
    projects: parsePlaywrightProjects(read(PLAYWRIGHT_PATH)),
    workflows,
    claimedEngines: parseClaimedEngines(read(SUPPORTED_DATA_PATH)),
    browserCopy,
  });

  if (errors.length) {
    console.error('support ladder check failed:\n');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const verified = ENGINE_LADDER.filter((entry) => entry.level === 'verified').length;

  console.log(
    `[ladder] ${ENGINE_LADDER.length} engines (${verified} verified) and ${PLATFORM_LADDER.length} platforms match the automation.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

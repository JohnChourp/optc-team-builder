#!/usr/bin/env node
/**
 * 869f127cq. The What's New gate, moved to BEFORE the version bump.
 *
 * `check-whats-new.mjs` fails the moment `package.json` moves ahead of the entry list. On a code
 * release the generator deliberately refuses to write an entry - it can only describe which
 * characters appeared, so for a code release it would publish *"nothing changed on any screen"* in
 * the app's own release history - so a forgotten entry is caught, but only AFTER
 * `release-and-tag.sh` has bumped, committed and tagged. `main` is then red until somebody notices.
 * Measured 2026-09-04: `b3e84ed4` shipped v0.2.2 with no entry and the next session found `main`
 * already red.
 *
 * This refuses to START such a release, naming the version and the file. The post-bump lane stays
 * exactly as it is - it is the backstop, not the gate.
 *
 * The data-only path is untouched, and shares the generator's own definition of data-only rather
 * than inventing a second one: zero commits since the previous tag. The nightly chain releases
 * straight off an unchanged `main`, so it is exempt here and the generator writes its entry as
 * before.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { countCommitsSince, hasEntryFor } from './generate-whats-new-entry.mjs';

const WHATS_NEW_DATA_PATH = 'src/app/core/data/whats-new.data.ts';

export function checkReleaseWhatsNewReady({
  appRoot = process.cwd(),
  version,
  previousTag = null,
  countCommits = countCommitsSince,
} = {}) {
  if (!/^\d+\.\d+\.\d+$/u.test(String(version ?? ''))) {
    return { ok: false, reason: 'bad-version', version, message: `--version must be X.Y.Z, got ${version}` };
  }

  const dataFile = path.join(appRoot, WHATS_NEW_DATA_PATH);

  if (!existsSync(dataFile)) {
    return {
      ok: false,
      reason: 'missing-data-file',
      version,
      message: `${WHATS_NEW_DATA_PATH} does not exist under ${appRoot}.`,
    };
  }

  if (hasEntryFor(readFileSync(dataFile, 'utf8'), version)) {
    return { ok: true, reason: 'already-described', version };
  }

  const commitsSince = countCommits({ appRoot, previousTag });

  /*
   * Unknown is treated as data-only, deliberately. `countCommitsSince` returns null when there is
   * no previous tag or git cannot answer - the first release of a repository, a shallow clone - and
   * blocking a release on an unanswerable question would make this gate the thing that breaks
   * releases. The post-bump lane still catches a genuinely missing entry.
   */
  if (commitsSince === null || commitsSince === 0) {
    return { ok: true, reason: 'data-only', version, commitsSince };
  }

  return {
    ok: false,
    reason: 'missing-entry',
    version,
    commitsSince,
    message: [
      `[release] ${version} has no What's New entry, and ${commitsSince} commit(s) landed since ${previousTag ?? 'the previous tag'}.`,
      `[release] A code release writes its own entry - the generator refuses to, because the only thing it can describe is`,
      `[release] which characters appeared, and for a code release that publishes "nothing changed on any screen".`,
      `[release] Add one entry at the top of ${WHATS_NEW_DATA_PATH} for ${version}, then re-run.`,
      `[release] Refused BEFORE the version bump, so nothing has been written, committed or tagged.`,
    ].join('\n'),
  };
}

function parseArgs(argv) {
  const options = { appRoot: process.cwd(), version: '', previousTag: null };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--app-root') {
      options.appRoot = argv[index + 1] ?? options.appRoot;
      index += 1;
    } else if (arg === '--version') {
      options.version = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--previous-tag') {
      options.previousTag = argv[index + 1] || null;
      index += 1;
    }
  }

  return options;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = checkReleaseWhatsNewReady(parseArgs(process.argv.slice(2)));

  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }

  console.log(`[release] What's New is ready for ${result.version} (${result.reason}).`);
}

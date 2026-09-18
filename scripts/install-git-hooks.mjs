#!/usr/bin/env node
/**
 * 869f33bru. Points git at the committed hooks in `.githooks/`, so every checkout that runs
 * `npm ci` or `npm install` refuses a secret-shaped commit and push without anyone remembering a
 * setup step. Runs as the `prepare` lifecycle script.
 *
 * It never fails an install - a hook that cannot be installed is reported, not fatal - and it does
 * nothing when:
 * - `CI` is set. The workflows that commit (the nightly release) only ever commit generated
 *   dataset files and a version bump, and those ship through `build:pages` and
 *   `release-and-tag.sh`, which scan the built output themselves. An unattended release is not
 *   the place for a second, surprise gate.
 * - the directory is not a git work tree (an npm tarball, a Docker layer).
 * - `core.hooksPath` is already set to something else. That is somebody's deliberate setup; it
 *   is reported so they can chain `.githooks/` into it, not overwritten.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOOKS_PATH = '.githooks';

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

export function installGitHooks({ cwd = ROOT_DIR, env = process.env } = {}) {
  if (env.CI) {
    return { status: 'skipped', reason: 'CI is set' };
  }

  if (git(['rev-parse', '--is-inside-work-tree'], cwd).stdout.trim() !== 'true') {
    return { status: 'skipped', reason: 'not a git work tree' };
  }

  /*
   * The EFFECTIVE value, not only this repository's: a hooksPath set globally or system-wide is
   * somebody's setup too, and a local override would silently switch it off for this checkout.
   */
  const current = git(['config', '--get', 'core.hooksPath'], cwd).stdout.trim();

  if (current === HOOKS_PATH) {
    return { status: 'already-installed' };
  }

  if (current) {
    return { status: 'conflict', reason: `core.hooksPath is already "${current}"` };
  }

  const result = git(['config', '--local', 'core.hooksPath', HOOKS_PATH], cwd);

  return result.status === 0
    ? { status: 'installed' }
    : { status: 'failed', reason: String(result.stderr).trim() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outcome = installGitHooks();

  if (outcome.status === 'installed') {
    console.log(`[hooks] core.hooksPath -> ${HOOKS_PATH} (secret scan on commit and push).`);
  } else if (outcome.status === 'conflict' || outcome.status === 'failed') {
    console.warn(`[hooks] NOT installed: ${outcome.reason}. Commits and pushes are not scanned for secrets.`);
  }
}

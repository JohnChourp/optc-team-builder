#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * 869f13gbb. A built `dist/` states its provenance, so a stale one can be caught instead of
 * trusted.
 *
 * `dist/` is the obvious place to look when answering "what does the app actually serve?". It is
 * on every developer machine, and nothing about it says how old it is or which generation steps
 * produced it - so it answers **silently and wrongly** when it is stale. Measured on 2026-09-12:
 * reading `dist/` for the sitemap gave 7 URLs against a live 4,637, because the build had been
 * made without `seo:pages`. Every conclusion drawn from that directory would have been wrong,
 * confidently.
 *
 * WHAT IS STAMPED, and why each part earns its place:
 *
 *  - `commit` / `branch` / `dirty` - which source this came from, and whether it even corresponds
 *    to a commit;
 *  - `builtAt` - a UTC ISO string, a PAYLOAD timestamp (see docs/timestamp-roles.md), never
 *    localised;
 *  - `version` - what the app will report about itself;
 *  - `steps` - **which generation steps ran.** This is the part a plain mtime cannot give you, and
 *    it is the part that actually caused the 2026-09-12 trap: a `dist/` can be newer than every
 *    source file and still be missing a step's output entirely.
 *
 * It is written OUTSIDE the browser bundle - `dist/build-stamp.json`, beside `browser/` rather
 * than inside it - deliberately. Every prefetched asset in this repo is unhashed, and adding a
 * file to the served directory is how a service-worker install is made to fail mid-deploy.
 * Nothing ships this; it exists for whoever reads the directory.
 *
 * Run: npm run build:stamp -- --steps seo:pages,pwa:ngsw:pages
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUILD_STAMP_PATH = 'dist/build-stamp.json';

function git(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: APP_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

export function buildStamp({ steps = [], now = new Date(), appRoot = APP_ROOT } = {}) {
  const packageJsonPath = path.join(appRoot, 'package.json');
  const version = existsSync(packageJsonPath)
    ? JSON.parse(readFileSync(packageJsonPath, 'utf8')).version
    : null;

  return {
    schemaVersion: 1,
    version,
    commit: git(['rev-parse', 'HEAD'], null),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], null),
    dirty: git(['status', '--porcelain'], '').length > 0,
    builtAt: now.toISOString(),
    steps: [...steps].sort(),
  };
}

function parseSteps(argv) {
  const index = argv.indexOf('--steps');

  if (index < 0) {
    return [];
  }

  return (argv[index + 1] ?? '')
    .split(',')
    .map((step) => step.trim())
    .filter(Boolean);
}

function main() {
  const stamp = buildStamp({ steps: parseSteps(process.argv.slice(2)) });
  const target = path.join(APP_ROOT, BUILD_STAMP_PATH);

  writeFileSync(target, `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
  console.log(
    `[build:stamp] ${BUILD_STAMP_PATH}: ${stamp.commit?.slice(0, 8) ?? 'no-commit'}` +
      `${stamp.dirty ? '+dirty' : ''} at ${stamp.builtAt}` +
      `${stamp.steps.length ? `, steps: ${stamp.steps.join(', ')}` : ', no generation steps'}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

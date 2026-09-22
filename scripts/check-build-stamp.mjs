#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { BUILD_STAMP_PATH } from './write-build-stamp.mjs';

/**
 * 869f13gbb. Answers one question: **may I reason from this `dist/`?**
 *
 * The stamp is written by `scripts/write-build-stamp.mjs`; the trap it exists for, and the
 * lifecycle of every local artifact directory, are in `docs/local-artifact-lifecycles.md`.
 *
 * DEFAULT BEHAVIOUR IS INFORMATIONAL, AND THAT IS DELIBERATE. A machine that has never built has
 * nothing wrong with it, and a check that fails there would be a check people switch off. It
 * reports and exits 0. `--require-fresh` is for a caller that genuinely needs a current build and
 * wants a non-zero exit - and it is NOT wired into `verify:local`, for the same reason.
 *
 * Run: npm run build:stamp:check [-- --require-fresh] [-- --expect-steps seo:pages]
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOTS = ['src', 'public', 'scripts'];

/** The newest mtime under the source roots, in epoch milliseconds. */
export function newestSourceMtime(appRoot = APP_ROOT, roots = SOURCE_ROOTS) {
  let newest = 0;

  const walk = (directory) => {
    if (!existsSync(directory)) {
      return;
    }

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        newest = Math.max(newest, statSync(entryPath).mtimeMs);
      }
    }
  };

  for (const root of roots) {
    walk(path.join(appRoot, root));
  }

  return newest;
}

export function inspectBuildStamp({ appRoot = APP_ROOT, expectSteps = [], roots = SOURCE_ROOTS } = {}) {
  const stampPath = path.join(appRoot, BUILD_STAMP_PATH);

  if (!existsSync(stampPath)) {
    return { state: 'absent', findings: [], stamp: null };
  }

  let stamp;

  try {
    stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
  } catch (error) {
    return { state: 'unreadable', findings: [`${BUILD_STAMP_PATH} is not valid JSON: ${error.message}`], stamp: null };
  }

  const findings = [];
  const builtAt = Date.parse(stamp.builtAt ?? '');

  if (Number.isNaN(builtAt)) {
    findings.push(`${BUILD_STAMP_PATH} has no readable builtAt, so its age cannot be established.`);
  } else {
    const newest = newestSourceMtime(appRoot, roots);

    if (newest > builtAt) {
      findings.push(
        `the build is OLDER than its sources - built ${stamp.builtAt}, newest source ` +
          `${new Date(newest).toISOString()}. Do not read anything out of dist/; rebuild first.`,
      );
    }
  }

  if (stamp.dirty === true) {
    findings.push('the build was made from a DIRTY tree, so it corresponds to no commit.');
  }

  for (const step of expectSteps) {
    if (!(stamp.steps ?? []).includes(step)) {
      findings.push(
        `the generation step "${step}" did not run. A dist/ can be newer than every source file ` +
          'and still be missing a step\'s output entirely - that is the 2026-09-12 sitemap trap.',
      );
    }
  }

  return { state: findings.length === 0 ? 'fresh' : 'stale', findings, stamp };
}

export function formatBuildStampResult(result) {
  if (result.state === 'absent') {
    return `# Build stamp check\n\nNo ${BUILD_STAMP_PATH}: nothing has been built here, so there is nothing to trust or distrust.`;
  }

  const lines = ['# Build stamp check', ''];

  if (result.stamp) {
    lines.push(
      `Built ${result.stamp.builtAt} from ${result.stamp.commit?.slice(0, 8) ?? 'no commit'}` +
        `${result.stamp.dirty ? ' (dirty)' : ''}, steps: ${(result.stamp.steps ?? []).join(', ') || 'none'}.`,
      '',
    );
  }

  if (result.state === 'fresh') {
    lines.push('Status: fresh - dist/ may be reasoned from.');
  } else {
    lines.push('Status: STALE - do NOT reason from dist/.', '');

    for (const finding of result.findings) {
      lines.push(`- ${finding}`);
    }
  }

  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const expectIndex = argv.indexOf('--expect-steps');
  const expectSteps =
    expectIndex < 0
      ? []
      : (argv[expectIndex + 1] ?? '').split(',').map((step) => step.trim()).filter(Boolean);

  const result = inspectBuildStamp({ expectSteps });

  console.log(formatBuildStampResult(result));
  process.exitCode = argv.includes('--require-fresh') && result.state !== 'fresh' ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

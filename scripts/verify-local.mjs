#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { SCRIPT_SUITES, SCRIPT_SUITE_ORDER } from './ci-check-routing.mjs';

/**
 * Local replacement for the GitHub Actions Test workflow.
 *
 * GitHub Actions does not run on pull requests or main pushes (see
 * docs/ci-trigger-policy.md), so this is the command that proves a change.
 * It runs the same Angular, script-suite, dataset-performance, and browser e2e
 * lanes the workflow defines, in one pass, with a single pass/fail summary.
 */

const ANGULAR_LANE = {
  id: 'angular',
  label: 'Angular unit tests',
  command: 'npm run test:ci',
};

const DATASET_PERF_LANE = {
  id: 'dataset-perf',
  label: 'Dataset performance guard',
  command: 'npm run perf:dataset -- --assert',
};

const E2E_LANES = ['chromium', 'firefox', 'webkit'].map((browser) => ({
  id: `e2e-${browser}`,
  label: `Cross-browser e2e (${browser})`,
  command: `npm run test:e2e:${browser}`,
}));

export function buildLanes({ withE2e = false, only = [], skip = [] } = {}) {
  const lanes = [
    ANGULAR_LANE,
    ...SCRIPT_SUITE_ORDER.map((suite) => ({
      id: suite,
      label: SCRIPT_SUITES[suite].label,
      command: SCRIPT_SUITES[suite].command,
    })),
    DATASET_PERF_LANE,
    ...(withE2e ? E2E_LANES : []),
  ];

  const onlySet = new Set(only);
  const skipSet = new Set(skip);

  return lanes.filter((lane) => (onlySet.size === 0 || onlySet.has(lane.id)) && !skipSet.has(lane.id));
}

function parseList(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseArgs(argv) {
  const args = {
    withE2e: false,
    only: [],
    skip: [],
    list: false,
    bail: false,
  };

  for (const arg of argv) {
    if (arg === '--with-e2e') {
      args.withE2e = true;
    } else if (arg === '--list') {
      args.list = true;
    } else if (arg === '--bail') {
      args.bail = true;
    } else if (arg.startsWith('--only=')) {
      args.only = parseList(arg.slice('--only='.length));
    } else if (arg.startsWith('--skip=')) {
      args.skip = parseList(arg.slice('--skip='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function runLane(lane, cwd) {
  const startedAt = process.hrtime.bigint();
  const result = spawnSync(lane.command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  return {
    ...lane,
    ok: result.status === 0,
    status: result.status ?? 1,
    durationMs,
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[verify-local] ${error instanceof Error ? error.message : String(error)}`);
    console.error('Usage: node scripts/verify-local.mjs [--with-e2e] [--only=id,id] [--skip=id,id] [--list] [--bail]');
    process.exitCode = 1;
    return;
  }

  const lanes = buildLanes(args);

  if (args.list) {
    for (const lane of lanes) {
      console.log(`${lane.id.padEnd(26)} ${lane.command}`);
    }
    return;
  }

  if (lanes.length === 0) {
    console.error('[verify-local] No lanes selected.');
    process.exitCode = 1;
    return;
  }

  const cwd = path.resolve(fileURLToPath(import.meta.url), '../..');
  const results = [];

  for (const [index, lane] of lanes.entries()) {
    console.log(`\n=== [${index + 1}/${lanes.length}] ${lane.label} ===\n${lane.command}\n`);
    const result = runLane(lane, cwd);
    results.push(result);

    if (!result.ok && args.bail) {
      break;
    }
  }

  const failed = results.filter((result) => !result.ok);

  console.log('\n# Local verification summary\n');
  for (const result of results) {
    console.log(`${result.ok ? 'pass' : 'FAIL'}  ${result.id.padEnd(26)} ${formatDuration(result.durationMs)}`);
  }

  const skipped = lanes.length - results.length;
  if (skipped > 0) {
    console.log(`\n${skipped} lane(s) not run because --bail stopped the pass early.`);
  }

  if (failed.length > 0) {
    console.log(`\nStatus: failed - ${failed.length} of ${results.length} lane(s) failed.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nStatus: passed - ${results.length} lane(s) succeeded.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { buildRunPlan } from './lib/playwright-e2e-runner.mjs';
import { loadQuarantineConfig } from './lib/playwright-quarantine.mjs';

const npxCommand =
  process.platform === 'win32'
    ? {
        command: process.execPath,
        prefixArgs: [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')],
      }
    : { command: 'npx', prefixArgs: [] };

function runPlaywright(args, env = {}) {
  const result = spawnSync(npxCommand.command, [...npxCommand.prefixArgs, 'playwright', 'test', ...args], {
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    console.error(`[test:e2e] Playwright exited from signal ${result.signal}`);
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

const quarantineConfig = await loadQuarantineConfig();
const plan = buildRunPlan({
  rawArgs: process.argv.slice(2),
  env: process.env,
  quarantineConfig,
});

if (plan.message) {
  console.log(plan.message);
}

for (const run of plan.runs) {
  runPlaywright(run.args, run.env);
}

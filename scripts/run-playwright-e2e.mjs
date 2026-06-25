#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const GUIDED_GREP = '@guided-auto-build';
const { scopedProject, userArgs } = parseRunnerArgs(process.argv.slice(2));
const projectArgs = scopedProject ? [`--project=${scopedProject}`] : [];
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function parseRunnerArgs(args) {
  const remainingArgs = [];
  let project = (process.env.E2E_PROJECT ?? '').trim();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--e2e-project') {
      project = args[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (arg.startsWith('--e2e-project=')) {
      project = arg.slice('--e2e-project='.length);
      continue;
    }

    remainingArgs.push(arg);
  }

  return { scopedProject: project.trim(), userArgs: remainingArgs };
}

function runPlaywright(args, env = {}) {
  const result = spawnSync(npxBin, ['playwright', 'test', ...args], {
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

function artifactEnv(name) {
  return {
    PLAYWRIGHT_HTML_REPORT: `playwright-report/${name}`,
    PLAYWRIGHT_OUTPUT_DIR: `test-results/${name}`,
  };
}

if (userArgs.length > 0) {
  runPlaywright([...projectArgs, ...userArgs]);
  process.exit(0);
}

if (scopedProject && scopedProject !== 'chromium') {
  runPlaywright([...projectArgs, '--grep-invert', GUIDED_GREP], artifactEnv(scopedProject));
  process.exit(0);
}

const nonGuidedName = scopedProject ? `${scopedProject}-main` : 'main';
runPlaywright([...projectArgs, '--grep-invert', GUIDED_GREP], artifactEnv(nonGuidedName));
runPlaywright(['--project', 'chromium', '--grep', GUIDED_GREP, '--workers', '1'], artifactEnv('chromium-guided'));

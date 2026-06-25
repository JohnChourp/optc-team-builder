#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const GUIDED_GREP = '@guided-auto-build';
const userArgs = process.argv.slice(2);
const scopedProject = (process.env.E2E_PROJECT ?? '').trim();
const projectArgs = scopedProject ? ['--project', scopedProject] : [];
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';

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

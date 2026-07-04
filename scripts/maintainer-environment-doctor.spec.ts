import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  RELEASE_CHECK_FIXTURE_FILES,
  RELEASE_CHECK_FIXTURE_NAMES,
  REQUIRED_APP_PATHS,
  REQUIRED_BRAIN_PATHS,
  REQUIRED_PACKAGE_SCRIPTS,
  evaluateMaintainerEnvironment,
  findInstalledPlaywrightBrowsers,
  renderTextReport,
  resolvePlaywrightCacheRoot,
  runCli,
} from './maintainer-environment-doctor.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function writeWorkspaceFile(root: string, relativePath: string, content = '') {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

function packageScripts(overrides: Record<string, string | null> = {}) {
  const scripts = Object.fromEntries(
    REQUIRED_PACKAGE_SCRIPTS.map((script) => [
      script.name,
      script.expectedCommand ?? `node ./scripts/${script.name.replace(/:/gu, '-')}.mjs`,
    ]),
  );

  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) {
      delete scripts[name];
    } else {
      scripts[name] = value;
    }
  }

  return scripts;
}

async function makeWorkspace(options: { scriptOverrides?: Record<string, string | null> } = {}) {
  const root = await fsTempDir();
  const appRoot = path.join(root, 'optc-team-builder');
  const brainRoot = path.join(root, 'optc-team-builder-brain');
  await mkdir(appRoot, { recursive: true });
  await mkdir(brainRoot, { recursive: true });

  const packageJson = {
    name: 'optc-team-builder',
    scripts: packageScripts(options.scriptOverrides),
    engines: {
      node: '^22.22.3 || ^24.15.0 || >=26.0.0',
      npm: '>=8.0.0',
    },
  };

  for (const item of REQUIRED_APP_PATHS) {
    if (item.relativePath === 'package.json') {
      await writeWorkspaceFile(appRoot, item.relativePath, `${JSON.stringify(packageJson, null, 2)}\n`);
    } else if (item.relativePath === '.nvmrc' || item.relativePath === '.node-version') {
      await writeWorkspaceFile(appRoot, item.relativePath, '24.15.0\n');
    } else {
      await writeWorkspaceFile(appRoot, item.relativePath, `${item.relativePath}\n`);
    }
  }

  for (const fixture of RELEASE_CHECK_FIXTURE_NAMES) {
    for (const fixtureFile of RELEASE_CHECK_FIXTURE_FILES) {
      await writeWorkspaceFile(appRoot, `scripts/fixtures/release-check/${fixture}/${fixtureFile}`, '{}\n');
    }
  }

  for (const item of REQUIRED_BRAIN_PATHS) {
    if (item.kind === 'directory') {
      await mkdir(path.join(brainRoot, ...item.relativePath.split('/')), { recursive: true });
    } else if (item.relativePath === 'AGENTS.md' || item.relativePath === 'CLAUDE.md') {
      await writeWorkspaceFile(brainRoot, item.relativePath, 'shared instructions\n');
    } else if (item.relativePath === '.gitignore') {
      await writeWorkspaceFile(brainRoot, item.relativePath, 'live-artifacts/\n');
    } else {
      await writeWorkspaceFile(brainRoot, item.relativePath, `${item.relativePath}\n`);
    }
  }

  return { appRoot, brainRoot };
}

async function fsTempDir() {
  const root = await import('node:fs/promises').then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), 'optc-maintainer-doctor-')),
  );
  tempDirs.push(root);
  return root;
}

function evaluateHealthy(appRoot: string, brainRoot: string) {
  return evaluateMaintainerEnvironment(
    { appRoot, brainRoot, profile: 'ci' },
    { nodeVersion: 'v24.16.0', npmVersion: '11.13.0' },
  );
}

describe('maintainer-environment-doctor', () => {
  it('passes for a healthy app and brain workflow layout', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();

    const report = evaluateHealthy(appRoot, brainRoot);

    expect(report.ok).toBe(true);
    expect(report.summary.fail).toBe(0);
    expect(report.checks.map((check) => check.id)).toContain('app/script/doctor:maintainer');
    expect(report.checks.map((check) => check.id)).toContain('brain/agents-claude-parity');
  });

  it('includes the source-contract expected-failure fixture in maintainer checks', () => {
    expect(RELEASE_CHECK_FIXTURE_NAMES).toContain('source-contract-broken');
  });

  it('fails with actionable guidance when the brain checkout is missing', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    await rm(brainRoot, { recursive: true, force: true });

    const report = evaluateHealthy(appRoot, brainRoot);
    const brainFailure = report.checks.find((check) => check.id === 'brain/root');

    expect(report.ok).toBe(false);
    expect(brainFailure?.status).toBe('fail');
    expect(brainFailure?.fix).toContain('--brain-root');
  });

  it('fails unsupported Node and npm versions against package engines', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();

    const report = evaluateMaintainerEnvironment(
      { appRoot, brainRoot, profile: 'ci' },
      { nodeVersion: 'v24.13.1', npmVersion: '7.24.0' },
    );

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'runtime/node-engine')?.status).toBe('fail');
    expect(report.checks.find((check) => check.id === 'runtime/npm-engine')?.status).toBe('fail');
    expect(renderTextReport(report)).toContain('Run nvm install && nvm use');
  });

  it('reports missing workflow scripts and required files', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      scriptOverrides: {
        'perf:budget-report': null,
      },
    });
    await rm(path.join(appRoot, 'scripts', 'perf-budget-report.mjs'), { force: true });

    const report = evaluateHealthy(appRoot, brainRoot);

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'app/script/perf:budget-report')?.status).toBe('fail');
    expect(report.checks.find((check) => check.id === 'app/path/scripts/perf-budget-report.mjs')?.status).toBe('fail');
  });

  it('fails when a required maintainer package script points at the wrong command', async () => {
    const { appRoot, brainRoot } = await makeWorkspace({
      scriptOverrides: {
        'test:captain-contracts': 'node -e "process.exit(0)"',
      },
    });

    const report = evaluateHealthy(appRoot, brainRoot);
    const scriptCheck = report.checks.find((check) => check.id === 'app/script/test:captain-contracts');

    expect(report.ok).toBe(false);
    expect(scriptCheck?.status).toBe('fail');
    expect(scriptCheck?.detail).toContain('instead of');
  });

  it('resolves hermetic Playwright browser installs inside node_modules', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    await mkdir(path.join(appRoot, 'node_modules', 'playwright'), { recursive: true });
    const cacheRoot = path.join(appRoot, 'node_modules', 'playwright-core', '.local-browsers');
    await writeWorkspaceFile(appRoot, 'node_modules/playwright-core/.local-browsers/chromium-1200/chrome-win/chrome.exe');
    await writeWorkspaceFile(appRoot, 'node_modules/playwright-core/.local-browsers/firefox-1500/firefox/firefox.exe');
    await writeWorkspaceFile(appRoot, 'node_modules/playwright-core/.local-browsers/webkit-2100/pw_run.sh');

    expect(resolvePlaywrightCacheRoot(appRoot, { PLAYWRIGHT_BROWSERS_PATH: '0' })).toBe(
      cacheRoot,
    );
    expect(findInstalledPlaywrightBrowsers(cacheRoot)).toEqual(['chromium', 'firefox', 'webkit']);

    const report = evaluateMaintainerEnvironment(
      {
        appRoot,
        brainRoot,
        profile: 'local',
      },
      {
        nodeVersion: 'v24.15.0',
        npmVersion: '11.13.0',
        env: { PLAYWRIGHT_BROWSERS_PATH: '0' },
      },
    );

    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'local/playwright-cache')?.status).toBe('pass');
  });

  it('warns when the Playwright cache root exists without browser payloads', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    await mkdir(path.join(appRoot, 'node_modules', 'playwright'), { recursive: true });
    await mkdir(path.join(appRoot, 'node_modules', 'playwright-core', '.local-browsers'), { recursive: true });

    const report = evaluateMaintainerEnvironment(
      {
        appRoot,
        brainRoot,
        profile: 'local',
      },
      {
        nodeVersion: 'v24.15.0',
        npmVersion: '11.13.0',
        env: { PLAYWRIGHT_BROWSERS_PATH: '0' },
      },
    );
    const cacheCheck = report.checks.find((check) => check.id === 'local/playwright-cache');

    expect(report.ok).toBe(true);
    expect(cacheCheck?.status).toBe('warn');
    expect(cacheCheck?.detail).toContain('chromium, firefox, webkit');
    expect(cacheCheck?.fix).toContain('npm run test:e2e:install');
  });

  it('fails when the brain repo only ignores a task-specific live-artifacts path', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    await writeWorkspaceFile(brainRoot, '.gitignore', 'live-artifacts/869dwc7wr/\n');

    const report = evaluateHealthy(appRoot, brainRoot);
    const ignoreCheck = report.checks.find((check) => check.id === 'brain/live-artifacts-ignore');

    expect(report.ok).toBe(false);
    expect(ignoreCheck?.status).toBe('fail');
    expect(ignoreCheck?.fix).toContain('live-artifacts/');
  });

  it('allows app-only checks when the brain checkout is intentionally unavailable', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    await rm(brainRoot, { recursive: true, force: true });

    const report = evaluateMaintainerEnvironment(
      { appRoot, brainRoot, profile: 'ci', appOnly: true },
      { nodeVersion: 'v24.16.0', npmVersion: '11.13.0' },
    );

    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'brain/app-only')?.status).toBe('pass');
  });

  it('emits machine-readable JSON from the CLI', async () => {
    const { appRoot, brainRoot } = await makeWorkspace();
    const output: string[] = [];

    const exitCode = await runCli(
      ['--profile=ci', '--json', '--app-root', appRoot, '--brain-root', brainRoot],
      { log: (value: string) => output.push(value), error: (value: string) => output.push(value) },
      { nodeVersion: 'v24.16.0', npmVersion: '11.13.0' },
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output.join('\n'));
    expect(parsed.ok).toBe(true);
    expect(parsed.profile).toBe('ci');
    expect(parsed.checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'runtime/node-engine' })]));
  });
});

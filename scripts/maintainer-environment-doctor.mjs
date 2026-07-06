#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROFILE = 'local';
const VALID_PROFILES = new Set(['ci', 'local']);
const DEFAULT_BRAIN_ROOT = '../optc-team-builder-brain';
const LIVE_ARTIFACTS_IGNORE_SENTINEL = 'live-artifacts/__maintainer-doctor-sentinel__';
export const REQUIRED_PLAYWRIGHT_BROWSERS = ['chromium', 'firefox', 'webkit'];

export const REQUIRED_PACKAGE_SCRIPTS = [
  {
    name: 'doctor:maintainer',
    group: 'doctor',
    expectedCommand: 'node ./scripts/maintainer-environment-doctor.mjs',
    fix: 'Add "doctor:maintainer": "node ./scripts/maintainer-environment-doctor.mjs" to package.json.',
  },
  {
    name: 'test:maintainer-doctor',
    group: 'doctor',
    expectedCommand: 'vitest run scripts/maintainer-environment-doctor.spec.ts',
    fix: 'Add "test:maintainer-doctor": "vitest run scripts/maintainer-environment-doctor.spec.ts" to package.json.',
  },
  {
    name: 'test:captain-contracts',
    group: 'contract',
    expectedCommand: 'vitest run scripts/import-optc-data.spec.ts scripts/lib/captain-ability-coverage.spec.ts',
    fix: 'Restore the captain contract package script used by parser and generated metadata validation.',
  },
  {
    name: 'perf:ability-filters',
    group: 'performance',
    expectedCommand: 'node ./scripts/perf-ability-filters.mjs',
    fix: 'Restore the ability-filter performance harness package script.',
  },
  {
    name: 'perf:explanation-compare',
    group: 'performance',
    expectedCommand: 'node ./scripts/perf-explanation-compare.mjs',
    fix: 'Restore the explanation/compare performance harness package script.',
  },
  {
    name: 'perf:saved-team-codecs',
    group: 'performance',
    expectedCommand: 'node ./scripts/perf-saved-team-codecs.mjs',
    fix: 'Restore the saved-team codec performance harness package script.',
  },
  {
    name: 'perf:route-load',
    group: 'performance',
    expectedCommand: 'node ./scripts/perf-route-load.mjs',
    fix: 'Restore the route-load performance harness package script.',
  },
  {
    name: 'perf:budget-report',
    group: 'performance',
    expectedCommand: 'node ./scripts/perf-budget-report.mjs',
    fix: 'Restore the performance budget report package script.',
  },
  {
    name: 'perf:budget-history',
    group: 'performance',
    expectedCommand: 'node ./scripts/perf-budget-history.mjs',
    fix: 'Restore the performance budget history package script used by the scheduled Performance Budgets workflow.',
  },
  {
    name: 'test:perf-budget',
    group: 'performance',
    expectedCommand:
      'node --check ./scripts/perf-route-load.mjs && node --check ./scripts/perf-saved-team-codecs.mjs && vitest run scripts/perf-budget-report.spec.ts scripts/perf-budget-history.spec.ts',
    fix: 'Restore the performance budget unit test package script, including route-load and saved-team codec syntax checks.',
  },
  {
    name: 'test:release-check',
    group: 'release-check',
    expectedCommand:
      'vitest run scripts/check-optc-release-needed.spec.ts scripts/check-optc-upstream-monitor.spec.ts scripts/backtest-optc-release-detector.spec.ts scripts/release-detector-status.spec.ts scripts/release-provenance-report.spec.ts',
    fix: 'Restore the release detector replay package script.',
  },
  {
    name: 'data:check-release',
    group: 'release-check',
    expectedCommand: 'node ./scripts/check-optc-release-needed.mjs',
    fix: 'Restore the local OPTC DB release-check package script.',
  },
  {
    name: 'data:monitor-upstream',
    group: 'release-check',
    expectedCommand: 'node ./scripts/check-optc-upstream-monitor.mjs',
    fix: 'Restore the upstream freshness and drift monitor package script.',
  },
  {
    name: 'data:backtest-release',
    group: 'release-check',
    expectedCommand: 'node ./scripts/backtest-optc-release-detector.mjs',
    fix: 'Restore the historical release detector backtest package script.',
  },
  {
    name: 'release:provenance',
    group: 'release-check',
    expectedCommand: 'node ./scripts/release-provenance-report.mjs',
    fix: 'Restore the release provenance verification package script.',
  },
  {
    name: 'docs:integrity',
    group: 'docs',
    expectedCommand: 'node ./scripts/check-docs-integrity.mjs',
    fix: 'Restore the docs integrity package script.',
  },
  {
    name: 'docs:commands',
    group: 'docs',
    expectedCommand: 'node ./scripts/check-docs-commands.mjs',
    fix: 'Restore the docs command verification package script.',
  },
  {
    name: 'docs:drift',
    group: 'docs',
    expectedCommand: 'node ./scripts/check-docs-drift.mjs',
    fix: 'Restore the docs drift package script.',
  },
];

export const REQUIRED_APP_PATHS = [
  { relativePath: 'package.json', kind: 'file', group: 'runtime' },
  { relativePath: 'package-lock.json', kind: 'file', group: 'runtime' },
  { relativePath: '.nvmrc', kind: 'file', group: 'runtime' },
  { relativePath: '.node-version', kind: 'file', group: 'runtime' },
  { relativePath: 'docs/maintainer-validation-guide.md', kind: 'file', group: 'docs' },
  { relativePath: 'docs/feature-coverage-map.md', kind: 'file', group: 'docs' },
  { relativePath: 'docs/fixture-ownership-guide.md', kind: 'file', group: 'docs' },
  { relativePath: 'e2e/README.md', kind: 'file', group: 'docs' },
  { relativePath: '.github/workflows/test.yml', kind: 'file', group: 'ci' },
  { relativePath: '.github/workflows/docs-integrity.yml', kind: 'file', group: 'ci' },
  { relativePath: '.github/workflows/check-optc-db-release.yml', kind: 'file', group: 'release-check' },
  { relativePath: '.github/workflows/performance-budgets.yml', kind: 'file', group: 'performance' },
  { relativePath: 'scripts/import-optc-data.spec.ts', kind: 'file', group: 'contract' },
  { relativePath: 'scripts/lib/captain-ability-coverage.spec.ts', kind: 'file', group: 'contract' },
  { relativePath: 'src/app/core/services/fixtures/captain-contract-cases.json', kind: 'file', group: 'contract' },
  { relativePath: 'scripts/perf-ability-filters.mjs', kind: 'file', group: 'performance' },
  { relativePath: 'scripts/perf-explanation-compare.mjs', kind: 'file', group: 'performance' },
  { relativePath: 'scripts/perf-saved-team-codecs.mjs', kind: 'file', group: 'performance' },
  { relativePath: 'scripts/perf-route-load.mjs', kind: 'file', group: 'performance' },
  { relativePath: 'scripts/perf-budget-report.mjs', kind: 'file', group: 'performance' },
  { relativePath: 'scripts/perf-budget-history.mjs', kind: 'file', group: 'performance' },
  { relativePath: 'scripts/check-optc-release-needed.mjs', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/check-optc-upstream-monitor.mjs', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/backtest-optc-release-detector.mjs', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/backtest-optc-release-detector.spec.ts', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/release-provenance-report.mjs', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/release-provenance-report.spec.ts', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/fixtures/shared/release-check-fixtures.mjs', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/fixtures/release-check/history/corpus.json', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/fixtures/release-provenance/release-trigger-released.json', kind: 'file', group: 'release-check' },
  { relativePath: 'scripts/check-docs-commands.mjs', kind: 'file', group: 'docs' },
  { relativePath: 'scripts/check-docs-integrity.mjs', kind: 'file', group: 'docs' },
  { relativePath: 'scripts/check-docs-drift.mjs', kind: 'file', group: 'docs' },
  { relativePath: 'docs/docs-drift-map.json', kind: 'file', group: 'docs' },
];

export const RELEASE_CHECK_FIXTURE_NAMES = [
  'active-release-running',
  'error',
  'new-character',
  'no-change',
  'source-contract-broken',
  'upstream-shape-drift',
];

export const RELEASE_CHECK_FIXTURE_FILES = [
  'local-manifest.json',
  'local-seed.sql',
  'remote-units.js',
  'remote-version.js',
];

export const REQUIRED_BRAIN_PATHS = [
  { relativePath: 'README.md', kind: 'file', group: 'brain' },
  { relativePath: 'OPTC_DB_AUTO_RELEASE_RUNBOOK.md', kind: 'file', group: 'release-check' },
  { relativePath: 'audits', kind: 'directory', group: 'brain' },
  { relativePath: 'audits/evidence-index.json', kind: 'file', group: 'brain' },
  { relativePath: 'audits/evidence-index.md', kind: 'file', group: 'brain' },
  { relativePath: 'scripts/validate-evidence-index.mjs', kind: 'file', group: 'brain' },
  { relativePath: 'scripts/audit-docs-integrity.mjs', kind: 'file', group: 'brain' },
  { relativePath: '.gitignore', kind: 'file', group: 'brain' },
  { relativePath: 'AGENTS.md', kind: 'file', group: 'brain' },
  { relativePath: 'CLAUDE.md', kind: 'file', group: 'brain' },
];

function normalizePath(value) {
  return String(value ?? '').replace(/\\/gu, '/');
}

function resolveFromRoot(root, value) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
}

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function readJsonIfExists(filePath) {
  const text = readTextIfExists(filePath);
  if (text === null) {
    return { value: null, error: 'file is missing' };
  }
  try {
    return { value: JSON.parse(text), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function parseVersion(value) {
  const match = String(value ?? '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)/u);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    raw: String(value).trim(),
  };
}

function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] > right[key]) {
      return 1;
    }
    if (left[key] < right[key]) {
      return -1;
    }
  }
  return 0;
}

function versionLabel(version) {
  return version ? `${version.major}.${version.minor}.${version.patch}` : 'unknown';
}

function satisfiesEngine(versionValue, rangeValue) {
  const version = parseVersion(versionValue);
  if (!version) {
    return false;
  }

  return String(rangeValue ?? '')
    .split('||')
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some((clause) => {
      if (clause.startsWith('^')) {
        const minimum = parseVersion(clause.slice(1));
        return Boolean(minimum) && version.major === minimum.major && compareVersions(version, minimum) >= 0;
      }

      if (clause.startsWith('>=')) {
        const minimum = parseVersion(clause.slice(2));
        return Boolean(minimum) && compareVersions(version, minimum) >= 0;
      }

      const exact = parseVersion(clause);
      return Boolean(exact) && compareVersions(version, exact) === 0;
    });
}

function makeCheck({ id, group, status, label, detail, fix = '' }) {
  return { id, group, status, label, detail, fix };
}

function pathCheck(root, item, repoLabel) {
  const absolutePath = path.join(root, ...normalizePath(item.relativePath).split('/'));
  const exists = item.kind === 'directory' ? isDirectory(absolutePath) : isFile(absolutePath);
  return makeCheck({
    id: `${repoLabel}/path/${normalizePath(item.relativePath)}`,
    group: item.group,
    status: exists ? 'pass' : 'fail',
    label: `${repoLabel} ${item.kind}: ${normalizePath(item.relativePath)}`,
    detail: exists
      ? `${normalizePath(item.relativePath)} exists.`
      : `${normalizePath(item.relativePath)} is missing from ${repoLabel}.`,
    fix: exists ? '' : `Restore ${normalizePath(item.relativePath)} from main or update the doctor if the workflow contract moved.`,
  });
}

function npmVersionFromUserAgent(env) {
  const match = String(env.npm_config_user_agent ?? '').match(/\bnpm\/(\d+\.\d+\.\d+)/u);
  return match?.[1] ?? '';
}

function readNpmVersion(appRoot, env = process.env) {
  const userAgentVersion = npmVersionFromUserAgent(env);
  if (userAgentVersion) {
    return { version: userAgentVersion, error: '' };
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['--version'], {
    cwd: appRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    return {
      version: '',
      error: result.error instanceof Error ? result.error.message : result.stderr || 'npm --version failed',
    };
  }
  return { version: String(result.stdout ?? '').trim(), error: '' };
}

function packageScriptChecks(packageJson) {
  if (!packageJson) {
    return [
      makeCheck({
        id: 'app/package-json/scripts',
        group: 'runtime',
        status: 'fail',
        label: 'package scripts readable',
        detail: 'package.json could not be read, so package scripts could not be checked.',
        fix: 'Restore a valid package.json at the app root.',
      }),
    ];
  }

  const scripts = packageJson.scripts ?? {};
  return REQUIRED_PACKAGE_SCRIPTS.map((script) => {
    if (!scripts[script.name]) {
      return makeCheck({
        id: `app/script/${script.name}`,
        group: script.group,
        status: 'fail',
        label: `package script: ${script.name}`,
        detail: `package.json is missing the ${script.name} script.`,
        fix: script.fix,
      });
    }

    if (script.expectedCommand && scripts[script.name] !== script.expectedCommand) {
      return makeCheck({
        id: `app/script/${script.name}`,
        group: script.group,
        status: 'fail',
        label: `package script: ${script.name}`,
        detail: `${script.name} exists but runs "${scripts[script.name]}" instead of "${script.expectedCommand}".`,
        fix: `Confirm the command still covers the maintainer workflow, or restore: ${script.expectedCommand}`,
      });
    }

    return makeCheck({
      id: `app/script/${script.name}`,
      group: script.group,
      status: 'pass',
      label: `package script: ${script.name}`,
      detail: `${script.name} is available.`,
    });
  });
}

function releaseFixtureChecks(appRoot) {
  const checks = [];
  for (const fixtureName of RELEASE_CHECK_FIXTURE_NAMES) {
    const fixtureDir = path.join(appRoot, 'scripts', 'fixtures', 'release-check', fixtureName);
    checks.push(
      makeCheck({
        id: `app/release-fixture/${fixtureName}`,
        group: 'release-check',
        status: isDirectory(fixtureDir) ? 'pass' : 'fail',
        label: `release-check fixture: ${fixtureName}`,
        detail: isDirectory(fixtureDir)
          ? `${fixtureName} fixture directory exists.`
          : `${fixtureName} fixture directory is missing.`,
        fix: `Restore scripts/fixtures/release-check/${fixtureName}/ from main or update the release fixture metadata.`,
      }),
    );

    for (const fileName of RELEASE_CHECK_FIXTURE_FILES) {
      const fixtureFile = path.join(fixtureDir, fileName);
      checks.push(
        makeCheck({
          id: `app/release-fixture/${fixtureName}/${fileName}`,
          group: 'release-check',
          status: isFile(fixtureFile) ? 'pass' : 'fail',
          label: `release-check fixture file: ${fixtureName}/${fileName}`,
          detail: isFile(fixtureFile)
            ? `${fixtureName}/${fileName} exists.`
            : `${fixtureName}/${fileName} is missing.`,
          fix: `Restore scripts/fixtures/release-check/${fixtureName}/${fileName} or update the fixture contract.`,
        }),
      );
    }
  }
  return checks;
}

function runtimeChecks({ appRoot, packageJson, nodeVersion, npmVersion }) {
  const checks = [];
  const nodeEngine = packageJson?.engines?.node ?? '';
  const npmEngine = packageJson?.engines?.npm ?? '';

  checks.push(
    makeCheck({
      id: 'runtime/node-engine',
      group: 'runtime',
      status: nodeEngine && satisfiesEngine(nodeVersion, nodeEngine) ? 'pass' : 'fail',
      label: 'Node.js engine',
      detail: nodeEngine
        ? `Current Node ${nodeVersion} ${satisfiesEngine(nodeVersion, nodeEngine) ? 'satisfies' : 'does not satisfy'} package.json engines "${nodeEngine}".`
        : 'package.json does not declare engines.node.',
      fix: nodeEngine
        ? 'Run nvm install && nvm use from the app repo, or switch to a Node version allowed by package.json.'
        : 'Add the supported Node engine range to package.json.',
    }),
  );

  checks.push(
    makeCheck({
      id: 'runtime/npm-engine',
      group: 'runtime',
      status: npmEngine && npmVersion && satisfiesEngine(npmVersion, npmEngine) ? 'pass' : 'fail',
      label: 'npm engine',
      detail: npmEngine
        ? `Current npm ${npmVersion || 'unknown'} ${npmVersion && satisfiesEngine(npmVersion, npmEngine) ? 'satisfies' : 'does not satisfy'} package.json engines "${npmEngine}".`
        : 'package.json does not declare engines.npm.',
      fix: npmEngine ? 'Install a supported npm version, then rerun npm install or npm ci.' : 'Add the supported npm engine range to package.json.',
    }),
  );

  const nvmrc = readTextIfExists(path.join(appRoot, '.nvmrc'))?.trim();
  const nodeVersionFile = readTextIfExists(path.join(appRoot, '.node-version'))?.trim();
  if (nvmrc && nodeVersionFile) {
    checks.push(
      makeCheck({
        id: 'runtime/node-pin-parity',
        group: 'runtime',
        status: nvmrc === nodeVersionFile ? 'pass' : 'fail',
        label: 'Node pin parity',
        detail:
          nvmrc === nodeVersionFile
            ? `.nvmrc and .node-version both pin ${nvmrc}.`
            : `.nvmrc pins ${nvmrc}, but .node-version pins ${nodeVersionFile}.`,
        fix: 'Keep .nvmrc and .node-version byte-for-byte equivalent for the pinned local Node version.',
      }),
    );

    const parsedNode = parseVersion(nodeVersion);
    const parsedPin = parseVersion(nvmrc);
    if (parsedNode && parsedPin && compareVersions(parsedNode, parsedPin) !== 0) {
      checks.push(
        makeCheck({
          id: 'runtime/node-pin-current',
          group: 'runtime',
          status: satisfiesEngine(nodeVersion, nodeEngine) ? 'warn' : 'fail',
          label: 'Current Node pin match',
          detail: `Current Node ${versionLabel(parsedNode)} differs from pinned local Node ${versionLabel(parsedPin)}.`,
          fix: 'Use nvm use for exact local parity when reproducing maintainer reports. Compatible engine versions remain acceptable for CI.',
        }),
      );
    }
  }

  return checks;
}

export function resolvePlaywrightCacheRoot(appRoot, env, platform = process.platform) {
  if (env.PLAYWRIGHT_BROWSERS_PATH === '0') {
    return path.join(appRoot, 'node_modules', 'playwright-core', '.local-browsers');
  }

  if (env.PLAYWRIGHT_BROWSERS_PATH) {
    return env.PLAYWRIGHT_BROWSERS_PATH;
  }

  if (platform === 'win32') {
    return env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'ms-playwright') : '';
  }

  if (platform === 'darwin') {
    return env.HOME ? path.join(env.HOME, 'Library', 'Caches', 'ms-playwright') : '';
  }

  return env.HOME ? path.join(env.HOME, '.cache', 'ms-playwright') : '';
}

function directoryHasFiles(directoryPath) {
  try {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
    return entries.some((entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      return entry.isFile() || (entry.isDirectory() && directoryHasFiles(entryPath));
    });
  } catch {
    return false;
  }
}

export function findInstalledPlaywrightBrowsers(cacheRoot) {
  if (!cacheRoot || !isDirectory(cacheRoot)) {
    return [];
  }

  let entries = [];
  try {
    entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return REQUIRED_PLAYWRIGHT_BROWSERS.filter((browserName) =>
    entries.some((entry) => {
      if (!entry.isDirectory() || !entry.name.startsWith(`${browserName}-`)) {
        return false;
      }
      return directoryHasFiles(path.join(cacheRoot, entry.name));
    }),
  );
}

function localProfileChecks(appRoot, env) {
  const checks = [];
  const nodeModules = path.join(appRoot, 'node_modules');
  const playwrightPackage = path.join(nodeModules, 'playwright');

  checks.push(
    makeCheck({
      id: 'local/node-modules',
      group: 'local',
      status: isDirectory(nodeModules) ? 'pass' : 'fail',
      label: 'local npm dependencies',
      detail: isDirectory(nodeModules) ? 'node_modules exists.' : 'node_modules is missing.',
      fix: 'Run npm install from the app repo.',
    }),
  );

  checks.push(
    makeCheck({
      id: 'local/playwright-package',
      group: 'local',
      status: isDirectory(playwrightPackage) ? 'pass' : 'fail',
      label: 'Playwright package',
      detail: isDirectory(playwrightPackage)
        ? 'The Playwright package is installed under node_modules.'
        : 'The Playwright package is missing under node_modules.',
      fix: 'Run npm install, then npm run test:e2e:install if browser binaries are also missing.',
    }),
  );

  const cacheRoot = resolvePlaywrightCacheRoot(appRoot, env);
  const installedBrowsers = findInstalledPlaywrightBrowsers(cacheRoot);
  const missingBrowsers = REQUIRED_PLAYWRIGHT_BROWSERS.filter((browserName) => !installedBrowsers.includes(browserName));

  checks.push(
    makeCheck({
      id: 'local/playwright-cache',
      group: 'local',
      status: missingBrowsers.length === 0 ? 'pass' : 'warn',
      label: 'Playwright browser cache',
      detail:
        missingBrowsers.length === 0
          ? `Playwright browser payloads are installed at ${cacheRoot}: ${installedBrowsers.join(', ')}.`
          : `Playwright browser payloads are missing or incomplete for: ${missingBrowsers.join(', ')}.`,
      fix: 'Run npm run test:e2e:install before browser, PWA, or performance harness work.',
    }),
  );

  return checks;
}

function liveArtifactsIgnored(brainRoot) {
  if (isDirectory(path.join(brainRoot, '.git'))) {
    const result = spawnSync('git', ['-C', brainRoot, 'check-ignore', '-q', '--', LIVE_ARTIFACTS_IGNORE_SENTINEL], {
      stdio: 'ignore',
    });
    return result.status === 0;
  }

  const gitignore = readTextIfExists(path.join(brainRoot, '.gitignore')) ?? '';
  return gitignore
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .some((line) =>
      ['live-artifacts', 'live-artifacts/', 'live-artifacts/**', '/live-artifacts', '/live-artifacts/', '/live-artifacts/**'].includes(line),
    );
}

function brainChecks({ brainRoot, appOnly }) {
  if (appOnly) {
    return [
      makeCheck({
        id: 'brain/app-only',
        group: 'brain',
        status: 'pass',
        label: 'brain checks skipped',
        detail: 'Brain checkout checks were skipped because --app-only was provided.',
      }),
    ];
  }

  if (!isDirectory(brainRoot)) {
    return [
      makeCheck({
        id: 'brain/root',
        group: 'brain',
        status: 'fail',
        label: 'brain sibling checkout',
        detail: `Brain root does not exist: ${brainRoot}`,
        fix: `Clone or restore the sibling brain repo at ${DEFAULT_BRAIN_ROOT}, or pass --brain-root <path>.`,
      }),
    ];
  }

  const checks = REQUIRED_BRAIN_PATHS.map((item) => pathCheck(brainRoot, item, 'brain'));
  const agents = readTextIfExists(path.join(brainRoot, 'AGENTS.md'));
  const claude = readTextIfExists(path.join(brainRoot, 'CLAUDE.md'));
  const artifactsIgnored = liveArtifactsIgnored(brainRoot);
  checks.push(
    makeCheck({
      id: 'brain/agents-claude-parity',
      group: 'brain',
      status: agents !== null && claude !== null && agents === claude ? 'pass' : 'fail',
      label: 'AGENTS.md / CLAUDE.md parity',
      detail:
        agents !== null && claude !== null && agents === claude
          ? 'AGENTS.md and CLAUDE.md are byte-for-byte identical.'
          : 'AGENTS.md and CLAUDE.md are missing or diverged.',
      fix: 'Reconcile AGENTS.md and CLAUDE.md to the same content, then verify with cmp -s AGENTS.md CLAUDE.md.',
    }),
  );

  checks.push(
    makeCheck({
      id: 'brain/live-artifacts-ignore',
      group: 'brain',
      status: artifactsIgnored ? 'pass' : 'fail',
      label: 'live-artifacts ignored',
      detail: artifactsIgnored ? 'live-artifacts/ paths are ignored by Git.' : 'live-artifacts/ paths are not ignored by Git.',
      fix: 'Add live-artifacts/ to the brain repo .gitignore before collecting local screenshots or logs.',
    }),
  );

  return checks;
}

export function evaluateMaintainerEnvironment(options = {}, deps = {}) {
  const appRoot = path.resolve(options.appRoot ?? process.cwd());
  const brainRoot = resolveFromRoot(appRoot, options.brainRoot ?? DEFAULT_BRAIN_ROOT);
  const profile = options.profile ?? DEFAULT_PROFILE;
  const appOnly = Boolean(options.appOnly);
  const packagePath = path.join(appRoot, 'package.json');
  const packageResult = readJsonIfExists(packagePath);
  const packageJson = packageResult.value;
  const env = deps.env ?? process.env;
  const npmResult = deps.npmVersion ? { version: deps.npmVersion, error: '' } : readNpmVersion(appRoot, env);
  const checks = [];

  checks.push(
    makeCheck({
      id: 'app/root',
      group: 'runtime',
      status: isDirectory(appRoot) ? 'pass' : 'fail',
      label: 'app checkout',
      detail: isDirectory(appRoot) ? `App root exists: ${appRoot}` : `App root does not exist: ${appRoot}`,
      fix: 'Run the doctor from the optc-team-builder checkout or pass --app-root <path>.',
    }),
  );

  if (packageResult.error) {
    checks.push(
      makeCheck({
        id: 'app/package-json/read',
        group: 'runtime',
        status: 'fail',
        label: 'package.json readable',
        detail: `package.json could not be read: ${packageResult.error}`,
        fix: 'Restore a valid package.json before running maintainer workflows.',
      }),
    );
  } else {
    checks.push(
      makeCheck({
        id: 'app/package-json/read',
        group: 'runtime',
        status: 'pass',
        label: 'package.json readable',
        detail: 'package.json was parsed successfully.',
      }),
    );
  }

  checks.push(...runtimeChecks({ appRoot, packageJson, nodeVersion: deps.nodeVersion ?? process.version, npmVersion: npmResult.version }));

  if (npmResult.error) {
    checks.push(
      makeCheck({
        id: 'runtime/npm-command',
        group: 'runtime',
        status: 'fail',
        label: 'npm command',
        detail: `npm --version failed: ${npmResult.error}`,
        fix: 'Install npm with the active Node runtime and ensure npm is on PATH.',
      }),
    );
  }

  checks.push(...REQUIRED_APP_PATHS.map((item) => pathCheck(appRoot, item, 'app')));
  checks.push(...packageScriptChecks(packageJson));
  checks.push(...releaseFixtureChecks(appRoot));

  if (profile === 'local') {
    checks.push(...localProfileChecks(appRoot, env));
  } else {
    checks.push(
      makeCheck({
        id: 'ci/local-prerequisites-skipped',
        group: 'local',
        status: 'pass',
        label: 'local browser/cache prerequisites skipped',
        detail: 'CI profile skips local node_modules and browser cache checks.',
      }),
    );
  }

  checks.push(...brainChecks({ brainRoot, appOnly }));

  const summary = checks.reduce(
    (acc, check) => {
      acc.total += 1;
      acc[check.status] += 1;
      return acc;
    },
    { total: 0, pass: 0, warn: 0, fail: 0 },
  );

  return {
    schemaVersion: 1,
    profile,
    appOnly,
    appRoot,
    brainRoot,
    ok: summary.fail === 0,
    summary,
    checks,
  };
}

export function renderTextReport(report) {
  const lines = [
    'Maintainer environment doctor',
    `Profile: ${report.profile}`,
    `App root: ${report.appRoot}`,
    report.appOnly ? 'Brain root: skipped (--app-only)' : `Brain root: ${report.brainRoot}`,
    `Result: ${report.ok ? 'PASS' : 'FAIL'} (${report.summary.pass} passed, ${report.summary.warn} warning(s), ${report.summary.fail} failure(s))`,
    '',
  ];

  for (const check of report.checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.group}: ${check.label}`);
    lines.push(`  ${check.detail}`);
    if (check.fix && check.status !== 'pass') {
      lines.push(`  Fix: ${check.fix}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function parseArgs(argv) {
  const options = { format: 'text', profile: DEFAULT_PROFILE };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      options.format = 'json';
      continue;
    }

    if (arg === '--app-only') {
      options.appOnly = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--app-root' || arg === '--brain-root' || arg === '--profile') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.`);
      }
      options[arg.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--app-root=')) {
      options.appRoot = arg.slice('--app-root='.length);
      continue;
    }

    if (arg.startsWith('--brain-root=')) {
      options.brainRoot = arg.slice('--brain-root='.length);
      continue;
    }

    if (arg.startsWith('--profile=')) {
      options.profile = arg.slice('--profile='.length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!VALID_PROFILES.has(options.profile)) {
    throw new Error(`Unsupported --profile value: ${options.profile}. Use local or ci.`);
  }

  return options;
}

function usage() {
  return [
    'Usage: node scripts/maintainer-environment-doctor.mjs [--profile local|ci] [--app-root <path>] [--brain-root <path>] [--app-only] [--json]',
    '',
    'Examples:',
    '  npm run doctor:maintainer',
    '  npm run doctor:maintainer -- --profile=ci --brain-root ../optc-team-builder-brain',
  ].join('\n');
}

export async function runCli(argv = process.argv.slice(2), io = console, deps = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    io.log(usage());
    return 0;
  }

  const report = evaluateMaintainerEnvironment(options, deps);
  if (options.format === 'json') {
    io.log(JSON.stringify(report, null, 2));
  } else {
    io.log(renderTextReport(report).trimEnd());
  }
  return report.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[maintainer-doctor] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}

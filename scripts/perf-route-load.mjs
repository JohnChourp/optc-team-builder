#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, createReadStream, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import { chromium, devices } from 'playwright';

export const ROUTE_LOAD_SCHEMA_VERSION = 2;

export const ROUTE_LOAD_BUDGETS = Object.freeze({
  timings: {
    guideShareCompareReadyMs: { desktop: 1500, mobile: 2200 },
    manualShareLandingReadyMs: { desktop: 2500, mobile: 3500 },
    compareEntryReadyMs: { desktop: 3000, mobile: 4500 },
    charactersSearchReadyMs: { desktop: 1600, mobile: 2200 },
    savedTeamsReadyMs: { desktop: 2200, mobile: 2200 },
    captainCoverageReadyMs: { desktop: 3000, mobile: 4500 },
  },
  bundles: {
    initialRawBytes: 1_500_000,
    initialGzipBytes: 370_000,
    guideRawBytes: 14_000,
    manualShareRawBytes: 320_000,
    compareRawBytes: 740_000,
    charactersRawBytes: 170_000,
    savedTeamsRawBytes: 140_000,
    captainCoverageRawBytes: 330_000,
  },
});

const appRoot = process.cwd();
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = Number(process.env.PERF_ROUTE_LOAD_PORT ?? process.env.PERF_PORT ?? process.env.E2E_PORT ?? 8448);
const baseURL = process.env.PERF_BASE_URL ?? process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const artifactDir = process.env.PERF_ARTIFACT_DIR ?? path.join(appRoot, 'test-results/route-load-performance');
const runLabel = sanitizeSegment(process.env.PERF_RUN_LABEL ?? 'route-load');
const shouldAssert = process.env.PERF_ASSERT !== '0';
const shouldBuild = process.env.PERF_ROUTE_LOAD_BUILD !== '0';
const buildRoot = path.resolve(process.env.PERF_ROUTE_LOAD_BUILD_ROOT ?? path.join(appRoot, 'dist/optc-team-builder'));
const browserRoot = path.join(buildRoot, 'browser');
const statsPath = path.join(buildRoot, 'stats.json');
const screenshotDir = path.join(artifactDir, 'screenshots');
const consoleMessages = [];
const pageErrors = [];
const failures = [];
const SYNCHRONOUS_IMPORT_KINDS = new Set(['import-statement']);

export const ROUTE_LOAD_SYNTHETIC_TEAM = Object.freeze({
  id: 'route-load-budget-crew',
  name: 'Route Load Budget Crew',
  slots: [5056, 4551, 4520, 4408, 4267, null],
  shipId: null,
  notes: 'Synthetic route-load performance fixture.',
  createdAt: '2026-07-05T00:00:00.000Z',
  updatedAt: '2026-07-05T00:00:00.000Z',
});

export const ROUTE_LOAD_SAVED_TEAMS_COUNT = 72;

const ROUTE_LOAD_SAVED_TEAM_SLOT_IDS = Object.freeze([
  5056,
  4551,
  4520,
  4408,
  4267,
  4090,
  4265,
  4210,
  4211,
  4208,
  4209,
  4048,
]);

const routes = [
  {
    id: 'guide-share-compare',
    path: '/guides/guided-build-compare-team-sharing/',
    metricKey: 'guideShareCompareReadyMs',
    wait: async (page) => {
      await page
        .locator('ion-app')
        .getByRole('heading', { name: 'Guided Build, Compare Mode, and Team Sharing' })
        .first()
        .waitFor({ state: 'visible', timeout: 45_000 });
    },
  },
  {
    id: 'manual-share-landing',
    path: `/tabs/manual-team-builder?teamShare=${encodeURIComponent(buildSyntheticShareCode())}`,
    redactedPath: '/tabs/manual-team-builder?teamShare=<redacted-synthetic>',
    metricKey: 'manualShareLandingReadyMs',
    wait: async (page) => {
      await waitForShareLinkHydration(page);
    },
  },
  {
    id: 'compare-entry',
    path: '/tabs/auto-team-builder',
    metricKey: 'compareEntryReadyMs',
    wait: async (page) => {
      const compareToggle = page.getByTestId('compare-toggle');
      await compareToggle.waitFor({ state: 'visible', timeout: 60_000 });
      await compareToggle.click();
      await page.getByTestId('compare-empty-state').waitFor({ state: 'visible', timeout: 45_000 });
    },
  },
  {
    id: 'characters-search',
    path: '/tabs/characters',
    metricKey: 'charactersSearchReadyMs',
    wait: async (page) => {
      await page
        .locator('.character-card, .character-thumb-card')
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 });
      await page.locator('ion-searchbar').first().click();
      await page.keyboard.type('Monkey', { delay: 15 });
      await page
        .locator('.character-thumb-card[title*="Monkey"], .character-card:has-text("Monkey")')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
    },
  },
  {
    id: 'saved-teams-entry',
    path: '/tabs/saved-teams',
    metricKey: 'savedTeamsReadyMs',
    seedSavedTeams: true,
    wait: async (page) => {
      await page.getByText('Cold Start Team 1').first().waitFor({ state: 'visible', timeout: 60_000 });
      await page
        .locator('.saved-team-list .captain-condition-panel')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
    },
  },
  {
    id: 'captain-coverage-entry',
    path: '/tabs/captain-coverage',
    metricKey: 'captainCoverageReadyMs',
    wait: async (page) => {
      await page.locator('.results-toolbar').first().waitFor({ state: 'visible', timeout: 60_000 });
      await page
        .locator('.captain-result-list .captain-result, .panel-empty:not(:has(ion-spinner))')
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 });
    },
  },
];

await mkdir(screenshotDir, { recursive: true });
if (shouldBuild) {
  runProductionStatsBuild();
}

const bundle = await readBundleStats();
const server = process.env.PERF_BASE_URL || process.env.E2E_BASE_URL ? null : await startStaticServer();
let browser;

const results = {
  schemaVersion: ROUTE_LOAD_SCHEMA_VERSION,
  capturedAt: new Date().toISOString(),
  baseURL,
  appRepo: appRoot,
  appCommit: resolveGitHead(),
  artifactDir,
  runLabel,
  shouldAssert,
  budgets: ROUTE_LOAD_BUDGETS,
  fixture: {
    teamId: ROUTE_LOAD_SYNTHETIC_TEAM.id,
    teamName: ROUTE_LOAD_SYNTHETIC_TEAM.name,
    filledSlotCount: ROUTE_LOAD_SYNTHETIC_TEAM.slots.filter((slot) => slot !== null).length,
    shareCodeBytes: buildSyntheticShareCode().length,
    savedTeamsCount: ROUTE_LOAD_SAVED_TEAMS_COUNT,
    charactersSearchTerm: 'Monkey',
  },
  routes: routes.map((route) => ({
    id: route.id,
    path: route.redactedPath ?? route.path,
    metricKey: route.metricKey,
  })),
  bundle,
  viewportRuns: [],
  consoleMessages,
  pageErrors,
  failures,
};

try {
  browser = await chromium.launch();

  for (const viewport of [
    {
      label: 'desktop',
      viewport: { width: 1440, height: 1000 },
      isMobile: false,
      userAgent: devices['Desktop Chrome'].userAgent,
    },
    {
      label: 'mobile',
      ...devices['Pixel 7'],
    },
  ]) {
    const run = { viewport: viewport.label, timings: { routes: {} }, routeRuns: [] };
    for (const route of routes) {
      const context = await createRouteContext(viewport, route);
      try {
        const routeRun = await measureRoute(context, route, viewport.label);
        run.routeRuns.push(routeRun);
        run.timings.routes[route.metricKey] = routeRun.readyMs;
      } finally {
        await context.close().catch(() => {});
      }
    }

    results.viewportRuns.push(run);
    checkTimingBudgets(viewport.label, run.timings.routes);
  }

  checkBundleBudgets(bundle);
  await writeResults(results);

  if (shouldAssert && failures.length) {
    throw new Error(`Route-load guardrails failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
} finally {
  if (browser) {
    await closeBrowser(browser);
  }
  await stopStaticServer(server);
}

function sanitizeSegment(value) {
  return String(value).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'route-load';
}

function buildSyntheticShareCode(team = ROUTE_LOAD_SYNTHETIC_TEAM) {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      source: 'saved-team-share',
      exportedAt: '2026-07-05T00:00:00.000Z',
      team: {
        ...team,
        slots: [...team.slots],
      },
    }),
    'utf8',
  )
    .toString('base64')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

function runProductionStatsBuild() {
  const result = spawnSync(npmBin, ['run', 'build', '--', '--stats-json'], {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Production stats build failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function resolveGitHead() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: appRoot,
    encoding: 'utf8',
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

async function readBundleStats() {
  const stats = JSON.parse(await readFile(statsPath, 'utf8'));
  const outputs = stats.outputs ?? {};
  const initialEntries = await readInitialEntries(outputs);
  const initialFiles = new Set(initialEntries.map(({ file }) => file));

  const routeEntries = {
    guide: ['src/app/pages/seo-content/seo-content.page.ts'],
    manualShare: ['src/app/layout/tabs.page.ts', 'src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
    compare: ['src/app/layout/tabs.page.ts', 'src/app/pages/auto-team-builder/auto-team-builder.page.ts'],
    characters: ['src/app/layout/tabs.page.ts', 'src/app/pages/characters/characters.page.ts'],
    savedTeams: ['src/app/layout/tabs.page.ts', 'src/app/pages/saved-teams/saved-teams.page.ts'],
    captainCoverage: ['src/app/layout/tabs.page.ts', 'src/app/pages/captain-coverage/captain-coverage.page.ts'],
  };

  return {
    statsPath: path.relative(appRoot, statsPath).replace(/\\/gu, '/'),
    initial: {
      rawBytes: initialEntries.reduce((total, { output }) => total + (output.bytes ?? 0), 0),
      gzipBytes: initialEntries.reduce((total, { file }) => total + gzipOutputFile(file), 0),
      files: initialEntries.map(({ file, output, source }) => ({
        file,
        rawBytes: output.bytes ?? 0,
        gzipBytes: gzipOutputFile(file),
        entryPoint: output.entryPoint ?? null,
        source,
      })),
    },
    routes: Object.fromEntries(
      Object.entries(routeEntries).map(([key, entryPoints]) => {
        const found = entryPoints
          .map((entryPoint) => findOutputByEntryPoint(outputs, entryPoint))
          .filter(Boolean);

        if (found.length !== entryPoints.length) {
          const foundEntryPoints = new Set(found.map(([, output]) => output.entryPoint));
          const missing = entryPoints.filter((entryPoint) => !foundEntryPoints.has(entryPoint));
          failures.push(`Missing bundle stats for ${missing.join(', ')}.`);
          return [key, null];
        }

        return [key, outputStats(found, outputs, initialFiles)];
      }),
    ),
  };
}

function findOutputByEntryPoint(outputs, entryPoint) {
  return Object.entries(outputs).find(([, output]) => String(output.entryPoint ?? '').endsWith(entryPoint)) ?? null;
}

async function readInitialEntries(outputs) {
  const indexPath = path.join(browserRoot, 'index.html');
  const scriptFiles = extractInitialScriptFiles(await readFile(indexPath, 'utf8'));

  if (!scriptFiles.length) {
    throw new Error(`No initial JavaScript scripts found in ${path.relative(appRoot, indexPath)}.`);
  }

  const entries = new Map();

  for (const scriptFile of scriptFiles) {
    const outputKey = resolveStatsOutputKey(scriptFile, outputs);

    if (!outputKey) {
      const filePath = resolveOutputFilePath(scriptFile);
      const fileStat = await stat(filePath);
      entries.set(scriptFile, {
        file: scriptFile,
        output: {
          bytes: fileStat.size,
          entryPoint: null,
        },
        source: 'index.html',
      });
      continue;
    }

    addInitialStatsEntry(entries, outputKey, outputs, 'index.html');
    for (const importedKey of collectImportedOutputKeys(outputKey, outputs)) {
      addInitialStatsEntry(entries, importedKey, outputs, outputKey);
    }
  }

  if (!entries.size) {
    throw new Error(`No initial JavaScript bundle entries could be resolved from ${path.relative(appRoot, indexPath)}.`);
  }

  return [...entries.values()];
}

function addInitialStatsEntry(entries, outputKey, outputs, source) {
  if (!outputs[outputKey] || entries.has(outputKey)) {
    return;
  }

  entries.set(outputKey, {
    file: outputKey,
    output: outputs[outputKey],
    source,
  });
}

function extractInitialScriptFiles(indexHtml) {
  const scripts = new Set();
  const scriptPattern = /<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/giu;
  let match;

  while ((match = scriptPattern.exec(indexHtml))) {
    const src = String(match[2] ?? '').trim();

    if (!src || /^(?:https?:)?\/\//iu.test(src)) {
      continue;
    }

    const normalized = normalizeOutputPath(src);
    if (normalized.endsWith('.js')) {
      scripts.add(normalized);
    }
  }

  return [...scripts];
}

function resolveStatsOutputKey(file, outputs) {
  const normalized = normalizeOutputPath(file);
  const withoutBrowserPrefix = normalized.replace(/^browser\//u, '');
  const basename = path.posix.basename(normalized);
  const candidates = [normalized, withoutBrowserPrefix, `browser/${withoutBrowserPrefix}`, basename];

  for (const candidate of candidates) {
    if (outputs[candidate]) {
      return candidate;
    }
  }

  const basenameMatches = Object.keys(outputs).filter(
    (key) => key.endsWith('.js') && path.posix.basename(key) === basename,
  );

  return basenameMatches.length === 1 ? basenameMatches[0] : null;
}

function normalizeOutputPath(value) {
  return String(value)
    .split('#')[0]
    .split('?')[0]
    .replace(/\\/gu, '/')
    .replace(/^\.?\//u, '')
    .replace(/^\/+/u, '');
}

function outputStats(outputEntries, outputs, initialFiles) {
  const outputKeys = [];
  const selected = new Set();

  for (const [outputKey] of outputEntries) {
    for (const key of [outputKey, ...collectImportedOutputKeys(outputKey, outputs, initialFiles)]) {
      if (!initialFiles.has(key) && !selected.has(key)) {
        selected.add(key);
        outputKeys.push(key);
      }
    }
  }

  const rawBytes = outputKeys.reduce((total, key) => total + (outputs[key]?.bytes ?? 0), 0);
  const gzipBytes = outputKeys.reduce((total, key) => total + gzipOutputFile(key), 0);
  const primaryEntry = outputEntries[outputEntries.length - 1];

  return {
    file: primaryEntry[0],
    rawBytes,
    gzipBytes,
    entryPoint: primaryEntry[1].entryPoint ?? null,
    entryFiles: outputEntries.map(([file, output]) => ({
      file,
      entryPoint: output.entryPoint ?? null,
    })),
    files: outputKeys.map((key) => ({
      file: key,
      rawBytes: outputs[key]?.bytes ?? 0,
      gzipBytes: gzipOutputFile(key),
      imported: !outputEntries.some(([file]) => file === key),
    })),
    topInputs: topInputsForOutputs(outputKeys, outputs),
  };
}

function collectImportedOutputKeys(outputKey, outputs, excludedFiles = new Set(), seen = new Set([outputKey])) {
  const imported = [];
  const output = outputs[outputKey];

  for (const item of output?.imports ?? []) {
    const importedKey = item?.path;

    if (
      typeof importedKey !== 'string' ||
      !importedKey.endsWith('.js') ||
      !SYNCHRONOUS_IMPORT_KINDS.has(item?.kind) ||
      excludedFiles.has(importedKey) ||
      seen.has(importedKey) ||
      !outputs[importedKey]
    ) {
      continue;
    }

    seen.add(importedKey);
    imported.push(importedKey, ...collectImportedOutputKeys(importedKey, outputs, excludedFiles, seen));
  }

  return imported;
}

function topInputsForOutputs(outputKeys, outputs) {
  const inputTotals = new Map();

  for (const key of outputKeys) {
    for (const [inputPath, input] of Object.entries(outputs[key]?.inputs ?? {})) {
      inputTotals.set(inputPath, (inputTotals.get(inputPath) ?? 0) + Math.round(input.bytesInOutput ?? 0));
    }
  }

  return [...inputTotals.entries()]
      .map(([inputPath, input]) => ({
        path: inputPath,
        bytesInOutput: input,
      }))
      .sort((left, right) => right.bytesInOutput - left.bytesInOutput)
      .slice(0, 12);
}

function gzipOutputFile(file) {
  const filePath = resolveOutputFilePath(file);

  return gzipSync(readFileSync(filePath)).length;
}

function resolveOutputFilePath(file) {
  const normalized = String(file).replace(/\\/gu, '/').replace(/^\/+/u, '');
  const candidates = [
    path.resolve(browserRoot, ...normalized.split('/')),
    path.resolve(buildRoot, ...normalized.split('/')),
    path.resolve(browserRoot, path.basename(normalized)),
  ];
  const resolvedBuildRoot = path.resolve(buildRoot);

  for (const candidate of candidates) {
    if (
      (candidate === resolvedBuildRoot || candidate.startsWith(`${resolvedBuildRoot}${path.sep}`)) &&
      existsSync(candidate)
    ) {
      return candidate;
    }
  }

  throw new Error(`Missing emitted bundle file for stats output ${file}.`);
}

function buildSyntheticSavedTeams() {
  return Array.from({ length: ROUTE_LOAD_SAVED_TEAMS_COUNT }, (_, index) => ({
    id: `cold-start-team-${String(index + 1).padStart(3, '0')}`,
    name: `Cold Start Team ${index + 1}`,
    notes: 'Synthetic cold-start route performance fixture.',
    shipId: null,
    slots: Array.from(
      { length: 6 },
      (__, slotIndex) => ROUTE_LOAD_SAVED_TEAM_SLOT_IDS[(index + slotIndex) % ROUTE_LOAD_SAVED_TEAM_SLOT_IDS.length] ?? null,
    ),
    createdAt: '2026-07-07T00:00:00.000Z',
    updatedAt: '2026-07-07T00:00:00.000Z',
  }));
}

async function createRouteContext(viewport, route) {
  const context = await browser.newContext({
    baseURL,
    viewport: viewport.viewport,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    userAgent: viewport.userAgent,
    serviceWorkers: 'block',
  });
  await context.addInitScript((seededSavedTeams) => {
    localStorage.setItem('CapacitorStorage.appLanguage', 'en');
    localStorage.setItem('CapacitorStorage.analyticsConsent', 'rejected');
    if (seededSavedTeams.length) {
      localStorage.setItem('CapacitorStorage.savedTeams', JSON.stringify(seededSavedTeams));
    }
  }, route.seedSavedTeams ? buildSyntheticSavedTeams() : []);

  return context;
}

async function startStaticServer() {
  const mime = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.wasm', 'application/wasm'],
    ['.txt', 'text/plain; charset=utf-8'],
  ]);

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(url.pathname);

      if (pathname.endsWith('/')) {
        pathname += 'index.html';
      }

      let filePath = path.normalize(path.join(browserRoot, pathname));
      if (!filePath.startsWith(browserRoot)) {
        response.writeHead(403);
        response.end('forbidden');
        return;
      }

      if (!existsSync(filePath) || !(await stat(filePath)).isFile()) {
        filePath = path.join(browserRoot, 'index.html');
      }

      response.writeHead(200, {
        'content-type': mime.get(path.extname(filePath)) ?? 'application/octet-stream',
      });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`Static server request failed: ${message}`);
      response.writeHead(500);
      response.end('internal server error');
    }
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.listen(port, '127.0.0.1', onListening);
  });
  return server;
}

async function stopStaticServer(server) {
  if (!server) {
    return;
  }

  await new Promise((resolve) => server.close(resolve));
}

async function closeBrowser(activeBrowser) {
  await Promise.race([activeBrowser.close(), delay(5000)]);
}

async function measureRoute(context, route, viewportLabel) {
  const page = await context.newPage();
  attachPageDiagnostics(page, route.id, viewportLabel);
  const startedAt = performance.now();

  try {
    await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForAppReady(page);
    await route.wait(page);
    await waitForAngular(page).catch(() => true);

    const readyMs = Math.round(performance.now() - startedAt);
    const screenshot = `screenshots/${runLabel}-${viewportLabel}-${route.id}.png`;
    await page.screenshot({
      path: path.join(artifactDir, screenshot),
      fullPage: true,
      timeout: 10_000,
    });

    return {
      id: route.id,
      path: route.redactedPath ?? route.path,
      readyMs,
      screenshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${viewportLabel} ${route.id}: ${message}`);

    return {
      id: route.id,
      path: route.redactedPath ?? route.path,
      readyMs: null,
      error: message,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function attachPageDiagnostics(page, routeId, viewportLabel) {
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) {
      return;
    }

    consoleMessages.push({
      viewport: viewportLabel,
      route: routeId,
      type: message.type(),
      text: sanitizeDiagnosticText(message.text()),
    });
  });

  page.on('pageerror', (error) => {
    pageErrors.push({
      viewport: viewportLabel,
      route: routeId,
      message: sanitizeDiagnosticText(error.message),
      stack: error.stack ? sanitizeDiagnosticText(error.stack) : null,
    });
  });
}

function sanitizeDiagnosticText(value) {
  return String(value ?? '').replace(/teamShare=[^&#\s'"<>)]+/gu, 'teamShare=<redacted-synthetic>');
}

async function waitForAppReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('ion-app').first().waitFor({ state: 'attached', timeout: 45_000 });
  await waitForAngular(page).catch(() => true);
}

async function waitForAngular(page) {
  await page.waitForFunction(
    () => {
      const testabilities = window.getAllAngularTestabilities?.() ?? [];

      if (!testabilities.length) {
        return true;
      }

      return Promise.all(
        testabilities.map(
          (testability) =>
            new Promise((resolve) => {
              testability.whenStable(resolve);
            }),
        ),
      ).then(() => true);
    },
    undefined,
    { timeout: 60_000 },
  );
}

async function waitForShareLinkHydration(page) {
  const shareError = page.getByTestId('manual-share-error');

  const name = await waitForIonInputValue(page.getByTestId('manual-team-name'), ROUTE_LOAD_SYNTHETIC_TEAM.name);
  if (!name.ok) {
    throw new Error(`Manual Team Builder did not render the synthetic team name; observed ${JSON.stringify(name.observedValue)}.`);
  }

  const notes = await waitForIonInputValue(page.getByTestId('manual-team-notes'), ROUTE_LOAD_SYNTHETIC_TEAM.notes);
  if (!notes.ok) {
    throw new Error(`Manual Team Builder did not render the synthetic team notes; observed ${JSON.stringify(notes.observedValue)}.`);
  }

  await page
    .getByTestId('manual-team-slot-0')
    .getByText('Sergeant Helmeppo')
    .first()
    .waitFor({ state: 'visible', timeout: 45_000 });

  if (await shareError.isVisible().catch(() => false)) {
    const text = ((await shareError.textContent().catch(() => '')) ?? '').replace(/\s+/gu, ' ').trim();
    throw new Error(`Manual Team Builder reported a share-link decoding error: ${text}`);
  }
}

async function ionInputValue(locator) {
  return locator.evaluate(async (element) => {
    await element.componentOnReady?.();
    return element.value ?? element.querySelector('input, textarea')?.value ?? '';
  });
}

async function waitForIonInputValue(locator, expectedValue) {
  const deadline = Date.now() + 45_000;
  let observedValue = '';

  while (Date.now() < deadline) {
    try {
      await locator.waitFor({
        state: 'attached',
        timeout: Math.min(500, Math.max(1, deadline - Date.now())),
      });
      observedValue = await ionInputValue(locator);

      if (observedValue === expectedValue) {
        return { ok: true, observedValue };
      }
    } catch {
      // Keep polling until the hydrated field is available or the timeout expires.
    }

    await delay(250);
  }

  return { ok: false, observedValue };
}

function checkTimingBudgets(viewportLabel, timings) {
  if (!shouldAssert) {
    return;
  }

  for (const [metricKey, viewportBudgets] of Object.entries(ROUTE_LOAD_BUDGETS.timings)) {
    const actual = timings[metricKey];
    const budget = viewportBudgets[viewportLabel];

    if (Number.isFinite(actual) && Number.isFinite(budget) && actual > budget) {
      failures.push(`${viewportLabel} ${metricKey}: ${actual}ms > ${budget}ms`);
    }
  }
}

function checkBundleBudgets(bundle) {
  if (!shouldAssert) {
    return;
  }

  const checks = [
    ['initial raw JS', bundle.initial.rawBytes, ROUTE_LOAD_BUDGETS.bundles.initialRawBytes, 'bytes'],
    ['initial gzip JS', bundle.initial.gzipBytes, ROUTE_LOAD_BUDGETS.bundles.initialGzipBytes, 'bytes'],
    ['guide route raw JS', bundle.routes.guide?.rawBytes, ROUTE_LOAD_BUDGETS.bundles.guideRawBytes, 'bytes'],
    [
      'manual share route raw JS',
      bundle.routes.manualShare?.rawBytes,
      ROUTE_LOAD_BUDGETS.bundles.manualShareRawBytes,
      'bytes',
    ],
    ['compare route raw JS', bundle.routes.compare?.rawBytes, ROUTE_LOAD_BUDGETS.bundles.compareRawBytes, 'bytes'],
    [
      'characters route raw JS',
      bundle.routes.characters?.rawBytes,
      ROUTE_LOAD_BUDGETS.bundles.charactersRawBytes,
      'bytes',
    ],
    [
      'saved teams route raw JS',
      bundle.routes.savedTeams?.rawBytes,
      ROUTE_LOAD_BUDGETS.bundles.savedTeamsRawBytes,
      'bytes',
    ],
    [
      'captain coverage route raw JS',
      bundle.routes.captainCoverage?.rawBytes,
      ROUTE_LOAD_BUDGETS.bundles.captainCoverageRawBytes,
      'bytes',
    ],
  ];

  for (const [label, actual, budget, unit] of checks) {
    if (Number.isFinite(actual) && Number.isFinite(budget) && actual > budget) {
      failures.push(`${label}: ${actual}${unit} > ${budget}${unit}`);
    }
  }
}

async function writeResults(report) {
  await writeFile(
    path.join(artifactDir, `${runLabel}-performance.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

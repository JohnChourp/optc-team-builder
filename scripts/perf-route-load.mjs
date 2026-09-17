#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, createReadStream, readFileSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import { chromium, devices } from 'playwright';

import { measurePrefetchPayload } from './lib/prefetch-payload.mjs';

export const ROUTE_LOAD_SCHEMA_VERSION = 2;

/**
 * 869f1vu91. What these numbers are, and what they are not.
 *
 * They were recalibrated on 2026-09-14 because **not one timing budget had been met on a single
 * day since 2026-09-03** - the report said `failed` on all nine recorded runs while the workflow
 * stayed green, because nothing asserted them. A budget that has never been met is not a budget.
 *
 * The two halves are deliberately not the same kind of thing:
 *
 * - **`timings` are ADVISORY.** They run on a shared GitHub runner whose speed moves by about
 *   ±35% day to day - on 2026-09-09 *every* metric came in ~40% faster with no code change. A
 *   hard gate on that measures the runner as much as the app. They are set to
 *   `ceil(max since 2026-09-07 x 1.15)`, so they catch a gross regression and stay quiet about
 *   weather. The 09-07 cutoff is the current architecture: it follows the Ionic 9 migration and
 *   the captain-coverage rework. Without it the stale 7603ms captain-coverage outlier from 09-02
 *   would justify a 9200ms budget, which would catch nothing ever again.
 * - **`bundles` are HARD, and gate the nightly run.** Bytes are reproducible to 0.01% across
 *   runs (178_855 / 178_852 / 178_870 on three consecutive days), so there is no weather to
 *   absorb. They are set to `ceil(current main x 1.03)` - enough headroom for a dependency patch,
 *   not enough to hide a feature quietly arriving.
 *
 * Only budgets that were FAILING were changed. The ones already met were left alone: tightening a
 * passing budget adds flake risk and proves nothing.
 *
 * `scripts/perf-budget-report.spec.ts` asserts this table matches the copy in
 * `perf-budget-report.mjs`, because the two files each need the numbers and a divergence would
 * mean the harness and the report disagree about the same metric.
 */
export const ROUTE_LOAD_BUDGETS = Object.freeze({
  timings: {
    guideShareCompareReadyMs: { desktop: 1500, mobile: 2200 },
    manualShareLandingReadyMs: { desktop: 4000, mobile: 3500 },
    compareEntryReadyMs: { desktop: 3000, mobile: 4500 },
    charactersSearchReadyMs: { desktop: 3700, mobile: 3200 },
    savedTeamsReadyMs: { desktop: 6100, mobile: 5700 },
    captainCoverageReadyMs: { desktop: 3900, mobile: 4500 },
    /*
     * 869f138qd. From navigation to the `optc:dataset-ready` mark on /tabs/characters, in its own
     * fresh context. Mobile runs at 4x CPU, desktop unthrottled - see measureDatasetReady.
     * Provisional: one observation each on 2026-09-16 on an M4 Pro - desktop 141 ms, mobile
     * 437 ms - with about 5x room for a slower CI machine until there is history to set it from.
     */
    datasetReadyMs: { desktop: 700, mobile: 2200 },
  },
  bundles: {
    /*
     * 869f135rq. `initialRawBytes` and `initialGzipBytes` measure the ENTRY
     * SCRIPTS - the two files `index.html` names, `main-*.js` and
     * `app-config.js`. They do not measure the initial payload, and the old
     * values are the proof: 1_500_000 and 383_000 against a real 378_675 and
     * 96_700 is ~3.96x on both, which is not a margin anybody chooses. They are
     * almost exactly the INITIAL GRAPH figures below, so the budget was read off
     * Angular's `Initial total` and written against a metric that measures a
     * quarter of it. A check whose budget came from a different measurement than
     * its metric cannot catch anything, which is the whole subject of
     * 869f135rj.
     *
     * Both pairs are now set from their own measurement x1.03, the margin this
     * file already uses for bytes because bytes are reproducible to 0.01% across
     * runs. Measured 2026-09-15 on v0.4.48.
     *
     *   entry scripts   378_675 raw / 96_700 gzip    (2 files)
     *   initial graph  1_491_088 raw / 375_577 gzip  (20 files)
     *
     * The graph pair is the cost of a first visit and of every service-worker
     * upgrade, so it is the one to watch. The entry pair is kept because it is
     * the only number that isolates `main` itself, and its history goes back to
     * 2026-09-03 under the same metric id.
     *
     * `angular.json` keeps a deliberately coarser `initial` budget over the same
     * graph: these are the gate, that is the backstop, and the split is recorded
     * beside it.
     */
    initialRawBytes: 391_000,
    initialGzipBytes: 100_000,
    initialGraphRawBytes: 1_536_000,
    initialGraphGzipBytes: 387_000,
    guideRawBytes: 14_000,
    manualShareRawBytes: 320_000,
    compareRawBytes: 740_000,
    /*
     * 869f138qh. Re-set from 186_000, which b06342bd set on 2026-09-14 and the route passed a day
     * later: v0.4.48, built with the same toolchain as main, measures 186,778 B and main 186,760 B,
     * so the growth is the shipped wave-3 work, not a regression waiting to be found. It went
     * unreported because the scheduled workflow failed earlier, on the compare harness. x1.03 of
     * main, like the other byte rows.
     */
    charactersRawBytes: 192_400,
    savedTeamsRawBytes: 187_000,
    captainCoverageRawBytes: 330_000,
    /*
     * 869f138qh. What the service worker prefetches, measured from the build's ngsw.json on
     * 2026-09-16 (scripts/lib/prefetch-payload.mjs). `Cached` is the file as the device stores it;
     * `wire` is gzip level 6 for types the edge compresses and the file itself otherwise. x1.03 like
     * every byte row, except the cached total, which is x1.05 and shared with the dataset-delivery
     * lane - see PREFETCH_CACHED_BUDGET_BYTES there for why.
     *
     * 869f138qm re-measured them on 2026-09-17, after the ability catalogue stopped being written
     * pretty-printed: 880,193 B of it were indentation. Nothing else about the build changed, and
     * the whole drop in the prefetch total is that file.
     *
     *   prefetch total    8,716,771 cached / 4,033,008 wire   (152 files)
     *   dataset database  2,289,988
     *   ability catalogue   794,328 cached /   139,403 wire
     *   sql.js wasm         658,410 cached /   322,606 wire
     */
    prefetchCachedBytes: 9_153_000,
    prefetchWireBytes: 4_154_000,
    databaseBytes: 2_358_700,
    abilityCatalogCachedBytes: 818_200,
    abilityCatalogWireBytes: 143_600,
    sqlWasmWireBytes: 332_300,
  },
});

/*
 * 869f138qd. Opening the database is CPU work, and an unthrottled Pixel 7 profile is a desktop CPU
 * behind a small window - so the mobile run throttles 4x, the rate the wave-5 lab and live checks
 * used, and the desktop run does not. Declared up here because the top-level run below reads
 * them, and a const further down would still be in its temporal dead zone.
 */
const DATASET_READY_CPU_THROTTLING = Object.freeze({ desktop: 1, mobile: 4 });
const DATASET_READY_MARK = 'optc:dataset-ready';

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
/*
 * 869f1vu91. Timing breaches land here instead of `failures`, so this harness agrees with
 * `perf-budget-report.mjs`: bundle bytes gate, wall-clock timings on a shared runner report. When
 * the two disagreed, the same metric could fail the harness and pass the report in one job.
 */
const advisories = [];
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

const bundle = { ...(await readBundleStats()), payload: measurePrefetchPayload(browserRoot) };
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
  advisories,
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

    run.timings.dataset = { datasetReadyMs: await measureDatasetReady(viewport) };
    results.viewportRuns.push(run);
    checkTimingBudgets(viewport.label, { ...run.timings.routes, ...run.timings.dataset });
  }

  checkBundleBudgets(bundle);
  await writeResults(results);

  if (advisories.length) {
    process.stdout.write(
      `[route-load] ${advisories.length} advisory timing budget(s) exceeded (reported, not gating):\n${advisories
        .map((advisory) => `- ${advisory}`)
        .join('\n')}\n`,
    );
  }

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

  const routeEntries = {
    guide: ['src/app/pages/seo-content/seo-content.page.ts'],
    manualShare: ['src/app/layout/tabs.page.ts', 'src/app/pages/manual-team-builder/manual-team-builder.page.ts'],
    compare: ['src/app/layout/tabs.page.ts', 'src/app/pages/auto-team-builder/auto-team-builder.page.ts'],
    characters: ['src/app/layout/tabs.page.ts', 'src/app/pages/characters/characters.page.ts'],
    savedTeams: ['src/app/layout/tabs.page.ts', 'src/app/pages/saved-teams/saved-teams.page.ts'],
    captainCoverage: ['src/app/layout/tabs.page.ts', 'src/app/pages/captain-coverage/captain-coverage.page.ts'],
  };

  const graphFiles = collectInitialGraphFiles(
    initialEntries.map(({ file }) => file),
    outputs,
  );
  /*
   * 869f138qh. A route chunk is whatever the route adds on top of the initial payload, so the
   * graph is what gets excluded - not just the entry scripts, which are now counted on their own.
   */
  const initialFiles = new Set(graphFiles);

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
    initialGraph: {
      fileCount: graphFiles.length,
      rawBytes: graphFiles.reduce((total, file) => total + (outputs[file]?.bytes ?? 0), 0),
      gzipBytes: graphFiles.reduce((total, file) => total + gzipOutputFile(file), 0),
      files: graphFiles.map((file) => ({
        file,
        rawBytes: outputs[file]?.bytes ?? 0,
        gzipBytes: gzipOutputFile(file),
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

/**
 * 869f135rq. Everything a first visit actually downloads, not just what
 * `index.html` names.
 *
 * `readInitialEntries` returns the `<script src>` tags, which on this build are
 * exactly two files: `main-*.js` and `app-config.js`, 378_675 bytes together.
 * That is where the number in the `initial raw JS` budget came from, and it is
 * NOT the initial payload: `main` statically imports 18 further chunks, and a
 * browser fetches every one of them before the app runs. The real figure is
 * 1_491_088 bytes across 20 files - measured 2026-09-15 on v0.4.48, and equal to
 * Angular's own `Initial total` of 1.55 MB once its 58.81 kB of CSS is removed,
 * which is the cross-check that the two agree.
 *
 * Walking `import-statement` edges and stopping at `dynamic-import` is exactly
 * the line between "arrives on the first visit" and "arrives when the reader
 * navigates", which is what the per-route budgets below already measure.
 */
function collectInitialGraphFiles(entryFiles, outputs) {
  const seen = new Set();
  const stack = [...entryFiles];

  while (stack.length > 0) {
    const file = stack.pop();
    const key = resolveStatsOutputKey(file, outputs);

    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);

    for (const dependency of outputs[key].imports ?? []) {
      if (dependency.kind === 'dynamic-import') {
        continue;
      }
      const dependencyKey = resolveStatsOutputKey(dependency.path, outputs);
      if (dependencyKey && !seen.has(dependencyKey)) {
        stack.push(dependencyKey);
      }
    }
  }

  return [...seen];
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

    /*
     * 869f138qh. Only the file itself. This loop also added every chunk the entry imports, which made
     * `entry script` the same number as `initial payload` - 1,498,225 B against a 391,000 B budget
     * on v0.4.53 - whenever the stats resolved the file. docs/bundle-budgets.md defines entry
     * scripts as the files index.html names and nothing else; the graph has its own rows.
     */
    addInitialStatsEntry(entries, outputKey, outputs, 'index.html');
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
    await waitForAppAttached(page);
    await route.wait(page);

    const readyMs = Math.round(performance.now() - startedAt);
    /*
     * 869f135rc. When the reader first sees ANYTHING, recorded but not budgeted.
     *
     * `readyMs` is when the route is usable; this is when the screen stops being
     * blank, which is a different question and the one that subtask asks. It is
     * recorded rather than gated because a budget in this repository is set from
     * history, and this metric has none yet - one run is a number, not a budget.
     *
     * Note what it does NOT prove: the shell has always painted a spinner, so FCP
     * was already early. What changed in 869f135rc is what that paint CONTAINS.
     * A timing cannot see that, which is why the screenshot beside it is the
     * evidence and this is only the guard against a regression.
     */
    const firstContentfulPaintMs = await page
      .evaluate(() => {
        const entry = performance.getEntriesByName('first-contentful-paint')[0];

        return entry ? Math.round(entry.startTime) : null;
      })
      .catch(() => null);
    const screenshot = `screenshots/${runLabel}-${viewportLabel}-${route.id}.png`;
    await page.screenshot({
      path: path.join(artifactDir, screenshot),
      fullPage: true,
      timeout: 10_000,
    });

    return {
      id: route.id,
      firstContentfulPaintMs,
      path: route.redactedPath ?? route.path,
      readyMs,
      screenshot,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${viewportLabel} ${route.id}: ${message}`);

    return {
      id: route.id,
      firstContentfulPaintMs: null,
      path: route.redactedPath ?? route.path,
      readyMs: null,
      error: message,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function measureDatasetReady(viewport) {
  const context = await createRouteContext(viewport, {});
  const page = await context.newPage();
  attachPageDiagnostics(page, 'dataset-ready', viewport.label);

  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: DATASET_READY_CPU_THROTTLING[viewport.label] ?? 1,
    });
    await page.goto('/tabs/characters', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const handle = await page.waitForFunction(
      (name) => {
        const entry = performance.getEntriesByName(name)[0];
        return entry ? { startTime: entry.startTime, source: entry.detail?.source ?? null } : null;
      },
      DATASET_READY_MARK,
      { timeout: 60_000 },
    );
    const { startTime, source } = await handle.jsonValue();

    /* A fast number from the fallback would be a pass for the wrong reason. */
    if (source !== 'database-file') {
      failures.push(`${viewport.label} dataset-ready: the database came from ${source}, not the database file`);
    }

    return Math.round(startTime);
  } catch (error) {
    failures.push(`${viewport.label} dataset-ready: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
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

/*
 * Named for what it proves. It used to end with `waitForAngular`, which polled
 * `window.getAllAngularTestabilities` and returned true whenever that list was
 * empty - and under `bootstrapApplication` it is ALWAYS empty, because
 * testability ships with `BrowserModule`/`provideProtractorTestingSupport()` and
 * this app uses neither. So it resolved on its first poll every time and this
 * function has only ever waited for attachment.
 *
 * Deleting it is behaviour-neutral for exactly that reason, and it stops the
 * next reader trusting a wait that never waited.
 */
async function waitForAppAttached(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('ion-app').first().waitFor({ state: 'attached', timeout: 45_000 });
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
      advisories.push(`${viewportLabel} ${metricKey}: ${actual}ms > ${budget}ms`);
    }
  }
}

function checkBundleBudgets(bundle) {
  if (!shouldAssert) {
    return;
  }

  const checks = [
    ['entry script raw JS', bundle.initial.rawBytes, ROUTE_LOAD_BUDGETS.bundles.initialRawBytes, 'bytes'],
    ['entry script gzip JS', bundle.initial.gzipBytes, ROUTE_LOAD_BUDGETS.bundles.initialGzipBytes, 'bytes'],
    [
      'initial payload raw JS',
      bundle.initialGraph.rawBytes,
      ROUTE_LOAD_BUDGETS.bundles.initialGraphRawBytes,
      'bytes',
    ],
    [
      'initial payload gzip JS',
      bundle.initialGraph.gzipBytes,
      ROUTE_LOAD_BUDGETS.bundles.initialGraphGzipBytes,
      'bytes',
    ],
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
    ['prefetch total cached', bundle.payload.cachedBytes, ROUTE_LOAD_BUDGETS.bundles.prefetchCachedBytes, 'bytes'],
    ['prefetch total over the wire', bundle.payload.wireBytes, ROUTE_LOAD_BUDGETS.bundles.prefetchWireBytes, 'bytes'],
    ['dataset database', bundle.payload.databaseBytes, ROUTE_LOAD_BUDGETS.bundles.databaseBytes, 'bytes'],
    [
      'ability catalogue cached',
      bundle.payload.abilityCatalogCachedBytes,
      ROUTE_LOAD_BUDGETS.bundles.abilityCatalogCachedBytes,
      'bytes',
    ],
    [
      'ability catalogue over the wire',
      bundle.payload.abilityCatalogWireBytes,
      ROUTE_LOAD_BUDGETS.bundles.abilityCatalogWireBytes,
      'bytes',
    ],
    ['sql.js wasm over the wire', bundle.payload.sqlWasmWireBytes, ROUTE_LOAD_BUDGETS.bundles.sqlWasmWireBytes, 'bytes'],
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

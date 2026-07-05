#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

export const MEMORY_PRESSURE_SCHEMA_VERSION = 1;

const taskId = '869dwcee1';
const appRoot = process.cwd();
const port = Number(process.env.PERF_PORT ?? process.env.E2E_PORT ?? 8441);
const baseURL = process.env.PERF_BASE_URL ?? process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const artifactDir = process.env.PERF_ARTIFACT_DIR ?? resolveDefaultArtifactDir();
const runLabel = sanitizeSegment(process.env.PERF_RUN_LABEL ?? 'memory-pressure');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const compareSavedTeams = buildSavedTeams(1200, 'memory-compare-team', 'Memory Compare Team');
const compareLeftSavedTeam = buildSavedTeams(1, 'memory-left-team', 'Memory Left Team')[0];
const savedTeamsImportTeams = buildSavedTeams(700, 'memory-import-team', 'Memory Import Team');
const savedTeamsImportPayload = buildSavedTeamsTransferJson(savedTeamsImportTeams);
const comparePayload = buildSavedTeamsTransferJson(compareSavedTeams);
const consoleMessages = [];
const pageErrors = [];
const failures = [];
const warnings = [];
const results = {
  schemaVersion: MEMORY_PRESSURE_SCHEMA_VERSION,
  taskId,
  capturedAt: new Date().toISOString(),
  baseURL,
  appRepo: appRoot,
  appCommit: resolveGitHead(),
  artifactDir,
  runLabel,
  lowEndProfile: {
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
    deviceMemory: 1,
    hardwareConcurrency: 2,
  },
  fixture: {
    compareTeamCount: compareSavedTeams.length,
    comparePayloadBytes: comparePayload.length,
    savedTeamsImportTeamCount: savedTeamsImportTeams.length,
    savedTeamsImportPayloadBytes: savedTeamsImportPayload.length,
  },
  snapshots: [],
  screenshots: {},
  warnings,
  failures,
  consoleMessages,
  pageErrors,
};

await mkdir(artifactDir, { recursive: true });
const server = await ensureServer();
let browser;

try {
  browser = await chromium.launch({
    args: ['--js-flags=--expose-gc'],
  });
  const pixel = devices['Pixel 7'];
  const context = await browser.newContext({
    baseURL,
    viewport: results.lowEndProfile.viewport,
    isMobile: true,
    hasTouch: true,
    userAgent: pixel.userAgent,
  });

  await context.addInitScript(({ deviceMemory, hardwareConcurrency }) => {
    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      get: () => deviceMemory,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => hardwareConcurrency,
    });
    localStorage.setItem('CapacitorStorage.appLanguage', 'en');
    localStorage.setItem('CapacitorStorage.analyticsConsent', 'rejected');
  }, results.lowEndProfile);

  const page = await context.newPage();
  attachPageDiagnostics(page, 'compare');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('HeapProfiler.enable').catch(() => {});

  await runCompareStress(page, cdp);
  await runSavedTeamsImportStress(page, cdp);
  await collectMemorySnapshot(page, cdp, 'final-after-forced-gc', { forceGc: true });

  await context.close();
  recordDiagnosticFailures();
  buildWarnings();
  await writeArtifacts();

  if (failures.length) {
    throw new Error(`Memory pressure harness failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
} finally {
  if (browser) {
    await closeBrowser(browser);
  }
  await stopServer(server);
}

function sanitizeSegment(value) {
  return String(value).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

function resolveDefaultArtifactDir() {
  const siblingBrainDir = path.resolve(appRoot, '..', 'optc-team-builder-brain');

  return existsSync(siblingBrainDir)
    ? path.join(siblingBrainDir, 'live-artifacts', taskId)
    : path.join(appRoot, 'perf-artifacts', 'memory-pressure');
}

function resolveGitHead() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: appRoot,
    encoding: 'utf8',
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

async function ensureServer() {
  if (await serverResponds()) {
    return null;
  }

  const child = spawnNpmStartServer();
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer(child);
    return child;
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

function spawnNpmStartServer() {
  const args = ['start', '--', '--host', '127.0.0.1', '--port', String(port)];
  const command = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : npmBin;
  const commandArgs =
    process.platform === 'win32' ? ['/d', '/s', '/c', [npmBin, ...args].join(' ')] : args;

  return spawn(command, commandArgs, {
    cwd: appRoot,
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function serverResponds() {
  try {
    const response = await fetch(baseURL, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(child) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 180_000) {
    if (await serverResponds()) {
      return;
    }

    if (child.exitCode !== null) {
      throw new Error(`Dev server exited with ${child.exitCode}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${baseURL}`);
}

async function stopServer(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  killServerProcess(child, 'SIGTERM');
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        killServerProcess(child, 'SIGKILL');
      }
      resolve();
    }, 5_000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function killServerProcess(child, signal) {
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }

  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the npm wrapper process below.
    }
  }

  child.kill(signal);
}

async function closeBrowser(activeBrowser) {
  await Promise.race([
    activeBrowser.close(),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

function attachPageDiagnostics(page, flow) {
  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) {
      return;
    }

    const text = message.text();

    if (isIgnorableConsoleMessage(text)) {
      return;
    }

    consoleMessages.push({ flow, type: message.type(), text });
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ flow, message: error.message, stack: error.stack ?? null });
  });
  page.on('crash', () => {
    failures.push(`${flow}: page crashed under memory pressure`);
  });
}

function isIgnorableConsoleMessage(text) {
  return text.includes('Ionic Native') || text.includes('Angular is running in development mode');
}

function recordDiagnosticFailures() {
  for (const message of consoleMessages) {
    if (message.type === 'error') {
      failures.push(`${message.flow}: console error: ${message.text}`);
    }
  }

  for (const error of pageErrors) {
    failures.push(`${error.flow}: page error: ${error.message}`);
  }
}

async function runCompareStress(page, cdp) {
  console.log('[perf:memory-pressure] loading Auto Team Builder compare route');
  await page.goto('/tabs/auto-team-builder');
  await waitForAngular(page);
  await page.locator('app-auto-team-builder-page').waitFor({ state: 'attached', timeout: 45_000 });
  await page.getByTestId('auto-build-submit').waitFor({ state: 'visible', timeout: 45_000 });
  await waitForAutoTeamBuilderReady(page);
  await collectMemorySnapshot(page, cdp, 'compare-before-import');

  const importStart = performance.now();
  await applyLargeCompareImport(page);
  await waitForCompareSession(page, {
    leftLabel: compareLeftSavedTeam.name,
    rightLabel: 'Memory Compare Team 1',
  });
  const importMs = Math.round(performance.now() - importStart);
  results.compareImportMs = importMs;
  await screenshot(page, 'compare-after-import');
  await collectMemorySnapshot(page, cdp, 'compare-after-import');

  const restoreStart = performance.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAngular(page);
  await waitForCompareSession(page, {
    leftLabel: compareLeftSavedTeam.name,
    rightLabel: 'Memory Compare Team 1',
  });
  results.compareRestoreMs = Math.round(performance.now() - restoreStart);
  await screenshot(page, 'compare-after-reload-restore');
  await collectMemorySnapshot(page, cdp, 'compare-after-reload-restore');

  await clearImportedCompareSide(page);
  await screenshot(page, 'compare-after-source-cleanup');
  await collectMemorySnapshot(page, cdp, 'compare-after-source-cleanup');
}

async function runSavedTeamsImportStress(page, cdp) {
  console.log('[perf:memory-pressure] importing large Saved Teams payload');
  await page.goto('/tabs/saved-teams');
  await waitForAngular(page);
  await page.getByTestId('saved-teams-import-open').first().click();
  const importModal = page.locator('ion-modal.saved-teams-import-modal.show-modal');
  await importModal.waitFor({ state: 'visible', timeout: 45_000 });

  const importStart = performance.now();
  await importModal.getByTestId('saved-teams-import-file').setInputFiles({
    name: 'memory-pressure-saved-teams.json',
    mimeType: 'application/json',
    buffer: Buffer.from(savedTeamsImportPayload, 'utf8'),
  });
  await importModal.getByTestId('saved-teams-import-feedback').waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  results.savedTeamsImportFeedbackMs = Math.round(performance.now() - importStart);
  await screenshot(page, 'saved-teams-import-feedback');
  await waitForAngular(page);
  await waitForSavedTeamsImportCount(page, savedTeamsImportTeams.length);
  await screenshot(page, 'saved-teams-after-large-import');
  await collectMemorySnapshot(page, cdp, 'saved-teams-after-large-import');
}

async function waitForAngular(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('ion-app').first().waitFor({ state: 'attached', timeout: 45_000 });
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

async function waitForAutoTeamBuilderReady(page) {
  await page.waitForFunction(
    () => {
      const host = document.querySelector('app-auto-team-builder-page');
      const component = host && window.ng?.getComponent?.(host);

      return Boolean(
        component?.summary?.() &&
          component?.abilityCatalog?.() &&
          Array.isArray(component?.ships?.()) &&
          component.ships().length > 0 &&
          Array.isArray(component?.savedTeams?.()),
      );
    },
    undefined,
    { timeout: 60_000 },
  );
  await waitForAngular(page);
}

async function injectAutoTeamFixture(page) {
  const result = buildAutoBuildResult();
  const injected = await page.evaluate((fixture) => {
    const host = document.querySelector('app-auto-team-builder-page');
    const debugApi = window.ng;
    const component = host && debugApi?.getComponent?.(host);

    if (!component?.result?.set) {
      return false;
    }

    component.building?.set?.(false);
    component.errorMessage?.set?.('');
    component.result.set(fixture);
    debugApi.applyChanges?.(component);
    debugApi.applyChanges?.(host);

    return true;
  }, result);

  if (!injected) {
    throw new Error('Could not inject Auto Team Builder fixture through Angular dev-mode debug API.');
  }
}

async function applyLargeCompareImport(page) {
  const applied = await page.evaluate(
    async ({ rawContent, leftSavedTeam, leftSnapshot }) => {
      const host = document.querySelector('app-auto-team-builder-page');
      const debugApi = window.ng;
      const component = host && debugApi?.getComponent?.(host);

      if (
        !component?.compareModeOpen?.set ||
        !component?.compareSidePayloads?.set ||
        typeof component.applyCompareImportRawContent !== 'function'
      ) {
        return false;
      }

      component.compareModeOpen.set(true);
      localStorage.setItem('CapacitorStorage.savedTeams', JSON.stringify([leftSavedTeam]));
      component.savedTeams?.set?.([leftSavedTeam]);
      component.compareSidePayloads.set({
        a: {
          state: {
            source: 'saved',
            savedTeamId: leftSavedTeam.id,
            importDraft: '',
            importedLabel: '',
            importedRawContent: '',
            importedSeed: null,
          },
          seed: null,
          snapshot: leftSnapshot,
          error: '',
          loading: false,
        },
        b: {
          state: {
            source: 'imported',
            savedTeamId: '',
            importDraft: rawContent,
            importedLabel: '',
            importedRawContent: '',
            importedSeed: null,
          },
          seed: null,
          snapshot: null,
          error: '',
          loading: false,
        },
      });
      await component.applyCompareImportRawContent(
        'b',
        rawContent,
        'Memory pressure compare payload',
      );
      debugApi.applyChanges?.(component);
      debugApi.applyChanges?.(host);

      return true;
    },
    {
      rawContent: comparePayload,
      leftSavedTeam: compareLeftSavedTeam,
      leftSnapshot: buildCompareSnapshot(compareLeftSavedTeam.name),
    },
  );

  if (!applied) {
    throw new Error('Could not apply large compare import through the component import path.');
  }
}

async function waitForCompareSession(page, expected) {
  try {
    await page.waitForFunction(
      ({ leftLabel, rightLabel }) => {
        const host = document.querySelector('app-auto-team-builder-page');
        const component = host && window.ng?.getComponent?.(host);
        const leftPayload = component?.compareSidePayload?.('a');
        const rightPayload = component?.compareSidePayload?.('b');
        const diff = component?.compareDiff?.();
        const leftSummaryText =
          document.querySelector('[data-testid="compare-summary-a"]')?.textContent ?? '';
        const summaryText =
          document.querySelector('[data-testid="compare-summary-b"]')?.textContent ?? '';

        return (
          component?.compareModeOpen?.() === true &&
          leftPayload?.state?.source === 'saved' &&
          leftPayload?.loading === false &&
          leftPayload?.snapshot?.label === leftLabel &&
          rightPayload?.state?.source === 'imported' &&
          rightPayload?.loading === false &&
          rightPayload?.snapshot?.label === rightLabel &&
          Boolean(diff) &&
          leftSummaryText.includes(leftLabel) &&
          summaryText.includes(rightLabel)
        );
      },
      expected,
      { timeout: 60_000 },
    );
  } catch (error) {
    const diagnostics = await page.evaluate(() => {
      const host = document.querySelector('app-auto-team-builder-page');
      const component = host && window.ng?.getComponent?.(host);
      const leftPayload = component?.compareSidePayload?.('a');
      const rightPayload = component?.compareSidePayload?.('b');

      return {
        compareModeOpen: component?.compareModeOpen?.() ?? null,
        leftSource: leftPayload?.state?.source ?? null,
        leftLoading: leftPayload?.loading ?? null,
        leftError: leftPayload?.error ?? null,
        leftSnapshotLabel: leftPayload?.snapshot?.label ?? null,
        rightSource: rightPayload?.state?.source ?? null,
        rightLoading: rightPayload?.loading ?? null,
        rightError: rightPayload?.error ?? null,
        rightSeedLabel: rightPayload?.seed?.label ?? null,
        rightSnapshotLabel: rightPayload?.snapshot?.label ?? null,
        hasCompareDiff: Boolean(component?.compareDiff?.()),
        leftSummaryText: document.querySelector('[data-testid="compare-summary-a"]')?.textContent ?? '',
        summaryText: document.querySelector('[data-testid="compare-summary-b"]')?.textContent ?? '',
        metricChipCount: document.querySelectorAll('.compare-metric-chip').length,
        slotRowCount: document.querySelectorAll('.compare-slot-row').length,
      };
    });

    throw new Error(
      `Timed out waiting for restored compare session ${JSON.stringify(expected)}: ${JSON.stringify(diagnostics)}`,
      { cause: error },
    );
  }
}

async function waitForSavedTeamsImportCount(page, expectedCount) {
  const prefix = 'memory-import-team-';

  await page.waitForFunction(
    ({ expectedCount: count, prefix: expectedPrefix }) => {
      let teams = [];

      try {
        const raw = localStorage.getItem('CapacitorStorage.savedTeams') ?? '[]';
        const parsed = JSON.parse(raw);
        teams = Array.isArray(parsed) ? parsed : [];
      } catch {
        teams = [];
      }

      const importedCount = teams.filter(
        (team) => typeof team?.id === 'string' && team.id.startsWith(expectedPrefix),
      ).length;
      const renderedCards = document.querySelectorAll('.saved-team-list .captain-condition-panel')
        .length;

      return importedCount === count && renderedCards > 0;
    },
    { expectedCount, prefix },
    { timeout: 60_000 },
  );

  results.savedTeamsImportedCount = await page.evaluate((expectedPrefix) => {
    try {
      const parsed = JSON.parse(localStorage.getItem('CapacitorStorage.savedTeams') ?? '[]');

      return Array.isArray(parsed)
        ? parsed.filter((team) => typeof team?.id === 'string' && team.id.startsWith(expectedPrefix))
            .length
        : 0;
    } catch {
      return 0;
    }
  }, prefix);
}

async function clearImportedCompareSide(page) {
  const cleared = await page.evaluate(() => {
    const host = document.querySelector('app-auto-team-builder-page');
    const debugApi = window.ng;
    const component = host && debugApi?.getComponent?.(host);

    if (typeof component?.onCompareSideSourceChange !== 'function') {
      return false;
    }

    component.onCompareSideSourceChange('b', { detail: { value: 'current' } });
    debugApi.applyChanges?.(component);
    debugApi.applyChanges?.(host);

    return true;
  });

  if (!cleared) {
    failures.push('compare cleanup: could not switch imported side back to current');
    return;
  }

  await page.waitForFunction(
    () => {
      const host = document.querySelector('app-auto-team-builder-page');
      const component = host && window.ng?.getComponent?.(host);
      const payload = component?.compareSidePayload?.('b');

      return payload?.state?.source === 'current' && payload.loading === false;
    },
    undefined,
    { timeout: 15_000 },
  );
}

async function screenshot(page, name) {
  const relativePath = `${runLabel}-${name}.png`;
  await page.screenshot({
    path: path.join(artifactDir, relativePath),
    fullPage: false,
    timeout: 10_000,
  });
  results.screenshots[name] = relativePath;
}

async function collectMemorySnapshot(page, cdp, label, options = {}) {
  if (options.forceGc) {
    await page.evaluate(() => globalThis.gc?.()).catch(() => {});
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  }

  const performanceMetrics = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
  const metricMap = new Map(performanceMetrics.metrics.map((metric) => [metric.name, metric.value]));
  const runtimeHeap = await page.evaluate(() => {
    const memory = performance.memory;

    return memory
      ? {
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          totalJSHeapSize: memory.totalJSHeapSize,
          usedJSHeapSize: memory.usedJSHeapSize,
        }
      : null;
  });
  const browserState = await page.evaluate(() => {
    const compareState = sessionStorage.getItem('autoTeamBuilder.compareState.v1') ?? '';
    const savedTeams = localStorage.getItem('CapacitorStorage.savedTeams') ?? '';

    return {
      route: location.pathname,
      compareSessionStorageBytes: new Blob([compareState]).size,
      compareSessionHasRawMemoryPayload: compareState.includes('Memory Compare Team 1200'),
      savedTeamsStorageBytes: new Blob([savedTeams]).size,
      dom: {
        elements: document.querySelectorAll('*').length,
        compareMetricChips: document.querySelectorAll('.compare-metric-chip').length,
        compareSlotRows: document.querySelectorAll('.compare-slot-row').length,
        savedTeamCards: document.querySelectorAll('.saved-team-list .captain-condition-panel').length,
      },
    };
  });

  results.snapshots.push({
    label,
    capturedAt: new Date().toISOString(),
    jsHeapUsedSize: metricMap.get('JSHeapUsedSize') ?? null,
    jsHeapTotalSize: metricMap.get('JSHeapTotalSize') ?? null,
    nodes: metricMap.get('Nodes') ?? null,
    documents: metricMap.get('Documents') ?? null,
    runtimeHeap,
    browserState,
  });
}

function buildWarnings() {
  const afterImport = findSnapshot('compare-after-import');
  const afterCleanup = findSnapshot('compare-after-source-cleanup');
  const afterGc = findSnapshot('final-after-forced-gc');

  if (
    afterCleanup?.browserState.compareSessionStorageBytes >
      afterImport?.browserState.compareSessionStorageBytes * 0.5 &&
    afterCleanup?.browserState.compareSessionStorageBytes > 50_000
  ) {
    warnings.push(
      `compare cleanup retained ${afterCleanup.browserState.compareSessionStorageBytes} session-storage bytes after imported side cleanup`,
    );
  }

  if (afterCleanup?.browserState.compareSessionHasRawMemoryPayload) {
    warnings.push('compare cleanup left the raw imported memory payload in session storage');
  }

  if (afterGc?.jsHeapUsedSize && afterImport?.jsHeapUsedSize) {
    const retainedRatio = afterGc.jsHeapUsedSize / afterImport.jsHeapUsedSize;

    if (retainedRatio > 0.85) {
      warnings.push(
        `forced GC retained ${Math.round(retainedRatio * 100)}% of post-import JS heap; inspect screenshots and counters before widening fixtures`,
      );
    }
  }
}

function findSnapshot(label) {
  return results.snapshots.find((snapshot) => snapshot.label === label) ?? null;
}

async function writeArtifacts() {
  const jsonPath = path.join(artifactDir, `${runLabel}-memory-pressure.json`);
  const summaryPath = path.join(artifactDir, `${runLabel}-summary.md`);
  await writeFile(jsonPath, `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(summaryPath, buildSummary());
}

function buildSummary() {
  const lines = [
    `# ${taskId} memory pressure`,
    '',
    `Captured: ${results.capturedAt}`,
    `App commit: ${results.appCommit}`,
    `Base URL: ${results.baseURL}`,
    `Compare payload bytes: ${results.fixture.comparePayloadBytes}`,
    `Saved Teams import payload bytes: ${results.fixture.savedTeamsImportPayloadBytes}`,
    `Saved Teams imported count: ${formatMetric(results.savedTeamsImportedCount)}`,
    '',
    '| Snapshot | JS heap used | JS heap total | Nodes | Compare session bytes | Saved Teams bytes |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const snapshot of results.snapshots) {
    lines.push(
      `| ${snapshot.label} | ${formatMetric(snapshot.jsHeapUsedSize)} | ${formatMetric(
        snapshot.jsHeapTotalSize,
      )} | ${formatMetric(snapshot.nodes)} | ${snapshot.browserState.compareSessionStorageBytes} | ${snapshot.browserState.savedTeamsStorageBytes} |`,
    );
  }

  lines.push('', `Warnings: ${warnings.length}`);
  for (const warning of warnings) {
    lines.push(`- ${warning}`);
  }
  lines.push('', `Failures: ${failures.length}`);
  for (const failure of failures) {
    lines.push(`- ${failure}`);
  }
  lines.push('', `Console warnings/errors: ${consoleMessages.length}`);
  lines.push(`Page errors: ${pageErrors.length}`);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function formatMetric(value) {
  return typeof value === 'number' ? Math.round(value).toString() : 'n/a';
}

function buildSavedTeams(count, idPrefix, namePrefix) {
  const ids = [5056, 4551, 4520, 4408, 4267, 4090, 4265, 4210, 4211, 4208, 4209, 4048];

  return Array.from({ length: count }, (_, index) => ({
    id: `${idPrefix}-${String(index + 1).padStart(4, '0')}`,
    name: `${namePrefix} ${index + 1}`,
    notes: 'Synthetic low-end memory pressure run.',
    shipId: index % 2 === 0 ? 9001 : null,
    slots: Array.from({ length: 6 }, (__, slotIndex) => ids[(index + slotIndex) % ids.length] ?? null),
    createdAt: '2026-07-05T00:00:00.000Z',
    updatedAt: '2026-07-05T00:00:00.000Z',
  }));
}

function buildSavedTeamsTransferJson(teams) {
  return JSON.stringify({
    schemaVersion: 1,
    source: 'saved-teams',
    exportedAt: '2026-07-05T00:00:00.000Z',
    teams,
  });
}

function buildCompareSnapshot(label) {
  const roles = ['captain', 'friendCaptain', 'sub1', 'sub2', 'sub3', 'sub4'];
  const ids = [5056, 4551, 4520, 4408, 4267, 4090];
  const slots = roles.map((role, index) => {
    const characterId = ids[index] ?? null;

    return {
      role,
      characterId,
      character: characterId ? createCharacterRecord(characterId, `${label} Slot ${index + 1}`) : null,
      missing: false,
    };
  });

  return {
    id: 'memory-left-team',
    label,
    source: 'saved',
    slots,
    shipId: 9001,
    ship: createShipRecord(9001),
    metrics: [
      metric('filledSlots', 'compare.metrics.filledSlots', 6),
      metric('uniqueTypes', 'compare.metrics.uniqueTypes', 2),
      metric('uniqueClasses', 'compare.metrics.uniqueClasses', 2),
      metric('uniqueAbilities', 'compare.metrics.uniqueAbilities', 5),
      metric('specialAbilities', 'compare.metrics.specialAbilities', 2),
      metric('crewmateAbilities', 'compare.metrics.crewmateAbilities', 1),
      metric('potentialAbilities', 'compare.metrics.potentialAbilities', 1),
      metric('supportAbilities', 'compare.metrics.supportAbilities', 1),
      metric('captainTierCoverage', 'compare.metrics.captainTierCoverage', 3),
      metric('ship', 'compare.metrics.ship', 1),
    ],
    missingCharacterCount: 0,
  };
}

function metric(key, labelKey, value) {
  return { key, labelKey, value };
}

function buildAutoBuildResult() {
  const slots = [
    ['captain', createCharacterRecord(5056, 'Memory Captain')],
    ['friendCaptain', createCharacterRecord(4551, 'Memory Friend Captain')],
    ['sub', createCharacterRecord(4520, 'Memory Burst Sub')],
    ['sub', createCharacterRecord(4408, 'Memory Utility Sub')],
    ['sub', createCharacterRecord(4267, 'Memory Consistency Sub')],
    ['sub', createCharacterRecord(4090, 'Memory Damage Sub')],
  ].map(([role, character]) => ({
    role,
    character,
    reasonChips: ['Memory pressure fixture'],
    explanation: null,
  }));
  const input = {
    types: ['DEX', 'PSY'],
    selectedClasses: ['Fighter', 'Slasher'],
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    requiredAbilities: [],
    requiredCharacterGroups: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: false,
    requireBothLeadersFullCaptainAbilityCoverage: false,
    minimumLeaderSuperEffectMatchingSlots: null,
    requireLeaderSuperSpecialCriteria: false,
    strictSuperSpecialCriteriaCoverage: false,
    requireSuperTandemCriteria: false,
    strictSuperTandemCriteriaCoverage: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
    leaderBoostFilters: [],
    leaderBoostRanges: createEmptyLeaderBoostRanges(),
    costRange: createEmptyCostRange(),
    leaderCostRange: createEmptyCostRange(),
    subCostRange: createEmptyCostRange(),
    maxTotalCost: null,
    manualSlots: [],
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    captainCharacterId: 5056,
    friendCaptainCharacterId: 4551,
    manualShipId: null,
    requireManualShip: false,
    excludedShipIds: [],
    candidateLimit: null,
  };

  return {
    input,
    requestedInput: input,
    relaxation: {
      usedFallback: false,
      droppedTypes: [],
      droppedClasses: [],
      droppedCharacterTags: [],
      droppedCharacterNames: [],
      minimumLeaderSuperEffectMatchingSlots: null,
      allowedLeadersWithSuperEffects: false,
      ignoredLeaderSuperEffectScope: false,
      ignoredLeaderSuperSpecialCriteria: false,
      ignoredSuperTandemCriteria: false,
      ignoredCaptainAbilityCoverage: false,
      downgradedCaptainAbilityCoverage: false,
    },
    shipSelection: {
      ship: createShipRecord(9001),
      source: 'manual',
      reasonChips: ['Manual ship'],
    },
    candidateCount: 1200,
    coverage: {
      satisfiedAbilityKeys: [],
      unsatisfiedAbilityKeys: [],
      missingRequiredCharacters: [],
      leaderCriteria: {
        captain: null,
        friendCaptain: null,
        matchingSlotCount: 0,
        minimumMatchingSlotCount: null,
      },
      captainAbilityCoverage: {
        captain: null,
        friendCaptain: null,
        missingRequiredCoverage: [],
      },
    },
    slots,
  };
}

function createEmptyLeaderBoostRanges() {
  return { hp: createEmptyCostRange(), atk: createEmptyCostRange(), rcv: createEmptyCostRange() };
}

function createEmptyCostRange() {
  return { min: null, max: null };
}

function createShipRecord(id) {
  return {
    id,
    name: `Ship ${id}`,
    description: '',
    special: '',
    specialName: '',
    cooldown: null,
    effects: [],
  };
}

function createCharacterRecord(id, name) {
  return {
    id,
    name,
    type: id % 2 === 0 ? 'DEX' : 'PSY',
    classes: ['Fighter', 'Slasher'],
    stars: 5,
    cost: 55,
    combo: 4,
    sockets: 5,
    maxLevel: 99,
    expToMax: 5000000,
    stats: {
      hp: 3000,
      atk: 1500,
      rcv: 300,
    },
    detail: {
      characterId: id,
      captainAbility: '',
      special: '',
      sailorAbility: '',
      limitBreak: '',
      potentialAbilities: [],
      supportAbility: '',
      superEvolution: '',
      captainAbilityVariants: [],
      captainAbilityCoverage: null,
      builderAbilities: [],
      rumble: null,
    },
    assets: {
      icon: '',
      thumbnail: '',
      portrait: '',
    },
    searchText: name.toLowerCase(),
    partyConflictKeys: [`id:${id}`],
    characterTags: [],
    optcDbUrl: null,
  };
}

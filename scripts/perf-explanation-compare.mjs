#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const appRoot = process.cwd();
const port = Number(process.env.PERF_PORT ?? process.env.E2E_PORT ?? 8436);
const baseURL = process.env.PERF_BASE_URL ?? process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const artifactDir = process.env.PERF_ARTIFACT_DIR ?? resolveDefaultArtifactDir();
const runLabel = sanitizeSegment(process.env.PERF_RUN_LABEL ?? 'explanation-compare');
const shouldAssert = process.env.PERF_ASSERT !== '0';
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const savedTeams = buildSavedTeams(500);
const importedPayload = buildSavedTeamsTransferJson(savedTeams);
const transparentPixelUrl =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const consoleMessages = [];
const pageErrors = [];
const failures = [];
const budgets = {
  desktop: {
    compareOpenMs: 800,
    compareImportMs: 1200,
    firstExplanationToggleMs: 300,
    allExplanationToggleMs: 900,
  },
  mobile: {
    compareOpenMs: 1000,
    compareImportMs: 1500,
    firstExplanationToggleMs: 450,
    allExplanationToggleMs: 1200,
  },
};
const results = {
  capturedAt: new Date().toISOString(),
  baseURL,
  appRepo: appRoot,
  appCommit: resolveGitHead(),
  artifactDir,
  runLabel,
  shouldAssert,
  budgets,
  fixture: {
    savedTeamCount: savedTeams.length,
    importedPayloadBytes: importedPayload.length,
    explanationSlotCount: 6,
    explanationReasonsPerSlot: 12,
    fallbackReasonsPerSlot: 6,
    rejectedCandidatesPerSlot: 8,
  },
  viewportRuns: [],
  consoleMessages,
  pageErrors,
  failures,
};

await mkdir(artifactDir, { recursive: true });
const server = await ensureServer();
let browser;

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
    const context = await browser.newContext({
      baseURL,
      viewport: viewport.viewport,
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      userAgent: viewport.userAgent,
    });
    const page = await context.newPage();

    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) {
        consoleMessages.push({
          viewport: viewport.label,
          type: message.type(),
          text: message.text(),
        });
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push({
        viewport: viewport.label,
        message: error.message,
        stack: error.stack ?? null,
      });
    });

    await seedBrowserState(page);
    const run = { viewport: viewport.label, timings: {} };

    console.log(`[perf:explanation-compare] ${viewport.label}: loading fixture page`);
    await page.goto('/tabs/auto-team-builder');
    await waitForAngular(page);
    await page.locator('app-auto-team-builder-page').waitFor({ state: 'attached', timeout: 45_000 });
    await page.getByTestId('auto-build-submit').waitFor({ state: 'visible', timeout: 45_000 });
    await page.waitForTimeout(250);
    await injectAutoTeamFixture(page);
    await page.waitForFunction(
      () => {
        const host = document.querySelector('app-auto-team-builder-page');
        const component = host && window.ng?.getComponent?.(host);

        return (
          component?.result?.()?.slots?.length === 6 &&
          document.querySelectorAll('.slot-explanation__details').length === 6
        );
      },
      undefined,
      { timeout: 45_000 },
    );
    console.log(`[perf:explanation-compare] ${viewport.label}: ${JSON.stringify(await readRenderDiagnostics(page))}`);

    console.log(`[perf:explanation-compare] ${viewport.label}: measuring explanations`);
    run.timings.explanations = await measureExplanations(page, viewport.label);
    console.log(`[perf:explanation-compare] ${viewport.label}: measuring compare panel`);
    run.timings.compare = await measureCompare(page, viewport.label);
    results.viewportRuns.push(run);
    checkBudgets(viewport.label, run.timings);
    await context.close();
  }

  await writeResults();

  if (shouldAssert && failures.length) {
    throw new Error(`Performance guardrails failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
} finally {
  await stopServer(server);
  if (browser) {
    await closeBrowser(browser);
  }
}

function sanitizeSegment(value) {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'perf';
}

function resolveDefaultArtifactDir() {
  const siblingBrainDir = path.resolve(appRoot, '..', 'optc-team-builder-brain');

  return existsSync(siblingBrainDir)
    ? path.join(siblingBrainDir, 'live-artifacts', '869dvr7x5')
    : path.join(appRoot, 'perf-artifacts', 'explanation-compare');
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

  const child = spawn(npmBin, ['start', '--', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: appRoot,
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer();
    return child;
  } catch (error) {
    await stopServer(child);
    throw error;
  }
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

async function serverResponds() {
  try {
    const response = await fetch(baseURL, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 180_000) {
    if (await serverResponds()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${baseURL}`);
}

async function seedBrowserState(page) {
  await page.addInitScript((teams) => {
    localStorage.setItem('CapacitorStorage.appLanguage', 'en');
    localStorage.setItem('CapacitorStorage.analyticsConsent', 'rejected');
    localStorage.setItem('CapacitorStorage.savedTeams', JSON.stringify(teams));
  }, savedTeams);
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
    throw new Error('Could not inject Auto Team Builder perf fixture through Angular dev-mode debug API.');
  }
}

async function measureCompare(page, viewportLabel) {
  const openStart = performance.now();

  await applySavedCompareSnapshots(page);
  console.log(`[perf:explanation-compare] ${viewportLabel}: saved compare snapshots applied`);
  await waitForCompareRender(page, 'Perf Compare Team B', 'saved');
  const compareOpenMs = performance.now() - openStart;

  const importStart = performance.now();
  await applyImportedComparePayload(page);
  console.log(`[perf:explanation-compare] ${viewportLabel}: imported compare payload applied`);
  await waitForCompareRender(page, 'Perf Compare Team 1', 'imported');
  const compareImportMs = performance.now() - importStart;
  console.log(`[perf:explanation-compare] ${viewportLabel}: compare timings collected`);

  await page.screenshot({
    path: path.join(artifactDir, `${runLabel}-${viewportLabel}-compare.png`),
    timeout: 10_000,
  });

  return {
    compareOpenMs: Math.round(compareOpenMs),
    compareImportMs: Math.round(compareImportMs),
    metricChipCount: await page.locator('.compare-metric-chip').count(),
    slotRowCount: await page.locator('.compare-slot-row').count(),
    importedPayloadBytes: importedPayload.length,
  };
}

async function applySavedCompareSnapshots(page) {
  const left = buildCompareSnapshot('Perf Compare Team A', 'saved', 0);
  const right = buildCompareSnapshot('Perf Compare Team B', 'saved', 1);
  const applied = await page.evaluate(
    ({ leftSnapshot, rightSnapshot }) => {
      const host = document.querySelector('app-auto-team-builder-page');
      const debugApi = window.ng;
      const component = host && debugApi?.getComponent?.(host);

      if (!component?.compareModeOpen?.set || !component?.compareSidePayloads?.set) {
        return false;
      }

      component.compareModeOpen.set(true);
      component.compareSidePayloads.set({
        a: {
          state: {
            source: 'saved',
            savedTeamId: 'perf-compare-team-a',
            importDraft: '',
            importedLabel: '',
            importedRawContent: '',
          },
          seed: null,
          snapshot: leftSnapshot,
          error: '',
          loading: false,
        },
        b: {
          state: {
            source: 'saved',
            savedTeamId: 'perf-compare-team-b',
            importDraft: '',
            importedLabel: '',
            importedRawContent: '',
          },
          seed: null,
          snapshot: rightSnapshot,
          error: '',
          loading: false,
        },
      });
      debugApi.applyChanges?.(component);
      debugApi.applyChanges?.(host);

      return true;
    },
    { leftSnapshot: left, rightSnapshot: right },
  );

  if (!applied) {
    throw new Error('Could not apply compare snapshots through Angular dev-mode debug API.');
  }
}

async function applyImportedComparePayload(page) {
  const left = buildCompareSnapshot('Perf Compare Team A', 'saved', 0);
  const applied = await page.evaluate(
    async ({ leftSnapshot, rawContent }) => {
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
      component.compareSidePayloads.set({
        a: {
          state: {
            source: 'saved',
            savedTeamId: 'perf-compare-team-a',
            importDraft: '',
            importedLabel: '',
            importedRawContent: '',
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
        'Perf imported transfer payload',
      );
      debugApi.applyChanges?.(component);
      debugApi.applyChanges?.(host);

      return true;
    },
    { leftSnapshot: left, rawContent: importedPayload },
  );

  if (!applied) {
    throw new Error('Could not apply imported compare payload through the component import path.');
  }
}

async function waitForCompareRender(page, expectedLabel, expectedSource) {
  await page.waitForFunction(
    ({ label, source }) => {
      const host = document.querySelector('app-auto-team-builder-page');
      const component = host && window.ng?.getComponent?.(host);
      const payload = component?.compareSidePayload?.('b');
      const summaryText =
        document.querySelector('[data-testid="compare-summary-b"]')?.textContent ?? '';

      return (
        payload?.state?.source === source &&
        payload?.loading === false &&
        payload?.snapshot?.label === label &&
        document.querySelectorAll('.compare-metric-chip').length > 0 &&
        summaryText.includes(label)
      );
    },
    { label: expectedLabel, source: expectedSource },
    { timeout: 45_000 },
  );
}

async function readRenderDiagnostics(page) {
  return page.evaluate(() => ({
    resultCards: document.querySelectorAll('.result-card').length,
    slotExplanations: document.querySelectorAll('.slot-explanation').length,
    structuredExplanations: document.querySelectorAll('.slot-explanation__details').length,
    fallbackExplanations: document.querySelectorAll('.slot-explanation__fallback').length,
    resultText: document.querySelector('.result-card')?.textContent?.slice(0, 160) ?? null,
  }));
}

async function measureExplanations(page, viewportLabel) {
  const detailCount = await page.evaluate(
    () => document.querySelectorAll('.slot-explanation__details').length,
  );
  console.log(`[perf:explanation-compare] ${viewportLabel}: explanation detail count ${detailCount}`);

  if (!detailCount) {
    throw new Error('No structured explanation details were rendered for the perf fixture.');
  }

  await page.screenshot({
    path: path.join(artifactDir, `${runLabel}-${viewportLabel}-result-collapsed.png`),
  });
  const firstStart = performance.now();
  await setOpenExplanationDetails(page, 1);
  await page.waitForFunction(
    () => Boolean(document.querySelector('[data-testid="slot-explanation-detail-list"] li')),
    undefined,
    { timeout: 15_000 },
  );
  await waitForAngular(page);
  const firstExplanationToggleMs = performance.now() - firstStart;

  await setOpenExplanationDetails(page, 0);
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.slot-explanation__details[open]').length === 0 &&
      document.querySelectorAll('[data-testid="slot-explanation-detail-list"]').length === 0,
    undefined,
    { timeout: 15_000 },
  );

  const allStart = performance.now();
  await setOpenExplanationDetails(page, detailCount);

  await page.waitForFunction(
    (expectedCount) =>
      document.querySelectorAll('.slot-explanation__details[open]').length === expectedCount,
    detailCount,
    { timeout: 15_000 },
  );
  await waitForAngular(page);
  const allExplanationToggleMs = performance.now() - allStart;

  await page.screenshot({
    path: path.join(artifactDir, `${runLabel}-${viewportLabel}-explanations.png`),
  });

  return {
    detailCount,
    renderedDetailListCount: await page.evaluate(
      () => document.querySelectorAll('[data-testid="slot-explanation-detail-list"]').length,
    ),
    renderedRejectedListCount: await page.evaluate(
      () => document.querySelectorAll('[data-testid="slot-explanation-rejected-list"]').length,
    ),
    firstExplanationToggleMs: Math.round(firstExplanationToggleMs),
    allExplanationToggleMs: Math.round(allExplanationToggleMs),
  };
}

async function setOpenExplanationDetails(page, count) {
  const result = await page.evaluate((requestedCount) => {
    const host = document.querySelector('app-auto-team-builder-page');
    const debugApi = window.ng;
    const component = host && debugApi?.getComponent?.(host);
    let keys = [...document.querySelectorAll('.slot-explanation__details')]
      .map((detail) => detail.getAttribute('data-testid') ?? '')
      .filter((testId) => testId.startsWith('slot-explanation-'))
      .map((testId) => testId.slice('slot-explanation-'.length));

    if (!keys.length && component?.teamSlots) {
      keys = component.teamSlots().map((slot) => slot.trackKey).filter(Boolean);
    }

    if (!component?.openExplanationSlotKeys?.set || !keys.length) {
      return { availableCount: 0, openedCount: 0 };
    }

    component.openExplanationSlotKeys.set(new Set(keys.slice(0, requestedCount)));
    debugApi.applyChanges?.(component);
    debugApi.applyChanges?.(host);

    return {
      availableCount: keys.length,
      openedCount: Math.min(requestedCount, keys.length),
    };
  }, count);

  if (!result.availableCount) {
    throw new Error('Could not update explanation detail state through Angular dev-mode debug API.');
  }
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

function checkBudgets(viewportLabel, timings) {
  if (!shouldAssert) {
    return;
  }

  const viewportBudgets = budgets[viewportLabel];
  const checks = [
    ['compare panel open', timings.compare.compareOpenMs, viewportBudgets.compareOpenMs],
    ['imported compare apply', timings.compare.compareImportMs, viewportBudgets.compareImportMs],
    [
      'first explanation toggle',
      timings.explanations.firstExplanationToggleMs,
      viewportBudgets.firstExplanationToggleMs,
    ],
    [
      'all explanation toggles',
      timings.explanations.allExplanationToggleMs,
      viewportBudgets.allExplanationToggleMs,
    ],
  ];

  for (const [label, actual, budget] of checks) {
    if (actual > budget) {
      failures.push(`${viewportLabel} ${label}: ${actual}ms > ${budget}ms`);
    }
  }
}

async function writeResults() {
  await writeFile(
    path.join(artifactDir, `${runLabel}-performance.json`),
    `${JSON.stringify(results, null, 2)}\n`,
  );
}

function buildSavedTeams(count) {
  const ids = [5056, 4551, 4520, 4408, 4267, 4090, 4265, 4210, 4211, 4208, 4209, 4048];

  return Array.from({ length: count }, (_, index) => ({
    id: `perf-compare-team-${String(index + 1).padStart(3, '0')}`,
    name: `Perf Compare Team ${index + 1}`,
    notes: 'Synthetic compare performance run.',
    shipId: null,
    slots: Array.from({ length: 6 }, (__, slotIndex) => ids[(index + slotIndex) % ids.length] ?? null),
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  }));
}

function buildSavedTeamsTransferJson(teams) {
  return JSON.stringify({
    schemaVersion: 1,
    source: 'saved-teams',
    exportedAt: '2026-06-26T00:00:00.000Z',
    teams,
  });
}

function buildCompareSnapshot(label, source, offset) {
  const roles = ['captain', 'friendCaptain', 'sub1', 'sub2', 'sub3', 'sub4'];
  const ids = [5056, 4551, 4520, 4408, 4267, 4090, 4265, 4210];
  const slots = roles.map((role, index) => {
    const characterId = ids[(offset + index) % ids.length];
    const character = createCharacterRecord(characterId, `${label} Slot ${index + 1}`);

    return {
      role,
      characterId,
      character,
      missing: false,
    };
  });

  return {
    id: `${source}:${offset}`,
    label,
    source,
    slots,
    shipId: 9001 + offset,
    ship: createShipRecord(9001 + offset),
    metrics: [
      metric('filledSlots', 'compare.metrics.filledSlots', 6),
      metric('uniqueTypes', 'compare.metrics.uniqueTypes', 2),
      metric('uniqueClasses', 'compare.metrics.uniqueClasses', 2),
      metric('uniqueAbilities', 'compare.metrics.uniqueAbilities', 5 + offset),
      metric('specialAbilities', 'compare.metrics.specialAbilities', 2 + offset),
      metric('crewmateAbilities', 'compare.metrics.crewmateAbilities', 1),
      metric('potentialAbilities', 'compare.metrics.potentialAbilities', 1),
      metric('supportAbilities', 'compare.metrics.supportAbilities', 1),
      metric('captainTierCoverage', 'compare.metrics.captainTierCoverage', 3 + offset),
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
    ['captain', createCharacterRecord(5056, 'Perf Captain'), ['Captain slot']],
    ['friendCaptain', createCharacterRecord(4551, 'Perf Friend Captain'), ['Friend captain slot']],
    ['sub', createCharacterRecord(4520, 'Perf Burst Sub'), ['Burst']],
    ['sub', createCharacterRecord(4408, 'Perf Utility Sub'), ['Utility']],
    ['sub', createCharacterRecord(4267, 'Perf Consistency Sub'), ['Consistency']],
    ['sub', createCharacterRecord(4090, 'Perf Damage Sub'), ['Damage']],
  ].map(([role, character, reasonChips], index) => ({
    role,
    character,
    reasonChips,
    explanation: createExplanation(index),
  }));
  const input = {
    types: ['DEX', 'PSY'],
    selectedClasses: ['Fighter', 'Slasher'],
    selectedCharacterTags: ['Straw Hat Pirates', 'Worst Generation'],
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
    leaderBoostFilters: ['HP', 'ATK'],
    leaderBoostRanges: createEmptyLeaderBoostRanges(),
    costRange: createEmptyCostRange(),
    leaderCostRange: createEmptyCostRange(),
    subCostRange: createEmptyCostRange(),
    maxTotalCost: null,
    manualSlots: [
      ['captain', [5056]],
      ['friendCaptain', [4551]],
      ['sub1', [4520]],
      ['sub2', [4408]],
      ['sub3', [4267]],
      ['sub4', [4090]],
    ].map(([role, characterIds]) => ({
      role,
      characterIds,
      requiredCharacterId: characterIds[0] ?? null,
      branchSelections: [],
    })),
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
    requestedInput: {
      ...input,
      types: [...input.types],
      selectedClasses: [...input.selectedClasses],
      selectedCharacterTags: [...input.selectedCharacterTags],
      selectedCharacterNames: [...input.selectedCharacterNames],
      requiredAbilities: [],
      requiredCharacterGroups: [],
      enemyMechanics: [],
      favoriteShipIds: [],
      leaderBoostFilters: [...input.leaderBoostFilters],
      leaderBoostRanges: createEmptyLeaderBoostRanges(),
      costRange: createEmptyCostRange(),
      leaderCostRange: createEmptyCostRange(),
      subCostRange: createEmptyCostRange(),
      manualSlots: input.manualSlots.map((slot) => ({
        role: slot.role,
        characterIds: [...slot.characterIds],
      })),
      lockedCharacterIds: [],
      excludedCharacterIds: [],
      excludedShipIds: [],
    },
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
    candidateCount: 500,
    coverage: createCoverage(),
    slots,
  };
}

function createExplanation(slotIndex) {
  const reasons = Array.from({ length: 12 }, (_, index) => {
    switch (index % 6) {
      case 0:
        return { code: 'manualPick' };
      case 1:
        return { code: 'selectedTypeMatch', params: { types: ['DEX', 'PSY'], count: 2 } };
      case 2:
        return { code: 'selectedClassMatch', params: { classes: ['Fighter', 'Slasher'], count: 2 } };
      case 3:
        return { code: 'selectedCharacterTagMatch', params: { tags: ['Straw Hat Pirates'], count: 1 } };
      case 4:
        return { code: 'requiredAbilityMatch', params: { abilityKeys: ['remove_bind', 'orb_boost'], count: 2 } };
      default:
        return { code: 'burstRole', params: { roles: ['orbBoost', 'atkBoost'] } };
    }
  });
  const fallbackReasons = Array.from({ length: 6 }, (_, index) =>
    index % 2 === 0
      ? { code: 'fallbackDroppedTypes', params: { types: ['INT', 'QCK'], count: 2 } }
      : { code: 'fallbackDroppedClasses', params: { classes: ['Driven'], count: 1 } },
  );
  const rejectedCandidates = Array.from({ length: 8 }, (_, index) => ({
    characterId: 9000 + slotIndex * 10 + index,
    characterName: `Rejected Perf Candidate ${slotIndex + 1}-${index + 1}`,
    reasons: [
      { code: 'lowerRequirementDemand' },
      { code: 'lowerCoverageContribution' },
      { code: 'rankingTieBreak' },
    ],
  }));

  return {
    primaryReason: reasons[slotIndex % reasons.length],
    reasons,
    fallbackReasons,
    rejectedCandidates,
  };
}

function createCharacterRecord(id, name) {
  return {
    id,
    name,
    isIncomplete: false,
    type: id % 2 === 0 ? 'DEX' : 'PSY',
    classes: ['Fighter', 'Slasher'],
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 1.3,
    captainAtkBoost: 5,
    captainAverageBoost: 3.15,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 4200, atk: 1800, rcv: 320 },
      growth: 2.4,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: transparentPixelUrl,
      thumbnailGlobal: transparentPixelUrl,
      thumbnailJapan: null,
    },
    imageUrl: transparentPixelUrl,
    detailImageUrl: transparentPixelUrl,
    detail: {
      characterId: id,
      captainAbility: `${name} captain ability`,
      captainAbilityVariants: [
        {
          key: 'base',
          label: 'Base Captain Ability',
          text: `${name} captain ability`,
        },
      ],
      captainNotes: null,
      specialName: `${name} special`,
      specialText: `${name} special text`,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: ['Straw Hat Pirates', 'Worst Generation'],
      builderAbilities: [
        createBuilderAbility('remove_bind', 'Bind', 'specialText'),
        createBuilderAbility('orb_boost', 'Orb Boost', 'specialText'),
        createBuilderAbility('sailor_despair', 'Sailor Despair', 'sailorAbilities'),
        createBuilderAbility('potential_cooldown', 'Cooldown', 'potentialAbilities'),
        createBuilderAbility('support_heal', 'Support Heal', 'supportData'),
      ],
      sailorAbilities: [`${name} sailor`],
      sailorNotes: null,
      potentialAbilities: [{ Name: `${name} potential`, description: [`${name} potential text`] }],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
  };
}

function createBuilderAbility(key, label, source) {
  return {
    key,
    label,
    minTurns: null,
    isCompleteRemoval: false,
    slotTokens: [],
    source,
  };
}

function createShipRecord(id) {
  return {
    id,
    name: `Perf Ship ${id}`,
    thumb: null,
    thumbUrl: null,
    description: 'Boosts crew ATK.',
  };
}

function createCoverage() {
  return {
    leaderCriteria: {
      source: 'captainAbility',
      coverageMode: 'simpleBoostScope',
      captainLeaderId: 5056,
      friendCaptainLeaderId: 4551,
      leaderIds: [5056, 4551],
      leaderNames: ['Perf Captain', 'Perf Friend Captain'],
      leaderBranchSelections: [],
      dualLeaderMode: 'intersection',
      derivedAllowedClasses: ['Fighter', 'Slasher'],
      derivedAllowedTypes: ['DEX', 'PSY'],
      derivedAllowedCharacterTags: ['Straw Hat Pirates'],
      dominantTypeRequirements: [],
      hasCostRestriction: false,
      maxAllowedCost: null,
      hasClassRestriction: true,
      hasTypeRestriction: true,
      hasCharacterTagRestriction: true,
      requiresDominantType: false,
      tagConditionSets: [],
      matchingSlots: 6,
      totalSlots: 6,
      allSlotsMatch: true,
      leaderTierCoverages: [],
      allLeaderTiersCovered: true,
    },
    abilityRequirements: {
      requested: [],
      matched: [],
      missing: [],
      matchesAll: true,
    },
    requiredCharacterGroups: {
      requested: [],
      matched: [],
      missing: [],
      matchesAll: true,
    },
    burst: ['orb'],
    consistency: ['cooldown'],
    utility: ['bind'],
    coveredSelectedClasses: ['Fighter', 'Slasher'],
    coveredSelectedTypes: ['DEX', 'PSY'],
    coveredSelectedCharacterTags: ['Straw Hat Pirates', 'Worst Generation'],
    coveredSelectedCharacterNames: [],
    coversAllSelectedClasses: true,
    coversAllSelectedTypes: true,
    coversAllSelectedCharacterTags: true,
    coversAllSelectedCharacterNames: true,
    selectedClassMatches: 6,
    selectedTypeMatches: 6,
    selectedCharacterTagMatches: 6,
    selectedCharacterNameMatches: 0,
  };
}

function createEmptyLeaderBoostRanges() {
  return {
    HP: { min: null, max: null },
    ATK: { min: null, max: null },
  };
}

function createEmptyCostRange() {
  return { min: null, max: null };
}

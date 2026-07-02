#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

export const MOBILE_PICKER_PERFORMANCE_SCHEMA_VERSION = 1;
export const MOBILE_PICKER_THRESHOLDS = Object.freeze({
  savedTeams: {
    pageReadyMs: 6000,
    firstToggleMs: 600,
    scrollToBottomMs: 250,
    maxHorizontalOverflowPx: 0,
  },
  savedEnemies: {
    pageReadyMs: 3000,
    firstToggleMs: 500,
    scrollToBottomMs: 250,
    maxHorizontalOverflowPx: 0,
  },
  manualPicker: {
    pickerOpenMs: 800,
    candidateScrollMs: 250,
    specialPickerOpenMs: 900,
    specialFilterApplyMs: 2500,
    maxHorizontalOverflowPx: 0,
  },
  characterImagePicker: {
    pickerOpenMs: 1200,
    loadMoreMs: 1200,
    specialPickerOpenMs: 900,
    specialFilterApplyMs: 2500,
    maxHorizontalOverflowPx: 0,
  },
});

const taskId = '869dwc7wv';
const appRoot = process.cwd();
const port = Number(process.env.PERF_PORT ?? process.env.E2E_PORT ?? 8438);
const baseURL = process.env.PERF_BASE_URL ?? process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const artifactDir =
  process.env.PERF_ARTIFACT_DIR ?? path.join(appRoot, 'test-results/mobile-picker-performance');
const runLabel = sanitizeSegment(process.env.PERF_RUN_LABEL ?? 'mobile-pickers');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const abilityCatalog = JSON.parse(
  await readFile(path.join(appRoot, 'public/assets/data/optc-auto-builder-abilities.json'), 'utf8'),
);
const selectedAbilities = selectAbilityKeys(abilityCatalog.abilities);
const consoleMessages = [];
const pageErrors = [];
const results = {
  schemaVersion: MOBILE_PICKER_PERFORMANCE_SCHEMA_VERSION,
  taskId,
  capturedAt: new Date().toISOString(),
  baseURL,
  appRepo: appRoot,
  appCommit: resolveGitHead(),
  artifactDir,
  runLabel,
  thresholds: MOBILE_PICKER_THRESHOLDS,
  selectedAbilities,
  viewportRuns: [],
  warnings: [],
  consoleMessages,
  pageErrors,
};

await mkdir(artifactDir, { recursive: true });
const server = await ensureServer();
let browser;

try {
  browser = await chromium.launch();
  const pixel = devices['Pixel 7'];
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: pixel.userAgent,
  });
  const page = await context.newPage();

  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) {
      return;
    }
    const text = message.text();
    if (isIgnorableConsoleMessage(text)) {
      return;
    }
    consoleMessages.push({ type: message.type(), text });
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ message: error.message, stack: error.stack ?? null });
  });

  await seedBrowserState(page, selectedAbilities);
  const run = { viewport: 'mobile-390x844', timings: {}, screenshots: {}, diagnostics: {} };
  run.timings.savedTeams = await measureSavedTeams(page, run.screenshots);
  run.timings.savedEnemies = await measureSavedEnemies(page, run.screenshots);
  run.timings.manualPicker = await measureManualPicker(page, run.screenshots);
  run.timings.characterImagePicker = await measureCharacterImagePicker(page, run.screenshots);
  run.diagnostics.horizontalOverflow = await measureHorizontalOverflow(page);
  results.viewportRuns.push(run);
  results.warnings.push(...buildThresholdWarnings(run.timings));

  await context.close();
  await writeArtifacts(results);
} finally {
  if (browser) {
    await closeBrowser(browser);
  }
  await stopServer(server);
}

function sanitizeSegment(value) {
  return String(value).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

function resolveGitHead() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: appRoot,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function writeArtifacts(payload) {
  const jsonPath = path.join(artifactDir, `${runLabel}-performance.json`);
  const summaryPath = path.join(artifactDir, `${runLabel}-summary.md`);
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(summaryPath, buildSummary(payload));
}

function buildSummary(payload) {
  const run = payload.viewportRuns[0];
  const lines = [
    `# ${taskId} mobile picker performance`,
    '',
    `Captured: ${payload.capturedAt}`,
    `App commit: ${payload.appCommit}`,
    `Base URL: ${payload.baseURL}`,
    '',
    '| Flow | Metric | Value | Threshold |',
    '| --- | --- | ---: | ---: |',
  ];

  for (const [flow, metrics] of Object.entries(run.timings)) {
    const thresholds = payload.thresholds[flow] ?? {};
    for (const [metric, value] of Object.entries(metrics)) {
      if (typeof value !== 'number') {
        continue;
      }
      const threshold = thresholds[metric];
      lines.push(
        `| ${flow} | ${metric} | ${Math.round(value)} | ${
          typeof threshold === 'number' ? threshold : 'n/a'
        } |`,
      );
    }
  }

  lines.push('', `Warnings: ${payload.warnings.length}`);
  for (const warning of payload.warnings) {
    lines.push(`- ${warning.message}`);
  }
  lines.push('', `Console warnings/errors: ${payload.consoleMessages.length}`);
  lines.push(`Page errors: ${payload.pageErrors.length}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildThresholdWarnings(timings) {
  const warnings = [];

  for (const [flow, metrics] of Object.entries(timings)) {
    const thresholds = MOBILE_PICKER_THRESHOLDS[flow] ?? {};
    for (const [metric, threshold] of Object.entries(thresholds)) {
      const actual = metrics[metric];
      if (typeof actual !== 'number' || actual <= threshold) {
        continue;
      }
      warnings.push({
        flow,
        metric,
        actual,
        threshold,
        message: `${flow}.${metric}: ${Math.round(actual)} > ${threshold}`,
      });
    }
  }

  return warnings;
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
      // Fall back to killing the npm wrapper.
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

function selectAbilityKeys(abilities) {
  const pick = (category, predicate = () => true) =>
    abilities
      .filter((ability) => ability.category === category)
      .filter((ability) => (ability.matchingCharacterIds?.length ?? 0) > 120)
      .filter(predicate)
      .sort((left, right) => right.matchCount - left.matchCount)[0];

  return {
    special: pick('special', (ability) => ability.supportsTurns === false)?.key ?? 'special_damage',
    crewmate: pick('crewmate')?.key ?? 'crewmate_atk_boost_fighter',
    potential: pick('potential')?.key ?? 'potential_barrier_pierce',
    support: pick('support')?.key ?? 'support_atk_boost',
  };
}

async function seedBrowserState(page, abilities) {
  await page.addInitScript(
    ({ teams, enemies }) => {
      localStorage.setItem('CapacitorStorage.appLanguage', 'en');
      localStorage.setItem('CapacitorStorage.analyticsConsent', 'rejected');
      localStorage.setItem('CapacitorStorage.savedTeams', JSON.stringify(teams));
      localStorage.setItem('CapacitorStorage.savedEnemies', JSON.stringify(enemies));
    },
    { teams: buildSavedTeams(), enemies: buildSavedEnemies(abilities) },
  );
}

function buildSavedTeams() {
  const ids = [5056, 4551, 4520, 4408, 4267, 4090, 4265, 4210, 4211, 4208, 4209, 4048];

  return Array.from({ length: 360 }, (_, index) => ({
    id: `mobile-perf-team-${String(index + 1).padStart(3, '0')}`,
    name: `Mobile Perf Team ${index + 1}`,
    notes: 'Synthetic mobile picker responsiveness run.',
    shipId: null,
    slots: Array.from({ length: 6 }, (__, slotIndex) => ids[(index + slotIndex) % ids.length] ?? null),
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
  }));
}

function buildSavedEnemies(abilities) {
  const abilityKeys = [abilities.special, abilities.crewmate, abilities.potential, abilities.support];

  return Array.from({ length: 420 }, (_, index) => {
    const first = abilityKeys[index % abilityKeys.length];
    const second = abilityKeys[(index + 1) % abilityKeys.length];

    return {
      id: `mobile-perf-enemy-${String(index + 1).padStart(3, '0')}`,
      name: `Mobile Perf Enemy ${index + 1}`,
      notes: 'Synthetic mobile picker responsiveness run.',
      rawEnemyText: '',
      imageDataUrl: null,
      selectedTypes: ['DEX'],
      selectedClasses: ['Fighter'],
      selectedCharacterTags: [],
      selectedCharacterNames: [],
      requiredAbilities: [createRequirement(first), createRequirement(second)],
      requiredCharacterGroups: [],
      battleRequirements: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedCharacterTagsInTeam: false,
      requireAllSelectedCharacterNamesInTeam: false,
      associatedTeamIds: [],
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    };
  });
}

function createRequirement(abilityKey) {
  return { abilityKey, minTurns: null, slotTokens: [], requiredCharacterCount: 1, slotScope: 'any' };
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

async function measurePageReady(page, route, readySelector) {
  const start = performance.now();
  await page.goto(route);
  await waitForAngular(page);
  await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 60_000 });
  return performance.now() - start;
}

async function screenshot(page, screenshots, name) {
  const relative = `${runLabel}-${name}.png`;
  await page.screenshot({ path: path.join(artifactDir, relative), fullPage: false });
  screenshots[name] = relative;
}

async function measureSavedTeams(page, screenshots) {
  const pageReadyMs = await measurePageReady(
    page,
    '/tabs/saved-teams',
    '[data-testid="saved-teams-ability-filter-panel"]',
  );
  await screenshot(page, screenshots, 'saved-teams-top');
  const firstToggleMs = await measureClassToggle(
    page,
    '[data-testid^="saved-team-ability-chip-"]',
    'saved-team-ability-chip--selected',
  );
  const scrollToBottomMs = await scrollPrimaryContentToBottom(page);
  await screenshot(page, screenshots, 'saved-teams-bottom');

  return {
    seededCount: 360,
    pageReadyMs: Math.round(pageReadyMs),
    firstToggleMs: Math.round(firstToggleMs),
    scrollToBottomMs: Math.round(scrollToBottomMs),
    renderedCardCountAfterFilter: await page.locator('.saved-team-list article').count(),
    chipCount: await page.locator('[data-testid^="saved-team-ability-chip-"]').count(),
    maxHorizontalOverflowPx: await measureHorizontalOverflow(page),
  };
}

async function measureSavedEnemies(page, screenshots) {
  const pageReadyMs = await measurePageReady(
    page,
    '/tabs/saved-enemies',
    '[data-testid="saved-enemies-ability-filter-panel"]',
  );
  await screenshot(page, screenshots, 'saved-enemies-top');
  const firstToggleMs = await measureClassToggle(
    page,
    '[data-testid^="saved-enemy-ability-chip-"]',
    'saved-enemy-ability-chip--selected',
  );
  const scrollToBottomMs = await scrollPrimaryContentToBottom(page);
  await screenshot(page, screenshots, 'saved-enemies-bottom');

  return {
    seededCount: 420,
    pageReadyMs: Math.round(pageReadyMs),
    firstToggleMs: Math.round(firstToggleMs),
    scrollToBottomMs: Math.round(scrollToBottomMs),
    renderedCardCountAfterFilter: await page.locator('.saved-enemy-list article').count(),
    chipCount: await page.locator('[data-testid^="saved-enemy-ability-chip-"]').count(),
    maxHorizontalOverflowPx: await measureHorizontalOverflow(page),
  };
}

async function measureManualPicker(page, screenshots) {
  const pageReadyMs = await measurePageReady(
    page,
    '/tabs/manual-team-builder',
    '[data-testid="manual-team-slot-edit-0"]',
  );
  const openStart = performance.now();
  await page.getByTestId('manual-team-slot-edit-0').click();
  await page.locator('ion-modal.show-modal [data-testid^="manual-team-candidate-"]').first().waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  await waitForAngular(page);
  const pickerOpenMs = performance.now() - openStart;
  await screenshot(page, screenshots, 'manual-picker-open');
  const candidateScrollMs = await scrollElementToBottom(page, '.manual-team-candidates');
  const abilityOpenStart = performance.now();
  await page.getByTestId('ability-filter-chip-special').click();
  await page.locator('ion-modal.show-modal [data-testid^="special-ability-tile-"]').first().waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  const specialPickerOpenMs = performance.now() - abilityOpenStart;
  await screenshot(page, screenshots, 'manual-special-picker-open');
  const specialSelectStart = performance.now();
  await page.getByTestId(`special-ability-tile-${selectedAbilities.special}`).click();
  await page.getByTestId('special-ability-picker-save').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="ability-filter-chip-special"]')
        ?.classList.contains('ability-filter-chip--active'),
    undefined,
    { timeout: 30_000 },
  );
  await page.locator('ion-modal.show-modal [data-testid^="manual-team-candidate-"]').first().waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  await waitForAngular(page);
  const specialFilterApplyMs = performance.now() - specialSelectStart;
  await screenshot(page, screenshots, 'manual-picker-filtered');

  return {
    pageReadyMs: Math.round(pageReadyMs),
    pickerOpenMs: Math.round(pickerOpenMs),
    candidateScrollMs: Math.round(candidateScrollMs),
    specialPickerOpenMs: Math.round(specialPickerOpenMs),
    specialFilterApplyMs: Math.round(specialFilterApplyMs),
    candidateCount: await page.locator('ion-modal.show-modal [data-testid^="manual-team-candidate-"]').count(),
    maxHorizontalOverflowPx: await measureHorizontalOverflow(page),
  };
}

async function measureCharacterImagePicker(page, screenshots) {
  const pageReadyMs = await measurePageReady(
    page,
    '/tabs/saved-enemies',
    '[data-testid="saved-enemies-ability-filter-panel"]',
  );
  await page.getByTestId('saved-enemies-create-open').first().click();
  await page.locator('ion-modal.saved-enemies-editor-modal.show-modal').waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  const openStart = performance.now();
  await page.getByTestId('saved-enemies-character-image-picker-open').click();
  await page.locator('ion-modal.show-modal [data-testid^="character-image-picker-card-"]').first().waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  const pickerOpenMs = performance.now() - openStart;
  await screenshot(page, screenshots, 'character-image-picker-open');
  const loadMoreStart = performance.now();
  await page.getByTestId('character-image-picker-load-more').click();
  await page.waitForFunction(
    () => document.querySelectorAll('ion-modal.show-modal [data-testid^="character-image-picker-card-"]').length > 48,
    undefined,
    { timeout: 30_000 },
  );
  await waitForAngular(page);
  const loadMoreMs = performance.now() - loadMoreStart;
  await screenshot(page, screenshots, 'character-image-picker-load-more');
  const abilityOpenStart = performance.now();
  await page.locator('ion-modal.show-modal [data-testid="ability-filter-chip-special"]').first().click();
  await page.locator('ion-modal.show-modal [data-testid^="special-ability-tile-"]').first().waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  const specialPickerOpenMs = performance.now() - abilityOpenStart;
  const specialSelectStart = performance.now();
  await page.getByTestId(`special-ability-tile-${selectedAbilities.special}`).last().click();
  await page.getByTestId('special-ability-picker-save').last().click();
  await page.locator('ion-modal.show-modal [data-testid^="character-image-picker-card-"]').first().waitFor({
    state: 'visible',
    timeout: 60_000,
  });
  await waitForAngular(page);
  const specialFilterApplyMs = performance.now() - specialSelectStart;
  await screenshot(page, screenshots, 'character-image-picker-filtered');

  return {
    pageReadyMs: Math.round(pageReadyMs),
    pickerOpenMs: Math.round(pickerOpenMs),
    loadMoreMs: Math.round(loadMoreMs),
    specialPickerOpenMs: Math.round(specialPickerOpenMs),
    specialFilterApplyMs: Math.round(specialFilterApplyMs),
    characterCardCount: await page
      .locator('ion-modal.show-modal [data-testid^="character-image-picker-card-"]')
      .count(),
    maxHorizontalOverflowPx: await measureHorizontalOverflow(page),
  };
}

async function measureClassToggle(page, selector, selectedClass) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const start = performance.now();
  await target.click();
  await page.waitForFunction(
    ({ targetSelector, className }) =>
      document.querySelector(targetSelector)?.classList.contains(className),
    { targetSelector: selector, className: selectedClass },
    { timeout: 30_000 },
  );
  await waitForAngular(page);
  return performance.now() - start;
}

async function scrollPrimaryContentToBottom(page) {
  return page.evaluate(async () => {
    const start = performance.now();
    const content = document.querySelector('ion-content:not(.tabs-menu__content)');
    await content?.componentOnReady?.();
    if (typeof content?.scrollToBottom === 'function') {
      await content.scrollToBottom(0);
    } else {
      window.scrollTo(0, document.documentElement.scrollHeight);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  });
}

async function scrollElementToBottom(page, selector) {
  return page.evaluate(async (targetSelector) => {
    const start = performance.now();
    const element = document.querySelector(targetSelector);
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - start;
  }, selector);
}

async function measureHorizontalOverflow(page) {
  return page.evaluate(() => {
    const candidates = [
      document.documentElement,
      document.body,
      ...document.querySelectorAll(
        'ion-content, .page-shell, ion-modal.show-modal, .saved-team-list, .saved-enemy-list, .manual-team-candidates, .character-image-picker-grid',
      ),
    ];
    return candidates.reduce((maxOverflow, element) => {
      const overflow = Math.max(0, element.scrollWidth - element.clientWidth);
      return Math.max(maxOverflow, overflow);
    }, 0);
  });
}

function isIgnorableConsoleMessage(text) {
  return [
    /Failed to load resource:.*app-config\.js/i,
    /accounts\.google\.com/i,
    /Google Identity Services/i,
    /google\.accounts/i,
    /ResizeObserver loop/i,
    /Manifest:.*manifest\.webmanifest/i,
    /favicon/i,
    /\[ng\] Application bundle generation/i,
    /\[webpack-dev-server\]/i,
  ].some((pattern) => pattern.test(text));
}

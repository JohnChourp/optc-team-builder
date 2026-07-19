#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const appRoot = process.cwd();
const port = Number(process.env.PERF_PORT ?? process.env.E2E_PORT ?? 8427);
const baseURL = process.env.PERF_BASE_URL ?? process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const artifactDir =
  process.env.PERF_ARTIFACT_DIR ?? path.join(appRoot, 'test-results/ability-filter-performance');
const runLabel = sanitizeSegment(process.env.PERF_RUN_LABEL ?? 'ability-filter');
const abilityCatalog = JSON.parse(
  await readFile(path.join(appRoot, 'public/assets/data/optc-auto-builder-abilities.json'), 'utf8'),
);
const selectedAbilities = selectAbilityKeys(abilityCatalog.abilities);
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const server = await ensureServer();
let browser;
const consoleMessages = [];
const pageErrors = [];
const results = {
  capturedAt: new Date().toISOString(),
  baseURL,
  appRepo: appRoot,
  appCommit: resolveGitHead(),
  artifactDir,
  runLabel,
  selectedAbilities,
  viewportRuns: [],
  consoleMessages,
  pageErrors,
};

try {
  await mkdir(artifactDir, { recursive: true });
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

    await seedBrowserState(page, selectedAbilities);
    const run = { viewport: viewport.label, timings: {} };
    run.timings.savedTeams = await measureSavedTeams(page, viewport.label);
    run.timings.savedEnemies = await measureSavedEnemies(page, viewport.label);
    run.timings.manualPicker = await measureManualPicker(page, viewport.label);
    results.viewportRuns.push(run);
    await context.close();
  }

  await writeFile(
    path.join(artifactDir, `${runLabel}-performance.json`),
    `${JSON.stringify(results, null, 2)}\n`,
  );
} finally {
  if (browser) {
    await closeBrowser(browser);
  }
  await stopServer(server);
}

function sanitizeSegment(value) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'ability-filter'
  );
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
    await waitForServer();
    return child;
  } catch (error) {
    await stopServer(child);
    throw error;
  }
}

function spawnNpmStartServer() {
  const args = ['start', '--', '--host', '127.0.0.1', '--port', String(port)];
  const command = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : npmBin;
  const commandArgs =
    process.platform === 'win32' ? ['/d', '/s', '/c', [npmBin, ...args].join(' ')] : args;

  return spawn(command, commandArgs, {
    cwd: appRoot,
    env: process.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  await Promise.race([activeBrowser.close(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
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
  const teams = buildSavedTeams();
  const enemies = buildSavedEnemies(abilities);

  await page.addInitScript(
    ({ teams: seededTeams, enemies: seededEnemies }) => {
      localStorage.setItem('CapacitorStorage.appLanguage', 'en');
      localStorage.setItem('CapacitorStorage.analyticsConsent', 'rejected');
      localStorage.setItem('CapacitorStorage.savedTeams', JSON.stringify(seededTeams));
      localStorage.setItem('CapacitorStorage.savedEnemies', JSON.stringify(seededEnemies));
    },
    { teams, enemies },
  );
}

function buildSavedTeams() {
  const ids = [5056, 4551, 4520, 4408, 4267, 4090, 4265, 4210, 4211, 4208, 4209, 4048];

  return Array.from({ length: 360 }, (_, index) => ({
    id: `perf-team-${String(index + 1).padStart(3, '0')}`,
    name: `Perf Team ${index + 1}`,
    notes: 'Synthetic ability-filter performance run.',
    shipId: null,
    slots: Array.from(
      { length: 6 },
      (__, slotIndex) => ids[(index + slotIndex) % ids.length] ?? null,
    ),
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  }));
}

function buildSavedEnemies(abilities) {
  const abilityKeys = [
    abilities.special,
    abilities.crewmate,
    abilities.potential,
    abilities.support,
  ];

  return Array.from({ length: 420 }, (_, index) => {
    const first = abilityKeys[index % abilityKeys.length];
    const second = abilityKeys[(index + 1) % abilityKeys.length];

    return {
      id: `perf-enemy-${String(index + 1).padStart(3, '0')}`,
      name: `Perf Enemy ${index + 1}`,
      notes: 'Synthetic ability-filter performance run.',
      rawEnemyText: '',
      imageDataUrl: null,
      selectedTypes: [],
      selectedClasses: [],
      selectedCharacterTags: [],
      selectedCharacterNames: [],
      requiredAbilities: [createRequirement(first), createRequirement(second)],
      requiredCharacterGroups: [
        {
          id: `perf-group-${index}`,
          name: 'Synthetic group',
          abilities: [createRequirement(first)],
        },
      ],
      battleRequirements: [
        {
          id: `perf-battle-${index}`,
          title: 'Battle 1',
          enemyMechanics: [],
          requiredCharacterGroups: [
            {
              id: `perf-battle-group-${index}`,
              name: 'Synthetic battle group',
              abilities: [createRequirement(second)],
            },
          ],
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedCharacterTagsInTeam: false,
      requireAllSelectedCharacterNamesInTeam: false,
      associatedTeamIds: [],
      createdAt: '2026-06-26T00:00:00.000Z',
      updatedAt: '2026-06-26T00:00:00.000Z',
    };
  });
}

function createRequirement(abilityKey) {
  return {
    abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
    slotScope: 'any',
  };
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

async function measurePageReady(page, pathName, readySelector) {
  const start = performance.now();
  await page.goto(pathName);
  await waitForAngular(page);
  await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 60_000 });
  return performance.now() - start;
}

async function measureToggle(page, selector, selectedClass) {
  const button = page.locator(selector).first();
  await button.scrollIntoViewIfNeeded();
  const start = performance.now();
  await button.click();
  await page.waitForFunction(
    ({ targetSelector, className }) =>
      document.querySelector(targetSelector)?.classList.contains(className),
    { targetSelector: selector, className: selectedClass },
    { timeout: 30_000 },
  );
  await waitForAngular(page);
  return performance.now() - start;
}

async function measureSavedTeams(page, viewportLabel) {
  const pageReadyMs = await measurePageReady(
    page,
    '/tabs/saved-teams',
    '[data-testid="saved-teams-ability-filter-panel"]',
  );
  await page.screenshot({
    path: path.join(artifactDir, `${runLabel}-${viewportLabel}-saved-teams.png`),
    fullPage: true,
  });
  const toggleMs = await measureAbilityTagSetFilter(page);

  return {
    seededCount: 360,
    pageReadyMs: Math.round(pageReadyMs),
    firstToggleMs: Math.round(toggleMs),
    chipCount: await page.locator('.saved-team-ability-chip--selected').count(),
  };
}

/**
 * Saved teams filters through the tag-set modal now, so the first filter costs a
 * whole open/pick/save round trip instead of one chip toggle. Measuring the round
 * trip keeps the metric honest rather than timing an interaction that is gone.
 */
async function measureAbilityTagSetFilter(page) {
  const trigger = page.getByTestId('saved-teams-ability-trigger-leader');
  await trigger.scrollIntoViewIfNeeded();
  const start = performance.now();
  await trigger.click();
  await page.getByTestId('character-tag-set-start').click();
  await page
    .locator('ion-modal.show-modal [data-testid^="character-tag-set-tile-"]')
    .first()
    .click();
  await page.getByTestId('character-tag-set-picker-save').click();
  await page.locator('.saved-team-ability-chip--selected').first().waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await waitForAngular(page);

  return performance.now() - start;
}

async function measureSavedEnemies(page, viewportLabel) {
  const pageReadyMs = await measurePageReady(
    page,
    '/tabs/saved-enemies',
    '[data-testid="saved-enemies-ability-filter-panel"]',
  );
  await page.screenshot({
    path: path.join(artifactDir, `${runLabel}-${viewportLabel}-saved-enemies.png`),
    fullPage: true,
  });
  const toggleMs = await measureToggle(
    page,
    '[data-testid^="saved-enemy-ability-chip-"]',
    'saved-enemy-ability-chip--selected',
  );

  return {
    seededCount: 420,
    pageReadyMs: Math.round(pageReadyMs),
    firstToggleMs: Math.round(toggleMs),
    chipCount: await page.locator('[data-testid^="saved-enemy-ability-chip-"]').count(),
  };
}

async function measureManualPicker(page, viewportLabel) {
  const pageReadyMs = await measurePageReady(
    page,
    '/tabs/manual-team-builder',
    '[data-testid="manual-team-slot-edit-0"]',
  );
  const openStart = performance.now();
  await page.getByTestId('manual-team-slot-edit-0').click();
  await page
    .locator('ion-modal.show-modal [data-testid^="manual-team-candidate-"]')
    .first()
    .waitFor({
      state: 'visible',
      timeout: 60_000,
    });
  await waitForAngular(page);
  const pickerOpenMs = performance.now() - openStart;

  const filterStart = performance.now();
  await page.getByTestId('ability-filter-chip-special').click();
  // The tag-set picker opens on its explainer; the catalog only appears once a
  // first group exists, so the run has to create one before picking a tag.
  await page.getByTestId('ability-tag-set-start').click();
  await page.getByTestId(`ability-tag-set-tile-${selectedAbilities.special}`).click();
  await page.getByTestId('ability-tag-set-picker-save').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="ability-filter-chip-special"]')
        ?.classList.contains('ability-filter-chip--active'),
    undefined,
    { timeout: 30_000 },
  );
  await page
    .locator('ion-modal.show-modal [data-testid^="manual-team-candidate-"]')
    .first()
    .waitFor({
      state: 'visible',
      timeout: 60_000,
    });
  await waitForAngular(page);
  const specialFilterMs = performance.now() - filterStart;

  await page.screenshot({
    path: path.join(artifactDir, `${runLabel}-${viewportLabel}-manual-picker.png`),
    fullPage: true,
  });

  return {
    pageReadyMs: Math.round(pageReadyMs),
    pickerOpenMs: Math.round(pickerOpenMs),
    specialFilterMs: Math.round(specialFilterMs),
    candidateCount: await page
      .locator('ion-modal.show-modal [data-testid^="manual-team-candidate-"]')
      .count(),
  };
}

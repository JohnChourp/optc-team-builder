#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultArtifactDir = path.join(projectRoot, 'synthetic-artifacts', 'public-entry');
const DEFAULT_BASE_URL = 'https://optcteambuilder.com';
const APP_READY_TIMEOUT_MS = 45_000;

export const PUBLIC_ENTRY_SYNTHETIC_TEAM = {
  id: 'synthetic-public-entry-crew',
  name: 'Synthetic Public Entry Crew',
  slots: [5056, 4551, 4520, 4408, 4267, null],
  shipId: null,
  notes: 'Synthetic public entry monitor fixture.',
  createdAt: '2026-06-25T00:00:00.000Z',
  updatedAt: '2026-06-25T00:00:00.000Z',
};

export const PUBLIC_ENTRY_GUIDE = {
  id: 'guided-compare-sharing-guide',
  path: '/guides/guided-build-compare-team-sharing/',
  heading: 'Guided Build, Compare Mode, and Team Sharing',
};

export const PUBLIC_ENTRY_SHARE_LINK = {
  id: 'manual-share-link-landing',
  path: '/tabs/manual-team-builder',
  redactedQuery: 'teamShare=<redacted-synthetic>',
  expectedSlotText: 'Sergeant Helmeppo',
};

const exportedAt = '2026-06-25T00:00:00.000Z';

export function buildSyntheticSharePayload(team = PUBLIC_ENTRY_SYNTHETIC_TEAM) {
  return {
    schemaVersion: 1,
    source: 'saved-team-share',
    exportedAt,
    team: {
      ...team,
      slots: [...team.slots],
    },
  };
}

export function buildSyntheticShareCode(team = PUBLIC_ENTRY_SYNTHETIC_TEAM) {
  return Buffer.from(JSON.stringify(buildSyntheticSharePayload(team)), 'utf8')
    .toString('base64')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');
}

export function normalizePublicEntryBaseUrl(value = DEFAULT_BASE_URL) {
  const normalized = String(value || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/u, '');

  return normalized || DEFAULT_BASE_URL;
}

export function buildPublicEntryUrl(baseUrl, routePath) {
  return new URL(routePath, `${normalizePublicEntryBaseUrl(baseUrl)}/`).toString();
}

export function buildSyntheticShareUrl(baseUrl = DEFAULT_BASE_URL) {
  const url = new URL(PUBLIC_ENTRY_SHARE_LINK.path, `${normalizePublicEntryBaseUrl(baseUrl)}/`);
  url.searchParams.set('teamShare', buildSyntheticShareCode());

  return url.toString();
}

export function sanitizeUrlForReport(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.searchParams.has('teamShare')) {
      return `${url.origin}${url.pathname}?teamShare=<redacted-synthetic>`;
    }

    if (url.search) {
      return `${url.origin}${url.pathname}?<redacted-query>`;
    }

    return url.toString();
  } catch {
    return String(rawUrl).includes('teamShare=')
      ? String(rawUrl).replace(/teamShare=[^&#\s]+/u, 'teamShare=<redacted-synthetic>')
      : String(rawUrl);
  }
}

export function classifyHttpFailureCategory(request = {}) {
  const isNavigationRequest =
    typeof request.isNavigationRequest === 'function'
      ? request.isNavigationRequest()
      : Boolean(request.isNavigationRequest);

  return isNavigationRequest ? 'routing' : 'asset-loading';
}

export function resolvePublicEntrySyntheticsCliOptions(env = process.env) {
  const artifactDir = path.resolve(env.PUBLIC_ENTRY_SYNTHETIC_ARTIFACT_DIR ?? defaultArtifactDir);
  const reportPath = path.resolve(
    env.PUBLIC_ENTRY_SYNTHETIC_REPORT ?? path.join(artifactDir, 'public-entry-synthetics-report.json'),
  );

  return {
    baseUrl: normalizePublicEntryBaseUrl(env.PUBLIC_ENTRY_BASE_URL ?? DEFAULT_BASE_URL),
    artifactDir,
    reportPath,
  };
}

function isIgnorableDiagnostic(value) {
  return [
    /accounts\.google\.com/iu,
    /Google Identity Services/iu,
    /google\.accounts/iu,
    /app-config\.js/iu,
    /favicon/iu,
    /ResizeObserver loop/iu,
    /ERR_ABORTED/iu,
  ].some((pattern) => pattern.test(String(value)));
}

function addFailure(entry, category, message, details = {}) {
  entry.failures.push({
    category,
    message,
    ...details,
  });
}

function attachPageDiagnostics(page, entry) {
  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (isIgnorableDiagnostic(text)) {
      return;
    }
    addFailure(entry, 'rendering', 'Unexpected browser console error.', { text });
  });

  page.on('pageerror', (error) => {
    addFailure(entry, 'rendering', 'Unexpected page error.', { text: error.message });
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status < 400 || isIgnorableDiagnostic(url)) {
      return;
    }
    addFailure(entry, classifyHttpFailureCategory(response.request()), `HTTP ${status} while loading public entry.`, {
      status,
      url: sanitizeUrlForReport(url),
      resourceType: response.request().resourceType(),
    });
  });
}

async function waitForAppReady(page, entry) {
  try {
    await page.waitForLoadState('domcontentloaded');
    await page.locator('ion-app, app-root').first().waitFor({
      state: 'attached',
      timeout: APP_READY_TIMEOUT_MS,
    });
    await page
      .waitForFunction(
        () => {
          const testabilityApi = window;
          const testabilities = testabilityApi.getAllAngularTestabilities?.() ?? [];
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
        { timeout: APP_READY_TIMEOUT_MS },
      )
      .catch(() => true);
  } catch (error) {
    addFailure(entry, 'rendering', 'App shell did not become ready.', {
      text: error instanceof Error ? error.message : String(error),
    });
  }
}

async function navigateAndWait(page, entry, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!response || !response.ok()) {
      addFailure(entry, 'routing', 'Public entry route did not return a successful document response.', {
        status: response?.status() ?? null,
        url: sanitizeUrlForReport(url),
      });
    }
  } catch (error) {
    addFailure(entry, 'routing', 'Public entry route navigation failed.', {
      text: error instanceof Error ? error.message : String(error),
      url: sanitizeUrlForReport(url),
    });
  }

  await waitForAppReady(page, entry);
}

async function saveScreenshot(page, entry, artifactDir, filename) {
  const screenshotPath = path.join(artifactDir, 'screenshots', filename);
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    entry.evidence.screenshot = path.relative(artifactDir, screenshotPath).replace(/\\/gu, '/');
  } catch (error) {
    addFailure(entry, 'rendering', 'Unable to capture screenshot evidence.', {
      text: error instanceof Error ? error.message : String(error),
    });
  }
}

async function ionInputValue(locator) {
  return locator.evaluate(async (element) => {
    await element.componentOnReady?.();
    return element.value ?? element.querySelector('input, textarea')?.value ?? '';
  });
}

function createEntry({ id, url }) {
  return {
    id,
    url: sanitizeUrlForReport(url),
    status: 'pending',
    failures: [],
    evidence: {},
  };
}

async function checkGuideEntry(context, { baseUrl, artifactDir }) {
  const url = buildPublicEntryUrl(baseUrl, PUBLIC_ENTRY_GUIDE.path);
  const entry = createEntry({ id: PUBLIC_ENTRY_GUIDE.id, url });
  const page = await context.newPage();
  attachPageDiagnostics(page, entry);
  await navigateAndWait(page, entry, url);

  const headingVisible = await page
    .getByRole('heading', { name: PUBLIC_ENTRY_GUIDE.heading })
    .first()
    .isVisible({ timeout: APP_READY_TIMEOUT_MS })
    .catch(() => false);

  if (!headingVisible) {
    addFailure(entry, 'rendering', `Expected guide heading "${PUBLIC_ENTRY_GUIDE.heading}" was not visible.`);
  }

  await saveScreenshot(page, entry, artifactDir, 'guide-route.png');
  await page.close();
  entry.status = entry.failures.length ? 'failed' : 'ok';
  return entry;
}

async function checkShareLinkEntry(context, { baseUrl, artifactDir }) {
  const url = buildSyntheticShareUrl(baseUrl);
  const entry = createEntry({ id: PUBLIC_ENTRY_SHARE_LINK.id, url });
  const page = await context.newPage();
  attachPageDiagnostics(page, entry);
  await navigateAndWait(page, entry, url);

  const shareError = page.getByTestId('manual-share-error');
  const shareErrorVisible = await shareError.isVisible({ timeout: 2_000 }).catch(() => false);
  if (shareErrorVisible) {
    addFailure(entry, 'decoding', 'Manual Team Builder reported a share-link decoding error.', {
      text: ((await shareError.textContent().catch(() => '')) ?? '').replace(/\s+/gu, ' ').trim(),
    });
  }

  const teamName = await ionInputValue(page.getByTestId('manual-team-name')).catch(() => '');
  const notes = await ionInputValue(page.getByTestId('manual-team-notes')).catch(() => '');
  const slotVisible = await page
    .getByTestId('manual-team-slot-0')
    .getByText(PUBLIC_ENTRY_SHARE_LINK.expectedSlotText)
    .first()
    .isVisible({ timeout: APP_READY_TIMEOUT_MS })
    .catch(() => false);

  if (teamName !== PUBLIC_ENTRY_SYNTHETIC_TEAM.name) {
    addFailure(entry, 'rendering', 'Manual Team Builder did not render the synthetic team name.');
  }
  if (notes !== PUBLIC_ENTRY_SYNTHETIC_TEAM.notes) {
    addFailure(entry, 'rendering', 'Manual Team Builder did not render the synthetic team notes.');
  }
  if (!slotVisible) {
    addFailure(entry, 'rendering', `Manual Team Builder did not render "${PUBLIC_ENTRY_SHARE_LINK.expectedSlotText}" in slot 1.`);
  }

  await saveScreenshot(page, entry, artifactDir, 'share-link-landing.png');
  await page.close();
  entry.status = entry.failures.length ? 'failed' : 'ok';
  return entry;
}

export async function runPublicEntrySynthetics(options = {}) {
  const baseUrl = normalizePublicEntryBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const artifactDir = path.resolve(options.artifactDir ?? defaultArtifactDir);
  const reportPath = path.resolve(options.reportPath ?? path.join(artifactDir, 'public-entry-synthetics-report.json'));
  await mkdir(artifactDir, { recursive: true });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baseUrl,
    status: 'pending',
    checkedEntries: [],
  };

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    report.checkedEntries.push(await checkGuideEntry(context, { baseUrl, artifactDir }));
    report.checkedEntries.push(await checkShareLinkEntry(context, { baseUrl, artifactDir }));
    await context.close();
  } finally {
    await browser.close();
  }

  report.status = report.checkedEntries.every((entry) => entry.status === 'ok') ? 'ok' : 'failed';
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectRun()) {
  const options = resolvePublicEntrySyntheticsCliOptions();
  const { report, reportPath } = await runPublicEntrySynthetics(options);
  const relativeReportPath = path.relative(projectRoot, reportPath);

  if (report.status === 'ok') {
    console.log(
      `[public-entry-synthetics] checked ${report.checkedEntries.length} public entry flows; report=${relativeReportPath}.`,
    );
  } else {
    for (const entry of report.checkedEntries) {
      for (const failure of entry.failures) {
        console.error(
          `[public-entry-synthetics] ${entry.id} ${failure.category}: ${failure.message}`,
        );
      }
    }
    console.error(`[public-entry-synthetics] report=${relativeReportPath}.`);
    process.exitCode = 1;
  }
}

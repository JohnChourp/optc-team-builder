import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import {
  IMPORTED_SAVED_TEAM,
  SEEDED_SAVED_TEAMS,
  buildSavedTeamsTransferJson,
  expectIonValue,
  parseSavedTeamShareCode,
  seedBrowserState,
  setIonSelect,
  setIonTextarea,
  setIonToggle,
  waitForAppReady,
} from './regression-fixtures';

test.describe('high-value regression flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('guided auto build controls expose the next-slot state @guided-auto-build @guided-auto-build-controls', async ({
    page,
  }) => {
    await seedBrowserState(page, []);

    await page.goto('/tabs/auto-team-builder');
    await waitForAppReady(page);

    await expect(page.getByText('Guided auto build')).toBeVisible();
    await expect(page.getByText(/Build and lock only the next empty slot: Captain/)).toBeVisible();

    const guidedToggle = page.getByTestId('guided-auto-build-toggle');
    await setIonToggle(guidedToggle, true);
    await expect(guidedToggle).toHaveAttribute('data-guided-enabled', 'true');
    await expect(page.getByText(/Build and lock only the next empty slot: Captain/)).toBeVisible();
    await expect(page.getByTestId('auto-build-submit')).toBeEnabled();
  });

  test('guided auto build locks only the next empty slot @guided-auto-build @quarantined:guided-auto-build-toggle', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Full guided Auto Team Builder worker state transition remains tracked as a browser-specific exception; Firefox/WebKit run the guided controls subset.',
    );
    test.setTimeout(120_000);
    await seedBrowserState(page, []);

    await page.goto('/tabs/auto-team-builder');
    await waitForAppReady(page);

    await expect(page.getByText('Guided auto build')).toBeVisible();
    await expect(page.getByText(/Build and lock only the next empty slot: Captain/)).toBeVisible();

    const guidedToggle = page.getByTestId('guided-auto-build-toggle');
    await setIonToggle(guidedToggle, true);
    await expect(guidedToggle).toHaveAttribute('data-guided-enabled', 'true');
    await expect(page.getByTestId('auto-build-submit')).toBeEnabled();
    await page.getByTestId('auto-build-submit').click();

    await expect(page.getByText(/Build and lock only the next empty slot: Sub 1/)).toBeVisible({
      timeout: 90_000,
    });
    await expect(page.locator('.result-slot-card')).toHaveCount(0);
  });

  test('compare mode supports saved and imported sources with readable diffs', async ({ page }) => {
    await seedBrowserState(page);

    await page.goto('/tabs/auto-team-builder');
    await waitForAppReady(page);

    await page.getByTestId('compare-toggle').click();
    await expect(page.getByTestId('compare-empty-state')).toContainText(
      'Choose two comparable teams',
    );

    await setIonSelect(page.getByTestId('compare-source-a'), 'saved');
    await expect(page.getByTestId('compare-summary-a')).toContainText('E2E Regression Crew A');

    await setIonSelect(page.getByTestId('compare-source-b'), 'imported');
    await setIonTextarea(
      page.getByTestId('compare-import-payload-b'),
      buildSavedTeamsTransferJson([IMPORTED_SAVED_TEAM]),
    );
    await page.getByTestId('compare-use-payload-b').click();

    await expect(page.getByTestId('compare-summary-b')).toContainText('E2E Imported Crew');
    await expect(page.getByTestId('compare-metric-grid')).toContainText('Filled slots');
    await expect(page.getByTestId('compare-slot-list')).toContainText('Changed');

    await page.getByTestId('compare-swap').click();
    await expect(page.getByTestId('compare-summary-a')).toContainText('E2E Imported Crew');
    await expect(page.getByTestId('compare-summary-b')).toContainText('E2E Regression Crew A');
  });

  test('saved-team export, share import, and invalid payload handling stay intact', async ({
    page,
  }) => {
    await seedBrowserState(page, [SEEDED_SAVED_TEAMS[0]!]);

    await page.goto('/tabs/saved-teams');
    await waitForAppReady(page);
    await expect(page.getByText('E2E Regression Crew A')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('saved-team-export-e2e-regression-crew-a').click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath, 'download path should be available locally').toBeTruthy();
    const exportedPayload = JSON.parse(await readFile(downloadPath!, 'utf8')) as {
      source?: string;
      teams?: Array<{ id?: string; name?: string }>;
    };
    expect(exportedPayload.source).toBe('saved-teams');
    expect(exportedPayload.teams?.[0]).toMatchObject({
      id: 'e2e-regression-crew-a',
      name: 'E2E Regression Crew A',
    });

    await page.getByTestId('saved-team-share-link-e2e-regression-crew-a').click();
    await expect(page.getByTestId('saved-teams-action-feedback')).toContainText('Copied');
    const copiedShareLink = await page.evaluate(() => navigator.clipboard.readText());
    const copiedShareUrl = new URL(copiedShareLink);
    expect(copiedShareUrl.pathname).toBe('/tabs/manual-team-builder');
    const copiedShareCode = copiedShareUrl.searchParams.get('teamShare');
    expect(copiedShareCode, 'share link should include a teamShare payload').toBeTruthy();
    expect(parseSavedTeamShareCode(copiedShareCode!)).toMatchObject({
      schemaVersion: 1,
      source: 'saved-team-share',
      team: SEEDED_SAVED_TEAMS[0],
    });

    await page.getByTestId('saved-team-share-code-e2e-regression-crew-a').click();
    await expect(page.getByTestId('saved-teams-action-feedback')).toContainText('Copied');
    const copiedRawShareCode = await page.evaluate(() => navigator.clipboard.readText());
    expect(parseSavedTeamShareCode(copiedRawShareCode)).toMatchObject({
      schemaVersion: 1,
      source: 'saved-team-share',
      team: SEEDED_SAVED_TEAMS[0],
    });

    await page.goto(`${copiedShareUrl.pathname}${copiedShareUrl.search}`);
    await waitForAppReady(page);
    await expectIonValue(page.getByTestId('manual-team-name'), 'E2E Regression Crew A');
    await expectIonValue(page.getByTestId('manual-team-notes'), 'Seeded by browser regression tests.');
    await expect(page.getByTestId('manual-team-slot-0')).toContainText('Sergeant Helmeppo', {
      timeout: 45_000,
    });

    await page.goto('/tabs/saved-teams');
    await waitForAppReady(page);
    await page.getByTestId('saved-teams-import-open').first().click();
    const importModal = page.locator('ion-modal.saved-teams-import-modal.show-modal');
    await expect(importModal).toBeVisible();

    await importModal.getByTestId('saved-teams-import-file').setInputFiles({
      name: 'invalid-saved-teams.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schemaVersion":99,"source":"saved-teams","teams":[]}'),
    });
    await expect(importModal.getByTestId('saved-teams-import-feedback')).toContainText(
      'Import failed',
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rawValue = localStorage.getItem('CapacitorStorage.savedTeams') ?? '[]';
          return JSON.parse(rawValue).map((team: { id: string }) => team.id);
        }),
      )
      .toEqual(['e2e-regression-crew-a']);

    await importModal.getByTestId('saved-teams-import-file').setInputFiles({
      name: 'valid-saved-teams.json',
      mimeType: 'application/json',
      buffer: Buffer.from(buildSavedTeamsTransferJson([IMPORTED_SAVED_TEAM])),
    });
    await expect(importModal.getByTestId('saved-teams-import-feedback')).toContainText(
      'Import completed',
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rawValue = localStorage.getItem('CapacitorStorage.savedTeams') ?? '[]';
          return JSON.parse(rawValue).map((team: { id: string }) => team.id).sort();
        }),
      )
      .toEqual(['e2e-imported-crew', 'e2e-regression-crew-a']);
  });
});

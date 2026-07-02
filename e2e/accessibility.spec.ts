import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  IMPORTED_SAVED_TEAM,
  SEEDED_SAVED_TEAMS,
  buildSavedTeamsTransferJson,
  expectIonValue,
  parseSavedTeamShareCode,
  seedBrowserState,
  setIonSelect,
  setIonTextarea,
  waitForAppReady,
} from './regression-fixtures';

test.describe('guided compare and sharing accessibility @accessibility', () => {
  test.describe.configure({ mode: 'serial' });

  test('guided build and compare controls expose keyboard operation and semantics', async ({
    page,
  }) => {
    await seedBrowserState(page, []);

    await page.goto('/tabs/auto-team-builder');
    await waitForAppReady(page);

    const guidedToggle = page.getByTestId('guided-auto-build-toggle');
    await guidedToggle.focus();
    await page.keyboard.press('Space');
    await expect(guidedToggle).toHaveAttribute('data-guided-enabled', 'true');
    await expect(page.getByTestId('auto-build-submit')).toBeEnabled();

    const buildButton = page.getByTestId('auto-build-submit');
    await expect(buildButton).toContainText('Auto Team Build');

    const compareToggle = page.getByTestId('compare-toggle');
    await expect(compareToggle).toHaveAttribute('aria-expanded', 'false');
    await compareToggle.focus();
    await page.keyboard.press('Enter');
    await expect(compareToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('compare-empty-state')).toBeVisible();

    await expectNoAxeViolations(page, '.favorite-scope-grid');
    await expectNoAxeViolations(page, '#auto-team-builder-compare-panel');
  });

  test('compare imports expose errors and source changes to assistive tech', async ({ page }) => {
    await seedBrowserState(page);

    await page.goto('/tabs/auto-team-builder');
    await waitForAppReady(page);

    await page.getByTestId('compare-toggle').click();
    await expect(page.getByTestId('compare-empty-state')).toHaveAttribute('role', 'status');

    await setIonSelect(page.getByTestId('compare-source-a'), 'saved');
    await expect(page.getByTestId('compare-summary-a')).toContainText('E2E Regression Crew A');
    await expect(page.getByTestId('compare-summary-a')).toHaveAttribute('role', 'status');

    await setIonSelect(page.getByTestId('compare-source-b'), 'imported');
    await setIonTextarea(
      page.getByTestId('compare-import-payload-b'),
      buildSavedTeamsTransferJson([IMPORTED_SAVED_TEAM]),
    );

    const usePayloadButton = page.getByTestId('compare-use-payload-b');
    await usePayloadButton.press('Enter');
    await expect(page.getByTestId('compare-summary-b')).toContainText('E2E Imported Crew');

    await page.getByTestId('compare-swap').press('Enter');
    await expect(page.getByTestId('compare-summary-a')).toContainText('E2E Imported Crew');

    await setIonTextarea(page.getByTestId('compare-import-payload-a'), 'not-json');
    await page.getByTestId('compare-use-payload-a').press('Enter');
    await expect(page.getByTestId('compare-summary-a')).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('compare-summary-a')).toContainText(
      'This payload is not a supported saved team, share link, preset, or team export.',
    );

    await expectNoAxeViolations(page, '#auto-team-builder-compare-panel');
  });

  test('saved-team share and import feedback are keyboard reachable live regions', async ({
    page,
  }) => {
    await seedBrowserState(page, [SEEDED_SAVED_TEAMS[0]!]);

    await page.goto('/tabs/saved-teams');
    await waitForAppReady(page);
    await expect(page.getByText('E2E Regression Crew A')).toBeVisible();

    const shareLinkButton = page.getByTestId('saved-team-share-link-e2e-regression-crew-a');
    await shareLinkButton.press('Enter');
    await expect(page.getByTestId('saved-teams-action-feedback')).toHaveAttribute(
      'role',
      'status',
    );
    await expect(page.getByTestId('saved-teams-action-feedback')).toContainText('Copied');
    const copiedShareLink = await page.evaluate(() => navigator.clipboard.readText());
    const copiedShareUrl = new URL(copiedShareLink);

    const shareCodeButton = page.getByTestId('saved-team-share-code-e2e-regression-crew-a');
    await shareCodeButton.press('Enter');
    await expect(page.getByTestId('saved-teams-action-feedback')).toContainText('Copied');
    expect(parseSavedTeamShareCode(await page.evaluate(() => navigator.clipboard.readText()))).toMatchObject({
      schemaVersion: 1,
      source: 'saved-team-share',
      team: SEEDED_SAVED_TEAMS[0],
    });

    await page.goto(`${copiedShareUrl.pathname}${copiedShareUrl.search}`);
    await waitForAppReady(page);
    await expectIonValue(page.getByTestId('manual-team-name'), 'E2E Regression Crew A');
    await expect(page.getByTestId('manual-team-slot-0')).toContainText('Sergeant Helmeppo', {
      timeout: 45_000,
    });
    await expectNoAxeViolations(page, '.manual-team-builder-shell');

    await page.goto('/tabs/saved-teams');
    await waitForAppReady(page);
    const importButton = page.getByTestId('saved-teams-import-open').first();
    await importButton.press('Enter');

    const importModal = page.locator('ion-modal.saved-teams-import-modal.show-modal');
    await expect(importModal).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.activeElement?.classList.contains('import-dropzone') ?? false),
      )
      .toBe(true);

    await importModal.getByTestId('saved-teams-import-file').setInputFiles({
      name: 'invalid-saved-teams.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schemaVersion":99,"source":"saved-teams","teams":[]}'),
    });
    await expect(importModal.getByTestId('saved-teams-import-feedback')).toHaveAttribute(
      'role',
      'alert',
    );
    await expect(importModal.getByTestId('saved-teams-import-feedback')).toContainText(
      'Import failed',
    );

    await expectNoAxeViolations(page, '.saved-teams-import-modal');
  });
});

async function expectNoAxeViolations(page: Page, selector: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .disableRules(['color-contrast'])
    .analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));

  expect(violations).toEqual([]);
}

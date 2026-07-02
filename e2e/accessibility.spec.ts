import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  IMPORTED_SAVED_TEAM,
  SEEDED_SAVED_ENEMIES,
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

    await expectModalDialogName(importModal);
    await expectNoAxeViolations(page, '.saved-teams-import-modal');
  });

  test('legacy core screens expose keyboard paths and scoped semantics', async ({ page }) => {
    await seedBrowserState(page, SEEDED_SAVED_TEAMS, SEEDED_SAVED_ENEMIES);

    await page.goto('/tabs/manual-team-builder');
    await waitForAppReady(page);
    await expect(page.getByTestId('manual-team-name')).toBeVisible();
    await expectNoAxeViolations(page, '.manual-team-builder-shell');

    const manualSlotEdit = page.getByTestId('manual-team-slot-edit-0');
    await manualSlotEdit.focus();
    await page.keyboard.press('Space');
    const manualPicker = page.locator('ion-modal.pick-editor-modal.show-modal');
    await expect(manualPicker).toBeVisible();
    await expect(
      manualPicker.getByRole('button', { name: /close character picker/i }),
    ).toBeVisible();
    await expectModalDialogName(manualPicker);
    await expectNoAxeViolations(page, 'ion-modal.pick-editor-modal');
    await manualPicker.getByRole('button', { name: /close character picker/i }).click();

    await page.goto('/tabs/saved-teams');
    await waitForAppReady(page);
    await expect(page.getByText('E2E Regression Crew A')).toBeVisible();
    await expectNoAxeViolations(page, '.saved-teams-shell');

    await page.goto('/tabs/saved-enemies');
    await waitForAppReady(page);
    await expect(page.getByText('Loading saved enemies...')).toBeHidden({ timeout: 45_000 });
    await expect(page.getByText('E2E Legacy A11y Boss')).toBeVisible();
    await expectNoAxeViolations(page, '.saved-enemies-shell');

    const savedEnemyEdit = page.getByRole('button', { name: 'Edit' }).first();
    await savedEnemyEdit.focus();
    await page.keyboard.press('Space');
    const savedEnemyEditor = page.locator('ion-modal.saved-enemies-editor-modal.show-modal');
    await expect(savedEnemyEditor).toBeVisible();
    await expect(savedEnemyEditor.getByRole('button', { name: 'Close' })).toBeVisible();
    await expectModalDialogName(savedEnemyEditor);
    await expectNoAxeViolations(page, 'ion-modal.saved-enemies-editor-modal');

    await savedEnemyEditor.getByRole('button', { name: /manage linked teams/i }).press('Space');
    const teamAssociationPicker = page.locator('ion-modal.enemy-team-association-modal.show-modal');
    await expect(teamAssociationPicker).toBeVisible();
    await expect(teamAssociationPicker.getByRole('button', { name: 'Close' })).toBeVisible();
    await expectModalDialogName(teamAssociationPicker);
    await expectNoAxeViolations(page, 'ion-modal.enemy-team-association-modal');

    await page.goto('/tabs/captain-coverage');
    await waitForAppReady(page);
    await expect(page.locator('.coverage-team-slot').first()).toBeVisible();
    await expectNoAxeViolations(page, '.captain-coverage-shell');

    const firstCoverageSlot = page.locator('.coverage-team-slot').first();
    await firstCoverageSlot.focus();
    await page.keyboard.press('Enter');
    const captainPicker = page.locator('ion-modal.character-image-picker-modal.show-modal');
    await expect(captainPicker).toBeVisible();
    await expect(captainPicker.getByRole('button', { name: 'Close' })).toBeVisible();
    await expectModalDialogName(captainPicker);
    await expectNoAxeViolations(page, 'ion-modal.character-image-picker-modal');
  });
});

async function expectModalDialogName(modal: Locator): Promise<void> {
  await expect
    .poll(() =>
      modal.evaluate((element) => {
        const dialogElement =
          element.querySelector('[role="dialog"]') ??
          element.shadowRoot?.querySelector('[role="dialog"]');

        return dialogElement?.getAttribute('aria-label')?.trim() ?? '';
      }),
    )
    .not.toBe('');
}

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

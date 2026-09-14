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
  waitForAppAttached,
  waitForIonControlEnabled,
} from './regression-fixtures';

test.describe('guided compare and sharing accessibility @accessibility', () => {
  test.describe.configure({ mode: 'serial' });

  test('guided build and compare controls expose keyboard operation and semantics', async ({
    page,
  }) => {
    await seedBrowserState(page, []);

    await page.goto('/tabs/auto-team-builder');
    await waitForAppAttached(page);

    const guidedToggle = page.getByTestId('guided-auto-build-toggle');
    // Wait BEFORE the keypress, not after the toggle. This is the raw-keypress
    // path with no retry loop, so a press that lands early is simply lost - and
    // this spec runs on all three engines, unlike the two chromium-only ones.
    await waitForIonControlEnabled(guidedToggle);
    await guidedToggle.focus();
    await page.keyboard.press('Space');
    await expect(guidedToggle).toHaveAttribute('data-guided-enabled', 'true');
    await waitForIonControlEnabled(page.getByTestId('auto-build-submit'));

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
    await waitForAppAttached(page);

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
    await waitForAppAttached(page);
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
    await waitForAppAttached(page);
    await expectIonValue(page.getByTestId('manual-team-name'), 'E2E Regression Crew A');
    await expect(page.getByTestId('manual-team-slot-0')).toContainText('Sergeant Helmeppo', {
      timeout: 45_000,
    });
    await expectNoAxeViolations(page, '.manual-team-builder-shell');

    await page.goto('/tabs/saved-teams');
    await waitForAppAttached(page);
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
    await waitForAppAttached(page);
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
    await waitForAppAttached(page);
    await expect(page.getByText('E2E Regression Crew A')).toBeVisible();
    await expectNoAxeViolations(page, '.saved-teams-shell');

    await page.goto('/tabs/saved-enemies');
    await waitForAppAttached(page);
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
    await waitForAppAttached(page);
    await expect(page.locator('.coverage-team-slot').first()).toBeVisible();
    await expectNoAxeViolations(page, '.captain-coverage-shell');

    // Team slots no longer open a picker. Characters are chosen from the result
    // list, so the slot is a keyboard-reachable jump to that list and nothing
    // else must appear on top of the page.
    const firstCoverageSlot = page.locator('.coverage-team-slot__pick').first();
    await firstCoverageSlot.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('ion-modal.character-image-picker-modal')).toHaveCount(0);
    await expect(page.locator('.captain-result').first()).toBeVisible();
    await expect(page.locator('[data-test="captain-result-set-leader"]').first()).toBeVisible();
  });
});

/*
 * 869f12x4r. The spec above covered four flows; the FAQ and Settings were in
 * none of them. They are first here on purpose, in the order the subtask set:
 * the page a player in difficulty reaches first, then the screen that holds
 * their data.
 *
 * This block is deliberately NOT `serial`, unlike the one above. Measured on
 * clean `main` before writing a line of it: one control run failed a single
 * test and reported "2 did not run", because serial mode abandons the rest of
 * the block. A second control run passed all four, so that failure was flake -
 * but a flake that hides two unrelated tests costs more than the one it hit.
 * Independent tests here mean a flake reports exactly what flaked.
 */
/*
 * 869f12x4r. The spec above covered four flows; the FAQ and Settings were in
 * none of them. They are first here on purpose, in the order the subtask set:
 * the page a player in difficulty reaches first, then the screen that holds
 * their data.
 *
 * This block is deliberately NOT `serial`, unlike the one above. Measured on
 * clean `main` before writing a line of it: one control run failed a single
 * test and reported "2 did not run", because serial mode abandons the rest of
 * the block. A second control run passed all four, so that failure was flake -
 * but a flake that hides two unrelated tests costs more than the one it hit.
 * Independent tests here mean a flake reports exactly what flaked.
 */
test.describe('faq and settings accessibility @accessibility', () => {
  test('every FAQ question is reachable by Tab and opens on Enter', async ({ page }) => {
    await seedBrowserState(page, []);

    await page.goto('/tabs/faq');
    await waitForAppAttached(page);

    const accordions = page.locator('ion-accordion.faq-accordion');

    await expect(accordions.first()).toBeVisible();
    await expectNoAxeViolations(page, '.faq-shell');

    const questionCount = await accordions.count();

    expect(questionCount).toBeGreaterThan(1);

    /*
     * Tab, rather than `.focus()` on the header.
     *
     * `ion-item` is not focusable; the control that takes focus is the
     * `button.item-native` inside its shadow root, and Ionic's accordion wires
     * the keyboard to that. Focusing the light-DOM host silently does nothing -
     * measured, the active element stayed `BODY` and Enter went nowhere, which
     * reads exactly like "the FAQ is keyboard-inaccessible" and is not. Tabbing
     * is also what a keyboard user actually does, so a regression in reachability
     * fails this instead of being papered over by a direct focus call.
     */
    const walk = await tabTowardFaqAccordion(page);

    /*
     * Three outcomes, not two, because one engine here does no sequential focus
     * navigation at all.
     *
     * Measured 2026-09-14 on Playwright's WebKit: fifteen Tab presses left the
     * deep active element as `BODY` every time, and so did four presses with a
     * freshly injected native `<input>` and `<button>` at the top of the
     * document. Chromium on the same page walks the menu button, six FAQ
     * headers, two links and a button. So a failure here on WebKit measured the
     * engine's focus policy, not this app's markup - the FAQ control is fully
     * operable there, which the fallback below proves rather than assumes.
     *
     * The branch is chosen by capability, never by browser name: an engine that
     * moves focus but skips the FAQ is a real defect and still fails, and a
     * future WebKit that gains Tab navigation is held to the stronger assertion
     * automatically. Neither branch is a skip - both end with focus on the
     * header and run the same Enter and `aria-expanded` assertions below.
     */
    if (!walk.reachedHeader) {
      expect(
        walk.movedAtAll,
        `Tab moved focus but never reached a FAQ question - visited ${walk.visited.join(' -> ')}`,
      ).toBe(false);

      await focusFirstFaqHeader(page);

      await expect
        .poll(async () => (await page.evaluate(readDeepActiveElement)).insideFaqAccordion)
        .toBe(true);
    }

    await page.keyboard.press('Enter');

    const expanded = page.locator('ion-accordion.faq-accordion.accordion-expanded');

    await expect(expanded).toHaveCount(1);

    /*
     * And the state has to be announced, not merely rendered. Ionic keeps
     * `aria-expanded` on the shadow button, so the value a screen reader sees is
     * not on the element this page's own markup declares - checking the host
     * would pass while announcing nothing.
     */
    await expect
      .poll(() => readFaqHeaderAriaExpanded(page))
      .toBe('true');

    const answer = page.locator('[data-test^="faq-answer-"]').first();

    await expect(answer).toBeVisible();
    await expect(answer).not.toBeEmpty();

    for (const link of await answer.locator('ion-button').all()) {
      await expect(link, 'every link out of an answer is named, not an icon').not.toBeEmpty();
    }

    await expectNoAxeViolations(page, '.faq-shell');
  });

  test('the FAQ headings describe the page in reading order', async ({ page }) => {
    await seedBrowserState(page, []);

    await page.goto('/tabs/faq');
    await waitForAppAttached(page);
    await expect(page.locator('ion-accordion.faq-accordion').first()).toBeVisible();

    /*
     * One `h1`, then an `h2` per section, in document order and none empty.
     * A screen-reader user navigates this page by heading; a page that is one
     * flat list of questions cannot be skimmed that way, and `axe` only checks
     * that levels are not skipped - never that the outline is meaningful.
     */
    await expect(page.locator('.faq-shell h1')).toHaveCount(1);

    const sectionHeadings = page.locator('.faq-shell .faq-card h2');

    expect(await sectionHeadings.count()).toBeGreaterThan(1);

    for (const heading of await sectionHeadings.all()) {
      await expect(heading).not.toBeEmpty();
    }
  });

  test('Settings exposes its data controls with names, not just icons', async ({ page }) => {
    await seedBrowserState(page, SEEDED_SAVED_TEAMS, SEEDED_SAVED_ENEMIES);

    await page.goto('/tabs/settings');
    await waitForAppAttached(page);
    // This page marks its hooks `data-test`, not the `data-testid` getByTestId reads.
    await expect(page.locator('[data-test="settings-about"]')).toBeVisible();
    await expectNoAxeViolations(page, '.settings-shell');

    /*
     * This screen is where a player exports, imports and deletes everything they
     * own, so an unnamed control here is worse than elsewhere: the irreversible
     * actions are the ones that must not be guessed at.
     */
    const buttons = await page.locator('.settings-shell ion-button').all();

    expect(buttons.length).toBeGreaterThan(5);

    for (const button of buttons) {
      const accessibleName = (
        (await button.getAttribute('aria-label')) ??
        (await button.textContent()) ??
        ''
      ).trim();

      expect(accessibleName, 'every Settings button has an accessible name').not.toBe('');
    }
  });

  test('Settings reports the build a problem report has to quote', async ({ page }) => {
    await seedBrowserState(page, []);

    await page.goto('/tabs/settings');
    await waitForAppAttached(page);

    /*
     * The About block is what a player is asked to read out when something is
     * wrong, so it has to be populated rather than rendering definition terms
     * with nothing after them.
     */
    await expect(page.locator('[data-test="settings-about"]')).toBeVisible();
    await expect(page.locator('[data-test="settings-app-version"]')).not.toBeEmpty();
    await expect(page.locator('[data-test="settings-character-count"]')).not.toBeEmpty();
    await expectNoAxeViolations(page, '[data-test="settings-about"]');
  });
});

/** The deepest active element, following open shadow roots the way focus really lands. */
function readDeepActiveElement(): { insideFaqAccordion: boolean; tag: string } {
  let node: Element | null = document.activeElement;

  while (node?.shadowRoot?.activeElement) {
    node = node.shadowRoot.activeElement;
  }

  const host = node?.getRootNode() as ShadowRoot | Document | null;
  const owner = host instanceof ShadowRoot ? host.host : node;

  return {
    insideFaqAccordion: Boolean(owner?.closest('ion-accordion.faq-accordion')),
    tag: node?.tagName ?? 'NONE',
  };
}

/**
 * What a Tab run actually did.
 *
 * `reachedHeader` alone cannot tell "this engine does not tab to anything" from
 * "this app's FAQ is unreachable", and those need opposite responses. Recording
 * whether focus ever left `BODY`, and what it visited, separates them.
 */
interface FaqTabWalk {
  /** Focus landed inside a FAQ accordion header. */
  reachedHeader: boolean;
  /** Focus left `BODY` at least once, for any control at all. */
  movedAtAll: boolean;
  /** Every tag focus visited, so a failure names the path instead of a boolean. */
  visited: string[];
}

async function tabTowardFaqAccordion(page: Page, maxPresses = 15): Promise<FaqTabWalk> {
  await page.locator('body').click({ position: { x: 4, y: 4 } });

  const visited: string[] = [];
  let movedAtAll = false;

  for (let press = 0; press < maxPresses; press += 1) {
    await page.keyboard.press('Tab');

    const active = await page.evaluate(readDeepActiveElement);

    visited.push(active.tag);

    if (active.tag !== 'BODY') {
      movedAtAll = true;
    }

    if (active.insideFaqAccordion) {
      return { reachedHeader: true, movedAtAll: true, visited };
    }
  }

  return { reachedHeader: false, movedAtAll, visited };
}

/**
 * Focus the control Ionic wires the keyboard to: the `button.item-native` inside
 * `ion-item`'s shadow root. Focusing the light-DOM host does nothing.
 */
async function focusFirstFaqHeader(page: Page): Promise<void> {
  await page
    .locator('ion-accordion.faq-accordion')
    .first()
    .evaluate((element) => {
      element.querySelector('ion-item')?.shadowRoot?.querySelector('button')?.focus();
    });
}

/** `aria-expanded` as a screen reader sees it: on the shadow button, not the host. */
async function readFaqHeaderAriaExpanded(page: Page): Promise<string> {
  return page
    .locator('ion-accordion.faq-accordion')
    .first()
    .evaluate(
      (element) =>
        element
          .querySelector('ion-item')
          ?.shadowRoot?.querySelector('button')
          ?.getAttribute('aria-expanded') ?? 'ABSENT',
    );
}

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

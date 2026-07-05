import { expect, test, type Page } from '@playwright/test';

import {
  SEEDED_SAVED_TEAMS,
  buildSavedTeamShareUrl,
  seedBrowserState,
  waitForAppReady,
} from './regression-fixtures';

const VISUAL_VIEWPORTS = [
  { id: 'desktop', width: 1366, height: 900 },
  { id: 'mobile', width: 390, height: 844 },
] as const;

const GUIDE_STATES = [
  {
    id: 'team-building-guide',
    path: '/guides/how-to-build-an-optc-team',
    heading: 'How to Build an OPTC Team',
  },
  {
    id: 'guided-share-guide',
    path: '/guides/guided-build-compare-team-sharing',
    heading: 'Guided Build, Compare Mode, and Team Sharing',
  },
] as const;

const SNAPSHOT_OPTIONS = {
  threshold: 0.25,
  maxDiffPixelRatio: 0.02,
} as const;

test.describe('public entry visual baselines @public-entry-visual', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Visual baselines are maintained for Chromium only.');
  test.skip(process.platform !== 'linux', 'Visual baselines are compared on Linux to match CI rendering.');

  for (const viewport of VISUAL_VIEWPORTS) {
    test.describe(`${viewport.id} viewport`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        colorScheme: 'light',
        locale: 'en-US',
      });

      for (const state of GUIDE_STATES) {
        test(`${state.id} matches the ${viewport.id} baseline`, async ({ page }) => {
          await seedBrowserState(page);
          await page.goto(state.path, { waitUntil: 'domcontentloaded' });
          await waitForAppReady(page);
          await prepareVisualSnapshot(page);

          await page
            .getByRole('heading', { name: state.heading })
            .first()
            .waitFor({ state: 'visible', timeout: 45_000 });

          await expectPublicEntrySnapshot(page, `${viewport.id}-${state.id}.png`);
        });
      }

      test(`manual share-link landing matches the ${viewport.id} baseline`, async ({ page, baseURL }) => {
        const team = SEEDED_SAVED_TEAMS[0]!;
        await seedBrowserState(page, [team]);
        await page.goto(buildSavedTeamShareUrl(team, baseURL), {
          waitUntil: 'domcontentloaded',
        });
        await waitForAppReady(page);
        await prepareVisualSnapshot(page);

        await page.getByTestId('manual-team-name').waitFor({ state: 'attached', timeout: 45_000 });
        await page
          .getByTestId('manual-team-slot-0')
          .getByText('Sergeant Helmeppo')
          .first()
          .waitFor({ state: 'visible', timeout: 45_000 });

        await expectPublicEntrySnapshot(page, `${viewport.id}-manual-share-link.png`);
      });
    });
  }
});

async function prepareVisualSnapshot(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }

      ion-content::part(scroll) {
        scroll-behavior: auto !important;
      }
    `,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(250);
}

async function expectPublicEntrySnapshot(page: Page, snapshotName: string): Promise<void> {
  await waitForVisibleImagesReady(page);

  const screenshot = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
    mask: [page.locator('.app-footer-meta')],
    maskColor: '#03050c',
    scale: 'css',
  });

  expect(screenshot).toMatchSnapshot(snapshotName, SNAPSHOT_OPTIONS);
}

async function waitForVisibleImagesReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const visibleImages = Array.from(document.images).filter((image) => {
        const rect = image.getBoundingClientRect();
        const style = window.getComputedStyle(image);

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth
        );
      });

      return visibleImages.every((image) => image.complete && image.naturalWidth > 0);
    },
    undefined,
    { timeout: 45_000 },
  );

  await page.evaluate(async () => {
    const visibleImages = Array.from(document.images).filter((image) => {
      const rect = image.getBoundingClientRect();
      const style = window.getComputedStyle(image);

      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= window.innerHeight &&
        rect.left <= window.innerWidth
      );
    });

    await Promise.all(visibleImages.map((image) => image.decode().catch(() => undefined)));
  });
}

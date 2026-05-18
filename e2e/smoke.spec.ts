import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  { path: '/', titleFragment: 'OPTC Team Builder' },
  { path: '/tabs/characters', titleFragment: 'OPTC Characters' },
  { path: '/tabs/auto-team-builder', titleFragment: 'Auto Team Builder' },
  { path: '/tabs/manual-team-builder', titleFragment: 'Manual Team Builder' },
  { path: '/tabs/captain-coverage', titleFragment: 'Captain Coverage' },
  { path: '/tabs/auto-team-builder-rumble', titleFragment: 'Rumble' },
  { path: '/tabs/rumble-characters', titleFragment: 'Rumble' },
  { path: '/tabs/crew-forge', titleFragment: 'Crew Forge' },
  { path: '/tabs/saved-teams', titleFragment: 'OPTC' },
  { path: '/tabs/saved-enemies', titleFragment: 'OPTC' },
  { path: '/tabs/settings', titleFragment: 'OPTC' },
  { path: '/tabs/account', titleFragment: 'Account' },
  { path: '/tabs/privacy', titleFragment: 'Privacy' },
  { path: '/tabs/cookies', titleFragment: 'Cookie' },
  { path: '/tabs/terms', titleFragment: 'Terms' },
] as const;

const NETWORK_IDLE_TIMEOUT = 45_000;

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('ion-app').first().waitFor({ state: 'attached' });
}

function getPageContent(page: Page) {
  // Exclude the side menu's ion-content, which shares the document tree with the routed page.
  return page.locator('ion-content:not(.tabs-menu__content)').first();
}

test.describe('cross-browser smoke', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const route of ROUTES) {
    test(`route ${route.path} renders without console errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (isIgnorableConsoleError(text)) return;
        consoleErrors.push(text);
      });
      page.on('pageerror', (err) => {
        if (isIgnorableConsoleError(err.message)) return;
        pageErrors.push(err.message);
      });

      const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      expect(response, `no response for ${route.path}`).not.toBeNull();
      expect(response?.ok(), `non-OK status for ${route.path}: ${response?.status()}`).toBeTruthy();

      await waitForAppReady(page);

      await expect(page).toHaveTitle(new RegExp(route.titleFragment, 'i'), {
        timeout: NETWORK_IDLE_TIMEOUT,
      });

      const pageContent = getPageContent(page);
      await expect(pageContent).toBeVisible({ timeout: NETWORK_IDLE_TIMEOUT });

      expect(pageErrors, `uncaught errors on ${route.path}`).toEqual([]);
      expect(consoleErrors, `console errors on ${route.path}`).toEqual([]);
    });
  }

  test('home page can navigate to characters via top action', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const charactersLink = page.locator('a[href*="/tabs/characters"]').first();
    await charactersLink.waitFor({ state: 'visible', timeout: NETWORK_IDLE_TIMEOUT });
    await charactersLink.click();

    await expect(page).toHaveURL(/\/tabs\/characters/, { timeout: NETWORK_IDLE_TIMEOUT });
    await expect(getPageContent(page)).toBeVisible({ timeout: NETWORK_IDLE_TIMEOUT });
  });

  test('side menu opens and lists navigation items', async ({ page }) => {
    await page.goto('/tabs/characters');
    await waitForAppReady(page);

    const menuButton = page.locator('ion-menu-button').first();
    await menuButton.waitFor({ state: 'visible', timeout: NETWORK_IDLE_TIMEOUT });
    await menuButton.click();

    const menu = page.locator('ion-menu[menu-id="tabs-navigation-menu"]');
    await expect(menu).toBeVisible({ timeout: NETWORK_IDLE_TIMEOUT });

    const navItems = menu.locator('ion-item.menu-item');
    await expect(navItems.first()).toBeVisible();
    const count = await navItems.count();
    expect(count, 'expected at least 3 nav items in side menu').toBeGreaterThanOrEqual(3);
  });
});

function isIgnorableConsoleError(text: string): boolean {
  // Known noisy errors that are not regressions:
  // - Google client / analytics scripts in environments without keys configured.
  // - Service worker pre-cache misses on freshly built dev server.
  // - HMR / dev-only warnings.
  const ignorable = [
    /Failed to load resource:.*app-config\.js/i,
    /accounts\.google\.com/i,
    /Google Identity Services/i,
    /google\.accounts/i,
    /ResizeObserver loop/i,
    /Manifest:.*manifest\.webmanifest/i,
    /favicon/i,
    /\[ng\] Application bundle generation/i,
    /\[webpack-dev-server\]/i,
  ];
  return ignorable.some((re) => re.test(text));
}

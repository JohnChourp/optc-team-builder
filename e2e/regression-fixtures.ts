import { expect, type Locator, type Page } from '@playwright/test';

import {
  SHARED_FIXTURE_EXPORTED_AT,
  buildSavedTeamFixture,
  buildSavedTeamShareCode,
  buildSavedTeamShareUrl,
  buildSavedTeamsTransferJson,
  buildSavedTeamsTransferPayload,
  buildSeededSavedTeamFixtures,
  type SharedSavedTeamFixture,
  type SharedSavedTeamsTransferPayload,
} from '../scripts/fixtures/shared/saved-team-fixtures';

export type E2eSavedTeam = SharedSavedTeamFixture;
export type SavedTeamsTransferPayload = SharedSavedTeamsTransferPayload;

export const E2E_EXPORTED_AT = SHARED_FIXTURE_EXPORTED_AT;
export const SEEDED_SAVED_TEAMS: E2eSavedTeam[] = buildSeededSavedTeamFixtures();
export const IMPORTED_SAVED_TEAM: E2eSavedTeam = buildSavedTeamFixture('importedCrew');

export {
  buildSavedTeamShareCode,
  buildSavedTeamShareUrl,
  buildSavedTeamsTransferJson,
  buildSavedTeamsTransferPayload,
};

export function parseSavedTeamShareCode(shareCode: string): {
  schemaVersion: number;
  source: string;
  exportedAt: string;
  team: E2eSavedTeam;
} {
  const base64Value = shareCode
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(shareCode.length / 4) * 4, '=');

  return JSON.parse(Buffer.from(base64Value, 'base64').toString('utf8')) as {
    schemaVersion: number;
    source: string;
    exportedAt: string;
    team: E2eSavedTeam;
  };
}

export async function seedBrowserState(page: Page, teams = SEEDED_SAVED_TEAMS): Promise<void> {
  await page.addInitScript((seededTeams: E2eSavedTeam[]) => {
    localStorage.setItem('CapacitorStorage.appLanguage', 'en');
    localStorage.setItem('CapacitorStorage.analyticsConsent', 'rejected');
    localStorage.setItem('CapacitorStorage.savedTeams', JSON.stringify(seededTeams));

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        async writeText(text: string) {
          (window as unknown as { __e2eClipboard?: string }).__e2eClipboard = String(text);
        },
        async readText() {
          return (window as unknown as { __e2eClipboard?: string }).__e2eClipboard ?? '';
        },
      },
    });
  }, teams);
}

export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('ion-app').first().waitFor({ state: 'attached', timeout: 45_000 });
  await page.waitForFunction(
    () => {
      const testabilityApi = window as unknown as {
        getAllAngularTestabilities?: () => Array<{
          whenStable: (callback: () => void) => void;
        }>;
      };
      const testabilities = testabilityApi.getAllAngularTestabilities?.() ?? [];

      if (!testabilities.length) {
        return true;
      }

      return Promise.all(
        testabilities.map(
          (testability) =>
            new Promise<void>((resolve) => {
              testability.whenStable(resolve);
            }),
        ),
      ).then(() => true);
    },
    undefined,
    { timeout: 45_000 },
  );
}

export async function setIonToggle(locator: Locator, checked: boolean): Promise<void> {
  await locator.evaluate(async (element) => {
    await (element as { componentOnReady?: () => Promise<unknown> }).componentOnReady?.();
  });
  await locator.scrollIntoViewIfNeeded();

  for (const action of [
    () => locator.click(),
    async () => {
      await locator.focus();
      await locator.page().keyboard.press('Space');
    },
    () => locator.locator('input').click({ force: true, timeout: 5_000 }),
  ]) {
    if (await ionToggleMatches(locator, checked)) {
      break;
    }

    try {
      await action();
      await expect.poll(() => ionToggleMatches(locator, checked), { timeout: 5_000 }).toBe(true);
      break;
    } catch {
      // Try the next real interaction path before falling back to Ionic's event contract.
    }
  }

  if (!(await ionToggleMatches(locator, checked))) {
    await dispatchIonToggleChange(locator, checked);
  }

  await expect.poll(() => ionToggleMatches(locator, checked)).toBe(true);
  await expect(locator).toHaveAttribute('data-guided-enabled', checked ? 'true' : 'false');
  await locator.page().waitForTimeout(100);
  await expect(locator).toHaveAttribute('data-guided-enabled', checked ? 'true' : 'false');
}

async function ionToggleMatches(locator: Locator, checked: boolean): Promise<boolean> {
  const state = await locator.evaluate((element) => ({
    checked: Boolean((element as HTMLElement & { checked?: boolean }).checked),
    guidedEnabled: element.getAttribute('data-guided-enabled'),
  }));

  return state.guidedEnabled === null
    ? state.checked === checked
    : state.guidedEnabled === String(checked);
}

async function dispatchIonToggleChange(locator: Locator, checked: boolean): Promise<void> {
  return locator.evaluate(
    (element, nextChecked) => {
      const target = element as HTMLElement & { checked?: boolean };
      target.checked = nextChecked;
      target.dispatchEvent(
        new CustomEvent('ionChange', {
          bubbles: true,
          composed: true,
          detail: { checked: nextChecked },
        }),
      );
    },
    checked,
  );
}

export async function setIonSelect(locator: Locator, value: string | string[]): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const target = element as HTMLElement & { value?: string | string[] };
    target.value = nextValue;
    target.dispatchEvent(
      new CustomEvent('ionChange', {
        bubbles: true,
        composed: true,
        detail: { value: nextValue },
      }),
    );
  }, value);
}

export async function setIonTextarea(locator: Locator, value: string): Promise<void> {
  await locator.evaluate(async (element, nextValue) => {
    await (element as { componentOnReady?: () => Promise<unknown> }).componentOnReady?.();
    const target = element as HTMLElement & { value?: string };
    target.value = nextValue;
    target.dispatchEvent(
      new CustomEvent('ionInput', {
        bubbles: true,
        composed: true,
        detail: { value: nextValue },
      }),
    );
  }, value);
}

export async function expectIonValue(locator: Locator, expectedValue: string): Promise<void> {
  await expect
    .poll(() => locator.evaluate((element) => String((element as { value?: unknown }).value ?? '')))
    .toBe(expectedValue);
}

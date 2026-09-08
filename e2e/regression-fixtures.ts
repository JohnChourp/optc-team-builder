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
export const SEEDED_SAVED_ENEMIES = [
  {
    id: 'e2e-legacy-a11y-boss',
    name: 'E2E Legacy A11y Boss',
    notes: 'Seeded by browser accessibility tests.',
    rawEnemyText: '',
    imageDataUrl: null,
    selectedTypes: ['DEX'],
    selectedClasses: ['Fighter'],
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    requiredAbilities: [],
    requiredCharacterGroups: [],
    battleRequirements: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    associatedTeamIds: ['e2e-regression-crew-a'],
    createdAt: E2E_EXPORTED_AT,
    updatedAt: E2E_EXPORTED_AT,
  },
];

export {
  buildSavedTeamShareCode,
  buildSavedTeamShareUrl,
  buildSavedTeamsTransferJson,
  buildSavedTeamsTransferPayload,
};

interface SeededBrowserState {
  teams: E2eSavedTeam[];
  enemies: typeof SEEDED_SAVED_ENEMIES;
}

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

export async function seedBrowserState(
  page: Page,
  teams = SEEDED_SAVED_TEAMS,
  enemies = [] as typeof SEEDED_SAVED_ENEMIES,
): Promise<void> {
  await page.addInitScript(
    (seededState: SeededBrowserState) => {
      localStorage.setItem('CapacitorStorage.appLanguage', 'en');
      localStorage.setItem('CapacitorStorage.analyticsConsent', 'rejected');
      localStorage.setItem('CapacitorStorage.savedTeams', JSON.stringify(seededState.teams));
      localStorage.setItem('CapacitorStorage.savedEnemies', JSON.stringify(seededState.enemies));

      /*
       * Take Web Share off the table so every engine follows the clipboard
       * path these specs assert.
       *
       * `SavedTeamsPage.shareTextWithNativeShare` prefers `navigator.share`
       * whenever it exists and returns BEFORE writing to the clipboard, so a
       * share-link spec that asserts the clipboard fails on any engine that
       * ships Web Share. Of the three Playwright engines only WebKit exposes it
       * on macOS, which is why this read as "webkit is broken" rather than as
       * the fixture gap it is - desktop Chrome on Windows would fail the same
       * way. Deleting the property is not enough: it lives on Navigator.prototype.
       */
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });

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
    },
    { teams, enemies },
  );
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

/**
 * Waits until an Ionic control will actually accept input.
 *
 * `expect(locator).toBeEnabled()` is VACUOUS on an Ionic host: Playwright only
 * consults `aria-disabled` when the element carries an explicit ARIA role, and
 * `ion-button`/`ion-toggle` render neither a role nor the native `disabled`
 * attribute on the host. So `toBeEnabled()` passed instantly against a control
 * that was still greyed out, which is how three specs came to press one before
 * it was ready.
 *
 * The Auto Team Builder filters are gated on `pageReady()`, which is false
 * until the dataset has resolved AND the reset that follows it has run - so
 * this wait is what stands between the specs and the race that made the guided
 * spec flaky.
 */
export async function waitForIonControlEnabled(locator: Locator): Promise<void> {
  await expect(locator).not.toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 });
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

    const beforeAction = await readIonToggleState(locator);
    if (beforeAction.checked === checked) {
      await dispatchIonToggleChange(locator, checked);
      if (await waitForIonToggleMatch(locator, checked)) {
        break;
      }
    }

    try {
      await action();
      if (await waitForIonToggleMatch(locator, checked)) {
        break;
      }

      const afterAction = await readIonToggleState(locator);
      if (afterAction.checked === checked) {
        await dispatchIonToggleChange(locator, checked);
        if (await waitForIonToggleMatch(locator, checked)) {
          break;
        }
      }
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
  if (!(await ionToggleMatches(locator, checked))) {
    await dispatchIonToggleChange(locator, checked);
  }
  await expect(locator).toHaveAttribute('data-guided-enabled', checked ? 'true' : 'false');
}

async function ionToggleMatches(locator: Locator, checked: boolean): Promise<boolean> {
  const state = await readIonToggleState(locator);

  return state.guidedEnabled === null
    ? state.checked === checked
    : state.guidedEnabled === String(checked);
}

async function waitForIonToggleMatch(locator: Locator, checked: boolean): Promise<boolean> {
  try {
    await expect.poll(() => ionToggleMatches(locator, checked), { timeout: 5_000 }).toBe(true);
    return true;
  } catch {
    return false;
  }
}

async function readIonToggleState(locator: Locator): Promise<{
  checked: boolean;
  guidedEnabled: string | null;
}> {
  return locator.evaluate((element) => ({
    checked: Boolean((element as HTMLElement & { checked?: boolean }).checked),
    guidedEnabled: element.getAttribute('data-guided-enabled'),
  }));
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

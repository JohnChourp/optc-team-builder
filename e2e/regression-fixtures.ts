import { expect, type Locator, type Page } from '@playwright/test';

export interface E2eSavedTeam {
  id: string;
  name: string;
  slots: Array<number | null>;
  shipId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedTeamsTransferPayload {
  schemaVersion: 1;
  source: 'saved-teams';
  exportedAt: string;
  teams: E2eSavedTeam[];
}

export const E2E_EXPORTED_AT = '2026-06-25T00:00:00.000Z';

export const SEEDED_SAVED_TEAMS: E2eSavedTeam[] = [
  {
    id: 'e2e-regression-crew-a',
    name: 'E2E Regression Crew A',
    slots: [5056, 4551, 4520, 4408, 4267, null],
    shipId: null,
    notes: 'Seeded by browser regression tests.',
    createdAt: E2E_EXPORTED_AT,
    updatedAt: E2E_EXPORTED_AT,
  },
  {
    id: 'e2e-regression-crew-b',
    name: 'E2E Regression Crew B',
    slots: [4265, 4090, 5056, null, null, null],
    shipId: null,
    notes: 'Second seeded team for compare source selection.',
    createdAt: E2E_EXPORTED_AT,
    updatedAt: E2E_EXPORTED_AT,
  },
];

export const IMPORTED_SAVED_TEAM: E2eSavedTeam = {
  id: 'e2e-imported-crew',
  name: 'E2E Imported Crew',
  slots: [4090, 4265, 4520, null, null, null],
  shipId: null,
  notes: 'Imported by browser regression tests.',
  createdAt: E2E_EXPORTED_AT,
  updatedAt: E2E_EXPORTED_AT,
};

export function buildSavedTeamsTransferPayload(
  teams: E2eSavedTeam[],
): SavedTeamsTransferPayload {
  return {
    schemaVersion: 1,
    source: 'saved-teams',
    exportedAt: E2E_EXPORTED_AT,
    teams: teams.map((team) => ({ ...team, slots: [...team.slots] })),
  };
}

export function buildSavedTeamsTransferJson(teams: E2eSavedTeam[]): string {
  return JSON.stringify(buildSavedTeamsTransferPayload(teams), null, 2);
}

export function buildSavedTeamShareCode(team: E2eSavedTeam): string {
  const payload = {
    schemaVersion: 1,
    source: 'saved-team-share',
    exportedAt: E2E_EXPORTED_AT,
    team,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
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

export function buildSavedTeamShareUrl(team: E2eSavedTeam, origin = 'http://127.0.0.1:4200') {
  const url = new URL('/tabs/manual-team-builder', origin);
  url.searchParams.set('teamShare', buildSavedTeamShareCode(team));

  return url.toString();
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

export async function setAutoTeamBuilderGuidedMode(
  page: Page,
  enabled: boolean,
): Promise<void> {
  await page.locator('app-auto-team-builder-page').evaluate((element, nextEnabled) => {
    const testabilityApi = window as unknown as {
      ng?: {
        getComponent?: (target: Element) => {
          guidedAutoBuildEnabled?: { set: (value: boolean) => void };
        } | null;
        applyChanges?: (target: Element) => void;
      };
    };
    const component = testabilityApi.ng?.getComponent?.(element);

    if (!component?.guidedAutoBuildEnabled) {
      throw new Error('Auto Team Builder guided mode test hook is unavailable.');
    }

    component.guidedAutoBuildEnabled.set(nextEnabled);
    testabilityApi.ng?.applyChanges?.(element);
  }, enabled);
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
  await locator.evaluate(async (element, nextChecked) => {
    await (element as { componentOnReady?: () => Promise<unknown> }).componentOnReady?.();
    const target = element as HTMLElement & { checked?: boolean };
    target.checked = nextChecked;
    target.dispatchEvent(
      new CustomEvent('ionChange', {
        bubbles: true,
        composed: true,
        detail: { checked: nextChecked },
      }),
    );
  }, checked);
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

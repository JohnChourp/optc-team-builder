import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type AllDataTransferPayload } from '../settings/all-data-transfer.utils';
import { AccountPage } from '../account/account.page';
import { buildDriveSyncReviewDraft, type DriveSyncReviewRow } from './drive-sync-review.utils';

vi.mock('@ionic/angular', () => ({ IonIcon: class {}, IonModal: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f6td68. The Drive review on the Account page names every row and says what is in it. The
 * fallback names and the counts were English words, shown as they were: "Ship #12", "2 slots",
 * "1 abilities, 2 mechanics" on a Greek screen.
 *
 * The rows come from the real review builder and are rendered by the page's own `reviewText`,
 * the way the template calls it, against the real `settings` copy in both languages.
 */

type Language = 'en' | 'el';

const COPY: Record<Language, Record<string, unknown>> = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/settings/en.json'), 'utf8')),
  el: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/settings/el.json'), 'utf8')),
};

/** The template's `t`, read from the `settings` scope: the copy, or the raw key Transloco would show. */
function translatorFor(language: Language) {
  return (key: string, params: Readonly<Record<string, unknown>> = {}): string => {
    const value = key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
        COPY[language],
      );

    return typeof value === 'string'
      ? value.replace(/\{\{\s*(\w+)\s*\}\}/gu, (placeholder, name: string) =>
          params[name] === undefined ? placeholder : String(params[name]),
        )
      : key;
  };
}

/** One of each kind of row, on this device only - the items that have no name keep their fallbacks reachable. */
const DEVICE = {
  schemaVersion: 1,
  source: 'all-data',
  exportedAt: '2026-09-24T10:00:00.000Z',
  favorites: { characters: [{ number: 7 }] },
  favoriteShips: { schemaVersion: 1, source: 'favorite-ships', exportedAt: 'x', ships: [{ id: 12 }] },
  characterBoxes: {
    schemaVersion: 1,
    source: 'character-boxes',
    exportedAt: 'x',
    boxes: [{ id: 'box-1', name: 'Kizuna', characterIds: [1, 2, 3] }],
  },
  characterOverrides: { schemaVersion: 1, source: 'character-overrides', exportedAt: 'x', overrides: [{ characterId: 5 }] },
  savedTeams: {
    schemaVersion: 1,
    source: 'saved-teams',
    exportedAt: 'x',
    teams: [{ id: 'team-1', name: '', slots: [1, null, 3, null, null, null] }],
  },
  savedRumbleTeams: {
    schemaVersion: 1,
    source: 'saved-rumble-teams',
    exportedAt: 'x',
    rumbleTeams: [{ id: 'rumble-1', name: 'Rumble A', teams: [[], []] }],
  },
  savedEnemies: {
    schemaVersion: 1,
    source: 'saved-enemies',
    exportedAt: 'x',
    enemies: [{ id: 'enemy-1', name: 'Kaido', requiredAbilities: ['a'], enemyMechanics: ['m', 'n'] }],
  },
} as unknown as AllDataTransferPayload;

const DRIVE = { schemaVersion: 1, source: 'all-data', exportedAt: 'x' } as unknown as AllDataTransferPayload;

function rows(): Map<string, DriveSyncReviewRow> {
  const draft = buildDriveSyncReviewDraft(DEVICE, DRIVE, 'merge-and-upload');

  return new Map(draft.sections.flatMap((section) => section.rows.map((row) => [section.key, row] as const)));
}

function shown(language: Language, row: DriveSyncReviewRow): string {
  const t = translatorFor(language);

  return `${AccountPage.prototype.reviewText(t, row.label)} | ${AccountPage.prototype.reviewText(t, row.detail)}`;
}

const EXPECTED: Record<Language, Record<string, string>> = {
  en: {
    favorites: '#7 | #7',
    favoriteShips: 'Ship #12 | #12',
    characterBoxes: 'Kizuna | 3 characters',
    characterOverrides: 'Character #5 | #5',
    savedTeams: 'team-1 | 2 slots',
    savedRumbleTeams: 'Rumble A | 2 teams',
    savedEnemies: 'Kaido | 1 abilities, 2 mechanics',
  },
  el: {
    favorites: '#7 | #7',
    favoriteShips: 'Καράβι #12 | #12',
    characterBoxes: 'Kizuna | 3 χαρακτήρες',
    characterOverrides: 'Χαρακτήρας #5 | #5',
    savedTeams: 'team-1 | 2 θέσεις',
    savedRumbleTeams: 'Rumble A | 2 ομάδες',
    savedEnemies: 'Kaido | 1 abilities και 2 mechanics',
  },
};

describe('the Drive review rows on Account read in the reader language', () => {
  it('builds one row per section, so no expectation below passes on a missing row', () => {
    expect([...rows().keys()].sort()).toEqual(Object.keys(EXPECTED.en).sort());
  });

  for (const language of ['en', 'el'] as const) {
    it(`${language}: every row's name and detail`, () => {
      const built = rows();

      for (const [section, expected] of Object.entries(EXPECTED[language])) {
        expect(shown(language, built.get(section)!), section).toBe(expected);
      }
    });
  }

  it('shows an item its own name, or id, as it is - never through a translation', () => {
    const built = rows();

    expect(built.get('characterBoxes')!.label).toEqual({ text: 'Kizuna' });
    expect(built.get('savedTeams')!.label).toEqual({ text: 'team-1' });
  });

  it('has Greek copy for every phrase the builder can name, including the ones only a nameless, idless item reaches', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/pages/drive-sync/drive-sync-review.utils.ts'), 'utf8');
    const keys = [...source.matchAll(/'(driveSync\.review\.row(?:Labels|Details)\.\w+)'/gu)].map((match) => match[1]!);

    // Six names and four details. Fewer means the scan stopped seeing them, not that they went away.
    expect(new Set(keys).size).toBe(10);

    for (const key of keys) {
      const english = translatorFor('en')(key);
      const greek = translatorFor('el')(key);

      expect(english, key).not.toBe(key);
      expect(greek, key).not.toBe(key);
      expect(greek, key).not.toBe(english);
      expect(greek, key).toMatch(/[Ͱ-Ͽ]/u);
    }
  });

  it('renders the row name, its picture text and its detail through the translation', () => {
    const template = readFileSync(resolve(process.cwd(), 'src/app/pages/account/account.page.html'), 'utf8');

    expect(template).toContain('[alt]="reviewText(t, row.label)"');
    expect(template).toContain('{{ reviewText(t, row.label) }}');
    expect(template).toContain('{{ reviewText(t, row.detail) }}');
    expect(template).not.toMatch(/\{\{\s*row\.(?:label|detail)\s*\}\}/u);
  });
});

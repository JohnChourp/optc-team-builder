import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Subject, defer } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AppI18nService } from '../../core/services/app-i18n.service';
import { ErrorLogService } from '../../core/services/error-log.service';
import { FAILURE_I18N_SCOPE } from '../../core/services/failure-message.utils';
import { OPTCBX_IMPORT_I18N_SCOPE, OptcbxImportService } from '../../core/services/optcbx-import.service';
import { buildSavedEnemiesTransferPayload } from '../saved-enemies/saved-enemies-transfer.utils';
import { buildSavedTeamsTransferPayload } from '../saved-teams/saved-teams-transfer.utils';
import { SETTINGS_TRANSLATION_SCOPES, SettingsPage } from './settings.page';

vi.mock('@ionic/angular', () => ({ IonSelect: class {}, IonToggle: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-label', () => ({ IonLabel: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * Found live on the Android emulator, 2026-09-25: after Settings -> Import all data with a Saved
 * Teams file, the summary read "Saved Teams: saved-teams.import.successTitle" and "Saved Teams:
 * saved-teams.import.loadedFromFile".
 *
 * A summary is translated once, when it is built, and kept. `AppI18nService.translate` returns the
 * raw key for a scope that is not loaded yet and starts loading it only afterwards, and Settings'
 * template loads only its own scope. So on a device that had not opened Saved Teams first, every
 * summary built from that scope kept its raw keys.
 *
 * The page here runs on the REAL `AppI18nService`, over a Transloco that behaves as the app's
 * does: bundles come from `public/i18n` asynchronously, a missing key falls back to a loaded
 * English one, and a key with neither is shown raw.
 */

type Language = 'en' | 'el';

function bundle(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), `public/i18n/${path}.json`), 'utf8')) as Record<string, unknown>;
}

function lookup(tree: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), tree);

  return typeof value === 'string' ? value : undefined;
}

function fill(text: string, params: Record<string, unknown> = {}): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/gu, (placeholder, name: string) =>
    params[name] === undefined ? placeholder : String(params[name]),
  );
}

/** What the copy says for `scope.key` in `language`, with its params filled in. */
function copy(language: Language, scope: string, key: string, params: Record<string, unknown> = {}): string {
  const value = lookup(bundle(`${scope}/${language}`), key);

  // Guarded, so an expectation below can never compare against undefined.
  expect(value, `${scope}/${language}: ${key}`).toBeTypeOf('string');

  return fill(value!, params);
}

/** A Transloco with the app's configuration: async loads, `fallbackLang: 'en'`, raw key when all else fails. */
function createTransloco() {
  const loaded = new Map<string, Record<string, unknown>>();
  const events$ = new Subject<{ type: string }>();

  return {
    events$,
    setActiveLang: () => undefined,
    load: (path: string) =>
      defer(async () => {
        // An HTTP fetch never answers in the same turn.
        await new Promise((settle) => setTimeout(settle, 0));

        const [scope, language] = path.includes('/') ? path.split('/') : [null, path];
        const tree = loaded.get(language!) ?? {};

        if (scope) {
          tree[scope] = bundle(path);
        } else {
          Object.assign(tree, bundle(path));
        }

        loaded.set(language!, tree);
        events$.next({ type: 'translationLoadSuccess' });

        return tree;
      }),
    translate: (key: string, params: Record<string, unknown> | undefined, language: string) => {
      const value = lookup(loaded.get(language), key) ?? lookup(loaded.get('en'), key);

      return value === undefined ? key : fill(value, params);
    },
  };
}

/** The real i18n service, the way the app starts it, with Settings on screen. */
async function createI18n(language: Language): Promise<AppI18nService> {
  const i18n = new AppI18nService(
    createTransloco() as never,
    { documentElement: { lang: 'en' }, defaultView: null } as never,
    { get: async () => ({ value: language }), set: async () => undefined } as never,
  );

  await i18n.ready();
  // The template's `*transloco` loads the page's own scope; nothing loads the others.
  await i18n.preloadScope('settings');

  return i18n;
}

function createSettings(i18n: AppI18nService) {
  const repository = { getCharactersByIds: async (ids: number[]) => ids.map((id) => ({ id })) };
  const userDataTransfer = {
    importSavedTeamsPayload: async () => ({
      addedCount: 1,
      duplicateIdCount: 0,
      invalidTeamCount: 0,
      unknownSlotCount: 0,
      updatedCount: 0,
    }),
    importSavedEnemiesPayload: async () => ({
      addedCount: 1,
      duplicateIdCount: 0,
      invalidEnemyCount: 0,
      updatedCount: 0,
    }),
  };

  return new SettingsPage(
    {} as never,
    i18n,
    { favoriteCharacterIds: signal<number[]>([]), setFavoriteCharacterIds: async () => undefined } as never,
    {} as never,
    { available: false, consent: () => 'unknown' } as never,
    new OptcbxImportService(repository as never),
    {} as never,
    userDataTransfer as never,
    {} as never,
    {} as never,
    new ErrorLogService({ defaultView: null } as unknown as Document),
  );
}

function fileEvent(name: string, content: unknown): Event {
  const file = { name, text: () => Promise.resolve(JSON.stringify(content)) } as unknown as File;

  return { target: { files: [file] } } as unknown as Event;
}

const input = () => ({ value: 'picked' }) as HTMLInputElement;

/**
 * A translation key shown as it is, in any scope this page reads: the scope, then at least two
 * dotted segments. One segment is not enough - "saved-teams.json" is a file name the summary
 * quotes, and the first version of this pattern flagged it.
 */
const RAW_KEY = /\b(?:settings|characters|saved-teams|saved-enemies|failures)(?:\.[a-zA-Z]+){2,}/u;

const EXPORTED_AT = '2026-09-25T10:00:00.000Z';
const SAVED_TEAMS_FILE = buildSavedTeamsTransferPayload([], EXPORTED_AT);
const SAVED_ENEMIES_FILE = buildSavedEnemiesTransferPayload([], EXPORTED_AT);
const FAVOURITES_FILE = { characters: [{ number: 1 }, { number: 2 }] };

function lines(feedback: { title: string; details: string[] } | null): string[] {
  expect(feedback, 'the import produced a summary').not.toBeNull();

  return [feedback!.title, ...feedback!.details];
}

describe('every Settings import summary is translated, on a page opened fresh', () => {
  it('recognises a raw key as the emulator showed it, and not a file name the summary quotes', () => {
    expect(RAW_KEY.test('Saved Teams: saved-teams.import.successTitle')).toBe(true);
    expect(RAW_KEY.test('Saved Teams: saved-teams.import.loadedFromFile')).toBe(true);
    expect(RAW_KEY.test('failures.what.invalidFile')).toBe(true);
    expect(RAW_KEY.test('Loaded saved-teams.json.')).toBe(false);
  });

  for (const language of ['en', 'el'] as const) {
    describe(language === 'en' ? 'in English' : 'in Greek', () => {
      it('Import all data with a Saved Teams file - the summary seen raw on the emulator', async () => {
        const page = createSettings(await createI18n(language));

        await page.onAllDataFileSelected(fileEvent('saved-teams.json', SAVED_TEAMS_FILE), input());

        const label = copy(language, 'settings', 'management.savedTeams.title');
        const summary = lines(page.allDataFeedback());

        expect(summary.filter((line) => RAW_KEY.test(line))).toEqual([]);
        expect(summary).toContain(`${label}: ${copy(language, 'saved-teams', 'import.successTitle')}`);
        expect(summary).toContain(
          `${label}: ${copy(language, 'saved-teams', 'import.loadedFromFile', { fileName: 'saved-teams.json' })}`,
        );
      });

      it('Import all data with a favourites file', async () => {
        const page = createSettings(await createI18n(language));

        await page.onAllDataFileSelected(fileEvent('favorites.json', FAVOURITES_FILE), input());

        const label = copy(language, 'settings', 'management.favorites.title');
        const summary = lines(page.allDataFeedback());

        expect(summary.filter((line) => RAW_KEY.test(line))).toEqual([]);
        expect(summary).toContain(`${label}: ${copy(language, 'characters', 'import.stats.matched')}: 2`);
      });

      it('Import all data with a Saved Enemies file', async () => {
        const page = createSettings(await createI18n(language));

        await page.onAllDataFileSelected(fileEvent('saved-enemies.json', SAVED_ENEMIES_FILE), input());

        const label = copy(language, 'settings', 'management.savedEnemies.title');
        const summary = lines(page.allDataFeedback());

        expect(summary.filter((line) => RAW_KEY.test(line))).toEqual([]);
        expect(summary).toContain(`${label}: ${copy(language, 'saved-enemies', 'bulkImport.successTitle')}`);
      });

      it("Saved Teams' own import", async () => {
        const page = createSettings(await createI18n(language));

        await page.onSavedTeamsFileSelected(fileEvent('saved-teams.json', SAVED_TEAMS_FILE), input());

        const summary = lines(page.savedTeamsFeedback());

        expect(summary.filter((line) => RAW_KEY.test(line))).toEqual([]);
        expect(summary[0]).toBe(copy(language, 'saved-teams', 'import.successTitle'));
      });

      it("Favorites' own import", async () => {
        const page = createSettings(await createI18n(language));

        await page.onFavoritesFileSelected(fileEvent('favorites.json', FAVOURITES_FILE), input());

        const summary = lines(page.favoritesFeedback());

        expect(summary.filter((line) => RAW_KEY.test(line))).toEqual([]);
        expect(summary).toContain(`${copy(language, 'characters', 'import.stats.matched')}: 2`);
      });

      it("Saved Enemies' own import", async () => {
        const page = createSettings(await createI18n(language));

        await page.onSavedEnemiesFileSelected(fileEvent('saved-enemies.json', SAVED_ENEMIES_FILE), input());

        const summary = lines(page.savedEnemiesFeedback());

        expect(summary.filter((line) => RAW_KEY.test(line))).toEqual([]);
        expect(summary[0]).toBe(copy(language, 'saved-enemies', 'bulkImport.successTitle'));
      });
    });
  }

  it('words a failure in Greek after the reader switched from English, not in the English it started with', async () => {
    const i18n = await createI18n('en');

    // What the app does at start-up, in the language it starts in.
    await i18n.preloadScope(FAILURE_I18N_SCOPE);
    await i18n.setLanguage('el');
    await i18n.preloadScope('settings');

    const page = createSettings(i18n);

    await page.onFavoriteShipsFileSelected(fileEvent('ships.json', { not: 'a ships export' }), input());

    const details = page.favoriteShipsFeedback()?.details ?? [];

    expect(details[0]).toBe(copy('el', FAILURE_I18N_SCOPE, 'what.invalidFile'));
    expect(details.at(-1)).toBe(copy('el', FAILURE_I18N_SCOPE, 'action.invalidFile'));
  });

  it('loads every scope the page translates from', () => {
    const source = stripComments(readFileSync(resolve(process.cwd(), 'src/app/pages/settings/settings.page.ts'), 'utf8'));
    const literalScopes = new Set(translateScopeArguments(source));

    // The control: the scan finds the four scopes this page is known to read by literal.
    expect([...literalScopes].sort()).toEqual(expect.arrayContaining(['characters', 'saved-enemies', 'saved-teams', 'settings']));

    for (const scope of literalScopes) {
      expect(SETTINGS_TRANSLATION_SCOPES, `'${scope}' is translated from but not loaded first`).toContain(scope);
    }

    // Two scopes reach `translate` through a constant, which no scan of literals can see.
    expect(SETTINGS_TRANSLATION_SCOPES).toContain(FAILURE_I18N_SCOPE);
    expect(SETTINGS_TRANSLATION_SCOPES).toContain(OPTCBX_IMPORT_I18N_SCOPE);
  });
});

/** Source with comments removed, strings and template literals left intact. */
function stripComments(source: string): string {
  let output = '';
  let quote: string | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;

    if (quote) {
      output += character;

      if (character === '\\') {
        output += source[index + 1] ?? '';
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
    } else if (character === '/' && source[index + 1] === '/') {
      index = source.indexOf('\n', index) - 1;

      if (index < 0) {
        break;
      }
    } else if (character === '/' && source[index + 1] === '*') {
      index = source.indexOf('*/', index + 2) + 1;
    } else {
      if (character === "'" || character === '"' || character === '`') {
        quote = character;
      }

      output += character;
    }
  }

  return output;
}

/** The literal third argument of every `.translate(` call - its scope. */
function translateScopeArguments(source: string): string[] {
  const scopes: string[] = [];

  for (const match of source.matchAll(/\.translate\(/gu)) {
    const args: string[] = [];
    let depth = 1;
    let current = '';
    let quote: string | null = null;

    for (let index = match.index + match[0].length; index < source.length && depth > 0; index += 1) {
      const character = source[index]!;

      if (quote) {
        current += character;
        quote = character === quote && source[index - 1] !== '\\' ? null : quote;
        continue;
      }

      if (character === "'" || character === '"' || character === '`') {
        quote = character;
      } else if ('([{'.includes(character)) {
        depth += 1;
      } else if (')]}'.includes(character)) {
        depth -= 1;

        if (depth === 0) {
          break;
        }
      } else if (character === ',' && depth === 1) {
        args.push(current.trim());
        current = '';
        continue;
      }

      current += character;
    }

    args.push(current.trim());

    const scope = /^'([a-z-]+)'$/u.exec(args[2] ?? '')?.[1];

    if (scope) {
      scopes.push(scope);
    }
  }

  return scopes;
}

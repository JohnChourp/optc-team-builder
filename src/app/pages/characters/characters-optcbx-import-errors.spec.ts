import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { ErrorLogService } from '../../core/services/error-log.service';
import { InventoryCaptureImportService } from '../../core/services/inventory-capture-import.service';
import {
  OPTCBX_IMPORT_I18N_SCOPE,
  OptcbxImportError,
  OptcbxImportService,
} from '../../core/services/optcbx-import.service';
import { SettingsPage } from '../settings/settings.page';
import { CharactersPage } from './characters.page';

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonToggle: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-buttons', () => ({ IonButtons: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-footer', () => ({ IonFooter: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-label', () => ({ IonLabel: class {} }));
vi.mock('@ionic/angular/ion-menu-button', () => ({ IonMenuButton: class {} }));
vi.mock('@ionic/angular/ion-select-option', () => ({ IonSelectOption: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f6td63. A file the OPTCbx parser turns down, on every screen that reaches the parser.
 *
 * The Characters import showed the parser's English exception text as its whole message, to a
 * reader of the Greek UI too - and the i18n guards compare KEYS, so nothing noticed. The same text
 * reached three imports on Settings. Each case here is a mistake a player really makes, run
 * through the REAL parser, and what the screen shows is compared with the real copy in both
 * languages. The parser's own words must survive in exactly one place: Recent problems.
 */

type Language = 'en' | 'el';

const bundles = new Map<string, Record<string, unknown>>();

function bundle(scope: string, language: Language): Record<string, unknown> {
  const file = `public/i18n/${scope}/${language}.json`;

  if (!bundles.has(file)) {
    bundles.set(file, JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')) as Record<string, unknown>);
  }

  return bundles.get(file)!;
}

/** What the copy says for `key`, with its `{{params}}` filled in; undefined when there is none. */
function copy(
  language: Language,
  scope: string,
  key: string,
  params: Record<string, unknown> = {},
): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      bundle(scope, language),
    );

  return typeof value === 'string'
    ? value.replace(/\{\{\s*(\w+)\s*\}\}/gu, (placeholder, name: string) =>
        params[name] === undefined ? placeholder : String(params[name]),
      )
    : undefined;
}

/** `AppI18nService.translate` over the real copy. A key with nothing behind it shows as the raw key, as Transloco does. */
function translatorFor(language: Language) {
  return {
    preloadScope: () => Promise.resolve(),
    translate: (key: string, params?: Record<string, unknown>, scope?: string) =>
      (scope ? copy(language, scope, key, params) : undefined) ?? (scope ? `${scope}.${key}` : key),
  };
}

/** What `file.text()` returns for the first bytes of a real PNG. */
const PNG_TEXT = new TextDecoder().decode(
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
);

interface MistakeCase {
  readonly name: string;
  readonly fileName: string;
  readonly content: string;
  readonly key: string;
  readonly params?: Record<string, number>;
  /** The parser's own English words, which only Recent problems may keep. */
  readonly parserMessage: string;
}

const MISTAKES: readonly MistakeCase[] = [
  {
    name: 'a PNG picked by mistake',
    fileName: 'box-screenshot.png',
    content: PNG_TEXT,
    key: 'import.errors.notJson',
    parserMessage: 'The selected file is not valid JSON.',
  },
  {
    name: 'a Saved Teams export picked by mistake',
    fileName: 'saved-teams.json',
    content: JSON.stringify({
      schemaVersion: 1,
      source: 'saved-teams',
      exportedAt: '2026-09-24T10:00:00.000Z',
      teams: [],
    }),
    key: 'import.errors.notOptcbxExport',
    parserMessage: 'The selected file is not a raw OPTCbx export.',
  },
  {
    name: 'an OPTCbx export with one portrait it could not recognise',
    fileName: 'optcbx-export.json',
    content: JSON.stringify({ characters: [{ number: 12 }, { number: null }] }),
    key: 'import.errors.entryWithoutNumber',
    params: { entry: 2 },
    parserMessage: 'Character entry 2 is missing a valid number field.',
  },
  {
    name: 'an empty OPTCbx export',
    fileName: 'optcbx-export.json',
    content: JSON.stringify({ characters: [] }),
    key: 'import.errors.noCharacters',
    parserMessage: 'The OPTCbx export does not contain any character ids.',
  },
];

const LANGUAGES: readonly Language[] = ['en', 'el'];

function expectedMessage(language: Language, mistake: MistakeCase): string {
  const message = copy(language, OPTCBX_IMPORT_I18N_SCOPE, mistake.key, mistake.params);

  // Guarded, so a key with no copy behind it fails here instead of comparing undefined to undefined.
  expect(message, `${language} copy for ${mistake.key}`).toBeTypeOf('string');

  return message!;
}

function fileEvent(mistake: MistakeCase): Event {
  const file = { name: mistake.fileName, text: () => Promise.resolve(mistake.content) } as unknown as File;

  return { target: { files: [file] } } as unknown as Event;
}

const input = () => ({ value: 'picked' }) as HTMLInputElement;

function createErrorLog(): ErrorLogService {
  return new ErrorLogService({ defaultView: null } as unknown as Document);
}

function expectKeptOnlyInRecentProblems(errorLog: ErrorLogService, mistake: MistakeCase): void {
  expect(errorLog.entries()).toEqual([
    expect.objectContaining({ kind: 'import', name: 'OptcbxImportError', message: mistake.parserMessage }),
  ]);
}

function createCharacters(language: Language) {
  const errorLog = createErrorLog();
  const page = new CharactersPage(
    { datasetDownload: () => null } as never,
    {} as never,
    {} as never,
    new OptcbxImportService({} as never),
    translatorFor(language) as never,
    { snapshot: { queryParamMap: { get: () => null } } } as never,
    errorLog,
  );

  return { page, errorLog };
}

function createSettings(language: Language) {
  const errorLog = createErrorLog();
  const optcbxImport = new OptcbxImportService({} as never);
  const page = new SettingsPage(
    {} as never,
    translatorFor(language) as never,
    {} as never,
    {} as never,
    { available: false, consent: () => 'unknown' } as never,
    optcbxImport,
    new InventoryCaptureImportService({} as never, optcbxImport, {} as never),
    {} as never,
    {} as never,
    {} as never,
    errorLog,
  );

  return { page, errorLog };
}

describe('a file the OPTCbx parser turns down', () => {
  it('names each failure by a key with copy in both languages, and keeps the parser words on the error', () => {
    const service = new OptcbxImportService({} as never);

    for (const mistake of MISTAKES) {
      let thrown: unknown;

      try {
        service.parseExport(mistake.content);
      } catch (error) {
        thrown = error;
      }

      expect(thrown, mistake.name).toBeInstanceOf(OptcbxImportError);
      expect((thrown as OptcbxImportError).key).toBe(mistake.key);
      expect((thrown as OptcbxImportError).parameters).toEqual(mistake.params);
      expect((thrown as OptcbxImportError).message).toBe(mistake.parserMessage);

      const english = expectedMessage('en', mistake);
      const greek = expectedMessage('el', mistake);

      expect(greek).not.toBe(english);
      expect(greek, `${mistake.key} in Greek`).toMatch(/[Ͱ-Ͽ]/u);
      expect(english).not.toBe(mistake.parserMessage);
    }
  });

  it('accepts a real export, so the failures below are the parser refusing and not failing', async () => {
    const { page, errorLog } = createCharacters('en');
    const realExport: MistakeCase = {
      name: 'a real OPTCbx export',
      fileName: 'optcbx-export.json',
      content: JSON.stringify({ characters: [{ number: 12 }, { number: '13' }] }),
      key: '',
      parserMessage: '',
    };

    await page.onFileSelected(fileEvent(realExport), input());

    expect(page.importErrorMessage()).toBe('');
    expect(page.parsedImport()).toEqual({ importedNumbers: [12, 13], duplicatesRemoved: 0 });
    expect(errorLog.entries()).toEqual([]);
  });

  it('keeps the parser words in Recent problems after a reload, not only until one', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    const document = { defaultView: { localStorage: storage } } as unknown as Document;

    new ErrorLogService(document).record('import', 'OptcbxImportError', MISTAKES[2]!.parserMessage);

    // The reader opens Settings later; the log is read back from storage, where an unknown kind is dropped.
    expect(new ErrorLogService(document).entries()).toEqual([
      expect.objectContaining({ kind: 'import', message: MISTAKES[2]!.parserMessage }),
    ]);
  });

  for (const language of LANGUAGES) {
    describe(`in ${language === 'en' ? 'English' : 'Greek'}`, () => {
      for (const mistake of MISTAKES) {
        it(`Characters: ${mistake.name} reads as the translated reason, not the parser's words`, async () => {
          const { page, errorLog } = createCharacters(language);

          await page.onFileSelected(fileEvent(mistake), input());

          expect(page.importErrorMessage()).toBe(expectedMessage(language, mistake));
          expect(page.importErrorMessage()).not.toContain(mistake.parserMessage);
          expect(page.parsedImport()).toBeNull();
          expectKeptOnlyInRecentProblems(errorLog, mistake);
        });

        it(`Settings, Favorites: ${mistake.name} reads as the translated reason`, async () => {
          const { page, errorLog } = createSettings(language);

          await page.onFavoritesFileSelected(fileEvent(mistake), input());

          const details = page.favoritesFeedback()?.details ?? [];

          expect(page.favoritesFeedback()?.tone).toBe('error');
          expect(details).toContain(expectedMessage(language, mistake));
          expect(details.join('\n')).not.toContain(mistake.parserMessage);
          expectKeptOnlyInRecentProblems(errorLog, mistake);
        });

        it(`Settings, inventory capture: ${mistake.name} reads as the translated reason`, async () => {
          const { page, errorLog } = createSettings(language);

          await page.onInventoryOptcbxFileSelected(fileEvent(mistake), input());

          const details = page.inventoryCaptureFeedback()?.details ?? [];

          expect(page.inventoryCaptureFeedback()?.tone).toBe('error');
          expect(details).toContain(expectedMessage(language, mistake));
          expect(details.join('\n')).not.toContain(mistake.parserMessage);
          expectKeptOnlyInRecentProblems(errorLog, mistake);
        });
      }

      // Import all data sends a file with a `characters` list to the same parser; the other two
      // mistakes are turned down before it by the all-data reader, in that reader's own words.
      for (const mistake of MISTAKES.slice(2)) {
        it(`Settings, Import all data: ${mistake.name} reads as the translated reason`, async () => {
          const { page, errorLog } = createSettings(language);

          await page.onAllDataFileSelected(fileEvent(mistake), input());

          const details = page.allDataFeedback()?.details ?? [];

          expect(page.allDataFeedback()?.tone).toBe('error');
          expect(details).toContain(expectedMessage(language, mistake));
          expect(details.join('\n')).not.toContain(mistake.parserMessage);
          expect(details.join('\n')).not.toContain(`settings.${mistake.key}`);
          expectKeptOnlyInRecentProblems(errorLog, mistake);
        });
      }
    });
  }
});

import '@angular/compiler';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetFormattingLanguageForTests } from '../i18n/app-locale-format';
import { APP_LANGUAGE_PREFERENCE_KEY } from '../i18n/app-i18n.types';
import { resolveFirstVisitLanguage } from '../i18n/first-visit-language';
import { AppI18nService } from './app-i18n.service';

/*
 * 869f13c59. A first visit starts in the browser's language when the app is translated into it,
 * and a stored choice always wins. Before this every first visit started in English.
 */
describe('resolveFirstVisitLanguage', () => {
  it.each([
    [['el-GR', 'en-US'], 'el'],
    [['el'], 'el'],
    [['EL-gr'], 'el'],
    [['el_GR'], 'el'],
    [['en-US', 'el'], 'en'],
    [['de-DE', 'el'], 'el'],
    [['fr-FR', 'de'], 'en'],
    [[], 'en'],
    [undefined, 'en'],
    [null, 'en'],
  ] as const)('%j starts in %s', (languages, expected) => {
    expect(resolveFirstVisitLanguage(languages)).toBe(expected);
  });
});

describe('AppI18nService on a first visit', () => {
  afterEach(() => {
    resetFormattingLanguageForTests();
  });

  it('starts in Greek when nothing is stored and the browser prefers Greek', async () => {
    const { service, document, preferences } = createService({
      stored: null,
      languages: ['el-GR', 'en-US'],
    });

    await service.ready();

    expect(service.activeLanguage()).toBe('el');
    expect(document.documentElement.lang).toBe('el');
    expect(preferences.set).toHaveBeenCalledWith({ key: APP_LANGUAGE_PREFERENCE_KEY, value: 'el' });
  });

  it('keeps a stored English on a Greek browser', async () => {
    const { service, document } = createService({ stored: 'en', languages: ['el-GR'] });

    await service.ready();

    expect(service.activeLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps a stored Greek on an English browser', async () => {
    const { service } = createService({ stored: 'el', languages: ['en-US'] });

    await service.ready();

    expect(service.activeLanguage()).toBe('el');
  });

  it('treats a stored value the app does not support as nothing stored', async () => {
    const { service } = createService({ stored: 'xx', languages: ['el'] });

    await service.ready();

    expect(service.activeLanguage()).toBe('el');
  });

  it('reads navigator.language when navigator.languages is empty', async () => {
    const { service } = createService({ stored: null, languages: [], language: 'el-GR' });

    await service.ready();

    expect(service.activeLanguage()).toBe('el');
  });

  it('starts in English where there is no window to ask', async () => {
    const { service, document } = createService({ stored: null, noWindow: true });

    await service.ready();

    expect(service.activeLanguage()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

function createService({
  stored,
  languages = [],
  language = '',
  noWindow = false,
}: {
  stored: string | null;
  languages?: readonly string[];
  language?: string;
  noWindow?: boolean;
}) {
  const transloco = {
    events$: new Subject<{ type: string }>(),
    load: vi.fn(() => of({})),
    setActiveLang: vi.fn(),
    translate: vi.fn((key: string) => key),
  };
  const preferences = {
    get: vi.fn(async () => ({ value: stored })),
    set: vi.fn(async () => undefined),
  };
  const document = {
    documentElement: { lang: 'en' },
    defaultView: noWindow ? null : { navigator: { languages, language } },
  };
  const service = new AppI18nService(transloco as never, document as never, preferences as never);

  return { service, document, preferences };
}

import { afterEach, describe, expect, it } from 'vitest';

import {
  formattingLanguage,
  resetFormattingLanguageForTests,
  setFormattingLanguage,
} from './app-locale-format';

/**
 * 869f17h2x. One test per behaviour that must follow the chosen language, which
 * is what the subtask asks for: switching the language has to change something
 * observable, not just the strings.
 *
 * No TestBed: page specs here run without an injector, which is exactly why the
 * formatting locale is module state rather than an injected service.
 */
describe('formatting follows the chosen language', () => {
  afterEach(() => {
    resetFormattingLanguageForTests();
  });

  it('defaults to English', () => {
    expect(formattingLanguage()).toBe('en');
  });

  /*
   * The defect in one assertion. A Greek reader with an English browser saw
   * `1,234,567.89` and read the thousands separator as a decimal point.
   */
  it('changes number grouping and the decimal mark when the language changes', () => {
    const value = 1234567.89;

    setFormattingLanguage('en');
    expect(value.toLocaleString(formattingLanguage())).toBe('1,234,567.89');

    setFormattingLanguage('el');
    expect(value.toLocaleString(formattingLanguage())).toBe('1.234.567,89');
  });

  it('changes integer grouping too, which is most of what this app renders', () => {
    setFormattingLanguage('en');
    expect((9303).toLocaleString(formattingLanguage())).toBe('9,303');

    setFormattingLanguage('el');
    expect((9303).toLocaleString(formattingLanguage())).toBe('9.303');
  });

  it('changes date formatting', () => {
    const when = new Date(Date.UTC(2026, 8, 15));

    setFormattingLanguage('en');
    const english = when.toLocaleDateString(formattingLanguage(), { timeZone: 'UTC' });

    setFormattingLanguage('el');
    const greek = when.toLocaleDateString(formattingLanguage(), { timeZone: 'UTC' });

    expect(greek).not.toBe(english);
  });

  it('ignores a language it does not support rather than throwing', () => {
    setFormattingLanguage('el');
    expect(() => (1).toLocaleString(formattingLanguage())).not.toThrow();
  });

  /*
   * Sort order is deliberately NOT bound. Character names come from the community
   * database and are Latin script whatever the interface language is, so collating
   * them as Greek changes established ordering and buys nothing. Asserted so the
   * position is a test rather than a comment someone deletes.
   */
  it('leaves Latin-script name ordering identical in both languages', () => {
    const names = ['Zoro', 'Ace', 'Luffy', 'Nami'];
    const sortIn = (language: 'en' | 'el') => {
      setFormattingLanguage(language);

      return [...names].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: 'base' }),
      );
    };

    expect(sortIn('el')).toEqual(sortIn('en'));
  });
});

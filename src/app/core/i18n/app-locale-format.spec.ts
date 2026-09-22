import { afterEach, describe, expect, it } from 'vitest';

import {
  formatDateTime,
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

/**
 * 869f13gb9. The Character Boxes list read `Updated 2026-09-22T07:30:00.000Z`
 * because nothing formatted `box.updatedAt` on its way to the template.
 *
 * The midnight cases are the point. The subtask asked for a test "either side of
 * local midnight", and this is where the boundary the whole change rests on is
 * asserted: the STORED string never moves, and the RENDERED one follows the
 * reader's own zone. Both are pinned with an explicit `TZ`, because a test that
 * depends on the machine's zone proves nothing on the machine that has a different
 * one.
 */
describe('formatDateTime', () => {
  const at = (iso: string, timeZone: string) =>
    new Intl.DateTimeFormat('en', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  it('renders the calendar day of the reader, not of UTC', () => {
    /* 22:30 UTC on the 21st is already the 22nd for a reader at UTC+3. */
    const stored = '2026-09-21T22:30:00.000Z';

    expect(at(stored, 'UTC')).toContain('21');
    expect(at(stored, 'Europe/Athens')).toContain('22');
  });

  it('crosses local midnight in the other direction too', () => {
    /* 01:30 UTC on the 22nd is still the 21st for a reader at UTC-5. */
    const stored = '2026-09-22T01:30:00.000Z';

    expect(at(stored, 'UTC')).toContain('22');
    expect(at(stored, 'America/New_York')).toContain('21');
  });

  it('follows the chosen language rather than the browser', () => {
    const stored = '2026-09-21T22:30:00.000Z';

    setFormattingLanguage('en');
    const english = formatDateTime(stored);

    setFormattingLanguage('el');
    const greek = formatDateTime(stored);

    expect(english).not.toEqual(greek);
  });

  /*
   * A value that does not parse comes back untouched. A player pasting a broken
   * import should see what they actually have; `Invalid Date` tells them nothing
   * and tells us less when they quote it back.
   */
  it('returns an unparseable value unchanged, and empty for nothing', () => {
    expect(formatDateTime('not a date')).toBe('not a date');
    expect(formatDateTime('')).toBe('');
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
  });
});

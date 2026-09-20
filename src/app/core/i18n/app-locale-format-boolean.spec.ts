import { describe, expect, it, afterEach } from 'vitest';

import {
  formatBoolean,
  resetFormattingLanguageForTests,
  setFormattingLanguage,
} from './app-locale-format';

/**
 * 869f13c58. Character Detail printed a hard-coded English `Yes`/`No` on the line below
 * one that formatted numbers in the interface language - the same row, in two languages.
 */
describe('formatBoolean', () => {
  afterEach(() => {
    resetFormattingLanguageForTests();
  });

  it('reads as English in the English interface', () => {
    setFormattingLanguage('en');
    expect(formatBoolean(true)).toBe('Yes');
    expect(formatBoolean(false)).toBe('No');
  });

  it('reads as Greek in the Greek interface - the defect this fixes', () => {
    setFormattingLanguage('el');
    expect(formatBoolean(true)).toBe('Ναι');
    expect(formatBoolean(false)).toBe('Όχι');
  });

  it('follows the same language the numbers beside it follow', () => {
    // The negative control: the two must never disagree, which is the whole bug.
    setFormattingLanguage('el');
    const greek = formatBoolean(true);
    setFormattingLanguage('en');
    expect(formatBoolean(true)).not.toBe(greek);
  });
});

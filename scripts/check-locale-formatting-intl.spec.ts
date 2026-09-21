import { describe, expect, it } from 'vitest';

import { checkLocaleFormatting } from './check-locale-formatting.mjs';

/**
 * Rule D: an `Intl.*` formatter constructed without a locale.
 *
 * 869f13epb. Rules A-C read `toLocale*` CALL SITES. The project's one date was
 * formatted by an `Intl.DateTimeFormat(undefined, …)` CONSTRUCTION, which is the
 * identical defect - "the browser's locale, not the app's" - written in a shape
 * those rules cannot see. It survived 869f17h2x's whole pass and survived this
 * guard going green, because a guard that covers one spelling of a defect
 * certifies the other.
 *
 * Its own file rather than appended to `check-locale-formatting.spec.ts`: that
 * file is driven from one CLEAN fixture map shared by every rule, and rule D's
 * cases are about construction syntax rather than about call sites.
 *
 * Driven from a tree that passes, so each case changes exactly one thing.
 */

const ALLOWLIST: { file: string; locale: string; reason: string }[] = [];

function run(source: string) {
  return checkLocaleFormatting({
    sources: new Map([['src/app/pages/demo/demo.page.ts', source]]),
    allowlist: ALLOWLIST,
  });
}

describe('locale formatting - Intl constructions', () => {
  it('passes a formatter bound to the chosen language', () => {
    expect(
      run("const f = new Intl.DateTimeFormat(formattingLanguage(), { dateStyle: 'medium' });").errors,
    ).toEqual([]);
  });

  it('passes a deliberately quoted locale, which rule B then judges', () => {
    expect(run("const f = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });").errors).toEqual(
      [],
    );
  });

  /* The defect exactly as it shipped. */
  it('fails an explicit undefined locale', () => {
    const { errors } = run("const f = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Intl.DateTimeFormat');
    expect(errors[0]).toContain('no locale');
  });

  it('fails a formatter constructed with no argument at all', () => {
    expect(run('const f = new Intl.NumberFormat();').errors).toHaveLength(1);
  });

  /* The shape a reader reaches for first: options, and no locale before them. */
  it('fails a formatter given options but no locale', () => {
    expect(run("const f = new Intl.NumberFormat({ style: 'percent' });").errors).toHaveLength(1);
  });

  it.each([
    'RelativeTimeFormat',
    'ListFormat',
    'PluralRules',
    'Collator',
    'Segmenter',
    'DisplayNames',
  ])('fails an unbound Intl.%s', (constructor) => {
    const { errors } = run(`const f = new Intl.${constructor}(undefined);`);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`Intl.${constructor}`);
  });

  /*
   * The guard strips comments first. Without this the header of
   * check-locale-formatting.mjs, which quotes the defect, would fail the check
   * that exists to describe it.
   */
  it('ignores the defect written inside a comment', () => {
    expect(
      run('/* new Intl.DateTimeFormat(undefined, {}) is the defect this rule catches */').errors,
    ).toEqual([]);
  });
});

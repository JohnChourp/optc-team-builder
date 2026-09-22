import { describe, expect, it } from 'vitest';

import { checkLocaleFormatting } from './check-locale-formatting.mjs';

/**
 * Rule F: a template that hands a stored timestamp to a player unformatted.
 *
 * 869f13gb9. Rules A-E each read a formatter being INVOKED - a `toLocale*` call, an
 * `Intl` construction, a `toFixed`. This defect had no call site at all:
 * `character-boxes.page.html` interpolated `box.updatedAt` into a translated
 * sentence, so the Character Boxes list read `Updated 2026-09-22T07:30:00.000Z` in
 * both languages, on a screen a player opens every session. A guard over how a
 * formatter is called is blind to a value that was never formatted.
 *
 * The FIRST rule F written here was green on that very defect, and the case below
 * marked "the defect exactly as it shipped" is the one that caught it. It asked
 * whether the interpolation contained a `(` anywhere; the real site is
 * `t('list.updatedAt', { timestamp: box.updatedAt })`, which contains `t(` while
 * passing the timestamp through untouched. So the question is asked of the
 * REFERENCE - is this value a call's argument, or piped - never of the surrounding
 * text.
 *
 * Its own file rather than appended to `check-locale-formatting.spec.ts`, for the
 * reason rule D's file gives: that suite is driven from one clean fixture map
 * shared by every rule, and these cases are about template shape.
 *
 * Every case changes exactly one thing against a tree that passes.
 */

const ALLOWLIST: { file: string; locale: string; reason: string }[] = [];
const TEMPLATE = 'src/app/pages/demo/demo.page.html';

function run(source: string, file = TEMPLATE) {
  return checkLocaleFormatting({ sources: new Map([[file, source]]), allowlist: ALLOWLIST });
}

describe('locale formatting - raw timestamps in templates', () => {
  /* The defect exactly as it shipped, and the case the first rule F passed. */
  it('fails a timestamp passed raw inside a translate call', () => {
    const { errors } = run("<small>{{ t('list.updatedAt', { timestamp: box.updatedAt }) }}</small>");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('box.updatedAt');
    expect(errors[0]).toContain('formatDateTime()');
  });

  it('fails a bare interpolation with no call at all', () => {
    expect(run('<p>{{ box.savedAt }}</p>').errors).toHaveLength(1);
  });

  it('fails a timestamp nested in an object literal handed to a call', () => {
    expect(run('<p>{{ fmt({ value: entry.importedAt }) }}</p>').errors).toHaveLength(1);
  });

  it('fails every other stored-timestamp field name', () => {
    for (const field of [
      'createdAt',
      'generatedAt',
      'deletedAt',
      'syncedAt',
      'lastSeenAt',
    ]) {
      expect(run(`<p>{{ record.${field} }}</p>`).errors).toHaveLength(1);
    }
  });

  /*
   * The rule is "something formatted it", never one helper's name: a second helper
   * is a legitimate way to format, and a rule bound to a name would force every call
   * site through one function for no reason the reader could state.
   */
  it('passes a timestamp wrapped in a call, whatever the helper is called', () => {
    expect(run('<p>{{ formatDateTime(box.updatedAt) }}</p>').errors).toEqual([]);
    expect(run('<p>{{ someOtherHelper(box.updatedAt) }}</p>').errors).toEqual([]);
    expect(
      run("<small>{{ t('list.updatedAt', { timestamp: formatUpdatedAt(box.updatedAt) }) }}</small>")
        .errors,
    ).toEqual([]);
  });

  it('passes a piped timestamp', () => {
    expect(run('<p>{{ box.syncedAt | date }}</p>').errors).toEqual([]);
  });

  /*
   * The translation KEY is the trap: `'list.updatedAt'` reads exactly like a field
   * reference, and an earlier draft reported it as one on the very site it had just
   * been taught to accept.
   */
  it('passes a string literal that looks like a field reference', () => {
    expect(run("<p>{{ t('list.updatedAt') }}</p>").errors).toEqual([]);
    expect(run('<p>{{ t("a.createdAt") }}</p>').errors).toEqual([]);
  });

  /*
   * Suffix-bound, never a substring. `pill` matching `.meta-pill` put a 44px tap
   * target over a static label in 869f13epp; the same mistake here would flag
   * `updateMode` and `candidateCount`, which are not timestamps and not even dates.
   */
  it('passes names that merely contain the words', () => {
    expect(run('<p>{{ box.updateMode }}{{ box.candidateCount }}{{ c.validateAtStart }}</p>').errors).toEqual(
      [],
    );
  });

  /* Rule F reads templates. A `.ts` file holding the same text is rules A-E's job. */
  it('does not read TypeScript files', () => {
    expect(run('const s = `{{ box.updatedAt }}`;', 'src/app/pages/demo/demo.page.ts').errors).toEqual(
      [],
    );
  });
});

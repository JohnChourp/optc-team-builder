import { describe, expect, it } from 'vitest';

import { checkLocaleFormatting } from './check-locale-formatting.mjs';

/**
 * 869f17h2x. Driven from a tree that passes, so each test changes exactly one
 * thing. A check only ever run against a clean tree has not been shown to fail.
 */

const CLEAN = new Map<string, string>([
  ['src/app/pages/demo/demo.page.ts', 'const label = count.toLocaleString(formattingLanguage());'],
  [
    'src/app/core/services/engine.ts',
    "const phrase = `${value.toLocaleString('en-US')}% chance to resist`;",
  ],
]);

const ALLOWLIST = [
  {
    file: 'src/app/core/services/engine.ts',
    locale: 'en-US',
    reason: 'Builds untranslated English sentences from dataset text, so the number is English too.',
  },
];

function run(sources = CLEAN, allowlist = ALLOWLIST) {
  return checkLocaleFormatting({ sources, allowlist });
}

describe('locale formatting', () => {
  it('passes on a tree where every site is bound or allowlisted', () => {
    expect(run().errors).toEqual([]);
  });

  /* A. The defect this exists for. */
  it('fails on a bare toLocaleString()', () => {
    const sources = new Map(CLEAN);

    sources.set('src/app/pages/demo/demo.page.ts', 'const label = count.toLocaleString();');

    expect(run(sources).errors.some((error) => error.includes('bare toLocale*()'))).toBe(true);
  });

  it('fails on a bare toLocaleDateString() too, not only numbers', () => {
    const sources = new Map(CLEAN);

    sources.set('src/app/pages/demo/demo.page.ts', 'const when = date.toLocaleDateString();');

    expect(run(sources).errors.some((error) => error.includes('bare toLocale*()'))).toBe(true);
  });

  /*
   * Prose describing the defect must not trip the check that fixes it - this
   * file's own module doc quotes `toLocaleString()` to explain the problem.
   */
  it('ignores a bare call inside a comment', () => {
    const sources = new Map(CLEAN);

    sources.set(
      'src/app/core/i18n/app-locale-format.ts',
      '/**\n * `toLocaleString()` with no argument uses the browser locale.\n */\nexport const x = 1;',
    );

    expect(run(sources).errors).toEqual([]);
  });

  /* B. */
  it('fails on a hard-coded locale that is not allowlisted', () => {
    const sources = new Map(CLEAN);

    sources.set('src/app/pages/demo/demo.page.ts', "const label = count.toLocaleString('en-US');");

    expect(run(sources).errors.some((error) => error.includes('hard-codes the locale'))).toBe(true);
  });

  it('fails when an allowlisted file uses a different locale than it declared', () => {
    const sources = new Map(CLEAN);

    sources.set('src/app/core/services/engine.ts', "const p = value.toLocaleString('de-DE');");

    expect(run(sources).errors.some((error) => error.includes("but uses 'de-DE'"))).toBe(true);
  });

  /* C. The clause that stops the allowlist outliving the code it excuses. */
  it('fails when an allowlisted file no longer hard-codes a locale', () => {
    const sources = new Map(CLEAN);

    sources.set('src/app/core/services/engine.ts', 'const p = value.toLocaleString(formattingLanguage());');

    expect(run(sources).errors.some((error) => error.includes('no longer hard-codes one'))).toBe(
      true,
    );
  });

  it('fails when an allowlisted file no longer exists', () => {
    const sources = new Map(CLEAN);

    sources.delete('src/app/core/services/engine.ts');

    expect(run(sources).errors.some((error) => error.includes('not a tracked source file'))).toBe(
      true,
    );
  });

  it('fails on an allowlist entry whose reason explains nothing', () => {
    const allowlist = [{ ...ALLOWLIST[0], reason: 'english' }];

    expect(
      run(CLEAN, allowlist).errors.some((error) => error.includes('needs a substantive reason')),
    ).toBe(true);
  });
});

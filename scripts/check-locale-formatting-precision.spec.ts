import { describe, expect, it } from 'vitest';

import {
  checkLocaleFormatting,
  FIXED_PRECISION_ALLOWLIST,
} from './check-locale-formatting.mjs';

/**
 * Rule E: `toFixed`, whose output is the same in every language.
 *
 * 869f13epu. Captain Coverage rendered a leader boost with
 * `String(Number(value.toFixed(3)))`. That prints `2.5` in every language, so a
 * Greek reader - who writes `2,5` - saw an English decimal separator on the result
 * card, next to numbers that did follow their language.
 *
 * It is the THIRD spelling of one defect: 869f17h2x fixed `toLocaleString`,
 * 869f13epb fixed `Intl`, and rules A-D read those two names. This one is
 * arithmetic plus `String` and names neither.
 *
 * An allowlist rather than a pattern, because "a `toFixed` whose result reaches a
 * template" is not decidable from the text. Its own file because rules A-D are
 * about which locale a formatter is given, and this is about a formatter that
 * takes none.
 */

const ALLOWLIST: { file: string; reason: string }[] = [];
const PRECISION = [
  { file: 'src/app/core/services/size.utils.ts', reason: 'A size string that must read identically in both languages.' },
];

/*
 * Every allowlisted file is put in `sources` too, or rule E's upkeep check reports
 * it missing - correctly, since an entry naming a file that is not tracked is one
 * of the things it exists to catch. The test for THAT case supplies its own list.
 */
function run(file: string, source: string, precisionAllowlist = PRECISION) {
  const sources = new Map<string, string>([[file, source]]);

  for (const entry of precisionAllowlist) {
    if (!sources.has(entry.file)) {
      sources.set(entry.file, "const s = `${n.toFixed(1)} MB`;");
    }
  }

  return checkLocaleFormatting({ sources, allowlist: ALLOWLIST, precisionAllowlist });
}

describe('locale formatting - fixed precision', () => {
  it('passes a value bound to the chosen language', () => {
    expect(
      run('src/app/pages/demo/demo.page.ts', 'const s = value.toLocaleString(formattingLanguage());')
        .errors,
    ).toEqual([]);
  });

  /* The defect exactly as it shipped on the Captain Coverage result card. */
  it('fails an unlisted toFixed', () => {
    const { errors } = run(
      'src/app/pages/demo/demo.page.ts',
      'const s = String(Number(value.toFixed(3)));',
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('toFixed');
    expect(errors[0]).toContain('FIXED_PRECISION_ALLOWLIST');
  });

  it('allows a listed site, because "always the same" is a real decision', () => {
    expect(run('src/app/core/services/size.utils.ts', "const s = `${n.toFixed(1)} MB`;").errors).toEqual(
      [],
    );
  });

  it('ignores a toFixed written inside a comment', () => {
    expect(
      run('src/app/pages/demo/demo.page.ts', '/* value.toFixed(3) is the defect this rule catches */')
        .errors,
    ).toEqual([]);
  });

  /* The list must not outlive the code it excuses - the same upkeep rules A-C have. */
  it('fails an allowlisted file that no longer uses toFixed', () => {
    const { errors } = run('src/app/core/services/size.utils.ts', 'const s = String(n);');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('no longer uses toFixed');
  });

  it('fails an allowlist entry naming a file that is not tracked', () => {
    const { errors } = checkLocaleFormatting({
      sources: new Map([['src/app/pages/demo/demo.page.ts', 'const s = String(n);']]),
      allowlist: ALLOWLIST,
      precisionAllowlist: [
        { file: 'src/app/core/services/gone.ts', reason: 'A reason long enough to be substantive.' },
      ],
    });

    expect(errors.join('\n')).toContain('not a tracked source file');
  });

  it('fails an entry whose reason is a placeholder', () => {
    const { errors } = run('src/app/core/services/size.utils.ts', "const s = `${n.toFixed(1)} MB`;", [
      { file: 'src/app/core/services/size.utils.ts', reason: 'n/a' },
    ]);

    expect(errors.join('\n')).toContain('needs a substantive reason');
  });

  it('ships a real allowlist whose every entry carries a reason', () => {
    expect(FIXED_PRECISION_ALLOWLIST.length).toBeGreaterThan(0);

    for (const entry of FIXED_PRECISION_ALLOWLIST) {
      expect(entry.reason.trim().length, entry.file).toBeGreaterThanOrEqual(20);
    }
  });
});

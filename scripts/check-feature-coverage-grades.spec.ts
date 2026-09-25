import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COVERAGE_COLUMNS,
  GRADES,
  checkFeatureCoverageGrades,
  codeTokens,
  deriveGrade,
  parseCoverageRows,
  readSmokeRoutes,
  resolveBrowserAxis,
  resolveEvidenceAxis,
  resolveGateAxis,
  resolveUnitAxis,
} from './check-feature-coverage-grades.mjs';

/**
 * 869f135u5. Most of these are about the ways this check could run green while
 * reading the wrong thing - which it did, twice, during its own development.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const MAP = readFileSync(path.join(REPO_ROOT, 'docs/feature-coverage-map.md'), 'utf8');

const always = () => true;
const never = () => false;

function row(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function table(...rows: string[][]): string {
  return [
    row(['Flow', ...COVERAGE_COLUMNS.slice(1)]),
    row(COVERAGE_COLUMNS.map(() => '---')),
    ...rows.map(row),
  ].join('\n');
}

describe('parseCoverageRows', () => {
  it('reads a nine-cell row', () => {
    const rows = parseCoverageRows(table(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Strong']));

    expect(rows).toHaveLength(1);
    expect(rows[0].cellCount).toBe(9);
  });

  it('does not split on an escaped pipe, because that is content', () => {
    const rows = parseCoverageRows(
      table(['A', 'B', '`enem(y\\|ies)`', 'D', 'E', 'F', 'G', 'H', 'Strong']),
    );

    expect(rows[0].cellCount).toBe(9);
  });

  it('counts the cells an unescaped pipe produces, so the row can be rejected', () => {
    /*
     * This is the defect that shipped. Line 26 carried 19 of these and GitHub
     * rendered the grade as the word "every".
     */
    const rows = parseCoverageRows(
      table(['A', 'B', '`enem(y|ies)`', 'D', 'E', 'F', 'G', 'H', 'Strong']),
    );

    expect(rows[0].cellCount).toBe(10);
  });

  it('ignores a table that is not the Flow Map', () => {
    /*
     * The legend above the Flow Map is itself a table. An earlier version read
     * its two-column rows as flows and failed five of them.
     */
    const markdown = ['| Axis | True when |', '| --- | --- |', '| unit | names a spec |'].join('\n');

    expect(parseCoverageRows(markdown)).toEqual([]);
  });

  it('keeps reading across the HTML comment that interrupts the real table', () => {
    /*
     * `docs-integrity-ignore-next-line` sits in the middle of the Flow Map. A
     * rule that ended the table at the first non-pipe line silently dropped the
     * eight rows after it - and still reported OK.
     */
    expect(parseCoverageRows(MAP).length).toBe(33);
  });
});

describe('the axes', () => {
  it('reads a unit cell that names an existing spec', () => {
    expect(resolveUnitAxis('`a.spec.ts`', { fileExists: always, scriptExists: never })).toBe(true);
  });

  it('reads a unit cell that names only a command, because four rows do', () => {
    expect(
      resolveUnitAxis('`npm run test:thing`', { fileExists: never, scriptExists: (n) => n === 'test:thing' }),
    ).toBe(true);
  });

  it('rejects a unit cell naming a spec that is not there', () => {
    expect(resolveUnitAxis('`gone.spec.ts`', { fileExists: never, scriptExists: never })).toBe(false);
  });

  it('calls a spec under e2e/ dedicated, and the smoke pack not', () => {
    expect(resolveBrowserAxis('`e2e/accessibility.spec.ts`', { fileExists: always })).toBe('dedicated');
    expect(resolveBrowserAxis('`e2e/smoke.spec.ts` covers the route', { fileExists: always })).toBe('smoke');
  });

  it('reads a sentence that DENIES coverage as none, not as smoke', () => {
    /*
     * The bug this found in its own first draft: the Character Boxes row says
     * "Not currently in `e2e/smoke.spec.ts`", and matching the word "smoke"
     * anywhere graded the row UP for saying it had no coverage.
     */
    expect(
      resolveBrowserAxis('Not currently in `e2e/smoke.spec.ts`; use focused live checks', {
        fileExists: always,
      }),
    ).toBe('none');
    expect(resolveBrowserAxis('No browser E2E by default', { fileExists: always })).toBe('none');
    expect(resolveBrowserAxis('No UI route; output is reviewed as an artifact', { fileExists: always })).toBe('none');
  });

  it('counts a smoke route named in backticks', () => {
    expect(
      resolveBrowserAxis('covers `/tabs/faq`', { fileExists: never, smokeRoutes: ['/tabs/faq'] }),
    ).toBe('smoke');
  });

  it('counts the post-merge smoke tag as browser coverage', () => {
    expect(resolveBrowserAxis('`@post-merge-smoke` Chromium subset', { fileExists: never })).toBe('smoke');
  });

  it('reads a gate cell that names an existing script', () => {
    expect(resolveGateAxis('`npm run build`', { scriptExists: (n) => n === 'build' })).toBe(true);
    expect(resolveGateAxis('Required before review', { scriptExists: never })).toBe(false);
  });

  it('reads an evidence cell that resolves to a file', () => {
    expect(resolveEvidenceAxis('`docs/thing.md`', { fileExists: always })).toBe(true);
    expect(resolveEvidenceAxis('`docs/gone.md`', { fileExists: never })).toBe(false);
  });

  it('takes a code span, not any word that looks like a path', () => {
    expect(codeTokens('see `a/b.ts` and docs/c.md')).toEqual(['a/b.ts']);
  });
});

describe('deriveGrade', () => {
  it('needs a dedicated browser spec for Strong', () => {
    expect(deriveGrade({ unit: true, gate: true, browser: 'dedicated' })).toBe('Strong');
    expect(deriveGrade({ unit: true, gate: true, browser: 'smoke' })).toBe('Covered');
  });

  it('keeps a fully guarded tooling flow at Covered, deliberately', () => {
    /*
     * Strong means "proved through the product, end to end". A flow with no
     * browser surface cannot reach it, and Covered is not a criticism.
     */
    expect(deriveGrade({ unit: true, gate: true, browser: 'none' })).toBe('Covered');
  });

  it('gives Covered to a flow with a browser path but no script gate', () => {
    expect(deriveGrade({ unit: true, gate: false, browser: 'smoke' })).toBe('Covered');
  });

  it('drops to Partial without unit coverage, whatever else is true', () => {
    expect(deriveGrade({ unit: false, gate: true, browser: 'dedicated' })).toBe('Partial');
  });

  it('gives Partial to a flow with a unit spec and nothing else', () => {
    expect(deriveGrade({ unit: true, gate: false, browser: 'none' })).toBe('Partial');
  });

  it('never returns a word outside the declared set', () => {
    for (const unit of [true, false]) {
      for (const gate of [true, false]) {
        for (const browser of ['dedicated', 'smoke', 'none']) {
          expect(GRADES).toContain(deriveGrade({ unit, gate, browser }));
        }
      }
    }
  });
});

describe('checkFeatureCoverageGrades', () => {
  const base = {
    fileExists: always,
    scriptExists: always,
    smokeRoutes: [],
  };

  it('stays quiet when the declared grade matches the evidence', () => {
    const markdown = table([
      'Flow A', 'surface', 'sources', '`a.spec.ts`', '`e2e/x.spec.ts`', '`npm run build`',
      '`docs/a.md`', 'owner', 'Strong',
    ]);

    expect(checkFeatureCoverageGrades({ markdown, ...base }).errors).toEqual([]);
  });

  it('reports a grade its evidence does not support', () => {
    const markdown = table([
      'Flow A', 'surface', 'sources', '`a.spec.ts`', 'No browser path', '`npm run build`',
      '`docs/a.md`', 'owner', 'Strong',
    ]);
    const { errors } = checkFeatureCoverageGrades({ markdown, ...base });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('declared Strong but its evidence supports Covered');
  });

  it('reports a row whose cells do not split into nine', () => {
    const markdown = table([
      'Flow A', 'surface', 'sources', '`enem(y|ies)`', '`e2e/x.spec.ts`', '`npm run build`',
      '`docs/a.md`', 'owner', 'Strong',
    ]);

    expect(
      checkFeatureCoverageGrades({ markdown, ...base }).errors[0],
    ).toContain('splits into 10 cells');
  });

  it('reports a grade word that is not one of the three', () => {
    const markdown = table([
      'Flow A', 'surface', 'sources', '`a.spec.ts`', '`e2e/x.spec.ts`', '`npm run build`',
      '`docs/a.md`', 'owner', 'Excellent',
    ]);

    expect(checkFeatureCoverageGrades({ markdown, ...base }).errors[0]).toContain('"Excellent" is not one of');
  });

  it('reports an evidence cell that resolves to nothing', () => {
    const markdown = table([
      'Flow A', 'surface', 'sources', '`a.spec.ts`', '`e2e/x.spec.ts`', '`npm run build`',
      '`docs/gone.md`', 'owner', 'Strong',
    ]);
    const { errors } = checkFeatureCoverageGrades({
      markdown,
      ...base,
      fileExists: (token: string) => token !== 'docs/gone.md',
    });

    expect(errors.some((error) => error.includes('names no evidence file that exists'))).toBe(true);
  });
});

describe('readSmokeRoutes', () => {
  it('reads the real smoke pack, so a renamed ROUTES array cannot leave it empty', () => {
    const routes = readSmokeRoutes(readFileSync(path.join(REPO_ROOT, 'e2e/smoke.spec.ts'), 'utf8'));

    expect(routes.length).toBeGreaterThan(10);
    expect(routes).toContain('/tabs/privacy');
  });
});

describe('the committed map', () => {
  it('declares only the three grades', () => {
    for (const parsed of parseCoverageRows(MAP)) {
      expect(GRADES, `line ${parsed.line}`).toContain(parsed.cells[8]);
    }
  });

  it('gives every row exactly nine cells', () => {
    for (const parsed of parseCoverageRows(MAP)) {
      expect(parsed.cellCount, `line ${parsed.line}`).toBe(9);
    }
  });

  it('states the criteria it is graded by, so the legend cannot drift from the lane', () => {
    expect(MAP).toContain('`unit` **and** `gate` **and** `browser = dedicated`');
    expect(MAP).toContain('cannot be Strong');
  });
});

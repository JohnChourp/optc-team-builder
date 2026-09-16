#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Strong, Covered and Partial have to mean something a script can check.
 *
 * 869f135u5. `docs/feature-coverage-map.md` DOES define the three grades - it has
 * since 2026-06-29 - so the subtask's headline reason ("nobody knows what they
 * mean") is false rather than stale. The real defect is that the definition is
 * prose that does not discriminate.
 *
 * Measured 2026-09-16 against the written legend: on the parseable rows, EVERY
 * row has a non-empty Perf/release/docs cell and nearly every one names a spec,
 * so the written test for Strong is satisfied by almost the whole table while
 * only 11 rows are declared Strong. A legend that 30 rows pass and 11 rows claim
 * is not a legend; it is a word the author picked by feel.
 *
 * So the criteria here are built from facts a script can resolve, and each axis
 * is stated rather than implied:
 *
 *   unit      the Unit/contract cell names a spec file that exists, or an npm
 *             script that exists. Four rows describe commands rather than specs,
 *             and leaving them unclassifiable would be the check refusing to
 *             read its own table.
 *   browser   THREE-valued, not boolean: `dedicated` (a spec under e2e/ that is
 *             not the smoke pack), `smoke` (the route is in smoke.spec.ts's
 *             ROUTES array, or the cell says so), or `none`. Boolean here is what
 *             made Covered and Strong collapse into each other.
 *   gate      the Perf/release/docs cell names an npm script that exists. TRUE on
 *             every row today, so on its own it decides nothing - it is only
 *             useful combined, and that is exactly why the old legend failed.
 *   evidence  the Evidence/docs cell resolves to a real file.
 *
 * And the grade:
 *
 *   Strong    unit AND gate AND browser === 'dedicated'
 *   Covered   unit AND (gate OR browser !== 'none')
 *   Partial   anything else
 *
 * The distribution this yields was ACCEPTED, not tuned. The criteria were not
 * adjusted until the existing grades survived - that would have reproduced the
 * legend's uselessness with extra steps.
 *
 * It also fails on a row that does not split into exactly 9 cells, which is the
 * defect that shipped: line 26 carried 19 unescaped `|` characters from regex
 * alternations inside code spans, so GitHub rendered its grade as the word
 * "every" and dropped `Strong` entirely. A reader could see that one.
 *
 * Run: npm run docs:coverage-grades
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const MAP_PATH = path.join(REPO_ROOT, 'docs/feature-coverage-map.md');
const SMOKE_SPEC = 'e2e/smoke.spec.ts';

export const COVERAGE_COLUMNS = Object.freeze([
  'flow',
  'surface',
  'sources',
  'unit',
  'browser',
  'gate',
  'evidence',
  'owner',
  'grade',
]);

export const GRADES = Object.freeze(['Strong', 'Covered', 'Partial']);

/**
 * Rows of the flow table, split on pipes the author did not escape.
 *
 * The lookbehind is the whole point: `\|` inside a code span is content, and this
 * file uses that convention deliberately. Splitting on a bare `|` is what turned
 * one row into 30 cells.
 */
export function parseCoverageRows(markdown) {
  const rows = [];
  let inFlowMap = false;

  /*
   * Scoped to the Flow Map table, not to "every line starting with a pipe".
   *
   * The legend above the table is itself a table - it has to be, because the four
   * axes are what the grades now mean - and the first version of this read its
   * two-column rows as nine-column flows and failed five of them. A check that
   * cannot tell its own documentation from its subject is not reading a table,
   * it is grepping for pipes.
   */
  markdown.split('\n').forEach((line, index) => {
    /*
     * The table is interrupted once, by an HTML comment
     * (`docs-integrity-ignore-next-line`), so a plain "not a pipe line ends the
     * table" rule silently dropped the eight rows after it. Only a heading ends
     * it.
     */
    if (line.startsWith('#')) {
      inFlowMap = false;

      return;
    }

    if (!line.startsWith('| ')) {
      return;
    }

    const parts = line.split(/(?<!\\)\|/u).map((cell) => cell.trim());
    const cells = parts.slice(1, -1);

    if (cells[0] === 'Flow') {
      inFlowMap = true;

      return;
    }

    if (!inFlowMap || cells[0] === '---') {
      return;
    }

    rows.push({ line: index + 1, cells, cellCount: cells.length });
  });

  return rows;
}

export function codeTokens(cell) {
  return [...String(cell ?? '').matchAll(/`([^`]+)`/gu)].map((match) => match[1].trim());
}

function asScriptName(token) {
  return token.replace(/^npm run /u, '').split(/\s+--?/u)[0].trim();
}

export function resolveUnitAxis(cell, { fileExists, scriptExists }) {
  const tokens = codeTokens(cell);

  const namesSpec = tokens.some((token) => /\.spec\.(?:ts|mjs)$/u.test(token) && fileExists(token));
  const namesScript = tokens.some((token) => scriptExists(asScriptName(token)));

  return namesSpec || namesScript;
}

export function resolveBrowserAxis(cell, { fileExists, smokeRoutes = [] }) {
  const tokens = codeTokens(cell);
  const text = String(cell ?? '');

  const dedicated = tokens.some(
    (token) => token.startsWith('e2e/') && token !== SMOKE_SPEC && fileExists(token),
  );

  if (dedicated) {
    return 'dedicated';
  }

  /*
   * The negation, checked BEFORE the smoke names and not after.
   *
   * The first version of this matched the word "smoke" anywhere in the cell, and
   * the Character Boxes row says *"Not currently in `e2e/smoke.spec.ts`"* - so
   * the check read a sentence declaring an ABSENCE as evidence of coverage, and
   * would have graded the row up for saying it had none. Five more rows open
   * "No browser E2E by default", "No app browser path", "No UI route", "No
   * default UI path", "No UI path".
   *
   * That leading `No`/`Not` is a convention the authors already use, so it is
   * read rather than invented.
   */
  if (/^(?:No|Not)\b/u.test(text)) {
    return 'none';
  }

  const namesSmokeSpec = tokens.some((token) => token === SMOKE_SPEC || token.endsWith('smoke.spec.ts'));
  const namesSmokeRoute = smokeRoutes.some((route) => text.includes(`\`${route}\``));

  if (namesSmokeSpec || namesSmokeRoute || text.includes('@post-merge-smoke')) {
    return 'smoke';
  }

  return 'none';
}

export function resolveGateAxis(cell, { scriptExists }) {
  return codeTokens(cell).some((token) => scriptExists(asScriptName(token)));
}

export function resolveEvidenceAxis(cell, { fileExists }) {
  return codeTokens(cell).some((token) => fileExists(token));
}

export function deriveGrade({ unit, browser, gate }) {
  if (unit && gate && browser === 'dedicated') {
    return 'Strong';
  }

  if (unit && (gate || browser !== 'none')) {
    return 'Covered';
  }

  return 'Partial';
}

export function checkFeatureCoverageGrades({ markdown, fileExists, scriptExists, smokeRoutes }) {
  const errors = [];
  const rows = parseCoverageRows(markdown);
  const graded = [];

  for (const row of rows) {
    if (row.cellCount !== COVERAGE_COLUMNS.length) {
      errors.push(
        `line ${row.line}: the row splits into ${row.cellCount} cells, not ${COVERAGE_COLUMNS.length}. ` +
          'A `|` inside a code span or a quoted phrase must be written `\\|`, or the table renders ' +
          'its columns shifted and the grade becomes whichever word landed in that position.',
      );
      continue;
    }

    const [flow, , , unitCell, browserCell, gateCell, evidenceCell, , declared] = row.cells;

    if (!GRADES.includes(declared)) {
      errors.push(`line ${row.line}: "${declared}" is not one of ${GRADES.join(', ')}.`);
      continue;
    }

    const axes = {
      unit: resolveUnitAxis(unitCell, { fileExists, scriptExists }),
      browser: resolveBrowserAxis(browserCell, { fileExists, smokeRoutes }),
      gate: resolveGateAxis(gateCell, { scriptExists }),
      evidence: resolveEvidenceAxis(evidenceCell, { fileExists }),
    };
    const derived = deriveGrade(axes);

    graded.push({ flow, line: row.line, declared, derived, ...axes });

    if (derived !== declared) {
      errors.push(
        `line ${row.line}: "${flow}" is declared ${declared} but its evidence supports ${derived} ` +
          `(unit=${axes.unit}, browser=${axes.browser}, gate=${axes.gate}). ` +
          'Move the grade, or correct the cell that is wrong.',
      );
    }

    if (!axes.evidence) {
      errors.push(
        `line ${row.line}: "${flow}" names no evidence file that exists. The Evidence/docs cell is ` +
          'where a reader goes next; a name that resolves to nothing is worse than an empty cell.',
      );
    }
  }

  return { errors, graded, rowCount: rows.length };
}

function buildFileExists(root = REPO_ROOT) {
  /*
   * Four kinds of name appear in these cells and only the first is a plain path.
   * Refusing the other three would make the check unusable rather than strict.
   */
  const cache = new Map();

  return (token) => {
    if (cache.has(token)) {
      return cache.get(token);
    }

    const value = (() => {
      const candidate = token.replace(/^\.\//u, '');

      if (existsSync(path.join(root, candidate))) {
        return true;
      }

      /* A glob, e.g. `scripts/perf-*.mjs`. */
      if (candidate.includes('*')) {
        return globSync(candidate, { cwd: root }).length > 0;
      }

      /* A cross-repo path - the brain sits beside this checkout. */
      if (candidate.startsWith('.claude/') || candidate.startsWith('audits/')) {
        return existsSync(path.join(root, '..', 'optc-team-builder-brain', candidate));
      }

      /* A bare basename, resolved only when it is unique in the tree. */
      if (!candidate.includes('/')) {
        const hits = globSync(`{src,scripts,e2e,docs,android,server}/**/${candidate}`, { cwd: root });

        return hits.length > 0;
      }

      return false;
    })();

    cache.set(token, value);

    return value;
  };
}

export function readSmokeRoutes(source) {
  const block = source.slice(source.indexOf('const ROUTES = ['), source.indexOf('] as const;'));

  return [...block.matchAll(/path: '([^']+)'/gu)].map((match) => match[1]);
}

function main() {
  const markdown = readFileSync(MAP_PATH, 'utf8');
  const scripts = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
  const smokeRoutes = readSmokeRoutes(readFileSync(path.join(REPO_ROOT, SMOKE_SPEC), 'utf8'));

  const { errors, graded, rowCount } = checkFeatureCoverageGrades({
    markdown,
    fileExists: buildFileExists(),
    scriptExists: (name) => Object.hasOwn(scripts, name),
    smokeRoutes,
  });

  if (errors.length > 0) {
    for (const error of errors) {
      process.stderr.write(`  - ${error}\n`);
    }

    process.stderr.write(`\nFAIL feature coverage grades: ${errors.length} issue(s) in ${rowCount} row(s).\n`);
    process.exitCode = 1;

    return;
  }

  const counts = graded.reduce((totals, row) => {
    totals[row.derived] = (totals[row.derived] ?? 0) + 1;

    return totals;
  }, {});

  process.stdout.write(
    `OK feature coverage grades: ${rowCount} row(s) - ` +
      `${GRADES.map((grade) => `${counts[grade] ?? 0} ${grade}`).join(', ')}.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Tag-set picker panel scoping guard.
 *
 * `character-tag-set-picker.component.html` renders
 * `<app-ability-tag-set-picker-style-panels>` - the SAME style panels the
 * ability picker uses - inside a modal classed `character-tag-set-picker-modal`.
 * So a rule in those panels that names only `.ability-tag-set-picker-modal`
 * reaches every host of one picker and silently skips all eight hosts of the
 * other, even though both render byte-identical markup.
 *
 * That is not hypothetical. Measured live at 844x390 on `/tabs/rumble-characters`
 * after 869etpmp3 promoted these rules: 16 of 128 tile titles still clipped
 * (`white-space: nowrap`), the header still 211px of a 314px wrapper, and the
 * catalog scrollport 26px tall for 209px of tags - because none of it named the
 * character picker's class. `styles.scss` and the motion panel had paired both
 * names all along; the catalog and responsive panels were the outliers.
 *
 * So the rule this guard enforces is symmetry, not any particular property:
 * inside these shared panels, a selector naming one modal class must have a
 * twin naming the other. Neither picker owns these files.
 *
 * Run: npm run styles:tag-picker-scoping
 */

/** The two modal classes. A selector naming one must have a twin naming the other. */
export const ABILITY_MODAL_CLASS = 'ability-tag-set-picker-modal';
export const CHARACTER_MODAL_CLASS = 'character-tag-set-picker-modal';

/**
 * Stylesheets both pickers render. Sourced from the shared style-panels
 * component, which is what makes a single-class selector asymmetric.
 */
export const SHARED_PANEL_STYLESHEETS = [
  'src/app/shared/ability-tag-set-picker/ability-tag-set-picker-catalog-panel.component.scss',
  'src/app/shared/ability-tag-set-picker/ability-tag-set-picker-responsive-panel.component.scss',
  'src/app/shared/ability-tag-set-picker/ability-tag-set-picker-motion-panel.component.scss',
];

/** Strips comments so a class named in prose is never mistaken for a selector. */
export function stripScssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Splits every declaration block's prelude into individual selectors.
 *
 * Selectors are collected at EVERY nesting depth, not just the top level. Both
 * short-viewport rules live inside `@media` blocks, and the motion panel's rule
 * inside `@media (prefers-reduced-motion: reduce)` - a depth-0-only reader sees
 * three at-rule preludes and not one real selector in the responsive panel,
 * which is exactly where half the measured defect lived.
 *
 * An at-rule prelude (`@media ...`) is a container, not a selector, so it is
 * skipped rather than paired. A declaration ends at `;` and never reaches a
 * `{`, so a class name in a property value is never mistaken for a selector.
 */
export function selectorsOf(source) {
  const selectors = [];
  let prelude = '';

  for (const char of stripScssComments(source)) {
    if (char === '{') {
      const trimmed = prelude.trim();

      if (!trimmed.startsWith('@')) {
        for (const part of trimmed.split(',')) {
          const selector = part.trim();

          if (selector) {
            selectors.push(selector);
          }
        }
      }

      prelude = '';
    } else if (char === '}' || char === ';') {
      prelude = '';
    } else {
      prelude += char;
    }
  }

  return selectors;
}

/** The twin of a selector: the same shape, aimed at the other picker's modal. */
export function twinOf(selector) {
  return selector.includes(ABILITY_MODAL_CLASS)
    ? selector.split(ABILITY_MODAL_CLASS).join(CHARACTER_MODAL_CLASS)
    : selector.split(CHARACTER_MODAL_CLASS).join(ABILITY_MODAL_CLASS);
}

/** Returns one finding per selector whose twin is missing from the same file. */
export function findUnpairedSelectors(fileLabel, source) {
  const selectors = selectorsOf(source);
  const present = new Set(selectors.map((selector) => selector.replace(/\s+/g, ' ')));
  const findings = [];

  for (const selector of selectors) {
    const names =
      Number(selector.includes(ABILITY_MODAL_CLASS)) +
      Number(selector.includes(CHARACTER_MODAL_CLASS));

    // Names both classes itself, or names neither: nothing to pair.
    if (names !== 1) {
      continue;
    }

    const twin = twinOf(selector).replace(/\s+/g, ' ');

    if (!present.has(twin)) {
      findings.push({ file: fileLabel, selector, missing: twin });
    }
  }

  return findings;
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const findings = [];

  for (const relativePath of SHARED_PANEL_STYLESHEETS) {
    const source = readFileSync(path.join(projectRoot, relativePath), 'utf8');

    findings.push(...findUnpairedSelectors(relativePath, source));
  }

  if (findings.length > 0) {
    console.error('Tag-set picker panel scoping check FAILED.\n');
    console.error(
      'These panels are rendered by BOTH pickers, so a selector naming one modal',
    );
    console.error('class skips every host of the other. Add the twin selector:\n');

    for (const finding of findings) {
      console.error(`  ${finding.file}`);
      console.error(`    has     ${finding.selector}`);
      console.error(`    missing ${finding.missing}\n`);
    }

    process.exitCode = 1;

    return;
  }

  console.log(
    `Tag-set picker panel scoping OK: every modal-class selector in ${SHARED_PANEL_STYLESHEETS.length} shared panels is paired.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

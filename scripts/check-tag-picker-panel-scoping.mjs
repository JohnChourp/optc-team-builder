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

/** The component that composes every shared panel. The list is derived from it. */
export const STYLE_PANELS_COMPONENT =
  'src/app/shared/ability-tag-set-picker/ability-tag-set-picker-style-panels.component.ts';

/** Read by both pickers' hosts, and not owned by either picker. */
export const EXTRA_SHARED_STYLESHEETS = ['src/styles.scss'];

/**
 * Stylesheets both pickers render, derived from the style-panels component's
 * own `styleUrl` declarations.
 *
 * This list used to be three hardcoded paths - catalog, responsive, motion -
 * while the component composes EIGHT panels, and both pickers render the whole
 * stack. A single-class rule added to shell, formula, set, operator or footer
 * was never handed to the checker, even though `findUnpairedSelectors` would
 * have flagged it correctly. The shell panel is the likeliest place for that:
 * it already styles `.ability-tag-set-head h2` unscoped, which is one of the
 * defects named in this file's own docstring. `src/styles.scss` was unread for
 * the same reason, and it carries six paired modal-class selectors that could
 * regress to one-sided without anything noticing.
 *
 * Deriving the list means a ninth panel is covered the day it is added, rather
 * than the day somebody remembers this constant exists.
 */
export function resolveSharedPanelStylesheets(projectRoot) {
  const componentPath = path.join(projectRoot, STYLE_PANELS_COMPONENT);
  const source = readFileSync(componentPath, 'utf8');
  const componentDir = path.posix.dirname(STYLE_PANELS_COMPONENT);
  const stylesheets = [];

  for (const match of source.matchAll(/styleUrl:\s*'([^']+)'/gu)) {
    stylesheets.push(path.posix.normalize(path.posix.join(componentDir, match[1])));
  }

  if (stylesheets.length === 0) {
    throw new Error(
      `No styleUrl found in ${STYLE_PANELS_COMPONENT}. The derivation is broken; a guard that reads no file passes everything.`,
    );
  }

  return [...stylesheets, ...EXTRA_SHARED_STYLESHEETS];
}

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
  const stylesheets = resolveSharedPanelStylesheets(projectRoot);
  const findings = [];

  for (const relativePath of stylesheets) {
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
    `Tag-set picker panel scoping OK: every modal-class selector in ${stylesheets.length} shared stylesheets is paired.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

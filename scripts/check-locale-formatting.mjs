#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Player-facing numbers follow the chosen language, not the browser's.
 *
 * 869f17h2x. `toLocaleString()` with no argument formats in the BROWSER's locale.
 * Measured: `1234567.89` is `1,234,567.89` in `en` and `1.234.567,89` in `el`, so
 * a Greek reader with an English browser saw a thousands separator exactly where
 * they expect a decimal point. 41 call sites had no locale at all, and the 12
 * `localeCompare` calls that looked bound passed `undefined`.
 *
 * Three things are enforced:
 *
 *   A. no bare `toLocaleString()` / `toLocaleDateString()` / `toLocaleTimeString()`
 *      in `src` - pass `formattingLanguage()`;
 *   B. no hard-coded locale string unless the site is listed below with a reason,
 *      because "always English" is a real decision and an accident looks identical;
 *   C. every allowlist entry still exists and still holds a hard-coded locale, so
 *      the list cannot outlive the code it excuses;
 *   D. no `Intl.*` formatter is constructed with `undefined` or no locale at all.
 *
 * 869f13epb added D. Rules A-C read `toLocale*` CALL SITES, and the project's one
 * date was formatted by an `Intl.DateTimeFormat(undefined, …)` CONSTRUCTION - the
 * identical defect, in a shape the guard could not see. It sat in
 * `account.page.ts` through the whole of 869f17h2x's pass and through this guard
 * going green. A guard that covers one spelling of a defect certifies the other.
 *
 * `localeCompare` is deliberately NOT covered. Character names come from the
 * community database and are Latin script whatever the interface language is, so
 * collating them as Greek changes established ordering and buys nothing. That is
 * a position, recorded in docs/locale-behaviour.md, not an oversight.
 *
 * Run: npm run i18n:locale-formatting
 */

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BARE_CALL = /\.toLocale(?:String|DateString|TimeString)\(\s*\)/gu;
const HARD_CODED = /\.toLocale(?:String|DateString|TimeString)\(\s*['"]([a-zA-Z-]+)['"]/gu;

/**
 * `new Intl.X(` with no locale argument, or an explicit `undefined`.
 *
 * Both mean "the browser's locale". A `formattingLanguage()` or a quoted locale
 * is what a bound site looks like, and neither matches.
 */
const BARE_INTL =
  /new\s+Intl\.(NumberFormat|DateTimeFormat|RelativeTimeFormat|ListFormat|PluralRules|Collator|Segmenter|DisplayNames)\s*\(\s*(?:\)|undefined\b|\{)/gu;

/** Sites that must stay in a fixed locale, each with the reason. */
export const FIXED_LOCALE_ALLOWLIST = [
  {
    file: 'src/app/core/services/auto-team-builder-rumble.engine.ts',
    locale: 'en-US',
    reason:
      'Builds untranslated English sentences from dataset text - "50% chance to resist Poison". The number is part of an English phrase, so formatting it as Greek would produce a sentence in neither language.',
  },
];

export function listSourceFiles(root = projectRoot) {
  return execFileSync('git', ['ls-files', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n')
    .filter(Boolean)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.html'))
    .filter((file) => !file.endsWith('.spec.ts'));
}

export function readSources(files, root = projectRoot) {
  const sources = new Map();

  for (const file of files) {
    try {
      sources.set(file, readFileSync(path.join(root, file), 'utf8'));
    } catch {
      /* unreadable files format nothing */
    }
  }

  return sources;
}

/** A line inside a block comment or a `//` comment is prose, not a call site. */
function stripComments(contents) {
  return contents.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
}

export function checkLocaleFormatting({ sources, allowlist = FIXED_LOCALE_ALLOWLIST }) {
  const errors = [];
  const allowed = new Map(allowlist.map((entry) => [entry.file, entry]));
  const seen = new Set();

  for (const [file, raw] of sources) {
    const contents = stripComments(raw);

    /* A. */
    const bare = contents.match(BARE_CALL)?.length ?? 0;

    if (bare > 0) {
      errors.push(
        `${file} has ${bare} bare toLocale*() call(s). Pass formattingLanguage() so the number follows the chosen language, not the browser's.`,
      );
    }

    /* B. */
    for (const match of contents.matchAll(HARD_CODED)) {
      const entry = allowed.get(file);

      if (!entry) {
        errors.push(
          `${file} hard-codes the locale '${match[1]}'. Pass formattingLanguage(), or add the file to FIXED_LOCALE_ALLOWLIST with the reason it must stay fixed.`,
        );
        continue;
      }

      seen.add(file);

      if (entry.locale !== match[1]) {
        errors.push(
          `${file} is allowed to fix its locale to '${entry.locale}' but uses '${match[1]}'.`,
        );
      }
    }

    /* D. */
    for (const match of contents.matchAll(BARE_INTL)) {
      errors.push(
        `${file} constructs Intl.${match[1]} with no locale. Pass formattingLanguage() so the value follows the chosen language, not the browser's.`,
      );
    }
  }

  /* C. */
  for (const entry of allowlist) {
    if (!sources.has(entry.file)) {
      errors.push(`${entry.file} is allowlisted for a fixed locale but is not a tracked source file.`);
      continue;
    }

    if (!seen.has(entry.file)) {
      errors.push(
        `${entry.file} is allowlisted for a fixed locale but no longer hard-codes one. Remove the entry.`,
      );
    }

    if (!entry.reason || entry.reason.trim().length < 20) {
      errors.push(`${entry.file} needs a substantive reason in FIXED_LOCALE_ALLOWLIST.`);
    }
  }

  return { errors };
}

function main() {
  const sources = readSources(listSourceFiles());
  const { errors } = checkLocaleFormatting({ sources });

  if (errors.length) {
    console.error('locale formatting check failed:\n');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `[i18n] locale formatting is bound to the chosen language; ${FIXED_LOCALE_ALLOWLIST.length} deliberate fixed-locale site(s).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

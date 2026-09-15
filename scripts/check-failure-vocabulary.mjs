#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Every failure the player sees says the same three things.
 *
 * 869f135ra. 19 of 22 pages catch their own exceptions and 38 of those catches
 * reach the player, each phrasing failure its own way. An error message is the
 * only part of the app a player reads carefully, because they are stuck, and if
 * every screen words it differently they cannot learn what this app does when
 * things go wrong - so the report arrives as "it broke".
 *
 * The vocabulary is `src/app/core/data/failure-vocabulary.data.ts` and its copy
 * is the `failures` i18n namespace. This check is what keeps them honest:
 *
 *   A. every family has `what.<id>` and `action.<id>` in BOTH languages;
 *   B. every data-safety value a family declares has `safety.<value>` in both;
 *   C. the namespace holds no key that belongs to no family, in either language -
 *      an orphan is copy nobody will ever see, which rots without anyone noticing;
 *   D. every family carries a note saying why it is not a duplicate of another,
 *      because duplicates are how one vocabulary drifts back into 38 phrasings;
 *   E. every player-facing error message on a page is built from the vocabulary;
 *   F. the `failures` scope is preloaded at start-up, or the first failure a reader
 *      ever meets renders raw i18n keys at them.
 *
 * E is the one that makes this a vocabulary rather than a suggestion. A page
 * feedback object with `tone: 'error'` must take its `details` from
 * `buildFailureLines`/`buildFailureMessage`, either directly or through a
 * `resolve*` method in the same file that does. One level of indirection is
 * resolved deliberately: that is the shape every one of these pages already uses,
 * and a check that only understood the direct form would pass a file that had
 * quietly moved its wording into a helper.
 *
 * The data-safety sentence is the part that did not exist before, and it is why
 * the subtask singles out storage failures: "Browser storage is full, so the
 * saved teams could not be stored" leaves a player genuinely unsure whether the
 * teams they already had survived. They did.
 *
 * Run: npm run i18n:failure-vocabulary
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const VOCABULARY_PATH = path.join(REPO_ROOT, 'src/app/core/data/failure-vocabulary.data.ts');
const I18N_DIR = path.join(REPO_ROOT, 'public/i18n/failures');
const LANGUAGES = ['en', 'el'];

const COMPOSERS = ['buildFailureLines', 'buildFailureMessage'];

export function parseVocabulary(source) {
  const families = [];
  const pattern =
    /\{\s*id:\s*'([^']+)',\s*dataSafety:\s*'([^']+)',\s*note:\s*'((?:[^'\\]|\\.)*)',?\s*\}/gu;

  for (const match of source.matchAll(pattern)) {
    families.push({ id: match[1], dataSafety: match[2], note: match[3] });
  }

  return families;
}

export function auditCopy(families, translations) {
  const missing = [];
  const orphans = [];
  const safeties = new Set(families.map((family) => family.dataSafety));

  for (const [language, copy] of Object.entries(translations)) {
    for (const family of families) {
      for (const section of ['what', 'action']) {
        const value = copy?.[section]?.[family.id];
        if (typeof value !== 'string' || value.trim() === '') {
          missing.push(`${language}: ${section}.${family.id}`);
        }
      }
    }

    for (const safety of safeties) {
      const value = copy?.safety?.[safety];
      if (typeof value !== 'string' || value.trim() === '') {
        missing.push(`${language}: safety.${safety}`);
      }
    }

    const knownIds = new Set(families.map((family) => family.id));
    for (const section of ['what', 'action']) {
      for (const key of Object.keys(copy?.[section] ?? {})) {
        if (!knownIds.has(key)) {
          orphans.push(`${language}: ${section}.${key}`);
        }
      }
    }
    for (const key of Object.keys(copy?.safety ?? {})) {
      if (!safeties.has(key)) {
        orphans.push(`${language}: safety.${key}`);
      }
    }
  }

  return { missing, orphans };
}

/**
 * The spans of every `catch` block in a file.
 *
 * The scope of this check is FAILURES, and the first version of it was wrong
 * about that: it took every `tone: 'error'` feedback object, which swept up the
 * validation messages on the manual builder - "the same character is in two sub
 * slots", "this team is over the cost budget". Nothing has gone wrong there and
 * there is no data-safety question to answer, so demanding the three-part shape
 * would have been the lane crying wolf on its first run.
 *
 * A failure is something that was THROWN. The subtask says so in as many words:
 * "every catch that reaches the player". So the boundary is the catch block.
 */
export function collectCatchSpans(source) {
  const spans = [];

  for (const match of source.matchAll(/catch\s*(?:\([^)]*\))?\s*\{/gu)) {
    let depth = 1;
    let index = match.index + match[0].length;

    while (depth > 0 && index < source.length) {
      if (source[index] === '{') {
        depth += 1;
      } else if (source[index] === '}') {
        depth -= 1;
      }
      index += 1;
    }

    spans.push({ end: index, start: match.index });
  }

  return spans;
}

/**
 * Each `tone: 'error'` feedback object raised INSIDE a catch, and the expression
 * it takes its `details` from.
 */
export function collectErrorFeedbackSites(source) {
  const spans = collectCatchSpans(source);
  const sites = [];

  for (const match of source.matchAll(/tone:\s*'error'/gu)) {
    const inCatch = spans.some((span) => match.index > span.start && match.index < span.end);
    if (!inCatch) {
      continue;
    }

    const after = source.slice(match.index, match.index + 600);
    /*
     * Two surfaces exist. Most pages carry `details: [...]`; character-detail
     * carries a single `message:`. Reading only the first reported that page as
     * having no message at all, which is a check failing to see its own subject.
     */
    const expression =
      /details:\s*([\s\S]*?)(?:,\n\s*\w+:|\n\s*\}\)|\n\s*\},)/u.exec(after) ??
      /message:\s*([\s\S]*?)(?:,\n\s*\w+:|\n\s*\}\)|\n\s*\},)/u.exec(after);
    sites.push({ index: match.index, details: expression ? expression[1] : null });
  }

  return sites;
}

/**
 * A method's own body, bounded by braces.
 *
 * This read a fixed 1800-character window first, and the mutation test caught
 * it: reverting a page to a bare error message left the lane GREEN, because the
 * window ran past the end of the resolver and into a neighbouring method that
 * did use the composer. A guard that passes a tree it should reject is the whole
 * subject of this parent, committed inside the guard written for it.
 */
export function readMethodBody(source, declarationIndex) {
  const open = source.indexOf('{', declarationIndex);

  if (open === -1) {
    return '';
  }

  let depth = 1;
  let index = open + 1;

  while (depth > 0 && index < source.length) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
    }
    index += 1;
  }

  return source.slice(open, index);
}

export function usesVocabulary(detailsExpression, source) {
  if (!detailsExpression) {
    return false;
  }
  if (COMPOSERS.some((composer) => detailsExpression.includes(composer))) {
    return true;
  }

  /*
   * One level of indirection: `details: this.resolveFooError(error)`. The method
   * lives in the same file, and it is where every one of these pages already
   * keeps its wording.
   */
  for (const call of detailsExpression.matchAll(/this\.(\w+)\s*\(/gu)) {
    const method = call[1];
    /*
     * EVERY occurrence, and never one preceded by a dot.
     *
     * The first version took the first match of `<name>(` in the file, which is
     * the CALL, not the declaration - so it read 1800 characters of the call
     * site, found no composer, and reported every converted site as unconverted.
     * A check that cannot see a correct tree is the same defect as one that
     * cannot see a broken one.
     */
    const declarations = source.matchAll(
      new RegExp(
        `(?<![.\\w])(?:private\\s+|public\\s+|protected\\s+)?(?:readonly\\s+)?${method}\\s*\\(`,
        'gu',
      ),
    );

    for (const declaration of declarations) {
      const body = readMethodBody(source, declaration.index);
      if (COMPOSERS.some((composer) => body.includes(composer))) {
        return true;
      }
    }
  }

  return false;
}

export function auditPages(files) {
  const offenders = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const sites = collectErrorFeedbackSites(source);

    for (const site of sites) {
      if (!usesVocabulary(site.details, source)) {
        offenders.push({
          file: path.relative(REPO_ROOT, file),
          details: (site.details ?? '(no details)').trim().slice(0, 90).replace(/\s+/gu, ' '),
        });
      }
    }
  }

  return offenders;
}

export function run() {
  const families = parseVocabulary(readFileSync(VOCABULARY_PATH, 'utf8'));
  const translations = Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      JSON.parse(readFileSync(path.join(I18N_DIR, `${language}.json`), 'utf8')),
    ]),
  );

  const problems = [];

  if (families.length === 0) {
    problems.push(
      'No failure families were parsed from failure-vocabulary.data.ts. The check is measuring\n' +
        'nothing and must not report success.',
    );
    return { ok: false, problems, familyCount: 0, siteCount: 0 };
  }

  const { missing, orphans } = auditCopy(families, translations);

  if (missing.length > 0) {
    problems.push(
      `${missing.length} failure copy value(s) are missing. Every family needs what + action in\n` +
        `both languages, and every data-safety value needs its sentence.\n` +
        missing.map((entry) => `  ${entry}`).join('\n'),
    );
  }

  if (orphans.length > 0) {
    problems.push(
      `${orphans.length} key(s) in the failures namespace belong to no family. Copy nobody can\n` +
        `reach rots without anyone noticing - delete it, or add the family it was written for.\n` +
        orphans.map((entry) => `  ${entry}`).join('\n'),
    );
  }

  const unnoted = families.filter((family) => (family.note ?? '').trim().length < 30);
  if (unnoted.length > 0) {
    problems.push(
      `${unnoted.length} family(ies) do not say why they are not a duplicate of another.\n` +
        unnoted.map((family) => `  ${family.id}`).join('\n'),
    );
  }

  /*
   * F. The scope is preloaded at start-up.
   *
   * `translate` starts the load and then resolves SYNCHRONOUSLY, so the first
   * call for an unloaded scope returns the raw key. Every other scope is loaded
   * by its page's template; this one is read only from inside a catch, with no
   * template to trigger it - so without a preload the first failure a reader ever
   * met would render `failures.what.invalidFile` at them. An error message that is
   * itself broken, on the screen where they are already stuck.
   */
  const shell = readFileSync(path.join(REPO_ROOT, 'src/app/app.component.ts'), 'utf8');
  if (!/preloadScope\(\s*FAILURE_I18N_SCOPE\s*\)/u.test(shell)) {
    problems.push(
      'src/app/app.component.ts does not preload FAILURE_I18N_SCOPE. Without it the first failure\n' +
        'a reader meets renders raw i18n keys, because translate() resolves synchronously while the\n' +
        'scope is still loading.',
    );
  }

  const pageFiles = globSync(path.join(REPO_ROOT, 'src/app/pages/**/*.page.ts')).filter(
    (file) => !file.endsWith('.spec.ts'),
  );
  const offenders = auditPages(pageFiles);
  const siteCount = pageFiles.reduce(
    (total, file) => total + collectErrorFeedbackSites(readFileSync(file, 'utf8')).length,
    0,
  );

  if (offenders.length > 0) {
    problems.push(
      `${offenders.length} player-facing error message(s) are not built from the failure vocabulary.\n` +
        `Use buildFailureLines(familyId, translate, detail) so the message says what happened,\n` +
        `whether their data is safe, and the one thing to try - in the same words as every other\n` +
        `screen.\n` +
        offenders.map((entry) => `  ${entry.file}\n    details: ${entry.details}`).join('\n'),
    );
  }

  return { ok: problems.length === 0, problems, familyCount: families.length, siteCount };
}

function main() {
  const result = run();

  if (!result.ok) {
    for (const problem of result.problems) {
      process.stderr.write(`${problem}\n\n`);
    }
    process.stderr.write('FAIL failure vocabulary\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `OK failure vocabulary: ${result.familyCount} families in 2 languages, ` +
      `${result.siteCount} player-facing error message(s), all three-part.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

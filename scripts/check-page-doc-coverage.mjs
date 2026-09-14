#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Every page under `src/app/pages/` must be mapped in `docs/docs-drift-map.json`.
 *
 * 869f12x4n. The FAQ shipped across v0.4.17, v0.4.18 and v0.4.19 - three
 * releases, three PRs, a public route, eight entries in two languages, 356
 * lines of spec - and every maintainer surface that decides what gets checked,
 * documented, smoke-tested or indexed had zero mentions of it. The drift map is
 * the load-bearing one: with no entry, a change to `faq.data.ts` requires no doc
 * update, forever, silently.
 *
 * Why nothing caught it: the existing guards check that mapped things stay
 * consistent. `check-docs-integrity.mjs` validates references that exist; an
 * absent feature has no reference to validate. Nothing checked that a new thing
 * got mapped at all.
 *
 * The sweep this subtask required found the FAQ was NOT alone. Measured
 * 2026-09-14 against `main`, five of the 22 page directories had no drift-map
 * entry: `faq`, `home`, `privacy-policy`, `cookie-policy`, `terms-of-service`.
 * Shipping a fix for the reported one and finding the next four afterwards is
 * the worst outcome here, which is why this checks the whole tree.
 *
 *   A. a page directory with no drift-map entry and no written exclusion fails;
 *   B. an exclusion naming a directory that no longer exists fails, so the
 *      registry cannot rot into a list of ghosts that silently permit;
 *   C. a drift-map feature path naming a page directory that no longer exists
 *      fails, which is the same rot from the other side.
 *
 * Run: npm run pages:doc-coverage
 */

const PAGES_ROOT = 'src/app/pages';
const DRIFT_MAP_PATH = 'docs/docs-drift-map.json';

/**
 * Page directories deliberately absent from the drift map, each with the reason.
 *
 * Empty today, and that is the point: after the sweep above, all 22 directories
 * resolve to an entry. A row here is a decision that a page's changes need no
 * doc update - not a way to make the lane pass.
 */
export const PAGE_DOC_COVERAGE_EXCLUSIONS = [];

function normalize(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\.\/+/u, '').trim();
}

/** Directory names directly under `src/app/pages/`. */
export function readPageDirectories(projectRoot) {
  return readdirSync(path.join(projectRoot, ...PAGES_ROOT.split('/')), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Every `src/app/pages/<name>/` prefix any drift-map entry claims, with its entry ids. */
export function readMappedPages(driftMap) {
  const mapped = new Map();

  for (const entry of driftMap?.entries ?? []) {
    for (const featurePath of entry?.featurePaths ?? []) {
      const normalized = normalize(featurePath);

      if (!normalized.startsWith(`${PAGES_ROOT}/`)) {
        continue;
      }

      const pageName = normalized.slice(PAGES_ROOT.length + 1).split('/')[0];

      if (!pageName) {
        continue;
      }

      const owners = mapped.get(pageName) ?? [];

      owners.push(entry.id);
      mapped.set(pageName, owners);
    }
  }

  return mapped;
}

export function inspectPageDocCoverage({
  pageDirectories,
  driftMap,
  exclusions = PAGE_DOC_COVERAGE_EXCLUSIONS,
}) {
  const pages = new Set(pageDirectories);
  const mapped = readMappedPages(driftMap);
  const excluded = new Map(exclusions.map((entry) => [entry.page, entry.reason]));
  const errors = [];

  if (pages.size === 0) {
    errors.push(`No page directories found under ${PAGES_ROOT}/ - the tree could not be read.`);
  }

  if ((driftMap?.entries ?? []).length === 0) {
    errors.push(`No entries found in ${DRIFT_MAP_PATH} - the drift map could not be read.`);
  }

  for (const page of pages) {
    const isMapped = mapped.has(page);
    const exclusionReason = excluded.get(page);

    if (isMapped && exclusionReason !== undefined) {
      errors.push(
        `Page "${page}" is both mapped in ${DRIFT_MAP_PATH} and listed as excluded. Remove one of the two.`,
      );
      continue;
    }

    if (!isMapped && exclusionReason === undefined) {
      errors.push(
        `Page "${PAGES_ROOT}/${page}/" has no entry in ${DRIFT_MAP_PATH}, so the docs drift guard can never ` +
          'fire for it. Add it to an existing entry or give it its own, or add it to ' +
          'PAGE_DOC_COVERAGE_EXCLUSIONS with a reason.',
      );
    }
  }

  for (const [page] of excluded) {
    if (!pages.has(page)) {
      errors.push(
        `PAGE_DOC_COVERAGE_EXCLUSIONS names "${page}", which is no longer a directory under ${PAGES_ROOT}/. Remove the entry.`,
      );
    }
  }

  for (const entry of exclusions) {
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 12) {
      errors.push(`PAGE_DOC_COVERAGE_EXCLUSIONS entry "${entry.page}" needs a real reason, not a placeholder.`);
    }
  }

  for (const [page, owners] of mapped) {
    if (!pages.has(page)) {
      errors.push(
        `${DRIFT_MAP_PATH} entry ${owners.join(', ')} claims "${PAGES_ROOT}/${page}/", which no longer exists.`,
      );
    }
  }

  return { pageCount: pages.size, mappedCount: mapped.size, excludedCount: excluded.size, errors };
}

export function formatPageDocCoverageResult(result) {
  if (result.errors.length > 0) {
    return result.errors.map((error) => `[pages:docs] ${error}`).join('\n');
  }

  return (
    `[pages:docs] ${result.pageCount} page director(ies): ` +
    `${result.mappedCount} mapped in ${DRIFT_MAP_PATH}, ${result.excludedCount} excluded on purpose.`
  );
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = inspectPageDocCoverage({
    pageDirectories: readPageDirectories(projectRoot),
    driftMap: JSON.parse(readFileSync(path.join(projectRoot, ...DRIFT_MAP_PATH.split('/')), 'utf8')),
  });
  const output = formatPageDocCoverageResult(result);

  if (result.errors.length > 0) {
    console.error(output);
    process.exitCode = 1;

    return;
  }

  console.log(output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

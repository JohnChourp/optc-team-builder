import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatPageDocCoverageResult,
  inspectPageDocCoverage,
  PAGE_DOC_COVERAGE_EXCLUSIONS,
  readMappedPages,
  readPageDirectories,
} from './check-page-doc-coverage.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const pageDirectories = readPageDirectories(projectRoot);
const driftMap = JSON.parse(
  readFileSync(path.join(projectRoot, 'docs', 'docs-drift-map.json'), 'utf8'),
);

/**
 * The mutation that matters here is not synthetic: it deletes the fix.
 *
 * Five real pages were unmapped before this guard existed, so the headline case
 * removes the two drift-map entries that mapped them and asserts the guard names
 * exactly those five, by name, in order. A guard that has only seen a passing
 * repository has not been tested.
 *
 * An earlier version read `main:docs/docs-drift-map.json` out of git instead.
 * That was a mistake with a short fuse: the moment the fix merged, `main` WAS
 * the fixed map, the case found nothing to report, and the lane went red on
 * `main` itself - a test that asserts the repository is broken stops being true
 * the moment somebody repairs it. Reconstructing the old state from the current
 * one has no such expiry.
 */
describe('page doc coverage', () => {
  it('accepts the repository as it stands', () => {
    const result = inspectPageDocCoverage({ pageDirectories, driftMap });

    expect(result.errors).toEqual([]);
    expect(result.pageCount).toBeGreaterThan(15);
    expect(formatPageDocCoverageResult(result)).toContain('mapped in docs/docs-drift-map.json');
  });

  it('resolves a nested feature path to its page directory', () => {
    const mapped = readMappedPages(driftMap);

    expect(mapped.get('faq')).toContain('player-faq');
    expect(mapped.get('home')).toContain('public-static-pages');
    expect(mapped.has('scripts')).toBe(false);
  });

  it('reports every page that was unmapped before this change', () => {
    const mapBeforeTheFix = {
      ...driftMap,
      entries: driftMap.entries.filter(
        (entry: { id: string }) => entry.id !== 'player-faq' && entry.id !== 'public-static-pages',
      ),
    };

    expect(mapBeforeTheFix.entries.length).toBe(driftMap.entries.length - 2);

    const result = inspectPageDocCoverage({ pageDirectories, driftMap: mapBeforeTheFix });
    const named = result.errors.map((error) => error.match(/"([^"]+)"/u)?.[1]).filter(Boolean);

    expect(named).toEqual([
      'src/app/pages/cookie-policy/',
      'src/app/pages/faq/',
      'src/app/pages/home/',
      'src/app/pages/privacy-policy/',
      'src/app/pages/terms-of-service/',
    ]);
  });

  it('goes red when a new page is added with no mapping', () => {
    const result = inspectPageDocCoverage({
      pageDirectories: [...pageDirectories, 'brand-new-page'],
      driftMap,
    });

    expect(result.errors.join('\n')).toContain('src/app/pages/brand-new-page/');
  });

  it('goes red on an exclusion for a page that no longer exists', () => {
    const result = inspectPageDocCoverage({
      pageDirectories,
      driftMap,
      exclusions: [{ page: 'deleted-page', reason: 'A page removed two releases ago.' }],
    });

    expect(result.errors.join('\n')).toContain('no longer a directory under src/app/pages/');
  });

  it('goes red when a page is both mapped and excluded', () => {
    const result = inspectPageDocCoverage({
      pageDirectories,
      driftMap,
      exclusions: [{ page: 'faq', reason: 'Contradicts the drift map on purpose.' }],
    });

    expect(result.errors.join('\n')).toContain('both mapped in docs/docs-drift-map.json');
  });

  it('goes red when the drift map claims a page directory that is gone', () => {
    const result = inspectPageDocCoverage({
      pageDirectories: pageDirectories.filter((page) => page !== 'faq'),
      driftMap,
    });

    expect(result.errors.join('\n')).toContain('which no longer exists');
  });

  it('rejects a placeholder reason', () => {
    const result = inspectPageDocCoverage({
      pageDirectories: [...pageDirectories, 'ghost'],
      driftMap,
      exclusions: [{ page: 'ghost', reason: 'n/a' }],
    });

    expect(result.errors.join('\n')).toContain('needs a real reason');
  });

  it('reports an unreadable tree instead of passing on an empty list', () => {
    const result = inspectPageDocCoverage({
      pageDirectories: [],
      driftMap: { entries: [] },
      exclusions: [],
    });

    expect(result.errors.join('\n')).toContain('No page directories found');
    expect(result.errors.join('\n')).toContain('No entries found');
  });

  it('starts with no exclusions, because every page is genuinely mapped', () => {
    expect(PAGE_DOC_COVERAGE_EXCLUSIONS).toEqual([]);
  });
});

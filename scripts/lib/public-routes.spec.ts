import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REGISTRY_PATH,
  loadPublicRoutes,
  parsePublicRoutes,
  publishedPaths,
} from './public-routes.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const registrySource = readFileSync(
  path.join(projectRoot, ...DEFAULT_REGISTRY_PATH.split('/')),
  'utf8',
);

/*
 * 869f12x57. This reader is what makes one TypeScript registry usable from four
 * plain-`.mjs` scripts, so it is the single point where the whole scheme can
 * fail silently: a parser that quietly returns [] would make every consumer
 * pass for the wrong reason, which is exactly the shape of the defect the
 * registry exists to end.
 */
describe('public route registry reader', () => {
  it('reads the registry as it stands', () => {
    const records = parsePublicRoutes(registrySource);

    expect(records.length).toBeGreaterThan(15);

    for (const record of records) {
      expect(record.routePath, 'every record names a router path').toBeTypeOf('string');
      expect(record.canonicalPath).toBeTypeOf('string');
      expect(record.title?.length).toBeGreaterThan(5);
      expect(record.description?.length).toBeGreaterThan(20);
      expect(Array.isArray(record.aliases)).toBe(true);
    }
  });

  it('keeps the FAQ, whose absence from four of five copies started this', () => {
    const faq = parsePublicRoutes(registrySource).find((record) => record.canonicalPath === 'faq');

    expect(faq?.routePath).toBe('tabs/faq');
    expect(faq?.aliases).toContain('tabs/faq');
  });

  it('publishes canonical paths and aliases together', () => {
    const records = parsePublicRoutes(registrySource);
    const published = publishedPaths(records);

    expect(published).toContain('faq');
    expect(published).toContain('tabs/faq');
    expect(published.length).toBeGreaterThan(records.length);
  });

  it('gives every canonical path exactly one record', () => {
    const canonicals = parsePublicRoutes(registrySource).map((record) => record.canonicalPath);

    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  it('never publishes one path twice, even across aliases', () => {
    const published = publishedPaths(parsePublicRoutes(registrySource));

    expect(new Set(published).size, 'two records would fight over one URL').toBe(published.length);
  });

  it('returns nothing for a file that is not the registry', () => {
    expect(parsePublicRoutes('export const SOMETHING_ELSE = [];')).toEqual([]);
  });

  it('throws rather than returning an empty list when the registry cannot be read', () => {
    /*
     * The difference that matters: `parsePublicRoutes` may legitimately return
     * [] for arbitrary source, but `loadPublicRoutes` is what the scripts call,
     * and an empty result there means every consumer silently checks nothing.
     */
    expect(() => loadPublicRoutes(path.join(projectRoot, 'scripts'))).toThrowError();
  });

  it('loads from the real project root', () => {
    expect(loadPublicRoutes(projectRoot).length).toBe(parsePublicRoutes(registrySource).length);
  });
});

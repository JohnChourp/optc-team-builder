import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadPublicRoutes } from './public-routes.mjs';
import { SEO_CONTENT_DATA_PATH, loadSeoContentPages, parseSeoContentPages } from './seo-content.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const dataSource = readFileSync(path.join(projectRoot, ...SEO_CONTENT_DATA_PATH.split('/')), 'utf8');

function page(title: string) {
  return `{ eyebrow: 'Guide', title: '${title}', summary: 'S.', sections: [{ title: 'A', copy: 'B' }], links: [{ label: 'L', route: '/r' }] }`;
}

/*
 * 869f13c5t. The static fallback of seven public pages is built from what this reader returns, and
 * the generator is plain `.mjs` with no type checking. So the one failure that matters is a silent
 * one - a record the reader drops or half-reads - and every test here is about refusing that.
 */
describe('seo content reader', () => {
  it('reads the data file as it stands', () => {
    const pages = parseSeoContentPages(dataSource);

    expect(Object.keys(pages)).toHaveLength(7);

    for (const [routePath, record] of Object.entries(pages)) {
      expect(record.title.length, `${routePath} has a heading`).toBeGreaterThan(5);
      expect(record.summary.length, `${routePath} has a summary`).toBeGreaterThan(40);
      expect(record.sections.length, `${routePath} has sections`).toBeGreaterThan(0);
      expect(record.links.length, `${routePath} has links`).toBeGreaterThan(0);

      for (const link of record.links) {
        expect(link.route, `${routePath} links inside the app`).toMatch(/^\//u);
      }
    }
  });

  it('holds a record for exactly the tool and guide pages the route registry publishes', () => {
    const published = loadPublicRoutes(projectRoot)
      .map((record) => record.canonicalPath)
      .filter((canonicalPath) => /^(?:tools|guides)\//u.test(canonicalPath ?? ''));

    expect(Object.keys(loadSeoContentPages(projectRoot)).sort()).toEqual(published.sort());
  });

  it('keeps every property it reads, in order, as plain values', () => {
    const pages = parseSeoContentPages(
      `export const SEO_CONTENT_PAGES: Readonly<Record<string, X>> = { 'guides/a': ${page('Alpha')}, "guides/b": ${page('Beta')} };`,
    );

    expect(pages).toEqual({
      'guides/a': {
        eyebrow: 'Guide',
        title: 'Alpha',
        summary: 'S.',
        sections: [{ title: 'A', copy: 'B' }],
        links: [{ label: 'L', route: '/r' }],
      },
      'guides/b': expect.objectContaining({ title: 'Beta' }),
    });
  });

  it('reads through `as const` and template literals without substitutions', () => {
    const pages = parseSeoContentPages(
      'export const SEO_CONTENT_PAGES = { a: { title: `Plain template` } } as const;',
    );

    expect(pages).toEqual({ a: { title: 'Plain template' } });
  });

  it.each([
    ['an identifier', 'const T = "x"; export const SEO_CONTENT_PAGES = { a: { title: T } };', /SEO_CONTENT_PAGES\.a\.title: expected a string/u],
    ['a template with a substitution', 'export const SEO_CONTENT_PAGES = { a: { title: `x${1}` } };', /SEO_CONTENT_PAGES\.a\.title: expected a string/u],
    ['a call', 'export const SEO_CONTENT_PAGES = { a: { sections: build() } };', /SEO_CONTENT_PAGES\.a\.sections: expected a string/u],
    ['a spread', 'const b = {}; export const SEO_CONTENT_PAGES = { a: { ...b } };', /SEO_CONTENT_PAGES\.a: only plain properties/u],
    ['a shorthand property', 'const title = "x"; export const SEO_CONTENT_PAGES = { a: { title } };', /SEO_CONTENT_PAGES\.a: only plain properties/u],
    ['a table that is not an object literal', 'export const SEO_CONTENT_PAGES = build();', /SEO_CONTENT_PAGES must be an object literal/u],
  ])('refuses %s rather than dropping it', (_label, source, message) => {
    expect(() => parseSeoContentPages(source)).toThrowError(message);
  });

  it('refuses a file with no table at all, instead of returning none', () => {
    expect(() => parseSeoContentPages('export const OTHER = {};', 'x.ts')).toThrowError(
      'x.ts: no SEO_CONTENT_PAGES declaration',
    );
  });
});

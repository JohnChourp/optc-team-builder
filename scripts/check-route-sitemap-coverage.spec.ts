import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatRouteSitemapCoverageResult,
  inspectRouteSitemapCoverage,
  readAppRoutes,
  readGeneratedRoutes,
  ROUTE_SITEMAP_EXCLUSIONS,
} from './check-route-sitemap-coverage.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const routesSource = readFileSync(path.join(projectRoot, 'src', 'app', 'app.routes.ts'), 'utf8');
const generatorSource = readFileSync(
  path.join(projectRoot, 'scripts', 'generate-seo-pages.mjs'),
  'utf8',
);

/**
 * The guard has to be proven against a BROKEN tree, not only a correct one.
 *
 * 869f12x4h's ground rule, and the reason it exists: a check that has only ever
 * seen a passing repository has not been tested. Each case below is the real
 * defect this guard was written for, or one of the ways it could rot into
 * always-green - a stale exclusion, a contradicting pair, a sitemap entry for a
 * page nothing serves.
 */
describe('route sitemap coverage', () => {
  it('accepts the repository as it stands', () => {
    const result = inspectRouteSitemapCoverage({ routesSource, generatorSource });

    expect(result.errors).toEqual([]);
    expect(result.routeCount).toBeGreaterThan(20);
    expect(formatRouteSitemapCoverageResult(result)).toContain('excluded on purpose');
  });

  it('reads every nested tabs child as a full path', () => {
    const routes = readAppRoutes(routesSource).map((route) => route.path);

    expect(routes).toContain('tabs/faq');
    expect(routes).toContain('tabs/captain-coverage');
    expect(routes).toContain('characters/:id/edit');
  });

  it('reads the generator paths and their aliases', () => {
    const { paths, aliases } = readGeneratedRoutes(generatorSource);

    expect(paths).toContain('faq');
    expect(aliases).toContain('tabs/faq');
  });

  it('goes red when the FAQ leaves the generator - the defect it was written for', () => {
    const withoutFaq = generatorSource.replace(
      /  \{\n    path: 'faq',[\s\S]*?\n  \},\n(?=  \{\n    path: 'privacy')/u,
      '',
    );

    expect(withoutFaq).not.toEqual(generatorSource);

    const result = inspectRouteSitemapCoverage({ routesSource, generatorSource: withoutFaq });

    expect(result.errors.join('\n')).toContain('"faq" is declared in app.routes.ts');
  });

  it('goes red when a new public route is added to the router alone', () => {
    const withNewRoute = routesSource.replace(
      "  {\n    path: 'privacy',\n    pathMatch: 'full',",
      "  {\n    path: 'brand-new-page',\n    pathMatch: 'full',\n    redirectTo: 'tabs/characters',\n  },\n  {\n    path: 'privacy',\n    pathMatch: 'full',",
    );

    expect(withNewRoute).not.toEqual(routesSource);

    const result = inspectRouteSitemapCoverage({ routesSource: withNewRoute, generatorSource });

    expect(result.errors.join('\n')).toContain('"brand-new-page"');
  });

  it('goes red on an exclusion for a route that no longer exists', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource,
      generatorSource,
      exclusions: [
        ...ROUTE_SITEMAP_EXCLUSIONS,
        { route: 'tabs/gone-forever', reason: 'A route that was deleted long ago.' },
      ],
    });

    expect(result.errors.join('\n')).toContain('no longer exists in app.routes.ts');
  });

  it('goes red when a route is both generated and excluded', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource,
      generatorSource,
      exclusions: [...ROUTE_SITEMAP_EXCLUSIONS, { route: 'faq', reason: 'Contradicts the generator.' }],
    });

    expect(result.errors.join('\n')).toContain('both generated into the sitemap and excluded');
  });

  it('goes red when the generator emits a path no router route serves', () => {
    const typo = generatorSource.replace("    path: 'faq',", "    path: 'faq-typo',");

    expect(typo).not.toEqual(generatorSource);

    const result = inspectRouteSitemapCoverage({ routesSource, generatorSource: typo });

    expect(result.errors.join('\n')).toContain('which no router route serves');
  });

  it('rejects a placeholder reason', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource,
      generatorSource,
      exclusions: ROUTE_SITEMAP_EXCLUSIONS.map((entry) =>
        entry.route === '**' ? { ...entry, reason: 'n/a' } : entry,
      ),
    });

    expect(result.errors.join('\n')).toContain('needs a real reason');
  });

  it('reports unreadable sources instead of passing on an empty list', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource: 'export const somethingElse = [];',
      generatorSource: 'const other = [];',
      exclusions: [],
    });

    expect(result.errors.join('\n')).toContain('No routes found in app.routes.ts');
    expect(result.errors.join('\n')).toContain('No publicRoutes found');
  });
});

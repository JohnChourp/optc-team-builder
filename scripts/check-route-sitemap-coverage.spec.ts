import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatRouteSitemapCoverageResult,
  inspectRouteSitemapCoverage,
  readAppRoutes,
  ROUTE_SITEMAP_EXCLUSIONS,
} from './check-route-sitemap-coverage.mjs';
import { loadPublicRoutes } from './lib/public-routes.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const routesSource = readFileSync(path.join(projectRoot, 'src', 'app', 'app.routes.ts'), 'utf8');
const publicRoutes = loadPublicRoutes(projectRoot);

/**
 * Proven against broken trees, not only the passing one.
 *
 * Each case is a real way the router and the public route registry can come
 * apart, and two of them actually happened: `/faq` published with no record
 * anywhere the sitemap could see (869f12x4k), and `/faq` published with no
 * `data.seo`, which made the app serve `noindex,follow` and a home-page
 * canonical while the sitemap advertised it (869f12x57, measured in production).
 */
describe('route sitemap coverage', () => {
  it('accepts the repository as it stands', () => {
    const result = inspectRouteSitemapCoverage({ routesSource, publicRoutes });

    expect(result.errors).toEqual([]);
    expect(result.routeCount).toBeGreaterThan(20);
    expect(result.registeredCount).toBe(publicRoutes.length);
    expect(formatRouteSitemapCoverageResult(result)).toContain('public route registry');
  });

  it('reads every nested tabs child as a full path', () => {
    const routes = readAppRoutes(routesSource).map((route) => route.path);

    expect(routes).toContain('tabs/faq');
    expect(routes).toContain('tabs/captain-coverage');
    expect(routes).toContain('characters/:id/edit');
  });

  it('reads which record each route asks the registry for', () => {
    const faq = readAppRoutes(routesSource).find((route) => route.path === 'tabs/faq');
    const settings = readAppRoutes(routesSource).find((route) => route.path === 'tabs/settings');

    expect(faq?.seoLookup).toBe('tabs/faq');
    expect(settings?.seoLookup, 'a private screen asks for nothing').toBeNull();
  });

  it('goes red when a published route leaves the registry - the first defect', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource,
      publicRoutes: publicRoutes.filter((record) => record.routePath !== 'tabs/faq'),
    });

    expect(result.errors.join('\n')).toContain('"tabs/faq" is declared in app.routes.ts');
  });

  it('goes red when a published route has no data.seo - the second defect', () => {
    const withoutFaqSeo = routesSource.replace("              seo: publicRouteSeo('tabs/faq'),\n", '');

    expect(withoutFaqSeo).not.toEqual(routesSource);

    const result = inspectRouteSitemapCoverage({ routesSource: withoutFaqSeo, publicRoutes });

    expect(result.errors.join('\n')).toContain('advertised and then disowned');
  });

  it("goes red when a route asks for another route's SEO record", () => {
    const crossed = routesSource.replace("publicRouteSeo('tabs/faq')", "publicRouteSeo('tabs/privacy')");

    expect(crossed).not.toEqual(routesSource);

    const result = inspectRouteSitemapCoverage({ routesSource: crossed, publicRoutes });

    expect(result.errors.join('\n')).toContain('which is a different');
  });

  it('goes red when a new public route is added to the router alone', () => {
    const withNewRoute = routesSource.replace(
      "  {\n    path: 'privacy',\n    pathMatch: 'full',",
      "  {\n    path: 'brand-new-page',\n    pathMatch: 'full',\n    redirectTo: 'tabs/characters',\n  },\n  {\n    path: 'privacy',\n    pathMatch: 'full',",
    );

    expect(withNewRoute).not.toEqual(routesSource);

    const result = inspectRouteSitemapCoverage({ routesSource: withNewRoute, publicRoutes });

    expect(result.errors.join('\n')).toContain('"brand-new-page"');
  });

  it('goes red when the registry describes a page the app does not serve', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource,
      publicRoutes: [
        ...publicRoutes,
        {
          routePath: 'tabs/ghost',
          canonicalPath: 'ghost',
          title: 'Ghost',
          description: 'A page that does not exist.',
          aliases: [],
        },
      ],
    });

    expect(result.errors.join('\n')).toContain('which app.routes.ts does not declare');
  });

  it('goes red on an exclusion for a route that no longer exists', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource,
      publicRoutes,
      exclusions: [
        ...ROUTE_SITEMAP_EXCLUSIONS,
        { route: 'tabs/gone-forever', reason: 'A route that was deleted long ago.' },
      ],
    });

    expect(result.errors.join('\n')).toContain('no longer exists in app.routes.ts');
  });

  it('goes red when a route is both registered and excluded', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource,
      publicRoutes,
      exclusions: [...ROUTE_SITEMAP_EXCLUSIONS, { route: 'faq', reason: 'Contradicts the registry.' }],
    });

    expect(result.errors.join('\n')).toContain('both in the public route registry and excluded');
  });

  it('rejects a placeholder reason', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource,
      publicRoutes,
      exclusions: ROUTE_SITEMAP_EXCLUSIONS.map((entry) =>
        entry.route === '**' ? { ...entry, reason: 'n/a' } : entry,
      ),
    });

    expect(result.errors.join('\n')).toContain('needs a real reason');
  });

  it('reports unreadable sources instead of passing on an empty list', () => {
    const result = inspectRouteSitemapCoverage({
      routesSource: 'export const somethingElse = [];',
      publicRoutes: [],
      exclusions: [],
    });

    expect(result.errors.join('\n')).toContain('No routes found in app.routes.ts');
    expect(result.errors.join('\n')).toContain('No records found in the public route registry');
  });
});

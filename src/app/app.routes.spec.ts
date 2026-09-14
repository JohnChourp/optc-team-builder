import '@angular/compiler';
import { type Route } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { PUBLIC_ROUTES, publicRouteSeo } from './core/data/public-routes.data';
import { routes } from './app.routes';

describe('app routes', () => {
  it('registers the root homepage inside the drawer shell without redirecting to characters', () => {
    const homeShellRoute = routes.find((route) => route.path === '');
    const homeRoute = homeShellRoute?.children?.find((route) => route.path === '');
    const seo = homeRoute?.data?.['seo'] as Record<string, unknown> | undefined;

    expect(homeShellRoute?.loadComponent).toBeTypeOf('function');
    expect(homeRoute).toBeDefined();
    expect(homeRoute?.redirectTo).toBeUndefined();
    expect(homeRoute?.loadComponent).toBeTypeOf('function');
    expect(seo).toEqual(publicRouteSeo(''));
  });

  it('redirects the tabs shell root to characters for compatibility', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const tabsRootRoute = tabsRoute?.children?.find((route) => route.path === '');

    expect(tabsRootRoute?.redirectTo).toBe('characters');
    expect(tabsRootRoute?.pathMatch).toBe('full');
  });

  it('registers the saved teams tab route', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const savedTeamsRoute = tabsRoute?.children?.find((route) => route.path === 'saved-teams');

    expect(savedTeamsRoute).toBeDefined();
    expect(savedTeamsRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers the saved Rumble teams tab route', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const savedRumbleTeamsRoute = tabsRoute?.children?.find(
      (route) => route.path === 'saved-rumble-teams',
    );

    expect(savedRumbleTeamsRoute).toBeDefined();
    expect(savedRumbleTeamsRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers the character boxes route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const characterBoxesRoute = tabsRoute?.children?.find(
      (route) => route.path === 'character-boxes',
    );

    expect(characterBoxesRoute).toBeDefined();
    expect(characterBoxesRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers the crew forge route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const crewForgeRoute = tabsRoute?.children?.find((route) => route.path === 'crew-forge');

    expect(crewForgeRoute).toBeDefined();
    expect(crewForgeRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers the Auto Team Rumble Builder route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const rumbleRoute = tabsRoute?.children?.find(
      (route) => route.path === 'auto-team-builder-rumble',
    );
    const seo = rumbleRoute?.data?.['seo'] as Record<string, unknown> | undefined;

    expect(rumbleRoute).toBeDefined();
    expect(rumbleRoute?.loadComponent).toBeTypeOf('function');
    expect(seo?.['title']).toBe('Auto Team Rumble Builder | OPTC Team Builder');
  });

  it('registers the Manual Team Builder route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const manualTeamBuilderRoute = tabsRoute?.children?.find(
      (route) => route.path === 'manual-team-builder',
    );
    const seo = manualTeamBuilderRoute?.data?.['seo'] as Record<string, unknown> | undefined;

    expect(manualTeamBuilderRoute).toBeDefined();
    expect(manualTeamBuilderRoute?.loadComponent).toBeTypeOf('function');
    expect(seo?.['title']).toBe('Manual Team Builder | OPTC Team Builder');
    expect(seo?.['canonicalPath']).toBe('tabs/manual-team-builder');
  });

  it('registers the Captain Coverage route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const coverageRoute = tabsRoute?.children?.find((route) => route.path === 'captain-coverage');
    const seo = coverageRoute?.data?.['seo'] as Record<string, unknown> | undefined;

    expect(coverageRoute).toBeDefined();
    expect(coverageRoute?.loadComponent).toBeTypeOf('function');
    expect(seo?.['title']).toBe('Captain Coverage | OPTC Team Builder');
    expect(seo?.['description']).toBe(
      'Pick an OPTC Captain and see which characters that Captain Ability boosts, with the full catalogue still listed and only your own filters narrowing it.',
    );
    expect(seo?.['canonicalPath']).toBe('tabs/captain-coverage');
  });

  it('registers the Rumble characters route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const rumbleCharactersRoute = tabsRoute?.children?.find(
      (route) => route.path === 'rumble-characters',
    );

    expect(rumbleCharactersRoute).toBeDefined();
    expect(rumbleCharactersRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers the saved enemies route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const savedEnemiesRoute = tabsRoute?.children?.find((route) => route.path === 'saved-enemies');

    expect(savedEnemiesRoute).toBeDefined();
    expect(savedEnemiesRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers the account route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const accountRoute = tabsRoute?.children?.find((route) => route.path === 'account');
    const seo = accountRoute?.data?.['seo'] as Record<string, unknown> | undefined;

    expect(accountRoute).toBeDefined();
    expect(accountRoute?.loadComponent).toBeTypeOf('function');
    expect(seo?.['canonicalPath']).toBe('tabs/account');
  });

  it('redirects the legacy Drive sync route to account', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const driveSyncRoute = tabsRoute?.children?.find((route) => route.path === 'drive-sync');

    expect(driveSyncRoute?.redirectTo).toBe('account');
    expect(driveSyncRoute?.pathMatch).toBe('full');
    expect(driveSyncRoute?.loadComponent).toBeUndefined();
  });

  it('redirects the legacy collection tab route to saved teams', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const collectionRoute = tabsRoute?.children?.find((route) => route.path === 'collection');

    expect(collectionRoute?.redirectTo).toBe('saved-teams');
    expect(collectionRoute?.pathMatch).toBe('full');
  });

  it('registers the privacy policy route inside the tabs shell', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const privacyRoute = tabsRoute?.children?.find((route) => route.path === 'privacy');

    expect(privacyRoute).toBeDefined();
    expect(privacyRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers the FAQ route inside the tabs shell', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const faqRoute = tabsRoute?.children?.find((route) => route.path === 'faq');

    expect(faqRoute).toBeDefined();
    expect(faqRoute?.loadComponent).toBeTypeOf('function');
  });

  it('redirects the short /faq link into the tabs shell', () => {
    const faqRoute = routes.find((route) => route.path === 'faq');

    expect(faqRoute?.redirectTo).toBe('tabs/faq');
    expect(faqRoute?.pathMatch).toBe('full');
  });

  /*
   * 869f12x57. These used to restate the public route list - two hand-written
   * arrays, the fourth and fifth copies of it. `/faq` reached the router and
   * none of the copies, which is how it shipped into the app, out of the
   * sitemap, and out of this spec at the same time.
   *
   * So the spec now walks the registry. That makes the per-route assertions
   * partly tautological on purpose: the strings are the registry's to own, and
   * pinning them a second time here is exactly the duplication being removed.
   * What is NOT tautological is the wiring - that each registered route exists
   * in the router at all, and that its `data.seo` is the record for ITS OWN
   * path rather than a neighbour's.
   */
  it('gives every registered public route its own SEO data', () => {
    expect(PUBLIC_ROUTES.length).toBeGreaterThan(15);

    for (const record of PUBLIC_ROUTES) {
      const route = findRouteByFullPath(routes, record.routePath);
      const seo = route?.data?.['seo'] as Record<string, unknown> | undefined;

      expect(route, `router declares ${record.routePath}`).toBeDefined();
      expect(seo, `${record.routePath} carries data.seo`).toBeDefined();
      expect(seo?.['canonicalPath'], `${record.routePath} publishes at its own canonical`).toBe(
        record.canonicalPath,
      );
      expect(seo?.['title']).toBe(record.title);
      expect(seo?.['description']).toBe(record.description);
    }
  });

  it('keeps the home page the anchor of the registry', () => {
    /*
     * One real string is still pinned, and deliberately: every assertion above
     * reads the registry, so all of them would pass just as well against an
     * emptied or wholly rewritten one. This is the canary that the registry
     * still describes THIS site.
     */
    expect(publicRouteSeo('')).toEqual({
      title: 'OPTC Team Builder | One Piece Treasure Cruise Tools',
      description: expect.stringContaining('Plan OPTC crews'),
      canonicalPath: '',
    });
  });

  it('throws rather than defaulting when a route is not registered', () => {
    /*
     * A silent default here would produce a route with no `data.seo`, which the
     * app serves as `noindex,follow` with a home-page canonical - the exact
     * defect that took a production measurement to find.
     */
    expect(() => publicRouteSeo('tabs/settings')).toThrowError(/No public route record/u);
  });

  it('registers public SEO content routes for tools and guides', () => {
    const contentPaths = PUBLIC_ROUTES.map((record) => record.routePath).filter(
      (routePath) => routePath.startsWith('tools/') || routePath.startsWith('guides/'),
    );

    expect(contentPaths.length).toBeGreaterThan(5);

    for (const routePath of contentPaths) {
      const route = findRouteByPath(routes, routePath);
      const content = route?.data?.['content'] as Record<string, unknown> | undefined;

      expect(route?.loadComponent).toBeTypeOf('function');
      expect(content?.['title'], `${routePath} has in-page content`).toBeTypeOf('string');
    }
  });

  it('does not register the removed standalone team-builder route', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const teamBuilderRoute = tabsRoute?.children?.find((route) => route.path === 'team-builder');

    expect(teamBuilderRoute).toBeUndefined();
  });

  it('registers the cookie policy route inside the tabs shell', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const cookieRoute = tabsRoute?.children?.find((route) => route.path === 'cookies');

    expect(cookieRoute).toBeDefined();
    expect(cookieRoute?.loadComponent).toBeTypeOf('function');
  });

  it('registers the terms of service route inside the tabs shell', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const termsRoute = tabsRoute?.children?.find((route) => route.path === 'terms');

    expect(termsRoute).toBeDefined();
    expect(termsRoute?.loadComponent).toBeTypeOf('function');
  });

  it('redirects the legacy privacy, cookie, and terms routes into tabs', () => {
    const privacyRoute = routes.find((route) => route.path === 'privacy');
    const cookieRoute = routes.find((route) => route.path === 'cookies');
    const termsRoute = routes.find((route) => route.path === 'terms');

    expect(privacyRoute?.redirectTo).toBe('tabs/privacy');
    expect(privacyRoute?.pathMatch).toBe('full');
    expect(cookieRoute?.redirectTo).toBe('tabs/cookies');
    expect(cookieRoute?.pathMatch).toBe('full');
    expect(termsRoute?.redirectTo).toBe('tabs/terms');
    expect(termsRoute?.pathMatch).toBe('full');
  });
});

/**
 * Resolve a route by its FULL path, joining parents the way the router does.
 *
 * `findRouteByPath` matches on a route's own `path` segment, so it returns the
 * drawer shell for `''` rather than the home page inside it, and it could not
 * tell `tabs/faq` from a hypothetical top-level `faq` component. The registry
 * records full paths, so it needs the full-path resolver.
 */
function findRouteByFullPath(
  routeList: readonly Route[],
  fullPath: string,
  parentPath = '',
): Route | undefined {
  for (const route of routeList) {
    const routePath = [parentPath, route.path ?? ''].filter((part) => part !== '').join('/');

    if (routePath === fullPath && route.data?.['seo']) {
      return route;
    }

    const childRoute = route.children
      ? findRouteByFullPath(route.children, fullPath, routePath)
      : undefined;

    if (childRoute) {
      return childRoute;
    }
  }

  return undefined;
}

function findRouteByPath(routeList: readonly Route[], path: string): Route | undefined {
  for (const route of routeList) {
    if (route.path === path) {
      return route;
    }

    const childRoute = route.children ? findRouteByPath(route.children, path) : undefined;

    if (childRoute) {
      return childRoute;
    }
  }

  return undefined;
}

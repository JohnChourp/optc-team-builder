import '@angular/compiler';
import { type Route } from '@angular/router';
import { describe, expect, it } from 'vitest';

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
    expect(seo?.['title']).toBe('OPTC Team Builder | One Piece Treasure Cruise Tools');
    expect(seo?.['description']).toBeTypeOf('string');
    expect(seo?.['canonicalPath']).toBe('');
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

  it('registers the Drive sync route inside tabs', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const driveSyncRoute = tabsRoute?.children?.find((route) => route.path === 'drive-sync');
    const seo = driveSyncRoute?.data?.['seo'] as Record<string, unknown> | undefined;

    expect(driveSyncRoute).toBeDefined();
    expect(driveSyncRoute?.loadComponent).toBeTypeOf('function');
    expect(seo?.['canonicalPath']).toBe('tabs/drive-sync');
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

  it('adds SEO route data for public indexable tab routes', () => {
    const tabsRoute = findRouteByPath(routes, 'tabs');
    const publicRoutePaths = [
      'characters',
      'auto-team-builder',
      'manual-team-builder',
      'captain-coverage',
      'auto-team-builder-rumble',
      'rumble-characters',
      'crew-forge',
    ];

    for (const path of publicRoutePaths) {
      const route = tabsRoute?.children?.find((childRoute) => childRoute.path === path);
      const seo = route?.data?.['seo'] as Record<string, unknown> | undefined;

      expect(seo?.['title']).toBeTypeOf('string');
      expect(seo?.['description']).toBeTypeOf('string');
      expect(seo?.['canonicalPath']).toBe(`tabs/${path}`);
    }
  });

  it('registers public SEO content routes for tools and guides', () => {
    const publicContentPaths = [
      'tools/optc-team-builder',
      'tools/optc-auto-team-builder',
      'tools/optc-rumble-team-builder',
      'tools/optc-character-database',
      'guides/how-to-build-an-optc-team',
      'guides/optc-pirate-rumble-team-building',
    ];

    for (const path of publicContentPaths) {
      const route = findRouteByPath(routes, path);
      const seo = route?.data?.['seo'] as Record<string, unknown> | undefined;
      const content = route?.data?.['content'] as Record<string, unknown> | undefined;

      expect(route?.loadComponent).toBeTypeOf('function');
      expect(seo?.['title']).toBeTypeOf('string');
      expect(seo?.['description']).toBeTypeOf('string');
      expect(seo?.['canonicalPath']).toBe(path);
      expect(content?.['title']).toBeTypeOf('string');
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

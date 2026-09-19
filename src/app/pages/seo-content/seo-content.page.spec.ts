import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, type Route, type Routes } from '@angular/router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { routes } from '../../app.routes';
import { SEO_CONTENT_PAGES } from './seo-content.data';
import { SeoContentPage } from './seo-content.page';

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
}));
vi.mock('@ionic/angular/ion-button', () => ({
  IonButton: class {},
}));
vi.mock('@ionic/angular/ion-buttons', () => ({
  IonButtons: class {},
}));
vi.mock('@ionic/angular/ion-content', () => ({
  IonContent: class {},
}));
vi.mock('@ionic/angular/ion-header', () => ({
  IonHeader: class {},
}));
vi.mock('@ionic/angular/ion-menu-button', () => ({
  IonMenuButton: class {},
}));
vi.mock('@ionic/angular/ion-title', () => ({
  IonTitle: class {},
}));
vi.mock('@ionic/angular/ion-toolbar', () => ({
  IonToolbar: class {},
}));

const source = readFileSync(resolve(process.cwd(), 'src/app/pages/seo-content/seo-content.page.ts'), 'utf8');
const template = readFileSync(resolve(process.cwd(), 'src/app/pages/seo-content/seo-content.page.html'), 'utf8');

/*
 * 869f13c6b. The tool and guide pages are English by decision (869dwcbb8), while the app sets
 * <html lang="el"> when a reader picks Greek - so this page's English copy was declared Greek. It
 * declares its own language now; these pin that, and the fact that makes the declaration true.
 */
describe('SeoContentPage language', () => {
  it('declares its content English whatever language the app is in', () => {
    expect(source).toMatch(/host:\s*\{\s*lang:\s*'en'\s*\}/u);
  });

  it('is still untranslated, which is what makes lang="en" true', () => {
    // Translating this page means removing the host declaration above, or it lies the other way.
    expect(template).not.toMatch(/transloco|\bt\(/u);
  });
});

function createPage(routeConfig: Route | null): SeoContentPage {
  const injector = Injector.create({
    providers: [
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { routeConfig, data: routeConfig?.data ?? {} } },
      },
    ],
  });

  return runInInjectionContext(injector, () => new SeoContentPage());
}

function seoContentRoutes(table: Routes): Route[] {
  return table.flatMap((route) => [
    ...(route.path !== undefined && route.path in SEO_CONTENT_PAGES ? [route] : []),
    ...seoContentRoutes(route.children ?? []),
  ]);
}

/*
 * 869f13c5t. The page and the static fallback read the same record, keyed by the path the route is
 * served at. These build the page against the real route table, so a route and a record that stop
 * agreeing fail here rather than rendering the fallback text on a public page.
 */
describe('SeoContentPage content', () => {
  const served = seoContentRoutes(routes);

  it('is served at every path that has a record, once each', () => {
    expect(served.map((route) => route.path).sort()).toEqual(Object.keys(SEO_CONTENT_PAGES).sort());
  });

  it.each(Object.keys(SEO_CONTENT_PAGES))('renders the record for %s', (path) => {
    const route = served.find((candidate) => candidate.path === path) ?? null;

    expect(createPage(route).page).toBe(SEO_CONTENT_PAGES[path]);
  });

  it('gives the seven pages seven different records', () => {
    const pages = served.map((route) => createPage(route).page);

    expect(new Set(pages).size).toBe(served.length);
  });

  it('falls back to a generic page, never an empty one, for a path it has no record for', () => {
    const page = createPage({ path: 'tools/not-a-page' }).page;

    expect(Object.values(SEO_CONTENT_PAGES)).not.toContain(page);
    expect(page.title).toBe('OPTC Team Builder');
    expect(page.links.length).toBeGreaterThan(0);
    expect(createPage(null).page).toEqual(page);
  });
});

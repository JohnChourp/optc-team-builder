import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';

import { NavigationEnd } from '@angular/router';

import { routes } from './app.routes';
import { type AnalyticsConsentState } from './core/services/analytics-consent.service';

let routerStub: {
  config: typeof routes;
  events: Subject<unknown>;
  navigated: boolean;
  url: string;
};
let titleStub: {
  setTitle: ReturnType<typeof vi.fn>;
};
let metaStub: {
  updateTag: ReturnType<typeof vi.fn>;
};
let analyticsConsentStub: {
  accept: ReturnType<typeof vi.fn>;
  consent: ReturnType<typeof signal>;
  reject: ReturnType<typeof vi.fn>;
};
let analyticsStub: {
  trackPageView: ReturnType<typeof vi.fn>;
};
let toolbarBackNavigationStub: {
  recordNavigation: ReturnType<typeof vi.fn>;
};

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn().mockResolvedValue({
      version: '9.9.9',
    }),
  },
}));

vi.mock('@ionic/angular/standalone', () => ({
  IonApp: class {},
  IonButton: class {},
  IonRouterOutlet: class {},
}));

vi.mock('@jsverse/transloco', () => ({
  TranslocoPipe: class {},
}));

vi.mock('@angular/core/rxjs-interop', () => ({
  takeUntilDestroyed: () => (source: unknown) => source,
}));

vi.mock('@angular/core', async () => {
  const actual = await vi.importActual<typeof import('@angular/core')>('@angular/core');

  return {
    ...actual,
    inject: (token: { name?: string }) => {
      switch (token.name) {
        case 'DestroyRef':
          return {};
        case 'Router':
          return routerStub;
        case 'Title':
          return titleStub;
        case 'Meta':
          return metaStub;
        case 'AnalyticsConsentService':
          return analyticsConsentStub;
        case 'GoogleAnalyticsService':
          return analyticsStub;
        case 'ToolbarBackNavigationService':
          return toolbarBackNavigationStub;
        default:
          throw new Error(`Unexpected inject token: ${token.name ?? 'unknown'}`);
      }
    },
  };
});

describe('AppComponent', () => {
  beforeEach(() => {
    routerStub = {
      config: routes,
      url: '/tabs/characters',
      navigated: false,
      events: new Subject<unknown>(),
    };
    titleStub = {
      setTitle: vi.fn(),
    };
    metaStub = {
      updateTag: vi.fn(),
    };
    analyticsConsentStub = createAnalyticsConsentStub('unknown');
    analyticsStub = {
      trackPageView: vi.fn(),
    };
    toolbarBackNavigationStub = {
      recordNavigation: vi.fn(),
    };
  });

  afterEach(() => {
    routerStub.events.complete();
    vi.clearAllMocks();
  });

  it('renders the analytics consent banner actions in the template', () => {
    const template = readFileSync(resolve(process.cwd(), 'src/app/app.component.ts'), 'utf8');

    expect(template).toContain("'analyticsConsent.banner.title' | transloco");
    expect(template).toContain('(click)="acceptAnalyticsConsent()"');
    expect(template).toContain('(click)="rejectAnalyticsConsent()"');
    expect(template).toContain('[routerLink]="[\'/tabs/privacy\']"');
    expect(template).toContain('[routerLink]="[\'/tabs/cookies\']"');
    expect(template).toContain('[routerLink]="[\'/tabs/terms\']"');
    expect(template).toContain("'legalNav.privacy' | transloco");
    expect(template).toContain("'legalNav.cookies' | transloco");
    expect(template).toContain("'legalNav.terms' | transloco");
  });

  it('shows the banner while consent is unknown and hides it after acceptance', async () => {
    const { AppComponent } = await import('./app.component');
    const component = new AppComponent();

    expect(component.showAnalyticsConsentBanner()).toBe(true);

    await component.acceptAnalyticsConsent();

    expect(component.showAnalyticsConsentBanner()).toBe(false);
    expect(analyticsConsentStub.accept).toHaveBeenCalledOnce();
    expect(analyticsStub.trackPageView).toHaveBeenCalledWith('/tabs/characters');
  });

  it('tracks navigation events only when consent is accepted', async () => {
    analyticsConsentStub = createAnalyticsConsentStub('accepted');
    const { AppComponent } = await import('./app.component');
    new AppComponent();

    routerStub.events.next(new NavigationEnd(1, '/tabs/settings', '/tabs/settings'));
    expect(analyticsStub.trackPageView).toHaveBeenCalledWith('/tabs/settings');
    expect(toolbarBackNavigationStub.recordNavigation).toHaveBeenCalledWith('/tabs/settings');
    expect(titleStub.setTitle).toHaveBeenCalledWith(
      'OPTC Team Builder | One Piece Treasure Cruise Tools',
    );
    expect(metaStub.updateTag).toHaveBeenCalledWith({ name: 'robots', content: 'noindex,follow' });

    analyticsStub.trackPageView.mockClear();
    analyticsConsentStub = createAnalyticsConsentStub('rejected');
    routerStub = {
      config: routes,
      url: '/tabs/saved-teams',
      navigated: false,
      events: new Subject<unknown>(),
    };
    const anotherComponent = new AppComponent();

    routerStub.events.next(new NavigationEnd(2, '/tabs/saved-teams', '/tabs/saved-teams'));

    expect(analyticsStub.trackPageView).not.toHaveBeenCalled();

    await anotherComponent.rejectAnalyticsConsent();
    expect(analyticsConsentStub.reject).toHaveBeenCalledOnce();
  });

  it('tracks the current route on startup when consent was already accepted', async () => {
    analyticsConsentStub = createAnalyticsConsentStub('accepted');
    routerStub = {
      config: routes,
      url: '/tabs/auto-team-builder',
      navigated: true,
      events: new Subject<unknown>(),
    };
    const { AppComponent } = await import('./app.component');

    new AppComponent();

    expect(analyticsStub.trackPageView).toHaveBeenCalledWith('/tabs/auto-team-builder');
    expect(toolbarBackNavigationStub.recordNavigation).toHaveBeenCalledWith(
      '/tabs/auto-team-builder',
    );
    expect(titleStub.setTitle).toHaveBeenCalledWith('Auto Team Builder | OPTC Team Builder');
    expect(metaStub.updateTag).toHaveBeenCalledWith({
      property: 'og:url',
      content: 'https://optcteambuilder.com/tabs/auto-team-builder/',
    });
  });

  it('indexes the root homepage with the canonical site URL', async () => {
    routerStub = {
      config: routes,
      url: '/',
      navigated: true,
      events: new Subject<unknown>(),
    };
    const { AppComponent } = await import('./app.component');

    new AppComponent();

    expect(titleStub.setTitle).toHaveBeenCalledWith(
      'OPTC Team Builder | One Piece Treasure Cruise Tools',
    );
    expect(metaStub.updateTag).toHaveBeenCalledWith({
      name: 'robots',
      content: 'index,follow',
    });
    expect(metaStub.updateTag).toHaveBeenCalledWith({
      property: 'og:url',
      content: 'https://optcteambuilder.com/',
    });
  });

  it('indexes public tool routes with their canonical URLs', async () => {
    const publicRoutes = [
      {
        url: '/tabs/characters',
        title: 'OPTC Characters | OPTC Team Builder',
        canonicalUrl: 'https://optcteambuilder.com/tabs/characters/',
      },
      {
        url: '/tabs/auto-team-builder',
        title: 'Auto Team Builder | OPTC Team Builder',
        canonicalUrl: 'https://optcteambuilder.com/tabs/auto-team-builder/',
      },
      {
        url: '/tabs/captain-coverage',
        title: 'Captain Coverage | OPTC Team Builder',
        canonicalUrl: 'https://optcteambuilder.com/tabs/captain-coverage/',
      },
      {
        url: '/tabs/auto-team-builder-rumble',
        title: 'Auto Team Rumble Builder | OPTC Team Builder',
        canonicalUrl:
          'https://optcteambuilder.com/tabs/auto-team-builder-rumble/',
      },
      {
        url: '/tabs/rumble-characters',
        title: 'Rumble Characters | OPTC Team Builder',
        canonicalUrl: 'https://optcteambuilder.com/tabs/rumble-characters/',
      },
      {
        url: '/tabs/crew-forge',
        title: 'Crew Forge | OPTC Team Builder',
        canonicalUrl: 'https://optcteambuilder.com/tabs/crew-forge/',
      },
    ];
    const { AppComponent } = await import('./app.component');

    for (const route of publicRoutes) {
      titleStub.setTitle.mockClear();
      metaStub.updateTag.mockClear();
      routerStub = {
        config: routes,
        url: route.url,
        navigated: true,
        events: new Subject<unknown>(),
      };

      new AppComponent();

      expect(titleStub.setTitle).toHaveBeenCalledWith(route.title);
      expect(metaStub.updateTag).toHaveBeenCalledWith({
        name: 'robots',
        content: 'index,follow',
      });
      expect(metaStub.updateTag).toHaveBeenCalledWith({
        property: 'og:url',
        content: route.canonicalUrl,
      });
      routerStub.events.complete();
    }
  });

  it('keeps generated character detail routes indexable at runtime', async () => {
    routerStub = {
      config: routes,
      url: '/characters/1',
      navigated: true,
      events: new Subject<unknown>(),
    };
    const { AppComponent } = await import('./app.component');

    new AppComponent();

    expect(titleStub.setTitle).toHaveBeenCalledWith('OPTC Character #1 | OPTC Team Builder');
    expect(metaStub.updateTag).toHaveBeenCalledWith({
      name: 'robots',
      content: 'index,follow',
    });
    expect(metaStub.updateTag).toHaveBeenCalledWith({
      property: 'og:url',
      content: 'https://optcteambuilder.com/characters/1/',
    });
  });

  it('keeps private utility, edit, and unknown routes out of the index', async () => {
    const nonIndexableRoutes = [
      '/tabs/settings',
      '/tabs/saved-teams',
      '/characters/1/edit',
      '/nope',
    ];
    const { AppComponent } = await import('./app.component');

    for (const url of nonIndexableRoutes) {
      metaStub.updateTag.mockClear();
      routerStub = {
        config: routes,
        url,
        navigated: true,
        events: new Subject<unknown>(),
      };

      new AppComponent();

      expect(metaStub.updateTag).toHaveBeenCalledWith({
        name: 'robots',
        content: 'noindex,follow',
      });
      routerStub.events.complete();
    }
  });
});

function createAnalyticsConsentStub(initialConsent: AnalyticsConsentState) {
  const consent = signal<AnalyticsConsentState>(initialConsent);

  return {
    consent,
    accept: vi.fn().mockImplementation(async () => {
      consent.set('accepted');
    }),
    reject: vi.fn().mockImplementation(async () => {
      consent.set('rejected');
    }),
  };
}

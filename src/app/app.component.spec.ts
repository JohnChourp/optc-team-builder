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
let characterCatalogCacheStub: {
  kickoffPreload: ReturnType<typeof vi.fn>;
};
let appUpdateStub: {
  updateAvailable: ReturnType<typeof signal>;
  init: ReturnType<typeof vi.fn>;
  applyUpdate: ReturnType<typeof vi.fn>;
  snooze: ReturnType<typeof vi.fn>;
};
let nativeUpdateStub: {
  availableUpdate: ReturnType<typeof signal>;
  init: ReturnType<typeof vi.fn>;
  check: ReturnType<typeof vi.fn>;
  snooze: ReturnType<typeof vi.fn>;
  openReleasePage: ReturnType<typeof vi.fn>;
};
let alertControllerStub: {
  create: ReturnType<typeof vi.fn>;
};
let i18nStub: {
  translate: ReturnType<typeof vi.fn>;
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
  IonIcon: class {},
  IonRouterOutlet: class {},
  AlertController: class AlertController {},
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
      const tokenName = token.name?.replace(/^_+/u, '');

      switch (tokenName) {
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
        case 'CharacterCatalogCacheService':
          return characterCatalogCacheStub;
        case 'AppUpdateService':
          return appUpdateStub;
        case 'NativeUpdateService':
          return nativeUpdateStub;
        case 'AlertController':
          return alertControllerStub;
        case 'AppI18nService':
          return i18nStub;
        default:
          throw new Error(`Unexpected inject token: ${token.name ?? 'unknown'}`);
      }
    },
    afterNextRender: vi.fn(),
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
    characterCatalogCacheStub = {
      kickoffPreload: vi.fn(),
    };
    appUpdateStub = {
      updateAvailable: signal(false),
      init: vi.fn(),
      applyUpdate: vi.fn().mockResolvedValue(undefined),
      snooze: vi.fn(),
    };
    nativeUpdateStub = {
      availableUpdate: signal(null),
      init: vi.fn(),
      check: vi.fn().mockResolvedValue(undefined),
      snooze: vi.fn(),
      openReleasePage: vi.fn(),
    };
    alertControllerStub = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };
    i18nStub = {
      translate: vi.fn((key: string) => key),
    };
  });

  afterEach(() => {
    routerStub.events.complete();
    vi.clearAllMocks();
  });

  it('renders the analytics consent banner actions in the template', () => {
    const template = readFileSync(resolve(process.cwd(), 'src/app/app.component.ts'), 'utf8');

    expect(template).toContain("'analyticsConsent.banner.title' | transloco");
    expect(template).toContain('app-floating-banners');
    expect(template).toContain('(click)="acceptAnalyticsConsent()"');
    expect(template).toContain('(click)="rejectAnalyticsConsent()"');
    expect(template).toContain('[routerLink]="[\'/tabs/privacy\']"');
    expect(template).toContain('[routerLink]="[\'/tabs/cookies\']"');
    expect(template).toContain('[routerLink]="[\'/tabs/terms\']"');
    expect(template).toContain("'legalNav.privacy' | transloco");
    expect(template).toContain("'legalNav.cookies' | transloco");
    expect(template).toContain("'legalNav.terms' | transloco");
  });

  it('renders browser-supported install prompt actions in the template', () => {
    const template = readFileSync(resolve(process.cwd(), 'src/app/app.component.ts'), 'utf8');

    expect(template).toContain('@if (showInstallBanner())');
    expect(template).toContain("'installPrompt.title' | transloco");
    expect(template).toContain("'installPrompt.copy' | transloco");
    expect(template).toContain('(click)="installApp()"');
    expect(template).toContain('(click)="dismissInstallBanner()"');
    expect(template).toContain('[icon]="installIcon"');
    expect(template).toContain('[icon]="dismissIcon"');
  });

  it('shows the install banner only after a browser install prompt event', async () => {
    const { AppComponent } = await import('./app.component');
    const component = new AppComponent();
    const promptEvent = new Event('beforeinstallprompt') as Event & {
      prompt: ReturnType<typeof vi.fn>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    const preventDefault = vi.spyOn(promptEvent, 'preventDefault');
    promptEvent.prompt = vi.fn().mockResolvedValue(undefined);
    promptEvent.userChoice = Promise.resolve({ outcome: 'dismissed' });

    expect(component.showInstallBanner()).toBe(false);

    globalThis.dispatchEvent(promptEvent);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(component.showInstallBanner()).toBe(true);

    component.dismissInstallBanner();

    expect(component.showInstallBanner()).toBe(false);
  });

  it('consumes the install prompt event when installing the app', async () => {
    const { AppComponent } = await import('./app.component');
    const component = new AppComponent();
    const promptEvent = new Event('beforeinstallprompt') as Event & {
      prompt: ReturnType<typeof vi.fn>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    promptEvent.prompt = vi.fn().mockResolvedValue(undefined);
    promptEvent.userChoice = Promise.resolve({ outcome: 'accepted' });

    globalThis.dispatchEvent(promptEvent);

    expect(component.showInstallBanner()).toBe(true);

    await component.installApp();

    expect(promptEvent.prompt).toHaveBeenCalledOnce();
    expect(component.showInstallBanner()).toBe(false);
  });

  it('renders the service-worker update banner actions in the template', () => {
    const template = readFileSync(resolve(process.cwd(), 'src/app/app.component.ts'), 'utf8');

    expect(template).toContain('@if (showUpdateBanner())');
    expect(template).toContain('app-update-banner');
    expect(template).toContain("'appUpdate.title' | transloco");
    expect(template).toContain('updateCopyKey() | transloco');
    expect(template).toContain('(click)="snoozeUpdate()"');
    expect(template).toContain('(click)="openUpdatePrompt()"');
    expect(template).toContain('[icon]="updateIcon"');
  });

  it('surfaces the update banner when a new version is available and snoozes it', async () => {
    const { AppComponent } = await import('./app.component');
    const component = new AppComponent();

    expect(component.showUpdateBanner()).toBe(false);

    appUpdateStub.updateAvailable.set(true);
    expect(component.showUpdateBanner()).toBe(true);

    component.snoozeUpdate();
    expect(appUpdateStub.snooze).toHaveBeenCalledOnce();
  });

  it('opens an Ionic confirmation alert that applies the update when confirmed', async () => {
    const { AppComponent } = await import('./app.component');
    const component = new AppComponent();

    await component.openUpdatePrompt();

    expect(alertControllerStub.create).toHaveBeenCalledOnce();

    const alertConfig = alertControllerStub.create.mock.calls[0]?.[0] as {
      buttons: { role?: string; handler?: () => void }[];
    };
    const confirmButton = alertConfig.buttons.find((button) => button.role === 'confirm');

    expect(confirmButton).toBeDefined();

    confirmButton?.handler?.();

    expect(appUpdateStub.applyUpdate).toHaveBeenCalledOnce();
  });

  it('surfaces the native update banner and opens the release page on confirm', async () => {
    nativeUpdateStub.availableUpdate.set({ version: '1.2.0', url: 'https://rel/1.2.0' });
    const { AppComponent } = await import('./app.component');
    const component = new AppComponent();

    expect(component.showUpdateBanner()).toBe(true);
    expect(component.updateCopyKey()).toBe('appUpdate.copyNative');

    await component.openUpdatePrompt();

    const alertConfig = alertControllerStub.create.mock.calls[0]?.[0] as {
      buttons: { role?: string; handler?: () => void }[];
    };
    alertConfig.buttons.find((button) => button.role === 'confirm')?.handler?.();

    expect(nativeUpdateStub.openReleasePage).toHaveBeenCalledOnce();
    expect(appUpdateStub.applyUpdate).not.toHaveBeenCalled();
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
        url: '/tabs/manual-team-builder',
        title: 'Manual Team Builder | OPTC Team Builder',
        canonicalUrl: 'https://optcteambuilder.com/tabs/manual-team-builder/',
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

import { App } from '@capacitor/app';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
  RouterOutlet,
  type Routes,
} from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import packageJson from '../../package.json';
import { AnalyticsConsentService } from './core/services/analytics-consent.service';
import { GoogleAnalyticsService } from './core/services/google-analytics.service';
import { ToolbarBackNavigationService } from './core/services/toolbar-back-navigation.service';

interface RouteSeoData {
  title: string;
  description: string;
  canonicalPath: string;
  indexable: boolean;
}

const appSiteBaseUrl = 'https://optcteambuilder.com';
const appHomeTitle = 'OPTC Team Builder | One Piece Treasure Cruise Tools';
const defaultSeo: RouteSeoData = {
  title: appHomeTitle,
  description:
    'Plan OPTC crews with character search, Rumble rankings, captain coverage, auto team building, Crew Forge, saved teams, enemies, boxes, Drive sync, and offline tools.',
  canonicalPath: '',
  indexable: false,
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet, TranslocoPipe],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ion-app class="app-shell">
      @if (routeLoading()) {
        <div class="app-route-progress" aria-hidden="true">
          <span></span>
        </div>
      }

      <div class="app-shell__content">
        <router-outlet></router-outlet>
      </div>

      @if (showAnalyticsConsentBanner()) {
        <section class="analytics-consent-banner" aria-live="polite">
          <div class="analytics-consent-banner__copy">
            <strong>{{ 'analyticsConsent.banner.title' | transloco }}</strong>
            <p>{{ 'analyticsConsent.banner.copy' | transloco }}</p>
            <div class="analytics-consent-banner__links">
              <a [routerLink]="['/tabs/privacy']">{{
                'analyticsConsent.banner.privacyLink' | transloco
              }}</a>
              <span aria-hidden="true">•</span>
              <a [routerLink]="['/tabs/cookies']">{{
                'analyticsConsent.banner.cookiesLink' | transloco
              }}</a>
            </div>
          </div>

          <div class="analytics-consent-banner__actions">
            <button
              type="button"
              class="analytics-consent-button analytics-consent-button--accept"
              (click)="acceptAnalyticsConsent()"
            >
              {{ 'analyticsConsent.banner.accept' | transloco }}
            </button>
            <button
              type="button"
              class="analytics-consent-button analytics-consent-button--reject"
              (click)="rejectAnalyticsConsent()"
            >
              {{ 'analyticsConsent.banner.reject' | transloco }}
            </button>
          </div>
        </section>
      }

      <footer class="app-footer-meta">
        <div class="app-footer-meta__inner">
          <a
            class="app-credit-badge"
            href="https://github.com/JohnChourp/optc-team-builder"
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Open the optc-team-builder GitHub repository"
          >
            {{ creditLabel() }}
          </a>

          <nav class="app-legal-nav" [attr.aria-label]="'legalNav.ariaLabel' | transloco">
            <a class="app-legal-nav__link" [routerLink]="['/tabs/privacy']">
              {{ 'legalNav.privacy' | transloco }}
            </a>
            <a class="app-legal-nav__link" [routerLink]="['/tabs/cookies']">
              {{ 'legalNav.cookies' | transloco }}
            </a>
            <a class="app-legal-nav__link" [routerLink]="['/tabs/terms']">
              {{ 'legalNav.terms' | transloco }}
            </a>
          </nav>
        </div>
      </footer>
    </ion-app>
  `,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly analyticsConsentService = inject(AnalyticsConsentService);
  private readonly analytics = inject(GoogleAnalyticsService);
  private readonly toolbarBackNavigation = inject(ToolbarBackNavigationService);
  private lastTrackedUrl: string | null = null;

  public readonly appVersion = signal(packageJson.version);
  public readonly creditLabel = computed(() => `powered by johnChourp v.${this.appVersion()}`);
  public readonly currentUrl = signal(this.router.url);
  public readonly routeLoading = signal(false);
  public readonly analyticsConsent = this.analyticsConsentService.consent;
  public readonly showAnalyticsConsentBanner = computed(
    () => this.analyticsConsent() === 'unknown',
  );

  public constructor() {
    void this.loadAppVersion();
    afterNextRender(() => {
      this.scheduleCatalogWarmup();
    });

    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.routeLoading.set(true);
        return;
      }

      if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.routeLoading.set(false);
        return;
      }

      if (!(event instanceof NavigationEnd)) {
        return;
      }

      this.routeLoading.set(false);
      this.currentUrl.set(event.urlAfterRedirects);
      this.toolbarBackNavigation.recordNavigation(event.urlAfterRedirects);
      this.updateRouteMetadata(event.urlAfterRedirects);
      this.trackPageView(event.urlAfterRedirects);
    });

    if (this.router.navigated && this.router.url !== '') {
      this.toolbarBackNavigation.recordNavigation(this.router.url);
      this.updateRouteMetadata(this.router.url);
      this.trackPageView(this.router.url);
    }
  }

  public async acceptAnalyticsConsent(): Promise<void> {
    await this.analyticsConsentService.accept();
    this.lastTrackedUrl = null;
    this.trackPageView(this.currentUrl());
  }

  public async rejectAnalyticsConsent(): Promise<void> {
    await this.analyticsConsentService.reject();
    this.lastTrackedUrl = null;
  }

  private async loadAppVersion(): Promise<void> {
    try {
      // Native builds read the platform version fields; web keeps the package.json fallback.
      const { version } = await App.getInfo();

      if (version) {
        this.appVersion.set(version);
      }
    } catch {
      return;
    }
  }

  private scheduleCatalogWarmup(): void {
    const warmup = () => {
      void import('./core/services/character-catalog-cache.service')
        .then(({ CharacterCatalogCacheService }) => {
          this.injector.get(CharacterCatalogCacheService).kickoffPreload();
        })
        .catch(() => undefined);
    };
    const runtime = globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    };

    if (typeof runtime.requestIdleCallback === 'function') {
      runtime.requestIdleCallback(() => warmup(), { timeout: 3000 });
      return;
    }

    runtime.setTimeout(warmup, 750);
  }

  private trackPageView(url: string): void {
    if (
      this.analyticsConsent() !== 'accepted' ||
      url.trim() === '' ||
      this.lastTrackedUrl === url
    ) {
      return;
    }

    this.analytics.trackPageView(url);
    this.lastTrackedUrl = url;
  }

  private updateRouteMetadata(url: string): void {
    const seo = this.findSeoDataForUrl(url);
    const canonicalUrl = this.buildCanonicalUrl(seo.canonicalPath);
    const robotsContent = seo.indexable ? 'index,follow' : 'noindex,follow';

    this.title.setTitle(seo.title);
    this.meta.updateTag({ name: 'description', content: seo.description });
    this.meta.updateTag({ name: 'robots', content: robotsContent });
    this.meta.updateTag({ property: 'og:title', content: seo.title });
    this.meta.updateTag({ property: 'og:description', content: seo.description });
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl });
    this.meta.updateTag({ name: 'twitter:title', content: seo.title });
    this.meta.updateTag({ name: 'twitter:description', content: seo.description });
    this.updateCanonicalLink(canonicalUrl);
  }

  private findSeoDataForUrl(url: string): RouteSeoData {
    const normalizedUrl = this.normalizeRoutePath(url);
    const seo = this.findSeoDataInRoutes(this.router.config, normalizedUrl);

    return seo ?? this.findGeneratedCharacterSeoData(normalizedUrl) ?? defaultSeo;
  }

  private findSeoDataInRoutes(
    routes: Routes,
    normalizedUrl: string,
    parentPath = '',
  ): RouteSeoData | null {
    for (const route of routes) {
      const routePath = this.joinRoutePaths(parentPath, route.path ?? '');

      if (route.path !== '**' && routePath === normalizedUrl) {
        const seo = route.data?.['seo'];

        if (this.isRouteSeoData(seo)) {
          return { ...seo, indexable: true };
        }
      }

      if (route.children) {
        const childSeo = this.findSeoDataInRoutes(route.children, normalizedUrl, routePath);

        if (childSeo) {
          return childSeo;
        }
      }
    }

    return null;
  }

  private normalizeRoutePath(url: string): string {
    return url.split(/[?#]/, 1)[0]?.replace(/^\/+|\/+$/g, '') ?? '';
  }

  private joinRoutePaths(parentPath: string, childPath: string): string {
    return [parentPath, childPath]
      .filter((part) => part.length > 0)
      .join('/')
      .replace(/^\/+|\/+$/g, '');
  }

  private isRouteSeoData(value: unknown): value is RouteSeoData {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
      typeof candidate['title'] === 'string' &&
      typeof candidate['description'] === 'string' &&
      typeof candidate['canonicalPath'] === 'string'
    );
  }

  private findGeneratedCharacterSeoData(normalizedUrl: string): RouteSeoData | null {
    const match = /^characters\/([1-9]\d*)$/u.exec(normalizedUrl);

    if (!match) {
      return null;
    }

    const characterId = match[1]!;
    const canonicalPath = `characters/${characterId}`;
    const canonicalUrl = this.buildCanonicalUrl(canonicalPath);
    const generatedTitle = this.readCurrentDocumentTitle(canonicalUrl);
    const generatedDescription = this.readCurrentMetaDescription(canonicalUrl);

    return {
      title: generatedTitle ?? `OPTC Character #${characterId} | OPTC Team Builder`,
      description:
        generatedDescription ??
        `View One Piece Treasure Cruise character #${characterId} stats, abilities, specials, support, rumble data, and team-building details.`,
      canonicalPath,
      indexable: true,
    };
  }

  private readCurrentDocumentTitle(canonicalUrl: string): string | null {
    if (typeof document === 'undefined' || !this.currentCanonicalMatches(canonicalUrl)) {
      return null;
    }

    const title = document.title.trim();

    return title.length > 0 ? title : null;
  }

  private readCurrentMetaDescription(canonicalUrl: string): string | null {
    if (typeof document === 'undefined' || !this.currentCanonicalMatches(canonicalUrl)) {
      return null;
    }

    const description = document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.getAttribute('content')
      ?.trim();

    return description && description.length > 0 ? description : null;
  }

  private currentCanonicalMatches(canonicalUrl: string): boolean {
    if (typeof document === 'undefined') {
      return false;
    }

    const currentCanonical = document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.getAttribute('href');

    return currentCanonical === canonicalUrl;
  }

  private buildCanonicalUrl(routePath: string): string {
    const normalizedRoutePath = routePath.replace(/^\/+|\/+$/g, '');

    return normalizedRoutePath.length
      ? `${appSiteBaseUrl}/${normalizedRoutePath}/`
      : `${appSiteBaseUrl}/`;
  }

  private updateCanonicalLink(canonicalUrl: string): void {
    if (typeof document === 'undefined') {
      return;
    }

    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }

    canonicalLink.href = canonicalUrl;
  }
}

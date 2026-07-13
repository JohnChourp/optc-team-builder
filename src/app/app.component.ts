import { App } from '@capacitor/app';
import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AlertController, IonApp, IonButton, IonIcon, IonRouterOutlet } from '@ionic/angular/standalone';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
  type Routes,
} from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { TranslocoPipe } from '@jsverse/transloco';
import { closeOutline, cloudDownloadOutline, refreshOutline } from 'ionicons/icons';
import packageJson from '../../package.json';
import { AnalyticsConsentService } from './core/services/analytics-consent.service';
import { AppI18nService } from './core/services/app-i18n.service';
import { AppUpdateService } from './core/services/app-update.service';
import { CharacterCatalogCacheService } from './core/services/character-catalog-cache.service';
import { GoogleAnalyticsService } from './core/services/google-analytics.service';
import { NativeUpdateService } from './core/services/native-update.service';
import { ToolbarBackNavigationService } from './core/services/toolbar-back-navigation.service';

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform?: string;
  }>;
  prompt: () => Promise<void>;
}

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
  imports: [IonApp, IonButton, IonIcon, IonRouterOutlet, RouterLink, TranslocoPipe],
  template: `
    <ion-app class="app-shell">
      @if (routeLoading()) {
        <div class="app-route-progress" aria-hidden="true">
          <span></span>
        </div>
      }

      <div class="app-shell__content">
        <ion-router-outlet></ion-router-outlet>
      </div>

      @if (showUpdateBanner() || showInstallBanner() || showAnalyticsConsentBanner()) {
        <div class="app-floating-banners">
          @if (showUpdateBanner()) {
            <section class="app-update-banner" aria-live="polite">
              <div class="app-update-banner__copy">
                <strong>{{ 'appUpdate.title' | transloco }}</strong>
                <p>{{ updateCopyKey() | transloco }}</p>
              </div>

              <div class="app-update-banner__actions">
                <ion-button fill="clear" color="light" size="small" (click)="snoozeUpdate()">
                  {{ 'appUpdate.later' | transloco }}
                </ion-button>
                <ion-button fill="solid" color="warning" size="small" (click)="openUpdatePrompt()">
                  <ion-icon slot="start" [icon]="updateIcon"></ion-icon>
                  {{ 'appUpdate.update' | transloco }}
                </ion-button>
              </div>
            </section>
          }

          @if (showInstallBanner()) {
            <section class="app-install-banner" aria-live="polite">
              <div class="app-install-banner__copy">
                <strong>{{ 'installPrompt.title' | transloco }}</strong>
                <p>{{ 'installPrompt.copy' | transloco }}</p>
              </div>

              <div class="app-install-banner__actions">
                <ion-button fill="solid" color="warning" size="small" (click)="installApp()">
                  <ion-icon slot="start" [icon]="installIcon"></ion-icon>
                  {{ 'installPrompt.install' | transloco }}
                </ion-button>
                <ion-button
                  fill="clear"
                  color="light"
                  size="small"
                  [attr.aria-label]="'installPrompt.dismiss' | transloco"
                  (click)="dismissInstallBanner()"
                >
                  <ion-icon slot="icon-only" [icon]="dismissIcon"></ion-icon>
                </ion-button>
              </div>
            </section>
          }

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
                <ion-button
                  fill="solid"
                  color="warning"
                  size="small"
                  (click)="acceptAnalyticsConsent()"
                >
                  {{ 'analyticsConsent.banner.accept' | transloco }}
                </ion-button>
                <ion-button
                  fill="outline"
                  color="light"
                  size="small"
                  (click)="rejectAnalyticsConsent()"
                >
                  {{ 'analyticsConsent.banner.reject' | transloco }}
                </ion-button>
              </div>
            </section>
          }
        </div>
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
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly analyticsConsentService = inject(AnalyticsConsentService);
  private readonly analytics = inject(GoogleAnalyticsService);
  private readonly toolbarBackNavigation = inject(ToolbarBackNavigationService);
  private readonly characterCatalogCache = inject(CharacterCatalogCacheService);
  private readonly appUpdateService = inject(AppUpdateService);
  private readonly nativeUpdateService = inject(NativeUpdateService);
  private readonly alertController = inject(AlertController);
  private readonly i18n = inject(AppI18nService);
  private lastTrackedUrl: string | null = null;

  public readonly appVersion = signal(packageJson.version);
  public readonly creditLabel = computed(() => `powered by johnChourp v.${this.appVersion()}`);
  public readonly currentUrl = signal(this.router.url);
  public readonly routeLoading = signal(false);
  public readonly analyticsConsent = this.analyticsConsentService.consent;
  public readonly installIcon = cloudDownloadOutline;
  public readonly dismissIcon = closeOutline;
  public readonly updateIcon = refreshOutline;
  public readonly showUpdateBanner = computed(
    () => this.appUpdateService.updateAvailable() || this.nativeUpdateService.availableUpdate() !== null,
  );
  public readonly updateCopyKey = computed(() =>
    this.nativeUpdateService.availableUpdate() ? 'appUpdate.copyNative' : 'appUpdate.copy',
  );
  public readonly installPromptEvent = signal<BeforeInstallPromptEvent | null>(null);
  public readonly installBannerDismissed = signal(false);
  public readonly appInstalled = signal(false);
  public readonly standaloneMode = signal(false);
  public readonly showAnalyticsConsentBanner = computed(
    () => this.analyticsConsent() === 'unknown',
  );
  public readonly showInstallBanner = computed(
    () =>
      this.installPromptEvent() !== null &&
      !this.installBannerDismissed() &&
      !this.appInstalled() &&
      !this.standaloneMode(),
  );

  public constructor() {
    this.initializeInstallPrompt();
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

  public dismissInstallBanner(): void {
    this.installBannerDismissed.set(true);
  }

  public snoozeUpdate(): void {
    if (this.appUpdateService.updateAvailable()) {
      this.appUpdateService.snooze();
    }

    if (this.nativeUpdateService.availableUpdate()) {
      this.nativeUpdateService.snooze();
    }
  }

  public async openUpdatePrompt(): Promise<void> {
    const isNativeUpdate = this.nativeUpdateService.availableUpdate() !== null;
    const alert = await this.alertController.create({
      header: this.i18n.translate('appUpdate.confirm.title'),
      message: this.i18n.translate(
        isNativeUpdate ? 'appUpdate.confirm.messageNative' : 'appUpdate.confirm.message',
      ),
      buttons: [
        {
          text: this.i18n.translate('appUpdate.confirm.cancel'),
          role: 'cancel',
        },
        {
          text: this.i18n.translate(
            isNativeUpdate ? 'appUpdate.confirm.download' : 'appUpdate.confirm.confirm',
          ),
          role: 'confirm',
          handler: () => {
            if (isNativeUpdate) {
              this.nativeUpdateService.openReleasePage();
              return;
            }

            void this.appUpdateService.applyUpdate();
          },
        },
      ],
    });

    await alert.present();
  }

  public async installApp(): Promise<void> {
    const promptEvent = this.installPromptEvent();

    if (!promptEvent) {
      return;
    }

    this.installPromptEvent.set(null);

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice.outcome !== 'accepted') {
        this.installBannerDismissed.set(true);
      }
    } catch {
      this.installPromptEvent.set(promptEvent);
    }
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
      this.characterCatalogCache.kickoffPreload();
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

  private initializeInstallPrompt(): void {
    const runtime = globalThis as typeof globalThis & {
      addEventListener?: typeof globalThis.addEventListener;
      matchMedia?: typeof globalThis.matchMedia;
      navigator?: Navigator & { standalone?: boolean };
      removeEventListener?: typeof globalThis.removeEventListener;
    };

    this.updateStandaloneMode();

    if (typeof runtime.addEventListener !== 'function') {
      return;
    }

    const installPromptHandler = (event: Event) => {
      event.preventDefault();

      if (this.isStandaloneDisplay()) {
        this.standaloneMode.set(true);
        return;
      }

      this.installPromptEvent.set(event as BeforeInstallPromptEvent);
      this.installBannerDismissed.set(false);
    };
    const appInstalledHandler = () => {
      this.appInstalled.set(true);
      this.installPromptEvent.set(null);
      this.installBannerDismissed.set(true);
    };
    const displayModeQuery = runtime.matchMedia?.('(display-mode: standalone)') ?? null;
    const displayModeHandler = () => this.updateStandaloneMode();

    runtime.addEventListener('beforeinstallprompt', installPromptHandler);
    runtime.addEventListener('appinstalled', appInstalledHandler);
    displayModeQuery?.addEventListener?.('change', displayModeHandler);

    (this.destroyRef as Partial<DestroyRef>).onDestroy?.(() => {
      runtime.removeEventListener?.('beforeinstallprompt', installPromptHandler);
      runtime.removeEventListener?.('appinstalled', appInstalledHandler);
      displayModeQuery?.removeEventListener?.('change', displayModeHandler);
    });
  }

  private updateStandaloneMode(): void {
    this.standaloneMode.set(this.isStandaloneDisplay());
  }

  private isStandaloneDisplay(): boolean {
    const runtime = globalThis as typeof globalThis & {
      matchMedia?: typeof globalThis.matchMedia;
      navigator?: Navigator & { standalone?: boolean };
    };

    return (
      runtime.matchMedia?.('(display-mode: standalone)').matches === true ||
      runtime.navigator?.standalone === true
    );
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

import { App } from "@capacitor/app";
import { Component, DestroyRef, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { IonApp, IonButton, IonRouterOutlet } from "@ionic/angular/standalone";
import { NavigationEnd, Router, RouterLink } from "@angular/router";
import { TranslocoPipe } from "@jsverse/transloco";
import { filter } from "rxjs";
import packageJson from "../../package.json";
import { AnalyticsConsentService } from "./core/services/analytics-consent.service";
import { GoogleAnalyticsService } from "./core/services/google-analytics.service";
import { ToolbarBackNavigationService } from "./core/services/toolbar-back-navigation.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [IonApp, IonButton, IonRouterOutlet, RouterLink, TranslocoPipe],
  template: `
    <ion-app class="app-shell">
      <div class="app-shell__content">
        <ion-router-outlet></ion-router-outlet>
      </div>

      @if (showAnalyticsConsentBanner()) {
        <section class="analytics-consent-banner" aria-live="polite">
          <div class="analytics-consent-banner__copy">
            <strong>{{ "analyticsConsent.banner.title" | transloco }}</strong>
            <p>{{ "analyticsConsent.banner.copy" | transloco }}</p>
            <div class="analytics-consent-banner__links">
              <a [routerLink]="['/tabs/privacy']">{{ "analyticsConsent.banner.privacyLink" | transloco }}</a>
              <span aria-hidden="true">•</span>
              <a [routerLink]="['/tabs/cookies']">{{ "analyticsConsent.banner.cookiesLink" | transloco }}</a>
            </div>
          </div>

          <div class="analytics-consent-banner__actions">
            <ion-button
              fill="solid"
              color="warning"
              size="small"
              (click)="acceptAnalyticsConsent()"
            >
              {{ "analyticsConsent.banner.accept" | transloco }}
            </ion-button>
            <ion-button
              fill="outline"
              color="light"
              size="small"
              (click)="rejectAnalyticsConsent()"
            >
              {{ "analyticsConsent.banner.reject" | transloco }}
            </ion-button>
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

          <nav
            class="app-legal-nav"
            [attr.aria-label]="'legalNav.ariaLabel' | transloco"
          >
            <a class="app-legal-nav__link" [routerLink]="['/tabs/privacy']">
              {{ "legalNav.privacy" | transloco }}
            </a>
            <a class="app-legal-nav__link" [routerLink]="['/tabs/cookies']">
              {{ "legalNav.cookies" | transloco }}
            </a>
            <a class="app-legal-nav__link" [routerLink]="['/tabs/terms']">
              {{ "legalNav.terms" | transloco }}
            </a>
          </nav>
        </div>
      </footer>
    </ion-app>
  `,
  styleUrl: "./app.component.scss",
})
export class AppComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly analyticsConsentService = inject(AnalyticsConsentService);
  private readonly analytics = inject(GoogleAnalyticsService);
  private readonly toolbarBackNavigation = inject(ToolbarBackNavigationService);
  private lastTrackedUrl: string | null = null;

  public readonly appVersion = signal(packageJson.version);
  public readonly creditLabel = computed(() => `powered by johnChourp v.${this.appVersion()}`);
  public readonly currentUrl = signal(this.router.url);
  public readonly analyticsConsent = this.analyticsConsentService.consent;
  public readonly showAnalyticsConsentBanner = computed(() => this.analyticsConsent() === "unknown");

  public constructor() {
    void this.loadAppVersion();

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
        this.toolbarBackNavigation.recordNavigation(event.urlAfterRedirects);
        this.trackPageView(event.urlAfterRedirects);
      });

    if (this.router.navigated && this.router.url !== "") {
      this.toolbarBackNavigation.recordNavigation(this.router.url);
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

  private trackPageView(url: string): void {
    if (this.analyticsConsent() !== "accepted" || url.trim() === "" || this.lastTrackedUrl === url) {
      return;
    }

    this.analytics.trackPageView(url);
    this.lastTrackedUrl = url;
  }
}

import { DOCUMENT } from "@angular/common";
import { Inject, Injectable } from "@angular/core";
import { Capacitor } from "@capacitor/core";

import { APP_ANALYTICS_CONFIG, type AppAnalyticsConfig } from "../analytics/app-analytics.config";

@Injectable({ providedIn: "root" })
export class GoogleAnalyticsService {
  private readonly scriptId = "app-google-analytics";
  private enabled = false;

  public constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(APP_ANALYTICS_CONFIG) private readonly config: AppAnalyticsConfig,
  ) {}

  public enable(): boolean {
    if (!this.canUseAnalytics()) {
      return false;
    }

    if (!this.isBootstrapped()) {
      this.ensureScript();
      this.ensureGtag();
      this.window()?.gtag?.("js", new Date());
      this.window()?.gtag?.("config", this.config.ga4MeasurementId, {
        send_page_view: false,
      });
      this.setBootstrapState();
    }

    this.setDisabledFlag(false);
    this.trackConsentUpdate("granted");

    this.enabled = true;
    return true;
  }

  public disable(): void {
    if (!this.canUseAnalytics()) {
      this.enabled = false;
      return;
    }

    this.setDisabledFlag(true);
    this.trackConsentUpdate("denied");
    this.enabled = false;
  }

  public trackPageView(pagePath: string): void {
    if (!this.isBootstrapped() || !this.enabled || !this.canUseAnalytics() || pagePath.trim() === "") {
      return;
    }

    this.window()?.gtag?.("event", "page_view", {
      page_location: this.document.location?.href ?? pagePath,
      page_path: pagePath,
      page_title: this.document.title,
    });
  }

  private canUseAnalytics(): boolean {
    return !Capacitor.isNativePlatform() && this.config.ga4MeasurementId.length > 0;
  }

  private ensureScript(): void {
    const head = this.document.head;

    if (!head || this.document.getElementById(this.scriptId)) {
      return;
    }

    const script = this.document.createElement("script");
    script.id = this.scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.config.ga4MeasurementId}`;
    head.append(script);
  }

  private ensureGtag(): void {
    const runtimeWindow = this.window();

    if (!runtimeWindow) {
      return;
    }

    runtimeWindow.dataLayer ??= [];
    runtimeWindow.gtag ??= (...args: unknown[]) => {
      runtimeWindow.dataLayer?.push(args);
    };
  }

  private isBootstrapped(): boolean {
    return (
      this.window()?.__googleAnalyticsBootstrap?.initialized === true &&
      this.window()?.__googleAnalyticsBootstrap?.measurementId === this.config.ga4MeasurementId
    );
  }

  private setBootstrapState(): void {
    const runtimeWindow = this.window();

    if (!runtimeWindow) {
      return;
    }

    runtimeWindow.__googleAnalyticsBootstrap = {
      initialized: true,
      measurementId: this.config.ga4MeasurementId,
    };
  }

  private trackConsentUpdate(storageState: "denied" | "granted"): void {
    this.window()?.gtag?.("consent", "update", {
      analytics_storage: storageState,
    });
  }

  private setDisabledFlag(value: boolean): void {
    const runtimeWindow = this.window() as (Window & Record<string, unknown>) | null;

    if (!runtimeWindow) {
      return;
    }

    runtimeWindow[`ga-disable-${this.config.ga4MeasurementId}`] = value;
  }

  private window(): Window | null {
    return this.document.defaultView;
  }
}

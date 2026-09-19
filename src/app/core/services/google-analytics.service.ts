import { DOCUMENT } from "@angular/common";
import { Inject, Injectable } from "@angular/core";
import { Capacitor } from "@capacitor/core";

import { APP_ANALYTICS_CONFIG, type AppAnalyticsConfig } from "../analytics/app-analytics.config";

/**
 * 869f13c5m. The Google Tag Manager container the site uses. Until 869f13c5m it loaded from
 * `src/index.html`, `public/404.html` and every generated page, on every visit and before anyone
 * was asked, with only `analytics_storage` defaulted to denied. It now loads only from `enable()`,
 * which runs when the reader accepts, or on start when they accepted before. Microsoft Clarity is
 * delivered by this container, so it waits for the same answer.
 */
export const GOOGLE_TAG_MANAGER_CONTAINER_ID = "GTM-TBW6L4T";

@Injectable({ providedIn: "root" })
export class GoogleAnalyticsService {
  private readonly scriptId = "app-google-analytics";
  private readonly tagManagerScriptId = "app-google-tag-manager";
  private enabled = false;

  public constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(APP_ANALYTICS_CONFIG) private readonly config: AppAnalyticsConfig,
  ) {}

  public enable(): boolean {
    if (!this.isAvailable()) {
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
    this.ensureTagManager();

    this.enabled = true;
    return true;
  }

  /**
   * 869f13c5m. Whether analytics can run here at all: false with no GA4 id (every local build, fork
   * or harness run without the secret) and on native, where analytics is refused. Asking a reader to
   * choose when neither answer changes anything is not a choice, so the consent surfaces read this.
   */
  public isAvailable(): boolean {
    return !Capacitor.isNativePlatform() && this.config.ga4MeasurementId.length > 0;
  }

  public disable(): void {
    if (!this.isAvailable()) {
      this.enabled = false;
      return;
    }

    this.setDisabledFlag(true);
    this.trackConsentUpdate("denied");
    this.enabled = false;
  }

  public trackPageView(pagePath: string): void {
    if (!this.isBootstrapped() || !this.enabled || !this.isAvailable() || pagePath.trim() === "") {
      return;
    }

    this.window()?.gtag?.("event", "page_view", {
      page_location: this.document.location?.href ?? pagePath,
      page_path: pagePath,
      page_title: this.document.title,
    });
  }

  private ensureTagManager(): void {
    const head = this.document.head;
    const runtimeWindow = this.window();

    if (!head || !runtimeWindow || this.document.getElementById(this.tagManagerScriptId)) {
      return;
    }

    runtimeWindow.dataLayer ??= [];
    runtimeWindow.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

    const script = this.document.createElement("script");
    script.id = this.tagManagerScriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_MANAGER_CONTAINER_ID}`;
    head.append(script);
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

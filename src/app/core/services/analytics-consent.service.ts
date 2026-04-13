import { computed, Injectable, signal } from "@angular/core";
import { Preferences } from "@capacitor/preferences";

import { GoogleAnalyticsService } from "./google-analytics.service";

export const ANALYTICS_CONSENT_PREFERENCE_KEY = "analyticsConsent";

export type AnalyticsConsentState = "accepted" | "rejected" | "unknown";

@Injectable({ providedIn: "root" })
export class AnalyticsConsentService {
  private readonly consentState = signal<AnalyticsConsentState>("unknown");
  private readonly readyPromise: Promise<void>;

  public readonly consent = this.consentState.asReadonly();
  public readonly hasAnsweredConsent = computed(() => this.consentState() !== "unknown");
  public readonly canTrack = computed(() => this.consentState() === "accepted");

  public constructor(private readonly analytics: GoogleAnalyticsService) {
    this.readyPromise = this.hydrate();
  }

  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  public async accept(): Promise<void> {
    await this.setConsent("accepted");
  }

  public async reject(): Promise<void> {
    await this.setConsent("rejected");
  }

  public async setConsent(nextConsent: AnalyticsConsentState): Promise<void> {
    await this.ready();

    this.consentState.set(nextConsent);
    await Preferences.set({
      key: ANALYTICS_CONSENT_PREFERENCE_KEY,
      value: nextConsent,
    });

    if (nextConsent === "accepted") {
      this.analytics.enable();
      return;
    }

    this.analytics.disable();
  }

  private async hydrate(): Promise<void> {
    const { value } = await Preferences.get({ key: ANALYTICS_CONSENT_PREFERENCE_KEY });
    const storedConsent = this.resolveStoredConsent(value);

    this.consentState.set(storedConsent);

    if (storedConsent === "accepted") {
      this.analytics.enable();
      return;
    }

    this.analytics.disable();
  }

  private resolveStoredConsent(value: string | null | undefined): AnalyticsConsentState {
    return value === "accepted" || value === "rejected" ? value : "unknown";
  }
}

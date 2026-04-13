import { DOCUMENT } from "@angular/common";
import { inject, InjectionToken } from "@angular/core";

export interface AppAnalyticsConfig {
  ga4MeasurementId: string;
}

function normalizeGa4MeasurementId(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim().toUpperCase();

  return /^G-[A-Z0-9]+$/i.test(normalizedValue) ? normalizedValue : "";
}

function resolveAppAnalyticsConfig(document: Document): AppAnalyticsConfig {
  return {
    ga4MeasurementId: normalizeGa4MeasurementId(document.defaultView?.__appConfig?.ga4MeasurementId),
  };
}

export const APP_ANALYTICS_CONFIG = new InjectionToken<AppAnalyticsConfig>("APP_ANALYTICS_CONFIG", {
  providedIn: "root",
  factory: () => resolveAppAnalyticsConfig(inject(DOCUMENT)),
});

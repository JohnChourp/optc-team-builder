declare global {
  interface Window {
    __appConfig?: {
      ga4MeasurementId?: string;
    };
    __googleAnalyticsBootstrap?: {
      initialized?: boolean;
      measurementId?: string;
    };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export {};

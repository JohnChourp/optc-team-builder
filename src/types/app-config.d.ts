declare global {
  interface Window {
    __appConfig?: {
      ga4MeasurementId?: string;
    };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export {};

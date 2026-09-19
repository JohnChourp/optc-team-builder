import { type AnalyticsConsentState } from './analytics-consent.service';

/**
 * 869f13c5m. When the analytics banner asks.
 *
 * - Only where the answer changes something: `available` is false with no GA4 id (every local
 *   build, fork or harness run without the secret) and on native, where analytics is refused.
 * - Only while nothing has been chosen.
 * - Only once the reader has moved inside the app. The first NavigationEnd is the page they arrived
 *   on; a visitor from a search sees that page before being asked anything, and one who never
 *   navigates is never asked - which costs nothing, because nothing loads until they accept.
 */
export function shouldAskForAnalyticsConsent({
  available,
  consent,
  navigationCount,
}: {
  available: boolean;
  consent: AnalyticsConsentState;
  navigationCount: number;
}): boolean {
  return available && consent === 'unknown' && navigationCount > 1;
}

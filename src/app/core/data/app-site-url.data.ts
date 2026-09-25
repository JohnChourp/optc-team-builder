/**
 * The address the app is published at, written once.
 *
 * 869f63gqg. `AppComponent` builds canonical links from it, and a share link built in the
 * Android app needs it too: there the WebView's `location.origin` is `https://localhost`,
 * so the Saved Teams share link a player copied pointed at their own phone and opened
 * nothing for the friend who tapped it. The value used to be private to `app.component.ts`.
 */
export const APP_SITE_BASE_URL = 'https://optcteambuilder.com';

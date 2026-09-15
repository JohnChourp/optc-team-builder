/**
 * "What this app supports", as structure only: every word lives in the
 * `supported` translation scope so the page reads the same in English and Greek.
 *
 * 869f17h3g. A cautious player evaluating an unofficial, sideloaded, fan-made
 * tool wants the whole picture at once - which browsers work, whether there is an
 * iPhone app, what survives without a connection, what the Android app asks for
 * and why, and where the character data comes from. Every one of those answers
 * existed somewhere in this project and none was reachable from the app.
 *
 * The claims below are NOT prose. `check-support-claims.mjs` reads the real
 * AndroidManifest, the real Playwright config and the real service-worker config
 * and fails when the screen and the configuration disagree - so adding a
 * permission, or dropping a browser engine, turns this screen red instead of
 * quietly making it lie to a player.
 */

export interface SupportedSection {
  /** Key segment under `sections`, and the section's stable id. */
  readonly id: string;
  /** Key segments under `sections.<id>.rows`, in display order. */
  readonly rows: readonly string[];
}

export const SUPPORTED_SECTIONS: readonly SupportedSection[] = [
  { id: 'devices', rows: ['android', 'iphone', 'computer'] },
  { id: 'browsers', rows: ['tested', 'engines', 'reporting'] },
  { id: 'offline', rows: ['works', 'needsConnection', 'storage'] },
  { id: 'permissions', rows: ['internet', 'installPackages', 'nothingElse'] },
  { id: 'data', rows: ['source', 'freshness', 'unofficial'] },
];

/**
 * The permissions the Android app declares, in the order the screen lists them.
 *
 * Checked against `android/app/src/main/AndroidManifest.xml`. A new permission
 * without a row here fails the lane, because "the app asks for two things" is a
 * promise a player reads and a manifest can break silently.
 */
export const DECLARED_ANDROID_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.REQUEST_INSTALL_PACKAGES',
] as const;

/**
 * The browser engines this app claims automated coverage on.
 *
 * Checked against `playwright.config.ts`. The claim is only honest while all
 * three projects exist: WebKit matters most, because iOS mandates it for every
 * browser and the PWA is the iOS path.
 */
export const TESTED_BROWSER_ENGINES = ['chromium', 'firefox', 'webkit'] as const;

/**
 * The service-worker asset groups behind the offline claim.
 *
 * Checked against `ngsw-config.json`. If a group is renamed or removed, what
 * works on a plane changes, and this screen says what works on a plane.
 */
export const OFFLINE_ASSET_GROUPS = ['app', 'i18n', 'data', 'assets'] as const;

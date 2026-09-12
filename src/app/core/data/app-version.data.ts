/**
 * The version this build ships as, shown in the "App and data" card in Settings.
 *
 * A committed constant rather than an import of package.json: the app bundle
 * has no clean way to reach a file outside `src/`, and a runtime global would
 * be right only in a built app, never in `ng serve`.
 *
 * `scripts/bump-version.sh` rewrites this line together with package.json, the
 * Android `versionName` and the iOS `MARKETING_VERSION`, and
 * `app-version.data.spec.ts` fails the moment it disagrees with package.json -
 * so a hand-edit here, or a bump that forgets this file, is caught by the gate
 * rather than by a player quoting the wrong number in a bug report.
 *
 * Deliberately NOT read from `WHATS_NEW_ENTRIES[0]`: a release adds its
 * What's New entry before the version bump, so that list runs one version
 * ahead for the whole window in between - and merging to main publishes the
 * website, so a reader really would see the wrong number.
 */
export const APP_VERSION = '0.4.16';

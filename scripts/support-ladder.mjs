/**
 * What "we support this" means here, per platform and per engine.
 *
 * 869f17h7w / 869f17h7a. Across this backlog the word has been used for five
 * different things at once - an iOS project that is versioned and never built, a
 * sideloaded Android APK, engines with automated coverage, engines without. Most
 * of the open platform questions are really "which level is this?", and the
 * answers are cheap once the levels exist.
 *
 * The levels are deliberately about CADENCE, not about intent, because cadence is
 * the thing a check can read:
 *
 *   verified     automated coverage runs with NO human involved - a schedule, or
 *                a release. This is the only level a check can prove.
 *   supported    automated coverage exists and runs in the project's standard
 *                gate, but only when a person runs or dispatches it.
 *   best-effort  expected to mostly work; no automated coverage of its own.
 *   unsupported  no claim.
 *
 * The distinction between `verified` and `supported` is not pedantry. Measured
 * 2026-09-15: all three Playwright engines are in the dispatch matrix and in
 * `verify:local:full`, but only Chromium is installed by a scheduled workflow
 * (`performance-budgets`, `public-entry-synthetics`) or by a release. So exactly
 * one engine is exercised without somebody deciding to exercise it, and saying
 * "all three are tested automatically" overstates the other two - which is
 * precisely the sentence that shipped on the supported screen in v0.4.40.
 */

/** @typedef {'verified' | 'supported' | 'best-effort' | 'unsupported'} SupportLevel */

export const SUPPORT_LEVELS = ['verified', 'supported', 'best-effort', 'unsupported'];

/**
 * Browser engines, keyed by their Playwright project name.
 *
 * `unattendedIn` lists the workflow files that exercise the engine with no human
 * involved. A `verified` engine must name at least one and every file must really
 * install it; a `supported` engine must name none, or it is under-claiming.
 */
export const ENGINE_LADDER = [
  {
    engine: 'chromium',
    level: 'verified',
    unattendedIn: [
      '.github/workflows/performance-budgets.yml',
      '.github/workflows/public-entry-synthetics.yml',
      '.github/workflows/release-android.yml',
    ],
    covers: 'Chrome, Edge, Opera, and every Chromium-based browser.',
    meaning:
      'Exercised on a schedule and on every release with nobody watching. A failure here is a release-blocking defect and is usually seen before a player sees it.',
  },
  {
    engine: 'firefox',
    level: 'supported',
    unattendedIn: [],
    covers: 'Firefox on desktop and Android.',
    meaning:
      'The full e2e suite runs against it in the dispatch matrix and in every `verify:local:full`, so coverage is equal to Chromium in content - but it runs only when a person runs or dispatches it. A defect reported here is a real bug, and may be found by the reporter rather than by us.',
  },
  {
    engine: 'webkit',
    level: 'supported',
    unattendedIn: [],
    covers:
      'Safari on macOS, and EVERY browser on iOS - Apple requires WebKit there, so an iPhone player is on this engine whichever browser they installed.',
    meaning:
      'Same coverage and same cadence as Firefox. It carries more weight than its level suggests because iOS offers no alternative, which is why the iOS platform row below is best-effort rather than supported.',
  },
];

/**
 * Platforms, which are about distribution rather than rendering.
 *
 * `evidence` is a path that must exist and must be what the claim rests on, so a
 * level cannot outlive the thing that justified it.
 */
export const PLATFORM_LADDER = [
  {
    platform: 'android-apk',
    level: 'supported',
    evidence: '.github/workflows/release-android.yml',
    meaning:
      'Built and signed on every release, sideloaded rather than published to Google Play, and self-updating. No automated UI test runs on a device or emulator, so the APK is proven to BUILD automatically and proven to WORK by hand.',
  },
  {
    platform: 'web',
    level: 'verified',
    evidence: '.github/workflows/deploy-pages.yml',
    meaning:
      'Deployed on every push to main, with a post-deploy service-worker freshness check and scheduled synthetics against the live site. This is the platform everything else is a wrapper around.',
  },
  {
    platform: 'ios-pwa',
    level: 'best-effort',
    evidence: 'docs/ios-platform-footprint.md',
    meaning:
      'The installed web app is the intended way to use this on iOS. The ENGINE is covered like any other, but installing to the home screen, storage eviction and service-worker lifetime on iOS have never been exercised - so the platform is best-effort even though WebKit is supported.',
  },
  {
    platform: 'ios-native',
    level: 'unsupported',
    evidence: 'docs/ios-platform-footprint.md',
    meaning:
      'No App Store build exists and none is planned. The ios/ Capacitor project is kept so the option stays open, and is load-bearing for the Android release because bump-version.sh writes its version fields.',
  },
];

/**
 * The flakiness position, which belongs with the levels rather than beside them.
 *
 * Browser lanes here are flaky. A single failing run decides nothing, and the
 * control is taken on `main`, twice. Recorded in the doc and asserted by the
 * ladder's spec so it cannot quietly become "the lane is red, revert it".
 */
export const FLAKE_POSITION_HEADING = 'A single failing browser run decides nothing';

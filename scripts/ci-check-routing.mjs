#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ALL_ZERO_SHA_PATTERN = /^0+$/u;

export const SCRIPT_SUITES = {
  'ci-routing': {
    label: 'CI routing tests',
    command: 'npm run test:ci-routing',
  },
  'actions-pins': {
    label: 'GitHub Actions pin tests',
    command: 'npm run test:actions-pins && npm run actions:pins',
  },
  'workflow-budgets': {
    label: 'GitHub workflow budget tests',
    command: 'npm run test:workflow-budgets && npm run actions:workflow-budgets',
  },
  'ci-triggers': {
    label: 'GitHub CI trigger policy tests',
    command: 'npm run test:ci-triggers && npm run actions:ci-triggers',
  },
  'maintainer-doctor': {
    label: 'Maintainer environment doctor tests',
    command: 'npm run test:maintainer-doctor',
  },
  'branch-cleanup': {
    label: 'Branch cleanup report tests',
    command: 'npm run test:branch-cleanup',
  },
  'dataset-digest': {
    label: 'Dataset change digest tests',
    command: 'npm run test:dataset-digest',
  },
  'saved-team-codecs': {
    label: 'Saved-team codec fuzz tests',
    command: 'npm run test:saved-team-codecs',
  },
  'captain-contracts': {
    label: 'Captain contract script tests',
    command: 'npm run test:captain-contracts',
  },
  'release-check': {
    label: 'Release detector replay tests',
    command: 'npm run test:release-check',
  },
  'release-runbook-drift': {
    label: 'Release runbook drift tests',
    command: 'npm run test:release-runbook-drift',
  },
  'release-readiness': {
    label: 'Release readiness report tests',
    command: 'npm run test:release-readiness',
  },
  /*
   * These three lanes ran their own unit specs and NOTHING ELSE, so a
   * docs-only change was routed to checks that never opened the changed file.
   * `npm run verify:local` enumerates exactly SCRIPT_SUITE_ORDER, and
   * `docs:integrity` / `docs:commands` were in no lane at all - the command
   * CLAUDE.md names as validation for an app change never validated a link, an
   * anchor or a command block in the app's own docs.
   *
   * Both now chain their real checker after the spec, the way `actions-pins`
   * has always done. Measured: 0.4s and 5.2s, against a suite that already
   * spends 2m30s in the Angular lane.
   */
  'docs-integrity': {
    label: 'Docs integrity tests and check',
    command: 'npm run test:docs-integrity',
  },
  'docs-commands': {
    label: 'Docs command tests and check',
    command: 'npm run test:docs-commands',
  },
  /*
   * `docs-drift` deliberately stays spec-only. Its checker reads the PR body
   * from GitHub (`GET /repos/$GITHUB_REPOSITORY/commits/$GITHUB_SHA/pulls`) and
   * returns an empty acknowledgement whenever those variables are unset, which
   * is always outside Actions. Chaining it would fail `verify:local` on every
   * branch whose diff touches a mapped feature - the trap CLAUDE.md documents
   * at length. The label says what this lane really covers so nobody reads
   * `pass docs-drift` as "the drift check ran".
   */
  'docs-drift': {
    label: 'Docs drift script tests (checker needs GitHub context)',
    command: 'npm run test:docs-drift',
  },
  discoverability: {
    label: 'Guide discoverability tests',
    command: 'npm run test:discoverability',
  },
  /*
   * 869f12x4k. `/faq` was a top-level public route for three releases and
   * reached 0 of the 4,637 generated sitemap URLs, because the sitemap's route
   * list is a second hand-written copy of the router's. The lane routes on both
   * files, so touching either one re-proves they still agree.
   */
  'route-sitemap-coverage': {
    label: 'Router / sitemap coverage tests',
    command: 'npm run test:route-sitemap-coverage',
  },
  /*
   * 869f12x4n. The FAQ shipped as a routed page with zero mentions in every
   * maintainer surface, so the drift guard could never fire for it - and the
   * sweep found four more pages in the same state. The lane routes on the page
   * tree and on the drift map, the two lists that have to keep agreeing.
   */
  'page-doc-coverage': {
    label: 'Page / docs coverage tests',
    command: 'npm run test:page-doc-coverage',
  },
  /*
   * 869f12x4y. `public/` is copied verbatim into the build output, so a file
   * there shadows whatever the SEO generator writes at the same path. A
   * committed 7-URL sitemap.xml sat beside a generated 4,638-URL one for months.
   */
  'public-asset-shadowing': {
    label: 'Public asset shadowing tests',
    command: 'npm run test:public-asset-shadowing',
  },
  /*
   * 869f12x56. 27 constants named `*_KEY`, of which four touch no storage at
   * all, and nothing in the code could tell the difference - which is how a
   * whole category of a reader's data stayed out of the full-data export.
   */
  /*
   * 869f13288. `regionAvailability` was imported on every character read, parsed out of SQL, and
   * consumed by zero product code for months - found by accident while researching something
   * else. The census resolves every shipped column to a named consumer, a recorded spec-only
   * reason, or a declared open question for the owner, and fails on a column with none of the
   * three. Silent deletion is deliberately not one of the outcomes: this repository has already
   * mistaken four test probes for dead code.
   */
  /*
   * 869f1328q. Saved Enemies is the only place free player input reaches the search engine, and 15
   * of the 38 mechanics answer to no shipped ability - ticking one constrains nothing. The
   * behaviour was already correct; what was missing was the DECLARATION, and a check that a
   * mechanic added tomorrow cannot arrive without a meaning. The lane also guards the checklist's
   * own written-out count against the catalogue, which was already wrong when it landed.
   */
  'enemy-vocabulary': {
    label: 'Saved Enemies vocabulary tests and check',
    command: 'npm run test:enemy-vocabulary',
  },
  /*
   * 869f1328p. A player who filters on an ability tag and sees a unit missing cannot tell whether
   * the unit lacks the ability or words it differently. The catalogue records the phrasings, the
   * count and the derivation per tag, and fails when a count moves further than a data release
   * could explain.
   */
  'ability-tags': {
    label: 'Ability tag catalogue tests and drift check',
    command: 'npm run test:ability-tags',
  },
  /*
   * 869f1328c / 869f1328r. `RegionAvailability` measured whether an image existed and was named
   * for availability. This fails a model name that claims a fact about the game it does not
   * measure, fails the return of that retired name, and covers the absence conventions that make
   * "we do not know" distinguishable from zero.
   */
  'field-naming': {
    label: 'Model field naming and absence convention tests',
    command: 'npm run test:field-naming',
  },
  'dataset-consumers': {
    label: 'Dataset consumer census tests and check',
    command: 'npm run test:dataset-consumers',
  },
  /*
   * 869f13285 / 869f13287. The live site served no security headers and no policy at all, and the
   * gitignored, publicly served `app-config.js` had no guard on its contents. GitHub Pages cannot
   * set headers, so the policy is a meta tag - which means nothing but a local run can prove it
   * before readers meet it. The browser half (`npm run security:csp`) needs a build and so stays
   * out of this lane; it is documented in the maintainer validation guide.
   */
  'security-config': {
    label: 'App config allowlist and CSP shape tests',
    command: 'npm run test:security-config',
  },
  'storage-keys': {
    label: 'Browser storage key registry tests',
    command: 'npm run test:storage-keys',
  },
  /*
   * 869f12x61. 27 i18n namespaces and no record of which page or component owns
   * each - which is how an FAQ entry came to quote a Settings button, and six
   * wrong Greek labels reached production.
   */
  'i18n-ownership': {
    label: 'i18n namespace ownership tests',
    command: 'npm run test:i18n-ownership',
  },
  /*
   * 869f12x69. Two builders, two engines, two workers, and no record of which
   * differences were chosen - so every session that read one after the other
   * proposed merging them, re-arguing refusals already in the record.
   */
  'engine-divergences': {
    label: 'Team builder engine divergence tests',
    command: 'npm run test:engine-divergences',
  },
  /*
   * 869f1naz5. The curated content ladder is hand-maintained, so the lane that binds every
   * milestone to a real dataset stage is the thing that keeps it from going quietly stale.
   */
  'content-ladder': {
    label: 'Content ladder tests',
    command: 'npm run test:content-ladder',
  },
  /*
   * 869f1pu2u. The read-only published team set is hand-curated and ships in the bundle, so it
   * rots the same way: a retired character or a renamed stage leaves a team the app cannot
   * assemble. Its lane also owns the sub-slot conflict rule, where the leader-seat exception is
   * the easy thing to get backwards.
   */
  'published-teams': {
    label: 'Published team set tests',
    command: 'npm run test:published-teams',
  },
  'public-entry-synthetics': {
    label: 'Public entry synthetic monitor tests',
    command: 'npm run test:public-entry-synthetics',
  },
  'i18n-regression': {
    label: 'Multilingual regression tests',
    command: 'npm run test:i18n-regression',
  },
  'drive-sync-server': {
    label: 'Drive sync backend tests',
    command: 'npm run test:drive-sync-server',
  },
  'source-data': {
    label: 'Source data validation tests',
    command:
      'npx vitest run scripts/lib/dataset-integrity.spec.ts scripts/lib/optc-dataset.spec.ts scripts/lib/manual-character-overlay.spec.ts scripts/lib/manual-character-apply.spec.ts scripts/lib/manual-character-prune.spec.ts scripts/lib/party-conflict-keys.spec.ts scripts/lib/rumble-data-normalizer.spec.ts scripts/lib/super-special-criteria.spec.ts scripts/upsert-manual-character.spec.ts scripts/check-dataset-spec-pins.spec.ts scripts/optc-upstream-progression.spec.ts && npm run dataset:spec-pins',
  },
  'perf-budget': {
    label: 'Performance budget script tests',
    command: 'npm run test:perf-budget',
  },
  'e2e-triage': {
    label: 'Playwright routing and quarantine tests',
    command: 'npm run test:e2e-triage',
  },
  'pwa-shell': {
    label: 'PWA shell safety tests',
    command: 'npm run test:pwa-shell',
  },
  'overlay-contrast': {
    label: 'Ionic overlay contrast tests',
    command: 'npm run test:overlay-contrast',
  },
  'ionic-host-property': {
    label: 'Ionic host shape property tests',
    command: 'npm run test:ionic-host-property',
  },
  'dataset-measurements': {
    label: 'Dataset measurement guard tests',
    command: 'npm run test:dataset-measurements',
  },
  'unresolved-clauses': {
    label: 'Unresolved clause record tests',
    command: 'npm run test:unresolved-clauses',
  },
  'dataset-provenance': {
    label: 'Dataset provenance map tests',
    command: 'npm run test:dataset-provenance',
  },
  'tag-picker-scoping': {
    label: 'Tag-set picker panel scoping tests',
    command: 'npm run test:tag-picker-scoping',
  },
  'whats-new': {
    label: "What's New changelog tests",
    command: 'npm run test:whats-new',
  },
  /*
   * 869f17h48. Every npm script is referenced, or registered with a reason that
   * can be falsified. The naive form of this check - grep the name, fail on zero -
   * is what reported `test:e2e:webkit` as orphaned while `verify-local.mjs` ran it
   * on every `verify:local:full`, because that file builds the name rather than
   * writing it. So the guard resolves interpolation, and an `interpolated` entry
   * has to name a file that really constructs the name.
   */
  'scripts-references': {
    label: 'npm script reference registry tests',
    command: 'npm run test:scripts-references',
  },
  /*
   * 869f17h1t / 869f17h36. 247 of ~300 component declarations are styling
   * wrappers, and the inventory describing them is generated from source rather
   * than written, so it cannot drift into fiction the way a hand-written table
   * would.
   */
  'style-panels': {
    label: 'Style panel inventory tests',
    command: 'npm run test:style-panels',
  },
  /*
   * 869f17h2x. Numbers in translated copy follow the chosen language. `1234567.89`
   * is `1,234,567.89` in en and `1.234.567,89` in el, so a bare `toLocaleString()`
   * showed a Greek reader a thousands separator where they expect a decimal point.
   */
  'locale-formatting': {
    label: 'Locale formatting tests',
    command: 'npm run test:locale-formatting',
  },
  /*
   * 869f17h3g. The "What this app supports" screen promises a player which
   * browsers are tested, what the Android app asks for, and what survives without
   * a connection. Each of those is decided by a file somewhere else, so adding one
   * permission would otherwise make the screen quietly untrue with nothing red.
   */
  'support-claims': {
    label: 'Support claims tests',
    command: 'npm run test:support-claims',
  },
  /*
   * 869f17h7q. The components that actually render something - 39, not the
   * often-quoted 53, which counts the 15 composing style-panel hosts as real.
   * The lane's own finding is a component reachable by neither a route nor a
   * template; 22 of the 39 appear in no template at all because they are routed
   * pages, and calling those dead is the mistake this project has made four times.
   */
  'component-inventory': {
    label: 'Rendering component inventory tests',
    command: 'npm run test:component-inventory',
  },
  /*
   * 869f17h7w / 869f17h7a. Support levels are defined by CADENCE so they can be
   * checked: `verified` means something runs with nobody watching. All three
   * engines have identical coverage in content; only Chromium is exercised
   * without somebody deciding to. The lane also refuses a cadence promise in the
   * player-facing copy that the ladder does not support - the defect that shipped
   * in v0.4.40.
   */
  'support-ladder': {
    label: 'Platform support ladder tests',
    command: 'npm run test:support-ladder',
  },
  /*
   * 869f17h73. Every npm script, what runs it, and therefore what breaks without
   * it. The lane's own finding is an `unclassified` script - one that resolves to
   * no caller and carries no registry entry - which is how `dataset:spec-pins`
   * surfaced: a healthy checker whose unit tests ran while the checker itself
   * never looked at the tree.
   */
  'scripts-inventory': {
    label: 'npm script inventory tests',
    command: 'npm run test:scripts-inventory',
  },
  /*
   * The TypeScript half of `audit:dead-code`, and deliberately only that half.
   *
   * The two scripts are near-identical in name and are not the same check:
   *
   *   dead-code:check   tsc --noEmit --noUnusedLocals --noUnusedParameters.
   *                     Wired here, through `test:dead-code`. This is the gate.
   *   audit:dead-code   that same tsc run PLUS `npx knip --include
   *                     files,exports,types`. A manual superset. Nothing runs it,
   *                     and that is the decision below rather than an oversight.
   *
   * Re-measured 2026-09-15: knip reports 240 unused exports and 29 unused
   * exported types against this tree, and the ones sampled are false positives -
   * knip counts a symbol used only inside its own file (an Angular standalone
   * component listed in a sibling `imports:` array, a type annotating a constant
   * beside it) as an unused export. That is a question about whether something
   * should be exported, not about whether it is dead, and 269 of them attached to
   * the single gate is a noise generator rather than a check.
   *
   * The figures recorded when that decision was first made were 236 and 13. The
   * export count barely moved; the type count more than doubled. The conclusion
   * is unchanged, but a justification carrying stale numbers invites the next
   * reader to re-litigate it, so re-measure and re-date rather than trusting
   * these. `npx knip --include exports,types` prints both totals in its headers.
   *
   * knip is a real dependency (^6.35.1), not a suggestion, and it is worth
   * running by hand when hunting an unused export. What it is NOT is the answer
   * to unused public class members. This comment and docs/linting-position.md
   * both said it was - 869f135rm measured otherwise on 2026-09-15: knip's
   * `classMembers` issue type existed in knip 5 and was REMOVED in 6. It is
   * absent from the installed binary, absent from `schema.json`, and
   * `--include classMembers` exits with `Invalid issue type`. Proven against a
   * used class carrying two dead public members: `npx knip --include
   * files,exports,types` named the unused export that wired the probe in and
   * named neither member.
   *
   * So that defect class had no tool at all, which is why it now has its own
   * lane - see `unused-members` below. Do not restore the claim that knip covers
   * it.
   *
   * `--noUnusedLocals --noUnusedParameters` has no such ambiguity: it found ten
   * genuinely unreachable declarations, all ten were removed, and it is clean.
   */
  'dead-code': {
    label: 'Unused locals and parameters',
    command: 'npm run test:dead-code',
  },
  /*
   * 869f135rm. What `dead-code` above cannot see: a public field or method that
   * no template, no service and no other file reads.
   *
   * Both dead things found on 2026-09-12 were that shape - `regionAvailability`
   * with zero non-spec consumers, `recentCharacterIds` written everywhere and
   * read nowhere - and the lane named `dead-code` ran green through both.
   *
   * The finding is an OPEN QUESTION, never an automatic delete: this repository
   * has already mistaken four deliberate test probes for dead code.
   * `scripts/data/unused-public-members-register.json` is therefore a debt
   * register rather than a permission list, and the check fails both when a
   * finding is missing from it and when an entry no longer describes one, so it
   * can only shrink.
   */
  /*
   * 869f135rr. How close each component stylesheet is to `anyComponentStyle`, and
   * how fast it got there.
   *
   * Angular's own budget fires at 100%, on whoever happens to be editing the file,
   * with no context. This fires at 70%, names the file and its share, and records
   * every size in a committed baseline so growth arrives as a reviewable diff
   * rather than as a surprise warning.
   *
   * It runs the real production build under the `style-budget-probe`
   * configuration and reads Angular's own numbers. Re-implementing the compile
   * would produce a number that is merely similar, which is precisely how the two
   * wrong budgets in this wave happened.
   */
  /*
   * 869f135rx. Key parity is not the same claim as "the Greek is Greek".
   *
   * EN and EL are at exact parity - 3,169 keys, 29 namespaces, zero mismatches -
   * and an English string copied into el.json passes that perfectly.
   * `i18n-regression-check.mjs` does assert Greek script, but only on the public
   * routes it names, so 29 namespaces were covered by a check that looked at a
   * few. Six Greek quotes naming the wrong button have already reached production
   * this way.
   *
   * Identical is not automatically a defect here: the game's own vocabulary stays
   * English on purpose. So the register splits the 636 identical values into terms
   * that are meant to be and debt that is not, and the debt list may only shrink.
   */
  /*
   * 869f135t0. Why each hand-maintained overlay exists, and what would remove it.
   *
   * A correction exists because upstream was wrong when it was written; when
   * upstream fixes itself the correction keeps winning, in the direction of the
   * older data. Nothing recorded why any entry was there, so a still-needed
   * correction and a stale one looked identical.
   *
   * It also holds the two copies of `party-conflict-overrides.json` together. The
   * importer reads one and the app reads the other, nothing generates either, and
   * a half-applied edit leaves them disagreeing about which characters conflict.
   */
  /*
   * 869f135ra. Every failure the player sees says the same three things: what
   * happened, whether their data is safe, and the one thing to try.
   *
   * 19 of 22 pages catch their own exceptions and each phrased failure its own
   * way. An error message is the only part of the app a reader reads carefully,
   * because they are stuck - and the data-safety sentence did not exist at all,
   * so "browser storage is full" left them unable to tell whether what they had
   * already saved had survived.
   */
  'failure-vocabulary': {
    label: 'Player-facing failure vocabulary tests',
    command: 'npm run test:failure-vocabulary',
  },
  'overlay-register': {
    label: 'Manual overlay register tests',
    command: 'npm run test:overlay-register',
  },
  'feature-coverage-grades': {
    label: 'Feature coverage grade tests',
    command: 'npm run test:feature-coverage-grades',
  },
  'i18n-greek-coverage': {
    label: 'Greek translation coverage tests',
    command: 'npm run test:i18n-greek-coverage',
  },
  'component-style-budget': {
    label: 'Component stylesheet budget proximity',
    command: 'npm run test:component-style-budget',
  },
  'unused-members': {
    label: 'Unused public class member tests',
    command: 'npm run test:unused-members',
  },
  /*
   * Proves the three Web Workers are still EMITTED, which nothing else does.
   *
   * Angular's worker transformer requires literally
   * `new Worker(new URL(<string literal>, import.meta.url))` and leaves any
   * other expression untouched with no error and no warning. Measured: hoisting
   * one URL to a const made `ng build` succeed cleanly while dropping the
   * emitted worker chunks from 3 to 2 - and every service falls back in-thread
   * silently and permanently when its worker will not construct, so nothing
   * downstream would have noticed.
   */
  'worker-bundling': {
    label: 'Web Worker bundling tests',
    command: 'npm run test:worker-bundling',
  },
  /*
   * 869f138q7. Proves what a first visit downloads: no large prefetched file of a type the host
   * ships uncompressed, and the dataset as the gzipped database the committed seed builds. The
   * seed went out at 27.7 MB with no content-encoding for the life of the project because no lane
   * looked at the build output's prefetch group.
   */
  'dataset-delivery': {
    label: 'Dataset delivery (compression and database) tests',
    command: 'npm run test:dataset-delivery',
  },
  /*
   * 869f138qm. Proves the 1.6 MB ability catalogue is still the index of the seed beside it. Both
   * files are written by the same import and regenerated separately by the manual character
   * overlay, so the pair can drift without either file looking wrong on its own.
   */
  'ability-catalogue': {
    label: 'Ability catalogue against the seed tests',
    command: 'npm run test:ability-catalogue',
  },
  /*
   * 869f138q3. Proves every `<ion-modal>` carries a name a screen reader can read. Measured before
   * the guard: 22 modals, 10 of them nameless, including all four on Auto Team Builder - the same
   * shape as the overlay-contrast rule, where each call site was right and the next one inherited
   * nothing.
   */
  'modal-labels': {
    label: 'Modal dialog label tests',
    command: 'npm run test:modal-labels',
  },
  /*
   * 869f138pv. Proves every shared picker still closes the same way. All six already did when this
   * was written; what nothing protected was the contract, and a pop-up that keeps a draft on a
   * backdrop tap in an app where every other one discards it is invisible until somebody reports it.
   */
  'picker-dismissal': {
    label: 'Shared picker dismissal tests',
    command: 'npm run test:picker-dismissal',
  },
  /*
   * 869f138qt. Proves docs/dataset-schema.json is still the schema the committed seed has. The
   * seed is regenerated every release, so a hand-written schema would be wrong the first time a
   * column changed and nobody would find out.
   */
  'dataset-schema': {
    label: 'Dataset schema document tests',
    command: 'npm run test:dataset-schema',
  },
  /*
   * 869f138qz. Proves docs/shared-component-map.json is still what the imports say. 17 components
   * across up to six hosts each is 102 possible relationships; a hand-written table of them is
   * wrong within a month, and the subtask's acceptance criterion is that a NEW host appears in the
   * document without anyone editing it.
   */
  'component-map': {
    label: 'Shared component host map tests',
    command: 'npm run test:component-map',
  },
  /*
   * 869f138qx. Proves docs/worker-protocols.json is still what the three workers' models declare,
   * and that every message kind has a direction. Two proposals from earlier waves send more traffic
   * across these boundaries, and neither can be designed against a protocol nobody wrote down.
   */
  'worker-protocols': {
    label: 'Web Worker protocol document tests',
    command: 'npm run test:worker-protocols',
  },
};

export const SCRIPT_SUITE_ORDER = Object.keys(SCRIPT_SUITES);

const DOCS_SCRIPT_SUITES = ['docs-integrity', 'docs-commands', 'docs-drift'];

function normalizePath(value) {
  return String(value ?? '').replace(/\\/gu, '/').replace(/^\.\/+/u, '').trim();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function sanitizeOutputValue(value) {
  return String(value ?? '').replace(/\0/gu, '').replace(/\r?\n/gu, ' ').trim();
}

function addScriptSuite(suites, suite) {
  if (!SCRIPT_SUITES[suite]) {
    throw new Error(`Unknown script suite: ${suite}`);
  }
  suites.add(suite);
}

function isDocsPath(filePath) {
  return (
    filePath === 'README.md' ||
    filePath === '.github/pull_request_template.md' ||
    filePath === '.github/pull_request_template' ||
    filePath.startsWith('docs/') ||
    filePath === 'e2e/README.md' ||
    /\.mdx?$/u.test(filePath)
  );
}

function isWorkflowOrDependencyPath(filePath) {
  return (
    filePath === 'package.json' ||
    filePath === 'package-lock.json' ||
    filePath === '.nvmrc' ||
    filePath === 'angular.json' ||
    filePath === 'playwright.config.ts' ||
    filePath === 'tsconfig.json' ||
    filePath === 'tsconfig.app.json' ||
    filePath === 'tsconfig.spec.json' ||
    filePath.startsWith('.github/workflows/') ||
    filePath === 'scripts/ci-check-routing.mjs' ||
    filePath === 'scripts/ci-check-routing.spec.ts'
  );
}

function isReleaseCheckPath(filePath) {
  return (
    filePath === 'scripts/backtest-optc-release-detector.mjs' ||
    filePath === 'scripts/backtest-optc-release-detector.spec.ts' ||
    filePath === 'scripts/check-optc-release-needed.mjs' ||
    filePath === 'scripts/check-optc-release-needed.spec.ts' ||
    filePath === 'scripts/check-optc-upstream-monitor.mjs' ||
    filePath === 'scripts/check-optc-upstream-monitor.spec.ts' ||
    filePath === 'scripts/release-decision-history.mjs' ||
    filePath === 'scripts/release-decision-history.spec.ts' ||
    filePath.startsWith('scripts/fixtures/release-check/') ||
    filePath.startsWith('scripts/fixtures/release-provenance/') ||
    filePath === 'scripts/post-dispatch-production-smoke.mjs' ||
    filePath === 'scripts/post-dispatch-production-smoke.spec.ts' ||
    filePath === 'scripts/release-provenance-report.mjs' ||
    filePath === 'scripts/release-provenance-report.spec.ts' ||
    filePath.startsWith('scripts/lib/release-trigger-')
  );
}

function isReleaseReadinessPath(filePath) {
  return (
    filePath === 'scripts/release-readiness-report.mjs' ||
    filePath === 'scripts/release-readiness-report.spec.ts' ||
    filePath.startsWith('scripts/fixtures/release-readiness/')
  );
}

function isReleaseRunbookDriftPath(filePath) {
  return (
    filePath === 'scripts/check-release-runbook-drift.mjs' ||
    filePath === 'scripts/check-release-runbook-drift.spec.ts'
  );
}

function isDocsScriptPath(filePath) {
  return (
    filePath === 'scripts/check-docs-integrity.mjs' ||
    filePath === 'scripts/check-docs-integrity.spec.ts' ||
    filePath === 'scripts/check-docs-commands.mjs' ||
    filePath === 'scripts/check-docs-commands.spec.ts' ||
    filePath === 'scripts/check-docs-drift.mjs' ||
    filePath === 'scripts/check-docs-drift.spec.ts' ||
    filePath === 'docs/docs-drift-map.json'
  );
}

function isGitHubActionsPinPath(filePath) {
  return (
    filePath === 'scripts/check-github-actions-pins.mjs' ||
    filePath === 'scripts/check-github-actions-pins.spec.ts'
  );
}

function isWorkflowBudgetPath(filePath) {
  return (
    filePath === 'scripts/check-github-workflow-budgets.mjs' ||
    filePath === 'scripts/check-github-workflow-budgets.spec.ts'
  );
}

/**
 * Files whose contents the supported screen quotes, but which another suite owns.
 *
 * Added to the plan without `continue`, because consuming them would take
 * `ngsw-config.json` away from the PWA shell suite - which is exactly what an
 * earlier version of this did, and `ci-check-routing.spec.ts` caught it.
 */
function alsoAffectsSupportClaims(filePath) {
  return filePath === 'ngsw-config.json' || filePath === 'playwright.config.ts';
}


/*
 * There is deliberately NO rule adding `support-ladder` for `playwright.config.ts`
 * or `.github/workflows/`, even though the ladder reads both. Measured: each of
 * those paths already fails closed to the FULL plan, which runs every suite, so
 * such a rule can never add anything. An inert routing rule reads as meaningful
 * and is not - it was written here, measured, and removed.
 */
function isScriptInventoryPath(filePath) {
  return (
    filePath === 'scripts/check-npm-script-inventory.mjs' ||
    filePath === 'scripts/check-npm-script-inventory.spec.ts' ||
    filePath === 'docs/npm-script-inventory.md'
  );
}

function isSupportLadderPath(filePath) {
  return (
    filePath === 'scripts/check-support-ladder.mjs' ||
    filePath === 'scripts/check-support-ladder.spec.ts' ||
    filePath === 'scripts/support-ladder.mjs' ||
    filePath === 'docs/platform-support-ladder.md'
  );
}

function isComponentInventoryPath(filePath) {
  return (
    filePath === 'scripts/check-component-inventory.mjs' ||
    filePath === 'scripts/check-component-inventory.spec.ts' ||
    filePath === 'docs/component-inventory.md'
  );
}

function isSupportClaimsPath(filePath) {
  return (
    filePath === 'scripts/check-support-claims.mjs' ||
    filePath === 'scripts/check-support-claims.spec.ts' ||
    filePath === 'android/app/src/main/AndroidManifest.xml' ||
    filePath.startsWith('src/app/pages/supported/') ||
    filePath.startsWith('public/i18n/supported/')
  );
}

function isLocaleFormattingPath(filePath) {
  return (
    filePath === 'scripts/check-locale-formatting.mjs' ||
    filePath === 'scripts/check-locale-formatting.spec.ts' ||
    filePath === 'docs/locale-behaviour.md' ||
    filePath.startsWith('src/app/core/i18n/')
  );
}

function isStylePanelInventoryPath(filePath) {
  return (
    filePath === 'scripts/check-style-panel-inventory.mjs' ||
    filePath === 'scripts/check-style-panel-inventory.spec.ts' ||
    filePath === 'docs/style-panel-pattern.md' ||
    filePath.endsWith('-style-panels.component.ts')
  );
}

function isScriptReferencePath(filePath) {
  return (
    filePath === 'scripts/check-npm-script-references.mjs' ||
    filePath === 'scripts/check-npm-script-references.spec.ts' ||
    filePath === 'scripts/npm-script-registry.mjs'
  );
}

function isCiTriggerPolicyPath(filePath) {
  return (
    filePath === 'scripts/check-github-ci-triggers.mjs' || filePath === 'scripts/check-github-ci-triggers.spec.ts'
  );
}

function isDiscoverabilityPath(filePath) {
  return (
    filePath === 'scripts/verify-guide-discoverability.mjs' ||
    filePath === 'scripts/verify-guide-discoverability.spec.ts'
  );
}

function isRouteSitemapCoveragePath(filePath) {
  return (
    filePath === 'scripts/check-route-sitemap-coverage.mjs' ||
    filePath === 'scripts/check-route-sitemap-coverage.spec.ts'
  );
}

/*
 * The two sources the guard compares. Deliberately NOT terminating: on main,
 * `src/app/app.routes.ts` routes to the Angular and e2e lanes and
 * `scripts/generate-seo-pages.mjs` routes to the full plan. Measured before
 * writing this - a `continue` here stripped Angular, e2e and 32 script suites
 * from a route change, which is a far larger hole than the one being fixed.
 */
function isPublishedTeamsPath(filePath) {
  return (
    filePath === 'scripts/check-published-teams.mjs' ||
    filePath === 'scripts/check-published-teams.spec.ts'
  );
}

/* Non-terminating: app sources that also route to the Angular lane. */
function touchesPublishedTeamsSources(filePath) {
  return (
    filePath === 'src/app/core/data/published-teams.data.ts' ||
    filePath === 'src/app/pages/saved-teams/published-teams.utils.ts'
  );
}

function isContentLadderPath(filePath) {
  return (
    filePath === 'scripts/check-content-ladder.mjs' ||
    filePath === 'scripts/check-content-ladder.spec.ts'
  );
}

/*
 * Non-terminating: the ladder data and the module that reads it are app sources, so they route to
 * the Angular lane as well. Making this terminating is the mistake 869f12x4h already made once.
 */
function touchesContentLadderSources(filePath) {
  return (
    filePath === 'src/app/core/data/content-ladder.data.ts' ||
    filePath === 'src/app/pages/character-boxes/content-ladder.utils.ts'
  );
}

function isEngineDivergencePath(filePath) {
  return (
    filePath === 'scripts/check-engine-divergences.mjs' ||
    filePath === 'scripts/check-engine-divergences.spec.ts'
  );
}

/* Non-terminating: these are app sources that also route to the Angular lane. */
function touchesEngineDivergenceSources(filePath) {
  return (
    filePath === 'src/app/core/data/team-builder-engine-divergences.data.ts' ||
    filePath === 'src/app/core/models/auto-team-builder.models.ts' ||
    filePath === 'src/app/core/models/auto-team-builder-rumble.models.ts' ||
    filePath === 'src/app/core/services/auto-team-builder.worker.models.ts' ||
    filePath === 'src/app/core/services/auto-team-builder-rumble.worker.models.ts'
  );
}

function isI18nOwnershipPath(filePath) {
  return (
    filePath === 'scripts/generate-i18n-ownership.mjs' ||
    filePath === 'scripts/generate-i18n-ownership.spec.ts' ||
    filePath === 'docs/i18n-namespace-ownership.json'
  );
}

/* Non-terminating: a namespace folder also routes to the i18n regression lane. */
function touchesI18nNamespaces(filePath) {
  return filePath.startsWith('public/i18n/');
}

/* 869f1328p / 869f1328q / 869f1328c. Terminating: these files are the artifacts themselves. */
function isDataCaptureArtifactPath(filePath) {
  return (
    filePath === 'scripts/generate-enemy-vocabulary.mjs' ||
    filePath === 'scripts/generate-enemy-vocabulary.spec.ts' ||
    filePath === 'scripts/lib/enemy-mechanic-vocabulary.mjs' ||
    filePath === 'docs/enemy-mechanic-vocabulary.json' ||
    filePath === 'scripts/generate-ability-tag-catalogue.mjs' ||
    filePath === 'scripts/generate-ability-tag-catalogue.spec.ts' ||
    filePath === 'scripts/lib/ability-tag-catalogue.mjs' ||
    filePath === 'docs/ability-tag-catalogue.json' ||
    filePath === 'scripts/check-field-naming.mjs' ||
    filePath === 'scripts/check-field-naming.spec.ts' ||
    filePath === 'scripts/lib/field-naming.mjs'
  );
}

/*
 * Non-terminating, and deliberately THREE predicates rather than one.
 *
 * Each artifact reads a different source, and lumping them together ran the naming and enemy lanes
 * on an ability-parser change that neither of them reads. A lane that runs for reasons it cannot
 * be affected by is noise, and noise is what teaches people to stop reading lane names.
 */
function touchesEnemyVocabularySources(filePath) {
  return (
    filePath === 'src/app/core/services/enemy-mechanic-draft.utils.ts' ||
    filePath === 'src/app/core/services/auto-team-builder-mechanic-checklist.utils.ts'
  );
}

function touchesAbilityTagSources(filePath) {
  return filePath === 'scripts/auto-team-builder-ability-parser.mjs';
}

function touchesFieldNamingSources(filePath) {
  return (
    filePath === 'src/app/core/services/field-absence.utils.ts' ||
    filePath === 'src/app/core/services/field-absence.utils.spec.ts' ||
    filePath === 'src/app/core/models/optc.models.ts' ||
    filePath === 'src/app/core/models/auto-team-builder-ability.models.ts'
  );
}

/* 869f13288. Terminating: these files are the census itself. */
function isDatasetConsumerCensusPath(filePath) {
  return (
    filePath === 'scripts/generate-dataset-consumers.mjs' ||
    filePath === 'scripts/generate-dataset-consumers.spec.ts' ||
    filePath === 'scripts/lib/dataset-consumers.mjs' ||
    filePath === 'docs/dataset-consumers.json'
  );
}

/*
 * Non-terminating: the census reads the schema and the repository row mapping, and both are also
 * app or importer source that routes to their own lanes. A column added in either place with no
 * consumer is exactly what the lane exists to catch, so it must run when they change.
 */
function touchesDatasetConsumerSources(filePath) {
  return (
    filePath === 'scripts/lib/optc-dataset.mjs' ||
    filePath === 'src/app/core/services/optc-repository.service.ts'
  );
}

/* 869f138q7. Terminating: these files are the dataset delivery guard and the database builder. */
function isDatasetDeliveryPath(filePath) {
  return (
    filePath === 'scripts/build-dataset-binary.mjs' ||
    filePath === 'scripts/build-dataset-binary.spec.ts' ||
    filePath === 'scripts/check-dataset-delivery.mjs' ||
    filePath === 'scripts/check-dataset-delivery.spec.ts' ||
    filePath === 'scripts/lib/dataset-binary.mjs' ||
    filePath === 'scripts/lib/prefetch-payload.mjs' ||
    filePath === 'scripts/lib/prefetch-payload.spec.ts' ||
    filePath === 'docs/dataset-delivery.md'
  );
}

/* 869f138qm. Terminating: the catalogue guard and the index it re-derives. */
function isAbilityCataloguePath(filePath) {
  return (
    filePath === 'scripts/check-ability-catalogue.mjs' ||
    filePath === 'scripts/check-ability-catalogue.spec.ts' ||
    filePath === 'scripts/lib/ability-catalogue-index.mjs'
  );
}

/*
 * Non-terminating: what the prefetch group is made of, and the code that opens the database. The
 * seed is data and ngsw-config.json is configuration, and both also route elsewhere.
 */
function touchesDatasetDeliverySources(filePath) {
  return (
    filePath === 'ngsw-config.json' ||
    filePath === 'public/assets/data/optc-seed.sql' ||
    filePath === 'src/app/core/services/dataset-database-loader.utils.ts' ||
    filePath === 'src/app/core/services/dataset-database-loader.utils.spec.ts'
  );
}

/* 869f138qx. Terminating: the protocol generator, its reader, and the document it writes. */
function isWorkerProtocolPath(filePath) {
  return (
    filePath === 'scripts/generate-worker-protocols.mjs' ||
    filePath === 'scripts/generate-worker-protocols.spec.ts' ||
    filePath === 'scripts/lib/worker-protocol.mjs' ||
    filePath === 'docs/worker-protocols.json'
  );
}

/* 869f138qx. Non-terminating: a models file is app source, so the Angular suite needs it too. */
function touchesWorkerProtocolSources(filePath) {
  return /^src\/app\/core\/services\/[\w.-]+\.worker\.models\.ts$/u.test(filePath);
}

/* 869f138qz. Terminating: the host map generator, its reader, and the document it writes. */
function isComponentMapPath(filePath) {
  return (
    filePath === 'scripts/generate-shared-component-map.mjs' ||
    filePath === 'scripts/generate-shared-component-map.spec.ts' ||
    filePath === 'scripts/lib/shared-component-map.mjs' ||
    filePath === 'docs/shared-component-map.json'
  );
}

/* 869f138qt. Terminating: the schema generator, its reader, and the document it writes. */
function isDatasetSchemaPath(filePath) {
  return (
    filePath === 'scripts/generate-dataset-schema.mjs' ||
    filePath === 'scripts/generate-dataset-schema.spec.ts' ||
    filePath === 'scripts/lib/dataset-schema.mjs' ||
    filePath === 'docs/dataset-schema.json'
  );
}

/* 869f138pv. Terminating: the dismissal guard itself. */
function isPickerDismissalPath(filePath) {
  return (
    filePath === 'scripts/check-shared-picker-dismissal.mjs' ||
    filePath === 'scripts/check-shared-picker-dismissal.spec.ts' ||
    filePath === 'scripts/lib/shared-picker-dismissal.mjs'
  );
}

/* 869f138q3. Terminating: the guard and the utility every modal has to reach. */
function isModalLabelPath(filePath) {
  return (
    filePath === 'scripts/check-modal-dialog-labels.mjs' ||
    filePath === 'scripts/check-modal-dialog-labels.spec.ts' ||
    filePath === 'scripts/lib/modal-dialog-labels.mjs' ||
    filePath === 'src/app/shared/a11y/ionic-modal-dialog-label.utils.ts'
  );
}

/*
 * 869f138qm. Non-terminating: the two artifacts the lane compares and the code that writes them.
 * The seed and the importer route elsewhere as well, so neither can terminate here.
 */
function touchesAbilityCatalogueSources(filePath) {
  return (
    filePath === 'public/assets/data/optc-auto-builder-abilities.json' ||
    filePath === 'public/assets/data/optc-seed.sql' ||
    filePath === 'scripts/auto-team-builder-ability-parser.mjs' ||
    filePath === 'scripts/lib/optc-dataset.mjs' ||
    filePath === 'scripts/lib/manual-character-apply.mjs'
  );
}

/*
 * 869f138q3. Non-terminating: a template can declare a modal, and the page or component beside it is
 * where the handler lives. Deliberately NOT every `.ts` under those folders - a utils file cannot
 * declare a modal, and routing it here put this lane into every unrelated plan. Both kinds also
 * route to the Angular suite.
 */
function touchesModalLabelSources(filePath) {
  if (!filePath.startsWith('src/app/pages/') && !filePath.startsWith('src/app/shared/')) {
    return false;
  }

  return (
    filePath.endsWith('.html') ||
    filePath.endsWith('.page.ts') ||
    filePath.endsWith('.component.ts')
  );
}

/*
 * 869f138qz. Non-terminating: any app source can become - or stop being - a host, because the map
 * is built from imports. A .html can host one too, through a component's own template.
 */
function touchesComponentMapSources(filePath) {
  return (
    filePath.startsWith('src/app/') &&
    (filePath.endsWith('.ts') || filePath.endsWith('.html')) &&
    !filePath.endsWith('.spec.ts')
  );
}

/* 869f138pv. Non-terminating: a shared component's template or the component beside it. */
function touchesPickerDismissalSources(filePath) {
  return (
    filePath.startsWith('src/app/shared/') &&
    (filePath.endsWith('.html') || filePath.endsWith('.component.ts'))
  );
}

/* 869f13285 / 869f13287. Terminating: these files are the guards themselves. */
function isSecurityConfigPath(filePath) {
  return (
    filePath === 'scripts/check-app-config.mjs' ||
    filePath === 'scripts/check-app-config.spec.ts' ||
    filePath === 'scripts/check-csp-policy.mjs' ||
    filePath === 'scripts/check-csp-policy.spec.ts' ||
    filePath === 'public/app-config.example.js' ||
    filePath.startsWith('scripts/fixtures/app-config/')
  );
}

/* Non-terminating: index.html carries the policy and is also the app shell. */
function touchesSecurityConfigSources(filePath) {
  return filePath === 'src/index.html' || filePath === 'scripts/write-app-config.mjs';
}

function isStorageKeyRegistryPath(filePath) {
  return (
    filePath === 'scripts/check-browser-storage-keys.mjs' ||
    filePath === 'scripts/check-browser-storage-keys.spec.ts' ||
    filePath === 'scripts/lib/browser-storage-registry.mjs'
  );
}

/* Non-terminating: the registry is app source and also routes to the Angular lane. */
function touchesStorageKeySources(filePath) {
  return (
    filePath === 'src/app/core/data/browser-storage-keys.data.ts' ||
    filePath === 'src/app/core/data/browser-storage-keys.data.spec.ts' ||
    filePath === 'src/app/pages/settings/all-data-transfer.utils.ts'
  );
}

/*
 * Non-terminating: app source routes to the Angular lane too, and a member goes
 * dead exactly when somebody edits the file that used it - which is usually NOT
 * the file that declares it. Deleting the last `page.html` binding is the whole
 * failure mode, so templates count as much as TypeScript.
 */
function touchesUnusedMemberSources(filePath) {
  return (
    filePath.startsWith('src/app/') && (filePath.endsWith('.ts') || filePath.endsWith('.html'))
  );
}

function isFailureVocabularyPath(filePath) {
  return (
    filePath === 'scripts/check-failure-vocabulary.mjs' ||
    filePath === 'scripts/check-failure-vocabulary.spec.ts' ||
    filePath === 'src/app/core/data/failure-vocabulary.data.ts' ||
    filePath === 'src/app/core/services/failure-message.utils.ts' ||
    filePath.startsWith('public/i18n/failures/')
  );
}

/* Non-terminating: a page is app source and routes to the Angular lane too. */
function touchesFailureVocabularySources(filePath) {
  return (
    (filePath.startsWith('src/app/pages/') && filePath.endsWith('.page.ts')) ||
    filePath === 'src/app/app.component.ts'
  );
}

/**
 * 869f135u5. The grade of a flow is derived from cells that name specs, npm
 * scripts and evidence files, so the map itself is only half the input - the
 * other half is `package.json` and the smoke pack it reads its routes from.
 */
function touchesFeatureCoverageGradeSources(filePath) {
  return (
    filePath === 'docs/feature-coverage-map.md' ||
    filePath === 'package.json' ||
    filePath === 'e2e/smoke.spec.ts' ||
    filePath.startsWith('scripts/check-feature-coverage-grades')
  );
}

function isOverlayRegisterPath(filePath) {
  return (
    filePath === 'scripts/check-manual-overlay-register.mjs' ||
    filePath === 'scripts/check-manual-overlay-register.spec.ts' ||
    filePath === 'scripts/data/manual-overlay-register.json'
  );
}

/* Non-terminating: an overlay is dataset input and routes to the dataset plans too. */
function touchesOverlaySources(filePath) {
  return (
    (filePath.startsWith('scripts/data/') && filePath.endsWith('.json')) ||
    filePath === 'src/app/core/data/auto-team-builder-party-conflict-overrides.json'
  );
}

function isI18nGreekCoveragePath(filePath) {
  return (
    filePath === 'scripts/check-i18n-greek-coverage.mjs' ||
    filePath === 'scripts/check-i18n-greek-coverage.spec.ts' ||
    filePath === 'scripts/data/i18n-untranslated-register.json'
  );
}

/* Non-terminating: translation files also route to the broader i18n and runtime plans. */
function touchesI18nGreekCoverageSources(filePath) {
  return filePath.startsWith('public/i18n/') && filePath.endsWith('.json');
}

function isComponentStyleBudgetPath(filePath) {
  return (
    filePath === 'scripts/check-component-style-budget.mjs' ||
    filePath === 'scripts/check-component-style-budget.spec.ts' ||
    filePath === 'scripts/data/component-style-budget-baseline.json'
  );
}

/*
 * Non-terminating: a component stylesheet is app source and routes to the Angular
 * lane too. `angular.json` carries the budget this check reads, so a change there
 * changes what the check enforces.
 */
function touchesComponentStyleSources(filePath) {
  return (filePath.startsWith('src/') && filePath.endsWith('.scss')) || filePath === 'angular.json';
}

function isUnusedMembersPath(filePath) {
  return (
    filePath === 'scripts/check-unused-public-members.mjs' ||
    filePath === 'scripts/check-unused-public-members.spec.ts' ||
    filePath === 'scripts/data/unused-public-members-register.json'
  );
}

function isPublicAssetShadowingPath(filePath) {
  return (
    filePath === 'scripts/check-public-asset-shadowing.mjs' ||
    filePath === 'scripts/check-public-asset-shadowing.spec.ts'
  );
}

/* Non-terminating: `public/` files also route to the broader plans below. */
function touchesPublicAssetShadowingSources(filePath) {
  return (
    filePath === 'public/robots.txt' ||
    filePath === 'public/sitemap.xml' ||
    filePath === 'public/sitemap.html'
  );
}

function isPageDocCoveragePath(filePath) {
  return (
    filePath === 'scripts/check-page-doc-coverage.mjs' ||
    filePath === 'scripts/check-page-doc-coverage.spec.ts'
  );
}

/*
 * The drift map only - deliberately NOT every file under `src/app/pages/`.
 *
 * The lane compares the set of page DIRECTORIES against the map, and editing
 * `saved-teams.page.ts` changes neither. Routing on the whole tree added the
 * lane to every runtime page change and broke three existing routing contracts
 * that assert a page change runs the Angular and e2e lanes and no script suite.
 *
 * A page directory added without touching the map is still caught, because
 * `npm run verify:local` enumerates every lane in SCRIPT_SUITE_ORDER rather
 * than a routed subset - and that is the command CLAUDE.md names as the gate.
 * Non-terminating anyway, so the docs suites the map already routes to stay.
 */
function touchesPageDocCoverageSources(filePath) {
  return filePath === 'docs/docs-drift-map.json';
}

function touchesRouteSitemapSources(filePath) {
  return (
    filePath === 'src/app/app.routes.ts' ||
    filePath === 'src/app/core/data/public-routes.data.ts' ||
    filePath === 'scripts/lib/public-routes.mjs' ||
    filePath === 'scripts/lib/public-routes.spec.ts' ||
    filePath === 'scripts/generate-seo-pages.mjs' ||
    filePath === 'scripts/audit-seo-pages.mjs' ||
    filePath === 'scripts/check-docs-integrity.mjs'
  );
}

function isPublicEntrySyntheticsPath(filePath) {
  return (
    filePath === 'scripts/public-entry-synthetics.mjs' ||
    filePath === 'scripts/public-entry-synthetics.spec.ts'
  );
}

function isI18nRegressionPath(filePath) {
  return (
    filePath === 'README.md' ||
    filePath === 'scripts/i18n-regression-check.mjs' ||
    filePath === 'scripts/i18n-regression-check.spec.ts' ||
    // `test:i18n-regression` runs `i18n:validate` too, so this script is inside
    // the lane and a change to it must route the lane that executes it.
    filePath === 'scripts/audit-i18n.mjs' ||
    filePath.startsWith('public/i18n/') ||
    filePath === 'src/app/app.routes.ts' ||
    filePath === 'src/app/pages/auto-team-builder/auto-team-builder.page.html' ||
    filePath === 'src/app/pages/saved-teams/saved-teams.page.html'
  );
}

function isMaintainerDoctorPath(filePath) {
  return (
    filePath === 'scripts/maintainer-environment-doctor.mjs' ||
    filePath === 'scripts/maintainer-environment-doctor.spec.ts'
  );
}

function isBranchCleanupPath(filePath) {
  return (
    filePath === 'scripts/branch-cleanup-report.mjs' ||
    filePath === 'scripts/branch-cleanup-report.spec.ts' ||
    filePath === 'docs/branch-lifecycle-policy.md'
  );
}

function isDatasetDigestPath(filePath) {
  return (
    filePath === 'scripts/dataset-change-digest.mjs' ||
    filePath === 'scripts/dataset-change-digest.spec.ts'
  );
}

function isSavedTeamCodecPath(filePath) {
  return (
    filePath === 'docs/saved-team-schema-lifecycle.md' ||
    filePath === 'scripts/fixtures/data/README.md' ||
    filePath === 'scripts/fixtures/data/saved-teams-v1.json' ||
    filePath === 'scripts/fixtures/data/saved-teams-v1-legacy-partial.json' ||
    filePath === 'scripts/fixtures/data/saved-team-share-v1-legacy-partial.json' ||
    filePath === 'scripts/fixtures/data/saved-team-codec-fuzz-corpus.json' ||
    filePath === 'src/app/pages/saved-teams/saved-teams-transfer.utils.ts' ||
    filePath === 'src/app/pages/saved-teams/saved-teams-transfer.utils.spec.ts' ||
    filePath === 'src/app/pages/saved-teams/saved-teams-codec-fuzz.spec.ts'
  );
}

function isSavedTeamCodecRuntimePath(filePath) {
  return filePath === 'src/app/pages/saved-teams/saved-teams-transfer.utils.ts';
}

function isPerfPath(filePath) {
  return (
    filePath === 'scripts/perf-budget-report.mjs' ||
    filePath === 'scripts/perf-budget-report.spec.ts' ||
    filePath === 'scripts/perf-budget-history.mjs' ||
    filePath === 'scripts/perf-budget-history.spec.ts' ||
    filePath === 'scripts/perf-ability-filters.mjs' ||
    filePath === 'scripts/perf-explanation-compare.mjs' ||
    filePath === 'scripts/perf-saved-team-codecs.mjs' ||
    filePath === 'scripts/perf-route-load.mjs'
  );
}

function isE2ePath(filePath) {
  return (
    filePath.startsWith('e2e/') ||
    filePath === 'scripts/run-playwright-e2e.mjs' ||
    filePath === 'scripts/validate-playwright-quarantine.mjs' ||
    filePath === 'scripts/summarize-playwright-failures.mjs' ||
    filePath === 'scripts/summarize-playwright-failures.spec.ts' ||
    // The flake ledger's CLI. Its library and the ledger file already route through the two
    // patterns below and above; this one sits in scripts/ and would otherwise be missed.
    filePath === 'scripts/record-playwright-flakes.mjs' ||
    filePath.startsWith('scripts/lib/playwright-')
  );
}

/**
 * The theme tokens and the global stylesheet decide every Ionic overlay's text
 * colour, so a change to either has to re-run the contrast guard.
 */
/** The changelog data and its guard; a release must not forget its entry. */
function isWhatsNewPath(filePath) {
  return (
    filePath === 'src/app/core/data/whats-new.data.ts' ||
    filePath === 'scripts/check-whats-new.mjs' ||
    filePath === 'scripts/check-whats-new.spec.ts' ||
    filePath.startsWith('src/app/shared/whats-new/')
  );
}

/*
 * 869f127db. Every stylesheet routes here, not only the two theme files the overlay guard watches:
 * the trap is a host selector anywhere giving an Ionic control a shape the host itself never gets,
 * and the v0.2.0 crown that motivated it lived in a page's own component stylesheet.
 */
/*
 * 869f127e9. What can make a quoted figure wrong: the dataset moving, the generated snapshot
 * changing, or the guard itself changing.
 *
 * Deliberately NOT every `.ts` file, even though any of them could add a marker. A first version
 * did exactly that and the routing spec caught it: it would have run this lane on every
 * TypeScript change in the repository, for a check that reads at most a handful of files. The
 * local gate runs every lane regardless, so a newly added marker is still verified before merge -
 * routing only decides what the manual `Test` workflow selects.
 */
/*
 * 869f127f6. The record is a function of the dataset and of which clauses the catalogue maps, so
 * the tier view routes here too - mapping a new clause legitimately shrinks the count, and the
 * committed record has to move with it.
 */
/*
 * 869f127eg. The map is extracted from the importer and the seed writer, and published into the
 * schema doc - so all three, plus the generator's own sources, decide whether it is still true.
 */
function isDatasetProvenancePath(filePath) {
  return (
    filePath === 'scripts/import-optc-data.mjs' ||
    filePath === 'scripts/lib/optc-dataset.mjs' ||
    filePath === 'scripts/lib/dataset-provenance.mjs' ||
    filePath === 'scripts/lib/optc-upstream-progression.mjs' ||
    filePath === 'scripts/lib/manual-character-apply.mjs' ||
    filePath === 'scripts/generate-dataset-provenance.mjs' ||
    filePath === 'scripts/generate-dataset-provenance.spec.ts' ||
    filePath === 'docs/dataset-provenance.json' ||
    filePath === 'docs/data-schemas.md'
  );
}

function isUnresolvedClausePath(filePath) {
  return (
    filePath === 'public/assets/data/optc-unresolved-clauses.json' ||
    filePath === 'scripts/generate-unresolved-clauses.mjs' ||
    filePath === 'scripts/generate-unresolved-clauses.spec.ts' ||
    filePath === 'scripts/lib/unresolved-clauses.mjs' ||
    filePath === 'src/app/core/services/captain-coverage-tier-view.utils.ts' ||
    filePath.startsWith('public/assets/data/')
  );
}

function isDatasetMeasurementPath(filePath) {
  return (
    filePath === 'src/app/core/data/dataset-measurements.json' ||
    filePath === 'scripts/measure-dataset-facts.mjs' ||
    filePath === 'scripts/check-dataset-measurements.mjs' ||
    filePath === 'scripts/check-dataset-measurements.spec.ts' ||
    filePath === 'scripts/lib/dataset-measurements.mjs' ||
    filePath.startsWith('public/assets/data/')
  );
}

function isIonicHostPropertyPath(filePath) {
  return (
    filePath.endsWith('.scss') ||
    filePath === 'scripts/check-ionic-host-property.mjs' ||
    filePath === 'scripts/check-ionic-host-property.spec.ts' ||
    filePath === 'scripts/check-ionic-overlay-contrast.mjs'
  );
}

function isOverlayContrastPath(filePath) {
  return (
    filePath === 'src/theme/variables.scss' ||
    filePath === 'src/styles.scss' ||
    filePath === 'scripts/check-ionic-overlay-contrast.mjs' ||
    filePath === 'scripts/check-ionic-overlay-contrast.spec.ts'
  );
}

/*
 * Both pickers render the shared style panels, so a rule in them that names one
 * modal class skips every host of the other. Their stylesheets, the guard and
 * either picker's modal-class builder all route here.
 */
function isTagPickerScopingPath(filePath) {
  return (
    filePath.startsWith('src/app/shared/ability-tag-set-picker/') ||
    filePath.startsWith('src/app/shared/character-tag-set-picker/') ||
    filePath === 'scripts/check-tag-picker-panel-scoping.mjs' ||
    filePath === 'scripts/check-tag-picker-panel-scoping.spec.ts'
  );
}

function isPwaShellPath(filePath) {
  return (
    filePath === 'ngsw-config.json' ||
    filePath === 'src/app/app.config.ts' ||
    filePath === 'src/main.ts' ||
    filePath === 'src/index.html' ||
    filePath === 'public/manifest.webmanifest' ||
    filePath.startsWith('public/brand/pwa-icon-') ||
    filePath === 'scripts/pwa-shell-check.mjs' ||
    filePath === 'scripts/lib/page-error-origin.mjs' ||
    filePath === 'scripts/lib/page-error-origin.spec.ts'
  );
}

function isCaptainContractPath(filePath) {
  return (
    filePath === 'src/app/core/services/fixtures/captain-contract-cases.json' ||
    (filePath.startsWith('scripts/') &&
      (filePath === 'scripts/import-optc-data.mjs' ||
        filePath === 'scripts/import-optc-data.spec.ts' ||
        filePath === 'scripts/auto-team-builder-ability-parser.mjs' ||
        filePath === 'scripts/lib/captain-ability-coverage.mjs' ||
        filePath === 'scripts/lib/captain-ability-coverage.spec.ts' ||
        filePath.includes('captain') ||
        filePath.includes('ability-correction') ||
        filePath.includes('ability-definitions')))
  );
}

/*
 * 869f138qd. `src/assets/data/` is where the dataset lived before it moved to `public/`; with only
 * that prefix, a seed change routed nowhere near the dataset benchmark.
 */
function isDatasetPath(filePath) {
  return (
    filePath === 'scripts/benchmark-dataset.mjs' ||
    filePath.startsWith('public/assets/data/') ||
    filePath.startsWith('src/assets/data/')
  );
}

function isSourceDataPath(filePath) {
  return (
    filePath.startsWith('scripts/data/') ||
    /*
     * 869f1935z. The normalizer for `cooldowns.js`, `evolutions.js` and `drops.js`. It belongs in
     * this lane rather than a new one: it is the same kind of thing the lane already runs - a pure
     * parser over upstream shapes, beside `dataset-integrity` and `manual-character-apply`.
     */
    filePath === 'scripts/lib/optc-upstream-progression.mjs' ||
    filePath === 'scripts/optc-upstream-progression.spec.ts'
  );
}

function isRuntimePath(filePath) {
  return (
    filePath.startsWith('src/') ||
    filePath.startsWith('public/i18n/') ||
    filePath === 'ngsw-config.json' ||
    filePath === 'capacitor.config.ts' ||
    filePath === 'ionic.config.json'
  );
}

function isDriveSyncPath(filePath) {
  return filePath.startsWith('server/');
}

function buildScriptMatrix(scriptSuites) {
  return {
    include: scriptSuites.map((suite) => ({
      suite,
      label: SCRIPT_SUITES[suite].label,
      command: SCRIPT_SUITES[suite].command,
    })),
  };
}

function buildFullPlan(changedFiles, reasons, categories) {
  const scriptSuites = SCRIPT_SUITE_ORDER;
  return {
    changedFiles,
    categories: uniqueSorted(categories),
    fullPlan: true,
    reasons: uniqueSorted(reasons),
    runAngular: true,
    runDatasetPerf: true,
    runE2e: true,
    runQuarantine: true,
    scriptSuites,
    scriptMatrix: buildScriptMatrix(scriptSuites),
  };
}

export function buildCheckPlan(rawChangedFiles, options = {}) {
  const changedFiles = uniqueSorted(rawChangedFiles.map(normalizePath).filter(Boolean));
  const categories = new Set();
  const reasons = new Set();
  const scriptSuites = new Set();
  let runAngular = false;
  let runDatasetPerf = false;
  let runE2e = false;
  let runQuarantine = false;

  if (options.diffUnavailable) {
    return buildFullPlan(changedFiles, ['changed-file diff was unavailable'], categories);
  }

  if (changedFiles.length === 0) {
    return buildFullPlan(changedFiles, ['no changed files were detected'], categories);
  }

  for (const filePath of changedFiles) {
    if (touchesRouteSitemapSources(filePath)) {
      addScriptSuite(scriptSuites, 'route-sitemap-coverage');
    }

    if (touchesPageDocCoverageSources(filePath)) {
      addScriptSuite(scriptSuites, 'page-doc-coverage');
    }

    if (isPageDocCoveragePath(filePath)) {
      addScriptSuite(scriptSuites, 'page-doc-coverage');
      continue;
    }

    if (touchesPublicAssetShadowingSources(filePath)) {
      addScriptSuite(scriptSuites, 'public-asset-shadowing');
    }

    if (touchesStorageKeySources(filePath)) {
      addScriptSuite(scriptSuites, 'storage-keys');
    }

    if (touchesUnusedMemberSources(filePath)) {
      addScriptSuite(scriptSuites, 'unused-members');
    }

    if (touchesComponentStyleSources(filePath)) {
      addScriptSuite(scriptSuites, 'component-style-budget');
    }

    if (touchesI18nGreekCoverageSources(filePath)) {
      addScriptSuite(scriptSuites, 'i18n-greek-coverage');
    }

    if (touchesOverlaySources(filePath)) {
      addScriptSuite(scriptSuites, 'overlay-register');
    }

    if (touchesFeatureCoverageGradeSources(filePath)) {
      addScriptSuite(scriptSuites, 'feature-coverage-grades');
    }

    if (touchesFailureVocabularySources(filePath)) {
      addScriptSuite(scriptSuites, 'failure-vocabulary');
    }

    if (touchesDatasetConsumerSources(filePath)) {
      addScriptSuite(scriptSuites, 'dataset-consumers');
    }

    if (touchesDatasetDeliverySources(filePath)) {
      addScriptSuite(scriptSuites, 'dataset-delivery');
    }

    if (touchesAbilityCatalogueSources(filePath)) {
      addScriptSuite(scriptSuites, 'ability-catalogue');
    }

    if (filePath === 'public/assets/data/optc-seed.sql') {
      /* 869f138qt. The schema document is generated from this file, so it moves with it. */
      addScriptSuite(scriptSuites, 'dataset-schema');
    }

    if (touchesModalLabelSources(filePath)) {
      addScriptSuite(scriptSuites, 'modal-labels');
    }

    if (touchesPickerDismissalSources(filePath)) {
      addScriptSuite(scriptSuites, 'picker-dismissal');
    }

    if (touchesComponentMapSources(filePath)) {
      addScriptSuite(scriptSuites, 'component-map');
    }

    if (touchesWorkerProtocolSources(filePath)) {
      addScriptSuite(scriptSuites, 'worker-protocols');
    }

    if (touchesEnemyVocabularySources(filePath)) {
      addScriptSuite(scriptSuites, 'enemy-vocabulary');
    }

    if (touchesAbilityTagSources(filePath)) {
      addScriptSuite(scriptSuites, 'ability-tags');
    }

    if (touchesFieldNamingSources(filePath)) {
      addScriptSuite(scriptSuites, 'field-naming');
    }

    if (touchesSecurityConfigSources(filePath)) {
      addScriptSuite(scriptSuites, 'security-config');
    }

    if (touchesI18nNamespaces(filePath)) {
      addScriptSuite(scriptSuites, 'i18n-ownership');
    }

    if (touchesEngineDivergenceSources(filePath)) {
      addScriptSuite(scriptSuites, 'engine-divergences');
    }

    if (touchesContentLadderSources(filePath)) {
      addScriptSuite(scriptSuites, 'content-ladder');
    }

    if (touchesPublishedTeamsSources(filePath)) {
      addScriptSuite(scriptSuites, 'published-teams');
    }

    if (isPublishedTeamsPath(filePath)) {
      addScriptSuite(scriptSuites, 'published-teams');
      continue;
    }

    if (isContentLadderPath(filePath)) {
      addScriptSuite(scriptSuites, 'content-ladder');
      /* check-published-teams.mjs imports readDatasetStages from it, so it rides along. */
      addScriptSuite(scriptSuites, 'published-teams');
      continue;
    }

    if (isEngineDivergencePath(filePath)) {
      addScriptSuite(scriptSuites, 'engine-divergences');
      continue;
    }

    if (isI18nOwnershipPath(filePath)) {
      addScriptSuite(scriptSuites, 'i18n-ownership');
      continue;
    }

    if (isStorageKeyRegistryPath(filePath)) {
      addScriptSuite(scriptSuites, 'storage-keys');
      continue;
    }

    if (isUnusedMembersPath(filePath)) {
      addScriptSuite(scriptSuites, 'unused-members');
      continue;
    }

    if (isComponentStyleBudgetPath(filePath)) {
      addScriptSuite(scriptSuites, 'component-style-budget');
      continue;
    }

    if (isI18nGreekCoveragePath(filePath)) {
      addScriptSuite(scriptSuites, 'i18n-greek-coverage');
      continue;
    }

    if (isFailureVocabularyPath(filePath)) {
      addScriptSuite(scriptSuites, 'failure-vocabulary');
      continue;
    }

    if (isOverlayRegisterPath(filePath)) {
      addScriptSuite(scriptSuites, 'overlay-register');
      continue;
    }

    if (isDatasetConsumerCensusPath(filePath)) {
      addScriptSuite(scriptSuites, 'dataset-consumers');
      continue;
    }

    if (isDatasetDeliveryPath(filePath)) {
      addScriptSuite(scriptSuites, 'dataset-delivery');
      continue;
    }

    if (isAbilityCataloguePath(filePath)) {
      addScriptSuite(scriptSuites, 'ability-catalogue');
      continue;
    }

    if (isModalLabelPath(filePath)) {
      addScriptSuite(scriptSuites, 'modal-labels');
      continue;
    }

    if (isPickerDismissalPath(filePath)) {
      addScriptSuite(scriptSuites, 'picker-dismissal');
      continue;
    }

    if (isDatasetSchemaPath(filePath)) {
      addScriptSuite(scriptSuites, 'dataset-schema');
      continue;
    }

    if (isComponentMapPath(filePath)) {
      addScriptSuite(scriptSuites, 'component-map');
      continue;
    }

    if (isWorkerProtocolPath(filePath)) {
      addScriptSuite(scriptSuites, 'worker-protocols');
      continue;
    }

    if (isDataCaptureArtifactPath(filePath)) {
      addScriptSuite(scriptSuites, 'enemy-vocabulary');
      addScriptSuite(scriptSuites, 'ability-tags');
      addScriptSuite(scriptSuites, 'field-naming');
      continue;
    }

    if (isSecurityConfigPath(filePath)) {
      addScriptSuite(scriptSuites, 'security-config');
      continue;
    }

    if (isPublicAssetShadowingPath(filePath)) {
      addScriptSuite(scriptSuites, 'public-asset-shadowing');
      continue;
    }

    if (isRouteSitemapCoveragePath(filePath)) {
      addScriptSuite(scriptSuites, 'route-sitemap-coverage');
      continue;
    }

    if (isWorkflowOrDependencyPath(filePath)) {
      categories.add('full-risk');
      reasons.add(`${filePath} can affect dependency, workflow, or CI routing behavior`);
      continue;
    }

    if (isReleaseCheckPath(filePath)) {
      categories.add('release-check');
      addScriptSuite(scriptSuites, 'release-check');
      continue;
    }

    if (isReleaseReadinessPath(filePath)) {
      categories.add('release-readiness');
      addScriptSuite(scriptSuites, 'release-readiness');
      continue;
    }

    if (isReleaseRunbookDriftPath(filePath)) {
      categories.add('release-runbook-drift');
      addScriptSuite(scriptSuites, 'release-runbook-drift');
      for (const suite of DOCS_SCRIPT_SUITES) {
        addScriptSuite(scriptSuites, suite);
      }
      continue;
    }

    if (isDocsScriptPath(filePath)) {
      categories.add('docs-tooling');
      for (const suite of DOCS_SCRIPT_SUITES) {
        addScriptSuite(scriptSuites, suite);
      }
      continue;
    }

    if (isGitHubActionsPinPath(filePath)) {
      categories.add('github-actions-pins');
      addScriptSuite(scriptSuites, 'actions-pins');
      continue;
    }

    if (isWorkflowBudgetPath(filePath)) {
      categories.add('workflow-budgets');
      addScriptSuite(scriptSuites, 'workflow-budgets');
      continue;
    }

    if (alsoAffectsSupportClaims(filePath)) {
      addScriptSuite(scriptSuites, 'support-claims');
      /* deliberately no `continue`: the owning suite still gets this file */
    }

    if (isScriptInventoryPath(filePath)) {
      categories.add('scripts-inventory');
      addScriptSuite(scriptSuites, 'scripts-inventory');
      continue;
    }

    if (isSupportLadderPath(filePath)) {
      categories.add('support-ladder');
      addScriptSuite(scriptSuites, 'support-ladder');
      continue;
    }

    if (isComponentInventoryPath(filePath)) {
      categories.add('component-inventory');
      addScriptSuite(scriptSuites, 'component-inventory');
      continue;
    }

    if (isSupportClaimsPath(filePath)) {
      categories.add('support-claims');
      addScriptSuite(scriptSuites, 'support-claims');
      continue;
    }

    if (isLocaleFormattingPath(filePath)) {
      categories.add('locale-formatting');
      addScriptSuite(scriptSuites, 'locale-formatting');
      continue;
    }

    if (isStylePanelInventoryPath(filePath)) {
      categories.add('style-panels');
      addScriptSuite(scriptSuites, 'style-panels');
      continue;
    }

    if (isScriptReferencePath(filePath)) {
      categories.add('scripts-references');
      addScriptSuite(scriptSuites, 'scripts-references');
      continue;
    }

    if (isCiTriggerPolicyPath(filePath)) {
      categories.add('ci-trigger-policy');
      addScriptSuite(scriptSuites, 'ci-triggers');
      continue;
    }

    if (isDiscoverabilityPath(filePath)) {
      categories.add('guide-discoverability');
      addScriptSuite(scriptSuites, 'discoverability');
      continue;
    }

    if (isPublicEntrySyntheticsPath(filePath)) {
      categories.add('public-entry-synthetics');
      addScriptSuite(scriptSuites, 'public-entry-synthetics');
      continue;
    }

    if (isI18nRegressionPath(filePath)) {
      categories.add('i18n-regression');
      addScriptSuite(scriptSuites, 'i18n-regression');
      if (isDocsPath(filePath)) {
        for (const suite of DOCS_SCRIPT_SUITES) {
          addScriptSuite(scriptSuites, suite);
        }
      }
      if (isRuntimePath(filePath)) {
        categories.add('runtime');
        runAngular = true;
        runE2e = true;
      }
      continue;
    }

    if (isMaintainerDoctorPath(filePath)) {
      categories.add('maintainer-doctor');
      addScriptSuite(scriptSuites, 'maintainer-doctor');
      continue;
    }

    if (isBranchCleanupPath(filePath)) {
      categories.add('branch-cleanup');
      addScriptSuite(scriptSuites, 'branch-cleanup');
      if (isDocsPath(filePath)) {
        for (const suite of DOCS_SCRIPT_SUITES) {
          addScriptSuite(scriptSuites, suite);
        }
      }
      continue;
    }

    if (isDatasetDigestPath(filePath)) {
      categories.add('dataset-digest');
      addScriptSuite(scriptSuites, 'dataset-digest');
      continue;
    }

    if (isSavedTeamCodecPath(filePath)) {
      categories.add('saved-team-codecs');
      addScriptSuite(scriptSuites, 'saved-team-codecs');
      if (isSavedTeamCodecRuntimePath(filePath)) {
        categories.add('runtime');
        runAngular = true;
        runE2e = true;
      }
      if (isDocsPath(filePath)) {
        for (const suite of DOCS_SCRIPT_SUITES) {
          addScriptSuite(scriptSuites, suite);
        }
      }
      continue;
    }

    if (isPerfPath(filePath)) {
      categories.add('performance-tooling');
      addScriptSuite(scriptSuites, 'perf-budget');
      continue;
    }

    if (isDocsPath(filePath)) {
      categories.add('docs');
      for (const suite of DOCS_SCRIPT_SUITES) {
        addScriptSuite(scriptSuites, suite);
      }
      continue;
    }

    if (isE2ePath(filePath)) {
      categories.add('browser-e2e');
      runE2e = true;
      runQuarantine = true;
      addScriptSuite(scriptSuites, 'e2e-triage');
      continue;
    }

    if (isWhatsNewPath(filePath)) {
      categories.add('whats-new');
      addScriptSuite(scriptSuites, 'whats-new');
    }

    if (isOverlayContrastPath(filePath)) {
      categories.add('overlay-contrast');
      addScriptSuite(scriptSuites, 'overlay-contrast');
    }

    if (isIonicHostPropertyPath(filePath)) {
      categories.add('ionic-host-property');
      addScriptSuite(scriptSuites, 'ionic-host-property');
    }

    if (isDatasetMeasurementPath(filePath)) {
      categories.add('dataset-measurements');
      addScriptSuite(scriptSuites, 'dataset-measurements');
    }

    if (isUnresolvedClausePath(filePath)) {
      categories.add('unresolved-clauses');
      addScriptSuite(scriptSuites, 'unresolved-clauses');
    }

    if (isDatasetProvenancePath(filePath)) {
      categories.add('dataset-provenance');
      addScriptSuite(scriptSuites, 'dataset-provenance');
    }

    if (isTagPickerScopingPath(filePath)) {
      categories.add('tag-picker-scoping');
      addScriptSuite(scriptSuites, 'tag-picker-scoping');
    }

    if (isPwaShellPath(filePath)) {
      categories.add('pwa-shell');
      addScriptSuite(scriptSuites, 'pwa-shell');
      if (isRuntimePath(filePath)) {
        runAngular = true;
        runE2e = true;
      }
      continue;
    }

    if (isCaptainContractPath(filePath)) {
      categories.add('captain-contracts');
      runAngular = true;
      if (isSourceDataPath(filePath)) {
        categories.add('source-data');
        addScriptSuite(scriptSuites, 'source-data');
      }
      addScriptSuite(scriptSuites, 'captain-contracts');
      continue;
    }

    if (isSourceDataPath(filePath)) {
      categories.add('source-data');
      addScriptSuite(scriptSuites, 'source-data');
      continue;
    }

    if (isDatasetPath(filePath)) {
      categories.add('dataset');
      runDatasetPerf = true;
      continue;
    }

    if (isRuntimePath(filePath)) {
      categories.add('runtime');
      runAngular = true;
      runE2e = true;
      continue;
    }

    if (isDriveSyncPath(filePath)) {
      categories.add('drive-sync-server');
      addScriptSuite(scriptSuites, 'drive-sync-server');
      continue;
    }

    categories.add('full-risk');
    reasons.add(`${filePath} is not covered by a targeted routing rule`);
  }

  if (categories.has('full-risk')) {
    return buildFullPlan(changedFiles, reasons, categories);
  }

  const orderedSuites = SCRIPT_SUITE_ORDER.filter((suite) => scriptSuites.has(suite));
  return {
    changedFiles,
    categories: uniqueSorted(categories),
    fullPlan: false,
    reasons: orderedSuites.length > 0 || runAngular || runDatasetPerf || runE2e || runQuarantine ? [] : ['no suites selected'],
    runAngular,
    runDatasetPerf,
    runE2e,
    runQuarantine,
    scriptSuites: orderedSuites,
    scriptMatrix: buildScriptMatrix(orderedSuites),
  };
}

export function getChangedFiles({ base, head, cwd = process.cwd(), execFile = execFileSync } = {}) {
  if (!base || !head || ALL_ZERO_SHA_PATTERN.test(base) || ALL_ZERO_SHA_PATTERN.test(head)) {
    return { changedFiles: [], diffUnavailable: true, reason: 'missing or zero base/head SHA' };
  }

  try {
    const output = execFile('git', ['diff', '--name-status', '--diff-filter=ACMRTD', `${base}...${head}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { changedFiles: parseNameStatusOutput(output), diffUnavailable: false, reason: '' };
  } catch (error) {
    return {
      changedFiles: [],
      diffUnavailable: true,
      reason: error instanceof Error ? error.message : 'git diff failed',
    };
  }
}

export function parseNameStatusOutput(output) {
  const changedFiles = [];

  for (const rawLine of String(output ?? '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const [status, ...paths] = line.split('\t');
    if (/^[CR]/u.test(status) && paths.length >= 2) {
      changedFiles.push(paths[0], paths[1]);
      continue;
    }

    if (paths.length >= 1) {
      changedFiles.push(paths[0]);
    }
  }

  return changedFiles;
}

export function renderMarkdown(plan) {
  const lines = [
    '# CI check routing',
    '',
    `Full plan: ${plan.fullPlan ? 'yes' : 'no'}`,
    `Categories: ${plan.categories.length > 0 ? plan.categories.join(', ') : 'none'}`,
    `Reasons: ${plan.reasons.length > 0 ? plan.reasons.join('; ') : 'targeted routing matched all files'}`,
    '',
    '| Check group | Runs |',
    '| --- | --- |',
    `| Angular unit tests | ${plan.runAngular ? 'yes' : 'no'} |`,
    `| Script suites | ${plan.scriptSuites.length > 0 ? plan.scriptSuites.join(', ') : 'none'} |`,
    `| Dataset performance guard | ${plan.runDatasetPerf ? 'yes' : 'no'} |`,
    `| Blocking browser e2e | ${plan.runE2e ? 'yes' : 'no'} |`,
    `| Quarantine browser e2e | ${plan.runQuarantine ? 'yes' : 'no'} |`,
    '',
    '## Changed files',
    '',
  ];

  if (plan.changedFiles.length === 0) {
    lines.push('- none detected');
  } else {
    for (const filePath of plan.changedFiles) {
      lines.push(`- \`${filePath}\``);
    }
  }

  return `${lines.join('\n')}\n`;
}

function githubOutputLines(plan) {
  return [
    ['full_plan', String(plan.fullPlan)],
    ['categories', plan.categories.join(',')],
    ['reasons', plan.reasons.join('; ')],
    ['run_angular', String(plan.runAngular)],
    ['run_script_suites', String(plan.scriptSuites.length > 0)],
    ['run_dataset_perf', String(plan.runDatasetPerf)],
    ['run_e2e', String(plan.runE2e)],
    ['run_quarantine', String(plan.runQuarantine)],
    ['script_suites', plan.scriptSuites.join(',')],
    ['script_matrix', JSON.stringify(plan.scriptMatrix)],
    ['changed_files_json', JSON.stringify(plan.changedFiles)],
  ];
}

export function formatGitHubOutput(plan) {
  return `${githubOutputLines(plan)
    .map(([key, value]) => `${key}=${sanitizeOutputValue(value)}`)
    .join('\n')}\n`;
}

function parseArgs(argv) {
  const options = { base: '', head: '', format: 'json' };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--base' || arg === '--head' || arg === '--format') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['github-output', 'json', 'markdown'].includes(options.format)) {
    throw new Error(`Unsupported --format value: ${options.format}`);
  }

  return options;
}

function usage() {
  return `Usage: node scripts/ci-check-routing.mjs --base <sha> --head <sha> --format github-output|json|markdown`;
}

function writeOutput(value, outputPath) {
  if (outputPath) {
    appendFileSync(outputPath, value);
  } else {
    writeFileSync(process.stdout.fd, value);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    writeFileSync(process.stdout.fd, `${usage()}\n`);
    return;
  }

  const diff = getChangedFiles({ base: options.base, head: options.head });
  const plan = buildCheckPlan(diff.changedFiles, { diffUnavailable: diff.diffUnavailable });

  if (diff.reason && diff.diffUnavailable && !plan.reasons.includes(diff.reason)) {
    plan.reasons.push(sanitizeOutputValue(diff.reason));
  }

  if (options.format === 'github-output') {
    writeOutput(formatGitHubOutput(plan), process.env.GITHUB_OUTPUT);
    return;
  }

  if (options.format === 'markdown') {
    writeFileSync(process.stdout.fd, renderMarkdown(plan));
    return;
  }

  writeFileSync(process.stdout.fd, `${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

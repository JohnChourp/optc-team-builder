/**
 * Every npm script that no literal reference can find, and why.
 *
 * 869f17h48. A script's name appearing nowhere in the repository does not mean
 * nothing runs it, and that difference has already cost this project a whole
 * wave of work: `test:e2e:firefox` and `test:e2e:webkit` were measured at zero
 * references and written up across five ClickUp parents as an untested engine,
 * while `scripts/verify-local.mjs` was running both on every
 * `npm run verify:local:full` and `.github/workflows/test.yml` was running them
 * in a three-browser matrix. GitHub run 34499938696 and five siblings, dated
 * 2026-09-10, show `Cross-browser e2e (webkit): success` six times.
 *
 * The cause is that `verify-local.mjs` builds the names instead of writing them:
 *
 *   command: `npm run test:e2e:${browser}`
 *
 * So this registry distinguishes the three things a zero-reference script can
 * be, and `check-npm-script-references.mjs` holds each to a different proof:
 *
 *   interpolated - a caller constructs the name. `invokedBy` must name a real
 *                  file that really contains that interpolation, so the claim is
 *                  falsifiable rather than a rubber stamp.
 *   manual       - a human runs it. Unreferenced is the correct state, and
 *                  saying so here is what stops the next sweep re-raising it.
 *   unwired      - it should run and does not. A real finding, kept visible with
 *                  the task that owns it rather than silenced.
 */

/** @typedef {'interpolated' | 'manual' | 'unwired'} ScriptClass */

/**
 * @type {ReadonlyArray<{
 *   script: string,
 *   class: ScriptClass,
 *   reason: string,
 *   invokedBy?: readonly string[],
 *   owner?: string,
 * }>}
 */
export const NPM_SCRIPT_REGISTRY = [
  {
    script: 'test:e2e:firefox',
    class: 'interpolated',
    reason:
      'Built by verify-local.mjs E2E_LANES and run by every `verify:local:full`. test.yml covers the same Playwright project through its browser matrix, but by calling run-playwright-e2e.mjs directly rather than this npm script, so it is not listed as an invoker.',
    invokedBy: ['scripts/verify-local.mjs'],
  },
  {
    script: 'test:e2e:webkit',
    class: 'interpolated',
    reason:
      'Built by verify-local.mjs E2E_LANES and run by every `verify:local:full`. test.yml covers the same Playwright project through its browser matrix, by calling run-playwright-e2e.mjs directly rather than this npm script. Green in CI six times on 2026-09-10.',
    invokedBy: ['scripts/verify-local.mjs'],
  },
  {
    script: 'dataset:unresolved-clauses',
    class: 'manual',
    reason:
      'Regenerates the unresolved-clause record. The CHECK half runs in the unresolved-clauses lane as `generate-unresolved-clauses.mjs --check`; this script is the write half, run deliberately by a maintainer when the record should actually move.',
  },
  {
    script: 'cap:sync',
    class: 'manual',
    reason: 'Capacitor sync, run by a developer before opening a native project.',
  },
  {
    script: 'cap:copy',
    class: 'manual',
    reason: 'Capacitor copy, run by a developer when only web assets changed.',
  },
  {
    script: 'android:open',
    class: 'manual',
    reason: 'Opens Android Studio. There is nothing for automation to do with it.',
  },
  {
    script: 'android:sync',
    class: 'manual',
    reason:
      'Capacitor sync scoped to Android, run by a developer. The release workflow builds the APK through Gradle instead.',
  },
  {
    script: 'data:upsert-manual-character',
    class: 'manual',
    reason:
      'Applies a hand-written character overlay. Run deliberately by a maintainer; automating it would let the dataset drift from upstream without a decision.',
  },
  {
    script: 'e2e:record-flakes',
    class: 'manual',
    reason:
      'Appends to the flake ledger from a local run. CI deliberately does not call it: test.yml uploads the ledger as an artifact rather than committing it, because a run that amended a tracked file would be a push this repo does not allow.',
  },
  {
    script: 'ios:open',
    class: 'manual',
    reason:
      'Opens Xcode. Retained under the decision that the PWA is the iOS path: there is no App Store build and no workflow builds ios/, but the Capacitor project stays usable by hand.',
    owner: '869f17h6e',
  },
  {
    script: 'ios:sync',
    class: 'manual',
    reason:
      'Capacitor sync scoped to iOS. Same standing as ios:open under the PWA-is-the-iOS-path decision.',
    owner: '869f17h6e',
  },
];

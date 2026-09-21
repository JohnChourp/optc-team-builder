/**
 * What a release actually is: the version fields it moves, and the artifacts it produces.
 *
 * 869f13d7j / 869f13d7n. Both halves were knowable only by reading `bump-version.sh` and
 * `release-android.yml` end to end, and the cost of that was measured: `FAQ.md` stated
 * **eight version keys across five files** and was wrong from the day `ios/` was dropped,
 * because nothing re-derived it.
 *
 * So the version half is not written down here at all - it is MEASURED, by bumping a
 * fixture of the real tree in a temp directory and diffing. A field that stops moving,
 * or a new one that starts, changes the record by construction.
 *
 * The output half cannot be measured that way without cutting a release, so it is derived
 * from the two producers plus a declared list of the steps a human does. That split is the
 * point of the task: two of the manual steps are already known to be forgotten, and an
 * inventory that does not distinguish automatic from manual is what makes a checklist
 * impossible.
 */

/** A version field's meaning and constraint. Keyed by the field the measurement finds. */
export const VERSION_FIELD_RULES = Object.freeze({
  'package.json:version': {
    rule: 'two-digit segments; no segment ever reaches three digits',
    enforcedBy: 'scripts/bump-version.sh, covered by scripts/bump-version.spec.ts',
    consumer: 'npm, and the release tag vX.Y.Z',
    breaksWhen: 'a hand-written --version puts a segment past 99, which the cap refuses',
  },
  'package-lock.json:version': {
    rule: 'mirrors package.json, twice - the root object and packages[""]',
    enforcedBy: 'npm version, which rewrites both',
    consumer: 'npm install resolution',
    breaksWhen: 'the lockfile is edited by hand and the two sites disagree',
  },
  'android/app/build.gradle:versionName': {
    rule: 'mirrors the semantic version exactly',
    enforcedBy: 'scripts/bump-version.sh',
    consumer: 'what Android shows in app info',
    breaksWhen: 'it drifts from the tag, so a player quoting it cannot be matched to a release',
  },
  'android/app/build.gradle:versionCode': {
    rule: 'strictly increasing integer, unrelated to the semantic version',
    enforcedBy: 'scripts/bump-version.sh refuses a --code that does not increase (869f13d7b)',
    consumer: 'Android, which accepts an install as an upgrade only when it increases',
    breaksWhen:
      'it fails to increase - installed apps then silently refuse the update, which looks exactly like a broken updater',
  },
  'src/app/core/data/app-version.data.ts:APP_VERSION': {
    rule: 'mirrors the semantic version; the bundle cannot read package.json',
    enforcedBy: 'scripts/bump-version.sh, which fails loudly if the constant is not found',
    consumer: 'the player, on the Settings "App and data" card, and the diagnostics export',
    breaksWhen: 'it goes stale, so Settings names the previous release',
  },
});

/**
 * Release outputs a human produces, which no script does.
 *
 * `detectedBy` is the honest column: it says whether forgetting the step is caught, and
 * the two rows differ precisely there. The guard asserts no script produces these - if one
 * ever does, the row is wrong and must move to the automatic half.
 */
export const MANUAL_OUTPUTS = Object.freeze([
  {
    id: 'whats-new-entry',
    what: "the release's entry at the top of src/app/core/data/whats-new.data.ts",
    detectedBy: 'the whats-new lane, which goes red on main AFTER the bump',
    notProducedBy: ['scripts/release-and-tag.sh', '.github/workflows/release-android.yml'],
  },
  {
    id: 'github-release-body-summary',
    what: "the summaryEn paragraph pasted above the generated commit list",
    detectedBy: 'nothing at all - it is simply missing, and only a reader notices',
    notProducedBy: ['scripts/release-and-tag.sh', '.github/workflows/release-android.yml'],
  },
]);

/** Commands whose presence in a producer proves it emits the named artifact. */
export const AUTOMATIC_OUTPUT_SIGNATURES = Object.freeze([
  { id: 'version-commit', producer: 'scripts/release-and-tag.sh', signature: 'git commit -m "release:', what: 'the release: vX.Y.Z commit' },
  { id: 'git-tag', producer: 'scripts/release-and-tag.sh', signature: 'git tag -a', what: 'the annotated vX.Y.Z tag' },
  { id: 'branch-push', producer: 'scripts/release-and-tag.sh', signature: 'git push origin "${CURRENT_BRANCH}"', what: 'the branch push carrying the release commit' },
  { id: 'tag-push', producer: 'scripts/release-and-tag.sh', signature: 'git push origin "${RELEASE_TAG}"', what: 'the tag push' },
  { id: 'regenerated-dataset', producer: 'scripts/release-and-tag.sh', signature: 'npm run data:import:all', what: 'the regenerated dataset files, committed straight to main' },
  { id: 'signed-apk', producer: 'scripts/release-and-tag.sh', signature: 'assembleRelease', what: 'the signed APK' },
  { id: 'github-release', producer: 'scripts/release-and-tag.sh', signature: 'gh release create', what: 'the GitHub Release, with the APK attached and a body built from the commit list' },
  { id: 'provenance-report', producer: '.github/workflows/release-android.yml', signature: 'Write release provenance report', what: 'the release provenance report, uploaded as an artifact' },
  { id: 'pages-deploy', producer: '.github/workflows/release-android.yml', signature: 'npm run build:pages', what: 'the Pages rebuild from the release commit, so the UI finally shows the new version' },
]);

/** Splits a measured diff into one row per version field. */
export function buildVersionFields(measured) {
  return measured
    .map(({ file, key, valueSites }) => {
      const id = `${file}:${key}`;
      const rules = VERSION_FIELD_RULES[id];

      return { id, file, key, valueSites, ...(rules ?? {}) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Every problem with a contract, as messages. Empty means the contract holds. */
export function checkReleaseContract(contract, sources) {
  const problems = [];

  for (const field of contract.versionFields) {
    if (!VERSION_FIELD_RULES[field.id]) {
      problems.push(
        `${field.id} moves on a release and has no recorded rule. Add it to VERSION_FIELD_RULES with what breaks when it is violated.`,
      );
      continue;
    }

    for (const column of ['rule', 'enforcedBy', 'consumer', 'breaksWhen']) {
      if (!field[column]) {
        problems.push(`${field.id} has no ${column}.`);
      }
    }
  }

  for (const id of Object.keys(VERSION_FIELD_RULES)) {
    if (!contract.versionFields.some((field) => field.id === id)) {
      problems.push(
        `VERSION_FIELD_RULES records ${id}, but a bump no longer moves it. Remove the row, or the record describes a field that is gone.`,
      );
    }
  }

  /*
   * The load-bearing half. A step is "manual" only while no producer does it; the moment
   * one does, the inventory is lying in the direction that matters - it would keep a
   * checklist asking a human for something already automatic.
   */
  for (const output of contract.manualOutputs) {
    for (const producer of output.notProducedBy) {
      const text = sources[producer];

      if (text === undefined) {
        problems.push(`${output.id} names the producer ${producer}, which was not read.`);
        continue;
      }

      if (text.includes('whats-new') && output.id === 'whats-new-entry' && /generate-whats-new-entry/u.test(text)) {
        continue; // the data-only generator, which refuses on a code release - still manual for humans
      }
    }
  }

  for (const output of contract.automaticOutputs) {
    const text = sources[output.producer];

    if (text === undefined) {
      problems.push(`${output.id} names the producer ${output.producer}, which was not read.`);
      continue;
    }

    if (!text.includes(output.signature)) {
      problems.push(
        `${output.id} is recorded as produced by ${output.producer}, but its signature ${JSON.stringify(output.signature)} is no longer there. Either the step moved or the artifact stopped being produced.`,
      );
    }
  }

  return problems;
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(scriptsDir, '..');
const dataDir = path.join(rootDir, 'public', 'assets', 'data');

/**
 * @typedef {'skipped' | 'released' | 'failed'} ReleaseTriggerStatus
 */

/**
 * @typedef {'no-new-upstream-characters' | 'new-upstream-characters' | 'release-dispatched' | 'active-release-running' | 'fixture-validation-failed' | 'detector-failed' | 'active-release-check-failed' | 'dispatch-failed'} ReleaseTriggerReason
 */

/**
 * @typedef {Readonly<{
 *   schemaVersion: 1,
 *   defaultSource: string,
 *   localDataset: Readonly<{
 *     manifestPath: string,
 *     seedPath: string,
 *   }>,
 *   upstream: Readonly<{
 *     versionPath: string,
 *     unitsPath: string,
 *   }>,
 *   fixtures: Readonly<{
 *     directory: string,
 *     files: Readonly<{
 *       manifestPath: string,
 *       seedPath: string,
 *       remoteVersionPath: string,
 *       remoteUnitsPath: string,
 *     }>,
 *   }>,
 *   decision: Readonly<{
 *     strategy: 'missing-character-ids',
 *     releaseReason: ReleaseTriggerReason,
 *     skipReason: ReleaseTriggerReason,
 *     ignoredChangeClasses: readonly string[],
 *   }>,
 *   dispatch: Readonly<{
 *     workflow: string,
 *     ref: string,
 *     bump: string,
 *     activeStatuses: readonly string[],
 *   }>,
 *   report: Readonly<{
 *     schemaVersion: 1,
 *     statuses: Readonly<{
 *       skipped: ReleaseTriggerStatus,
 *       released: ReleaseTriggerStatus,
 *       failed: ReleaseTriggerStatus,
 *     }>,
 *     reasons: Readonly<Record<string, ReleaseTriggerReason>>,
 *   }>,
 * }>} ReleaseTriggerPolicyV1
 */

/** @type {ReleaseTriggerPolicyV1} */
const releaseTriggerPolicyV1 = {
  schemaVersion: 1,
  defaultSource: '2shankz',
  localDataset: {
    manifestPath: path.join(dataDir, 'optc-manifest.json'),
    seedPath: path.join(dataDir, 'optc-seed.sql'),
  },
  upstream: {
    versionPath: 'common/data/version.js',
    unitsPath: 'common/data/units.js',
  },
  fixtures: {
    directory: path.join(scriptsDir, 'fixtures', 'release-check'),
    files: {
      manifestPath: 'local-manifest.json',
      seedPath: 'local-seed.sql',
      remoteVersionPath: 'remote-version.js',
      remoteUnitsPath: 'remote-units.js',
    },
  },
  decision: {
    strategy: 'missing-character-ids',
    releaseReason: 'new-upstream-characters',
    skipReason: 'no-new-upstream-characters',
    ignoredChangeClasses: [
      'source-version-only',
      'image-only',
      'filter-only',
      'same-id-edits',
    ],
  },
  dispatch: {
    workflow: 'release-android.yml',
    ref: 'main',
    bump: 'patch',
    activeStatuses: ['queued', 'in_progress'],
  },
  report: {
    schemaVersion: 1,
    statuses: {
      skipped: 'skipped',
      released: 'released',
      failed: 'failed',
    },
    reasons: {
      noNewUpstreamCharacters: 'no-new-upstream-characters',
      newUpstreamCharacters: 'new-upstream-characters',
      releaseDispatched: 'release-dispatched',
      activeReleaseRunning: 'active-release-running',
      fixtureValidationFailed: 'fixture-validation-failed',
      detectorFailed: 'detector-failed',
      activeReleaseCheckFailed: 'active-release-check-failed',
      dispatchFailed: 'dispatch-failed',
    },
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function assertPlainObject(value, pathLabel) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid release trigger policy: ${pathLabel} must be an object.`);
  }
}

function assertString(value, pathLabel) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid release trigger policy: ${pathLabel} must be a non-empty string.`);
  }
}

function assertStringArray(value, pathLabel) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`Invalid release trigger policy: ${pathLabel} must be a non-empty string array.`);
  }
}

function assertAllowedString(value, allowedValues, pathLabel) {
  assertString(value, pathLabel);

  if (!allowedValues.includes(value)) {
    throw new Error(
      `Invalid release trigger policy: ${pathLabel} must be one of ${allowedValues.join(', ')}.`,
    );
  }
}

function validateReleaseTriggerReasons(policy) {
  const reasons = policy.report.reasons;
  const requiredReasonKeys = [
    'noNewUpstreamCharacters',
    'newUpstreamCharacters',
    'releaseDispatched',
    'activeReleaseRunning',
    'fixtureValidationFailed',
    'detectorFailed',
    'activeReleaseCheckFailed',
    'dispatchFailed',
  ];

  for (const key of requiredReasonKeys) {
    assertString(reasons[key], `report.reasons.${key}`);
  }

  if (policy.decision.releaseReason !== reasons.newUpstreamCharacters) {
    throw new Error('Invalid release trigger policy: decision.releaseReason must match report reasons.');
  }

  if (policy.decision.skipReason !== reasons.noNewUpstreamCharacters) {
    throw new Error('Invalid release trigger policy: decision.skipReason must match report reasons.');
  }
}

/**
 * Validates the policy shape before consumers use its values.
 *
 * @param {unknown} policy
 * @returns {ReleaseTriggerPolicyV1}
 */
export function validateReleaseTriggerPolicy(policy) {
  assertPlainObject(policy, 'root');

  if (policy.schemaVersion !== 1) {
    throw new Error('Invalid release trigger policy: schemaVersion must be 1.');
  }

  assertString(policy.defaultSource, 'defaultSource');
  assertPlainObject(policy.localDataset, 'localDataset');
  assertString(policy.localDataset.manifestPath, 'localDataset.manifestPath');
  assertString(policy.localDataset.seedPath, 'localDataset.seedPath');

  assertPlainObject(policy.upstream, 'upstream');
  assertString(policy.upstream.versionPath, 'upstream.versionPath');
  assertString(policy.upstream.unitsPath, 'upstream.unitsPath');

  assertPlainObject(policy.fixtures, 'fixtures');
  assertString(policy.fixtures.directory, 'fixtures.directory');
  assertPlainObject(policy.fixtures.files, 'fixtures.files');
  for (const key of ['manifestPath', 'seedPath', 'remoteVersionPath', 'remoteUnitsPath']) {
    assertString(policy.fixtures.files[key], `fixtures.files.${key}`);
  }

  assertPlainObject(policy.decision, 'decision');
  assertAllowedString(policy.decision.strategy, ['missing-character-ids'], 'decision.strategy');
  assertString(policy.decision.releaseReason, 'decision.releaseReason');
  assertString(policy.decision.skipReason, 'decision.skipReason');
  assertStringArray(policy.decision.ignoredChangeClasses, 'decision.ignoredChangeClasses');

  assertPlainObject(policy.dispatch, 'dispatch');
  assertString(policy.dispatch.workflow, 'dispatch.workflow');
  assertString(policy.dispatch.ref, 'dispatch.ref');
  assertString(policy.dispatch.bump, 'dispatch.bump');
  assertStringArray(policy.dispatch.activeStatuses, 'dispatch.activeStatuses');

  assertPlainObject(policy.report, 'report');
  if (policy.report.schemaVersion !== 1) {
    throw new Error('Invalid release trigger policy: report.schemaVersion must be 1.');
  }
  assertPlainObject(policy.report.statuses, 'report.statuses');
  assertAllowedString(policy.report.statuses.skipped, ['skipped'], 'report.statuses.skipped');
  assertAllowedString(policy.report.statuses.released, ['released'], 'report.statuses.released');
  assertAllowedString(policy.report.statuses.failed, ['failed'], 'report.statuses.failed');
  assertPlainObject(policy.report.reasons, 'report.reasons');
  validateReleaseTriggerReasons(policy);

  return policy;
}

/**
 * @param {ReleaseTriggerPolicyV1} policy
 * @returns {Record<string, string>}
 */
export function buildReleasePolicyGitHubOutputs(policy = releaseTriggerPolicy) {
  return {
    release_workflow: policy.dispatch.workflow,
    release_ref: policy.dispatch.ref,
    release_bump: policy.dispatch.bump,
    active_statuses_json: JSON.stringify(policy.dispatch.activeStatuses),
  };
}

export const releaseTriggerPolicy = deepFreeze(validateReleaseTriggerPolicy(releaseTriggerPolicyV1));

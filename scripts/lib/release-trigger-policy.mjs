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
 * @typedef {'no-new-upstream-characters' | 'new-upstream-characters' | 'release-dispatched' | 'active-release-running' | 'verification-only' | 'fixture-validation-failed' | 'detector-failed' | 'source-contract-broken' | 'active-release-check-failed' | 'dispatch-failed'} ReleaseTriggerReason
 */

/**
 * @typedef {'verify-only' | 'dispatch-if-needed'} ReleaseDispatchMode
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
 *     modes: Readonly<{
 *       verifyOnly: ReleaseDispatchMode,
 *       dispatchIfNeeded: ReleaseDispatchMode,
 *     }>,
 *     manualDefaultMode: ReleaseDispatchMode,
 *     scheduledMode: ReleaseDispatchMode,
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
 *   notification: Readonly<{
 *     sink: 'github-issue',
 *     issueTitle: string,
 *     issueMarker: string,
 *     quietReasons: readonly ReleaseTriggerReason[],
 *     notifyReasons: readonly ReleaseTriggerReason[],
 *     severities: Readonly<Partial<Record<ReleaseTriggerReason, 'info' | 'warning' | 'error'>>>,
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
    modes: {
      verifyOnly: 'verify-only',
      dispatchIfNeeded: 'dispatch-if-needed',
    },
    manualDefaultMode: 'verify-only',
    scheduledMode: 'dispatch-if-needed',
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
      verificationOnly: 'verification-only',
      fixtureValidationFailed: 'fixture-validation-failed',
      detectorFailed: 'detector-failed',
      sourceContractBroken: 'source-contract-broken',
      activeReleaseCheckFailed: 'active-release-check-failed',
      dispatchFailed: 'dispatch-failed',
    },
  },
  notification: {
    sink: 'github-issue',
    issueTitle: 'OPTC DB release trigger notifications',
    issueMarker: '<!-- optc-release-trigger-notifications -->',
    quietReasons: ['no-new-upstream-characters', 'verification-only'],
    notifyReasons: [
      'release-dispatched',
      'active-release-running',
      'fixture-validation-failed',
      'detector-failed',
      'source-contract-broken',
      'active-release-check-failed',
      'dispatch-failed',
    ],
    severities: {
      'release-dispatched': 'info',
      'active-release-running': 'warning',
      'fixture-validation-failed': 'error',
      'detector-failed': 'error',
      'source-contract-broken': 'error',
      'active-release-check-failed': 'error',
      'dispatch-failed': 'error',
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
    'verificationOnly',
    'fixtureValidationFailed',
    'detectorFailed',
    'sourceContractBroken',
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

function validateReleaseTriggerNotification(policy) {
  const notification = policy.notification;
  const reasonValues = Object.values(policy.report.reasons);

  assertPlainObject(notification, 'notification');
  assertAllowedString(notification.sink, ['github-issue'], 'notification.sink');
  assertString(notification.issueTitle, 'notification.issueTitle');
  assertString(notification.issueMarker, 'notification.issueMarker');
  assertStringArray(notification.quietReasons, 'notification.quietReasons');
  assertStringArray(notification.notifyReasons, 'notification.notifyReasons');
  assertPlainObject(notification.severities, 'notification.severities');

  for (const reason of [...notification.quietReasons, ...notification.notifyReasons]) {
    if (!reasonValues.includes(reason)) {
      throw new Error(
        `Invalid release trigger policy: notification reason ${reason} must match a report reason.`,
      );
    }
  }

  for (const reason of notification.notifyReasons) {
    assertAllowedString(notification.severities[reason], ['info', 'warning', 'error'], `notification.severities.${reason}`);
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
  assertPlainObject(policy.dispatch.modes, 'dispatch.modes');
  assertAllowedString(policy.dispatch.modes.verifyOnly, ['verify-only'], 'dispatch.modes.verifyOnly');
  assertAllowedString(policy.dispatch.modes.dispatchIfNeeded, ['dispatch-if-needed'], 'dispatch.modes.dispatchIfNeeded');
  assertAllowedString(
    policy.dispatch.manualDefaultMode,
    Object.values(policy.dispatch.modes),
    'dispatch.manualDefaultMode',
  );
  assertAllowedString(
    policy.dispatch.scheduledMode,
    Object.values(policy.dispatch.modes),
    'dispatch.scheduledMode',
  );

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
  validateReleaseTriggerNotification(policy);

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
    release_dispatch_mode_verify_only: policy.dispatch.modes.verifyOnly,
    release_dispatch_mode_dispatch_if_needed: policy.dispatch.modes.dispatchIfNeeded,
    release_manual_dispatch_default: policy.dispatch.manualDefaultMode,
    release_scheduled_dispatch_mode: policy.dispatch.scheduledMode,
  };
}

export const releaseTriggerPolicy = deepFreeze(validateReleaseTriggerPolicy(releaseTriggerPolicyV1));

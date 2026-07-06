#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  buildSourceFileUrl,
  extractSourceVersion,
  normalizeCharacters,
  resolveImportSource,
} from './import-optc-data.mjs';
import { releaseTriggerPolicy } from './lib/release-trigger-policy.mjs';

const __filename = fileURLToPath(import.meta.url);

const requestHeaders = {
  'User-Agent': 'optc-team-builder-release-check',
  Accept: 'application/vnd.github+json',
};

const noop = () => undefined;
const sourceContractAssumptions = Object.freeze([
  {
    id: 'version-db-version',
    label: 'Upstream version file exposes dbVersion',
  },
  {
    id: 'units-window-shape',
    label: 'Upstream units file populates window.units as an object or array',
  },
  {
    id: 'normalized-character-ids',
    label: 'Upstream units normalize to positive unique canonical character IDs',
  },
]);

export class SourceContractError extends Error {
  constructor(sourceContract) {
    const failureIds = sourceContract.failures.map((failure) => failure.id).join(', ');
    super(`OPTC DB source contract broken: ${failureIds}`);
    this.name = 'SourceContractError';
    this.code = 'SOURCE_CONTRACT_BROKEN';
    this.sourceContract = sourceContract;
  }
}

export class UpstreamFetchError extends Error {
  constructor(reason, upstreamFetch, cause = null) {
    super(`OPTC DB upstream fetch failed: ${reason}`);
    this.name = 'UpstreamFetchError';
    this.code = 'UPSTREAM_FETCH_FAILED';
    this.reason = reason;
    this.upstreamFetch = upstreamFetch;
    this.cause = cause;
  }
}

const upstreamFetchFailureReasons = new Set([
  releaseTriggerPolicy.report.reasons.upstreamTimeout,
  releaseTriggerPolicy.report.reasons.upstreamUnavailable,
  releaseTriggerPolicy.report.reasons.upstreamPartialData,
  releaseTriggerPolicy.report.reasons.upstreamMalformedData,
]);

function isUpstreamFetchFailureReason(reason) {
  return upstreamFetchFailureReasons.has(reason);
}

export function parseReleaseCheckArgs(args = process.argv.slice(2)) {
  const options = {
    source: releaseTriggerPolicy.defaultSource,
    json: false,
  };

  for (const arg of args) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg.startsWith('--source=')) {
      options.source = readOptionValue(arg, '--source');
      continue;
    }

    if (arg.startsWith('--manifest-path=')) {
      options.manifestPath = path.resolve(readOptionValue(arg, '--manifest-path'));
      continue;
    }

    if (arg.startsWith('--seed-path=')) {
      options.seedPath = path.resolve(readOptionValue(arg, '--seed-path'));
      continue;
    }

    if (arg.startsWith('--fixture=')) {
      options.fixture = readOptionValue(arg, '--fixture');
      continue;
    }

    if (arg.startsWith('--fixture-dir=')) {
      options.fixtureDir = path.resolve(readOptionValue(arg, '--fixture-dir'));
      continue;
    }

    if (arg.startsWith('--remote-version-path=')) {
      options.remoteVersionPath = path.resolve(readOptionValue(arg, '--remote-version-path'));
      continue;
    }

    if (arg.startsWith('--remote-units-path=')) {
      options.remoteUnitsPath = path.resolve(readOptionValue(arg, '--remote-units-path'));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  resolveImportSource(options.source);
  return resolveReleaseCheckOptions(options);
}

function readOptionValue(arg, optionName) {
  return arg.slice(`${optionName}=`.length);
}

export function resolveReleaseCheckOptions(options = {}) {
  const fixtureDir = resolveReleaseCheckFixtureDir(options);
  const resolvedOptions = { ...options };

  if (fixtureDir) {
    for (const [optionKey, fixtureFileName] of Object.entries(releaseTriggerPolicy.fixtures.files)) {
      resolvedOptions[optionKey] ??= path.join(fixtureDir, fixtureFileName);
    }
  }

  resolvedOptions.manifestPath ??= releaseTriggerPolicy.localDataset.manifestPath;
  resolvedOptions.seedPath ??= releaseTriggerPolicy.localDataset.seedPath;

  if (Boolean(resolvedOptions.remoteVersionPath) !== Boolean(resolvedOptions.remoteUnitsPath)) {
    throw new Error(
      'Both --remote-version-path and --remote-units-path are required when replaying captured upstream files.',
    );
  }

  return resolvedOptions;
}

function resolveReleaseCheckFixtureDir(options) {
  const fixture = String(options.fixture ?? '').trim();
  const fixtureDir = String(options.fixtureDir ?? '').trim();

  if (fixture && fixtureDir) {
    throw new Error('Use either --fixture or --fixture-dir, not both.');
  }

  if (fixture) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(fixture)) {
      throw new Error(`Invalid fixture name: ${fixture}`);
    }

    return path.join(releaseTriggerPolicy.fixtures.directory, fixture);
  }

  return fixtureDir || null;
}

export function extractCharacterIdsFromSeed(sql) {
  const ids = [
    ...String(sql).matchAll(/INSERT\s+INTO\s+characters\s*\([\s\S]*?\)\s*VALUES\s*\(\s*(\d+)\s*,/gi),
  ].map((match) => Number(match[1]));

  if (!ids.length) {
    throw new Error('No character rows found in local optc-seed.sql.');
  }

  return [...new Set(ids)].sort((left, right) => left - right);
}

export function evaluateLegacyDataSource(sourceText) {
  const target = {
    window: {},
    console: {
      log: noop,
      warn: noop,
      error: noop,
    },
    UnitUtils: new Proxy(
      {},
      {
        get: () => noop,
      },
    ),
  };

  target.global = target;
  target.globalThis = target;
  target.self = target.window;

  const sandbox = new Proxy(target, {
    get(currentTarget, property) {
      if (property in currentTarget) {
        return currentTarget[property];
      }

      if (property in globalThis) {
        return globalThis[property];
      }

      return noop;
    },
    has() {
      return true;
    },
    set(currentTarget, property, value) {
      currentTarget[property] = value;
      return true;
    },
  });

  vm.runInNewContext(sourceText, sandbox, { timeout: 20_000 });
  return sandbox.window;
}

export function buildReleaseCheckResult({
  source,
  localSourceVersion,
  remoteSourceVersion,
  localCharacterIds,
  remoteCharacters,
  sourceContract = null,
}) {
  const localIdSet = new Set(localCharacterIds);
  const remoteCharacterIds = remoteCharacters
    .map((character) => Number(character.id))
    .filter((characterId) => Number.isInteger(characterId) && characterId > 0)
    .sort((left, right) => left - right);
  const newCharacterIds = remoteCharacterIds.filter((characterId) => !localIdSet.has(characterId));
  const releaseNeeded = newCharacterIds.length > 0;

  return {
    releaseNeeded,
    reason: releaseNeeded
      ? releaseTriggerPolicy.decision.releaseReason
      : releaseTriggerPolicy.decision.skipReason,
    source: source.key,
    sourceRepository: source.repository,
    localSourceVersion,
    remoteSourceVersion,
    localCharacterCount: localCharacterIds.length,
    remoteCharacterCount: remoteCharacterIds.length,
    newCharacterIds,
    newCharacterCount: newCharacterIds.length,
    sourceContract,
  };
}

function buildSourceContractCheck(id, status, message, details = {}) {
  return {
    id,
    status,
    message,
    details,
  };
}

function isSupportedUnitsShape(units) {
  return Array.isArray(units) || (units !== null && typeof units === 'object');
}

function duplicateIds(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return [...duplicates].sort((left, right) => left - right);
}

function normalizeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function invalidCharacterIdSamples(normalizedCharacters) {
  return normalizedCharacters
    .map((character, index) => ({
      index,
      id: character?.id ?? null,
    }))
    .filter((sample) => {
      const characterId = Number(sample.id);
      return !Number.isInteger(characterId) || characterId <= 0;
    })
    .slice(0, 5);
}

export function validateSourceContract({ sourceVersion, units, characters, normalizationError = null }) {
  const normalizedCharacters = Array.isArray(characters) ? characters : [];
  const normalizedCharacterIds = normalizedCharacters.map((character) => Number(character?.id));
  const characterIds = normalizedCharacterIds.filter((characterId) => Number.isInteger(characterId) && characterId > 0);
  const invalidSamples = invalidCharacterIdSamples(normalizedCharacters);
  const duplicates = duplicateIds(characterIds);
  const checks = [];

  checks.push(
    sourceVersion && sourceVersion !== 'unknown'
      ? buildSourceContractCheck('version-db-version', 'passed', 'Upstream version.js exposed dbVersion.', {
          sourceVersion,
        })
      : buildSourceContractCheck('version-db-version', 'failed', 'Upstream version.js did not expose dbVersion.', {
          sourceVersion,
        }),
  );

  checks.push(
    isSupportedUnitsShape(units)
      ? buildSourceContractCheck(
          'units-window-shape',
          'passed',
          'Upstream units.js populated window.units as a supported object or array.',
          {
            shape: Array.isArray(units) ? 'array' : 'object',
          },
        )
      : buildSourceContractCheck(
          'units-window-shape',
          'failed',
          'Upstream units.js did not populate window.units as a supported object or array.',
          {
            shape: units === null ? 'null' : typeof units,
          },
        ),
  );

  if (normalizationError) {
    checks.push(
      buildSourceContractCheck(
        'normalized-character-ids',
        'failed',
        'Upstream units could not be normalized to canonical character IDs.',
        {
          normalizedCharacterCount: normalizedCharacters.length,
          normalizationError: normalizeErrorMessage(normalizationError),
        },
      ),
    );
  } else if (characterIds.length === 0) {
    checks.push(
      buildSourceContractCheck(
        'normalized-character-ids',
        'failed',
        'Upstream units did not normalize to any positive canonical character IDs.',
        {
          normalizedCharacterCount: normalizedCharacters.length,
          invalidCharacterIdCount: invalidSamples.length,
          invalidCharacterIdSamples: invalidSamples,
        },
      ),
    );
  } else if (invalidSamples.length > 0) {
    checks.push(
      buildSourceContractCheck(
        'normalized-character-ids',
        'failed',
        'Upstream units normalized to invalid canonical character IDs.',
        {
          normalizedCharacterCount: normalizedCharacters.length,
          invalidCharacterIdCount: invalidSamples.length,
          invalidCharacterIdSamples: invalidSamples,
        },
      ),
    );
  } else if (duplicates.length > 0) {
    checks.push(
      buildSourceContractCheck(
        'normalized-character-ids',
        'failed',
        'Upstream units normalized to duplicate canonical character IDs.',
        {
          normalizedCharacterCount: normalizedCharacters.length,
          duplicateCharacterIds: duplicates,
        },
      ),
    );
  } else {
    checks.push(
      buildSourceContractCheck(
        'normalized-character-ids',
        'passed',
        'Upstream units normalized to positive unique canonical character IDs.',
        {
          normalizedCharacterCount: normalizedCharacters.length,
        },
      ),
    );
  }

  const failures = checks.filter((check) => check.status === 'failed');
  const sourceContract = {
    schemaVersion: 1,
    status: failures.length > 0 ? 'failed' : 'passed',
    assumptions: sourceContractAssumptions,
    checks,
    failures,
  };

  return sourceContract;
}

export function buildSourceContractFailureResult({
  source,
  localSnapshot = null,
  remoteSnapshot = null,
  sourceContract,
}) {
  const remoteCharacterCount = (Array.isArray(remoteSnapshot?.characters) ? remoteSnapshot.characters : [])
    .map((character) => Number(character?.id))
    .filter((characterId) => Number.isInteger(characterId) && characterId > 0).length;

  return {
    releaseNeeded: false,
    reason: releaseTriggerPolicy.report.reasons.sourceContractBroken,
    source: source.key,
    sourceRepository: source.repository,
    localSourceVersion: String(localSnapshot?.sourceVersion ?? 'unknown'),
    remoteSourceVersion: String(remoteSnapshot?.sourceVersion ?? 'unknown'),
    localCharacterCount: Array.isArray(localSnapshot?.characterIds) ? localSnapshot.characterIds.length : 0,
    remoteCharacterCount,
    newCharacterIds: [],
    newCharacterCount: 0,
    sourceContract,
  };
}

export function buildUpstreamFetchFailureResult({
  source,
  localSnapshot = null,
  upstreamFetch,
}) {
  return {
    releaseNeeded: false,
    reason: upstreamFetch.reason,
    source: source.key,
    sourceRepository: source.repository,
    localSourceVersion: String(localSnapshot?.sourceVersion ?? 'unknown'),
    remoteSourceVersion: 'unknown',
    localCharacterCount: Array.isArray(localSnapshot?.characterIds) ? localSnapshot.characterIds.length : 0,
    remoteCharacterCount: 0,
    newCharacterIds: [],
    newCharacterCount: 0,
    upstreamFetch,
  };
}

function normalizeStepOutcome(outcome) {
  const normalized = String(outcome ?? '').trim();
  return normalized || 'skipped';
}

function normalizeStepOutcomes(stepOutcomes = {}) {
  return {
    fixtureValidation: normalizeStepOutcome(stepOutcomes.fixtureValidation),
    releaseCheck: normalizeStepOutcome(stepOutcomes.releaseCheck),
    activeRelease: normalizeStepOutcome(stepOutcomes.activeRelease),
    duplicateReleaseDispatch: normalizeStepOutcome(stepOutcomes.duplicateReleaseDispatch),
    verifyOnlyDispatch: normalizeStepOutcome(stepOutcomes.verifyOnlyDispatch),
    dispatchRelease: normalizeStepOutcome(stepOutcomes.dispatchRelease),
    dispatchRegistration: normalizeStepOutcome(stepOutcomes.dispatchRegistration),
    skipRelease: normalizeStepOutcome(stepOutcomes.skipRelease),
  };
}

function isFailedStepOutcome(outcome) {
  return !['success', 'skipped'].includes(normalizeStepOutcome(outcome));
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  return null;
}

function normalizePositiveIds(values = []) {
  return Array.isArray(values)
    ? values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
        .sort((left, right) => left - right)
    : [];
}

export function buildReleaseDispatchIdempotencyKey({
  releaseCheckResult = null,
  dispatchWorkflow = releaseTriggerPolicy.dispatch.workflow,
  dispatchRef = releaseTriggerPolicy.dispatch.ref,
  dispatchBump = releaseTriggerPolicy.dispatch.bump,
} = {}) {
  if (releaseCheckResult?.releaseNeeded !== true) {
    return {
      key: null,
      payload: null,
    };
  }

  const payload = {
    source: String(releaseCheckResult.source ?? ''),
    sourceRepository: String(releaseCheckResult.sourceRepository ?? ''),
    remoteSourceVersion: String(releaseCheckResult.remoteSourceVersion ?? ''),
    newCharacterIds: normalizePositiveIds(releaseCheckResult.newCharacterIds),
    releaseWorkflow: String(dispatchWorkflow ?? ''),
    ref: String(dispatchRef ?? ''),
    bump: String(dispatchBump ?? ''),
  };
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);

  return {
    key: `optc-release-${digest}`,
    payload,
  };
}

function isBlockingDuplicateReleaseRun(run, policy = releaseTriggerPolicy) {
  const status = String(run?.status ?? '');
  const conclusion = String(run?.conclusion ?? '');

  return (
    policy.dispatch.idempotency.blockingStatuses.includes(status) ||
    (status === 'completed' && policy.dispatch.idempotency.blockingConclusions.includes(conclusion))
  );
}

function normalizeDuplicateReleaseRunMatches(matches = [], policy = releaseTriggerPolicy) {
  if (!Array.isArray(matches)) {
    return [];
  }

  return matches
    .filter((match) => match && typeof match === 'object')
    .map((match) => ({
      databaseId: match.databaseId === null || match.databaseId === undefined ? null : String(match.databaseId),
      displayTitle: match.displayTitle === null || match.displayTitle === undefined ? null : String(match.displayTitle),
      status: match.status === null || match.status === undefined ? null : String(match.status),
      conclusion: match.conclusion === null || match.conclusion === undefined ? null : String(match.conclusion),
      url: match.url === null || match.url === undefined ? null : String(match.url),
      createdAt: match.createdAt === null || match.createdAt === undefined ? null : String(match.createdAt),
      blocking: isBlockingDuplicateReleaseRun(match, policy),
    }));
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildWorkflowMetadata(env = process.env) {
  const repository = env.GITHUB_REPOSITORY ?? '';
  const runId = env.GITHUB_RUN_ID ?? '';
  const serverUrl = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const runUrl = repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : '';

  return {
    name: env.GITHUB_WORKFLOW ?? '',
    repository,
    runId,
    runNumber: env.GITHUB_RUN_NUMBER ?? '',
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? '',
    runUrl,
    actor: env.GITHUB_ACTOR ?? '',
    eventName: env.GITHUB_EVENT_NAME ?? '',
    ref: env.GITHUB_REF ?? '',
    sha: env.GITHUB_SHA ?? '',
  };
}

export function normalizeReleaseDispatchMode(mode, policy = releaseTriggerPolicy) {
  const normalized = String(mode ?? '').trim() || policy.dispatch.scheduledMode;
  const allowedModes = Object.values(policy.dispatch.modes);

  if (!allowedModes.includes(normalized)) {
    throw new Error(`Invalid release dispatch mode: ${normalized}. Expected one of ${allowedModes.join(', ')}.`);
  }

  return normalized;
}

export function buildReleaseTriggerReport({
  releaseCheckResult = null,
  stepOutcomes = {},
  activeReleaseCount = null,
  duplicateReleaseRunMatches = [],
  dispatchIdempotencyKey = null,
  dispatchRegistrationMatches = [],
  dispatchRegistrationConfirmed = null,
  dispatchRegistrationAttempts = null,
  workflow = {},
  generatedAt = new Date().toISOString(),
  dispatchWorkflow = releaseTriggerPolicy.dispatch.workflow,
  dispatchRef = releaseTriggerPolicy.dispatch.ref,
  dispatchBump = releaseTriggerPolicy.dispatch.bump,
  dispatchMode = releaseTriggerPolicy.dispatch.scheduledMode,
  idempotencyStrategy = releaseTriggerPolicy.dispatch.idempotency.strategy,
} = {}) {
  const steps = normalizeStepOutcomes(stepOutcomes);
  const activeCount = parseOptionalNumber(activeReleaseCount);
  const releaseNeeded = releaseCheckResult?.releaseNeeded === true;
  const newCharacterCount = Number(releaseCheckResult?.newCharacterCount ?? 0);
  const releaseDispatched = steps.dispatchRelease === 'success';
  const normalizedDispatchMode = normalizeReleaseDispatchMode(dispatchMode);
  const generatedIdempotency = buildReleaseDispatchIdempotencyKey({
    releaseCheckResult,
    dispatchWorkflow,
    dispatchRef,
    dispatchBump,
  });
  const idempotencyKey = dispatchIdempotencyKey || generatedIdempotency.key;
  const duplicateMatches = normalizeDuplicateReleaseRunMatches(duplicateReleaseRunMatches);
  const duplicateBlockingCount = duplicateMatches.filter((match) => match.blocking).length;
  const registrationMatches = normalizeDuplicateReleaseRunMatches(dispatchRegistrationMatches);
  const registrationConfirmed = parseOptionalBoolean(dispatchRegistrationConfirmed);
  const registrationAttempts = parseOptionalNumber(dispatchRegistrationAttempts);
  const verificationOnly = normalizedDispatchMode === releaseTriggerPolicy.dispatch.modes.verifyOnly;
  const failedPrerequisite =
    isFailedStepOutcome(steps.fixtureValidation) ||
    isFailedStepOutcome(steps.releaseCheck) ||
    isFailedStepOutcome(steps.activeRelease) ||
    isFailedStepOutcome(steps.duplicateReleaseDispatch) ||
    isFailedStepOutcome(steps.dispatchRelease) ||
    isFailedStepOutcome(steps.dispatchRegistration);
  const sourceContractBroken =
    releaseCheckResult?.reason === releaseTriggerPolicy.report.reasons.sourceContractBroken ||
    releaseCheckResult?.sourceContract?.status === 'failed';
  const upstreamFetchFailure = isUpstreamFetchFailureReason(releaseCheckResult?.reason);
  const blockedByVerificationOnly = !failedPrerequisite && releaseNeeded && !releaseDispatched && verificationOnly;
  const blockedByActiveRelease =
    !failedPrerequisite &&
    releaseNeeded &&
    !releaseDispatched &&
    !blockedByVerificationOnly &&
    activeCount !== null &&
    activeCount > 0;
  const blockedByDuplicateDispatch =
    !failedPrerequisite &&
    releaseNeeded &&
    !releaseDispatched &&
    !blockedByVerificationOnly &&
    !blockedByActiveRelease &&
    duplicateBlockingCount > 0;
  const dispatchBlocked = blockedByActiveRelease || blockedByVerificationOnly || blockedByDuplicateDispatch;
  const dispatchBlockReason = blockedByVerificationOnly
    ? releaseTriggerPolicy.report.reasons.verificationOnly
    : blockedByActiveRelease
      ? releaseTriggerPolicy.report.reasons.activeReleaseRunning
      : blockedByDuplicateDispatch
        ? releaseTriggerPolicy.report.reasons.duplicateReleaseDispatchBlocked
        : null;

  let status = releaseTriggerPolicy.report.statuses.skipped;
  let reason = releaseTriggerPolicy.report.reasons.noNewUpstreamCharacters;

  if (isFailedStepOutcome(steps.fixtureValidation)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.fixtureValidationFailed;
  } else if (isFailedStepOutcome(steps.releaseCheck)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = sourceContractBroken
      ? releaseTriggerPolicy.report.reasons.sourceContractBroken
      : upstreamFetchFailure
        ? releaseCheckResult.reason
        : releaseTriggerPolicy.report.reasons.detectorFailed;
  } else if (isFailedStepOutcome(steps.activeRelease)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.activeReleaseCheckFailed;
  } else if (isFailedStepOutcome(steps.duplicateReleaseDispatch)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.activeReleaseCheckFailed;
  } else if (isFailedStepOutcome(steps.dispatchRelease)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.dispatchFailed;
  } else if (isFailedStepOutcome(steps.dispatchRegistration)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.dispatchFailed;
  } else if (releaseDispatched) {
    status = releaseTriggerPolicy.report.statuses.released;
    reason = releaseTriggerPolicy.report.reasons.releaseDispatched;
  } else if (blockedByVerificationOnly) {
    status = releaseTriggerPolicy.report.statuses.skipped;
    reason = releaseTriggerPolicy.report.reasons.verificationOnly;
  } else if (blockedByActiveRelease) {
    status = releaseTriggerPolicy.report.statuses.skipped;
    reason = releaseTriggerPolicy.report.reasons.activeReleaseRunning;
  } else if (blockedByDuplicateDispatch) {
    status = releaseTriggerPolicy.report.statuses.skipped;
    reason = releaseTriggerPolicy.report.reasons.duplicateReleaseDispatchBlocked;
  } else if (releaseNeeded && !releaseDispatched) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.activeReleaseCheckFailed;
  }

  return {
    schemaVersion: releaseTriggerPolicy.report.schemaVersion,
    generatedAt,
    status,
    reason,
    workflow,
    releaseCheck: releaseCheckResult,
    sourceContract: releaseCheckResult?.sourceContract ?? null,
    upstreamFetch: releaseCheckResult?.upstreamFetch ?? null,
    comparison: releaseCheckResult
      ? {
          source: releaseCheckResult.source,
          sourceRepository: releaseCheckResult.sourceRepository,
          localSourceVersion: releaseCheckResult.localSourceVersion,
          remoteSourceVersion: releaseCheckResult.remoteSourceVersion,
          localCharacterCount: releaseCheckResult.localCharacterCount,
          remoteCharacterCount: releaseCheckResult.remoteCharacterCount,
          newCharacterIds: releaseCheckResult.newCharacterIds ?? [],
          newCharacterCount,
        }
      : null,
    dispatch: {
      releaseWorkflow: dispatchWorkflow,
      ref: dispatchRef,
      bump: dispatchBump,
      mode: normalizedDispatchMode,
      releaseNeeded,
      releaseDispatched,
      activeReleaseCount: activeCount,
      blocked: dispatchBlocked,
      blockReason: dispatchBlockReason,
      idempotencyKey,
      duplicateRunCount: duplicateMatches.length,
      duplicateBlockingCount,
      duplicateBlocked: blockedByDuplicateDispatch,
    },
    idempotency: {
      strategy: idempotencyStrategy,
      key: idempotencyKey,
      payload: generatedIdempotency.payload,
      duplicateReleaseRuns: duplicateMatches,
      duplicateReleaseRunCount: duplicateMatches.length,
      duplicateReleaseBlockingCount: duplicateBlockingCount,
      duplicateReleaseBlocked: blockedByDuplicateDispatch,
      dispatchRegistrationConfirmed: registrationConfirmed,
      dispatchRegistrationAttempts: registrationAttempts,
      dispatchRegistrationRuns: registrationMatches,
    },
    steps,
  };
}

export function buildReleaseTriggerReportFromEnv({
  env = process.env,
  releaseCheckResult = null,
  generatedAt,
} = {}) {
  return buildReleaseTriggerReport({
    releaseCheckResult,
    activeReleaseCount: env.ACTIVE_RELEASE_COUNT,
    workflow: buildWorkflowMetadata(env),
    generatedAt,
    stepOutcomes: {
      fixtureValidation: env.FIXTURE_VALIDATION_OUTCOME,
      releaseCheck: env.RELEASE_CHECK_OUTCOME,
      activeRelease: env.ACTIVE_RELEASE_OUTCOME,
      duplicateReleaseDispatch: env.DUPLICATE_RELEASE_DISPATCH_OUTCOME,
      verifyOnlyDispatch: env.VERIFY_ONLY_DISPATCH_OUTCOME,
      dispatchRelease: env.DISPATCH_RELEASE_OUTCOME,
      dispatchRegistration: env.DISPATCH_REGISTRATION_OUTCOME,
      skipRelease: env.SKIP_RELEASE_OUTCOME,
    },
    duplicateReleaseRunMatches: parseJsonArray(env.DUPLICATE_RELEASE_RUNS_JSON),
    dispatchIdempotencyKey: env.RELEASE_DISPATCH_IDEMPOTENCY_KEY,
    dispatchRegistrationMatches: parseJsonArray(env.DISPATCH_REGISTRATION_RUNS_JSON),
    dispatchRegistrationConfirmed: env.DISPATCH_REGISTRATION_CONFIRMED,
    dispatchRegistrationAttempts: env.DISPATCH_REGISTRATION_ATTEMPTS,
    dispatchWorkflow: env.RELEASE_DISPATCH_WORKFLOW || releaseTriggerPolicy.dispatch.workflow,
    dispatchRef: env.RELEASE_DISPATCH_REF || releaseTriggerPolicy.dispatch.ref,
    dispatchBump: env.RELEASE_DISPATCH_BUMP || releaseTriggerPolicy.dispatch.bump,
    dispatchMode: env.RELEASE_DISPATCH_MODE || releaseTriggerPolicy.dispatch.scheduledMode,
    idempotencyStrategy: env.RELEASE_DISPATCH_IDEMPOTENCY_STRATEGY || releaseTriggerPolicy.dispatch.idempotency.strategy,
  });
}

function formatYesNo(value) {
  return value ? 'yes' : 'no';
}

function formatList(values) {
  return values.length > 0 ? values.join(', ') : 'none';
}

function formatDuplicateReleaseRuns(matches = []) {
  if (!matches.length) {
    return 'none';
  }

  return matches
    .map((match) => {
      const locator = match.url ?? match.databaseId ?? match.displayTitle ?? 'unknown';
      const conclusion = match.conclusion ? `/${match.conclusion}` : '';
      return `${locator} (${match.status ?? 'unknown'}${conclusion}${match.blocking ? ', blocking' : ''})`;
    })
    .join('; ');
}

export function formatReleaseTriggerSummary(report) {
  const lines = [
    '## OPTC DB release trigger report',
    '',
    `- Status: ${report.status}`,
    `- Reason: ${report.reason}`,
    `- Release needed: ${formatYesNo(report.dispatch.releaseNeeded)}`,
    `- Release dispatched: ${formatYesNo(report.dispatch.releaseDispatched)}`,
    `- Release dispatch mode: ${report.dispatch.mode}`,
    `- Release dispatch blocked: ${formatYesNo(report.dispatch.blocked)}`,
    `- Release dispatch block reason: ${report.dispatch.blockReason ?? 'none'}`,
    `- Active Release Android runs: ${report.dispatch.activeReleaseCount ?? 'unknown'}`,
    `- Release dispatch idempotency key: ${report.idempotency?.key ?? 'none'}`,
    `- Release dispatch idempotency strategy: ${report.idempotency?.strategy ?? 'unknown'}`,
    `- Duplicate release matches: ${report.idempotency?.duplicateReleaseRunCount ?? 0}`,
    `- Duplicate release blocking matches: ${report.idempotency?.duplicateReleaseBlockingCount ?? 0}`,
    `- Duplicate release dispatch blocked: ${formatYesNo(report.idempotency?.duplicateReleaseBlocked)}`,
    `- Duplicate release matching runs: ${formatDuplicateReleaseRuns(report.idempotency?.duplicateReleaseRuns ?? [])}`,
    `- Dispatch registration confirmed: ${
      report.idempotency?.dispatchRegistrationConfirmed === null ||
      report.idempotency?.dispatchRegistrationConfirmed === undefined
        ? 'unknown'
        : formatYesNo(report.idempotency.dispatchRegistrationConfirmed)
    }`,
    `- Dispatch registration attempts: ${report.idempotency?.dispatchRegistrationAttempts ?? 'unknown'}`,
    `- Dispatch registration matching runs: ${formatDuplicateReleaseRuns(report.idempotency?.dispatchRegistrationRuns ?? [])}`,
  ];

  if (report.comparison) {
    lines.push(
      `- Source: ${report.comparison.sourceRepository}`,
      `- Source version: local ${report.comparison.localSourceVersion}, remote ${report.comparison.remoteSourceVersion}`,
      `- Characters: local ${report.comparison.localCharacterCount}, remote ${report.comparison.remoteCharacterCount}`,
      `- New character IDs: ${formatList(report.comparison.newCharacterIds)}`,
    );
  }

  if (report.workflow.runUrl) {
    lines.push(`- Run: ${report.workflow.runUrl}`);
  }

  if (report.sourceContract) {
    lines.push(`- Source contract: ${report.sourceContract.status}`);

    if (report.sourceContract.failures?.length > 0) {
      lines.push(
        `- Source contract failures: ${report.sourceContract.failures
          .map((failure) => failure.id)
          .join(', ')}`,
      );
    }
  }

  if (report.upstreamFetch) {
    lines.push(`- Upstream fetch: ${report.upstreamFetch.status}`);
    lines.push(`- Upstream fetch reason: ${report.upstreamFetch.reason ?? 'none'}`);
    lines.push(
      `- Upstream fetch attempts: ${(report.upstreamFetch.files ?? [])
        .map((file) => `${file.relativePath}:${file.attemptCount}`)
        .join(', ') || 'none'}`,
    );
  }

  lines.push(
    '',
    '### Step outcomes',
    '',
    `- Fixture validation: ${report.steps.fixtureValidation}`,
    `- Release detector: ${report.steps.releaseCheck}`,
    `- Active release guard: ${report.steps.activeRelease}`,
    `- Duplicate release guard: ${report.steps.duplicateReleaseDispatch}`,
    `- Verification-only guard: ${report.steps.verifyOnlyDispatch}`,
    `- Release dispatch: ${report.steps.dispatchRelease}`,
    `- Dispatch registration: ${report.steps.dispatchRegistration}`,
    `- Skip branch: ${report.steps.skipRelease}`,
    '',
  );

  return lines.join('\n');
}

function buildRequestHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || '';

  if (!token) {
    return requestHeaders;
  }

  return {
    ...requestHeaders,
    Authorization: `Bearer ${token}`,
  };
}

function normalizeUpstreamFetchPolicy(policy = releaseTriggerPolicy.upstreamFetch) {
  return {
    timeoutMs: Number.isInteger(policy.timeoutMs) && policy.timeoutMs > 0
      ? policy.timeoutMs
      : releaseTriggerPolicy.upstreamFetch.timeoutMs,
    attempts: Number.isInteger(policy.attempts) && policy.attempts > 0
      ? policy.attempts
      : releaseTriggerPolicy.upstreamFetch.attempts,
    retryDelayMs: Number.isInteger(policy.retryDelayMs) && policy.retryDelayMs >= 0
      ? policy.retryDelayMs
      : releaseTriggerPolicy.upstreamFetch.retryDelayMs,
    retryableStatuses: Array.isArray(policy.retryableStatuses)
      ? [...policy.retryableStatuses]
      : [...releaseTriggerPolicy.upstreamFetch.retryableStatuses],
  };
}

function sleepFor(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeErrorClass(error) {
  if (error instanceof Error && error.name) {
    return error.name;
  }
  if (error && typeof error === 'object' && typeof error.name === 'string' && error.name.trim()) {
    return error.name;
  }
  return typeof error;
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 240);
}

function isTimeoutError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === 'AbortError' || error.name === 'TimeoutError' || error.code === 'ABORT_ERR';
}

function buildUpstreamFetchEnvelope({ policy, files, reason = null }) {
  return {
    schemaVersion: 1,
    status: reason ? 'failed' : 'passed',
    reason,
    policy: {
      timeoutMs: policy.timeoutMs,
      attempts: policy.attempts,
      retryDelayMs: policy.retryDelayMs,
      retryableStatuses: [...policy.retryableStatuses],
    },
    files,
  };
}

function classifyAttemptFailure(attempt) {
  if (attempt.status === 'timeout') {
    return releaseTriggerPolicy.report.reasons.upstreamTimeout;
  }
  if (attempt.status === 'partial-data') {
    return releaseTriggerPolicy.report.reasons.upstreamPartialData;
  }
  return releaseTriggerPolicy.report.reasons.upstreamUnavailable;
}

function finalAttemptReason(diagnostic) {
  const finalAttempt = [...diagnostic.attempts].reverse().find((attempt) => attempt.status !== 'success');
  return finalAttempt ? classifyAttemptFailure(finalAttempt) : releaseTriggerPolicy.report.reasons.upstreamUnavailable;
}

function failedFetchEnvelope({ policy, diagnostic }) {
  const reason = finalAttemptReason(diagnostic);
  return buildUpstreamFetchEnvelope({
    policy,
    reason,
    files: [
      {
        ...diagnostic,
        status: 'failed',
        finalReason: reason,
      },
    ],
  });
}

function markDiagnosticFailed(diagnostic, reason, error) {
  return {
    ...diagnostic,
    status: 'failed',
    finalReason: reason,
    finalErrorClass: safeErrorClass(error),
    finalErrorMessage: safeErrorMessage(error),
  };
}

async function fetchText(url, source, { relativePath, policy, fetchImpl = fetch, sleep = sleepFor } = {}) {
  const diagnostic = {
    relativePath,
    source: 'remote',
    url,
    status: 'pending',
    attemptCount: 0,
    attempts: [],
  };

  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    let timeoutId;
    const controller = new AbortController();

    try {
      timeoutId = setTimeout(() => controller.abort(), policy.timeoutMs);
      const response = await fetchImpl(url, {
        headers: buildRequestHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        const retryable = policy.retryableStatuses.includes(response.status);
        diagnostic.attempts.push({
          attempt,
          status: 'http-error',
          httpStatus: response.status,
          retryable,
        });
        diagnostic.attemptCount = diagnostic.attempts.length;

        if (retryable && attempt < policy.attempts) {
          await sleep(policy.retryDelayMs);
          continue;
        }

        throw new UpstreamFetchError(releaseTriggerPolicy.report.reasons.upstreamUnavailable, failedFetchEnvelope({
          policy,
          diagnostic,
        }));
      }

      if (response.status === 206) {
        clearTimeout(timeoutId);
        diagnostic.attempts.push({
          attempt,
          status: 'partial-data',
          httpStatus: response.status,
          retryable: false,
        });
        diagnostic.attemptCount = diagnostic.attempts.length;
        throw new UpstreamFetchError(releaseTriggerPolicy.report.reasons.upstreamPartialData, failedFetchEnvelope({
          policy,
          diagnostic,
        }));
      }

      try {
        const text = await response.text();
        clearTimeout(timeoutId);
        diagnostic.attempts.push({
          attempt,
          status: 'success',
          httpStatus: response.status,
          retryable: false,
        });
        diagnostic.attemptCount = diagnostic.attempts.length;
        diagnostic.status = 'passed';
        return { text, diagnostic };
      } catch (error) {
        diagnostic.attempts.push({
          attempt,
          status: 'partial-data',
          httpStatus: response.status,
          retryable: attempt < policy.attempts,
          errorClass: safeErrorClass(error),
          errorMessage: safeErrorMessage(error),
        });
        diagnostic.attemptCount = diagnostic.attempts.length;

        const timedOut = isTimeoutError(error);
        clearTimeout(timeoutId);
        diagnostic.attempts[diagnostic.attempts.length - 1] = {
          ...diagnostic.attempts[diagnostic.attempts.length - 1],
          status: timedOut ? 'timeout' : 'partial-data',
        };

        if (attempt < policy.attempts) {
          await sleep(policy.retryDelayMs);
          continue;
        }

        throw new UpstreamFetchError(
          timedOut
            ? releaseTriggerPolicy.report.reasons.upstreamTimeout
            : releaseTriggerPolicy.report.reasons.upstreamPartialData,
          failedFetchEnvelope({
            policy,
            diagnostic,
          }),
          error,
        );
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof UpstreamFetchError) {
        throw error;
      }

      const timedOut = isTimeoutError(error);
      diagnostic.attempts.push({
        attempt,
        status: timedOut ? 'timeout' : 'network-error',
        retryable: attempt < policy.attempts,
        errorClass: safeErrorClass(error),
        errorMessage: safeErrorMessage(error),
      });
      diagnostic.attemptCount = diagnostic.attempts.length;

      if (attempt < policy.attempts) {
        await sleep(policy.retryDelayMs);
        continue;
      }

      throw new UpstreamFetchError(
        timedOut
          ? releaseTriggerPolicy.report.reasons.upstreamTimeout
          : releaseTriggerPolicy.report.reasons.upstreamUnavailable,
        failedFetchEnvelope({ policy, diagnostic }),
        error,
      );
    }
  }

  throw new UpstreamFetchError(releaseTriggerPolicy.report.reasons.upstreamUnavailable, failedFetchEnvelope({
    policy,
    diagnostic,
  }));
}

async function readLocalDatasetSnapshot(options) {
  const [manifestSource, seedSource] = await Promise.all([
    readFile(options.manifestPath, 'utf8'),
    readFile(options.seedPath, 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);

  return {
    sourceVersion: String(manifest.sourceVersion ?? 'unknown'),
    characterIds: extractCharacterIdsFromSeed(seedSource),
  };
}

function diagnosticsFromSettledReads(reads) {
  return reads.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return [result.value.diagnostic];
    }
    if (result.reason instanceof UpstreamFetchError) {
      return result.reason.upstreamFetch.files;
    }
    return [];
  });
}

async function readRemoteDatasetSnapshot(source, options = {}) {
  const policy = normalizeUpstreamFetchPolicy(options.upstreamFetchPolicy);
  const readOptions = {
    policy,
    fetchImpl: options.fetchImpl ?? fetch,
    sleep: options.sleep ?? sleepFor,
  };
  const reads = await Promise.allSettled([
    readRemoteSourceFile({
      filePath: options.remoteVersionPath,
      source,
      relativePath: releaseTriggerPolicy.upstream.versionPath,
      ...readOptions,
    }),
    readRemoteSourceFile({
      filePath: options.remoteUnitsPath,
      source,
      relativePath: releaseTriggerPolicy.upstream.unitsPath,
      ...readOptions,
    }),
  ]);

  const rejectedRead = reads.find((result) => result.status === 'rejected');
  if (rejectedRead) {
    const reason =
      rejectedRead.reason instanceof UpstreamFetchError
        ? rejectedRead.reason.reason
        : releaseTriggerPolicy.report.reasons.upstreamUnavailable;
    throw new UpstreamFetchError(
      reason,
      buildUpstreamFetchEnvelope({
        policy,
        reason,
        files: diagnosticsFromSettledReads(reads),
      }),
      rejectedRead.reason,
    );
  }

  const [versionRead, unitsRead] = reads.map((result) => result.value);
  const sourceVersion = extractSourceVersion(versionRead.text);
  let unitsWindow;
  try {
    unitsWindow = evaluateLegacyDataSource(unitsRead.text);
  } catch (error) {
    throw new UpstreamFetchError(
      releaseTriggerPolicy.report.reasons.upstreamMalformedData,
      buildUpstreamFetchEnvelope({
        policy,
        reason: releaseTriggerPolicy.report.reasons.upstreamMalformedData,
        files: [
          versionRead.diagnostic,
          markDiagnosticFailed(
            unitsRead.diagnostic,
            releaseTriggerPolicy.report.reasons.upstreamMalformedData,
            error,
          ),
        ],
      }),
      error,
    );
  }
  const units = unitsWindow.units;
  let characters = [];
  let normalizationError = null;
  try {
    characters = normalizeCharacters(units, {}, [], new Map());
  } catch (error) {
    normalizationError = error;
  }
  const sourceContract = validateSourceContract({
    sourceVersion,
    units,
    characters,
    normalizationError,
  });

  return {
    sourceVersion,
    characters,
    sourceContract,
  };
}

async function readRemoteSourceFile({ filePath, source, relativePath, policy, fetchImpl, sleep }) {
  if (filePath) {
    try {
      const text = await readFile(filePath, 'utf8');
      return {
        text,
        diagnostic: {
          relativePath,
          source: 'fixture',
          status: 'passed',
          attemptCount: 1,
          attempts: [
            {
              attempt: 1,
              status: 'success',
              retryable: false,
            },
          ],
        },
      };
    } catch (error) {
      const diagnostic = {
        relativePath,
        source: 'fixture',
        status: 'failed',
        finalReason: releaseTriggerPolicy.report.reasons.upstreamUnavailable,
        finalErrorClass: safeErrorClass(error),
        finalErrorMessage: safeErrorMessage(error),
        attemptCount: 1,
        attempts: [
          {
            attempt: 1,
            status: 'file-error',
            retryable: false,
            errorClass: safeErrorClass(error),
            errorMessage: safeErrorMessage(error),
          },
        ],
      };
      throw new UpstreamFetchError(
        releaseTriggerPolicy.report.reasons.upstreamUnavailable,
        buildUpstreamFetchEnvelope({
          policy,
          reason: releaseTriggerPolicy.report.reasons.upstreamUnavailable,
          files: [diagnostic],
        }),
        error,
      );
    }
  }

  return fetchText(buildSourceFileUrl(source, relativePath), source, {
    relativePath,
    policy,
    fetchImpl,
    sleep,
  });
}

export async function checkOptcReleaseNeeded(options = {}) {
  const resolvedOptions = resolveReleaseCheckOptions(options);
  const source = resolveImportSource(resolvedOptions.source ?? releaseTriggerPolicy.defaultSource);
  const localSnapshot = await readLocalDatasetSnapshot(resolvedOptions);
  let remoteSnapshot;
  try {
    remoteSnapshot = await readRemoteDatasetSnapshot(source, resolvedOptions);
  } catch (error) {
    if (error instanceof UpstreamFetchError) {
      error.releaseCheckResult = buildUpstreamFetchFailureResult({
        source,
        localSnapshot,
        upstreamFetch: error.upstreamFetch,
      });
    }
    throw error;
  }

  if (remoteSnapshot.sourceContract.status === 'failed') {
    const error = new SourceContractError(remoteSnapshot.sourceContract);
    error.releaseCheckResult = buildSourceContractFailureResult({
      source,
      localSnapshot,
      remoteSnapshot,
      sourceContract: remoteSnapshot.sourceContract,
    });
    throw error;
  }

  return buildReleaseCheckResult({
    source,
    localSourceVersion: localSnapshot.sourceVersion,
    remoteSourceVersion: remoteSnapshot.sourceVersion,
    localCharacterIds: localSnapshot.characterIds,
    remoteCharacters: remoteSnapshot.characters,
    sourceContract: remoteSnapshot.sourceContract,
  });
}

function formatHumanResult(result) {
  const lines = [
    `Release needed: ${result.releaseNeeded ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Source: ${result.sourceRepository}`,
    `Source version: local=${result.localSourceVersion} remote=${result.remoteSourceVersion}`,
    `Characters: local=${result.localCharacterCount} remote=${result.remoteCharacterCount}`,
  ];

  if (result.newCharacterCount > 0) {
    lines.push(`New character IDs: ${result.newCharacterIds.join(', ')}`);
  }

  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseReleaseCheckArgs();

  checkOptcReleaseNeeded(options)
    .then((result) => {
      console.log(options.json ? JSON.stringify(result, null, 2) : formatHumanResult(result));
    })
    .catch((error) => {
      if (
        (error instanceof SourceContractError || error instanceof UpstreamFetchError) &&
        options.json &&
        error.releaseCheckResult
      ) {
        console.log(JSON.stringify(error.releaseCheckResult, null, 2));
      }

      console.error(error);
      process.exitCode = 1;
    });
}

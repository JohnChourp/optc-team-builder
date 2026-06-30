#!/usr/bin/env node

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
    verifyOnlyDispatch: normalizeStepOutcome(stepOutcomes.verifyOnlyDispatch),
    dispatchRelease: normalizeStepOutcome(stepOutcomes.dispatchRelease),
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
  workflow = {},
  generatedAt = new Date().toISOString(),
  dispatchWorkflow = releaseTriggerPolicy.dispatch.workflow,
  dispatchRef = releaseTriggerPolicy.dispatch.ref,
  dispatchBump = releaseTriggerPolicy.dispatch.bump,
  dispatchMode = releaseTriggerPolicy.dispatch.scheduledMode,
} = {}) {
  const steps = normalizeStepOutcomes(stepOutcomes);
  const activeCount = parseOptionalNumber(activeReleaseCount);
  const releaseNeeded = releaseCheckResult?.releaseNeeded === true;
  const newCharacterCount = Number(releaseCheckResult?.newCharacterCount ?? 0);
  const releaseDispatched = steps.dispatchRelease === 'success';
  const normalizedDispatchMode = normalizeReleaseDispatchMode(dispatchMode);
  const verificationOnly = normalizedDispatchMode === releaseTriggerPolicy.dispatch.modes.verifyOnly;
  const failedPrerequisite =
    isFailedStepOutcome(steps.fixtureValidation) ||
    isFailedStepOutcome(steps.releaseCheck) ||
    isFailedStepOutcome(steps.activeRelease) ||
    isFailedStepOutcome(steps.dispatchRelease);
  const blockedByActiveRelease = !failedPrerequisite && releaseNeeded && !releaseDispatched && activeCount !== null && activeCount > 0;
  const blockedByVerificationOnly = !failedPrerequisite && releaseNeeded && !releaseDispatched && verificationOnly;
  const dispatchBlocked = blockedByActiveRelease || blockedByVerificationOnly;
  const dispatchBlockReason = blockedByActiveRelease
    ? releaseTriggerPolicy.report.reasons.activeReleaseRunning
    : blockedByVerificationOnly
      ? releaseTriggerPolicy.report.reasons.verificationOnly
      : null;

  let status = releaseTriggerPolicy.report.statuses.skipped;
  let reason = releaseTriggerPolicy.report.reasons.noNewUpstreamCharacters;

  if (isFailedStepOutcome(steps.fixtureValidation)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.fixtureValidationFailed;
  } else if (isFailedStepOutcome(steps.releaseCheck)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.detectorFailed;
  } else if (isFailedStepOutcome(steps.activeRelease)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.activeReleaseCheckFailed;
  } else if (isFailedStepOutcome(steps.dispatchRelease)) {
    status = releaseTriggerPolicy.report.statuses.failed;
    reason = releaseTriggerPolicy.report.reasons.dispatchFailed;
  } else if (releaseDispatched) {
    status = releaseTriggerPolicy.report.statuses.released;
    reason = releaseTriggerPolicy.report.reasons.releaseDispatched;
  } else if (blockedByActiveRelease) {
    status = releaseTriggerPolicy.report.statuses.skipped;
    reason = releaseTriggerPolicy.report.reasons.activeReleaseRunning;
  } else if (blockedByVerificationOnly) {
    status = releaseTriggerPolicy.report.statuses.skipped;
    reason = releaseTriggerPolicy.report.reasons.verificationOnly;
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
      verifyOnlyDispatch: env.VERIFY_ONLY_DISPATCH_OUTCOME,
      dispatchRelease: env.DISPATCH_RELEASE_OUTCOME,
      skipRelease: env.SKIP_RELEASE_OUTCOME,
    },
    dispatchWorkflow: env.RELEASE_DISPATCH_WORKFLOW || releaseTriggerPolicy.dispatch.workflow,
    dispatchRef: env.RELEASE_DISPATCH_REF || releaseTriggerPolicy.dispatch.ref,
    dispatchBump: env.RELEASE_DISPATCH_BUMP || releaseTriggerPolicy.dispatch.bump,
    dispatchMode: env.RELEASE_DISPATCH_MODE || releaseTriggerPolicy.dispatch.scheduledMode,
  });
}

function formatYesNo(value) {
  return value ? 'yes' : 'no';
}

function formatList(values) {
  return values.length > 0 ? values.join(', ') : 'none';
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

  lines.push(
    '',
    '### Step outcomes',
    '',
    `- Fixture validation: ${report.steps.fixtureValidation}`,
    `- Release detector: ${report.steps.releaseCheck}`,
    `- Active release guard: ${report.steps.activeRelease}`,
    `- Verification-only guard: ${report.steps.verifyOnlyDispatch}`,
    `- Release dispatch: ${report.steps.dispatchRelease}`,
    `- Skip branch: ${report.steps.skipRelease}`,
    '',
  );

  return lines.join('\n');
}

async function fetchText(url, source) {
  const response = await fetch(url, { headers: buildRequestHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} from ${source.label}: ${response.status}`);
  }

  return response.text();
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

async function readRemoteDatasetSnapshot(source, options = {}) {
  const [versionSource, unitsSource] = await Promise.all([
    readRemoteSourceFile({
      filePath: options.remoteVersionPath,
      source,
      relativePath: releaseTriggerPolicy.upstream.versionPath,
    }),
    readRemoteSourceFile({
      filePath: options.remoteUnitsPath,
      source,
      relativePath: releaseTriggerPolicy.upstream.unitsPath,
    }),
  ]);
  const unitsWindow = evaluateLegacyDataSource(unitsSource);

  return {
    sourceVersion: extractSourceVersion(versionSource),
    characters: normalizeCharacters(unitsWindow.units, {}, [], new Map()),
  };
}

function readRemoteSourceFile({ filePath, source, relativePath }) {
  if (filePath) {
    return readFile(filePath, 'utf8');
  }

  return fetchText(buildSourceFileUrl(source, relativePath), source);
}

export async function checkOptcReleaseNeeded(options = {}) {
  const resolvedOptions = resolveReleaseCheckOptions(options);
  const source = resolveImportSource(resolvedOptions.source ?? releaseTriggerPolicy.defaultSource);
  const localSnapshot = await readLocalDatasetSnapshot(resolvedOptions);
  const remoteSnapshot = await readRemoteDatasetSnapshot(source, resolvedOptions);

  return buildReleaseCheckResult({
    source,
    localSourceVersion: localSnapshot.sourceVersion,
    remoteSourceVersion: remoteSnapshot.sourceVersion,
    localCharacterIds: localSnapshot.characterIds,
    remoteCharacters: remoteSnapshot.characters,
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
      console.error(error);
      process.exitCode = 1;
    });
}

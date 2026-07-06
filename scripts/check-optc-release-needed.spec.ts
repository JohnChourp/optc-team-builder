import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { dataImportSources } from './import-optc-data.mjs';
import {
  buildReleaseDispatchIdempotencyKey,
  buildReleaseTriggerReport,
  buildReleaseCheckResult,
  checkOptcReleaseNeeded,
  evaluateLegacyDataSource,
  extractCharacterIdsFromSeed,
  formatReleaseTriggerSummary,
  normalizeReleaseDispatchMode,
  parseReleaseCheckArgs,
  resolveReleaseCheckOptions,
  validateSourceContract,
} from './check-optc-release-needed.mjs';
import {
  buildReleasePolicyGitHubOutputs,
  releaseTriggerPolicy,
  validateReleaseTriggerPolicy,
} from './lib/release-trigger-policy.mjs';
import {
  buildReleaseTriggerNotification,
  sendReleaseTriggerNotification,
} from './lib/release-trigger-notifications.mjs';
import {
  MALFORMED_RELEASE_CHECK_FIXTURE,
  RELEASE_CHECK_FIXTURE_FILE_NAMES,
  RELEASE_CHECK_REPLAY_FIXTURE_CASES,
} from './fixtures/shared/release-check-fixtures.mjs';

const execFileAsync = promisify(execFile);
const releaseCheckCliPath = fileURLToPath(new URL('./check-optc-release-needed.mjs', import.meta.url));
const validRemoteVersionSource = 'var dbVersion = "37";\n';
const validRemoteUnitsSource = `window.units = {
  "1": { id: "1", name: "Fixture Luffy", type: "STR", class: ["Fighter"], stars: "5" },
  "2": { id: "2", name: "Fixture Zoro", type: "DEX", class: ["Slasher"], stars: "5" },
  "3": { id: "3", name: "Fixture Nami", type: "QCK", class: ["Striker"], stars: "5" }
};\n`;
const testFetchPolicy = {
  timeoutMs: 25,
  attempts: 2,
  retryDelayMs: 0,
  retryableStatuses: [500, 502, 503, 504],
};

function buildMockTextResponse(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  };
}

function buildMockTextFailureResponse(error, status = 200) {
  return {
    ok: true,
    status,
    text: async () => {
      throw error;
    },
  };
}

async function writeLocalReleaseSnapshot() {
  const fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'optc-release-fetch-'));
  await Promise.all([
    writeFile(path.join(fixtureDir, RELEASE_CHECK_FIXTURE_FILE_NAMES.manifestPath), '{ "sourceVersion": "36" }\n'),
    writeFile(
      path.join(fixtureDir, RELEASE_CHECK_FIXTURE_FILE_NAMES.seedPath),
      "CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO characters (id, name) VALUES (1, 'Fixture Luffy');\nINSERT INTO characters (id, name) VALUES (2, 'Fixture Zoro');\n",
    ),
  ]);

  return {
    fixtureDir,
    manifestPath: path.join(fixtureDir, RELEASE_CHECK_FIXTURE_FILE_NAMES.manifestPath),
    seedPath: path.join(fixtureDir, RELEASE_CHECK_FIXTURE_FILE_NAMES.seedPath),
  };
}

async function withLocalReleaseSnapshot(callback) {
  const snapshot = await writeLocalReleaseSnapshot();
  try {
    return await callback(snapshot);
  } finally {
    await rm(snapshot.fixtureDir, { recursive: true, force: true });
  }
}

function releaseCheckFetchOptions(snapshot, fetchImpl, overrides = {}) {
  return {
    manifestPath: snapshot.manifestPath,
    seedPath: snapshot.seedPath,
    fetchImpl,
    sleep: async () => undefined,
    upstreamFetchPolicy: {
      ...testFetchPolicy,
      ...overrides,
    },
  };
}

describe('check-optc-release-needed', () => {
  it('defaults to the 2shankz source and JSON output off', () => {
    expect(parseReleaseCheckArgs([])).toMatchObject({
      source: releaseTriggerPolicy.defaultSource,
      json: false,
    });
  });

  it('exposes the versioned release trigger policy for detector and workflow consumers', () => {
    expect(releaseTriggerPolicy).toMatchObject({
      schemaVersion: 1,
      defaultSource: '2shankz',
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
        idempotency: {
          strategy: 'release-dispatch-idempotency-key',
          runNamePrefix: 'Release Android',
          recentRunLimit: 50,
          blockingStatuses: ['queued', 'in_progress', 'requested', 'waiting', 'pending'],
          blockingConclusions: ['success'],
        },
      },
      report: {
        schemaVersion: 1,
        reasons: {
          sourceContractBroken: 'source-contract-broken',
          upstreamTimeout: 'upstream-timeout',
          upstreamUnavailable: 'upstream-unavailable',
          upstreamPartialData: 'upstream-partial-data',
          upstreamMalformedData: 'upstream-malformed-data',
        },
      },
      upstreamFetch: {
        timeoutMs: 15_000,
        attempts: 3,
        retryDelayMs: 1_000,
        retryableStatuses: [408, 429, 500, 502, 503, 504],
      },
    });
    expect(releaseTriggerPolicy.localDataset.manifestPath).toMatch(/public[/\\]assets[/\\]data[/\\]optc-manifest\.json$/);
    expect(releaseTriggerPolicy.localDataset.seedPath).toMatch(/public[/\\]assets[/\\]data[/\\]optc-seed\.sql$/);
    expect(releaseTriggerPolicy.upstream).toEqual({
      versionPath: 'common/data/version.js',
      unitsPath: 'common/data/units.js',
    });
    expect(buildReleasePolicyGitHubOutputs()).toEqual({
      release_workflow: 'release-android.yml',
      release_ref: 'main',
      release_bump: 'patch',
      active_statuses_json: '["queued","in_progress"]',
      release_dispatch_mode_verify_only: 'verify-only',
      release_dispatch_mode_dispatch_if_needed: 'dispatch-if-needed',
      release_manual_dispatch_default: 'verify-only',
      release_scheduled_dispatch_mode: 'dispatch-if-needed',
      release_dispatch_idempotency_strategy: 'release-dispatch-idempotency-key',
      release_dispatch_run_name_prefix: 'Release Android',
      release_dispatch_recent_run_limit: '50',
      release_dispatch_blocking_statuses_json: '["queued","in_progress","requested","waiting","pending"]',
      release_dispatch_blocking_conclusions_json: '["success"]',
    });
    expect(Object.isFrozen(releaseTriggerPolicy)).toBe(true);
    expect(Object.isFrozen(releaseTriggerPolicy.dispatch.activeStatuses)).toBe(true);
    expect(releaseTriggerPolicy.notification).toMatchObject({
      sink: 'github-issue',
      issueTitle: 'OPTC DB release trigger notifications',
      issueMarker: '<!-- optc-release-trigger-notifications -->',
      quietReasons: ['no-new-upstream-characters', 'verification-only'],
      severities: {
        'release-dispatched': 'info',
        'active-release-running': 'warning',
        'duplicate-release-dispatch-blocked': 'warning',
        'fixture-validation-failed': 'error',
        'detector-failed': 'error',
        'source-contract-broken': 'error',
        'upstream-timeout': 'error',
        'upstream-unavailable': 'error',
        'upstream-partial-data': 'error',
        'upstream-malformed-data': 'error',
        'active-release-check-failed': 'error',
        'dispatch-failed': 'error',
      },
    });
  });

  it('validates release trigger policy invariants before consumers use config values', () => {
    expect(() =>
      validateReleaseTriggerPolicy({
        ...releaseTriggerPolicy,
        schemaVersion: 2,
      }),
    ).toThrow('schemaVersion must be 1');
    expect(() =>
      validateReleaseTriggerPolicy({
        ...releaseTriggerPolicy,
        decision: {
          ...releaseTriggerPolicy.decision,
          strategy: 'source-version',
        },
      }),
    ).toThrow('decision.strategy must be one of missing-character-ids');
    expect(() =>
      validateReleaseTriggerPolicy({
        ...releaseTriggerPolicy,
        decision: {
          ...releaseTriggerPolicy.decision,
          releaseReason: 'changed-release-reason',
        },
      }),
    ).toThrow('decision.releaseReason must match report reasons');
    expect(() =>
      validateReleaseTriggerPolicy({
        ...releaseTriggerPolicy,
        notification: {
          ...releaseTriggerPolicy.notification,
          sink: 'webhook',
        },
      }),
    ).toThrow('notification.sink must be one of github-issue');
  });

  it('validates release dispatch modes before report generation uses them', () => {
    expect(normalizeReleaseDispatchMode('verify-only')).toBe('verify-only');
    expect(normalizeReleaseDispatchMode('dispatch-if-needed')).toBe('dispatch-if-needed');
    expect(() => normalizeReleaseDispatchMode('release-now')).toThrow(
      'Invalid release dispatch mode: release-now',
    );
  });

  it('resolves bundled fixture paths from the fixture name', () => {
    const options = parseReleaseCheckArgs(['--fixture=no-change', '--json']);

    expect(options).toMatchObject({
      fixture: 'no-change',
      json: true,
    });
    expect(
      normalizePath(options.manifestPath).endsWith(
        `scripts/fixtures/release-check/no-change/${RELEASE_CHECK_FIXTURE_FILE_NAMES.manifestPath}`,
      ),
    ).toBe(true);
    expect(
      normalizePath(options.seedPath).endsWith(
        `scripts/fixtures/release-check/no-change/${RELEASE_CHECK_FIXTURE_FILE_NAMES.seedPath}`,
      ),
    ).toBe(true);
    expect(
      normalizePath(options.remoteVersionPath).endsWith(
        `scripts/fixtures/release-check/no-change/${RELEASE_CHECK_FIXTURE_FILE_NAMES.remoteVersionPath}`,
      ),
    ).toBe(true);
    expect(
      normalizePath(options.remoteUnitsPath).endsWith(
        `scripts/fixtures/release-check/no-change/${RELEASE_CHECK_FIXTURE_FILE_NAMES.remoteUnitsPath}`,
      ),
    ).toBe(true);
  });

  it('rejects unknown options', () => {
    expect(() => parseReleaseCheckArgs(['--unknown'])).toThrow('Unknown option: --unknown');
  });

  it('rejects ambiguous or incomplete replay inputs', () => {
    expect(() => parseReleaseCheckArgs(['--fixture=no-change', '--fixture-dir=/tmp/replay'])).toThrow(
      'Use either --fixture or --fixture-dir, not both.',
    );
    expect(() => parseReleaseCheckArgs(['--fixture=../no-change'])).toThrow(
      'Invalid fixture name: ../no-change',
    );
    expect(() =>
      resolveReleaseCheckOptions({ remoteVersionPath: '/tmp/version.js' }),
    ).toThrow(
      'Both --remote-version-path and --remote-units-path are required when replaying captured upstream files.',
    );
  });

  it('extracts only character table IDs from the generated SQL seed', () => {
    const ids = extractCharacterIdsFromSeed(`
      CREATE TABLE characters (id INTEGER PRIMARY KEY);
      INSERT INTO characters (id, name) VALUES (2, 'Zoro');
      INSERT INTO character_details (character_id, detail_json) VALUES (9000, '{}');
      INSERT INTO characters (
        id,
        name
      )
      VALUES (
        1,
        'Luffy'
      );
      INSERT INTO characters (id, name) VALUES (2, 'Duplicate');
    `);

    expect(ids).toEqual([1, 2]);
  });

  it('throws when the seed has no generated character rows', () => {
    expect(() => extractCharacterIdsFromSeed('CREATE TABLE ships (id INTEGER);')).toThrow(
      'No character rows found in local optc-seed.sql.',
    );
  });

  it('evaluates upstream legacy data files in a window sandbox', () => {
    const result = evaluateLegacyDataSource(`
      window.units = {
        "1": { id: "1", name: "Luffy", type: "STR", class: ["Fighter"], stars: "5" }
      };
    `);

    expect(result.units['1'].name).toBe('Luffy');
  });

  it('does not request a release for source-version-only changes', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }],
    });

    expect(result).toMatchObject({
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      localCharacterCount: 2,
      remoteCharacterCount: 2,
      newCharacterIds: [],
      newCharacterCount: 0,
    });
  });

  it('requests a release when upstream includes IDs missing from the committed seed', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2, 4],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
    });

    expect(result).toMatchObject({
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      newCharacterIds: [3],
      newCharacterCount: 1,
    });
  });

  it('checks IDs instead of count so same-size replacements still surface new upstream IDs', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 3 }],
    });

    expect(result.releaseNeeded).toBe(true);
    expect(result.newCharacterIds).toEqual([3]);
  });

  it('attaches passed source-contract checks to normal release decisions', () => {
    const result = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }],
      sourceContract: {
        status: 'passed',
        checks: [{ id: 'normalized-character-ids', status: 'passed' }],
      },
    });

    expect(result).toMatchObject({
      releaseNeeded: false,
      reason: 'no-new-upstream-characters',
      sourceContract: {
        status: 'passed',
      },
    });
  });

  it('fails source-contract validation when normalized units include invalid IDs beside valid IDs', () => {
    const sourceContract = validateSourceContract({
      sourceVersion: '40',
      units: {
        1: [1, 'Luffy'],
        metadata: { updatedAt: '2026-07-04' },
      },
      characters: [
        { id: 1 },
        { id: Number.NaN },
      ],
    });

    expect(sourceContract).toMatchObject({
      status: 'failed',
      failures: [
        {
          id: 'normalized-character-ids',
          details: {
            normalizedCharacterCount: 2,
            invalidCharacterIdCount: 1,
          },
        },
      ],
    });
  });

  it('builds a skipped report for a no-change release check', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'success',
      },
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      status: 'skipped',
      reason: 'no-new-upstream-characters',
      dispatch: {
        releaseNeeded: false,
        releaseDispatched: false,
      },
    });
    expect(formatReleaseTriggerSummary(report)).toContain(
      '## OPTC DB release trigger report',
    );
  });

  it('builds a released report when the Android release workflow is dispatched', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const idempotency = buildReleaseDispatchIdempotencyKey({ releaseCheckResult });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '0',
      dispatchRegistrationConfirmed: 'true',
      dispatchRegistrationAttempts: '2',
      dispatchRegistrationMatches: [
        {
          databaseId: 102,
          displayTitle: `Release Android ${idempotency.key}`,
          status: 'queued',
          conclusion: null,
          url: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/102',
        },
      ],
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        duplicateReleaseDispatch: 'success',
        dispatchRelease: 'success',
        dispatchRegistration: 'success',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'released',
      reason: 'release-dispatched',
      comparison: {
        newCharacterIds: [3],
        newCharacterCount: 1,
      },
      dispatch: {
        releaseNeeded: true,
        releaseDispatched: true,
        activeReleaseCount: 0,
      },
      idempotency: {
        dispatchRegistrationConfirmed: true,
        dispatchRegistrationAttempts: 2,
        dispatchRegistrationRuns: [
          {
            databaseId: '102',
            displayTitle: `Release Android ${idempotency.key}`,
            url: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/102',
          },
        ],
      },
      steps: {
        dispatchRegistration: 'success',
      },
    });
    expect(formatReleaseTriggerSummary(report)).toContain('Dispatch registration confirmed: yes');
  });

  it('builds a deterministic release dispatch idempotency key from the release inputs', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 3 }, { id: 2 }, { id: 1 }],
    });
    const first = buildReleaseDispatchIdempotencyKey({
      releaseCheckResult,
      dispatchWorkflow: 'release-android.yml',
      dispatchRef: 'main',
      dispatchBump: 'patch',
    });
    const second = buildReleaseDispatchIdempotencyKey({
      releaseCheckResult: {
        ...releaseCheckResult,
        newCharacterIds: [...releaseCheckResult.newCharacterIds].reverse(),
      },
      dispatchWorkflow: 'release-android.yml',
      dispatchRef: 'main',
      dispatchBump: 'patch',
    });
    const changedBump = buildReleaseDispatchIdempotencyKey({
      releaseCheckResult,
      dispatchWorkflow: 'release-android.yml',
      dispatchRef: 'main',
      dispatchBump: 'minor',
    });

    expect(first.key).toMatch(/^optc-release-[0-9a-f]{16}$/u);
    expect(second.key).toBe(first.key);
    expect(changedBump.key).not.toBe(first.key);
    expect(first.payload).toMatchObject({
      source: '2shankz',
      sourceRepository: '2Shankz/optc-db.github.io',
      remoteSourceVersion: '37',
      newCharacterIds: [3],
      releaseWorkflow: 'release-android.yml',
      ref: 'main',
      bump: 'patch',
    });
  });

  it('builds a quiet verification-only report when manual verification blocks dispatch', async () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '0',
      dispatchMode: 'verify-only',
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        verifyOnlyDispatch: 'success',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });
    const fetchImpl = () => {
      throw new Error('verification-only notification must stay quiet');
    };

    expect(report).toMatchObject({
      status: 'skipped',
      reason: 'verification-only',
      dispatch: {
        mode: 'verify-only',
        releaseNeeded: true,
        releaseDispatched: false,
        activeReleaseCount: 0,
        blocked: true,
        blockReason: 'verification-only',
      },
      steps: {
        verifyOnlyDispatch: 'success',
        dispatchRelease: 'skipped',
      },
    });
    expect(formatReleaseTriggerSummary(report)).toContain('Release dispatch mode: verify-only');
    expect(formatReleaseTriggerSummary(report)).toContain('Release dispatch blocked: yes');
    expect(buildReleaseTriggerNotification(report)).toMatchObject({
      shouldNotify: false,
      reason: 'verification-only',
    });
    await expect(
      sendReleaseTriggerNotification({
        report,
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: false,
      action: 'skipped',
    });
  });

  it('keeps verification-only reports quiet even when a release run is already active', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '2',
      dispatchMode: 'verify-only',
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        verifyOnlyDispatch: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'skipped',
      reason: 'verification-only',
      dispatch: {
        mode: 'verify-only',
        activeReleaseCount: 2,
        blocked: true,
        blockReason: 'verification-only',
      },
    });
    expect(buildReleaseTriggerNotification(report)).toMatchObject({
      shouldNotify: false,
      reason: 'verification-only',
    });
  });

  it('keeps routine no-change release-trigger reports quiet', async () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'success',
      },
    });
    const fetchImpl = () => {
      throw new Error('quiet notification must not call GitHub');
    };

    expect(buildReleaseTriggerNotification(report)).toMatchObject({
      shouldNotify: false,
      reason: 'no-new-upstream-characters',
    });
    await expect(
      sendReleaseTriggerNotification({
        report,
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: false,
      action: 'skipped',
    });
  });

  it('formats release-dispatched reports as info notifications', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '0',
      generatedAt: '2026-06-26T00:00:00.000Z',
      workflow: {
        repository: 'JohnChourp/optc-team-builder',
        runUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/123',
        sha: 'abc123',
      },
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        dispatchRelease: 'success',
        skipRelease: 'skipped',
      },
    });
    const notification = buildReleaseTriggerNotification(report);

    expect(notification).toMatchObject({
      shouldNotify: true,
      reason: 'release-dispatched',
      severity: 'info',
    });
    expect(notification.body).toContain('Release dispatched: yes');
    expect(notification.body).toContain('New character IDs: 3');
    expect(notification.body).toContain('release-trigger-outcome');
  });

  it('builds a skipped report when an Android release run is already active', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '2',
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'skipped',
      reason: 'active-release-running',
      dispatch: {
        releaseNeeded: true,
        releaseDispatched: false,
        activeReleaseCount: 2,
      },
    });
  });

  it('formats active-release blocked reports as warning notifications', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '2',
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(buildReleaseTriggerNotification(report)).toMatchObject({
      shouldNotify: true,
      reason: 'active-release-running',
      severity: 'warning',
    });
  });

  it('builds an observable skipped report when a duplicate release dispatch is already registered', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const idempotency = buildReleaseDispatchIdempotencyKey({ releaseCheckResult });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '0',
      duplicateReleaseRunMatches: [
        {
          databaseId: 100,
          displayTitle: `Release Android ${idempotency.key}`,
          status: 'completed',
          conclusion: 'failure',
          url: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/100',
        },
        {
          databaseId: 101,
          displayTitle: `Release Android ${idempotency.key}`,
          status: 'completed',
          conclusion: 'success',
          url: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/101',
        },
        {
          databaseId: 102,
          displayTitle: `Release Android ${idempotency.key}`,
          status: 'waiting',
          conclusion: null,
          url: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/102',
        },
      ],
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        duplicateReleaseDispatch: 'success',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'skipped',
      reason: 'duplicate-release-dispatch-blocked',
      dispatch: {
        releaseNeeded: true,
        releaseDispatched: false,
        activeReleaseCount: 0,
        blocked: true,
        blockReason: 'duplicate-release-dispatch-blocked',
        idempotencyKey: idempotency.key,
        duplicateRunCount: 3,
        duplicateBlockingCount: 2,
        duplicateBlocked: true,
      },
      idempotency: {
        strategy: 'release-dispatch-idempotency-key',
        key: idempotency.key,
        duplicateReleaseRunCount: 3,
        duplicateReleaseBlockingCount: 2,
        duplicateReleaseBlocked: true,
        dispatchRegistrationConfirmed: null,
      },
    });
    expect(formatReleaseTriggerSummary(report)).toContain(`Release dispatch idempotency key: ${idempotency.key}`);
    expect(formatReleaseTriggerSummary(report)).toContain('Duplicate release dispatch blocked: yes');
    expect(buildReleaseTriggerNotification(report)).toMatchObject({
      shouldNotify: true,
      reason: 'duplicate-release-dispatch-blocked',
      severity: 'warning',
    });
  });

  it('keeps failed duplicate release attempts visible without blocking retry dispatch', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const idempotency = buildReleaseDispatchIdempotencyKey({ releaseCheckResult });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '0',
      duplicateReleaseRunMatches: [
        {
          databaseId: 100,
          displayTitle: `Release Android ${idempotency.key}`,
          status: 'completed',
          conclusion: 'failure',
          url: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/100',
        },
      ],
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        duplicateReleaseDispatch: 'success',
        dispatchRelease: 'success',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'released',
      reason: 'release-dispatched',
      dispatch: {
        releaseDispatched: true,
        blocked: false,
        duplicateRunCount: 1,
        duplicateBlockingCount: 0,
        duplicateBlocked: false,
      },
    });
  });

  it('marks the report failed when dispatch registration does not appear after dispatch', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '0',
      dispatchRegistrationConfirmed: 'false',
      dispatchRegistrationAttempts: '12',
      dispatchRegistrationMatches: [],
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        duplicateReleaseDispatch: 'success',
        dispatchRelease: 'success',
        dispatchRegistration: 'failure',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'failed',
      reason: 'dispatch-failed',
      dispatch: {
        releaseDispatched: true,
      },
      idempotency: {
        dispatchRegistrationConfirmed: false,
        dispatchRegistrationAttempts: 12,
        dispatchRegistrationRuns: [],
      },
      steps: {
        dispatchRegistration: 'failure',
      },
    });
    expect(formatReleaseTriggerSummary(report)).toContain('Dispatch registration confirmed: no');
  });

  it('keeps release workflow wiring aligned with the dispatch idempotency contract', () => {
    const checkWorkflow = readFileSync('.github/workflows/check-optc-db-release.yml', 'utf8');
    const releaseWorkflow = readFileSync('.github/workflows/release-android.yml', 'utf8');

    expect(checkWorkflow).toContain('concurrency:\n  group: optc-db-release-check\n  cancel-in-progress: false');
    expect(checkWorkflow).toContain('Build release dispatch idempotency key');
    expect(checkWorkflow).toContain('Check duplicate Android release dispatches');
    expect(checkWorkflow).toContain('Confirm dispatched Android release registration');
    expect(checkWorkflow).toContain('.status as $status | .conclusion as $conclusion');
    expect(checkWorkflow).toContain('DISPATCH_REQUESTED_AT');
    expect(checkWorkflow).toContain('(.createdAt // "") >= $requestedAt');
    expect(checkWorkflow).toContain('-f "dispatch_idempotency_key=${RELEASE_DISPATCH_IDEMPOTENCY_KEY}"');
    expect(releaseWorkflow).toContain('run-name: ${{ inputs.dispatch_idempotency_key');
    expect(releaseWorkflow).toContain('dispatch_idempotency_key:');
  });

  it('includes source-contract failure IDs in maintainer notifications', () => {
    const report = buildReleaseTriggerReport({
      releaseCheckResult: {
        releaseNeeded: false,
        reason: 'source-contract-broken',
        source: '2shankz',
        sourceRepository: '2Shankz/optc-db.github.io',
        localSourceVersion: '36',
        remoteSourceVersion: '39',
        localCharacterCount: 2,
        remoteCharacterCount: 0,
        newCharacterIds: [],
        newCharacterCount: 0,
        sourceContract: {
          status: 'failed',
          failures: [{ id: 'normalized-character-ids' }],
        },
      },
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'failure',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });
    const notification = buildReleaseTriggerNotification(report);

    expect(notification).toMatchObject({
      shouldNotify: true,
      reason: 'source-contract-broken',
      severity: 'error',
    });
    expect(notification.body).toContain('Source contract failures: normalized-character-ids');
  });

  it('builds the active-release blocked report from the bundled active-release-running fixture', async () => {
    const releaseCheckResult = await checkOptcReleaseNeeded({ fixture: 'active-release-running' });
    const report = buildReleaseTriggerReport({
      releaseCheckResult,
      activeReleaseCount: '1',
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'success',
        releaseCheck: 'success',
        activeRelease: 'success',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'skipped',
      reason: 'active-release-running',
      comparison: {
        newCharacterIds: [3],
        newCharacterCount: 1,
      },
      dispatch: {
        releaseNeeded: true,
        releaseDispatched: false,
        activeReleaseCount: 1,
      },
    });
  });

  it('retries retryable upstream fetch statuses before returning a normal release result', async () => {
    await withLocalReleaseSnapshot(async (snapshot) => {
      const versionCalls = [];
      const fetchImpl = async (url) => {
        if (String(url).endsWith('/common/data/version.js')) {
          versionCalls.push(url);
          return versionCalls.length === 1
            ? buildMockTextResponse('temporarily unavailable', 503)
            : buildMockTextResponse(validRemoteVersionSource);
        }

        return buildMockTextResponse(validRemoteUnitsSource);
      };

      const result = await checkOptcReleaseNeeded(releaseCheckFetchOptions(snapshot, fetchImpl));

      expect(result).toMatchObject({
        releaseNeeded: true,
        reason: 'new-upstream-characters',
        remoteSourceVersion: '37',
        newCharacterIds: [3],
      });
      expect(result).not.toHaveProperty('upstreamFetch');
      expect(versionCalls).toHaveLength(2);
    });
  });

  it('classifies repeated upstream timeouts with structured JSON diagnostics', async () => {
    await withLocalReleaseSnapshot(async (snapshot) => {
      const timeoutError = new Error('The operation was aborted.');
      timeoutError.name = 'AbortError';
      const fetchImpl = async () => {
        throw timeoutError;
      };

      await expect(checkOptcReleaseNeeded(releaseCheckFetchOptions(snapshot, fetchImpl))).rejects.toMatchObject({
        code: 'UPSTREAM_FETCH_FAILED',
        reason: 'upstream-timeout',
        releaseCheckResult: {
          releaseNeeded: false,
          reason: 'upstream-timeout',
          localSourceVersion: '36',
          remoteSourceVersion: 'unknown',
          upstreamFetch: {
            status: 'failed',
            reason: 'upstream-timeout',
            policy: {
              attempts: 2,
              timeoutMs: 25,
              retryDelayMs: 0,
            },
          },
        },
      });
    });
  });

  it('classifies retry-exhausted 5xx upstream responses as unavailable', async () => {
    await withLocalReleaseSnapshot(async (snapshot) => {
      const fetchImpl = async (url) => {
        if (String(url).endsWith('/common/data/version.js')) {
          return buildMockTextResponse('server error', 503);
        }

        return buildMockTextResponse(validRemoteUnitsSource);
      };

      let rejection;
      try {
        await checkOptcReleaseNeeded(releaseCheckFetchOptions(snapshot, fetchImpl));
      } catch (error) {
        rejection = error;
      }

      expect(rejection).toMatchObject({
        code: 'UPSTREAM_FETCH_FAILED',
        reason: 'upstream-unavailable',
        releaseCheckResult: {
          reason: 'upstream-unavailable',
          upstreamFetch: {
            status: 'failed',
            files: expect.arrayContaining([
              expect.objectContaining({
                relativePath: 'common/data/version.js',
                status: 'failed',
                attemptCount: 2,
                finalReason: 'upstream-unavailable',
              }),
              expect.objectContaining({
                relativePath: 'common/data/units.js',
                status: 'passed',
                attemptCount: 1,
              }),
            ]),
          },
        },
      });
    });
  });

  it('does not retry non-retryable upstream 4xx responses', async () => {
    await withLocalReleaseSnapshot(async (snapshot) => {
      const versionCalls = [];
      const fetchImpl = async (url) => {
        if (String(url).endsWith('/common/data/version.js')) {
          versionCalls.push(url);
          return buildMockTextResponse('not found', 404);
        }

        return buildMockTextResponse(validRemoteUnitsSource);
      };

      await expect(
        checkOptcReleaseNeeded(releaseCheckFetchOptions(snapshot, fetchImpl, { attempts: 3 })),
      ).rejects.toMatchObject({
        reason: 'upstream-unavailable',
        releaseCheckResult: {
          upstreamFetch: {
            files: expect.arrayContaining([
              expect.objectContaining({
                relativePath: 'common/data/version.js',
                attemptCount: 1,
              }),
            ]),
          },
        },
      });
      expect(versionCalls).toHaveLength(1);
    });
  });

  it('classifies body read failures as partial upstream data', async () => {
    await withLocalReleaseSnapshot(async (snapshot) => {
      const fetchImpl = async (url) => {
        if (String(url).endsWith('/common/data/units.js')) {
          return buildMockTextFailureResponse(new Error('response body ended early'));
        }

        return buildMockTextResponse(validRemoteVersionSource);
      };

      await expect(checkOptcReleaseNeeded(releaseCheckFetchOptions(snapshot, fetchImpl))).rejects.toMatchObject({
        code: 'UPSTREAM_FETCH_FAILED',
        reason: 'upstream-partial-data',
        releaseCheckResult: {
          reason: 'upstream-partial-data',
          upstreamFetch: {
            files: expect.arrayContaining([
              expect.objectContaining({
                relativePath: 'common/data/units.js',
                status: 'failed',
                finalReason: 'upstream-partial-data',
                attemptCount: 2,
              }),
            ]),
          },
        },
      });
    });
  });

  it('classifies aborted body reads as upstream timeouts', async () => {
    await withLocalReleaseSnapshot(async (snapshot) => {
      const timeoutError = new Error('The operation was aborted.');
      timeoutError.name = 'AbortError';
      const fetchImpl = async (url) => {
        if (String(url).endsWith('/common/data/units.js')) {
          return buildMockTextFailureResponse(timeoutError);
        }

        return buildMockTextResponse(validRemoteVersionSource);
      };

      await expect(checkOptcReleaseNeeded(releaseCheckFetchOptions(snapshot, fetchImpl))).rejects.toMatchObject({
        code: 'UPSTREAM_FETCH_FAILED',
        reason: 'upstream-timeout',
        releaseCheckResult: {
          reason: 'upstream-timeout',
          upstreamFetch: {
            files: expect.arrayContaining([
              expect.objectContaining({
                relativePath: 'common/data/units.js',
                status: 'failed',
                finalReason: 'upstream-timeout',
                attemptCount: 2,
              }),
            ]),
          },
        },
      });
    });
  });

  it('builds a failed report when fixture validation fails before the live check', () => {
    const report = buildReleaseTriggerReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'failure',
        releaseCheck: 'skipped',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });

    expect(report).toMatchObject({
      status: 'failed',
      reason: 'fixture-validation-failed',
      releaseCheck: null,
      comparison: null,
    });
  });

  it('formats release-trigger failure reasons as error notifications', () => {
    const releaseCheckResult = buildReleaseCheckResult({
      source: dataImportSources['2shankz'],
      localSourceVersion: '36',
      remoteSourceVersion: '37',
      localCharacterIds: [1, 2],
      remoteCharacters: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const failureCases = [
      {
        reason: 'fixture-validation-failed',
        releaseCheckResult: null,
        stepOutcomes: {
          fixtureValidation: 'failure',
          releaseCheck: 'skipped',
          activeRelease: 'skipped',
          dispatchRelease: 'skipped',
          skipRelease: 'skipped',
        },
      },
      {
        reason: 'detector-failed',
        releaseCheckResult: null,
        stepOutcomes: {
          fixtureValidation: 'success',
          releaseCheck: 'failure',
          activeRelease: 'skipped',
          dispatchRelease: 'skipped',
          skipRelease: 'skipped',
        },
      },
      {
        reason: 'source-contract-broken',
        releaseCheckResult: {
          ...releaseCheckResult,
          releaseNeeded: false,
          reason: 'source-contract-broken',
          newCharacterIds: [],
          newCharacterCount: 0,
          sourceContract: {
            status: 'failed',
            failures: [{ id: 'normalized-character-ids' }],
          },
        },
        stepOutcomes: {
          fixtureValidation: 'success',
          releaseCheck: 'failure',
          activeRelease: 'skipped',
          dispatchRelease: 'skipped',
          skipRelease: 'skipped',
        },
      },
      ...[
        'upstream-timeout',
        'upstream-unavailable',
        'upstream-partial-data',
        'upstream-malformed-data',
      ].map((reason) => ({
        reason,
        releaseCheckResult: {
          ...releaseCheckResult,
          releaseNeeded: false,
          reason,
          newCharacterIds: [],
          newCharacterCount: 0,
          upstreamFetch: {
            schemaVersion: 1,
            status: 'failed',
            reason,
            files: [
              {
                relativePath: 'common/data/units.js',
                status: 'failed',
                finalReason: reason,
              },
            ],
          },
        },
        stepOutcomes: {
          fixtureValidation: 'success',
          releaseCheck: 'failure',
          activeRelease: 'skipped',
          dispatchRelease: 'skipped',
          skipRelease: 'skipped',
        },
      })),
      {
        reason: 'active-release-check-failed',
        releaseCheckResult,
        stepOutcomes: {
          fixtureValidation: 'success',
          releaseCheck: 'success',
          activeRelease: 'failure',
          dispatchRelease: 'skipped',
          skipRelease: 'skipped',
        },
      },
      {
        reason: 'dispatch-failed',
        releaseCheckResult,
        activeReleaseCount: '0',
        stepOutcomes: {
          fixtureValidation: 'success',
          releaseCheck: 'success',
          activeRelease: 'success',
          dispatchRelease: 'failure',
          skipRelease: 'skipped',
        },
      },
    ];

    for (const failureCase of failureCases) {
      const { reason, ...reportInput } = failureCase;
      const report = buildReleaseTriggerReport({
        generatedAt: '2026-06-26T00:00:00.000Z',
        ...reportInput,
      });

      expect(report.reason).toBe(reason);
      expect(buildReleaseTriggerNotification(report)).toMatchObject({
        shouldNotify: true,
        reason,
        severity: 'error',
      });
    }
  });

  it('creates the notification issue when no thread exists', async () => {
    const report = buildReleaseTriggerReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'failure',
        releaseCheck: 'skipped',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });

      if (calls.length === 1) {
        return buildMockGitHubResponse([]);
      }

      return buildMockGitHubResponse({
        number: 42,
        html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/42',
      });
    };

    await expect(
      sendReleaseTriggerNotification({
        report,
        env: {
          GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
          GITHUB_TOKEN: 'token',
        },
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: true,
      action: 'created',
      issueNumber: 42,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('/issues?state=open');
    expect(calls[1].url).toBe('https://api.github.com/repos/JohnChourp/optc-team-builder/issues');
    expect(JSON.parse(calls[1].options.body)).toMatchObject({
      title: releaseTriggerPolicy.notification.issueTitle,
    });
    expect(JSON.parse(calls[1].options.body).body).toContain(releaseTriggerPolicy.notification.issueMarker);
  });

  it('comments on the existing notification issue thread', async () => {
    const report = buildReleaseTriggerReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'failure',
        releaseCheck: 'skipped',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });

      if (calls.length === 1) {
        return buildMockGitHubResponse([
          {
            number: 42,
            title: releaseTriggerPolicy.notification.issueTitle,
            body: releaseTriggerPolicy.notification.issueMarker,
            html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/42',
          },
        ]);
      }

      return buildMockGitHubResponse({
        html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/42#issuecomment-1',
      });
    };

    await expect(
      sendReleaseTriggerNotification({
        report,
        env: {
          GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
          GITHUB_TOKEN: 'token',
        },
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: true,
      action: 'commented',
      issueNumber: 42,
    });
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe('https://api.github.com/repos/JohnChourp/optc-team-builder/issues/42/comments');
    expect(JSON.parse(calls[1].options.body).body).toContain('fixture-validation-failed');
  });

  it('paginates notification issue lookup before creating duplicate threads', async () => {
    const report = buildReleaseTriggerReport({
      generatedAt: '2026-06-26T00:00:00.000Z',
      stepOutcomes: {
        fixtureValidation: 'failure',
        releaseCheck: 'skipped',
        activeRelease: 'skipped',
        dispatchRelease: 'skipped',
        skipRelease: 'skipped',
      },
    });
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1,
      title: `Other issue ${index + 1}`,
      body: '',
      html_url: `https://github.com/JohnChourp/optc-team-builder/issues/${index + 1}`,
    }));
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });

      if (calls.length === 1) {
        return buildMockGitHubResponse(firstPage);
      }

      if (calls.length === 2) {
        return buildMockGitHubResponse([
          {
            number: 142,
            title: releaseTriggerPolicy.notification.issueTitle,
            body: releaseTriggerPolicy.notification.issueMarker,
            html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/142',
          },
        ]);
      }

      return buildMockGitHubResponse({
        html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/142#issuecomment-1',
      });
    };

    await expect(
      sendReleaseTriggerNotification({
        report,
        env: {
          GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
          GITHUB_TOKEN: 'token',
        },
        fetchImpl,
        logger: { info: () => undefined },
      }),
    ).resolves.toMatchObject({
      sent: true,
      action: 'commented',
      issueNumber: 142,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0].url).toContain('page=1');
    expect(calls[1].url).toContain('page=2');
    expect(calls[2].url).toBe('https://api.github.com/repos/JohnChourp/optc-team-builder/issues/142/comments');
  });

  for (const fixtureCase of RELEASE_CHECK_REPLAY_FIXTURE_CASES) {
    it(`replays the bundled ${fixtureCase.fixture} fixture: ${fixtureCase.branch}`, async () => {
      const { fixture, branch, expectedResult } = fixtureCase;

      expect(branch.length).toBeGreaterThan(0);
      await expect(checkOptcReleaseNeeded({ fixture })).resolves.toMatchObject(expectedResult);
    });
  }

  it('fails deterministically for the malformed error fixture', async () => {
    await expect(
      checkOptcReleaseNeeded({ fixture: MALFORMED_RELEASE_CHECK_FIXTURE }),
    ).rejects.toMatchObject({
      code: 'UPSTREAM_FETCH_FAILED',
      reason: 'upstream-malformed-data',
      releaseCheckResult: {
        reason: 'upstream-malformed-data',
        upstreamFetch: {
          status: 'failed',
          reason: 'upstream-malformed-data',
          files: expect.arrayContaining([
            expect.objectContaining({
              relativePath: 'common/data/units.js',
              status: 'failed',
              finalReason: 'upstream-malformed-data',
            }),
          ]),
        },
      },
    });
  });

  it('fails malformed upstream JavaScript fixtures with a structured JSON result from the CLI', async () => {
    let rejection;

    try {
      await execFileAsync(process.execPath, [
        releaseCheckCliPath,
        '--fixture=error',
        '--json',
      ]);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: 1,
    });

    const result = JSON.parse(String(rejection.stdout));
    expect(result).toMatchObject({
      releaseNeeded: false,
      reason: 'upstream-malformed-data',
      upstreamFetch: {
        status: 'failed',
        reason: 'upstream-malformed-data',
      },
    });
    expect(String(rejection.stderr)).toContain('OPTC DB upstream fetch failed');
  });

  it('fails source-contract drift with a structured JSON result from the CLI', async () => {
    let rejection;

    try {
      await execFileAsync(process.execPath, [
        releaseCheckCliPath,
        '--fixture=source-contract-broken',
        '--json',
      ]);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      code: 1,
    });

    const result = JSON.parse(String(rejection.stdout));
    expect(result).toMatchObject({
      releaseNeeded: false,
      reason: 'source-contract-broken',
      source: '2shankz',
      sourceRepository: '2Shankz/optc-db.github.io',
      localSourceVersion: '36',
      remoteSourceVersion: '39',
      localCharacterCount: 2,
      remoteCharacterCount: 0,
      newCharacterIds: [],
      newCharacterCount: 0,
      sourceContract: {
        status: 'failed',
        failures: [
          {
            id: 'normalized-character-ids',
          },
        ],
      },
    });
    expect(String(rejection.stderr)).toContain('OPTC DB source contract broken');
  });

  it('converts normalization exceptions into source-contract failures', async () => {
    const fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'optc-source-contract-throw-'));

    try {
      await Promise.all([
        writeFile(path.join(fixtureDir, RELEASE_CHECK_FIXTURE_FILE_NAMES.manifestPath), '{ "sourceVersion": "36" }\n'),
        writeFile(
          path.join(fixtureDir, RELEASE_CHECK_FIXTURE_FILE_NAMES.seedPath),
          "CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT);\nINSERT INTO characters (id, name) VALUES (1, 'Fixture Luffy');\n",
        ),
        writeFile(path.join(fixtureDir, RELEASE_CHECK_FIXTURE_FILE_NAMES.remoteVersionPath), 'var dbVersion = "40";\n'),
        writeFile(path.join(fixtureDir, RELEASE_CHECK_FIXTURE_FILE_NAMES.remoteUnitsPath), 'window.units = [null];\n'),
      ]);

      await expect(checkOptcReleaseNeeded({ fixtureDir })).rejects.toMatchObject({
        code: 'SOURCE_CONTRACT_BROKEN',
        releaseCheckResult: {
          releaseNeeded: false,
          reason: 'source-contract-broken',
          sourceContract: {
            status: 'failed',
            failures: [
              {
                id: 'normalized-character-ids',
                details: {
                  normalizedCharacterCount: 0,
                },
              },
            ],
          },
        },
      });
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
});

function buildMockGitHubResponse(payload, ok = true, status = 200) {
  const text = JSON.stringify(payload);

  return {
    ok,
    status,
    text: async () => text,
  };
}

function normalizePath(value: unknown) {
  return String(value).replace(/\\/g, '/');
}

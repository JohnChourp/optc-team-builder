import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReleaseDetectorStatusReport,
  formatReleaseDetectorStatusMarkdown,
  RELEASE_DETECTOR_STATUS_SCHEMA_VERSION,
  runCli,
} from './release-detector-status.mjs';

const execFileAsync = promisify(execFile);
const generatedAt = '2026-07-03T00:00:00.000Z';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-release-status-'));
  tempDirs.push(dir);
  return dir;
}

function releaseTriggerReport(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt,
    status: 'skipped',
    reason: 'no-new-upstream-characters',
    workflow: {
      name: 'Check OPTC DB Release',
      repository: 'JohnChourp/optc-team-builder',
      runId: '123',
      runNumber: '12',
      runAttempt: '1',
      runUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/123',
      eventName: 'schedule',
      ref: 'refs/heads/main',
      sha: '0123456789abcdef0123456789abcdef01234567',
      actor: 'someone',
    },
    comparison: {
      source: '2shankz',
      sourceRepository: '2Shankz/optc-db.github.io',
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterCount: 4578,
      remoteCharacterCount: 4578,
      newCharacterIds: [],
      newCharacterCount: 0,
    },
    dispatch: {
      releaseWorkflow: 'release-android.yml',
      ref: 'main',
      bump: 'patch',
      mode: 'dispatch-if-needed',
      releaseNeeded: false,
      releaseDispatched: false,
      activeReleaseCount: null,
      blocked: false,
      blockReason: null,
      idempotencyKey: null,
      duplicateRunCount: 0,
      duplicateBlockingCount: 0,
      duplicateBlocked: false,
    },
    idempotency: {
      strategy: 'release-dispatch-idempotency-key',
      key: null,
      payload: null,
      duplicateReleaseRuns: [],
      duplicateReleaseRunCount: 0,
      duplicateReleaseBlockingCount: 0,
      duplicateReleaseBlocked: false,
      dispatchRegistrationConfirmed: null,
      dispatchRegistrationAttempts: null,
      dispatchRegistrationRuns: [],
    },
    steps: {},
    ...overrides,
  };
}

function upstreamMonitorReport(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt,
    status: 'passed',
    workflow: {
      name: 'Check OPTC DB Release',
      repository: 'JohnChourp/optc-team-builder',
      runId: '123',
      runUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/123',
      eventName: 'schedule',
      ref: 'refs/heads/main',
      sha: '0123456789abcdef0123456789abcdef01234567',
    },
    current: {
      source: '2shankz',
      sourceRepository: '2Shankz/optc-db.github.io',
      localSourceVersion: '36',
      remoteSourceVersion: '36',
      localCharacterCount: 4578,
      remoteCharacterCount: 4578,
      releaseNeeded: false,
      detectorReason: 'no-new-upstream-characters',
      newCharacterCount: 0,
      newCharacterIds: [],
      newCharacterIdSample: [],
    },
    warnings: [],
    ...overrides,
  };
}

describe('release-detector-status', () => {
  it('builds a compact status report from release trigger and monitor reports', () => {
    const report = buildReleaseDetectorStatusReport({
      releaseTriggerReport: releaseTriggerReport(),
      upstreamMonitorReport: upstreamMonitorReport(),
      generatedAt,
    });

    expect(report).toMatchObject({
      schemaVersion: RELEASE_DETECTOR_STATUS_SCHEMA_VERSION,
      generatedAt,
      status: 'skipped',
      reason: 'no-new-upstream-characters',
      verdict: {
        releaseNeeded: false,
        releaseDispatched: false,
        dispatchMode: 'dispatch-if-needed',
        dispatchBlocked: false,
      },
      dataset: {
        sourceRepository: '2Shankz/optc-db.github.io',
        localDatasetVersion: '36',
        upstreamDatasetVersion: '36',
        localCharacterCount: 4578,
        upstreamCharacterCount: 4578,
        characterCountDelta: 0,
        newCharacterCount: 0,
        newCharacterIdSample: [],
        newCharacterIdsTruncated: false,
        deltaSummary: 'local dataset matches upstream by source version, count, and character IDs',
      },
      sourceContract: {
        status: null,
        failureCount: 0,
        failureIds: [],
      },
      idempotency: {
        strategy: 'release-dispatch-idempotency-key',
        key: null,
        duplicateReleaseRunCount: 0,
        duplicateReleaseBlockingCount: 0,
        duplicateReleaseBlocked: false,
        matchingRunUrls: [],
        dispatchRegistrationConfirmed: null,
        dispatchRegistrationAttempts: null,
        dispatchRegistrationRunUrls: [],
      },
      monitor: {
        status: 'passed',
        warningCount: 0,
        warningIds: [],
      },
      workflow: {
        runUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/123',
      },
      inputErrors: [],
    });
    expect(Object.keys(report.workflow)).not.toContain('actor');
  });

  it('promotes upstream monitor warnings without losing release-needed fields', () => {
    const newIds = Array.from({ length: 25 }, (_, index) => index + 4600);
    const report = buildReleaseDetectorStatusReport({
      releaseTriggerReport: releaseTriggerReport({
        status: 'skipped',
        reason: 'verification-only',
        comparison: {
          source: '2shankz',
          sourceRepository: '2Shankz/optc-db.github.io',
          localSourceVersion: '36',
          remoteSourceVersion: '37',
          localCharacterCount: 4578,
          remoteCharacterCount: 4603,
          newCharacterIds: newIds,
          newCharacterCount: newIds.length,
        },
        dispatch: {
          mode: 'verify-only',
          releaseNeeded: true,
          releaseDispatched: false,
          activeReleaseCount: 0,
          blocked: true,
          blockReason: 'verification-only',
        },
      }),
      upstreamMonitorReport: upstreamMonitorReport({
        status: 'warning',
        warnings: [{ id: 'persistent-local-lag', severity: 'warning' }],
      }),
      generatedAt,
    });

    expect(report.status).toBe('warning');
    expect(report.reason).toBe('upstream-monitor-warning');
    expect(report.verdict).toMatchObject({
      releaseNeeded: true,
      releaseDispatched: false,
      dispatchMode: 'verify-only',
      dispatchBlocked: true,
      dispatchBlockReason: 'verification-only',
      activeReleaseCount: 0,
    });
    expect(report.dataset.newCharacterIdSample).toHaveLength(20);
    expect(report.dataset.newCharacterIdsTruncated).toBe(true);
    expect(report.dataset.deltaSummary).toBe('25 new upstream character IDs');
    expect(report.monitor.warningIds).toEqual(['persistent-local-lag']);
  });

  it('formats a maintainer-readable Markdown summary', () => {
    const report = buildReleaseDetectorStatusReport({
      releaseTriggerReport: releaseTriggerReport(),
      upstreamMonitorReport: upstreamMonitorReport(),
      generatedAt,
    });

    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('# OPTC DB Release Detector Status');
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('- Local dataset version: 36');
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('- New upstream character IDs: none');
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('## Source Contract');
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('## Dispatch Idempotency');
  });

  it('surfaces duplicate dispatch guard state for maintainer scanability', () => {
    const report = buildReleaseDetectorStatusReport({
      releaseTriggerReport: releaseTriggerReport({
        status: 'skipped',
        reason: 'duplicate-release-dispatch-blocked',
        dispatch: {
          releaseWorkflow: 'release-android.yml',
          ref: 'main',
          bump: 'patch',
          mode: 'dispatch-if-needed',
          releaseNeeded: true,
          releaseDispatched: false,
          activeReleaseCount: 0,
          blocked: true,
          blockReason: 'duplicate-release-dispatch-blocked',
          idempotencyKey: 'optc-release-1234abcd5678ef90',
          duplicateRunCount: 2,
          duplicateBlockingCount: 1,
          duplicateBlocked: true,
        },
        idempotency: {
          strategy: 'release-dispatch-idempotency-key',
          key: 'optc-release-1234abcd5678ef90',
          dispatchRegistrationConfirmed: false,
          dispatchRegistrationAttempts: 12,
          duplicateReleaseRuns: [
            {
              url: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/101',
              status: 'completed',
              conclusion: 'success',
              blocking: true,
            },
          ],
          duplicateReleaseRunCount: 2,
          duplicateReleaseBlockingCount: 1,
          duplicateReleaseBlocked: true,
          dispatchRegistrationRuns: [
            {
              url: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/102',
              status: 'queued',
            },
          ],
        },
      }),
      upstreamMonitorReport: upstreamMonitorReport(),
      generatedAt,
    });

    expect(report).toMatchObject({
      status: 'skipped',
      reason: 'duplicate-release-dispatch-blocked',
      idempotency: {
        strategy: 'release-dispatch-idempotency-key',
        key: 'optc-release-1234abcd5678ef90',
        duplicateReleaseRunCount: 2,
        duplicateReleaseBlockingCount: 1,
        duplicateReleaseBlocked: true,
        matchingRunUrls: ['https://github.com/JohnChourp/optc-team-builder/actions/runs/101'],
        dispatchRegistrationConfirmed: false,
        dispatchRegistrationAttempts: 12,
        dispatchRegistrationRunUrls: ['https://github.com/JohnChourp/optc-team-builder/actions/runs/102'],
      },
    });
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('- Duplicate release blocked: yes');
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('- Dispatch registration confirmed: false');
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('optc-release-1234abcd5678ef90');
  });

  it('surfaces source-contract failures from the release trigger report', () => {
    const report = buildReleaseDetectorStatusReport({
      releaseTriggerReport: releaseTriggerReport({
        status: 'failed',
        reason: 'source-contract-broken',
        releaseCheck: {
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
                message: 'Upstream units did not normalize to any positive canonical character IDs.',
              },
            ],
          },
        },
        comparison: {
          source: '2shankz',
          sourceRepository: '2Shankz/optc-db.github.io',
          localSourceVersion: '36',
          remoteSourceVersion: '39',
          localCharacterCount: 2,
          remoteCharacterCount: 0,
          newCharacterIds: [],
          newCharacterCount: 0,
        },
        sourceContract: {
          status: 'failed',
          failures: [
            {
              id: 'normalized-character-ids',
            },
          ],
        },
      }),
      upstreamMonitorReport: upstreamMonitorReport(),
      generatedAt,
    });

    expect(report).toMatchObject({
      status: 'failed',
      reason: 'source-contract-broken',
      sourceContract: {
        status: 'failed',
        failureCount: 1,
        failureIds: ['normalized-character-ids'],
      },
      dataset: {
        upstreamCharacterCount: 0,
        newCharacterCount: 0,
      },
    });
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('- Status: failed');
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('- Failure IDs: normalized-character-ids');
  });

  it('surfaces upstream fetch diagnostics from the release trigger report', () => {
    const report = buildReleaseDetectorStatusReport({
      releaseTriggerReport: releaseTriggerReport({
        status: 'failed',
        reason: 'upstream-partial-data',
        releaseCheck: {
          releaseNeeded: false,
          reason: 'upstream-partial-data',
          source: '2shankz',
          sourceRepository: '2Shankz/optc-db.github.io',
          localSourceVersion: '36',
          remoteSourceVersion: 'unknown',
          localCharacterCount: 2,
          remoteCharacterCount: 0,
          newCharacterIds: [],
          newCharacterCount: 0,
          upstreamFetch: {
            schemaVersion: 1,
            status: 'failed',
            reason: 'upstream-partial-data',
            files: [
              {
                relativePath: 'common/data/units.js',
                status: 'failed',
                finalReason: 'upstream-partial-data',
                attemptCount: 2,
              },
            ],
          },
        },
      }),
      upstreamMonitorReport: upstreamMonitorReport({
        status: 'failed',
        warnings: [{ id: 'release-check-failed', severity: 'error' }],
      }),
      generatedAt,
    });

    expect(report).toMatchObject({
      status: 'failed',
      reason: 'upstream-partial-data',
      upstreamFetch: {
        status: 'failed',
        reason: 'upstream-partial-data',
        failedFileCount: 1,
        failedFiles: [
          {
            relativePath: 'common/data/units.js',
            reason: 'upstream-partial-data',
            attempts: 2,
          },
        ],
      },
    });
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain('## Upstream Fetch');
    expect(formatReleaseDetectorStatusMarkdown(report)).toContain(
      '- Failure details: common/data/units.js:upstream-partial-data',
    );
  });

  it('writes failed JSON and Markdown outputs when an input report is missing or malformed', async () => {
    const rootDir = await makeTempDir();
    const releaseTriggerPath = path.join(rootDir, 'release-trigger-outcome.json');
    const missingMonitorPath = path.join(rootDir, 'missing-monitor.json');
    const outputPath = path.join(rootDir, 'release-detector-status.json');
    const summaryPath = path.join(rootDir, 'release-detector-status.md');
    await writeFile(releaseTriggerPath, 'not json');

    const report = await runCli([
      '--release-trigger-report',
      releaseTriggerPath,
      '--upstream-monitor-report',
      missingMonitorPath,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
      '--generated-at',
      generatedAt,
    ]);

    expect(report.status).toBe('failed');
    expect(report.reason).toBe('status-input-unavailable');
    expect(report.dataset.newCharacterCount).toBeNull();
    expect(report.dataset.deltaSummary).toBe('dataset comparison unavailable');
    expect(report.inputErrors).toHaveLength(2);
    await expect(readFile(outputPath, 'utf8')).resolves.toContain('"status": "failed"');
    const summary = await readFile(summaryPath, 'utf8');
    expect(summary).toContain('- New upstream character count: n/a');
    expect(summary).toContain('## Input Errors');
  });

  it('can be imported without executing CLI detection', async () => {
    const moduleUrl = pathToFileURL(path.join(import.meta.dirname, 'release-detector-status.mjs')).href;
    const { stdout } = await execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const mod = await import(${JSON.stringify(moduleUrl)}); console.log(mod.RELEASE_DETECTOR_STATUS_SCHEMA_VERSION);`,
    ]);

    expect(stdout.trim()).toBe('1');
  });
});

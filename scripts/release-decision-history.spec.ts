import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReleaseDecisionHistory,
  DEFAULT_MAX_RUNS,
  formatReleaseDecisionHistoryMarkdown,
  RELEASE_DECISION_HISTORY_SCHEMA_VERSION,
  runCli,
} from './release-decision-history.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./release-decision-history.mjs', import.meta.url));

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-release-decision-history-'));
  tempDirs.push(dir);
  return dir;
}

function statusReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-06T08:00:00.000Z',
    status: 'skipped',
    reason: 'no-new-upstream-characters',
    verdict: {
      releaseNeeded: false,
      releaseDispatched: false,
      dispatchMode: 'dispatch-if-needed',
      dispatchBlocked: false,
      dispatchBlockReason: null,
      activeReleaseCount: null,
    },
    dataset: {
      source: '2shankz',
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
      status: 'passed',
      failureCount: 0,
      failureIds: [],
    },
    upstreamFetch: {
      status: null,
      reason: null,
      failedFileCount: 0,
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
      name: 'Check OPTC DB Release',
      repository: 'JohnChourp/optc-team-builder',
      runId: '200',
      runNumber: '20',
      runAttempt: '1',
      runUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/200',
      eventName: 'schedule',
      ref: 'refs/heads/main',
      sha: 'sha-200',
    },
    inputErrors: [],
    ...overrides,
  };
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe('release-decision-history', () => {
  it('builds current-first recent decision history from current status and prior artifacts', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'current', 'release-detector-status.json');
    const historyDir = path.join(rootDir, 'history');
    await writeJson(
      currentPath,
      statusReport({
        generatedAt: '2026-07-06T08:00:00.000Z',
        workflow: {
          ...statusReport().workflow,
          runId: '300',
          runUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/300',
          sha: 'sha-300',
        },
      }),
    );
    await writeJson(
      path.join(historyDir, 'run-200', 'release-detector-status.json'),
      statusReport({
        generatedAt: '2026-07-05T08:00:00.000Z',
        status: 'released',
        reason: 'release-dispatched',
        verdict: {
          releaseNeeded: true,
          releaseDispatched: true,
          dispatchMode: 'dispatch-if-needed',
          dispatchBlocked: false,
          dispatchBlockReason: null,
        },
        dataset: {
          ...statusReport().dataset,
          upstreamDatasetVersion: '37',
          upstreamCharacterCount: 4581,
          characterCountDelta: 3,
          newCharacterCount: 3,
          newCharacterIdSample: [4580, 4581, 4582],
          deltaSummary: '3 new upstream character IDs',
        },
      }),
    );
    await writeJson(path.join(historyDir, 'ignored', 'not-status.json'), { schemaVersion: 1, metricRows: [] });

    const history = await buildReleaseDecisionHistory({
      currentStatusPath: currentPath,
      historyDir,
      maxRuns: 45,
    });

    expect(history).toMatchObject({
      schemaVersion: RELEASE_DECISION_HISTORY_SCHEMA_VERSION,
      retention: {
        maxRuns: 45,
        artifactRetentionDays: 90,
        historyArtifactName: 'release-decision-history',
        sourceArtifactName: 'release-detector-status',
      },
      latest: {
        workflow: {
          runId: '300',
        },
      },
      summary: {
        runCount: 2,
        releaseNeededCount: 1,
        releaseDispatchedCount: 1,
        statusCounts: {
          released: 1,
          skipped: 1,
        },
        skipOrDispatchReasonCounts: {
          'no-new-upstream-characters': 1,
          'release-dispatched': 1,
        },
      },
    });
    expect(history.recentRuns.map((run) => run.workflow.runId)).toEqual(['300', '200']);
    expect(history.recentRuns[1].dataset.newCharacterIdSample).toEqual([4580, 4581, 4582]);
  });

  it('dedupes the current run and prunes to max-runs', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'current.json');
    const historyDir = path.join(rootDir, 'history');
    const current = statusReport({
      generatedAt: '2026-07-06T08:00:00.000Z',
      workflow: {
        ...statusReport().workflow,
        runId: '300',
      },
    });
    await writeJson(currentPath, current);
    await writeJson(path.join(historyDir, 'duplicate-current', 'release-detector-status.json'), current);
    await writeJson(
      path.join(historyDir, 'run-200', 'release-detector-status.json'),
      statusReport({
        generatedAt: '2026-07-05T08:00:00.000Z',
        workflow: {
          ...statusReport().workflow,
          runId: '200',
        },
      }),
    );
    await writeJson(
      path.join(historyDir, 'run-100', 'release-detector-status.json'),
      statusReport({
        generatedAt: '2026-07-04T08:00:00.000Z',
        workflow: {
          ...statusReport().workflow,
          runId: '100',
        },
      }),
    );

    const history = await buildReleaseDecisionHistory({
      currentStatusPath: currentPath,
      historyDir,
      maxRuns: 2,
    });

    expect(history.recentRuns.map((run) => run.workflow.runId)).toEqual(['300', '200']);
    expect(history.retention.maxRuns).toBe(2);
  });

  it('keeps null numeric fields as null instead of coercing them to zero', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'current.json');
    await writeJson(
      currentPath,
      statusReport({
        dataset: {
          ...statusReport().dataset,
          localCharacterCount: null,
          upstreamCharacterCount: null,
          newCharacterCount: null,
          newCharacterIdSample: [],
        },
        idempotency: {
          ...statusReport().idempotency,
          dispatchRegistrationAttempts: null,
        },
      }),
    );

    const history = await buildReleaseDecisionHistory({ currentStatusPath: currentPath });

    expect(history.latest.dataset.localCharacterCount).toBeNull();
    expect(history.latest.dataset.upstreamCharacterCount).toBeNull();
    expect(history.latest.dataset.newCharacterCount).toBeNull();
    expect(history.latest.idempotency.dispatchRegistrationAttempts).toBeNull();
  });

  it('formats a maintainer-readable markdown summary', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'current.json');
    await writeJson(
      currentPath,
      statusReport({
        status: 'warning',
        reason: 'upstream\\monitor|warning',
        monitor: {
          status: 'warning',
          warningCount: 1,
          warningIds: ['persistent-local-lag'],
        },
      }),
    );
    const history = await buildReleaseDecisionHistory({ currentStatusPath: currentPath });
    const markdown = formatReleaseDecisionHistoryMarkdown(history);

    expect(markdown).toContain('# OPTC DB Release Decision History');
    expect(markdown).toContain(`Retention: latest ${DEFAULT_MAX_RUNS} runs, 90 days per artifact`);
    expect(markdown).toContain('| Generated | Status | Reason | Decision reason |');
    expect(markdown).toContain('upstream\\\\monitor\\|warning');
    expect(markdown).toContain('persistent-local-lag');
  });

  it('writes JSON and Markdown from the CLI', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'current.json');
    const outputPath = path.join(rootDir, 'release-decision-history.json');
    const summaryPath = path.join(rootDir, 'release-decision-history.md');
    await writeJson(currentPath, statusReport());

    const history = await runCli([
      '--current-status',
      currentPath,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
      '--max-runs',
      '3',
    ]);

    expect(history.retention.maxRuns).toBe(3);
    expect(JSON.parse(await readFile(outputPath, 'utf8')).schemaVersion).toBe(RELEASE_DECISION_HISTORY_SCHEMA_VERSION);
    expect(await readFile(summaryPath, 'utf8')).toContain('## Latest Decision');
  });

  it('exits nonzero for invalid current status input', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'invalid.json');
    await writeJson(currentPath, { schemaVersion: 1 });

    await expect(execFileAsync('node', [scriptPath, '--current-status', currentPath])).rejects.toMatchObject({
      code: 1,
    });
  });
});

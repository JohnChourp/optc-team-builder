import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildUpstreamMonitorReport,
  formatUpstreamMonitorSummary,
  runCli,
} from './check-optc-upstream-monitor.mjs';
import {
  buildUpstreamMonitorNotification,
  sendUpstreamMonitorNotification,
} from './notify-upstream-monitor.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-upstream-monitor-'));
  tempDirs.push(dir);
  return dir;
}

function releaseCheckResult(overrides: Record<string, unknown> = {}) {
  return {
    releaseNeeded: false,
    reason: 'no-new-upstream-characters',
    source: '2shankz',
    sourceRepository: '2Shankz/optc-db.github.io',
    localSourceVersion: '36',
    remoteSourceVersion: '36',
    localCharacterCount: 4577,
    remoteCharacterCount: 4577,
    newCharacterIds: [],
    newCharacterCount: 0,
    ...overrides,
  };
}

function historyReport(generatedAt: string, overrides: Record<string, unknown> = {}) {
  return buildUpstreamMonitorReport({
    releaseCheckResult: releaseCheckResult(overrides),
    generatedAt,
    env: {
      GITHUB_WORKFLOW: 'Check OPTC DB Release',
      GITHUB_EVENT_NAME: 'schedule',
      GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
      GITHUB_RUN_ID: generatedAt.replace(/\D/g, '').slice(0, 8),
    },
  });
}

function failedHistoryReport(generatedAt: string) {
  return buildUpstreamMonitorReport({
    generatedAt,
    env: {
      GITHUB_WORKFLOW: 'Check OPTC DB Release',
      GITHUB_EVENT_NAME: 'schedule',
      GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
      GITHUB_RUN_ID: generatedAt.replace(/\D/g, '').slice(0, 8),
    },
  });
}

const scheduledEnv = {
  GITHUB_WORKFLOW: 'Check OPTC DB Release',
  GITHUB_EVENT_NAME: 'schedule',
  GITHUB_REPOSITORY: 'JohnChourp/optc-team-builder',
  GITHUB_RUN_ID: '10000000',
};

describe('check-optc-upstream-monitor', () => {
  it('keeps routine no-change runs quiet without enough history', () => {
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult(),
      generatedAt: '2026-07-01T00:00:00.000Z',
    });

    expect(report.status).toBe('passed');
    expect(report.warnings).toEqual([]);
    expect(formatUpstreamMonitorSummary(report)).toContain('Warnings');
  });

  it('warns when upstream version and count stay unchanged for at least 21 days', () => {
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult(),
      generatedAt: '2026-07-01T00:00:00.000Z',
      historyReports: [
        historyReport('2026-06-08T00:00:00.000Z'),
        historyReport('2026-06-20T00:00:00.000Z'),
      ],
      env: scheduledEnv,
    });

    expect(report.status).toBe('warning');
    expect(report.warnings).toEqual([
      expect.objectContaining({
        id: 'stale-upstream',
        severity: 'warning',
      }),
    ]);
  });

  it('does not use manual runs to complete stale-upstream scheduled sample windows', () => {
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult(),
      generatedAt: '2026-07-01T00:00:00.000Z',
      historyReports: [
        historyReport('2026-06-08T00:00:00.000Z'),
        historyReport('2026-06-20T00:00:00.000Z'),
      ],
      env: {
        ...scheduledEnv,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
      },
    });

    expect(report.status).toBe('passed');
    expect(report.warnings).toEqual([]);
  });

  it('requires a contiguous trailing scheduled window for stale-upstream warnings', () => {
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult(),
      generatedAt: '2026-07-01T00:00:00.000Z',
      historyReports: [
        historyReport('2026-06-08T00:00:00.000Z'),
        historyReport('2026-06-20T00:00:00.000Z', {
          remoteSourceVersion: '37',
          remoteCharacterCount: 4590,
        }),
        historyReport('2026-06-30T00:00:00.000Z'),
      ],
      env: scheduledEnv,
    });

    expect(report.status).toBe('passed');
    expect(report.warnings).toEqual([]);
  });

  it('treats failed scheduled history reports as stale-upstream window breakers', () => {
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult(),
      generatedAt: '2026-07-01T00:00:00.000Z',
      historyReports: [
        historyReport('2026-06-08T00:00:00.000Z'),
        failedHistoryReport('2026-06-20T00:00:00.000Z'),
        historyReport('2026-06-30T00:00:00.000Z'),
      ],
      env: scheduledEnv,
    });

    expect(report.status).toBe('passed');
    expect(report.warnings).toEqual([]);
  });

  it('warns on material normalized shape drift without new upstream IDs', () => {
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult({
        remoteCharacterCount: 4000,
      }),
      generatedAt: '2026-07-01T00:00:00.000Z',
      historyReports: [
        historyReport('2026-06-24T00:00:00.000Z', { remoteCharacterCount: 4575 }),
        historyReport('2026-06-25T00:00:00.000Z', { remoteCharacterCount: 4577 }),
        historyReport('2026-06-26T00:00:00.000Z', { remoteCharacterCount: 4579 }),
      ],
    });

    expect(report.status).toBe('warning');
    expect(report.warnings).toEqual([
      expect.objectContaining({
        id: 'normalized-shape-drift',
      }),
    ]);
  });

  it('warns when the same new upstream IDs persist across scheduled samples', () => {
    const newIds = [4578, 4579];
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult({
        releaseNeeded: true,
        reason: 'new-upstream-characters',
        remoteSourceVersion: '37',
        remoteCharacterCount: 4579,
        newCharacterIds: newIds,
        newCharacterCount: newIds.length,
      }),
      generatedAt: '2026-07-01T00:00:00.000Z',
      historyReports: [
        historyReport('2026-06-29T00:00:00.000Z', {
          releaseNeeded: true,
          reason: 'new-upstream-characters',
          remoteSourceVersion: '37',
          remoteCharacterCount: 4579,
          newCharacterIds: newIds,
          newCharacterCount: newIds.length,
        }),
        historyReport('2026-06-30T00:00:00.000Z', {
          releaseNeeded: true,
          reason: 'new-upstream-characters',
          remoteSourceVersion: '37',
          remoteCharacterCount: 4579,
          newCharacterIds: newIds,
          newCharacterCount: newIds.length,
        }),
      ],
      env: scheduledEnv,
    });

    expect(report.status).toBe('warning');
    expect(report.warnings).toEqual([
      expect.objectContaining({
        id: 'persistent-local-lag',
      }),
    ]);
  });

  it('treats failed scheduled history reports as persistent-lag window breakers', () => {
    const newIds = [4578, 4579];
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult({
        releaseNeeded: true,
        reason: 'new-upstream-characters',
        remoteSourceVersion: '37',
        remoteCharacterCount: 4579,
        newCharacterIds: newIds,
        newCharacterCount: newIds.length,
      }),
      generatedAt: '2026-07-01T00:00:00.000Z',
      historyReports: [
        historyReport('2026-06-29T00:00:00.000Z', {
          releaseNeeded: true,
          reason: 'new-upstream-characters',
          remoteSourceVersion: '37',
          remoteCharacterCount: 4579,
          newCharacterIds: newIds,
          newCharacterCount: newIds.length,
        }),
        failedHistoryReport('2026-06-30T00:00:00.000Z'),
      ],
      env: scheduledEnv,
    });

    expect(report.status).toBe('passed');
    expect(report.warnings).toEqual([]);
  });

  it('fails the monitor report when release detector output is missing', () => {
    const report = buildUpstreamMonitorReport({
      generatedAt: '2026-07-01T00:00:00.000Z',
    });

    expect(report.status).toBe('failed');
    expect(report.warnings).toEqual([
      expect.objectContaining({
        id: 'release-check-missing',
        severity: 'error',
      }),
    ]);
  });

  it('writes CLI JSON and Markdown outputs', async () => {
    const rootDir = await makeTempDir();
    const releaseCheckPath = path.join(rootDir, 'release-check.json');
    const outputPath = path.join(rootDir, 'upstream-monitor-report.json');
    const summaryPath = path.join(rootDir, 'upstream-monitor-summary.md');
    await writeFile(releaseCheckPath, JSON.stringify(releaseCheckResult()));

    await runCli([
      '--release-check',
      releaseCheckPath,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
      '--generated-at',
      '2026-07-01T00:00:00.000Z',
    ]);

    await expect(readFile(outputPath, 'utf8')).resolves.toContain('"status": "passed"');
    await expect(readFile(summaryPath, 'utf8')).resolves.toContain('OPTC DB upstream freshness and drift monitor');
  });

  it('writes a failed CLI report for unreadable release-check JSON', async () => {
    const rootDir = await makeTempDir();
    const releaseCheckPath = path.join(rootDir, 'release-check.json');
    const outputPath = path.join(rootDir, 'upstream-monitor-report.json');
    const summaryPath = path.join(rootDir, 'upstream-monitor-summary.md');
    await writeFile(releaseCheckPath, 'not json');

    await runCli([
      '--release-check',
      releaseCheckPath,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
      '--generated-at',
      '2026-07-01T00:00:00.000Z',
    ]);

    await expect(readFile(outputPath, 'utf8')).resolves.toContain('"id": "release-check-missing"');
  });

  it('loads nested history artifact reports for CLI comparisons', async () => {
    const rootDir = await makeTempDir();
    const historyRoot = path.join(rootDir, 'history');
    const historyDir = path.join(historyRoot, 'run-1');
    const secondHistoryDir = path.join(historyRoot, 'run-2');
    const releaseCheckPath = path.join(rootDir, 'release-check.json');
    const outputPath = path.join(rootDir, 'upstream-monitor-report.json');
    const summaryPath = path.join(rootDir, 'upstream-monitor-summary.md');
    await mkdir(historyDir, { recursive: true });
    await mkdir(secondHistoryDir, { recursive: true });
    await writeFile(releaseCheckPath, JSON.stringify(releaseCheckResult()));
    await writeFile(
      path.join(historyDir, 'upstream-monitor-report.json'),
      JSON.stringify(historyReport('2026-06-08T00:00:00.000Z')),
    );
    await writeFile(
      path.join(secondHistoryDir, 'upstream-monitor-report.json'),
      JSON.stringify(historyReport('2026-06-20T00:00:00.000Z')),
    );

    await runCli([
      '--release-check',
      releaseCheckPath,
      '--history-dir',
      historyRoot,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
      '--generated-at',
      '2026-07-01T00:00:00.000Z',
    ], scheduledEnv);

    await expect(readFile(outputPath, 'utf8')).resolves.toContain('"id": "stale-upstream"');
  });
});

describe('notify-upstream-monitor', () => {
  it('keeps passed monitor reports quiet', () => {
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult(),
      generatedAt: '2026-07-01T00:00:00.000Z',
    });

    expect(buildUpstreamMonitorNotification(report)).toMatchObject({
      shouldNotify: false,
      status: 'passed',
    });
  });

  it('creates the dedicated monitor issue for warnings', async () => {
    const report = buildUpstreamMonitorReport({
      releaseCheckResult: releaseCheckResult(),
      generatedAt: '2026-07-01T00:00:00.000Z',
      historyReports: [
        historyReport('2026-06-08T00:00:00.000Z'),
        historyReport('2026-06-20T00:00:00.000Z'),
      ],
      env: scheduledEnv,
    });
    const calls: Array<{ url: string; options: { body?: string } }> = [];
    const fetchImpl = async (url: string, options: { body?: string } = {}) => {
      calls.push({ url, options });

      if (calls.length === 1) {
        return buildMockGitHubResponse([]);
      }

      return buildMockGitHubResponse({
        number: 99,
        html_url: 'https://github.com/JohnChourp/optc-team-builder/issues/99',
      });
    };

    await expect(
      sendUpstreamMonitorNotification({
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
      issueNumber: 99,
    });
    expect(JSON.parse(calls[1].options.body ?? '{}').body).toContain(
      '<!-- optc-upstream-monitor-notifications -->',
    );
  });
});

function buildMockGitHubResponse(payload: unknown, ok = true, status = 200) {
  const text = JSON.stringify(payload);

  return {
    ok,
    status,
    text: async () => text,
  };
}

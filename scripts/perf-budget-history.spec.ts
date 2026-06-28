import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPerformanceBudgetHistory,
  formatPerformanceBudgetHistorySummary,
} from './perf-budget-history.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-perf-history-'));
  tempDirs.push(dir);
  return dir;
}

function report(overrides: {
  generatedAt: string;
  runId: string;
  runUrl: string;
  sha?: string;
  status?: string;
  actualMs: number;
  failures?: unknown[];
  warnings?: unknown[];
}) {
  const hardBudgetFailures = overrides.failures ?? [];
  const baselineDeltaWarnings = overrides.warnings ?? [];

  return {
    schemaVersion: 1,
    generatedAt: overrides.generatedAt,
    status: overrides.status ?? 'passed',
    workflow: {
      name: 'Performance Budgets',
      runId: overrides.runId,
      runNumber: overrides.runId,
      runUrl: overrides.runUrl,
      ref: 'refs/heads/main',
      sha: overrides.sha ?? `sha-${overrides.runId}`,
      eventName: 'schedule',
    },
    summary: {
      metricCount: 1,
      budgetedMetricCount: 1,
      hardBudgetFailureCount: hardBudgetFailures.length,
      baselineDeltaWarningCount: baselineDeltaWarnings.length,
    },
    metricRows: [
      {
        id: 'ability-filters.desktop.saved-teams.firsttogglems',
        harness: 'ability-filters',
        viewport: 'desktop',
        area: 'Saved Teams',
        metric: 'first ability toggle',
        metricKey: 'firstToggleMs',
        actualMs: overrides.actualMs,
        budgetMs: 800,
        hardBudgetStatus: overrides.actualMs <= 800 ? 'passed' : 'failed',
        baselineWarning: baselineDeltaWarnings.length > 0,
      },
    ],
    hardBudgetFailures,
    baselineDeltaWarnings,
  };
}

describe('perf-budget-history', () => {
  it('builds recent run and per-metric trend data from current plus history reports', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'current.json');
    const historyDir = path.join(rootDir, 'history', 'run-100');
    await mkdir(historyDir, { recursive: true });
    await writeFile(
      currentPath,
      JSON.stringify(
        report({
          generatedAt: '2026-06-28T00:00:00.000Z',
          runId: '200',
          runUrl: 'https://example.test/actions/runs/200',
          actualMs: 300,
        }),
      ),
    );
    await writeFile(
      path.join(historyDir, 'performance-budget-report.json'),
      JSON.stringify(
        report({
          generatedAt: '2026-06-27T00:00:00.000Z',
          runId: '100',
          runUrl: 'https://example.test/actions/runs/100',
          actualMs: 200,
        }),
      ),
    );

    const history = await buildPerformanceBudgetHistory({
      currentReportPath: currentPath,
      historyDir: path.join(rootDir, 'history'),
    });

    expect(history.recentRuns.map((run) => run.workflow.runId)).toEqual(['200', '100']);
    expect(history.metricTrendRows).toContainEqual(
      expect.objectContaining({
        id: 'ability-filters.desktop.saved-teams.firsttogglems',
        latestActualMs: 300,
        previousActualMs: 200,
        deltaFromPreviousMs: 100,
        deltaFromPreviousPercent: 50,
      }),
    );
    expect(formatPerformanceBudgetHistorySummary(history)).toContain('Performance Budget History');
  });

  it('ignores non-report JSON and caps retained runs', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'current.json');
    const historyDir = path.join(rootDir, 'history');
    await mkdir(path.join(historyDir, 'run-100'), { recursive: true });
    await mkdir(path.join(historyDir, 'run-101'), { recursive: true });
    await writeFile(
      currentPath,
      JSON.stringify(
        report({
          generatedAt: '2026-06-28T00:00:00.000Z',
          runId: '200',
          runUrl: 'https://example.test/actions/runs/200',
          actualMs: 300,
        }),
      ),
    );
    await writeFile(path.join(historyDir, 'not-a-report.json'), JSON.stringify({ schemaVersion: 1 }));
    await writeFile(
      path.join(historyDir, 'run-101', 'performance-budget-report.json'),
      JSON.stringify(
        report({
          generatedAt: '2026-06-27T00:00:00.000Z',
          runId: '101',
          runUrl: 'https://example.test/actions/runs/101',
          actualMs: 250,
        }),
      ),
    );
    await writeFile(
      path.join(historyDir, 'run-100', 'performance-budget-report.json'),
      JSON.stringify(
        report({
          generatedAt: '2026-06-26T00:00:00.000Z',
          runId: '100',
          runUrl: 'https://example.test/actions/runs/100',
          actualMs: 200,
        }),
      ),
    );

    const history = await buildPerformanceBudgetHistory({
      currentReportPath: currentPath,
      historyDir,
      maxRuns: 2,
    });

    expect(history.recentRuns.map((run) => run.workflow.runId)).toEqual(['200', '101']);
    expect(history.metricTrendRows[0].recentPoints.map((point) => point.runId)).toEqual(['200', '101']);
  });

  it('writes latest failures and warnings into the summary', async () => {
    const rootDir = await makeTempDir();
    const currentPath = path.join(rootDir, 'current.json');
    await writeFile(
      currentPath,
      JSON.stringify(
        report({
          generatedAt: '2026-06-28T00:00:00.000Z',
          runId: '200',
          runUrl: 'https://example.test/actions/runs/200',
          status: 'failed',
          actualMs: 900,
          failures: [{ metricId: 'm1', message: 'm1 failed' }],
          warnings: [{ metricId: 'm2', message: 'm2 warning' }],
        }),
      ),
    );

    const history = await buildPerformanceBudgetHistory({ currentReportPath: currentPath });
    const outputPath = path.join(rootDir, 'summary.md');
    await writeFile(outputPath, formatPerformanceBudgetHistorySummary(history));

    await expect(readFile(outputPath, 'utf8')).resolves.toContain('m1 failed');
    await expect(readFile(outputPath, 'utf8')).resolves.toContain('m2 warning');
  });
});

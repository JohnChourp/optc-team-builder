import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildPerformanceBudgetReport,
  formatPerformanceBudgetSummary,
  runCli,
} from './perf-budget-report.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-perf-budget-'));
  tempDirs.push(dir);
  return dir;
}

function abilityResult(overrides: Record<string, number> = {}) {
  return {
    capturedAt: '2026-06-27T00:00:00.000Z',
    baseURL: 'http://127.0.0.1:8427',
    appCommit: 'abc1234',
    runLabel: 'ability-filter',
    selectedAbilities: { special: 'reduce-damage' },
    viewportRuns: [
      {
        viewport: 'desktop',
        timings: {
          savedTeams: {
            pageReadyMs: 100,
            firstToggleMs: overrides.desktopSavedTeamsToggle ?? 200,
          },
          savedEnemies: {
            pageReadyMs: 100,
            firstToggleMs: 150,
          },
          manualPicker: {
            pageReadyMs: 100,
            pickerOpenMs: 200,
            specialFilterMs: 900,
          },
        },
      },
      {
        viewport: 'mobile',
        timings: {
          savedTeams: {
            pageReadyMs: 100,
            firstToggleMs: 250,
          },
          savedEnemies: {
            pageReadyMs: 100,
            firstToggleMs: 180,
          },
          manualPicker: {
            pageReadyMs: 100,
            pickerOpenMs: 220,
            specialFilterMs: 950,
          },
        },
      },
    ],
  };
}

function explanationResult() {
  return {
    capturedAt: '2026-06-27T00:00:00.000Z',
    baseURL: 'http://127.0.0.1:8436',
    appCommit: 'abc1234',
    runLabel: 'explanation-compare',
    fixture: { savedTeamCount: 500 },
    viewportRuns: [
      {
        viewport: 'desktop',
        timings: {
          compare: { compareOpenMs: 60, compareImportMs: 70 },
          importShareHydration: {
            savedTeamsParseSanitizeMs: 20,
            savedTeamsImportReadyMs: 900,
            manualShareHydrationMs: 500,
          },
          explanations: { firstExplanationToggleMs: 20, allExplanationToggleMs: 40 },
        },
      },
      {
        viewport: 'mobile',
        timings: {
          compare: { compareOpenMs: 80, compareImportMs: 90 },
          importShareHydration: {
            savedTeamsParseSanitizeMs: 25,
            savedTeamsImportReadyMs: 1000,
            manualShareHydrationMs: 600,
          },
          explanations: { firstExplanationToggleMs: 30, allExplanationToggleMs: 50 },
        },
      },
    ],
  };
}

async function writeCurrentResults(rootDir: string, ability = abilityResult()) {
  const abilityDir = path.join(rootDir, 'current', 'ability');
  const explanationDir = path.join(rootDir, 'current', 'explanation');
  await mkdir(abilityDir, { recursive: true });
  await mkdir(explanationDir, { recursive: true });
  await writeFile(path.join(abilityDir, 'ability-performance.json'), JSON.stringify(ability));
  await writeFile(path.join(explanationDir, 'explanation-performance.json'), JSON.stringify(explanationResult()));
  return path.join(rootDir, 'current');
}

describe('perf-budget-report', () => {
  it('builds a passing report without a baseline', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(rootDir);
    const report = await buildPerformanceBudgetReport({ currentDir });

    expect(report.status).toBe('passed');
    expect(report.summary.metricCount).toBe(28);
    expect(report.summary.budgetedMetricCount).toBe(22);
    expect(report.hardBudgetFailures).toEqual([]);
    expect(report.baseline).toBeNull();
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'ability-filters.desktop.saved-teams.firsttogglems',
        actualMs: 200,
        budgetMs: 800,
      }),
    );
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'explanation-compare.desktop.import-share-hydration.savedteamsimportreadyms',
        actualMs: 900,
        budgetMs: 3000,
      }),
    );
  });

  it('fails hard budgets while still reporting all metrics', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(
      rootDir,
      abilityResult({
        desktopSavedTeamsToggle: 801,
      }),
    );
    const report = await buildPerformanceBudgetReport({ currentDir });

    expect(report.status).toBe('failed');
    expect(report.hardBudgetFailures).toEqual([
      expect.objectContaining({
        metricId: 'ability-filters.desktop.saved-teams.firsttogglems',
      }),
    ]);
    expect(report.metricRows).toHaveLength(28);
  });

  it('warns on large baseline deltas without failing when hard budgets pass', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(rootDir);
    const baselinePath = path.join(rootDir, 'baseline-report.json');
    await writeFile(
      baselinePath,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-06-26T00:00:00.000Z',
        status: 'passed',
        workflow: { runUrl: 'https://example.test/actions/runs/1' },
        metricRows: [
          {
            id: 'ability-filters.desktop.saved-teams.firsttogglems',
            actualMs: 50,
          },
        ],
      }),
    );

    const report = await buildPerformanceBudgetReport({
      currentDir,
      baselineReportPath: baselinePath,
    });

    expect(report.status).toBe('warning');
    expect(report.hardBudgetFailures).toEqual([]);
    expect(report.baselineDeltaWarnings).toEqual([
      expect.objectContaining({
        metricId: 'ability-filters.desktop.saved-teams.firsttogglems',
      }),
    ]);
    expect(formatPerformanceBudgetSummary(report)).toContain('Baseline Delta Warnings');
  });

  it('writes useful current result metadata', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(rootDir);
    const report = await buildPerformanceBudgetReport({ currentDir });
    const serialized = JSON.stringify(report);

    expect(serialized).toContain('ability-performance.json');
    expect(serialized).toContain('explanation-performance.json');
    await writeFile(path.join(rootDir, 'report.json'), `${serialized}\n`);
    await expect(readFile(path.join(rootDir, 'report.json'), 'utf8')).resolves.toContain('"schemaVersion":1');
  });

  it('supports report-only CLI output without failing the process on hard-budget misses', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(
      rootDir,
      abilityResult({
        desktopSavedTeamsToggle: 801,
      }),
    );
    const outputPath = path.join(rootDir, 'report.json');
    const summaryPath = path.join(rootDir, 'summary.md');
    process.exitCode = undefined;

    await runCli([
      '--current-dir',
      currentDir,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
      '--report-only',
    ]);

    await expect(readFile(outputPath, 'utf8')).resolves.toContain('"status": "failed"');
    await expect(readFile(summaryPath, 'utf8')).resolves.toContain('Hard Budget Failures');
    expect(process.exitCode).toBeUndefined();
  });
});

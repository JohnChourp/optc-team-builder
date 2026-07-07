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
  process.exitCode = undefined;
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

function routeLoadResult(overrides: Record<string, number | null> = {}) {
  const value = (key: string, fallback: number) => (Object.hasOwn(overrides, key) ? overrides[key] : fallback);

  return {
    schemaVersion: 2,
    capturedAt: '2026-07-05T00:00:00.000Z',
    baseURL: 'http://127.0.0.1:8448',
    appCommit: 'abc1234',
    runLabel: 'route-load',
    bundle: {
      initial: {
        rawBytes: value('initialRawBytes', 1_300_000),
        gzipBytes: value('initialGzipBytes', 320_000),
      },
      routes: {
        guide: { rawBytes: value('guideRawBytes', 4_000), gzipBytes: 2_000 },
        manualShare: { rawBytes: value('manualShareRawBytes', 274_000), gzipBytes: 64_000 },
        compare: { rawBytes: value('compareRawBytes', 636_000), gzipBytes: 140_000 },
        characters: { rawBytes: value('charactersRawBytes', 70_000), gzipBytes: 16_000 },
        savedTeams: { rawBytes: value('savedTeamsRawBytes', 74_000), gzipBytes: 19_000 },
        captainCoverage: { rawBytes: value('captainCoverageRawBytes', 78_000), gzipBytes: 19_000 },
      },
    },
    viewportRuns: [
      {
        viewport: 'desktop',
        timings: {
          routes: {
            guideShareCompareReadyMs: value('desktopGuideReadyMs', 200),
            manualShareLandingReadyMs: value('desktopManualShareReadyMs', 1000),
            compareEntryReadyMs: value('desktopCompareReadyMs', 450),
            charactersSearchReadyMs: value('desktopCharactersSearchReadyMs', 1100),
            savedTeamsReadyMs: value('desktopSavedTeamsReadyMs', 1500),
            captainCoverageReadyMs: value('desktopCaptainCoverageReadyMs', 1600),
          },
        },
      },
      {
        viewport: 'mobile',
        timings: {
          routes: {
            guideShareCompareReadyMs: value('mobileGuideReadyMs', 200),
            manualShareLandingReadyMs: value('mobileManualShareReadyMs', 1000),
            compareEntryReadyMs: value('mobileCompareReadyMs', 450),
            charactersSearchReadyMs: value('mobileCharactersSearchReadyMs', 1100),
            savedTeamsReadyMs: value('mobileSavedTeamsReadyMs', 1500),
            captainCoverageReadyMs: value('mobileCaptainCoverageReadyMs', 1600),
          },
        },
      },
    ],
  };
}

function savedTeamCodecResult(overrides: Record<string, number | null> = {}) {
  const value = (key: string, fallback: number) => (Object.hasOwn(overrides, key) ? overrides[key] : fallback);

  return {
    schemaVersion: 1,
    harness: 'saved-team-codecs',
    capturedAt: '2026-07-06T00:00:00.000Z',
    appCommit: 'abc1234',
    runLabel: 'saved-team-codecs',
    fixture: { bulkTeamCount: 1500, bulkJsonBytes: 490_000, shareCodeBytes: 44_000 },
    viewportRuns: [
      {
        viewport: 'node',
        timings: {
          savedTeamCodecs: {
            bulkExportEncodeMs: value('bulkExportEncodeMs', 1),
            bulkJsonParseMs: value('bulkJsonParseMs', 1),
            bulkSanitizeMs: value('bulkSanitizeMs', 1),
            bulkParseSanitizeMs: value('bulkParseSanitizeMs', 2),
            shareEncodeMs: value('shareEncodeMs', 1),
            shareDecodeMs: value('shareDecodeMs', 1),
            shareResolveSanitizeMs: value('shareResolveSanitizeMs', 1),
            invalidValidationMs: value('invalidValidationMs', 1),
          },
        },
      },
    ],
  };
}

async function writeCurrentResults(
  rootDir: string,
  ability = abilityResult(),
  routeLoad = routeLoadResult(),
  savedTeamCodecs = savedTeamCodecResult(),
) {
  const abilityDir = path.join(rootDir, 'current', 'ability');
  const explanationDir = path.join(rootDir, 'current', 'explanation');
  const savedTeamCodecsDir = path.join(rootDir, 'current', 'saved-team-codecs');
  const routeLoadDir = path.join(rootDir, 'current', 'route-load');
  await mkdir(abilityDir, { recursive: true });
  await mkdir(explanationDir, { recursive: true });
  await mkdir(savedTeamCodecsDir, { recursive: true });
  await mkdir(routeLoadDir, { recursive: true });
  await writeFile(path.join(abilityDir, 'ability-performance.json'), JSON.stringify(ability));
  await writeFile(path.join(explanationDir, 'explanation-performance.json'), JSON.stringify(explanationResult()));
  await writeFile(
    path.join(savedTeamCodecsDir, 'saved-team-codecs-performance.json'),
    JSON.stringify(savedTeamCodecs),
  );
  await writeFile(path.join(routeLoadDir, 'route-load-performance.json'), JSON.stringify(routeLoad));
  return path.join(rootDir, 'current');
}

describe('perf-budget-report', () => {
  it('builds a passing report without a baseline', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(rootDir);
    const report = await buildPerformanceBudgetReport({ currentDir });

    expect(report.status).toBe('passed');
    expect(report.summary.metricCount).toBe(56);
    expect(report.summary.budgetedMetricCount).toBe(50);
    expect(report.hardBudgetFailures).toEqual([]);
    expect(report.invalidMetricFailures).toEqual([]);
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
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'route-load.desktop.route-load.manualsharelandingreadyms',
        actualMs: 1000,
        budgetMs: 2500,
      }),
    );
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'route-load.desktop.route-load.characterssearchreadyms',
        actualMs: 1100,
        budgetMs: 1600,
      }),
    );
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'route-load.mobile.route-load.captaincoveragereadyms',
        actualMs: 1600,
        budgetMs: 4500,
      }),
    );
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'saved-team-codecs.node.saved-team-codecs.sharedecodems',
        actualMs: 1,
        budgetMs: 3,
      }),
    );
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'route-load.bundle.bundle.initial-raw-js',
        actualMs: 1_300_000,
        budgetMs: 1_500_000,
        unit: 'bytes',
      }),
    );
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'route-load.bundle.bundle.compare-route-raw-js',
        actualMs: 636_000,
        budgetMs: 740_000,
        unit: 'bytes',
      }),
    );
    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'route-load.bundle.bundle.characters-route-raw-js',
        actualMs: 70_000,
        budgetMs: 170_000,
        unit: 'bytes',
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
    expect(report.metricRows).toHaveLength(56);
  });

  it('fails route-load timing and bundle hard budgets', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(
      rootDir,
      abilityResult(),
      routeLoadResult({
        desktopManualShareReadyMs: 2500.4,
        compareRawBytes: 740_001,
        desktopCharactersSearchReadyMs: 1600.4,
        savedTeamsRawBytes: 140_001,
      }),
    );
    const report = await buildPerformanceBudgetReport({ currentDir });

    expect(report.status).toBe('failed');
    expect(report.hardBudgetFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricId: 'route-load.desktop.route-load.manualsharelandingreadyms',
          message: expect.stringContaining('2500.4ms > 2500ms'),
        }),
        expect.objectContaining({
          metricId: 'route-load.bundle.bundle.compare-route-raw-js',
          message: expect.stringContaining('740.0KB'),
        }),
        expect.objectContaining({
          metricId: 'route-load.desktop.route-load.characterssearchreadyms',
          message: expect.stringContaining('1600.4ms > 1600ms'),
        }),
        expect.objectContaining({
          metricId: 'route-load.bundle.bundle.saved-teams-route-raw-js',
          message: expect.stringContaining('140.0KB'),
        }),
      ]),
    );
  });

  it('fails saved-team codec hard budgets', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(
      rootDir,
      abilityResult(),
      routeLoadResult(),
      savedTeamCodecResult({
        shareDecodeMs: 3.1,
      }),
    );
    const report = await buildPerformanceBudgetReport({ currentDir });

    expect(report.status).toBe('failed');
    expect(report.hardBudgetFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricId: 'saved-team-codecs.node.saved-team-codecs.sharedecodems',
        }),
      ]),
    );
  });

  it('keeps sub-millisecond codec timings visible in the Markdown summary', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(
      rootDir,
      abilityResult(),
      routeLoadResult(),
      savedTeamCodecResult({
        shareDecodeMs: 0.07,
      }),
    );
    const report = await buildPerformanceBudgetReport({ currentDir });

    expect(formatPerformanceBudgetSummary(report)).toContain(
      '| saved-team-codecs | node | Saved-team codecs | share decode | 0.07ms | 3ms | n/a | n/a |',
    );
  });

  it('reports missing route-load metrics as failed rows', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(
      rootDir,
      abilityResult(),
      routeLoadResult({
        desktopManualShareReadyMs: null,
      }),
    );
    const report = await buildPerformanceBudgetReport({ currentDir });

    expect(report.status).toBe('failed');
    expect(report.hardBudgetFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metricId: 'route-load.desktop.route-load.manualsharelandingreadyms',
          message: expect.stringContaining('n/a'),
        }),
      ]),
    );
    expect(report.invalidMetricFailures).toEqual([
      expect.objectContaining({
        metricId: 'route-load.desktop.route-load.manualsharelandingreadyms',
      }),
    ]);
    expect(formatPerformanceBudgetSummary(report)).toContain('| route-load | desktop | Route load | manual share landing ready | n/a |');
  });

  it('requires route-load performance results', async () => {
    const rootDir = await makeTempDir();
    const abilityDir = path.join(rootDir, 'current', 'ability');
    const explanationDir = path.join(rootDir, 'current', 'explanation');
    const savedTeamCodecsDir = path.join(rootDir, 'current', 'saved-team-codecs');
    await mkdir(abilityDir, { recursive: true });
    await mkdir(explanationDir, { recursive: true });
    await mkdir(savedTeamCodecsDir, { recursive: true });
    await writeFile(path.join(abilityDir, 'ability-performance.json'), JSON.stringify(abilityResult()));
    await writeFile(path.join(explanationDir, 'explanation-performance.json'), JSON.stringify(explanationResult()));
    await writeFile(
      path.join(savedTeamCodecsDir, 'saved-team-codecs-performance.json'),
      JSON.stringify(savedTeamCodecResult()),
    );

    await expect(buildPerformanceBudgetReport({ currentDir: path.join(rootDir, 'current') })).rejects.toThrow(
      'Missing route-load performance result',
    );
  });

  it('requires saved-team codec performance results', async () => {
    const rootDir = await makeTempDir();
    const abilityDir = path.join(rootDir, 'current', 'ability');
    const explanationDir = path.join(rootDir, 'current', 'explanation');
    const routeLoadDir = path.join(rootDir, 'current', 'route-load');
    await mkdir(abilityDir, { recursive: true });
    await mkdir(explanationDir, { recursive: true });
    await mkdir(routeLoadDir, { recursive: true });
    await writeFile(path.join(abilityDir, 'ability-performance.json'), JSON.stringify(abilityResult()));
    await writeFile(path.join(explanationDir, 'explanation-performance.json'), JSON.stringify(explanationResult()));
    await writeFile(path.join(routeLoadDir, 'route-load-performance.json'), JSON.stringify(routeLoadResult()));

    await expect(buildPerformanceBudgetReport({ currentDir: path.join(rootDir, 'current') })).rejects.toThrow(
      'Missing saved-team-codecs performance result',
    );
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

  it('preserves negative signs for improved timing deltas', async () => {
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
            actualMs: 250,
          },
        ],
      }),
    );

    const report = await buildPerformanceBudgetReport({
      currentDir,
      baselineReportPath: baselinePath,
    });

    expect(formatPerformanceBudgetSummary(report)).toContain(
      '| ability-filters | desktop | Saved Teams | first ability toggle | 200ms | 800ms | 250ms | -50ms (-20.0%) |',
    );
  });

  it('preserves sub-millisecond baseline precision for codec deltas', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(
      rootDir,
      abilityResult(),
      routeLoadResult(),
      savedTeamCodecResult({
        shareDecodeMs: 0.07,
      }),
    );
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
            id: 'saved-team-codecs.node.saved-team-codecs.sharedecodems',
            actualMs: 0.08,
          },
        ],
      }),
    );

    const report = await buildPerformanceBudgetReport({
      currentDir,
      baselineReportPath: baselinePath,
    });

    expect(report.metricRows).toContainEqual(
      expect.objectContaining({
        id: 'saved-team-codecs.node.saved-team-codecs.sharedecodems',
        baselineMs: 0.08,
        deltaMs: -0.01,
      }),
    );
    expect(formatPerformanceBudgetSummary(report)).toContain(
      '| saved-team-codecs | node | Saved-team codecs | share decode | 0.07ms | 3ms | 0.08ms | -0.01ms (-12.5%) |',
    );
  });

  it('writes useful current result metadata', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(rootDir);
    const report = await buildPerformanceBudgetReport({ currentDir });
    const serialized = JSON.stringify(report);

    expect(serialized).toContain('ability-performance.json');
    expect(serialized).toContain('explanation-performance.json');
    expect(serialized).toContain('saved-team-codecs-performance.json');
    expect(serialized).toContain('route-load-performance.json');
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
    await expect(readFile(summaryPath, 'utf8')).resolves.toContain('1.30MB');
    expect(process.exitCode).toBeUndefined();
  });

  it('fails report-only CLI output when required metric telemetry is invalid', async () => {
    const rootDir = await makeTempDir();
    const currentDir = await writeCurrentResults(
      rootDir,
      abilityResult(),
      routeLoadResult({
        desktopManualShareReadyMs: null,
      }),
    );
    const outputPath = path.join(rootDir, 'invalid-report.json');
    const summaryPath = path.join(rootDir, 'invalid-summary.md');

    await runCli([
      '--current-dir',
      currentDir,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
      '--report-only',
    ]);

    await expect(readFile(outputPath, 'utf8')).resolves.toContain('"invalidMetricFailureCount": 1');
    await expect(readFile(summaryPath, 'utf8')).resolves.toContain('missing or non-finite');
    expect(process.exitCode).toBe(1);
  });
});

#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PERFORMANCE_HISTORY_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_RUNS = 10;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatMs(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.001) {
    return `${rounded}ms`;
  }

  return `${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}ms`;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}MB`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}KB`;
  }

  return `${Math.round(value)}B`;
}

function formatMetricValue(value, unit) {
  return unit === 'bytes' ? formatBytes(value) : formatMs(value);
}

function formatDeltaValue(value, unit) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  if (unit === 'bytes') {
    return `${value >= 0 ? '+' : ''}${formatBytes(value)}`;
  }

  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${formatMs(Math.abs(value))}`;
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'n/a';
}

function normalizeMaxRuns(value) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_MAX_RUNS;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error('--max-runs must be a positive integer.');
  }

  return parsed;
}

async function collectJsonFiles(rootDir) {
  if (!rootDir || !existsSync(rootDir)) {
    return [];
  }

  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function readJsonFile(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}: ${error instanceof Error ? error.message : error}`);
  }
}

function isPerformanceBudgetReport(value) {
  return isObject(value) && value.schemaVersion === 1 && Array.isArray(value.metricRows);
}

function reportIdentity(report, index) {
  return (
    report.workflow?.runId ??
    report.workflow?.runUrl ??
    `${report.generatedAt ?? 'unknown'}:${report.workflow?.sha ?? 'unknown'}:${index}`
  );
}

function compareReportsByGeneratedAt(left, right) {
  const leftTime = Date.parse(left.generatedAt ?? '');
  const rightTime = Date.parse(right.generatedAt ?? '');

  if (Number.isFinite(rightTime) && Number.isFinite(leftTime) && rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return String(right.workflow?.runId ?? '').localeCompare(String(left.workflow?.runId ?? ''));
}

function toOptionalFiniteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 1000) / 1000;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function summarizeRun(report) {
  return {
    generatedAt: report.generatedAt ?? null,
    status: report.status ?? null,
    workflow: {
      name: report.workflow?.name ?? null,
      runId: report.workflow?.runId ?? null,
      runNumber: report.workflow?.runNumber ?? null,
      runAttempt: report.workflow?.runAttempt ?? null,
      runUrl: report.workflow?.runUrl ?? null,
      eventName: report.workflow?.eventName ?? null,
      ref: report.workflow?.ref ?? null,
      sha: report.workflow?.sha ?? null,
      actor: report.workflow?.actor ?? null,
    },
    summary: {
      metricCount: report.summary?.metricCount ?? report.metricRows.length,
      budgetedMetricCount: report.summary?.budgetedMetricCount ?? null,
      hardBudgetFailureCount: report.summary?.hardBudgetFailureCount ?? report.hardBudgetFailures?.length ?? 0,
      baselineDeltaWarningCount:
        report.summary?.baselineDeltaWarningCount ?? report.baselineDeltaWarnings?.length ?? 0,
    },
  };
}

function findPreviousMetricPoint(reports, metricId) {
  for (const report of reports) {
    const row = report.metricRows.find((metric) => metric.id === metricId);

    if (row && Number.isFinite(row.actualMs)) {
      return {
        generatedAt: report.generatedAt ?? null,
        runId: report.workflow?.runId ?? null,
        runUrl: report.workflow?.runUrl ?? null,
        actualMs: toOptionalFiniteNumber(row.actualMs),
      };
    }
  }

  return null;
}

function buildMetricTrendRows(currentReport, historicalReports) {
  return currentReport.metricRows.map((currentRow) => {
    const previousPoint = findPreviousMetricPoint(historicalReports, currentRow.id);
    const latestActualMs = toOptionalFiniteNumber(currentRow.actualMs);
    const previousActualMs = previousPoint?.actualMs ?? null;
    const deltaFromPreviousMs =
      latestActualMs === null || previousActualMs === null
        ? null
        : toOptionalFiniteNumber(latestActualMs - previousActualMs);
    const deltaFromPreviousPercent =
      deltaFromPreviousMs === null || previousActualMs === 0
        ? null
        : Number(((deltaFromPreviousMs / previousActualMs) * 100).toFixed(2));
    const recentPoints = [currentReport, ...historicalReports]
      .map((report) => {
        const row = report.metricRows.find((metric) => metric.id === currentRow.id);

        if (!row || !Number.isFinite(row.actualMs)) {
          return null;
        }

        return {
          generatedAt: report.generatedAt ?? null,
          runId: report.workflow?.runId ?? null,
          runUrl: report.workflow?.runUrl ?? null,
          status: report.status ?? null,
          actualMs: toOptionalFiniteNumber(row.actualMs),
          budgetMs: toOptionalFiniteNumber(row.budgetMs),
          unit: row.unit ?? 'ms',
          hardBudgetStatus: row.hardBudgetStatus ?? null,
          baselineWarning: Boolean(row.baselineWarning),
        };
      })
      .filter(Boolean);

    return {
      id: currentRow.id,
      harness: currentRow.harness,
      viewport: currentRow.viewport,
      area: currentRow.area,
      metric: currentRow.metric,
      metricKey: currentRow.metricKey,
      unit: currentRow.unit ?? 'ms',
      latestActualMs,
      budgetMs: toOptionalFiniteNumber(currentRow.budgetMs),
      previousActualMs,
      deltaFromPreviousMs,
      deltaFromPreviousPercent,
      latestHardBudgetStatus: currentRow.hardBudgetStatus ?? null,
      latestBaselineWarning: Boolean(currentRow.baselineWarning),
      recentPoints,
    };
  });
}

async function readHistoricalReports(historyDir) {
  const jsonFiles = await collectJsonFiles(historyDir);
  const reports = [];

  for (const filePath of jsonFiles) {
    const parsed = await readJsonFile(filePath, 'history report');

    if (isPerformanceBudgetReport(parsed)) {
      reports.push(parsed);
    }
  }

  return reports;
}

export async function buildPerformanceBudgetHistory(options = {}) {
  if (!options.currentReportPath) {
    throw new Error('--current-report is required.');
  }

  const maxRuns = normalizeMaxRuns(options.maxRuns);
  const currentReportPath = path.resolve(options.currentReportPath);
  const currentReport = await readJsonFile(currentReportPath, 'current performance budget report');

  if (!isPerformanceBudgetReport(currentReport)) {
    throw new Error(`Invalid current performance budget report: ${currentReportPath}`);
  }

  const historyDir = options.historyDir ? path.resolve(options.historyDir) : null;
  const historicalReports = (await readHistoricalReports(historyDir))
    .filter((report) => reportIdentity(report, 0) !== reportIdentity(currentReport, 0))
    .sort(compareReportsByGeneratedAt)
    .slice(0, Math.max(0, maxRuns - 1));
  const reports = [currentReport, ...historicalReports];
  const dedupedReports = [];
  const seen = new Set();

  for (const [index, report] of reports.entries()) {
    const identity = reportIdentity(report, index);

    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    dedupedReports.push(report);
  }

  const recentReports = dedupedReports.slice(0, maxRuns);

  return {
    schemaVersion: PERFORMANCE_HISTORY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      currentReportPath,
      historyDir,
      maxRuns,
    },
    latest: {
      generatedAt: currentReport.generatedAt ?? null,
      status: currentReport.status ?? null,
      workflow: summarizeRun(currentReport).workflow,
      summary: summarizeRun(currentReport).summary,
      hardBudgetFailures: currentReport.hardBudgetFailures ?? [],
      baselineDeltaWarnings: currentReport.baselineDeltaWarnings ?? [],
    },
    recentRuns: recentReports.map(summarizeRun),
    metricTrendRows: buildMetricTrendRows(currentReport, recentReports.slice(1)),
  };
}

export function formatPerformanceBudgetHistorySummary(history) {
  const lines = [
    '# Performance Budget History',
    '',
    `Latest status: ${history.latest.status}`,
    `Recent runs: ${history.recentRuns.length}`,
  ];

  if (history.latest.workflow.runUrl) {
    lines.push(`Latest run: ${history.latest.workflow.runUrl}`);
  }

  lines.push('', '## Latest Hard Budget Failures');
  if (history.latest.hardBudgetFailures.length) {
    for (const failure of history.latest.hardBudgetFailures) {
      lines.push(`- ${failure.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push('', '## Latest Baseline Delta Warnings');
  if (history.latest.baselineDeltaWarnings.length) {
    for (const warning of history.latest.baselineDeltaWarnings) {
      lines.push(`- ${warning.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push(
    '',
    '## Recent Runs',
    '| Generated | Status | Run | SHA | Failures | Warnings |',
    '| --- | --- | --- | --- | ---: | ---: |',
  );

  for (const run of history.recentRuns) {
    lines.push(
      `| ${run.generatedAt ?? 'n/a'} | ${run.status ?? 'n/a'} | ${run.workflow.runUrl ?? run.workflow.runId ?? 'local'} | ${
        run.workflow.sha ?? 'n/a'
      } | ${run.summary.hardBudgetFailureCount} | ${run.summary.baselineDeltaWarningCount} |`,
    );
  }

  lines.push(
    '',
    '## Metric Trends',
    '| Metric | Current | Previous | Delta | Budget | Latest status |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  );

  for (const row of history.metricTrendRows) {
    const delta =
      row.deltaFromPreviousMs === null
        ? 'n/a'
        : `${formatDeltaValue(row.deltaFromPreviousMs, row.unit)} (${formatPercent(row.deltaFromPreviousPercent)})`;
    lines.push(
      `| ${row.harness} ${row.viewport} ${row.area} ${row.metric} | ${formatMetricValue(
        row.latestActualMs,
        row.unit,
      )} | ${formatMetricValue(row.previousActualMs, row.unit)} | ${delta} | ${formatMetricValue(
        row.budgetMs,
        row.unit,
      )} | ${row.latestHardBudgetStatus} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [name, inlineValue] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, null];
    const readValue = () => {
      if (inlineValue !== null) {
        return inlineValue;
      }

      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${name}.`);
      }

      return argv[index];
    };

    switch (name) {
      case '--current-report':
        options.currentReportPath = readValue();
        break;
      case '--history-dir':
        options.historyDir = readValue();
        break;
      case '--output':
        options.outputPath = readValue();
        break;
      case '--summary':
        options.summaryPath = readValue();
        break;
      case '--max-runs':
        options.maxRuns = readValue();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const outputPath = path.resolve(options.outputPath ?? path.join('perf-artifacts', 'performance-budget-history.json'));
  const history = await buildPerformanceBudgetHistory(options);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(history, null, 2)}\n`);

  const markdown = formatPerformanceBudgetHistorySummary(history);
  if (options.summaryPath) {
    const summaryPath = path.resolve(options.summaryPath);
    await mkdir(path.dirname(summaryPath), { recursive: true });
    await writeFile(summaryPath, markdown);
  } else {
    process.stdout.write(markdown);
  }

  return history;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

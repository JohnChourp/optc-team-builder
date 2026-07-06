#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PERFORMANCE_REPORT_SCHEMA_VERSION = 1;

export const BASELINE_WARNING_POLICY = Object.freeze({
  minPercentIncrease: 35,
  minMsIncrease: 100,
  minBytesIncrease: 10_000,
});

const ABILITY_METRICS = Object.freeze([
  {
    area: 'Saved Teams',
    sourcePath: ['timings', 'savedTeams'],
    metricKey: 'pageReadyMs',
    metricLabel: 'page ready',
    budgets: {},
  },
  {
    area: 'Saved Teams',
    sourcePath: ['timings', 'savedTeams'],
    metricKey: 'firstToggleMs',
    metricLabel: 'first ability toggle',
    budgets: { desktop: 800, mobile: 1000 },
  },
  {
    area: 'Saved Enemies',
    sourcePath: ['timings', 'savedEnemies'],
    metricKey: 'pageReadyMs',
    metricLabel: 'page ready',
    budgets: {},
  },
  {
    area: 'Saved Enemies',
    sourcePath: ['timings', 'savedEnemies'],
    metricKey: 'firstToggleMs',
    metricLabel: 'first ability toggle',
    budgets: { desktop: 500, mobile: 500 },
  },
  {
    area: 'Manual Picker',
    sourcePath: ['timings', 'manualPicker'],
    metricKey: 'pageReadyMs',
    metricLabel: 'page ready',
    budgets: {},
  },
  {
    area: 'Manual Picker',
    sourcePath: ['timings', 'manualPicker'],
    metricKey: 'pickerOpenMs',
    metricLabel: 'picker open',
    budgets: { desktop: 800, mobile: 800 },
  },
  {
    area: 'Manual Picker',
    sourcePath: ['timings', 'manualPicker'],
    metricKey: 'specialFilterMs',
    metricLabel: 'special filter apply',
    budgets: { desktop: 2500, mobile: 2500 },
  },
]);

const EXPLANATION_METRICS = Object.freeze([
  {
    area: 'Compare',
    sourcePath: ['timings', 'compare'],
    metricKey: 'compareOpenMs',
    metricLabel: 'compare panel open',
    budgets: { desktop: 800, mobile: 1000 },
  },
  {
    area: 'Compare',
    sourcePath: ['timings', 'compare'],
    metricKey: 'compareImportMs',
    metricLabel: 'imported compare apply',
    budgets: { desktop: 1200, mobile: 1500 },
  },
  {
    area: 'Import/share hydration',
    sourcePath: ['timings', 'importShareHydration'],
    metricKey: 'savedTeamsParseSanitizeMs',
    metricLabel: 'saved-team parse/sanitize',
    budgets: { desktop: 500, mobile: 500 },
  },
  {
    area: 'Import/share hydration',
    sourcePath: ['timings', 'importShareHydration'],
    metricKey: 'savedTeamsImportReadyMs',
    metricLabel: 'saved-team import ready',
    budgets: { desktop: 3000, mobile: 4000 },
  },
  {
    area: 'Import/share hydration',
    sourcePath: ['timings', 'importShareHydration'],
    metricKey: 'manualShareHydrationMs',
    metricLabel: 'manual share-link hydration',
    budgets: { desktop: 1800, mobile: 2500 },
  },
  {
    area: 'Explanations',
    sourcePath: ['timings', 'explanations'],
    metricKey: 'firstExplanationToggleMs',
    metricLabel: 'first explanation toggle',
    budgets: { desktop: 300, mobile: 450 },
  },
  {
    area: 'Explanations',
    sourcePath: ['timings', 'explanations'],
    metricKey: 'allExplanationToggleMs',
    metricLabel: 'all explanation toggles',
    budgets: { desktop: 900, mobile: 1200 },
  },
]);

const SAVED_TEAM_CODEC_METRICS = Object.freeze([
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'bulkExportEncodeMs',
    metricLabel: 'bulk export encode',
    budgets: { node: 10 },
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'bulkJsonParseMs',
    metricLabel: 'bulk JSON parse',
    budgets: { node: 10 },
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'bulkSanitizeMs',
    metricLabel: 'bulk sanitize',
    budgets: { node: 10 },
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'bulkParseSanitizeMs',
    metricLabel: 'bulk parse and sanitize',
    budgets: { node: 15 },
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'shareEncodeMs',
    metricLabel: 'share encode',
    budgets: { node: 5 },
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'shareDecodeMs',
    metricLabel: 'share decode',
    budgets: { node: 3 },
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'shareResolveSanitizeMs',
    metricLabel: 'share resolve and sanitize',
    budgets: { node: 4 },
  },
  {
    area: 'Saved-team codecs',
    sourcePath: ['timings', 'savedTeamCodecs'],
    metricKey: 'invalidValidationMs',
    metricLabel: 'invalid input validation',
    budgets: { node: 1 },
  },
]);

const ROUTE_LOAD_METRICS = Object.freeze([
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'guideShareCompareReadyMs',
    metricLabel: 'guide route ready',
    budgets: { desktop: 1500, mobile: 2200 },
  },
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'manualShareLandingReadyMs',
    metricLabel: 'manual share landing ready',
    budgets: { desktop: 2500, mobile: 3500 },
  },
  {
    area: 'Route load',
    sourcePath: ['timings', 'routes'],
    metricKey: 'compareEntryReadyMs',
    metricLabel: 'compare entry ready',
    budgets: { desktop: 3000, mobile: 4500 },
  },
  {
    scope: 'result',
    viewport: 'bundle',
    area: 'Bundle',
    sourcePath: ['bundle', 'initial'],
    metricKey: 'rawBytes',
    metricLabel: 'initial raw JS',
    unit: 'bytes',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 1_500_000 },
  },
  {
    scope: 'result',
    viewport: 'bundle',
    area: 'Bundle',
    sourcePath: ['bundle', 'initial'],
    metricKey: 'gzipBytes',
    metricLabel: 'initial gzip JS',
    unit: 'bytes',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 370_000 },
  },
  {
    scope: 'result',
    viewport: 'bundle',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'guide'],
    metricKey: 'rawBytes',
    metricLabel: 'guide route raw JS',
    unit: 'bytes',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 14_000 },
  },
  {
    scope: 'result',
    viewport: 'bundle',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'manualShare'],
    metricKey: 'rawBytes',
    metricLabel: 'manual share route raw JS',
    unit: 'bytes',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 320_000 },
  },
  {
    scope: 'result',
    viewport: 'bundle',
    area: 'Bundle',
    sourcePath: ['bundle', 'routes', 'compare'],
    metricKey: 'rawBytes',
    metricLabel: 'compare route raw JS',
    unit: 'bytes',
    minDeltaWarning: BASELINE_WARNING_POLICY.minBytesIncrease,
    budgets: { bundle: 740_000 },
  },
]);

const HARNESS_DEFINITIONS = Object.freeze({
  ability: {
    harness: 'ability-filters',
    metrics: ABILITY_METRICS,
  },
  explanation: {
    harness: 'explanation-compare',
    metrics: EXPLANATION_METRICS,
  },
  savedTeamCodecs: {
    harness: 'saved-team-codecs',
    metrics: SAVED_TEAM_CODEC_METRICS,
  },
  routeLoad: {
    harness: 'route-load',
    metrics: ROUTE_LOAD_METRICS,
  },
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  return `${value.toFixed(1)}%`;
}

function formatMs(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  const rounded = Math.round(value);
  if (Math.abs(value) >= 10 || Math.abs(value - rounded) < 0.001) {
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
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${formatBytes(value)}`;
  }

  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${formatMs(Math.abs(value))}`;
}

function getNestedValue(value, keys) {
  return keys.reduce((current, key) => (isObject(current) ? current[key] : undefined), value);
}

function toOptionalFiniteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 1000) / 1000;

  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildMetricId(harness, viewport, area, metricKey) {
  return [harness, viewport, area, metricKey].map(normalizeSegment).join('.');
}

function buildWorkflowMetadata(env) {
  const repository = env.GITHUB_REPOSITORY ?? null;
  const runId = env.GITHUB_RUN_ID ?? null;
  const serverUrl = env.GITHUB_SERVER_URL ?? 'https://github.com';

  return {
    name: env.GITHUB_WORKFLOW ?? 'local',
    repository,
    runId,
    runNumber: env.GITHUB_RUN_NUMBER ?? null,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    runUrl: repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
    eventName: env.GITHUB_EVENT_NAME ?? null,
    ref: env.GITHUB_REF ?? null,
    sha: env.GITHUB_SHA ?? null,
    actor: env.GITHUB_ACTOR ?? null,
  };
}

function detectResultKind(result) {
  if (
    Array.isArray(result?.viewportRuns) &&
    isObject(result?.selectedAbilities) &&
    result.viewportRuns.some((run) => isObject(run?.timings?.savedTeams))
  ) {
    return 'ability';
  }

  if (
    Array.isArray(result?.viewportRuns) &&
    isObject(result?.fixture) &&
    result.viewportRuns.some((run) => isObject(run?.timings?.compare))
  ) {
    return 'explanation';
  }

  if (
    result?.harness === 'saved-team-codecs' ||
    (Array.isArray(result?.viewportRuns) &&
      result.viewportRuns.some((run) => isObject(run?.timings?.savedTeamCodecs)))
  ) {
    return 'savedTeamCodecs';
  }

  if (
    Array.isArray(result?.viewportRuns) &&
    isObject(result?.bundle) &&
    result.viewportRuns.some((run) => isObject(run?.timings?.routes))
  ) {
    return 'routeLoad';
  }

  return null;
}

async function collectJsonFiles(rootDir) {
  if (!existsSync(rootDir)) {
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

export async function readPerformanceResults(currentDir) {
  const jsonFiles = await collectJsonFiles(currentDir);
  const results = {};

  for (const filePath of jsonFiles) {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    const kind = detectResultKind(parsed);

    if (!kind || results[kind]) {
      continue;
    }

    results[kind] = {
      filePath,
      result: parsed,
    };
  }

  for (const kind of Object.keys(HARNESS_DEFINITIONS)) {
    if (!results[kind]) {
      throw new Error(`Missing ${HARNESS_DEFINITIONS[kind].harness} performance result under ${currentDir}.`);
    }
  }

  return results;
}

function buildMetricRowsForResult(kind, resultEntry, baselineRows) {
  const definition = HARNESS_DEFINITIONS[kind];
  const rows = [];
  const viewportMetrics = definition.metrics.filter((metric) => metric.scope !== 'result');
  const resultMetrics = definition.metrics.filter((metric) => metric.scope === 'result');

  for (const viewportRun of resultEntry.result.viewportRuns) {
    const viewport = viewportRun.viewport;

    if (typeof viewport !== 'string' || viewport.trim() === '') {
      throw new Error(`Invalid ${definition.harness} result: viewport label is required.`);
    }

    for (const metric of viewportMetrics) {
      const source = getNestedValue(viewportRun, metric.sourcePath);
      const actualMs = toOptionalFiniteNumber(source?.[metric.metricKey]);
      const budgetMs = metric.budgets[viewport] ?? null;
      const id = buildMetricId(definition.harness, viewport, metric.area, metric.metricKey);
      const baselineRow = baselineRows.get(id);
      const baselineMs = toOptionalFiniteNumber(baselineRow?.actualMs);
      const deltaMs = actualMs === null || baselineMs === null ? null : toOptionalFiniteNumber(actualMs - baselineMs);
      const deltaPercent =
        baselineMs && baselineMs > 0 && deltaMs !== null ? (deltaMs / baselineMs) * 100 : null;
      const hardBudgetStatus =
        actualMs === null ? 'failed' : budgetMs === null ? 'not-budgeted' : actualMs <= budgetMs ? 'passed' : 'failed';
      const baselineWarning =
        actualMs !== null &&
        baselineMs !== null &&
        deltaMs !== null &&
        deltaMs >= (metric.minDeltaWarning ?? BASELINE_WARNING_POLICY.minMsIncrease) &&
        deltaPercent >= BASELINE_WARNING_POLICY.minPercentIncrease;

      rows.push({
        id,
        harness: definition.harness,
        viewport,
        area: metric.area,
        metric: metric.metricLabel,
        metricKey: metric.metricKey,
        unit: metric.unit ?? 'ms',
        actualMs,
        budgetMs,
        baselineMs,
        deltaMs,
        deltaPercent: deltaPercent === null ? null : Number(deltaPercent.toFixed(2)),
        hardBudgetStatus,
        baselineWarning,
      });
    }
  }

  for (const metric of resultMetrics) {
    const viewport = metric.viewport ?? 'bundle';
    const source = getNestedValue(resultEntry.result, metric.sourcePath);
    const actualMs = toOptionalFiniteNumber(source?.[metric.metricKey]);
    const budgetMs = metric.budgets[viewport] ?? null;
    const id = buildMetricId(definition.harness, viewport, metric.area, metric.metricLabel);
    const baselineRow = baselineRows.get(id);
    const baselineMs = toOptionalFiniteNumber(baselineRow?.actualMs);
    const deltaMs = actualMs === null || baselineMs === null ? null : toOptionalFiniteNumber(actualMs - baselineMs);
    const deltaPercent =
      baselineMs && baselineMs > 0 && deltaMs !== null ? (deltaMs / baselineMs) * 100 : null;
    const hardBudgetStatus =
      actualMs === null ? 'failed' : budgetMs === null ? 'not-budgeted' : actualMs <= budgetMs ? 'passed' : 'failed';
    const baselineWarning =
      actualMs !== null &&
      baselineMs !== null &&
      deltaMs !== null &&
      deltaMs >= (metric.minDeltaWarning ?? BASELINE_WARNING_POLICY.minMsIncrease) &&
      deltaPercent >= BASELINE_WARNING_POLICY.minPercentIncrease;

    rows.push({
      id,
      harness: definition.harness,
      viewport,
      area: metric.area,
      metric: metric.metricLabel,
      metricKey: metric.metricKey,
      unit: metric.unit ?? 'ms',
      actualMs,
      budgetMs,
      baselineMs,
      deltaMs,
      deltaPercent: deltaPercent === null ? null : Number(deltaPercent.toFixed(2)),
      hardBudgetStatus,
      baselineWarning,
    });
  }

  return rows;
}

function summarizeCurrentResults(results, rootDir) {
  return Object.fromEntries(
    Object.entries(results).map(([kind, entry]) => [
      kind,
      {
        harness: HARNESS_DEFINITIONS[kind].harness,
        path: path.relative(rootDir, entry.filePath),
        capturedAt: entry.result.capturedAt ?? null,
        appCommit: entry.result.appCommit ?? null,
        runLabel: entry.result.runLabel ?? null,
        baseURL: entry.result.baseURL ?? null,
      },
    ]),
  );
}

async function readBaselineReport(baselineReportPath) {
  if (!baselineReportPath || !existsSync(baselineReportPath)) {
    return null;
  }

  const parsed = JSON.parse(await readFile(baselineReportPath, 'utf8'));

  if (parsed?.schemaVersion !== PERFORMANCE_REPORT_SCHEMA_VERSION || !Array.isArray(parsed.metricRows)) {
    throw new Error(`Invalid baseline performance report: ${baselineReportPath}`);
  }

  return parsed;
}

export async function buildPerformanceBudgetReport(options = {}, env = process.env) {
  const currentDir = path.resolve(options.currentDir ?? path.join('perf-artifacts', 'current'));
  const baselineReport = await readBaselineReport(options.baselineReportPath);
  const baselineRows = new Map((baselineReport?.metricRows ?? []).map((row) => [row.id, row]));
  const results = await readPerformanceResults(currentDir);
  const metricRows = Object.entries(results).flatMap(([kind, entry]) =>
    buildMetricRowsForResult(kind, entry, baselineRows),
  );
  const hardBudgetFailures = metricRows
    .filter((row) => row.hardBudgetStatus === 'failed')
    .map((row) => ({
      metricId: row.id,
      message: `${row.harness} ${row.viewport} ${row.area} ${row.metric}: ${formatMetricValue(
        row.actualMs,
        row.unit,
      )} > ${formatMetricValue(row.budgetMs, row.unit)}`,
    }));
  const invalidMetricFailures = metricRows
    .filter((row) => row.actualMs === null)
    .map((row) => ({
      metricId: row.id,
      message: `${row.harness} ${row.viewport} ${row.area} ${row.metric}: missing or non-finite metric value`,
    }));
  const baselineDeltaWarnings = metricRows
    .filter((row) => row.baselineWarning)
    .map((row) => ({
      metricId: row.id,
      message: `${row.harness} ${row.viewport} ${row.area} ${row.metric}: ${formatMetricValue(
        row.actualMs,
        row.unit,
      )} vs baseline ${formatMetricValue(row.baselineMs, row.unit)} (${formatPercent(row.deltaPercent)} increase)`,
    }));
  const status = hardBudgetFailures.length ? 'failed' : baselineDeltaWarnings.length ? 'warning' : 'passed';

  return {
    schemaVersion: PERFORMANCE_REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    workflow: buildWorkflowMetadata(env),
    current: summarizeCurrentResults(results, currentDir),
    baseline: baselineReport
      ? {
          generatedAt: baselineReport.generatedAt ?? null,
          status: baselineReport.status ?? null,
          workflow: baselineReport.workflow ?? null,
        }
      : null,
    budgetPolicy: {
      hardBudgets: {
        abilityFilters: {
          savedTeamsFirstToggleMs: { desktop: 800, mobile: 1000 },
          savedEnemiesFirstToggleMs: { desktop: 500, mobile: 500 },
          manualPickerOpenMs: { desktop: 800, mobile: 800 },
          manualSpecialFilterMs: { desktop: 2500, mobile: 2500 },
        },
        explanationCompare: {
          compareOpenMs: { desktop: 800, mobile: 1000 },
          compareImportMs: { desktop: 1200, mobile: 1500 },
          savedTeamsParseSanitizeMs: { desktop: 500, mobile: 500 },
          savedTeamsImportReadyMs: { desktop: 3000, mobile: 4000 },
          manualShareHydrationMs: { desktop: 1800, mobile: 2500 },
          firstExplanationToggleMs: { desktop: 300, mobile: 450 },
          allExplanationToggleMs: { desktop: 900, mobile: 1200 },
        },
        savedTeamCodecs: {
          bulkExportEncodeMs: { node: 10 },
          bulkJsonParseMs: { node: 10 },
          bulkSanitizeMs: { node: 10 },
          bulkParseSanitizeMs: { node: 15 },
          shareEncodeMs: { node: 5 },
          shareDecodeMs: { node: 3 },
          shareResolveSanitizeMs: { node: 4 },
          invalidValidationMs: { node: 1 },
        },
        routeLoad: {
          guideShareCompareReadyMs: { desktop: 1500, mobile: 2200 },
          manualShareLandingReadyMs: { desktop: 2500, mobile: 3500 },
          compareEntryReadyMs: { desktop: 3000, mobile: 4500 },
          initialRawBytes: 1_500_000,
          initialGzipBytes: 370_000,
          guideRawBytes: 14_000,
          manualShareRawBytes: 320_000,
          compareRawBytes: 740_000,
        },
      },
      baselineWarning: BASELINE_WARNING_POLICY,
    },
    summary: {
      metricCount: metricRows.length,
      budgetedMetricCount: metricRows.filter((row) => row.budgetMs !== null).length,
      hardBudgetFailureCount: hardBudgetFailures.length,
      invalidMetricFailureCount: invalidMetricFailures.length,
      baselineDeltaWarningCount: baselineDeltaWarnings.length,
    },
    metricRows,
    hardBudgetFailures,
    invalidMetricFailures,
    baselineDeltaWarnings,
  };
}

export function formatPerformanceBudgetSummary(report) {
  const lines = [
    '# Performance Budgets',
    '',
    `Status: ${report.status}`,
    `Metrics: ${report.summary.metricCount} total, ${report.summary.budgetedMetricCount} budgeted`,
  ];

  if (report.workflow.runUrl) {
    lines.push(`Run: ${report.workflow.runUrl}`);
  }

  if (report.baseline?.workflow?.runUrl) {
    lines.push(`Baseline: ${report.baseline.workflow.runUrl}`);
  } else {
    lines.push('Baseline: none available; this run can establish the first baseline artifact.');
  }

  lines.push('', '## Hard Budget Failures');
  if (report.hardBudgetFailures.length) {
    for (const failure of report.hardBudgetFailures) {
      lines.push(`- ${failure.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push('', '## Invalid Metrics');
  if (report.invalidMetricFailures.length) {
    for (const failure of report.invalidMetricFailures) {
      lines.push(`- ${failure.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push('', '## Baseline Delta Warnings');
  if (report.baselineDeltaWarnings.length) {
    for (const warning of report.baselineDeltaWarnings) {
      lines.push(`- ${warning.message}`);
    }
  } else {
    lines.push('- None');
  }

  lines.push(
    '',
    '## Metrics',
    '| Harness | Viewport | Area | Metric | Current | Budget | Baseline | Delta |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: |',
  );

  for (const row of report.metricRows) {
    const delta =
      row.deltaMs === null
        ? 'n/a'
        : `${formatDeltaValue(row.deltaMs, row.unit)} (${formatPercent(row.deltaPercent)})`;
    lines.push(
      `| ${row.harness} | ${row.viewport} | ${row.area} | ${row.metric} | ${formatMetricValue(
        row.actualMs,
        row.unit,
      )} | ${formatMetricValue(row.budgetMs, row.unit)} | ${formatMetricValue(row.baselineMs, row.unit)} | ${delta} |`,
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
      case '--current-dir':
        options.currentDir = readValue();
        break;
      case '--baseline-report':
        options.baselineReportPath = readValue();
        break;
      case '--output':
        options.outputPath = readValue();
        break;
      case '--summary':
        options.summaryPath = readValue();
        break;
      case '--report-only':
        options.reportOnly = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const outputPath = path.resolve(options.outputPath ?? path.join('perf-artifacts', 'performance-budget-report.json'));
  const summaryPath = options.summaryPath ?? env.GITHUB_STEP_SUMMARY ?? null;
  const report = await buildPerformanceBudgetReport(options, env);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  const markdown = formatPerformanceBudgetSummary(report);
  if (summaryPath) {
    await mkdir(path.dirname(path.resolve(summaryPath)), { recursive: true });
    await writeFile(summaryPath, markdown);
  } else {
    process.stdout.write(markdown);
  }

  if (report.invalidMetricFailures.length || (report.hardBudgetFailures.length && !options.reportOnly)) {
    process.exitCode = 1;
  }

  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

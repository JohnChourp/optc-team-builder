#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const UPSTREAM_MONITOR_SCHEMA_VERSION = 1;

export const UPSTREAM_MONITOR_POLICY = Object.freeze({
  staleUpstream: {
    minStableDays: 21,
    minScheduledSamples: 3,
  },
  shapeDrift: {
    minScheduledSamples: 3,
    minAbsoluteDelta: 25,
    minPercentDelta: 10,
    historyWindow: 8,
  },
  persistentLag: {
    minScheduledSamples: 3,
  },
  maxNewCharacterSample: 20,
  recentHistoryLimit: 8,
});

const releaseDetectorFailureReasons = new Set([
  'upstream-timeout',
  'upstream-unavailable',
  'upstream-partial-data',
  'upstream-malformed-data',
]);

const reportFileName = 'upstream-monitor-report.json';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toInteger(value) {
  const numberValue = toFiniteNumber(value);
  return Number.isInteger(numberValue) ? numberValue : null;
}

function sortIds(ids = []) {
  return [...ids]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right);
}

function sameIdList(left = [], right = []) {
  const normalizedLeft = sortIds(left);
  const normalizedRight = sortIds(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((id, index) => id === normalizedRight[index]);
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : 'n/a';
}

function formatDays(value) {
  return Number.isFinite(value) ? `${Math.floor(value)} day${Math.floor(value) === 1 ? '' : 's'}` : 'unknown duration';
}

function formatList(values = []) {
  return values.length > 0 ? values.join(', ') : 'none';
}

function parseDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function daySpan(start, end) {
  const startTime = parseDate(start);
  const endTime = parseDate(end);

  if (startTime === null || endTime === null || endTime < startTime) {
    return null;
  }

  return (endTime - startTime) / 86_400_000;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);

  if (sorted.length === 0) {
    return null;
  }

  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function buildWorkflowMetadata(env = process.env) {
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

export function normalizeReleaseCheckResult(releaseCheckResult) {
  if (!isObject(releaseCheckResult)) {
    return null;
  }

  const localCharacterCount = toInteger(releaseCheckResult.localCharacterCount);
  const remoteCharacterCount = toInteger(releaseCheckResult.remoteCharacterCount);
  const newCharacterIds = sortIds(releaseCheckResult.newCharacterIds);
  const newCharacterCount = toInteger(releaseCheckResult.newCharacterCount) ?? newCharacterIds.length;

  if (localCharacterCount === null || remoteCharacterCount === null) {
    return null;
  }

  return {
    releaseNeeded: releaseCheckResult.releaseNeeded === true,
    reason: String(releaseCheckResult.reason ?? 'unknown'),
    source: String(releaseCheckResult.source ?? 'unknown'),
    sourceRepository: String(releaseCheckResult.sourceRepository ?? 'unknown'),
    localSourceVersion: String(releaseCheckResult.localSourceVersion ?? 'unknown'),
    remoteSourceVersion: String(releaseCheckResult.remoteSourceVersion ?? 'unknown'),
    localCharacterCount,
    remoteCharacterCount,
    newCharacterIds,
    newCharacterCount,
    upstreamFetch: isObject(releaseCheckResult.upstreamFetch) ? releaseCheckResult.upstreamFetch : null,
  };
}

function buildCurrentSignals(releaseCheckResult, policy) {
  if (!releaseCheckResult) {
    return null;
  }

  return {
    source: releaseCheckResult.source,
    sourceRepository: releaseCheckResult.sourceRepository,
    localSourceVersion: releaseCheckResult.localSourceVersion,
    remoteSourceVersion: releaseCheckResult.remoteSourceVersion,
    localCharacterCount: releaseCheckResult.localCharacterCount,
    remoteCharacterCount: releaseCheckResult.remoteCharacterCount,
    releaseNeeded: releaseCheckResult.releaseNeeded,
    detectorReason: releaseCheckResult.reason,
    newCharacterCount: releaseCheckResult.newCharacterCount,
    newCharacterIds: releaseCheckResult.newCharacterIds,
    newCharacterIdSample: releaseCheckResult.newCharacterIds.slice(0, policy.maxNewCharacterSample),
    upstreamFetch: releaseCheckResult.upstreamFetch,
  };
}

function normalizeHistoryReport(report) {
  if (!isObject(report) || report.schemaVersion !== UPSTREAM_MONITOR_SCHEMA_VERSION) {
    return null;
  }

  const normalizedReport = {
    generatedAt: String(report.generatedAt ?? ''),
    status: String(report.status ?? 'unknown'),
    workflow: isObject(report.workflow) ? report.workflow : {},
    current: null,
  };

  if (!isObject(report.current)) {
    return normalizedReport;
  }

  const remoteCharacterCount = toInteger(report.current.remoteCharacterCount);
  const localCharacterCount = toInteger(report.current.localCharacterCount);

  if (remoteCharacterCount === null || localCharacterCount === null) {
    return normalizedReport;
  }

  normalizedReport.current = {
    remoteSourceVersion: String(report.current.remoteSourceVersion ?? 'unknown'),
    localSourceVersion: String(report.current.localSourceVersion ?? 'unknown'),
    remoteCharacterCount,
    localCharacterCount,
    newCharacterCount: toInteger(report.current.newCharacterCount) ?? sortIds(report.current.newCharacterIds).length,
    newCharacterIds: sortIds(report.current.newCharacterIds),
    detectorReason: String(report.current.detectorReason ?? 'unknown'),
  };

  return normalizedReport;
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
    } else if (entry.isFile() && entry.name === reportFileName) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export async function readUpstreamMonitorHistory(historyDir) {
  const files = await collectJsonFiles(historyDir);
  const reports = [];

  for (const filePath of files) {
    try {
      const report = normalizeHistoryReport(JSON.parse(await readFile(filePath, 'utf8')));

      if (report && parseDate(report.generatedAt) !== null) {
        reports.push(report);
      }
    } catch {
      // Ignore unrelated or partial artifacts in downloaded history directories.
    }
  }

  return reports.sort((left, right) => parseDate(left.generatedAt) - parseDate(right.generatedAt));
}

function scheduledReports(historyReports) {
  return historyReports
    .filter((report) => report.workflow?.eventName === 'schedule')
    .sort((left, right) => parseDate(left.generatedAt) - parseDate(right.generatedAt));
}

function isScheduledWorkflow(workflow) {
  return workflow?.eventName === 'schedule';
}

function trailingMatchingScheduledReports(historyReports, predicate) {
  const reports = scheduledReports(historyReports);
  const matching = [];

  for (let index = reports.length - 1; index >= 0; index -= 1) {
    const report = reports[index];

    if (!predicate(report)) {
      break;
    }

    matching.unshift(report);
  }

  return matching;
}

function buildStaleUpstreamWarning({ current, historyReports, generatedAt, policy, workflow }) {
  if (!isScheduledWorkflow(workflow)) {
    return null;
  }

  const matching = trailingMatchingScheduledReports(
    historyReports,
    (report) =>
      report.current &&
      report.current.remoteSourceVersion === current.remoteSourceVersion &&
      report.current.remoteCharacterCount === current.remoteCharacterCount,
  );
  const sampleCount = matching.length + 1;

  if (sampleCount < policy.staleUpstream.minScheduledSamples) {
    return null;
  }

  const oldestMatching = matching[0];
  const stableDays = daySpan(oldestMatching?.generatedAt, generatedAt);

  if (stableDays === null || stableDays < policy.staleUpstream.minStableDays) {
    return null;
  }

  return {
    id: 'stale-upstream',
    severity: 'warning',
    message: `Upstream version ${current.remoteSourceVersion} and ${current.remoteCharacterCount} normalized characters have stayed unchanged for ${formatDays(stableDays)} across ${sampleCount} contiguous scheduled samples.`,
    details: {
      stableDays: Number(stableDays.toFixed(2)),
      sampleCount,
      oldestMatchingGeneratedAt: oldestMatching.generatedAt,
      remoteSourceVersion: current.remoteSourceVersion,
      remoteCharacterCount: current.remoteCharacterCount,
    },
  };
}

function buildShapeDriftWarning({ current, historyReports, policy }) {
  if (current.newCharacterCount > 0) {
    return null;
  }

  const recentCounts = scheduledReports(historyReports)
    .slice(-policy.shapeDrift.historyWindow)
    .map((report) => report.current?.remoteCharacterCount)
    .filter((count) => Number.isFinite(count));

  if (recentCounts.length < policy.shapeDrift.minScheduledSamples) {
    return null;
  }

  const baseline = median(recentCounts);
  const delta = current.remoteCharacterCount - baseline;
  const absoluteDelta = Math.abs(delta);
  const percentDelta = baseline > 0 ? (absoluteDelta / baseline) * 100 : 0;

  if (absoluteDelta < policy.shapeDrift.minAbsoluteDelta || percentDelta < policy.shapeDrift.minPercentDelta) {
    return null;
  }

  return {
    id: 'normalized-shape-drift',
    severity: 'warning',
    message: `Remote normalized character count is ${current.remoteCharacterCount}, ${delta >= 0 ? '+' : ''}${delta} versus recent scheduled median ${baseline}; no new upstream IDs explain the change.`,
    details: {
      baselineRemoteCharacterCount: baseline,
      currentRemoteCharacterCount: current.remoteCharacterCount,
      delta,
      percentDelta: Number(percentDelta.toFixed(2)),
      sampleCount: recentCounts.length,
    },
  };
}

function buildPersistentLagWarning({ current, historyReports, policy, workflow }) {
  if (!isScheduledWorkflow(workflow)) {
    return null;
  }

  if (current.newCharacterCount <= 0 || current.newCharacterIds.length === 0) {
    return null;
  }

  const matching = trailingMatchingScheduledReports(
    historyReports,
    (report) => report.current && sameIdList(report.current.newCharacterIds, current.newCharacterIds),
  );
  const sampleCount = matching.length + 1;

  if (sampleCount < policy.persistentLag.minScheduledSamples) {
    return null;
  }

  return {
    id: 'persistent-local-lag',
    severity: 'warning',
    message: `${current.newCharacterCount} new upstream character ID(s) have persisted across ${sampleCount} contiguous scheduled samples: ${formatList(
      current.newCharacterIds.slice(0, policy.maxNewCharacterSample),
    )}.`,
    details: {
      sampleCount,
      firstMatchingGeneratedAt: matching[0]?.generatedAt ?? null,
      newCharacterCount: current.newCharacterCount,
      newCharacterIds: current.newCharacterIds,
    },
  };
}

function buildHistorySummary(historyReports, policy) {
  const scheduled = scheduledReports(historyReports);
  const recentReports = historyReports.slice(-policy.recentHistoryLimit).map((report) => ({
    generatedAt: report.generatedAt,
    status: report.status,
    eventName: report.workflow?.eventName ?? null,
    runUrl: report.workflow?.runUrl ?? null,
    remoteSourceVersion: report.current?.remoteSourceVersion ?? null,
    remoteCharacterCount: report.current?.remoteCharacterCount ?? null,
    newCharacterCount: report.current?.newCharacterCount ?? null,
    detectorReason: report.current?.detectorReason ?? null,
  }));

  return {
    reportCount: historyReports.length,
    scheduledReportCount: scheduled.length,
    recentReports,
  };
}

export function buildUpstreamMonitorReport({
  releaseCheckResult = null,
  historyReports = [],
  generatedAt = new Date().toISOString(),
  env = process.env,
  policy = UPSTREAM_MONITOR_POLICY,
} = {}) {
  const normalizedReleaseCheck = normalizeReleaseCheckResult(releaseCheckResult);
  const current = buildCurrentSignals(normalizedReleaseCheck, policy);
  const workflow = buildWorkflowMetadata(env);
  const warnings = [];

  if (!current) {
    warnings.push({
      id: 'release-check-missing',
      severity: 'error',
      message: 'Release detector output was missing or did not contain usable upstream/local count signals.',
      details: {},
    });
  } else if (current.upstreamFetch?.status === 'failed' || releaseDetectorFailureReasons.has(current.detectorReason)) {
    warnings.push({
      id: 'release-check-failed',
      severity: 'error',
      message: 'Release detector failed before producing a usable upstream comparison.',
      details: {
        detectorReason: current.detectorReason,
        upstreamFetchReason: current.upstreamFetch?.reason ?? null,
      },
    });
  } else {
    for (const warning of [
      buildStaleUpstreamWarning({ current, historyReports, generatedAt, policy, workflow }),
      buildShapeDriftWarning({ current, historyReports, policy }),
      buildPersistentLagWarning({ current, historyReports, policy, workflow }),
    ]) {
      if (warning) {
        warnings.push(warning);
      }
    }
  }

  const status = warnings.some((warning) => warning.severity === 'error')
    ? 'failed'
    : warnings.length > 0
      ? 'warning'
      : 'passed';

  return {
    schemaVersion: UPSTREAM_MONITOR_SCHEMA_VERSION,
    generatedAt,
    status,
    workflow,
    policy,
    current,
    history: buildHistorySummary(historyReports, policy),
    warnings,
  };
}

export function formatUpstreamMonitorSummary(report) {
  const lines = [
    '# OPTC DB upstream freshness and drift monitor',
    '',
    `Status: ${report.status}`,
    `Generated: ${report.generatedAt}`,
  ];

  if (report.workflow?.runUrl) {
    lines.push(`Run: ${report.workflow.runUrl}`);
  }

  lines.push('');

  if (report.current) {
    lines.push(
      '## Current Signals',
      '',
      `- Source: ${report.current.sourceRepository}`,
      `- Source version: local ${report.current.localSourceVersion}, remote ${report.current.remoteSourceVersion}`,
      `- Characters: local ${report.current.localCharacterCount}, remote ${report.current.remoteCharacterCount}`,
      `- Detector reason: ${report.current.detectorReason}`,
      `- New upstream character IDs: ${formatList(report.current.newCharacterIdSample)}${
        report.current.newCharacterCount > report.current.newCharacterIdSample.length
          ? ` (+${report.current.newCharacterCount - report.current.newCharacterIdSample.length} more)`
          : ''
      }`,
    );
  } else {
    lines.push('## Current Signals', '', '- Release detector output was unavailable.');
  }

  lines.push(
    '',
    '## History',
    '',
    `- Monitor reports loaded: ${report.history.reportCount}`,
    `- Scheduled reports loaded: ${report.history.scheduledReportCount}`,
  );

  if (report.history.recentReports.length > 0) {
    lines.push('', '| Generated | Event | Remote version | Remote count | New IDs | Status |', '| --- | --- | --- | ---: | ---: | --- |');
    for (const historyReport of report.history.recentReports) {
      lines.push(
        `| ${historyReport.generatedAt} | ${historyReport.eventName ?? 'unknown'} | ${historyReport.remoteSourceVersion} | ${historyReport.remoteCharacterCount} | ${historyReport.newCharacterCount} | ${historyReport.status} |`,
      );
    }
  }

  lines.push('', '## Warnings', '');

  if (report.warnings.length === 0) {
    lines.push('- None');
  } else {
    for (const warning of report.warnings) {
      lines.push(`- ${warning.severity}: ${warning.id} - ${warning.message}`);
    }
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
      case '--release-check':
        options.releaseCheckPath = readValue();
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
      case '--generated-at':
        options.generatedAt = readValue();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function readReleaseCheckResult(releaseCheckPath) {
  if (!releaseCheckPath || !existsSync(releaseCheckPath)) {
    return null;
  }

  try {
    return JSON.parse(await readFile(releaseCheckPath, 'utf8'));
  } catch {
    return null;
  }
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const outputPath = path.resolve(options.outputPath ?? reportFileName);
  const summaryPath = options.summaryPath ?? env.GITHUB_STEP_SUMMARY ?? null;
  const releaseCheckResult = await readReleaseCheckResult(options.releaseCheckPath ?? 'release-check.json');
  const historyReports = await readUpstreamMonitorHistory(options.historyDir);
  const report = buildUpstreamMonitorReport({
    releaseCheckResult,
    historyReports,
    generatedAt: options.generatedAt,
    env,
  });
  const summary = formatUpstreamMonitorSummary(report);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  if (summaryPath) {
    await mkdir(path.dirname(path.resolve(summaryPath)), { recursive: true });
    await writeFile(summaryPath, summary);
  } else {
    process.stdout.write(summary);
  }

  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

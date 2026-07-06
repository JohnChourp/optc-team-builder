#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_DECISION_HISTORY_SCHEMA_VERSION = 1;
export const DEFAULT_MAX_RUNS = 45;
const DEFAULT_ARTIFACT_RETENTION_DAYS = 90;
const DEFAULT_NEW_ID_SAMPLE_LIMIT = 20;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function optionalBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  return null;
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

function isReleaseDetectorStatusReport(value) {
  return isObject(value) && value.schemaVersion === 1 && isObject(value.verdict) && isObject(value.workflow);
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

function normalizeIds(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right);
}

function pickNewCharacterSample(dataset = {}) {
  const sample = normalizeIds(dataset.newCharacterIdSample);
  const count = optionalNumber(dataset.newCharacterCount);

  return {
    newCharacterCount: count ?? (sample.length > 0 ? sample.length : null),
    newCharacterIdSample: sample.slice(0, DEFAULT_NEW_ID_SAMPLE_LIMIT),
    newCharacterIdsTruncated: Boolean(dataset.newCharacterIdsTruncated) || sample.length > DEFAULT_NEW_ID_SAMPLE_LIMIT,
  };
}

function summarizeSkipOrDispatchReason(report = {}) {
  const verdict = isObject(report.verdict) ? report.verdict : {};

  if (verdict.releaseDispatched === true) {
    return 'release-dispatched';
  }

  return optionalString(verdict.dispatchBlockReason ?? report.reason);
}

function normalizeRun(report) {
  const verdict = isObject(report.verdict) ? report.verdict : {};
  const dataset = isObject(report.dataset) ? report.dataset : {};
  const sourceContract = isObject(report.sourceContract) ? report.sourceContract : {};
  const upstreamFetch = isObject(report.upstreamFetch) ? report.upstreamFetch : {};
  const idempotency = isObject(report.idempotency) ? report.idempotency : {};
  const monitor = isObject(report.monitor) ? report.monitor : {};
  const workflow = isObject(report.workflow) ? report.workflow : {};
  const newCharacter = pickNewCharacterSample(dataset);

  return {
    generatedAt: optionalString(report.generatedAt),
    status: optionalString(report.status),
    reason: optionalString(report.reason),
    decision: {
      releaseNeeded: optionalBoolean(verdict.releaseNeeded) ?? false,
      releaseDispatched: optionalBoolean(verdict.releaseDispatched) ?? false,
      dispatchMode: optionalString(verdict.dispatchMode),
      dispatchBlocked: optionalBoolean(verdict.dispatchBlocked) ?? false,
      dispatchBlockReason: optionalString(verdict.dispatchBlockReason),
      skipOrDispatchReason: summarizeSkipOrDispatchReason(report),
    },
    dataset: {
      source: optionalString(dataset.source),
      sourceRepository: optionalString(dataset.sourceRepository),
      localDatasetVersion: optionalString(dataset.localDatasetVersion),
      upstreamDatasetVersion: optionalString(dataset.upstreamDatasetVersion),
      localCharacterCount: optionalNumber(dataset.localCharacterCount),
      upstreamCharacterCount: optionalNumber(dataset.upstreamCharacterCount),
      characterCountDelta: optionalNumber(dataset.characterCountDelta),
      newCharacterCount: newCharacter.newCharacterCount,
      newCharacterIdSample: newCharacter.newCharacterIdSample,
      newCharacterIdsTruncated: newCharacter.newCharacterIdsTruncated,
      deltaSummary: optionalString(dataset.deltaSummary),
    },
    sourceContract: {
      status: optionalString(sourceContract.status),
      failureCount: optionalNumber(sourceContract.failureCount) ?? 0,
      failureIds: Array.isArray(sourceContract.failureIds)
        ? sourceContract.failureIds.map(String).filter(Boolean)
        : [],
    },
    upstreamFetch: {
      status: optionalString(upstreamFetch.status),
      reason: optionalString(upstreamFetch.reason),
      failedFileCount: optionalNumber(upstreamFetch.failedFileCount) ?? 0,
    },
    idempotency: {
      key: optionalString(idempotency.key),
      duplicateReleaseBlocked: optionalBoolean(idempotency.duplicateReleaseBlocked) ?? false,
      duplicateReleaseBlockingCount: optionalNumber(idempotency.duplicateReleaseBlockingCount) ?? 0,
      dispatchRegistrationConfirmed: optionalBoolean(idempotency.dispatchRegistrationConfirmed),
      dispatchRegistrationAttempts: optionalNumber(idempotency.dispatchRegistrationAttempts),
    },
    monitor: {
      status: optionalString(monitor.status),
      warningCount: optionalNumber(monitor.warningCount) ?? 0,
      warningIds: Array.isArray(monitor.warningIds) ? monitor.warningIds.map(String).filter(Boolean) : [],
    },
    workflow: {
      name: optionalString(workflow.name),
      repository: optionalString(workflow.repository),
      runId: optionalString(workflow.runId),
      runNumber: optionalString(workflow.runNumber),
      runAttempt: optionalString(workflow.runAttempt),
      runUrl: optionalString(workflow.runUrl),
      eventName: optionalString(workflow.eventName),
      ref: optionalString(workflow.ref),
      sha: optionalString(workflow.sha),
    },
  };
}

function countBy(runs, readValue) {
  const counts = {};

  for (const run of runs) {
    const value = readValue(run) ?? 'unknown';
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function buildSummary(runs) {
  return {
    runCount: runs.length,
    releaseNeededCount: runs.filter((run) => run.decision.releaseNeeded).length,
    releaseDispatchedCount: runs.filter((run) => run.decision.releaseDispatched).length,
    failedCount: runs.filter((run) => run.status === 'failed').length,
    warningCount: runs.filter((run) => run.status === 'warning' || run.monitor.warningCount > 0).length,
    statusCounts: countBy(runs, (run) => run.status),
    reasonCounts: countBy(runs, (run) => run.reason),
    skipOrDispatchReasonCounts: countBy(runs, (run) => run.decision.skipOrDispatchReason),
  };
}

async function readHistoricalReports(historyDir) {
  const jsonFiles = await collectJsonFiles(historyDir);
  const reports = [];

  for (const filePath of jsonFiles) {
    const parsed = await readJsonFile(filePath, 'history report');

    if (isReleaseDetectorStatusReport(parsed)) {
      reports.push(parsed);
    }
  }

  return reports;
}

export async function buildReleaseDecisionHistory(options = {}) {
  if (!options.currentStatusPath) {
    throw new Error('--current-status is required.');
  }

  const maxRuns = normalizeMaxRuns(options.maxRuns);
  const currentStatusPath = path.resolve(options.currentStatusPath);
  const currentReport = await readJsonFile(currentStatusPath, 'current release detector status report');

  if (!isReleaseDetectorStatusReport(currentReport)) {
    throw new Error(`Invalid current release detector status report: ${currentStatusPath}`);
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

  const recentRuns = dedupedReports.slice(0, maxRuns).map(normalizeRun);

  return {
    schemaVersion: RELEASE_DECISION_HISTORY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      currentStatusPath,
      historyDir,
    },
    retention: {
      maxRuns,
      artifactRetentionDays: DEFAULT_ARTIFACT_RETENTION_DAYS,
      historyArtifactName: 'release-decision-history',
      sourceArtifactName: 'release-detector-status',
    },
    latest: recentRuns[0],
    recentRuns,
    summary: buildSummary(recentRuns),
  };
}

function formatNullable(value) {
  return value === null || value === undefined || value === '' ? 'n/a' : String(value);
}

function formatYesNo(value) {
  return value ? 'yes' : 'no';
}

function formatRunLink(workflow = {}) {
  return workflow.runUrl ?? workflow.runId ?? 'local';
}

function markdownCell(value) {
  return formatNullable(value).replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ');
}

export function formatReleaseDecisionHistoryMarkdown(history) {
  const latest = history.latest;
  const lines = [
    '# OPTC DB Release Decision History',
    '',
    `Generated: ${history.generatedAt}`,
    `Recent runs: ${history.recentRuns.length}`,
    `Retention: latest ${history.retention.maxRuns} runs, ${history.retention.artifactRetentionDays} days per artifact`,
  ];

  if (latest) {
    lines.push(
      '',
      '## Latest Decision',
      '',
      `- Status: ${formatNullable(latest.status)}`,
      `- Reason: ${formatNullable(latest.reason)}`,
      `- Skip or dispatch reason: ${formatNullable(latest.decision.skipOrDispatchReason)}`,
      `- Release needed: ${formatYesNo(latest.decision.releaseNeeded)}`,
      `- Release dispatched: ${formatYesNo(latest.decision.releaseDispatched)}`,
      `- Source version: local ${formatNullable(latest.dataset.localDatasetVersion)}, upstream ${formatNullable(
        latest.dataset.upstreamDatasetVersion,
      )}`,
      `- New upstream character count: ${formatNullable(latest.dataset.newCharacterCount)}`,
      `- Run: ${formatRunLink(latest.workflow)}`,
    );
  }

  lines.push(
    '',
    '## Summary',
    '',
    `- Release-needed runs: ${history.summary.releaseNeededCount}`,
    `- Release-dispatched runs: ${history.summary.releaseDispatchedCount}`,
    `- Failed runs: ${history.summary.failedCount}`,
    `- Warning runs: ${history.summary.warningCount}`,
    '',
    '## Recent Runs',
    '',
    '| Generated | Status | Reason | Decision reason | Needed | Dispatched | New IDs | Source versions | Run |',
    '| --- | --- | --- | --- | --- | --- | ---: | --- | --- |',
  );

  for (const run of history.recentRuns) {
    lines.push(
      `| ${markdownCell(run.generatedAt)} | ${markdownCell(run.status)} | ${markdownCell(run.reason)} | ${markdownCell(
        run.decision.skipOrDispatchReason,
      )} | ${formatYesNo(run.decision.releaseNeeded)} | ${formatYesNo(run.decision.releaseDispatched)} | ${formatNullable(
        run.dataset.newCharacterCount,
      )} | local ${markdownCell(run.dataset.localDatasetVersion)} / upstream ${markdownCell(
        run.dataset.upstreamDatasetVersion,
      )} | ${markdownCell(formatRunLink(run.workflow))} |`,
    );
  }

  const notableRuns = history.recentRuns.filter(
    (run) => run.status === 'failed' || run.status === 'warning' || run.monitor.warningCount > 0,
  );

  lines.push('', '## Failures And Warnings', '');
  if (notableRuns.length === 0) {
    lines.push('- None');
  } else {
    for (const run of notableRuns) {
      const warnings = run.monitor.warningIds.length > 0 ? `; warnings: ${run.monitor.warningIds.join(', ')}` : '';
      lines.push(
        `- ${formatNullable(run.generatedAt)}: ${formatNullable(run.status)} / ${formatNullable(run.reason)}${warnings} (${formatRunLink(
          run.workflow,
        )})`,
      );
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
      case '--current-status':
        options.currentStatusPath = readValue();
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
  const outputPath = path.resolve(options.outputPath ?? 'release-decision-history.json');
  const history = await buildReleaseDecisionHistory(options);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(history, null, 2)}\n`);

  const markdown = formatReleaseDecisionHistoryMarkdown(history);
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

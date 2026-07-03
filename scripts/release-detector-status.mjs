#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_DETECTOR_STATUS_SCHEMA_VERSION = 1;
export const RELEASE_DETECTOR_STATUS_NEW_ID_SAMPLE_LIMIT = 20;

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
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function optionalBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  return null;
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

function pickWorkflowMetadata(primaryWorkflow = {}, fallbackWorkflow = {}) {
  const workflow = isObject(primaryWorkflow) ? primaryWorkflow : {};
  const fallback = isObject(fallbackWorkflow) ? fallbackWorkflow : {};

  return {
    name: optionalString(workflow.name ?? fallback.name),
    repository: optionalString(workflow.repository ?? fallback.repository),
    runId: optionalString(workflow.runId ?? fallback.runId),
    runNumber: optionalString(workflow.runNumber ?? fallback.runNumber),
    runAttempt: optionalString(workflow.runAttempt ?? fallback.runAttempt),
    runUrl: optionalString(workflow.runUrl ?? fallback.runUrl),
    eventName: optionalString(workflow.eventName ?? fallback.eventName),
    ref: optionalString(workflow.ref ?? fallback.ref),
    sha: optionalString(workflow.sha ?? fallback.sha),
  };
}

function normalizeVerdict(releaseTriggerReport = {}) {
  const dispatch = isObject(releaseTriggerReport.dispatch) ? releaseTriggerReport.dispatch : {};

  return {
    releaseNeeded: optionalBoolean(dispatch.releaseNeeded) ?? optionalBoolean(releaseTriggerReport.releaseNeeded) ?? false,
    releaseDispatched:
      optionalBoolean(dispatch.releaseDispatched) ?? optionalBoolean(releaseTriggerReport.releaseDispatched) ?? false,
    dispatchMode: optionalString(dispatch.mode ?? releaseTriggerReport.releaseDispatchMode),
    dispatchBlocked:
      optionalBoolean(dispatch.blocked) ?? optionalBoolean(releaseTriggerReport.releaseDispatchBlocked) ?? false,
    dispatchBlockReason: optionalString(dispatch.blockReason ?? releaseTriggerReport.releaseDispatchBlockReason),
    activeReleaseCount: optionalNumber(dispatch.activeReleaseCount ?? releaseTriggerReport.activeReleaseCount),
  };
}

function normalizeDataset(releaseTriggerReport = {}, upstreamMonitorReport = {}) {
  const comparison = isObject(releaseTriggerReport.comparison) ? releaseTriggerReport.comparison : null;
  const releaseCheck = isObject(releaseTriggerReport.releaseCheck) ? releaseTriggerReport.releaseCheck : null;
  const monitorCurrent = isObject(upstreamMonitorReport.current) ? upstreamMonitorReport.current : null;
  const source = comparison ?? releaseCheck ?? monitorCurrent ?? {};
  const newCharacterIds = normalizeIds(source.newCharacterIds);
  const newCharacterCount = optionalNumber(source.newCharacterCount) ?? newCharacterIds.length;
  const sample = newCharacterIds.slice(0, RELEASE_DETECTOR_STATUS_NEW_ID_SAMPLE_LIMIT);
  const localCharacterCount = optionalNumber(source.localCharacterCount);
  const upstreamCharacterCount = optionalNumber(source.remoteCharacterCount);
  const countDelta =
    localCharacterCount === null || upstreamCharacterCount === null ? null : upstreamCharacterCount - localCharacterCount;
  const localDatasetVersion = optionalString(source.localSourceVersion);
  const upstreamDatasetVersion = optionalString(source.remoteSourceVersion);

  return {
    source: optionalString(source.source),
    sourceRepository: optionalString(source.sourceRepository),
    localDatasetVersion,
    upstreamDatasetVersion,
    localCharacterCount,
    upstreamCharacterCount,
    characterCountDelta: countDelta,
    newCharacterCount,
    newCharacterIdSample: sample,
    newCharacterIdsTruncated: newCharacterCount > sample.length,
    deltaSummary: summarizeDatasetDelta({
      localDatasetVersion,
      upstreamDatasetVersion,
      countDelta,
      newCharacterCount,
    }),
  };
}

function summarizeDatasetDelta({ localDatasetVersion, upstreamDatasetVersion, countDelta, newCharacterCount }) {
  if (newCharacterCount > 0) {
    return `${newCharacterCount} new upstream character ID${newCharacterCount === 1 ? '' : 's'}`;
  }

  if (!localDatasetVersion || !upstreamDatasetVersion) {
    return 'dataset comparison unavailable';
  }

  if (localDatasetVersion !== upstreamDatasetVersion) {
    return 'upstream source version differs without new upstream character IDs';
  }

  if (countDelta !== null && countDelta !== 0) {
    return `upstream normalized character count delta ${countDelta > 0 ? '+' : ''}${countDelta} without new upstream character IDs`;
  }

  return 'local dataset matches upstream by source version, count, and character IDs';
}

function normalizeMonitor(upstreamMonitorReport = {}) {
  const warnings = Array.isArray(upstreamMonitorReport.warnings) ? upstreamMonitorReport.warnings : [];
  const warningIds = warnings
    .map((warning) => optionalString(isObject(warning) ? warning.id : warning))
    .filter(Boolean);

  return {
    status: optionalString(upstreamMonitorReport.status),
    warningCount: warningIds.length,
    warningIds,
  };
}

function statusFromInputs({ releaseTriggerReport, upstreamMonitorReport, inputErrors }) {
  if (inputErrors.length > 0) {
    return {
      status: 'failed',
      reason: 'status-input-unavailable',
    };
  }

  const releaseStatus = optionalString(releaseTriggerReport.status) ?? 'unknown';
  const releaseReason = optionalString(releaseTriggerReport.reason) ?? 'unknown';
  const monitorStatus = optionalString(upstreamMonitorReport.status);

  if (releaseStatus === 'failed') {
    return {
      status: 'failed',
      reason: releaseReason,
    };
  }

  if (monitorStatus === 'failed') {
    return {
      status: 'failed',
      reason: 'upstream-monitor-failed',
    };
  }

  if (monitorStatus === 'warning') {
    return {
      status: 'warning',
      reason: 'upstream-monitor-warning',
    };
  }

  return {
    status: releaseStatus,
    reason: releaseReason,
  };
}

export function buildReleaseDetectorStatusReport({
  releaseTriggerReport = null,
  upstreamMonitorReport = null,
  generatedAt = new Date().toISOString(),
  inputErrors = [],
} = {}) {
  const safeReleaseTriggerReport = isObject(releaseTriggerReport) ? releaseTriggerReport : {};
  const safeUpstreamMonitorReport = isObject(upstreamMonitorReport) ? upstreamMonitorReport : {};
  const status = statusFromInputs({
    releaseTriggerReport: safeReleaseTriggerReport,
    upstreamMonitorReport: safeUpstreamMonitorReport,
    inputErrors,
  });

  return {
    schemaVersion: RELEASE_DETECTOR_STATUS_SCHEMA_VERSION,
    generatedAt,
    status: status.status,
    reason: status.reason,
    verdict: normalizeVerdict(safeReleaseTriggerReport),
    dataset: normalizeDataset(safeReleaseTriggerReport, safeUpstreamMonitorReport),
    monitor: normalizeMonitor(safeUpstreamMonitorReport),
    workflow: pickWorkflowMetadata(safeReleaseTriggerReport.workflow, safeUpstreamMonitorReport.workflow),
    inputErrors,
  };
}

function formatYesNo(value) {
  return value ? 'yes' : 'no';
}

function formatNullable(value) {
  return value === null || value === undefined || value === '' ? 'n/a' : String(value);
}

function formatList(values) {
  return values.length > 0 ? values.join(', ') : 'none';
}

export function formatReleaseDetectorStatusMarkdown(report) {
  const lines = [
    '# OPTC DB Release Detector Status',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Verdict',
    '',
    `- Status: ${report.status}`,
    `- Reason: ${report.reason}`,
    `- Release needed: ${formatYesNo(report.verdict.releaseNeeded)}`,
    `- Release dispatched: ${formatYesNo(report.verdict.releaseDispatched)}`,
    `- Dispatch mode: ${formatNullable(report.verdict.dispatchMode)}`,
    `- Dispatch blocked: ${formatYesNo(report.verdict.dispatchBlocked)}`,
    `- Dispatch block reason: ${formatNullable(report.verdict.dispatchBlockReason)}`,
    `- Active Release Android runs: ${formatNullable(report.verdict.activeReleaseCount)}`,
    '',
    '## Dataset',
    '',
    `- Source: ${formatNullable(report.dataset.sourceRepository)}`,
    `- Local dataset version: ${formatNullable(report.dataset.localDatasetVersion)}`,
    `- Upstream dataset version: ${formatNullable(report.dataset.upstreamDatasetVersion)}`,
    `- Local character count: ${formatNullable(report.dataset.localCharacterCount)}`,
    `- Upstream character count: ${formatNullable(report.dataset.upstreamCharacterCount)}`,
    `- Character count delta: ${formatNullable(report.dataset.characterCountDelta)}`,
    `- New upstream character count: ${formatNullable(report.dataset.newCharacterCount)}`,
    `- New upstream character IDs: ${formatList(report.dataset.newCharacterIdSample)}${
      report.dataset.newCharacterIdsTruncated ? ' (truncated)' : ''
    }`,
    `- Delta summary: ${report.dataset.deltaSummary}`,
    '',
    '## Upstream Monitor',
    '',
    `- Status: ${formatNullable(report.monitor.status)}`,
    `- Warning count: ${report.monitor.warningCount}`,
    `- Warning IDs: ${formatList(report.monitor.warningIds)}`,
    '',
    '## Workflow',
    '',
    `- Name: ${formatNullable(report.workflow.name)}`,
    `- Repository: ${formatNullable(report.workflow.repository)}`,
    `- Run: ${formatNullable(report.workflow.runUrl)}`,
    `- Event: ${formatNullable(report.workflow.eventName)}`,
    `- Ref: ${formatNullable(report.workflow.ref)}`,
    `- SHA: ${formatNullable(report.workflow.sha)}`,
  ];

  if (report.inputErrors.length > 0) {
    lines.push('', '## Input Errors', '', ...report.inputErrors.map((error) => `- ${error.label}: ${error.message}`));
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
      case '--release-trigger-report':
        options.releaseTriggerReportPath = readValue();
        break;
      case '--upstream-monitor-report':
        options.upstreamMonitorReportPath = readValue();
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

async function readJsonReport(filePath, label) {
  try {
    return {
      value: JSON.parse(await readFile(filePath, 'utf8')),
      error: null,
    };
  } catch (error) {
    return {
      value: null,
      error: {
        label,
        path: filePath,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const releaseTriggerReportPath = options.releaseTriggerReportPath ?? 'release-trigger-outcome.json';
  const upstreamMonitorReportPath =
    options.upstreamMonitorReportPath ?? path.join('upstream-monitor-artifacts', 'current', 'upstream-monitor-report.json');
  const outputPath = path.resolve(options.outputPath ?? 'release-detector-status.json');
  const summaryPath = path.resolve(options.summaryPath ?? 'release-detector-status.md');
  const [releaseTriggerRead, upstreamMonitorRead] = await Promise.all([
    readJsonReport(releaseTriggerReportPath, 'release-trigger-report'),
    readJsonReport(upstreamMonitorReportPath, 'upstream-monitor-report'),
  ]);
  const inputErrors = [releaseTriggerRead.error, upstreamMonitorRead.error].filter(Boolean);
  const report = buildReleaseDetectorStatusReport({
    releaseTriggerReport: releaseTriggerRead.value,
    upstreamMonitorReport: upstreamMonitorRead.value,
    generatedAt: options.generatedAt,
    inputErrors,
  });
  const summary = formatReleaseDetectorStatusMarkdown(report);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, summary);

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

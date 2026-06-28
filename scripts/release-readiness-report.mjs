#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RELEASE_READINESS_SCHEMA_VERSION = 1;

const TEST_STATUSES = new Set(['passed', 'warning', 'failed', 'blocked']);
const PERFORMANCE_STATUSES = new Set(['passed', 'warning', 'failed']);
const RELEASE_TRIGGER_BLOCKING_STATUSES = new Set(['failed']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`Invalid release-readiness source: ${label} must be an object.`);
  }

  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid release-readiness source: ${label} must be an array.`);
  }

  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid release-readiness source: ${label} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalString(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid release-readiness source: ${label} must be a string.`);
  }

  return value.trim() || null;
}

function normalizeStatus(value, allowedStatuses, label) {
  const status = requireNonEmptyString(value, label).toLowerCase();

  if (!allowedStatuses.has(status)) {
    throw new Error(
      `Invalid release-readiness source: ${label} must be one of ${Array.from(allowedStatuses).join(', ')}.`,
    );
  }

  return status;
}

async function readJsonFile(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${label} at ${filePath}: ${message}`);
  }
}

function resolveSourcePath(baseDir, sourcePath) {
  return path.isAbsolute(sourcePath) ? sourcePath : path.resolve(baseDir, sourcePath);
}

function normalizeCandidate(value) {
  const candidate = requireObject(value, 'candidate');

  return {
    label: requireNonEmptyString(candidate.label, 'candidate.label'),
    ref: optionalString(candidate.ref, 'candidate.ref'),
    sha: optionalString(candidate.sha, 'candidate.sha'),
    notes: optionalString(candidate.notes, 'candidate.notes'),
  };
}

function normalizeTests(value) {
  return requireArray(value, 'tests').map((entry, index) => {
    const test = requireObject(entry, `tests[${index}]`);

    return {
      name: requireNonEmptyString(test.name, `tests[${index}].name`),
      status: normalizeStatus(test.status, TEST_STATUSES, `tests[${index}].status`),
      url: optionalString(test.url, `tests[${index}].url`),
      path: optionalString(test.path, `tests[${index}].path`),
      notes: optionalString(test.notes, `tests[${index}].notes`),
    };
  });
}

function normalizeEvidenceItems(value, label) {
  return requireArray(value ?? [], label).map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        label: requireNonEmptyString(entry, `${label}[${index}]`),
        url: null,
        path: null,
        notes: null,
      };
    }

    const item = requireObject(entry, `${label}[${index}]`);

    return {
      label: requireNonEmptyString(item.label ?? item.name ?? item.title, `${label}[${index}].label`),
      url: optionalString(item.url, `${label}[${index}].url`),
      path: optionalString(item.path, `${label}[${index}].path`),
      notes: optionalString(item.notes, `${label}[${index}].notes`),
    };
  });
}

function normalizeBlockers(value) {
  return requireArray(value ?? [], 'blockers').map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        label: requireNonEmptyString(entry, `blockers[${index}]`),
        reason: null,
        url: null,
        path: null,
      };
    }

    const blocker = requireObject(entry, `blockers[${index}]`);

    return {
      label: requireNonEmptyString(blocker.label ?? blocker.name ?? blocker.title, `blockers[${index}].label`),
      reason: optionalString(blocker.reason ?? blocker.notes, `blockers[${index}].reason`),
      url: optionalString(blocker.url, `blockers[${index}].url`),
      path: optionalString(blocker.path, `blockers[${index}].path`),
    };
  });
}

function normalizeWaivers(value) {
  return requireArray(value ?? [], 'waivers').map((entry, index) => {
    const waiver = requireObject(entry, `waivers[${index}]`);

    return {
      label: requireNonEmptyString(waiver.label ?? waiver.name ?? waiver.title, `waivers[${index}].label`),
      reason: requireNonEmptyString(waiver.reason, `waivers[${index}].reason`),
      approver: requireNonEmptyString(
        waiver.approver ?? waiver.signOff ?? waiver.signoff,
        `waivers[${index}].approver`,
      ),
      url: optionalString(waiver.url, `waivers[${index}].url`),
      path: optionalString(waiver.path, `waivers[${index}].path`),
    };
  });
}

function normalizePerformanceReport(report, sourcePath) {
  const performance = requireObject(report, 'performance budget report');
  const status = normalizeStatus(performance.status, PERFORMANCE_STATUSES, 'performanceBudgetReport.status');
  const summary = requireObject(performance.summary ?? {}, 'performanceBudgetReport.summary');

  return {
    sourcePath,
    status,
    generatedAt: optionalString(performance.generatedAt, 'performanceBudgetReport.generatedAt'),
    workflowRunUrl: optionalString(
      performance.workflowRunUrl ?? performance.workflow?.runUrl,
      'performanceBudgetReport.workflow.runUrl',
    ),
    baselineRunUrl: optionalString(
      performance.baselineRunUrl ?? performance.baseline?.workflow?.runUrl,
      'performanceBudgetReport.baseline.workflow.runUrl',
    ),
    summary: {
      metricCount: Number.isFinite(summary.metricCount) ? summary.metricCount : null,
      budgetedMetricCount: Number.isFinite(summary.budgetedMetricCount) ? summary.budgetedMetricCount : null,
      hardBudgetFailureCount: Number.isFinite(summary.hardBudgetFailureCount)
        ? summary.hardBudgetFailureCount
        : (performance.hardBudgetFailures ?? []).length,
      baselineDeltaWarningCount: Number.isFinite(summary.baselineDeltaWarningCount)
        ? summary.baselineDeltaWarningCount
        : (performance.baselineDeltaWarnings ?? []).length,
    },
    hardBudgetFailures: requireArray(performance.hardBudgetFailures ?? [], 'performanceBudgetReport.hardBudgetFailures').map(
      (failure, index) => ({
        metricId: optionalString(failure?.metricId, `performanceBudgetReport.hardBudgetFailures[${index}].metricId`),
        message: requireNonEmptyString(
          failure?.message ?? String(failure),
          `performanceBudgetReport.hardBudgetFailures[${index}].message`,
        ),
      }),
    ),
    baselineDeltaWarnings: requireArray(
      performance.baselineDeltaWarnings ?? [],
      'performanceBudgetReport.baselineDeltaWarnings',
    ).map((warning, index) => ({
      metricId: optionalString(warning?.metricId, `performanceBudgetReport.baselineDeltaWarnings[${index}].metricId`),
      message: requireNonEmptyString(
        warning?.message ?? String(warning),
        `performanceBudgetReport.baselineDeltaWarnings[${index}].message`,
      ),
    })),
  };
}

function normalizeReleaseTriggerReport(report, sourcePath) {
  if (!report) {
    return null;
  }

  const trigger = requireObject(report, 'release trigger report');
  const status = requireNonEmptyString(trigger.status, 'releaseTriggerReport.status').toLowerCase();

  return {
    sourcePath,
    status,
    reason: optionalString(trigger.reason, 'releaseTriggerReport.reason'),
    generatedAt: optionalString(trigger.generatedAt, 'releaseTriggerReport.generatedAt'),
    workflowRunUrl: optionalString(trigger.workflowRunUrl ?? trigger.workflow?.runUrl, 'releaseTriggerReport.workflow.runUrl'),
    releaseNeeded: Boolean(trigger.releaseNeeded ?? trigger.dispatch?.releaseNeeded),
    releaseDispatched: Boolean(trigger.releaseDispatched ?? trigger.dispatch?.releaseDispatched),
    activeReleaseCount:
      typeof trigger.activeReleaseCount === 'number'
        ? trigger.activeReleaseCount
        : typeof trigger.dispatch?.activeReleaseCount === 'number'
          ? trigger.dispatch.activeReleaseCount
          : null,
    newCharacterCount:
      typeof trigger.newCharacterCount === 'number'
        ? trigger.newCharacterCount
        : typeof trigger.comparison?.newCharacterCount === 'number'
          ? trigger.comparison.newCharacterCount
          : null,
  };
}

export function decideReleaseReadiness({ tests, performance, releaseTrigger, blockers, waivers }) {
  const blockingReasons = [];

  for (const blocker of blockers) {
    blockingReasons.push(`Blocker: ${blocker.label}`);
  }

  for (const test of tests) {
    if (test.status === 'failed' || test.status === 'blocked') {
      blockingReasons.push(`Test ${test.status}: ${test.name}`);
    }
  }

  if (performance.status === 'failed') {
    blockingReasons.push('Performance budget report failed');
  }

  if (releaseTrigger && RELEASE_TRIGGER_BLOCKING_STATUSES.has(releaseTrigger.status)) {
    blockingReasons.push(`Release trigger failed: ${releaseTrigger.reason ?? releaseTrigger.status}`);
  }

  if (blockingReasons.length > 0) {
    return {
      status: 'blocked',
      reasons: blockingReasons,
    };
  }

  const waiverReasons = [];

  for (const test of tests) {
    if (test.status === 'warning') {
      waiverReasons.push(`Test warning: ${test.name}`);
    }
  }

  if (performance.status === 'warning') {
    waiverReasons.push('Performance budget report has baseline warnings');
  }

  for (const waiver of waivers) {
    waiverReasons.push(`Waiver: ${waiver.label}`);
  }

  if (waiverReasons.length > 0) {
    return {
      status: 'ready-with-waivers',
      reasons: waiverReasons,
    };
  }

  return {
    status: 'ready',
    reasons: ['No blockers, failed checks, or waivers are present.'],
  };
}

export async function loadReleaseReadinessSource(sourcePath) {
  const absoluteSourcePath = path.resolve(sourcePath);
  const sourceDir = path.dirname(absoluteSourcePath);
  const source = requireObject(await readJsonFile(absoluteSourcePath, 'release-readiness source'), 'source');
  const performanceBudgetReportPath = requireNonEmptyString(
    source.performanceBudgetReportPath,
    'performanceBudgetReportPath',
  );
  const absolutePerformancePath = resolveSourcePath(sourceDir, performanceBudgetReportPath);
  const releaseTriggerReportPath = optionalString(source.releaseTriggerReportPath, 'releaseTriggerReportPath');
  const absoluteReleaseTriggerPath = releaseTriggerReportPath
    ? resolveSourcePath(sourceDir, releaseTriggerReportPath)
    : null;

  return {
    candidate: normalizeCandidate(source.candidate),
    tests: normalizeTests(source.tests),
    audits: normalizeEvidenceItems(source.audits, 'audits'),
    docs: normalizeEvidenceItems(source.docs, 'docs'),
    blockers: normalizeBlockers(source.blockers),
    waivers: normalizeWaivers(source.waivers),
    performance: normalizePerformanceReport(
      await readJsonFile(absolutePerformancePath, 'performance budget report'),
      performanceBudgetReportPath,
    ),
    releaseTrigger: absoluteReleaseTriggerPath
      ? normalizeReleaseTriggerReport(
          await readJsonFile(absoluteReleaseTriggerPath, 'release trigger report'),
          releaseTriggerReportPath,
        )
      : null,
  };
}

export function buildReleaseReadinessReport(source, { generatedAt = new Date().toISOString() } = {}) {
  const normalized = {
    candidate: normalizeCandidate(source.candidate),
    tests: normalizeTests(source.tests),
    audits: normalizeEvidenceItems(source.audits, 'audits'),
    docs: normalizeEvidenceItems(source.docs, 'docs'),
    blockers: normalizeBlockers(source.blockers),
    waivers: normalizeWaivers(source.waivers),
    performance: normalizePerformanceReport(source.performance, source.performance.sourcePath ?? null),
    releaseTrigger: normalizeReleaseTriggerReport(source.releaseTrigger, source.releaseTrigger?.sourcePath ?? null),
  };
  const decision = decideReleaseReadiness(normalized);

  return {
    schemaVersion: RELEASE_READINESS_SCHEMA_VERSION,
    generatedAt,
    decision,
    ...normalized,
  };
}

function formatNullable(value) {
  return value === null || value === undefined || value === '' ? 'n/a' : String(value);
}

function formatYesNo(value) {
  return value ? 'yes' : 'no';
}

function tableCell(value) {
  return formatNullable(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function formatEvidenceLink(item) {
  const target = item.url ?? item.path ?? null;

  if (!target) {
    return item.label;
  }

  return `[${item.label}](${target})`;
}

function formatListOrNone(items, formatter) {
  if (!items.length) {
    return ['- None'];
  }

  return items.map(formatter);
}

function formatFailures(title, items) {
  return [
    `### ${title}`,
    '',
    ...formatListOrNone(items, (item) => `- ${item.message}${item.metricId ? ` (${item.metricId})` : ''}`),
  ];
}

export function formatReleaseReadinessMarkdown(report) {
  const lines = [
    '# Release Readiness Summary',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Decision',
    '',
    `- Status: ${report.decision.status}`,
    ...report.decision.reasons.map((reason) => `- ${reason}`),
    '',
    '## Candidate',
    '',
    `- Label: ${report.candidate.label}`,
    `- Ref: ${formatNullable(report.candidate.ref)}`,
    `- SHA: ${formatNullable(report.candidate.sha)}`,
  ];

  if (report.candidate.notes) {
    lines.push(`- Notes: ${report.candidate.notes}`);
  }

  lines.push(
    '',
    '## Tests',
    '',
    '| Test | Status | Evidence | Notes |',
    '| --- | --- | --- | --- |',
  );

  for (const test of report.tests) {
    lines.push(
      `| ${tableCell(test.name)} | ${tableCell(test.status)} | ${tableCell(
        test.url ?? test.path,
      )} | ${tableCell(test.notes)} |`,
    );
  }

  lines.push(
    '',
    '## Performance',
    '',
    `- Status: ${report.performance.status}`,
    `- Source: ${formatNullable(report.performance.sourcePath)}`,
    `- Metrics: ${formatNullable(report.performance.summary.metricCount)} total, ${formatNullable(
      report.performance.summary.budgetedMetricCount,
    )} budgeted`,
    `- Hard budget failures: ${report.performance.summary.hardBudgetFailureCount}`,
    `- Baseline warnings: ${report.performance.summary.baselineDeltaWarningCount}`,
    `- Run: ${formatNullable(report.performance.workflowRunUrl)}`,
    `- Baseline: ${formatNullable(report.performance.baselineRunUrl)}`,
    '',
    ...formatFailures('Hard Budget Failures', report.performance.hardBudgetFailures),
    '',
    ...formatFailures('Baseline Delta Warnings', report.performance.baselineDeltaWarnings),
    '',
    '## Release Trigger',
    '',
  );

  if (report.releaseTrigger) {
    lines.push(
      `- Status: ${report.releaseTrigger.status}`,
      `- Reason: ${formatNullable(report.releaseTrigger.reason)}`,
      `- Source: ${formatNullable(report.releaseTrigger.sourcePath)}`,
      `- Release needed: ${formatYesNo(report.releaseTrigger.releaseNeeded)}`,
      `- Release dispatched: ${formatYesNo(report.releaseTrigger.releaseDispatched)}`,
      `- Active release count: ${formatNullable(report.releaseTrigger.activeReleaseCount)}`,
      `- New character count: ${formatNullable(report.releaseTrigger.newCharacterCount)}`,
      `- Run: ${formatNullable(report.releaseTrigger.workflowRunUrl)}`,
    );
  } else {
    lines.push('- Not provided');
  }

  lines.push(
    '',
    '## Audit Evidence',
    '',
    ...formatListOrNone(report.audits, (item) => `- ${formatEvidenceLink(item)}${item.notes ? ` - ${item.notes}` : ''}`),
    '',
    '## Docs',
    '',
    ...formatListOrNone(report.docs, (item) => `- ${formatEvidenceLink(item)}${item.notes ? ` - ${item.notes}` : ''}`),
    '',
    '## Blockers',
    '',
    ...formatListOrNone(
      report.blockers,
      (item) => `- ${formatEvidenceLink(item)}${item.reason ? ` - ${item.reason}` : ''}`,
    ),
    '',
    '## Waivers',
    '',
    ...formatListOrNone(
      report.waivers,
      (item) => `- ${formatEvidenceLink(item)} - ${item.reason}; approved by ${item.approver}`,
    ),
    '',
    '## Sign-off Checklist',
    '',
    '- [ ] Candidate ref and SHA match the intended release candidate.',
    '- [ ] Required tests are passed or explicitly waived.',
    '- [ ] Performance hard failures are clear; warnings are reviewed.',
    '- [ ] Release-trigger outcome is reviewed when provided.',
    '- [ ] Blockers and waivers are reviewed before release.',
    '',
  );

  return `${lines.join('\n')}`;
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
      case '--source':
        options.sourcePath = readValue();
        break;
      case '--output':
        options.outputPath = readValue();
        break;
      case '--json-output':
        options.jsonOutputPath = readValue();
        break;
      case '--generated-at':
        options.generatedAt = readValue();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.sourcePath) {
    throw new Error('Missing required --source path.');
  }

  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const source = await loadReleaseReadinessSource(options.sourcePath);
  const report = buildReleaseReadinessReport(source, { generatedAt: options.generatedAt });
  const markdown = formatReleaseReadinessMarkdown(report);

  if (options.outputPath) {
    await mkdir(path.dirname(path.resolve(options.outputPath)), { recursive: true });
    await writeFile(options.outputPath, markdown);
  } else {
    process.stdout.write(markdown);
  }

  if (options.jsonOutputPath) {
    await mkdir(path.dirname(path.resolve(options.jsonOutputPath)), { recursive: true });
    await writeFile(options.jsonOutputPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (report.decision.status === 'blocked') {
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

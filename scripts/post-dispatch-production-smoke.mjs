#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const POST_DISPATCH_PRODUCTION_SMOKE_SCHEMA_VERSION = 1;

const DEFAULT_OUTPUT_PATH = 'post-dispatch-production-smoke.json';
const DEFAULT_SUMMARY_PATH = 'post-dispatch-production-smoke.md';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return String(value).trim() || null;
}

function parseArgs(argv) {
  const options = {
    requireAutoReleaseLink: false,
  };

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
      case '--release-provenance':
        options.releaseProvenancePath = readValue();
        break;
      case '--public-entry-report':
        options.publicEntryReportPath = readValue();
        break;
      case '--release-run-url':
        options.releaseRunUrl = readValue();
        break;
      case '--release-tag':
        options.releaseTag = readValue();
        break;
      case '--release-version':
        options.releaseVersion = readValue();
        break;
      case '--version-code':
        options.versionCode = readValue();
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
      case '--require-auto-release-link':
        options.requireAutoReleaseLink = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  for (const key of [
    'releaseProvenancePath',
    'publicEntryReportPath',
    'releaseRunUrl',
    'releaseTag',
    'releaseVersion',
    'versionCode',
  ]) {
    if (!options[key]) {
      throw new Error(`Missing required option: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
    }
  }

  options.outputPath ??= DEFAULT_OUTPUT_PATH;
  options.summaryPath ??= DEFAULT_SUMMARY_PATH;
  return options;
}

async function readJsonFile(filePath, label) {
  const resolved = path.resolve(filePath);
  try {
    return {
      value: JSON.parse(await readFile(resolved, 'utf8')),
      error: null,
      path: filePath,
    };
  } catch (error) {
    return {
      value: null,
      error: `${label} could not be read from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      path: filePath,
    };
  }
}

function statusRank(status) {
  switch (status) {
    case 'failed':
      return 3;
    case 'warning':
      return 2;
    case 'passed':
      return 1;
    default:
      return 0;
  }
}

function combineStatuses(checks) {
  const worst = checks.reduce((max, check) => Math.max(max, statusRank(check.status)), 0);
  if (worst >= statusRank('failed')) {
    return 'failed';
  }
  if (worst >= statusRank('warning')) {
    return 'warning';
  }
  return 'passed';
}

function addCheck(checks, id, label, status, detail) {
  checks.push({
    id,
    label,
    status,
    detail,
  });
}

function normalizePublicEntries(publicEntryReport) {
  if (!Array.isArray(publicEntryReport?.checkedEntries)) {
    return [];
  }

  return publicEntryReport.checkedEntries.map((entry) => ({
    id: optionalString(entry.id) ?? 'unknown',
    status: entry.status === 'ok' ? 'passed' : 'failed',
    url: optionalString(entry.url),
    screenshot: optionalString(entry.evidence?.screenshot),
    failures: Array.isArray(entry.failures)
      ? entry.failures.map((failure) => ({
          category: optionalString(failure.category) ?? 'unknown',
          message: optionalString(failure.message) ?? 'Unknown public-entry smoke failure.',
        }))
      : [],
  }));
}

function releaseValueMismatch(label, expected, actual) {
  if (!expected || !actual) {
    return `${label} is missing from release metadata or provenance.`;
  }
  return `${label} mismatch: workflow=${expected}, provenance=${actual}.`;
}

export function buildPostDispatchProductionSmokeReport({
  releaseProvenance,
  publicEntryReport,
  releaseRunUrl,
  releaseTag,
  releaseVersion,
  versionCode,
  requireAutoReleaseLink = false,
  inputErrors = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const checks = [];
  const errors = Array.isArray(inputErrors) ? inputErrors.filter(Boolean) : [];

  for (const error of errors) {
    addCheck(checks, 'input-readiness', 'Input readiness', 'failed', error);
  }

  if (!isObject(releaseProvenance)) {
    addCheck(checks, 'release-provenance', 'Release provenance artifact', 'failed', 'Release provenance JSON was not available.');
  } else if (releaseProvenance.status === 'failed') {
    addCheck(checks, 'release-provenance', 'Release provenance artifact', 'failed', 'Release provenance report status is failed.');
  } else if (releaseProvenance.status === 'warning') {
    addCheck(checks, 'release-provenance', 'Release provenance artifact', 'warning', 'Release provenance report has warnings; inspect the provenance artifact.');
  } else {
    addCheck(checks, 'release-provenance', 'Release provenance artifact', 'passed', 'Release provenance report did not fail.');
  }

  const provenanceRelease = isObject(releaseProvenance?.release) ? releaseProvenance.release : {};
  const metadataComparisons = [
    ['release tag', releaseTag, provenanceRelease.tag],
    ['release version', releaseVersion, provenanceRelease.version],
    ['version code', versionCode, provenanceRelease.versionCode],
  ];
  const metadataFailures = metadataComparisons
    .filter(([, expected, actual]) => optionalString(expected) !== optionalString(actual))
    .map(([label, expected, actual]) => releaseValueMismatch(label, expected, actual));

  addCheck(
    checks,
    'release-metadata',
    'Release metadata alignment',
    metadataFailures.length ? 'failed' : 'passed',
    metadataFailures.length ? metadataFailures.join(' ') : 'Workflow release outputs align with release provenance metadata.',
  );

  const hasDetectorLink = isObject(releaseProvenance?.trigger);
  if (hasDetectorLink) {
    addCheck(
      checks,
      'auto-release-link',
      'Auto-release detector linkage',
      'passed',
      `Release is linked to detector run ${releaseProvenance.trigger.runId ?? 'unknown'}.`,
    );
  } else if (requireAutoReleaseLink) {
    addCheck(
      checks,
      'auto-release-link',
      'Auto-release detector linkage',
      'failed',
      'This was an auto-dispatched release, but release provenance has no detector link.',
    );
  } else {
    addCheck(
      checks,
      'auto-release-link',
      'Auto-release detector linkage',
      'warning',
      'No detector link was present; acceptable for manual Android releases.',
    );
  }

  const publicEntries = normalizePublicEntries(publicEntryReport);
  if (!isObject(publicEntryReport)) {
    addCheck(checks, 'production-public-entry', 'Production public-entry smoke', 'failed', 'Public-entry synthetic report was not available.');
  } else if (publicEntryReport.status !== 'ok') {
    addCheck(
      checks,
      'production-public-entry',
      'Production public-entry smoke',
      'failed',
      'At least one production public-entry synthetic flow failed.',
    );
  } else if (publicEntries.length === 0) {
    addCheck(
      checks,
      'production-public-entry',
      'Production public-entry smoke',
      'failed',
      'Public-entry synthetic report did not include checked entries.',
    );
  } else {
    addCheck(
      checks,
      'production-public-entry',
      'Production public-entry smoke',
      'passed',
      `Checked ${publicEntries.length} production public-entry flow(s).`,
    );
  }

  return {
    schemaVersion: POST_DISPATCH_PRODUCTION_SMOKE_SCHEMA_VERSION,
    generatedAt,
    status: combineStatuses(checks),
    release: {
      runUrl: optionalString(releaseRunUrl),
      tag: optionalString(releaseTag),
      version: optionalString(releaseVersion),
      versionCode: optionalString(versionCode),
      provenanceStatus: optionalString(releaseProvenance?.status),
      detectorRunUrl: optionalString(releaseProvenance?.trigger?.runUrl),
    },
    production: {
      baseUrl: optionalString(publicEntryReport?.baseUrl),
      publicEntryStatus: publicEntryReport?.status === 'ok' ? 'passed' : optionalString(publicEntryReport?.status) ?? 'failed',
      checkedEntries: publicEntries,
    },
    checks,
  };
}

function markdownStatusIcon(status) {
  switch (status) {
    case 'passed':
      return 'PASS';
    case 'warning':
      return 'WARN';
    case 'failed':
      return 'FAIL';
    default:
      return String(status ?? 'UNKNOWN').toUpperCase();
  }
}

function escapeMarkdownCell(value) {
  return String(value ?? 'none').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

export function formatPostDispatchProductionSmokeMarkdown(report) {
  const lines = [
    '# Post-Dispatch Production Smoke',
    '',
    `Status: **${markdownStatusIcon(report.status)}**`,
    '',
    '## Release',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Run | ${escapeMarkdownCell(report.release.runUrl)} |`,
    `| Tag | ${escapeMarkdownCell(report.release.tag)} |`,
    `| Version | ${escapeMarkdownCell(report.release.version)} |`,
    `| Version code | ${escapeMarkdownCell(report.release.versionCode)} |`,
    `| Provenance status | ${escapeMarkdownCell(report.release.provenanceStatus)} |`,
    `| Detector run | ${escapeMarkdownCell(report.release.detectorRunUrl)} |`,
    '',
    '## Checks',
    '',
    '| Check | Status | Detail |',
    '| --- | --- | --- |',
  ];

  for (const check of report.checks) {
    lines.push(
      `| ${escapeMarkdownCell(check.label)} | ${markdownStatusIcon(check.status)} | ${escapeMarkdownCell(check.detail)} |`,
    );
  }

  lines.push('', '## Production Entries', '', '| Entry | Status | URL | Screenshot |', '| --- | --- | --- | --- |');
  for (const entry of report.production.checkedEntries) {
    lines.push(
      `| ${escapeMarkdownCell(entry.id)} | ${markdownStatusIcon(entry.status)} | ${escapeMarkdownCell(
        entry.url,
      )} | ${escapeMarkdownCell(entry.screenshot)} |`,
    );
  }

  if (report.production.checkedEntries.some((entry) => entry.failures.length > 0)) {
    lines.push('', '## Public-Entry Failures', '');
    for (const entry of report.production.checkedEntries) {
      for (const failure of entry.failures) {
        lines.push(`- ${entry.id}: ${failure.category} - ${failure.message}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const [releaseProvenance, publicEntryReport] = await Promise.all([
    readJsonFile(options.releaseProvenancePath, 'release provenance'),
    readJsonFile(options.publicEntryReportPath, 'public-entry synthetic report'),
  ]);

  const report = buildPostDispatchProductionSmokeReport({
    releaseProvenance: releaseProvenance.value,
    publicEntryReport: publicEntryReport.value,
    releaseRunUrl: options.releaseRunUrl,
    releaseTag: options.releaseTag,
    releaseVersion: options.releaseVersion,
    versionCode: options.versionCode,
    requireAutoReleaseLink: options.requireAutoReleaseLink,
    inputErrors: [releaseProvenance.error, publicEntryReport.error],
    generatedAt: options.generatedAt,
  });

  const outputPath = path.resolve(options.outputPath);
  const summaryPath = path.resolve(options.summaryPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(summaryPath, formatPostDispatchProductionSmokeMarkdown(report));
  return report;
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectRun()) {
  const report = await runCli();
  if (report.status === 'failed') {
    for (const check of report.checks.filter((check) => check.status === 'failed')) {
      console.error(`[post-dispatch-production-smoke] ${check.id}: ${check.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`[post-dispatch-production-smoke] status=${report.status}; checks=${report.checks.length}.`);
  }
}

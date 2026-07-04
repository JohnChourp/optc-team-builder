#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { extractCharacterIdsFromSeed } from './check-optc-release-needed.mjs';

export const RELEASE_PROVENANCE_SCHEMA_VERSION = 1;

const RELEASE_WORKFLOW = 'release-android.yml';
const DEFAULT_RELEASE_TRIGGER_REPORT = 'release-trigger-outcome.json';
const DEFAULT_GITHUB_RELEASE_REPORT = 'github-release.json';
const DEFAULT_MANIFEST_PATH = 'public/assets/data/optc-manifest.json';
const DEFAULT_SEED_PATH = 'public/assets/data/optc-seed.sql';
const DEFAULT_OUTPUT_PATH = 'release-provenance.json';
const DEFAULT_SUMMARY_PATH = 'release-provenance.md';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value).trim() || null;
}

function optionalBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function optionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
      case '--github-release':
        options.githubReleasePath = readValue();
        break;
      case '--manifest-path':
        options.manifestPath = readValue();
        break;
      case '--seed-path':
        options.seedPath = readValue();
        break;
      case '--apk-path':
        options.apkPath = readValue();
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
      case '--release-sha':
        options.releaseSha = readValue();
        break;
      case '--trigger-run-id':
        options.triggerRunId = readValue();
        break;
      case '--trigger-run-url':
        options.triggerRunUrl = readValue();
        break;
      case '--trigger-sha':
        options.triggerSha = readValue();
        break;
      case '--skip-git-ancestry':
        options.skipGitAncestry = true;
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
      error: {
        label,
        path: filePath,
        message: error instanceof Error ? error.message : String(error),
      },
      path: filePath,
    };
  }
}

async function readOptionalJsonFile(filePath, label) {
  if (!filePath || !existsSync(path.resolve(filePath))) {
    return {
      value: null,
      error: null,
      path: filePath,
    };
  }

  return readJsonFile(filePath, label);
}

async function readRequiredTextFile(filePath, label) {
  const resolved = path.resolve(filePath);

  try {
    return {
      value: await readFile(resolved, 'utf8'),
      error: null,
      path: filePath,
    };
  } catch (error) {
    return {
      value: '',
      error: {
        label,
        path: filePath,
        message: error instanceof Error ? error.message : String(error),
      },
      path: filePath,
    };
  }
}

function releaseVersionFromTag(tag) {
  const normalized = optionalString(tag);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^v(\d+\.\d+\.\d+)$/u);
  return match ? match[1] : null;
}

function extractReleaseNoteValue(body, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = String(body ?? '').match(new RegExp(`^- ${escapedLabel}: \`([^\`]+)\``, 'mu'));
  return match?.[1]?.trim() ?? null;
}

function normalizeGitHubRelease(value) {
  const release = isObject(value) ? value : {};
  const assets = Array.isArray(release.assets) ? release.assets.filter(isObject) : [];

  return {
    tagName: optionalString(release.tagName),
    name: optionalString(release.name),
    url: optionalString(release.url),
    targetCommitish: optionalString(release.targetCommitish),
    body: optionalString(release.body) ?? '',
    assets: assets.map((asset) => ({
      name: optionalString(asset.name),
      url: optionalString(asset.url),
      size: optionalNumber(asset.size),
      digest: optionalString(asset.digest),
      contentType: optionalString(asset.contentType),
      state: optionalString(asset.state),
    })),
  };
}

function normalizeReleaseTriggerReport(value) {
  if (!isObject(value)) {
    return null;
  }

  const comparison = isObject(value.comparison) ? value.comparison : {};
  const dispatch = isObject(value.dispatch) ? value.dispatch : {};
  const workflow = isObject(value.workflow) ? value.workflow : {};

  return {
    status: optionalString(value.status),
    reason: optionalString(value.reason),
    workflow: {
      runId: optionalString(workflow.runId),
      runUrl: optionalString(workflow.runUrl),
      sha: optionalString(workflow.sha),
      ref: optionalString(workflow.ref),
      repository: optionalString(workflow.repository),
    },
    comparison: {
      sourceRepository: optionalString(comparison.sourceRepository),
      localSourceVersion: optionalString(comparison.localSourceVersion),
      remoteSourceVersion: optionalString(comparison.remoteSourceVersion),
      localCharacterCount: optionalNumber(comparison.localCharacterCount),
      remoteCharacterCount: optionalNumber(comparison.remoteCharacterCount),
      newCharacterIds: normalizeIds(comparison.newCharacterIds),
      newCharacterCount: optionalNumber(comparison.newCharacterCount),
    },
    dispatch: {
      releaseWorkflow: optionalString(dispatch.releaseWorkflow),
      ref: optionalString(dispatch.ref),
      bump: optionalString(dispatch.bump),
      mode: optionalString(dispatch.mode),
      releaseNeeded: optionalBoolean(dispatch.releaseNeeded) ?? false,
      releaseDispatched: optionalBoolean(dispatch.releaseDispatched) ?? false,
      blocked: optionalBoolean(dispatch.blocked) ?? false,
      blockReason: optionalString(dispatch.blockReason),
    },
  };
}

function checkGitAncestry({ triggerSha, releaseSha, cwd = process.cwd() }) {
  if (!triggerSha || !releaseSha) {
    return {
      status: 'skipped',
      detail: 'trigger SHA or release SHA was not provided',
    };
  }

  const result = spawnSync('git', ['merge-base', '--is-ancestor', triggerSha, releaseSha], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0) {
    return {
      status: 'passed',
      detail: `${triggerSha} is an ancestor of ${releaseSha}`,
    };
  }

  if (result.status === 1) {
    return {
      status: 'failed',
      detail: `${triggerSha} is not an ancestor of ${releaseSha}`,
    };
  }

  return {
    status: 'failed',
    detail: (result.stderr || result.stdout || 'git merge-base failed').trim(),
  };
}

async function sha256File(filePath) {
  const data = await readFile(path.resolve(filePath));
  return createHash('sha256').update(data).digest('hex');
}

function createRecorder(checks) {
  return {
    pass(id, label, detail) {
      checks.push({ id, label, status: 'passed', detail });
    },
    warn(id, label, detail) {
      checks.push({ id, label, status: 'warning', detail });
    },
    fail(id, label, detail) {
      checks.push({ id, label, status: 'failed', detail });
    },
  };
}

function summarizeStatus(checks) {
  if (checks.some((check) => check.status === 'failed')) {
    return 'failed';
  }

  if (checks.some((check) => check.status === 'warning')) {
    return 'warning';
  }

  return 'passed';
}

export async function buildReleaseProvenanceReport({
  releaseTriggerReport = null,
  githubRelease,
  manifest,
  seedSql,
  apkPath = null,
  releaseTag = null,
  releaseVersion = null,
  versionCode = null,
  releaseSha = null,
  triggerRunId = null,
  triggerRunUrl = null,
  triggerSha = null,
  skipGitAncestry = false,
  generatedAt = new Date().toISOString(),
} = {}) {
  const checks = [];
  const record = createRecorder(checks);
  const normalizedRelease = normalizeGitHubRelease(githubRelease);
  const normalizedTrigger = normalizeReleaseTriggerReport(releaseTriggerReport);
  const explicitReleaseTag = optionalString(releaseTag);
  const expectedTag = explicitReleaseTag ?? normalizedRelease.tagName;
  const tagVersion = releaseVersionFromTag(expectedTag);
  const expectedVersion = optionalString(releaseVersion) ?? tagVersion;
  const releaseNotesVersion = extractReleaseNoteValue(normalizedRelease.body, 'Version');
  const releaseNotesCode = extractReleaseNoteValue(normalizedRelease.body, 'Version code');
  const expectedVersionCode = optionalString(versionCode) ?? releaseNotesCode;

  if (!expectedTag || !tagVersion) {
    record.fail('release-tag', 'Release tag', `Invalid or missing release tag: ${expectedTag ?? 'none'}`);
  } else {
    record.pass('release-tag', 'Release tag', `Release tag ${expectedTag} encodes version ${tagVersion}`);
  }

  if (!expectedVersion) {
    record.fail('release-version', 'Release version', 'Release version could not be derived from inputs or tag.');
  } else if (tagVersion && expectedVersion !== tagVersion) {
    record.fail('release-version', 'Release version', `Input version ${expectedVersion} does not match tag ${expectedTag}.`);
  } else if (releaseNotesVersion && releaseNotesVersion !== expectedVersion) {
    record.fail(
      'release-version',
      'Release version',
      `Release notes version ${releaseNotesVersion} does not match expected ${expectedVersion}.`,
    );
  } else {
    record.pass('release-version', 'Release version', `Version ${expectedVersion} matches tag and release notes.`);
  }

  if (!expectedVersionCode) {
    record.fail('version-code', 'Version code', 'Version code is missing from inputs and release notes.');
  } else if (releaseNotesCode && releaseNotesCode !== expectedVersionCode) {
    record.fail(
      'version-code',
      'Version code',
      `Release notes version code ${releaseNotesCode} does not match expected ${expectedVersionCode}.`,
    );
  } else {
    record.pass('version-code', 'Version code', `Version code ${expectedVersionCode} is present in release notes.`);
  }

  if (!normalizedRelease.tagName) {
    record.fail('github-release-tag', 'GitHub release tag', 'GitHub release JSON is missing tagName.');
  } else if (expectedTag && normalizedRelease.tagName !== expectedTag) {
    record.fail(
      'github-release-tag',
      'GitHub release tag',
      `GitHub release tag ${normalizedRelease.tagName} does not match ${expectedTag}.`,
    );
  } else {
    record.pass('github-release-tag', 'GitHub release tag', `GitHub release uses tag ${normalizedRelease.tagName}.`);
  }

  const expectedAssetName = expectedTag ? `optc-team-builder-${expectedTag}.apk` : null;
  const releaseAsset = expectedAssetName
    ? normalizedRelease.assets.find((asset) => asset.name === expectedAssetName)
    : null;

  if (!expectedAssetName) {
    record.fail('apk-asset-name', 'APK asset name', 'Expected APK asset name could not be derived.');
  } else if (!releaseAsset) {
    record.fail('apk-asset-name', 'APK asset name', `GitHub release is missing ${expectedAssetName}.`);
  } else {
    record.pass('apk-asset-name', 'APK asset name', `GitHub release includes ${expectedAssetName}.`);

    if (releaseAsset.url?.includes(`/releases/download/${expectedTag}/${expectedAssetName}`)) {
      record.pass('apk-asset-url', 'APK asset URL', `Asset URL links ${expectedTag}/${expectedAssetName}.`);
    } else {
      record.fail('apk-asset-url', 'APK asset URL', `Asset URL does not link ${expectedTag}/${expectedAssetName}.`);
    }

    if (!apkPath) {
      record.warn('apk-asset-digest', 'APK asset digest', 'Local APK path was not provided; digest comparison skipped.');
    } else if (!existsSync(path.resolve(apkPath))) {
      record.fail('apk-asset-digest', 'APK asset digest', `Local APK path does not exist: ${apkPath}.`);
    } else {
      const apkSha = await sha256File(apkPath);
      const expectedDigest = `sha256:${apkSha}`;
      if (releaseAsset.digest === expectedDigest) {
        record.pass('apk-asset-digest', 'APK asset digest', `Asset digest matches local APK sha256 ${apkSha}.`);
      } else {
        record.fail(
          'apk-asset-digest',
          'APK asset digest',
          `Asset digest ${releaseAsset.digest ?? 'missing'} does not match ${expectedDigest}.`,
        );
      }
    }
  }

  const manifestVersion = optionalString(manifest?.sourceVersion);
  const seedIds = (() => {
    try {
      return extractCharacterIdsFromSeed(seedSql);
    } catch (error) {
      record.fail('released-seed', 'Released dataset seed', error instanceof Error ? error.message : String(error));
      return [];
    }
  })();

  if (!normalizedTrigger) {
    if (triggerRunId || triggerRunUrl || triggerSha) {
      record.fail('detector-link', 'Detector link', 'Trigger metadata was provided but no release-trigger report was readable.');
    } else {
      record.warn(
        'detector-link',
        'Detector link',
        'No release-trigger report or trigger metadata was provided; treating this as a manual release provenance check.',
      );
    }
  } else {
    if (normalizedTrigger.status === 'released' && normalizedTrigger.reason === 'release-dispatched') {
      record.pass('detector-verdict', 'Detector verdict', 'Release trigger reported a dispatched release.');
    } else {
      record.fail(
        'detector-verdict',
        'Detector verdict',
        `Expected released/release-dispatched, got ${normalizedTrigger.status ?? 'missing'}/${normalizedTrigger.reason ?? 'missing'}.`,
      );
    }

    if (normalizedTrigger.dispatch.releaseNeeded && normalizedTrigger.dispatch.releaseDispatched) {
      record.pass('detector-dispatch', 'Detector dispatch', 'Detector marked release needed and dispatch succeeded.');
    } else {
      record.fail(
        'detector-dispatch',
        'Detector dispatch',
        `releaseNeeded=${normalizedTrigger.dispatch.releaseNeeded}, releaseDispatched=${normalizedTrigger.dispatch.releaseDispatched}.`,
      );
    }

    if (normalizedTrigger.dispatch.releaseWorkflow === RELEASE_WORKFLOW) {
      record.pass('detector-workflow', 'Detector workflow', `Detector dispatched ${RELEASE_WORKFLOW}.`);
    } else {
      record.fail(
        'detector-workflow',
        'Detector workflow',
        `Detector dispatched ${normalizedTrigger.dispatch.releaseWorkflow ?? 'missing'} instead of ${RELEASE_WORKFLOW}.`,
      );
    }

    if (normalizedTrigger.comparison.newCharacterIds.length > 0) {
      const releasedSeedIdSet = new Set(seedIds);
      const missingIds = normalizedTrigger.comparison.newCharacterIds.filter((id) => !releasedSeedIdSet.has(id));
      if (missingIds.length === 0) {
        record.pass(
          'released-new-ids',
          'Released new upstream IDs',
          `${normalizedTrigger.comparison.newCharacterIds.length} detector new ID(s) are present in released seed.`,
        );
      } else {
        record.fail(
          'released-new-ids',
          'Released new upstream IDs',
          `Released seed is missing detector new ID(s): ${missingIds.join(', ')}.`,
        );
      }
    } else {
      record.fail('released-new-ids', 'Released new upstream IDs', 'Detector report does not list new upstream IDs.');
    }

    if (!normalizedTrigger.comparison.remoteSourceVersion) {
      record.fail('released-source-version', 'Released source version', 'Detector remote source version is missing.');
    } else if (manifestVersion !== normalizedTrigger.comparison.remoteSourceVersion) {
      record.fail(
        'released-source-version',
        'Released source version',
        `Released manifest sourceVersion ${manifestVersion ?? 'missing'} does not match detector remote ${normalizedTrigger.comparison.remoteSourceVersion}.`,
      );
    } else {
      record.pass(
        'released-source-version',
        'Released source version',
        `Released manifest sourceVersion ${manifestVersion} matches detector remote source version.`,
      );
    }

    if (triggerRunId && normalizedTrigger.workflow.runId && triggerRunId !== normalizedTrigger.workflow.runId) {
      record.fail(
        'trigger-run-id',
        'Trigger run ID',
        `Input trigger run ${triggerRunId} does not match report run ${normalizedTrigger.workflow.runId}.`,
      );
    } else if (triggerRunId || normalizedTrigger.workflow.runId) {
      record.pass('trigger-run-id', 'Trigger run ID', `Trigger run ${triggerRunId ?? normalizedTrigger.workflow.runId}.`);
    }

    if (triggerRunUrl && normalizedTrigger.workflow.runUrl && triggerRunUrl !== normalizedTrigger.workflow.runUrl) {
      record.fail(
        'trigger-run-url',
        'Trigger run URL',
        `Input trigger URL ${triggerRunUrl} does not match report URL ${normalizedTrigger.workflow.runUrl}.`,
      );
    } else if (triggerRunUrl || normalizedTrigger.workflow.runUrl) {
      record.pass(
        'trigger-run-url',
        'Trigger run URL',
        `Trigger URL ${triggerRunUrl ?? normalizedTrigger.workflow.runUrl}.`,
      );
    }

    const reportTriggerSha = normalizedTrigger.workflow.sha;
    const effectiveTriggerSha = triggerSha ?? reportTriggerSha;
    if (triggerSha && reportTriggerSha && triggerSha !== reportTriggerSha) {
      record.fail('trigger-sha', 'Trigger SHA', `Input trigger SHA ${triggerSha} does not match report SHA ${reportTriggerSha}.`);
    } else if (effectiveTriggerSha) {
      record.pass('trigger-sha', 'Trigger SHA', `Trigger SHA ${effectiveTriggerSha}.`);
    }

    if (skipGitAncestry) {
      record.warn('release-ancestry', 'Release ancestry', 'Git ancestry check skipped by CLI option.');
    } else {
      const ancestry = checkGitAncestry({ triggerSha: effectiveTriggerSha, releaseSha });
      if (ancestry.status === 'passed') {
        record.pass('release-ancestry', 'Release ancestry', ancestry.detail);
      } else if (ancestry.status === 'skipped') {
        record.warn('release-ancestry', 'Release ancestry', ancestry.detail);
      } else {
        record.fail('release-ancestry', 'Release ancestry', ancestry.detail);
      }
    }
  }

  const status = summarizeStatus(checks);

  return {
    schemaVersion: RELEASE_PROVENANCE_SCHEMA_VERSION,
    generatedAt,
    status,
    release: {
      tag: expectedTag,
      version: expectedVersion,
      versionCode: expectedVersionCode,
      sha: optionalString(releaseSha),
      url: normalizedRelease.url,
      apkAssetName: expectedAssetName,
    },
    trigger: normalizedTrigger
      ? {
          runId: triggerRunId ?? normalizedTrigger.workflow.runId,
          runUrl: triggerRunUrl ?? normalizedTrigger.workflow.runUrl,
          sha: triggerSha ?? normalizedTrigger.workflow.sha,
          status: normalizedTrigger.status,
          reason: normalizedTrigger.reason,
          newCharacterCount:
            normalizedTrigger.comparison.newCharacterCount ?? normalizedTrigger.comparison.newCharacterIds.length,
        }
      : null,
    dataset: {
      sourceVersion: manifestVersion,
      characterCount: optionalNumber(manifest?.characterCount) ?? seedIds.length,
      checkedNewCharacterIds: normalizedTrigger?.comparison.newCharacterIds ?? [],
    },
    checks,
  };
}

function formatNullable(value) {
  return value === null || value === undefined || value === '' ? 'n/a' : String(value);
}

function formatCheckStatus(status) {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'warning':
      return 'warning';
    case 'failed':
      return 'failed';
    default:
      return formatNullable(status);
  }
}

function tableCell(value) {
  return formatNullable(value).replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|').replace(/\r?\n/gu, '<br>');
}

export function formatReleaseProvenanceMarkdown(report) {
  const lines = [
    '# Release Provenance Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Decision',
    '',
    `- Status: ${report.status}`,
    '',
    '## Release',
    '',
    `- Tag: ${formatNullable(report.release.tag)}`,
    `- Version: ${formatNullable(report.release.version)}`,
    `- Version code: ${formatNullable(report.release.versionCode)}`,
    `- SHA: ${formatNullable(report.release.sha)}`,
    `- GitHub Release: ${formatNullable(report.release.url)}`,
    `- APK asset: ${formatNullable(report.release.apkAssetName)}`,
    '',
    '## Trigger',
    '',
  ];

  if (report.trigger) {
    lines.push(
      `- Run ID: ${formatNullable(report.trigger.runId)}`,
      `- Run URL: ${formatNullable(report.trigger.runUrl)}`,
      `- SHA: ${formatNullable(report.trigger.sha)}`,
      `- Status: ${formatNullable(report.trigger.status)}`,
      `- Reason: ${formatNullable(report.trigger.reason)}`,
      `- New character count: ${formatNullable(report.trigger.newCharacterCount)}`,
    );
  } else {
    lines.push('- No release-trigger report was provided.');
  }

  lines.push(
    '',
    '## Dataset',
    '',
    `- Source version: ${formatNullable(report.dataset.sourceVersion)}`,
    `- Character count: ${formatNullable(report.dataset.characterCount)}`,
    `- Checked new IDs: ${
      report.dataset.checkedNewCharacterIds.length > 0 ? report.dataset.checkedNewCharacterIds.join(', ') : 'none'
    }`,
    '',
    '## Checks',
    '',
    '| Check | Status | Detail |',
    '| --- | --- | --- |',
  );

  for (const check of report.checks) {
    lines.push(`| ${tableCell(check.label)} | ${tableCell(formatCheckStatus(check.status))} | ${tableCell(check.detail)} |`);
  }

  return `${lines.join('\n')}\n`;
}

export async function loadReleaseProvenanceSource(options = {}) {
  const releaseTriggerReportPath =
    options.releaseTriggerReportPath === 'none' ? null : (options.releaseTriggerReportPath ?? DEFAULT_RELEASE_TRIGGER_REPORT);
  const githubReleasePath = options.githubReleasePath ?? DEFAULT_GITHUB_RELEASE_REPORT;
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const seedPath = options.seedPath ?? DEFAULT_SEED_PATH;
  const [triggerRead, githubReleaseRead, manifestRead, seedRead] = await Promise.all([
    readOptionalJsonFile(releaseTriggerReportPath, 'release-trigger-report'),
    readJsonFile(githubReleasePath, 'github-release'),
    readJsonFile(manifestPath, 'manifest'),
    readRequiredTextFile(seedPath, 'seed'),
  ]);
  const inputErrors = [triggerRead.error, githubReleaseRead.error, manifestRead.error, seedRead.error].filter(Boolean);

  return {
    inputErrors,
    releaseTriggerReport: triggerRead.value,
    githubRelease: githubReleaseRead.value,
    manifest: manifestRead.value,
    seedSql: seedRead.value,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const outputPath = path.resolve(options.outputPath ?? DEFAULT_OUTPUT_PATH);
  const summaryPath = path.resolve(options.summaryPath ?? DEFAULT_SUMMARY_PATH);
  const source = await loadReleaseProvenanceSource(options);
  const baseReport =
    source.inputErrors.length > 0
      ? {
          schemaVersion: RELEASE_PROVENANCE_SCHEMA_VERSION,
          generatedAt: options.generatedAt ?? new Date().toISOString(),
          status: 'failed',
          release: {
            tag: optionalString(options.releaseTag),
            version: optionalString(options.releaseVersion),
            versionCode: optionalString(options.versionCode),
            sha: optionalString(options.releaseSha),
            url: null,
            apkAssetName: null,
          },
          trigger: null,
          dataset: {
            sourceVersion: null,
            characterCount: null,
            checkedNewCharacterIds: [],
          },
          checks: source.inputErrors.map((error) => ({
            id: `input-${error.label}`,
            label: `Input: ${error.label}`,
            status: 'failed',
            detail: `${error.path}: ${error.message}`,
          })),
        }
      : await buildReleaseProvenanceReport({
          releaseTriggerReport: source.releaseTriggerReport,
          githubRelease: source.githubRelease,
          manifest: source.manifest,
          seedSql: source.seedSql,
          apkPath: options.apkPath,
          releaseTag: options.releaseTag,
          releaseVersion: options.releaseVersion,
          versionCode: options.versionCode,
          releaseSha: options.releaseSha,
          triggerRunId: options.triggerRunId,
          triggerRunUrl: options.triggerRunUrl,
          triggerSha: options.triggerSha,
          skipGitAncestry: options.skipGitAncestry,
          generatedAt: options.generatedAt,
        });
  const summary = formatReleaseProvenanceMarkdown(baseReport);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(baseReport, null, 2)}\n`);
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, summary);

  return baseReport;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const report = await runCli();
    if (report.status === 'failed') {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

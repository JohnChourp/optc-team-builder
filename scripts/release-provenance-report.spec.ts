import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  RELEASE_PROVENANCE_SCHEMA_VERSION,
  buildReleaseProvenanceReport,
  formatReleaseProvenanceMarkdown,
  loadReleaseProvenanceSource,
  runCli,
} from './release-provenance-report.mjs';

const execFileAsync = promisify(execFile);
const fixtureDir = path.join(import.meta.dirname, 'fixtures', 'release-provenance');
const generatedAt = '2026-07-04T00:10:00.000Z';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-release-provenance-'));
  tempDirs.push(dir);
  return dir;
}

async function buildFixtureReport(overrides: Record<string, unknown> = {}) {
  const source = await loadReleaseProvenanceSource({
    releaseTriggerReportPath: path.join(fixtureDir, 'release-trigger-released.json'),
    githubReleasePath: path.join(fixtureDir, 'github-release-v1.2.3.json'),
    manifestPath: path.join(fixtureDir, 'optc-manifest.json'),
    seedPath: path.join(fixtureDir, 'optc-seed.sql'),
  });

  expect(source.inputErrors).toEqual([]);

  return buildReleaseProvenanceReport({
    releaseTriggerReport: source.releaseTriggerReport,
    githubRelease: source.githubRelease,
    manifest: source.manifest,
    seedSql: source.seedSql,
    apkPath: path.join(fixtureDir, 'optc-team-builder-v1.2.3.apk'),
    releaseTag: 'v1.2.3',
    releaseVersion: '1.2.3',
    versionCode: '123',
    releaseSha: '2222222222222222222222222222222222222222',
    triggerRunId: '200',
    triggerRunUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/200',
    triggerSha: '1111111111111111111111111111111111111111',
    skipGitAncestry: true,
    generatedAt,
    ...overrides,
  });
}

describe('release-provenance-report', () => {
  it('builds a passed report for aligned detector, release, artifact, and dataset evidence', async () => {
    const report = await buildFixtureReport();

    expect(report).toMatchObject({
      schemaVersion: RELEASE_PROVENANCE_SCHEMA_VERSION,
      generatedAt,
      status: 'warning',
      release: {
        tag: 'v1.2.3',
        version: '1.2.3',
        versionCode: '123',
        apkAssetName: 'optc-team-builder-v1.2.3.apk',
      },
      trigger: {
        runId: '200',
        status: 'released',
        reason: 'release-dispatched',
        newCharacterCount: 2,
      },
      dataset: {
        sourceVersion: '37',
        characterCount: 5,
        checkedNewCharacterIds: [1001, 1002],
      },
    });
    expect(report.checks.find((check) => check.id === 'released-new-ids')).toMatchObject({ status: 'passed' });
    expect(report.checks.find((check) => check.id === 'apk-asset-digest')).toMatchObject({ status: 'passed' });
    expect(report.checks.find((check) => check.id === 'release-ancestry')).toMatchObject({ status: 'warning' });
  });

  it('allows manual releases without detector metadata while keeping the skip visible', async () => {
    const source = await loadReleaseProvenanceSource({
      releaseTriggerReportPath: 'none',
      githubReleasePath: path.join(fixtureDir, 'github-release-v1.2.3.json'),
      manifestPath: path.join(fixtureDir, 'optc-manifest.json'),
      seedPath: path.join(fixtureDir, 'optc-seed.sql'),
    });
    const report = await buildReleaseProvenanceReport({
      releaseTriggerReport: source.releaseTriggerReport,
      githubRelease: source.githubRelease,
      manifest: source.manifest,
      seedSql: source.seedSql,
      apkPath: path.join(fixtureDir, 'optc-team-builder-v1.2.3.apk'),
      releaseTag: 'v1.2.3',
      releaseSha: '2222222222222222222222222222222222222222',
      generatedAt,
    });

    expect(report.status).toBe('warning');
    expect(report.trigger).toBeNull();
    expect(report.checks.find((check) => check.id === 'detector-link')).toMatchObject({ status: 'warning' });
    expect(formatReleaseProvenanceMarkdown(report)).toContain('No release-trigger report was provided.');
  });

  it('fails clearly on release artifact and dataset provenance mismatches', async () => {
    const source = await loadReleaseProvenanceSource({
      releaseTriggerReportPath: path.join(fixtureDir, 'release-trigger-released.json'),
      githubReleasePath: path.join(fixtureDir, 'github-release-bad-asset.json'),
      manifestPath: path.join(fixtureDir, 'optc-manifest-stale.json'),
      seedPath: path.join(fixtureDir, 'optc-seed.sql'),
    });
    const report = await buildReleaseProvenanceReport({
      releaseTriggerReport: source.releaseTriggerReport,
      githubRelease: source.githubRelease,
      manifest: source.manifest,
      seedSql: source.seedSql,
      apkPath: path.join(fixtureDir, 'optc-team-builder-v1.2.3.apk'),
      releaseTag: 'v1.2.3',
      releaseSha: '2222222222222222222222222222222222222222',
      triggerSha: '1111111111111111111111111111111111111111',
      skipGitAncestry: true,
      generatedAt,
    });

    expect(report.status).toBe('failed');
    expect(report.checks.find((check) => check.id === 'apk-asset-name')).toMatchObject({ status: 'failed' });
    expect(report.checks.find((check) => check.id === 'released-source-version')).toMatchObject({ status: 'failed' });
  });

  it('fails when an expected local APK path is missing', async () => {
    const report = await buildFixtureReport({
      apkPath: path.join(fixtureDir, 'missing.apk'),
    });

    expect(report.status).toBe('failed');
    expect(report.checks.find((check) => check.id === 'apk-asset-digest')).toMatchObject({ status: 'failed' });
  });

  it('writes Markdown and JSON outputs from the CLI', async () => {
    const outputDir = await makeTempDir();
    const jsonPath = path.join(outputDir, 'release-provenance.json');
    const summaryPath = path.join(outputDir, 'release-provenance.md');
    const report = await runCli([
      '--release-trigger-report',
      path.join(fixtureDir, 'release-trigger-released.json'),
      '--github-release',
      path.join(fixtureDir, 'github-release-v1.2.3.json'),
      '--manifest-path',
      path.join(fixtureDir, 'optc-manifest.json'),
      '--seed-path',
      path.join(fixtureDir, 'optc-seed.sql'),
      '--apk-path',
      path.join(fixtureDir, 'optc-team-builder-v1.2.3.apk'),
      '--release-tag',
      'v1.2.3',
      '--release-version',
      '1.2.3',
      '--version-code',
      '123',
      '--release-sha',
      '2222222222222222222222222222222222222222',
      '--trigger-run-id',
      '200',
      '--trigger-run-url',
      'https://github.com/JohnChourp/optc-team-builder/actions/runs/200',
      '--trigger-sha',
      '1111111111111111111111111111111111111111',
      '--skip-git-ancestry',
      '--generated-at',
      generatedAt,
      '--output',
      jsonPath,
      '--summary',
      summaryPath,
    ]);

    expect(report.status).toBe('warning');
    await expect(readFile(jsonPath, 'utf8')).resolves.toContain('"apkAssetName": "optc-team-builder-v1.2.3.apk"');
    await expect(readFile(summaryPath, 'utf8')).resolves.toContain('# Release Provenance Report');
  });

  it('sets a non-zero exit code for failed direct CLI checks', async () => {
    const outputDir = await makeTempDir();
    const modulePath = path.join(import.meta.dirname, 'release-provenance-report.mjs');

    await expect(
      execFileAsync(process.execPath, [
        modulePath,
        '--release-trigger-report',
        path.join(fixtureDir, 'release-trigger-released.json'),
        '--github-release',
        path.join(fixtureDir, 'github-release-bad-asset.json'),
        '--manifest-path',
        path.join(fixtureDir, 'optc-manifest-stale.json'),
        '--seed-path',
        path.join(fixtureDir, 'optc-seed.sql'),
        '--release-tag',
        'v1.2.3',
        '--output',
        path.join(outputDir, 'release-provenance.json'),
        '--summary',
        path.join(outputDir, 'release-provenance.md'),
      ]),
    ).rejects.toMatchObject({ code: 1 });
  });

  it('can be imported without executing CLI generation', async () => {
    const moduleUrl = pathToFileURL(path.join(import.meta.dirname, 'release-provenance-report.mjs')).href;
    const { stdout } = await execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const mod = await import(${JSON.stringify(moduleUrl)}); console.log(mod.RELEASE_PROVENANCE_SCHEMA_VERSION);`,
    ]);

    expect(stdout.trim()).toBe('1');
  });
});

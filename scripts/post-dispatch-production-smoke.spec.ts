import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  POST_DISPATCH_PRODUCTION_SMOKE_SCHEMA_VERSION,
  buildPostDispatchProductionSmokeReport,
  formatPostDispatchProductionSmokeMarkdown,
  runCli,
} from './post-dispatch-production-smoke.mjs';

const generatedAt = '2026-07-06T08:00:00.000Z';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'post-dispatch-smoke-'));
  tempDirs.push(dir);
  return dir;
}

function makeReleaseProvenance(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    status: 'warning',
    release: {
      tag: 'v1.2.3',
      version: '1.2.3',
      versionCode: '123',
    },
    trigger: {
      runId: '200',
      runUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/200',
      status: 'released',
    },
    checks: [],
    ...overrides,
  };
}

function makePublicEntryReport(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt,
    baseUrl: 'https://optcteambuilder.com',
    status: 'ok',
    checkedEntries: [
      {
        id: 'guided-compare-sharing-guide',
        url: 'https://optcteambuilder.com/guides/guided-build-compare-team-sharing/',
        status: 'ok',
        failures: [],
        evidence: {
          screenshot: 'screenshots/guide-route.png',
        },
      },
      {
        id: 'manual-share-link-landing',
        url: 'https://optcteambuilder.com/tabs/manual-team-builder?teamShare=<redacted-synthetic>',
        status: 'ok',
        failures: [],
        evidence: {
          screenshot: 'screenshots/share-link-landing.png',
        },
      },
    ],
    ...overrides,
  };
}

describe('post-dispatch-production-smoke', () => {
  it('builds a warning report for aligned release evidence with non-fatal provenance warnings', () => {
    const report = buildPostDispatchProductionSmokeReport({
      releaseProvenance: makeReleaseProvenance(),
      publicEntryReport: makePublicEntryReport(),
      releaseRunUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/300',
      releaseTag: 'v1.2.3',
      releaseVersion: '1.2.3',
      versionCode: '123',
      requireAutoReleaseLink: true,
      generatedAt,
    });

    expect(report).toMatchObject({
      schemaVersion: POST_DISPATCH_PRODUCTION_SMOKE_SCHEMA_VERSION,
      generatedAt,
      status: 'warning',
      release: {
        tag: 'v1.2.3',
        version: '1.2.3',
        versionCode: '123',
        detectorRunUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/200',
      },
      production: {
        publicEntryStatus: 'passed',
      },
    });
    expect(report.checks.find((check) => check.id === 'release-provenance')).toMatchObject({ status: 'warning' });
    expect(report.checks.find((check) => check.id === 'production-public-entry')).toMatchObject({ status: 'passed' });
  });

  it('fails when production public-entry synthetics fail', () => {
    const report = buildPostDispatchProductionSmokeReport({
      releaseProvenance: makeReleaseProvenance({ status: 'passed' }),
      publicEntryReport: makePublicEntryReport({
        status: 'failed',
        checkedEntries: [
          {
            id: 'manual-share-link-landing',
            url: 'https://optcteambuilder.com/tabs/manual-team-builder?teamShare=<redacted-synthetic>',
            status: 'failed',
            failures: [{ category: 'rendering', message: 'Manual Team Builder did not render the synthetic team name.' }],
            evidence: {},
          },
        ],
      }),
      releaseRunUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/300',
      releaseTag: 'v1.2.3',
      releaseVersion: '1.2.3',
      versionCode: '123',
      generatedAt,
    });

    expect(report.status).toBe('failed');
    expect(report.checks.find((check) => check.id === 'production-public-entry')).toMatchObject({ status: 'failed' });
    expect(formatPostDispatchProductionSmokeMarkdown(report)).toContain('Manual Team Builder did not render');
  });

  it('fails release metadata mismatches', () => {
    const report = buildPostDispatchProductionSmokeReport({
      releaseProvenance: makeReleaseProvenance({ status: 'passed' }),
      publicEntryReport: makePublicEntryReport(),
      releaseRunUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/300',
      releaseTag: 'v1.2.4',
      releaseVersion: '1.2.4',
      versionCode: '124',
      generatedAt,
    });

    expect(report.status).toBe('failed');
    expect(report.checks.find((check) => check.id === 'release-metadata')).toMatchObject({ status: 'failed' });
  });

  it('fails missing auto-release linkage only when the workflow requires it', () => {
    const manualReport = buildPostDispatchProductionSmokeReport({
      releaseProvenance: makeReleaseProvenance({ status: 'passed', trigger: null }),
      publicEntryReport: makePublicEntryReport(),
      releaseRunUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/300',
      releaseTag: 'v1.2.3',
      releaseVersion: '1.2.3',
      versionCode: '123',
      generatedAt,
    });
    const autoReport = buildPostDispatchProductionSmokeReport({
      releaseProvenance: makeReleaseProvenance({ status: 'passed', trigger: null }),
      publicEntryReport: makePublicEntryReport(),
      releaseRunUrl: 'https://github.com/JohnChourp/optc-team-builder/actions/runs/300',
      releaseTag: 'v1.2.3',
      releaseVersion: '1.2.3',
      versionCode: '123',
      requireAutoReleaseLink: true,
      generatedAt,
    });

    expect(manualReport.status).toBe('warning');
    expect(autoReport.status).toBe('failed');
  });

  it('writes JSON and Markdown output from the CLI', async () => {
    const tempDir = await makeTempDir();
    const provenancePath = path.join(tempDir, 'release-provenance.json');
    const publicEntryPath = path.join(tempDir, 'public-entry-synthetics-report.json');
    const outputPath = path.join(tempDir, 'post-dispatch-production-smoke.json');
    const summaryPath = path.join(tempDir, 'post-dispatch-production-smoke.md');

    await writeFile(provenancePath, `${JSON.stringify(makeReleaseProvenance({ status: 'passed' }), null, 2)}\n`);
    await writeFile(publicEntryPath, `${JSON.stringify(makePublicEntryReport(), null, 2)}\n`);

    const report = await runCli([
      '--release-provenance',
      provenancePath,
      '--public-entry-report',
      publicEntryPath,
      '--release-run-url',
      'https://github.com/JohnChourp/optc-team-builder/actions/runs/300',
      '--release-tag',
      'v1.2.3',
      '--release-version',
      '1.2.3',
      '--version-code',
      '123',
      '--generated-at',
      generatedAt,
      '--output',
      outputPath,
      '--summary',
      summaryPath,
    ]);

    expect(report.status).toBe('passed');
    await expect(readFile(outputPath, 'utf8')).resolves.toContain('"tag": "v1.2.3"');
    await expect(readFile(summaryPath, 'utf8')).resolves.toContain('# Post-Dispatch Production Smoke');
  });
});

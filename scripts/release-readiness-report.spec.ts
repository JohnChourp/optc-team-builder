import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReleaseReadinessReport,
  formatReleaseReadinessMarkdown,
  loadReleaseReadinessSource,
  runCli,
} from './release-readiness-report.mjs';

const fixtureDir = path.join(import.meta.dirname, 'fixtures', 'release-readiness');
const generatedAt = '2026-06-28T00:00:00.000Z';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-readiness-'));
  tempDirs.push(dir);
  return dir;
}

async function buildFixtureReport(name: string) {
  const source = await loadReleaseReadinessSource(path.join(fixtureDir, name));
  return buildReleaseReadinessReport(source, { generatedAt });
}

describe('release-readiness-report', () => {
  it('renders the ready fixture to the expected markdown contract', async () => {
    const report = await buildFixtureReport('ready-source.json');
    const expected = await readFile(path.join(fixtureDir, 'expected-ready-summary.md'), 'utf8');

    expect(report.decision.status).toBe('ready');
    expect(formatReleaseReadinessMarkdown(report)).toBe(expected);
  });

  it('marks performance warnings or waivers as ready-with-waivers', async () => {
    const report = await buildFixtureReport('warning-source.json');

    expect(report.decision.status).toBe('ready-with-waivers');
    expect(report.decision.reasons).toContain('Performance budget report has baseline warnings');
    expect(report.decision.reasons).toContain('Waiver: Baseline timing warning accepted for release candidate');
  });

  it('blocks release when blockers, failed tests, failed perf, or failed release trigger evidence exist', async () => {
    const report = await buildFixtureReport('blocked-source.json');

    expect(report.decision.status).toBe('blocked');
    expect(report.decision.reasons).toEqual([
      'Blocker: Remote Chromium e2e failure',
      'Test failed: GitHub Test workflow',
      'Performance budget report failed',
      'Release trigger failed: detector-failed',
    ]);
  });

  it('writes markdown and json output from the CLI', async () => {
    const outputDir = await makeTempDir();
    const markdownPath = path.join(outputDir, 'release-readiness-summary.md');
    const jsonPath = path.join(outputDir, 'release-readiness-summary.json');
    const report = await runCli([
      '--source',
      path.join(fixtureDir, 'ready-source.json'),
      '--generated-at',
      generatedAt,
      '--output',
      markdownPath,
      '--json-output',
      jsonPath,
    ]);

    await expect(readFile(markdownPath, 'utf8')).resolves.toContain('# Release Readiness Summary');
    await expect(readFile(jsonPath, 'utf8')).resolves.toContain('"status": "ready"');
    expect(report.decision.status).toBe('ready');
  });

  it('rejects malformed source status values before rendering', () => {
    expect(() =>
      buildReleaseReadinessReport({
        candidate: { label: 'candidate' },
        tests: [{ name: 'Unexpected state', status: 'unknown' }],
        performance: {
          status: 'passed',
          sourcePath: 'performance-budget-passed.json',
          summary: {},
          hardBudgetFailures: [],
          baselineDeltaWarnings: [],
        },
        releaseTrigger: null,
        audits: [],
        docs: [],
        blockers: [],
        waivers: [],
      }),
    ).toThrow('tests[0].status must be one of passed, warning, failed, blocked');
  });
});

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReleaseReadinessReport,
  formatReleaseReadinessMarkdown,
  loadReleaseReadinessSource,
  runCli,
} from './release-readiness-report.mjs';

const fixtureDir = path.join(import.meta.dirname, 'fixtures', 'release-readiness');
const generatedAt = '2026-06-28T00:00:00.000Z';
const execFileAsync = promisify(execFile);

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

function markdownRelativePath(fromDir: string, targetPath: string) {
  return path.relative(fromDir, targetPath).split(path.sep).join(path.posix.sep);
}

describe('release-readiness-report', () => {
  it('renders the ready fixture to the expected markdown contract', async () => {
    const report = await buildFixtureReport('ready-source.json');
    const expected = (await readFile(path.join(fixtureDir, 'expected-ready-summary.md'), 'utf8')).replace(/\r\n/g, '\n');

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

  it('blocks active-release skips that found releasable data but did not dispatch', async () => {
    const report = await buildFixtureReport('active-release-source.json');

    expect(report.decision.status).toBe('blocked');
    expect(report.decision.reasons).toContain('Release trigger blocked dispatch: active-release-running');
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

    const markdown = await readFile(markdownPath, 'utf8');
    const rebasedPerformancePath = markdownRelativePath(outputDir, path.join(fixtureDir, 'performance-budget-passed.json'));
    const rebasedAuditPath = markdownRelativePath(
      outputDir,
      path.resolve(fixtureDir, '../../../../optc-team-builder-brain/audits/869dwc0hh-performance-budget-tracking.md'),
    );

    expect(markdown).toContain('# Release Readiness Summary');
    expect(markdown).toContain(`- Source: ${rebasedPerformancePath}`);
    expect(markdown).toContain(`[Performance budget tracking audit](${rebasedAuditPath})`);
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

  it('rejects empty test evidence before marking a candidate ready', () => {
    expect(() =>
      buildReleaseReadinessReport({
        candidate: { label: 'candidate' },
        tests: [],
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
    ).toThrow('tests must include at least one entry');
  });

  it('rejects unknown release-trigger statuses before deciding readiness', () => {
    expect(() =>
      buildReleaseReadinessReport({
        candidate: { label: 'candidate' },
        tests: [{ name: 'CI', status: 'passed' }],
        performance: {
          status: 'passed',
          sourcePath: 'performance-budget-passed.json',
          summary: {},
          hardBudgetFailures: [],
          baselineDeltaWarnings: [],
        },
        releaseTrigger: {
          status: 'failure',
          sourcePath: 'release-trigger-outcome.json',
          dispatch: {
            releaseNeeded: true,
            releaseDispatched: false,
          },
        },
        audits: [],
        docs: [],
        blockers: [],
        waivers: [],
      }),
    ).toThrow('releaseTriggerReport.status must be one of skipped, released, failed');
  });

  it('can be imported from an inline ESM script without executing CLI detection', async () => {
    const moduleUrl = pathToFileURL(path.join(import.meta.dirname, 'release-readiness-report.mjs')).href;
    const { stdout } = await execFileAsync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const mod = await import(${JSON.stringify(moduleUrl)}); console.log(mod.RELEASE_READINESS_SCHEMA_VERSION);`,
    ]);

    expect(stdout.trim()).toBe('1');
  });

  it('does not set process exitCode when imported runCli returns a blocked report', async () => {
    const outputDir = await makeTempDir();
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;

    try {
      const report = await runCli([
        '--source',
        path.join(fixtureDir, 'blocked-source.json'),
        '--output',
        path.join(outputDir, 'blocked-summary.md'),
      ]);

      expect(report.decision.status).toBe('blocked');
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('sets a non-zero exit code for blocked reports in direct CLI execution', async () => {
    const outputDir = await makeTempDir();
    const modulePath = path.join(import.meta.dirname, 'release-readiness-report.mjs');

    await expect(
      execFileAsync(process.execPath, [
        modulePath,
        '--source',
        path.join(fixtureDir, 'blocked-source.json'),
        '--output',
        path.join(outputDir, 'blocked-summary.md'),
      ]),
    ).rejects.toMatchObject({ code: 1 });
  });
});

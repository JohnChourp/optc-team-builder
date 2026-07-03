import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RELEASE_BACKTEST_CORPUS_PATH,
  expandCharacterIdFixture,
  parseReleaseBacktestArgs,
  readReleaseBacktestCorpus,
  runReleaseDetectorBacktest,
} from './backtest-optc-release-detector.mjs';

describe('backtest-optc-release-detector', () => {
  it('defaults to the bundled historical corpus and human output', () => {
    expect(parseReleaseBacktestArgs([])).toEqual({
      corpusPath: DEFAULT_RELEASE_BACKTEST_CORPUS_PATH,
      json: false,
    });
    expect(parseReleaseBacktestArgs(['--json', '--case=current-v063-vs-2026-07-03-jul-rumble'])).toMatchObject({
      caseId: 'current-v063-vs-2026-07-03-jul-rumble',
      json: true,
    });
  });

  it('rejects unknown options and empty case ids', () => {
    expect(() => parseReleaseBacktestArgs(['--unknown'])).toThrow('Unknown option: --unknown');
    expect(() => parseReleaseBacktestArgs(['--case='])).toThrow('--case requires a non-empty case id.');
  });

  it('expands compact character ID ranges deterministically', () => {
    expect(expandCharacterIdFixture({ ranges: [[1, 3], 7, [5, 6], 3] })).toEqual([1, 2, 3, 5, 6, 7]);
    expect(() => expandCharacterIdFixture({ ranges: [[5, 4]] })).toThrow('Invalid character ID range');
  });

  it('runs the bundled historical backtest corpus cleanly', async () => {
    const corpus = await readReleaseBacktestCorpus();
    const report = runReleaseDetectorBacktest(corpus);

    expect(report.summary).toEqual({
      total: 4,
      passed: 4,
      failed: 0,
      detectorBugCount: 0,
      policyDriftCount: 0,
    });
    expect(report.results.map((result) => result.id)).toEqual([
      'current-v063-vs-2026-07-03-jul-rumble',
      'v062-vs-2026-06-26-jun-eom',
      'v061-vs-2026-06-26-jun-eom',
      'v057-vs-2026-06-12-jun-tm',
    ]);
  });

  it('runs a selected case by id', async () => {
    const corpus = await readReleaseBacktestCorpus();
    const report = runReleaseDetectorBacktest(corpus, {
      caseId: 'current-v063-vs-2026-07-03-jul-rumble',
    });

    expect(report.summary).toMatchObject({
      total: 1,
      passed: 1,
      failed: 0,
    });
    expect(report.results[0].actual).toMatchObject({
      releaseNeeded: true,
      reason: 'new-upstream-characters',
      newCharacterIds: [4607],
      localCharacterCount: 4577,
      remoteCharacterCount: 4578,
    });
    expect(() => runReleaseDetectorBacktest(corpus, { caseId: 'missing' })).toThrow(
      'Unknown release backtest case: missing',
    );
  });

  it('classifies unexpected divergences as detector bugs by default', async () => {
    const corpus = await readReleaseBacktestCorpus();
    const mutatedCorpus = structuredClone(corpus);
    mutatedCorpus.cases[0].expected.releaseNeeded = false;
    mutatedCorpus.cases[0].expected.reason = 'no-new-upstream-characters';
    mutatedCorpus.cases[0].expected.newCharacterIds = [];

    const report = runReleaseDetectorBacktest(mutatedCorpus, {
      caseId: 'current-v063-vs-2026-07-03-jul-rumble',
    });

    expect(report.summary).toMatchObject({
      total: 1,
      failed: 1,
      detectorBugCount: 1,
      policyDriftCount: 0,
    });
    expect(report.results[0]).toMatchObject({
      status: 'failed',
      mismatchClassification: 'detector-bug',
    });
  });

  it('allows an explicitly documented mismatch to be reported as policy drift', async () => {
    const corpus = await readReleaseBacktestCorpus();
    const mutatedCorpus = structuredClone(corpus);
    mutatedCorpus.cases[0].expected.releaseNeeded = false;
    mutatedCorpus.cases[0].expected.reason = 'no-new-upstream-characters';
    mutatedCorpus.cases[0].expected.newCharacterIds = [];
    mutatedCorpus.cases[0].expected.mismatchClassification = 'policy-drift';

    const report = runReleaseDetectorBacktest(mutatedCorpus, {
      caseId: 'current-v063-vs-2026-07-03-jul-rumble',
    });

    expect(report.summary).toMatchObject({
      total: 1,
      failed: 1,
      detectorBugCount: 0,
      policyDriftCount: 1,
    });
    expect(report.results[0]).toMatchObject({
      status: 'failed',
      mismatchClassification: 'policy-drift',
    });
  });
});

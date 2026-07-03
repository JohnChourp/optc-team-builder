#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { dataImportSources } from './import-optc-data.mjs';
import { buildReleaseCheckResult } from './check-optc-release-needed.mjs';
import { releaseTriggerPolicy } from './lib/release-trigger-policy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_RELEASE_BACKTEST_CORPUS_PATH = path.join(
  __dirname,
  'fixtures',
  'release-check',
  'history',
  'corpus.json',
);

export function parseReleaseBacktestArgs(args = process.argv.slice(2)) {
  const options = {
    corpusPath: DEFAULT_RELEASE_BACKTEST_CORPUS_PATH,
    json: false,
  };

  for (const arg of args) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg.startsWith('--case=')) {
      options.caseId = readOptionValue(arg, '--case');
      continue;
    }

    if (arg.startsWith('--corpus=')) {
      options.corpusPath = path.resolve(readOptionValue(arg, '--corpus'));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (options.caseId !== undefined && !String(options.caseId).trim()) {
    throw new Error('--case requires a non-empty case id.');
  }

  return options;
}

function readOptionValue(arg, optionName) {
  return arg.slice(`${optionName}=`.length);
}

export async function readReleaseBacktestCorpus(corpusPath = DEFAULT_RELEASE_BACKTEST_CORPUS_PATH) {
  const source = await readFile(corpusPath, 'utf8');
  const corpus = JSON.parse(source);
  validateCorpus(corpus);
  return corpus;
}

function validateCorpus(corpus) {
  if (!corpus || typeof corpus !== 'object' || Array.isArray(corpus)) {
    throw new Error('Release backtest corpus must be an object.');
  }

  if (corpus.schemaVersion !== 1) {
    throw new Error('Release backtest corpus schemaVersion must be 1.');
  }

  if (!corpus.snapshots || typeof corpus.snapshots !== 'object' || Array.isArray(corpus.snapshots)) {
    throw new Error('Release backtest corpus must define snapshots.');
  }

  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    throw new Error('Release backtest corpus must define at least one case.');
  }
}

export function expandCharacterIdFixture(characterIds) {
  const ranges = characterIds?.ranges;

  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error('Character ID fixture must define at least one range.');
  }

  const ids = [];

  for (const range of ranges) {
    if (Number.isInteger(range)) {
      ids.push(range);
      continue;
    }

    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      !Number.isInteger(range[0]) ||
      !Number.isInteger(range[1]) ||
      range[0] > range[1]
    ) {
      throw new Error(`Invalid character ID range: ${JSON.stringify(range)}`);
    }

    for (let id = range[0]; id <= range[1]; id += 1) {
      ids.push(id);
    }
  }

  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Character ID fixtures may only contain positive integer IDs.');
  }

  return uniqueIds.sort((left, right) => left - right);
}

function resolveSnapshot(corpus, snapshotId) {
  const snapshot = corpus.snapshots[snapshotId];

  if (!snapshot) {
    throw new Error(`Unknown release backtest snapshot: ${snapshotId}`);
  }

  const characterIds = expandCharacterIdFixture(snapshot.characterIds);

  return {
    ...snapshot,
    id: snapshotId,
    characterIds,
    characterCount: characterIds.length,
  };
}

function summarizeSnapshot(snapshot) {
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    label: snapshot.label,
    commit: snapshot.commit,
    sourceVersion: snapshot.sourceVersion,
    characterCount: snapshot.characterCount,
  };
}

function normalizeExpected(caseConfig, actualResult) {
  return {
    releaseNeeded: caseConfig.expected?.releaseNeeded,
    reason: caseConfig.expected?.reason,
    localCharacterCount: caseConfig.expected?.localCharacterCount ?? actualResult.localCharacterCount,
    remoteCharacterCount: caseConfig.expected?.remoteCharacterCount ?? actualResult.remoteCharacterCount,
    newCharacterIds: caseConfig.expected?.newCharacterIds ?? [],
    newCharacterCount:
      caseConfig.expected?.newCharacterCount ?? (caseConfig.expected?.newCharacterIds ?? []).length,
  };
}

function compareArrays(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function collectMismatches(expected, actual) {
  const checks = [
    ['releaseNeeded', expected.releaseNeeded, actual.releaseNeeded],
    ['reason', expected.reason, actual.reason],
    ['localCharacterCount', expected.localCharacterCount, actual.localCharacterCount],
    ['remoteCharacterCount', expected.remoteCharacterCount, actual.remoteCharacterCount],
    ['newCharacterCount', expected.newCharacterCount, actual.newCharacterCount],
  ];
  const mismatches = checks
    .filter(([, expectedValue, actualValue]) => expectedValue !== actualValue)
    .map(([field, expectedValue, actualValue]) => ({ field, expected: expectedValue, actual: actualValue }));

  if (!compareArrays(expected.newCharacterIds, actual.newCharacterIds)) {
    mismatches.push({
      field: 'newCharacterIds',
      expected: expected.newCharacterIds,
      actual: actual.newCharacterIds,
    });
  }

  return mismatches;
}

function classifyMismatch(caseConfig) {
  return caseConfig.expected?.mismatchClassification === 'policy-drift'
    ? 'policy-drift'
    : 'detector-bug';
}

export function runReleaseBacktestCase(corpus, caseConfig) {
  const source = dataImportSources[corpus.source ?? releaseTriggerPolicy.defaultSource];

  if (!source) {
    throw new Error(`Unknown release backtest source: ${corpus.source}`);
  }

  const localSnapshot = resolveSnapshot(corpus, caseConfig.localSnapshot);
  const remoteSnapshot = resolveSnapshot(corpus, caseConfig.remoteSnapshot);
  const actual = buildReleaseCheckResult({
    source,
    localSourceVersion: localSnapshot.sourceVersion,
    remoteSourceVersion: remoteSnapshot.sourceVersion,
    localCharacterIds: localSnapshot.characterIds,
    remoteCharacters: remoteSnapshot.characterIds.map((id) => ({ id })),
  });
  const expected = normalizeExpected(caseConfig, actual);
  const mismatches = collectMismatches(expected, actual);

  return {
    id: caseConfig.id,
    title: caseConfig.title,
    status: mismatches.length === 0 ? 'passed' : 'failed',
    mismatchClassification: mismatches.length === 0 ? null : classifyMismatch(caseConfig),
    localSnapshot: summarizeSnapshot(localSnapshot),
    remoteSnapshot: summarizeSnapshot(remoteSnapshot),
    expected,
    actual,
    mismatches,
  };
}

export function runReleaseDetectorBacktest(corpus, options = {}) {
  const selectedCases = options.caseId
    ? corpus.cases.filter((caseConfig) => caseConfig.id === options.caseId)
    : corpus.cases;

  if (options.caseId && selectedCases.length === 0) {
    throw new Error(`Unknown release backtest case: ${options.caseId}`);
  }

  const results = selectedCases.map((caseConfig) => runReleaseBacktestCase(corpus, caseConfig));
  const failedResults = results.filter((result) => result.status === 'failed');
  const detectorBugCount = failedResults.filter(
    (result) => result.mismatchClassification === 'detector-bug',
  ).length;
  const policyDriftCount = failedResults.filter(
    (result) => result.mismatchClassification === 'policy-drift',
  ).length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    corpus: {
      schemaVersion: corpus.schemaVersion,
      source: corpus.source ?? releaseTriggerPolicy.defaultSource,
      sourceRepository: corpus.sourceRepository,
      description: corpus.description,
      caseCount: corpus.cases.length,
    },
    summary: {
      total: results.length,
      passed: results.length - failedResults.length,
      failed: failedResults.length,
      detectorBugCount,
      policyDriftCount,
    },
    results,
  };
}

function formatHumanReport(report) {
  const lines = [
    'Release detector historical backtest',
    `Cases: ${report.summary.total}`,
    `Passed: ${report.summary.passed}`,
    `Failed: ${report.summary.failed}`,
    `Detector bugs: ${report.summary.detectorBugCount}`,
    `Policy drift: ${report.summary.policyDriftCount}`,
    '',
  ];

  for (const result of report.results) {
    lines.push(
      `${result.status === 'passed' ? 'PASS' : 'FAIL'} ${result.id}`,
      `  ${result.title}`,
      `  local=${result.localSnapshot.label} (${result.localSnapshot.characterCount})`,
      `  remote=${result.remoteSnapshot.label} (${result.remoteSnapshot.characterCount})`,
      `  releaseNeeded=${result.actual.releaseNeeded} reason=${result.actual.reason}`,
      `  newCharacterIds=${result.actual.newCharacterIds.length ? result.actual.newCharacterIds.join(', ') : 'none'}`,
    );

    if (result.mismatches.length > 0) {
      lines.push(`  mismatchClassification=${result.mismatchClassification}`);
      for (const mismatch of result.mismatches) {
        lines.push(
          `  mismatch ${mismatch.field}: expected=${JSON.stringify(mismatch.expected)} actual=${JSON.stringify(
            mismatch.actual,
          )}`,
        );
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseReleaseBacktestArgs();
    const corpus = await readReleaseBacktestCorpus(options.corpusPath);
    const report = runReleaseDetectorBacktest(corpus, options);
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatHumanReport(report));

    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

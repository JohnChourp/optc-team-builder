#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

export const SAVED_TEAM_CODEC_PERFORMANCE_SCHEMA_VERSION = 1;

const require = createRequire(import.meta.url);
const taskId = '869dwchtw';
const appRoot = process.cwd();
const artifactDir = process.env.PERF_ARTIFACT_DIR ?? resolveDefaultArtifactDir();
const runLabel = sanitizeSegment(process.env.PERF_RUN_LABEL ?? 'saved-team-codecs');
const shouldAssert = process.env.PERF_ASSERT !== '0';
const exportedAt = '2026-07-06T00:00:00.000Z';
const sanitizeOptions = {
  now: exportedAt,
  untitledTeamName: 'Untitled Crew',
};
const loops = {
  bulkExportEncode: 40,
  bulkJsonParse: 40,
  bulkSanitize: 40,
  bulkParseSanitize: 40,
  shareEncode: 600,
  shareDecode: 600,
  shareResolveSanitize: 600,
  invalidValidation: 1200,
};
const budgets = {
  node: {
    bulkExportEncodeMs: 10,
    bulkJsonParseMs: 10,
    bulkSanitizeMs: 10,
    bulkParseSanitizeMs: 15,
    shareEncodeMs: 5,
    shareDecodeMs: 3,
    shareResolveSanitizeMs: 4,
    invalidValidationMs: 1,
  },
};
const metricDefinitions = [
  {
    key: 'bulkExportEncodeMs',
    label: 'bulk export encode',
    loops: loops.bulkExportEncode,
    run: (transferUtils, fixtures) =>
      JSON.stringify(transferUtils.buildSavedTeamsTransferPayload(fixtures.bulkTeams, exportedAt)),
  },
  {
    key: 'bulkJsonParseMs',
    label: 'bulk JSON parse',
    loops: loops.bulkJsonParse,
    run: (transferUtils, fixtures) => transferUtils.parseSavedTeamsImportPayload(fixtures.bulkJson),
  },
  {
    key: 'bulkSanitizeMs',
    label: 'bulk sanitize',
    loops: loops.bulkSanitize,
    run: (transferUtils, fixtures) =>
      transferUtils.sanitizeSavedTeamsImportPayload(fixtures.bulkPayload, sanitizeOptions),
  },
  {
    key: 'bulkParseSanitizeMs',
    label: 'bulk parse and sanitize',
    loops: loops.bulkParseSanitize,
    run: (transferUtils, fixtures) =>
      transferUtils.sanitizeSavedTeamsImportPayload(
        transferUtils.parseSavedTeamsImportContent(fixtures.bulkJson),
        sanitizeOptions,
      ),
  },
  {
    key: 'shareEncodeMs',
    label: 'share encode',
    loops: loops.shareEncode,
    run: (transferUtils, fixtures) =>
      transferUtils.encodeSavedTeamSharePayload(fixtures.sharePayload),
  },
  {
    key: 'shareDecodeMs',
    label: 'share decode',
    loops: loops.shareDecode,
    run: (transferUtils, fixtures) => transferUtils.decodeSavedTeamShareCode(fixtures.shareCode),
  },
  {
    key: 'shareResolveSanitizeMs',
    label: 'share resolve and sanitize',
    loops: loops.shareResolveSanitize,
    run: (transferUtils, fixtures) =>
      transferUtils.resolveSavedTeamFromShareInput(fixtures.shareCode, sanitizeOptions),
  },
  {
    key: 'invalidValidationMs',
    label: 'invalid input validation',
    loops: loops.invalidValidation,
    run: (transferUtils, fixtures, index) => {
      try {
        transferUtils.parseSavedTeamsImportContent(
          fixtures.invalidInputs[index % fixtures.invalidInputs.length],
        );
      } catch {
        // Expected: this path measures diagnostic classification for bad input.
      }
    },
  },
];

await mkdir(artifactDir, { recursive: true });

const transferUtils = await loadSavedTeamsTransferUtils();
const fixtures = buildFixtures(transferUtils);
const metricRuns = metricDefinitions.map((metric) => measureMetric(metric, transferUtils, fixtures));
const timings = Object.fromEntries(metricRuns.map((metric) => [metric.key, metric.perLoopMs]));
const failures = buildBudgetFailures(timings);
const results = {
  schemaVersion: SAVED_TEAM_CODEC_PERFORMANCE_SCHEMA_VERSION,
  harness: 'saved-team-codecs',
  taskId,
  capturedAt: new Date().toISOString(),
  appRepo: appRoot,
  appCommit: resolveGitHead(),
  artifactDir,
  runLabel,
  nodeVersion: process.version,
  shouldAssert,
  budgets,
  loops,
  fixture: {
    bulkTeamCount: fixtures.bulkTeams.length,
    bulkJsonBytes: Buffer.byteLength(fixtures.bulkJson),
    shareCodeBytes: Buffer.byteLength(fixtures.shareCode),
    shareNoteCharacters: fixtures.shareTeam.notes.length,
    invalidInputCount: fixtures.invalidInputs.length,
  },
  viewportRuns: [
    {
      viewport: 'node',
      timings: {
        savedTeamCodecs: timings,
      },
    },
  ],
  metricRuns,
  hotspotRanking: [...metricRuns]
    .sort((left, right) => right.perLoopMs - left.perLoopMs)
    .map(({ key, label, perLoopMs }) => ({ key, label, perLoopMs })),
  failures,
};

const outputPath = path.join(artifactDir, `${runLabel}-performance.json`);
await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(`[perf:saved-team-codecs] wrote ${outputPath}`);
for (const metric of results.hotspotRanking) {
  console.log(
    `[perf:saved-team-codecs] ${metric.label}: ${metric.perLoopMs}ms per loop`,
  );
}

if (shouldAssert && failures.length) {
  throw new Error(
    `Saved-team codec performance guardrails failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}`,
  );
}

function sanitizeSegment(value) {
  return String(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'saved-team-codecs';
}

function resolveDefaultArtifactDir() {
  const siblingBrainDir = path.resolve(appRoot, '..', 'optc-team-builder-brain');

  return existsSync(siblingBrainDir)
    ? path.join(siblingBrainDir, 'live-artifacts', taskId)
    : path.join(appRoot, 'perf-artifacts', 'saved-team-codecs');
}

function resolveGitHead() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function loadSavedTeamsTransferUtils() {
  const ts = require('typescript');
  const sourcePath = path.join(
    appRoot,
    'src/app/pages/saved-teams/saved-teams-transfer.utils.ts',
  );
  const source = await readFile(sourcePath, 'utf8');
  const outputText = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

function buildFixtures(transferUtils) {
  const bulkTeams = Array.from({ length: 1500 }, (_, index) => buildTeam(index, 128));
  const bulkPayload = transferUtils.buildSavedTeamsTransferPayload(bulkTeams, exportedAt);
  const bulkJson = JSON.stringify(bulkPayload);
  const shareTeam = buildTeam(9999, 32768);
  const sharePayload = transferUtils.buildSavedTeamSharePayload(shareTeam, exportedAt);
  const shareCode = transferUtils.buildSavedTeamShareCode(shareTeam, exportedAt);
  const invalidInputs = [
    '',
    '{"schemaVersion":',
    'not a valid share code',
    JSON.stringify({ schemaVersion: 2, source: 'saved-teams' }),
  ];

  return {
    bulkTeams,
    bulkPayload,
    bulkJson,
    shareTeam,
    sharePayload,
    shareCode,
    invalidInputs,
  };
}

function buildTeam(seed, noteSize) {
  const day = String((seed % 28) + 1).padStart(2, '0');
  const hour = String(seed % 24).padStart(2, '0');
  const minute = String((seed * 7) % 60).padStart(2, '0');
  const timestamp = `2026-07-${day}T${hour}:${minute}:00.000Z`;

  return {
    id: `codec-perf-team-${seed}`,
    name: `Codec Perf Crew ${seed}`,
    notes: `codec-note-${seed}-` + 'x'.repeat(noteSize),
    shipId: seed % 5 === 0 ? null : 2000 + seed,
    slots: Array.from({ length: 6 }, (_, slotIndex) =>
      (seed + slotIndex) % 4 === 0 ? null : seed * 10 + slotIndex + 1,
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function measureMetric(metric, transferUtils, fixtures) {
  const startedAt = performance.now();

  for (let index = 0; index < metric.loops; index += 1) {
    metric.run(transferUtils, fixtures, index);
  }

  const totalMs = performance.now() - startedAt;

  return {
    key: metric.key,
    label: metric.label,
    loops: metric.loops,
    totalMs: roundMs(totalMs),
    perLoopMs: roundMs(totalMs / metric.loops),
  };
}

function roundMs(value) {
  return Math.round(value * 1000) / 1000;
}

function buildBudgetFailures(timings) {
  return Object.entries(budgets.node)
    .filter(([key, budgetMs]) => {
      const actualMs = timings[key];

      return !Number.isFinite(actualMs) || actualMs > budgetMs;
    })
    .map(([key, budgetMs]) => {
      const actualMs = timings[key];

      return `${key}: ${Number.isFinite(actualMs) ? `${actualMs}ms` : 'n/a'} > ${budgetMs}ms`;
    });
}

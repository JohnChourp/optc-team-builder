#!/usr/bin/env node
/**
 * 869f127e9. Keeps three things in step that used to age independently:
 *
 *  1. the shipped dataset,
 *  2. `src/app/core/data/dataset-measurements.json`, generated from it,
 *  3. every number a source comment quotes from it.
 *
 * A comment marks its number as `<number> [@dataset <metric>]`. The marker is what lets this check
 * find the quoted figures without guessing which of the digits in a paragraph are measurements -
 * the sweep for this task found measurement-shaped numbers in 20 files, most of which are slot
 * counts, byte sizes and dates that have nothing to do with the roster.
 *
 * The prose is never rewritten by anything here. The brain's own culture is that the REASON is what
 * a future reader acts on; this protects the number, not the paragraph.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  flattenMeasurements,
  measureDataset,
  MEASUREMENTS_PATH,
  readMeasurementsFile,
} from './lib/dataset-measurements.mjs';

/** `4622 [@dataset characterRows]` - the number first, so the prose still reads as prose. */
export const MEASUREMENT_MARKER_PATTERN = /(\d[\d,]*)\s*\[@dataset ([A-Za-z][\w.]*)\]/gu;

export function listSourceFiles(root) {
  const files = [];

  const walk = (dir) => {
    let entries;

    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry);
      let info;

      try {
        info = statSync(full);
      } catch {
        continue;
      }

      if (info.isDirectory()) {
        if (entry !== 'node_modules') {
          walk(full);
        }
      } else if (/\.(ts|mjs|scss|md)$/u.test(entry) && !/\.spec\.ts$/u.test(entry)) {
        // Specs are excluded on purpose. A guard's own spec has to contain deliberately WRONG
        // markers to prove it fails on them, and scanning those would make the guard fail on its
        // own fixtures - caught the first time this spec ran.
        files.push(full);
      }
    }
  };

  walk(root);

  return files.sort();
}

export function collectMarkers(source) {
  const markers = [];

  MEASUREMENT_MARKER_PATTERN.lastIndex = 0;

  let match;

  while ((match = MEASUREMENT_MARKER_PATTERN.exec(source)) !== null) {
    markers.push({
      quoted: Number(match[1].replace(/,/gu, '')),
      metric: match[2],
      line: source.slice(0, match.index).split('\n').length,
    });
  }

  return markers;
}

export function inspectDatasetMeasurements({ appRoot = process.cwd(), roots = ['src', 'scripts', 'docs'] } = {}) {
  const findings = [];
  let committed;

  try {
    committed = readMeasurementsFile({ appRoot });
  } catch (error) {
    return {
      checkedMarkers: 0,
      checkedFiles: 0,
      findings: [
        {
          kind: 'missing-measurements',
          detail: `${MEASUREMENTS_PATH} could not be read (${error.message}). Run npm run dataset:measure.`,
        },
      ],
      ok: false,
    };
  }

  /*
   * The committed file is checked against the dataset FIRST. A marker that agrees with a stale file
   * is still wrong, and checking only comment-versus-file would have let exactly that pass - which
   * is how `486` survived: every copy of it agreed with every other copy.
   */
  const measured = flattenMeasurements(measureDataset({ appRoot }));
  const recorded = flattenMeasurements(committed);

  for (const [metric, value] of Object.entries(measured)) {
    if (recorded[metric] !== value) {
      findings.push({
        kind: 'stale-measurements-file',
        metric,
        expected: value,
        actual: recorded[metric],
        detail: `${MEASUREMENTS_PATH} records ${metric} as ${recorded[metric] ?? 'absent'}; the dataset measures ${value}.`,
      });
    }
  }

  let checkedMarkers = 0;
  let checkedFiles = 0;

  for (const root of roots) {
    for (const file of listSourceFiles(path.join(appRoot, root))) {
      const source = readFileSync(file, 'utf8');

      if (!source.includes('[@dataset ')) {
        continue;
      }

      const relativePath = path.relative(appRoot, file).split(path.sep).join('/');
      const markers = collectMarkers(source);

      if (markers.length === 0) {
        continue;
      }

      checkedFiles += 1;

      for (const marker of markers) {
        checkedMarkers += 1;

        if (!(marker.metric in recorded)) {
          findings.push({
            kind: 'unknown-metric',
            file: relativePath,
            line: marker.line,
            metric: marker.metric,
            detail: `${relativePath}:${marker.line} quotes [@dataset ${marker.metric}], which ${MEASUREMENTS_PATH} does not measure.`,
          });
          continue;
        }

        if (recorded[marker.metric] !== marker.quoted) {
          findings.push({
            kind: 'stale-comment',
            file: relativePath,
            line: marker.line,
            metric: marker.metric,
            expected: recorded[marker.metric],
            actual: marker.quoted,
            detail: `${relativePath}:${marker.line} says ${marker.quoted} for ${marker.metric}; the dataset measures ${recorded[marker.metric]}.`,
          });
        }
      }
    }
  }

  return { checkedMarkers, checkedFiles, findings, ok: findings.length === 0 };
}

export function formatDatasetMeasurementResult(result) {
  if (result.ok) {
    return `[dataset:measurements] ${result.checkedMarkers} quoted figure(s) in ${result.checkedFiles} file(s) match the measured dataset.`;
  }

  const lines = [`[dataset:measurements] found ${result.findings.length} figure(s) out of step:`];

  for (const finding of result.findings) {
    lines.push(`- ${finding.detail}`);
  }

  lines.push(
    '[dataset:measurements] The dataset only moves at release, so a number quoted in prose ages',
    '[dataset:measurements] silently between releases. Re-run `npm run dataset:measure`, then update',
    '[dataset:measurements] the marked figures. Do not delete the prose - the guard protects the',
    '[dataset:measurements] number, never the paragraph that explains why it matters.',
  );

  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { appRoot: process.cwd() };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--app-root') {
      options.appRoot = argv[index + 1] ?? options.appRoot;
      index += 1;
    }
  }

  return options;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = inspectDatasetMeasurements(parseArgs(process.argv.slice(2)));

  console.log(formatDatasetMeasurementResult(result));

  if (!result.ok) {
    process.exit(1);
  }
}

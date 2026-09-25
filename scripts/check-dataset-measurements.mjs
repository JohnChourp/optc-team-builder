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
 *
 * Owner, 2026-09-25 (wave-11 close): the NUMBER may move on its own, at release. An unattended
 * release that added characters left this lane red on `main` until somebody edited the figures by
 * hand, so `--write` - which `scripts/release-and-tag.sh` runs right after it re-measures - moves
 * the number inside each out-of-step marker to the measured value. It changes nothing else: not a
 * word of the paragraph, not a number outside a marker, not a marker whose metric is unknown. It
 * prints every figure it moved, so a person can still reread the paragraph around it.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  flattenMeasurements,
  measureDataset,
  MEASUREMENTS_PATH,
  readMeasurementsFile,
} from './lib/dataset-measurements.mjs';

/** `4626 [@dataset characterRows]` - the number first, so the prose still reads as prose. */
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

/**
 * Moves every out-of-step marked figure to the value the measurements file records, and nothing
 * else. It reads the FILE, not the dataset, because the release re-measures first; a marker whose
 * metric the file does not record is left exactly as it is, for the check to report.
 *
 * A figure keeps its own style: `4,622` becomes `4,626`, `4622` becomes `4626`.
 */
export function rewriteDatasetMeasurementMarkers({ appRoot = process.cwd(), roots = ['src', 'scripts', 'docs'] } = {}) {
  const recorded = flattenMeasurements(readMeasurementsFile({ appRoot }));
  const moved = [];

  for (const root of roots) {
    for (const file of listSourceFiles(path.join(appRoot, root))) {
      const source = readFileSync(file, 'utf8');

      if (!source.includes('[@dataset ')) {
        continue;
      }

      const relativePath = path.relative(appRoot, file).split(path.sep).join('/');
      const rewritten = source.replace(MEASUREMENT_MARKER_PATTERN, (marker, quotedText, metric, offset) => {
        const expected = recorded[metric];
        const quoted = Number(quotedText.replace(/,/gu, ''));

        if (typeof expected !== 'number' || quoted === expected) {
          return marker;
        }

        moved.push({
          file: relativePath,
          line: source.slice(0, offset).split('\n').length,
          metric,
          from: quoted,
          to: expected,
        });

        // The pattern also takes a comma that only punctuates the prose, between the figure and
        // the marker. It stays where it was. (No example here: this file is scanned for markers.)
        const trailing = quotedText.match(/,*$/u)[0];
        const digits = quotedText.slice(0, quotedText.length - trailing.length);
        const figure = digits.includes(',') ? expected.toLocaleString('en-US') : String(expected);

        return figure + trailing + marker.slice(quotedText.length);
      });

      if (rewritten !== source) {
        writeFileSync(file, rewritten);
      }
    }
  }

  return moved;
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
  const options = { appRoot: process.cwd(), write: false };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--app-root') {
      options.appRoot = argv[index + 1] ?? options.appRoot;
      index += 1;
    } else if (argv[index] === '--write') {
      options.write = true;
    }
  }

  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const options = parseArgs(process.argv.slice(2));

  if (options.write) {
    const moved = rewriteDatasetMeasurementMarkers(options);

    for (const figure of moved) {
      console.log(`[dataset:measurements] moved ${figure.file}:${figure.line} ${figure.metric}: ${figure.from} -> ${figure.to}`);
    }

    console.log(`[dataset:measurements] moved ${moved.length} quoted figure(s); reread the paragraph around each.`);
  }

  // After --write this still checks, so whatever it could not fix stops the caller.
  const result = inspectDatasetMeasurements(options);

  console.log(formatDatasetMeasurementResult(result));

  if (!result.ok) {
    process.exit(1);
  }
}

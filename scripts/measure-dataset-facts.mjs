#!/usr/bin/env node
/**
 * 869f127e9. Writes `src/app/core/data/dataset-measurements.json` from the shipped dataset.
 *
 * Run it after the dataset moves - which is only at release. `check-dataset-measurements.mjs` fails
 * when the committed file no longer matches the dataset, or when a number quoted in a source
 * comment no longer matches the file, so neither can age quietly the way `486` did.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildMeasurementsFile,
  MEASUREMENTS_PATH,
  measureDataset,
} from './lib/dataset-measurements.mjs';

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

const { appRoot } = parseArgs(process.argv.slice(2));
const measurements = buildMeasurementsFile(measureDataset({ appRoot }));
const target = path.join(appRoot, MEASUREMENTS_PATH);

writeFileSync(target, `${JSON.stringify(measurements, null, 2)}\n`, 'utf8');

console.log(
  `[dataset:measure] wrote ${MEASUREMENTS_PATH} from ${measurements.characterRows} character rows and ${measurements.detailRows} detail rows.`,
);

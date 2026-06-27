#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sendReleaseTriggerNotification } from './lib/release-trigger-notifications.mjs';

const __filename = fileURLToPath(import.meta.url);

function readOptionValue(arg, optionName) {
  return arg.slice(`${optionName}=`.length);
}

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    reportPath: 'release-trigger-outcome.json',
  };

  for (const arg of args) {
    if (arg.startsWith('--report=')) {
      options.reportPath = readOptionValue(arg, '--report');
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const report = JSON.parse(await readFile(options.reportPath, 'utf8'));
  const result = await sendReleaseTriggerNotification({ report });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

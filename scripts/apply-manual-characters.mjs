#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyManualCharacterOverlay } from './lib/manual-character-apply.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await applyManualCharacterOverlay({
    rootDir,
    ...options,
    logger: (message) => console.log(message),
  });

  console.log(
    `[manual-characters] ${result.written ? 'wrote' : 'kept'} dataset with ${result.manualCharacterCount} manual character(s).`,
  );
}

function parseArgs(args) {
  const options = {};

  for (const arg of args) {
    if (!arg.startsWith('--')) {
      throw new Error(`Unsupported argument: ${arg}`);
    }

    const [rawKey, rawValue] = arg.slice(2).split('=');
    const value = rawValue ? path.resolve(rootDir, rawValue) : '';

    switch (rawKey) {
      case 'data-dir':
        options.dataDir = value;
        break;
      case 'seed-path':
        options.seedPath = value;
        break;
      case 'manifest-path':
        options.manifestPath = value;
        break;
      case 'overlay-file':
        options.overlayPath = value;
        break;
      case 'source-image-dir':
        options.sourceImageDir = value;
        break;
      case 'exact-images-dir':
        options.exactImagesDir = value;
        break;
      default:
        throw new Error(`Unsupported flag: --${rawKey}`);
    }
  }

  return options;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

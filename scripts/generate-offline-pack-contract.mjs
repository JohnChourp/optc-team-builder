#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  buildOfflinePackContract,
  findPackContractFailures,
} from './lib/offline-pack-contract.mjs';

/**
 * 869f138qw. Writes `docs/offline-pack-contract.json` from the pack directories themselves.
 *
 * What it measures, what it only records, and why the file count is the invariant worth failing on,
 * is in `scripts/lib/offline-pack-contract.mjs`.
 *
 * Run: npm run packs:contract           (write)
 *      npm run packs:contract -- --check (fail when the file is stale, or a pack has no entry)
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_ROOT = path.join(APP_ROOT, 'public/assets/offline-packs');
const MANIFEST_PATH = path.join(APP_ROOT, 'public/assets/data/optc-manifest.json');
const NGSW_PATH = path.join(APP_ROOT, 'ngsw-config.json');
const OUTPUT_PATH = path.join(APP_ROOT, 'docs/offline-pack-contract.json');

function readRuntimeMediaCacheConfig() {
  const config = JSON.parse(readFileSync(NGSW_PATH, 'utf8'));
  const group = (config.dataGroups ?? []).find((entry) => entry.name === 'runtime-media');

  return group
    ? {
        group: group.name,
        strategy: group.cacheConfig.strategy,
        maxSize: group.cacheConfig.maxSize,
        maxAge: group.cacheConfig.maxAge,
        urls: group.urls,
      }
    : null;
}

export function buildDocument() {
  return buildOfflinePackContract({
    packsRoot: PACKS_ROOT,
    manifest: JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')),
    cacheConfig: readRuntimeMediaCacheConfig(),
  });
}

function serialize(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function main() {
  const check = process.argv.includes('--check');
  const document = buildDocument();
  const failures = findPackContractFailures(document);

  if (failures.length) {
    console.error('[packs-contract] a pack does not match its contract:');

    for (const failure of failures) {
      console.error(`- [${failure.kind}] ${failure.packId} - ${failure.detail}`);
    }

    process.exitCode = 1;

    return;
  }

  const next = serialize(document);

  if (!check) {
    writeFileSync(OUTPUT_PATH, next, 'utf8');
    console.log(`[packs-contract] wrote docs/offline-pack-contract.json (${document.packCount} packs).`);

    return;
  }

  let current = '';

  try {
    current = readFileSync(OUTPUT_PATH, 'utf8');
  } catch {
    current = '';
  }

  if (current === next) {
    const drift = document.packs.reduce(
      (total, pack) => total + Math.abs(pack.byteDrift ?? 0),
      0,
    );

    console.log(
      `[packs-contract] OK - ${document.packCount} packs, every file count as the manifest claims (${drift} B of recorded byte drift).`,
    );

    return;
  }

  console.error(
    '[packs-contract] docs/offline-pack-contract.json does not match the packs. It is GENERATED - run `npm run packs:contract`.',
  );
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { serialize };

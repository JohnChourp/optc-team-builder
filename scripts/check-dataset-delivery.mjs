#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkDatasetBinary } from './build-dataset-binary.mjs';
import { loadSqlJs } from './lib/dataset-binary.mjs';

/**
 * 869f138q7. What a first visit downloads, checked against the build output.
 *
 * On 2026-09-16 `assets/data/optc-seed.sql` was served at 27,722,752 bytes with no
 * `content-encoding` - 86% of everything the service worker prefetches - while the JSON and the
 * WebAssembly beside it were gzipped. It had been that way for the life of the project, because
 * no check looked at what a browser actually receives: the only size budgets measured JavaScript.
 *
 * The host decides compression by content type, and `.sql` (`application/sql`) is not a type it
 * compresses. So this guard models the host rather than trusting it: every file the service worker
 * prefetches that is larger than `LARGE_ASSET_BYTES` must either be a type the host is known to
 * compress, or be compressed already. Anything else is a finding, which is exactly the shape the
 * seed had.
 *
 * It also checks the fix itself: the dataset ships as `optc-seed.sqlite.gz`, that file is in the
 * prefetch group, it is exactly the database the committed seed builds, and the raw seed - kept in
 * the build only as the fallback for a browser without `DecompressionStream` - is NOT prefetched.
 *
 * Run: npm run dataset-delivery:check   (after npm run build)
 */

export const LARGE_ASSET_BYTES = 256_000;

/*
 * Extensions whose content types the edge compresses. Cloudflare's default compression list names
 * text/*, application/javascript, application/json, application/manifest+json, application/wasm,
 * image/svg+xml, image/x-icon and the XML types; measured on optcteambuilder.com on 2026-09-16,
 * `.json` and `.wasm` arrive gzipped and `.sql` does not. An extension missing from this list is
 * treated as NOT compressed - the safe default for a guard.
 */
export const HOST_COMPRESSED_EXTENSIONS = new Set([
  '.css',
  '.htm',
  '.html',
  '.ico',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.wasm',
  '.webmanifest',
  '.xml',
]);

/** Formats that are compressed by construction; compressing them again gains nothing. */
export const PRECOMPRESSED_EXTENSIONS = new Set([
  '.avif',
  '.br',
  '.gif',
  '.gz',
  '.jpeg',
  '.jpg',
  '.mp4',
  '.png',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zst',
]);

export const DATASET_BINARY_URL = '/assets/data/optc-seed.sqlite.gz';
export const DATASET_SEED_URL = '/assets/data/optc-seed.sql';

/*
 * 869f138qe. `assets/data` in the build holds only what the app reads. Which files those are is
 * read from the app source - every `assets/data/<file>` string literal outside a spec - so the list
 * cannot drift from the code. Before this, the build shipped a zero-byte `optc.db` nothing had ever
 * read, and three files only scripts use, two of them prefetched on every visit.
 */
const RUNTIME_DATA_LITERAL = /['"`]\/?assets\/data\/([A-Za-z0-9._-]+)['"`]/gu;

export function readRuntimeDataFiles(appRoot) {
  const files = new Set();
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        for (const match of readFileSync(entryPath, 'utf8').matchAll(RUNTIME_DATA_LITERAL)) {
          files.add(match[1]);
        }
      }
    }
  };

  visit(path.join(appRoot, 'src', 'app'));
  return files;
}

export function inspectShippedDataFiles({ distDir, runtimeDataFiles }) {
  const findings = [];
  const dataDir = path.join(distDir, 'assets', 'data');
  const shipped = existsSync(dataDir)
    ? readdirSync(dataDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
    : [];

  if (runtimeDataFiles.size === 0) {
    findings.push({
      kind: 'no-runtime-data-files',
      detail: 'no app source names a file under assets/data, so nothing was checked',
    });
  }

  for (const name of shipped.sort()) {
    if (!runtimeDataFiles.has(name)) {
      findings.push({
        kind: 'unused-data-file',
        detail: `assets/data/${name} ships but no app code reads it - exclude it in angular.json, or read it`,
      });
    }
  }

  for (const name of [...runtimeDataFiles].sort()) {
    if (!shipped.includes(name)) {
      findings.push({
        kind: 'missing-runtime-data-file',
        detail: `the app reads assets/data/${name}, and the build does not contain it`,
      });
    }
  }

  return { findings, shipped };
}

export function extensionOf(url) {
  const name = String(url).split('?')[0].split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

export function isHostCompressedOrPrecompressed(url) {
  const extension = extensionOf(url);
  return HOST_COMPRESSED_EXTENSIONS.has(extension) || PRECOMPRESSED_EXTENSIONS.has(extension);
}

export function readPrefetchedAssets(distDir) {
  const manifestPath = path.join(distDir, 'ngsw.json');

  if (!existsSync(manifestPath)) {
    return { manifestPath, assets: null };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const assets = [];

  for (const group of manifest.assetGroups ?? []) {
    if (group.installMode !== 'prefetch') {
      continue;
    }

    for (const url of group.urls ?? []) {
      const filePath = path.join(distDir, decodeURIComponent(url).replace(/^\/+/u, ''));
      assets.push({
        group: group.name,
        url,
        filePath,
        bytes: existsSync(filePath) ? statSync(filePath).size : null,
      });
    }
  }

  return { manifestPath, assets };
}

export async function inspectDatasetDelivery({ distDir, SQL, runtimeDataFiles }) {
  const findings = [];
  const { manifestPath, assets } = readPrefetchedAssets(distDir);

  if (assets === null) {
    return {
      ok: false,
      findings: [{ kind: 'missing-ngsw-manifest', detail: `${manifestPath} does not exist - run npm run build first` }],
      assets: [],
    };
  }

  if (assets.length === 0) {
    findings.push({
      kind: 'no-prefetched-assets',
      detail: 'ngsw.json names no prefetched file, so nothing was checked',
    });
  }

  for (const asset of assets) {
    if (asset.bytes === null) {
      findings.push({ kind: 'missing-prefetched-file', detail: `${asset.url} is prefetched but absent from the build` });
      continue;
    }

    if (asset.bytes > LARGE_ASSET_BYTES && !isHostCompressedOrPrecompressed(asset.url)) {
      findings.push({
        kind: 'uncompressed-prefetch-asset',
        detail:
          `${asset.url} (${asset.group}) is ${asset.bytes} B and "${extensionOf(asset.url) || 'no extension'}" is not a type ` +
          'the host compresses - ship it compressed, or as a type the host compresses',
      });
    }
  }

  const prefetchedUrls = new Set(assets.map((asset) => asset.url));

  if (prefetchedUrls.has(DATASET_SEED_URL)) {
    findings.push({
      kind: 'raw-seed-prefetched',
      detail: `${DATASET_SEED_URL} is prefetched; the app downloads ${DATASET_BINARY_URL} and the raw seed is only its fallback`,
    });
  }

  if (!prefetchedUrls.has(DATASET_BINARY_URL)) {
    findings.push({
      kind: 'dataset-binary-not-prefetched',
      detail: `${DATASET_BINARY_URL} is not in any prefetch group, so the app would not work offline`,
    });
  }

  const binaryProblem = await checkDatasetBinary({
    seedPath: path.join(distDir, DATASET_SEED_URL.slice(1)),
    compressedPath: path.join(distDir, DATASET_BINARY_URL.slice(1)),
    SQL,
  });

  if (binaryProblem) {
    findings.push({ kind: 'dataset-binary-mismatch', detail: binaryProblem });
  }

  if (runtimeDataFiles) {
    findings.push(...inspectShippedDataFiles({ distDir, runtimeDataFiles }).findings);
  }

  return { ok: findings.length === 0, findings, assets };
}

export function formatDatasetDeliveryResult(result) {
  const lines = ['# Dataset delivery check', ''];
  const totalBytes = result.assets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0);
  const binary = result.assets.find((asset) => asset.url === DATASET_BINARY_URL);

  lines.push(`Checked ${result.assets.length} prefetched file(s), ${totalBytes} B in total.`);

  if (binary?.bytes) {
    lines.push(`Dataset: ${DATASET_BINARY_URL} is ${binary.bytes} B.`);
  }

  lines.push('');

  if (result.ok) {
    lines.push(
      'Status: passed - every large prefetched file is compressed, the dataset is the seed, and assets/data ships only what the app reads.',
    );
  } else {
    lines.push('Status: FAILED');

    for (const finding of result.findings) {
      lines.push(`- [${finding.kind}] ${finding.detail}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const distFlag = process.argv.indexOf('--dist-dir');
  const distDir = path.resolve(
    appRoot,
    distFlag === -1 ? 'dist/optc-team-builder/browser' : process.argv[distFlag + 1],
  );
  const result = await inspectDatasetDelivery({
    distDir,
    SQL: await loadSqlJs(),
    runtimeDataFiles: readRuntimeDataFiles(appRoot),
  });

  process.stdout.write(`${formatDatasetDeliveryResult(result)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}

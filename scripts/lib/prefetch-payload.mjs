import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * 869f138qh. What the service worker downloads before the app works offline, measured from a build.
 *
 * Two sizes per file, and the difference matters:
 *
 * - `cachedBytes` - the file as it sits in the build, which is what the service worker stores: a
 *   response is cached decoded, so host compression never shrinks the device's cache.
 * - `wireBytes` - what crosses the network. For a type the host compresses, that is estimated as
 *   the gzip of the file at level 6, the level the edge uses by default; for anything else it is
 *   the file itself, because nothing else will shrink it.
 *
 * Before this, the performance system measured JavaScript only. The prefetch group was 35,163,757
 * bytes, 79% of it a SQL seed no row mentioned.
 */

/* Content types the edge compresses, by extension - the same list the dataset-delivery check uses. */
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

export function extensionOf(url) {
  const name = String(url).split('?')[0].split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
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

export function estimateWireBytes(url, filePath) {
  if (!HOST_COMPRESSED_EXTENSIONS.has(extensionOf(url))) {
    return statSync(filePath).size;
  }

  return gzipSync(readFileSync(filePath), { level: 6 }).length;
}

/** The dataset files that get a budget row of their own, by row key. */
export const PAYLOAD_FILES = Object.freeze({
  database: '/assets/data/optc-seed.sqlite.gz',
  abilityCatalog: '/assets/data/optc-auto-builder-abilities.json',
  sqlWasm: '/assets/vendor/sql.js/sql-wasm.wasm',
});

export function measurePrefetchPayload(distDir) {
  const { assets } = readPrefetchedAssets(distDir);

  if (assets === null) {
    throw new Error(`${path.join(distDir, 'ngsw.json')} does not exist - build the app first.`);
  }

  const measured = assets
    .filter((asset) => asset.bytes !== null)
    .map((asset) => ({ ...asset, wireBytes: estimateWireBytes(asset.url, asset.filePath) }));
  const byUrl = new Map(measured.map((asset) => [asset.url, asset]));
  const file = (url) => byUrl.get(url) ?? { bytes: null, wireBytes: null };

  return {
    fileCount: measured.length,
    missingFileCount: assets.length - measured.length,
    cachedBytes: measured.reduce((total, asset) => total + asset.bytes, 0),
    wireBytes: measured.reduce((total, asset) => total + asset.wireBytes, 0),
    databaseBytes: file(PAYLOAD_FILES.database).bytes,
    abilityCatalogCachedBytes: file(PAYLOAD_FILES.abilityCatalog).bytes,
    abilityCatalogWireBytes: file(PAYLOAD_FILES.abilityCatalog).wireBytes,
    sqlWasmCachedBytes: file(PAYLOAD_FILES.sqlWasm).bytes,
    sqlWasmWireBytes: file(PAYLOAD_FILES.sqlWasm).wireBytes,
  };
}

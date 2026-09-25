#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import vm from 'node:vm';

import {
  enrichCharactersWithBuilderAbilities,
  normalizeLegacyAbilityText,
} from './auto-team-builder-ability-parser.mjs';
import { applyManualCharacterOverlay } from './lib/manual-character-apply.mjs';
import {
  collectManualImageOverrideFiles,
  pruneManualCharactersCoveredByImport,
} from './lib/manual-character-prune.mjs';
import { loadBuilderAbilityCorrections } from './lib/builder-ability-corrections.mjs';
import { buildCaptainAbilityCoverage } from './lib/captain-ability-coverage.mjs';
import { validateDatasetIntegrity } from './lib/dataset-integrity.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createEmptyAssets,
  createCharacterSearchText,
  createSqlSeed,
  createUnresolvedCatalog,
  flattenValues,
  getSortedUnresolvedCharacters,
  keepGeneratedAtWhenOnlyTimestampChanged,
  normalizeCharacterClasses,
  readGeneratedDatasetFiles,
  resolveCharacterCaptainBoosts,
  writeGeneratedDatasetFiles,
} from './lib/optc-dataset.mjs';
import {
  applyPartyConflictKeys,
  normalizePartyConflictOverrideMap,
} from './lib/party-conflict-keys.mjs';
import {
  FORM_DROPPED_FIELDS,
  FORM_UPSTREAM_SOURCES,
  isEmptyUpstreamValue,
} from './lib/optc-upstream-forms.mjs';
import { normalizeRumbleUnits } from './lib/rumble-data-normalizer.mjs';
import {
  attachProgressionData,
  normalizeAcquisition,
  normalizeDropSources,
  normalizeEvolutions,
  normalizeSpecialCooldowns,
} from './lib/optc-upstream-progression.mjs';
import { parseSuperSpecialCriteria } from './lib/super-special-criteria.mjs';
import { normalizeCharacterSearchText } from '../src/app/core/grammar/character-search-text.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const dataDir = path.join(publicDir, 'assets', 'data');
const offlineDir = path.join(publicDir, 'assets', 'offline-packs');
const exactImagesDir = path.join(publicDir, 'assets', 'exact-character-images');
const overrideConfigPath = path.join(rootDir, 'scripts', 'data', 'character-image-overrides.json');
const manualExactImageSourceDir = path.join(rootDir, 'scripts', 'data', 'character-images');
const manualCharacterOverlayPath = path.join(rootDir, 'scripts', 'data', 'manual-characters.json');
const builderAbilityCorrectionsPath = path.join(
  rootDir,
  'scripts',
  'data',
  'builder-ability-corrections.json',
);
const partyConflictOverridesPath = path.join(
  rootDir,
  'scripts',
  'data',
  'party-conflict-overrides.json',
);
const shipThumbnailOverrideConfigPath = path.join(
  rootDir,
  'scripts',
  'data',
  'ship-thumbnail-overrides.json',
);
const manualShipThumbnailSourceDir = path.join(rootDir, 'scripts', 'data', 'ship-thumbnails');

const githubHeaders = {
  'User-Agent': 'optc-team-builder-importer',
  Accept: 'application/vnd.github+json',
};

export const dataImportSources = Object.freeze({
  '2shankz': Object.freeze({
    key: '2shankz',
    label: '2Shankz/optc-db.github.io',
    repository: '2Shankz/optc-db.github.io',
    rawBaseUrl: 'https://raw.githubusercontent.com/2Shankz/optc-db.github.io/master',
    githubApiBase: 'https://api.github.com/repos/2Shankz/optc-db.github.io',
    ref: 'master',
  }),
  'optc-db': Object.freeze({
    key: 'optc-db',
    label: 'optc-db/optc-db.github.io',
    repository: 'optc-db/optc-db.github.io',
    rawBaseUrl: 'https://raw.githubusercontent.com/optc-db/optc-db.github.io/master',
    githubApiBase: 'https://api.github.com/repos/optc-db/optc-db.github.io',
    ref: 'master',
    /*
     * 869f63gtc. Both sources report `window.dbVersion = 36` - `version.js` has not changed since
     * 2016-05-23 in either - so the version label cannot tell them apart, and an import from this
     * one would roll the dataset back two years under the same label. `parseArgs` refuses it unless
     * `--allow-stale-source` says the stale data is really wanted.
     */
    stale: Object.freeze({
      since: '2024-08-14',
      reason:
        'optc-db/optc-db.github.io stopped changing on 2024-08-14 while 2Shankz/optc-db.github.io is live, and both report dbVersion 36, so an import from it would roll the dataset back two years under the same version label.',
    }),
  }),
});

/** 869f63gtc. The one flag that lets a stale source through `parseArgs`. */
export const STALE_SOURCE_FLAG = '--allow-stale-source';

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const execFileAsync = promisify(execFile);

export const packDefinitions = [
  {
    key: 'thumbnailsGlo',
    id: 'thumbnails-glo',
    label: 'Global thumbnails',
    listingPath: 'api/images/thumbnail',
    entryName: 'glo',
  },
  {
    key: 'thumbnailsJapan',
    id: 'thumbnails-jap',
    label: 'Japan thumbnails',
    listingPath: 'api/images/thumbnail',
    entryName: 'jap',
  },
  {
    key: 'shipThumbnails',
    id: 'ship-thumbnails',
    label: 'Ship thumbnails',
    listingPath: 'api/images/thumbnail',
    entryName: 'ship',
  },
];

const typeSuffixOrder = new Map(
  ['STR', 'DEX', 'QCK', 'PSY', 'INT'].map((value, index) => [value, index]),
);
const packKeyToField = {
  thumbnailsGlo: 'thumbnailGlobal',
  thumbnailsJapan: 'thumbnailJapan',
};
const packEntryNameMap = {
  glo: 'thumbnailsGlo',
  jap: 'thumbnailsJapan',
};

const noop = () => undefined;
const validUnitTypeSet = new Set(typeSuffixOrder.keys());

export function resolveImportSource(sourceKey = '2shankz') {
  const selectedSource = dataImportSources[sourceKey];

  if (!selectedSource) {
    const supportedSources = Object.keys(dataImportSources).join(', ');
    throw new Error(`Invalid --source value "${sourceKey}". Expected one of: ${supportedSources}.`);
  }

  return selectedSource;
}

export function buildSourceFileUrl(source, relativePath) {
  return `${source.rawBaseUrl}/${relativePath}`;
}

/**
 * 869f63gtc. A branch name moves; a commit does not. The importer resolves the source's branch to
 * the commit it points at when the import starts, then reads EVERY file - the data files, the
 * version file, the image listings - at that commit, so the files agree with each other and with the
 * commit the manifest records, even when upstream pushes in the middle of an import.
 */
export function pinImportSourceToCommit(source, commit) {
  if (!COMMIT_SHA_PATTERN.test(String(commit ?? ''))) {
    throw new Error(
      `Cannot pin ${source.repository} to "${commit}": expected a full 40-character commit sha.`,
    );
  }

  return Object.freeze({
    ...source,
    ref: commit,
    commit,
    rawBaseUrl: `https://raw.githubusercontent.com/${source.repository}/${commit}`,
  });
}

export function buildSourceCommitUrl(source, ref = source.ref) {
  return `${source.githubApiBase}/commits/${encodeURIComponent(ref)}`;
}

async function listRemoteRefWithGit(source, ref) {
  const { stdout } = await execFileAsync(
    'git',
    [
      'ls-remote',
      `https://github.com/${source.repository}.git`,
      `refs/heads/${ref}`,
      `refs/tags/${ref}`,
    ],
    { timeout: 30_000 },
  );

  return String(stdout).trim().split(/\s+/u)[0] ?? '';
}

/**
 * 869f63gtc. The commit `ref` names in the source repository right now, or an error - never a
 * guess. The GitHub API answers first; `git ls-remote` answers when the API cannot (its
 * unauthenticated budget is 60 requests an hour, and the image listings spend six of them), because
 * it does not count against that budget. With neither, the import stops: it records the commit it
 * read, so it does not run without one.
 */
export async function resolveSourceCommit(
  source,
  { ref = source.ref, fetchImpl = fetch, listRemoteRef = listRemoteRefWithGit } = {},
) {
  if (COMMIT_SHA_PATTERN.test(ref)) {
    return ref;
  }

  const failures = [];

  try {
    const response = await fetchImpl(buildSourceCommitUrl(source, ref), {
      headers: { ...buildGithubRequestHeaders(), Accept: 'application/vnd.github.sha' },
    });

    if (response.ok) {
      const sha = String(await response.text()).trim();

      if (COMMIT_SHA_PATTERN.test(sha)) {
        return sha;
      }

      failures.push(`the GitHub API answered "${sha.slice(0, 60)}", not a commit`);
    } else {
      failures.push(`the GitHub API answered ${response.status}`);
    }
  } catch (error) {
    failures.push(`the GitHub API failed (${error?.message ?? error})`);
  }

  try {
    const sha = String(await listRemoteRef(source, ref)).trim();

    if (COMMIT_SHA_PATTERN.test(sha)) {
      return sha;
    }

    failures.push(`git ls-remote found no branch or tag "${ref}"`);
  } catch (error) {
    failures.push(`git ls-remote failed (${error?.message ?? error})`);
  }

  throw new Error(
    `Could not resolve ${source.repository}@${ref} to a commit: ${failures.join('; ')}. The import records the commit it read, so it does not run without one.`,
  );
}

export function buildPackListingUrl(source, pack) {
  return `${source.githubApiBase}/contents/${pack.listingPath}?ref=${source.ref}`;
}

export function extractSourceVersion(versionSource) {
  const match = String(versionSource).match(/dbVersion\s*=\s*["']?([^"';\s]+)["']?/);
  return match?.[1] ?? 'unknown';
}

export function parseArgs(args = process.argv.slice(2)) {
  const defaults = {
    downloadImages: 'none',
    source: '2shankz',
    /*
     * 869f63gtc. `--ref=<branch, tag or commit>` reads the source at that point instead of its
     * branch head - the way to rebuild a dataset from the commit its manifest records.
     */
    ref: null,
    allowStaleSource: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--download-images=')) {
      defaults.downloadImages = arg.split('=')[1];
      continue;
    }

    if (arg.startsWith('--source=')) {
      defaults.source = arg.split('=')[1];
      continue;
    }

    if (arg.startsWith('--ref=')) {
      defaults.ref = arg.slice('--ref='.length).trim() || null;
      continue;
    }

    if (arg === STALE_SOURCE_FLAG) {
      defaults.allowStaleSource = true;
    }
  }

  const source = resolveImportSource(defaults.source);

  if (source.stale && !defaults.allowStaleSource) {
    throw new Error(
      `Refusing --source=${source.key}: ${source.stale.reason} Pass ${STALE_SOURCE_FLAG} if the stale data is really intended.`,
    );
  }

  return defaults;
}

function buildGithubRequestHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || '';

  if (!token) {
    return githubHeaders;
  }

  return {
    ...githubHeaders,
    Authorization: `Bearer ${token}`,
  };
}

async function buildHttpError(response, url, source) {
  const responseText = await response.text().catch(() => '');
  const error = new Error(`Failed to fetch ${url} from ${source.label}: ${response.status}`);
  error.status = response.status;
  error.url = url;
  error.sourceKey = source.key;
  error.responseText = responseText;
  error.isGithubRateLimit = response.status === 403 && /rate limit exceeded/i.test(responseText);
  return error;
}

async function fetchText(url, source) {
  return withRetries(async () => {
    const response = await fetch(url, { headers: buildGithubRequestHeaders() });

    if (!response.ok) {
      throw await buildHttpError(response, url, source);
    }

    return response.text();
  });
}

async function fetchJson(url, source) {
  return withRetries(async () => {
    const response = await fetch(url, { headers: buildGithubRequestHeaders() });

    if (!response.ok) {
      throw await buildHttpError(response, url, source);
    }

    return response.json();
  });
}

async function withRetries(operation, attempts = 4) {
  let lastError = null;

  for (let index = 0; index < attempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (index + 1)));
    }
  }

  throw lastError;
}

function createSandbox() {
  const target = {
    window: {},
    console: {
      log: noop,
      warn: noop,
      error: noop,
    },
    UnitUtils: new Proxy(
      {},
      {
        get: () => noop,
      },
    ),
    calcGhostStartID: 0,
    calcDualStartID: 0,
    calcSwapStartID: 0,
    calcVSStartID: 0,
    calcSuperStartID: 0,
    calcSupportStartID: 0,
    calcLastTapStartID: 0,
    calcLinkStartID: 0,
  };

  target.global = target;
  target.globalThis = target;
  target.self = target.window;

  return new Proxy(target, {
    get(currentTarget, property) {
      if (property in currentTarget) {
        return currentTarget[property];
      }

      if (property in globalThis) {
        return globalThis[property];
      }

      return noop;
    },
    has() {
      return true;
    },
    set(currentTarget, property, value) {
      currentTarget[property] = value;
      return true;
    },
  });
}

async function evaluateLegacyFile(relativePath, source) {
  const fileSource = await fetchText(buildSourceFileUrl(source, relativePath), source);
  const sandbox = createSandbox();
  vm.runInNewContext(fileSource, sandbox, { timeout: 20_000 });
  return sandbox.window;
}

async function fetchVersion(source) {
  const versionSource = await fetchText(
    buildSourceFileUrl(source, 'common/data/version.js'),
    source,
  );
  return extractSourceVersion(versionSource);
}

function normalizePackPaths(tree, pack, source) {
  return tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.endsWith('.png'))
    .map((entry) => ({
      localPath: entry.path,
      bytes: entry.size,
      url: buildSourceFileUrl(source, `${pack.listingPath}/${pack.entryName}/${entry.path}`),
    }));
}

async function buildPackTrees(source) {
  const packTrees = [];

  for (const pack of packDefinitions) {
    const listing = await fetchJson(buildPackListingUrl(source, pack), source);
    const directory = listing.find((entry) => entry.name === pack.entryName);

    if (!directory) {
      throw new Error(`Missing GitHub tree for ${pack.id} in ${source.label}`);
    }

    const tree = await fetchJson(
      `${source.githubApiBase}/git/trees/${directory.sha}?recursive=1`,
      source,
    );
    packTrees.push({
      ...pack,
      files: normalizePackPaths(tree, pack, source),
    });
  }

  return packTrees;
}

async function loadCachedPackStatuses() {
  try {
    const manifestPath = path.join(dataDir, 'optc-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const cachedPacks = Array.isArray(manifest?.packs) ? manifest.packs : [];
    return new Map(cachedPacks.map((pack) => [pack.key, pack]));
  } catch {
    return new Map();
  }
}

async function buildFallbackPackStatuses() {
  const cachedPackStatuses = await loadCachedPackStatuses();

  return Promise.all(
    packDefinitions.map(async (pack) => {
      const cached = cachedPackStatuses.get(pack.key) ?? null;
      const installed = await fileExists(path.join(offlineDir, pack.id, '.pack-ready'));

      return {
        key: pack.key,
        id: pack.id,
        label: pack.label,
        localBasePath: `assets/offline-packs/${pack.id}`,
        fileCount: cached?.fileCount ?? 0,
        totalBytes: cached?.totalBytes ?? 0,
        installed,
        checksum: cached?.checksum ?? null,
      };
    }),
  );
}

export function shouldDownloadPack(mode, packId) {
  if (mode === 'all') {
    return true;
  }

  if (mode === 'thumbnails') {
    return (
      packId === 'thumbnails-glo' || packId === 'thumbnails-jap' || packId === 'ship-thumbnails'
    );
  }

  return mode === packId;
}

async function fileExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function downloadPackFiles(pack, mode) {
  const targetRoot = path.join(offlineDir, pack.id);
  const shouldDownload = shouldDownloadPack(mode, pack.id);

  await mkdir(targetRoot, { recursive: true });

  if (!shouldDownload) {
    return {
      installed: await fileExists(path.join(targetRoot, '.pack-ready')),
      downloadedCount: 0,
    };
  }

  let downloadedCount = 0;
  const concurrency = 8;
  let index = 0;

  async function worker() {
    while (index < pack.files.length) {
      const fileIndex = index;
      index += 1;
      const file = pack.files[fileIndex];
      const targetPath = path.join(targetRoot, file.localPath);

      if (await fileExists(targetPath)) {
        continue;
      }

      await mkdir(path.dirname(targetPath), { recursive: true });
      const response = await fetch(file.url, { headers: githubHeaders });

      if (!response.ok) {
        throw new Error(`Failed to download ${file.url}: ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(targetPath, buffer);
      downloadedCount += 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await writeFile(path.join(targetRoot, '.pack-ready'), `${new Date().toISOString()}\n`);

  return {
    installed: true,
    downloadedCount,
  };
}

function buildCharacterAssetsMap(packs) {
  const assetMap = new Map();

  for (const pack of packs) {
    const entriesByCharacterId = new Map();

    for (const file of pack.files) {
      const assetReference = parseAssetReference(file.localPath);

      if (!assetReference) {
        continue;
      }

      const currentEntries = entriesByCharacterId.get(assetReference.characterId) ?? [];
      currentEntries.push(file.localPath);
      entriesByCharacterId.set(assetReference.characterId, currentEntries);
    }

    for (const [characterId, filePaths] of entriesByCharacterId.entries()) {
      const preferredPath = [...filePaths].sort(compareAssetPaths)[0];
      const current = assetMap.get(characterId) ?? createEmptyAssets();
      const targetField = packKeyToField[pack.key];

      if (targetField) {
        current[targetField] = preferredPath;
      }

      assetMap.set(characterId, current);
    }
  }

  return assetMap;
}

function parseAssetReference(localPath) {
  const basename = path.basename(localPath);
  const match = basename.match(/^(\d{4})(?:-([A-Za-z0-9]+))?\.png$/);

  if (!match) {
    return null;
  }

  return {
    characterId: Number(match[1]),
    suffix: match[2] ?? null,
  };
}

function compareAssetPaths(leftPath, rightPath) {
  const leftReference = parseAssetReference(leftPath);
  const rightReference = parseAssetReference(rightPath);

  if (!leftReference || !rightReference) {
    return leftPath.localeCompare(rightPath);
  }

  const leftRank = getAssetSuffixRank(leftReference.suffix);
  const rightRank = getAssetSuffixRank(rightReference.suffix);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (
    leftReference.suffix &&
    rightReference.suffix &&
    /^\d+$/.test(leftReference.suffix) &&
    /^\d+$/.test(rightReference.suffix)
  ) {
    return Number(leftReference.suffix) - Number(rightReference.suffix);
  }

  return leftPath.localeCompare(rightPath);
}

function getAssetSuffixRank(suffix) {
  if (!suffix) {
    return 0;
  }

  if (/^\d+$/.test(suffix)) {
    return 10 + Number(suffix);
  }

  if (typeSuffixOrder.has(suffix)) {
    return 100 + (typeSuffixOrder.get(suffix) ?? 0);
  }

  return 1000;
}

function buildPackFileIndexes(packs) {
  return new Map(
    packs.map((pack) => [pack.key, new Map(pack.files.map((file) => [file.localPath, file]))]),
  );
}

export function buildDeterministicCharacterAssetsMap(characterCount, utilsWindow) {
  const thumbnailGetter = utilsWindow?.Utils?.getThumbnailUrl;
  const assetMap = new Map();

  if (typeof thumbnailGetter !== 'function') {
    return assetMap;
  }

  for (let characterId = 1; characterId <= characterCount; characterId += 1) {
    const current = createEmptyAssets();
    const thumbnails = thumbnailGetter(characterId, '');
    const globalReference = parseThumbnailAssetUrl(thumbnails?.glo ?? null);
    const japanReference = parseThumbnailAssetUrl(thumbnails?.jap ?? null);

    if (globalReference?.relativePath) {
      current.thumbnailGlobal = globalReference.relativePath;
    }

    if (japanReference?.relativePath) {
      current.thumbnailJapan = japanReference.relativePath;
    }

    assetMap.set(characterId, current);
  }

  return assetMap;
}

function parseThumbnailAssetUrl(url) {
  const match = String(url).match(/\/api\/images\/thumbnail\/(glo|jap)\/(.+\.png)$/);

  if (!match) {
    return null;
  }

  return {
    packKey: packEntryNameMap[match[1]] ?? null,
    relativePath: match[2],
  };
}

function buildDefaultThumbnailRelativePath(characterId) {
  const normalizedId = Number(characterId);
  return `${Math.trunc(normalizedId / 1000)}/${Math.trunc((normalizedId % 1000) / 100)}00/${String(normalizedId).padStart(4, '0')}.png`;
}

function buildDeterministicThumbnailOverrides(characterCount, utilsWindow, packFileIndexes) {
  const getter = utilsWindow?.Utils?.getThumbnailUrl;

  if (typeof getter !== 'function') {
    throw new Error('Unable to evaluate upstream thumbnail mapping utility.');
  }

  const overrides = new Map();

  for (let characterId = 1; characterId <= characterCount; characterId += 1) {
    const assetReference = parseThumbnailAssetUrl(getter(characterId, ''));

    if (!assetReference?.packKey) {
      continue;
    }

    const packIndex = packFileIndexes.get(assetReference.packKey);

    if (!packIndex?.has(assetReference.relativePath)) {
      continue;
    }

    const isDefaultJapanPath =
      assetReference.packKey === 'thumbnailsJapan' &&
      assetReference.relativePath === buildDefaultThumbnailRelativePath(characterId);

    if (isDefaultJapanPath) {
      continue;
    }

    overrides.set(characterId, assetReference);
  }

  return overrides;
}

function mergeThumbnailOverrides(assetsById, thumbnailOverrides) {
  for (const [characterId, assetReference] of thumbnailOverrides.entries()) {
    const current = assetsById.get(characterId) ?? createEmptyAssets();
    const targetField = packKeyToField[assetReference.packKey];

    if (!targetField) {
      continue;
    }

    current[targetField] = assetReference.relativePath;
    assetsById.set(characterId, current);
  }

  return assetsById;
}

function buildPackAssetOverridesFromExactOverrides(exactOverrides) {
  const assetOverrides = new Map();

  for (const [characterId, override] of exactOverrides.entries()) {
    if (override.source !== 'upstream') {
      continue;
    }

    assetOverrides.set(characterId, {
      packKey: override.packKey,
      relativePath: override.relativePath,
    });
  }

  return assetOverrides;
}

async function loadCharacterImageOverrides() {
  try {
    const rawOverrides = JSON.parse(await readFile(overrideConfigPath, 'utf8'));
    const overrides = new Map();

    for (const [rawCharacterId, entry] of Object.entries(rawOverrides)) {
      const characterId = Number(rawCharacterId);

      if (!Number.isInteger(characterId) || characterId <= 0) {
        throw new Error(
          `Invalid character id in ${path.relative(rootDir, overrideConfigPath)}: ${rawCharacterId}`,
        );
      }

      overrides.set(characterId, normalizeOverrideEntry(characterId, entry));
    }

    return overrides;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }
}

async function loadShipThumbnailOverrides() {
  try {
    const rawOverrides = JSON.parse(await readFile(shipThumbnailOverrideConfigPath, 'utf8'));
    const overrides = new Map();

    for (const [rawShipId, entry] of Object.entries(rawOverrides)) {
      const shipId = Number(rawShipId);

      if (!Number.isInteger(shipId) || shipId <= 0) {
        throw new Error(
          `Invalid ship id in ${path.relative(rootDir, shipThumbnailOverrideConfigPath)}: ${rawShipId}`,
        );
      }

      overrides.set(shipId, normalizeShipThumbnailOverrideEntry(shipId, entry));
    }

    return overrides;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }
}

async function loadPartyConflictOverrides() {
  try {
    return normalizePartyConflictOverrideMap(
      JSON.parse(await readFile(partyConflictOverridesPath, 'utf8')),
    );
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }
}

function normalizeOverrideEntry(characterId, entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid override entry for character ${characterId}.`);
  }

  if (entry.source === 'upstream') {
    if (!packKeyToField[entry.packKey]) {
      throw new Error(`Invalid upstream pack key for character ${characterId}: ${entry.packKey}`);
    }

    if (typeof entry.relativePath !== 'string' || !entry.relativePath.endsWith('.png')) {
      throw new Error(`Invalid upstream relativePath for character ${characterId}.`);
    }

    return {
      source: 'upstream',
      packKey: entry.packKey,
      relativePath: entry.relativePath,
    };
  }

  if (entry.source === 'manual') {
    if (typeof entry.file !== 'string' || !entry.file.trim()) {
      throw new Error(`Invalid manual image file for character ${characterId}.`);
    }

    return {
      source: 'manual',
      file: entry.file.trim(),
    };
  }

  throw new Error(`Unsupported override source for character ${characterId}.`);
}

function normalizeShipThumbnailOverrideEntry(shipId, entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid ship thumbnail override entry for ship ${shipId}.`);
  }

  if (typeof entry.file !== 'string' || !entry.file.trim().endsWith('.png')) {
    throw new Error(`Invalid ship thumbnail file for ship ${shipId}.`);
  }

  return {
    file: entry.file.trim(),
  };
}

async function materializeExactImageSources(
  source,
  exactSources,
  packTrees,
  packFileIndexes,
  options = {},
) {
  const shouldClearDirectory = options.clearDir ?? true;

  if (shouldClearDirectory) {
    await rm(exactImagesDir, { recursive: true, force: true });
  }

  await mkdir(exactImagesDir, { recursive: true });

  if (!exactSources.size) {
    return new Map();
  }

  const packByKey = new Map(packDefinitions.map((pack) => [pack.key, pack]));
  const exactLocalPaths = new Map();

  for (const [characterId, exactSource] of exactSources.entries()) {
    const destinationExtension =
      exactSource.source === 'manual' ? path.extname(exactSource.file) || '.png' : '.png';
    const destinationFilename = `${characterId}${destinationExtension}`;
    const destinationPath = path.join(exactImagesDir, destinationFilename);
    const publicPath = `assets/exact-character-images/${destinationFilename}`;

    if (exactSource.source === 'manual') {
      const sourcePath = path.join(manualExactImageSourceDir, exactSource.file);
      await copyFile(sourcePath, destinationPath);
      exactLocalPaths.set(characterId, publicPath);
      continue;
    }

    const packIndex = packFileIndexes.get(exactSource.packKey);
    const pack = packByKey.get(exactSource.packKey);

    if (!pack) {
      throw new Error(
        `Missing upstream asset pack definition for character ${characterId}: ${exactSource.packKey}`,
      );
    }

    if (packIndex && !packIndex.has(exactSource.relativePath)) {
      throw new Error(
        `Missing upstream asset override source for character ${characterId}: ${exactSource.packKey}/${exactSource.relativePath}`,
      );
    }

    const response = await fetch(
      buildSourceFileUrl(
        source,
        `${pack.listingPath}/${pack.entryName}/${exactSource.relativePath}`,
      ),
      {
        headers: buildGithubRequestHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to download exact image for character ${characterId}: ${response.status}`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destinationPath, buffer);
    exactLocalPaths.set(characterId, publicPath);
  }

  return exactLocalPaths;
}

async function materializeShipThumbnailOverrides(shipThumbnailOverrides, shipPackInstalled) {
  if (!shipPackInstalled || !shipThumbnailOverrides.size) {
    return {
      copiedCount: 0,
      totalBytes: 0,
    };
  }

  const targetRoot = path.join(offlineDir, 'ship-thumbnails');

  await mkdir(targetRoot, { recursive: true });

  let copiedCount = 0;
  let totalBytes = 0;

  for (const override of shipThumbnailOverrides.values()) {
    const sourcePath = path.join(manualShipThumbnailSourceDir, override.file);
    const destinationPath = path.join(targetRoot, override.file);

    await copyFile(sourcePath, destinationPath);
    const { size } = await stat(destinationPath);
    copiedCount += 1;
    totalBytes += size;
  }

  return {
    copiedCount,
    totalBytes,
  };
}

function isPlaceholderCharacterEntry(entry) {
  const name = String(entry?.[0] ?? '').trim();
  const type = String(entry?.[1] ?? '').trim();
  const classes = normalizeCharacterClasses(entry?.[2] ?? []);
  const numericFields = entry?.slice?.(3) ?? [];
  const hasAnyNumericValue = numericFields.some(
    (value) => Number.isFinite(Number(value)) && Number(value) > 0,
  );

  return name.length === 0 && type === 'Type' && classes.length === 0 && !hasAnyNumericValue;
}

// Upstream spells an in-game glyph as markup in one name today: #937 "Monkey D. Luffy - Crew's
// Promise: <icon=common_font_3D2Y.png>", the 3D2Y mark. Shipped as-is it printed the tag, one
// unbreakable ~499px word the detail hero clipped on every phone. A common_font_ icon draws its
// own text, so it becomes that text; any other tag has nothing to show and is dropped. Runs of
// whitespace collapse too - eight names ship a double space, e.g. "Sanji  - Voyage Log".
function normalizeCharacterName(value) {
  return String(value ?? '')
    .replace(/<icon=common_font_([A-Za-z0-9]+)\.png>/gu, '$1')
    .replace(/<[^>]*>/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStars(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/\d+/);
  const numericValue = match ? Number(match[0]) : Number(value);
  const stars = Number.isFinite(numericValue) ? numericValue : 0;

  return {
    stars,
    starsLabel: text.length ? text : String(stars),
  };
}

function parseUnitMapId(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d+)(?:-(.+))?$/);

  if (!match) {
    return null;
  }

  const baseCharacterId = Number(match[1]);

  if (!Number.isInteger(baseCharacterId) || baseCharacterId <= 0) {
    return null;
  }

  return {
    baseCharacterId,
    variantKey: match[2] ?? null,
  };
}

function normalizeUnitTypeTokens(value) {
  return flattenValues(value)
    .flatMap((entry) => String(entry ?? '').split(','))
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => validUnitTypeSet.has(entry));
}

function normalizeUnitMapEntry(
  unitEntry,
  fallbackCharacterId,
  variantTypesByCharacterId = new Map(),
) {
  if (!unitEntry || typeof unitEntry !== 'object' || Array.isArray(unitEntry)) {
    return null;
  }

  const parsedEntryId = parseUnitMapId(unitEntry.id);
  const characterId = parsedEntryId?.baseCharacterId ?? fallbackCharacterId;
  const classes = normalizeCharacterClasses(unitEntry.class ?? []);
  const explicitType = String(unitEntry.type ?? '').trim();
  const variantType = (variantTypesByCharacterId.get(characterId) ?? []).join(',');
  const normalizedStars = normalizeStars(unitEntry.stars);

  return {
    characterId,
    entry: unitEntry,
    classes,
    type: explicitType || variantType,
    name: normalizeCharacterName(unitEntry.name),
    stars: normalizedStars.stars,
    starsLabel: normalizedStars.starsLabel,
    cost: toFiniteNumber(unitEntry.cost),
    combo: toFiniteNumber(unitEntry.combo),
    maxSockets: toFiniteNumber(unitEntry.sockets),
    minHp: toFiniteNumber(unitEntry.minHP),
    minAtk: toFiniteNumber(unitEntry.minATK),
    minRcv: toFiniteNumber(unitEntry.minRCV),
    maxHp: toFiniteNumber(unitEntry.maxHP),
    maxAtk: toFiniteNumber(unitEntry.maxATK),
    maxRcv: toFiniteNumber(unitEntry.maxRCV),
    growth: toFiniteNumber(unitEntry.growth),
  };
}

export function normalizeCharacterTags(value) {
  return [
    ...new Set(
      flattenValues(value)
        .map((entry) => String(entry ?? '').trim())
        .filter((entry) => entry.length > 0),
    ),
  ];
}

function buildNormalizedUnitEntries(units) {
  if (Array.isArray(units)) {
    return units.flatMap((entry, index) => {
      if (isPlaceholderCharacterEntry(entry)) {
        return [];
      }

      const characterId = index + 1;
      const classes = normalizeCharacterClasses(entry[2]);
      const normalizedStars = normalizeStars(entry[3]);

      return [
        {
          characterId,
          entry,
          classes,
          type: entry[1],
          name: normalizeCharacterName(entry[0]),
          stars: normalizedStars.stars,
          starsLabel: normalizedStars.starsLabel,
          cost: toFiniteNumber(entry[4]),
          combo: toFiniteNumber(entry[5]),
          maxSockets: toFiniteNumber(entry[6]),
          minHp: toFiniteNumber(entry[9]),
          minAtk: toFiniteNumber(entry[10]),
          minRcv: toFiniteNumber(entry[11]),
          maxHp: toFiniteNumber(entry[12]),
          maxAtk: toFiniteNumber(entry[13]),
          maxRcv: toFiniteNumber(entry[14]),
          growth: toFiniteNumber(entry[15]),
        },
      ];
    });
  }

  if (!units || typeof units !== 'object') {
    return [];
  }

  const unitEntries = Object.entries(units);
  const variantTypesByCharacterId = new Map();

  for (const [rawCharacterId, entry] of unitEntries) {
    const parsedMapId = parseUnitMapId(rawCharacterId);
    const parsedEntryId = parseUnitMapId(entry?.id);
    const baseCharacterId = parsedEntryId?.baseCharacterId ?? parsedMapId?.baseCharacterId;
    const variantKey = parsedEntryId?.variantKey ?? parsedMapId?.variantKey;

    if (!baseCharacterId || !variantKey) {
      continue;
    }

    const existingTypes = variantTypesByCharacterId.get(baseCharacterId) ?? [];

    for (const type of normalizeUnitTypeTokens(entry?.type)) {
      if (!existingTypes.includes(type)) {
        existingTypes.push(type);
      }
    }

    variantTypesByCharacterId.set(baseCharacterId, existingTypes);
  }

  return Object.entries(units)
    .filter(([rawCharacterId, entry]) => {
      const parsedMapId = parseUnitMapId(rawCharacterId);
      const parsedEntryId = parseUnitMapId(entry?.id);

      return !(parsedEntryId?.variantKey ?? parsedMapId?.variantKey);
    })
    .map(([rawCharacterId, entry]) => {
      const fallbackCharacterId =
        parseUnitMapId(rawCharacterId)?.baseCharacterId ?? Number(rawCharacterId);

      return normalizeUnitMapEntry(entry, fallbackCharacterId, variantTypesByCharacterId);
    })
    .filter((entry) => Boolean(entry))
    .sort((left, right) => left.characterId - right.characterId);
}

function resolveCharacterIterationLimit(units) {
  if (Array.isArray(units)) {
    return units.length;
  }

  if (!units || typeof units !== 'object') {
    return 0;
  }

  return Object.keys(units).reduce((maxCharacterId, rawCharacterId) => {
    const characterId = Number(rawCharacterId);
    return Number.isInteger(characterId) && characterId > maxCharacterId
      ? characterId
      : maxCharacterId;
  }, 0);
}

function normalizeSupportData(rawSupportData) {
  return (Array.isArray(rawSupportData) ? rawSupportData : [])
    .map((entry) => {
      const supportedCharactersText = String(
        entry?.supportedCharactersText ?? entry?.Characters ?? '',
      ).trim();
      const levelDescriptions = (
        Array.isArray(entry?.levelDescriptions)
          ? entry.levelDescriptions
          : Array.isArray(entry?.description)
            ? entry.description
            : []
      )
        .map((description) => String(description ?? '').trim())
        .filter((description) => description.length > 0);
      const maxLevelDescription = levelDescriptions.at(-1);

      if (!supportedCharactersText.length && !maxLevelDescription) {
        return null;
      }

      return {
        supportedCharactersText,
        levelDescriptions: maxLevelDescription ? [maxLevelDescription] : [],
      };
    })
    .filter((entry) => Boolean(entry));
}

function normalizePotentialAbilities(rawPotentialAbilities) {
  return (Array.isArray(rawPotentialAbilities) ? rawPotentialAbilities : [])
    .map((entry, index) => {
      const name = String(entry?.Name ?? entry?.name ?? '').trim();
      const descriptions = (
        Array.isArray(entry?.description)
          ? entry.description
          : Array.isArray(entry?.descriptions)
            ? entry.descriptions
            : []
      )
        .map((description) => String(description ?? '').trim())
        .filter((description) => description.length > 0);
      const maxDescription = descriptions.at(-1);

      if (!name.length && !maxDescription) {
        return null;
      }

      return {
        ...(name.length ? { Name: name } : { Name: `Potential ${index + 1}` }),
        description: maxDescription ? [maxDescription] : [],
      };
    })
    .filter((entry) => Boolean(entry));
}

function normalizeSuperTandemData(rawSuperTandemData, rawSuperTandem) {
  if (rawSuperTandemData && typeof rawSuperTandemData === 'object') {
    return rawSuperTandemData;
  }

  if (!rawSuperTandem || typeof rawSuperTandem !== 'object') {
    return null;
  }

  const characterConditions = Array.isArray(rawSuperTandem.characterCondition)
    ? rawSuperTandem.characterCondition
        .map((entry) => normalizeLegacyAbilityText(entry))
        .filter((entry) => entry.length > 0)
    : [];
  const descriptions = Array.isArray(rawSuperTandem.description)
    ? rawSuperTandem.description
        .map((entry) => normalizeLegacyAbilityText(entry))
        .filter((entry) => entry.length > 0)
    : [];
  const requirement = characterConditions.at(-1) ?? null;
  const effect = descriptions.at(-1) ?? null;
  const level = Math.max(characterConditions.length, descriptions.length);

  if (!requirement && !effect) {
    return null;
  }

  return {
    requirement,
    levels: effect
      ? [
          {
            level: level > 0 ? level : 1,
            effect,
          },
        ]
      : [],
    criteria: requirement ? parseSuperSpecialCriteria(requirement) : null,
  };
}

const CAPTAIN_VARIANT_ORDER = [
  'base',
  'level1',
  'level2',
  'level3',
  'level4',
  'level5',
  'level6',
  'llbbase',
  'llblevel1',
  'llblevel2',
  'llblevel3',
  'llblevel4',
  'llblevel5',
  'llblevel6',
  'character1',
  'character2',
  'combined',
  'llbcharacter1',
  'llbcharacter2',
  'llbcombined',
];

function resolveCaptainAbilityVariantLabel(key) {
  if (key === 'base') {
    return 'Base Captain Ability';
  }

  if (key.startsWith('level')) {
    return `Limit Break Level ${key.slice('level'.length)} Captain Ability`;
  }

  if (key === 'llbbase') {
    return 'LLB Base Captain Ability';
  }

  if (key.startsWith('llblevel')) {
    return `LLB Level ${key.slice('llblevel'.length)} Captain Ability`;
  }

  if (key === 'character1') {
    return 'Captain Ability (Character 1)';
  }

  if (key === 'character2') {
    return 'Captain Ability (Character 2)';
  }

  if (key === 'combined') {
    return 'Captain Ability (Combined)';
  }

  if (key === 'llbcharacter1') {
    return 'LLB Captain Ability (Character 1)';
  }

  if (key === 'llbcharacter2') {
    return 'LLB Captain Ability (Character 2)';
  }

  if (key === 'llbcombined') {
    return 'LLB Captain Ability (Combined)';
  }

  return 'Captain Ability';
}

function normalizeCaptainAbilityVariants(rawCaptainAbility) {
  if (typeof rawCaptainAbility === 'string') {
    const text = normalizeLegacyAbilityText(rawCaptainAbility);

    return text.length
      ? [
          {
            key: 'captain',
            label: 'Captain Ability',
            text,
          },
        ]
      : [];
  }

  if (
    !rawCaptainAbility ||
    typeof rawCaptainAbility !== 'object' ||
    Array.isArray(rawCaptainAbility)
  ) {
    return [];
  }

  const variants = [];
  const seenKeys = new Set();

  CAPTAIN_VARIANT_ORDER.forEach((key) => {
    if (!(key in rawCaptainAbility)) {
      return;
    }

    const text = normalizeLegacyAbilityText(rawCaptainAbility[key]);

    if (!text.length) {
      return;
    }

    variants.push({
      key,
      label: resolveCaptainAbilityVariantLabel(key),
      text,
    });
    seenKeys.add(key);
  });

  Object.entries(rawCaptainAbility).forEach(([key, value]) => {
    if (seenKeys.has(key)) {
      return;
    }

    const text = normalizeLegacyAbilityText(value);

    if (!text.length) {
      return;
    }

    variants.push({
      key,
      label: resolveCaptainAbilityVariantLabel(key),
      text,
    });
  });

  return variants;
}

export function normalizeCharacterDetail(
  detail,
  characterId,
  rumbleData = null,
  characterTags = [],
) {
  const normalizedCaptainAbilityVariants = normalizeCaptainAbilityVariants(detail.captain ?? null);
  const normalizedCaptainAbility = normalizedCaptainAbilityVariants[0]?.text ?? null;
  const normalizedSpecialText = normalizeLegacyAbilityText(detail.special ?? null) || null;
  const normalizedSuperSpecialText =
    normalizeLegacyAbilityText(detail.superSpecial ?? null) || null;
  const normalizedSuperSpecialCriteriaText =
    normalizeLegacyAbilityText(detail.superSpecialCriteria ?? null) || null;
  const normalizedCaptainNotes = normalizeLegacyAbilityText(detail.captainNotes ?? null) || null;
  const normalizedSpecialNotes = normalizeLegacyAbilityText(detail.specialNotes ?? null) || null;
  const normalizedSuperSpecialNotes =
    normalizeLegacyAbilityText(detail.superSpecialNotes ?? null) || null;
  const normalizedSailorNotes = normalizeLegacyAbilityText(detail.sailorNotes ?? null) || null;
  const normalizedSailorAbilities = flattenValues(detail.sailor ?? {})
    .map((entry) => normalizeLegacyAbilityText(entry))
    .filter((entry) => entry.length > 0);

  return {
    characterId,
    captainAbility: normalizedCaptainAbility,
    captainAbilityVariants: normalizedCaptainAbilityVariants,
    captainAbilityCoverage: buildCaptainAbilityCoverage(normalizedCaptainAbilityVariants),
    captainNotes: normalizedCaptainNotes,
    specialName: detail.specialName ?? null,
    specialText: normalizedSpecialText,
    specialNotes: normalizedSpecialNotes,
    superSpecialText: normalizedSuperSpecialText,
    superSpecialCriteriaText: normalizedSuperSpecialCriteriaText,
    superSpecialNotes: normalizedSuperSpecialNotes,
    superSpecialCriteria: normalizedSuperSpecialCriteriaText
      ? parseSuperSpecialCriteria(normalizedSuperSpecialCriteriaText)
      : null,
    partyConflictKeys: [],
    characterTags: normalizeCharacterTags(characterTags),
    builderAbilities: [],
    sailorAbilities: normalizedSailorAbilities,
    sailorNotes: normalizedSailorNotes,
    potentialAbilities: normalizePotentialAbilities(detail.potential),
    supportData: normalizeSupportData(detail.support),
    swapData: detail.swap ?? null,
    vsSpecial: detail.vsSpecial ?? null,
    superType: detail.superType ?? null,
    superTandemData: normalizeSuperTandemData(detail.superTandemData, detail.superTandem),
    finalTapData:
      detail.finalTapData && typeof detail.finalTapData === 'object' ? detail.finalTapData : null,
    rushSugoSpecialData:
      detail.rushSugoSpecialData && typeof detail.rushSugoSpecialData === 'object'
        ? detail.rushSugoSpecialData
        : null,
    superClass: detail.superClass ?? null,
    rumbleData,
  };
}

/**
 * 869f13284 / 869f1328r. The unit's real release availability, from upstream `common/data/flags.js`.
 *
 * Three states, and the third is the point:
 *
 * - `true`  - upstream carries a flag row for the unit and it has `global: 1`. It is on Global.
 * - `false` - upstream carries a flag row and it has no `global` key. Japan-only. 933 units in the
 *             dataset measured on 2026-09-15 are this, and every one of them was previously
 *             reported as available on Global by the thumbnail proxy.
 * - `null`  - upstream carries NO flag row for the unit. We do not know, which is not the same
 *             fact as "not available", and the UI must render nothing rather than guess. 221 units
 *             measured on 2026-09-15 are this.
 *
 * Collapsing `null` into `false` would state an absence as a fact - the exact failure the field it
 * replaces committed for 927 units.
 */
export function resolveRegionRelease(flagEntry) {
  if (!flagEntry || typeof flagEntry !== 'object') {
    return { availableOnGlobal: null };
  }

  return { availableOnGlobal: Boolean(flagEntry.global) };
}

/**
 * 869f63grj. The character(s) on one card, from upstream `common/data/families.js`: one name per
 * character, spelled as upstream spells it (`"Monkey D. Luffy"`), in upstream's order, each once.
 *
 * `[]` means upstream has no entry for the unit - 82 units measured on 2026-09-24, nearly all of
 * them fodder - and the app then decides "same character" from the card name, as it did for every
 * unit before this. It is never a claim that the card has no character.
 */
export function resolveCharacterFamilies(familyEntry) {
  if (!Array.isArray(familyEntry)) {
    return [];
  }

  return [
    ...new Set(
      familyEntry
        .filter((family) => typeof family === 'string')
        .map((family) => family.trim())
        .filter((family) => family.length > 0),
    ),
  ];
}

function listFormRows(units) {
  if (!units || typeof units !== 'object' || Array.isArray(units)) {
    return [];
  }

  return Object.entries(units).flatMap(([rawKey, entry]) => {
    const parsedMapId = parseUnitMapId(rawKey);
    const parsedEntryId = parseUnitMapId(entry?.id);
    const baseCharacterId = parsedEntryId?.baseCharacterId ?? parsedMapId?.baseCharacterId;
    const variantKey = parsedEntryId?.variantKey ?? parsedMapId?.variantKey;

    return baseCharacterId && variantKey && entry && typeof entry === 'object'
      ? [{ rawKey, baseCharacterId, variantKey, entry }]
      : [];
  });
}

/**
 * 869f63gv6. The fields a form row drops (`FORM_DROPPED_FIELDS`) are dropped because every one of
 * them is empty in every form row. The import checks that before it reads anything, and stops -
 * naming each field, how many rows carry it and the first - rather than drop real data with no
 * trace, which is what the type-only read did.
 *
 * Only the import runs this. The nightly release check normalizes the same units to find new ids,
 * and its own fixtures require it to tolerate variant rows of shapes nobody has seen yet.
 */
export function assertFormRowsDropNothing(units) {
  const carriedDroppedFields = new Map();

  for (const { rawKey, entry } of listFormRows(units)) {
    for (const field of FORM_DROPPED_FIELDS) {
      if (!isEmptyUpstreamValue(entry[field])) {
        carriedDroppedFields.set(field, [...(carriedDroppedFields.get(field) ?? []), rawKey]);
      }
    }
  }

  if (carriedDroppedFields.size > 0) {
    const carried = [...carriedDroppedFields.entries()]
      .map(([field, keys]) => `${field} in ${keys.length} (first ${keys[0]})`)
      .join(', ');

    throw new Error(
      `units.js form rows carry values in fields the import drops as always empty: ${carried}. Keep the field in FORM_UPSTREAM_SOURCES and the character_forms table, or confirm upstream left it empty, before importing.`,
    );
  }
}

/**
 * 869f63gv6. A dual or VS unit's forms, from the `<id>-<n>` keys of upstream's units.js - 414 keys
 * for 207 units, two each, when this was written. They were read for their TYPE alone (merged into
 * the unit's comma-joined `type`) and everything else was dropped without a record: #1983 Smoker &
 * Tashigi is Striker/Slasher, its Smoker form INT Striker/Driven and its Tashigi form PSY
 * Slasher/Cerebral, so a Driven filter never saw the Smoker form.
 *
 * Returns `characterId -> forms`, each form `{ key, ...FORM_UPSTREAM_SOURCES fields }`, in key
 * order. Every other field of a form row is dropped - see `assertFormRowsDropNothing`, which the
 * import runs first.
 */
export function normalizeCharacterForms(units) {
  const formsById = new Map();

  for (const { baseCharacterId, variantKey, entry } of listFormRows(units)) {
    const read = (field) => entry[FORM_UPSTREAM_SOURCES[field].upstream];
    const forms = formsById.get(baseCharacterId) ?? [];

    forms.push({
      key: variantKey,
      name: normalizeCharacterName(read('name')),
      type: normalizeUnitTypeTokens(read('type')).join(','),
      classes: normalizeCharacterClasses(read('classes') ?? []),
      combo: toFiniteNumber(read('combo')),
      minHp: toFiniteNumber(read('minHp')),
      minAtk: toFiniteNumber(read('minAtk')),
      minRcv: toFiniteNumber(read('minRcv')),
      maxHp: toFiniteNumber(read('maxHp')),
      maxAtk: toFiniteNumber(read('maxAtk')),
      maxRcv: toFiniteNumber(read('maxRcv')),
    });
    formsById.set(baseCharacterId, forms);
  }

  for (const forms of formsById.values()) {
    forms.sort((left, right) => left.key.localeCompare(right.key, 'en', { numeric: true }));
  }

  return formsById;
}

/**
 * 869f63gkm. Whether an alias is written in Latin script: at least one letter, and every letter
 * Latin. `aliases.js` lists a Japanese name, a French name and then community names per unit; only
 * the Latin ones are kept - the Japanese names cost about three times the bytes, for names this
 * app's players rarely type.
 */
export function isLatinScriptAlias(value) {
  let hasLetter = false;

  for (const character of String(value)) {
    if (!/\p{L}/u.test(character)) {
      continue;
    }

    if (!/\p{Script=Latin}/u.test(character)) {
      return false;
    }

    hasLetter = true;
  }

  return hasLetter;
}

/**
 * 869f63gkm. The names players use for a unit, from upstream `common/data/aliases.js` - "V2 Legend
 * Rayleigh", "Story Katakuri", "Marshall D. Teach" - as the text stored in `search_aliases`:
 * lower-cased, space-separated, in upstream's order. `''` when there is none.
 *
 * Latin script only (`isLatinScriptAlias`). An alias is also left out when the unit's own search
 * text, or a longer alias kept beside it, already contains it once both are read the way a search
 * reads them (`normalizeCharacterSearchText`, the app's own rule): every query it would find is
 * found already, so it would cost bytes and find nothing new.
 */
export function resolveCharacterSearchAliases(aliasEntry, searchText = '') {
  if (!Array.isArray(aliasEntry)) {
    return '';
  }

  const candidates = aliasEntry
    .map((alias, index) => ({
      alias: typeof alias === 'string' ? alias.trim().toLowerCase() : '',
      index,
    }))
    .filter(({ alias }) => alias.length > 0 && isLatinScriptAlias(alias))
    .map((candidate) => ({ ...candidate, words: normalizeCharacterSearchText(candidate.alias) }))
    .filter(({ words }) => words.length > 0);
  const covered = [normalizeCharacterSearchText(String(searchText ?? ''))];
  const kept = [];

  // Longest first, so an alias another alias contains is dropped whichever one upstream lists first.
  for (const candidate of [...candidates].sort(
    (left, right) => right.words.length - left.words.length || left.index - right.index,
  )) {
    if (covered.some((text) => text.includes(candidate.words))) {
      continue;
    }

    covered.push(candidate.words);
    kept.push(candidate);
  }

  return kept
    .sort((left, right) => left.index - right.index)
    .map(({ alias }) => alias)
    .join(' ');
}

export function normalizeCharacters(
  units,
  details,
  rumbleUnits,
  assetsById,
  tagsById = {},
  flagsById = {},
  familiesById = {},
  aliasesById = {},
) {
  const rumbleById = new Map(normalizeRumbleUnits(rumbleUnits).map((entry) => [entry.id, entry]));
  const normalizedUnitEntries = buildNormalizedUnitEntries(units);
  const formsById = normalizeCharacterForms(units);

  return normalizedUnitEntries.map(
    ({
      characterId,
      classes,
      type,
      name,
      stars,
      starsLabel,
      cost,
      combo,
      maxSockets,
      minHp,
      minAtk,
      minRcv,
      maxHp,
      maxAtk,
      maxRcv,
      growth,
    }) => {
      const assets = assetsById.get(characterId) ?? createEmptyAssets();
      const detail = details[characterId] ?? {};
      const normalizedDetail = normalizeCharacterDetail(
        detail,
        characterId,
        rumbleById.get(characterId) ?? null,
        tagsById?.[characterId] ?? tagsById?.[String(characterId)] ?? [],
      );
      const captainBoosts = resolveCharacterCaptainBoosts(normalizedDetail);
      const searchText = createCharacterSearchText({
        name,
        type,
        classes,
        aliases: normalizedDetail.characterTags,
      });

      return {
        id: characterId,
        name,
        type,
        primaryClass: classes[0] ?? '',
        secondaryClass: classes[1] ?? null,
        classes,
        stars,
        starsLabel,
        cost,
        combo,
        maxSockets,
        minHp,
        minAtk,
        minRcv,
        maxHp,
        maxAtk,
        maxRcv,
        growth,
        ...captainBoosts,
        searchText,
        /* 869f63gkm. Searched with the name, never displayed, and kept apart from `searchText`. */
        searchAliases: resolveCharacterSearchAliases(aliasesById[characterId], searchText),
        regionArtwork: {
          exactLocal: Boolean(assets.exactLocal),
          thumbnailGlobal: Boolean(assets.thumbnailGlobal),
          thumbnailJapan: Boolean(assets.thumbnailJapan),
        },
        regionRelease: resolveRegionRelease(flagsById[characterId]),
        families: resolveCharacterFamilies(familiesById[characterId]),
        forms: formsById.get(characterId) ?? [],
        assets,
        detail: normalizedDetail,
      };
    },
  );
}

function applyExactLocalAssets(characters, exactLocalPaths) {
  if (!exactLocalPaths.size) {
    return characters;
  }

  for (const character of characters) {
    const exactLocalPath = exactLocalPaths.get(character.id);

    if (!exactLocalPath) {
      continue;
    }

    character.assets.exactLocal = exactLocalPath;
    character.regionArtwork.exactLocal = true;
  }

  return characters;
}

function selectLocalizableExactSource(character) {
  if (character.assets.exactLocal) {
    return null;
  }

  if (character.assets.thumbnailGlobal) {
    return {
      source: 'upstream',
      packKey: 'thumbnailsGlo',
      relativePath: character.assets.thumbnailGlobal,
    };
  }

  if (character.assets.thumbnailJapan) {
    return {
      source: 'upstream',
      packKey: 'thumbnailsJapan',
      relativePath: character.assets.thumbnailJapan,
    };
  }

  return null;
}

function buildResolvableUnresolvedExactSources(characters, packStatuses) {
  const exactSources = new Map();

  for (const character of getSortedUnresolvedCharacters(characters, packStatuses)) {
    const exactSource = selectLocalizableExactSource(character);

    if (!exactSource) {
      continue;
    }

    exactSources.set(character.id, exactSource);
  }

  return exactSources;
}

function normalizeShips(ships) {
  return ships.map((entry, index) => ({
    id: index + 1,
    name: entry.name,
    thumb: entry.thumb ?? null,
    description: entry.description ?? '',
  }));
}

export function applyShipThumbnailOverrides(ships, shipThumbnailOverrides) {
  if (!shipThumbnailOverrides.size) {
    return ships;
  }

  return ships.map((ship) => {
    const override = shipThumbnailOverrides.get(ship.id);

    if (!override || ship.thumb) {
      return ship;
    }

    return {
      ...ship,
      thumb: override.file,
    };
  });
}

async function hashFile(targetPath) {
  const content = await readFile(targetPath);
  return createHash('sha1').update(content).digest('hex');
}

async function main() {
  const { downloadImages, source: sourceKey, ref, allowStaleSource } = parseArgs();
  const requestedSource = resolveImportSource(sourceKey);

  if (requestedSource.stale && allowStaleSource) {
    console.warn(
      `[import-optc-data] WARNING: importing from a STALE source, as ${STALE_SOURCE_FLAG} asked. ${requestedSource.stale.reason}`,
    );
  }

  /* 869f63gtc. Every file below is read at this one commit, and the manifest records it. */
  const requestedRef = ref ?? requestedSource.ref;
  const sourceCommit = await resolveSourceCommit(requestedSource, { ref: requestedRef });
  const selectedSource = pinImportSourceToCommit(requestedSource, sourceCommit);

  await mkdir(dataDir, { recursive: true });
  await mkdir(offlineDir, { recursive: true });
  await mkdir(exactImagesDir, { recursive: true });

  console.log(
    `Import source: ${selectedSource.label} (${selectedSource.repository}@${requestedRef}, commit ${sourceCommit}).`,
  );

  const [
    unitsWindow,
    detailsWindow,
    tagsWindow,
    shipsWindow,
    utilsWindow,
    cooldownsWindow,
    evolutionsWindow,
    dropsWindow,
    flagsWindow,
    familiesWindow,
    shopsWindow,
    bannersWindow,
    aliasesWindow,
    rumble,
    sourceVersion,
    imageOverrides,
    partyConflictOverrides,
    shipThumbnailOverrides,
  ] = await Promise.all([
    evaluateLegacyFile('common/data/units.js', selectedSource),
    evaluateLegacyFile('common/data/details.js', selectedSource),
    evaluateLegacyFile('common/data/tags.js', selectedSource),
    evaluateLegacyFile('common/data/ships.js', selectedSource),
    evaluateLegacyFile('common/js/utils.js', selectedSource),
    /*
     * 869f1935z. Three files the importer read for the first time. They are plain data - unlike
     * `captains.js` and `events.js`, which are executable functions over the reference app's own
     * battle context and are deliberately still unread.
     */
    evaluateLegacyFile('common/data/cooldowns.js', selectedSource),
    evaluateLegacyFile('common/data/evolutions.js', selectedSource),
    evaluateLegacyFile('common/data/drops.js', selectedSource),
    /*
     * 869f13284. The real per-region release flag, read for the first time. Until now the app
     * derived "is this unit on Global?" from whether a thumbnail asset existed, which agrees with
     * this file for only 78.92% of units: it claims Global for 927 units upstream marks Japan-only,
     * and `thumbnailGlobal` is true for 99.5% of the dataset, so it is very nearly a constant.
     * Plain data like the three above, not an executable function like `captains.js`.
     */
    evaluateLegacyFile('common/data/flags.js', selectedSource),
    /*
     * 869f63grj. Which character(s) each card is, as upstream names them. It decides which cards
     * are the same character, a rule the app used to guess from the card name - and the guess
     * disagreed with this file on 18,449 unit pairs. Plain data like the files above.
     */
    evaluateLegacyFile('common/data/families.js', selectedSource),
    /*
     * 869f63gm1. How a unit is obtained besides a drop: the shops that sell it and the Friend Point
     * banner. With the acquisition keys of `flags.js` above, they give a positive answer for most
     * of the units `drops.js` says nothing about. Plain data like the files above.
     */
    evaluateLegacyFile('common/data/shops.js', selectedSource),
    evaluateLegacyFile('common/data/banners.js', selectedSource),
    /*
     * 869f63gkm. The names players use for a unit - community nicknames, French and Japanese names -
     * which search never found. Plain data inside one function that assigns `window.aliases`.
     */
    evaluateLegacyFile('common/data/aliases.js', selectedSource),
    fetchJson(buildSourceFileUrl(selectedSource, 'common/data/rumble.json'), selectedSource),
    fetchVersion(selectedSource),
    loadCharacterImageOverrides(),
    loadPartyConflictOverrides(),
    loadShipThumbnailOverrides(),
  ]);

  let packTrees = [];
  let packListingAvailable = false;

  try {
    packTrees = await buildPackTrees(selectedSource);
    packListingAvailable = true;
  } catch (error) {
    if (error?.isGithubRateLimit) {
      if (downloadImages !== 'none') {
        throw new Error(
          `GitHub API rate limit exceeded while listing image packs for ${selectedSource.label}. Set GITHUB_TOKEN or GH_TOKEN and rerun ${process.argv.slice(1).join(' ')}.`,
        );
      }

      console.warn(
        `[import-optc-data] GitHub API rate limit exceeded for ${selectedSource.label}. Falling back to deterministic asset paths and cached pack metadata. Set GITHUB_TOKEN or GH_TOKEN to restore full pack listing and image download support.`,
      );
    } else {
      throw error;
    }
  }

  const packFileIndexes = buildPackFileIndexes(packTrees);
  const characterIterationLimit = resolveCharacterIterationLimit(unitsWindow.units);
  const assetsById = packListingAvailable
    ? buildCharacterAssetsMap(packTrees)
    : buildDeterministicCharacterAssetsMap(characterIterationLimit, utilsWindow);
  const thumbnailOverrides = packListingAvailable
    ? buildDeterministicThumbnailOverrides(characterIterationLimit, utilsWindow, packFileIndexes)
    : new Map();
  const exactOverridePackAssets = buildPackAssetOverridesFromExactOverrides(imageOverrides);
  mergeThumbnailOverrides(assetsById, thumbnailOverrides);
  mergeThumbnailOverrides(assetsById, exactOverridePackAssets);
  /* 869f63gv6. Before anything is written: a form row may not carry a field the import drops. */
  assertFormRowsDropNothing(unitsWindow.units);
  const manualExactLocalPaths = await materializeExactImageSources(
    selectedSource,
    imageOverrides,
    packTrees,
    packFileIndexes,
    {
      clearDir: true,
    },
  );
  const characters = attachProgressionData(
    applyPartyConflictKeys(
      applyExactLocalAssets(
        normalizeCharacters(
          unitsWindow.units,
          detailsWindow.details,
          rumble.units ?? [],
          assetsById,
          tagsWindow.tags ?? {},
          flagsWindow.flags ?? {},
          familiesWindow.families ?? {},
          aliasesWindow.aliases ?? {},
        ),
        manualExactLocalPaths,
      ),
      partyConflictOverrides,
    ),
    {
      cooldowns: normalizeSpecialCooldowns(cooldownsWindow.cooldowns),
      evolutions: normalizeEvolutions(evolutionsWindow.evolutions),
      dropSources: normalizeDropSources(dropsWindow.drops),
      acquisition: normalizeAcquisition({
        flags: flagsWindow.flags,
        shops: shopsWindow.shops,
        banners: bannersWindow.banners,
      }),
    },
  );
  const abilityCorrections = await loadBuilderAbilityCorrections(builderAbilityCorrectionsPath);
  const autoBuilderAbilities = await enrichCharactersWithBuilderAbilities(characters, {
    batchSize: 250,
    abilityCorrections,
    logger: (message) => console.log(message),
  });
  const ships = applyShipThumbnailOverrides(
    normalizeShips(shipsWindow.ships),
    shipThumbnailOverrides,
  );

  const packStatuses = [];
  if (packListingAvailable) {
    for (const pack of packTrees) {
      const status = await downloadPackFiles(pack, downloadImages);
      const targetRoot = path.join(offlineDir, pack.id);
      const samplePath = path.join(targetRoot, pack.files[0]?.localPath ?? '');
      const sampleHash = status.installed && pack.files[0] ? await hashFile(samplePath) : null;

      packStatuses.push({
        key: pack.key,
        id: pack.id,
        label: pack.label,
        localBasePath: `assets/offline-packs/${pack.id}`,
        fileCount: pack.files.length,
        totalBytes: pack.files.reduce((total, file) => total + file.bytes, 0),
        installed: status.installed,
        checksum: sampleHash,
      });
    }
  } else {
    packStatuses.push(...(await buildFallbackPackStatuses()));
  }

  const shipThumbnailPackStatus =
    packStatuses.find((pack) => pack.key === 'shipThumbnails') ?? null;
  const shipThumbnailOverrideStats = await materializeShipThumbnailOverrides(
    shipThumbnailOverrides,
    shipThumbnailPackStatus?.installed ?? false,
  );

  if (shipThumbnailPackStatus && shipThumbnailOverrideStats.copiedCount > 0) {
    shipThumbnailPackStatus.fileCount += shipThumbnailOverrideStats.copiedCount;
    shipThumbnailPackStatus.totalBytes += shipThumbnailOverrideStats.totalBytes;
  }

  const resolvableUnresolvedExactSources = packListingAvailable
    ? buildResolvableUnresolvedExactSources(characters, packStatuses)
    : new Map();
  const resolvedExactLocalPaths =
    resolvableUnresolvedExactSources.size > 0
      ? await materializeExactImageSources(
          selectedSource,
          resolvableUnresolvedExactSources,
          packTrees,
          packFileIndexes,
          {
            clearDir: false,
          },
        )
      : new Map();
  applyExactLocalAssets(characters, resolvedExactLocalPaths);

  const manifest = buildManifest(
    characters,
    ships,
    sourceVersion,
    packStatuses,
    new Date().toISOString(),
    { repository: selectedSource.repository, commit: sourceCommit },
  );
  const unresolvedCatalog = createUnresolvedCatalog(
    characters,
    packStatuses,
    sourceVersion,
    manifest.generatedAt,
  );
  const sqlSeed = createSqlSeed(characters, ships, manifest);
  const autoBuilderAbilityCatalog = buildAutoBuilderAbilityCatalog(
    manifest.generatedAt,
    sourceVersion,
    autoBuilderAbilities,
  );
  const preview = buildPreviewPayload(manifest.generatedAt, characters, ships);

  validateDatasetIntegrity({
    characters,
    ships,
    manifest,
    autoBuilderAbilityCatalog,
  });

  /* 869f138qb. What was on disk before this import, to tell a real change from a new timestamp. */
  const previousFiles = await readGeneratedDatasetFiles(dataDir);

  await writeGeneratedDatasetFiles(
    dataDir,
    manifest,
    sqlSeed,
    unresolvedCatalog,
    autoBuilderAbilityCatalog,
    preview,
  );

  await pruneManualCharactersCoveredByImport({
    importedCharacterIds: characters.map((character) => character.id),
    overlayPath: manualCharacterOverlayPath,
    sourceImageDir: manualExactImageSourceDir,
    preservedImageFiles: collectManualImageOverrideFiles(imageOverrides),
    logger: (message) => console.log(message),
  });

  await applyManualCharacterOverlay({
    rootDir,
    logger: (message) => console.log(message),
  });

  const keptGeneratedAt = await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles });

  if (keptGeneratedAt) {
    console.log(
      `Dataset unchanged: generatedAt stays ${keptGeneratedAt}, the recorded source commit stays the one the data last changed at, and the generated files are byte-identical, so installed clients download nothing.`,
    );
  }

  console.log(
    `Imported ${manifest.characterCount} characters, ${manifest.shipCount} ships, ${manifest.rumbleCount} rumble entries.`,
  );
  console.log(
    `Packs: ${manifest.packs.map((pack) => `${pack.id}=${pack.installed ? 'installed' : 'missing'}`).join(', ')}`,
  );
  console.log(
    `Exact local overrides: ${manualExactLocalPaths.size}, deterministic unresolved hydrated: ${resolvedExactLocalPaths.size}, unresolved placeholders: ${unresolvedCatalog.total}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

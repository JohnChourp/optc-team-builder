#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  enrichCharactersWithBuilderAbilities,
  normalizeLegacyAbilityText,
} from './auto-team-builder-ability-parser.mjs';
import { applyManualCharacterOverlay } from './lib/manual-character-apply.mjs';
import { loadBuilderAbilityCorrections } from './lib/builder-ability-corrections.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createEmptyAssets,
  createSqlSeed,
  createUnresolvedCatalog,
  flattenValues,
  getSortedUnresolvedCharacters,
  normalizeCharacterClasses,
  writeGeneratedDatasetFiles,
} from './lib/optc-dataset.mjs';
import {
  applyPartyConflictKeys,
  normalizePartyConflictOverrideMap,
} from './lib/party-conflict-keys.mjs';
import { parseSuperSpecialCriteria } from './lib/super-special-criteria.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const dataDir = path.join(publicDir, 'assets', 'data');
const offlineDir = path.join(publicDir, 'assets', 'offline-packs');
const exactImagesDir = path.join(publicDir, 'assets', 'exact-character-images');
const overrideConfigPath = path.join(rootDir, 'scripts', 'data', 'character-image-overrides.json');
const manualExactImageSourceDir = path.join(rootDir, 'scripts', 'data', 'character-images');
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

const sourceRepoBase = 'https://raw.githubusercontent.com/optc-db/optc-db.github.io/master';
const githubApiBase = 'https://api.github.com/repos/optc-db/optc-db.github.io';
const githubHeaders = {
  'User-Agent': 'optc-team-builder-importer',
  Accept: 'application/vnd.github+json',
};

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
  {
    key: 'fullTransparent',
    id: 'full-transparent',
    label: 'Transparent full art',
    listingPath: 'api/images/full',
    entryName: 'transparent',
  },
];

const typeSuffixOrder = new Map(
  ['STR', 'DEX', 'QCK', 'PSY', 'INT'].map((value, index) => [value, index]),
);
const packKeyToField = {
  thumbnailsGlo: 'thumbnailGlobal',
  thumbnailsJapan: 'thumbnailJapan',
  fullTransparent: 'fullTransparent',
};
const packEntryNameMap = {
  glo: 'thumbnailsGlo',
  jap: 'thumbnailsJapan',
};

const noop = () => undefined;

function parseArgs() {
  const args = process.argv.slice(2);
  const defaults = {
    downloadImages: 'none',
  };

  for (const arg of args) {
    if (arg.startsWith('--download-images=')) {
      defaults.downloadImages = arg.split('=')[1];
    }
  }

  return defaults;
}

async function fetchText(url) {
  return withRetries(async () => {
    const response = await fetch(url, { headers: githubHeaders });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    return response.text();
  });
}

async function fetchJson(url) {
  return withRetries(async () => {
    const response = await fetch(url, { headers: githubHeaders });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
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

async function evaluateLegacyFile(relativePath) {
  const source = await fetchText(`${sourceRepoBase}/${relativePath}`);
  const sandbox = createSandbox();
  vm.runInNewContext(source, sandbox, { timeout: 20_000 });
  return sandbox.window;
}

async function fetchVersion() {
  const source = await fetchText(`${sourceRepoBase}/common/data/version.js`);
  const match = source.match(/dbVersion\s*=\s*["']([^"']+)["']/);
  return match?.[1] ?? 'unknown';
}

function normalizePackPaths(tree, pack) {
  return tree.tree
    .filter((entry) => entry.type === 'blob' && entry.path.endsWith('.png'))
    .map((entry) => ({
      localPath: entry.path,
      bytes: entry.size,
      url: `${sourceRepoBase}/${pack.listingPath}/${pack.entryName}/${entry.path}`,
    }));
}

async function buildPackTrees() {
  const packTrees = [];

  for (const pack of packDefinitions) {
    const listing = await fetchJson(`${githubApiBase}/contents/${pack.listingPath}?ref=master`);
    const directory = listing.find((entry) => entry.name === pack.entryName);

    if (!directory) {
      throw new Error(`Missing GitHub tree for ${pack.id}`);
    }

    const tree = await fetchJson(`${githubApiBase}/git/trees/${directory.sha}?recursive=1`);
    packTrees.push({
      ...pack,
      files: normalizePackPaths(tree, pack),
    });
  }

  return packTrees;
}

export function shouldDownloadPack(mode, packId) {
  if (mode === 'all') {
    return true;
  }

  if (mode === 'thumbnails') {
    return (
      packId === 'thumbnails-glo' ||
      packId === 'thumbnails-jap' ||
      packId === 'ship-thumbnails'
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

  const packByKey = new Map(packTrees.map((pack) => [pack.key, pack]));
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

    if (!packIndex?.has(exactSource.relativePath) || !pack) {
      throw new Error(
        `Missing upstream asset override source for character ${characterId}: ${exactSource.packKey}/${exactSource.relativePath}`,
      );
    }

    const response = await fetch(
      `${sourceRepoBase}/${pack.listingPath}/${pack.entryName}/${exactSource.relativePath}`,
      {
        headers: githubHeaders,
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

function normalizeSupportData(rawSupportData) {
  return (Array.isArray(rawSupportData) ? rawSupportData : [])
    .map((entry) => {
      const supportedCharactersText = String(
        entry?.supportedCharactersText ?? entry?.Characters ?? '',
      ).trim();
      const levelDescriptions = (Array.isArray(entry?.levelDescriptions)
        ? entry.levelDescriptions
        : Array.isArray(entry?.description)
          ? entry.description
          : []
      )
        .map((description) => String(description ?? '').trim())
        .filter((description) => description.length > 0);

      if (!supportedCharactersText.length && levelDescriptions.length === 0) {
        return null;
      }

      return {
        supportedCharactersText,
        levelDescriptions,
      };
    })
    .filter((entry) => Boolean(entry));
}

export function normalizeCharacterDetail(detail, characterId, rumbleData = null) {
  const normalizedCaptainAbility = normalizeLegacyAbilityText(detail.captain ?? null) || null;
  const normalizedSpecialText = normalizeLegacyAbilityText(detail.special ?? null) || null;
  const normalizedSuperSpecialText = normalizeLegacyAbilityText(detail.superSpecial ?? null) || null;
  const normalizedSuperSpecialCriteriaText =
    normalizeLegacyAbilityText(detail.superSpecialCriteria ?? null) || null;
  const normalizedSailorAbilities = flattenValues(detail.sailor ?? {})
    .map((entry) => normalizeLegacyAbilityText(entry))
    .filter((entry) => entry.length > 0);

  return {
    characterId,
    captainAbility: normalizedCaptainAbility,
    specialName: detail.specialName ?? null,
    specialText: normalizedSpecialText,
    specialNotes: detail.specialNotes ?? null,
    superSpecialText: normalizedSuperSpecialText,
    superSpecialCriteriaText: normalizedSuperSpecialCriteriaText,
    superSpecialNotes: detail.superSpecialNotes ?? null,
    superSpecialCriteria: normalizedSuperSpecialCriteriaText
      ? parseSuperSpecialCriteria(normalizedSuperSpecialCriteriaText)
      : null,
    partyConflictKeys: [],
    builderAbilities: [],
    sailorAbilities: normalizedSailorAbilities,
    sailorNotes: detail.sailorNotes ?? null,
    limitBreak: detail.limit ?? [],
    potentialAbilities: detail.potential ?? [],
    supportData: normalizeSupportData(detail.support),
    swapData: detail.swap ?? null,
    vsSpecial: detail.vsSpecial ?? null,
    superType: detail.superType ?? null,
    superClass: detail.superClass ?? null,
    rumbleData,
  };
}

function normalizeCharacters(units, details, rumbleUnits, assetsById) {
  const rumbleById = new Map(rumbleUnits.map((entry) => [entry.id, entry]));
  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return units.flatMap((entry, index) => {
    if (isPlaceholderCharacterEntry(entry)) {
      return [];
    }

    const characterId = index + 1;
    const classes = normalizeCharacterClasses(entry[2]);
    const assets = assetsById.get(characterId) ?? createEmptyAssets();
    const detail = details[characterId] ?? {};
    const normalizedDetail = normalizeCharacterDetail(
      detail,
      characterId,
      rumbleById.get(characterId) ?? null,
    );

    return [
      {
        id: characterId,
        name: entry[0],
        type: entry[1],
        primaryClass: classes[0] ?? '',
        secondaryClass: classes[1] ?? null,
        classes,
        stars: toNumber(entry[3]),
        cost: toNumber(entry[4]),
        combo: toNumber(entry[5]),
        maxSockets: toNumber(entry[6]),
        evolutionStage: toNumber(entry[7]),
        maxLevel: toNumber(entry[8]),
        maxExperience: toNumber(entry[9]),
        minHp: toNumber(entry[10]),
        minAtk: toNumber(entry[11]),
        minRcv: toNumber(entry[12]),
        maxHp: toNumber(entry[13]),
        maxAtk: toNumber(entry[14]),
        maxRcv: toNumber(entry[15]),
        growth: toNumber(entry[16]),
        searchText: `${entry[0]} ${entry[1]} ${classes.join(' ')}`.toLowerCase(),
        regionAvailability: {
          exactLocal: Boolean(assets.exactLocal),
          thumbnailGlobal: Boolean(assets.thumbnailGlobal),
          thumbnailJapan: Boolean(assets.thumbnailJapan),
          fullTransparent: Boolean(assets.fullTransparent),
        },
        assets,
        detail: normalizedDetail,
      },
    ];
  });
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
    character.regionAvailability.exactLocal = true;
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

  if (character.assets.fullTransparent) {
    return {
      source: 'upstream',
      packKey: 'fullTransparent',
      relativePath: character.assets.fullTransparent,
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
  const { downloadImages } = parseArgs();

  await mkdir(dataDir, { recursive: true });
  await mkdir(offlineDir, { recursive: true });
  await mkdir(exactImagesDir, { recursive: true });

  const [
    unitsWindow,
    detailsWindow,
    shipsWindow,
    utilsWindow,
    rumble,
    sourceVersion,
    packTrees,
    imageOverrides,
    partyConflictOverrides,
    shipThumbnailOverrides,
  ] = await Promise.all([
    evaluateLegacyFile('common/data/units.js'),
    evaluateLegacyFile('common/data/details.js'),
    evaluateLegacyFile('common/data/ships.js'),
    evaluateLegacyFile('common/js/utils.js'),
    fetchJson(`${sourceRepoBase}/common/data/rumble.json`),
    fetchVersion(),
    buildPackTrees(),
    loadCharacterImageOverrides(),
    loadPartyConflictOverrides(),
    loadShipThumbnailOverrides(),
  ]);

  const packFileIndexes = buildPackFileIndexes(packTrees);
  const assetsById = buildCharacterAssetsMap(packTrees);
  const thumbnailOverrides = buildDeterministicThumbnailOverrides(
    unitsWindow.units.length,
    utilsWindow,
    packFileIndexes,
  );
  const exactOverridePackAssets = buildPackAssetOverridesFromExactOverrides(imageOverrides);
  mergeThumbnailOverrides(assetsById, thumbnailOverrides);
  mergeThumbnailOverrides(assetsById, exactOverridePackAssets);
  const manualExactLocalPaths = await materializeExactImageSources(
    imageOverrides,
    packTrees,
    packFileIndexes,
    {
      clearDir: true,
    },
  );
  const characters = applyPartyConflictKeys(
    applyExactLocalAssets(
      normalizeCharacters(unitsWindow.units, detailsWindow.details, rumble.units ?? [], assetsById),
      manualExactLocalPaths,
    ),
    partyConflictOverrides,
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

  const resolvableUnresolvedExactSources = buildResolvableUnresolvedExactSources(
    characters,
    packStatuses,
  );
  const resolvedExactLocalPaths = await materializeExactImageSources(
    resolvableUnresolvedExactSources,
    packTrees,
    packFileIndexes,
    {
      clearDir: false,
    },
  );
  applyExactLocalAssets(characters, resolvedExactLocalPaths);

  const manifest = buildManifest(
    characters,
    ships,
    sourceVersion,
    packStatuses,
    new Date().toISOString(),
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

  await writeGeneratedDatasetFiles(
    dataDir,
    manifest,
    sqlSeed,
    unresolvedCatalog,
    autoBuilderAbilityCatalog,
    preview,
  );

  await applyManualCharacterOverlay({
    rootDir,
    logger: (message) => console.log(message),
  });

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

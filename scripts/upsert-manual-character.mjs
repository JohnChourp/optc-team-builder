#!/usr/bin/env node

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyManualCharacterOverlay } from './lib/manual-character-apply.mjs';
import {
  loadManualCharacterOverlay,
  normalizeIncomingManualCharacterPayload,
  resolveManualCharacterUpsert,
  serializeManualCharacterOverlay,
} from './lib/manual-character-overlay.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const defaultOverlayPath = path.join(rootDir, 'scripts', 'data', 'manual-characters.json');
const defaultSourceImageDir = path.join(rootDir, 'scripts', 'data', 'character-images');
const defaultManifestPath = path.join(rootDir, 'public', 'assets', 'data', 'optc-manifest.json');
const defaultDataDir = path.join(rootDir, 'public', 'assets', 'data');
const defaultSeedPath = path.join(defaultDataDir, 'optc-seed.sql');
const defaultExactImagesDir = path.join(rootDir, 'public', 'assets', 'exact-character-images');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(options.manifestPath, 'utf8'));
  const records = await loadManualCharacterOverlay(options.overlayPath, {
    availableClasses: manifest.availableClasses,
  });
  const payload = await loadPayload(options);
  const { characterId, existingRecord, mode } = resolveManualCharacterUpsert(records, payload);
  const imageSource = resolveRequestedImageSource(options.imageSource, payload.image);
  const thumbnailImageSource = resolveRequestedImageSource(
    options.thumbnailImageSource,
    payload.thumbnailImage,
  );

  if (!imageSource && !existingRecord) {
    throw new Error('A new manual character requires an image path or URL.');
  }

  const storedImageFile = imageSource
    ? await storeManualImage(imageSource, characterId, options.sourceImageDir)
    : existingRecord.image.file;
  const storedThumbnailFile = thumbnailImageSource
    ? await storeManualImage(thumbnailImageSource, `${characterId}-thumb`, options.sourceImageDir)
    : existingRecord?.image?.thumbnailFile ?? null;
  const normalizedRecord = normalizeIncomingManualCharacterPayload(payload, {
    availableClasses: manifest.availableClasses,
    characterId,
    storedImageFile,
    storedThumbnailFile,
  });

  records.set(characterId, normalizedRecord);

  await mkdir(path.dirname(options.overlayPath), { recursive: true });
  await writeFile(
    options.overlayPath,
    JSON.stringify(serializeManualCharacterOverlay(records), null, 2),
  );

  const applyResult = await applyManualCharacterOverlay({
    rootDir,
    dataDir: options.dataDir,
    seedPath: options.seedPath,
    manifestPath: options.manifestPath,
    overlayPath: options.overlayPath,
    sourceImageDir: options.sourceImageDir,
    exactImagesDir: options.exactImagesDir,
    logger: (message) => console.log(message),
  });

  console.log(
    `[manual-characters] ${mode} complete for ${normalizedRecord.name} (${characterId}). dataset ${applyResult.written ? 'updated' : 'already current'}.`,
  );
  console.log(`[manual-characters] final custom id: ${characterId}`);
}

function parseArgs(args) {
  const options = {
    overlayPath: defaultOverlayPath,
    sourceImageDir: defaultSourceImageDir,
    manifestPath: defaultManifestPath,
    dataDir: defaultDataDir,
    seedPath: defaultSeedPath,
    exactImagesDir: defaultExactImagesDir,
    payloadFile: null,
    payloadJson: null,
    imageSource: null,
    thumbnailImageSource: null,
  };

  for (const arg of args) {
    if (!arg.startsWith('--')) {
      throw new Error(`Unsupported argument: ${arg}`);
    }

    const [rawKey, ...valueParts] = arg.slice(2).split('=');
    const rawValue = valueParts.join('=');

    switch (rawKey) {
      case 'payload-file':
        options.payloadFile = path.resolve(process.cwd(), rawValue);
        break;
      case 'payload-json':
        options.payloadJson = rawValue;
        break;
      case 'image':
        options.imageSource = rawValue;
        break;
      case 'thumbnail-image':
        options.thumbnailImageSource = rawValue;
        break;
      case 'overlay-file':
        options.overlayPath = path.resolve(rootDir, rawValue);
        break;
      case 'data-dir':
        options.dataDir = path.resolve(rootDir, rawValue);
        break;
      case 'seed-path':
        options.seedPath = path.resolve(rootDir, rawValue);
        break;
      case 'source-image-dir':
        options.sourceImageDir = path.resolve(rootDir, rawValue);
        break;
      case 'exact-images-dir':
        options.exactImagesDir = path.resolve(rootDir, rawValue);
        break;
      case 'manifest-path':
        options.manifestPath = path.resolve(rootDir, rawValue);
        break;
      default:
        throw new Error(`Unsupported flag: --${rawKey}`);
    }
  }

  if (!options.payloadFile && !options.payloadJson) {
    throw new Error('Pass --payload-file or --payload-json.');
  }

  return options;
}

async function loadPayload(options) {
  if (options.payloadJson) {
    return JSON.parse(options.payloadJson);
  }

  return JSON.parse(await readFile(options.payloadFile, 'utf8'));
}

function resolveRequestedImageSource(cliImageSource, payloadImage) {
  const candidate = cliImageSource ?? payloadImage ?? null;

  if (typeof candidate === 'string' && candidate.trim().length) {
    return candidate.trim();
  }

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  if (typeof candidate.path === 'string' && candidate.path.trim().length) {
    return candidate.path.trim();
  }

  if (typeof candidate.url === 'string' && candidate.url.trim().length) {
    return candidate.url.trim();
  }

  return null;
}

async function storeManualImage(imageSource, fileStem, sourceImageDir) {
  await mkdir(sourceImageDir, { recursive: true });
  await removeExistingCharacterImages(sourceImageDir, fileStem);

  const parsedUrl = tryParseUrl(imageSource);

  if (parsedUrl && ['http:', 'https:'].includes(parsedUrl.protocol)) {
    return downloadManualImage(parsedUrl, fileStem, sourceImageDir);
  }

  const sourcePath =
    parsedUrl?.protocol === 'file:'
      ? parsedUrl
      : path.resolve(process.cwd(), imageSource);
  const filePath =
    sourcePath instanceof URL ? fileURLToPath(sourcePath) : path.resolve(String(sourcePath));
  const extension = normalizeImageExtension(path.extname(filePath));
  const fileBuffer = await readFile(filePath);

  const fileName = `${fileStem}${extension}`;
  const destinationPath = path.join(sourceImageDir, fileName);
  await writeFile(destinationPath, fileBuffer);

  return fileName;
}

async function downloadManualImage(url, fileStem, sourceImageDir) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.startsWith('image/')) {
    throw new Error(`URL did not return an image content-type: ${contentType || 'unknown'}`);
  }

  const extension = resolveImageExtensionFromUrl(url) ?? resolveImageExtensionFromContentType(contentType);
  const normalizedExtension = normalizeImageExtension(extension);
  const fileName = `${fileStem}${normalizedExtension}`;
  const destinationPath = path.join(sourceImageDir, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());

  await writeFile(destinationPath, buffer);

  return fileName;
}

async function removeExistingCharacterImages(sourceImageDir, fileStem) {
  const files = await readdir(sourceImageDir).catch(() => []);

  await Promise.all(
    files
      .filter((fileName) => path.parse(fileName).name === String(fileStem))
      .map((fileName) => rm(path.join(sourceImageDir, fileName), { force: true })),
  );
}

function tryParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeImageExtension(extension) {
  const normalized = String(extension ?? '').trim().toLowerCase();

  if (!normalized.length) {
    throw new Error('Image extension could not be determined.');
  }

  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(normalized)) {
    throw new Error(`Unsupported image extension: ${normalized}`);
  }

  return normalized;
}

function resolveImageExtensionFromUrl(url) {
  const extension = path.extname(url.pathname);
  return extension || null;
}

function resolveImageExtensionFromContentType(contentType) {
  switch (contentType.toLowerCase().split(';')[0].trim()) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return null;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

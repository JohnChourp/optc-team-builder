#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  buildSourceFileUrl,
  extractSourceVersion,
  normalizeCharacters,
  resolveImportSource,
} from './import-optc-data.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const defaultDataDir = path.join(rootDir, 'public', 'assets', 'data');
const defaultManifestPath = path.join(defaultDataDir, 'optc-manifest.json');
const defaultSeedPath = path.join(defaultDataDir, 'optc-seed.sql');

const requestHeaders = {
  'User-Agent': 'optc-team-builder-release-check',
  Accept: 'application/vnd.github+json',
};

const noop = () => undefined;

export function parseReleaseCheckArgs(args = process.argv.slice(2)) {
  const options = {
    source: '2shankz',
    json: false,
    manifestPath: defaultManifestPath,
    seedPath: defaultSeedPath,
  };

  for (const arg of args) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg.startsWith('--source=')) {
      options.source = arg.split('=')[1];
      continue;
    }

    if (arg.startsWith('--manifest-path=')) {
      options.manifestPath = path.resolve(arg.split('=')[1]);
      continue;
    }

    if (arg.startsWith('--seed-path=')) {
      options.seedPath = path.resolve(arg.split('=')[1]);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  resolveImportSource(options.source);
  return options;
}

export function extractCharacterIdsFromSeed(sql) {
  const ids = [
    ...String(sql).matchAll(/INSERT\s+INTO\s+characters\s*\([\s\S]*?\)\s*VALUES\s*\(\s*(\d+)\s*,/gi),
  ].map((match) => Number(match[1]));

  if (!ids.length) {
    throw new Error('No character rows found in local optc-seed.sql.');
  }

  return [...new Set(ids)].sort((left, right) => left - right);
}

export function evaluateLegacyDataSource(sourceText) {
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
  };

  target.global = target;
  target.globalThis = target;
  target.self = target.window;

  const sandbox = new Proxy(target, {
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

  vm.runInNewContext(sourceText, sandbox, { timeout: 20_000 });
  return sandbox.window;
}

export function buildReleaseCheckResult({
  source,
  localSourceVersion,
  remoteSourceVersion,
  localCharacterIds,
  remoteCharacters,
}) {
  const localIdSet = new Set(localCharacterIds);
  const remoteCharacterIds = remoteCharacters
    .map((character) => Number(character.id))
    .filter((characterId) => Number.isInteger(characterId) && characterId > 0)
    .sort((left, right) => left - right);
  const newCharacterIds = remoteCharacterIds.filter((characterId) => !localIdSet.has(characterId));

  return {
    releaseNeeded: newCharacterIds.length > 0,
    reason: newCharacterIds.length > 0 ? 'new-upstream-characters' : 'no-new-upstream-characters',
    source: source.key,
    sourceRepository: source.repository,
    localSourceVersion,
    remoteSourceVersion,
    localCharacterCount: localCharacterIds.length,
    remoteCharacterCount: remoteCharacterIds.length,
    newCharacterIds,
    newCharacterCount: newCharacterIds.length,
  };
}

async function fetchText(url, source) {
  const response = await fetch(url, { headers: buildRequestHeaders() });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} from ${source.label}: ${response.status}`);
  }

  return response.text();
}

function buildRequestHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || '';

  if (!token) {
    return requestHeaders;
  }

  return {
    ...requestHeaders,
    Authorization: `Bearer ${token}`,
  };
}

async function readLocalDatasetSnapshot(options) {
  const [manifestSource, seedSource] = await Promise.all([
    readFile(options.manifestPath, 'utf8'),
    readFile(options.seedPath, 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);

  return {
    sourceVersion: String(manifest.sourceVersion ?? 'unknown'),
    characterIds: extractCharacterIdsFromSeed(seedSource),
  };
}

async function readRemoteDatasetSnapshot(source) {
  const [versionSource, unitsSource] = await Promise.all([
    fetchText(buildSourceFileUrl(source, 'common/data/version.js'), source),
    fetchText(buildSourceFileUrl(source, 'common/data/units.js'), source),
  ]);
  const unitsWindow = evaluateLegacyDataSource(unitsSource);

  return {
    sourceVersion: extractSourceVersion(versionSource),
    characters: normalizeCharacters(unitsWindow.units, {}, [], new Map()),
  };
}

export async function checkOptcReleaseNeeded(options = {}) {
  const source = resolveImportSource(options.source ?? '2shankz');
  const localSnapshot = await readLocalDatasetSnapshot({
    manifestPath: options.manifestPath ?? defaultManifestPath,
    seedPath: options.seedPath ?? defaultSeedPath,
  });
  const remoteSnapshot = await readRemoteDatasetSnapshot(source);

  return buildReleaseCheckResult({
    source,
    localSourceVersion: localSnapshot.sourceVersion,
    remoteSourceVersion: remoteSnapshot.sourceVersion,
    localCharacterIds: localSnapshot.characterIds,
    remoteCharacters: remoteSnapshot.characters,
  });
}

function formatHumanResult(result) {
  const lines = [
    `Release needed: ${result.releaseNeeded ? 'yes' : 'no'}`,
    `Reason: ${result.reason}`,
    `Source: ${result.sourceRepository}`,
    `Source version: local=${result.localSourceVersion} remote=${result.remoteSourceVersion}`,
    `Characters: local=${result.localCharacterCount} remote=${result.remoteCharacterCount}`,
  ];

  if (result.newCharacterCount > 0) {
    lines.push(`New character IDs: ${result.newCharacterIds.join(', ')}`);
  }

  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseReleaseCheckArgs();

  checkOptcReleaseNeeded(options)
    .then((result) => {
      console.log(options.json ? JSON.stringify(result, null, 2) : formatHumanResult(result));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

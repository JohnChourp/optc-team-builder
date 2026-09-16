import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  GENERATED_DATASET_FILES,
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createSqlSeed,
  createUnresolvedCatalog,
  generatedDatasetFilesMatch,
  keepGeneratedAtWhenOnlyTimestampChanged,
  readGeneratedDatasetFiles,
  readManifestGeneratedAt,
  writeGeneratedDatasetFiles,
} from './optc-dataset.mjs';

const EARLIER = '2026-09-01T10:00:00.000Z';
const LATER = '2026-09-16T12:00:00.000Z';

function character(id: number, name: string) {
  return {
    id,
    name,
    type: 'STR',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 5,
    starsLabel: '5',
    cost: 20,
    combo: 4,
    minHp: 1,
    minAtk: 1,
    minRcv: 1,
    maxHp: 2,
    maxAtk: 2,
    maxRcv: 2,
    growth: 1,
    maxSockets: 2,
    specialCooldownMax: 12,
    specialCooldownMin: 8,
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: true },
    assets: { exactLocal: null, thumbnailLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    searchText: name.toLowerCase(),
    detail: { characterId: id, specialText: 'Deals damage', captainAbility: null },
    evolvesTo: [],
    evolvesFrom: [],
    dropSources: [],
  };
}

const SHIPS = [{ id: 1, name: 'Merry Go', thumb: null, description: 'A ship.' }];

/*
 * What an import builds, as a pure function of the timestamp - the contract
 * `resolveGeneratedDatasetOutputs` relies on.
 */
function outputsFor(characters: ReturnType<typeof character>[]) {
  return (generatedAt: string) => {
    const manifest = buildManifest(characters, SHIPS, '36', [], generatedAt);

    return {
      manifest,
      unresolvedCatalog: createUnresolvedCatalog(characters, [], '36', generatedAt),
      sqlSeed: createSqlSeed(characters, SHIPS, manifest),
      autoBuilderAbilityCatalog: buildAutoBuilderAbilityCatalog(generatedAt, '36', []),
      preview: buildPreviewPayload(generatedAt, characters, SHIPS),
    };
  };
}

async function writeOutputs(dataDir: string, outputs: ReturnType<ReturnType<typeof outputsFor>>) {
  await writeGeneratedDatasetFiles(
    dataDir,
    outputs.manifest,
    outputs.sqlSeed,
    outputs.unresolvedCatalog,
    outputs.autoBuilderAbilityCatalog,
    outputs.preview,
  );
}

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeDataDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-dataset-files-'));
  tempDirs.push(dir);
  return dir;
}

describe('generated dataset files', () => {
  const roster = [character(1, 'Monkey D. Luffy'), character(2, 'Nami')];

  /*
   * 869f138qb. The case this exists for: 58 of 65 releases found no new data, wrote a fresh
   * timestamp into all five files anyway - the seed's meta row included - and made every
   * installed client download the dataset again.
   */
  it('puts the previous files back, byte for byte, when only the timestamp moved', async () => {
    const dataDir = await makeDataDir();
    await writeOutputs(dataDir, outputsFor(roster)(EARLIER));
    const previousFiles = await readGeneratedDatasetFiles(dataDir);

    /* The import rewrites everything with a new timestamp and the same data. */
    await writeOutputs(dataDir, outputsFor(roster)(LATER));
    expect((await readGeneratedDatasetFiles(dataDir)).sqlSeed).toContain(LATER);

    const kept = await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles });

    expect(kept).toBe(EARLIER);
    expect(await readGeneratedDatasetFiles(dataDir)).toEqual(previousFiles);
  });

  it('keeps the new files when the data changed, in any one of the five', async () => {
    const dataDir = await makeDataDir();
    await writeOutputs(dataDir, outputsFor(roster)(EARLIER));
    const previousFiles = await readGeneratedDatasetFiles(dataDir);

    const grown = outputsFor([...roster, character(3, 'Roronoa Zoro')])(LATER);
    await writeOutputs(dataDir, grown);

    expect(await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles })).toBeNull();
    expect(generatedDatasetFilesMatch(await readGeneratedDatasetFiles(dataDir), grown)).toBe(true);

    /* Same seed, same manifest, but one other file differs: still a change, still kept. */
    const sameRoster = outputsFor(roster)(LATER);
    await writeOutputs(dataDir, sameRoster);
    await writeFile(path.join(dataDir, GENERATED_DATASET_FILES.preview), '{"changed":true}');

    expect(await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles })).toBeNull();
    expect(await readFile(path.join(dataDir, GENERATED_DATASET_FILES.preview), 'utf8')).toBe(
      '{"changed":true}',
    );
  });

  it('does nothing without a previous timestamp, or when the timestamp did not move', async () => {
    const dataDir = await makeDataDir();
    await writeOutputs(dataDir, outputsFor(roster)(LATER));
    const current = await readGeneratedDatasetFiles(dataDir);

    const noPrevious = { ...current, manifest: '' };
    expect(await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles: noPrevious })).toBeNull();

    const brokenPrevious = { ...current, manifest: '{ not json' };
    expect(
      await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles: brokenPrevious }),
    ).toBeNull();

    expect(await keepGeneratedAtWhenOnlyTimestampChanged({ dataDir, previousFiles: current })).toBeNull();
    expect(await readGeneratedDatasetFiles(dataDir)).toEqual(current);
  });

  it('writes exactly what it compares against, for all five files', async () => {
    const dataDir = await makeDataDir();
    const outputs = outputsFor(roster)(EARLIER);
    await writeOutputs(dataDir, outputs);

    const files = await readGeneratedDatasetFiles(dataDir);

    expect(Object.keys(files).sort()).toEqual(Object.keys(GENERATED_DATASET_FILES).sort());
    expect(generatedDatasetFilesMatch(files, outputs)).toBe(true);

    for (const fileName of Object.values(GENERATED_DATASET_FILES)) {
      expect((await stat(path.join(dataDir, fileName))).size).toBeGreaterThan(0);
    }

    expect(await readFile(path.join(dataDir, GENERATED_DATASET_FILES.sqlSeed), 'utf8')).toBe(
      outputs.sqlSeed,
    );
  });

  it('reads a missing file as empty', async () => {
    const dataDir = await makeDataDir();
    await writeFile(path.join(dataDir, GENERATED_DATASET_FILES.manifest), '{}');

    const files = await readGeneratedDatasetFiles(dataDir);

    expect(files.manifest).toBe('{}');
    expect(files.sqlSeed).toBe('');
    expect(files.preview).toBe('');
  });

  it('reads a timestamp only from a manifest that carries a valid one', () => {
    expect(readManifestGeneratedAt(JSON.stringify({ generatedAt: EARLIER }))).toBe(EARLIER);
    expect(readManifestGeneratedAt(JSON.stringify({ generatedAt: 'yesterday' }))).toBeNull();
    expect(readManifestGeneratedAt(JSON.stringify({ generatedAt: 42 }))).toBeNull();
    expect(readManifestGeneratedAt('')).toBeNull();
    expect(readManifestGeneratedAt('{')).toBeNull();
  });
});

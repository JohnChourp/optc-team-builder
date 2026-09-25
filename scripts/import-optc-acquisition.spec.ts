import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';
import { applyManualCharacterOverlay } from './lib/manual-character-apply.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createSqlSeed,
  createUnresolvedCatalog,
  writeGeneratedDatasetFiles,
} from './lib/optc-dataset.mjs';
import { attachProgressionData, normalizeAcquisition } from './lib/optc-upstream-progression.mjs';

/*
 * 869f63gm1. The importer reads how a unit is obtained besides a drop - the acquisition keys of
 * `flags.js`, `shops.js` and `banners.js` - into `character_acquisition`, which the Character
 * screen's "How to get it" reads. Only positive facts exist there: a unit nothing records has no row.
 */

describe('normalizeAcquisition', () => {
  it("keeps upstream's acquisition flags in upstream's order, and nothing that is not one", () => {
    const byId = normalizeAcquisition({
      flags: {
        1: { global: 1 },
        2: { global: 1, rr: 1, rro: 1 },
        3: { global: 1, kclrr: 1, lrr: 1, rr: 1, inkable: 1 },
        4: { shop: 1, special: 1 },
        5: { global: 1, rr: 0 },
      },
    });

    // `global` is a region, `rro` a subset of `rr`, `inkable` an evolution fact: none is a way in.
    expect(byId.has(1)).toBe(false);
    expect(byId.get(2)?.flags).toEqual(['rr']);
    expect(byId.get(3)?.flags).toEqual(['rr', 'lrr', 'kclrr']);
    expect(byId.get(4)?.flags).toEqual(['special', 'shop']);
    expect(byId.has(5)).toBe(false);
  });

  it("reads the shops and the Friend Point banner per unit, each once, in upstream's order", () => {
    const byId = normalizeAcquisition({
      shops: { Ray: [32, 4067], Medal: [4067, 4067], TM: ['4067', 'x', -5, '12-skull'] },
      banners: { FP: [27, 32] },
    });

    expect(byId.get(4067)).toEqual({ flags: [], shops: ['Ray', 'Medal', 'TM'], banners: [] });
    expect(byId.get(32)).toEqual({ flags: [], shops: ['Ray'], banners: ['FP'] });
    expect(byId.get(27)).toEqual({ flags: [], shops: [], banners: ['FP'] });
    expect([...byId.keys()].sort((left, right) => left - right)).toEqual([27, 32, 4067]);
  });

  it('records nothing when no file names the unit - never a negative', () => {
    expect(normalizeAcquisition({}).size).toBe(0);
    expect(normalizeAcquisition({ flags: null, shops: { Ray: 'nope' }, banners: {} }).size).toBe(0);
  });
});

describe('the dataset', () => {
  const units = [
    { id: 1, name: 'Sugo Legend' },
    { id: 2, name: 'Unrecorded' },
  ];
  const acquisition = normalizeAcquisition({
    flags: { 1: { global: 1, rr: 1, lrr: 1 } },
    shops: { Ray: [1] },
    banners: { FP: [1] },
  });

  it("attaches each unit's acquisition by id, and empty lists where nothing is recorded", () => {
    const [legend, unrecorded] = attachProgressionData(units, {
      cooldowns: new Map(),
      evolutions: { forward: new Map(), reverse: new Map() },
      dropSources: new Map(),
      acquisition,
    });

    expect(legend?.acquisition).toEqual({ flags: ['rr', 'lrr'], shops: ['Ray'], banners: ['FP'] });
    expect(unrecorded?.acquisition).toEqual({ flags: [], shops: [], banners: [] });
  });

  it('keeps acquisition through the manual-character overlay, and gives a manual character none', async () => {
    /*
     * The seed is written twice on an import: once from upstream, then again from characters read
     * back out of it by the manual-character overlay. A table that round trip does not name is
     * dropped on the second write with no error (869f1935z), so this drives the second write.
     */
    const rootDir = await mkdtemp(path.join(tmpdir(), 'optc-acquisition-'));
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
    const sourceImageDir = path.join(scriptsDataDir, 'character-images');
    const characters = attachProgressionData(units.map(createCharacter), {
      cooldowns: new Map(),
      evolutions: { forward: new Map(), reverse: new Map() },
      dropSources: new Map(),
      acquisition,
    });
    const generatedAt = '2026-09-25T00:00:00.000Z';
    const manifest = buildManifest(characters, [], 'test', [], generatedAt);

    await mkdir(dataDir, { recursive: true });
    await mkdir(sourceImageDir, { recursive: true });
    await writeGeneratedDatasetFiles(
      dataDir,
      manifest,
      createSqlSeed(characters, [], manifest),
      createUnresolvedCatalog(characters, [], 'test', generatedAt),
      buildAutoBuilderAbilityCatalog(generatedAt, 'test', []),
      buildPreviewPayload(generatedAt, characters, []),
    );
    await writeFile(path.join(scriptsDataDir, 'builder-ability-corrections.json'), '{}');
    await writeFile(
      path.join(scriptsDataDir, 'manual-characters.json'),
      JSON.stringify({ 900000: createManualRecord(900000) }),
    );
    await writeFile(path.join(sourceImageDir, '900000.png'), 'manual-png');

    const result = await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      seedPath: path.join(dataDir, 'optc-seed.sql'),
      manifestPath: path.join(dataDir, 'optc-manifest.json'),
      overlayPath: path.join(scriptsDataDir, 'manual-characters.json'),
      sourceImageDir,
      exactImagesDir: path.join(rootDir, 'public', 'assets', 'exact-character-images'),
      logger: null,
    });
    const SQL = await loadSqlJs();
    const database = new SQL.Database(
      buildDatasetDatabaseBytes(SQL, await readFile(path.join(dataDir, 'optc-seed.sql'), 'utf8')),
    );
    const [rows] = database.exec(
      'SELECT character_id, sources_json FROM character_acquisition ORDER BY character_id',
    );
    const [ids] = database.exec('SELECT id FROM characters ORDER BY id');

    database.close();

    expect(result.written).toBe(true);
    expect(ids?.values).toEqual([[1], [2], [900000]]);
    // Only the unit something records has a row: #2 and the manual character have none.
    expect(rows?.values).toEqual([
      [1, JSON.stringify({ flags: ['rr', 'lrr'], shops: ['Ray'], banners: ['FP'] })],
    ]);
  });
});

function createCharacter({ id, name }: { id: number; name: string }) {
  return {
    id,
    name,
    type: 'STR',
    primaryClass: 'Fighter',
    secondaryClass: null,
    classes: ['Fighter'],
    stars: 6,
    starsLabel: '6',
    cost: 55,
    combo: 4,
    minHp: 1000,
    minAtk: 500,
    minRcv: 100,
    maxHp: 3000,
    maxAtk: 1500,
    maxRcv: 300,
    growth: 1,
    searchText: name.toLowerCase(),
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: true },
    assets: { exactLocal: null, thumbnailLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    detail: { characterId: id, captainAbility: null, specialText: null },
  };
}

function createManualRecord(id: number) {
  return {
    id,
    name: 'Manual Luffy',
    type: 'STR',
    classes: ['Fighter'],
    stars: 6,
    cost: 55,
    combo: 4,
    minHp: 1000,
    minAtk: 500,
    minRcv: 100,
    maxHp: 3000,
    maxAtk: 1500,
    maxRcv: 300,
    growth: 0,
    image: { file: `${id}.png` },
    detail: { characterId: id },
  };
}

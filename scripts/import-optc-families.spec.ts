import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeCharacters, resolveCharacterFamilies } from './import-optc-data.mjs';
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

/*
 * 869f63grj. The importer reads upstream's `common/data/families.js` and stores each unit's list as
 * `families`, the `families_json` column - what decides which cards are the same character.
 */

const unit = (name: string) => [
  name,
  'STR',
  ['Fighter'],
  5,
  30,
  4,
  5,
  99,
  5_000_000,
  1000,
  500,
  100,
  3000,
  1500,
  300,
  1,
];

describe('resolveCharacterFamilies', () => {
  it("keeps upstream's names in upstream's order, each once", () => {
    expect(resolveCharacterFamilies(['Monkey D. Luffy', 'Kaido'])).toEqual([
      'Monkey D. Luffy',
      'Kaido',
    ]);
    expect(
      resolveCharacterFamilies([' Vinsmoke Sanji ', 'Sanji', 'Vinsmoke Sanji', '', 7]),
    ).toEqual(['Vinsmoke Sanji', 'Sanji']);
  });

  it('reads a unit upstream has no entry for as an empty list, never as a guess', () => {
    expect(resolveCharacterFamilies(undefined)).toEqual([]);
    expect(resolveCharacterFamilies('Monkey D. Luffy')).toEqual([]);
  });
});

describe('normalizeCharacters', () => {
  it("attaches each unit's families by id", () => {
    const [luffy, fodder] = normalizeCharacters(
      [unit('Monkey D. Luffy'), unit('Red Robber Penguin')],
      {},
      [],
      new Map(),
      {},
      {},
      { 1: ['Monkey D. Luffy'] },
    );

    expect(luffy?.families).toEqual(['Monkey D. Luffy']);
    expect(fodder?.families).toEqual([]);
  });
});

describe('the seed round trip', () => {
  /*
   * The seed is written twice on an import: once from upstream, then again from characters read
   * back out of it by the manual-character overlay. A column that round trip does not name is
   * dropped on the second write with no error (869f1935z), so this drives the second write.
   */
  it('keeps families through the manual-character overlay, and gives a manual character none', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'optc-families-'));
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
    const sourceImageDir = path.join(scriptsDataDir, 'character-images');
    const [upstream] = normalizeCharacters(
      [unit('Lucy - Corrida Coliseum')],
      {},
      [],
      new Map(),
      {},
      {},
      {
        1: ['Monkey D. Luffy'],
      },
    );
    const generatedAt = '2026-09-24T00:00:00.000Z';
    const manifest = buildManifest([upstream], [], 'test', [], generatedAt);

    await mkdir(dataDir, { recursive: true });
    await mkdir(sourceImageDir, { recursive: true });
    await writeGeneratedDatasetFiles(
      dataDir,
      manifest,
      createSqlSeed([upstream], [], manifest),
      createUnresolvedCatalog([upstream], [], 'test', generatedAt),
      buildAutoBuilderAbilityCatalog(generatedAt, 'test', []),
      buildPreviewPayload(generatedAt, [upstream], []),
    );
    await writeFile(path.join(scriptsDataDir, 'builder-ability-corrections.json'), '{}');
    await writeFile(
      path.join(scriptsDataDir, 'manual-characters.json'),
      JSON.stringify({
        900000: {
          id: 900000,
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
          image: { file: '900000.png' },
          detail: { characterId: 900000 },
        },
      }),
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
    const [rows] = database.exec('SELECT id, families_json FROM characters ORDER BY id');

    database.close();

    expect(result.written).toBe(true);
    expect(rows?.values).toEqual([
      [1, '["Monkey D. Luffy"]'],
      [900000, '[]'],
    ]);
  });
});

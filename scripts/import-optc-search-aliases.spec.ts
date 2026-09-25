import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isLatinScriptAlias,
  normalizeCharacters,
  resolveCharacterSearchAliases,
} from './import-optc-data.mjs';
import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';
import { UPSTREAM_DECLARED_COLUMNS } from './lib/dataset-provenance.mjs';
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
 * 869f63gkm. The importer reads upstream's `common/data/aliases.js` - the names players use for a
 * unit - into `search_aliases`: Latin script only, never displayed, and apart from `search_text`.
 * The rows below are upstream's own, for #3018 "Dark King" Silvers Rayleigh and #834.
 */

const RAYLEIGH_SEARCH_TEXT =
  '"dark king" silvers rayleigh - old soldier watching over the next generation str free spirit';

const unit = (name: string) => [
  name,
  'STR',
  ['Free Spirit'],
  6,
  55,
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

describe('isLatinScriptAlias', () => {
  it('is true for Latin letters, with any digits and punctuation around them', () => {
    expect(isLatinScriptAlias('V2 Legend Rayleigh')).toBe(true);
    expect(isLatinScriptAlias('Mega/Super/6+ Rayleigh')).toBe(true);
    expect(isLatinScriptAlias('Brume Argentée')).toBe(true);
  });

  it('is false for a Japanese or Greek name, a mixed one, and one with no letter at all', () => {
    expect(isLatinScriptAlias('シルバーズ・レイリー')).toBe(false);
    expect(isLatinScriptAlias('Mr.7 & ﾐｽ･ﾌｧｰｻﾞｰｽﾞﾃﾞｰ')).toBe(false);
    expect(isLatinScriptAlias('Ρέιλι')).toBe(false);
    expect(isLatinScriptAlias('4529')).toBe(false);
  });
});

describe('resolveCharacterSearchAliases', () => {
  it("keeps upstream's Latin names, lower-cased, in upstream's order", () => {
    expect(
      resolveCharacterSearchAliases(
        [
          'シルバーズ・レイリー 冥王',
          'Silvers Rayleigh Roi des Ténèbres',
          'Mega/Super/6+ Rayleigh',
          'V2 Legend Rayleigh',
        ],
        RAYLEIGH_SEARCH_TEXT,
      ),
    ).toBe('silvers rayleigh roi des ténèbres mega/super/6+ rayleigh v2 legend rayleigh');
  });

  it("leaves out a name the unit's search text already contains, read the way a search reads it", () => {
    // "Silvers Rayleigh" is in the search text; "Dark King Silvers" is too, once the quotes are words.
    expect(
      resolveCharacterSearchAliases(
        ['Silvers Rayleigh', 'Dark King Silvers', 'Old Rayleigh'],
        RAYLEIGH_SEARCH_TEXT,
      ),
    ).toBe('old rayleigh');
  });

  it('leaves out an alias a longer one already contains, whichever comes first', () => {
    expect(resolveCharacterSearchAliases(['Legend Rayleigh', 'V2 Legend Rayleigh'], 'x')).toBe(
      'v2 legend rayleigh',
    );
    expect(resolveCharacterSearchAliases(['V2 Legend Rayleigh', 'Legend Rayleigh'], 'x')).toBe(
      'v2 legend rayleigh',
    );
    expect(resolveCharacterSearchAliases(['Log Ace', 'log  ace', 'LOG ACE'], 'x')).toBe('log ace');
  });

  it('gives nothing for a unit with no Latin alias, or with no entry at all', () => {
    expect(resolveCharacterSearchAliases(['シルバーズ・レイリー', '', ' '], 'x')).toBe('');
    expect(resolveCharacterSearchAliases(['Mr.7 & ﾐｽ･ﾌｧｰｻﾞｰｽﾞﾃﾞｰ'], 'x')).toBe('');
    expect(resolveCharacterSearchAliases(undefined, 'x')).toBe('');
    expect(resolveCharacterSearchAliases('V2 Legend Rayleigh', 'x')).toBe('');
  });
});

describe('the dataset', () => {
  it('attaches the aliases by id, and never into the search text the builders read', () => {
    const [rayleigh, other] = normalizeCharacters(
      [unit('"Dark King" Silvers Rayleigh'), unit('Someone Else')],
      {},
      [],
      new Map(),
      {},
      {},
      {},
      { 1: ['シルバーズ・レイリー', 'Silvers Rayleigh', 'V2 Legend Rayleigh'] },
    );

    expect(rayleigh?.searchAliases).toBe('v2 legend rayleigh');
    expect(rayleigh?.searchText).not.toContain('legend');
    expect(other?.searchAliases).toBe('');
  });

  it('writes search_aliases, keeps it through the manual-character overlay, and gives a manual character none', async () => {
    /*
     * The seed is written twice on an import: once from upstream, then again from characters read
     * back out of it by the manual-character overlay. A column that round trip does not name is
     * dropped on the second write with no error (869f1935z), so this drives the second write.
     */
    const rootDir = await mkdtemp(path.join(tmpdir(), 'optc-aliases-'));
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
    const sourceImageDir = path.join(scriptsDataDir, 'character-images');
    const [rayleigh] = normalizeCharacters(
      [unit('"Dark King" Silvers Rayleigh')],
      {},
      [],
      new Map(),
      {},
      {},
      {},
      { 1: ['', '', 'V2 Legend Rayleigh'] },
    );
    const generatedAt = '2026-09-25T00:00:00.000Z';
    const manifest = buildManifest([rayleigh], [], 'test', [], generatedAt);

    await mkdir(dataDir, { recursive: true });
    await mkdir(sourceImageDir, { recursive: true });
    await writeGeneratedDatasetFiles(
      dataDir,
      manifest,
      createSqlSeed([rayleigh], [], manifest),
      createUnresolvedCatalog([rayleigh], [], 'test', generatedAt),
      buildAutoBuilderAbilityCatalog(generatedAt, 'test', []),
      buildPreviewPayload(generatedAt, [rayleigh], []),
    );
    await writeFile(path.join(scriptsDataDir, 'builder-ability-corrections.json'), '{}');
    await writeFile(
      path.join(scriptsDataDir, 'manual-characters.json'),
      JSON.stringify({
        900000: {
          id: 900000,
          name: 'Manual Rayleigh',
          // A manual character's own aliases go into its search text, as they always have.
          searchAliases: ['old man'],
          type: 'STR',
          classes: ['Free Spirit'],
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
    const [rows] = database.exec('SELECT id, search_aliases FROM characters ORDER BY id');
    const [manual] = database.exec('SELECT search_text FROM characters WHERE id = 900000');

    database.close();

    expect(result.written).toBe(true);
    expect(rows?.values).toEqual([
      [1, 'v2 legend rayleigh'],
      [900000, ''],
    ]);
    expect(String(manual?.values[0]?.[0])).toContain('old man');
  });

  it('declares the column as upstream data, read from aliases.js', () => {
    expect(UPSTREAM_DECLARED_COLUMNS.search_aliases?.source).toBe('aliases.js, Latin script only');
  });
});

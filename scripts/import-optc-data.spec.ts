import { describe, expect, it } from 'vitest';

import {
  applyShipThumbnailOverrides,
  buildDeterministicCharacterAssetsMap,
  buildPackListingUrl,
  buildSourceFileUrl,
  dataImportSources,
  extractSourceVersion,
  normalizeCharacters,
  normalizeCharacterDetail,
  packDefinitions,
  parseArgs,
  resolveImportSource,
  shouldDownloadPack,
} from './import-optc-data.mjs';

describe('import-optc-data ship thumbnail pack', () => {
  it('defaults the importer source to 2shankz', () => {
    expect(parseArgs([])).toMatchObject({
      downloadImages: 'none',
      source: '2shankz',
    });
  });

  it('resolves the 2shankz source config for raw data files', () => {
    const source = resolveImportSource(parseArgs(['--source=2shankz']).source);

    expect(source).toEqual(dataImportSources['2shankz']);
    expect(buildSourceFileUrl(source, 'common/data/units.js')).toBe(
      'https://raw.githubusercontent.com/2Shankz/optc-db.github.io/master/common/data/units.js',
    );
  });

  it('resolves the upstream optc-db source config explicitly', () => {
    const source = resolveImportSource(parseArgs(['--source=optc-db']).source);

    expect(source).toEqual(dataImportSources['optc-db']);
    expect(buildSourceFileUrl(source, 'common/data/details.js')).toBe(
      'https://raw.githubusercontent.com/optc-db/optc-db.github.io/master/common/data/details.js',
    );
  });

  it('rejects unsupported source values with a clear error', () => {
    expect(() => parseArgs(['--source=unknown-fork'])).toThrow(
      'Invalid --source value "unknown-fork". Expected one of: 2shankz, optc-db.',
    );
  });

  it('extracts source versions from quoted or unquoted upstream scripts', () => {
    expect(extractSourceVersion("window.dbVersion = '36';")).toBe('36');
    expect(extractSourceVersion('window.dbVersion = 36;')).toBe('36');
  });

  it('registers the ship thumbnail pack definition', () => {
    expect(packDefinitions.find((pack) => pack.id === 'ship-thumbnails')).toMatchObject({
      key: 'shipThumbnails',
      id: 'ship-thumbnails',
      listingPath: 'api/images/thumbnail',
      entryName: 'ship',
    });
  });

  it('includes ship thumbnails in the all and thumbnails download modes', () => {
    expect(shouldDownloadPack('all', 'ship-thumbnails')).toBe(true);
    expect(shouldDownloadPack('thumbnails', 'ship-thumbnails')).toBe(true);
  });

  it('includes every supported image pack in the all download mode', () => {
    expect(shouldDownloadPack('all', 'thumbnails-glo')).toBe(true);
    expect(shouldDownloadPack('all', 'thumbnails-jap')).toBe(true);
    expect(shouldDownloadPack('all', 'ship-thumbnails')).toBe(true);
  });

  it('includes only thumbnail packs in the thumbnails download mode', () => {
    expect(shouldDownloadPack('thumbnails', 'thumbnails-glo')).toBe(true);
    expect(shouldDownloadPack('thumbnails', 'thumbnails-jap')).toBe(true);
    expect(shouldDownloadPack('thumbnails', 'ship-thumbnails')).toBe(true);
  });

  it('supports downloading only ship thumbnails when requested explicitly', () => {
    expect(shouldDownloadPack('ship-thumbnails', 'ship-thumbnails')).toBe(true);
    expect(shouldDownloadPack('ship-thumbnails', 'thumbnails-glo')).toBe(false);
  });

  it('supports each explicit single-pack download mode', () => {
    expect(shouldDownloadPack('thumbnails-glo', 'thumbnails-glo')).toBe(true);
    expect(shouldDownloadPack('thumbnails-glo', 'thumbnails-jap')).toBe(false);
    expect(shouldDownloadPack('thumbnails-jap', 'thumbnails-jap')).toBe(true);
    expect(shouldDownloadPack('thumbnails-jap', 'ship-thumbnails')).toBe(false);
  });

  it('uses the selected GitHub repo when building image pack listings', () => {
    const globalThumbPack = packDefinitions.find((pack) => pack.id === 'thumbnails-glo');

    expect(globalThumbPack).toBeTruthy();
    if (!globalThumbPack) {
      throw new Error('Expected thumbnails-glo pack definition.');
    }

    expect(buildPackListingUrl(dataImportSources['2shankz'], globalThumbPack)).toBe(
      'https://api.github.com/repos/2Shankz/optc-db.github.io/contents/api/images/thumbnail?ref=master',
    );
    expect(buildPackListingUrl(dataImportSources['optc-db'], globalThumbPack)).toBe(
      'https://api.github.com/repos/optc-db/optc-db.github.io/contents/api/images/thumbnail?ref=master',
    );
  });

  it('builds deterministic thumbnail asset paths without remote pack listings', () => {
    const assetsById = buildDeterministicCharacterAssetsMap(2, {
      Utils: {
        getThumbnailUrl(characterId) {
          return {
            glo: `/api/images/thumbnail/glo/0/000/${String(characterId).padStart(4, '0')}.png`,
            jap: `/api/images/thumbnail/jap/0/000/${String(characterId).padStart(4, '0')}.png`,
          };
        },
      },
    });

    expect(assetsById.get(1)).toMatchObject({
      thumbnailGlobal: '0/000/0001.png',
      thumbnailJapan: '0/000/0001.png',
    });
    expect(assetsById.get(2)).toMatchObject({
      thumbnailGlobal: '0/000/0002.png',
      thumbnailJapan: '0/000/0002.png',
    });
  });

  it('fills missing ship thumbs from local overrides without replacing upstream thumbs', () => {
    const result = applyShipThumbnailOverrides(
      [
        { id: 63, name: "Shiki's Island Ship", thumb: null, description: '' },
        { id: 14, name: 'Thousand Sunny', thumb: 'ship_0014_t2.png', description: '' },
      ],
      new Map([
        [63, { file: 'ship_0063_t2.png' }],
        [14, { file: 'ship_0014_override.png' }],
      ]),
    );

    expect(result).toEqual([
      { id: 63, name: "Shiki's Island Ship", thumb: 'ship_0063_t2.png', description: '' },
      { id: 14, name: 'Thousand Sunny', thumb: 'ship_0014_t2.png', description: '' },
    ]);
  });

  it('maps upstream unit tuple stats without shifting max RCV into growth', () => {
    const [character] = normalizeCharacters(
      [
        [
          'Black Maria & Ulti - Merciless Assault',
          ['DEX', 'INT'],
          [
            ['Cerebral', 'Driven'],
            ['Cerebral', 'Driven'],
            ['Cerebral', 'Driven'],
          ],
          6,
          55,
          4,
          5,
          99,
          5_000_000,
          2063,
          889,
          185,
          4126,
          1777,
          370,
          1,
        ],
      ],
      {},
      [],
      new Map(),
    );

    expect(character).toMatchObject({
      minHp: 2063,
      minAtk: 889,
      minRcv: 185,
      maxHp: 4126,
      maxAtk: 1777,
      maxRcv: 370,
      growth: 1,
    });
  });

  it('precomputes captain HP, ATK, and average boosts from all captain variants', () => {
    const [character] = normalizeCharacters(
      [
        [
          'Boost Tester',
          'DEX',
          ['Fighter'],
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
        ],
      ],
      {
        1: {
          captain: {
            base: 'Boosts ATK of DEX characters by 5x and HP by 1.2x.',
            llbbase: 'Boosts ATK of DEX characters by 5.5x and HP by 1.4x.',
          },
        },
      },
      [],
      new Map(),
    );

    expect(character.captainHpBoost).toBe(1.4);
    expect(character.captainAtkBoost).toBe(5.5);
    expect(character.captainAverageBoost).toBe(3.45);
  });

  it('supports object-based unit maps from the 2shankz source', () => {
    const [character] = normalizeCharacters(
      {
        '1': {
          id: '1',
          name: 'Monkey D. Luffy',
          type: 'STR',
          class: ['Fighter', 'Free Spirit'],
          stars: '5',
          cost: 15,
          combo: 6,
          sockets: 3,
          minHP: 902,
          minATK: 473,
          minRCV: 74,
          maxHP: 1772,
          maxATK: 1313,
          maxRCV: 227,
          growth: null,
        },
      },
      {
        1: {
          special: 'Deals STR damage.',
        },
      },
      [],
      new Map(),
    );

    expect(character).toMatchObject({
      id: 1,
      name: 'Monkey D. Luffy',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: 'Free Spirit',
      minHp: 902,
      maxAtk: 1313,
      growth: 0,
    });
    expect(character.detail.specialText).toBe('Deals STR damage.');
  });

  it('derives missing base types from dashed object-map unit variants', () => {
    const characters = normalizeCharacters(
      {
        '4276': {
          id: '4276',
          name: 'Carrot & Dogstorm & Cat Viper - Moonlit Raging Sulongs',
          type: null,
          class: ['Slasher', 'Fighter'],
          stars: '6',
          cost: 55,
          combo: 4,
          sockets: 5,
          minHP: 1997,
          minATK: 884,
          minRCV: 198,
          maxHP: 3994,
          maxATK: 1768,
          maxRCV: 395,
          growth: null,
        },
        '4276-1': {
          id: '4276-1',
          name: 'Carrot',
          type: 'STR',
          class: ['Slasher', 'Fighter'],
        },
        '4276-2': {
          id: '4276-2',
          name: 'Dogstorm & Cat Viper',
          type: 'DEX',
          class: ['Slasher', 'Fighter'],
        },
      },
      {},
      [],
      new Map(),
    );

    expect(characters).toHaveLength(1);
    expect(characters[0]).toMatchObject({
      id: 4276,
      name: 'Carrot & Dogstorm & Cat Viper - Moonlit Raging Sulongs',
      type: 'STR,DEX',
      primaryClass: 'Slasher',
      secondaryClass: 'Fighter',
    });
    expect(characters[0].searchText).toContain('str');
    expect(characters[0].searchText).toContain('dex');
  });

  it('keeps explicit base unit types when dashed variants are present', () => {
    const [character] = normalizeCharacters(
      {
        '4308': {
          id: '4308',
          name: 'Nami & Sanji - Confronting the Peak of Science',
          type: 'QCK',
          class: ['Fighter', 'Cerebral'],
        },
        '4308-1': {
          id: '4308-1',
          name: 'Nami',
          type: 'DEX',
          class: ['Cerebral', 'Fighter'],
        },
      },
      {},
      [],
      new Map(),
    );

    expect(character.type).toBe('QCK');
  });

  it('imports typed support data and super special fields into the normalized detail shape', () => {
    const detail = normalizeCharacterDetail(
      {
        superSpecial:
          'Reduces Special Cooldown of all characters by 1 turn and transforms Free Spirit characters into Super Free Spirit characters.',
        superSpecialCriteria:
          'This character must be captain and your crew must consist of any 1 of the following, excluding Supports and counting only 1 per unit: Roronoa Zoro, Nami or Usopp.',
        superSpecialNotes: 'Only usable once per quest.',
        support: [
          {
            Characters: 'Roronoa Zoro, Nami and Usopp',
            description: ['Level 1 effect.', 'Level 2 effect.'],
          },
        ],
      },
      3607,
    );

    expect(detail.supportData).toEqual([
      {
        supportedCharactersText: 'Roronoa Zoro, Nami and Usopp',
        levelDescriptions: ['Level 1 effect.', 'Level 2 effect.'],
      },
    ]);
    expect(detail.superSpecialText).toContain('transforms Free Spirit characters');
    expect(detail.superSpecialCriteriaText).toContain('your crew must consist of any 1');
    expect(detail.superSpecialNotes).toBe('Only usable once per quest.');
    expect(detail.superSpecialCriteria).toMatchObject({
      parserStatus: 'roster_only',
      requiresCaptain: true,
      rosterBranches: [
        {
          branchType: 'character_count_any',
          requiredCount: 1,
        },
      ],
    });
  });

  it('preserves structured captain variants and notes without concatenating them', () => {
    const detail = normalizeCharacterDetail(
      {
        captain: {
          base: 'Base captain effect.',
          level1: 'Level 1 captain effect.',
          llbbase: 'LLB base captain effect.',
          llblevel1: 'LLB level 1 captain effect.',
        },
        captainNotes: 'Stacks with other additional drop captains.',
      },
      2035,
    );

    expect(detail.captainAbility).toBe('Base captain effect.');
    expect(detail.captainNotes).toBe('Stacks with other additional drop captains.');
    expect(detail.captainAbilityVariants).toEqual([
      {
        key: 'base',
        label: 'Base Captain Ability',
        text: 'Base captain effect.',
      },
      {
        key: 'level1',
        label: 'Limit Break Level 1 Captain Ability',
        text: 'Level 1 captain effect.',
      },
      {
        key: 'llbbase',
        label: 'LLB Base Captain Ability',
        text: 'LLB base captain effect.',
      },
      {
        key: 'llblevel1',
        label: 'LLB Level 1 Captain Ability',
        text: 'LLB level 1 captain effect.',
      },
    ]);
  });

  it('labels dual captain branches without flattening them into one summary', () => {
    const detail = normalizeCharacterDetail(
      {
        captain: {
          character1: 'Character 1 captain effect.',
          character2: 'Character 2 captain effect.',
          combined: 'Combined captain effect.',
        },
      },
      4002,
    );

    expect(detail.captainAbility).toBe('Character 1 captain effect.');
    expect(detail.captainAbilityVariants).toEqual([
      {
        key: 'character1',
        label: 'Captain Ability (Character 1)',
        text: 'Character 1 captain effect.',
      },
      {
        key: 'character2',
        label: 'Captain Ability (Character 2)',
        text: 'Character 2 captain effect.',
      },
      {
        key: 'combined',
        label: 'Captain Ability (Combined)',
        text: 'Combined captain effect.',
      },
    ]);
  });
});

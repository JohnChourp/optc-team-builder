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
  normalizeCharacterTags,
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

  it('materializes Rumble overrides before attaching rumble data to characters', () => {
    const [character] = normalizeCharacters(
      [
        [
          'Rumble Override Tester',
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
      {},
      [
        {
          id: 1,
          ability: [
            {
              effects: [{ attributes: ['ATK'], effect: 'buff', level: 1 }],
            },
            {
              effects: [{ override: { level: 2 } }],
            },
          ],
        },
      ],
      new Map(),
    );

    expect(character.detail.rumbleData?.ability).toHaveLength(1);
    expect(character.detail.rumbleData?.ability[0].effects[0]).toEqual({
      attributes: ['ATK'],
      effect: 'buff',
      level: 2,
    });
    expect(JSON.stringify(character.detail.rumbleData)).not.toContain('override');
  });

  it('precomputes captain HP, ATK, and average boosts from the default captain variant', () => {
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

    expect(character.captainHpBoost).toBe(1.2);
    expect(character.captainAtkBoost).toBe(5);
    expect(character.captainAverageBoost).toBe(3.1);
  });

  it('uses standard captain branches and ignores self-only conditional boosts', () => {
    const [character] = normalizeCharacters(
      [
        [
          'Big Mom - Emperor Suffering from Hunger Pangs',
          'STR',
          ['Powerhouse', 'Driven'],
          6,
          65,
          4,
          5,
          99,
          5_000_000,
          1840,
          1025,
          0,
          4120,
          1665,
          0,
          1,
        ],
      ],
      {
        1: {
          captain: {
            base: '<p><b>Always Active: </b>Boosts HP of [STR], [DEX] and [QCK] characters by 1.3x and changes [RCV] orbs into [SEMLA] orbs &amp;lt;script&amp;gt;.</p><script>Boosts ATK of all characters by 99x.</script><style>Boosts HP of all characters by 99x.</style><ul><li><b>Standard Captain: </b>Boosts ATK of [STR], [DEX] and [QCK] characters by 3.5x.</li></ul> <b>Powered Up Captain: </b>Boosts ATK of this character by 4.25x, boosts ATK of [STR], [DEX] and [QCK] characters by 4x. <b>Rampage Captain: </b>Boosts ATK of this character by 12x, boosts ATK of [STR], [DEX] and [QCK] characters by 3.75x.',
            level1:
              '<b>Always Active: </b>Boosts HP of [STR], [DEX] and [QCK] characters by 1.3x. <b>Standard Captain: </b>Boosts ATK of [STR], [DEX] and [QCK] characters by 3.75x.',
          },
        },
      },
      [],
      new Map(),
    );

    expect(character.captainHpBoost).toBe(1.3);
    expect(character.captainAtkBoost).toBe(3.5);
    expect(character.captainAverageBoost).toBe(2.4);
  });

  it('keeps conditional captain ATK boosts out of default boost fields', () => {
    const [character] = normalizeCharacters(
      [
        [
          'Brook - Freezing Chill of the Dead',
          'PSY',
          ['Slasher', 'Free Spirit'],
          6,
          55,
          4,
          5,
          99,
          5_000_000,
          2002,
          867,
          155,
          4004,
          1733,
          310,
          1,
        ],
      ],
      {
        1: {
          captain: {
            base: "Reduces crew's current HP by 80% at the start of the fight, reduces Special Cooldown of all characters by 3 turns at the start of the fight, reduces VS Gauge of all characters by 3 at the start of the fight, boosts ATK of Slasher and Free Spirit characters by 5.25x, boosts HP of Slasher and Free Spirit characters by 1.4x, makes [PSY] and [TND] orbs beneficial for Slasher and Free Spirit characters. If your crew has 4+ [Straw Hat Pirates], [Paramythia-type] or [Scientist] characters and HP is below 25% at the start of the turn, boosts ATK of Slasher and Free Spirit characters by 6.3x instead.",
          },
        },
      },
      [],
      new Map(),
    );

    expect(character.captainHpBoost).toBe(1.4);
    expect(character.captainAtkBoost).toBe(5.25);
    expect(character.captainAverageBoost).toBe(3.325);
  });

  it('ignores additionally-labeled Action Special captain boosts when precomputing defaults', () => {
    const [character] = normalizeCharacters(
      [
        [
          'Luffy & Bonney',
          'INT',
          ['Free Spirit', 'Cerebral'],
          6,
          55,
          4,
          5,
          99,
          5_000_000,
          1924,
          4308,
          291,
          1924,
          4308,
          291,
          1,
        ],
      ],
      {
        1: {
          captain: {
            base: 'Boosts ATK of [INT], Free Spirit and Cerebral characters by 6x, boosts HP of [INT], Free Spirit and Cerebral characters by 1.2x, and makes [INT] and [RCV] orbs beneficial for all characters. If your crew has 4+ [Straw Hat Pirates] or [Egghead Arc] characters, boosts ATK of [Bonney Pirates], [Revolutionary Army], [Straw Hat Pirates], [Scientist] and [Egghead Arc] characters by 1.1x, boosts ATK of [INT], Free Spirit and Cerebral characters by 6.6x instead if they have the applicable tag, and allows effects that inflict Increase Damage Taken and Weaken to ignore Debuff Protection; additionally, if this character is your Captain and performs EXCELLENT with their Action Special, for 3 turns boosts ATK of [Bonney Pirates], [Revolutionary Army], [Straw Hat Pirates], [Scientist] and [Egghead Arc] characters by 1.4x instead, and boosts ATK of [INT], Free Spirit and Cerebral characters by 8.4x instead if they have the applicable tag.',
          },
        },
      },
      [],
      new Map(),
    );

    expect(character.captainHpBoost).toBe(1.2);
    expect(character.captainAtkBoost).toBe(6);
    expect(character.captainAverageBoost).toBe(3.6);
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
        levelDescriptions: ['Level 2 effect.'],
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

  it('imports only max-level Super Tandem data with parsed activation criteria', () => {
    const detail = normalizeCharacterDetail(
      {
        superTandem: {
          characterCondition: [
            'Your crew must consist of any 1 of the following, excluding supports and counting only 1 per unit: Roronoa Zoro.',
            'Your crew must consist of any 1 of the following, excluding supports and counting only 1 per unit: Roronoa Zoro.',
            'Your crew must consist of any 1 of the following, excluding supports and counting only 1 per unit: Roronoa Zoro.',
            'Your crew must consist of any 1 of the following, excluding supports and counting only 1 per unit: Roronoa Zoro.',
            'Your crew must consist of any 2 of the following, excluding supports and counting only 1 per unit: Roronoa Zoro, Nami, Usopp.',
          ],
          description: [
            'Reduces Special Cooldown of Monkey D. Luffy characters by 1 turn.',
            'Reduces Special Cooldown of Monkey D. Luffy characters by 1 turn.',
            'Reduces Special Cooldown of Monkey D. Luffy characters by 1 turn.',
            'Reduces Special Cooldown of Monkey D. Luffy characters by 2 turns.',
            'Reduces Special Cooldown of Monkey D. Luffy and Jewelry Bonney characters by 2 turns, and boosts Tandem ATK of Free Spirit and Cerebral characters by 3x for 1 turn.',
          ],
        },
      },
      4490,
    );

    expect(detail.superTandemData).toEqual({
      requirement:
        'Your crew must consist of any 2 of the following, excluding supports and counting only 1 per unit: Roronoa Zoro, Nami, Usopp.',
      levels: [
        {
          level: 5,
          effect:
            'Reduces Special Cooldown of Monkey D. Luffy and Jewelry Bonney characters by 2 turns, and boosts Tandem ATK of Free Spirit and Cerebral characters by 3x for 1 turn.',
        },
      ],
      criteria: expect.objectContaining({
        parserStatus: 'roster_only',
        requiresCaptain: false,
        rosterBranches: [
          expect.objectContaining({
            branchType: 'character_count_any',
            requiredCount: 2,
          }),
        ],
      }),
    });
  });

  it('imports upstream character tags into normalized details and search text', () => {
    const characters = normalizeCharacters(
      {
        '4549': {
          id: '4549',
          name: 'Eustass "Captain" Kid - Aimed Damned Punk',
          type: 'STR',
          class: ['Striker', 'Driven'],
          stars: '6+',
          cost: 65,
          combo: 4,
        },
      },
      {
        4549: {
          captain: 'Boosts ATK of [STR], Striker and Driven characters by 5x.',
        },
      },
      [],
      new Map(),
      {
        4549: ['Kid Pirates', 'Worst Generation', 'Egghead Arc'],
      },
    );

    expect(characters[0]?.detail.characterTags).toEqual([
      'Kid Pirates',
      'Worst Generation',
      'Egghead Arc',
    ]);
    expect(characters[0]).toMatchObject({
      stars: 6,
      starsLabel: '6+',
    });
    expect(characters[0]?.searchText).toContain('kid pirates');
    expect(characters[0]?.searchText).toContain('worst generation');
  });

  it('keeps only max potential and support levels in normalized character details', () => {
    const detail = normalizeCharacterDetail(
      {
        potential: [
          {
            Name: 'Barrier Penetration',
            description: [
              'This character ignores barriers above 99% HP.',
              'This character ignores barriers.',
            ],
          },
        ],
        support: [
          {
            Characters: '[STR] Powerhouse characters',
            description: ['Boosts Color Affinity by 1.1x.', 'Boosts Color Affinity by 1.5x.'],
          },
        ],
      },
      4306,
    );

    expect(detail.potentialAbilities).toEqual([
      {
        Name: 'Barrier Penetration',
        description: ['This character ignores barriers.'],
      },
    ]);
    expect(detail.supportData).toEqual([
      {
        supportedCharactersText: '[STR] Powerhouse characters',
        levelDescriptions: ['Boosts Color Affinity by 1.5x.'],
      },
    ]);
  });

  it('normalizes character tags from mixed upstream values', () => {
    expect(normalizeCharacterTags(['Kid Pirates', ['Kid Pirates', ' Egghead Arc '], null])).toEqual(
      ['Kid Pirates', 'Egghead Arc'],
    );
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

  it('strips legacy HTML from normalized captain text and notes', () => {
    const detail = normalizeCharacterDetail(
      {
        captain:
          '<b>Always Active: </b>Boosts HP by 1.3x.<br><b>Standard Captain: </b>Boosts ATK by 3.5x.',
        captainNotes: 'First line.<br><b>Second line:</b> note.',
        specialNotes: 'Special line.<br><b>Branch:</b> note.',
        sailorNotes: 'Sailor line.<br><b>Branch:</b> note.',
      },
      2500,
    );

    expect(detail.captainAbility).toBe(
      'Always Active: Boosts HP by 1.3x. Standard Captain: Boosts ATK by 3.5x.',
    );
    expect(detail.captainNotes).toBe('First line. Second line: note.');
    expect(detail.specialNotes).toBe('Special line. Branch: note.');
    expect(detail.sailorNotes).toBe('Sailor line. Branch: note.');
    expect(detail.captainAbility).not.toContain('<b>');
    expect(detail.captainNotes).not.toContain('<br>');
    expect(detail.specialNotes).not.toContain('<br>');
    expect(detail.sailorNotes).not.toContain('<br>');
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

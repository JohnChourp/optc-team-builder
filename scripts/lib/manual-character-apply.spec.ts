import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

let applyManualCharacterOverlay: (options: Record<string, unknown>) => Promise<{
  written: boolean;
  manualCharacterCount: number;
  characterCount: number;
}>;
let buildAutoBuilderAbilityCatalog: (
  generatedAt: string,
  sourceVersion: string,
  abilities: Array<Record<string, unknown>>,
) => Record<string, unknown>;
let buildManifest: (
  characters: Array<Record<string, unknown>>,
  ships: Array<Record<string, unknown>>,
  sourceVersion: string,
  packs: Array<Record<string, unknown>>,
  generatedAt: string,
) => Record<string, unknown>;
let buildPreviewPayload: (
  generatedAt: string,
  characters: Array<Record<string, unknown>>,
  ships: Array<Record<string, unknown>>,
) => Record<string, unknown>;
let createSqlSeed: (
  characters: Array<Record<string, unknown>>,
  ships: Array<Record<string, unknown>>,
  manifest: Record<string, unknown>,
) => string;
let createUnresolvedCatalog: (
  characters: Array<Record<string, unknown>>,
  packs: Array<Record<string, unknown>>,
  sourceVersion: string,
  generatedAt: string,
) => Record<string, unknown>;
let writeGeneratedDatasetFiles: (
  dataDir: string,
  manifest: Record<string, unknown>,
  sqlSeed: string,
  unresolvedCatalog: Record<string, unknown>,
  autoBuilderAbilityCatalog: Record<string, unknown>,
  preview: Record<string, unknown>,
) => Promise<void>;

beforeAll(async () => {
  ({ applyManualCharacterOverlay } = await import(
    pathToFileURL(resolve(process.cwd(), 'scripts/lib/manual-character-apply.mjs')).href
  ));
  ({
    buildAutoBuilderAbilityCatalog,
    buildManifest,
    buildPreviewPayload,
    createSqlSeed,
    createUnresolvedCatalog,
    writeGeneratedDatasetFiles,
  } = await import(pathToFileURL(resolve(process.cwd(), 'scripts/lib/optc-dataset.mjs')).href));
});

describe('manual character apply pipeline', () => {
  it('applies custom characters, copies exact images and preserves detail payloads', async () => {
    const rootDir = await createFixtureWorkspace();
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const sourceImageDir = path.join(rootDir, 'scripts', 'data', 'character-images');
    const exactImagesDir = path.join(rootDir, 'public', 'assets', 'exact-character-images');
    const overlayPath = path.join(rootDir, 'scripts', 'data', 'manual-characters.json');
    const result = await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      seedPath: path.join(dataDir, 'optc-seed.sql'),
      manifestPath: path.join(dataDir, 'optc-manifest.json'),
      overlayPath,
      sourceImageDir,
      exactImagesDir,
      logger: null,
    });

    expect(result).toMatchObject({
      written: true,
      manualCharacterCount: 1,
      characterCount: 2,
    });
    expect(await readFile(path.join(exactImagesDir, '900000.png'), 'utf8')).toBe('manual-png');

    const preview = JSON.parse(await readFile(path.join(dataDir, 'optc-preview.json'), 'utf8'));
    const customCharacter = preview.characters.find(
      (character: { id: number }) => character.id === 900000,
    );
    const correctedUpstreamCharacter = preview.characters.find(
      (character: { id: number }) => character.id === 100,
    );

    expect(customCharacter).toMatchObject({
      id: 900000,
      detail: {
        supportData: [{ Characters: 'Luffy', description: ['Boosts ATK by 5%'] }],
        rumbleData: { description: 'Rumble text' },
      },
    });
    expect(customCharacter.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_bind',
          minTurns: 5,
          source: 'specialText',
        }),
      ]),
    );
    expect(correctedUpstreamCharacter?.detail.builderAbilities).toEqual([]);
  });

  it('is a no-op when the overlay is already applied', async () => {
    const rootDir = await createFixtureWorkspace();
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const sourceImageDir = path.join(rootDir, 'scripts', 'data', 'character-images');
    const exactImagesDir = path.join(rootDir, 'public', 'assets', 'exact-character-images');
    const overlayPath = path.join(rootDir, 'scripts', 'data', 'manual-characters.json');

    await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      seedPath: path.join(dataDir, 'optc-seed.sql'),
      manifestPath: path.join(dataDir, 'optc-manifest.json'),
      overlayPath,
      sourceImageDir,
      exactImagesDir,
      logger: null,
    });

    const secondResult = await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      seedPath: path.join(dataDir, 'optc-seed.sql'),
      manifestPath: path.join(dataDir, 'optc-manifest.json'),
      overlayPath,
      sourceImageDir,
      exactImagesDir,
      logger: null,
    });

    expect(secondResult.written).toBe(false);
  });

  it('reapplies manual characters after dataset regeneration without losing detail payloads or exact images', async () => {
    const rootDir = await createFixtureWorkspace();
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const sourceImageDir = path.join(rootDir, 'scripts', 'data', 'character-images');
    const exactImagesDir = path.join(rootDir, 'public', 'assets', 'exact-character-images');
    const overlayPath = path.join(rootDir, 'scripts', 'data', 'manual-characters.json');

    await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      seedPath: path.join(dataDir, 'optc-seed.sql'),
      manifestPath: path.join(dataDir, 'optc-manifest.json'),
      overlayPath,
      sourceImageDir,
      exactImagesDir,
      logger: null,
    });

    const regeneratedCharacters = [
      createBaseCharacter({
        name: 'Upstream Luffy v2',
        type: 'QCK',
        detail: {
          specialText: 'Reduces Bind duration by 6 turns.',
        },
      }),
    ];
    await writeFixtureDataset(dataDir, regeneratedCharacters, '2026-04-04T00:00:00.000Z');

    const previewWithoutManual = JSON.parse(
      await readFile(path.join(dataDir, 'optc-preview.json'), 'utf8'),
    );
    expect(
      previewWithoutManual.characters.map((character: { id: number }) => character.id),
    ).toEqual([100]);

    const result = await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      seedPath: path.join(dataDir, 'optc-seed.sql'),
      manifestPath: path.join(dataDir, 'optc-manifest.json'),
      overlayPath,
      sourceImageDir,
      exactImagesDir,
      logger: null,
    });

    expect(result).toMatchObject({
      written: true,
      manualCharacterCount: 1,
      characterCount: 2,
    });
    expect(await readFile(path.join(exactImagesDir, '900000.png'), 'utf8')).toBe('manual-png');

    const preview = JSON.parse(await readFile(path.join(dataDir, 'optc-preview.json'), 'utf8'));
    const regeneratedUpstreamCharacter = preview.characters.find(
      (character: { id: number }) => character.id === 100,
    );
    const reappliedManualCharacter = preview.characters.find(
      (character: { id: number }) => character.id === 900000,
    );

    expect(regeneratedUpstreamCharacter).toMatchObject({
      id: 100,
      name: 'Upstream Luffy v2',
      type: 'QCK',
      detail: {
        specialText: 'Reduces Bind duration by 6 turns.',
      },
    });
    expect(reappliedManualCharacter).toMatchObject({
      id: 900000,
      assets: {
        exactLocal: 'assets/exact-character-images/900000.png',
      },
      detail: {
        specialName: 'Flame Emperor',
        specialText: 'Reduces Bind duration by 5 turns.',
        supportData: [{ Characters: 'Luffy', description: ['Boosts ATK by 5%'] }],
        rumbleData: { description: 'Rumble text' },
      },
    });
    expect(reappliedManualCharacter.detail.builderAbilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'remove_bind',
          minTurns: 5,
          source: 'specialText',
        }),
      ]),
    );
  });

  it('overrides an upstream character when the manual overlay uses a canonical id', async () => {
    const rootDir = await createFixtureWorkspace();
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
    const sourceImageDir = path.join(scriptsDataDir, 'character-images');
    const exactImagesDir = path.join(rootDir, 'public', 'assets', 'exact-character-images');
    const overlayPath = path.join(scriptsDataDir, 'manual-characters.json');

    await writeFixtureDataset(dataDir, [
      createBaseCharacter({
        id: 4536,
        name: 'Wrong Upstream Usopp & Dorry',
        type: 'STR',
        detail: {
          characterId: 4536,
          specialText: 'Wrong upstream text.',
        },
      }),
    ]);
    await writeFile(
      overlayPath,
      JSON.stringify(
        {
          '4536': {
            id: 4536,
            name: 'Usopp & Dorry',
            type: 'DEX',
            classes: ['Fighter', 'Free Spirit'],
            stars: 6,
            cost: 55,
            combo: 5,
            minHp: 1200,
            minAtk: 600,
            minRcv: 200,
            maxHp: 4300,
            maxAtk: 2200,
            maxRcv: 420,
            growth: 0,
            image: {
              file: '4536.png',
            },
            detail: {
              characterId: 4536,
              captainAbility: null,
              specialName: 'Flame Emperor',
              specialText: 'Manual override text.',
              specialNotes: null,
              builderAbilities: [],
              sailorAbilities: [],
              sailorNotes: null,
              limitBreak: [],
              potentialAbilities: [],
              supportData: [],
              swapData: null,
              vsSpecial: null,
              superType: null,
              superTandemData: null,
              rushSugoSpecialData: null,
              superClass: null,
              rumbleData: null,
            },
          },
        },
        null,
        2,
      ),
    );
    await writeFile(path.join(sourceImageDir, '4536.png'), 'manual-4536-png');

    const result = await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      seedPath: path.join(dataDir, 'optc-seed.sql'),
      manifestPath: path.join(dataDir, 'optc-manifest.json'),
      overlayPath,
      sourceImageDir,
      exactImagesDir,
      logger: null,
    });

    expect(result).toMatchObject({
      written: true,
      manualCharacterCount: 1,
      characterCount: 1,
    });
    expect(await readFile(path.join(exactImagesDir, '4536.png'), 'utf8')).toBe('manual-4536-png');

    const preview = JSON.parse(await readFile(path.join(dataDir, 'optc-preview.json'), 'utf8'));
    expect(preview.characters).toHaveLength(1);
    expect(preview.characters[0]).toMatchObject({
      id: 4536,
      name: 'Usopp & Dorry',
      type: 'DEX',
      assets: {
        exactLocal: 'assets/exact-character-images/4536.png',
      },
      detail: {
        characterId: 4536,
        specialText: 'Manual override text.',
      },
    });
  });

  it('keeps linked variants selectable by internal id while preserving a shared canonical id', async () => {
    const rootDir = await createFixtureWorkspace();
    const dataDir = path.join(rootDir, 'public', 'assets', 'data');
    const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
    const sourceImageDir = path.join(scriptsDataDir, 'character-images');
    const exactImagesDir = path.join(rootDir, 'public', 'assets', 'exact-character-images');
    const overlayPath = path.join(scriptsDataDir, 'manual-characters.json');

    await writeFixtureDataset(dataDir, [
      createBaseCharacter({
        id: 4529,
        name: 'Clashing Blades Roronoa Zoro',
        type: 'DEX',
        primaryClass: 'Free Spirit',
        secondaryClass: 'Slasher',
        classes: ['Free Spirit', 'Slasher'],
        detail: {
          characterId: 4529,
          specialText: 'Zoro text.',
          partyConflictKeys: ['linked-variant-4529'],
        },
      }),
    ]);
    await writeFile(
      overlayPath,
      JSON.stringify(
        {
          '900005': {
            id: 900005,
            name: 'Clashing Blades St. Ethanbaron V. Nusjuro',
            searchAliases: ['4529', 'st ethanbaron v nusjuro'],
            type: 'STR',
            classes: ['Cerebral', 'Slasher'],
            stars: 6,
            cost: 99,
            combo: 4,
            minHp: null,
            minAtk: null,
            minRcv: null,
            maxHp: 6153,
            maxAtk: 2705,
            maxRcv: 405,
            growth: null,
            image: {
              file: '4529--st-ethanbaron-v-nusjuro.png',
              thumbnailFile: '4529--st-ethanbaron-v-nusjuro-thumb.jpg',
            },
            detail: {
              characterId: 4529,
              captainAbility: null,
              specialName: "Crackling Elder's Blade",
              specialText: 'Nusjuro text.',
              specialNotes: null,
              partyConflictKeys: ['linked-variant-4529'],
              builderAbilities: [],
              sailorAbilities: [],
              sailorNotes: null,
              limitBreak: [],
              potentialAbilities: [],
              supportData: [],
              swapData: null,
              vsSpecial: null,
              superType: null,
              superTandemData: null,
              rushSugoSpecialData: null,
              superClass: null,
              rumbleData: null,
            },
          },
        },
        null,
        2,
      ),
    );
    await writeFile(
      path.join(sourceImageDir, '4529--st-ethanbaron-v-nusjuro.png'),
      'manual-900005-png',
    );
    await writeFile(
      path.join(sourceImageDir, '4529--st-ethanbaron-v-nusjuro-thumb.jpg'),
      'manual-900005-thumb',
    );

    const result = await applyManualCharacterOverlay({
      rootDir,
      dataDir,
      seedPath: path.join(dataDir, 'optc-seed.sql'),
      manifestPath: path.join(dataDir, 'optc-manifest.json'),
      overlayPath,
      sourceImageDir,
      exactImagesDir,
      logger: null,
    });

    expect(result).toMatchObject({
      written: true,
      manualCharacterCount: 1,
      characterCount: 2,
    });

    const preview = JSON.parse(await readFile(path.join(dataDir, 'optc-preview.json'), 'utf8'));
    const zoro = preview.characters.find((character: { id: number }) => character.id === 4529);
    const nusjuro = preview.characters.find((character: { id: number }) => character.id === 900005);

    expect(zoro).toMatchObject({
      id: 4529,
      detail: {
        characterId: 4529,
        partyConflictKeys: ['linked-variant-4529'],
      },
    });
    expect(nusjuro).toMatchObject({
      id: 900005,
      searchText: expect.stringContaining('4529'),
      assets: {
        exactLocal: 'assets/exact-character-images/4529--st-ethanbaron-v-nusjuro.png',
        thumbnailLocal: 'assets/exact-character-images/4529--st-ethanbaron-v-nusjuro-thumb.jpg',
      },
      detail: {
        characterId: 4529,
        partyConflictKeys: ['linked-variant-4529'],
      },
    });
    expect(nusjuro.searchText).toContain('900005');
    expect(
      await readFile(path.join(exactImagesDir, '4529--st-ethanbaron-v-nusjuro.png'), 'utf8'),
    ).toBe('manual-900005-png');
  });
});

async function createFixtureWorkspace() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'optc-manual-apply-'));
  const dataDir = path.join(rootDir, 'public', 'assets', 'data');
  const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
  const sourceImageDir = path.join(scriptsDataDir, 'character-images');

  await mkdir(dataDir, { recursive: true });
  await mkdir(sourceImageDir, { recursive: true });

  await writeFixtureDataset(dataDir, [createBaseCharacter()]);

  await writeFile(
    path.join(scriptsDataDir, 'builder-ability-corrections.json'),
    JSON.stringify(
      {
        '100': {
          sourceScopes: ['specialText'],
          replaceAbilities: [],
          reason: 'Fixture regression coverage for correction application.',
        },
      },
      null,
      2,
    ),
  );

  await writeFile(
    path.join(scriptsDataDir, 'manual-characters.json'),
    JSON.stringify(
      {
        '900000': {
          id: 900000,
          name: 'Manual Ace',
          type: 'DEX',
          classes: ['Fighter', 'Free Spirit'],
          stars: 6,
          cost: 55,
          combo: 5,
          minHp: 1200,
          minAtk: 600,
          minRcv: 200,
          maxHp: 4300,
          maxAtk: 2200,
          maxRcv: 420,
          growth: 0,
          image: {
            file: '900000.png',
          },
          detail: {
            characterId: 900000,
            captainAbility: null,
            specialName: 'Flame Emperor',
            specialText: 'Reduces Bind duration by 5 turns.',
            specialNotes: null,
            builderAbilities: [
              {
                key: 'remove_bind',
                label: 'Remove Bind',
                minTurns: 5,
                isCompleteRemoval: false,
                slotTokens: [],
                source: 'specialText',
              },
            ],
            sailorAbilities: [],
            sailorNotes: null,
            limitBreak: [],
            potentialAbilities: [],
            supportData: [{ Characters: 'Luffy', description: ['Boosts ATK by 5%'] }],
            swapData: null,
            vsSpecial: null,
            superType: null,
            superTandemData: null,
            rushSugoSpecialData: null,
            superClass: null,
            rumbleData: { description: 'Rumble text' },
          },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(sourceImageDir, '900000.png'), 'manual-png');

  return rootDir;
}

async function writeFixtureDataset(
  dataDir: string,
  baseCharacters: Array<Record<string, unknown>>,
  generatedAt = '2026-04-03T00:00:00.000Z',
) {
  const ships: Array<Record<string, unknown>> = [];
  const manifest = buildManifest(baseCharacters, ships, 'test', [], generatedAt);
  manifest.availableClasses = [
    ...new Set([...manifest.availableClasses, 'Fighter', 'Free Spirit', 'Cerebral', 'Slasher']),
  ].sort();
  const unresolvedCatalog = createUnresolvedCatalog(baseCharacters, [], 'test', generatedAt);
  const sqlSeed = createSqlSeed(baseCharacters, ships, manifest);

  await writeGeneratedDatasetFiles(
    dataDir,
    manifest,
    sqlSeed,
    unresolvedCatalog,
    buildAutoBuilderAbilityCatalog(generatedAt, 'test', []),
    buildPreviewPayload(generatedAt, baseCharacters, ships),
  );
}

function createBaseCharacter(
  overrides: Partial<{
    id: number;
    name: string;
    type: string;
    primaryClass: string;
    secondaryClass: string | null;
    classes: string[];
    detail: Record<string, unknown>;
  }> = {},
) {
  const primaryClass = overrides.primaryClass ?? 'Fighter';
  const secondaryClass = overrides.secondaryClass ?? null;

  return {
    id: overrides.id ?? 100,
    name: overrides.name ?? 'Upstream Luffy',
    type: overrides.type ?? 'STR',
    primaryClass,
    secondaryClass,
    classes: overrides.classes ?? [primaryClass, secondaryClass].filter(Boolean),
    stars: 4,
    cost: 20,
    combo: 4,
    minHp: 500,
    minAtk: 200,
    minRcv: 80,
    maxHp: 3000,
    maxAtk: 1400,
    maxRcv: 250,
    growth: 0,
    searchText: 'upstream luffy str fighter',
    regionAvailability: {
      exactLocal: false,
      thumbnailGlobal: false,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    detail: {
      characterId: 100,
      captainAbility: null,
      specialName: null,
      specialText: 'Reduces Bind duration by 4 turns.',
      specialNotes: null,
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      limitBreak: [],
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superTandemData: null,
      rushSugoSpecialData: null,
      superClass: null,
      rumbleData: null,
      ...(overrides.detail ?? {}),
    },
  };
}

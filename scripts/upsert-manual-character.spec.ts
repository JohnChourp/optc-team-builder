import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path, { resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

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
  ({
    buildAutoBuilderAbilityCatalog,
    buildManifest,
    buildPreviewPayload,
    createSqlSeed,
    createUnresolvedCatalog,
    writeGeneratedDatasetFiles,
  } = await import(pathToFileURL(resolve(process.cwd(), 'scripts/lib/optc-dataset.mjs')).href));
});

describe('upsert manual character cli', () => {
  it('creates a custom character from a URL image', async () => {
    const fixture = await createFixtureWorkspace();
    const server = await startImageServer('remote-png');
    const payloadPath = path.join(fixture.rootDir, 'payload-create.json');

    await writeFile(
      payloadPath,
      JSON.stringify(
        {
          name: 'Remote Sabo',
          type: 'PSY',
          classes: ['Fighter', 'Free Spirit'],
          stars: 6,
          cost: 55,
          combo: 5,
          minHp: 1000,
          minAtk: 600,
          minRcv: 220,
          maxHp: 4400,
          maxAtk: 2300,
          maxRcv: 430,
          image: `${server.url}/character.png`,
          detail: {
            captainAbility: null,
            specialName: 'Dragon Claw',
            specialText: 'Reduces Despair duration by 5 turns.',
          },
        },
        null,
        2,
      ),
    );

    const { stdout } = await execFileAsync('node', [
      resolve(process.cwd(), 'scripts/upsert-manual-character.mjs'),
      `--payload-file=${payloadPath}`,
      `--data-dir=${fixture.dataDir}`,
      `--seed-path=${fixture.seedPath}`,
      `--manifest-path=${fixture.manifestPath}`,
      `--overlay-file=${fixture.overlayPath}`,
      `--source-image-dir=${fixture.sourceImageDir}`,
      `--exact-images-dir=${fixture.exactImagesDir}`,
    ]);

    await stopServer(server.server);

    expect(stdout).toContain('final custom id: 900000');

    const overlay = JSON.parse(await readFile(fixture.overlayPath, 'utf8'));
    expect(overlay['900000']).toMatchObject({
      id: 900000,
      name: 'Remote Sabo',
      image: { file: '900000.png' },
    });
    expect(await readFile(path.join(fixture.sourceImageDir, '900000.png'), 'utf8')).toBe(
      'remote-png',
    );
  });

  it('updates an existing custom character by id and preserves the same id', async () => {
    const fixture = await createFixtureWorkspace();
    const firstPayloadPath = path.join(fixture.rootDir, 'payload-create.json');
    const secondPayloadPath = path.join(fixture.rootDir, 'payload-update.json');
    const localImagePath = path.join(fixture.rootDir, 'updated-image.png');

    await writeFile(localImagePath, 'updated-png');
    await writeFile(
      firstPayloadPath,
      JSON.stringify(
        {
          name: 'Manual Yamato',
          type: 'STR',
          classes: ['Fighter'],
          stars: 6,
          cost: 55,
          combo: 5,
          minHp: 1000,
          minAtk: 600,
          minRcv: 220,
          maxHp: 4400,
          maxAtk: 2300,
          maxRcv: 430,
          image: localImagePath,
          detail: {
            captainAbility: null,
            specialName: 'Initial Skill',
            specialText: 'Reduces Bind duration by 5 turns.',
          },
        },
        null,
        2,
      ),
    );

    await execFileAsync('node', [
      resolve(process.cwd(), 'scripts/upsert-manual-character.mjs'),
      `--payload-file=${firstPayloadPath}`,
      `--data-dir=${fixture.dataDir}`,
      `--seed-path=${fixture.seedPath}`,
      `--manifest-path=${fixture.manifestPath}`,
      `--overlay-file=${fixture.overlayPath}`,
      `--source-image-dir=${fixture.sourceImageDir}`,
      `--exact-images-dir=${fixture.exactImagesDir}`,
    ]);

    await writeFile(
      secondPayloadPath,
      JSON.stringify(
        {
          id: 900000,
          name: 'Manual Yamato',
          type: 'STR',
          classes: ['Fighter'],
          stars: 6,
          cost: 55,
          combo: 5,
          minHp: 1000,
          minAtk: 600,
          minRcv: 220,
          maxHp: 5000,
          maxAtk: 2500,
          maxRcv: 500,
          image: localImagePath,
          detail: {
            captainAbility: 'Boosts ATK by 5x.',
            specialName: 'Updated Skill',
            specialText: 'Reduces Bind duration by 6 turns.',
          },
        },
        null,
        2,
      ),
    );

    const { stdout } = await execFileAsync('node', [
      resolve(process.cwd(), 'scripts/upsert-manual-character.mjs'),
      `--payload-file=${secondPayloadPath}`,
      `--data-dir=${fixture.dataDir}`,
      `--seed-path=${fixture.seedPath}`,
      `--manifest-path=${fixture.manifestPath}`,
      `--overlay-file=${fixture.overlayPath}`,
      `--source-image-dir=${fixture.sourceImageDir}`,
      `--exact-images-dir=${fixture.exactImagesDir}`,
    ]);

    expect(stdout).toContain('final custom id: 900000');

    const overlay = JSON.parse(await readFile(fixture.overlayPath, 'utf8'));
    expect(overlay['900000']).toMatchObject({
      id: 900000,
      maxHp: 5000,
      maxAtk: 2500,
      detail: {
        captainAbility: 'Boosts ATK by 5x.',
        specialName: 'Updated Skill',
        specialText: 'Reduces Bind duration by 6 turns.',
      },
    });
  });

  it('accepts an explicit canonical id and writes canonical image filenames', async () => {
    const fixture = await createFixtureWorkspace();
    const payloadPath = path.join(fixture.rootDir, 'payload-canonical.json');
    const localImagePath = path.join(fixture.rootDir, 'usopp-dorry.png');
    const localThumbnailPath = path.join(fixture.rootDir, 'usopp-dorry-thumb.jpg');

    await writeFile(localImagePath, 'canonical-png');
    await writeFile(localThumbnailPath, 'canonical-thumb');
    await writeFile(
      payloadPath,
      JSON.stringify(
        {
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
          image: {
            path: localImagePath,
            file: '4529--st-ethanbaron-v-nusjuro.png',
            thumbnailFile: '4529--st-ethanbaron-v-nusjuro-thumb.jpg',
          },
          thumbnailImage: {
            path: localThumbnailPath,
            file: '4529--st-ethanbaron-v-nusjuro-thumb.jpg',
          },
          detail: {
            characterId: 4529,
            captainAbility: null,
            specialName: "Crackling Elder's Blade",
            specialText: 'Verified text.',
            partyConflictKeys: ['linked-variant-4529'],
          },
        },
        null,
        2,
      ),
    );

    const { stdout } = await execFileAsync('node', [
      resolve(process.cwd(), 'scripts/upsert-manual-character.mjs'),
      `--payload-file=${payloadPath}`,
      `--data-dir=${fixture.dataDir}`,
      `--seed-path=${fixture.seedPath}`,
      `--manifest-path=${fixture.manifestPath}`,
      `--overlay-file=${fixture.overlayPath}`,
      `--source-image-dir=${fixture.sourceImageDir}`,
      `--exact-images-dir=${fixture.exactImagesDir}`,
    ]);

    expect(stdout).toContain('final custom id: 900005');

    const overlay = JSON.parse(await readFile(fixture.overlayPath, 'utf8'));
    expect(overlay['900005']).toMatchObject({
      id: 900005,
      name: 'Clashing Blades St. Ethanbaron V. Nusjuro',
      searchAliases: ['4529', 'st ethanbaron v nusjuro'],
      image: {
        file: '4529--st-ethanbaron-v-nusjuro.png',
        thumbnailFile: '4529--st-ethanbaron-v-nusjuro-thumb.jpg',
      },
      detail: {
        characterId: 4529,
        partyConflictKeys: ['linked-variant-4529'],
      },
    });
    expect(
      await readFile(
        path.join(fixture.sourceImageDir, '4529--st-ethanbaron-v-nusjuro.png'),
        'utf8',
      ),
    ).toBe('canonical-png');
    expect(
      await readFile(
        path.join(fixture.sourceImageDir, '4529--st-ethanbaron-v-nusjuro-thumb.jpg'),
        'utf8',
      ),
    ).toBe('canonical-thumb');
  });
});

async function createFixtureWorkspace() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'optc-manual-upsert-'));
  const dataDir = path.join(rootDir, 'public', 'assets', 'data');
  const scriptsDataDir = path.join(rootDir, 'scripts', 'data');
  const sourceImageDir = path.join(scriptsDataDir, 'character-images');
  const exactImagesDir = path.join(rootDir, 'public', 'assets', 'exact-character-images');

  await mkdir(dataDir, { recursive: true });
  await mkdir(sourceImageDir, { recursive: true });
  await mkdir(exactImagesDir, { recursive: true });

  const baseCharacters = [
    {
      id: 100,
      name: 'Upstream Luffy',
      type: 'STR',
      primaryClass: 'Fighter',
      secondaryClass: null,
      classes: ['Fighter'],
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
        specialText: null,
        specialNotes: null,
        builderAbilities: [],
        sailorAbilities: [],
        sailorNotes: null,
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
    {
      id: 4529,
      name: 'Clashing Blades Roronoa Zoro',
      type: 'DEX',
      primaryClass: 'Free Spirit',
      secondaryClass: 'Slasher',
      classes: ['Free Spirit', 'Slasher'],
      stars: 6,
      cost: 99,
      combo: 4,
      minHp: 1000,
      minAtk: 500,
      minRcv: 100,
      maxHp: 6100,
      maxAtk: 2600,
      maxRcv: 400,
      growth: 0,
      searchText: 'clashing blades roronoa zoro dex free spirit slasher 4529',
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
        characterId: 4529,
        captainAbility: null,
        specialName: null,
        specialText: 'Zoro text.',
        specialNotes: null,
        builderAbilities: [],
        sailorAbilities: [],
        sailorNotes: null,
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
  ];
  const ships: Array<Record<string, unknown>> = [];
  const generatedAt = '2026-04-03T00:00:00.000Z';
  const manifest = buildManifest(baseCharacters, ships, 'test', [], generatedAt);
  manifest.availableClasses = [
    ...new Set([...manifest.availableClasses, 'Fighter', 'Free Spirit', 'Cerebral', 'Slasher']),
  ].sort();

  await writeGeneratedDatasetFiles(
    dataDir,
    manifest,
    createSqlSeed(baseCharacters, ships, manifest),
    createUnresolvedCatalog(baseCharacters, [], 'test', generatedAt),
    buildAutoBuilderAbilityCatalog(generatedAt, 'test', []),
    buildPreviewPayload(generatedAt, baseCharacters, ships),
  );

  const overlayPath = path.join(scriptsDataDir, 'manual-characters.json');
  await writeFile(overlayPath, '{}');

  return {
    rootDir,
    dataDir,
    seedPath: path.join(dataDir, 'optc-seed.sql'),
    manifestPath: path.join(dataDir, 'optc-manifest.json'),
    overlayPath,
    sourceImageDir,
    exactImagesDir,
  };
}

async function startImageServer(body: string) {
  const server = http.createServer((_, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'image/png');
    response.end(body);
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve test image server address.');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server: http.Server) {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) {
        rejectPromise(error);
        return;
      }

      resolvePromise();
    });
  });
}

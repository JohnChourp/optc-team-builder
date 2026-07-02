import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildDatasetChangeDigest,
  formatDatasetChangeDigestMarkdown,
  runCli,
} from './dataset-change-digest.mjs';
import {
  buildAutoBuilderAbilityCatalog,
  buildManifest,
  buildPreviewPayload,
  createSqlSeed,
  createUnresolvedCatalog,
} from './lib/optc-dataset.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'optc-digest-'));
  tempDirs.push(dir);
  return dir;
}

describe('dataset-change-digest', () => {
  it('summarizes generated character, captain coverage, and ability catalog changes', async () => {
    const baseDir = await makeTempDir();
    const headDir = await makeTempDir();

    await writeDataset(baseDir, {
      sourceVersion: '100',
      characters: [
        createCharacter({
          id: 101,
          name: 'Monkey D. Luffy',
          captainMultiplier: 4,
          builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind')],
        }),
      ],
      abilities: [createCatalogAbility('remove_bind', [101])],
    });
    await writeDataset(headDir, {
      sourceVersion: '101',
      characters: [
        createCharacter({
          id: 101,
          name: 'Monkey D. Luffy',
          captainMultiplier: 5,
          builderAbilities: [
            createBuilderAbility('remove_bind', 'Remove Bind'),
            createBuilderAbility('boost_atk', 'Boost ATK'),
          ],
        }),
        createCharacter({
          id: 102,
          name: 'Roronoa Zoro',
          captainMultiplier: 3,
          builderAbilities: [createBuilderAbility('boost_atk', 'Boost ATK')],
        }),
      ],
      abilities: [createCatalogAbility('remove_bind', [101, 102]), createCatalogAbility('boost_atk', [101, 102])],
    });

    const report = await buildDatasetChangeDigest({
      baseDir,
      headDir,
      generatedAt: '2026-07-02T00:00:00.000Z',
    });
    const markdown = formatDatasetChangeDigestMarkdown(report);

    expect(report.status).toBe('changed');
    expect(report.manifest.sourceVersion).toMatchObject({ base: '100', head: '101', changed: true });
    expect(report.characters.addedCount).toBe(1);
    expect(report.characters.changedCount).toBe(1);
    expect(report.characters.captainCoverageChangedCount).toBe(1);
    expect(report.characters.builderAbilitiesChangedCount).toBe(1);
    expect(report.abilityCatalog.addedCount).toBe(1);
    expect(report.abilityCatalog.changedCount).toBe(1);
    expect(report.warnings).toEqual([]);
    expect(markdown).toContain('#101 Monkey D. Luffy');
    expect(markdown).toContain('boost_atk');
  });

  it('ignores generatedAt-only differences across generated files', async () => {
    const baseDir = await makeTempDir();
    const headDir = await makeTempDir();
    const character = createCharacter({
      id: 101,
      name: 'Monkey D. Luffy',
      captainMultiplier: 4,
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind')],
    });

    await writeDataset(baseDir, {
      generatedAt: '2026-07-01T00:00:00.000Z',
      sourceVersion: '100',
      characters: [character],
      abilities: [createCatalogAbility('remove_bind', [101])],
    });
    await writeDataset(headDir, {
      generatedAt: '2026-07-02T00:00:00.000Z',
      sourceVersion: '100',
      characters: [character],
      abilities: [createCatalogAbility('remove_bind', [101])],
    });

    const report = await buildDatasetChangeDigest({ baseDir, headDir });

    expect(report.status).toBe('unchanged');
    expect(report.characters.changedCount).toBe(0);
    expect(report.abilityCatalog.changedCount).toBe(0);
    expect(report.preview.changedCharacters).toBe(0);
    expect(report.unresolvedImages.changedCount).toBe(0);
  });

  it('marks manifest pack-only changes as changed', async () => {
    const baseDir = await makeTempDir();
    const headDir = await makeTempDir();
    const character = createCharacter({
      id: 101,
      name: 'Monkey D. Luffy',
      captainMultiplier: 4,
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind')],
    });

    await writeDataset(baseDir, {
      sourceVersion: '100',
      characters: [character],
      abilities: [createCatalogAbility('remove_bind', [101])],
      packs: [createPack({ checksum: 'old-checksum', fileCount: 10 })],
    });
    await writeDataset(headDir, {
      sourceVersion: '100',
      characters: [character],
      abilities: [createCatalogAbility('remove_bind', [101])],
      packs: [createPack({ checksum: 'new-checksum', fileCount: 11 })],
    });

    const report = await buildDatasetChangeDigest({ baseDir, headDir });

    expect(report.status).toBe('changed');
    expect(report.manifest.packs.changedCount).toBe(1);
    expect(report.characters.changedCount).toBe(0);
  });

  it('writes markdown and JSON from the CLI', async () => {
    const baseDir = await makeTempDir();
    const headDir = await makeTempDir();
    const outputDir = await makeTempDir();
    const markdownPath = path.join(outputDir, 'digest.md');
    const jsonPath = path.join(outputDir, 'digest.json');

    await writeDataset(baseDir, {
      sourceVersion: '100',
      characters: [createCharacter({ id: 101, name: 'Monkey D. Luffy', captainMultiplier: 4 })],
      abilities: [],
    });
    await writeDataset(headDir, {
      sourceVersion: '100',
      characters: [createCharacter({ id: 101, name: 'Monkey D. Luffy', captainMultiplier: 4 })],
      abilities: [],
    });

    const report = await runCli([
      '--base-dir',
      baseDir,
      '--head-dir',
      headDir,
      '--output',
      markdownPath,
      '--json-output',
      jsonPath,
    ]);

    await expect(readFile(markdownPath, 'utf8')).resolves.toContain('# Dataset Change Digest');
    await expect(readFile(jsonPath, 'utf8')).resolves.toContain('"schemaVersion": 1');
    expect(report?.status).toBe('unchanged');
  });
});

async function writeDataset(
  dir: string,
  {
    generatedAt = '2026-07-02T00:00:00.000Z',
    sourceVersion,
    characters,
    abilities,
    ships = [createShip()],
    packs = [],
  }: {
    generatedAt?: string;
    sourceVersion: string;
    characters: ReturnType<typeof createCharacter>[];
    abilities: ReturnType<typeof createCatalogAbility>[];
    ships?: ReturnType<typeof createShip>[];
    packs?: ReturnType<typeof createPack>[];
  },
) {
  await mkdir(dir, { recursive: true });
  const manifest = buildManifest(characters, ships, sourceVersion, packs, generatedAt);
  const seedSql = createSqlSeed(characters, ships, manifest);
  const abilityCatalog = buildAutoBuilderAbilityCatalog(generatedAt, sourceVersion, abilities);
  const preview = buildPreviewPayload(generatedAt, characters, ships);
  const unresolvedCatalog = createUnresolvedCatalog(characters, [], sourceVersion, generatedAt);

  await Promise.all([
    writeFile(path.join(dir, 'optc-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(path.join(dir, 'optc-seed.sql'), seedSql),
    writeFile(path.join(dir, 'optc-auto-builder-abilities.json'), `${JSON.stringify(abilityCatalog, null, 2)}\n`),
    writeFile(path.join(dir, 'optc-preview.json'), `${JSON.stringify(preview, null, 2)}\n`),
    writeFile(path.join(dir, 'optc-unresolved-images.json'), `${JSON.stringify(unresolvedCatalog, null, 2)}\n`),
  ]);
}

function createCharacter({
  id,
  name,
  captainMultiplier,
  builderAbilities = [],
}: {
  id: number;
  name: string;
  captainMultiplier: number;
  builderAbilities?: ReturnType<typeof createBuilderAbility>[];
}) {
  return {
    id,
    name,
    isIncomplete: false,
    type: 'STR',
    primaryClass: 'Fighter',
    secondaryClass: null,
    classes: ['Fighter'],
    stars: 5,
    starsLabel: '5',
    cost: 30,
    combo: 4,
    minHp: 100,
    minAtk: 100,
    minRcv: 100,
    maxHp: 2000,
    maxAtk: 1200,
    maxRcv: 300,
    growth: 1,
    regionAvailability: {},
    assets: {},
    searchText: `${name} STR Fighter ${id}`.toLowerCase(),
    detail: {
      characterId: id,
      captainAbility: `Boosts ATK of all characters by ${captainMultiplier}x.`,
      captainAbilityCoverage: {
        entries: [
          {
            key: 'captain',
            label: 'Captain Ability',
            tiers: [
              {
                tier: 1,
                kind: 'baseline',
                scope: 'crew-wide',
                characterConditions: {
                  universal: true,
                  fallbackOther: false,
                  selfOnly: false,
                  types: [],
                  classes: [],
                  characterTags: [],
                },
                teamConditions: [],
                fieldConditions: [],
                triggerConditions: [],
                clauses: [`Boosts ATK of all characters by ${captainMultiplier}x`],
                atkBoost: captainMultiplier,
              },
            ],
          },
        ],
      },
      specialText: 'Reduces Bind duration by 5 turns.',
      builderAbilities,
      characterTags: [],
      rumbleData: null,
    },
  };
}

function createBuilderAbility(key: string, label: string) {
  return {
    key,
    label,
    minTurns: null,
    isCompleteRemoval: false,
    slotTokens: [],
    source: 'specialText',
    coverageMode: 'explicit',
  };
}

function createCatalogAbility(key: string, matchingCharacterIds: number[]) {
  return {
    key,
    label: key
      .split('_')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' '),
    matchCount: matchingCharacterIds.length,
    matchingCharacterIds,
    sampleCharacterIds: matchingCharacterIds.slice(0, 3),
    turnMatchingCharacterIds: [],
  };
}

function createShip() {
  return {
    id: 1,
    name: 'Thousand Sunny',
    thumb: null,
    description: 'Default ship.',
  };
}

function createPack({ checksum, fileCount }: { checksum: string; fileCount: number }) {
  return {
    key: 'thumbnailsGlo',
    id: 'thumbnails-glo',
    label: 'Global thumbnails',
    localBasePath: 'assets/offline-packs/thumbnails-glo',
    fileCount,
    totalBytes: fileCount * 100,
    installed: true,
    checksum,
  };
}

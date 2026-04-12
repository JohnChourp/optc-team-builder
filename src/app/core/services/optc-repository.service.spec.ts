import { describe, expect, it, vi } from 'vitest';

import { type DatasetManifest } from '../models/optc.models';
import { OptcRepositoryService } from './optc-repository.service';

interface TestSqlRow {
  [key: string]: string | number | null;
}

describe('OptcRepositoryService', () => {
  it('keeps a locked favorite candidate even when it sits below the default recent limit', async () => {
    const recentFavoriteRows = Array.from({ length: 1200 }, (_, index) =>
      createCharacterRow({
        id: 5000 - index,
        type: 'DEX',
      }),
    );
    const lockedFavoriteRow = createCharacterRow({
      id: 2700,
      name: 'Kaido - The Strongest Creature Alive',
      type: 'DEX',
    });
    const service = createRepositoryService([...recentFavoriteRows, lockedFavoriteRow]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200, {
      allowedCharacterIds: [...recentFavoriteRows.map((row) => Number(row['id'])), 2700],
      lockedCharacterIds: [2700],
    });

    expect(result).toHaveLength(1201);
    expect(result.some((record) => record.id === 2700)).toBe(true);
  });

  it('filters favorites before applying the candidate limit', async () => {
    const nonFavoriteRows = Array.from({ length: 1200 }, (_, index) =>
      createCharacterRow({
        id: 5200 - index,
        type: index % 2 === 0 ? 'DEX' : 'PSY',
      }),
    );
    const favoriteRows = [
      createCharacterRow({ id: 3200, type: 'DEX' }),
      createCharacterRow({
        id: 2700,
        name: 'Kaido - The Strongest Creature Alive',
        type: 'DEX',
      }),
    ];
    const service = createRepositoryService([...nonFavoriteRows, ...favoriteRows]);

    const result = await service.getAutoBuilderCandidates(['DEX', 'STR', 'QCK', 'PSY'], 1200, {
      allowedCharacterIds: [3200, 2700],
      lockedCharacterIds: [2700],
    });

    expect(result.map((record) => record.id)).toEqual([3200, 2700]);
  });

  it('uses token-based type matching so dual-type rows can match a single selected type', async () => {
    const service = createRepositoryService([
      createCharacterRow({
        id: 4100,
        type: 'DEX,INT',
      }),
    ]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200);
    const selectAllMock = service['selectAll'] as ReturnType<typeof vi.fn>;

    expect(selectAllMock).toHaveBeenCalledWith(
      expect.stringContaining("(',' || c.type || ',') LIKE ?"),
      ['%,DEX,%'],
    );
    expect(result[0]?.type).toBe('DEX,INT');
  });

  it('filters excluded character ids out of the candidate pool before the final limit', async () => {
    const service = createRepositoryService([
      createCharacterRow({ id: 4102, type: 'DEX' }),
      createCharacterRow({ id: 4101, type: 'DEX' }),
    ]);

    const result = await service.getAutoBuilderCandidates(['DEX'], 1200, {
      excludedCharacterIds: [4102],
    });

    expect(result.map((record) => record.id)).toEqual([4101]);
  });

  it('uses the default catalog sort for detailed character search when no explicit sort mode is provided', async () => {
    const service = createRepositoryService([createCharacterRow({ id: 4102, type: 'DEX' })]);
    const selectAllMock = service['selectAll'] as ReturnType<typeof vi.fn>;

    await service.searchDetailedCharacters({
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      limit: 10,
      offset: 0,
    });

    expect(selectAllMock).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY c.stars DESC, c.id DESC'),
      expect.any(Array),
    );
  });

  it('uses newest-first sort for detailed character search when the picker requests it', async () => {
    const service = createRepositoryService([createCharacterRow({ id: 4102, type: 'DEX' })]);
    const selectAllMock = service['selectAll'] as ReturnType<typeof vi.fn>;

    await service.searchDetailedCharacters({
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'newest',
      limit: 10,
      offset: 0,
    });

    expect(selectAllMock).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY c.id DESC'),
      expect.any(Array),
    );
  });

  it('resolves ship thumbnail urls when the ship offline pack is installed', async () => {
    const service = createRepositoryService([], {
      manifest: createManifest({
        packs: [
          createPack({
            key: 'shipThumbnails',
            id: 'ship-thumbnails',
            installed: true,
          }),
        ],
      }),
      shipRows: [
        createShipRow({
          id: 9001,
          name: 'Going Merry',
          thumb: 'ship_0001_t2.png',
        }),
      ],
    });

    const result = await service.getShips();

    expect(result).toEqual([
      {
        id: 9001,
        name: 'Going Merry',
        thumb: 'ship_0001_t2.png',
        thumbUrl: 'assets/offline-packs/ship-thumbnails/ship_0001_t2.png',
        description: 'Boosts ATK by 1.5x.',
      },
    ]);
  });

  it('keeps ship thumbnail urls null when the ship offline pack is missing', async () => {
    const service = createRepositoryService([], {
      shipRows: [
        createShipRow({
          id: 9001,
          name: 'Going Merry',
          thumb: 'ship_0001_t2.png',
        }),
      ],
    });

    const result = await service.getShips();

    expect(result).toEqual([
      {
        id: 9001,
        name: 'Going Merry',
        thumb: 'ship_0001_t2.png',
        thumbUrl: null,
        description: 'Boosts ATK by 1.5x.',
      },
    ]);
  });
});

function createRepositoryService(
  rows: TestSqlRow[],
  options: {
    manifest?: DatasetManifest;
    shipRows?: TestSqlRow[];
  } = {},
): OptcRepositoryService {
  const service = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;

  Object.assign(service, {
    getDatasetManifest: vi.fn().mockResolvedValue(options.manifest ?? createManifest()),
    selectAll: vi
      .fn()
      .mockImplementation((query: string) =>
        Promise.resolve(query.includes('FROM ships') ? (options.shipRows ?? []) : rows),
      ),
  });

  return service;
}

function createManifest(overrides: Partial<DatasetManifest> = {}): DatasetManifest {
  return {
    generatedAt: '2026-03-25T00:00:00.000Z',
    sourceVersion: 'test',
    characterCount: 0,
    detailCount: 0,
    shipCount: 0,
    rumbleCount: 0,
    availableTypes: ['DEX', 'STR', 'QCK', 'PSY', 'INT'],
    availableClasses: ['Fighter', 'Slasher'],
    packs: [],
    ...overrides,
  };
}

function createPack(
  overrides: Partial<DatasetManifest['packs'][number]> = {},
): DatasetManifest['packs'][number] {
  return {
    key: overrides.key ?? 'shipThumbnails',
    id: overrides.id ?? 'ship-thumbnails',
    label: overrides.label ?? 'Ship thumbnails',
    localBasePath: overrides.localBasePath ?? 'assets/offline-packs/ship-thumbnails',
    fileCount: overrides.fileCount ?? 1,
    totalBytes: overrides.totalBytes ?? 1234,
    installed: overrides.installed ?? false,
  };
}

function createShipRow(
  overrides: Partial<{
    id: number;
    name: string;
    thumb: string | null;
    description: string;
  }> = {},
): TestSqlRow {
  return {
    id: overrides.id ?? 9001,
    name: overrides.name ?? 'Ship 9001',
    thumb: overrides.thumb ?? null,
    description: overrides.description ?? 'Boosts ATK by 1.5x.',
  };
}

function createCharacterRow(
  overrides: Partial<{
    id: number;
    name: string;
    type: string;
    primaryClass: string;
    secondaryClass: string | null;
    classes: string[];
  }> = {},
): TestSqlRow {
  const id = overrides.id ?? 5000;
  const primaryClass = overrides.primaryClass ?? 'Fighter';
  const secondaryClass = overrides.secondaryClass ?? null;

  return {
    id,
    name: overrides.name ?? `Unit ${id}`,
    type: overrides.type ?? 'DEX',
    primary_class: primaryClass,
    secondary_class: secondaryClass,
    classes_json: JSON.stringify(
      overrides.classes ?? [primaryClass, secondaryClass].filter(Boolean),
    ),
    stars: 6,
    cost: 55,
    combo: 4,
    max_level: 99,
    max_experience: 1_000_000,
    min_hp: 1000,
    min_atk: 400,
    min_rcv: 120,
    max_hp: 3900,
    max_atk: 1900,
    max_rcv: 340,
    growth: 3,
    region_json: JSON.stringify({
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: false,
    }),
    assets_json: JSON.stringify({
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
      fullTransparent: null,
    }),
    detail_json: JSON.stringify({
      characterId: id,
      captainAbility: null,
      specialName: null,
      specialText: null,
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
      superClass: null,
      rumbleData: null,
    }),
  };
}

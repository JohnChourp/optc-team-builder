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
});

function createRepositoryService(rows: TestSqlRow[]): OptcRepositoryService {
  const service = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;

  Object.assign(service, {
    getDatasetManifest: vi.fn().mockResolvedValue(createManifest()),
    selectAll: vi.fn().mockResolvedValue(rows),
  });

  return service;
}

function createManifest(): DatasetManifest {
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

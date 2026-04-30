import '@angular/compiler';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserDataTransferService } from './user-data-transfer.service';

describe('UserDataTransferService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the shared all-data payload from the current local signals', async () => {
    const dependencies = createDependencies();
    const service = new UserDataTransferService(
      dependencies.repository as never,
      dependencies.i18n as never,
      dependencies.userState as never,
      dependencies.characterOverrides as never,
      dependencies.optcbxImport as never,
    );

    const payload = await service.buildAllDataPayload('2026-04-20T18:00:00.000Z');

    expect(payload).toMatchObject({
      exportedAt: '2026-04-20T18:00:00.000Z',
      schemaVersion: 1,
      source: 'all-data',
      favoriteShips: {
        source: 'favorite-ships',
      },
      favorites: {
        characters: [
          { number: 1001, name: 'Luffy' },
          { number: 1002, name: 'Zoro' },
        ],
      },
      savedTeams: {
        source: 'saved-teams',
      },
    });
  });

  it('restores sync-scoped data by clearing local state before importing the backup', async () => {
    const dependencies = createDependencies();
    const service = new UserDataTransferService(
      dependencies.repository as never,
      dependencies.i18n as never,
      dependencies.userState as never,
      dependencies.characterOverrides as never,
      dependencies.optcbxImport as never,
    );

    dependencies.optcbxImport.buildMergeImportResult.mockResolvedValue({
      addedCount: 1,
      alreadyFavoritedCount: 0,
      matchedIds: [1003],
      unmatchedIds: [],
    });
    dependencies.optcbxImport.mergeFavoriteIds.mockReturnValue([1003]);

    await service.applyAllDataPayload(
      {
        exportedAt: '2026-04-20T18:00:00.000Z',
        favorites: {
          characters: [{ number: 1003, name: 'Nami' }],
        },
        favoriteShips: {
          exportedAt: '2026-04-20T18:00:00.000Z',
          schemaVersion: 1,
          ships: [{ id: 9003, name: 'Shark Superb' }],
          source: 'favorite-ships',
        },
        schemaVersion: 1,
        source: 'all-data',
      },
      'restore',
    );

    expect(dependencies.userState.clearAllFavoriteCharacterIds).toHaveBeenCalledOnce();
    expect(dependencies.userState.clearAllFavoriteShipIds).toHaveBeenCalledOnce();
    expect(dependencies.userState.setFavoriteCharacterIds).toHaveBeenCalledWith([1003]);
    expect(dependencies.userState.setFavoriteShipIds).toHaveBeenCalledWith([9003]);
  });

  it('derives a sync summary directly from an all-data payload', () => {
    const dependencies = createDependencies();
    const service = new UserDataTransferService(
      dependencies.repository as never,
      dependencies.i18n as never,
      dependencies.userState as never,
      dependencies.characterOverrides as never,
      dependencies.optcbxImport as never,
    );

    expect(
      service.getSyncScopeSummaryFromPayload({
        exportedAt: '2026-04-20T18:00:00.000Z',
        favorites: {
          characters: [
            { number: 1001, name: 'Luffy' },
            { number: 1002, name: 'Zoro' },
          ],
        },
        favoriteShips: {
          exportedAt: '2026-04-20T18:00:00.000Z',
          schemaVersion: 1,
          ships: [{ id: 9003, name: 'Shark Superb' }],
          source: 'favorite-ships',
        },
        characterBoxes: {
          exportedAt: '2026-04-20T18:00:00.000Z',
          schemaVersion: 1,
          source: 'character-boxes',
          boxes: [{ characterIds: [1001], createdAt: '2026-04-20T18:00:00.000Z', id: 'box-1', name: 'Favorites', updatedAt: '2026-04-20T18:00:00.000Z' }],
        },
        characterOverrides: {
          exportedAt: '2026-04-20T18:00:00.000Z',
          schemaVersion: 1,
          source: 'character-overrides',
          overrides: [],
        },
        savedEnemies: {
          enemies: [{ createdAt: '2026-04-20T18:00:00.000Z', enemyMechanics: [], id: 'enemy-1', imageDataUrl: null, name: 'Enemy One', notes: '', rawEnemyText: '', requireAllSelectedClassesPerCharacter: false, requireAllSelectedTypesInTeam: false, requiredAbilities: [], selectedClasses: ['Fighter'], selectedTypes: ['DEX'], updatedAt: '2026-04-20T18:00:00.000Z' }],
          exportedAt: '2026-04-20T18:00:00.000Z',
          schemaVersion: 1,
          source: 'saved-enemies',
        },
        savedTeams: {
          exportedAt: '2026-04-20T18:00:00.000Z',
          schemaVersion: 1,
          source: 'saved-teams',
          teams: [{ createdAt: '2026-04-20T18:00:00.000Z', id: 'team-1', name: 'Crew One', notes: '', shipId: null, slots: [1001, null, null, null, null, null], updatedAt: '2026-04-20T18:00:00.000Z' }],
        },
        schemaVersion: 1,
        source: 'all-data',
      }),
    ).toEqual({
      characterBoxesCount: 1,
      characterOverridesCount: 0,
      favoriteCharacterCount: 2,
      favoriteShipCount: 1,
      savedEnemiesCount: 1,
      savedRumbleTeamsCount: 0,
      savedTeamsCount: 1,
    });
  });
});

function createDependencies() {
  const favoriteCharacterIds = signal([1001, 1002]);
  const favoriteShipIds = signal([9001]);
  const characterBoxes = signal([
    {
      characterIds: [1001],
      createdAt: '2026-04-20T18:00:00.000Z',
      id: 'box-1',
      name: 'Favorites',
      updatedAt: '2026-04-20T18:00:00.000Z',
    },
  ]);
  const savedTeams = signal([
    {
      createdAt: '2026-04-20T18:00:00.000Z',
      id: 'team-1',
      name: 'Crew One',
      notes: '',
      shipId: null,
      slots: [1001, null, null, null, null, null],
      updatedAt: '2026-04-20T18:00:00.000Z',
    },
  ]);
  const savedEnemies = signal([
    {
      createdAt: '2026-04-20T18:00:00.000Z',
      enemyMechanics: [],
      id: 'enemy-1',
      imageDataUrl: null,
      name: 'Enemy One',
      notes: '',
      rawEnemyText: '',
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedTypesInTeam: false,
      requiredAbilities: [],
      selectedClasses: ['Fighter'],
      selectedTypes: ['DEX'],
      updatedAt: '2026-04-20T18:00:00.000Z',
    },
  ]);
  const savedRumbleTeams = signal([]);
  const overrides = signal([]);
  const repository = {
    getCharactersByIds: vi.fn().mockImplementation(async (ids: number[]) =>
      ids
        .filter((id) => id !== 999999)
        .map((id) => ({
          id,
          name: id === 1001 ? 'Luffy' : id === 1002 ? 'Zoro' : `Character ${id}`,
          number: id,
        })),
    ),
    getShips: vi.fn().mockResolvedValue([
      {
        description: 'Ship 1',
        id: 9001,
        name: 'Going Merry',
        thumb: null,
        thumbUrl: null,
      },
      {
        description: 'Ship 2',
        id: 9003,
        name: 'Shark Superb',
        thumb: null,
        thumbUrl: null,
      },
    ]),
  };
  const i18n = {
    translate: vi.fn((key: string) => {
      if (key === 'common.defaults.untitledBox') {
        return 'Untitled Box';
      }

      if (key === 'common.defaults.untitledCrew') {
        return 'Untitled Crew';
      }

      if (key === 'common.defaults.untitledEnemy') {
        return 'Untitled Enemy';
      }

      return key;
    }),
  };
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds,
    favoriteShipIds,
    characterBoxes,
    savedTeams,
    savedEnemies,
    savedRumbleTeams,
    setFavoriteCharacterIds: vi.fn().mockImplementation(async (nextIds: number[]) => {
      favoriteCharacterIds.set(nextIds);
    }),
    setFavoriteShipIds: vi.fn().mockImplementation(async (nextIds: number[]) => {
      favoriteShipIds.set(nextIds);
    }),
    clearAllFavoriteCharacterIds: vi.fn().mockImplementation(async () => {
      favoriteCharacterIds.set([]);
    }),
    clearAllFavoriteShipIds: vi.fn().mockImplementation(async () => {
      favoriteShipIds.set([]);
    }),
    clearAllCharacterBoxes: vi.fn().mockResolvedValue(undefined),
    clearAllSavedTeams: vi.fn().mockResolvedValue(undefined),
    clearAllSavedEnemies: vi.fn().mockResolvedValue(undefined),
    clearAllSavedRumbleTeams: vi.fn().mockResolvedValue(undefined),
    mergeImportedCharacterBoxes: vi.fn().mockResolvedValue({
      addedCount: 1,
      boxes: [],
      updatedCount: 0,
    }),
    mergeImportedEnemies: vi.fn().mockResolvedValue({
      addedCount: 1,
      enemies: [],
      updatedCount: 0,
    }),
    mergeImportedTeams: vi.fn().mockResolvedValue({
      addedCount: 1,
      teams: [],
      updatedCount: 0,
    }),
    mergeImportedRumbleTeams: vi.fn().mockResolvedValue({
      addedCount: 1,
      rumbleTeams: [],
      updatedCount: 0,
    }),
  };
  const characterOverrides = {
    ready: vi.fn().mockResolvedValue(undefined),
    overrides,
    clearAllOverrides: vi.fn().mockResolvedValue(undefined),
    mergeImportedOverrides: vi.fn().mockResolvedValue({
      addedCount: 0,
      overrides: [],
      updatedCount: 0,
    }),
  };
  const optcbxImport = {
    buildMergeImportResult: vi.fn().mockResolvedValue({
      addedCount: 1,
      alreadyFavoritedCount: 0,
      matchedIds: [1003],
      unmatchedIds: [],
    }),
    mergeFavoriteIds: vi.fn().mockReturnValue([1003, 1001, 1002]),
    parseExportPayload: vi.fn().mockReturnValue({
      duplicatesRemoved: 0,
      importedNumbers: [1003],
    }),
  };

  return {
    characterOverrides,
    i18n,
    optcbxImport,
    repository,
    userState,
  };
}

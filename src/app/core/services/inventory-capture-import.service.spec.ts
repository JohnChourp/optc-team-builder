import '@angular/compiler';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryCaptureImportService } from './inventory-capture-import.service';

const { recognize } = vi.hoisted(() => ({
  recognize: vi.fn(),
}));

vi.mock('tesseract.js', () => ({
  recognize,
}));

describe('InventoryCaptureImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a screenshot preview by matching OCR text against characters and ships', async () => {
    recognize.mockResolvedValue({
      data: {
        text: '1002\nGoing Merry\nGhost Boat',
      },
    });

    const { service } = createService();
    const preview = await service.buildPreviewFromScreenshotFile(
      new File(['image-data'], 'inventory.png', { type: 'image/png' }),
    );

    expect(preview.sourceKind).toBe('screenshot');
    expect(preview.payload.characterIds).toEqual([1002]);
    expect(preview.payload.shipIds).toEqual([9001]);
    expect(preview.payload.unmatchedEntries).toEqual(['Ghost Boat']);
    expect(preview.matchedCharacters.map((character) => character.id)).toEqual([1002]);
    expect(preview.matchedShips.map((ship) => ship.id)).toEqual([9001]);
  });

  it('builds an OPTCbx preview with unmatched ids kept for manual review', async () => {
    const { service } = createService({
      optcbxImport: {
        parseExport: vi.fn().mockReturnValue({
          importedNumbers: [1001, 9999],
          duplicatesRemoved: 1,
        }),
      },
    });
    const preview = await service.buildPreviewFromOptcbxFile(
      new File(['{}'], 'favorites.json', { type: 'application/json' }),
    );

    expect(preview.sourceKind).toBe('optcbx-json');
    expect(preview.payload.characterIds).toEqual([1001]);
    expect(preview.payload.unmatchedEntries).toEqual(['9999']);
    expect(preview.duplicateCharacterCount).toBe(1);
  });

  it('applies a preview by updating an existing box and merging favorite ships', async () => {
    const { service, userState } = createService({
      userState: {
        favoriteShipIds: signal([9001]),
        characterBoxes: signal([
          {
            id: 'box-1',
            name: 'Main Box',
            characterIds: [1001],
            createdAt: '2026-04-20T10:00:00.000Z',
            updatedAt: '2026-04-20T10:00:00.000Z',
          },
        ]),
        getCharacterBoxById: vi.fn().mockReturnValue({
          id: 'box-1',
          name: 'Main Box',
          characterIds: [1001],
          createdAt: '2026-04-20T10:00:00.000Z',
          updatedAt: '2026-04-20T10:00:00.000Z',
        }),
      },
    });

    const summary = await service.applyPreview(
      {
        capturedAt: '2026-04-21T10:00:00.000Z',
        duplicateCharacterCount: 0,
        duplicateShipCount: 0,
        extractedText: '1001\n1002\nThousand Sunny',
        fileName: 'inventory.png',
        invalidCharacterCount: 0,
        invalidShipCount: 0,
        matchedCharacters: [],
        matchedShips: [],
        payload: {
          schemaVersion: 1,
          source: 'inventory-capture',
          capturedAt: '2026-04-21T10:00:00.000Z',
          characterIds: [1001, 1002],
          shipIds: [9002],
          unmatchedEntries: ['Ghost Boat'],
        },
        sourceKind: 'screenshot',
        suggestedBoxName: 'Inventory',
      },
      {
        boxName: 'Inventory',
        boxSelection: 'box-1',
      },
    );

    expect(userState.saveCharacterBox).toHaveBeenCalledWith({
      id: 'box-1',
      name: 'Main Box',
      characterIds: [1001, 1002],
    });
    expect(userState.setFavoriteShipIds).toHaveBeenCalledWith([9002, 9001]);
    expect(summary).toMatchObject({
      boxAction: 'updated',
      alreadyInBoxCount: 1,
      addedShipCount: 1,
      alreadyFavoritedShipCount: 0,
      unmatchedCount: 1,
    });
  });
});

function createService(overrides: {
  optcbxImport?: Partial<{
    parseExport: ReturnType<typeof vi.fn>;
  }>;
  repository?: Partial<{
    getAllCharacters: ReturnType<typeof vi.fn>;
    getCharactersByIds: ReturnType<typeof vi.fn>;
    getShips: ReturnType<typeof vi.fn>;
  }>;
  userState?: Partial<{
    ready: ReturnType<typeof vi.fn>;
    favoriteShipIds: ReturnType<typeof signal<number[]>>;
    characterBoxes: ReturnType<typeof signal<any[]>>;
    getCharacterBoxById: ReturnType<typeof vi.fn>;
    saveCharacterBox: ReturnType<typeof vi.fn>;
    setFavoriteShipIds: ReturnType<typeof vi.fn>;
  }>;
} = {}) {
  const repository = {
    getAllCharacters: vi.fn().mockResolvedValue([
      {
        id: 1001,
        name: 'Monkey D. Luffy',
        imageUrl: 'luffy.png',
      },
      {
        id: 1002,
        name: 'Roronoa Zoro',
        imageUrl: 'zoro.png',
      },
    ]),
    getCharactersByIds: vi.fn().mockImplementation(async (ids: number[]) =>
      [
        {
          id: 1001,
          name: 'Monkey D. Luffy',
          imageUrl: 'luffy.png',
        },
        {
          id: 1002,
          name: 'Roronoa Zoro',
          imageUrl: 'zoro.png',
        },
      ].filter((character) => ids.includes(character.id)),
    ),
    getShips: vi.fn().mockResolvedValue([
      {
        id: 9001,
        name: 'Going Merry',
      },
      {
        id: 9002,
        name: 'Thousand Sunny',
      },
    ]),
    ...overrides.repository,
  };
  const optcbxImport = {
    parseExport: vi.fn().mockReturnValue({
      importedNumbers: [1001],
      duplicatesRemoved: 0,
    }),
    ...overrides.optcbxImport,
  };
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    favoriteShipIds: signal([9001]),
    characterBoxes: signal([]),
    getCharacterBoxById: vi.fn().mockReturnValue(null),
    saveCharacterBox: vi.fn().mockResolvedValue(undefined),
    setFavoriteShipIds: vi.fn().mockResolvedValue(undefined),
    ...overrides.userState,
  };
  const service = new InventoryCaptureImportService(
    repository as never,
    optcbxImport as never,
    userState as never,
  );

  return {
    service,
    repository,
    optcbxImport,
    userState,
  };
}

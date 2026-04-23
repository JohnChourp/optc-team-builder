import { describe, expect, it, vi } from 'vitest';

import { CrewForgeImageImportService } from './crew-forge-image-import.service';
import type {
  CharacterListItem,
  CrewForgeImageProfile,
} from '../models/optc.models';

describe('CrewForgeImageImportService', () => {
  it('resolves an exact profile by dimensions and preferred id', () => {
    const service = new CrewForgeImageImportService();
    const profileA = createProfile('profile-a', 1080, 1920);
    const profileB = createProfile('profile-b', 1080, 1920);

    expect(service.resolveExactProfile([profileA, profileB], 1080, 1920, 'profile-b')).toEqual(
      profileB,
    );
    expect(service.resolveExactProfile([profileA], 720, 1280)).toBeNull();
  });

  it('returns a no-profile result when no exact profile exists', async () => {
    const service = new CrewForgeImageImportService();

    await expect(
      service.recognizeImage('data:image/png;base64,ZmFrZQ==', 1080, 1920, null, []),
    ).resolves.toMatchObject({
      profileId: null,
      reason: 'no_profile',
    });
  });

  it('extracts the 12 configured slot crops during recognition', async () => {
    const service = new CrewForgeImageImportService();
    const serviceWithPrivateApi = service as unknown as {
      loadImageElement: ReturnType<typeof vi.fn>;
      extractSlotCropDataUrl: ReturnType<typeof vi.fn>;
      fingerprintImageDataUrl: ReturnType<typeof vi.fn>;
      getCatalogFingerprints: ReturnType<typeof vi.fn>;
    };

    serviceWithPrivateApi.loadImageElement = vi.fn().mockResolvedValue({});
    serviceWithPrivateApi.extractSlotCropDataUrl = vi
      .fn()
      .mockImplementation((_: unknown, slot: { key: string }) => `crop-${slot.key}`);
    serviceWithPrivateApi.fingerprintImageDataUrl = vi.fn().mockResolvedValue([0, 1]);
    serviceWithPrivateApi.getCatalogFingerprints = vi.fn().mockResolvedValue([
      { characterId: 101, fingerprint: [0, 1] },
    ]);

    await service.recognizeImage(
      'data:image/png;base64,ZmFrZQ==',
      1080,
      1920,
      createProfile('profile-a', 1080, 1920),
      [createCharacter(101)],
    );

    expect(serviceWithPrivateApi.extractSlotCropDataUrl).toHaveBeenCalledTimes(12);
    expect(
      serviceWithPrivateApi.extractSlotCropDataUrl.mock.calls.map(([, slot]) => slot.key),
    ).toEqual([
      'leader-1',
      'leader-2',
      'leader-3',
      'leader-4',
      'sub-1',
      'sub-2',
      'sub-3',
      'sub-4',
      'sub-5',
      'sub-6',
      'sub-7',
      'sub-8',
    ]);
  });

  it('prefers profile exemplars before the global catalog when scores tie or win', async () => {
    const service = new CrewForgeImageImportService();
    const serviceWithPrivateApi = service as unknown as {
      loadImageElement: ReturnType<typeof vi.fn>;
      extractSlotCropDataUrl: ReturnType<typeof vi.fn>;
      fingerprintImageDataUrl: ReturnType<typeof vi.fn>;
      getCatalogFingerprints: ReturnType<typeof vi.fn>;
    };
    const profile = createProfile('profile-a', 1080, 1920);

    profile.exemplars = [
      {
        id: 'ex-1',
        slotKey: 'leader-1',
        characterId: 999,
        fingerprint: [0, 1],
        cropDataUrl: 'data:image/png;base64,ZXg=',
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:00.000Z',
      },
    ];
    profile.preprocess.matchThreshold = 0.9;

    serviceWithPrivateApi.loadImageElement = vi.fn().mockResolvedValue({});
    serviceWithPrivateApi.extractSlotCropDataUrl = vi
      .fn()
      .mockImplementation((_: unknown, slot: { key: string }) => `crop-${slot.key}`);
    serviceWithPrivateApi.fingerprintImageDataUrl = vi
      .fn()
      .mockImplementation(async (imageSource: string) =>
        imageSource === 'crop-leader-1' ? [0, 1] : [0.4, 0.6],
      );
    serviceWithPrivateApi.getCatalogFingerprints = vi.fn().mockResolvedValue([
      { characterId: 101, fingerprint: [0.2, 0.8] },
      { characterId: 102, fingerprint: [1, 1] },
    ]);

    const result = await service.recognizeImage(
      'data:image/png;base64,ZmFrZQ==',
      1080,
      1920,
      profile,
      [createCharacter(101), createCharacter(102)],
    );
    const firstSlot = result.slots[0];

    expect(firstSlot).toMatchObject({
      slotKey: 'leader-1',
      characterId: 999,
      status: 'matched',
    });
    expect(firstSlot?.candidates[0]).toMatchObject({
      characterId: 999,
      source: 'exemplar',
    });
  });

  it('leaves low-confidence slots empty instead of forcing a guess', async () => {
    const service = new CrewForgeImageImportService();
    const serviceWithPrivateApi = service as unknown as {
      loadImageElement: ReturnType<typeof vi.fn>;
      extractSlotCropDataUrl: ReturnType<typeof vi.fn>;
      fingerprintImageDataUrl: ReturnType<typeof vi.fn>;
      getCatalogFingerprints: ReturnType<typeof vi.fn>;
    };
    const profile = createProfile('profile-a', 1080, 1920);

    profile.preprocess.matchThreshold = 0.99;
    profile.preprocess.emptyVarianceThreshold = 0.001;
    serviceWithPrivateApi.loadImageElement = vi.fn().mockResolvedValue({});
    serviceWithPrivateApi.extractSlotCropDataUrl = vi
      .fn()
      .mockImplementation((_: unknown, slot: { key: string }) => `crop-${slot.key}`);
    serviceWithPrivateApi.fingerprintImageDataUrl = vi.fn().mockResolvedValue([0.4, 0.6]);
    serviceWithPrivateApi.getCatalogFingerprints = vi.fn().mockResolvedValue([
      { characterId: 101, fingerprint: [0.1, 0.9] },
    ]);

    const result = await service.recognizeImage(
      'data:image/png;base64,ZmFrZQ==',
      1080,
      1920,
      profile,
      [createCharacter(101)],
    );
    const firstSlot = result.slots[0];

    expect(firstSlot).toMatchObject({
      slotKey: 'leader-1',
      characterId: null,
      status: 'ambiguous',
    });
    expect(firstSlot?.candidates[0]?.characterId).toBe(101);
  });
});

function createProfile(id: string, imageWidth: number, imageHeight: number): CrewForgeImageProfile {
  const service = new CrewForgeImageImportService();

  return {
    id,
    name: `Profile ${id}`,
    source: 'user',
    imageWidth,
    imageHeight,
    slotDefinitions: service.createEmptyProfileInput(imageWidth, imageHeight).slotDefinitions,
    preprocess: service.createDefaultPreprocessConfig(),
    examples: [],
    exemplars: [],
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-20T10:00:00.000Z',
  };
}

function createCharacter(id: number): CharacterListItem {
  return {
    id,
    name: `Character ${id}`,
    imageUrl: `assets/characters/${id}.png`,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    isIncomplete: false,
    stars: 6,
    cost: 55,
    combo: 5,
    stats: {
      min: { hp: 1, atk: 1, rcv: 1 },
      max: { hp: 1, atk: 1, rcv: 1 },
      growth: null,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
      fullTransparent: null,
    },
  };
}

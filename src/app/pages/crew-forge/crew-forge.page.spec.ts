import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { CrewForgePage } from './crew-forge.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonModal: class {},
  IonMenuButton: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToggle: class {},
  IonToolbar: class {},
}));

describe('CrewForgePage', () => {
  it('starts with an empty-state view before any roster picks exist', async () => {
    const { page } = createPage();

    await page.ngOnInit();

    expect(page.buildReady()).toBe(false);
    expect(page.emptyStateVisible()).toBe(true);
    expect(page.noResultStateVisible()).toBe(false);
  });

  it('calls the ranked-roster builder with locked leaders and the selected pool', async () => {
    const { page, autoTeamBuilder } = createPage();

    await page.ngOnInit();
    page.setCaptain(101);
    page.setFriendCaptain(102);
    page.togglePoolCharacter(103);
    page.togglePoolCharacter(104);
    page.togglePoolCharacter(105);
    page.togglePoolCharacter(106);

    await page.buildTeams();

    expect(autoTeamBuilder.buildRankedTeamsFromRoster).toHaveBeenCalledWith(
      expect.objectContaining({
        rosterCharacterIds: [101, 102, 103, 104, 105, 106],
        captainCharacterId: 101,
        friendCaptainCharacterId: 102,
        resultLimit: 50,
        requireUniqueBaseCharacterNames: true,
      }),
      expect.objectContaining({
        workerCount: 3,
      }),
    );
  });

  it('shows a no-result state when the ranked builder returns no teams', async () => {
    const { page, autoTeamBuilder } = createPage();

    autoTeamBuilder.buildRankedTeamsFromRoster.mockResolvedValue({
      results: [],
      totalResults: 0,
      limit: 50,
    });

    await page.ngOnInit();
    page.setCaptain(101);
    page.togglePoolCharacter(102);
    page.togglePoolCharacter(103);
    page.togglePoolCharacter(104);
    page.togglePoolCharacter(105);
    page.togglePoolCharacter(106);

    await page.buildTeams();

    expect(page.results()).toEqual([]);
    expect(page.errorMessage()).toBe("results.empty");
    expect(page.noResultStateVisible()).toBe(true);
  });

  it('keeps earlier results stable when loading more cards', async () => {
    const { page, autoTeamBuilder } = createPage();

    autoTeamBuilder.buildRankedTeamsFromRoster.mockResolvedValue({
      results: Array.from({ length: 12 }, (_, index) => createRankedResult(index + 1)),
      totalResults: 12,
      limit: 50,
    });

    await page.ngOnInit();
    page.setCaptain(101);
    page.setFriendCaptain(102);
    page.togglePoolCharacter(103);
    page.togglePoolCharacter(104);
    page.togglePoolCharacter(105);
    page.togglePoolCharacter(106);

    await page.buildTeams();

    expect(page.visibleResults()).toHaveLength(10);
    expect(page.visibleResults()[0]?.teamKey).toBe('team-1');

    page.loadMoreResults();

    expect(page.visibleResults()).toHaveLength(12);
    expect(page.visibleResults()[0]?.teamKey).toBe('team-1');
    expect(page.visibleResults()[10]?.teamKey).toBe('team-11');
  });

  it('replaces the pool with unique recognized characters while preserving locked captains', async () => {
    const { page, crewForgeImageImport } = createPage();

    await page.ngOnInit();
    page.setCaptain(101);
    page.setFriendCaptain(102);
    crewForgeImageImport.recognizeImage.mockResolvedValue({
      profileId: 'profile-1',
      imageWidth: 1080,
      imageHeight: 1920,
      reason: 'matched',
      slots: [
        createRecognitionSlot('leader-1', 101),
        createRecognitionSlot('leader-2', 103),
        createRecognitionSlot('leader-3', 103),
        createRecognitionSlot('leader-4', null, 'ambiguous'),
        createRecognitionSlot('sub-1', 104),
        createRecognitionSlot('sub-2', 105),
        createRecognitionSlot('sub-3', 102),
        createRecognitionSlot('sub-4', 106),
        createRecognitionSlot('sub-5', null, 'empty'),
        createRecognitionSlot('sub-6', null, 'empty'),
        createRecognitionSlot('sub-7', null, 'empty'),
        createRecognitionSlot('sub-8', null, 'empty'),
      ],
    });

    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);
    page.selectedImageProfileId.set('profile-1');

    await page.runImageRecognition();
    await page.applyRecognizedPool();

    expect(page.poolCharacterIds()).toEqual([103, 104, 105, 106]);
    expect(page.captainCharacterId()).toBe(101);
    expect(page.friendCaptainCharacterId()).toBe(102);
  });

  it('restores the last selected image profile on init', async () => {
    const { page } = createPage();

    await page.ngOnInit();

    expect(page.selectedImageProfileId()).toBe('profile-1');
  });

  it('duplicates built-in profiles into editable drafts instead of mutating them in place', async () => {
    const { page, userState } = createPage({
      selectedProfile: createProfileStub('built-in-profile', 'Built-in Profile', 'built-in', 1080, 2400),
      lastProfileId: 'built-in-profile',
    });

    await page.ngOnInit();
    page.openProfileEditorForSelected();

    expect(page.profileDraft()).toMatchObject({
      id: null,
      name: 'Built-in Profile Copy',
      imageWidth: 1080,
      imageHeight: 2400,
    });
    expect(userState.deleteCrewForgeImageProfile).not.toHaveBeenCalled();
  });

  it('switches selection to the forked user profile when saving an example from a built-in profile', async () => {
    const { page, userState } = createPage({
      selectedProfile: createProfileStub('built-in-profile', 'Built-in Profile', 'built-in', 1080, 2400),
      lastProfileId: 'built-in-profile',
    });
    userState.saveCrewForgeImageExample.mockResolvedValue(
      createProfileStub('user-copy', 'Built-in Profile Copy', 'user', 1080, 2400),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(2400);

    await page.saveCurrentImageAsExample();

    expect(userState.saveCrewForgeImageExample).toHaveBeenCalledWith(
      'built-in-profile',
      expect.objectContaining({
        imageWidth: 1080,
        imageHeight: 2400,
      }),
    );
    expect(page.selectedImageProfileId()).toBe('user-copy');
  });

  it('renders menu access, roster controls, and ranked result copy in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/crew-forge/crew-forge.page.html'),
      'utf8',
    );

    expect(template).toContain('<ion-buttons slot="start">');
    expect(template).toContain('<ion-menu-button autoHide="false"></ion-menu-button>');
    expect(template).toContain("t('actions.build')");
    expect(template).toContain("t('imageImport.title')");
    expect(template).toContain("runImageRecognition()");
    expect(template).toContain("applyRecognizedPool()");
    expect(template).toContain("t('imageImport.builtInLabel')");
    expect(template).toContain("t('results.distinctAbilities')");
    expect(template).toContain("t('results.loadMore')");
  });
});

function createPage(options: {
  selectedProfile?: ReturnType<typeof createProfileStub>;
  lastProfileId?: string | null;
} = {}) {
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      availableTypes: ['DEX', 'STR'],
      availableClasses: ['Fighter', 'Slasher'],
    }),
  };
  const characterCatalogCache = {
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    catalog: signal(createCatalogCharacters()),
    queryCharacters: vi.fn().mockImplementation(({ offset, limit }) =>
      createCatalogCharacters().slice(offset, offset + limit),
    ),
    getCharactersByIds: vi.fn().mockImplementation((ids: number[]) =>
      createCatalogCharacters().filter((character) => ids.includes(character.id)),
    ),
  };
  const autoTeamBuilder = {
    buildRankedTeamsFromRoster: vi.fn().mockResolvedValue({
      results: [createRankedResult(1)],
      totalResults: 1,
      limit: 50,
    }),
  };
  const crewForgeImageImport = {
    createEmptyProfileInput: vi.fn().mockReturnValue({
      name: '',
      imageWidth: 0,
      imageHeight: 0,
      slotDefinitions: [
        createSlotDefinition('leader-1', 'Leader 1', 'leader'),
        createSlotDefinition('leader-2', 'Leader 2', 'leader'),
        createSlotDefinition('leader-3', 'Leader 3', 'leader'),
        createSlotDefinition('leader-4', 'Leader 4', 'leader'),
        createSlotDefinition('sub-1', 'Sub 1', 'sub'),
        createSlotDefinition('sub-2', 'Sub 2', 'sub'),
        createSlotDefinition('sub-3', 'Sub 3', 'sub'),
        createSlotDefinition('sub-4', 'Sub 4', 'sub'),
        createSlotDefinition('sub-5', 'Sub 5', 'sub'),
        createSlotDefinition('sub-6', 'Sub 6', 'sub'),
        createSlotDefinition('sub-7', 'Sub 7', 'sub'),
        createSlotDefinition('sub-8', 'Sub 8', 'sub'),
      ],
      preprocess: {
        fingerprintSize: 16,
        contrast: 1,
        brightness: 0,
        grayscale: true,
        invert: false,
        blurRadius: 0,
        matchThreshold: 0.92,
        emptyVarianceThreshold: 0.005,
      },
      examples: [],
      exemplars: [],
    }),
    resolveExactProfile: vi.fn(),
    loadImageFile: vi.fn(),
    recognizeImage: vi.fn(),
    applyManualSelection: vi.fn((result, slotKey, characterId, confidence) => ({
      ...result,
      slots: result.slots.map((slot: { slotKey: string }) =>
        slot.slotKey === slotKey
          ? {
              ...slot,
              characterId,
              confidence,
              status: characterId ? 'manual' : 'empty',
              manuallyEdited: true,
            }
          : slot,
      ),
    })),
    buildExemplarFromSlot: vi.fn().mockResolvedValue({
      slotKey: 'leader-1',
      characterId: 101,
      fingerprint: [0.1, 0.9],
      cropDataUrl: 'data:image/png;base64,ZXg=',
    }),
  };
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: signal<number[]>([101, 103]),
    characterBoxes: signal([
      {
        id: 'box-1',
        name: 'Main Box',
        characterIds: [101, 102, 103, 104],
      },
    ]),
    crewForgeImageProfiles: signal([
      options.selectedProfile ?? createProfileStub('profile-1', 'Main Profile', 'user', 1080, 1920),
    ]),
    crewForgeLastImageProfileId: signal<string | null>(options.lastProfileId ?? 'profile-1'),
    resolveAutoTeamBuilderWorkerCount: vi.fn().mockReturnValue(3),
    setCrewForgeLastImageProfileId: vi.fn().mockResolvedValue(undefined),
    saveCrewForgeImageProfile: vi.fn().mockResolvedValue(null),
    deleteCrewForgeImageProfile: vi.fn().mockResolvedValue(undefined),
    saveCrewForgeImageExample: vi.fn().mockResolvedValue(undefined),
    saveCrewForgeImageExemplar: vi.fn().mockResolvedValue(undefined),
  };
  const i18n = {
    translate: vi.fn().mockImplementation((key: string) => key),
  };

  return {
    page: new CrewForgePage(
      repository as never,
      characterCatalogCache as never,
      autoTeamBuilder as never,
      userState as never,
      i18n as never,
      crewForgeImageImport as never,
    ),
    autoTeamBuilder,
    crewForgeImageImport,
    userState,
  };
}

function createCatalogCharacters() {
  return Array.from({ length: 12 }, (_, index) => ({
    id: 101 + index,
    name: `Character ${101 + index}`,
    imageUrl: `character-${101 + index}.png`,
    type: index % 2 === 0 ? 'DEX' : 'STR',
    primaryClass: 'Fighter',
    secondaryClass: index % 3 === 0 ? 'Slasher' : null,
  }));
}

function createRankedResult(index: number) {
  const ids = [index * 10 + 1, index * 10 + 2, index * 10 + 3, index * 10 + 4, index * 10 + 5, index * 10 + 6];

  return {
    teamKey: `team-${index}`,
    candidateCount: 6,
    input: {} as never,
    coverage: {
      utility: ['bind', 'paralysis'],
      burst: ['atkBoost'],
      consistency: ['matchingOrbs'],
    },
    slots: [
      createSlot('captain', ids[0]),
      createSlot('friendCaptain', ids[1]),
      createSlot('sub', ids[2]),
      createSlot('sub', ids[3]),
      createSlot('sub', ids[4]),
      createSlot('sub', ids[5]),
    ],
    abilityBreakdown: {
      distinctAbilityCount: 8,
      allAbilities: [],
      uniqueAbilities: [{ key: 'remove_bind', label: 'Remove Bind', count: 1, characterIds: [ids[2]] }],
      duplicateAbilities: [{ key: 'remove_paralysis', label: 'Remove Paralysis', count: 2, characterIds: [ids[3], ids[4]] }],
    },
    ranking: {
      distinctAbilityCount: 8,
      utilityCoverageCount: 2,
      burstCoverageCount: 1,
      consistencyCoverageCount: 1,
      powerScore: 10,
      recencyScore: 4,
    },
  };
}

function createSlot(role: string, id: number) {
  return {
    role,
    reasonChips: [],
    character: {
      id,
      name: `Character ${id}`,
      imageUrl: `character-${id}.png`,
      detail: {
        builderAbilities: [],
      },
    },
  };
}

function createSlotDefinition(key: string, label: string, role: 'leader' | 'sub') {
  return {
    key,
    label,
    role,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
}

function createProfileStub(
  id: string,
  name: string,
  source: 'built-in' | 'user',
  imageWidth: number,
  imageHeight: number,
) {
  return {
    id,
    name,
    source,
    imageWidth,
    imageHeight,
    slotDefinitions: [
      createSlotDefinition('leader-1', 'Leader 1', 'leader'),
      createSlotDefinition('leader-2', 'Leader 2', 'leader'),
      createSlotDefinition('leader-3', 'Leader 3', 'leader'),
      createSlotDefinition('leader-4', 'Leader 4', 'leader'),
      createSlotDefinition('sub-1', 'Sub 1', 'sub'),
      createSlotDefinition('sub-2', 'Sub 2', 'sub'),
      createSlotDefinition('sub-3', 'Sub 3', 'sub'),
      createSlotDefinition('sub-4', 'Sub 4', 'sub'),
      createSlotDefinition('sub-5', 'Sub 5', 'sub'),
      createSlotDefinition('sub-6', 'Sub 6', 'sub'),
      createSlotDefinition('sub-7', 'Sub 7', 'sub'),
      createSlotDefinition('sub-8', 'Sub 8', 'sub'),
    ],
    preprocess: {
      fingerprintSize: 16,
      contrast: 1,
      brightness: 0,
      grayscale: true,
      invert: false,
      blurRadius: 0,
      matchThreshold: 0.92,
      emptyVarianceThreshold: 0.005,
    },
    examples: [],
    exemplars: [],
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-20T10:00:00.000Z',
  };
}

function createRecognitionSlot(
  slotKey: string,
  characterId: number | null,
  status: 'matched' | 'ambiguous' | 'empty' | 'manual' = 'matched',
) {
  return {
    slotKey,
    label: slotKey,
    role: slotKey.startsWith('leader') ? 'leader' : 'sub',
    characterId,
    confidence: characterId ? 0.96 : 0,
    status,
    cropDataUrl: 'data:image/png;base64,Y3JvcA==',
    candidates: characterId
      ? [{ characterId, confidence: 0.96, source: 'catalog' as const }]
      : [],
    manuallyEdited: false,
  };
}

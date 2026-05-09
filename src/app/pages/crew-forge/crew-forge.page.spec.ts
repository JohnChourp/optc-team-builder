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
  IonMenuButton: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe('CrewForgePage', () => {
  it('starts with an empty-state view before any screenshot is recognized', async () => {
    const { page } = createPage();

    await page.ngOnInit();

    expect(page.buildReady()).toBe(false);
    expect(page.emptyStateVisible()).toBe(true);
    expect(page.noResultStateVisible()).toBe(false);
    expect(page.recognizedRosterCharacterIds()).toEqual([]);
  });

  it('unlocks build as soon as recognition finds at least five unique characters', async () => {
    const { page, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();

    expect(page.buildReady()).toBe(true);
    expect(page.recognizedRosterCharacterIds()).toEqual([101, 102, 103, 104, 105]);
    expect(page.recognizedRosterCount()).toBe(5);
  });

  it('builds teams from corrected recognition slots and leaves captain selection unlocked', async () => {
    const { page, autoTeamBuilder, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();
    page.applyRecognitionCandidate('sub-1', 110);

    await page.buildTeams();

    expect(autoTeamBuilder.buildRankedTeamsFromRoster).toHaveBeenCalledWith(
      expect.objectContaining({
        rosterCharacterIds: [101, 102, 110, 104, 105],
        captainCharacterId: null,
        friendCaptainCharacterId: null,
        resultLimit: 50,
        requireUniqueBaseCharacterNames: true,
      }),
      expect.objectContaining({
        workerCount: 3,
      }),
    );
  });

  it('treats a recognized default candidate as the active slot selection', async () => {
    const { page, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();

    const slot = page.recognitionPreviewSlots().find((item) => item.slot.slotKey === 'sub-1');

    expect(slot).toBeTruthy();
    expect(page.isRecognitionCandidateSelected(slot!.slot, 103)).toBe(true);
    expect(page.isRecognitionPickerSelected(slot!)).toBe(false);
  });

  it('auto-selects the first suggested candidate for ambiguous slots after recognition', async () => {
    const { page, crewForgeImageImport } = createPage();
    const recognitionResult = createRecognitionResult([101, 102, null, 104, 105]);

    recognitionResult.slots[2] = {
      ...recognitionResult.slots[2],
      confidence: 0.82,
      status: 'ambiguous',
      candidates: [
        { characterId: 103, confidence: 0.82, source: 'catalog' as const },
        { characterId: 110, confidence: 0.78, source: 'catalog' as const },
        { characterId: 111, confidence: 0.74, source: 'catalog' as const },
      ],
    };
    crewForgeImageImport.recognizeImage.mockResolvedValue(recognitionResult);

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();

    const slot = page.recognitionPreviewSlots().find((item) => item.slot.slotKey === 'sub-1');

    expect(slot).toBeTruthy();
    expect(slot!.slot.status).toBe('ambiguous');
    expect(slot!.slot.characterId).toBe(103);
    expect(slot!.slot.manuallyEdited).toBe(false);
    expect(slot!.character?.id).toBe(103);
    expect(page.isRecognitionCandidateSelected(slot!.slot, 103)).toBe(true);
  });

  it('marks the matching suggested candidate as selected after a candidate override', async () => {
    const { page, crewForgeImageImport } = createPage();
    const recognitionResult = createRecognitionResult([101, 102, 103, 104, 105]);

    recognitionResult.slots[2] = {
      ...recognitionResult.slots[2],
      candidates: [
        { characterId: 103, confidence: 0.96, source: 'catalog' as const },
        { characterId: 110, confidence: 0.78, source: 'catalog' as const },
      ],
    };
    crewForgeImageImport.recognizeImage.mockResolvedValue(recognitionResult);

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();
    page.applyRecognitionCandidate('sub-1', 110, 0.78);

    const slot = page.recognitionPreviewSlots().find((item) => item.slot.slotKey === 'sub-1');

    expect(slot).toBeTruthy();
    expect(page.isRecognitionCandidateSelected(slot!.slot, 110)).toBe(true);
    expect(page.isRecognitionCandidateSelected(slot!.slot, 103)).toBe(false);
    expect(page.isRecognitionPickerSelected(slot!)).toBe(false);
  });

  it('marks the picker action as selected when a manual choice is outside the suggested candidates', async () => {
    const { page, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();
    page.applyRecognitionCandidate('sub-1', 110, 1);

    const slot = page.recognitionPreviewSlots().find((item) => item.slot.slotKey === 'sub-1');

    expect(slot).toBeTruthy();
    expect(page.isRecognitionCandidateSelected(slot!.slot, 103)).toBe(false);
    expect(page.isRecognitionPickerSelected(slot!)).toBe(true);
  });

  it('keeps the selected portrait available for a default recognized slot', async () => {
    const { page, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();

    const slot = page.recognitionPreviewSlots().find((item) => item.slot.slotKey === 'sub-1');

    expect(slot).toBeTruthy();
    expect(slot!.character?.id).toBe(103);
  });

  it('keeps the same selected portrait available after a manual choice', async () => {
    const { page, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();
    page.applyRecognitionCandidate('sub-1', 103, 0.96);

    const slot = page.recognitionPreviewSlots().find((item) => item.slot.slotKey === 'sub-1');

    expect(slot).toBeTruthy();
    expect(slot!.character?.id).toBe(103);
  });

  it('clearing a slot removes both candidate-selected and picker-selected states', async () => {
    const { page, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();
    page.applyRecognitionCandidate('sub-1', 110, 1);
    page.applyRecognitionCandidate('sub-1', null);

    const slot = page.recognitionPreviewSlots().find((item) => item.slot.slotKey === 'sub-1');

    expect(slot).toBeTruthy();
    expect(slot!.slot.characterId).toBeNull();
    expect(page.isRecognitionCandidateSelected(slot!.slot, 103)).toBe(false);
    expect(page.isRecognitionPickerSelected(slot!)).toBe(false);
  });

  it('deduplicates repeated recognized ids before building teams', async () => {
    const { page, autoTeamBuilder, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();
    await page.buildTeams();

    expect(page.buildReady()).toBe(true);
    expect(autoTeamBuilder.buildRankedTeamsFromRoster).toHaveBeenCalledWith(
      expect.objectContaining({
        rosterCharacterIds: [101, 102, 103, 104, 105],
      }),
      expect.anything(),
    );
  });

  it('shows a simple unsupported-dimensions error when no exact profile matches the screenshot', async () => {
    const { page, crewForgeImageImport } = createPage();

    crewForgeImageImport.loadImageFile.mockResolvedValue({
      dataUrl: 'data:image/png;base64,ZmFrZQ==',
      width: 1000,
      height: 2000,
      name: 'unsupported.png',
    });
    crewForgeImageImport.resolveExactProfile.mockReturnValue(null);

    await page.ngOnInit();
    await page.onImageImportSelected(
      {
        target: {
          files: [{ type: 'image/png' }],
        },
      } as unknown as Event,
      { value: 'filled' } as HTMLInputElement,
    );

    expect(page.imageImportErrorMessage()).toBe('imageImport.errors.noProfileForDimensions');
    expect(page.buildReady()).toBe(false);
    expect(page.imageImportRecognition()).toBeNull();
    expect(crewForgeImageImport.recognizeImage).not.toHaveBeenCalled();
  });

  it('shows a recognition error and keeps build disabled when screenshot analysis fails', async () => {
    const { page, crewForgeImageImport } = createPage();

    crewForgeImageImport.recognizeImage.mockRejectedValue(new Error('boom'));

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();

    expect(page.imageImportErrorMessage()).toBe('imageImport.errors.recognitionFailed');
    expect(page.imageImportRecognition()).toBeNull();
    expect(page.buildReady()).toBe(false);
  });

  it('shows the no-result state when the builder cannot assemble any team', async () => {
    const { page, autoTeamBuilder, crewForgeImageImport } = createPage();

    autoTeamBuilder.buildRankedTeamsFromRoster.mockResolvedValue({
      results: [],
      totalResults: 0,
      limit: 50,
    });
    crewForgeImageImport.recognizeImage.mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    );

    await page.ngOnInit();
    page.imageImportDataUrl.set('data:image/png;base64,ZmFrZQ==');
    page.imageImportWidth.set(1080);
    page.imageImportHeight.set(1920);

    await page.runImageRecognition();
    await page.buildTeams();

    expect(page.results()).toEqual([]);
    expect(page.errorMessage()).toBe('results.empty');
    expect(page.noResultStateVisible()).toBe(true);
  });

  it('renders the screenshot-first flow and drops the old profile-management and catalog actions', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/crew-forge/crew-forge.page.html'),
      'utf8',
    );

    expect(template).toContain("t('imageImport.title')");
    expect(template).toContain('openImageImportPicker(imageImportInput)');
    expect(template).toContain("t('actions.build')");
    expect(template).toContain('openRecognitionPicker(item.slot.slotKey)');
    expect(template).toContain('@if (item.character) {');
    expect(template).toContain('image-import-slot-card__match--selected');
    expect(template).toContain('isRecognitionCandidateSelected(item.slot, candidate.character.id)');
    expect(template).toContain("[color]=\"isRecognitionPickerSelected(item) ? 'success' : 'warning'\"");
    expect(template).not.toContain("t('imageImport.slotEmpty')");
    expect(template).not.toContain("'common.actions.clear' | transloco");
    expect(template).not.toContain('saveProfileDraft()');
    expect(template).not.toContain('saveCurrentImageAsExample()');
    expect(template).not.toContain('applyRecognizedPool()');
    expect(template).not.toContain('setCaptain(');
    expect(template).not.toContain("t('catalog.title')");
    expect(template).not.toContain("t('leaders.captain')");
    expect(template).not.toContain('{{ item.character.name }}');
    expect(template).not.toContain('{{ item.character.type }} • {{ item.character.primaryClass }}');
  });
});

function createPage(options: {
  selectedProfile?: ReturnType<typeof createProfileStub>;
  lastProfileId?: string | null;
} = {}) {
  const characterCatalogCache = {
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    catalog: signal(createCatalogCharacters()),
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
    loadImageFile: vi.fn().mockResolvedValue({
      dataUrl: 'data:image/png;base64,ZmFrZQ==',
      width: 1080,
      height: 1920,
      name: 'crew.png',
    }),
    resolveExactProfile: vi.fn().mockImplementation((profiles: Array<{ id: string }>) => profiles[0] ?? null),
    recognizeImage: vi.fn().mockResolvedValue(
      createRecognitionResult([101, 102, 103, 104, 105]),
    ),
    applyManualSelection: vi.fn((result, slotKey, characterId, confidence) => ({
      ...result,
      slots: result.slots.map((slot: { slotKey: string }) =>
        slot.slotKey === slotKey
          ? {
              ...slot,
              characterId,
              confidence: characterId ? confidence : 0,
              status: characterId ? 'manual' : 'empty',
              manuallyEdited: true,
            }
          : slot,
      ),
    })),
  };
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    readyCrewForgeImageProfiles: vi.fn().mockResolvedValue(undefined),
    readyAutoTeamBuilderWorkerPreference: vi.fn().mockResolvedValue(undefined),
    crewForgeImageProfiles: signal([
      options.selectedProfile ?? createProfileStub('profile-1', 'Main Profile', 'user', 1080, 1920),
    ]),
    crewForgeLastImageProfileId: signal<string | null>(options.lastProfileId ?? 'profile-1'),
    resolveAutoTeamBuilderWorkerCount: vi.fn().mockReturnValue(3),
    setCrewForgeLastImageProfileId: vi.fn().mockResolvedValue(undefined),
  };
  const i18n = {
    translate: vi.fn().mockImplementation((key: string) => key),
  };

  return {
    page: new CrewForgePage(
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
  return Array.from({ length: 20 }, (_, index) => ({
    id: 101 + index,
    name: `Character ${101 + index}`,
    imageUrl: `character-${101 + index}.png`,
    type: index % 2 === 0 ? 'DEX' : 'STR',
    primaryClass: 'Fighter',
    secondaryClass: index % 3 === 0 ? 'Slasher' : null,
  }));
}

function createRecognitionResult(characterIds: Array<number | null>) {
  return {
    profileId: 'profile-1',
    imageWidth: 1080,
    imageHeight: 1920,
    reason: 'matched' as const,
    slots: characterIds.map((characterId, index) =>
      createRecognitionSlot(
        index < 2 ? `leader-${index + 1}` : `sub-${index - 1}`,
        characterId,
      ),
    ),
  };
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
      createSlotDefinition('sub-1', 'Sub 1', 'sub'),
      createSlotDefinition('sub-2', 'Sub 2', 'sub'),
      createSlotDefinition('sub-3', 'Sub 3', 'sub'),
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

function createRecognitionSlot(slotKey: string, characterId: number | null) {
  return {
    slotKey,
    label: slotKey,
    role: slotKey.startsWith('leader') ? 'leader' : 'sub',
    characterId,
    confidence: characterId ? 0.96 : 0,
    status: characterId ? 'matched' : 'empty',
    cropDataUrl: 'data:image/png;base64,Y3JvcA==',
    candidates: characterId
      ? [{ characterId, confidence: 0.96, source: 'catalog' as const }]
      : [],
    manuallyEdited: false,
  };
}

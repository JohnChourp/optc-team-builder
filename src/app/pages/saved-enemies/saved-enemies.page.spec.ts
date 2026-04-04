import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./saved-enemies-transfer.utils', async () => {
  const actual = await vi.importActual<typeof import('./saved-enemies-transfer.utils')>(
    './saved-enemies-transfer.utils',
  );

  return {
    ...actual,
    downloadSavedEnemiesExport: vi.fn(),
  };
});

import { downloadSavedEnemiesExport } from './saved-enemies-transfer.utils';
import { SavedEnemiesPage } from './saved-enemies.page';

type SavedEnemiesPagePrivateApi = SavedEnemiesPage & {
  readImageUrlAsDataUrl: (imageUrl: string) => Promise<string>;
  resizeImageDataUrl: (imageDataUrl: string, maxDimension: number) => Promise<string>;
};

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTextarea: class {},
  IonTitle: class {},
  IonToggle: class {},
  IonToolbar: class {},
}));

describe('SavedEnemiesPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('hydrates saved enemies and supporting builder metadata', async () => {
    const { page, repository } = createPage();

    await page.ngOnInit();

    expect(page.loading()).toBe(false);
    expect(page.savedEnemies()).toHaveLength(2);
    expect(repository.getDatasetManifest).toHaveBeenCalledOnce();
    expect(repository.getAutoBuilderAbilityCatalog).toHaveBeenCalledOnce();
    expect(page.availableClasses()).toEqual(['Fighter', 'Slasher']);
  });

  it('opens the create modal with fresh defaults', () => {
    const { page } = createPage({ savedEnemies: [] });

    page.openCreateModal();

    expect(page.editorOpen()).toBe(true);
    expect(page.enemyMechanicPickerOpen()).toBe(false);
    expect(page.abilityPickerOpen()).toBe(false);
    expect(page.editingEnemy()).toBeNull();
    expect(page.selectedTypes()).toEqual(['DEX']);
    expect(page.enemyMechanicDrafts()).toEqual([]);
    expect(page.requiredAbilityDrafts()).toEqual([]);
  });

  it('opens the edit modal with the selected enemy preset', () => {
    const { page } = createPage();

    page.openEditModal(page.savedEnemies()[0]!);

    expect(page.editorOpen()).toBe(true);
    expect(page.editingEnemy()?.id).toBe('enemy-1');
    expect(page.enemyName()).toBe('Forest Boss');
    expect(page.enemyImageDataUrl()).toBe('data:image/jpeg;base64,Zm9yZXN0LWJvc3M=');
    expect(page.selectedTypes()).toEqual(['DEX', 'PSY']);
    expect(page.selectedClasses()).toEqual(['Fighter']);
    expect(page.enemyMechanicDrafts()).toHaveLength(1);
    expect(page.requiredAbilityDrafts()).toHaveLength(1);
  });

  it('toggles select all and clear for types from the create modal', () => {
    const { page } = createPage({ savedEnemies: [] });

    page.openCreateModal();

    expect(page.selectedTypes()).toEqual(['DEX']);
    expect(page.selectAllTypesButtonLabel()).toBe('Select all types');

    page.selectAllTypes();

    expect(page.selectedTypes()).toEqual([...page.availableTypes]);
    expect(page.selectAllTypesButtonLabel()).toBe('Clear type selection');

    page.selectAllTypes();

    expect(page.selectedTypes()).toEqual([]);
    expect(page.selectAllTypesButtonLabel()).toBe('Select all types');
  });

  it('toggles select all and clear for classes without touching unrelated editor state', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.openEditModal(page.savedEnemies()[0]!);

    expect(page.selectedClasses()).toEqual(['Fighter']);
    expect(page.selectedTypes()).toEqual(['DEX', 'PSY']);
    expect(page.selectAllClassesButtonLabel()).toBe('Select all classes');

    page.selectAllClasses();

    expect(page.selectedClasses()).toEqual(['Fighter', 'Slasher']);
    expect(page.selectedTypes()).toEqual(['DEX', 'PSY']);
    expect(page.selectAllClassesButtonLabel()).toBe('Clear class selection');

    page.selectAllClasses();

    expect(page.selectedClasses()).toEqual([]);
    expect(page.selectedTypes()).toEqual(['DEX', 'PSY']);
    expect(page.selectAllClassesButtonLabel()).toBe('Select all classes');
  });

  it('opens and closes the shared ability picker from the editor state', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.openCreateModal();
    page.openAbilityPicker();

    expect(page.abilityPickerOpen()).toBe(true);

    page.closeAbilityPicker();

    expect(page.abilityPickerOpen()).toBe(false);
    expect(page.requiredAbilityDrafts()).toEqual([]);
  });

  it('opens and closes the character image picker from the editor state', () => {
    const { page } = createPage();

    page.openCreateModal();
    page.openCharacterImagePicker();

    expect(page.characterImagePickerOpen()).toBe(true);

    page.closeCharacterImagePicker();

    expect(page.characterImagePickerOpen()).toBe(false);
  });

  it('saves an enemy preset through user state', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.openCreateModal();
    page.onEnemyNameChange({ detail: { value: ' Arena Boss ' } } as CustomEvent<{
      value?: string | null;
    }>);
    page.onEnemyNotesChange({ detail: { value: ' Removes bind ' } } as CustomEvent<{
      value?: string | null;
    }>);
    page.enemyImageDataUrl.set('data:image/jpeg;base64,YXJlbmEtYm9zcw==');
    page.onTypeChange({ detail: { value: ['STR'] } } as CustomEvent<{
      value?: string[] | string | null;
    }>);
    page.onClassChange({ detail: { value: ['Slasher'] } } as CustomEvent<{
      value?: string[] | string | null;
    }>);
    page.saveAbilityPicker([
      {
        draftId: 'bind-1',
        abilityKey: 'remove_bind',
        minTurns: 5,
        slotTokens: [],
        requiredCharacterCount: 1,
      },
    ]);

    await page.saveEnemy();

    expect(userState.saveEnemy).toHaveBeenCalledWith({
      id: undefined,
      name: 'Arena Boss',
      notes: ' Removes bind ',
      imageDataUrl: 'data:image/jpeg;base64,YXJlbmEtYm9zcw==',
      selectedTypes: ['STR'],
      selectedClasses: ['Slasher'],
      requiredAbilities: [
        {
          abilityKey: 'remove_bind',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: false,
    });
    expect(page.editorOpen()).toBe(false);
  });

  it('imports an enemy preset into the current editor draft without auto-saving', async () => {
    const { page, userState } = createPage();
    const originalEnemy = buildSavedEnemies()[0]!;

    await page.ngOnInit();
    page.openEditModal(page.savedEnemies()[0]!);
    stubFileReaderTextResult(
      JSON.stringify({
        schemaVersion: 1,
        source: 'optc-enemy-skill',
        exportType: 'enemy',
        enemy: {
          name: ' Red Cloth Bundle ',
          notes: ' Bring fixed damage or poison. ',
          selectedTypes: ['STR'],
          selectedClasses: ['Slasher'],
          requiredAbilities: [
            {
              abilityKey: 'remove_bind',
              minTurns: 5,
              requiredCharacterCount: 1,
            },
          ],
          enemyMechanics: [
            {
              mechanicKey: 'enemy_increased_defense',
              category: 'enemyDefense',
              minTurns: 99,
            },
          ],
          requireAllSpecialsSupportTeam: true,
        },
      }),
    );

    await page.onEnemyImportSelected(
      createFileEvent(new File(['enemy'], 'red-cloth-bundle.json', { type: 'application/json' })),
      { value: '' } as HTMLInputElement,
    );

    expect(page.enemyName()).toBe('Red Cloth Bundle');
    expect(page.enemyNotes()).toBe('Bring fixed damage or poison.');
    expect(page.enemyImageDataUrl()).toBe(originalEnemy.imageDataUrl);
    expect(page.selectedTypes()).toEqual(['STR']);
    expect(page.selectedClasses()).toEqual(['Slasher']);
    expect(page.enemyMechanicDrafts()).toHaveLength(1);
    expect(page.requiredAbilityDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: 'remove_bind',
        minTurns: 5,
      }),
    ]);
    expect(page.requireAllSpecialsSupportTeam()).toBe(true);
    expect(page.enemyImportErrorMessage()).toBe('');
    expect(page.enemyImportFeedbackMessage()).toBeTruthy();
    expect(userState.saveEnemy).not.toHaveBeenCalled();
  });

  it('keeps the current editor state when enemy import fails', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.openEditModal(page.savedEnemies()[0]!);
    stubFileReaderTextResult('{"schemaVersion":2}');

    await page.onEnemyImportSelected(
      createFileEvent(new File(['enemy'], 'bad-enemy.json', { type: 'application/json' })),
      { value: '' } as HTMLInputElement,
    );

    expect(page.enemyName()).toBe('Forest Boss');
    expect(page.selectedTypes()).toEqual(['DEX', 'PSY']);
    expect(page.enemyImportErrorMessage()).toBe('Unsupported import schema');
  });

  it('removes the currently selected enemy image from the editor state', () => {
    const { page } = createPage();

    page.openEditModal(page.savedEnemies()[0]!);
    page.removeEnemyImage();

    expect(page.enemyImageDataUrl()).toBeNull();
  });

  it('applies the selected character image as an enemy snapshot', async () => {
    const { page } = createPage();
    const pageWithPrivateApi = page as SavedEnemiesPagePrivateApi;

    page.openCreateModal();
    page.openCharacterImagePicker();
    vi.spyOn(pageWithPrivateApi, 'readImageUrlAsDataUrl').mockResolvedValue(
      'data:image/png;base64,cmF3LWNoYXJhY3Rlcg==',
    );
    vi.spyOn(pageWithPrivateApi, 'resizeImageDataUrl').mockResolvedValue(
      'data:image/jpeg;base64,c25hcHNob3Q=',
    );

    await page.applyCharacterImageSelection(buildCharacter(101, 'Monkey D. Luffy'));

    expect(page.enemyImageDataUrl()).toBe('data:image/jpeg;base64,c25hcHNob3Q=');
    expect(page.characterImagePickerOpen()).toBe(false);
    expect(page.enemyImageErrorMessage()).toBe('');
  });

  it('keeps the current enemy image when character snapshot conversion fails', async () => {
    const { page } = createPage();
    const pageWithPrivateApi = page as SavedEnemiesPagePrivateApi;

    page.openEditModal(page.savedEnemies()[0]!);
    page.openCharacterImagePicker();
    vi.spyOn(pageWithPrivateApi, 'readImageUrlAsDataUrl').mockRejectedValue(
      new Error('load failed'),
    );

    await page.applyCharacterImageSelection(buildCharacter(202, 'Roronoa Zoro'));

    expect(page.enemyImageDataUrl()).toBe('data:image/jpeg;base64,Zm9yZXN0LWJvc3M=');
    expect(page.characterImagePickerOpen()).toBe(true);
    expect(page.enemyImageErrorMessage()).toBe('Selected character image failed');
  });

  it('deletes a saved enemy after confirmation', async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { page, userState } = createPage();

    await page.confirmAndDeleteEnemy('enemy-1');

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.deleteEnemy).toHaveBeenCalledWith('enemy-1');
  });

  it('exports a single saved enemy card as a saved-enemies payload', () => {
    const { page } = createPage();

    page.exportEnemy(page.savedEnemies()[0]!);

    expect(vi.mocked(downloadSavedEnemiesExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: 'saved-enemies',
        enemies: [expect.objectContaining({ id: 'enemy-1' })],
      }),
    );
  });

  it('exports all saved enemies together as a saved-enemies payload', () => {
    const { page } = createPage();

    page.exportAllEnemies();

    expect(vi.mocked(downloadSavedEnemiesExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: 'saved-enemies',
        enemies: [
          expect.objectContaining({ id: 'enemy-1' }),
          expect.objectContaining({ id: 'enemy-2' }),
        ],
      }),
    );
  });

  it('builds the correct builder query params for a saved enemy', () => {
    const { page } = createPage();

    expect(page.getEnemyBuilderQueryParams(page.savedEnemies()[0]!)).toEqual({
      enemyId: 'enemy-1',
    });
  });

  it('renders saved enemy actions and builder handoff in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/saved-enemies/saved-enemies.page.html'),
      'utf8',
    );

    expect(template).toContain("t('hero.createCta')");
    expect(template).toContain("t('actions.export')");
    expect(template).toContain("t('actions.openBuilder')");
    expect(template).toContain("t('list.exportAll')");
    expect(template).toContain("t('editor.import.actions.open')");
    expect(template).toContain("t('editor.image.title')");
    expect(template).toContain("t('editor.image.chooseCharacter')");
    expect(template).toContain('(click)="exportEnemy(enemy)"');
    expect(template).toContain('(click)="exportAllEnemies()"');
    expect(template).toContain('onEnemyImportSelected($event, enemyImportInput)');
    expect(template).toContain('onEnemyImageSelected($event, enemyImageInput)');
    expect(template).toContain('(click)="openCharacterImagePicker()"');
    expect(template).toContain('[queryParams]="getEnemyBuilderQueryParams(enemy)"');
    expect(template).toContain('(click)="selectAllTypes()"');
    expect(template).toContain('(click)="selectAllClasses()"');
    expect(template).toContain('selectAllTypesButtonLabel()');
    expect(template).toContain('selectAllClassesButtonLabel()');
    expect(template).toContain('editor.enemyMechanics.title');
    expect(template).toContain('editor.manualCounters.title');
    expect(template).toContain('editor.toggles.specials');
    expect(template).toContain('<app-enemy-mechanic-picker');
    expect(template).toContain('<app-ability-requirement-picker');
    expect(template).toContain('<app-character-image-picker');
    expect(template).not.toContain("resolveAbilityCatalogItem(draft.abilityKey)?.label");
  });
});

function createPage(overrides: { savedEnemies?: ReturnType<typeof buildSavedEnemies> } = {}) {
  const savedEnemies = signal(overrides.savedEnemies ?? buildSavedEnemies());
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    savedEnemies,
    getSavedEnemyById: vi.fn(
      (enemyId: string) => savedEnemies().find((enemy) => enemy.id === enemyId) ?? null,
    ),
    saveEnemy: vi.fn().mockImplementation(async (input: Record<string, unknown>) => {
      const nextEnemy = {
        id: typeof input['id'] === 'string' ? input['id'] : 'enemy-new',
        name: String(input['name'] ?? '').trim() || 'Untitled Enemy',
        notes: String(input['notes'] ?? '').trim(),
        imageDataUrl: typeof input['imageDataUrl'] === 'string' ? input['imageDataUrl'] : null,
        selectedTypes: [...((input['selectedTypes'] as string[]) ?? [])],
        selectedClasses: [...((input['selectedClasses'] as string[]) ?? [])],
        requiredAbilities: [...((input['requiredAbilities'] as unknown[]) ?? [])],
        enemyMechanics: [...((input['enemyMechanics'] as unknown[]) ?? [])],
        requireAllSelectedTypesInTeam: Boolean(input['requireAllSelectedTypesInTeam']),
        requireAllSelectedClassesPerCharacter: Boolean(
          input['requireAllSelectedClassesPerCharacter'],
        ),
        requireAllSpecialsSupportTeam: Boolean(input['requireAllSpecialsSupportTeam']),
        createdAt: '2026-03-30T10:00:00.000Z',
        updatedAt: '2026-03-30T10:05:00.000Z',
      };

      savedEnemies.set([nextEnemy, ...savedEnemies()]);
      return nextEnemy;
    }),
    deleteEnemy: vi.fn().mockImplementation(async (enemyId: string) => {
      savedEnemies.set(savedEnemies().filter((enemy) => enemy.id !== enemyId));
    }),
  };
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      generatedAt: '2026-03-30T10:00:00.000Z',
      sourceVersion: 'test',
      characterCount: 10,
      detailCount: 10,
      shipCount: 2,
      rumbleCount: 0,
      availableTypes: ['DEX', 'STR', 'PSY'],
      availableClasses: ['Fighter', 'Slasher'],
      packs: [],
    }),
    getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue({
      generatedAt: '2026-03-30T10:00:00.000Z',
      sourceVersion: 'test',
      abilityCount: 1,
      abilities: [
        {
          key: 'remove_bind',
          label: 'Remove Bind',
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 10,
          sampleCharacterIds: [101],
          sampleTexts: ['Reduces Bind duration by 5 turns'],
        },
      ],
    }),
    searchCharacters: vi.fn().mockResolvedValue([]),
  };
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key === 'confirm.deleteSingle') {
        return `Delete ${params?.['name'] ?? ''}`;
      }

      if (key === 'editor.requirementSummary.characters') {
        return `>=${params?.['count'] ?? 1} chars`;
      }

      if (key === 'editor.requirementSummary.turns') {
        return `${params?.['count'] ?? 1} turns`;
      }

      if (key === 'common.defaults.untitledEnemy') {
        return 'Untitled Enemy';
      }

      if (key === 'common.actions.select') {
        return 'Select';
      }

      if (key === 'editor.typesActions.selectAll') {
        return 'Select all types';
      }

      if (key === 'editor.typesActions.clear') {
        return 'Clear type selection';
      }

      if (key === 'editor.classesActions.selectAll') {
        return 'Select all classes';
      }

      if (key === 'editor.classesActions.clear') {
        return 'Clear class selection';
      }

      if (key === 'editor.import.success') {
        return 'Enemy preset imported';
      }

      if (key === 'editor.import.errors.unsupportedSchema') {
        return 'Unsupported import schema';
      }

      if (key === 'editor.image.errors.characterLoadFailed') {
        return 'Selected character image failed';
      }

      return key;
    }),
  };
  const page = new SavedEnemiesPage(userState as never, repository as never, i18n as never);

  return { page, repository, userState };
}

function buildCharacter(id: number, name = `Character ${id}`) {
  return {
    id,
    name,
    type: id % 2 === 0 ? 'STR' : 'DEX',
    primaryClass: 'Fighter',
    secondaryClass: 'Slasher',
    classes: ['Fighter', 'Slasher'],
    stars: 6,
    cost: 55,
    combo: 4,
    maxLevel: 99,
    maxExperience: 5000000,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 3500, atk: 1600, rcv: 320 },
      growth: 1.5,
    },
    regionAvailability: {
      exactLocal: false,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: `characters/${id}.png`,
      thumbnailJapan: null,
      fullTransparent: null,
    },
    imageUrl: `assets/offline-packs/thumbnails-glo/characters/${id}.png`,
  };
}

function buildSavedEnemies() {
  return [
    {
      id: 'enemy-1',
      name: 'Forest Boss',
      notes: 'Needs bind removal',
      imageDataUrl: 'data:image/jpeg;base64,Zm9yZXN0LWJvc3M=',
      selectedTypes: ['DEX', 'PSY'],
      selectedClasses: ['Fighter'],
      requiredAbilities: [
        {
          abilityKey: 'remove_enemy_barrier',
          minTurns: 3,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
        {
          abilityKey: 'remove_bind',
          minTurns: 5,
          slotTokens: [],
          requiredCharacterCount: 1,
        },
      ],
      enemyMechanics: [
        {
          mechanicKey: 'enemy_barrier',
          category: 'enemyDefense',
          minTurns: 3,
          triggerTags: [],
          responseTags: [],
          conditionTags: [],
          derivedAbilityKey: 'remove_enemy_barrier',
        },
      ],
      requireAllSelectedTypesInTeam: true,
      requireAllSelectedClassesPerCharacter: false,
      requireAllSpecialsSupportTeam: true,
      createdAt: '2026-03-30T10:00:00.000Z',
      updatedAt: '2026-03-30T10:05:00.000Z',
    },
    {
      id: 'enemy-2',
      name: 'Arena Boss',
      notes: '',
      imageDataUrl: null,
      selectedTypes: ['STR'],
      selectedClasses: ['Slasher'],
      requiredAbilities: [],
      enemyMechanics: [],
      requireAllSelectedTypesInTeam: false,
      requireAllSelectedClassesPerCharacter: true,
      requireAllSpecialsSupportTeam: false,
      createdAt: '2026-03-30T10:10:00.000Z',
      updatedAt: '2026-03-30T10:15:00.000Z',
    },
  ];
}

function createFileEvent(file: File): Event {
  return {
    target: {
      files: [file],
    },
  } as unknown as Event;
}

function stubFileReaderTextResult(result: string): void {
  class MockFileReader {
    public result: string | null = null;
    public error: Error | null = null;
    public onload: null | (() => void) = null;
    public onerror: null | (() => void) = null;

    public readAsText(): void {
      this.result = result;
      this.onload?.();
    }
  }

  vi.stubGlobal('FileReader', MockFileReader);
}

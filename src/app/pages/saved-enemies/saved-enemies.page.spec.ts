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
  IonCheckbox: class {},
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

  it('opens the create modal with fresh defaults', async () => {
    const { page } = createPage({ savedEnemies: [] });

    await page.ngOnInit();
    page.openCreateModal();

    expect(page.editorOpen()).toBe(true);
    expect(page.enemyMechanicPickerOpen()).toBe(false);
    expect(page.abilityPickerOpen()).toBe(false);
    expect(page.editingEnemy()).toBeNull();
    expect(page.selectedTypes()).toEqual([...page.availableTypes]);
    expect(page.selectedClasses()).toEqual([...page.availableClasses()]);
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

  it('selects all enemies and enables bulk actions', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.onSelectAllChange({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.selectedEnemyIds()).toEqual(['enemy-1', 'enemy-2']);
    expect(page.hasSelection()).toBe(true);
    expect(page.allSelected()).toBe(true);
  });

  it('toggles select all and clear for types from the create modal', () => {
    const { page } = createPage({ savedEnemies: [] });

    page.openCreateModal();

    expect(page.selectedTypes()).toEqual([...page.availableTypes]);
    expect(page.selectAllTypesButtonLabel()).toBe('Clear type selection');

    page.selectAllTypes();

    expect(page.selectedTypes()).toEqual([]);
    expect(page.selectAllTypesButtonLabel()).toBe('Select all types');

    page.selectAllTypes();

    expect(page.selectedTypes()).toEqual([...page.availableTypes]);
    expect(page.selectAllTypesButtonLabel()).toBe('Clear type selection');
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
    });
    expect(page.editorOpen()).toBe(false);
  });

  it('parses pasted enemy text, applies it to the draft, and persists it through saveEnemy', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.openCreateModal();
    page.onEnemyNameChange({ detail: { value: ' Paste Boss ' } } as CustomEvent<{
      value?: string | null;
    }>);
    page.onTypeChange({ detail: { value: ['DEX'] } } as CustomEvent<{
      value?: string[] | string | null;
    }>);
    page.onClassChange({ detail: { value: ['Fighter'] } } as CustomEvent<{
      value?: string[] | string | null;
    }>);
    page.onEnemyPasteTextChange({
      detail: {
        value: `
          4 turn(s) Special Bind,
          4 turn(s) Paralysis,
          Non-Normal Attacks deal 1 damage
        `,
      },
    } as CustomEvent<{ value?: string | null }>);

    page.parseEnemyText();

    expect(page.enemyTextParseResult()).toEqual(
      expect.objectContaining({
        matchedMechanicCount: 2,
        matchedAbilityCount: 1,
      }),
    );
    expect(userState.saveEnemy).not.toHaveBeenCalled();

    page.applyParsedEnemyText();

    expect(page.enemyMechanicDrafts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mechanicKey: 'crew_special_bind',
          minTurns: 4,
        }),
        expect.objectContaining({
          mechanicKey: 'crew_paralysis',
          minTurns: 4,
        }),
      ]),
    );
    expect(page.requiredAbilityDrafts()).toEqual([
      expect.objectContaining({
        abilityKey: 'ignore_normal_attack_only',
      }),
    ]);

    await page.saveEnemy();

    expect(userState.saveEnemy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Paste Boss',
        enemyMechanics: [
          expect.objectContaining({
            mechanicKey: 'crew_special_bind',
            minTurns: 4,
          }),
          expect.objectContaining({
            mechanicKey: 'crew_paralysis',
            minTurns: 4,
          }),
        ],
        requiredAbilities: [
          expect.objectContaining({
            abilityKey: 'remove_special_bind',
            minTurns: 4,
          }),
          expect.objectContaining({
            abilityKey: 'remove_paralysis',
            minTurns: 4,
          }),
          expect.objectContaining({
            abilityKey: 'ignore_normal_attack_only',
            minTurns: null,
          }),
        ],
      }),
    );
  });

  it('counts repeated parsed counters across battles when saving an enemy', async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.openCreateModal();
    page.onEnemyNameChange({ detail: { value: 'Stage Boss' } } as CustomEvent<{
      value?: string | null;
    }>);
    page.onTypeChange({ detail: { value: ['DEX'] } } as CustomEvent<{
      value?: string[] | string | null;
    }>);
    page.onClassChange({ detail: { value: ['Fighter'] } } as CustomEvent<{
      value?: string[] | string | null;
    }>);
    page.onEnemyPasteTextChange({
      detail: {
        value: `
          Battle 3
          4 turn(s) Paralysis
          Battle 4
          6 turn(s) Paralysis
        `,
      },
    } as CustomEvent<{ value?: string | null }>);

    page.parseEnemyText();
    page.applyParsedEnemyText();
    await page.saveEnemy();

    expect(userState.saveEnemy).toHaveBeenCalledWith(
      expect.objectContaining({
        enemyMechanics: [
          expect.objectContaining({
            mechanicKey: 'crew_paralysis',
            minTurns: 6,
            requiredCharacterCount: 2,
          }),
        ],
        requiredAbilities: [
          expect.objectContaining({
            abilityKey: 'remove_paralysis',
            minTurns: 6,
            requiredCharacterCount: 2,
          }),
        ],
      }),
    );
  });

  it('clears parsed warning state when the pasted text changes and recomputes on the next parse', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.openEditModal(page.savedEnemies()[0]!);
    page.onEnemyPasteTextChange({
      detail: {
        value: 'Battle 3',
      },
    } as CustomEvent<{ value?: string | null }>);

    page.parseEnemyText();

    expect(page.enemyTextParseResult()?.warnings).toEqual([]);

    page.onEnemyPasteTextChange({
      detail: {
        value: '4 turn(s) Special Bind',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(page.enemyTextParseResult()).toBeNull();
    expect(page.enemyTextParseErrorMessage()).toBe('');

    page.parseEnemyText();

    expect(page.enemyTextParseResult()).toEqual(
      expect.objectContaining({
        matchedMechanicCount: 1,
        matchedAbilityCount: 0,
      }),
    );
    expect(page.enemyTextParseResult()?.warnings).toEqual([]);
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

  it('deletes a saved enemy after confirmation and prunes its selection', async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { page, userState } = createPage();

    page.selectedEnemyIds.set(['enemy-1', 'enemy-2']);
    await page.confirmAndDeleteEnemy('enemy-1');

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.deleteEnemy).toHaveBeenCalledWith('enemy-1');
    expect(page.selectedEnemyIds()).toEqual(['enemy-2']);
  });

  it('exports only the selected saved enemies as a saved-enemies payload', async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.onEnemySelectionChange('enemy-2', {
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    page.exportSelectedEnemies();

    expect(vi.mocked(downloadSavedEnemiesExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: 'saved-enemies',
        enemies: [expect.objectContaining({ id: 'enemy-2' })],
      }),
    );
  });

  it('exports a single saved enemy from the card actions', () => {
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

  it('deletes the selected enemies in bulk after confirmation', async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.onSelectAllChange({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    await page.confirmAndDeleteSelectedEnemies();

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.deleteEnemies).toHaveBeenCalledWith(['enemy-1', 'enemy-2']);
    expect(page.selectedEnemyIds()).toEqual([]);
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
    expect(template).toContain("t('actions.openBuilder')");
    expect(template).toContain("t('actions.exportSingle')");
    expect(template).toContain("t('selection.selectAll')");
    expect(template).toContain("t('tools.export')");
    expect(template).toContain("t('tools.delete')");
    expect(template).not.toContain("t('list.exportAll')");
    expect(template).not.toContain("t('list.addAnother')");
    expect(template).toContain("t('editor.paste.title')");
    expect(template).toContain("t('editor.paste.actions.parse')");
    expect(template).toContain("t('editor.paste.actions.apply')");
    expect(template).toContain("t('editor.image.title')");
    expect(template).toContain("t('editor.image.chooseCharacter')");
    expect(template).toContain('(click)="resetSelection()"');
    expect(template).toContain('(click)="exportSelectedEnemies()"');
    expect(template).toContain('(click)="confirmAndDeleteSelectedEnemies()"');
    expect(template).not.toContain('(click)="exportAllEnemies()"');
    expect(template).toContain('(ionInput)="onEnemyPasteTextChange($event)"');
    expect(template).toContain('(click)="parseEnemyText()"');
    expect(template).toContain('(click)="applyParsedEnemyText()"');
    expect(template).toContain('onEnemyImageSelected($event, enemyImageInput)');
    expect(template).toContain('(click)="openCharacterImagePicker()"');
    expect(template).toContain('[queryParams]="getEnemyBuilderQueryParams(enemy)"');
    expect(template).toContain('ion-checkbox');
    expect(template).toContain('(click)="selectAllTypes()"');
    expect(template).toContain('(click)="selectAllClasses()"');
    expect(template).toContain('selectAllTypesButtonLabel()');
    expect(template).toContain('selectAllClassesButtonLabel()');
    expect(template).toContain('editor.enemyMechanics.title');
    expect(template).toContain('editor.manualCounters.title');
    expect(template).not.toContain('editor.toggles.types');
    expect(template).not.toContain('editor.toggles.classes');
    expect(template).not.toContain('editor.toggles.specials');
    expect(template).toContain('<app-enemy-mechanic-picker');
    expect(template).toContain('<app-ability-requirement-picker');
    expect(template).toContain('<app-character-image-picker');
    expect(template).not.toContain('editor.import.actions.openTable');
    expect(template).not.toContain('<app-saved-enemy-structured-requirements-modal');
    expect(template).not.toContain('resolveAbilityCatalogItem(draft.abilityKey)?.label');
    expect(template).not.toContain("t('bulkImport.action')");
    expect(template).not.toContain('(click)="openImportModal()"');
    expect(template).not.toContain('onImportFileSelected($event, importFileInput)');
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
        createdAt: '2026-03-30T10:00:00.000Z',
        updatedAt: '2026-03-30T10:05:00.000Z',
      };

      savedEnemies.set([nextEnemy, ...savedEnemies()]);
      return nextEnemy;
    }),
    deleteEnemy: vi.fn().mockImplementation(async (enemyId: string) => {
      savedEnemies.set(savedEnemies().filter((enemy) => enemy.id !== enemyId));
    }),
    deleteEnemies: vi.fn().mockImplementation(async (enemyIds: string[]) => {
      const targetEnemyIds = new Set(enemyIds);
      savedEnemies.set(savedEnemies().filter((enemy) => !targetEnemyIds.has(enemy.id)));
    }),
    mergeImportedEnemies: vi
      .fn()
      .mockImplementation(async (importedEnemies: ReturnType<typeof buildSavedEnemies>) => {
        const currentEnemies = savedEnemies();
        const currentEnemyMap = new Map(currentEnemies.map((enemy) => [enemy.id, enemy] as const));
        const mergedEnemies: typeof importedEnemies = [];
        const importedEnemyIds = new Set<string>();
        let addedCount = 0;
        let updatedCount = 0;

        importedEnemies.forEach((enemy) => {
          if (importedEnemyIds.has(enemy.id)) {
            return;
          }

          importedEnemyIds.add(enemy.id);

          if (currentEnemyMap.has(enemy.id)) {
            updatedCount += 1;
          } else {
            addedCount += 1;
          }

          mergedEnemies.push(enemy);
        });

        const nextEnemies = [
          ...mergedEnemies,
          ...currentEnemies.filter((enemy) => !importedEnemyIds.has(enemy.id)),
        ];

        savedEnemies.set(nextEnemies);

        return {
          addedCount,
          updatedCount,
          enemies: nextEnemies,
        };
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
      abilityCount: 7,
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
        {
          key: 'remove_enemy_barrier',
          label: 'Remove Barrier',
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 8,
          sampleCharacterIds: [102],
          sampleTexts: ['Removes enemy barrier'],
        },
        {
          key: 'remove_special_bind',
          label: 'Remove Special Bind',
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 8,
          sampleCharacterIds: [103],
          sampleTexts: ['Removes special bind'],
        },
        {
          key: 'remove_paralysis',
          label: 'Remove Paralysis',
          supportsTurns: true,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 8,
          sampleCharacterIds: [104],
          sampleTexts: ['Removes paralysis'],
        },
        {
          key: 'ignore_normal_attack_only',
          label: 'Ignore NAO',
          supportsTurns: false,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 3,
          sampleCharacterIds: [105],
          sampleTexts: ['Ignore normal attack only'],
        },
        {
          key: 'deal_fixed_damage',
          label: 'Deal Fixed Damage',
          supportsTurns: false,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 3,
          sampleCharacterIds: [106],
          sampleTexts: ['Deal fixed damage'],
        },
        {
          key: 'inflict_poison',
          label: 'Inflict Poison',
          supportsTurns: false,
          supportsSlotTokens: false,
          availableSlotTokens: [],
          availableSources: ['specialText'],
          matchCount: 3,
          sampleCharacterIds: [107],
          sampleTexts: ['Inflict poison'],
        },
      ],
    }),
    searchCharacters: vi.fn().mockResolvedValue([]),
  };
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key === 'confirm.deleteSelected') {
        return `Delete ${params?.['count'] ?? 0} selected enemies`;
      }

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

      if (key === 'editor.paste.errors.empty') {
        return 'Paste enemy text first';
      }

      if (key === 'editor.paste.feedback.successTitle') {
        return 'Text parsed';
      }

      if (key === 'editor.paste.feedback.warningTitle') {
        return 'Text parsed with warnings';
      }

      if (key === 'editor.paste.feedback.summary') {
        return `Matched ${params?.['mechanicCount'] ?? 0} mechanics, ${
          params?.['abilityCount'] ?? 0
        } direct abilities, ${params?.['warningCount'] ?? 0} warnings.`;
      }

      if (key === 'editor.paste.warnings.title') {
        return 'Ignored or simplified lines';
      }

      if (key === 'editor.paste.warnings.unmatched') {
        return `Ignored: ${params?.['line'] ?? ''}`;
      }

      if (key === 'editor.paste.warnings.precisionLoss') {
        return `Simplified "${params?.['line'] ?? ''}" to ${params?.['resolvedAs'] ?? ''}.`;
      }

      if (key === 'bulkImport.successTitle') {
        return 'Import completed';
      }

      if (key === 'bulkImport.warningTitle') {
        return 'Import completed with warnings';
      }

      if (key === 'bulkImport.errorTitle') {
        return 'Import failed';
      }

      if (key === 'bulkImport.loadedFromFile') {
        return `Loaded ${params?.['fileName'] ?? ''}.`;
      }

      if (key === 'bulkImport.stats.added') {
        return `Added ${params?.['count'] ?? 0} saved enemies.`;
      }

      if (key === 'bulkImport.stats.updated') {
        return `Updated ${params?.['count'] ?? 0} saved enemies.`;
      }

      if (key === 'bulkImport.stats.invalid') {
        return `Ignored ${params?.['count'] ?? 0} invalid enemy records.`;
      }

      if (key === 'bulkImport.stats.duplicates') {
        return `Collapsed ${params?.['count'] ?? 0} duplicate ids from the import.`;
      }

      if (key === 'bulkImport.errors.unsupportedSchema') {
        return 'Unsupported saved enemies import schema';
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
      createdAt: '2026-03-30T10:10:00.000Z',
      updatedAt: '2026-03-30T10:15:00.000Z',
    },
  ];
}

import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type OptcbxParsedImport } from '../../core/models/optcbx-import.models';
import { CharactersPage } from './characters.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonMenuButton: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonToggle: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe('CharactersPage favorites tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to compact display mode', () => {
    const { page } = createPage();

    expect(page.displayMode()).toBe('compact');
    expect(page.isCompactDisplayMode()).toBe(true);
  });

  it('switches between list and compact display modes', () => {
    const { page } = createPage();

    page.setDisplayMode('list');
    expect(page.displayMode()).toBe('list');
    expect(page.isCompactDisplayMode()).toBe(false);

    page.setDisplayMode('compact');
    expect(page.displayMode()).toBe('compact');
    expect(page.isCompactDisplayMode()).toBe(true);
  });

  it('disables favorites export when there are no favorites', () => {
    const { page } = createPage();

    expect(page.canDownloadFavoritesExport()).toBe(false);
  });

  it('opens and closes the favorites import modal with reset state', () => {
    const { page } = createPage();

    page.importFileName.set('favorites.json');
    page.importErrorMessage.set('bad file');
    page.openImportModal();

    expect(page.importModalOpen()).toBe(true);
    expect(page.importFileName()).toBe('');

    page.importFileName.set('favorites.json');
    page.closeImportModal();

    expect(page.importModalOpen()).toBe(false);
    expect(page.importFileName()).toBe('');
  });

  it('imports favorites into user state', async () => {
    const parsedImport: OptcbxParsedImport = {
      importedNumbers: [1001, 1002],
      duplicatesRemoved: 0,
    };
    const { page, optcbxImport, userState } = createPage({
      favoriteIds: [1003],
    });

    optcbxImport.buildMergeImportResult.mockResolvedValue({
      matchedIds: [1001, 1002],
      unmatchedIds: [],
      duplicatesRemoved: 0,
      addedCount: 2,
      alreadyFavoritedCount: 0,
    });
    optcbxImport.mergeFavoriteIds.mockReturnValue([1001, 1002, 1003]);
    page.parsedImport.set(parsedImport);

    await page.importFavorites();

    expect(userState.setFavoriteCharacterIds).toHaveBeenCalledWith([1001, 1002, 1003]);
    expect(page.importResult()?.matchedIds).toEqual([1001, 1002]);
  });

  it('keeps both favorites filter controls in the template without bulk favorite action buttons', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/characters/characters.page.html'),
      'utf8',
    );

    expect(template).toContain("'common.actions.reset' | transloco");
    expect(template).toContain('ability-filter-rail');
    expect(template).toContain('abilityFilterRailItems()');
    expect(template).toContain('openAbilityFilterCategory($event)');
    expect(template).toContain('clearAbilityFilterCategory($event)');
    expect(template).not.toContain('activeAbilityFilterGroups()');
    expect(template).not.toContain('removeAbilityFilterBadge');
    expect(template).toContain('characters-filter-toolbar');
    expect(template).toContain('<app-character-filter-row');
    expect(template).toContain("t('filters.favoritesOnly.label')");
    expect(template).toContain('favoritesOnlySupportLabel()');
    expect(template).toContain('onFavoritesOnlyToggle($event)');
    expect(template).toContain("t('filters.hideFavorites.label')");
    expect(template).toContain('hideFavoritesSupportLabel()');
    expect(template).toContain('onHideFavoritesToggle($event)');
    expect(template).toContain("t('sort.label')");
    expect(template).toContain('selectedSortMode()');
    expect(template).toContain('onSortModeChange($event)');
    expect(template).toContain("t('idOrder.label')");
    expect(template).toContain('selectedIdOrder()');
    expect(template).toContain('onIdOrderChange($event)');
    expect(template).not.toContain('value="idDesc"');
    expect(template).not.toContain('value="idAsc"');
    expect(template).toContain("t('displayMode.compact')");
    expect(template).toContain('character-thumb-card');
    expect(template).toContain('toggleFavorite(card.character.id, $event)');
    expect(template).not.toContain('/tabs/character-boxes');
    expect(template).not.toContain("t('tools.manageBoxes')");
    expect(template).not.toContain("t('tools.export')");
    expect(template).not.toContain("t('tools.import')");
    expect(template).not.toContain("t('favorites.clearAll')");
  });

  it('shows selected ability filters as count-only rail items', () => {
    const { page } = createPage();

    page.abilityCatalog.set({
      abilities: [
        {
          key: 'remove_bind',
          label: 'Remove Bind',
          category: 'special',
        },
        {
          key: 'crewmate_recover_paralysis',
          label: 'Status Effect Recovery: Paralysis',
          category: 'crewmate',
        },
      ],
    } as never);
    page.specialAbilityDrafts.set([
      {
        draftId: 'special-1',
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: null,
      },
    ]);
    page.crewmateAbilityDrafts.set([
      {
        draftId: 'crewmate-1',
        abilityKey: 'crewmate_recover_paralysis',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: null,
      },
    ]);

    expect(page.abilityFilterRailItems()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'special',
          count: 1,
        }),
        expect.objectContaining({
          category: 'crewmate',
          count: 1,
        }),
        expect.objectContaining({
          category: 'potential',
          count: 0,
        }),
        expect.objectContaining({
          category: 'support',
          count: 0,
        }),
      ]),
    );
  });

  it('clears a selected ability category from the rail and reloads results', async () => {
    const { page, characterCatalogCache } = createPage();

    page.specialAbilityDrafts.set([
      {
        draftId: 'special-1',
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: null,
      },
      {
        draftId: 'special-2',
        abilityKey: 'remove_despair',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: null,
      },
    ]);

    await page.clearAbilityFilterCategory('special');

    expect(page.specialAbilityDrafts()).toEqual([]);
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 100,
      offset: 0,
    });
  });

  it('filters searches down to favorites when the favorites-only toggle is enabled', async () => {
    const { page, characterCatalogCache } = createPage({
      favoriteIds: [101, 202],
    });

    await page.onFavoritesOnlyToggle({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.favoritesOnly()).toBe(true);
    expect(page.hideFavorites()).toBe(false);
    expect(characterCatalogCache.queryCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: [101, 202],
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 100,
      offset: 0,
    });
  });

  it('excludes favorites from searches when the hide toggle is enabled', async () => {
    const { page, characterCatalogCache } = createPage({
      favoriteIds: [101, 202],
    });

    await page.onHideFavoritesToggle({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.hideFavorites()).toBe(true);
    expect(characterCatalogCache.queryCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      excludedCharacterIds: [101, 202],
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 100,
      offset: 0,
    });
  });

  it('keeps the two favorites modes mutually exclusive', async () => {
    const { page } = createPage({
      favoriteIds: [101],
    });

    await page.onFavoritesOnlyToggle({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);
    await page.onHideFavoritesToggle({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.favoritesOnly()).toBe(false);
    expect(page.hideFavorites()).toBe(true);
  });

  it('refreshes the current list after adding a favorite in hide-favorites mode', async () => {
    const { page, characterCatalogCache } = createPage();

    await page.onHideFavoritesToggle({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);
    characterCatalogCache.queryCharacters.mockClear();

    await page.toggleFavorite(101, {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event);

    expect(characterCatalogCache.queryCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      excludedCharacterIds: [101],
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 100,
      offset: 0,
    });
  });

  it('keeps hide-favorites filtering behavior intact in compact mode', async () => {
    const { page, characterCatalogCache } = createPage();

    page.setDisplayMode('compact');

    await page.onHideFavoritesToggle({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);
    characterCatalogCache.queryCharacters.mockClear();

    await page.toggleFavorite(101, {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event);

    expect(page.displayMode()).toBe('compact');
    expect(characterCatalogCache.queryCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      excludedCharacterIds: [101],
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 100,
      offset: 0,
    });
  });

  it('passes the selected sort mode to cached searches', async () => {
    const { page, characterCatalogCache } = createPage();

    await page.onSortModeChange({
      detail: {
        value: 'nameAsc',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(page.selectedSortMode()).toBe('nameAsc');
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      sortMode: 'nameAsc',
      idOrder: 'newest',
      limit: 100,
      offset: 0,
    });
  });

  it('passes the selected ID order to cached searches', async () => {
    const { page, characterCatalogCache } = createPage();

    await page.onIdOrderChange({
      detail: {
        value: 'oldest',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(page.selectedIdOrder()).toBe('oldest');
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'oldest',
      limit: 100,
      offset: 0,
    });
  });

  it('clears all favorites after confirmation', async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal('confirm', confirmSpy);
    const { page, userState } = createPage({
      favoriteIds: [101, 202],
    });

    await page.clearAllFavorites();

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.setFavoriteCharacterIds).toHaveBeenCalledWith([]);
  });

  it('resets page-local filters, import state and reloads the first result page', async () => {
    const { page, characterCatalogCache } = createPage({
      favoriteIds: [101],
    });

    page.searchTerm.set('Luffy');
    page.typeQuery.set('DEX');
    page.classQuery.set('Fighter');
    page.selectedType.set('DEX');
    page.selectedClass.set('Fighter');
    page.favoritesOnly.set(true);
    page.hideFavorites.set(true);
    page.selectedSortMode.set('nameDesc');
    page.selectedIdOrder.set('oldest');
    page.specialAbilityDrafts.set([
      {
        draftId: 'special-1',
        abilityKey: 'remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: null,
      },
    ]);
    page.crewmateAbilityDrafts.set([
      {
        draftId: 'crewmate-1',
        abilityKey: 'crewmate_recover_paralysis',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: null,
      },
    ]);
    page.potentialAbilityDrafts.set([
      {
        draftId: 'potential-1',
        abilityKey: 'potential_reduce_no_healing',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: null,
      },
    ]);
    page.supportAbilityDrafts.set([
      {
        draftId: 'support-1',
        abilityKey: 'support_remove_bind',
        minTurns: null,
        slotTokens: [],
        requiredCharacterCount: null,
      },
    ]);
    page.importModalOpen.set(true);
    page.importFileName.set('favorites.json');
    page.importErrorMessage.set('Bad file');
    page.parsedImport.set({
      importedNumbers: [101],
      duplicatesRemoved: 0,
    });

    await page.resetPage();

    expect(page.searchTerm()).toBe('');
    expect(page.selectedType()).toBe('');
    expect(page.selectedClass()).toBe('');
    expect(page.favoritesOnly()).toBe(false);
    expect(page.hideFavorites()).toBe(false);
    expect(page.selectedSortMode()).toBe('catalog');
    expect(page.selectedIdOrder()).toBe('newest');
    expect(page.specialAbilityDrafts()).toEqual([]);
    expect(page.crewmateAbilityDrafts()).toEqual([]);
    expect(page.potentialAbilityDrafts()).toEqual([]);
    expect(page.supportAbilityDrafts()).toEqual([]);
    expect(page.importModalOpen()).toBe(false);
    expect(page.importFileName()).toBe('');
    expect(page.parsedImport()).toBeNull();
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 100,
      offset: 0,
    });
  });
});

function createPage(overrides: { favoriteIds?: number[] } = {}) {
  const favoriteIds = signal(overrides.favoriteIds ?? []);
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: favoriteIds,
    toggleFavorite: vi.fn().mockImplementation(async (characterId: number) => {
      const currentFavoriteIds = favoriteIds();
      favoriteIds.set(
        currentFavoriteIds.includes(characterId)
          ? currentFavoriteIds.filter((favoriteId) => favoriteId !== characterId)
          : [...currentFavoriteIds, characterId],
      );
    }),
    setFavoriteCharacterIds: vi.fn().mockImplementation(async (nextFavoriteIds: number[]) => {
      favoriteIds.set(nextFavoriteIds);
    }),
  };
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      characterCount: 0,
      detailCount: 0,
      rumbleCount: 0,
      availableTypes: [],
      availableClasses: [],
    }),
  };
  const characterCatalogCache = {
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    queryCharacters: vi.fn().mockReturnValue([]),
    getCharactersByIds: vi.fn().mockReturnValue([]),
  };
  const optcbxImport = {
    parseExport: vi.fn(),
    buildMergeImportResult: vi.fn(),
    mergeFavoriteIds: vi.fn(),
  };
  const i18n = {
    activeLanguage: signal<'en' | 'el'>('en'),
    availableLanguages: [
      { id: 'en', label: 'English' },
      { id: 'el', label: 'Ελληνικά' },
    ] as const,
    preloadScope: vi.fn().mockResolvedValue(undefined),
    ready: vi.fn().mockResolvedValue(undefined),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key === 'filters.hideFavorites.withCount') {
        return `Hide your ${params?.['count'] ?? 0} favorited characters from results.`;
      }

      if (key === 'filters.hideFavorites.empty') {
        return 'No favorites saved yet.';
      }

      if (key === 'filters.favoritesOnly.withCount') {
        return `Limit results to your ${params?.['count'] ?? 0} favorited characters.`;
      }

      if (key === 'filters.favoritesOnly.empty') {
        return 'No favorites saved yet.';
      }

      return key;
    }),
  };
  const page = new CharactersPage(
    repository as never,
    characterCatalogCache as never,
    userState as never,
    optcbxImport as never,
    i18n as never,
  );

  return { page, repository, characterCatalogCache, userState, optcbxImport, i18n };
}

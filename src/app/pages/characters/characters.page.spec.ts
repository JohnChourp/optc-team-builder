import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type OptcbxParsedImport } from '../../core/models/optcbx-import.models';
import { CharactersPage } from './characters.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSearchbar: class {},
  IonSpinner: class {},
  IonToggle: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe('CharactersPage favorites tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('includes the favorites import/export actions in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/characters/characters.page.html'),
      'utf8',
    );

    expect(template).toContain("t('tools.export')");
    expect(template).toContain("t('tools.import')");
    expect(template).toContain("t('favorites.clearAll')");
    expect(template).toContain("'common.actions.reset' | transloco");
    expect(template).toContain("t('filters.favoritesOnly.label')");
    expect(template).toContain('favoritesOnlySupportLabel()');
    expect(template).toContain('onFavoritesOnlyToggle($event)');
  });

  it('filters searches down to favorites when the toggle is enabled', async () => {
    const { page, repository } = createPage({
      favoriteIds: [101, 202],
    });

    await page.onFavoritesOnlyToggle({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.favoritesOnly()).toBe(true);
    expect(repository.searchCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: [101, 202],
      limit: 48,
      offset: 0,
    });
  });

  it('refreshes the current list after removing a favorite in favorites-only mode', async () => {
    const { page, repository } = createPage({
      favoriteIds: [101],
    });

    await page.onFavoritesOnlyToggle({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);
    repository.searchCharacters.mockClear();

    await page.toggleFavorite(101, {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event);

    expect(repository.searchCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: [],
      limit: 48,
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
    const { page, repository } = createPage({
      favoriteIds: [101],
    });

    page.searchTerm.set('Luffy');
    page.typeQuery.set('DEX');
    page.classQuery.set('Fighter');
    page.selectedType.set('DEX');
    page.selectedClass.set('Fighter');
    page.favoritesOnly.set(true);
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
    expect(page.importModalOpen()).toBe(false);
    expect(page.importFileName()).toBe('');
    expect(page.parsedImport()).toBeNull();
    expect(repository.searchCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      limit: 48,
      offset: 0,
    });
  });
});

function createPage(overrides: { favoriteIds?: number[] } = {}) {
  const favoriteIds = signal(overrides.favoriteIds ?? []);
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
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
      characterCount: 0,
      detailCount: 0,
      rumbleCount: 0,
      availableTypes: [],
      availableClasses: [],
    }),
    searchCharacters: vi.fn().mockResolvedValue([]),
    getCharactersByIds: vi.fn().mockResolvedValue([]),
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
    userState as never,
    optcbxImport as never,
    i18n as never,
  );

  return { page, repository, userState, optcbxImport, i18n };
}

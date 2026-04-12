import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CharactersPage } from './characters.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonSearchbar: class {},
  IonSpinner: class {},
  IonToggle: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe('CharactersPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only reset and favorites-only controls in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/characters/characters.page.html'),
      'utf8',
    );

    expect(template).toContain("'common.actions.reset' | transloco");
    expect(template).toContain("t('filters.favoritesOnly.label')");
    expect(template).toContain('favoritesOnlySupportLabel()');
    expect(template).toContain('onFavoritesOnlyToggle($event)');
    expect(template).not.toContain("t('tools.export')");
    expect(template).not.toContain("t('tools.import')");
    expect(template).not.toContain("t('favorites.clearAll')");
    expect(template).not.toContain('importModalOpen()');
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

  it('resets page-local filters and reloads the first result page', async () => {
    const { page, repository } = createPage({
      favoriteIds: [101],
    });

    page.searchTerm.set('Luffy');
    page.typeQuery.set('DEX');
    page.classQuery.set('Fighter');
    page.selectedType.set('DEX');
    page.selectedClass.set('Fighter');
    page.favoritesOnly.set(true);

    await page.resetPage();

    expect(page.searchTerm()).toBe('');
    expect(page.selectedType()).toBe('');
    expect(page.selectedClass()).toBe('');
    expect(page.favoritesOnly()).toBe(false);
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
  const page = new CharactersPage(repository as never, userState as never, i18n as never);

  return { page, repository, userState, i18n };
}

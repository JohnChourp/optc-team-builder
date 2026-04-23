import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { CharacterBoxesPage } from './character-boxes.page';

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
  IonTitle: class {},
  IonToolbar: class {},
}));

describe('CharacterBoxesPage', () => {
  it('defaults to list display mode', () => {
    const { page } = createPage();

    expect(page.displayMode()).toBe('list');
    expect(page.isCompactDisplayMode()).toBe(false);
  });

  it('creates and selects a new box', async () => {
    const { page, userState } = createPage([]);

    await page.createBox();

    expect(userState.saveCharacterBox).toHaveBeenCalledWith({
      name: 'Box 1',
      characterIds: [],
    });
    expect(page.selectedBox()?.id).toBe('box-1');
  });

  it('renames the selected box after valid input', async () => {
    const { page, userState } = createPage();

    page.selectBox('box-1');
    await page.onBoxNameInput({
      detail: {
        value: '  Cerebral Box  ',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(userState.saveCharacterBox).toHaveBeenLastCalledWith({
      id: 'box-1',
      name: 'Cerebral Box  ',
      characterIds: [101],
    });
    expect(page.selectedBox()?.name).toBe('Cerebral Box');
  });

  it('adds and removes characters from the selected box', async () => {
    const { page } = createPage();

    page.selectBox('box-1');
    await page.toggleCharacterMembership(202);
    expect(page.selectedBox()?.characterIds).toEqual([202, 101]);

    await page.toggleCharacterMembership(101);
    expect(page.selectedBox()?.characterIds).toEqual([202]);
  });

  it('adds only missing favorites to the selected box', async () => {
    const { page } = createPage(undefined, [101, 202, 303]);

    page.selectBox('box-1');
    await page.addFavoritesToSelectedBox();

    expect(page.selectedBox()?.characterIds).toEqual([101, 202, 303]);
  });

  it('does nothing when there is no selected box or no missing favorites', async () => {
    const { page, userState } = createPage(undefined, [101]);

    await page.addFavoritesToSelectedBox();
    expect(userState.saveCharacterBox).not.toHaveBeenCalled();

    page.selectBox('box-1');
    await page.addFavoritesToSelectedBox();
    expect(userState.saveCharacterBox).not.toHaveBeenCalled();
  });

  it('switches between list and compact display modes', () => {
    const { page } = createPage();

    page.setDisplayMode('compact');
    expect(page.displayMode()).toBe('compact');
    expect(page.isCompactDisplayMode()).toBe(true);

    page.setDisplayMode('list');
    expect(page.displayMode()).toBe('list');
    expect(page.isCompactDisplayMode()).toBe(false);
  });

  it('toggles favorites through user state and updates card view state', async () => {
    const { page, userState } = createPage(undefined, [101]);

    page.selectBox('box-1');
    page.characters.set([
      createCharacter(101, 'Favorite Character'),
      createCharacter(202, 'Regular Character'),
    ]);

    expect(page.characterCardViews().find((card) => card.character.id === 101)?.isFavorite).toBe(
      true,
    );
    expect(page.characterCardViews().find((card) => card.character.id === 202)?.isFavorite).toBe(
      false,
    );

    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event;

    await page.toggleFavorite(202, event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(userState.toggleFavorite).toHaveBeenCalledWith(202);
    expect(page.isFavorite(202)).toBe(true);
    expect(page.characterCardViews().find((card) => card.character.id === 202)?.isFavorite).toBe(
      true,
    );
  });

  it('keeps box membership actions working in compact mode', async () => {
    const { page } = createPage();

    page.selectBox('box-1');
    page.setDisplayMode('compact');

    await page.toggleCharacterMembership(202);

    expect(page.selectedBox()?.characterIds).toEqual([202, 101]);
  });

  it('filters the search query through repository lookups', async () => {
    const { page, characterCatalogCache } = createPage();

    await page.onSearchChange({
      detail: {
        value: 'Luffy',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: 'Luffy',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      excludedCharacterIds: undefined,
      limit: 48,
      offset: 0,
    });
  });

  it('limits repository lookups to favorites when the favorites filter is active', async () => {
    const { page, characterCatalogCache } = createPage(undefined, [101, 303]);

    await page.onFavoriteFilterChange({
      detail: {
        value: 'favorites',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: [101, 303],
      limit: 48,
      offset: 0,
    });
  });

  it('limits repository lookups to characters already in the selected box', async () => {
    const { page, characterCatalogCache } = createPage();

    page.selectBox('box-1');
    await page.onMembershipFilterChange({
      detail: {
        value: 'inBox',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: [101],
      excludedCharacterIds: undefined,
      limit: 48,
      offset: 0,
    });
  });

  it('excludes characters already in the selected box when the outside-box filter is active', async () => {
    const { page, characterCatalogCache } = createPage();

    page.selectBox('box-1');
    await page.onMembershipFilterChange({
      detail: {
        value: 'notInBox',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      excludedCharacterIds: [101],
      limit: 48,
      offset: 0,
    });
  });

  it('intersects the favorites filter with the in-box filter', async () => {
    const { page, characterCatalogCache } = createPage(undefined, [101, 303]);

    page.selectBox('box-1');
    await page.onFavoriteFilterChange({
      detail: {
        value: 'favorites',
      },
    } as CustomEvent<{ value?: string | null }>);
    await page.onMembershipFilterChange({
      detail: {
        value: 'inBox',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: [101],
      excludedCharacterIds: undefined,
      limit: 48,
      offset: 0,
    });
  });

  it('clears the favorites filter together with the rest of the filters', async () => {
    const { page, characterCatalogCache } = createPage(undefined, [101]);

    await page.onFavoriteFilterChange({
      detail: {
        value: 'favorites',
      },
    } as CustomEvent<{ value?: string | null }>);
    await page.onSearchChange({
      detail: {
        value: 'Luffy',
      },
    } as CustomEvent<{ value?: string | null }>);
    await page.onMembershipFilterChange({
      detail: {
        value: 'notInBox',
      },
    } as CustomEvent<{ value?: string | null }>);
    await page.clearFilters();

    expect(page.selectedFavoriteFilter()).toBe('all');
    expect(page.selectedMembershipFilter()).toBe('all');
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      allowedCharacterIds: undefined,
      excludedCharacterIds: undefined,
      limit: 48,
      offset: 0,
    });
  });

  it('keeps the expected empty-state copy and editor actions in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/character-boxes/character-boxes.page.html'),
      'utf8',
    );

    expect(template).toContain("t('empty.noBoxes.title')");
    expect(template).toContain("t('empty.selectBox.title')");
    expect(template).toContain("t('empty.noCharacters.title')");
    expect(template).toContain("t('editor.delete')");
    expect(template).toContain("t('editor.addFavorites'");
    expect(template).toContain("t('filters.favoritesPlaceholder')");
    expect(template).toContain("t('filters.membershipPlaceholder')");
    expect(template).toContain("t('displayMode.compact')");
    expect(template).toContain("toggleFavorite(card.character.id, $event)");
  });
});

function createPage(
  initialBoxes: Array<{
    id: string;
    name: string;
    characterIds: number[];
    createdAt: string;
    updatedAt: string;
  }> = [
    {
      id: 'box-1',
      name: 'Box 1',
      characterIds: [101],
      createdAt: '2026-04-14T10:00:00.000Z',
      updatedAt: '2026-04-14T10:05:00.000Z',
    },
  ],
  favoriteIds: number[] = [],
) {
  const boxes = signal(initialBoxes);
  const favoriteCharacterIds = signal(favoriteIds);
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    characterBoxes: boxes,
    favoriteCharacterIds,
    toggleFavorite: vi.fn().mockImplementation(async (characterId: number) => {
      favoriteCharacterIds.set(
        favoriteCharacterIds().includes(characterId)
          ? favoriteCharacterIds().filter((value) => value !== characterId)
          : [characterId, ...favoriteCharacterIds()],
      );
    }),
    saveCharacterBox: vi.fn().mockImplementation(async (input: { id?: string; name: string; characterIds: number[] }) => {
      const nextBox = {
        id: input.id ?? 'box-1',
        name: input.name.trim(),
        characterIds: [...new Set(input.characterIds)],
        createdAt: '2026-04-14T10:00:00.000Z',
        updatedAt: '2026-04-14T10:10:00.000Z',
      };

      boxes.set(
        input.id
          ? boxes().map((box) => (box.id === input.id ? nextBox : box))
          : [nextBox, ...boxes()],
      );

      return nextBox;
    }),
    deleteCharacterBox: vi.fn().mockImplementation(async (boxId: string) => {
      boxes.set(boxes().filter((box) => box.id !== boxId));
    }),
    getCharacterBoxById: vi.fn((boxId: string) => boxes().find((box) => box.id === boxId) ?? null),
  };
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      characterCount: 100,
      availableTypes: ['DEX', 'STR'],
      availableClasses: ['Fighter', 'Slasher'],
    }),
  };
  const characterCatalogCache = {
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    queryCharacters: vi.fn().mockReturnValue([]),
  };
  const i18n = {
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key === 'defaults.boxName') {
        return `Box ${params?.['count'] ?? 1}`;
      }

      return key;
    }),
  };
  const page = new CharacterBoxesPage(
    repository as never,
    characterCatalogCache as never,
    userState as never,
    i18n as never,
  );

  return { page, repository, characterCatalogCache, userState };
}

function createCharacter(id: number, name = `Character ${id}`) {
  return {
    id,
    name,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 6,
    cost: 55,
    combo: 4,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 3000, atk: 1500, rcv: 300 },
      growth: 1,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: true,
      fullTransparent: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
      fullTransparent: null,
    },
    imageUrl: `/characters/${id}.png`,
  };
}

import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type AbilityFilterTagSet,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { CharacterBoxesPage } from './character-boxes.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
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

  it('refreshes the current list after adding a favorite while hide favorites is active', async () => {
    const { page, repository } = createPage();

    await page.onFavoriteFilterChange({
      detail: {
        value: 'hideFavorites',
      },
    } as CustomEvent<{ value?: string | null }>);
    repository.searchDetailedCharacters.mockClear();

    await page.toggleFavorite(202, {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event);

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: [202],
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('keeps box membership actions working in compact mode', async () => {
    const { page } = createPage();

    page.selectBox('box-1');
    page.setDisplayMode('compact');

    await page.toggleCharacterMembership(202);

    expect(page.selectedBox()?.characterIds).toEqual([202, 101]);
  });

  it('filters the search query through repository lookups', async () => {
    const { page, repository } = createPage();

    await page.onSearchChange({
      detail: {
        value: 'Luffy',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: 'Luffy',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('applies type and class suggestion selections to repository lookups', async () => {
    const { page, repository } = createPage();

    await page.onTypeQueryChange('de');
    expect(page.typeQuery()).toBe('de');

    await page.applyTypeFilter('DEX');
    await page.applyClassFilter('Fighter');

    expect(page.typeQuery()).toBe('DEX');
    expect(page.classQuery()).toBe('Fighter');
    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: ['DEX'],
      selectedTypesMatchMode: 'any',
      selectedClasses: ['Fighter'],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('limits repository lookups to favorites when the favorites filter is active', async () => {
    const { page, repository } = createPage(undefined, [101, 303]);

    await page.onFavoriteFilterChange({
      detail: {
        value: 'favorites',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: [101, 303],
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('excludes favorites when the hide favorites filter is active', async () => {
    const { page, repository } = createPage(undefined, [101, 303]);

    await page.onFavoriteFilterChange({
      detail: {
        value: 'hideFavorites',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: [101, 303],
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('limits repository lookups to characters already in the selected box', async () => {
    const { page, repository } = createPage();

    page.selectBox('box-1');
    await page.onMembershipFilterChange({
      detail: {
        value: 'inBox',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: [101],
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('excludes characters already in the selected box when the outside-box filter is active', async () => {
    const { page, repository } = createPage();

    page.selectBox('box-1');
    await page.onMembershipFilterChange({
      detail: {
        value: 'notInBox',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: [101],
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('intersects the favorites filter with the in-box filter', async () => {
    const { page, repository } = createPage(undefined, [101, 303]);

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

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: [101],
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('combines the hide favorites filter with the in-box filter', async () => {
    const { page, repository } = createPage(undefined, [101, 303]);

    page.selectBox('box-1');
    await page.onFavoriteFilterChange({
      detail: {
        value: 'hideFavorites',
      },
    } as CustomEvent<{ value?: string | null }>);
    await page.onMembershipFilterChange({
      detail: {
        value: 'inBox',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: [101],
      excludedCharacterIds: [101, 303],
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('passes the selected sort mode to repository searches', async () => {
    const { page, repository } = createPage();

    await page.onSortModeChange({
      detail: {
        value: 'nameAsc',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(page.selectedSortMode()).toBe('nameAsc');
    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: undefined,
      sortMode: 'nameAsc',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('passes the selected ID order to repository searches', async () => {
    const { page, repository } = createPage();

    await page.onIdOrderChange({
      detail: {
        value: 'oldest',
      },
    } as CustomEvent<{ value?: string | null }>);

    expect(page.selectedIdOrder()).toBe('oldest');
    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'oldest',
      limit: 48,
      offset: 0,
    });
  });

  it('passes cost range filters to repository searches', async () => {
    const { page, repository } = createPage();

    await page.onCostRangeChange('min', {
      detail: {
        value: '20',
      },
    } as CustomEvent<{ value?: string | number | null }>);
    await page.onCostRangeChange('max', {
      detail: {
        value: '60',
      },
    } as CustomEvent<{ value?: string | number | null }>);

    expect(page.costRange()).toEqual({ min: 20, max: 60 });
    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      costRange: { min: 20, max: 60 },
      limit: 48,
      offset: 0,
    });
  });

  it('shows tag-set requirement counts per category as count-only rail items', () => {
    const { page } = createPage();

    page.abilityCatalog.set({ abilities: createMixedCatalogAbilities() } as never);
    page.tagSetSelection.set({
      operator: 'all',
      sets: [
        createTagSet('set-1', 'any', [
          createRequirement('boost_orb', {
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          }),
          createRequirement('remove_bind'),
        ]),
        createTagSet('set-2', 'all', [createRequirement('crewmate_recover_paralysis')]),
      ],
    });

    expect(page.abilityFilterRailItems()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'captainAbility', count: 1, disabled: false }),
        expect.objectContaining({ category: 'special', count: 1, disabled: false }),
        expect.objectContaining({ category: 'crewmate', count: 1, disabled: false }),
        expect.objectContaining({ category: 'potential', count: 0, disabled: true }),
        expect.objectContaining({ category: 'support', count: 0, disabled: true }),
      ]),
    );
    expect(page.abilityFilterRailItems().map((item) => item.category)).toEqual([
      'captainAbility',
      'special',
      'crewmate',
      'potential',
      'support',
    ]);
  });

  it('counts every requirement of a category across all sets, not just the first set', () => {
    const { page } = createPage();

    page.abilityCatalog.set({ abilities: createMixedCatalogAbilities() } as never);
    page.tagSetSelection.set({
      operator: 'any',
      sets: [
        createTagSet('set-1', 'any', [createRequirement('remove_bind')]),
        createTagSet('set-2', 'any', [
          createRequirement('remove_bind'),
          createRequirement('boost_orb'),
        ]),
      ],
    });

    expect(page.abilityFilterRailItems()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'special', count: 3 }),
        expect.objectContaining({ category: 'captainAbility', count: 0 }),
      ]),
    );
  });

  it('exposes the catalog sections the tag-set picker renders, in rail order', () => {
    const { page } = createPage();

    page.abilityCatalog.set({ abilities: createMixedCatalogAbilities() } as never);

    expect(page.abilityTagSetSections()).toEqual([
      expect.objectContaining({
        category: 'captainAbility',
        label: 'filters.captainAbility.eyebrow',
        captainAbility: true,
      }),
      expect.objectContaining({ category: 'special', label: 'filters.special.eyebrow' }),
      expect.objectContaining({ category: 'crewmate', label: 'filters.crewmate.eyebrow' }),
    ]);
  });

  it('opens the one tag-set picker from any rail chip', () => {
    const { page } = createPage();

    page.openAbilityFilterCategory('special');
    expect(page.abilityTagSetPickerOpen()).toBe(false);

    page.abilityCatalog.set({ abilities: createMixedCatalogAbilities() } as never);

    page.openAbilityFilterCategory('crewmate');
    expect(page.abilityTagSetPickerOpen()).toBe(true);

    page.closeAbilityTagSetPicker();
    expect(page.abilityTagSetPickerOpen()).toBe(false);
  });

  it('filters character box searches with the saved tag-set selection', async () => {
    const { page, repository } = createPage();

    page.abilityCatalog.set({
      abilities: [
        createAbilityCatalogItem({
          key: 'boost_orb',
          label: 'Boost Orb',
          availableSources: ['captainAbility', 'specialText'],
          matchingCharacterIds: [101, 202, 303],
          captainAbilityMatchingCharacterIds: [202],
        }),
      ],
    } as never);

    const selection = {
      operator: 'all' as const,
      sets: [
        createTagSet('set-1', 'any', [
          createRequirement('boost_orb', {
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          }),
        ]),
      ],
    };

    await page.saveAbilityTagSetPicker(selection);

    expect(page.abilityTagSetPickerOpen()).toBe(false);
    expect(page.tagSetSelection()).toEqual(selection);
    // Cloned on save, so the host never shares mutable state with the modal.
    expect(page.tagSetSelection().sets[0]).not.toBe(selection.sets[0]);
    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: [202],
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('unions the ids of a set whose tags are joined with any', async () => {
    const { page, repository } = createPage();

    page.abilityCatalog.set({ abilities: createMixedCatalogAbilities() } as never);

    await page.saveAbilityTagSetPicker({
      operator: 'all',
      sets: [
        createTagSet('set-1', 'any', [
          createRequirement('remove_bind'),
          createRequirement('crewmate_recover_paralysis'),
        ]),
      ],
    });

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedCharacterIds: [303, 404] }),
    );
  });

  it('clears an ability filter category from every set and reloads results', async () => {
    const { page, repository } = createPage();

    page.abilityCatalog.set({ abilities: createMixedCatalogAbilities() } as never);
    page.tagSetSelection.set({
      operator: 'all',
      sets: [
        createTagSet('set-1', 'any', [
          createRequirement('remove_bind'),
          createRequirement('crewmate_recover_paralysis'),
        ]),
        createTagSet('set-2', 'any', [createRequirement('remove_despair')]),
      ],
    });

    await page.clearAbilityFilterCategory('special');

    // Set 2 held only Specials, so clearing the category drops the whole set.
    expect(page.tagSetSelection().sets).toEqual([
      expect.objectContaining({
        id: 'set-1',
        requirements: [expect.objectContaining({ abilityKey: 'crewmate_recover_paralysis' })],
      }),
    ]);
    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedCharacterIds: [404] }),
    );
  });

  it('keeps captain-scoped tags out of the special category count and clear', async () => {
    const { page } = createPage();

    page.abilityCatalog.set({ abilities: createMixedCatalogAbilities() } as never);
    page.tagSetSelection.set({
      operator: 'all',
      sets: [
        createTagSet('set-1', 'any', [
          createRequirement('boost_orb', {
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          }),
        ]),
      ],
    });

    await page.clearAbilityFilterCategory('special');

    expect(page.tagSetSelection().sets).toHaveLength(1);

    await page.clearAbilityFilterCategory('captainAbility');

    expect(page.tagSetSelection().sets).toEqual([]);
  });

  it('selects every filtered character across result pages into the selected box', async () => {
    const favoriteIds = [1000, 1001, 202];
    const { page, repository, userState } = createPage(undefined, favoriteIds);
    const firstPage = Array.from({ length: 500 }, (_, index) =>
      createCharacter(1000 + index, `Filtered ${index}`),
    );
    const secondPage = [createCharacter(202), createCharacter(1000)];

    page.selectBox('box-1');
    page.searchTerm.set('Luffy');
    page.selectedType.set('DEX');
    page.selectedClass.set('Fighter');
    page.selectedFavoriteFilter.set('favorites');
    page.selectedMembershipFilter.set('notInBox');
    page.selectedSortMode.set('nameAsc');
    page.selectedIdOrder.set('oldest');
    page.costRange.set({ min: 20, max: 60 });
    repository.searchDetailedCharacters
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);

    await page.selectAllFilteredCharacters();

    expect(repository.searchDetailedCharacters).toHaveBeenNthCalledWith(1, {
      searchTerm: 'Luffy',
      selectedTypes: ['DEX'],
      selectedTypesMatchMode: 'any',
      selectedClasses: ['Fighter'],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: favoriteIds,
      excludedCharacterIds: [101],
      sortMode: 'nameAsc',
      idOrder: 'oldest',
      costRange: { min: 20, max: 60 },
      limit: 500,
      offset: 0,
    });
    expect(repository.searchDetailedCharacters).toHaveBeenNthCalledWith(2, {
      searchTerm: 'Luffy',
      selectedTypes: ['DEX'],
      selectedTypesMatchMode: 'any',
      selectedClasses: ['Fighter'],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: favoriteIds,
      excludedCharacterIds: [101],
      sortMode: 'nameAsc',
      idOrder: 'oldest',
      costRange: { min: 20, max: 60 },
      limit: 500,
      offset: 500,
    });
    expect(userState.saveCharacterBox).toHaveBeenCalledOnce();

    const savedInput = userState.saveCharacterBox.mock.calls[0]?.[0];

    expect(savedInput).toMatchObject({
      id: 'box-1',
      name: 'Box 1',
    });
    expect(savedInput?.characterIds).toHaveLength(502);
    expect(new Set(savedInput?.characterIds).size).toBe(savedInput?.characterIds.length);
    expect(savedInput?.characterIds).toEqual(expect.arrayContaining([101, 1000, 1499, 202]));
    expect(page.selectedBox()?.characterIds).toEqual(savedInput?.characterIds);
  });

  it('selects all filtered characters using ability-constrained result pages', async () => {
    const { page, repository, userState } = createPage();

    page.selectBox('box-1');
    page.abilityCatalog.set({
      abilities: [
        createAbilityCatalogItem({
          key: 'boost_orb',
          label: 'Boost Orb',
          availableSources: ['captainAbility', 'specialText'],
          matchingCharacterIds: [202, 303],
          captainAbilityMatchingCharacterIds: [202],
        }),
        createAbilityCatalogItem({
          key: 'remove_bind',
          label: 'Remove Bind',
          availableSources: ['specialText'],
          matchingCharacterIds: [202, 404],
        }),
      ],
    } as never);
    // One set per constraint, joined with `all`, so the captain and special
    // matches intersect down to the single character that has both.
    page.tagSetSelection.set({
      operator: 'all',
      sets: [
        createTagSet('set-1', 'any', [
          createRequirement('boost_orb', {
            slotScope: 'leader',
            sourceScope: 'captainAbility',
          }),
        ]),
        createTagSet('set-2', 'any', [createRequirement('remove_bind')]),
      ],
    });
    repository.searchDetailedCharacters.mockResolvedValueOnce([createCharacter(202)]);

    await page.selectAllFilteredCharacters();

    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: [202],
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 500,
      offset: 0,
    });
    expect(userState.saveCharacterBox).toHaveBeenCalledWith({
      id: 'box-1',
      name: 'Box 1',
      characterIds: [101, 202],
    });
  });

  it('blocks selecting all filtered characters when the cost range is invalid', async () => {
    const { page, userState } = createPage();

    page.selectBox('box-1');
    await page.onCostRangeChange('min', {
      detail: {
        value: '60',
      },
    } as CustomEvent<{ value?: string | number | null }>);
    await page.onCostRangeChange('max', {
      detail: {
        value: '20',
      },
    } as CustomEvent<{ value?: string | number | null }>);
    userState.saveCharacterBox.mockClear();

    expect(page.hasInvalidCostRange()).toBe(true);
    expect(page.costRangeValidationMessage()).toBe('filters.cost.invalidRange');
    expect(page.canSelectAllFilteredCharacters()).toBe(false);

    await page.selectAllFilteredCharacters();

    expect(userState.saveCharacterBox).not.toHaveBeenCalled();
  });

  it('clears the favorites filter together with the rest of the filters', async () => {
    const { page, repository } = createPage(undefined, [101]);

    page.abilityCatalog.set({ abilities: createMixedCatalogAbilities() } as never);
    page.tagSetSelection.set({
      operator: 'any',
      sets: [createTagSet('set-1', 'any', [createRequirement('remove_bind')])],
    });
    page.abilityTagSetPickerOpen.set(true);
    await page.onFavoriteFilterChange({
      detail: {
        value: 'hideFavorites',
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
    await page.onSortModeChange({
      detail: {
        value: 'nameDesc',
      },
    } as CustomEvent<{ value?: string | null }>);
    await page.onIdOrderChange({
      detail: {
        value: 'oldest',
      },
    } as CustomEvent<{ value?: string | null }>);
    await page.onCostRangeChange('min', {
      detail: {
        value: '20',
      },
    } as CustomEvent<{ value?: string | number | null }>);
    await page.onCostRangeChange('max', {
      detail: {
        value: '60',
      },
    } as CustomEvent<{ value?: string | number | null }>);
    await page.clearFilters();

    expect(page.typeQuery()).toBe('');
    expect(page.classQuery()).toBe('');
    expect(page.selectedType()).toBe('');
    expect(page.selectedClass()).toBe('');
    expect(page.selectedFavoriteFilter()).toBe('all');
    expect(page.selectedMembershipFilter()).toBe('all');
    expect(page.selectedSortMode()).toBe('catalog');
    expect(page.selectedIdOrder()).toBe('newest');
    expect(page.costRange()).toEqual({ min: null, max: null });
    expect(page.tagSetSelection()).toEqual({ operator: 'all', sets: [] });
    expect(page.abilityTagSetPickerOpen()).toBe(false);
    expect(repository.searchDetailedCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds: undefined,
      excludedCharacterIds: undefined,
      sortMode: 'catalog',
      idOrder: 'newest',
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
    expect(template).toContain("t('editor.selectAllFiltered'");
    expect(template).toContain('selectAllFilteredCharacters()');
    expect(template).toContain('<app-ability-filter-rail');
    expect(template).toContain('abilityFilterRailItems()');
    expect(template).toContain('openAbilityFilterCategory($event)');
    expect(template).toContain('clearAbilityFilterCategory($event)');
    expect(template).toContain('<app-ability-tag-set-picker');
    expect(template).toContain('[isOpen]="abilityTagSetPickerOpen()"');
    expect(template).toContain('[sections]="abilityTagSetSections()"');
    expect(template).toContain('[selection]="tagSetSelection()"');
    expect(template).toContain("t('filters.abilityTagSets.title')");
    expect(template).toContain('closeAbilityTagSetPicker()');
    expect(template).toContain('saveAbilityTagSetPicker($event)');
    // The five per-category pickers collapsed into the single tag-set modal.
    expect(template).not.toContain('<app-ability-requirement-picker');
    expect(template).not.toContain('<app-special-ability-picker');
    expect(template).not.toContain('captainAbilityPickerOpen()');
    expect(template).not.toContain('specialAbilityPickerOpen()');
    expect(template).not.toContain('crewmateAbilityPickerOpen()');
    expect(template).not.toContain('potentialAbilityPickerOpen()');
    expect(template).not.toContain('supportAbilityPickerOpen()');
    expect(template).toContain('<app-character-filter-row');
    expect(template).toContain("t('filters.typeLabel')");
    expect(template).toContain("t('filters.classLabel')");
    expect(template).toContain("t('filters.favoritesPlaceholder')");
    expect(template).toContain('favoriteFilterOptions()');
    expect(template).toContain("t('filters.membershipPlaceholder')");
    expect(template).toContain('membershipFilterOptions()');
    expect(template).toContain("t('filters.cost.from')");
    expect(template).toContain("t('filters.cost.to')");
    expect(template).toContain('costRangeValidationMessage()');
    expect(template).toContain('onCostRangeChange($event.bound, $event.value)');
    expect(template).toContain("t('sort.placeholder')");
    expect(template).toContain('selectedSortMode()');
    expect(template).toContain('onSortModeChange($event)');
    expect(template).toContain("t('idOrder.label')");
    expect(template).toContain('selectedIdOrder()');
    expect(template).toContain('onIdOrderChange($event)');
    expect(template).not.toContain('value="idDesc"');
    expect(template).not.toContain('value="idAsc"');
    expect(template).toContain("t('displayMode.compact')");
    expect(template).toContain('toggleFavorite(card.character.id, $event)');
    expect(template).toContain('[routerLink]="getCharacterDetailLink(card.character)"');
    expect(template).toContain('character-detail-thumb-link');
    expect(template).toContain('character-detail-name-link');
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
    readyCharacterBoxes: vi.fn().mockResolvedValue(undefined),
    readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
    characterBoxes: boxes,
    favoriteCharacterIds,
    toggleFavorite: vi.fn().mockImplementation(async (characterId: number) => {
      favoriteCharacterIds.set(
        favoriteCharacterIds().includes(characterId)
          ? favoriteCharacterIds().filter((value) => value !== characterId)
          : [characterId, ...favoriteCharacterIds()],
      );
    }),
    saveCharacterBox: vi
      .fn()
      .mockImplementation(async (input: { id?: string; name: string; characterIds: number[] }) => {
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
      schemaVersion: 1,
      characterCount: 100,
      availableTypes: ['DEX', 'STR'],
      availableClasses: ['Fighter', 'Slasher'],
    }),
    getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue(null),
    searchDetailedCharacters: vi.fn().mockResolvedValue([]),
  };
  const i18n = {
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key === 'defaults.boxName') {
        return `Box ${params?.['count'] ?? 1}`;
      }

      return key;
    }),
  };
  const page = new CharacterBoxesPage(repository as never, userState as never, i18n as never);

  return { page, repository, userState };
}

function createCharacter(id: number, name = `Character ${id}`) {
  return {
    id,
    name,
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 1,
    captainAtkBoost: 1,
    captainAverageBoost: 1,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 3000, atk: 1500, rcv: 300 },
      growth: 1,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: true,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: `/characters/${id}.png`,
    detail: {
      builderAbilities: [],
    },
    detailImageUrl: `/characters/${id}-detail.png`,
  } as unknown as CharacterDetailRecord;
}

function createTagSet(
  id: string,
  operator: 'all' | 'any',
  requirements: AutoBuildAbilityRequirement[],
): AbilityFilterTagSet {
  return { id, operator, requirements };
}

function createRequirement(
  abilityKey: string,
  overrides: Partial<AutoBuildAbilityRequirement> = {},
): AutoBuildAbilityRequirement {
  return {
    abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
    slotScope: 'any',
    ...overrides,
  };
}

/**
 * One ability per rail category that the page can actually resolve: a
 * captain-sourced key, a Special key and a Crewmate key. Potential and Support
 * stay absent so the disabled-chip path keeps its coverage.
 */
function createMixedCatalogAbilities() {
  return [
    createAbilityCatalogItem({
      key: 'boost_orb',
      label: 'Boost Orb',
      availableSources: ['captainAbility'],
      matchingCharacterIds: [101],
      captainAbilityMatchingCharacterIds: [202],
    }),
    createAbilityCatalogItem({
      key: 'remove_bind',
      label: 'Remove Bind',
      availableSources: ['specialText'],
      matchingCharacterIds: [303],
    }),
    createAbilityCatalogItem({
      key: 'remove_despair',
      label: 'Remove Despair',
      availableSources: ['specialText'],
      matchingCharacterIds: [505],
    }),
    createAbilityCatalogItem({
      key: 'crewmate_recover_paralysis',
      label: 'Recover Paralysis',
      category: 'crewmate',
      availableSources: ['sailorAbilities'],
      matchingCharacterIds: [404],
    }),
  ];
}

function createAbilityCatalogItem(
  overrides: Partial<{
    key: string;
    label: string;
    category: 'special' | 'crewmate' | 'potential' | 'support' | 'legacy';
    supportsTurns: boolean;
    supportsSlotTokens: boolean;
    availableSlotTokens: string[];
    availableSources: Array<
      | 'specialText'
      | 'superSpecialText'
      | 'captainAbility'
      | 'sailorAbilities'
      | 'potentialAbilities'
      | 'supportData'
      | 'superTandemData'
      | 'finalTapData'
      | 'rushSugoSpecialData'
    >;
    matchCount: number;
    matchingCharacterIds: number[];
    captainAbilityMatchingCharacterIds: number[];
    sampleCharacterIds: number[];
    sampleTexts: string[];
  }> & { key: string; label: string },
) {
  return {
    category: 'special',
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: 1,
    matchingCharacterIds: [],
    sampleCharacterIds: [],
    sampleTexts: [],
    ...overrides,
  };
}

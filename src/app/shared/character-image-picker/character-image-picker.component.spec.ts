import '@angular/compiler';
import { SimpleChange, signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type AbilityFilterTagSetSelection,
  type AbilityTagSetOperator,
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterFacetSelection,
  type CharacterTagSetSelection,
} from '../../core/models/optc.models';
import { matchesCharacterFacet } from '../../core/services/character-facet-filter.utils';
import {
  createCharacterTagSet,
  createEmptyCharacterTagSetSelection,
} from '../../core/services/character-tag-set.utils';
import { CharacterImagePickerComponent } from './character-image-picker.component';

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
  IonToolbar: class {},
}));

describe('CharacterImagePickerComponent', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('loads the manifest and the first page when the modal opens', async () => {
    const { component, repository, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    expect(repository.getDatasetManifest).toHaveBeenCalledOnce();
    expect(characterCatalogCache.queryCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
    expect(component.characters()).toHaveLength(48);
    expect(component.hasMore()).toBe(true);
  });

  it('logs the modal name when it opens', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { component } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    expect(consoleLogSpy).toHaveBeenCalledWith('[Modal Open] CharacterImagePickerComponent');
  });

  it('reloads the catalog when search and filters change', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.onSearchChange({
      detail: { value: 'Luffy' },
    } as CustomEvent<{ value?: string | null }>);
    await component.onTypeFacetChange({ values: ['DEX'], matchMode: 'any' });
    await component.onClassFacetChange({ values: ['Fighter'], matchMode: 'any' });

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: 'Luffy',
      typeFacet: { values: ['DEX'], matchMode: 'any' },
      classFacet: { values: ['Fighter'], matchMode: 'any' },
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
    expect(component.characters().every((character) => character.name.includes('Luffy'))).toBe(
      true,
    );
  });

  it('loads more characters without resetting the existing page', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    expect(component.characters()).toHaveLength(48);

    await component.loadMore();

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 48,
    });
    expect(component.characters()).toHaveLength(72);
    expect(component.hasMore()).toBe(false);
  });

  it('emits the selected character when the user confirms the choice', async () => {
    const { component } = createComponent();
    const emitSpy = vi.fn();

    component.isOpen = true;
    component.saveSelection.subscribe(emitSpy);
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    component.selectCharacter(component.characters()[1]!);
    component.save();

    expect(emitSpy).toHaveBeenCalledWith(component.characters()[1]);
  });

  it('updates the footer action label to the selected character name', async () => {
    const { component } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    expect(component.selectedCharacterActionLabel()).toBe('');

    component.selectCharacter(component.characters()[1]!);

    expect(component.selectedCharacter()).toEqual(component.characters()[1]);
    expect(component.selectedCharacterActionLabel()).toBe(component.characters()[1]!.name);
  });

  it('reloads the catalog when the sort mode changes', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.onSortModeChange({
      detail: { value: 'captainAtkBoost' },
    } as CustomEvent<{ value?: string | null }>);

    expect(component.selectedSortMode()).toBe('captainAtkBoost');
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'captainAtkBoost',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
  });

  it('reloads the catalog when the ID order changes', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.onIdOrderChange({
      detail: { value: 'oldest' },
    } as CustomEvent<{ value?: string | null }>);

    expect(component.selectedIdOrder()).toBe('oldest');
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'oldest',
      limit: 48,
      offset: 0,
    });
  });

  it('filters the picker by favorites and hidden favorites', async () => {
    const { component, characterCatalogCache } = createComponent({ favoriteIds: [1, 3] });

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.toggleFavoritesOnly();

    expect(component.favoritesOnly()).toBe(true);
    expect(component.hideFavorites()).toBe(false);
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
      allowedCharacterIds: [1, 3],
    });
    expect(component.characters().map((character) => character.id)).toEqual([1, 3]);

    await component.toggleHideFavorites();

    expect(component.favoritesOnly()).toBe(false);
    expect(component.hideFavorites()).toBe(true);
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
      excludedCharacterIds: [1, 3],
    });
    expect(component.characters().some((character) => [1, 3].includes(character.id))).toBe(false);
  });

  it('counts rail chips per category from the one tag-set selection', async () => {
    const { component } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    expect(component.abilityFilterCategoryCount('special')).toBe(0);

    await component.saveTagSetSelection(
      buildSelection('all', [
        ['all', ['special-a', 'crewmate-a']],
        ['any', ['special-b']],
      ]),
    );

    expect(component.abilityFilterCategoryCount('special')).toBe(2);
    expect(component.abilityFilterCategoryCount('crewmate')).toBe(1);
    expect(component.abilityFilterCategoryCount('potential')).toBe(0);
    expect(component.abilityFilterCategoryCount('support')).toBe(0);
  });

  it('opens the single tag-set picker from any rail chip', async () => {
    const { component } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    component.openTagSetPicker();

    expect(component.tagSetPickerOpen()).toBe(true);

    component.closeTagSetPicker();

    expect(component.tagSetPickerOpen()).toBe(false);

    component.applyingSelection = true;
    component.openTagSetPicker();

    expect(component.tagSetPickerOpen()).toBe(false);
  });

  it('stores the saved tag-set selection and closes the picker', async () => {
    const { component } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    component.openTagSetPicker();
    await component.saveTagSetSelection(buildSelection('all', [['all', ['special-a']]]));

    expect(component.tagSetPickerOpen()).toBe(false);
    expect(component.tagSetSelection().sets).toHaveLength(1);
    expect(component.tagSetSelection().sets[0]?.requirements.map((r) => r.abilityKey)).toEqual([
      'special-a',
    ]);
  });

  it('filters the catalog through the tag-set resolver', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.saveTagSetSelection(
      buildSelection('all', [['all', ['special-a', 'crewmate-a']]]),
    );

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
      allowedCharacterIds: [2, 3, 4],
    });
    expect(component.characters().map((character) => character.id)).toEqual([2, 3, 4]);

    await component.saveTagSetSelection(
      buildSelection('all', [['any', ['special-a', 'crewmate-a']]]),
    );

    expect(component.characters().map((character) => character.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('clears one category from every set and drops the sets left empty', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.saveTagSetSelection(
      buildSelection('all', [
        ['all', ['special-a', 'crewmate-a']],
        ['any', ['crewmate-a']],
      ]),
    );

    expect(component.tagSetSelection().sets).toHaveLength(2);

    await component.clearAbilityFilterCategory('crewmate');

    expect(component.abilityFilterCategoryCount('crewmate')).toBe(0);
    expect(component.abilityFilterCategoryCount('special')).toBe(1);
    expect(component.tagSetSelection().sets).toHaveLength(1);
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
      allowedCharacterIds: [1, 2, 3, 4],
    });
  });

  it('keeps a stable catalog identity so the ability index stays cached', async () => {
    const { component } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    expect(component.allCatalogItems()).toBe(component.allCatalogItems());
    expect(component.allCatalogItems()).toHaveLength(4);
  });

  it('narrows the catalog through the character-tag filter', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.onCharacterTagFilterChange({
      selection: buildCharacterTagSelection([['any', ['Straw Hat Pirates']]]),
      matchingCharacterIds: [2, 5, 9],
    });

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
      allowedCharacterIds: [2, 5, 9],
    });
    expect(component.characters().map((character) => character.id)).toEqual([2, 5, 9]);
  });

  it('intersects the character-tag filter with the ability tag-set filter', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.saveTagSetSelection(
      buildSelection('all', [['all', ['special-a', 'crewmate-a']]]),
    );
    await component.onCharacterTagFilterChange({
      selection: buildCharacterTagSelection([['any', ['Straw Hat Pirates']]]),
      matchingCharacterIds: [3, 4, 9],
    });

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowedCharacterIds: [3, 4] }),
    );
    expect(component.characters().map((character) => character.id)).toEqual([3, 4]);
  });

  it('applies no gate when the character-tag selection is empty', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.onCharacterTagFilterChange({
      selection: createEmptyCharacterTagSetSelection(),
      matchingCharacterIds: undefined,
    });

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
    expect(component.characters()).toHaveLength(48);
  });

  it('clears the character-tag filter when the picker is reopened', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    await component.onCharacterTagFilterChange({
      selection: buildCharacterTagSelection([['any', ['Straw Hat Pirates']]]),
      matchingCharacterIds: [2, 5, 9],
    });

    expect(component.characterTagCharacterIds()).toEqual([2, 5, 9]);

    // The instance is shared by three hosts and is never destroyed between opens,
    // so a leaked selection would filter an unrelated picker with no visible cause.
    component.ngOnChanges({
      isOpen: new SimpleChange(true, true, false),
    });
    await flushPromises();

    expect(component.characterTagSetSelection().sets).toHaveLength(0);
    expect(component.characterTagCharacterIds()).toBeUndefined();
    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
    });
    expect(component.characters()).toHaveLength(48);
  });

  it('builds the very first page with the character-tag ids already applied', async () => {
    const { component, characterCatalogCache } = createComponent();

    component.characterTagCharacterIds.set([4, 6, 8]);

    await (component as unknown as { initializePicker(): Promise<void> }).initializePicker();

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 48,
      offset: 0,
      allowedCharacterIds: [4, 6, 8],
    });
    expect(component.characters().map((character) => character.id)).toEqual([4, 6, 8]);
  });

  it('renders the search, filters and confirm action in the template', () => {
    const template = readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-image-picker/character-image-picker.component.html',
      ),
      'utf8',
    );

    expect(template).toContain("t('catalog.searchPlaceholder')");
    expect(template).toContain("t('filters.type')");
    expect(template).toContain("t('filters.class')");
    expect(template).toContain('<app-character-facet-filter');
    expect(template).toContain('kind="type"');
    expect(template).toContain('kind="class"');
    expect(template).toContain('presentation="chips"');
    expect(template).toContain('presentation="select"');
    expect(template).toContain('testIdPrefix="character-image-picker"');
    expect(template).toContain('[selection]="typeFacet()"');
    expect(template).toContain('[selection]="classFacet()"');
    expect(template).toContain('[matchCount]="typeFacetMatchCount()"');
    expect(template).toContain('[matchCount]="classFacetMatchCount()"');
    expect(template).toContain('(selectionChange)="onTypeFacetChange($event)"');
    expect(template).toContain('(selectionChange)="onClassFacetChange($event)"');
    // The empty-value sentinel options are gone with the single-value selects.
    expect(template).not.toContain("t('filters.anyType')");
    expect(template).not.toContain("t('filters.anyClass')");
    expect(template).not.toContain('onTypeChange($event)');
    expect(template).not.toContain('onClassChange($event)');
    expect(template).toContain("t('sort.label')");
    expect(template).toContain('selectedSortMode()');
    expect(template).toContain('onSortModeChange($event)');
    expect(template).toContain("t('idOrder.label')");
    expect(template).toContain('selectedIdOrder()');
    expect(template).toContain('onIdOrderChange($event)');
    expect(template).toContain("t('filters.favoritesOnly')");
    expect(template).toContain('toggleFavoritesOnly()');
    expect(template).toContain("t('filters.hideFavorites')");
    expect(template).toContain('toggleHideFavorites()');
    expect(template).toContain('<app-ability-filter-rail');
    expect(template).toContain("abilityFilterCategoryCount('special')");
    expect(template).toContain("abilityFilterCategoryCount('crewmate')");
    expect(template).toContain("abilityFilterCategoryCount('potential')");
    expect(template).toContain("abilityFilterCategoryCount('support')");
    expect(template).toContain('(selectCategory)="openTagSetPicker()"');
    expect(template).toContain('clearAbilityFilterCategory($event)');
    expect(template).toContain('<app-ability-tag-set-picker');
    expect(template).toContain("t('filters.tagSetsTitle')");
    expect(template).toContain('[selection]="tagSetSelection()"');
    expect(template).toContain('(dismiss)="closeTagSetPicker()"');
    expect(template).toContain('(saveSelection)="saveTagSetSelection($event)"');
    expect(template).toContain('<app-character-tag-filter');
    expect(template).toContain('testIdPrefix="character-image-picker"');
    expect(template).toContain('[selection]="characterTagSetSelection()"');
    expect(template).toContain('(filterChange)="onCharacterTagFilterChange($event)"');
    expect(template.indexOf('<app-character-tag-filter')).toBeGreaterThan(
      template.indexOf('<app-ability-tag-set-picker'),
    );
    expect(template).toContain('items: availableSpecialAbilityCatalogItems()');
    expect(template).toContain('items: availableSupportAbilityCatalogItems()');
    expect(template).not.toContain('<app-special-ability-picker');
    expect(template).not.toContain('specialAbilityDrafts()');
    expect(template).not.toContain('supportAbilityDrafts()');
    expect(template).not.toContain("t('filters.specialTitle')");
    expect(template).not.toContain("t('filters.supportCopy')");
    expect(template).toContain('value="captainAtkBoost"');
    expect(template).not.toContain('value="idDesc"');
    expect(template).not.toContain('value="idAsc"');
    expect(template).not.toContain('character-image-picker-filter-row');
    expect(template).toContain("'character-image-picker-card-' + character.id");
    expect(template).toContain('data-testid="character-image-picker-load-more"');
    expect(template).toContain('(click)="selectCharacter(character)"');
    expect(template).toContain('(click)="loadMore()"');
    expect(template).toContain('(click)="save()"');
    expect(template).toContain("selectedCharacterActionLabel() || t('actions.useImage')");
    expect(template).not.toContain("t('eyebrow')");
    expect(template).not.toContain('{{ title }}');
    expect(template).not.toContain('{{ copy }}');
    expect(template).not.toContain("t('catalog.title')");
    expect(template).not.toContain("t('catalog.count'");
    expect(template).not.toContain("t('selected.title')");
    expect(template).not.toContain("t('selected.emptyTitle')");
  });
});

describe('CharacterImagePickerComponent type and class facet filters', () => {
  it('narrows the catalog by a selected type and applies no gate for an empty selection', async () => {
    const { component, characterCatalogCache } = await createFacetComponent();

    await component.onTypeFacetChange({ values: ['STR'], matchMode: 'any' });

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith(
      expect.objectContaining({ typeFacet: { values: ['STR'], matchMode: 'any' } }),
    );
    expect(component.characters().map((character) => character.id)).toEqual([1, 4]);

    await component.onTypeFacetChange({ values: [], matchMode: 'any' });

    const query = characterCatalogCache.queryCharacters.mock.lastCall?.[0] as Record<
      string,
      unknown
    >;

    expect(query).not.toHaveProperty('typeFacet');
    expect(component.characters().map((character) => character.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('intersects a two-value all-mode class facet instead of unioning it', async () => {
    const { component } = await createFacetComponent();

    await component.onClassFacetChange({ values: ['Fighter', 'Slasher'], matchMode: 'all' });

    expect(component.characters().map((character) => character.id)).toEqual([3]);

    await component.onClassFacetChange({ values: ['Fighter', 'Slasher'], matchMode: 'any' });

    expect(component.characters().map((character) => character.id)).toEqual([2, 3, 5]);
  });

  it('finds a dual-type character by either of its types, in either stored order', async () => {
    const { component } = await createFacetComponent();

    await component.onTypeFacetChange({ values: ['PSY'], matchMode: 'any' });

    expect(component.characters().map((character) => character.id)).toEqual([2, 5]);

    await component.onTypeFacetChange({ values: ['INT', 'PSY'], matchMode: 'all' });

    expect(component.characters().map((character) => character.id)).toEqual([2, 5]);
  });

  it('builds the very first page with the same facet fields every later page uses', async () => {
    const { component, characterCatalogCache } = await createFacetComponent();

    component.typeFacet.set({ values: ['STR'], matchMode: 'any' });
    await (component as unknown as { initializePicker(): Promise<void> }).initializePicker();

    const initialQuery = characterCatalogCache.queryCharacters.mock.lastCall?.[0] as Record<
      string,
      unknown
    >;

    // loadMore() short-circuits once a page comes back short, so drive the other
    // builder through the reload path instead.
    await component.onSearchChange({ detail: { value: '' } } as CustomEvent<{
      value?: string | null;
    }>);

    const pagedQuery = characterCatalogCache.queryCharacters.mock.lastCall?.[0] as Record<
      string,
      unknown
    >;

    // The two builders are duplicated by design; page 1 must never ignore a
    // filter that every later page honours.
    expect(initialQuery['typeFacet']).toEqual({ values: ['STR'], matchMode: 'any' });
    expect(pagedQuery['typeFacet']).toEqual({ values: ['STR'], matchMode: 'any' });
    expect(component.characters().map((character) => character.id)).toEqual([1, 4]);
  });

  it('resets both facets when the picker is reopened so a shared instance stays clean', async () => {
    const { component, characterCatalogCache } = await createFacetComponent();

    await component.onTypeFacetChange({ values: ['STR'], matchMode: 'any' });
    await component.onClassFacetChange({ values: ['Striker'], matchMode: 'any' });

    expect(component.characters().map((character) => character.id)).toEqual([1]);

    component.ngOnChanges({ isOpen: new SimpleChange(true, true, false) });
    await flushPromises();

    expect(component.typeFacet()).toEqual({ values: [], matchMode: 'any' });
    expect(component.classFacet()).toEqual({ values: [], matchMode: 'any' });

    const query = characterCatalogCache.queryCharacters.mock.lastCall?.[0] as Record<
      string,
      unknown
    >;

    expect(query).not.toHaveProperty('typeFacet');
    expect(query).not.toHaveProperty('classFacet');
    expect(component.characters().map((character) => character.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('reports a live match count per facet from the cached catalog', async () => {
    const { component } = await createFacetComponent();

    await component.onTypeFacetChange({ values: ['STR'], matchMode: 'any' });
    await component.onClassFacetChange({ values: ['Fighter', 'Slasher'], matchMode: 'all' });

    expect(component.typeFacetMatchCount()).toBe(2);
    expect(component.classFacetMatchCount()).toBe(1);
  });
});

/**
 * Five rows that make every facet failure mode observable: a dual-type pair
 * stored in BOTH orders, a two-class character, and single-class characters.
 */
function buildFacetCharacters() {
  return [
    { id: 1, type: 'STR', classes: ['Striker'] },
    { id: 2, type: 'INT,PSY', classes: ['Fighter'] },
    { id: 3, type: 'QCK', classes: ['Fighter', 'Slasher'] },
    { id: 4, type: 'STR', classes: ['Shooter'] },
    { id: 5, type: 'PSY,INT', classes: ['Slasher'] },
  ].map((character) => ({
    ...character,
    name: `Character ${character.id}`,
    primaryClass: character.classes[0] ?? '',
    secondaryClass: character.classes[1] ?? null,
    cost: 30,
    imageUrl: `assets/${character.id}.png`,
    isIncomplete: false,
  }));
}

async function createFacetComponent() {
  const created = createComponent();
  const catalog = buildFacetCharacters();

  created.characterCatalogCache.catalog.set(catalog as never);
  created.characterCatalogCache.queryCharacters.mockImplementation(
    (query: Record<string, unknown>) => {
      const typeFacet = (query['typeFacet'] ?? null) as CharacterFacetSelection | null;
      const classFacet = (query['classFacet'] ?? null) as CharacterFacetSelection | null;

      return catalog
        .filter((character) =>
          typeFacet === null ? true : matchesCharacterFacet('type', character, typeFacet),
        )
        .filter((character) =>
          classFacet === null ? true : matchesCharacterFacet('class', character, classFacet),
        );
    },
  );

  created.component.isOpen = true;
  created.component.ngOnChanges({ isOpen: new SimpleChange(false, true, true) });
  await flushPromises();

  return created;
}

function createComponent({ favoriteIds = [] }: { favoriteIds?: number[] } = {}) {
  const availableCharacters = buildCharacters();
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      generatedAt: '2026-03-30T10:00:00.000Z',
      sourceVersion: 'test',
      characterCount: availableCharacters.length,
      detailCount: availableCharacters.length,
      shipCount: 2,
      rumbleCount: 0,
      availableTypes: ['DEX', 'STR', 'PSY'],
      availableClasses: ['Fighter', 'Shooter', 'Slasher'],
      packs: [],
    }),
    getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue({
      generatedAt: '2026-03-30T10:00:00.000Z',
      sourceVersion: 'test',
      abilityCount: 4,
      abilities: [
        buildAbilityCatalogItem('special-a', 'special', [1, 2, 3, 4]),
        buildAbilityCatalogItem('special-b', 'special', [3, 4, 5]),
        buildAbilityCatalogItem('crewmate-a', 'crewmate', [2, 3, 4, 5, 6]),
        buildAbilityCatalogItem('support-a', 'support', [7]),
      ],
    }),
  };
  const characterCatalogCache = {
    catalog: signal(availableCharacters),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    queryCharacters: vi.fn().mockImplementation((query: Record<string, unknown>) => {
      const searchTerm = String(query['searchTerm'] ?? '').toLowerCase();
      const typeFacet = (query['typeFacet'] ?? null) as CharacterFacetSelection | null;
      const classFacet = (query['classFacet'] ?? null) as CharacterFacetSelection | null;
      const allowedCharacterIds = Array.isArray(query['allowedCharacterIds'])
        ? new Set(query['allowedCharacterIds'])
        : null;
      const excludedCharacterIds = new Set(
        Array.isArray(query['excludedCharacterIds']) ? query['excludedCharacterIds'] : [],
      );
      const offset = Number(query['offset'] ?? 0);
      const limit = Number(query['limit'] ?? 24);

      return availableCharacters
        .filter((character) =>
          allowedCharacterIds === null ? true : allowedCharacterIds.has(character.id),
        )
        .filter((character) => !excludedCharacterIds.has(character.id))
        .filter((character) => character.name.toLowerCase().includes(searchTerm))
        .filter((character) =>
          typeFacet === null ? true : matchesCharacterFacet('type', character, typeFacet),
        )
        .filter((character) =>
          classFacet === null ? true : matchesCharacterFacet('class', character, classFacet),
        )
        .slice(offset, offset + limit);
    }),
  };
  const userState = {
    favoriteCharacterIds: vi.fn(() => favoriteIds),
    ready: vi.fn().mockResolvedValue(undefined),
    readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
  };
  const component = new CharacterImagePickerComponent(
    repository as never,
    characterCatalogCache as never,
    userState as never,
  );

  component.title = 'Pick character image';
  component.copy = 'Choose one OPTC portrait.';

  return { component, repository, characterCatalogCache, userState };
}

function buildAbilityCatalogItem(
  key: string,
  category: AutoBuildAbilityCategory,
  matchingCharacterIds: number[],
): AutoBuildAbilityCatalogItem {
  return {
    key,
    label: key,
    category,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: matchingCharacterIds.length,
    matchingCharacterIds,
    sampleCharacterIds: matchingCharacterIds.slice(0, 1),
    sampleTexts: [],
  };
}

function buildRequirement(abilityKey: string): AutoBuildAbilityRequirement {
  return {
    abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
    slotScope: 'any',
  };
}

function buildSelection(
  operator: AbilityTagSetOperator,
  sets: [AbilityTagSetOperator, string[]][],
): AbilityFilterTagSetSelection {
  return {
    operator,
    sets: sets.map(([setOperator, abilityKeys], index) => ({
      id: `set-${index + 1}`,
      operator: setOperator,
      requirements: abilityKeys.map((abilityKey) => buildRequirement(abilityKey)),
    })),
  };
}

function buildCharacterTagSelection(
  sets: [AbilityTagSetOperator, string[]][],
  operator: AbilityTagSetOperator = 'all',
): CharacterTagSetSelection {
  return {
    operator,
    sets: sets.map(([setOperator, tags], index) =>
      createCharacterTagSet(tags, setOperator, `character-tag-set-${index + 1}`),
    ),
  };
}

/*
 * 869evz13a. Crew Forge and Saved Enemies reach the shared ability and tag
 * pickers only through this wrapper, which exposed no route to the pickers'
 * own inputs - so those pages could not be fixed "per page" at all. The
 * pass-throughs exist now; the defaults are what keep every current host
 * rendering exactly as it does today.
 */
describe('CharacterImagePickerComponent picker pass-throughs', () => {
  function readTemplate(): string {
    return readFileSync(
      resolve(
        process.cwd(),
        'src/app/shared/character-image-picker/character-image-picker.component.html',
      ),
      'utf8',
    ).replace(/\r\n/g, '\n');
  }

  it('forwards support text and the facet chip flag to the pickers it hosts', () => {
    const template = readTemplate();

    expect(template).toContain('[supportText]="abilityPickerSupportText"');
    expect(template).toContain('[pickerSupportText]="characterTagPickerSupportText"');
    expect(template).toContain('[pickerModalScopeClass]="characterTagPickerModalScopeClass"');
    // Both facet filters inside the modal, not just the first.
    expect(template.match(/\[showSelectedChips\]="showFacetSelectedChips"/gu)).toHaveLength(2);
  });

  it('defaults leave every existing host exactly as it was', () => {
    const { component } = createComponent();

    expect(component.abilityPickerSupportText).toBe('');
    expect(component.characterTagPickerSupportText).toBe('');
    // The facet filter's own default is true; opting out stays the host's call.
    expect(component.showFacetSelectedChips).toBe(true);
    // Empty scope class = the picker keeps exactly the modal class it always had.
    expect(component.characterTagPickerModalScopeClass).toBe('');
  });
});

function buildCharacters() {
  return Array.from({ length: 72 }, (_, index) => {
    const id = index + 1;
    const isLuffy = id <= 8;
    const type = id % 3 === 0 ? 'PSY' : id % 2 === 0 ? 'STR' : 'DEX';

    return {
      id,
      name: isLuffy ? `Luffy ${id}` : `Character ${id}`,
      type,
      primaryClass: id % 2 === 0 ? 'Fighter' : 'Shooter',
      secondaryClass: id % 4 === 0 ? 'Slasher' : null,
      classes: id % 4 === 0 ? ['Fighter', 'Slasher'] : ['Shooter'],
      stars: 6,
      cost: 55,
      combo: 4,
      stats: {
        min: { hp: 1000, atk: 500, rcv: 100 },
        max: { hp: 3500, atk: 1600, rcv: 320 },
        growth: 1.5,
      },
      regionAvailability: {
        exactLocal: false,
        thumbnailGlobal: true,
        thumbnailJapan: false,
      },
      assets: {
        exactLocal: null,
        thumbnailGlobal: `characters/${id}.png`,
        thumbnailJapan: null,
      },
      imageUrl: `assets/offline-packs/thumbnails-glo/characters/${id}.png`,
      captainHpBoost: id % 5,
      captainAtkBoost: id % 7,
      captainAverageBoost: id % 6,
      isIncomplete: false,
    };
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

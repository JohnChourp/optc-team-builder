import '@angular/compiler';
import { SimpleChange } from '@angular/core';
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
      typeFilter: '',
      classFilter: '',
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
    await component.onTypeChange({
      detail: { value: 'DEX' },
    } as CustomEvent<{ value?: string | null }>);
    await component.onClassChange({
      detail: { value: 'Fighter' },
    } as CustomEvent<{ value?: string | null }>);

    expect(characterCatalogCache.queryCharacters).toHaveBeenLastCalledWith({
      searchTerm: 'Luffy',
      typeFilter: 'DEX',
      classFilter: 'Fighter',
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
      typeFilter: '',
      classFilter: '',
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
      typeFilter: '',
      classFilter: '',
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
      typeFilter: '',
      classFilter: '',
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
      typeFilter: '',
      classFilter: '',
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
      typeFilter: '',
      classFilter: '',
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
      typeFilter: '',
      classFilter: '',
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
      typeFilter: '',
      classFilter: '',
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
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    queryCharacters: vi.fn().mockImplementation((query: Record<string, unknown>) => {
      const searchTerm = String(query['searchTerm'] ?? '').toLowerCase();
      const typeFilter = String(query['typeFilter'] ?? '');
      const classFilter = String(query['classFilter'] ?? '');
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
        .filter((character) => !typeFilter || character.type === typeFilter)
        .filter(
          (character) =>
            !classFilter ||
            character.primaryClass === classFilter ||
            character.secondaryClass === classFilter,
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

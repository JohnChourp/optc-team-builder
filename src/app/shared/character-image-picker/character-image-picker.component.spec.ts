import '@angular/compiler';
import { SimpleChange } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CharacterImagePickerComponent } from './character-image-picker.component';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonFooter: class {},
  IonHeader: class {},
  IonIcon: class {},
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
      limit: 48,
      offset: 0,
    });
    expect(component.characters()).toHaveLength(48);
    expect(component.hasMore()).toBe(true);
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

function createComponent() {
  const availableCharacters = buildCharacters();
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
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
  };
  const characterCatalogCache = {
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    queryCharacters: vi.fn().mockImplementation((query: Record<string, unknown>) => {
      const searchTerm = String(query['searchTerm'] ?? '').toLowerCase();
      const typeFilter = String(query['typeFilter'] ?? '');
      const classFilter = String(query['classFilter'] ?? '');
      const offset = Number(query['offset'] ?? 0);
      const limit = Number(query['limit'] ?? 24);

      return availableCharacters
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
  const component = new CharacterImagePickerComponent(
    repository as never,
    characterCatalogCache as never,
  );

  component.title = 'Pick character image';
  component.copy = 'Choose one OPTC portrait.';

  return { component, repository, characterCatalogCache };
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
    };
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

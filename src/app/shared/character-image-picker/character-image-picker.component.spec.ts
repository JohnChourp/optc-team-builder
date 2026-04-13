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
    const { component, repository } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    expect(repository.getDatasetManifest).toHaveBeenCalledOnce();
    expect(repository.searchCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      limit: 24,
      offset: 0,
    });
    expect(component.characters()).toHaveLength(24);
    expect(component.hasMore()).toBe(true);
  });

  it('reloads the catalog when search and filters change', async () => {
    const { component, repository } = createComponent();

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

    expect(repository.searchCharacters).toHaveBeenLastCalledWith({
      searchTerm: 'Luffy',
      typeFilter: 'DEX',
      classFilter: 'Fighter',
      limit: 24,
      offset: 0,
    });
    expect(component.characters().every((character) => character.name.includes('Luffy'))).toBe(true);
  });

  it('loads more characters without resetting the existing page', async () => {
    const { component, repository } = createComponent();

    component.isOpen = true;
    component.ngOnChanges({
      isOpen: new SimpleChange(false, true, true),
    });
    await flushPromises();

    expect(component.characters()).toHaveLength(24);

    await component.loadMore();

    expect(repository.searchCharacters).toHaveBeenLastCalledWith({
      searchTerm: '',
      typeFilter: '',
      classFilter: '',
      limit: 24,
      offset: 24,
    });
    expect(component.characters()).toHaveLength(32);
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

  it('renders the search, filters and confirm action in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/shared/character-image-picker/character-image-picker.component.html'),
      'utf8',
    );

    expect(template).toContain("t('catalog.searchPlaceholder')");
    expect(template).toContain("t('filters.type')");
    expect(template).toContain("t('filters.class')");
    expect(template).toContain('(click)="selectCharacter(character)"');
    expect(template).toContain('(click)="loadMore()"');
    expect(template).toContain('(click)="save()"');
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
    searchCharacters: vi.fn().mockImplementation(async (query: Record<string, unknown>) => {
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
  const component = new CharacterImagePickerComponent(repository as never);

  component.title = 'Pick character image';
  component.copy = 'Choose one OPTC portrait.';

  return { component, repository };
}

function buildCharacters() {
  return Array.from({ length: 32 }, (_, index) => {
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
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

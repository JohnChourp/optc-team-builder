import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { type CharacterDetailRecord, type CharacterListItem } from '../../core/models/optc.models';
import { CaptainCoveragePage } from './captain-coverage.page';

vi.mock('@ionic/angular/standalone', () => ({
  IonButton: class {},
  IonButtons: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonMenuButton: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

vi.mock('../../shared/character-image-picker/character-image-picker.component', () => ({
  CharacterImagePickerComponent: class {},
}));

describe('CaptainCoveragePage', () => {
  it('loads captains and renders only strict coverage matches after selecting a target', async () => {
    const target = createCharacter({ id: 2001, type: 'DEX', classes: ['Fighter', 'Slasher'] });
    const matchingCaptain = createCharacter({
      id: 1001,
      name: 'Matching Captain',
      captainAbility:
        'Boosts ATK of [DEX] characters by 5x and boosts HP of Fighter characters by 1.3x.',
      captainAtkBoost: 5,
      captainHpBoost: 1.3,
      captainAverageBoost: 3.15,
    });
    const rejectedCaptain = createCharacter({
      id: 1002,
      name: 'Rejected Captain',
      captainAbility:
        'Boosts ATK of [DEX] characters by 5x and boosts HP of Shooter characters by 1.3x.',
    });
    const { page, repository } = createPage([matchingCaptain, rejectedCaptain]);

    await page.ngOnInit();
    await page.saveTargetSelection(target);

    expect(repository.searchDetailedCharacters).toHaveBeenCalledWith({
      searchTerm: '',
      selectedTypes: [],
      selectedTypesMatchMode: 'any',
      selectedClasses: [],
      selectedClassesMatchMode: 'any',
      sortMode: 'catalog',
      idOrder: 'newest',
      limit: 12000,
      offset: 0,
    });
    expect(page.resultCards().map((card) => card.captain.name)).toEqual(['Matching Captain']);
    expect(page.totalMatchingCaptains()).toBe(1);
  });

  it('filters matching captain results by search text', async () => {
    const { page } = createPage([
      createCharacter({
        id: 1001,
        name: 'Ace Captain',
        captainAbility: 'Boosts ATK of all characters by 5x.',
      }),
      createCharacter({
        id: 1002,
        name: 'Luffy Captain',
        captainAbility: 'Boosts ATK of all characters by 5x.',
      }),
    ]);

    await page.ngOnInit();
    await page.saveTargetSelection(createCharacter({ id: 2001 }));
    page.onSearchChange({ detail: { value: 'luffy' } } as CustomEvent<{ value?: string | null }>);

    expect(page.resultCards().map((card) => card.captain.name)).toEqual(['Luffy Captain']);
  });

  it('filters matching captain results by favorite state', async () => {
    const { page } = createPage(
      [
        createCharacter({
          id: 1001,
          name: 'Favorite Captain',
          captainAbility: 'Boosts ATK of all characters by 5x.',
        }),
        createCharacter({
          id: 1002,
          name: 'Hidden Captain',
          captainAbility: 'Boosts ATK of all characters by 5x.',
        }),
      ],
      [1001],
    );

    await page.ngOnInit();
    await page.saveTargetSelection(createCharacter({ id: 2001 }));

    page.toggleFavoritesOnly();
    expect(page.resultCards().map((card) => card.captain.name)).toEqual(['Favorite Captain']);

    page.toggleHideFavorites();
    expect(page.favoritesOnly()).toBe(false);
    expect(page.resultCards().map((card) => card.captain.name)).toEqual(['Hidden Captain']);
  });

  it('defaults result ordering to newest ID and lets ID order switch to oldest', async () => {
    const newestCaptain = createCharacter({
      id: 1003,
      name: 'Newest Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const oldestCaptain = createCharacter({
      id: 1001,
      name: 'Oldest Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const { page } = createPage([oldestCaptain, newestCaptain]);

    await page.ngOnInit();
    await page.saveTargetSelection(createCharacter({ id: 2001 }));

    expect(page.selectedSortMode()).toBe('catalog');
    expect(page.selectedIdOrder()).toBe('newest');
    expect(page.resultCards().map((card) => card.captain.id)).toEqual([1003, 1001]);

    page.onIdOrderChange({ detail: { value: 'oldest' } } as CustomEvent<{
      value?: string | null;
    }>);

    expect(page.selectedIdOrder()).toBe('oldest');
    expect(page.resultCards().map((card) => card.captain.id)).toEqual([1001, 1003]);
  });

  it('uses selected ID order as a captain boost tie-breaker', async () => {
    const olderCaptain = createCharacter({
      id: 1001,
      name: 'Older Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      captainAtkBoost: 5,
    });
    const newerCaptain = createCharacter({
      id: 1003,
      name: 'Newer Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      captainAtkBoost: 5,
    });
    const { page } = createPage([olderCaptain, newerCaptain]);

    await page.ngOnInit();
    await page.saveTargetSelection(createCharacter({ id: 2001 }));

    page.onSortModeChange({ detail: { value: 'captainAtkBoost' } } as CustomEvent<{
      value?: string | null;
    }>);
    expect(page.resultCards().map((card) => card.captain.id)).toEqual([1003, 1001]);

    page.onIdOrderChange({ detail: { value: 'oldest' } } as CustomEvent<{
      value?: string | null;
    }>);
    expect(page.resultCards().map((card) => card.captain.id)).toEqual([1001, 1003]);
  });

  it('limits captain and sub selections by the max total team cost', async () => {
    const cheapCaptain = createCharacter({
      id: 1001,
      name: 'Cheap Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      cost: 80,
    });
    const expensiveCaptain = createCharacter({
      id: 1002,
      name: 'Expensive Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      cost: 101,
    });
    const fittingSub = createCharacter({ id: 2002, name: 'Fitting Sub', cost: 20 });
    const expensiveSub = createCharacter({ id: 2003, name: 'Expensive Sub', cost: 21 });
    const { page } = createPage([cheapCaptain, expensiveCaptain], [], [fittingSub, expensiveSub]);

    await page.ngOnInit();
    page.onMaxTotalCostChange({ detail: { value: '100' } } as CustomEvent<{ value: string }>);
    await page.saveTargetSelection(createCharacter({ id: 2001 }));

    expect(page.resultCards().map((card) => card.captain.name)).toEqual(['Cheap Captain']);

    page.assignCaptainFromResult(cheapCaptain);
    page.openTeamSlotPicker(1);

    expect(page.teamPickerMaxCost()).toBe(20);

    page.saveTeamSlotSelection(expensiveSub);
    expect(page.selectedTeamSlots()[1]).toBeNull();

    page.saveTeamSlotSelection(fittingSub);
    expect(page.selectedTeamSlots()[1]?.id).toBe(2002);
  });

  it('silently excludes captains that conflict with the selected target party identity', async () => {
    const target = createCharacter({
      id: 2001,
      name: 'Target Luffy',
      partyConflictKeys: ['monkey-d-luffy'],
    });
    const conflictingCaptain = createCharacter({
      id: 1001,
      name: 'Conflicting Luffy Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      partyConflictKeys: ['monkey-d-luffy'],
    });
    const availableCaptain = createCharacter({
      id: 1002,
      name: 'Available Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      partyConflictKeys: ['trafalgar-law'],
    });
    const { page } = createPage([conflictingCaptain, availableCaptain], [], [target]);

    await page.ngOnInit();
    await page.saveTargetSelection(target);

    expect(page.resultCards().map((card) => card.captain.name)).toEqual(['Available Captain']);
  });

  it('switches between list and compact display modes', () => {
    const { page } = createPage();

    expect(page.displayMode()).toBe('list');
    expect(page.isCompactDisplayMode()).toBe(false);

    page.setDisplayMode('compact');

    expect(page.displayMode()).toBe('compact');
    expect(page.isCompactDisplayMode()).toBe(true);
  });

  it('keeps the picker and result surfaces wired in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/captain-coverage/captain-coverage.page.html'),
      'utf8',
    );

    expect(template).toContain('<app-character-image-picker');
    expect(template).toContain('(saveSelection)="saveTargetSelection($event)"');
    expect(template).toContain('resultCards()');
    expect(template).toContain('toggleFavoritesOnly()');
    expect(template).toContain('toggleHideFavorites()');
    expect(template).toContain('onMaxTotalCostChange($event)');
    expect(template).toContain('assignCaptainFromResult(card.captain)');
    expect(template).toContain('selectedIdOrder()');
    expect(template).toContain('onIdOrderChange($event)');
    expect(template).not.toContain('value="idDesc"');
    expect(template).not.toContain('value="idAsc"');
    expect(template).toContain("setDisplayMode('list')");
    expect(template).toContain("setDisplayMode('compact')");
    expect(template).toContain('isCompactDisplayMode()');
    expect(template).toContain('coverage-chip');
    expect(template).toContain('formatBoost(card.captain.captainAtkBoost)');
  });
});

function createPage(
  captains: CharacterDetailRecord[] = [],
  favoriteIds: number[] = [],
  extraCharacters: CharacterDetailRecord[] = [],
): {
  page: CaptainCoveragePage;
  repository: {
    getDatasetManifest: ReturnType<typeof vi.fn>;
    getCharacterById: ReturnType<typeof vi.fn>;
    searchDetailedCharacters: ReturnType<typeof vi.fn>;
  };
  userState: {
    favoriteCharacterIds: ReturnType<typeof signal<number[]>>;
    ready: ReturnType<typeof vi.fn>;
  };
  i18n: {
    translate: ReturnType<typeof vi.fn>;
  };
} {
  const charactersById = new Map(
    [...captains, ...extraCharacters].map((character) => [character.id, character]),
  );
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      characterCount: 3,
    }),
    getCharacterById: vi.fn((characterId: number) =>
      Promise.resolve(charactersById.get(characterId) ?? null),
    ),
    searchDetailedCharacters: vi.fn().mockResolvedValue(captains),
  };
  const userState = {
    favoriteCharacterIds: signal(favoriteIds),
    ready: vi.fn().mockResolvedValue(undefined),
  };
  const i18n = {
    translate: vi.fn((key: string, params?: Record<string, string | number>) =>
      formatTranslation(key, params),
    ),
  };

  return {
    page: new CaptainCoveragePage(repository as never, userState as never, i18n as never),
    repository,
    userState,
    i18n,
  };
}

function formatTranslation(key: string, params?: Record<string, string | number>): string {
  if (!params) {
    return key;
  }

  return Object.entries(params).reduce(
    (text, [paramKey, value]) => text.replace(`{{${paramKey}}}`, String(value)),
    key,
  );
}

function createCharacter(
  overrides: Partial<CharacterDetailRecord> & {
    captainAbility?: string;
    classes?: string[];
    id: number;
    partyConflictKeys?: string[];
    type?: string;
  },
): CharacterDetailRecord & CharacterListItem {
  const classes = overrides.classes ?? ['Fighter', 'Slasher'];
  const type = overrides.type ?? 'DEX';

  return {
    id: overrides.id,
    name: overrides.name ?? `Character ${overrides.id}`,
    searchText: '',
    isIncomplete: false,
    type,
    classes,
    primaryClass: classes[0] ?? 'Fighter',
    secondaryClass: classes[1] ?? null,
    stars: 5,
    cost: overrides.cost ?? 55,
    combo: 4,
    captainHpBoost: overrides.captainHpBoost ?? 0,
    captainAtkBoost: overrides.captainAtkBoost ?? 0,
    captainAverageBoost: overrides.captainAverageBoost ?? 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionAvailability: {
      exactLocal: false,
      thumbnailGlobal: false,
      thumbnailJapan: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
    },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: overrides.id,
      captainAbility: overrides.captainAbility ?? null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: overrides.partyConflictKeys ?? [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      limitBreak: [],
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      captainShiftData: null,
      rumbleData: null,
    },
  };
}

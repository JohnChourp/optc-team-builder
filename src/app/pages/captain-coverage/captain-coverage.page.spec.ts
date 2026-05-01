import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
} from '../../core/models/auto-team-builder-ability.models';
import { type CharacterDetailRecord, type CharacterListItem } from '../../core/models/optc.models';
import { type AbilityRequirementDraft } from '../../core/services/ability-requirement-draft.utils';
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

vi.mock('../../shared/ability-filter-rail/ability-filter-rail.component', () => ({
  AbilityFilterRailComponent: class {},
}));

vi.mock('../../shared/character-image-picker/character-image-picker.component', () => ({
  CharacterImagePickerComponent: class {},
}));

vi.mock('../../shared/special-ability-picker/special-ability-picker.component', () => ({
  SpecialAbilityPickerComponent: class {},
}));

describe('CaptainCoveragePage', () => {
  it('loads captain candidates and renders covered character results after selecting the Captain slot', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Alpha',
      captainAbility:
        'Boosts ATK of [DEX] characters by 5x and boosts HP of Fighter characters by 1.3x.',
    });
    const coveredCharacter = createCharacter({
      id: 2001,
      name: 'Covered Dex Fighter',
      type: 'DEX',
      classes: ['Fighter', 'Slasher'],
    });
    const rejectedCharacter = createCharacter({
      id: 2002,
      name: 'Rejected Dex Shooter',
      type: 'DEX',
      classes: ['Shooter', 'Free Spirit'],
    });
    const { page, repository, characterCatalogCache } = createPage({
      captains: [leader],
      characters: [leader, coveredCharacter, rejectedCharacter],
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(leader);

    expect(characterCatalogCache.ensureLoaded).toHaveBeenCalled();
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
    expect(page.selectedCaptainDetail()?.id).toBe(1001);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Covered Dex Fighter']);
    expect(page.totalMatchingCharacters()).toBe(1);
  });

  it('renders covered results for Kid Aimed Damned Punk after selecting him as Captain', async () => {
    const kidCaptainAbility =
      'Reduces Special Cooldown of all characters by 1 turn and reduces Special Cooldown of this character by 4 turns at the start of the fight, boosts ATK of [STR], Striker and Driven characters by 5x, boosts HP of [STR], Striker and Driven characters by 1.3x, and makes [STR] and [INT] orbs beneficial for all characters. If HP is below 50% at the start of the turn, boosts ATK of [STR], Striker and Driven characters by 6x instead, and reduces damage received by 25%. If your crew has 4+ [Kid Pirates], [Worst Generation] or [Land of Wano Arc] characters or your crew has 6 [Kid Pirates], [Worst Generation] or [Egghead Arc] characters, reduces Despair duration by 10 turns, and boosts base ATK of [Paramythia-type] characters by 500.';
    const kid = createCharacter({
      id: 4549,
      name: 'Eustass "Captain" Kid - Aimed Damned Punk',
      captainAbility: kidCaptainAbility,
      type: 'STR',
      classes: ['Striker', 'Driven'],
    });
    const coveredStrCharacter = createCharacter({
      id: 4550,
      name: 'Covered STR Candidate',
      type: 'STR',
      classes: ['Shooter', 'Free Spirit'],
    });
    const coveredDrivenCharacter = createCharacter({
      id: 4551,
      name: 'Covered Driven Candidate',
      type: 'QCK',
      classes: ['Driven', 'Shooter'],
    });
    const rejectedCharacter = createCharacter({
      id: 4552,
      name: 'Rejected Candidate',
      type: 'QCK',
      classes: ['Shooter', 'Free Spirit'],
    });
    const { page } = createPage({
      captains: [kid],
      characters: [kid, coveredStrCharacter, coveredDrivenCharacter, rejectedCharacter],
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(kid);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Covered Driven Candidate',
      'Covered STR Candidate',
    ]);
    expect(page.totalMatchingCharacters()).toBe(2);
  });

  it('filters covered character results by search text and favorite state', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Beta',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const favoriteCharacter = createCharacter({ id: 2001, name: 'Ace Candidate' });
    const hiddenCharacter = createCharacter({ id: 2002, name: 'Luffy Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, favoriteCharacter, hiddenCharacter],
      favoriteIds: [2001],
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(leader);
    page.onSearchChange({ detail: { value: 'luffy' } } as CustomEvent<{ value?: string | null }>);

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Luffy Candidate']);

    page.onSearchChange({ detail: { value: '' } } as CustomEvent<{ value?: string | null }>);
    page.toggleFavoritesOnly();
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Ace Candidate']);

    page.toggleHideFavorites();
    expect(page.favoritesOnly()).toBe(false);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Luffy Candidate']);
  });

  it('excludes covered characters that conflict with the selected team or cannot fit the cost budget', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Gamma',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      cost: 60,
      partyConflictKeys: ['gamma-leader'],
    });
    const fittingCharacter = createCharacter({ id: 2001, name: 'Fitting Candidate', cost: 40 });
    const expensiveCharacter = createCharacter({
      id: 2002,
      name: 'Expensive Candidate',
      cost: 41,
    });
    const conflictingCharacter = createCharacter({
      id: 2003,
      name: 'Conflict Candidate',
      cost: 20,
      partyConflictKeys: ['gamma-leader'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, fittingCharacter, expensiveCharacter, conflictingCharacter],
    });

    await page.ngOnInit();
    page.onMaxTotalCostChange({ detail: { value: '100' } } as CustomEvent<{ value: string }>);
    await page.saveTeamSlotSelection(leader);

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Fitting Candidate']);
  });

  it('intersects captain coverage results with ability filters', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Delta',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const bindReducer = createCharacter({ id: 2001, name: 'Bind Reducer' });
    const orbBooster = createCharacter({ id: 2002, name: 'Orb Booster' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, bindReducer, orbBooster],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001]),
      ]),
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(leader);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Orb Booster',
      'Bind Reducer',
    ]);

    page.saveSpecialAbilityPicker([createAbilityDraft('remove_bind')]);

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Bind Reducer']);
    expect(page.abilityFilterRailItems()[0]).toMatchObject({
      category: 'special',
      count: 1,
    });
  });

  it('adds a covered character result to the first compatible empty sub slot', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Epsilon',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const firstCandidate = createCharacter({ id: 2001, name: 'First Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, firstCandidate],
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(leader);
    page.assignCharacterFromResult(page.resultCards()[0]);

    expect(page.selectedTeamSlots()[1]?.id).toBe(2001);
  });

  it('defaults result ordering to newest ID and lets ID order switch to oldest', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Zeta',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const newestCharacter = createCharacter({ id: 2003, name: 'Newest Candidate' });
    const oldestCharacter = createCharacter({ id: 2001, name: 'Oldest Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, oldestCharacter, newestCharacter],
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(leader);

    expect(page.selectedSortMode()).toBe('catalog');
    expect(page.selectedIdOrder()).toBe('newest');
    expect(page.resultCards().map((card) => card.character.id)).toEqual([2003, 2001]);

    page.onIdOrderChange({ detail: { value: 'oldest' } } as CustomEvent<{
      value?: string | null;
    }>);

    expect(page.selectedIdOrder()).toBe('oldest');
    expect(page.resultCards().map((card) => card.character.id)).toEqual([2001, 2003]);
  });

  it('limits captain and sub selections by the max total team cost', async () => {
    const cheapLeader = createCharacter({
      id: 1001,
      name: 'Cheap Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      cost: 80,
    });
    const expensiveLeader = createCharacter({
      id: 1002,
      name: 'Expensive Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      cost: 101,
    });
    const fittingSub = createCharacter({ id: 2002, name: 'Fitting Sub', cost: 20 });
    const expensiveSub = createCharacter({ id: 2003, name: 'Expensive Sub', cost: 21 });
    const { page } = createPage({
      captains: [cheapLeader, expensiveLeader],
      characters: [cheapLeader, expensiveLeader, fittingSub, expensiveSub],
    });

    await page.ngOnInit();
    page.onMaxTotalCostChange({ detail: { value: '100' } } as CustomEvent<{ value: string }>);

    await page.saveTeamSlotSelection(expensiveLeader);
    expect(page.selectedCaptain()).toBeNull();

    await page.saveTeamSlotSelection(cheapLeader);
    page.openTeamSlotPicker(1);

    expect(page.teamPickerMaxCost()).toBe(20);

    await page.saveTeamSlotSelection(expensiveSub);
    expect(page.selectedTeamSlots()[1]).toBeNull();

    await page.saveTeamSlotSelection(fittingSub);
    expect(page.selectedTeamSlots()[1]?.id).toBe(2002);
  });

  it('keeps the leader-driven picker, ability filters, and result surfaces wired in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/captain-coverage/captain-coverage.page.html'),
      'utf8',
    );

    expect(template).toContain('<app-character-image-picker');
    expect(template).toContain('[allowedCharacterIds]="activeTeamSlotAllowedCharacterIds()"');
    expect(template).toContain('(saveSelection)="saveTeamSlotSelection($event)"');
    expect(template).toContain('<app-ability-filter-rail');
    expect(template).toContain('openAbilityFilterCategory($event)');
    expect(template).toContain('resultCards()');
    expect(template).toContain('toggleFavoritesOnly()');
    expect(template).toContain('toggleHideFavorites()');
    expect(template).toContain('onMaxTotalCostChange($event)');
    expect(template).toContain('assignCharacterFromResult(card)');
    expect(template).toContain('selectedIdOrder()');
    expect(template).toContain('onIdOrderChange($event)');
    expect(template).not.toContain('saveTargetSelection');
    expect(template).not.toContain('selectedTarget');
    expect(template).not.toContain('target-panel glass-card');
    expect(template).not.toContain('value="idDesc"');
    expect(template).not.toContain('value="idAsc"');
    expect(template).not.toContain('view-toggle');
    expect(template).not.toContain('setDisplayMode');
    expect(template).not.toContain('isCompactDisplayMode');
    expect(template).not.toContain('character-meta-grid');
    expect(template).not.toContain('results.meta');
    expect(template).not.toContain('card.coverage.captainText');
    expect(template).not.toContain('neutralNotes');
    expect(template).not.toContain('neutral-note');
    expect(template).not.toContain('card.character.name }}</a>');
    expect(template).not.toContain('card.subtitle');
    expect(template).not.toContain('card.character.name');
    expect(template).not.toContain('card.coverage.chips');
    expect(template).not.toContain('coverage-chip');
    expect(template).toContain("t('results.openCharacterDetails')");
  });
});

function createPage({
  captains = [],
  characters = [],
  favoriteIds = [],
  abilityCatalog = createAbilityCatalog(),
}: {
  captains?: CharacterDetailRecord[];
  characters?: Array<CharacterDetailRecord & CharacterListItem>;
  favoriteIds?: number[];
  abilityCatalog?: AutoBuildAbilityCatalog;
} = {}): {
  page: CaptainCoveragePage;
  repository: {
    getAutoBuilderAbilityCatalog: ReturnType<typeof vi.fn>;
    getDatasetManifest: ReturnType<typeof vi.fn>;
    getCharacterById: ReturnType<typeof vi.fn>;
    searchDetailedCharacters: ReturnType<typeof vi.fn>;
  };
  characterCatalogCache: {
    catalog: ReturnType<typeof signal<CharacterListItem[]>>;
    ensureLoaded: ReturnType<typeof vi.fn>;
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
    [...captains, ...characters].map((character) => [character.id, character]),
  );
  const repository = {
    getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue(abilityCatalog),
    getDatasetManifest: vi.fn().mockResolvedValue({
      characterCount: characters.length,
    }),
    getCharacterById: vi.fn((characterId: number) =>
      Promise.resolve(charactersById.get(characterId) ?? null),
    ),
    searchDetailedCharacters: vi.fn().mockResolvedValue(captains),
  };
  const characterCatalogCache = {
    catalog: signal<CharacterListItem[]>(characters),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
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
    page: new CaptainCoveragePage(
      repository as never,
      characterCatalogCache as never,
      userState as never,
      i18n as never,
    ),
    repository,
    characterCatalogCache,
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

function createAbilityDraft(abilityKey: string): AbilityRequirementDraft {
  return {
    draftId: `${abilityKey}-draft`,
    abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: null,
  };
}

function createAbilityCatalog(
  abilities: AutoBuildAbilityCatalogItem[] = [],
): AutoBuildAbilityCatalog {
  return {
    generatedAt: '2026-05-01T00:00:00.000Z',
    sourceVersion: 'test',
    abilityCount: abilities.length,
    abilities,
  };
}

function createAbilityCatalogItem(
  key: string,
  label: string,
  category: AutoBuildAbilityCatalogItem['category'],
  matchingCharacterIds: number[],
): AutoBuildAbilityCatalogItem {
  return {
    key,
    label,
    category,
    groupLabel: 'Test',
    groupOrder: 1,
    effectOrder: 1,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: [],
    availableSources: ['specialText'],
    matchCount: matchingCharacterIds.length,
    matchingCharacterIds,
    sampleCharacterIds: matchingCharacterIds.slice(0, 3),
    sampleTexts: [],
  };
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
    name: overrides.name ?? `Unit ${overrides.id}`,
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

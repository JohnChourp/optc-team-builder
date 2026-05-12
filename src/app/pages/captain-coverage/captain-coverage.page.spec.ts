import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
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
  IonToggle: class {},
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
      captainHpBoost: 9,
      captainAtkBoost: 9,
      captainAverageBoost: 9,
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
    expect(page.resultCards()[0]?.coverage.boosts).toEqual({
      hp: 1.3,
      atk: 5,
    });
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
      characterTags: ['Land of Wano Arc'],
    });
    const coveredDrivenCharacter = createCharacter({
      id: 4551,
      name: 'Covered Driven Candidate',
      type: 'QCK',
      classes: ['Driven', 'Shooter'],
      characterTags: ['Kid Pirates'],
    });
    const rejectedUntaggedStrCharacter = createCharacter({
      id: 4553,
      name: 'Rejected Untagged STR Candidate',
      type: 'STR',
      classes: ['Shooter', 'Free Spirit'],
    });
    const rejectedTaggedUnboostedCharacter = createCharacter({
      id: 4554,
      name: 'Rejected Tagged Unboosted Candidate',
      type: 'QCK',
      classes: ['Shooter', 'Free Spirit'],
      characterTags: ['Worst Generation'],
    });
    const rejectedCharacter = createCharacter({
      id: 4552,
      name: 'Rejected Candidate',
      type: 'QCK',
      classes: ['Shooter', 'Free Spirit'],
    });
    const { page } = createPage({
      captains: [kid],
      characters: [
        kid,
        coveredStrCharacter,
        coveredDrivenCharacter,
        rejectedUntaggedStrCharacter,
        rejectedTaggedUnboostedCharacter,
        rejectedCharacter,
      ],
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(kid);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Rejected Untagged STR Candidate',
      'Covered Driven Candidate',
      'Covered STR Candidate',
    ]);
    expect(page.totalMatchingCharacters()).toBe(3);

    page.onRequireFullCaptainAbilityCoverageChange({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Rejected Untagged STR Candidate',
      'Covered Driven Candidate',
      'Covered STR Candidate',
    ]);
    expect(page.totalMatchingCharacters()).toBe(3);
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

  it('filters captain coverage results to characters matching any selected ability', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Delta',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const bindReducer = createCharacter({
      id: 2001,
      name: 'Bind Reducer',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'specialText')],
    });
    const orbBooster = createCharacter({
      id: 2002,
      name: 'Orb Booster',
      builderAbilities: [createBuilderAbility('boost_orb', 'Boost Orb Effects', 'specialText')],
    });
    const unmatchedCharacter = createCharacter({ id: 2003, name: 'No Utility' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, bindReducer, orbBooster, unmatchedCharacter],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001]),
        createAbilityCatalogItem('boost_orb', 'Boost Orb Effects', 'special', [2002]),
      ]),
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(leader);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'No Utility',
      'Orb Booster',
      'Bind Reducer',
    ]);

    page.saveSpecialAbilityPicker([
      createAbilityDraft('remove_bind'),
      createAbilityDraft('boost_orb'),
    ]);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Orb Booster',
      'Bind Reducer',
    ]);
    expect(page.resultCards().map((card) => card.abilityMatchCount)).toEqual([1, 1]);
    expect(page.abilityFilterRailItems()[0]).toMatchObject({
      category: 'special',
      count: 2,
    });
  });

  it('returns characters matching any selected ability across special, potential, and support', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Multi',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const specialMatcher = createCharacter({
      id: 2001,
      name: 'Special Matcher',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'specialText')],
    });
    const potentialMatcher = createCharacter({
      id: 2002,
      name: 'Potential Matcher',
      builderAbilities: [createBuilderAbility('reduce_bind', 'Reduce Bind', 'potentialAbilities')],
    });
    const supportMatcher = createCharacter({
      id: 2003,
      name: 'Support Matcher',
      builderAbilities: [
        createBuilderAbility('support_remove_bind', 'Support Remove Bind', 'supportData'),
      ],
    });
    const unmatchedCharacter = createCharacter({ id: 2004, name: 'Unmatched Utility' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, specialMatcher, potentialMatcher, supportMatcher, unmatchedCharacter],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001]),
        createAbilityCatalogItem('reduce_bind', 'Reduce Bind', 'potential', [2002]),
        createAbilityCatalogItem('support_remove_bind', 'Support Remove Bind', 'support', [2003]),
      ]),
    });

    await page.ngOnInit();
    page.saveSpecialAbilityPicker([createAbilityDraft('remove_bind')]);
    page.savePotentialAbilityPicker([createAbilityDraft('reduce_bind')]);
    page.saveSupportAbilityPicker([createAbilityDraft('support_remove_bind')]);
    await page.saveTeamSlotSelection(leader);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Support Matcher',
      'Potential Matcher',
      'Special Matcher',
    ]);
    expect(page.resultCards().map((card) => card.selectedAbilityCount)).toEqual([3, 3, 3]);
  });

  it('sorts selected ability matches from strongest to weakest when ranking is enabled', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Ranking',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const fullMatch = createCharacter({
      id: 2001,
      name: 'Full Match',
      builderAbilities: [
        createBuilderAbility('remove_bind', 'Remove Bind', 'specialText'),
        createBuilderAbility('boost_orb', 'Boost Orb Effects', 'specialText'),
        createBuilderAbility('reduce_bind', 'Reduce Bind', 'potentialAbilities'),
      ],
    });
    const partialMatch = createCharacter({
      id: 2002,
      name: 'Partial Match',
      builderAbilities: [
        createBuilderAbility('remove_bind', 'Remove Bind', 'specialText'),
        createBuilderAbility('reduce_bind', 'Reduce Bind', 'potentialAbilities'),
      ],
    });
    const singleMatch = createCharacter({
      id: 2003,
      name: 'Single Match',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'specialText')],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, fullMatch, partialMatch, singleMatch],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001, 2002, 2003]),
        createAbilityCatalogItem('boost_orb', 'Boost Orb Effects', 'special', [2001]),
        createAbilityCatalogItem('reduce_bind', 'Reduce Bind', 'potential', [2001, 2002]),
      ]),
    });

    await page.ngOnInit();
    page.saveSpecialAbilityPicker([
      createAbilityDraft('remove_bind'),
      createAbilityDraft('boost_orb'),
    ]);
    page.savePotentialAbilityPicker([createAbilityDraft('reduce_bind')]);
    await page.saveTeamSlotSelection(leader);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Single Match',
      'Partial Match',
      'Full Match',
    ]);

    page.onAbilityMatchRankingChange({
      detail: { checked: true },
    } as CustomEvent<{ checked?: boolean | null }>);

    expect(page.abilityMatchRankingEnabled()).toBe(true);
    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Full Match',
      'Partial Match',
      'Single Match',
    ]);
    expect(page.resultCards().map((card) => card.abilityMatchCount)).toEqual([3, 2, 1]);
  });

  it('allows ability filters before selecting a Captain and keeps them for later results', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Before Filters',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const bindReducer = createCharacter({
      id: 2001,
      name: 'Early Bind Reducer',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'specialText')],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, bindReducer],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001]),
      ]),
    });

    await page.ngOnInit();

    expect(page.selectedCaptainDetail()).toBeNull();
    expect(page.resultCards()).toEqual([]);
    expect(page.abilityFilterRailItems()[0]).toMatchObject({
      category: 'special',
      disabled: false,
    });

    page.openSpecialAbilityPicker();
    expect(page.specialAbilityPickerOpen()).toBe(true);

    page.saveSpecialAbilityPicker([createAbilityDraft('remove_bind')]);
    expect(page.specialAbilityDrafts()).toHaveLength(1);
    expect(page.resultCards()).toEqual([]);

    page.onAbilityMatchRankingChange({
      detail: { checked: true },
    } as CustomEvent<{ checked?: boolean | null }>);
    expect(page.abilityMatchRankingEnabled()).toBe(true);

    await page.saveTeamSlotSelection(leader);

    expect(page.specialAbilityDrafts()).toHaveLength(1);
    expect(page.abilityMatchRankingEnabled()).toBe(true);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Early Bind Reducer']);
  });

  it('shows compact badges only for selected abilities matched by each result', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Badge',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const utilityCharacter = createCharacter({
      id: 2001,
      name: 'Utility Candidate',
      builderAbilities: [
        createBuilderAbility('remove_bind', 'Remove Bind', 'specialText'),
        createBuilderAbility('reduce_bind', 'Reduce Bind', 'potentialAbilities'),
        createBuilderAbility('boost_orb', 'Boost Orb Effects', 'specialText'),
      ],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, utilityCharacter],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001]),
        createAbilityCatalogItem('reduce_bind', 'Reduce Bind', 'potential', [2001]),
        createAbilityCatalogItem('boost_orb', 'Boost Orb Effects', 'special', [2001]),
      ]),
    });

    await page.ngOnInit();
    page.saveSpecialAbilityPicker([createAbilityDraft('remove_bind')]);
    page.savePotentialAbilityPicker([createAbilityDraft('reduce_bind')]);
    await page.saveTeamSlotSelection(leader);

    expect(page.resultCards()[0]?.matchedAbilityBadges.map((badge) => badge.label)).toEqual([
      'Special: Remove Bind',
      'Potential: Reduce Bind',
    ]);
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

  it('formats captain boost values without multiplier suffixes', () => {
    const { page } = createPage();

    expect(page.formatBoost(1.4)).toBe('1.4');
    expect(page.formatBoost(5.25)).toBe('5.25');
    expect(page.formatBoost(0)).toBe('-');
  });

  it('reports captain condition status for a complete selected coverage team', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const subs = [2001, 2002, 2003, 2004].map((id) => createCharacter({ id }));
    const { page } = createPage({
      captains: [leader],
      characters: [leader, ...subs],
    });

    await page.ngOnInit();
    await page.saveTeamSlotSelection(leader);

    expect(page.teamConditionStatus()?.state).toBe('pending');

    for (const [index, sub] of subs.entries()) {
      page.openTeamSlotPicker(index + 1);
      await page.saveTeamSlotSelection(sub);
    }

    expect(page.teamConditionStatus()?.state).toBe('full');
    expect(page.teamConditionStatus()?.passedLeaderLabels).toEqual([
      'captain-coverage.team.slots.captain',
    ]);
  });

  it('saves the selected coverage team to shared saved teams with the Captain mirrored as friend captain', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Coverage Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const subs = [2001, 2002, 2003, 2004].map((id) => createCharacter({ id }));
    const { page, userState } = createPage({
      captains: [leader],
      characters: [leader, ...subs],
    });

    await page.ngOnInit();
    page.onTeamNameChange({ detail: { value: 'Captain Coverage Crew' } } as CustomEvent<{
      value?: string | null;
    }>);
    await page.saveTeamSlotSelection(leader);

    for (const [index, sub] of subs.entries()) {
      page.openTeamSlotPicker(index + 1);
      await page.saveTeamSlotSelection(sub);
    }

    await page.saveTeam();

    expect(userState.saveTeam).toHaveBeenCalledWith({
      id: undefined,
      name: 'Captain Coverage Crew',
      notes: '',
      shipId: null,
      slots: [1001, 1001, 2001, 2002, 2003, 2004],
    });
    expect(page.currentTeamId()).toBe('saved-captain-coverage-team');
    expect(page.saveUiLocked()).toBe(false);
    expect(page.saveFeedbackError()).toBe('');

    page.clearTeamSlot(4);
    expect(page.currentTeamId()).toBeNull();
  });

  it('loads a saved team route as a captain coverage draft and ignores Friend Captain', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Saved Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const friendCaptain = createCharacter({
      id: 1002,
      name: 'Ignored Friend Captain',
      captainAbility: 'Boosts HP of all characters by 1.3x.',
    });
    const subs = [2001, 2002, 2003, 2004].map((id) => createCharacter({ id }));
    const { page, router, userState } = createPage({
      routeTeamId: 'team-1',
      savedTeams: [
        createSavedTeam({
          id: 'team-1',
          name: 'Coverage Import',
          slots: [1001, 1002, 2001, 2002, 2003, 2004],
        }),
      ],
      captains: [leader, friendCaptain],
      characters: [leader, friendCaptain, ...subs],
    });

    await page.ngOnInit();

    expect(userState.readySavedTeams).toHaveBeenCalledOnce();
    expect(page.selectedTeamSlots().map((slot) => slot?.id ?? null)).toEqual([
      1001,
      2001,
      2002,
      2003,
      2004,
    ]);
    expect(page.selectedCaptainDetail()?.id).toBe(1001);
    expect(page.teamName()).toBe('Coverage Import');
    expect(page.currentTeamId()).toBeNull();
    expect(page.saveFeedbackError()).toBe('');
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });

  it('clears an unknown saved team route id without replacing the captain coverage draft', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Existing Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const { page, router } = createPage({
      routeTeamId: 'missing-team',
      captains: [leader],
      characters: [leader],
    });

    page.teamName.set('Existing Coverage Draft');
    page.selectedTeamSlots.set([leader, null, null, null, null]);
    page.selectedCaptainDetail.set(leader);

    await page.ngOnInit();

    expect(page.teamName()).toBe('Existing Coverage Draft');
    expect(page.selectedTeamSlots().map((slot) => slot?.id ?? null)).toEqual([
      1001,
      null,
      null,
      null,
      null,
    ]);
    expect(router.navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.any(Object),
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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
    expect(template).toContain('[disabled]="loading()"');
    expect(template).toContain('openAbilityFilterCategory($event)');
    expect(template).toContain('abilityMatchRankingEnabled()');
    expect(template).toContain('abilityMatchRankingDisabled()');
    expect(template).toContain('onAbilityMatchRankingChange($event)');
    expect(template).toContain("t('filters.bestAbilityMatchesFirst')");
    expect(template).toContain('resultCards()');
    expect(template).toContain('toggleFavoritesOnly()');
    expect(template).toContain('toggleHideFavorites()');
    expect(template).toContain('onMaxTotalCostChange($event)');
    expect(template).toContain('<app-captain-team-condition-status');
    expect(template).toContain('teamConditionStatus()');
    expect(template).toContain('captain-condition-panel--full');
    expect(template).toContain('assignCharacterFromResult(card)');
    expect(template).toContain('teamName()');
    expect(template).toContain('onTeamNameChange($event)');
    expect(template).toContain('(click)="saveTeam()"');
    expect(template).toContain('saveDisabled()');
    expect(template).toContain('currentTeamId()');
    expect(template).toContain('[routerLink]="[\'/tabs/saved-teams\']"');
    expect(template).toContain('[routerLink]="[\'/characters\', captain.id]"');
    expect(template).toContain('class="selected-target"');
    expect(template).toContain('class="captain-result__boosts"');
    expect(template).toContain('HP:{{ formatBoost(card.coverage.boosts.hp) }}');
    expect(template).toContain('ATK:{{ formatBoost(card.coverage.boosts.atk) }}');
    expect(template).toContain('card.matchedAbilityBadges.length');
    expect(template).toContain('class="captain-result__ability-badge"');
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
  routeTeamId = null,
  savedTeams = [],
}: {
  captains?: CharacterDetailRecord[];
  characters?: Array<CharacterDetailRecord & CharacterListItem>;
  favoriteIds?: number[];
  abilityCatalog?: AutoBuildAbilityCatalog;
  routeTeamId?: string | null;
  savedTeams?: Array<ReturnType<typeof createSavedTeam>>;
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
    getSavedTeamById: ReturnType<typeof vi.fn>;
    ready: ReturnType<typeof vi.fn>;
    readySavedTeams: ReturnType<typeof vi.fn>;
    saveTeam: ReturnType<typeof vi.fn>;
  };
  route: { snapshot: { queryParamMap: { get: ReturnType<typeof vi.fn> } } };
  router: { navigate: ReturnType<typeof vi.fn> };
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
    searchDetailedCharacters: vi.fn().mockResolvedValue([...charactersById.values()]),
  };
  const characterCatalogCache = {
    catalog: signal<CharacterListItem[]>(characters),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
  };
  const userState = {
    favoriteCharacterIds: signal(favoriteIds),
    getSavedTeamById: vi.fn(
      (teamId: string) => savedTeams.find((team) => team.id === teamId) ?? null,
    ),
    ready: vi.fn().mockResolvedValue(undefined),
    readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
    readySavedTeams: vi.fn().mockResolvedValue(undefined),
    saveTeam: vi.fn().mockResolvedValue({ id: 'saved-captain-coverage-team' }),
  };
  const i18n = {
    translate: vi.fn((key: string, params?: Record<string, string | number>) =>
      formatTranslation(key, params),
    ),
  };
  const route = {
    snapshot: {
      queryParamMap: {
        get: vi.fn((key: string) => (key === 'teamId' ? routeTeamId : null)),
      },
    },
  };
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  return {
    page: new CaptainCoveragePage(
      repository as never,
      characterCatalogCache as never,
      userState as never,
      i18n as never,
      route as never,
      router as never,
    ),
    repository,
    characterCatalogCache,
    route,
    router,
    userState,
    i18n,
  };
}

function createSavedTeam(
  overrides: Partial<{
    id: string;
    name: string;
    notes: string;
    shipId: number | null;
    slots: Array<number | null>;
  }> = {},
) {
  return {
    id: overrides.id ?? 'team-1',
    name: overrides.name ?? 'Saved Coverage Team',
    notes: overrides.notes ?? '',
    shipId: overrides.shipId ?? null,
    slots: overrides.slots ?? [1001, 1001, null, null, null, null],
    createdAt: '2026-05-10T10:00:00.000Z',
    updatedAt: '2026-05-10T10:00:00.000Z',
  };
}

function formatTranslation(key: string, params?: Record<string, string | number>): string {
  const translations: Record<string, string> = {
    'common.defaults.newCrew': 'New Crew',
    'characterAbilityGroups.metadata.turns': '{{count}} turns',
    'characterAbilityGroups.sources.specialText': 'Special',
    'characterAbilityGroups.sources.superSpecialText': 'Super Special',
    'characterAbilityGroups.sources.captainAbility': 'Captain',
    'characterAbilityGroups.sources.sailorAbilities': 'Crewmate',
    'characterAbilityGroups.sources.potentialAbilities': 'Potential',
    'characterAbilityGroups.sources.supportData': 'Support',
    'characterAbilityGroups.sources.superTandemData': 'Super Tandem',
    'characterAbilityGroups.sources.finalTapData': 'Final Tap',
    'characterAbilityGroups.sources.rushSugoSpecialData': 'Rush Sugo',
  };
  const translation = translations[key] ?? key;

  if (!params) {
    return translation;
  }

  return Object.entries(params).reduce(
    (text, [paramKey, value]) => text.replace(`{{${paramKey}}}`, String(value)),
    translation,
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
    builderAbilities?: NormalizedBuilderAbility[];
    captainAbility?: string;
    classes?: string[];
    id: number;
    partyConflictKeys?: string[];
    type?: string;
    characterTags?: string[];
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
      characterTags: overrides.characterTags ?? [],
      builderAbilities: overrides.builderAbilities ?? [],
      sailorAbilities: [],
      sailorNotes: null,
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

function createBuilderAbility(
  key: string,
  label: string,
  source: AutoBuildAbilitySource,
): NormalizedBuilderAbility {
  return {
    key,
    label,
    minTurns: null,
    isCompleteRemoval: false,
    slotTokens: [],
    source,
  };
}

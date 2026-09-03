import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  type AbilityFilterTagSetSelection,
  type AbilityTagSetOperator,
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterBox,
  type CharacterDetailRecord,
  type CharacterListItem,
  type CharacterTagSetSelection,
} from '../../core/models/optc.models';
import { createCharacterTagSet } from '../../core/services/character-tag-set.utils';
import { CaptainCoveragePage } from './captain-coverage.page';

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
  IonTitle: class {},
  IonToggle: class {},
  IonToolbar: class {},
}));

describe('CaptainCoveragePage', () => {
  it('loads captain candidates and keeps every character after selecting the Captain slot', async () => {
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
    await page.setTeamSlotCharacter(0, leader);

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
    // The Captain no longer hides anybody: the uncovered character stays in the
    // list and is told apart by `captainBoosted` rather than by disappearing.
    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Rejected Dex Shooter',
      'Covered Dex Fighter',
    ]);
    expect(page.resultCards().map((card) => [card.character.name, card.captainBoosted])).toEqual([
      ['Rejected Dex Shooter', false],
      ['Covered Dex Fighter', true],
    ]);
    expect(page.captainCoverageFilterState().requireCaptainCoverage).toBe(false);
    expect(page.resultCards().find((card) => card.character.id === 2001)?.coverage?.boosts).toEqual(
      {
        hp: 1.3,
        atk: 5,
      },
    );
    expect(page.totalMatchingCharacters()).toBe(2);
    expect(page.boostedMatchingCharacters()).toBe(1);
    expect(page.showsCoverageCount()).toBe(true);
  });

  it('renders simple boost-scope results for Kid Aimed Damned Punk after selecting him as Captain', async () => {
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
    await page.setTeamSlotCharacter(0, kid);

    // Every candidate stays listed; only `captainBoosted` separates them now.
    expect(page.resultCards().map((card) => [card.character.name, card.captainBoosted])).toEqual([
      ['Rejected Tagged Unboosted Candidate', false],
      ['Rejected Untagged STR Candidate', true],
      ['Rejected Candidate', false],
      ['Covered Driven Candidate', true],
      ['Covered STR Candidate', true],
    ]);
    expect(page.totalMatchingCharacters()).toBe(5);
    expect(page.boostedMatchingCharacters()).toBe(3);
  });

  it('never hides uncovered characters and reports coverage per card instead', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Captain Coverage Scope',
      type: 'STR',
      captainAbility: 'Boosts ATK of [DEX] characters by 5x.',
    });
    const coveredCharacter = createCharacter({
      id: 2001,
      name: 'Covered DEX Candidate',
      type: 'DEX',
    });
    const uncoveredCharacter = createCharacter({
      id: 2002,
      name: 'Uncovered QCK Candidate',
      type: 'QCK',
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, coveredCharacter, uncoveredCharacter],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    expect(page.captainCoverageFilterState().requireCaptainCoverage).toBe(false);
    expect(page.resultCards().map((card) => [card.character.name, card.captainBoosted])).toEqual([
      ['Uncovered QCK Candidate', false],
      ['Covered DEX Candidate', true],
    ]);
    expect(page.totalMatchingCharacters()).toBe(2);
    expect(page.boostedMatchingCharacters()).toBe(1);
  });

  it('fills Captain, then Friend Captain, then replaces the Captain from a result card', async () => {
    const leaderOne = createCharacter({
      id: 1001,
      name: 'Leader One',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const leaderTwo = createCharacter({
      id: 1002,
      name: 'Leader Two',
      captainAbility: 'Boosts ATK of all characters by 4x.',
    });
    const leaderThree = createCharacter({
      id: 1003,
      name: 'Leader Three',
      captainAbility: 'Boosts ATK of all characters by 3x.',
    });
    const { page } = createPage({
      captains: [leaderOne, leaderTwo, leaderThree],
      characters: [leaderOne, leaderTwo, leaderThree],
    });

    await page.ngOnInit();

    expect(page.leaderButtonSlotIndex()).toBe(0);
    expect(page.leaderButtonLabel()).toBe('Set as Captain');

    const first = page.resultCards().find((card) => card.character.id === 1001);
    await page.assignLeaderFromResult(first!);

    expect(page.selectedTeamSlots()[0]?.id).toBe(1001);
    expect(page.selectedCaptainDetail()?.id).toBe(1001);
    // Captain taken, so the same button now targets the Friend Captain slot.
    expect(page.leaderButtonSlotIndex()).toBe(1);
    expect(page.leaderButtonLabel()).toBe('Set as Friend Captain');

    const second = page.resultCards().find((card) => card.character.id === 1002);
    await page.assignLeaderFromResult(second!);

    expect(page.selectedTeamSlots()[1]?.id).toBe(1002);
    // Both leader slots taken: the button falls back to replacing the Captain,
    // so a finished team can still be re-led without emptying a slot first.
    expect(page.leaderButtonSlotIndex()).toBe(0);
    expect(page.leaderButtonLabel()).toBe('Set as Captain');

    const third = page.resultCards().find((card) => card.character.id === 1003);
    await page.assignLeaderFromResult(third!);

    expect(page.selectedTeamSlots()[0]?.id).toBe(1003);
    expect(page.selectedTeamSlots()[1]?.id).toBe(1002);
    expect(page.selectedCaptainDetail()?.id).toBe(1003);
  });

  it('refuses the leader button for characters with no Captain Ability or over budget', async () => {
    const subs = [3001, 3002, 3003, 3004].map((id) =>
      createCharacter({ id, name: `Sub ${id}`, cost: 10 }),
    );
    const noCaptainAbility = createCharacter({ id: 2001, name: 'No Captain Ability', cost: 10 });
    const expensiveLeader = createCharacter({
      id: 2002,
      name: 'Expensive Leader',
      captainAbility: 'Boosts ATK of all characters by 2x.',
      cost: 90,
    });
    const { page } = createPage({
      captains: [expensiveLeader],
      characters: [...subs, noCaptainAbility, expensiveLeader],
    });

    await page.ngOnInit();
    page.onMaxTotalCostChange({ detail: { value: '50' } } as CustomEvent<{ value: string }>);

    // Fill every sub slot: that is the state where cost no longer hides cards,
    // so an unaffordable leader is actually on screen and its button must say
    // why it is dead instead of silently doing nothing.
    for (const sub of subs) {
      const card = page.resultCards().find((entry) => entry.character.id === sub.id);
      page.assignCharacterFromResult(card!);
    }

    expect(page.hasFreeSubSlot()).toBe(false);
    expect(page.leaderButtonSlotIndex()).toBe(0);

    const plainCard = page.resultCards().find((card) => card.character.id === 2001);
    const expensiveCard = page.resultCards().find((card) => card.character.id === 2002);

    expect(plainCard?.canBeLeader).toBe(false);
    expect(expensiveCard?.canBeLeader).toBe(true);
    expect(expensiveCard?.leaderFitsBudget).toBe(false);

    await page.assignLeaderFromResult(plainCard!);
    await page.assignLeaderFromResult(expensiveCard!);

    expect(page.selectedTeamSlots()[0]).toBeNull();
  });

  it('keeps every card once the sub slots are full and dies only on the sub button', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Full Team Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const subs = [2001, 2002, 2003, 2004].map((id) => createCharacter({ id, name: `Sub ${id}` }));
    const spare = createCharacter({ id: 2005, name: 'Spare Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, ...subs, spare],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    for (const sub of subs) {
      const card = page.resultCards().find((entry) => entry.character.id === sub.id);
      page.assignCharacterFromResult(card!);
    }

    expect(page.hasFreeSubSlot()).toBe(false);
    const spareCard = page.resultCards().find((card) => card.character.id === 2005);
    expect(spareCard).toBeDefined();
    expect(spareCard?.assignableSlotIndex).toBeNull();
    expect(spareCard?.canBeLeader).toBe(false);
  });

  it('still hides cost-blocked and conflicting characters while a sub slot is free', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Monkey D. Luffy Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      cost: 60,
      partyConflictKeys: ['luffy'],
    });
    const fitting = createCharacter({ id: 2001, name: 'Fitting Candidate', cost: 40 });
    const expensive = createCharacter({ id: 2002, name: 'Expensive Candidate', cost: 41 });
    const conflicting = createCharacter({
      id: 2003,
      name: 'Another Luffy',
      cost: 20,
      partyConflictKeys: ['luffy'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, fitting, expensive, conflicting],
    });

    await page.ngOnInit();
    page.onMaxTotalCostChange({ detail: { value: '100' } } as CustomEvent<{ value: string }>);
    await page.setTeamSlotCharacter(0, leader);

    // Unchanged on purpose: the Captain stops filtering, the game's own rules
    // do not.
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Fitting Candidate']);
  });

  it('keeps the typed search when the Captain is set or cleared', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Search Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const other = createCharacter({ id: 2001, name: 'Search Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, other],
    });

    await page.ngOnInit();
    page.onSearchChange({ detail: { value: 'Search' } } as CustomEvent<{ value: string }>);

    await page.setTeamSlotCharacter(0, leader);
    expect(page.searchTerm()).toBe('Search');

    page.clearTeamSlot(0);
    expect(page.searchTerm()).toBe('Search');
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
    await page.setTeamSlotCharacter(0, leader);
    page.onSearchChange({ detail: { value: 'luffy' } } as CustomEvent<{ value?: string | null }>);

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Luffy Candidate']);

    page.onSearchChange({ detail: { value: '' } } as CustomEvent<{ value?: string | null }>);
    page.toggleFavoritesOnly();
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Ace Candidate']);

    page.toggleHideFavorites();
    expect(page.favoritesOnly()).toBe(false);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Luffy Candidate']);
  });

  it('filters covered character results by type, class, and individual cost range', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Result Filters',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const dexFighter = createCharacter({
      id: 2001,
      name: 'DEX Fighter Candidate',
      type: 'DEX',
      classes: ['Fighter', 'Slasher'],
      cost: 20,
    });
    const strFighter = createCharacter({
      id: 2002,
      name: 'STR Fighter Candidate',
      type: 'STR',
      classes: ['Fighter', 'Slasher'],
      cost: 20,
    });
    const dexShooter = createCharacter({
      id: 2003,
      name: 'DEX Shooter Candidate',
      type: 'DEX',
      classes: ['Shooter', 'Cerebral'],
      cost: 20,
    });
    const expensiveDexFighter = createCharacter({
      id: 2004,
      name: 'Expensive DEX Fighter Candidate',
      type: 'DEX',
      classes: ['Fighter', 'Slasher'],
      cost: 60,
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, dexFighter, strFighter, dexShooter, expensiveDexFighter],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);
    page.onTypeFacetChange({ values: ['DEX'], matchMode: 'any' });
    page.onClassFacetChange({ values: ['Fighter'], matchMode: 'any' });
    page.onCoverageCostRangeChange('min', '10');
    page.onCoverageCostRangeChange('max', '30');

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'DEX Fighter Candidate',
    ]);

    // The facet control's own Clear button emits an empty selection: that is
    // this page's only clear path for type/class.
    page.onTypeFacetChange({ values: [], matchMode: 'any' });
    page.onClassFacetChange({ values: [], matchMode: 'any' });
    page.onCoverageCostRangeChange('min', null);
    page.onCoverageCostRangeChange('max', null);

    expect(page.typeFacet()).toEqual({ values: [], matchMode: 'any' });
    expect(page.classFacet()).toEqual({ values: [], matchMode: 'any' });
    expect(page.coverageCostRange()).toEqual({ min: null, max: null });
    expect(page.resultCards().map((card) => card.character.name)).toEqual(
      expect.arrayContaining([
        'DEX Fighter Candidate',
        'STR Fighter Candidate',
        'DEX Shooter Candidate',
        'Expensive DEX Fighter Candidate',
      ]),
    );
  });

  it('treats a two-value class facet in all mode as an intersection, not a union', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Class Facet',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const both = createCharacter({
      id: 2001,
      name: 'Fighter Slasher',
      classes: ['Fighter', 'Slasher'],
    });
    const fighterOnly = createCharacter({
      id: 2002,
      name: 'Fighter Shooter',
      classes: ['Fighter', 'Shooter'],
    });
    const slasherOnly = createCharacter({
      id: 2003,
      name: 'Slasher Striker',
      classes: ['Slasher', 'Striker'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, both, fighterOnly, slasherOnly],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    page.onClassFacetChange({ values: ['Fighter', 'Slasher'], matchMode: 'any' });
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['Fighter Shooter', 'Fighter Slasher', 'Slasher Striker']);

    page.onClassFacetChange({ values: ['Fighter', 'Slasher'], matchMode: 'all' });
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Fighter Slasher']);
  });

  it('finds a dual-type character by either of its types regardless of stored order', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Dual Type',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    // The dataset stores the same pair in BOTH orders, so an exact-string
    // comparison on `type` would find one of these two and miss the other.
    const intPsy = createCharacter({ id: 2001, name: 'INT PSY Candidate', type: 'INT,PSY' });
    const psyInt = createCharacter({ id: 2002, name: 'PSY INT Candidate', type: 'PSY,INT' });
    const strOnly = createCharacter({ id: 2003, name: 'STR Candidate', type: 'STR' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, intPsy, psyInt, strOnly],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    page.onTypeFacetChange({ values: ['PSY'], matchMode: 'any' });
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['INT PSY Candidate', 'PSY INT Candidate']);

    page.onTypeFacetChange({ values: ['INT'], matchMode: 'any' });
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['INT PSY Candidate', 'PSY INT Candidate']);

    // A dual-type character really does hold both, so `all` over the pair is a
    // satisfiable query on this facet — not a degenerate one.
    page.onTypeFacetChange({ values: ['INT', 'PSY'], matchMode: 'all' });
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['INT PSY Candidate', 'PSY INT Candidate']);
  });

  it('applies no type or class gate while both facets are empty', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Empty Facets',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const dex = createCharacter({ id: 2001, name: 'DEX Candidate', type: 'DEX' });
    const qck = createCharacter({
      id: 2002,
      name: 'QCK Candidate',
      type: 'QCK',
      classes: ['Cerebral'],
    });
    const { page } = createPage({ captains: [leader], characters: [leader, dex, qck] });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    expect(page.typeFacet()).toEqual({ values: [], matchMode: 'any' });
    expect(page.classFacet()).toEqual({ values: [], matchMode: 'any' });
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['DEX Candidate', 'QCK Candidate']);

    // An empty selection whose mode happens to be `all` is still no filter.
    page.onTypeFacetChange({ values: [], matchMode: 'all' });
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['DEX Candidate', 'QCK Candidate']);
  });

  it('supplies a live per-facet match count from the loaded catalog', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Match Count',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      type: 'STR',
      classes: ['Striker'],
    });
    const dexFighter = createCharacter({
      id: 2001,
      name: 'DEX Fighter',
      type: 'DEX',
      classes: ['Fighter', 'Slasher'],
    });
    const dexShooter = createCharacter({
      id: 2002,
      name: 'DEX Shooter',
      type: 'DEX',
      classes: ['Shooter'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, dexFighter, dexShooter],
    });

    await page.ngOnInit();

    // No selection => the count is the whole catalog, so the control never
    // renders a misleading zero before the user has chosen anything.
    expect(page.typeFacetMatchCount()).toBe(3);
    expect(page.classFacetMatchCount()).toBe(3);

    page.onTypeFacetChange({ values: ['DEX'], matchMode: 'any' });
    expect(page.typeFacetMatchCount()).toBe(2);

    page.onClassFacetChange({ values: ['Fighter', 'Slasher'], matchMode: 'all' });
    expect(page.classFacetMatchCount()).toBe(1);

    // A satisfiable `all` pair that simply matches nothing: a real query, and
    // the evidence the control needs before it may claim disjointness.
    page.onClassFacetChange({ values: ['Fighter', 'Striker'], matchMode: 'all' });
    expect(page.classFacetMatchCount()).toBe(0);
  });

  it('restores every result card when the facet controls emit their cleared selection', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Facet Clear',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const dexFighter = createCharacter({
      id: 2001,
      name: 'DEX Fighter Clearable',
      type: 'DEX',
      classes: ['Fighter'],
    });
    const qckShooter = createCharacter({
      id: 2002,
      name: 'QCK Shooter Clearable',
      type: 'QCK',
      classes: ['Shooter'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, dexFighter, qckShooter],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    page.onTypeFacetChange({ values: ['DEX'], matchMode: 'any' });
    page.onClassFacetChange({ values: ['Fighter'], matchMode: 'any' });
    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'DEX Fighter Clearable',
    ]);

    // This page has no clear-all button; `clear()` inside each control is the
    // only reset path, and it arrives here as an empty selection.
    page.onTypeFacetChange({ values: [], matchMode: 'any' });
    page.onClassFacetChange({ values: [], matchMode: 'any' });

    expect(page.typeFacet()).toEqual({ values: [], matchMode: 'any' });
    expect(page.classFacet()).toEqual({ values: [], matchMode: 'any' });
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['DEX Fighter Clearable', 'QCK Shooter Clearable']);
  });

  it('filters result characters by selected character tags (matches any selected tag)', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Filter',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const strawHat = createCharacter({
      id: 2001,
      name: 'Straw Hat Candidate',
      characterTags: ['Straw Hat Pirates'],
    });
    const worstGen = createCharacter({
      id: 2002,
      name: 'Worst Generation Candidate',
      characterTags: ['Worst Generation'],
    });
    const untagged = createCharacter({
      id: 2003,
      name: 'Untagged Candidate',
      characterTags: [],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, strawHat, worstGen, untagged],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    expect(page.availableCharacterTags()).toEqual(['Straw Hat Pirates', 'Worst Generation']);

    page.saveCharacterTagSetSelection(
      createSelection([createCharacterTagSet(['Straw Hat Pirates'], 'any', 'set-1')]),
    );
    expect(page.selectedCharacterTags()).toEqual(['Straw Hat Pirates']);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Straw Hat Candidate']);

    page.saveCharacterTagSetSelection(
      createSelection([
        createCharacterTagSet(['Straw Hat Pirates', 'Worst Generation'], 'any', 'set-1'),
      ]),
    );
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['Straw Hat Candidate', 'Worst Generation Candidate']);

    page.saveCharacterTagSetSelection(
      createSelection([createCharacterTagSet(['Worst Generation'], 'any', 'set-1')]),
    );
    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Worst Generation Candidate',
    ]);

    page.clearSelectedCharacterTags();
    expect(page.selectedCharacterTags()).toEqual([]);
    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['Straw Hat Candidate', 'Untagged Candidate', 'Worst Generation Candidate']);
  });

  it('ANDs character tag groups while ORing the tags inside one group', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Groups',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const strawHatInDressrosa = createCharacter({
      id: 2001,
      name: 'Straw Hat In Dressrosa',
      characterTags: ['Straw Hat Pirates', 'Dressrosa'],
    });
    const heartPirateInDressrosa = createCharacter({
      id: 2002,
      name: 'Heart Pirate In Dressrosa',
      characterTags: ['Heart Pirates', 'Dressrosa'],
    });
    const strawHatElsewhere = createCharacter({
      id: 2003,
      name: 'Straw Hat Elsewhere',
      characterTags: ['Straw Hat Pirates', 'Land of Wano Arc'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, strawHatInDressrosa, heartPirateInDressrosa, strawHatElsewhere],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    // (Straw Hat Pirates OR Heart Pirates) AND (Dressrosa)
    page.saveCharacterTagSetSelection(
      createSelection([
        createCharacterTagSet(['Straw Hat Pirates', 'Heart Pirates'], 'any', 'crew'),
        createCharacterTagSet(['Dressrosa'], 'any', 'arc'),
      ]),
    );

    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['Heart Pirate In Dressrosa', 'Straw Hat In Dressrosa']);

    // Loosening the cross-group join to OR re-admits the Wano Straw Hat.
    page.saveCharacterTagSetSelection(
      createSelection(
        [
          createCharacterTagSet(['Straw Hat Pirates', 'Heart Pirates'], 'any', 'crew'),
          createCharacterTagSet(['Dressrosa'], 'any', 'arc'),
        ],
        'any',
      ),
    );

    expect(
      page
        .resultCards()
        .map((card) => card.character.name)
        .sort(),
    ).toEqual(['Heart Pirate In Dressrosa', 'Straw Hat Elsewhere', 'Straw Hat In Dressrosa']);
  });

  it('requires every tag in a group when that group uses the all operator', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag All',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const bothTags = createCharacter({
      id: 2001,
      name: 'Both Tags Candidate',
      characterTags: ['Straw Hat Pirates', 'Worst Generation'],
    });
    const oneTag = createCharacter({
      id: 2002,
      name: 'One Tag Candidate',
      characterTags: ['Straw Hat Pirates'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, bothTags, oneTag],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    page.saveCharacterTagSetSelection(
      createSelection([
        createCharacterTagSet(['Straw Hat Pirates', 'Worst Generation'], 'all', 'set-1'),
      ]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Both Tags Candidate']);
  });

  it('matches character tags case-insensitively without rewriting the stored casing', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Case',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const strawHat = createCharacter({
      id: 2001,
      name: 'Straw Hat Candidate',
      characterTags: ['Straw Hat Pirates'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, strawHat],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    page.saveCharacterTagSetSelection(
      createSelection([createCharacterTagSet(['  straw hat pirates '], 'any', 'set-1')]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Straw Hat Candidate']);
    // Trimmed, but never case-folded: persisted user tags must not shift.
    expect(page.selectedCharacterTags()).toEqual(['straw hat pirates']);
    expect(page.characterTagSetSelection().sets[0]?.tags).toEqual(['straw hat pirates']);
  });

  it('summarises the tag groups as removable chips and drops a whole group on remove', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Chips',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const strawHat = createCharacter({
      id: 2001,
      name: 'Straw Hat Candidate',
      characterTags: ['Straw Hat Pirates', 'Dressrosa'],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, strawHat],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    expect(page.hasSelectedCharacterTags()).toBe(false);
    expect(page.characterTagFilterTriggerLabel()).toBe('Choose character tags');
    expect(page.characterTagFilterSupportText()).toBe('Group tags with OR inside a group.');

    page.saveCharacterTagSetSelection(
      createSelection([
        createCharacterTagSet(['Straw Hat Pirates', 'Heart Pirates'], 'any', 'crew'),
        createCharacterTagSet(['Dressrosa'], 'all', 'arc'),
      ]),
    );

    expect(page.hasSelectedCharacterTags()).toBe(true);
    expect(page.characterTagSetChips()).toEqual([
      {
        id: 'crew',
        label: 'Straw Hat Pirates or Heart Pirates',
        removeLabel: 'Remove tag group Straw Hat Pirates or Heart Pirates',
      },
      { id: 'arc', label: 'Dressrosa', removeLabel: 'Remove tag group Dressrosa' },
    ]);
    expect(page.characterTagFilterTriggerLabel()).toBe('3 tag(s) in 2 group(s)');
    expect(page.characterTagFilterSupportText()).toBe('Matches every tag group.');

    page.removeCharacterTagSet('crew');

    expect(page.characterTagSetChips().map((chip) => chip.id)).toEqual(['arc']);
    expect(page.selectedCharacterTags()).toEqual(['Dressrosa']);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Straw Hat Candidate']);
  });

  it('opens the tag-set picker only once the dataset actually has tags', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Picker',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const untagged = createCharacter({ id: 2001, name: 'Untagged Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, untagged],
    });

    await page.ngOnInit();

    expect(page.availableCharacterTags()).toEqual([]);

    page.openCharacterTagSetPicker();
    expect(page.characterTagSetPickerOpen()).toBe(false);

    page.availableCharacterTags.set(['Straw Hat Pirates']);
    page.openCharacterTagSetPicker();
    expect(page.characterTagSetPickerOpen()).toBe(true);

    page.closeCharacterTagSetPicker();
    expect(page.characterTagSetPickerOpen()).toBe(false);
  });

  it('indexes character ids per tag so the picker can preview match counts', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Index',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      characterTags: ['Straw Hat Pirates'],
    });
    const strawHat = createCharacter({
      id: 2001,
      name: 'Straw Hat Candidate',
      characterTags: ['Straw Hat Pirates', '  Dressrosa  '],
    });
    const untagged = createCharacter({ id: 2002, name: 'Untagged Candidate', characterTags: [''] });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, strawHat, untagged],
    });

    await page.ngOnInit();

    const matchIndex = page.characterTagMatchIndex();

    expect(matchIndex.get('straw hat pirates')).toEqual([1001, 2001]);
    expect(matchIndex.get('dressrosa')).toEqual([2001]);
    expect(matchIndex.has('')).toBe(false);
  });

  it('preloads both tag-set picker scopes before either modal can open', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Scope',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const { page, i18n } = createPage({ captains: [leader], characters: [leader] });

    await page.ngOnInit();

    expect(i18n.preloadScope).toHaveBeenCalledWith('character-tag-sets');
    // The page renders both pickers, so skipping either scope leaves that
    // modal rendering raw i18n keys on first open.
    expect(i18n.preloadScope).toHaveBeenCalledWith('ability-tag-sets');
  });

  it('degrades to no character tags when the repository tag lookup rejects', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Reject',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      characterTags: ['Straw Hat Pirates'],
    });
    const { page, repository } = createPage({
      captains: [leader],
      characters: [leader],
    });
    repository.getAvailableCharacterTags.mockRejectedValueOnce(new Error('tag lookup failed'));

    await expect(page.ngOnInit()).resolves.toBeUndefined();

    expect(page.availableCharacterTags()).toEqual([]);
    expect(page.loading()).toBe(false);
  });

  it('degrades to no character tags when the repository lacks a tag lookup method', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Missing',
      captainAbility: 'Boosts ATK of all characters by 5x.',
      characterTags: ['Straw Hat Pirates'],
    });
    const { page, repository } = createPage({
      captains: [leader],
      characters: [leader],
    });
    (repository as { getAvailableCharacterTags?: unknown }).getAvailableCharacterTags = undefined;

    await expect(page.ngOnInit()).resolves.toBeUndefined();

    expect(page.availableCharacterTags()).toEqual([]);
  });

  it('limits covered character results to the selected character box', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Box Scope',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const inBoxCharacter = createCharacter({ id: 2001, name: 'In Box Candidate' });
    const outsideBoxCharacter = createCharacter({ id: 2002, name: 'Outside Box Candidate' });
    const { page, userState } = createPage({
      captains: [leader],
      characters: [leader, inBoxCharacter, outsideBoxCharacter],
      characterBoxes: [createCharacterBox('box-1', 'Coverage Box', [2001])],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    expect(userState.readyCharacterBoxes).toHaveBeenCalledOnce();
    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Outside Box Candidate',
      'In Box Candidate',
    ]);

    page.onCharacterBoxChange({
      detail: { value: 'box-1' },
    } as CustomEvent<{ value?: string | null }>);

    expect(page.selectedCharacterBox()?.name).toBe('Coverage Box');
    expect(page.selectedCharacterBoxIds()).toEqual([2001]);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['In Box Candidate']);
    expect(page.characterBoxSupportLabel()).toBe(
      'captain-coverage.filters.characterBox.support.withCount',
    );
  });

  it('intersects favorites-only results with the selected character box', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Favorite Box',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const favoriteInBox = createCharacter({ id: 2001, name: 'Favorite Candidate' });
    const nonFavoriteInBox = createCharacter({ id: 2002, name: 'Plain Candidate' });
    const favoriteOutsideBox = createCharacter({ id: 2003, name: 'Outside Favorite' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, favoriteInBox, nonFavoriteInBox, favoriteOutsideBox],
      favoriteIds: [2001, 2003],
      characterBoxes: [createCharacterBox('box-1', 'Favorite Box', [2001, 2002])],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);
    page.onCharacterBoxChange({
      detail: { value: 'box-1' },
    } as CustomEvent<{ value?: string | null }>);
    page.toggleFavoritesOnly();

    expect(page.selectedCharacterBoxFavoriteCount()).toBe(1);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Favorite Candidate']);
    expect(page.characterBoxSupportLabel()).toBe(
      'captain-coverage.filters.characterBox.support.withFavorites',
    );
  });

  it('returns no covered results when the selected character box is empty', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Empty Box',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const coveredCharacter = createCharacter({ id: 2001, name: 'Covered Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, coveredCharacter],
      characterBoxes: [createCharacterBox('empty-box', 'Empty Box', [])],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    expect(page.resultCards()).toHaveLength(1);

    page.onCharacterBoxChange({
      detail: { value: 'empty-box' },
    } as CustomEvent<{ value?: string | null }>);

    expect(page.selectedCharacterBox()?.name).toBe('Empty Box');
    expect(page.resultCards()).toEqual([]);
    expect(page.totalMatchingCharacters()).toBe(0);
  });

  it('clears missing selected character box ids when character boxes are loaded', async () => {
    const { page } = createPage({
      characterBoxes: [createCharacterBox('box-1', 'Available Box', [2001])],
    });

    page.selectedCharacterBoxId.set('deleted-box');

    await page.ngOnInit();

    expect(page.selectedCharacterBoxId()).toBeNull();
    expect(page.selectedCharacterBox()).toBeNull();
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
    await page.setTeamSlotCharacter(0, leader);

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
    await page.setTeamSlotCharacter(0, leader);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'No Utility',
      'Orb Booster',
      'Bind Reducer',
    ]);

    page.saveAbilityTagSetSelection(
      createTagSetSelection([{ abilityKeys: ['remove_bind', 'boost_orb'] }]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Orb Booster',
      'Bind Reducer',
    ]);
    expect(page.resultCards().map((card) => card.abilityMatchCount)).toEqual([1, 1]);
    expect(page.hasSelectedAbilityTags()).toBe(true);
    expect(page.abilityTagSetChips()).toHaveLength(1);
  });

  it('ANDs separate tag sets and ORs the tags inside one set', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Tag Sets',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const bothMatcher = createCharacter({ id: 2001, name: 'Both Matcher' });
    const bindOnly = createCharacter({ id: 2002, name: 'Bind Only' });
    const orbOnly = createCharacter({ id: 2003, name: 'Orb Only' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, bothMatcher, bindOnly, orbOnly],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001, 2002]),
        createAbilityCatalogItem('boost_orb', 'Boost Orb Effects', 'special', [2001, 2003]),
      ]),
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    page.saveAbilityTagSetSelection(
      createTagSetSelection([{ abilityKeys: ['remove_bind', 'boost_orb'] }]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Orb Only',
      'Bind Only',
      'Both Matcher',
    ]);

    page.saveAbilityTagSetSelection(
      createTagSetSelection([{ abilityKeys: ['remove_bind'] }, { abilityKeys: ['boost_orb'] }]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Both Matcher']);

    page.saveAbilityTagSetSelection(
      createTagSetSelection(
        [{ abilityKeys: ['remove_bind'] }, { abilityKeys: ['boost_orb'] }],
        'any',
      ),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Orb Only',
      'Bind Only',
      'Both Matcher',
    ]);
  });

  it('requires every tag of a set when that set uses the all operator', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Set Operator',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const bothMatcher = createCharacter({ id: 2001, name: 'Both Matcher' });
    const bindOnly = createCharacter({ id: 2002, name: 'Bind Only' });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, bothMatcher, bindOnly],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001, 2002]),
        createAbilityCatalogItem('boost_orb', 'Boost Orb Effects', 'special', [2001]),
      ]),
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);
    page.saveAbilityTagSetSelection(
      createTagSetSelection([{ abilityKeys: ['remove_bind', 'boost_orb'], operator: 'all' }]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Both Matcher']);
  });

  it('filters covered results to characters with Super Tandem data when enabled', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Super Tandem Filter',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const superTandemCandidate = createCharacter({
      id: 2001,
      name: 'Structured Super Tandem',
      superTandemData: {
        requirement: 'On the last stage',
        levels: [{ level: 5, effect: 'Boosts Tandem ATK by 2.5x.' }],
        criteria: null,
      },
    });
    const noSuperTandemCandidate = createCharacter({
      id: 2002,
      name: 'No Super Tandem',
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, superTandemCandidate, noSuperTandemCandidate],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'No Super Tandem',
      'Structured Super Tandem',
    ]);

    page.onRequireSuperTandemPresenceChange({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Structured Super Tandem',
    ]);
  });

  it('filters covered results to characters with Super Type or Super Class data when enabled', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Super Types Classes Filter',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const superTypeCandidate = createCharacter({
      id: 2001,
      name: 'Structured Super Type',
      superType: { specialEffect: 'Changes DEX characters to Super DEX.' },
    });
    const superClassCandidate = createCharacter({
      id: 2002,
      name: 'Structured Super Class',
      superClass: { specialEffect: 'Transforms Fighter characters into Super Fighter characters.' },
    });
    const noSuperTypesClassesCandidate = createCharacter({
      id: 2003,
      name: 'No Super Types Classes',
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, superTypeCandidate, superClassCandidate, noSuperTypesClassesCandidate],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'No Super Types Classes',
      'Structured Super Class',
      'Structured Super Type',
    ]);

    page.onRequireSuperTypesClassesPresenceChange({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Structured Super Class',
      'Structured Super Type',
    ]);
  });

  it('shows all assignable characters before selecting a Captain', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Free Browse',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const firstCandidate = createCharacter({ id: 2001, name: 'First Browse Candidate' });
    const secondCandidate = createCharacter({ id: 2002, name: 'Second Browse Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [firstCandidate, secondCandidate],
    });

    await page.ngOnInit();

    expect(page.selectedCaptainDetail()).toBeNull();
    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Second Browse Candidate',
      'First Browse Candidate',
    ]);
    expect(page.resultCards().map((card) => card.coverage)).toEqual([null, null]);
    expect(page.totalMatchingCharacters()).toBe(2);
  });

  it('adds a no-Captain result to the first compatible empty sub slot', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Free Assign',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const firstCandidate = createCharacter({ id: 2001, name: 'First Assign Candidate' });
    const { page } = createPage({
      captains: [leader],
      characters: [firstCandidate],
    });

    await page.ngOnInit();
    page.assignCharacterFromResult(page.resultCards()[0]!);

    expect(page.selectedCaptainDetail()).toBeNull();
    expect(page.selectedCaptain()).toBeNull();
    expect(page.selectedTeamSlots()[2]?.id).toBe(2001);
  });

  it('filters no-Captain results by Super Tandem and Super Types/Classes presence', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Free Super Filters',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const tandemOnly = createCharacter({
      id: 2001,
      name: 'Tandem Only',
      superTandemData: {
        requirement: 'On the last stage',
        levels: [{ level: 5, effect: 'Boosts Tandem ATK by 2.5x.' }],
        criteria: null,
      },
    });
    const superTypeOnly = createCharacter({
      id: 2002,
      name: 'Super Type Only',
      superType: { specialEffect: 'Changes DEX characters to Super DEX.' },
    });
    const bothCapabilities = createCharacter({
      id: 2003,
      name: 'Both Super Capabilities',
      superType: { specialEffect: 'Changes DEX characters to Super DEX.' },
      superTandemData: {
        requirement: 'On the last stage',
        levels: [{ level: 5, effect: 'Boosts Tandem ATK by 2.5x.' }],
        criteria: null,
      },
    });
    const noSuperCapabilities = createCharacter({
      id: 2004,
      name: 'No Super Capabilities',
    });
    const { page } = createPage({
      captains: [leader],
      characters: [tandemOnly, superTypeOnly, bothCapabilities, noSuperCapabilities],
    });

    await page.ngOnInit();

    page.onRequireSuperTandemPresenceChange({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Both Super Capabilities',
      'Tandem Only',
    ]);

    page.onRequireSuperTypesClassesPresenceChange({
      detail: { checked: true },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Both Super Capabilities',
    ]);

    page.onRequireSuperTandemPresenceChange({
      detail: { checked: false },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Both Super Capabilities',
      'Super Type Only',
    ]);
  });

  it('builds every ability section and opens or clears the one tag-set picker', async () => {
    const { page } = createPage({
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem(
          'remove_despair',
          'Remove Despair',
          'special',
          [2001],
          ['captainAbility'],
        ),
      ]),
    });

    await page.ngOnInit();

    expect(page.abilityTagSetPickerSections().map((section) => section.category)).toEqual([
      'captainAbility',
      'special',
      'crewmate',
      'potential',
      'support',
    ]);
    expect(page.abilityTagSetPickerSections()[0]).toMatchObject({
      category: 'captainAbility',
      label: 'Required',
      captainAbility: true,
    });
    expect(page.hasAbilityFilterSections()).toBe(true);
    expect(page.hasSelectedAbilityTags()).toBe(false);
    expect(page.abilityFilterTriggerLabel()).toBe(
      'captain-coverage.filters.abilityTagSets.trigger.empty',
    );

    page.openAbilityTagSetPicker();
    expect(page.abilityTagSetPickerOpen()).toBe(true);

    page.saveAbilityTagSetSelection(
      createTagSetSelection([{ abilityKeys: ['remove_despair'], captainAbility: true }]),
    );
    expect(page.abilityTagSetPickerOpen()).toBe(false);
    expect(page.tagSetSelection().sets).toHaveLength(1);
    expect(page.abilityTagSetChips()).toHaveLength(1);
    expect(page.abilityFilterTriggerLabel()).toBe(
      'captain-coverage.filters.abilityTagSets.trigger.active',
    );

    page.clearSelectedAbilityTags();
    expect(page.tagSetSelection().sets).toEqual([]);
    expect(page.abilityTagSetChips()).toEqual([]);
    expect(page.hasSelectedAbilityTags()).toBe(false);
  });

  it('drops one whole group when its page chip is removed, and leaves the rest', async () => {
    const { page } = createPage({
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem('remove_bind', 'Remove Bind', 'special', [2001]),
        createAbilityCatalogItem('reduce_bind', 'Reduce Bind', 'potential', [2002]),
      ]),
    });

    await page.ngOnInit();
    page.saveAbilityTagSetSelection(
      createTagSetSelection([
        { abilityKeys: ['remove_bind', 'reduce_bind'] },
        { abilityKeys: ['reduce_bind'] },
      ]),
    );

    expect(page.abilityTagSetChips().map((chip) => chip.id)).toEqual(['set-1', 'set-2']);

    page.removeAbilityTagSet('set-2');

    expect(page.abilityTagSetChips().map((chip) => chip.id)).toEqual(['set-1']);
    expect(page.tagSetSelection().sets).toHaveLength(1);
    expect(page.tagSetSelection().sets[0]?.requirements.map((item) => item.abilityKey)).toEqual([
      'remove_bind',
      'reduce_bind',
    ]);
  });

  it('applies Required Captain Ability filters to each character own Captain Ability tags', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Captain Ability Filter',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const captainBindReducer = createCharacter({
      id: 2001,
      name: 'Captain Bind Reducer',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'captainAbility')],
    });
    const specialBindReducer = createCharacter({
      id: 2002,
      name: 'Special Bind Reducer',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'specialText')],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, captainBindReducer, specialBindReducer],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem(
          'remove_bind',
          'Remove Bind',
          'special',
          [2001, 2002],
          ['captainAbility', 'specialText'],
          [2001],
        ),
      ]),
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);
    page.saveAbilityTagSetSelection(
      createTagSetSelection([{ abilityKeys: ['remove_bind'], captainAbility: true }]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Captain Bind Reducer']);
    expect(page.resultCards()[0]?.matchedAbilityBadges.map((badge) => badge.label)).toEqual([
      'Captain: Remove Bind',
    ]);
  });

  it('treats selected Required Captain Ability filters as source-scoped OR matches', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Captain Ability Or',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const captainBindReducer = createCharacter({
      id: 2001,
      name: 'Captain Bind Reducer',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'captainAbility')],
    });
    const captainDespairReducer = createCharacter({
      id: 2002,
      name: 'Captain Despair Reducer',
      builderAbilities: [
        createBuilderAbility('remove_despair', 'Remove Despair', 'captainAbility'),
      ],
    });
    const specialBindReducer = createCharacter({
      id: 2003,
      name: 'Special Bind Reducer',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'specialText')],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, captainBindReducer, captainDespairReducer, specialBindReducer],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem(
          'remove_bind',
          'Remove Bind',
          'special',
          [2001, 2003],
          ['captainAbility', 'specialText'],
          [2001],
        ),
        createAbilityCatalogItem(
          'remove_despair',
          'Remove Despair',
          'special',
          [2002],
          ['captainAbility'],
          [2002],
        ),
      ]),
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);
    page.saveAbilityTagSetSelection(
      createTagSetSelection([
        { abilityKeys: ['remove_bind', 'remove_despair'], captainAbility: true },
      ]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Captain Despair Reducer',
      'Captain Bind Reducer',
    ]);
  });

  it('ANDs a Required Captain Ability set with a non-captain ability set', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Leader Captain Ability And',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const bothMatcher = createCharacter({
      id: 2001,
      name: 'Both Matcher',
      builderAbilities: [
        createBuilderAbility('remove_bind', 'Remove Bind', 'specialText'),
        createBuilderAbility('remove_despair', 'Remove Despair', 'captainAbility'),
      ],
    });
    const specialOnly = createCharacter({
      id: 2002,
      name: 'Special Only',
      builderAbilities: [createBuilderAbility('remove_bind', 'Remove Bind', 'specialText')],
    });
    const captainOnly = createCharacter({
      id: 2003,
      name: 'Captain Only',
      builderAbilities: [
        createBuilderAbility('remove_despair', 'Remove Despair', 'captainAbility'),
      ],
    });
    const { page } = createPage({
      captains: [leader],
      characters: [leader, bothMatcher, specialOnly, captainOnly],
      abilityCatalog: createAbilityCatalog([
        createAbilityCatalogItem(
          'remove_bind',
          'Remove Bind',
          'special',
          [2001, 2002],
          ['specialText'],
        ),
        createAbilityCatalogItem(
          'remove_despair',
          'Remove Despair',
          'special',
          [2001, 2003],
          ['captainAbility'],
          [2001, 2003],
        ),
      ]),
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);
    page.saveAbilityTagSetSelection(
      createTagSetSelection([
        { abilityKeys: ['remove_bind'] },
        { abilityKeys: ['remove_despair'], captainAbility: true },
      ]),
    );

    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Both Matcher']);
    expect(page.resultCards()[0]?.abilityMatchCount).toBe(2);
    expect(page.resultCards()[0]?.selectedAbilityCount).toBe(2);
    expect(page.resultCards()[0]?.matchedAbilityBadges.map((badge) => badge.label)).toEqual([
      'Special: Remove Bind',
      'Captain: Remove Despair',
    ]);
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
    page.saveAbilityTagSetSelection(
      createTagSetSelection([
        { abilityKeys: ['remove_bind', 'reduce_bind', 'support_remove_bind'] },
      ]),
    );
    await page.setTeamSlotCharacter(0, leader);

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
    page.saveAbilityTagSetSelection(
      createTagSetSelection([{ abilityKeys: ['remove_bind', 'boost_orb', 'reduce_bind'] }]),
    );
    await page.setTeamSlotCharacter(0, leader);

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
    expect(page.resultCards().map((card) => card.character.name)).toEqual([
      'Early Bind Reducer',
      'Leader Before Filters',
    ]);
    expect(page.hasAbilityFilterSections()).toBe(true);

    page.openAbilityTagSetPicker();
    expect(page.abilityTagSetPickerOpen()).toBe(true);

    page.saveAbilityTagSetSelection(createTagSetSelection([{ abilityKeys: ['remove_bind'] }]));
    expect(page.selectedAbilityRequirementCount()).toBe(1);
    expect(page.resultCards().map((card) => card.character.name)).toEqual(['Early Bind Reducer']);

    page.onAbilityMatchRankingChange({
      detail: { checked: true },
    } as CustomEvent<{ checked?: boolean | null }>);
    expect(page.abilityMatchRankingEnabled()).toBe(true);

    await page.setTeamSlotCharacter(0, leader);

    expect(page.selectedAbilityRequirementCount()).toBe(1);
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
    page.saveAbilityTagSetSelection(
      createTagSetSelection([{ abilityKeys: ['remove_bind', 'reduce_bind'] }]),
    );
    await page.setTeamSlotCharacter(0, leader);

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
    await page.setTeamSlotCharacter(0, leader);
    page.assignCharacterFromResult(page.resultCards()[0]);

    expect(page.selectedTeamSlots()[2]?.id).toBe(2001);
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
    await page.setTeamSlotCharacter(0, leader);

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

    await page.setTeamSlotCharacter(0, expensiveLeader);
    expect(page.selectedCaptain()).toBeNull();

    await page.setTeamSlotCharacter(0, cheapLeader);
    expect(page.selectedCaptain()?.id).toBe(1001);

    // Friend Captain cost is never counted, so the budget cannot block slot 1.
    await page.setTeamSlotCharacter(1, expensiveLeader);
    expect(page.selectedTeamSlots()[1]?.id).toBe(1002);

    // 100 minus the Captain's 80 leaves 20 for the subs.
    await page.setTeamSlotCharacter(2, expensiveSub);
    expect(page.selectedTeamSlots()[2]).toBeNull();

    await page.setTeamSlotCharacter(2, fittingSub);
    expect(page.selectedTeamSlots()[2]?.id).toBe(2002);
  });

  it('survives a slot tap before the results section is attached', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Scroll Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const { page } = createPage({ captains: [leader], characters: [leader] });

    await page.ngOnInit();

    // No modal to open any more, and no view attached in this harness: the slot
    // tap must stay a no-op instead of throwing on a missing element.
    expect(() => page.scrollToResults()).not.toThrow();
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
    const friendCaptain = createCharacter({
      id: 1002,
      name: 'Friend Captain',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const subs = [2001, 2002, 2003, 2004].map((id) => createCharacter({ id }));
    const { page } = createPage({
      captains: [leader, friendCaptain],
      characters: [leader, friendCaptain, ...subs],
    });

    await page.ngOnInit();
    await page.setTeamSlotCharacter(0, leader);
    await page.setTeamSlotCharacter(1, friendCaptain);

    expect(page.teamConditionStatus()?.state).toBe('pending');

    for (const [index, sub] of subs.entries()) {
      await page.setTeamSlotCharacter(index + 2, sub);
    }

    expect(page.teamConditionStatus()?.state).toBe('full');
    expect(page.teamConditionStatus()?.passedLeaderLabels).toEqual([
      'captain-coverage.team.slots.captain',
      'captain-coverage.team.slots.friendCaptain',
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
    await page.setTeamSlotCharacter(0, leader);

    for (const [index, sub] of subs.entries()) {
      await page.setTeamSlotCharacter(index + 2, sub);
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

  it('loads a saved team route as a captain coverage draft and preserves Friend Captain', async () => {
    const leader = createCharacter({
      id: 1001,
      name: 'Saved Leader',
      captainAbility: 'Boosts ATK of all characters by 5x.',
    });
    const friendCaptain = createCharacter({
      id: 1002,
      name: 'Saved Friend Captain',
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
      1001, 1002, 2001, 2002, 2003, 2004,
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
    page.selectedTeamSlots.set([leader, null, null, null, null, null]);
    page.selectedCaptainDetail.set(leader);

    await page.ngOnInit();

    expect(page.teamName()).toBe('Existing Coverage Draft');
    expect(page.selectedTeamSlots().map((slot) => slot?.id ?? null)).toEqual([
      1001,
      null,
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

  it('keeps the slot, ability filter, and result surfaces wired in the template', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/captain-coverage/captain-coverage.page.html'),
      'utf8',
    );

    // Team slots no longer open a picker: characters come from the result list
    // only, and tapping a slot just moves the user down to it.
    expect(template).not.toContain('<app-character-image-picker');
    expect(template).not.toContain('openTeamSlotPicker');
    expect(template).not.toContain('saveTeamSlotSelection');
    expect(template).not.toContain("t('team.picker.");
    expect(template).toContain('class="coverage-team-slot__pick"');
    expect(template).toContain('(click)="scrollToResults()"');
    expect(template).toContain('<section class="results-panel glass-card" #resultsPanel>');
    expect(template).toContain('class="results-toolbar__heading"');
    expect(template).not.toContain('<app-ability-filter-rail');
    expect(template).toContain('data-testid="captain-coverage-ability-filter-trigger"');
    expect(template).toContain('abilityFilterTriggerLabel()');
    expect(template).toContain('removeAbilityTagSet(chip.id)');
    expect(template).toContain('clearSelectedAbilityTags()');
    expect(template).toContain('abilityFilterSupportText()');
    expect(template).toContain('class="results-toolbar__toggle-grid"');
    expect(template).toContain('[disabled]="loading()"');
    expect(template).toContain('openAbilityTagSetPicker()');
    expect(template).toContain('abilityMatchRankingEnabled()');
    expect(template).toContain('abilityMatchRankingDisabled()');
    expect(template).toContain('onAbilityMatchRankingChange($event)');
    expect(template).toContain("t('filters.bestAbilityMatchesFirst')");
    // The old bypass toggle stays gone: coverage no longer gates the list, so
    // there is nothing left to bypass.
    expect(template).not.toContain('requireCaptainCoverage()');
    expect(template).toContain('data-test="captain-result-set-leader"');
    expect(template).toContain('assignLeaderFromResult(card)');
    expect(template).toContain('[icon]="leaderButtonIcon()"');
    expect(template).toContain('!card.canBeLeader || !card.leaderFitsBudget');
    expect(template).toContain('data-test="captain-result-not-boosted"');
    expect(template).toContain("t('results.notBoostedBadge')");
    expect(template).toContain("t('results.titleWithCoverage'");
    expect(template).toContain('showsCoverageCount()');
    expect(template).toContain('[debounce]="500"');
    expect(template).toContain('[costDebounce]="500"');
    expect(template).not.toContain("t('filters.captainCoverage.toggle')");
    expect(template).not.toContain('captainCoverageSupportLabel()');
    expect(template).not.toContain('onRequireCaptainCoverageChange($event)');
    expect(template).not.toContain('requireFullCaptainAbilityCoverage()');
    expect(template).not.toContain("t('filters.captainAbilityCoverage.toggle')");
    expect(template).not.toContain('onRequireFullCaptainAbilityCoverageChange($event)');
    expect(template).toContain("t('filters.tierCoverage.toggle')");
    expect(template).toContain('requireSuperTandemPresence()');
    expect(template).toContain("t('filters.superTandemPresence.toggle')");
    expect(template).toContain('onRequireSuperTandemPresenceChange($event)');
    expect(template).toContain('requireSuperTypesClassesPresence()');
    expect(template).toContain("t('filters.superTypesClassesPresence.toggle')");
    expect(template).toContain('onRequireSuperTypesClassesPresenceChange($event)');
    expect(template).toContain('<app-ability-tag-set-picker');
    expect(template).toContain('[isOpen]="abilityTagSetPickerOpen()"');
    expect(template).toContain('[title]="t(\'filters.abilityTagSetsTitle\')"');
    expect(template).toContain('[sections]="abilityTagSetPickerSections()"');
    expect(template).toContain('[selection]="tagSetSelection()"');
    expect(template).toContain('(dismiss)="closeAbilityTagSetPicker()"');
    expect(template).toContain('(saveSelection)="saveAbilityTagSetSelection($event)"');
    expect(template).toContain('modalScopeClass="captain-coverage-ability-modal"');
    expect(template).toContain('[collapsibleTileCounts]="true"');
    expect(template).toContain('[captainScopedTileCounts]="true"');
    expect(template).toContain('[showHelp]="true"');
    expect(template).toContain('[scopeMarkers]="true"');
    expect(template).toContain('@for (card of visibleResultCards(); track');
    expect(template).toContain('data-testid="captain-coverage-load-more"');
    expect(template).not.toContain('<app-ability-requirement-picker');
    expect(template).not.toContain('<app-special-ability-picker');
    expect(template).not.toContain('captainAbilityDrafts()');
    expect(template).not.toContain('specialAbilityDrafts()');
    expect(template).not.toContain('crewmateAbilityDrafts()');
    expect(template).not.toContain('potentialAbilityDrafts()');
    expect(template).not.toContain('supportAbilityDrafts()');
    expect(template).toContain('resultCards()');
    expect(template).toContain('<app-character-filter-row');
    expect(template).toContain('<app-character-facet-filter');
    expect(template).toContain('kind="type"');
    expect(template).toContain('kind="class"');
    expect(template).toContain('presentation="chips"');
    expect(template).toContain('presentation="select"');
    expect(template).toContain('testIdPrefix="captain-coverage"');
    expect(template).toContain('[selection]="typeFacet()"');
    expect(template).toContain('[selection]="classFacet()"');
    expect(template).toContain('[options]="availableTypes()"');
    expect(template).toContain('[options]="availableClasses()"');
    expect(template).toContain('[matchCount]="typeFacetMatchCount()"');
    expect(template).toContain('[matchCount]="classFacetMatchCount()"');
    expect(template).toContain('(selectionChange)="onTypeFacetChange($event)"');
    expect(template).toContain('(selectionChange)="onClassFacetChange($event)"');
    expect(template).toContain("t('filters.type.label')");
    expect(template).toContain("t('filters.class.label')");
    expect(template).toContain("t('filters.type.placeholder')");
    expect(template).toContain("t('filters.class.placeholder')");
    // The retired typeahead surface is gone from the filter row on this page.
    expect(template).not.toContain('[showTypeFilter]');
    expect(template).not.toContain('[showClassFilter]');
    expect(template).not.toContain('[typeQuery]');
    expect(template).not.toContain('[classQuery]');
    expect(template).not.toContain('[selectedType]');
    expect(template).not.toContain('[selectedClass]');
    expect(template).not.toContain('(typeSelected)');
    expect(template).not.toContain('(classSelected)');
    expect(template).not.toContain('(typeCleared)');
    expect(template).not.toContain('(classCleared)');
    expect(template).toContain("t('filters.cost.from')");
    expect(template).toContain("t('filters.cost.to')");
    expect(template).toContain('onFavoritesOnlyFilterChange($event)');
    expect(template).toContain('onHideFavoritesFilterChange($event)');
    expect(template).toContain("t('filters.characterBox.label')");
    expect(template).toContain('selectedCharacterBoxId()');
    expect(template).toContain('characterBoxFilterOptions()');
    expect(template).toContain('onCharacterBoxChange($event)');
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
    expect(template).toContain('@if (card.coverage; as coverage)');
    expect(template).toContain('HP:{{ formatBoost(coverage.boosts.hp) }}');
    expect(template).toContain('ATK:{{ formatBoost(coverage.boosts.atk) }}');
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
    expect(template).toContain('class="coverage-tag-filter"');
    expect(template).toContain("t('filters.characterTags.label')");
    expect(template).toContain('[attr.aria-label]="t(\'filters.characterTags.label\')"');
    expect(template).toContain('hasSelectedCharacterTags()');
    expect(template).toContain('(click)="clearSelectedCharacterTags()"');
    expect(template).toContain('data-testid="captain-coverage-character-tag-trigger"');
    expect(template).toContain('[disabled]="loading() || !availableCharacterTags().length"');
    expect(template).toContain('(click)="openCharacterTagSetPicker()"');
    expect(template).toContain('characterTagFilterTriggerLabel()');
    expect(template).toContain('characterTagSetChips()');
    expect(template).toContain('(click)="removeCharacterTagSet(chip.id)"');
    expect(template).toContain('characterTagFilterSupportText()');
    expect(template).toContain('<app-character-tag-set-picker');
    expect(template).toContain('[isOpen]="characterTagSetPickerOpen()"');
    expect(template).toContain('[availableTags]="availableCharacterTags()"');
    expect(template).toContain('[selection]="characterTagSetSelection()"');
    expect(template).toContain('[tagCharacterIds]="characterTagMatchIndex()"');
    expect(template).toContain('(dismiss)="closeCharacterTagSetPicker()"');
    expect(template).toContain('(saveSelection)="saveCharacterTagSetSelection($event)"');
    // The inline combobox is gone: every tag now flows through the modal.
    expect(template).not.toContain('character-tag-search');
    expect(template).not.toContain('character-tag-suggestion');
    expect(template).not.toContain('addSelectedCharacterTag');
  });

  it('keeps the result title from sharing the desktop auto column with filters', () => {
    const tierStyles = readFileSync(
      resolve(
        process.cwd(),
        'src/app/pages/captain-coverage/captain-coverage-tier-panel.component.scss',
      ),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const responsiveStyles = readFileSync(
      resolve(
        process.cwd(),
        'src/app/pages/captain-coverage/captain-coverage-responsive-panel.component.scss',
      ),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(tierStyles).toContain('.results-toolbar__heading,\n.coverage-ability-filters');
    expect(responsiveStyles).toContain('.results-toolbar__heading,\n  .coverage-ability-filters');
    expect(tierStyles).toContain('.results-toolbar__toggle-grid');
    expect(tierStyles).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));',
    );
    expect(responsiveStyles).toContain('grid-column: 1 / -1;');
  });

  /*
   * Layout pass. The tier explanation used to be a permanently mounted section
   * inside `.results-toolbar__toggle-grid`. Grid rows stretch to their tallest
   * cell, so that one panel padded every toggle card in its row with empty
   * space. It now opens from a help button on the chip it explains.
   */
  it('moves the tier explanation into a per-chip help popover', () => {
    const template = readCaptainCoverageTemplate();

    expect(template).not.toContain('captain-tier-breakdown--inline');
    expect(template).not.toContain("t('filters.tierCoverage.panelEyebrow')");
    expect(template).not.toContain("t('filters.tierCoverage.panelTitle')");
    expect(template).toContain('class="tier-chip"');
    expect(template).toContain("'tier-coverage-help-' + tier");
    expect(template).toContain("'tier-coverage-popover-' + tier");
    expect(template).toContain('(click)="toggleTierHelp(tier)"');
    expect(template).toContain('@if (tierHelpView(tier); as help)');
    expect(template).toContain('[title]="tierCoverageChipTitle(tier)"');
    // The popover still renders the same clause lists the section used to.
    expect(template).toContain('captain-tier-breakdown__conditions');
    expect(template).toContain('captain-tier-breakdown__effects');
  });

  it('pairs the two filter triggers and drops the search bar to its own last row', () => {
    const template = readCaptainCoverageTemplate();
    const pairIndex = template.indexOf('<div class="coverage-filter-pair">');
    const abilityIndex = template.indexOf('coverage-tag-filter coverage-ability-filters');
    const tagTriggerIndex = template.indexOf('data-testid="captain-coverage-character-tag-trigger"');
    const controlsIndex = template.indexOf('<div class="results-controls">');
    const searchIndex = template.indexOf('<ion-searchbar');
    const filterRowIndex = template.indexOf('<app-character-filter-row');

    expect(pairIndex).toBeGreaterThan(-1);
    // Both group filters live inside the pair, above the toggle grid.
    expect(abilityIndex).toBeGreaterThan(pairIndex);
    expect(tagTriggerIndex).toBeGreaterThan(pairIndex);
    expect(tagTriggerIndex).toBeLessThan(controlsIndex);
    // Search is the last control, immediately above the result grid.
    expect(searchIndex).toBeGreaterThan(controlsIndex);
    expect(searchIndex).toBeGreaterThan(filterRowIndex);
  });

  it('moves each filter support sentence inside its own modal', () => {
    const template = readCaptainCoverageTemplate();

    expect(template).not.toContain('coverage-tag-filter__support');
    expect(template).toContain('[supportText]="abilityFilterSupportText()"');
    expect(template).toContain('[supportText]="characterTagFilterSupportText()"');
  });

  it('gives the tier row a full grid row and both triggers the same tap-target floor', () => {
    const tierStyles = readCaptainCoverageStyles('captain-coverage-tier-panel');
    const filterStyles = readCaptainCoverageStyles('captain-coverage-filter-panel');
    const teamStyles = readCaptainCoverageStyles('captain-coverage-team-panel');

    expect(tierStyles).toContain(
      '.results-toolbar__toggle-grid .ability-rank-toggle--tier {\n  grid-column: 1 / -1;',
    );
    // The floor is no longer scoped to the ability trigger alone.
    expect(filterStyles).toContain('.coverage-tag-filter .character-tag-combobox ion-button');
    expect(filterStyles).not.toContain('.coverage-ability-filters .character-tag-combobox ion-button');
    expect(filterStyles).toContain('.coverage-filter-pair {');
    // Search spans the whole controls line rather than sharing it with a facet.
    expect(filterStyles).toContain('flex: 1 1 100%;\n  min-width: 0;\n  padding: 0;');
    // The budget cap shares its row with the sentence that explains it.
    expect(teamStyles).toContain('.team-budget-controls {\n  display: grid;\n  grid-template-columns:');
    // The pair replaced `.coverage-ability-filters` as the toolbar's own child,
    // so it has to claim the full desktop row the ability block used to claim.
    expect(readCaptainCoverageStyles('captain-coverage-responsive-panel')).toContain(
      '.coverage-ability-filters,\n  .coverage-filter-pair,',
    );
  });

  it('names the no-Captain tier state instead of blaming a Captain nobody picked', () => {
    const { page } = createPage();

    expect(page.tierCoverageChipTitle(1)).toContain('tierCoverage.chipNoCaptain');

    page.selectedCaptainDetail.set(createCharacter({ id: 1 }));

    expect(page.tierCoverageChipTitle(1)).toContain('tierCoverage.chipUnavailable');
  });

  it('opens one tier help popover at a time and closes it on a second press', () => {
    const { page } = createPage();

    expect(page.openTierHelp()).toBeNull();

    page.toggleTierHelp(2);
    expect(page.openTierHelp()).toBe(2);

    page.toggleTierHelp(3);
    expect(page.openTierHelp()).toBe(3);

    page.toggleTierHelp(3);
    expect(page.openTierHelp()).toBeNull();
  });

  it('has no tier help to show for a Captain with no tiers', () => {
    const { page } = createPage();

    page.selectedCaptainDetail.set(createCharacter({ id: 1 }));

    expect(page.tierHelpView(1)).toBeNull();
  });

  it('keeps Captain Coverage filter labels exact in English and Greek', () => {
    for (const locale of ['en', 'el']) {
      const translations = JSON.parse(
        readFileSync(resolve(process.cwd(), `public/i18n/captain-coverage/${locale}.json`), 'utf8'),
      );

      expect([
        translations.filters.captainAbilityEyebrow,
        translations.filters.superTandemPresence.toggle,
        translations.filters.superTypesClassesPresence.toggle,
        translations.filters.tierCoverage.toggle,
      ]).toEqual(['Required', 'Super Tandem', 'Super Types/Classes', 'Tier Coverage']);
    }
  });

  /*
   * Measured on 2026-09-02 against a local production build: opening the
   * ability modal with all 4,613 cards painted cost 2,675 ms on a 4x
   * CPU-throttled phone, against 249 ms with 61 painted and 275 ms with none.
   * The cap is the fix for that, so it has to hold - and it has to reset, or a
   * search that narrows the list still pays for the slots a previous "show
   * more" opened.
   */
  it('paints one page of results, shows the rest on demand, and resets when the filters move', async () => {
    const { page } = createPage({
      characters: Array.from({ length: 250 }, (_, index) =>
        createCharacter({ id: 3000 + index, name: `Crew ${index}` }),
      ),
    });

    await page.ngOnInit();

    expect(page.totalMatchingCharacters()).toBe(250);
    expect(page.visibleResultCards()).toHaveLength(100);
    expect(page.hasMoreResults()).toBe(true);
    expect(page.remainingResultCount()).toBe(150);

    page.loadMoreResults();
    expect(page.visibleResultCards()).toHaveLength(200);

    page.loadMoreResults();
    expect(page.visibleResultCards()).toHaveLength(250);
    expect(page.hasMoreResults()).toBe(false);
    expect(page.remainingResultCount()).toBe(0);

    // A narrower list starts at page one again.
    page.onSearchChange({ detail: { value: 'Crew 1' } } as CustomEvent<{ value?: string | null }>);
    expect(page.totalMatchingCharacters()).toBeLessThan(250);
    expect(page.visibleResultCards().length).toBeLessThanOrEqual(100);

    // Coming back to the identical list restores where the user was, because
    // the page is keyed on which characters matched, not on when they matched.
    page.onSearchChange({ detail: { value: '' } } as CustomEvent<{ value?: string | null }>);
    expect(page.totalMatchingCharacters()).toBe(250);
    expect(page.visibleResultCards()).toHaveLength(250);
  });

  /*
   * The regression the first cut of this feature shipped: the page position was
   * keyed on the identity of the resultCards array, and `resultCards` reads the
   * team slots for each card's leader/sub-slot state. Every add-to-team then
   * silently collapsed the painted list back to the first page, throwing the
   * user's scroll position away at the moment they acted on a card.
   */
  it('keeps the paged position when a result is assigned to the team', async () => {
    const { page } = createPage({
      characters: Array.from({ length: 250 }, (_, index) =>
        createCharacter({ id: 3000 + index, name: `Crew ${index}` }),
      ),
    });

    await page.ngOnInit();
    page.loadMoreResults();
    const paged = page.visibleResultCards().length;
    expect(paged).toBe(200);

    const target = page.visibleResultCards().at(-1);
    expect(target?.assignableSlotIndex).not.toBeNull();

    page.assignCharacterFromResult(target!);

    expect(page.selectedTeamSlots().some((slot) => slot !== null)).toBe(true);
    // The assigned character drops out of the list, but the user's position in
    // it does not: the page is re-anchored across the team write.
    expect(page.visibleResultCards().length).toBe(paged);

    const filledSlot = page.selectedTeamSlots().findIndex((slot) => slot !== null);
    page.clearTeamSlot(filledSlot);

    expect(page.selectedTeamSlots().every((slot) => slot === null)).toBe(true);
    expect(page.visibleResultCards().length).toBe(paged);

    // A real filter change still starts over.
    page.onSearchChange({ detail: { value: 'Crew 1' } } as CustomEvent<{ value?: string | null }>);
    expect(page.visibleResultCards().length).toBeLessThanOrEqual(100);
  });
});

function readCaptainCoverageTemplate(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/app/pages/captain-coverage/captain-coverage.page.html'),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

function readCaptainCoverageStyles(panel: string): string {
  return readFileSync(
    resolve(process.cwd(), `src/app/pages/captain-coverage/${panel}.component.scss`),
    'utf8',
  ).replace(/\r\n/g, '\n');
}

function createPage({
  captains = [],
  characters = [],
  favoriteIds = [],
  abilityCatalog = createAbilityCatalog(),
  routeTeamId = null,
  savedTeams = [],
  characterBoxes = [],
}: {
  captains?: CharacterDetailRecord[];
  characters?: Array<CharacterDetailRecord & CharacterListItem>;
  favoriteIds?: number[];
  abilityCatalog?: AutoBuildAbilityCatalog;
  routeTeamId?: string | null;
  savedTeams?: Array<ReturnType<typeof createSavedTeam>>;
  characterBoxes?: CharacterBox[];
} = {}): {
  page: CaptainCoveragePage;
  repository: {
    getAutoBuilderAbilityCatalog: ReturnType<typeof vi.fn>;
    getDatasetManifest: ReturnType<typeof vi.fn>;
    getCharacterById: ReturnType<typeof vi.fn>;
    searchDetailedCharacters: ReturnType<typeof vi.fn>;
    getAvailableCharacterTags: ReturnType<typeof vi.fn>;
  };
  characterCatalogCache: {
    catalog: ReturnType<typeof signal<CharacterListItem[]>>;
    ensureLoaded: ReturnType<typeof vi.fn>;
  };
  userState: {
    characterBoxes: ReturnType<typeof signal<CharacterBox[]>>;
    favoriteCharacterIds: ReturnType<typeof signal<number[]>>;
    getSavedTeamById: ReturnType<typeof vi.fn>;
    ready: ReturnType<typeof vi.fn>;
    readyCharacterBoxes: ReturnType<typeof vi.fn>;
    readySavedTeams: ReturnType<typeof vi.fn>;
    saveTeam: ReturnType<typeof vi.fn>;
  };
  route: { snapshot: { queryParamMap: { get: ReturnType<typeof vi.fn> } } };
  router: { navigate: ReturnType<typeof vi.fn> };
  i18n: {
    preloadScope: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
  };
} {
  const charactersById = new Map(
    [...captains, ...characters].map((character) => [character.id, character]),
  );
  const availableCharacterTags = [
    ...new Set(
      [...charactersById.values()].flatMap((character) => character.detail.characterTags ?? []),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const repository = {
    getAutoBuilderAbilityCatalog: vi.fn().mockResolvedValue(abilityCatalog),
    getDatasetManifest: vi.fn().mockResolvedValue({
      schemaVersion: 1,
      characterCount: characters.length,
    }),
    getCharacterById: vi.fn((characterId: number) =>
      Promise.resolve(charactersById.get(characterId) ?? null),
    ),
    searchDetailedCharacters: vi.fn().mockResolvedValue([...charactersById.values()]),
    getAvailableCharacterTags: vi.fn().mockResolvedValue(availableCharacterTags),
  };
  const characterCatalogCache = {
    catalog: signal<CharacterListItem[]>(characters),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
  };
  const userState = {
    characterBoxes: signal(characterBoxes),
    favoriteCharacterIds: signal(favoriteIds),
    getSavedTeamById: vi.fn(
      (teamId: string) => savedTeams.find((team) => team.id === teamId) ?? null,
    ),
    ready: vi.fn().mockResolvedValue(undefined),
    readyCharacterBoxes: vi.fn().mockResolvedValue(undefined),
    readyFavoriteCharacterIds: vi.fn().mockResolvedValue(undefined),
    readySavedTeams: vi.fn().mockResolvedValue(undefined),
    saveTeam: vi.fn().mockResolvedValue({ id: 'saved-captain-coverage-team' }),
  };
  const i18n = {
    preloadScope: vi.fn().mockResolvedValue(undefined),
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

function createCharacterBox(id: string, name: string, characterIds: number[]): CharacterBox {
  return {
    id,
    name,
    characterIds,
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
    'captain-coverage.filters.captainAbilityEyebrow': 'Required',
    'captain-coverage.filters.superTandemPresence.toggle': 'Super Tandem',
    'captain-coverage.filters.superTypesClassesPresence.toggle': 'Super Types/Classes',
    'captain-coverage.filters.characterTags.joiners.any': 'or',
    'captain-coverage.filters.characterTags.joiners.all': 'and',
    'captain-coverage.filters.characterTags.removeGroup': 'Remove tag group {{group}}',
    'captain-coverage.filters.characterTags.trigger.empty': 'Choose character tags',
    'captain-coverage.filters.characterTags.trigger.active':
      '{{tags}} tag(s) in {{groups}} group(s)',
    'captain-coverage.filters.characterTags.support.empty': 'Group tags with OR inside a group.',
    'captain-coverage.filters.characterTags.support.all': 'Matches every tag group.',
    'captain-coverage.filters.characterTags.support.any': 'Matches at least one tag group.',
    'captain-coverage.team.actions.setAsCaptain': 'Set as Captain',
    'captain-coverage.team.actions.setAsFriendCaptain': 'Set as Friend Captain',
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

function createSelection(
  sets: CharacterTagSetSelection['sets'],
  operator: CharacterTagSetSelection['operator'] = 'all',
): CharacterTagSetSelection {
  return { operator, sets };
}

function createTagSetRequirement(
  abilityKey: string,
  captainAbility = false,
): AutoBuildAbilityRequirement {
  return {
    abilityKey,
    minTurns: null,
    slotTokens: [],
    requiredCharacterCount: 1,
    slotScope: captainAbility ? 'leader' : 'any',
    ...(captainAbility ? { sourceScope: 'captainAbility' as const } : {}),
  };
}

/** Mirrors what the shared tag-set picker emits: sets, plus the joining operator. */
function createTagSetSelection(
  sets: Array<{
    abilityKeys: string[];
    operator?: AbilityTagSetOperator;
    captainAbility?: boolean;
  }>,
  operator: AbilityTagSetOperator = 'all',
): AbilityFilterTagSetSelection {
  return {
    operator,
    sets: sets.map((set, index) => ({
      id: `set-${index + 1}`,
      operator: set.operator ?? 'any',
      requirements: set.abilityKeys.map((abilityKey) =>
        createTagSetRequirement(abilityKey, set.captainAbility),
      ),
    })),
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
  availableSources: AutoBuildAbilitySource[] = ['specialText'],
  captainAbilityMatchingCharacterIds?: number[],
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
    availableSources,
    matchCount: matchingCharacterIds.length,
    matchingCharacterIds,
    ...(captainAbilityMatchingCharacterIds ? { captainAbilityMatchingCharacterIds } : {}),
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
    superClass?: CharacterDetailRecord['detail']['superClass'];
    superTandemData?: CharacterDetailRecord['detail']['superTandemData'];
    superType?: CharacterDetailRecord['detail']['superType'];
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
      superType: overrides.superType ?? null,
      superTandemData: overrides.superTandemData ?? null,
      superClass: overrides.superClass ?? null,
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

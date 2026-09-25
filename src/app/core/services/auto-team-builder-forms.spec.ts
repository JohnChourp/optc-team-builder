import { describe, expect, it } from 'vitest';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  type AutoBuildInput,
} from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type CharacterForm } from '../models/optc.models';
import { buildAutoBuildCandidate, resolveCharacterFacetMatches } from './auto-team-builder.utils';

/*
 * 869f63gv6. The Auto Team Builder's selected-class filter counts a dual or VS unit's forms - its
 * classes after a swap - the way the class filters do: "any" across every state, "all" inside one.
 * Its avoid and prefer rules and its Super Special criteria keep the unit's own classes.
 */

describe('the selected-class filter and a dual unit', () => {
  it('matches #1983 on Driven through its Smoker form', () => {
    const candidate = buildAutoBuildCandidate(smokerAndTashigi(), input(['Driven']), 0, 1);

    expect(candidate.matchedSelectedClasses).toEqual(['Driven']);
    expect(candidate.matchesSelectedClass).toBe(true);
    expect(candidate.matchesAllSelectedClasses).toBe(true);
  });

  it('does not match the same unit without its forms - the control', () => {
    const candidate = buildAutoBuildCandidate(smokerAndTashigi([]), input(['Driven']), 0, 1);

    expect(candidate.matchedSelectedClasses).toEqual([]);
    expect(candidate.matchesAllSelectedClasses).toBe(false);
  });

  it('holds every selected class in one state, or does not hold them all', () => {
    const acrossForms = buildAutoBuildCandidate(smokerAndTashigi(), input(['Driven', 'Cerebral']), 0, 1);
    const inOneForm = buildAutoBuildCandidate(smokerAndTashigi(), input(['Striker', 'Driven']), 0, 1);

    expect(acrossForms.matchedSelectedClasses).toEqual(['Driven', 'Cerebral']);
    expect(acrossForms.matchesAllSelectedClasses).toBe(false);
    expect(inOneForm.matchesAllSelectedClasses).toBe(true);
  });

  it('leaves avoid and prefer on the unit as it is', () => {
    expect(resolveCharacterFacetMatches(smokerAndTashigi(), [], ['Driven'])).toEqual([]);
    expect(resolveCharacterFacetMatches(smokerAndTashigi(), [], ['Striker'])).toEqual(['Striker']);
  });
});

function input(selectedClasses: string[]): AutoBuildInput {
  return {
    types: [],
    boostedCharacterIds: [],
    selectedClasses,
    selectedCharacterTags: [],
    selectedCharacterNames: [],
    requiredAbilities: [],
    requiredCharacterGroups: [],
    enemyMechanics: [],
    battleRequirements: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: false,
    requireBothLeadersFullCaptainAbilityCoverage: false,
    minimumLeaderSuperEffectMatchingSlots: null,
    requireLeaderSuperSpecialCriteria: false,
    strictSuperSpecialCriteriaCoverage: false,
    requireSuperTandemCriteria: false,
    strictSuperTandemCriteriaCoverage: false,
    requireUniqueBaseCharacterNames: false,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
    favoriteShipIds: [],
    leaderBoostFilters: ['HP', 'ATK'],
    leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
    costRange: createEmptyAutoBuildCostRange(),
    leaderCostRange: createEmptyAutoBuildCostRange(),
    subCostRange: createEmptyAutoBuildCostRange(),
    maxTotalCost: null,
    manualSlots: createEmptyAutoBuildManualSlots(),
    lockedCharacterIds: [],
    excludedCharacterIds: [],
    captainCharacterId: null,
    friendCaptainCharacterId: null,
    manualShipId: null,
    requireManualShip: false,
    excludedShipIds: [],
    candidateLimit: AUTO_TEAM_CANDIDATE_LIMIT,
  };
}

function form(key: string, name: string, type: string, classes: string[]): CharacterForm {
  return {
    key,
    name,
    type,
    classes,
    combo: 4,
    stats: { min: { hp: 1, atk: 1, rcv: 1 }, max: { hp: 2, atk: 2, rcv: 2 } },
  };
}

function smokerAndTashigi(
  forms: CharacterForm[] = [
    form('1', 'Smoker', 'INT', ['Striker', 'Driven']),
    form('2', 'Tashigi', 'PSY', ['Slasher', 'Cerebral']),
  ],
): CharacterDetailRecord {
  return {
    id: 1983,
    name: 'Smoker & Tashigi - Straw Hat Pursuer',
    searchText: 'smoker & tashigi - straw hat pursuer',
    isIncomplete: false,
    type: 'INT,PSY',
    classes: ['Striker', 'Slasher'],
    primaryClass: 'Striker',
    secondaryClass: 'Slasher',
    stars: 4,
    cost: 15,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: 264, atk: 138, rcv: 30 },
      max: { hp: 1858, atk: 1421, rcv: 325 },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: true },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    forms,
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: 1983,
      captainAbility: 'Boosts ATK of [INT] and [PSY] characters by 2.5x',
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: 'Deals damage to one enemy.',
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      characterTags: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
  };
}

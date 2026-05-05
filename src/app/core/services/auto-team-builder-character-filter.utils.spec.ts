import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord } from '../models/optc.models';
import { extractAutoBuildCharacterRequirementFilters } from './auto-team-builder-character-filter.utils';

describe('extractAutoBuildCharacterRequirementFilters', () => {
  it('extracts Captain full-coverage and team-count tag requirements', () => {
    const character = createCharacter({
      captainAbility:
        'Boosts ATK of [Straw Hat Pirates] and [Egghead Arc] characters by 5x. If your crew has 4+ [Navy] or [Kid Pirates] characters, boosts ATK by 5.75x instead.',
    });

    expect(extractAutoBuildCharacterRequirementFilters(character)).toEqual({
      characterTags: ['Straw Hat Pirates', 'Egghead Arc', 'Navy', 'Kid Pirates'],
      characterNames: [],
    });
  });

  it('extracts Super Special and Super Tandem character-count tags and names', () => {
    const character = createCharacter({
      superSpecialCriteria: createRosterCriteria([
        '[Straw Hat Pirates]',
        'Roronoa Zoro',
        'Nami',
      ]),
      superTandemData: {
        requirement: null,
        levels: [],
        criteria: createRosterCriteria(['[Minks]', 'Sanji']),
      },
    });

    expect(extractAutoBuildCharacterRequirementFilters(character)).toEqual({
      characterTags: ['Straw Hat Pirates', 'Minks'],
      characterNames: ['Roronoa Zoro', 'Nami', 'Sanji'],
    });
  });
});

function createRosterCriteria(
  labels: string[],
): NonNullable<CharacterDetailRecord['detail']['superSpecialCriteria']> {
  return {
    rawText: labels.join(', '),
    requiresCaptain: false,
    hasNonRosterBranches: false,
    parserStatus: 'roster_only',
    rosterBranches: [
      {
        branchType: 'character_count_any',
        requiredCount: 2,
        matchMode: 'any_candidate',
        options: labels.map((label) => ({
          label,
          acceptedKeys: [label.toLowerCase()],
        })),
      },
    ],
  };
}

function createCharacter(
  detailOverrides: Partial<CharacterDetailRecord['detail']>,
): CharacterDetailRecord {
  return {
    id: 900001,
    name: 'Requirement Source',
    searchText: 'requirement source',
    isIncomplete: false,
    type: 'DEX',
    classes: ['Fighter'],
    primaryClass: 'Fighter',
    secondaryClass: null,
    stars: 6,
    cost: 55,
    combo: 4,
    captainHpBoost: 1.3,
    captainAtkBoost: 5,
    captainAverageBoost: 3.15,
    stats: {
      min: { hp: 1000, atk: 400, rcv: 120 },
      max: { hp: 3900, atk: 1900, rcv: 340 },
      growth: 3,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
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
      characterId: 900001,
      captainAbility: null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: null,
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
      superTandemData: null,
      superClass: null,
      rumbleData: null,
      ...detailOverrides,
    },
  };
}

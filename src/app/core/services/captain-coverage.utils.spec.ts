import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import { resolveCaptainCoverage } from './captain-coverage.utils';

describe('resolveCaptainCoverage', () => {
  const kidAimedDamnedPunkCaptainAbility =
    'Reduces Special Cooldown of all characters by 1 turn and reduces Special Cooldown of this character by 4 turns at the start of the fight, boosts ATK of [STR], Striker and Driven characters by 5x, boosts HP of [STR], Striker and Driven characters by 1.3x, and makes [STR] and [INT] orbs beneficial for all characters. If HP is below 50% at the start of the turn, boosts ATK of [STR], Striker and Driven characters by 6x instead, and reduces damage received by 25%. If your crew has 4+ [Kid Pirates], [Worst Generation] or [Land of Wano Arc] characters or your crew has 6 [Kid Pirates], [Worst Generation] or [Egghead Arc] characters, reduces Despair duration by 10 turns, and boosts base ATK of [Paramythia-type] characters by 500.';

  it('treats all-character captain clauses as universal coverage', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x and boosts HP of crew by 1.3x.',
    });
    const target = createCharacter({ id: 2001, type: 'INT', classes: ['Shooter', 'Driven'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({
      hp: 1.3,
      atk: 5,
    });
    expect(coverage.chips).toEqual([
      {
        kind: 'universal',
        label: 'Universal',
      },
    ]);
  });

  it('matches type, class, and cost scoped captain clauses against the selected character', () => {
    const captain = createCharacter({
      id: 1002,
      captainAbility:
        'Boosts ATK of [DEX] characters by 5x, boosts HP of Fighter characters by 1.4x and makes orbs beneficial for Cost 40 or less characters.',
    });
    const target = createCharacter({
      id: 2002,
      type: 'DEX',
      classes: ['Fighter', 'Powerhouse'],
      cost: 30,
    });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({
      hp: 1.4,
      atk: 5,
    });
    expect(coverage.chips).toEqual(
      expect.arrayContaining([
        {
          kind: 'type',
          label: 'DEX',
        },
        {
          kind: 'class',
          label: 'Fighter',
        },
        {
          kind: 'cost',
          label: 'Cost <= 40',
        },
      ]),
    );
  });

  it('keeps scoped captain boosts at zero when the target does not match', () => {
    const captain = createCharacter({
      id: 1006,
      captainAbility: 'Boosts ATK of [DEX] characters by 5x and HP by 1.2x.',
    });
    const target = createCharacter({ id: 2006, type: 'STR', classes: ['Shooter', 'Driven'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(false);
    expect(coverage.boosts).toEqual({
      hp: 0,
      atk: 0,
    });
  });

  it('extracts ATK and HP from a combined matching boost clause', () => {
    const captain = createCharacter({
      id: 1007,
      captainAbility: 'Boosts ATK of DEX, Fighter and Slasher characters by 5.25x and HP by 1.4x.',
    });
    const target = createCharacter({
      id: 2007,
      type: 'DEX',
      classes: ['Shooter', 'Free Spirit'],
    });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({
      hp: 1.4,
      atk: 5.25,
    });
  });

  it('uses default captain branches instead of powered-up or conditional boost values', () => {
    const captain = createCharacter({
      id: 1008,
      captainAbility:
        'Always Active: Boosts HP of [DEX] characters by 1.3x. Standard Captain: Boosts ATK of [DEX] characters by 3.5x. Powered Up Captain: Boosts ATK of [DEX] characters by 6x and HP by 1.5x. If HP is below 50%, boosts ATK of [DEX] characters by 7x instead.',
    });
    const target = createCharacter({ id: 2008, type: 'DEX', classes: ['Shooter', 'Driven'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({
      hp: 1.3,
      atk: 3.5,
    });
  });

  it('rejects a captain when any character-targeted clause misses the selected character', () => {
    const captain = createCharacter({
      id: 1003,
      captainAbility:
        'Boosts ATK of [DEX] characters by 5x and makes [STR] orbs beneficial for [STR] characters.',
    });
    const target = createCharacter({ id: 2003, type: 'DEX', classes: ['Fighter', 'Slasher'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(false);
    expect(coverage.coveredClauses).toHaveLength(1);
    expect(coverage.uncoveredClauses).toEqual(['makes [STR] orbs beneficial for [STR] characters']);
  });

  it('covers self-only clauses only when the selected character is the captain', () => {
    const captain = createCharacter({
      id: 1004,
      captainAbility: 'Boosts ATK of this character by 6x.',
    });

    expect(resolveCaptainCoverage(captain, createCharacter({ id: 1004 })).matches).toBe(true);
    expect(resolveCaptainCoverage(captain, createCharacter({ id: 2004 })).matches).toBe(false);
  });

  it('keeps unmatched self-only riders from blocking Kid Aimed Damned Punk coverage', () => {
    const captain = createCharacter({
      id: 4549,
      captainAbility: kidAimedDamnedPunkCaptainAbility,
      type: 'STR',
      classes: ['Striker', 'Driven'],
    });
    const matchingTarget = createCharacter({
      id: 3001,
      type: 'STR',
      classes: ['Shooter', 'Free Spirit'],
      characterTags: ['Worst Generation'],
    });
    const untaggedBoostedTarget = createCharacter({
      id: 3003,
      type: 'STR',
      classes: ['Shooter', 'Free Spirit'],
    });
    const taggedUnboostedTarget = createCharacter({
      id: 3004,
      type: 'QCK',
      classes: ['Shooter', 'Free Spirit'],
      characterTags: ['Kid Pirates'],
    });
    const nonMatchingTarget = createCharacter({
      id: 3002,
      type: 'QCK',
      classes: ['Shooter', 'Free Spirit'],
    });

    const matchingCoverage = resolveCaptainCoverage(captain, matchingTarget);
    const untaggedBoostedCoverage = resolveCaptainCoverage(captain, untaggedBoostedTarget);
    const taggedUnboostedCoverage = resolveCaptainCoverage(captain, taggedUnboostedTarget);
    const nonMatchingCoverage = resolveCaptainCoverage(captain, nonMatchingTarget);

    expect(matchingCoverage.matches).toBe(true);
    expect(matchingCoverage.boosts).toEqual({
      hp: 1.3,
      atk: 5,
    });
    expect(matchingCoverage.chips).toEqual(
      expect.arrayContaining([
        {
          kind: 'tag',
          label: 'Worst Generation',
        },
      ]),
    );
    expect(matchingCoverage.neutralNotes).toContain(
      'reduces Special Cooldown of this character by 4 turns at the start of the fight',
    );
    expect(untaggedBoostedCoverage.matches).toBe(false);
    expect(untaggedBoostedCoverage.uncoveredClauses).toContain(
      'requires crew has 4 [Kid Pirates] / [Worst Generation] / [Land of Wano Arc] characters or crew has 6 [Kid Pirates] / [Worst Generation] / [Egghead Arc] characters',
    );
    expect(taggedUnboostedCoverage.matches).toBe(false);
    expect(nonMatchingCoverage.matches).toBe(false);
    expect(nonMatchingCoverage.uncoveredClauses).toEqual(
      expect.arrayContaining([
        'boosts ATK of [STR], Striker and Driven characters by 5x',
        'boosts HP of [STR], Striker and Driven characters by 1.3x',
      ]),
    );
  });

  it('keeps neutral captain notes from excluding an otherwise covered captain', () => {
    const captain = createCharacter({
      id: 1005,
      captainAbility:
        'Boosts ATK of [QCK] characters by 5x, reduces damage received by 20% and guarantees duplicating a drop upon completion of the island.',
    });
    const target = createCharacter({ id: 2005, type: 'QCK', classes: ['Free Spirit', 'Striker'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
    expect(coverage.neutralNotes).toEqual([
      'reduces damage received by 20%',
      'guarantees duplicating a drop upon completion of the island',
    ]);
  });
});

function createCharacter(
  overrides: Partial<CharacterDetailRecord> & {
    captainAbility?: string;
    characterTags?: string[];
    classes?: string[];
    cost?: number;
    id: number;
    type?: string;
  },
): CharacterDetailRecord {
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
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
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
      partyConflictKeys: [],
      characterTags: overrides.characterTags ?? [],
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
  } satisfies CharacterDetailRecord;
}

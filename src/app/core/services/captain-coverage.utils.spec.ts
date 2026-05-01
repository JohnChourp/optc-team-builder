import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import { resolveCaptainCoverage } from './captain-coverage.utils';

describe('resolveCaptainCoverage', () => {
  it('treats all-character captain clauses as universal coverage', () => {
    const captain = createCharacter({
      id: 1001,
      captainAbility: 'Boosts ATK of all characters by 5x and boosts HP of crew by 1.3x.',
    });
    const target = createCharacter({ id: 2001, type: 'INT', classes: ['Shooter', 'Driven'] });

    const coverage = resolveCaptainCoverage(captain, target);

    expect(coverage.matches).toBe(true);
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

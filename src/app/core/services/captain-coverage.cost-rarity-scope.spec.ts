import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord } from '../models/optc.models';
import { createCaptainCoverageFilterState } from './captain-coverage-filter.utils';
import {
  buildCaptainCoverageResultPassDataset,
  runCaptainCoverageResultPass,
} from './captain-coverage-result-pass.utils';
import { resolveCaptainCoverage } from './captain-coverage.utils';
import { createEmptyCharacterFacetSelection } from './character-facet-filter.utils';
import { createEmptyCharacterTagSetSelection } from './character-tag-set.utils';

/*
 * 869f63gqz. A Captain scoped by cost or rarity got a tier with the right multiplier, and Captain
 * Coverage still said nobody was boosted: #458 Sengoku's "Cost 20 or less" read "0 boosted by your
 * Captain, of 2009 matching", #964 Saint Roswald 0 of 605. The build had read the scope since
 * 869dc7dj5; the runtime check never learned it, so the clause had no scope and went neutral.
 *
 * The texts below are the shipped ones. Every range is checked at both of its edges and one step
 * outside, because an off-by-one there is the whole difference between "or less" and "less".
 */
const SENGOKU = 'Reduces Special Cooldown of all characters by 2 turns at the start of the fight, boosts ATK of Cost 20 or less characters by 3x';
const BUGGY_APPRENTICE = 'Boosts ATK of Rarity 2 or less characters by 2.5x';
const SAINT_ROSWALD = 'Boosts ATK, HP and RCV of Cost 50-55 characters by 1.5x';
const BUDDHA_SENGOKU = 'Boosts ATK of Cost 30 or less characters by 2.25x and their HP by 1.2x';
const CROCODILE_PARAMOUNT_WAR =
  'Boosts ATK of Rarity 4 or 4+ characters by 1.75x, boosts ATK of Rarity 5 or 5+ characters by 2x and boosts ATK of Rarity 6 or 6+ characters by 2.25x.';
const HAJRUDIN = 'Boosts ATK of Cost 40 characters by 2.5x';
const BUGGY_CROCODILE_MIHAWK =
  'Reduces Special Cooldown of Driven and Slasher characters by 1 turn at the start of the fight, reduces Special Cooldown of this character by 3 turns at the start of the fight, boosts HP of Driven and Slasher characters by 1.3x, boosts ATK of Driven and Slasher characters by 5.5x, by 6x instead if they are a Cost 40 or less character, makes [TND] orbs beneficial for Driven and Slasher characters, and reduces damage received by 20%.';

describe('Captain Coverage reads cost and rarity scopes', () => {
  it('boosts a Cost 20 or less Captain only up to cost 20', () => {
    expect(boostOf(SENGOKU, { cost: 1 })).toEqual({ matches: true, boosts: { hp: 0, atk: 3 } });
    expect(boostOf(SENGOKU, { cost: 20 })).toEqual({ matches: true, boosts: { hp: 0, atk: 3 } });
    expect(boostOf(SENGOKU, { cost: 21 })).toEqual({ matches: false, boosts: { hp: 0, atk: 0 } });
  });

  it('boosts a Rarity 2 or less Captain only up to rarity 2', () => {
    expect(boostOf(BUGGY_APPRENTICE, { stars: 2 })).toEqual({ matches: true, boosts: { hp: 0, atk: 2.5 } });
    expect(boostOf(BUGGY_APPRENTICE, { stars: 3 })).toEqual({ matches: false, boosts: { hp: 0, atk: 0 } });
  });

  it('boosts a Cost 50-55 Captain inside both edges and nowhere else', () => {
    expect(boostOf(SAINT_ROSWALD, { cost: 49 }).matches).toBe(false);
    expect(boostOf(SAINT_ROSWALD, { cost: 50 })).toEqual({ matches: true, boosts: { hp: 1.5, atk: 1.5 } });
    expect(boostOf(SAINT_ROSWALD, { cost: 55 })).toEqual({ matches: true, boosts: { hp: 1.5, atk: 1.5 } });
    expect(boostOf(SAINT_ROSWALD, { cost: 56 }).matches).toBe(false);
  });

  it('carries the HP a cost-scoped Captain gives "their" characters', () => {
    expect(boostOf(BUDDHA_SENGOKU, { cost: 30 })).toEqual({ matches: true, boosts: { hp: 1.2, atk: 2.25 } });
    expect(boostOf(BUDDHA_SENGOKU, { cost: 31 })).toEqual({ matches: false, boosts: { hp: 0, atk: 0 } });
  });

  it('gives each rarity its own tier and ignores a rarity no tier names', () => {
    expect(boostOf(CROCODILE_PARAMOUNT_WAR, { stars: 3 }).matches).toBe(false);
    expect(boostOf(CROCODILE_PARAMOUNT_WAR, { stars: 4 }).boosts.atk).toBe(1.75);
    expect(boostOf(CROCODILE_PARAMOUNT_WAR, { stars: 5 }).boosts.atk).toBe(2);
    expect(boostOf(CROCODILE_PARAMOUNT_WAR, { stars: 6 }).boosts.atk).toBe(2.25);
  });

  it('reads "Cost 40 characters" as exactly cost 40', () => {
    expect(boostOf(HAJRUDIN, { cost: 39 }).matches).toBe(false);
    expect(boostOf(HAJRUDIN, { cost: 40 })).toEqual({ matches: true, boosts: { hp: 0, atk: 2.5 } });
    expect(boostOf(HAJRUDIN, { cost: 41 }).matches).toBe(false);
  });

  it('narrows a class-scoped clause by its cost, never widening it', () => {
    /*
     * "by 6x instead if they are a Cost 40 or less character" names Driven and Slasher AND a cost.
     * Read as one more option it would boost every character with cost 40 or less, which is the
     * reading captain-coverage-filter.utils.ts already refuses for the same tier.
     */
    const sixTimes = (target: TargetShape) =>
      resolveCaptainCoverage(createCharacter(1, { captainAbility: BUGGY_CROCODILE_MIHAWK }), createCharacter(2, target), {
        coverageMode: 'fullAbilityCoverage',
      }).clauses.find((clause) => /\bby 6x\b/.test(clause.text))?.status;

    expect(sixTimes({ cost: 40, classes: ['Driven'] })).toBe('covered');
    expect(sixTimes({ cost: 41, classes: ['Driven'] })).toBe('uncovered');
    expect(sixTimes({ cost: 30, classes: ['Fighter', 'Shooter'] })).toBe('uncovered');
  });

  it('leaves a Captain with no cost or rarity scope exactly as it was', () => {
    // The two controls: an absent range admits everyone, and a class scope ignores cost.
    expect(boostOf('Boosts ATK of all characters by 1.5x', { cost: 99, stars: 6 })).toEqual({
      matches: true,
      boosts: { hp: 0, atk: 1.5 },
    });
    expect(boostOf('Boosts ATK of Slasher characters by 2x', { cost: 99, classes: ['Slasher'] }).matches).toBe(true);
    expect(boostOf('Boosts ATK of Slasher characters by 2x', { cost: 1, classes: ['Fighter'] }).matches).toBe(false);
  });

  it('counts the cards a cost-scoped Captain boosts in the result pass', () => {
    // The list's own header: "N boosted by your Captain, of M matching". It read 0 of 3 here.
    const captain = createCharacter(458, { captainAbility: SENGOKU, cost: 30 });
    const characters = [
      captain,
      createCharacter(10, { cost: 10 }),
      createCharacter(20, { cost: 20 }),
      createCharacter(21, { cost: 21 }),
    ];
    const result = runCaptainCoverageResultPass(
      buildCaptainCoverageResultPassDataset(characters, new Map(characters.map((character) => [character.id, character]))),
      {
        captain,
        filterState: createCaptainCoverageFilterState({ requireCaptainCoverage: false }),
        characterBoxIds: null,
        typeFacet: createEmptyCharacterFacetSelection(),
        classFacet: createEmptyCharacterFacetSelection(),
        costRange: { min: null, max: null },
        favoritesOnly: false,
        hideFavorites: false,
        favoriteIds: [],
        characterTagSetSelection: createEmptyCharacterTagSetSelection(),
        requireSuperTandemPresence: false,
        requireSuperTypesClassesPresence: false,
        searchTerm: '',
        sortMode: 'catalog',
        idOrder: 'oldest',
      },
    );

    expect(result.ids).toEqual([10, 20, 21, 458]);
    expect(result.boostedCount).toBe(2);
  });
});

interface TargetShape {
  captainAbility?: string;
  classes?: string[];
  cost?: number;
  stars?: number;
}

function boostOf(captainAbility: string, target: TargetShape) {
  const coverage = resolveCaptainCoverage(
    createCharacter(1, { captainAbility }),
    createCharacter(2, target),
    { coverageMode: 'simpleBoostScope' },
  );

  return { matches: coverage.matches, boosts: coverage.boosts };
}

function createCharacter(id: number, shape: TargetShape): CharacterDetailRecord {
  const classes = shape.classes ?? ['Shooter', 'Cerebral'];

  return {
    id,
    name: `Character ${id}`,
    searchText: '',
    isIncomplete: false,
    type: 'QCK',
    classes,
    primaryClass: classes[0] ?? 'Shooter',
    secondaryClass: classes[1] ?? null,
    stars: shape.stars ?? 5,
    cost: shape.cost ?? 30,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: id,
      captainAbility: shape.captainAbility ?? null,
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
      superClass: null,
      rumbleData: null,
    },
  } satisfies CharacterDetailRecord;
}

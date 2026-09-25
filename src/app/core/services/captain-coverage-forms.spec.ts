import { describe, expect, it } from 'vitest';

import {
  type CharacterCaptainAbilityCoverageTier,
  type CharacterDetailRecord,
  type CharacterForm,
} from '../models/optc.models';
import {
  createCaptainCoverageFilterState,
  matchesCaptainCoverageTier,
} from './captain-coverage-filter.utils';
import {
  buildCaptainCoverageResultPassDataset,
  runCaptainCoverageResultPass,
} from './captain-coverage-result-pass.utils';
import {
  resolveCaptainCoverage,
  resolveCaptainCoverageFormOnlyClasses,
} from './captain-coverage.utils';
import { createEmptyCharacterFacetSelection } from './character-facet-filter.utils';
import { createEmptyCharacterTagSetSelection } from './character-tag-set.utils';

/*
 * 869f63gv6. A dual or VS unit's classes after a swap are its form's classes. A Captain's
 * class-scoped boost covers it through a form - #1983 Smoker & Tashigi is Driven only as Smoker -
 * and says so: the class chip carries the form, which the page turns into "after swap".
 */

const SMOKER: CharacterForm = form('1', 'Smoker', 'INT', ['Striker', 'Driven']);
const TASHIGI: CharacterForm = form('2', 'Tashigi', 'PSY', ['Slasher', 'Cerebral']);

describe('a class-scoped Captain and a dual unit', () => {
  it('boosts #1983 through its Smoker form, and names the form', () => {
    const coverage = resolveCaptainCoverage(
      captain('Boosts ATK of Driven characters by 2.5x'),
      smokerAndTashigi(),
      { coverageMode: 'simpleBoostScope' },
    );

    expect(coverage.matches).toBe(true);
    expect(coverage.boosts).toEqual({ hp: 0, atk: 2.5 });
    expect(resolveCaptainCoverageFormOnlyClasses(coverage)).toEqual({
      classes: ['Driven'],
      forms: ['Smoker'],
    });
  });

  it('does not boost the same unit without its forms - the control', () => {
    const coverage = resolveCaptainCoverage(
      captain('Boosts ATK of Driven characters by 2.5x'),
      smokerAndTashigi([]),
      { coverageMode: 'simpleBoostScope' },
    );

    expect(coverage.matches).toBe(false);
    expect(resolveCaptainCoverageFormOnlyClasses(coverage)).toBeNull();
  });

  it('says nothing about forms when the unit is boosted as it is', () => {
    const coverage = resolveCaptainCoverage(
      captain('Boosts ATK of Striker characters by 2x'),
      smokerAndTashigi(),
      { coverageMode: 'simpleBoostScope' },
    );

    expect(coverage.matches).toBe(true);
    expect(resolveCaptainCoverageFormOnlyClasses(coverage)).toBeNull();
  });

  it('says nothing about a form class when the same clause boosts the unit as it is', () => {
    // Striker is #1983's own class, Driven only its Smoker form's: boosted either way, no swap needed.
    const coverage = resolveCaptainCoverage(
      captain('Boosts ATK of Striker and Driven characters by 2x'),
      smokerAndTashigi(),
      { coverageMode: 'simpleBoostScope' },
    );

    expect(coverage.matches).toBe(true);
    expect(coverage.chips.map((chip) => chip.label).sort()).toEqual(['Driven', 'Striker']);
    expect(resolveCaptainCoverageFormOnlyClasses(coverage)).toBeNull();
  });

  it('names every form a two-class scope reaches, each beside its class', () => {
    const coverage = resolveCaptainCoverage(
      captain('Boosts ATK of Driven and Cerebral characters by 2x'),
      smokerAndTashigi(),
      { coverageMode: 'simpleBoostScope' },
    );

    // The app's class order - Cerebral before Driven - with each form in its class's place.
    expect(coverage.matches).toBe(true);
    expect(resolveCaptainCoverageFormOnlyClasses(coverage)).toEqual({
      classes: ['Cerebral', 'Driven'],
      forms: ['Tashigi', 'Smoker'],
    });
  });

  it('leaves type scopes as they were: an INT-only Captain still does not boost the INT/PSY unit', () => {
    const coverage = resolveCaptainCoverage(
      captain('Boosts ATK of [INT] characters by 2x'),
      smokerAndTashigi(),
      { coverageMode: 'simpleBoostScope' },
    );

    expect(coverage.matches).toBe(false);
  });
});

describe('Captain Coverage tiers and a dual unit', () => {
  const drivenTier = tier(1, { classes: ['Driven'] });
  const fallbackTier = tier(2, { fallbackOther: true });

  it('puts #1983 in the Driven tier as Smoker AND in "all other characters" as itself', () => {
    expect(matchesCaptainCoverageTier(drivenTier, smokerAndTashigi(), [drivenTier])).toBe(true);
    expect(matchesCaptainCoverageTier(fallbackTier, smokerAndTashigi(), [drivenTier])).toBe(true);
  });

  it('leaves a unit without forms exactly where it was', () => {
    expect(matchesCaptainCoverageTier(drivenTier, smokerAndTashigi([]), [drivenTier])).toBe(false);
    expect(matchesCaptainCoverageTier(fallbackTier, smokerAndTashigi([]), [drivenTier])).toBe(true);

    const plainDriven = character(8, { classes: ['Slasher', 'Driven'] });

    expect(matchesCaptainCoverageTier(drivenTier, plainDriven, [drivenTier])).toBe(true);
    expect(matchesCaptainCoverageTier(fallbackTier, plainDriven, [drivenTier])).toBe(false);
  });
});

describe('the Captain Coverage list', () => {
  it('lists and counts #1983 as boosted by a Driven Captain, and under a Driven class filter', () => {
    const drivenCaptain = captain('Boosts ATK of Driven characters by 2.5x');
    const characters = [drivenCaptain, smokerAndTashigi(), character(20, { classes: ['Fighter'] })];
    const dataset = buildCaptainCoverageResultPassDataset(
      characters,
      new Map(characters.map((entry) => [entry.id, entry])),
    );
    const pass = (classFacet = createEmptyCharacterFacetSelection()) =>
      runCaptainCoverageResultPass(dataset, {
        captain: drivenCaptain,
        filterState: createCaptainCoverageFilterState({ requireCaptainCoverage: true }),
        characterBoxIds: null,
        typeFacet: createEmptyCharacterFacetSelection(),
        classFacet,
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
      });

    expect(pass().ids).toContain(1983);
    expect(pass().ids).not.toContain(20);
    expect(pass({ values: ['Driven'], matchMode: 'any' }).ids).toContain(1983);
    expect(pass({ values: ['Driven', 'Cerebral'], matchMode: 'all' }).ids).not.toContain(1983);
  });
});

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

function smokerAndTashigi(forms: CharacterForm[] = [SMOKER, TASHIGI]): CharacterDetailRecord {
  return {
    ...character(1983, { classes: ['Striker', 'Slasher'], type: 'INT,PSY' }),
    name: 'Smoker & Tashigi - Straw Hat Pursuer',
    forms,
  };
}

function captain(captainAbility: string): CharacterDetailRecord {
  return character(9001, { captainAbility, classes: ['Fighter'] });
}

function tier(
  number: number,
  conditions: Partial<CharacterCaptainAbilityCoverageTier['characterConditions']>,
): CharacterCaptainAbilityCoverageTier {
  return {
    tier: number,
    kind: 'conditional',
    scope: 'subset',
    characterConditions: {
      universal: false,
      fallbackOther: false,
      selfOnly: false,
      types: [],
      classes: [],
      characterTags: [],
      ...conditions,
    },
    teamConditions: [],
    fieldConditions: [],
    triggerConditions: [],
    clauses: [],
  };
}

function character(
  id: number,
  shape: { captainAbility?: string; classes?: string[]; type?: string },
): CharacterDetailRecord {
  const classes = shape.classes ?? ['Shooter', 'Cerebral'];

  return {
    id,
    name: `Character ${id}`,
    searchText: '',
    isIncomplete: false,
    type: shape.type ?? 'QCK',
    classes,
    primaryClass: classes[0] ?? 'Shooter',
    secondaryClass: classes[1] ?? null,
    stars: 5,
    cost: 30,
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

import { describe, expect, it } from 'vitest';

import {
  isEmptyCharacterFilterDraft,
  parseCharacterFilterDraft,
  readAbilityTagSetSelection,
  readCharacterTagSetSelection,
  readCostRange,
  readFacetSelection,
  readTierNumbers,
  type CharacterFilterDraft,
} from './character-filter-draft.utils';

/*
 * 869f127c9. The property under test is not "a valid draft round-trips" - it is that a draft
 * written by a DIFFERENT build is taken apart field by field, so one unreadable field cannot cost
 * the reader the rest of a filter set they spent minutes assembling.
 */

function fullDraft(): CharacterFilterDraft {
  return {
    searchTerm: 'zoro',
    typeFacet: { values: ['STR'], matchMode: 'any' },
    classFacet: { values: ['Slasher'], matchMode: 'all' },
    coverageCostRange: { min: 10, max: 55 },
    sortMode: 'captainAtkBoost',
    idOrder: 'oldest',
    favoritesOnly: true,
    hideFavorites: false,
    requireSuperTandemPresence: true,
    requireSuperTypesClassesPresence: false,
    requiredTierNumbers: [1, 3],
    characterTagSetSelection: {
      sets: [{ id: 'set-1', operator: 'any', tags: ['Minks'] }],
      operator: 'all',
    },
    abilityTagSetSelection: {
      sets: [{ id: 'ability-1', operator: 'all', requirements: [{ abilityKey: 'remove_bind' }] }],
      operator: 'any',
    } as CharacterFilterDraft['abilityTagSetSelection'],
    selectedCharacterBoxId: 'box-1',
  };
}

describe('parseCharacterFilterDraft', () => {
  it('round-trips a draft this build wrote', () => {
    const draft = fullDraft();

    expect(parseCharacterFilterDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it('returns nothing for a non-object', () => {
    expect(parseCharacterFilterDraft(null)).toEqual({});
    expect(parseCharacterFilterDraft('[]')).toEqual({});
    expect(parseCharacterFilterDraft([1, 2])).toEqual({});
  });

  it('omits a key it cannot read rather than writing a wrong value for it', () => {
    const parsed = parseCharacterFilterDraft({
      searchTerm: 42,
      favoritesOnly: 'yes',
      sortMode: 'byVibes',
    });

    expect(parsed).toEqual({});
    expect('searchTerm' in parsed).toBe(false);
  });

  it('keeps every other field when ONE is unreadable', () => {
    // The whole point. A tag set written by a later build must not take the type facet with it.
    const parsed = parseCharacterFilterDraft({
      ...fullDraft(),
      characterTagSetSelection: { sets: [{ id: 'set-1' }], operator: 'all' },
    });

    expect(parsed.typeFacet).toEqual({ values: ['STR'], matchMode: 'any' });
    expect(parsed.favoritesOnly).toBe(true);
    expect(parsed.requiredTierNumbers).toEqual([1, 3]);
    expect('characterTagSetSelection' in parsed).toBe(false);
  });

  it('restores a null character box, because "no box" is a real choice', () => {
    expect(
      parseCharacterFilterDraft({ selectedCharacterBoxId: null }),
    ).toEqual({ selectedCharacterBoxId: null });
  });

  it('drops a character box id that is not a string', () => {
    expect(parseCharacterFilterDraft({ selectedCharacterBoxId: 7 })).toEqual({});
  });
});

describe('readFacetSelection', () => {
  it('reads values and match mode together', () => {
    expect(readFacetSelection({ values: ['STR', 'QCK'], matchMode: 'all' })).toEqual({
      values: ['STR', 'QCK'],
      matchMode: 'all',
    });
  });

  it('refuses values with no match mode, which would filter under a combinator nobody chose', () => {
    expect(readFacetSelection({ values: ['STR'] })).toBeNull();
    expect(readFacetSelection({ values: ['STR'], matchMode: 'either' })).toBeNull();
  });

  it('refuses a values array holding a non-string', () => {
    expect(readFacetSelection({ values: ['STR', 7], matchMode: 'any' })).toBeNull();
  });
});

describe('readCostRange', () => {
  it('reads an open range', () => {
    expect(readCostRange({ min: null, max: null })).toEqual({ min: null, max: null });
  });

  it('reads a bounded range', () => {
    expect(readCostRange({ min: 5, max: 60 })).toEqual({ min: 5, max: 60 });
  });

  it('refuses a non-finite bound rather than filtering against NaN', () => {
    expect(readCostRange({ min: Number.NaN, max: null })).toBeNull();
    expect(readCostRange({ min: '5', max: null })).toBeNull();
  });

  it('refuses a range missing a bound entirely', () => {
    expect(readCostRange({ min: 5 })).toBeNull();
  });
});

describe('readTierNumbers', () => {
  it('reads positive integers and de-duplicates', () => {
    expect(readTierNumbers([2, 1, 2])).toEqual([2, 1]);
  });

  it('accepts a tier beyond what this dataset holds, since the dataset decides the count', () => {
    expect(readTierNumbers([99])).toEqual([99]);
  });

  it('refuses the whole list when any entry is not a positive integer', () => {
    expect(readTierNumbers([1, 0])).toBeNull();
    expect(readTierNumbers([1, 1.5])).toBeNull();
    expect(readTierNumbers([1, '2'])).toBeNull();
  });
});

describe('readCharacterTagSetSelection', () => {
  it('reads sets and the joining operator', () => {
    expect(
      readCharacterTagSetSelection({
        sets: [{ id: 'a', operator: 'any', tags: ['Minks'] }],
        operator: 'all',
      }),
    ).toEqual({ sets: [{ id: 'a', operator: 'any', tags: ['Minks'] }], operator: 'all' });
  });

  it('reads an empty selection', () => {
    expect(readCharacterTagSetSelection({ sets: [], operator: 'any' })).toEqual({
      sets: [],
      operator: 'any',
    });
  });

  it('refuses a set missing its operator or tags', () => {
    expect(readCharacterTagSetSelection({ sets: [{ id: 'a', tags: [] }], operator: 'all' })).toBeNull();
    expect(
      readCharacterTagSetSelection({ sets: [{ id: 'a', operator: 'any' }], operator: 'all' }),
    ).toBeNull();
  });
});

describe('readAbilityTagSetSelection', () => {
  it('passes requirement objects through without re-validating a shape it does not own', () => {
    const selection = {
      sets: [{ id: 'a', operator: 'all', requirements: [{ abilityKey: 'x', turns: 3 }] }],
      operator: 'any',
    };

    expect(readAbilityTagSetSelection(selection)).toEqual(selection);
  });

  it('refuses requirements that are not objects', () => {
    expect(
      readAbilityTagSetSelection({
        sets: [{ id: 'a', operator: 'all', requirements: ['remove_bind'] }],
        operator: 'any',
      }),
    ).toBeNull();
  });
});

describe('isEmptyCharacterFilterDraft', () => {
  function emptyDraft(): CharacterFilterDraft {
    return {
      searchTerm: '   ',
      typeFacet: { values: [], matchMode: 'any' },
      classFacet: { values: [], matchMode: 'any' },
      coverageCostRange: { min: null, max: null },
      sortMode: 'catalog',
      idOrder: 'newest',
      favoritesOnly: false,
      hideFavorites: false,
      requireSuperTandemPresence: false,
      requireSuperTypesClassesPresence: false,
      requiredTierNumbers: [],
      characterTagSetSelection: { sets: [], operator: 'any' },
      abilityTagSetSelection: { sets: [], operator: 'any' },
      selectedCharacterBoxId: null,
    };
  }

  it('calls an untouched filter set empty, so nothing is parked for it', () => {
    expect(isEmptyCharacterFilterDraft(emptyDraft())).toBe(true);
  });

  it('does not treat a changed sort or id order as a filter', () => {
    // They are not filters, and clearAllFilters() deliberately leaves them alone.
    expect(
      isEmptyCharacterFilterDraft({
        ...emptyDraft(),
        sortMode: 'nameDesc',
        idOrder: 'oldest',
      }),
    ).toBe(true);
  });

  for (const [label, override] of [
    ['a search term', { searchTerm: 'zoro' }],
    ['a type facet', { typeFacet: { values: ['STR'], matchMode: 'any' as const } }],
    ['a cost bound', { coverageCostRange: { min: 10, max: null } }],
    ['favourites only', { favoritesOnly: true }],
    ['a required tier', { requiredTierNumbers: [1] }],
    ['a character box', { selectedCharacterBoxId: 'box-1' }],
  ] as Array<[string, Partial<CharacterFilterDraft>]>) {
    it(`is not empty with ${label}`, () => {
      expect(isEmptyCharacterFilterDraft({ ...emptyDraft(), ...override })).toBe(false);
    });
  }
});

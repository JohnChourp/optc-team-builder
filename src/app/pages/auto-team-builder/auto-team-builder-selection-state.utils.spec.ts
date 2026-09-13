import { describe, expect, it } from 'vitest';

import {
  isDefaultSelectionState,
  narrowToAvailable,
  parseSelectionState,
  type AutoTeamBuilderSelectionState,
} from './auto-team-builder-selection-state.utils';

/*
 * 869f1935z. `869f127c9` asked for the same persistence rule across the builders and stopped
 * before the Auto Team Builder, because its selection also has a preset codec with reader-visible
 * side effects. This stores the four filters and nothing else, which is what keeps it the same
 * change Captain Coverage already shipped rather than a second preset system.
 */

function state(
  overrides: Partial<AutoTeamBuilderSelectionState> = {},
): AutoTeamBuilderSelectionState {
  return {
    selectedTypes: [],
    selectedClasses: [],
    selectedCharacterNames: [],
    characterTagSets: { sets: [], operator: 'all' },
    ...overrides,
  };
}

describe('parseSelectionState', () => {
  it('reads every field', () => {
    const parsed = parseSelectionState({
      selectedTypes: ['STR', 'QCK'],
      selectedClasses: ['Fighter'],
      selectedCharacterNames: ['Luffy'],
      characterTagSets: { sets: [{ id: 's1', operator: 'any', tags: ['a'] }], operator: 'all' },
    });

    expect(parsed.selectedTypes).toEqual(['STR', 'QCK']);
    expect(parsed.selectedClasses).toEqual(['Fighter']);
    expect(parsed.selectedCharacterNames).toEqual(['Luffy']);
    expect(parsed.characterTagSets?.sets).toHaveLength(1);
  });

  it('keeps the other three when ONE field is malformed', () => {
    /*
     * The correction `869f127c9` already had to make once: one bad value threw away a whole draft
     * the reader could see no reason to lose.
     */
    const parsed = parseSelectionState({
      selectedTypes: ['STR'],
      selectedClasses: 'Fighter',
      selectedCharacterNames: ['Luffy'],
      characterTagSets: { sets: 'nope', operator: 'all' },
    });

    expect(parsed.selectedTypes).toEqual(['STR']);
    expect(parsed.selectedCharacterNames).toEqual(['Luffy']);
    expect(parsed.selectedClasses).toBeUndefined();
    expect(parsed.characterTagSets).toBeUndefined();
  });

  it('de-duplicates', () => {
    expect(parseSelectionState({ selectedTypes: ['STR', 'STR'] }).selectedTypes).toEqual(['STR']);
  });

  it('returns nothing for junk', () => {
    expect(parseSelectionState(null)).toEqual({});
    expect(parseSelectionState('[]')).toEqual({});
  });
});

describe('isDefaultSelectionState', () => {
  it('treats a cleared selection as default, so the key is removed rather than kept', () => {
    // A reader who cleared their filters must not be handed them back on the next visit.
    expect(isDefaultSelectionState(state())).toBe(true);
  });

  it('treats empty tag SETS as default, because a set with no tags filters nothing', () => {
    expect(
      isDefaultSelectionState(
        state({ characterTagSets: { sets: [{ id: 's1', operator: 'any', tags: [] }], operator: 'all' } }),
      ),
    ).toBe(true);
  });

  it('is not default once any filter carries a value', () => {
    expect(isDefaultSelectionState(state({ selectedTypes: ['STR'] }))).toBe(false);
    expect(isDefaultSelectionState(state({ selectedCharacterNames: ['Luffy'] }))).toBe(false);
    expect(
      isDefaultSelectionState(
        state({ characterTagSets: { sets: [{ id: 's1', operator: 'any', tags: ['x'] }], operator: 'all' } }),
      ),
    ).toBe(false);
  });
});

describe('narrowToAvailable', () => {
  it('drops a value this build no longer offers', () => {
    /*
     * A class upstream renamed away would otherwise sit in the filter bar as a chip matching
     * nothing, which reads as the builder being broken rather than as a stale filter.
     */
    expect(narrowToAvailable(['Fighter', 'Ghost'], ['Fighter', 'Striker'])).toEqual(['Fighter']);
  });

  it('keeps order and returns empty when nothing survives', () => {
    expect(narrowToAvailable(['b', 'a'], ['a', 'b'])).toEqual(['b', 'a']);
    expect(narrowToAvailable(['x'], ['a'])).toEqual([]);
  });
});

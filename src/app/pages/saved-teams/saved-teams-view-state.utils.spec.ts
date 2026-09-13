import { describe, expect, it } from 'vitest';

import {
  toStoredAbilityIds,
  toStoredTagSetSelection,
} from './saved-teams-view-state.utils';

/*
 * 869f1935z. Stored view state is untrusted input - an older build, a newer one, or a tab left
 * open across a deploy. The failure that matters is not a crash: it is a filter that survives in
 * a shape this build half-understands and silently matches nothing, leaving the reader staring at
 * an empty list they cannot explain. Every test below is one route to that.
 */

describe('toStoredAbilityIds', () => {
  it('accepts a string array and de-duplicates it', () => {
    expect(toStoredAbilityIds(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('accepts an empty array, which is a real state and not a missing one', () => {
    // "the reader cleared their filters" must not be restored as "the reader had filters".
    expect(toStoredAbilityIds([])).toEqual([]);
  });

  it('rejects a mixed array rather than keeping the strings out of it', () => {
    expect(toStoredAbilityIds(['a', 3, 'b'])).toBeNull();
  });

  it('rejects anything that is not an array', () => {
    expect(toStoredAbilityIds('a,b')).toBeNull();
    expect(toStoredAbilityIds(null)).toBeNull();
    expect(toStoredAbilityIds(undefined)).toBeNull();
  });
});

describe('toStoredTagSetSelection', () => {
  const validSet = { id: 's1', operator: 'any', tags: ['bind', 'despair'] };

  it('accepts a well-formed selection', () => {
    expect(toStoredTagSetSelection({ sets: [validSet], operator: 'all' })).toEqual({
      sets: [{ id: 's1', operator: 'any', tags: ['bind', 'despair'] }],
      operator: 'all',
    });
  });

  it('rejects an unknown top-level operator instead of defaulting it', () => {
    // The page rule for the sort key, applied to shapes: restore only what this build understands.
    expect(toStoredTagSetSelection({ sets: [validSet], operator: 'either' })).toBeNull();
  });

  it('drops one malformed set and keeps the rest', () => {
    /*
     * Per set, not per selection. Losing a reader's other filters over one bad entry is worse
     * than losing the bad one.
     */
    const restored = toStoredTagSetSelection({
      sets: [validSet, { id: 's2', operator: 'nope', tags: [] }, { id: 's3', operator: 'all', tags: ['x'] }],
      operator: 'any',
    });

    expect(restored?.sets.map((set) => set.id)).toEqual(['s1', 's3']);
  });

  it('drops a set whose tags are not all strings', () => {
    const restored = toStoredTagSetSelection({
      sets: [{ id: 's1', operator: 'any', tags: ['a', 7] }],
      operator: 'any',
    });

    expect(restored?.sets).toEqual([]);
  });

  it('rejects a selection with no sets array', () => {
    expect(toStoredTagSetSelection({ operator: 'all' })).toBeNull();
    expect(toStoredTagSetSelection(null)).toBeNull();
    expect(toStoredTagSetSelection('sets')).toBeNull();
  });

  it('keeps an empty set list, which is how a cleared filter round-trips', () => {
    expect(toStoredTagSetSelection({ sets: [], operator: 'all' })).toEqual({
      sets: [],
      operator: 'all',
    });
  });
});

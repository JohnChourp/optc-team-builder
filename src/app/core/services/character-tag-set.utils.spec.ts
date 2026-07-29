import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord, type CharacterTagSetSelection } from '../models/optc.models';
import {
  MAX_CHARACTER_TAG_SETS,
  buildCharacterTagMatchIndex,
  cloneCharacterTagSetSelection,
  countCharacterTagSetTags,
  countPopulatedCharacterTagSets,
  createCharacterTagSet,
  createEmptyCharacterTagSetSelection,
  expandCharacterTagsToSets,
  flattenCharacterTagSets,
  isOverCharacterTagSetCap,
  matchesCharacterTagSets,
  normalizeCharacterTagSetSelection,
  resolveCharacterTagSetSelectionMatchingCharacterIds,
} from './character-tag-set.utils';

const STRAW_HAT = 'Straw Hat Pirates';
const HEART = 'Heart Pirates';
const DRESSROSA = 'Dressrosa';
const WORST_GENERATION = 'Worst Generation';

function selectionOf(
  sets: Array<{ operator: 'all' | 'any'; tags: string[] }>,
  operator: 'all' | 'any' = 'all',
): CharacterTagSetSelection {
  return {
    operator,
    sets: sets.map((set, index) => ({
      id: `set-${index}`,
      operator: set.operator,
      tags: [...set.tags],
    })),
  };
}

describe('createCharacterTagSet', () => {
  it('defaults to the OR operator because character tags are mostly disjoint', () => {
    expect(createCharacterTagSet([STRAW_HAT, HEART]).operator).toBe('any');
  });

  it('trims, drops blanks and de-duplicates while preserving the original case', () => {
    const set = createCharacterTagSet(['  Straw Hat Pirates ', '', '   ', STRAW_HAT, HEART], 'all');

    expect(set).toEqual(
      expect.objectContaining({
        operator: 'all',
        tags: [STRAW_HAT, HEART],
      }),
    );
  });

  it('keeps case variants as distinct tags so persisted user data never shifts', () => {
    expect(createCharacterTagSet([STRAW_HAT, 'straw hat pirates']).tags).toEqual([
      STRAW_HAT,
      'straw hat pirates',
    ]);
  });

  it('normalizes an unknown operator to all and mints an id when none is given', () => {
    const set = createCharacterTagSet([STRAW_HAT], 'ANY' as 'any');

    expect(set.operator).toBe('all');
    expect(set.id.length).toBeGreaterThan(0);
  });

  it('honours an explicit id', () => {
    expect(createCharacterTagSet([STRAW_HAT], 'any', 'fixed-id').id).toBe('fixed-id');
  });

  it('creates an empty set with no arguments', () => {
    expect(createCharacterTagSet().tags).toEqual([]);
  });
});

describe('createEmptyCharacterTagSetSelection', () => {
  it('starts with no sets joined by all', () => {
    expect(createEmptyCharacterTagSetSelection()).toEqual({ sets: [], operator: 'all' });
  });
});

describe('cloneCharacterTagSetSelection', () => {
  it('deep-copies the tag arrays so edits do not leak back', () => {
    const selection = selectionOf([{ operator: 'any', tags: [STRAW_HAT] }], 'any');
    const clone = cloneCharacterTagSetSelection(selection);

    clone.sets[0].tags.push(HEART);

    expect(clone).toEqual({
      operator: 'any',
      sets: [{ id: 'set-0', operator: 'any', tags: [STRAW_HAT, HEART] }],
    });
    expect(selection.sets[0].tags).toEqual([STRAW_HAT]);
  });

  it('repairs operators that were widened away from the union', () => {
    const clone = cloneCharacterTagSetSelection({
      operator: 'or' as 'any',
      sets: [{ id: 'set-0', operator: 'nonsense' as 'any', tags: [STRAW_HAT] }],
    });

    expect(clone.operator).toBe('all');
    expect(clone.sets[0].operator).toBe('all');
  });
});

describe('normalizeCharacterTagSetSelection', () => {
  it('rebuilds a well-formed selection', () => {
    expect(
      normalizeCharacterTagSetSelection({
        operator: 'all',
        sets: [
          { id: 'a', operator: 'any', tags: [STRAW_HAT, HEART] },
          { id: 'b', operator: 'all', tags: [DRESSROSA] },
        ],
      }),
    ).toEqual({
      operator: 'all',
      sets: [
        { id: 'a', operator: 'any', tags: [STRAW_HAT, HEART] },
        { id: 'b', operator: 'all', tags: [DRESSROSA] },
      ],
    });
  });

  it('drops unknown fields and trims tags while preserving case', () => {
    const selection = normalizeCharacterTagSetSelection({
      operator: 'any',
      unexpected: 'ignored',
      sets: [{ id: ' a ', operator: 'any', tags: ['  Straw Hat Pirates  '], extra: 1 }],
    });

    expect(selection).toEqual({
      operator: 'any',
      sets: [{ id: 'a', operator: 'any', tags: [STRAW_HAT] }],
    });
  });

  it('mints an id when the persisted one is missing or blank', () => {
    const selection = normalizeCharacterTagSetSelection({
      operator: 'all',
      sets: [{ id: '   ', operator: 'any', tags: [STRAW_HAT] }],
    });

    expect(selection?.sets[0].id.length).toBeGreaterThan(0);
  });

  it('skips malformed and empty sets', () => {
    const selection = normalizeCharacterTagSetSelection({
      operator: 'all',
      sets: [
        null,
        'nope',
        ['nope'],
        { id: 'a', operator: 'any' },
        { id: 'b', operator: 'any', tags: [] },
        { id: 'c', operator: 'any', tags: ['   ', 42, null] },
        { id: 'd', operator: 'any', tags: [HEART, 7] },
      ],
    });

    expect(selection).toEqual({
      operator: 'all',
      sets: [{ id: 'd', operator: 'any', tags: [HEART] }],
    });
  });

  it('defaults a missing or unknown operator to all at both levels', () => {
    expect(
      normalizeCharacterTagSetSelection({
        sets: [{ id: 'a', tags: [STRAW_HAT] }],
      }),
    ).toEqual({ operator: 'all', sets: [{ id: 'a', operator: 'all', tags: [STRAW_HAT] }] });
  });

  it('returns null for junk that carries no usable sets', () => {
    expect(normalizeCharacterTagSetSelection(null)).toBeNull();
    expect(normalizeCharacterTagSetSelection(undefined)).toBeNull();
    expect(normalizeCharacterTagSetSelection('sets')).toBeNull();
    expect(normalizeCharacterTagSetSelection(42)).toBeNull();
    expect(normalizeCharacterTagSetSelection([])).toBeNull();
    expect(normalizeCharacterTagSetSelection({})).toBeNull();
    expect(normalizeCharacterTagSetSelection({ sets: 'nope' })).toBeNull();
    expect(normalizeCharacterTagSetSelection({ sets: [] })).toBeNull();
    expect(normalizeCharacterTagSetSelection({ sets: [{ id: 'a', tags: [] }] })).toBeNull();
  });

  it('stops normalizing once the cap is reached', () => {
    const selection = normalizeCharacterTagSetSelection({
      operator: 'all',
      sets: Array.from({ length: MAX_CHARACTER_TAG_SETS + 3 }, (_unused, index) => ({
        id: `set-${index}`,
        operator: 'any',
        tags: [`Tag ${index}`],
      })),
    });

    expect(selection?.sets).toHaveLength(MAX_CHARACTER_TAG_SETS);
    expect(selection?.sets.at(-1)?.id).toBe(`set-${MAX_CHARACTER_TAG_SETS - 1}`);
  });
});

describe('expandCharacterTagsToSets', () => {
  it('maps the legacy require-all boolean onto one AND set', () => {
    expect(expandCharacterTagsToSets([STRAW_HAT, DRESSROSA], true)).toEqual({
      operator: 'all',
      sets: [expect.objectContaining({ operator: 'all', tags: [STRAW_HAT, DRESSROSA] })],
    });
  });

  it('maps the legacy require-any boolean onto one OR set', () => {
    expect(expandCharacterTagsToSets([STRAW_HAT, DRESSROSA], false)).toEqual({
      operator: 'all',
      sets: [expect.objectContaining({ operator: 'any', tags: [STRAW_HAT, DRESSROSA] })],
    });
  });

  it('returns an empty selection when there are no usable legacy tags', () => {
    expect(expandCharacterTagsToSets([], false)).toEqual(createEmptyCharacterTagSetSelection());
    expect(expandCharacterTagsToSets(['  ', ''], true)).toEqual(
      createEmptyCharacterTagSetSelection(),
    );
  });

  it.each([true, false])(
    'round-trips the legacy tag list through flatten for requireAll=%s',
    (requireAll) => {
      const tags = [STRAW_HAT, HEART, DRESSROSA];

      expect(flattenCharacterTagSets(expandCharacterTagsToSets(tags, requireAll))).toEqual(tags);
    },
  );

  it.each([true, false])('preserves the legacy predicate for requireAll=%s', (requireAll) => {
    const selection = expandCharacterTagsToSets([STRAW_HAT, DRESSROSA], requireAll);

    expect(matchesCharacterTagSets([STRAW_HAT, DRESSROSA], selection)).toBe(true);
    expect(matchesCharacterTagSets([STRAW_HAT], selection)).toBe(!requireAll);
    expect(matchesCharacterTagSets([WORST_GENERATION], selection)).toBe(false);
  });
});

describe('flattenCharacterTagSets', () => {
  it('unions the sets, de-duplicating on the exact value and keeping order', () => {
    expect(
      flattenCharacterTagSets(
        selectionOf([
          { operator: 'any', tags: [STRAW_HAT, HEART] },
          { operator: 'all', tags: [HEART, DRESSROSA] },
        ]),
      ),
    ).toEqual([STRAW_HAT, HEART, DRESSROSA]);
  });

  it('preserves original case rather than folding case variants together', () => {
    expect(
      flattenCharacterTagSets(
        selectionOf([
          { operator: 'any', tags: [STRAW_HAT] },
          { operator: 'any', tags: ['STRAW HAT PIRATES'] },
        ]),
      ),
    ).toEqual([STRAW_HAT, 'STRAW HAT PIRATES']);
  });

  it('returns an empty list for an empty selection', () => {
    expect(flattenCharacterTagSets(createEmptyCharacterTagSetSelection())).toEqual([]);
  });
});

describe('countCharacterTagSetTags / countPopulatedCharacterTagSets', () => {
  it('counts tags across every set and only the populated sets', () => {
    const selection = selectionOf([
      { operator: 'any', tags: [STRAW_HAT, HEART] },
      { operator: 'all', tags: [] },
      { operator: 'all', tags: [DRESSROSA] },
    ]);

    expect(countCharacterTagSetTags(selection)).toBe(3);
    expect(countPopulatedCharacterTagSets(selection)).toBe(2);
  });

  it('counts nothing for an empty selection', () => {
    const selection = createEmptyCharacterTagSetSelection();

    expect(countCharacterTagSetTags(selection)).toBe(0);
    expect(countPopulatedCharacterTagSets(selection)).toBe(0);
  });
});

describe('isOverCharacterTagSetCap', () => {
  const buildSets = (count: number) =>
    selectionOf(
      Array.from({ length: count }, (_unused, index) => ({
        operator: 'any' as const,
        tags: [`Tag ${index}`],
      })),
    );

  it('is false at or below the cap', () => {
    expect(isOverCharacterTagSetCap(createEmptyCharacterTagSetSelection())).toBe(false);
    expect(isOverCharacterTagSetCap(buildSets(MAX_CHARACTER_TAG_SETS))).toBe(false);
  });

  it('is true above the cap', () => {
    expect(isOverCharacterTagSetCap(buildSets(MAX_CHARACTER_TAG_SETS + 1))).toBe(true);
  });
});

describe('matchesCharacterTagSets', () => {
  it('applies no filter when the selection holds no sets', () => {
    expect(matchesCharacterTagSets([], createEmptyCharacterTagSetSelection())).toBe(true);
    expect(matchesCharacterTagSets([STRAW_HAT], createEmptyCharacterTagSetSelection())).toBe(true);
  });

  it('applies no filter when every set is empty', () => {
    const selection = selectionOf([
      { operator: 'any', tags: [] },
      { operator: 'all', tags: [] },
    ]);

    expect(matchesCharacterTagSets([], selection)).toBe(true);
    expect(matchesCharacterTagSets([WORST_GENERATION], selection)).toBe(true);
  });

  it('skips a half-built empty set instead of blanking the results', () => {
    const selection = selectionOf([
      { operator: 'any', tags: [STRAW_HAT, HEART] },
      { operator: 'any', tags: [] },
    ]);

    expect(matchesCharacterTagSets([HEART], selection)).toBe(true);
    expect(matchesCharacterTagSets([WORST_GENERATION], selection)).toBe(false);
  });

  describe('within a set', () => {
    it('matches any when the character carries at least one tag', () => {
      const selection = selectionOf([{ operator: 'any', tags: [STRAW_HAT, HEART] }]);

      expect(matchesCharacterTagSets([HEART, WORST_GENERATION], selection)).toBe(true);
      expect(matchesCharacterTagSets([STRAW_HAT, HEART], selection)).toBe(true);
      expect(matchesCharacterTagSets([WORST_GENERATION], selection)).toBe(false);
      expect(matchesCharacterTagSets([], selection)).toBe(false);
    });

    it('matches all only when the character carries every tag', () => {
      const selection = selectionOf([{ operator: 'all', tags: [HEART, WORST_GENERATION] }]);

      expect(matchesCharacterTagSets([HEART, WORST_GENERATION, DRESSROSA], selection)).toBe(true);
      expect(matchesCharacterTagSets([HEART], selection)).toBe(false);
      expect(matchesCharacterTagSets([], selection)).toBe(false);
    });
  });

  describe('across sets', () => {
    const sets = [
      { operator: 'any' as const, tags: [STRAW_HAT, HEART] },
      { operator: 'any' as const, tags: [DRESSROSA] },
    ];

    it('ANDs the sets — the "(Straw Hat OR Heart) AND (Dressrosa)" shape', () => {
      const selection = selectionOf(sets, 'all');

      expect(matchesCharacterTagSets([STRAW_HAT, DRESSROSA], selection)).toBe(true);
      expect(matchesCharacterTagSets([HEART, DRESSROSA], selection)).toBe(true);
      expect(matchesCharacterTagSets([STRAW_HAT], selection)).toBe(false);
      expect(matchesCharacterTagSets([DRESSROSA], selection)).toBe(false);
    });

    it('ORs the sets when the selection operator is any', () => {
      const selection = selectionOf(sets, 'any');

      expect(matchesCharacterTagSets([STRAW_HAT], selection)).toBe(true);
      expect(matchesCharacterTagSets([DRESSROSA], selection)).toBe(true);
      expect(matchesCharacterTagSets([WORST_GENERATION], selection)).toBe(false);
    });

    it('mixes per-set operators independently of the selection operator', () => {
      const selection = selectionOf(
        [
          { operator: 'all', tags: [HEART, WORST_GENERATION] },
          { operator: 'any', tags: [DRESSROSA, STRAW_HAT] },
        ],
        'all',
      );

      expect(matchesCharacterTagSets([HEART, WORST_GENERATION, DRESSROSA], selection)).toBe(true);
      expect(matchesCharacterTagSets([HEART, DRESSROSA], selection)).toBe(false);
      expect(matchesCharacterTagSets([HEART, WORST_GENERATION], selection)).toBe(false);
    });
  });

  it('compares case-insensitively and whitespace-trimmed on both sides', () => {
    const selection = selectionOf([{ operator: 'all', tags: ['  straw hat PIRATES  ', HEART] }]);

    expect(matchesCharacterTagSets(['STRAW HAT PIRATES', ' heart pirates '], selection)).toBe(true);
  });

  it('keeps stored tags in their original case while matching case-insensitively', () => {
    const selection = selectionOf([{ operator: 'any', tags: [STRAW_HAT] }]);

    expect(matchesCharacterTagSets(['straw hat pirates'], selection)).toBe(true);
    expect(selection.sets[0].tags).toEqual([STRAW_HAT]);
    expect(flattenCharacterTagSets(selection)).toEqual([STRAW_HAT]);
  });

  it('ignores blank tags on either side rather than matching them', () => {
    const selection = selectionOf([{ operator: 'all', tags: ['   ', STRAW_HAT] }]);

    expect(matchesCharacterTagSets([STRAW_HAT, '  '], selection)).toBe(true);
    expect(matchesCharacterTagSets(['  '], selection)).toBe(false);
  });

  it('treats a set of only blank tags as no constraint', () => {
    const selection = selectionOf([
      { operator: 'all', tags: ['   '] },
      { operator: 'any', tags: [STRAW_HAT] },
    ]);

    expect(matchesCharacterTagSets([STRAW_HAT], selection)).toBe(true);
  });

  it('normalizes an unknown operator to all at both levels', () => {
    const selection: CharacterTagSetSelection = {
      operator: 'or' as 'any',
      sets: [
        { id: 'a', operator: 'nonsense' as 'any', tags: [HEART, WORST_GENERATION] },
        { id: 'b', operator: 'any', tags: [DRESSROSA] },
      ],
    };

    expect(matchesCharacterTagSets([HEART, WORST_GENERATION, DRESSROSA], selection)).toBe(true);
    expect(matchesCharacterTagSets([HEART, DRESSROSA], selection)).toBe(false);
  });
});

function recordOf(id: number, characterTags: string[] | undefined): CharacterDetailRecord {
  return { id, detail: { characterTags } } as unknown as CharacterDetailRecord;
}

/**
 * A small corpus with deliberate overlaps: 1 and 2 share Straw Hat, 2 and 3
 * share Worst Generation, 4 carries nothing, 5 has the tag field absent.
 */
const CORPUS: CharacterDetailRecord[] = [
  recordOf(1, [STRAW_HAT, DRESSROSA]),
  recordOf(2, [STRAW_HAT, WORST_GENERATION]),
  recordOf(3, [HEART, WORST_GENERATION]),
  recordOf(4, []),
  recordOf(5, undefined),
  recordOf(6, [' straw hat pirates ']),
];

describe('buildCharacterTagMatchIndex', () => {
  it('maps every tag to the ids carrying it, keyed case-insensitively', () => {
    const index = buildCharacterTagMatchIndex(CORPUS);

    expect(index.get('straw hat pirates')).toEqual([1, 2, 6]);
    expect(index.get('worst generation')).toEqual([2, 3]);
    expect(index.get('heart pirates')).toEqual([3]);
  });

  it('skips characters with no tags and tolerates an absent tag field', () => {
    const index = buildCharacterTagMatchIndex(CORPUS);

    for (const ids of index.values()) {
      expect(ids).not.toContain(4);
      expect(ids).not.toContain(5);
    }
  });

  it('drops blank tags rather than indexing an empty key', () => {
    const index = buildCharacterTagMatchIndex([recordOf(9, ['  ', STRAW_HAT])]);

    expect(index.has('')).toBe(false);
    expect(index.get('straw hat pirates')).toEqual([9]);
  });
});

describe('resolveCharacterTagSetSelectionMatchingCharacterIds', () => {
  const index = buildCharacterTagMatchIndex(CORPUS);

  it('returns undefined for an empty selection so no gate is applied', () => {
    expect(
      resolveCharacterTagSetSelectionMatchingCharacterIds(
        createEmptyCharacterTagSetSelection(),
        index,
      ),
    ).toBeUndefined();
  });

  /**
   * The app-blanking regression: a user who taps "add group" and picks no tag
   * yet must still see the whole catalog. Returning [] here would intersect the
   * caller's id set down to empty and blank the page.
   */
  it('returns undefined — not an empty list — when sets exist but none are populated', () => {
    const selection = selectionOf([
      { operator: 'any', tags: [] },
      { operator: 'all', tags: [] },
    ]);

    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index)).toBeUndefined();
  });

  it('unions inside an any set', () => {
    const selection = selectionOf([{ operator: 'any', tags: [HEART, DRESSROSA] }]);

    expect(
      resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index)?.sort(),
    ).toEqual([1, 3]);
  });

  it('intersects inside an all set', () => {
    const selection = selectionOf([{ operator: 'all', tags: [STRAW_HAT, WORST_GENERATION] }]);

    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index)).toEqual([2]);
  });

  it('intersects across sets when the selection operator is all', () => {
    const selection = selectionOf(
      [
        { operator: 'any', tags: [STRAW_HAT] },
        { operator: 'any', tags: [WORST_GENERATION] },
      ],
      'all',
    );

    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index)).toEqual([2]);
  });

  it('unions across sets when the selection operator is any', () => {
    const selection = selectionOf(
      [
        { operator: 'any', tags: [DRESSROSA] },
        { operator: 'any', tags: [HEART] },
      ],
      'any',
    );

    expect(
      resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index)?.sort(),
    ).toEqual([1, 3]);
  });

  it('skips an unpopulated set instead of letting it collapse the result', () => {
    const selection = selectionOf(
      [
        { operator: 'any', tags: [HEART] },
        { operator: 'all', tags: [] },
      ],
      'all',
    );

    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index)).toEqual([3]);
  });

  it('matches nobody when an all set names a tag no character carries', () => {
    const selection = selectionOf([{ operator: 'all', tags: [STRAW_HAT, 'Nonexistent Crew'] }]);

    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index)).toEqual([]);
  });

  it('fails open on a null index so a failed catalog load never fakes an empty result', () => {
    const selection = selectionOf([{ operator: 'any', tags: [HEART] }]);

    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(selection, null)).toBeUndefined();
  });

  it('treats a set whose tags all normalize away as no constraint, like the predicate', () => {
    const anded = selectionOf(
      [
        { operator: 'any', tags: ['   '] },
        { operator: 'any', tags: [HEART] },
      ],
      'all',
    );
    const ored = selectionOf([{ operator: 'any', tags: ['  '] }], 'any');

    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(anded, index)).toEqual([3]);
    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(ored, index)).toBeUndefined();
  });

  it('collapses internal whitespace so a padded tag still resolves', () => {
    const selection = selectionOf([{ operator: 'any', tags: ['Straw   Hat  Pirates'] }]);

    expect(resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index)?.sort()).toEqual([
      1, 2, 6,
    ]);
  });
});

/**
 * Anti-drift gate. The id-set resolver and the per-character predicate are two
 * independent implementations of the same semantics, used by different hosts;
 * this replays a matrix of selections through both and demands identical
 * verdicts, so neither can be "fixed" in isolation.
 */
describe('id-set resolver agrees with the per-character predicate', () => {
  const index = buildCharacterTagMatchIndex(CORPUS);

  const SELECTIONS: CharacterTagSetSelection[] = [
    createEmptyCharacterTagSetSelection(),
    selectionOf([{ operator: 'any', tags: [] }]),
    selectionOf([{ operator: 'any', tags: [STRAW_HAT] }]),
    selectionOf([{ operator: 'all', tags: [STRAW_HAT, WORST_GENERATION] }]),
    selectionOf([{ operator: 'any', tags: [STRAW_HAT, HEART] }]),
    selectionOf([{ operator: 'all', tags: ['Nonexistent Crew'] }]),
    selectionOf([{ operator: 'any', tags: ['STRAW HAT PIRATES'] }]),
    selectionOf(
      [
        { operator: 'any', tags: [STRAW_HAT] },
        { operator: 'any', tags: [WORST_GENERATION] },
      ],
      'all',
    ),
    selectionOf(
      [
        { operator: 'any', tags: [DRESSROSA] },
        { operator: 'any', tags: [HEART] },
      ],
      'any',
    ),
    selectionOf(
      [
        { operator: 'all', tags: [STRAW_HAT, DRESSROSA] },
        { operator: 'any', tags: [] },
      ],
      'all',
    ),
    // A set whose tags all normalize away matches EVERY character, so ANDed it
    // constrains nothing and ORed it makes the whole selection inert. Both
    // shapes are replayed because the two operators take different code paths.
    selectionOf([{ operator: 'any', tags: ['   '] }]),
    selectionOf(
      [
        { operator: 'any', tags: ['   '] },
        { operator: 'any', tags: [HEART] },
      ],
      'all',
    ),
    selectionOf(
      [
        { operator: 'any', tags: ['   '] },
        { operator: 'any', tags: [HEART] },
      ],
      'any',
    ),
    // Whitespace collapse: the picker hands back collapsed tags, the catalog may
    // hold uncollapsed ones, and both must resolve to the same key.
    selectionOf([{ operator: 'any', tags: ['Straw   Hat  Pirates'] }]),
  ];

  for (const [caseIndex, selection] of SELECTIONS.entries()) {
    it(`agrees on selection ${caseIndex}`, () => {
      const resolved = resolveCharacterTagSetSelectionMatchingCharacterIds(selection, index);
      const allowed = resolved === undefined ? null : new Set(resolved);

      for (const record of CORPUS) {
        const viaPredicate = matchesCharacterTagSets(record.detail.characterTags ?? [], selection);
        const viaIdSet = allowed === null ? true : allowed.has(record.id);

        expect(viaIdSet, `character ${record.id} on selection ${caseIndex}`).toBe(viaPredicate);
      }
    });
  }
});

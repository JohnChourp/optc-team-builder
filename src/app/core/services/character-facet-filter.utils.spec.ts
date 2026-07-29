import { describe, expect, it } from 'vitest';

import { type CharacterFacetKind, type CharacterFacetMatchMode } from '../models/optc.models';
import {
  CHARACTER_CLASS_LIKE_CLAUSE,
  MAX_HELD_CHARACTER_FACET_VALUES,
  CHARACTER_TYPE_LIKE_CLAUSE,
  buildCharacterFacetSqlClause,
  characterFacetSelectionsEqual,
  cloneCharacterFacetSelection,
  countCharacterFacetMatches,
  createEmptyCharacterFacetSelection,
  escapeSqlLikePattern,
  evaluateSqlLikePattern,
  foldCharacterFacetValue,
  isCharacterFacetAllModeSatisfiable,
  isCharacterFacetSelectionEmpty,
  matchesCharacterFacet,
  matchesCharacterFacetSqlClause,
  matchesCharacterFacetValues,
  normalizeCharacterFacetSelection,
  readCharacterFacetValues,
  toDetailedQueryFacetFields,
  toggleCharacterFacetValue,
  type CharacterFacetRecordLike,
  type CharacterFacetSqlRow,
} from './character-facet-filter.utils';

const TYPE_CODES = ['STR', 'DEX', 'QCK', 'PSY', 'INT'] as const;
const CLASS_NAMES = [
  'Booster',
  'Cerebral',
  'Driven',
  'Evolver',
  'Fighter',
  'Free Spirit',
  'Powerhouse',
  'Shooter',
  'Slasher',
  'Striker',
] as const;
const MATCH_MODES: readonly CharacterFacetMatchMode[] = ['any', 'all'];

describe('character facet filter utils', () => {
  it('reads both codes from a comma-joined dual type in either stored order', () => {
    expect(readCharacterFacetValues('type', { type: 'INT,PSY' })).toEqual(['INT', 'PSY']);
    expect(readCharacterFacetValues('type', { type: 'PSY,INT' })).toEqual(['PSY', 'INT']);
    expect(new Set(readCharacterFacetValues('type', { type: ' PSY , INT ' }))).toEqual(
      new Set(['INT', 'PSY']),
    );
  });

  it('reads the full classes array before falling back to the primary and secondary pair', () => {
    expect(
      readCharacterFacetValues('class', {
        classes: ['Fighter', 'Slasher', 'Cerebral'],
        primaryClass: 'Fighter',
        secondaryClass: 'Slasher',
      }),
    ).toEqual(['Fighter', 'Slasher', 'Cerebral']);
  });

  it('matches a three-class local override that the primary and secondary pair would miss', () => {
    const record: CharacterFacetRecordLike = {
      type: 'QCK',
      classes: ['Fighter', 'Slasher', 'Cerebral'],
      primaryClass: 'Fighter',
      secondaryClass: 'Slasher',
    };

    expect(matchesCharacterFacet('class', record, { values: ['Cerebral'], matchMode: 'any' })).toBe(
      true,
    );
  });

  it('falls back to the primary and secondary pair when the classes array is empty', () => {
    expect(
      readCharacterFacetValues('class', {
        classes: [],
        primaryClass: 'Striker',
        secondaryClass: 'Powerhouse',
      }),
    ).toEqual(['Striker', 'Powerhouse']);
    expect(
      readCharacterFacetValues('class', { primaryClass: 'Striker', secondaryClass: null }),
    ).toEqual(['Striker']);
  });

  it('normalizes by trimming, collapsing whitespace, de-duplicating and upper-casing types', () => {
    expect(
      normalizeCharacterFacetSelection('type', {
        values: [' str ', 'STR', 'qck', ''],
        matchMode: 'any',
      }),
    ).toEqual({ values: ['STR', 'QCK'], matchMode: 'any' });
  });

  it('keeps class values in author case so chip and select states cannot desync', () => {
    expect(
      normalizeCharacterFacetSelection('class', {
        values: ['  Free   Spirit  ', 'free spirit'],
        matchMode: 'any',
      }),
    ).toEqual({ values: ['Free Spirit'], matchMode: 'any' });
  });

  it('demotes an unsatisfiable all-mode type selection to any', () => {
    expect(
      normalizeCharacterFacetSelection('type', {
        values: ['STR', 'QCK', 'INT'],
        matchMode: 'all',
      }).matchMode,
    ).toBe('any');
  });

  it('demotes an unsatisfiable all-mode class selection to any', () => {
    expect(
      normalizeCharacterFacetSelection('class', {
        values: ['Fighter', 'Slasher', 'Cerebral'],
        matchMode: 'all',
      }).matchMode,
    ).toBe('any');
  });

  it('keeps all mode for exactly two values', () => {
    expect(isCharacterFacetAllModeSatisfiable('type', 2)).toBe(true);
    expect(isCharacterFacetAllModeSatisfiable('class', 3)).toBe(false);
    expect(
      normalizeCharacterFacetSelection('type', { values: ['STR', 'QCK'], matchMode: 'all' })
        .matchMode,
    ).toBe('all');
  });

  it('treats an empty selection as no filter on the predicate, the clause builder and the emptiness test', () => {
    const empty = createEmptyCharacterFacetSelection();

    expect(isCharacterFacetSelectionEmpty(empty)).toBe(true);
    expect(buildCharacterFacetSqlClause('type', empty)).toBeNull();
    expect(buildCharacterFacetSqlClause('class', empty)).toBeNull();
    expect(matchesCharacterFacet('type', { type: 'STR' }, empty)).toBe(true);
    expect(matchesCharacterFacetValues([], empty)).toBe(true);
    expect(matchesCharacterFacetSqlClause('type', { type: 'STR', classesJson: '[]' }, empty)).toBe(
      true,
    );
  });

  it('treats a selection whose values all normalize away as no filter, never as an empty result', () => {
    const blank = { values: ['  ', ''], matchMode: 'all' as const };

    expect(isCharacterFacetSelectionEmpty(blank)).toBe(true);
    expect(buildCharacterFacetSqlClause('class', blank)).toBeNull();
    expect(matchesCharacterFacet('class', { classes: ['Fighter'] }, blank)).toBe(true);
  });

  it('defaults an empty selection to any mode', () => {
    expect(createEmptyCharacterFacetSelection()).toEqual({ values: [], matchMode: 'any' });
  });

  it('toggles values without duplicating or reordering the selection', () => {
    expect(toggleCharacterFacetValue(['STR'], 'QCK')).toEqual(['STR', 'QCK']);
    expect(toggleCharacterFacetValue(['STR', 'QCK'], 'STR')).toEqual(['QCK']);
    expect(toggleCharacterFacetValue(['Free Spirit'], 'free spirit')).toEqual([]);
    expect(toggleCharacterFacetValue(['STR'], '   ')).toEqual(['STR']);
  });

  it('clones and compares selections without sharing the values array', () => {
    const selection = { values: ['STR', 'QCK'], matchMode: 'all' as const };
    const clone = cloneCharacterFacetSelection(selection);

    expect(clone).toEqual(selection);
    expect(clone.values).not.toBe(selection.values);
    expect(characterFacetSelectionsEqual(selection, clone)).toBe(true);
    expect(
      characterFacetSelectionsEqual(selection, { values: ['QCK', 'STR'], matchMode: 'all' }),
    ).toBe(false);
    expect(
      characterFacetSelectionsEqual(selection, { values: ['STR', 'QCK'], matchMode: 'any' }),
    ).toBe(false);
  });

  it('folds values identically on both sides of a comparison', () => {
    expect(foldCharacterFacetValue('  Free   Spirit ')).toBe('free spirit');
    expect(foldCharacterFacetValue(undefined as unknown as string)).toBe('');
  });

  it('counts matching records and reports the full set for an empty selection', () => {
    const records: CharacterFacetRecordLike[] = [
      { type: 'STR,QCK' },
      { type: 'QCK' },
      { type: 'INT' },
    ];

    expect(countCharacterFacetMatches('type', records, { values: ['QCK'], matchMode: 'any' })).toBe(
      2,
    );
    expect(countCharacterFacetMatches('type', records, createEmptyCharacterFacetSelection())).toBe(
      3,
    );
  });

  it('maps two facets onto the detailed query fields with the demotion already applied', () => {
    expect(
      toDetailedQueryFacetFields(
        { values: ['str', 'qck', 'int'], matchMode: 'all' },
        { values: ['Fighter'], matchMode: 'all' },
      ),
    ).toEqual({
      selectedTypes: ['STR', 'QCK', 'INT'],
      selectedTypesMatchMode: 'any',
      selectedClasses: ['Fighter'],
      selectedClassesMatchMode: 'all',
    });
  });

  it('escapes SQL LIKE wildcards and backslashes in class literals', () => {
    expect(escapeSqlLikePattern('A%B_C\\D')).toBe('A\\%B\\_C\\\\D');
    expect(
      buildCharacterFacetSqlClause('class', { values: ['A%B'], matchMode: 'any' })?.params,
    ).toEqual(['%"A\\%B"%']);
    expect(evaluateSqlLikePattern('["A%B"]', '%"A\\%B"%')).toBe(true);
    expect(evaluateSqlLikePattern('["AZZB"]', '%"A\\%B"%')).toBe(false);
  });

  it('joins clauses with OR for any mode and AND for all mode', () => {
    expect(
      buildCharacterFacetSqlClause('type', { values: ['STR', 'QCK'], matchMode: 'any' })?.clause,
    ).toBe(`(${CHARACTER_TYPE_LIKE_CLAUSE} OR ${CHARACTER_TYPE_LIKE_CLAUSE})`);
    expect(
      buildCharacterFacetSqlClause('class', { values: ['Fighter', 'Slasher'], matchMode: 'all' })
        ?.clause,
    ).toBe(`(${CHARACTER_CLASS_LIKE_CLAUSE} AND ${CHARACTER_CLASS_LIKE_CLAUSE})`);
  });

  it('keeps the emitted type clause identical to the exported constant', () => {
    // The repository spec's fake SQL driver imports these constants to detect
    // AND mode. A hard-coded copy without ESCAPE silently turns AND into OR.
    expect(CHARACTER_TYPE_LIKE_CLAUSE).toBe("(',' || c.type || ',') LIKE ? ESCAPE '\\'");
    expect(CHARACTER_CLASS_LIKE_CLAUSE).toBe("c.classes_json LIKE ? ESCAPE '\\'");
    expect(
      buildCharacterFacetSqlClause('type', { values: ['STR'], matchMode: 'any' })?.clause,
    ).toBe(`(${CHARACTER_TYPE_LIKE_CLAUSE})`);
    expect(
      buildCharacterFacetSqlClause('class', { values: ['Fighter'], matchMode: 'any' })?.clause,
    ).toBe(`(${CHARACTER_CLASS_LIKE_CLAUSE})`);
  });

  it('evaluates SQL LIKE wildcards the way SQLite does', () => {
    expect(evaluateSqlLikePattern(',STR,QCK,', '%,QCK,%')).toBe(true);
    expect(evaluateSqlLikePattern(',INT,PSY,', '%,IN,%')).toBe(false);
    expect(evaluateSqlLikePattern('abc', 'a_c')).toBe(true);
    expect(evaluateSqlLikePattern('ac', 'a_c')).toBe(false);
    expect(evaluateSqlLikePattern('["Free Spirit"]', '%"free spirit"%')).toBe(true);
  });

  it('matches the same rows through the SQL clause and the in-memory predicate for every type selection', () => {
    const rows = buildTypeRows();

    for (const values of subsetsUpTo(TYPE_CODES, 3)) {
      for (const matchMode of MATCH_MODES) {
        const selection = { values: [...values], matchMode };
        const predicateIds = rows
          .filter((row) => matchesCharacterFacet('type', row.record, selection))
          .map((row) => row.id);
        const sqlIds = rows
          .filter((row) => matchesCharacterFacetSqlClause('type', row.sqlRow, selection))
          .map((row) => row.id);

        expect({ values, matchMode, ids: sqlIds }).toEqual({
          values,
          matchMode,
          ids: predicateIds,
        });
      }
    }
  });

  it('matches the same rows through the SQL clause and the in-memory predicate for every class selection', () => {
    const rows = buildClassRows();

    for (const values of subsetsUpTo(CLASS_NAMES, 2)) {
      for (const matchMode of MATCH_MODES) {
        const selection = { values: [...values], matchMode };
        const predicateIds = rows
          .filter((row) => matchesCharacterFacet('class', row.record, selection))
          .map((row) => row.id);
        const sqlIds = rows
          .filter((row) => matchesCharacterFacetSqlClause('class', row.sqlRow, selection))
          .map((row) => row.id);

        expect({ values, matchMode, ids: sqlIds }).toEqual({
          values,
          matchMode,
          ids: predicateIds,
        });
      }
    }

    // Size-3 selections exist only to prove the demotion keeps both sides equal.
    const threeClassSelection = {
      values: ['Fighter', 'Slasher', 'Cerebral'],
      matchMode: 'all' as const,
    };

    expect(
      rows
        .filter((row) => matchesCharacterFacet('class', row.record, threeClassSelection))
        .map((row) => row.id),
    ).toEqual(
      rows
        .filter((row) => matchesCharacterFacetSqlClause('class', row.sqlRow, threeClassSelection))
        .map((row) => row.id),
    );
  });

  it('folds case identically on both sides for a mixed-case class value', () => {
    const row: CharacterFacetSqlRow = {
      type: 'QCK',
      classesJson: JSON.stringify(['free spirit', 'Slasher']),
    };
    const record: CharacterFacetRecordLike = { type: 'QCK', classes: ['free spirit', 'Slasher'] };
    const selection = { values: ['Free Spirit'], matchMode: 'any' as const };

    expect(matchesCharacterFacet('class', record, selection)).toBe(true);
    expect(matchesCharacterFacetSqlClause('class', row, selection)).toBe(true);
  });

  it('ships an ASCII-only class catalog so SQL and JS case folding agree', () => {
    for (const name of [...CLASS_NAMES, ...TYPE_CODES]) {
      expect({ name, ascii: /^[\x00-\x7F]+$/.test(name) }).toEqual({ name, ascii: true });
      expect({ name, wildcards: /[\\%_]/.test(name) }).toEqual({ name, wildcards: false });
    }
  });
});

interface FacetTestRow {
  readonly id: number;
  readonly record: CharacterFacetRecordLike;
  readonly sqlRow: CharacterFacetSqlRow;
}

function buildTypeRows(): FacetTestRow[] {
  const typeValues: string[] = ['', ...TYPE_CODES];

  for (let left = 0; left < TYPE_CODES.length; left += 1) {
    for (let right = 0; right < TYPE_CODES.length; right += 1) {
      if (left !== right) {
        // Both stored orders, exactly as the seed dataset ships them.
        typeValues.push(`${TYPE_CODES[left]},${TYPE_CODES[right]}`);
      }
    }
  }

  return typeValues.map((type, index) => ({
    id: index + 1,
    record: { type },
    sqlRow: { type, classesJson: '[]' },
  }));
}

function buildClassRows(): FacetTestRow[] {
  const classSets: string[][] = [[]];

  for (const name of CLASS_NAMES) {
    classSets.push([name]);
  }

  for (let left = 0; left < CLASS_NAMES.length; left += 1) {
    for (let right = left + 1; right < CLASS_NAMES.length; right += 1) {
      classSets.push([CLASS_NAMES[left] as string, CLASS_NAMES[right] as string]);
    }
  }

  classSets.push(['free spirit', 'slasher']);
  classSets.push(['Fighter', 'Slasher', 'Cerebral']);

  return classSets.map((classes, index) => ({
    id: index + 1,
    record: { type: 'STR', classes, primaryClass: classes[0] ?? null, secondaryClass: null },
    sqlRow: { type: 'STR', classesJson: JSON.stringify(classes) },
  }));
}

function subsetsUpTo<T>(values: readonly T[], maxSize: number): T[][] {
  const result: T[][] = [[]];

  const walk = (start: number, current: T[]): void => {
    if (current.length >= maxSize) {
      return;
    }

    for (let index = start; index < values.length; index += 1) {
      const next = [...current, values[index] as T];

      result.push(next);
      walk(index + 1, next);
    }
  };

  walk(0, []);

  return result;
}

// Referenced so the exported kind union stays in the spec's type surface.
const FACET_KINDS: readonly CharacterFacetKind[] = ['type', 'class'];

describe('character facet kinds', () => {
  it('caps all-mode satisfiability at two values for both facets', () => {
    expect(MAX_HELD_CHARACTER_FACET_VALUES).toEqual({ type: 2, class: 2 });

    for (const kind of FACET_KINDS) {
      expect({ kind, satisfiable: isCharacterFacetAllModeSatisfiable(kind, 2) }).toEqual({
        kind,
        satisfiable: true,
      });
      expect({ kind, satisfiable: isCharacterFacetAllModeSatisfiable(kind, 3) }).toEqual({
        kind,
        satisfiable: false,
      });
    }
  });
});

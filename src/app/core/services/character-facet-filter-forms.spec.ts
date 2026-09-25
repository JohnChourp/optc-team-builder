import type { SqlJsStatic } from 'sql.js';
import { describe, expect, it } from 'vitest';

import {
  CHARACTER_CLASS_LIKE_CLAUSE,
  CHARACTER_FORM_CLASS_LIKE_CLAUSE,
  buildCharacterFacetSqlClause,
  countCharacterFacetMatches,
  type CharacterFacetRecordLike,
  type CharacterFacetSqlRow,
  matchesCharacterFacet,
  matchesCharacterFacetSqlClause,
  mergeFormOnlyClassMatches,
  readCharacterClassStates,
  resolveFormOnlyClassMatch,
} from './character-facet-filter.utils';

/*
 * 869f63gv6. A dual or VS unit's classes after a swap are its form's classes. The class filters
 * count them - a class matches in the unit's own state or in ONE form, never across two - and
 * every match that exists only through a form carries the "after swap" marker.
 */

/** #1983 as the dataset carries it: Striker/Slasher, INT Striker/Driven Smoker, PSY Slasher/Cerebral Tashigi. */
const SMOKER_AND_TASHIGI: CharacterFacetRecordLike = {
  type: 'INT,PSY',
  classes: ['Striker', 'Slasher'],
  forms: [
    { name: 'Smoker', classes: ['Striker', 'Driven'] },
    { name: 'Tashigi', classes: ['Slasher', 'Cerebral'] },
  ],
};

/** A VS unit: no classes of its own, so every class it has belongs to a form. */
const LUFFY_VS_KAIDO: CharacterFacetRecordLike = {
  type: 'QCK,DEX',
  classes: [],
  forms: [
    { name: 'Monkey D. Luffy', classes: ['Free Spirit', 'Fighter'] },
    { name: 'Kaido', classes: ['Driven', 'Powerhouse'] },
  ],
};

const PLAIN_DRIVEN: CharacterFacetRecordLike = { type: 'DEX', classes: ['Slasher', 'Driven'] };

const CLASS_NAMES = ['Striker', 'Slasher', 'Driven', 'Cerebral', 'Fighter', 'Free Spirit', 'Powerhouse'];

function sqlRow(record: CharacterFacetRecordLike): CharacterFacetSqlRow {
  return {
    type: String(record.type ?? ''),
    classesJson: JSON.stringify(record.classes ?? []),
    formClassesJson: (record.forms ?? []).map((form) => JSON.stringify(form.classes ?? [])),
  };
}

describe('the class states of a unit', () => {
  it('are its own classes, then each form, never a union of forms', () => {
    expect(readCharacterClassStates(SMOKER_AND_TASHIGI)).toEqual([
      ['Striker', 'Slasher'],
      ['Striker', 'Driven'],
      ['Slasher', 'Cerebral'],
    ]);
    expect(readCharacterClassStates(PLAIN_DRIVEN)).toEqual([['Slasher', 'Driven']]);
  });
});

describe('matchesCharacterFacet for classes', () => {
  it('puts #1983 under Driven, through its Smoker form', () => {
    expect(matchesCharacterFacet('class', SMOKER_AND_TASHIGI, { values: ['Driven'], matchMode: 'any' })).toBe(
      true,
    );
    expect(
      matchesCharacterFacet('class', { ...SMOKER_AND_TASHIGI, forms: [] }, { values: ['Driven'], matchMode: 'any' }),
    ).toBe(false);
  });

  it('matches "all" only inside one state, because no unit holds two forms at once', () => {
    const all = (values: string[]) =>
      matchesCharacterFacet('class', SMOKER_AND_TASHIGI, { values, matchMode: 'all' });

    expect(all(['Striker', 'Slasher'])).toBe(true);
    expect(all(['Striker', 'Driven'])).toBe(true);
    expect(all(['Slasher', 'Cerebral'])).toBe(true);
    expect(all(['Driven', 'Cerebral'])).toBe(false);
    expect(all(['Striker', 'Cerebral'])).toBe(false);
  });

  it('counts #1983 in the Driven match count', () => {
    expect(
      countCharacterFacetMatches('class', [SMOKER_AND_TASHIGI, PLAIN_DRIVEN, LUFFY_VS_KAIDO], {
        values: ['Driven'],
        matchMode: 'any',
      }),
    ).toBe(3);
  });

  it('leaves types exactly as they were', () => {
    expect(matchesCharacterFacet('type', SMOKER_AND_TASHIGI, { values: ['INT', 'PSY'], matchMode: 'all' })).toBe(
      true,
    );
    expect(matchesCharacterFacet('type', SMOKER_AND_TASHIGI, { values: ['DEX'], matchMode: 'any' })).toBe(
      false,
    );
  });
});

describe('resolveFormOnlyClassMatch', () => {
  it('names the class and the form when only a form holds it', () => {
    expect(resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: ['Driven'], matchMode: 'any' })).toEqual({
      classes: ['Driven'],
      forms: ['Smoker'],
    });
    expect(
      resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: ['Driven', 'Cerebral'], matchMode: 'any' }),
    ).toEqual({ classes: ['Driven', 'Cerebral'], forms: ['Smoker', 'Tashigi'] });
  });

  it('says nothing when the unit matches as it is', () => {
    expect(resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: ['Striker'], matchMode: 'any' })).toBeNull();
    expect(
      resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: ['Striker', 'Driven'], matchMode: 'any' }),
    ).toBeNull();
    expect(resolveFormOnlyClassMatch(PLAIN_DRIVEN, { values: ['Driven'], matchMode: 'any' })).toBeNull();
  });

  it('says nothing when nothing matches, or no class is selected', () => {
    expect(resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: ['Fighter'], matchMode: 'any' })).toBeNull();
    expect(resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: [], matchMode: 'any' })).toBeNull();
    expect(resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, null)).toBeNull();
    expect(
      resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: ['Driven', 'Cerebral'], matchMode: 'all' }),
    ).toBeNull();
  });

  it('names every selected class and the one form that holds them all, for "all"', () => {
    expect(
      resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: ['Striker', 'Driven'], matchMode: 'all' }),
    ).toEqual({ classes: ['Striker', 'Driven'], forms: ['Smoker'] });
  });

  it('marks every class match of a VS unit, which has no classes of its own', () => {
    expect(resolveFormOnlyClassMatch(LUFFY_VS_KAIDO, { values: ['Fighter'], matchMode: 'any' })).toEqual({
      classes: ['Fighter'],
      forms: ['Monkey D. Luffy'],
    });
  });

  it('folds case the way the filter does', () => {
    expect(resolveFormOnlyClassMatch(SMOKER_AND_TASHIGI, { values: ['driven'], matchMode: 'any' })).toEqual({
      classes: ['driven'],
      forms: ['Smoker'],
    });
  });
});

describe('mergeFormOnlyClassMatches', () => {
  it('joins a filter marker and a Captain marker, each class and form once', () => {
    expect(
      mergeFormOnlyClassMatches(
        { classes: ['Driven'], forms: ['Smoker'] },
        null,
        { classes: ['driven', 'Cerebral'], forms: ['Smoker', 'Tashigi'] },
      ),
    ).toEqual({ classes: ['Driven', 'Cerebral'], forms: ['Smoker', 'Tashigi'] });
    expect(mergeFormOnlyClassMatches(null, undefined)).toBeNull();
  });
});

describe('the SQL class clause', () => {
  it('binds every value twice: the unit, then its forms', () => {
    const built = buildCharacterFacetSqlClause('class', { values: ['Driven', 'Cerebral'], matchMode: 'all' });

    expect(built?.params).toEqual(['%"Driven"%', '%"Cerebral"%', '%"Driven"%', '%"Cerebral"%']);
    expect(built?.clause).toBe(
      `((${CHARACTER_CLASS_LIKE_CLAUSE} AND ${CHARACTER_CLASS_LIKE_CLAUSE}) OR EXISTS (SELECT 1 FROM character_forms f WHERE f.character_id = c.id AND (${CHARACTER_FORM_CLASS_LIKE_CLAUSE} AND ${CHARACTER_FORM_CLASS_LIKE_CLAUSE})))`,
    );
  });

  it('agrees with the in-memory predicate for every selection of up to two classes', () => {
    const records = [SMOKER_AND_TASHIGI, LUFFY_VS_KAIDO, PLAIN_DRIVEN, { type: 'STR', classes: ['Fighter'] }];

    for (const first of CLASS_NAMES) {
      for (const second of [null, ...CLASS_NAMES]) {
        for (const matchMode of ['any', 'all'] as const) {
          const selection = { values: second ? [first, second] : [first], matchMode };

          for (const record of records) {
            expect({ selection, record, sql: matchesCharacterFacetSqlClause('class', sqlRow(record), selection) }).toEqual({
              selection,
              record,
              sql: matchesCharacterFacet('class', record, selection),
            });
          }
        }
      }
    }
  });

  it('runs in SQLite and answers per state', async () => {
    const initSqlJs = (await import('sql.js')).default;
    const SQL: SqlJsStatic = await initSqlJs();
    const database = new SQL.Database();

    try {
      database.run(`
        CREATE TABLE characters (id INTEGER PRIMARY KEY, type TEXT NOT NULL, classes_json TEXT NOT NULL);
        CREATE TABLE character_forms (character_id INTEGER NOT NULL, form_key TEXT NOT NULL, classes_json TEXT NOT NULL, PRIMARY KEY (character_id, form_key));
        INSERT INTO characters VALUES (1983, 'INT,PSY', '["Striker","Slasher"]');
        INSERT INTO characters VALUES (8, 'DEX', '["Slasher","Driven"]');
        INSERT INTO characters VALUES (4211, 'QCK,DEX', '[]');
        INSERT INTO character_forms VALUES (1983, '1', '["Striker","Driven"]');
        INSERT INTO character_forms VALUES (1983, '2', '["Slasher","Cerebral"]');
        INSERT INTO character_forms VALUES (4211, '1', '["Free Spirit","Fighter"]');
        INSERT INTO character_forms VALUES (4211, '2', '["Driven","Powerhouse"]');
      `);

      const ids = (values: string[], matchMode: 'any' | 'all') => {
        const built = buildCharacterFacetSqlClause('class', { values, matchMode })!;
        const [result] = database.exec(
          `SELECT c.id FROM characters c WHERE ${built.clause} ORDER BY c.id`,
          [...built.params],
        );

        return (result?.values ?? []).map(([id]) => Number(id));
      };

      expect(ids(['Driven'], 'any')).toEqual([8, 1983, 4211]);
      expect(ids(['Driven', 'Cerebral'], 'all')).toEqual([]);
      expect(ids(['Striker', 'Driven'], 'all')).toEqual([1983]);
      expect(ids(['Striker', 'Slasher'], 'all')).toEqual([1983]);
      expect(ids(['Fighter'], 'any')).toEqual([4211]);
    } finally {
      database.close();
    }
  });
});

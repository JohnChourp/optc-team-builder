import { describe, expect, it } from 'vitest';

import {
  buildCharacterRegionSqlClause,
  CHARACTER_REGION_PREFERENCES,
  DEFAULT_CHARACTER_REGION_PREFERENCE,
  hasArtworkForRegion,
  isCharacterAvailableInRegion,
  normalizeCharacterRegionPreference,
  resolveCharacterRegionStatus,
} from './character-region.utils';

describe('character region preference', () => {
  it('defaults to all, so an existing reader sees no change', () => {
    expect(DEFAULT_CHARACTER_REGION_PREFERENCE).toBe('all');
  });

  it.each([
    ['global', 'global'],
    ['japan', 'japan'],
    ['all', 'all'],
    ['GLOBAL', 'all'],
    ['', 'all'],
    [null, 'all'],
    [undefined, 'all'],
    [{ region: 'global' }, 'all'],
  ])('normalizes %o to %s', (input, expected) => {
    expect(normalizeCharacterRegionPreference(input)).toBe(expected);
  });

  it('offers exactly the three documented values', () => {
    expect([...CHARACTER_REGION_PREFERENCES]).toEqual(['all', 'global', 'japan']);
  });
});

describe('resolveCharacterRegionStatus', () => {
  it('marks nothing at all while the preference is all', () => {
    for (const availableOnGlobal of [true, false, null]) {
      expect(resolveCharacterRegionStatus({ availableOnGlobal }, 'all')).toBe('in-region');
    }
  });

  it('marks a Japan-only unit as out of region for a Global reader', () => {
    expect(resolveCharacterRegionStatus({ availableOnGlobal: false }, 'global')).toBe(
      'out-of-region',
    );
  });

  it('leaves a Global unit alone for a Global reader', () => {
    expect(resolveCharacterRegionStatus({ availableOnGlobal: true }, 'global')).toBe('in-region');
  });

  /**
   * The load-bearing case. `null` is "upstream has no flag row", which is not the same fact as
   * "not available", and 221 units in the shipped dataset are in exactly that position.
   */
  it.each([
    [{ availableOnGlobal: null }],
    [null],
    [undefined],
  ])('reports unknown rather than out-of-region for %o', (release) => {
    expect(resolveCharacterRegionStatus(release, 'global')).toBe('unknown');
  });

  it('never reports out-of-region for a Japan reader, because the dataset is the Japanese roster', () => {
    for (const availableOnGlobal of [true, false, null]) {
      expect(resolveCharacterRegionStatus({ availableOnGlobal }, 'japan')).toBe('in-region');
    }
  });
});

describe('isCharacterAvailableInRegion', () => {
  it('excludes only the units proven out of region', () => {
    expect(isCharacterAvailableInRegion({ availableOnGlobal: false }, 'global')).toBe(false);
  });

  it('keeps a unit we hold no release data for, rather than dropping it invisibly', () => {
    expect(isCharacterAvailableInRegion({ availableOnGlobal: null }, 'global')).toBe(true);
  });

  it('is a no-op while the preference is all', () => {
    expect(isCharacterAvailableInRegion({ availableOnGlobal: false }, 'all')).toBe(true);
  });
});

describe('hasArtworkForRegion', () => {
  it('reads the artwork flags and answers only the artwork question', () => {
    const artwork = { exactLocal: false, thumbnailGlobal: true, thumbnailJapan: false };

    expect(hasArtworkForRegion(artwork, 'global')).toBe(true);
    expect(hasArtworkForRegion(artwork, 'japan')).toBe(false);
  });

  it('is false rather than throwing when there is no artwork record', () => {
    expect(hasArtworkForRegion(null, 'global')).toBe(false);
    expect(hasArtworkForRegion(undefined, 'japan')).toBe(false);
  });
});

/**
 * 869f13282. The SQL clause and the in-memory predicate are two implementations of one rule, and
 * this repository has already paid for a pair like that drifting. So they are compared directly,
 * over every value the column can hold, against a real SQLite engine rather than a mock.
 */
describe('buildCharacterRegionSqlClause', () => {
  it('adds no clause at all when the preference filters nothing', () => {
    expect(buildCharacterRegionSqlClause('all')).toBeNull();
    expect(buildCharacterRegionSqlClause('japan')).toBeNull();
  });

  it('agrees with the in-memory predicate for every stored value', async () => {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const database = new SQL.Database();

    database.run('CREATE TABLE characters (id INTEGER PRIMARY KEY, region_release_json TEXT);');

    const rows = [
      { id: 1, availableOnGlobal: true },
      { id: 2, availableOnGlobal: false },
      { id: 3, availableOnGlobal: null },
    ] as const;

    for (const row of rows) {
      // Inlined rather than bound: the `Database` type this project ships declares `run(sql)` with
      // no parameter list, and every value here is a literal written two lines above.
      database.run(
        `INSERT INTO characters VALUES (${row.id}, '${JSON.stringify({ availableOnGlobal: row.availableOnGlobal })}');`,
      );
    }

    // A column that was never written at all - a seed from before this work shipped.
    database.run("INSERT INTO characters VALUES (4, '{}');");

    const clause = buildCharacterRegionSqlClause('global');
    expect(clause).not.toBeNull();

    const result = database.exec(
      `SELECT id FROM characters WHERE ${clause} ORDER BY id ASC`,
    );
    const sqlIds = (result[0]?.values ?? []).map(([id]) => Number(id));

    const memoryIds = [
      ...rows.filter((row) => isCharacterAvailableInRegion(row, 'global')).map((row) => row.id),
      ...(isCharacterAvailableInRegion({ availableOnGlobal: null }, 'global') ? [4] : []),
    ];

    expect(sqlIds).toEqual(memoryIds);
    // The whole point, stated as its own assertion so a reader sees it without reconstructing it:
    expect(sqlIds).not.toContain(2);
    expect(sqlIds).toContain(3);
    expect(sqlIds).toContain(4);

  });
});

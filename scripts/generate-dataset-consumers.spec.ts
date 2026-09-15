import { describe, expect, it } from 'vitest';

import {
  buildConsumerCensus,
  countConsumers,
  findCensusFailures,
  parseCharacterColumns,
  parseColumnParseRules,
  parseColumnToFieldMap,
} from './lib/dataset-consumers.mjs';
import { readCensus } from './generate-dataset-consumers.mjs';

const DATASET_SOURCE = `
  CREATE TABLE characters (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    region_json TEXT NOT NULL
  );
`;

describe('parseCharacterColumns', () => {
  it('reads the column names out of the schema', () => {
    expect(parseCharacterColumns(DATASET_SOURCE)).toEqual(['id', 'name', 'region_json']);
  });

  it('throws rather than returning nothing when the table cannot be found', () => {
    expect(() => parseCharacterColumns('-- no schema here')).toThrow(/characters table/u);
  });
});

describe('parseColumnToFieldMap', () => {
  it('maps a plain assignment', () => {
    const map = parseColumnToFieldMap("        name: String(row['name']),");

    expect(map.get('name')).toBe('name');
  });

  /**
   * 869f13288. Five of the twenty-eight shipped columns are read through a generic call, and a
   * forward-matching regex that does not allow for the `<string[]>` reports every one of them as
   * an unmapped column rather than as its own blind spot.
   */
  it('maps an assignment whose call carries a generic parameter', () => {
    const map = parseColumnToFieldMap(
      "        classes: this.parseJson<string[]>(row['classes_json'], []),",
    );

    expect(map.get('classes_json')).toBe('classes');
  });

  it('maps a column that is only read inside a helper, through the helper call site', () => {
    const source = [
      "        searchText: this.resolveSearchText(row),",
      '  private resolveSearchText(row: SqlRow): string {',
      "    return String(row['search_text']);",
      '  }',
    ].join('\n');

    expect(parseColumnToFieldMap(source).get('search_text')).toBe('searchText');
  });
});

describe('countConsumers', () => {
  const files: Array<[string, string]> = [
    ['src/app/core/services/optc-repository.service.ts', 'regionArtwork'],
    ['src/app/core/models/optc.models.ts', 'regionArtwork'],
    ['src/app/core/services/thing.spec.ts', 'regionArtwork'],
    ['src/app/pages/characters/characters.page.ts', 'stars'],
  ];

  it('does not count the files that produce a field as consumers of it', () => {
    expect(countConsumers(files, 'regionArtwork').product).toEqual([]);
  });

  it('counts specs separately rather than folding them into product code', () => {
    expect(countConsumers(files, 'regionArtwork').specs).toEqual([
      'src/app/core/services/thing.spec.ts',
    ]);
  });

  it('counts a real consumer', () => {
    expect(countConsumers(files, 'stars').product).toEqual([
      'src/app/pages/characters/characters.page.ts',
    ]);
  });
});

describe('findCensusFailures', () => {
  const census = (fields: unknown[]) => ({ fields }) as never;

  it('fails a column with no recorded parse rule', () => {
    const failures = findCensusFailures(
      census([{ column: 'a_json', modelField: 'a', parseRule: null, verdict: 'read-by-product-code' }]),
    );

    expect(failures.join(' ')).toContain('no parse rule resolves');
  });

  it('fails a column that resolves to no model field', () => {
    const failures = findCensusFailures(census([{ column: 'mystery_json', modelField: null }]));

    expect(failures.join(' ')).toContain('no model field resolves');
  });

  it('fails a column nothing reads at all', () => {
    const failures = findCensusFailures(
      census([{ column: 'a_json', modelField: 'a', parseRule: 'parseJson', verdict: 'read-by-nothing' }]),
    );

    expect(failures.join(' ')).toContain('Use it or stop importing it');
  });

  it('fails a spec-only column with no declared reason', () => {
    const failures = findCensusFailures(
      census([{ column: 'b_json', modelField: 'b', parseRule: 'parseJson', verdict: 'read-only-by-specs' }]),
    );

    expect(failures.join(' ')).toContain('record why');
  });

  it('accepts a spec-only column whose reason is declared', () => {
    expect(
      findCensusFailures(
        census([
          {
            column: 'b_json',
            modelField: 'b',
            parseRule: 'parseJson',
            verdict: 'read-only-by-specs',
            declaredReason: 'a deliberate probe',
          },
        ]),
      ),
    ).toEqual([]);
  });

  it('accepts a column held open as a recorded question for the owner', () => {
    expect(
      findCensusFailures(
        census([
          {
            column: 'c_json',
            modelField: 'c',
            parseRule: 'parseJson',
            verdict: 'read-by-nothing',
            openQuestion: { task: '869f13288', question: 'keep or drop?' },
          },
        ]),
      ),
    ).toEqual([]);
  });
});

describe('parseColumnParseRules', () => {
  it('records the parse call and the default for a JSON column', () => {
    const rules = parseColumnParseRules(
      "      const classes = this.parseJson<string[]>(row['classes_json'], []);",
    );

    expect(rules.get('classes_json')).toEqual({ rule: 'parseJson', fallback: '[]' });
  });

  /**
   * 869f1328m. A two-line lookahead silently truncated the three-field `region_json` default to
   * two fields - a quietly-wrong record of exactly the kind this artifact exists to prevent. The
   * reader balances braces instead.
   */
  it('reads a multi-line object default to balanced braces rather than a line count', () => {
    const rules = parseColumnParseRules(
      [
        "      const artwork = this.parseJson<Artwork>(row['region_json'], {",
        '        exactLocal: false,',
        '        thumbnailGlobal: false,',
        '        thumbnailJapan: false,',
        '      });',
      ].join('\n'),
    );

    expect(rules.get('region_json')?.fallback).toContain('thumbnailJapan: false');
  });

  it('records no default for a call that takes none, because that says the column is load-bearing', () => {
    const rules = parseColumnParseRules("        id: Number(row['id']),");

    expect(rules.get('id')).toEqual({ rule: 'Number', fallback: null });
  });

  it('calls a bare row read direct rather than inventing a parse call', () => {
    const rules = parseColumnParseRules(
      "        secondaryClass: row['secondary_class'] ? String(row['secondary_class']) : null,",
    );

    expect(rules.get('secondary_class')?.rule).toBe('direct');
  });
});

describe('the shipped census', () => {
  it('resolves every column and reports no failure', () => {
    const census = readCensus({ generatedAt: 'fixed' });

    expect(census.unresolvedColumns).toEqual([]);
    expect(findCensusFailures(census)).toEqual([]);
  });

  it('carries the region columns the 869f13284 split produced', () => {
    const census = readCensus({ generatedAt: 'fixed' });
    const byColumn = new Map(census.fields.map((field) => [field.column, field]));

    expect(byColumn.get('region_release_json')?.modelField).toBe('regionRelease');
    expect(byColumn.get('region_release_json')?.verdict).toBe('read-by-product-code');
    expect(byColumn.get('region_json')?.modelField).toBe('regionArtwork');
  });

  /**
   * 869f1328m. The default that matters most in the whole dataset: a seed written before
   * `region_release_json` existed has no release data, and `false` there would state an absence as
   * a fact for every one of its rows.
   */
  it('records the release default as null rather than false', () => {
    const census = readCensus({ generatedAt: 'fixed' });
    const release = census.fields.find((field) => field.column === 'region_release_json');

    expect(release?.parseRule).toBe('parseJson');
    expect(release?.parseFallback).toContain('availableOnGlobal: null');
    expect(release?.parseFallback).not.toContain('false');
  });

  it('records a parse rule for every shipped column', () => {
    const census = readCensus({ generatedAt: 'fixed' });

    expect(census.fields.filter((field) => !field.parseRule)).toEqual([]);
  });
});

describe('buildConsumerCensus', () => {
  it('records the three verdicts distinctly', () => {
    const result = buildConsumerCensus({
      datasetSource: DATASET_SOURCE,
      repositorySource: [
        "        name: String(row['name']),",
        "        id: Number(row['id']),",
        "        regionArtwork: this.parseJson(row['region_json'], {}),",
      ].join('\n'),
      files: [
        ['src/app/pages/a.page.ts', 'name'],
        ['src/app/pages/a.page.spec.ts', 'regionArtwork'],
      ],
      generatedAt: 'fixed',
    });
    const verdicts = new Map(result.fields.map((field) => [field.column, field.verdict]));

    expect(verdicts.get('name')).toBe('read-by-product-code');
    expect(verdicts.get('region_json')).toBe('read-only-by-specs');
    expect(verdicts.get('id')).toBe('read-by-nothing');
  });
});

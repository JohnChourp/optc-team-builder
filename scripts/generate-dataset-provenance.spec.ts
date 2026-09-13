import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  comparable,
  readProvenance,
  replaceGeneratedSection,
} from './generate-dataset-provenance.mjs';
import {
  buildProvenance,
  DERIVED_COLUMNS,
  extractShippedColumns,
  extractUpstreamReads,
  formatProvenanceMarkdown,
  toColumnName,
} from './lib/dataset-provenance.mjs';

/*
 * 869f127eg. The map is generated FROM the importer, because a hand-written one is the same failure
 * as a hand-written count - right on the day and silently wrong afterwards. So what is worth testing
 * is the extraction and the refusal, not the contents.
 */

const IMPORTER = `
  const normalizedStars = normalizeStars(entry[3]);
  return {
    name: normalizeCharacterName(unitEntry.name),
    type: entry[1],
    stars: normalizedStars.stars,
    starsLabel: normalizedStars.starsLabel,
    cost: toFiniteNumber(unitEntry.cost),
    maxSockets: toFiniteNumber(unitEntry.sockets),
  };
`;

const DATASET = `
  INSERT INTO characters (
    id, name, type, stars, stars_label, cost
  ) VALUES (
`;

describe('extractUpstreamReads', () => {
  it('reads a named upstream field', () => {
    expect(extractUpstreamReads(IMPORTER).get('cost')).toMatchObject({
      upstream: 'units.js .cost',
    });
  });

  it('reads a positional upstream field', () => {
    expect(extractUpstreamReads(IMPORTER).get('type')).toMatchObject({
      upstream: 'units.js [1]',
    });
  });

  it('follows a value that reaches the column through an intermediate', () => {
    /*
     * `stars` resolved to nothing before this pass, and the check refused the whole map - correctly,
     * because a column whose origin cannot be traced is what it exists to catch. The answer was to
     * trace it rather than declare it derived: it does have an upstream field.
     */
    expect(extractUpstreamReads(IMPORTER).get('stars')).toMatchObject({
      upstream: 'units.js [3] via normalizedStars.stars',
    });
    expect(extractUpstreamReads(IMPORTER).get('starsLabel')).toMatchObject({
      upstream: 'units.js [3] via normalizedStars.starsLabel',
    });
  });
});

describe('extractShippedColumns', () => {
  it('reads the INSERT column list, which is what actually reaches the app', () => {
    expect(extractShippedColumns(DATASET)).toEqual(['id', 'name', 'type', 'stars', 'stars_label', 'cost']);
  });

  it('returns nothing when there is no INSERT to read', () => {
    expect(extractShippedColumns('no sql here')).toEqual([]);
  });
});

describe('toColumnName', () => {
  it('maps the importer camelCase to the seed snake_case', () => {
    expect(toColumnName('minHp')).toBe('min_hp');
    expect(toColumnName('starsLabel')).toBe('stars_label');
    expect(toColumnName('id')).toBe('id');
  });
});

describe('buildProvenance', () => {
  it('resolves every column, by upstream field or declared transform', () => {
    const provenance = buildProvenance({
      importerSource: IMPORTER,
      datasetSource: DATASET,
      generatedAt: 'now',
    });

    expect(provenance.unknownColumns).toEqual([]);
    expect(provenance.fields.find((field) => field.column === 'id')).toMatchObject({
      origin: 'derived',
      transform: DERIVED_COLUMNS['id'],
    });
  });

  it('REFUSES a column that resolves to neither, which is the rule the task asked for', () => {
    const provenance = buildProvenance({
      importerSource: IMPORTER,
      datasetSource: DATASET.replace('cost', 'cost, mystery_column'),
      generatedAt: 'now',
    });

    expect(provenance.unknownColumns).toEqual(['mystery_column']);
  });

  it('surfaces an upstream field the importer reads and the seed then drops', () => {
    // The half a shape document can never show, and the reason to generate rather than describe.
    const provenance = buildProvenance({
      importerSource: IMPORTER,
      datasetSource: DATASET,
      generatedAt: 'now',
    });

    /*
     * This fixture's own loss. The list also carries the declared progression fields, because this
     * fixture dataset ships none of the tables they land in - which is correct for a fixture and
     * says nothing about the real seed, asserted separately below.
     */
    expect(provenance.droppedBeforeShipping).toContainEqual({
      importerField: 'maxSockets',
      source: 'units.js .sockets',
    });
  });
});

describe('replaceGeneratedSection', () => {
  it('replaces an existing generated block in place', () => {
    const markdown = `top\n<!-- generated:dataset-provenance start -->\nold\n<!-- generated:dataset-provenance end -->\nbottom`;
    const next = replaceGeneratedSection(markdown, 'NEW');

    expect(next).toContain('top');
    expect(next).toContain('NEW');
    expect(next).toContain('bottom');
    expect(next).not.toContain('old');
  });

  it('appends under its own heading the first time, keeping the hand-written document above', () => {
    expect(replaceGeneratedSection('# Doc\n\nprose', 'SECTION')).toContain('## Dataset Provenance');
  });
});

describe('the committed map', () => {
  it('matches the importer', () => {
    const committed = JSON.parse(
      readFileSync(path.join(process.cwd(), 'docs/dataset-provenance.json'), 'utf8'),
    );

    expect(comparable(committed)).toEqual(comparable(readProvenance({})));
  });

  it('resolves every shipped column of the real importer', () => {
    const provenance = readProvenance({});

    expect(provenance.unknownColumns).toEqual([]);
    expect(provenance.shippedColumns).toBeGreaterThan(10);
  });

  it('records that maxSockets now SHIPS, after 869f127eg found it being thrown away', () => {
    /*
     * The inversion of the test this replaces, kept deliberately rather than deleted.
     *
     * Generating this map is what found that `units.js` index 6 is `Sockets`, that the importer
     * normalized it on every run, and that the seed had no column for it - a loss nobody had
     * written down. 869f1935z added the column. The assertion flips with it, so the map keeps
     * proving the thing it was built to prove rather than quietly losing the story.
     */
    const provenance = readProvenance({});

    expect(provenance.droppedBeforeShipping).toEqual([]);
    expect(provenance.fields).toContainEqual(
      expect.objectContaining({
        column: 'max_sockets',
        origin: 'upstream',
        source: 'units.js .sockets',
      }),
    );
  });

  it('resolves the three upstream files the importer started reading in 869f1935z', () => {
    // A column reached through a table other than `characters` is shipped, not lost.
    const provenance = readProvenance({});

    for (const column of ['special_cooldown_max', 'special_cooldown_min']) {
      expect(provenance.fields).toContainEqual(
        expect.objectContaining({ column, origin: 'upstream' }),
      );
    }

    expect(provenance.unknownColumns).toEqual([]);
  });

  it('keeps the generated section of the schema doc in step', () => {
    const doc = readFileSync(path.join(process.cwd(), 'docs/data-schemas.md'), 'utf8');

    expect(doc).toContain(formatProvenanceMarkdown(readProvenance({})));
  });
});

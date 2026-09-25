/**
 * 869f127eg. Which upstream field produced which shipped field, read OUT OF THE IMPORTER rather
 * than written down beside it.
 *
 * `docs/data-schemas.md` describes the shapes. Nothing described the provenance, so every time
 * upstream changed the blast radius had to be re-derived by reading the importer - and a
 * hand-written map would be the same failure as a hand-written count: correct on the day, silently
 * wrong afterwards.
 *
 * Two halves, and the difference matters:
 *
 *  - the UPSTREAM half is extracted from `import-optc-data.mjs`, from the two places it actually
 *    reads upstream values: positional `entry[N]` reads of `window.units` and named
 *    `unitEntry.<field>` reads. Change the importer and this map changes with it;
 *  - the DERIVED half is declared here, because it has no upstream field to point at - an id is a
 *    key, `search_text` is built from three other columns, the captain boosts are parsed out of
 *    prose. Each carries the reason it is derived.
 *
 * The check's rule is the one the task asked for: every shipped column resolves to an upstream
 * field or an explicit derived transform, and a column in neither FAILS. That is what stops a new
 * column arriving with no recorded origin.
 */

import { PROGRESSION_UPSTREAM_SOURCES } from './optc-upstream-progression.mjs';

/**
 * The positional reads of `window.units`. Upstream documents the order in its own header:
 * `[ "Name", "Type", [Classes], Stars, Cost, Combo, Sockets, maxLVL, EXPToMax, lvl1HP, lvl1ATK,
 * lvl1RCV, MAXHP, MAXATK, MAXRCV, Growth Rate ]`.
 */
const UNIT_POSITION_PATTERN = /(\w+):\s*[^,\n]*\bentry\[(\d+)\]/gu;

/** The named reads of the same row after the importer has given it field names. */
const UNIT_FIELD_PATTERN = /(\w+):\s*[^,\n]*\bunitEntry\.(\w+)/gu;

/*
 * Values that reach a column through an intermediate: `const normalizedStars = normalizeStars(entry[3])`
 * and then `stars: normalizedStars.stars`. Without this pass `stars` resolved to nothing and the
 * check refused the whole map - correctly, because a column whose origin cannot be traced is
 * exactly what it exists to catch. The answer was to trace it, not to declare it derived: it does
 * have an upstream field.
 */
const INTERMEDIATE_ASSIGN_PATTERN = /const (\w+)\s*=\s*\w+\(\s*entry\[(\d+)\]/gu;
const INTERMEDIATE_READ_PATTERN = /(\w+):\s*(\w+)\.(\w+)/gu;

/** The column list the seed actually ships, which is the authoritative "what reaches the app". */
const INSERT_COLUMNS_PATTERN = /INSERT INTO characters \(\s*([\s\S]*?)\s*\) VALUES/u;

/*
 * 869f1935z. Every table's column list, because a value can now reach the app through a table other
 * than `characters`. Without this, the evolution and drop payloads looked like upstream fields that
 * reach nothing - the exact opposite of the truth - and `droppedBeforeShipping` would have named
 * them as losses.
 */
const ANY_INSERT_COLUMNS_PATTERN = /INSERT INTO (\w+) \(\s*([\s\S]*?)\s*\)\s*VALUES/gu;

/**
 * Columns with no upstream field, each with the transform that produces it.
 *
 * Declared, not guessed: a column that is genuinely computed has nowhere to point, and calling that
 * "unknown" would make the check noise. A column missing from BOTH this list and the importer's
 * reads is what the check exists to catch.
 */
export const DERIVED_COLUMNS = Object.freeze({
  id: 'The upstream row index plus one, used as the stable character id.',
  is_incomplete:
    'True when a MANUAL overlay character was added without full stats. Derived, never carried upstream, '
    + 'and set on no other path: the upstream importer always writes 0, so 0 of 4,622 shipped rows carry it '
    + '(measured 2026-09-20, v0.5.3). An always-false column, kept because the overlay can still set it.',
  primary_class: 'classes[0] of the normalized class list.',
  secondary_class: 'classes[1] of the normalized class list, or null.',
  classes_json: 'The normalized class list, serialized.',
  captain_hp_boost: 'Parsed out of the captain ability PROSE by resolveCharacterCaptainBoosts.',
  captain_atk_boost: 'Parsed out of the captain ability PROSE by resolveCharacterCaptainBoosts.',
  captain_average_boost: 'Derived from the two boosts above.',
  region_json: 'Which regions the app found artwork for; an app-side fact, not an upstream one.',
  assets_json: 'Resolved image paths per region; an app-side fact, not an upstream one.',
  search_text:
    "Built from name, type, classes and the character tags by createCharacterSearchText (a manual character adds its id and its own search aliases). Upstream's community names are the separate search_aliases column.",
});

/**
 * 869f13284. Columns that DO have an upstream field, read from a file other than `units.js` and
 * written outside `attachProgressionData` - so neither the positional/named `units.js` extraction
 * nor `PROGRESSION_UPSTREAM_SOURCES` can see them.
 *
 * Kept separate from `DERIVED_COLUMNS` on purpose. Declaring upstream data as "derived" would be a
 * lie of exactly the kind this map exists to prevent, and it is the lie `region_json` told for
 * months under the name `regionAvailability`.
 */
export const UPSTREAM_DECLARED_COLUMNS = Object.freeze({
  region_release_json: {
    source: 'flags.js .global',
    note: 'Whether the unit has released on Global. The authoritative release flag, replacing the thumbnail-presence proxy that disagreed with it for 927 of 4,397 units.',
  },
  families_json: {
    source: 'families.js',
    note: 'The character(s) on the card, as upstream names them (869f63grj). They decide which cards are the same character, replacing a guess from the card name that disagreed with this file on 18,449 unit pairs; a unit upstream names no family for stores [] and is decided by its name.',
  },
  search_aliases: {
    source: 'aliases.js, Latin script only',
    note: "The names players use for a unit (869f63gkm) - community nicknames and upstream's French names - lower-cased, each once, leaving out one the unit's search text or another kept alias already contains. Searched with the name by every character search and never displayed; kept out of search_text so nothing that reads that column changes. Japanese names are left out: about three times the bytes, for names this app's players rarely type.",
  },
});

/** normalizedField -> seed column. The importer names fields in camelCase and the seed in snake. */
export function toColumnName(field) {
  return field.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').toLowerCase();
}

export function extractUpstreamReads(importerSource) {
  const byField = new Map();

  const add = (field, upstream, kind) => {
    if (!byField.has(field)) {
      byField.set(field, { field, upstream, kind });
    }
  };

  UNIT_FIELD_PATTERN.lastIndex = 0;

  let match;

  // Named reads first: they say what upstream CALLS the value, which is more useful to a reader
  // than an index, and the positional block is the same values read a second way.
  while ((match = UNIT_FIELD_PATTERN.exec(importerSource)) !== null) {
    add(match[1], `units.js .${match[2]}`, 'upstream');
  }

  UNIT_POSITION_PATTERN.lastIndex = 0;

  while ((match = UNIT_POSITION_PATTERN.exec(importerSource)) !== null) {
    add(match[1], `units.js [${match[2]}]`, 'upstream');
  }

  const intermediates = new Map();

  INTERMEDIATE_ASSIGN_PATTERN.lastIndex = 0;

  while ((match = INTERMEDIATE_ASSIGN_PATTERN.exec(importerSource)) !== null) {
    intermediates.set(match[1], match[2]);
  }

  INTERMEDIATE_READ_PATTERN.lastIndex = 0;

  while ((match = INTERMEDIATE_READ_PATTERN.exec(importerSource)) !== null) {
    const position = intermediates.get(match[2]);

    if (position !== undefined) {
      add(match[1], `units.js [${position}] via ${match[2]}.${match[3]}`, 'upstream');
    }
  }

  /*
   * The three files the importer started reading in 869f1935z. They are not `units.js` rows, so no
   * pattern above can see them; the module that reads them declares where each field comes from and
   * where it lands, and its own spec binds that declaration to reality.
   */
  for (const [field, source] of Object.entries(PROGRESSION_UPSTREAM_SOURCES)) {
    add(field, source.upstream, 'upstream');
  }

  return byField;
}

/** table -> shipped column list, for every table the seed writes. */
export function extractShippedColumnsByTable(datasetSource) {
  const byTable = new Map();

  ANY_INSERT_COLUMNS_PATTERN.lastIndex = 0;

  let match;

  while ((match = ANY_INSERT_COLUMNS_PATTERN.exec(datasetSource)) !== null) {
    if (byTable.has(match[1])) {
      continue;
    }

    byTable.set(
      match[1],
      match[2]
        .split(',')
        .map((column) => column.trim())
        .filter(Boolean),
    );
  }

  return byTable;
}

export function extractShippedColumns(datasetSource) {
  const match = INSERT_COLUMNS_PATTERN.exec(datasetSource);

  if (!match) {
    return [];
  }

  return match[1]
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
}

export function buildProvenance({ importerSource, datasetSource, generatedAt }) {
  const reads = extractUpstreamReads(importerSource);
  const columns = extractShippedColumns(datasetSource);
  const byColumn = new Map();

  for (const entry of reads.values()) {
    byColumn.set(toColumnName(entry.field), entry);
  }

  const fields = columns.map((column) => {
    const upstream = byColumn.get(column);

    if (upstream) {
      return { column, origin: 'upstream', source: upstream.upstream, importerField: upstream.field };
    }

    if (column in UPSTREAM_DECLARED_COLUMNS) {
      return {
        column,
        origin: 'upstream',
        source: UPSTREAM_DECLARED_COLUMNS[column].source,
        note: UPSTREAM_DECLARED_COLUMNS[column].note,
      };
    }

    if (column in DERIVED_COLUMNS) {
      return { column, origin: 'derived', transform: DERIVED_COLUMNS[column] };
    }

    return { column, origin: 'unknown' };
  });

  /*
   * Upstream values the importer normalizes and the seed then drops. This is the half a shape
   * document can never show, and it is the reason to generate rather than describe: `maxSockets` is
   * read from `units.js` on every import and reaches nothing, which nobody had written down.
   */
  const shippedElsewhere = new Set();
  const columnsByTable = extractShippedColumnsByTable(datasetSource);

  for (const [field, source] of Object.entries(PROGRESSION_UPSTREAM_SOURCES)) {
    if ((columnsByTable.get(source.table) ?? []).includes(source.column)) {
      shippedElsewhere.add(field);
    }
  }

  const droppedBeforeShipping = [...reads.values()]
    .filter(
      (entry) => !columns.includes(toColumnName(entry.field)) && !shippedElsewhere.has(entry.field),
    )
    .map((entry) => ({ importerField: entry.field, source: entry.upstream }))
    .sort((left, right) => left.importerField.localeCompare(right.importerField));

  return {
    generatedAt,
    note: 'Generated by scripts/generate-dataset-provenance.mjs from the importer itself. Do not edit by hand.',
    shippedColumns: fields.length,
    unknownColumns: fields.filter((field) => field.origin === 'unknown').map((field) => field.column),
    fields,
    droppedBeforeShipping,
  };
}

export function formatProvenanceMarkdown(provenance) {
  const lines = [
    '<!-- generated:dataset-provenance start -->',
    '',
    '_Generated by `npm run dataset:provenance` from the importer itself. Do not edit by hand._',
    '',
    '| Shipped column | Origin | Source or transform |',
    '| --- | --- | --- |',
  ];

  for (const field of provenance.fields) {
    const detail = field.origin === 'upstream' ? `\`${field.source}\`` : (field.transform ?? '—');

    lines.push(`| \`${field.column}\` | ${field.origin} | ${detail} |`);
  }

  if (provenance.droppedBeforeShipping.length > 0) {
    lines.push(
      '',
      'Read from upstream by the importer and **not shipped** in the seed:',
      '',
      '| Importer field | Upstream source |',
      '| --- | --- |',
    );

    for (const dropped of provenance.droppedBeforeShipping) {
      lines.push(`| \`${dropped.importerField}\` | \`${dropped.source}\` |`);
    }
  }

  lines.push('', '<!-- generated:dataset-provenance end -->');

  return lines.join('\n');
}

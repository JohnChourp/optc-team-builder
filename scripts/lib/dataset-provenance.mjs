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
    'True when the row is missing data the app needs; computed during normalization, not carried upstream.',
  primary_class: 'classes[0] of the normalized class list.',
  secondary_class: 'classes[1] of the normalized class list, or null.',
  classes_json: 'The normalized class list, serialized.',
  captain_hp_boost: 'Parsed out of the captain ability PROSE by resolveCharacterCaptainBoosts.',
  captain_atk_boost: 'Parsed out of the captain ability PROSE by resolveCharacterCaptainBoosts.',
  captain_average_boost: 'Derived from the two boosts above.',
  region_json: 'Which regions the app found artwork for; an app-side fact, not an upstream one.',
  assets_json: 'Resolved image paths per region; an app-side fact, not an upstream one.',
  search_text: 'Built from name, type, classes and aliases by createCharacterSearchText.',
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

  return byField;
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
  const droppedBeforeShipping = [...reads.values()]
    .filter((entry) => !columns.includes(toColumnName(entry.field)))
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

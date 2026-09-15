/**
 * 869f13288. The other half of the provenance map.
 *
 * `docs/dataset-provenance.json` answers "where does this column come from". This answers "who
 * reads it" - and it exists because `regionAvailability` was imported, stored and parsed on every
 * character read for months while zero product code consumed it, and was found by accident while
 * researching something else.
 *
 * The classification deliberately has THREE outcomes, not two. This repository has already
 * mistaken four deliberate test probes for dead code, so "only the specs read it" is its own
 * verdict with its own required justification, never a synonym for "delete it".
 */

/** Files that produce or re-export a field rather than consuming it. */
const PRODUCER_PATHS = [
  'src/app/core/services/optc-repository.service.ts',
  'src/app/core/models/optc.models.ts',
];

/**
 * Fields read only by specs, each with the reason recorded here rather than in a comment that can
 * drift away from the field. A field that lands in this map is a claim someone made on purpose;
 * one that does not is an open question for the owner.
 */
/**
 * The third outcome the task named: a column read by nothing, or read only by specs, where the
 * decision - `use it` or `stop importing it` - genuinely belongs to the owner.
 *
 * This is not an escape hatch for a field someone could not be bothered to trace. An entry needs
 * the ClickUp task carrying the decision and the decision actually being asked, so the census
 * reports it loudly every run rather than absorbing it into silence. A field with neither a
 * consumer, a spec-only reason, nor an entry here still fails the lane.
 */
export const DECLARED_OPEN_QUESTIONS = Object.freeze({});

export const DECLARED_SPEC_ONLY_FIELDS = Object.freeze({
  regionArtwork:
    "OWNER DECISION, 2026-09-15: keep it, do not delete it. The census raised this at the close of 869f13288 - `region_json` is fully derivable from `assets_json` (every one of its three booleans is `Boolean(assets.<same field>)`) and the availability promise that made it look valuable moved to `region_release_json` in 869f13284, leaving it with no product consumer. The owner chose to keep the column rather than pay a schema change to remove a denormalisation that costs almost nothing. It stays declared here so a future sweep reads a decision instead of rediscovering the question.",
  starsLabel:
    "The upstream display string for rarity, kept beside the numeric `stars` because a handful of units render a non-numeric label. Specs pin the pairing; the templates bind `stars`.",
});

export function parseCharacterColumns(datasetSource) {
  const match = datasetSource.match(/CREATE TABLE characters \(([\s\S]*?)\);/u);

  if (!match) {
    throw new Error('Could not find the characters table definition in the dataset library.');
  }

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/u)[0].replace(/,$/u, ''))
    .filter((name) => /^[a-z_]+$/u.test(name));
}

/**
 * Column -> model field, read out of the repository's own row mapping rather than written by hand,
 * so a rename that touches one and not the other shows up as an unresolved column.
 */
/**
 * Column -> model field, read out of the repository's own row mapping rather than written by hand,
 * so a rename that touches one and not the other shows up as an unresolved column.
 *
 * Resolved by walking BACK from each `row['column']` to the nearest `name:` or `name =` on the
 * same line. A forward-matching regex looks simpler and misses every generic call - five of the
 * twenty-eight columns are read through `this.parseJson<string[]>(row['classes_json'], [])`, and a
 * pattern that does not allow for the `<string[]>` reports them as unmapped columns rather than as
 * its own blind spot.
 */
export function parseColumnToFieldMap(repositorySource) {
  const map = new Map();

  for (const line of repositorySource.split('\n')) {
    for (const match of line.matchAll(/row\['([a-z_]+)'\]/gu)) {
      const column = match[1];

      if (map.has(column)) {
        continue;
      }

      const before = line.slice(0, match.index);
      const assignments = [...before.matchAll(/([A-Za-z_$][\w$]*)\s*[:=]/gu)];
      const field = assignments.at(-1)?.[1] ?? null;

      if (field && field !== 'row') {
        map.set(column, field);
      }
    }
  }

  /*
   * A column read through a helper - `searchText: this.resolveSearchText(row)` - never appears on
   * the same line as its field. Resolve those by finding which columns each `resolve*(row)` helper
   * reads, then attributing them to the field its call site assigns.
   */
  for (const [, helperName, body] of repositorySource.matchAll(
    /private (resolve[A-Za-z]*)\(row: SqlRow\)[^{]*\{([\s\S]*?)\n  \}/gu,
  )) {
    const callSite = repositorySource.match(
      new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*this\\.${helperName}\\(row\\)`, 'u'),
    );

    if (!callSite) {
      continue;
    }

    for (const columnMatch of body.matchAll(/row\['([a-z_]+)'\]/gu)) {
      if (!map.has(columnMatch[1])) {
        map.set(columnMatch[1], callSite[1]);
      }
    }
  }

  return map;
}

/**
 * 869f1328m. How each column becomes a model field: the parse call, and the default it falls back
 * to when the column is absent or malformed.
 *
 * Read out of the repository rather than written by hand, because a silent default is how a
 * missing column becomes a WRONG ANSWER instead of an error, and a hand-written table of defaults
 * drifts from the code the first time anyone changes one. `region_release_json` is the worked
 * example: its default is `{ availableOnGlobal: null }`, and a default of `false` there would
 * state an absence as a fact for every seed written before that column existed.
 *
 * Returns `{ rule, fallback }` per column. `fallback` is `null` when the parse cannot fail - a
 * `Number(...)` or `String(...)` of a column the schema declares NOT NULL has nothing to fall back
 * to - and that is itself worth recording, because it says the column is load-bearing.
 */
export function parseColumnParseRules(repositorySource) {
  const rules = new Map();
  const lines = repositorySource.split('\n');

  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(/row\['([a-z_]+)'\]/gu)) {
      const column = match[1];

      if (rules.has(column)) {
        continue;
      }

      const before = line.slice(0, match.index);
      const callMatch = [...before.matchAll(/(?:this\.)?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\($/gu)];
      const rule = callMatch.at(-1)?.[1] ?? 'direct';

      /*
       * The default is the argument AFTER the column, which runs onto following lines whenever it
       * is an object literal. Read to BALANCED braces rather than a fixed line count: a two-line
       * lookahead silently truncated the three-field `region_json` default to two fields, which is
       * exactly the kind of quietly-wrong record this artifact exists to prevent.
       */
      const fallback = readFallbackArgument(lines, index, match.index + match[0].length);

      rules.set(column, { rule, fallback });
    }
  }

  return rules;
}

/**
 * Everything between the comma after `row['column']` and the call's closing paren, with object and
 * array literals read to balance. Returns `null` when the call takes no second argument - a
 * `Number(...)` of a NOT NULL column has nothing to fall back to, and saying so is the point.
 */
function readFallbackArgument(lines, startLineIndex, startColumn) {
  let text = lines[startLineIndex].slice(startColumn);
  let lineIndex = startLineIndex;

  const commaMatch = text.match(/^\s*,/u);

  if (!commaMatch) {
    return null;
  }

  text = text.slice(commaMatch[0].length);

  let depth = 0;
  let collected = '';

  for (let guard = 0; guard < 40; guard += 1) {
    for (const character of text) {
      if (character === '{' || character === '[' || character === '(') {
        depth += 1;
      } else if (character === '}' || character === ']') {
        depth -= 1;
      } else if (character === ')' && depth === 0) {
        return normalizeFallback(collected);
      } else if (character === ')') {
        depth -= 1;
      }

      collected += character;
    }

    lineIndex += 1;

    if (lineIndex >= lines.length) {
      break;
    }

    collected += ' ';
    text = lines[lineIndex];
  }

  return normalizeFallback(collected);
}

function normalizeFallback(raw) {
  const collapsed = String(raw).replace(/\s+/gu, ' ').trim().replace(/,$/u, '');

  return collapsed.length > 0 && collapsed !== ')' ? collapsed : null;
}

export function countConsumers(files, identifier) {
  const product = [];
  const specs = [];

  for (const [filePath, source] of files) {
    if (!source.includes(identifier)) {
      continue;
    }

    if (/\.spec\.ts$/u.test(filePath)) {
      specs.push(filePath);
      continue;
    }

    if (PRODUCER_PATHS.includes(filePath)) {
      continue;
    }

    product.push(filePath);
  }

  return { product, specs };
}

export function buildConsumerCensus({ datasetSource, repositorySource, files, generatedAt }) {
  const columns = parseCharacterColumns(datasetSource);
  const columnToField = parseColumnToFieldMap(repositorySource);
  const parseRules = parseColumnParseRules(repositorySource);
  const fields = [];

  for (const column of columns) {
    const field = columnToField.get(column) ?? null;
    const identifier = field ?? column;
    const { product, specs } = countConsumers(files, identifier);
    const verdict =
      product.length > 0
        ? 'read-by-product-code'
        : specs.length > 0
          ? 'read-only-by-specs'
          : 'read-by-nothing';

    fields.push({
      column,
      modelField: field,
      // 869f1328m. The middle of the end-to-end path: provenance says where the column comes from,
      // this says how it becomes a model field and what it falls back to, the census says who
      // reads it.
      parseRule: parseRules.get(column)?.rule ?? null,
      parseFallback: parseRules.get(column)?.fallback ?? null,
      verdict,
      productConsumerCount: product.length,
      specConsumerCount: specs.length,
      productConsumers: product.slice(0, 6),
      ...(DECLARED_SPEC_ONLY_FIELDS[identifier]
        ? { declaredReason: DECLARED_SPEC_ONLY_FIELDS[identifier] }
        : {}),
      ...(DECLARED_OPEN_QUESTIONS[identifier]
        ? { openQuestion: DECLARED_OPEN_QUESTIONS[identifier] }
        : {}),
    });
  }

  return {
    generatedAt,
    note: 'Generated by scripts/generate-dataset-consumers.mjs from the schema and the repository. Do not edit by hand. Completes the end-to-end path with docs/dataset-provenance.json: that file says where a column COMES FROM, this one says how it is PARSED (parseRule), what it falls back to when absent or malformed (parseFallback), and WHO READS it (verdict).',
    columnCount: fields.length,
    unresolvedColumns: fields.filter((entry) => entry.modelField === null).map((e) => e.column),
    fields,
  };
}

/**
 * The lane rule. A column read by nothing, or read only by specs without a declared reason, fails -
 * because the owner has to decide `use it` or `stop importing it`, and a silent delete is not one
 * of the options.
 */
export function findCensusFailures(census) {
  const failures = [];

  for (const entry of census.fields) {
    if (entry.modelField === null) {
      failures.push(
        `${entry.column}: no model field resolves from the repository row mapping. Add the mapping, or remove the column.`,
      );
      continue;
    }

    /*
     * 869f1328m's lane rule: a new column with no recorded parse rule fails. `direct` is a real
     * answer - the row value is used as-is - so the check is for a MISSING record, not for the
     * absence of a parse call.
     */
    if (!entry.parseRule) {
      failures.push(
        `${entry.column} (${entry.modelField}): no parse rule resolves. Every column must record how it becomes a model field and what it falls back to.`,
      );
      continue;
    }

    if (entry.openQuestion) {
      continue;
    }

    if (entry.verdict === 'read-by-nothing') {
      failures.push(
        `${entry.column} (${entry.modelField}): imported, stored and parsed, and read by nothing at all. Use it or stop importing it - do not delete it silently.`,
      );
      continue;
    }

    if (entry.verdict === 'read-only-by-specs' && !entry.declaredReason) {
      failures.push(
        `${entry.column} (${entry.modelField}): read only by specs. If that is deliberate, record why in DECLARED_SPEC_ONLY_FIELDS; if not, it is dead.`,
      );
    }
  }

  return failures;
}

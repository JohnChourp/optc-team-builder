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
    note: 'Generated by scripts/generate-dataset-consumers.mjs from the schema and the repository. Do not edit by hand. Pairs with docs/dataset-provenance.json: that file says where a column comes from, this one says who reads it.',
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

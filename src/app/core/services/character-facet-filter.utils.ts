import {
  type CharacterFacetKind,
  type CharacterFacetMatchMode,
  type CharacterFacetSelection,
} from '../models/optc.models';

/**
 * Verified over all 4588 rows of public/assets/data/optc-seed.sql:
 * 189 characters carry two types (4399 carry one) and 4086 carry two classes
 * (484 carry one, 18 carry none). No row carries three of either. `all` across
 * more than this can never match, so the normalizer refuses to represent it.
 */
export const MAX_HELD_CHARACTER_FACET_VALUES: Readonly<Record<CharacterFacetKind, number>> = {
  type: 2,
  class: 2,
};

/**
 * The subset of a character row this module reads. `CharacterRecord`,
 * `CharacterListItem` and `CharacterDetailRecord` all satisfy it structurally.
 */
export interface CharacterFacetRecordLike {
  readonly type?: string | null;
  readonly classes?: readonly string[] | null;
  readonly primaryClass?: string | null;
  readonly secondaryClass?: string | null;
}

/** The SQL-side row shape: LIKE runs against columns, so the harness does too. */
export interface CharacterFacetSqlRow {
  readonly type: string;
  readonly classesJson: string;
}

/**
 * The exact clause text the repository interpolates. Specs — including the fake
 * SQL driver in `optc-repository.service.spec.ts` — import these constants and
 * must never re-type them: a hard-coded copy that misses the `ESCAPE` suffix
 * silently downgrades the AND-mode detection to OR while staying green.
 */
export const CHARACTER_TYPE_LIKE_CLAUSE = "(',' || c.type || ',') LIKE ? ESCAPE '\\'";
export const CHARACTER_CLASS_LIKE_CLAUSE = "c.classes_json LIKE ? ESCAPE '\\'";

/**
 * UI-layer default. `any` — matches the mode every host hard-coded before this
 * change. The query layer keeps its own, different default (`all` for an
 * omitted `selectedTypesMatchMode` on `DetailedCharacterSearchQuery`), which is
 * back-compat for existing callers. Two layers, two defaults, both deliberate.
 */
export function createEmptyCharacterFacetSelection(): CharacterFacetSelection {
  return { values: [], matchMode: 'any' };
}

export function cloneCharacterFacetSelection(
  selection: CharacterFacetSelection,
): CharacterFacetSelection {
  return { values: [...selection.values], matchMode: selection.matchMode };
}

export function characterFacetSelectionsEqual(
  left: CharacterFacetSelection,
  right: CharacterFacetSelection,
): boolean {
  if (left.matchMode !== right.matchMode || left.values.length !== right.values.length) {
    return false;
  }

  return left.values.every((value, index) => value === right.values[index]);
}

export function isCharacterFacetAllModeSatisfiable(
  kind: CharacterFacetKind,
  valueCount: number,
): boolean {
  return valueCount <= MAX_HELD_CHARACTER_FACET_VALUES[kind];
}

/** Fold used on BOTH sides of every comparison: trim + collapse whitespace + lower-case. */
export function foldCharacterFacetValue(value: string): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

/**
 * Trims, collapses internal whitespace, de-dupes, drops empties, upper-cases
 * `type`, and DEMOTES an unsatisfiable `all` to `any`. After this call there is
 * no `CharacterFacetSelection` value that expresses "AND across 3+".
 */
export function normalizeCharacterFacetSelection(
  kind: CharacterFacetKind,
  selection: CharacterFacetSelection | null | undefined,
): CharacterFacetSelection {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const raw of selection?.values ?? []) {
    const trimmed = String(raw ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    const stored = kind === 'type' ? trimmed.toUpperCase() : trimmed;
    const key = foldCharacterFacetValue(stored);

    if (!key.length || seen.has(key)) {
      continue;
    }

    seen.add(key);
    values.push(stored);
  }

  const requested: CharacterFacetMatchMode = selection?.matchMode === 'all' ? 'all' : 'any';
  const matchMode: CharacterFacetMatchMode =
    requested === 'all' && !isCharacterFacetAllModeSatisfiable(kind, values.length)
      ? 'any'
      : requested;

  return { values, matchMode };
}

/** An empty selection is NO FILTER. It is never "nothing matches". */
export function isCharacterFacetSelectionEmpty(selection: CharacterFacetSelection): boolean {
  return selection.values.every((value) => foldCharacterFacetValue(value).length === 0);
}

/** Shared by every surface so ordering and de-dupe can never drift between hosts. */
export function toggleCharacterFacetValue(values: readonly string[], value: string): string[] {
  const key = foldCharacterFacetValue(value);

  if (!key.length) {
    return [...values];
  }

  if (values.some((entry) => foldCharacterFacetValue(entry) === key)) {
    return values.filter((entry) => foldCharacterFacetValue(entry) !== key);
  }

  return [...values, value];
}

/**
 * `type` is ONE comma-joined column and the same pair is stored in BOTH orders
 * ('INT,PSY' and 'PSY,INT'), so it is split, never compared whole.
 * `class` prefers the full `classes` array and falls back to the
 * primary/secondary pair only when the array is empty — reading the array first
 * is what makes a 3-class local override findable.
 */
export function readCharacterFacetValues(
  kind: CharacterFacetKind,
  record: CharacterFacetRecordLike,
): string[] {
  if (kind === 'type') {
    return String(record.type ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  const classes = (record.classes ?? [])
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);

  if (classes.length > 0) {
    return classes;
  }

  return [record.primaryClass, record.secondaryClass]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);
}

export function matchesCharacterFacetValues(
  recordValues: readonly string[],
  selection: CharacterFacetSelection,
): boolean {
  const values = selection.values.map(foldCharacterFacetValue).filter((value) => value.length > 0);

  if (!values.length) {
    return true; // empty selection applies NO filter
  }

  const held = new Set(
    recordValues.map(foldCharacterFacetValue).filter((value) => value.length > 0),
  );

  return selection.matchMode === 'any'
    ? values.some((value) => held.has(value))
    : values.every((value) => held.has(value));
}

/** The ONE predicate. Empty selection => true. */
export function matchesCharacterFacet(
  kind: CharacterFacetKind,
  record: CharacterFacetRecordLike,
  selection: CharacterFacetSelection,
): boolean {
  const normalized = normalizeCharacterFacetSelection(kind, selection);

  if (!normalized.values.length) {
    return true;
  }

  return matchesCharacterFacetValues(readCharacterFacetValues(kind, record), normalized);
}

export function countCharacterFacetMatches(
  kind: CharacterFacetKind,
  records: readonly CharacterFacetRecordLike[],
  selection: CharacterFacetSelection,
): number {
  const normalized = normalizeCharacterFacetSelection(kind, selection);

  if (!normalized.values.length) {
    return records.length;
  }

  return records.reduce(
    (total, record) => (matchesCharacterFacet(kind, record, normalized) ? total + 1 : total),
    0,
  );
}

/** Escapes %, _ and \ so a facet value can never act as a SQL wildcard. Pairs with ESCAPE '\'. */
export function escapeSqlLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** The ONE SQL builder. Returns null for an empty selection. */
export function buildCharacterFacetSqlClause(
  kind: CharacterFacetKind,
  selection: CharacterFacetSelection,
): { readonly clause: string; readonly params: readonly string[] } | null {
  const normalized = normalizeCharacterFacetSelection(kind, selection);

  if (!normalized.values.length) {
    return null;
  }

  const template = kind === 'type' ? CHARACTER_TYPE_LIKE_CLAUSE : CHARACTER_CLASS_LIKE_CLAUSE;
  const joiner = normalized.matchMode === 'any' ? ' OR ' : ' AND ';

  return {
    clause: `(${normalized.values.map(() => template).join(joiner)})`,
    params: normalized.values.map((value) =>
      kind === 'type' ? `%,${escapeSqlLikePattern(value)},%` : `%"${escapeSqlLikePattern(value)}"%`,
    ),
  };
}

/**
 * Executable definition of SQLite `LIKE … ESCAPE '\'`. `%` -> any run, `_` -> any
 * char, `\X` -> literal X, ASCII-case-insensitive. Used by the parity spec AND by
 * the repository spec's fake driver, so no third hand-rolled matcher exists.
 */
export function evaluateSqlLikePattern(value: string, pattern: string): boolean {
  let source = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? '';

    if (character === '\\') {
      const escaped = pattern[index + 1];

      if (escaped !== undefined) {
        source += escapeRegExpCharacter(escaped);
        index += 1;
        continue;
      }

      source += escapeRegExpCharacter(character);
      continue;
    }

    if (character === '%') {
      source += '[\\s\\S]*';
      continue;
    }

    if (character === '_') {
      source += '[\\s\\S]';
      continue;
    }

    source += escapeRegExpCharacter(character);
  }

  return new RegExp(`${source}$`, 'i').test(value);
}

/** Evaluates the SHIPPED clause string + params against a row, joiner included. */
export function matchesCharacterFacetSqlClause(
  kind: CharacterFacetKind,
  row: CharacterFacetSqlRow,
  selection: CharacterFacetSelection,
): boolean {
  const built = buildCharacterFacetSqlClause(kind, selection);

  if (!built) {
    return true;
  }

  const template = kind === 'type' ? CHARACTER_TYPE_LIKE_CLAUSE : CHARACTER_CLASS_LIKE_CLAUSE;
  // Read the joiner out of the EMITTED clause, so a wrong joiner fails the parity spec.
  const joinsWithOr = built.clause.includes(`${template} OR ${template}`);
  const columnValue = kind === 'type' ? `,${row.type},` : row.classesJson;
  const results = built.params.map((pattern) => evaluateSqlLikePattern(columnValue, pattern));

  return joinsWithOr || built.params.length === 1 ? results.some(Boolean) : results.every(Boolean);
}

/** Maps two facets onto the detailed query's four fields. Used by hosts 2 and 4. */
export function toDetailedQueryFacetFields(
  typeFacet: CharacterFacetSelection,
  classFacet: CharacterFacetSelection,
): {
  selectedTypes: string[];
  selectedTypesMatchMode: CharacterFacetMatchMode;
  selectedClasses: string[];
  selectedClassesMatchMode: CharacterFacetMatchMode;
} {
  const normalizedTypes = normalizeCharacterFacetSelection('type', typeFacet);
  const normalizedClasses = normalizeCharacterFacetSelection('class', classFacet);

  return {
    selectedTypes: [...normalizedTypes.values],
    selectedTypesMatchMode: normalizedTypes.matchMode,
    selectedClasses: [...normalizedClasses.values],
    selectedClassesMatchMode: normalizedClasses.matchMode,
  };
}

function escapeRegExpCharacter(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

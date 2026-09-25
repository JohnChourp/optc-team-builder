import {
  type CharacterFacetKind,
  type CharacterFacetMatchMode,
  type CharacterFacetSelection,
} from '../models/optc.models';

/**
 * Verified over all 4622 [@dataset characterRows] rows of public/assets/data/optc-seed.sql:
 * 190 [@dataset charactersWithTwoTypes] characters carry two types
 * (4432 [@dataset charactersWithOneType] carry one) and
 * 4120 [@dataset charactersWithTwoClasses] carry two classes
 * (484 [@dataset charactersWithOneClass] carry one,
 * 18 [@dataset charactersWithNoClasses] carry none). No row carries three of either. `all` across
 * more than this can never match, so the normalizer refuses to represent it.
 *
 * The `[@dataset ...]` markers are not decoration. Four of these six figures had already drifted -
 * the comment said 4588 rows, 189 two-type, 4399 one-type and 4086 two-class - because the dataset
 * moves at release and prose does not. `npm run dataset:measurements` now fails when they part.
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
  /** 869f63gv6. A dual or VS unit's forms. Each one's classes apply after a swap. */
  readonly forms?: readonly CharacterFormFacetLike[] | null;
}

/** The subset of a `CharacterForm` the class facet reads. */
export interface CharacterFormFacetLike {
  readonly name?: string | null;
  readonly classes?: readonly string[] | null;
}

/**
 * 869f63gv6. What the "after swap" marker says: the classes a record matches only once it has
 * swapped into one of its forms, and the forms that hold them.
 */
export interface FormOnlyClassMatch {
  readonly classes: readonly string[];
  readonly forms: readonly string[];
}

/** The SQL-side row shape: LIKE runs against columns, so the harness does too. */
export interface CharacterFacetSqlRow {
  readonly type: string;
  readonly classesJson: string;
  /** 869f63gv6. One `character_forms.classes_json` per form of the unit. */
  readonly formClassesJson?: readonly string[];
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
 * 869f63gv6. The same test against one of the unit's forms, inside
 * `EXISTS (SELECT 1 FROM character_forms f WHERE f.character_id = c.id AND ...)`. The class clause
 * binds every value twice - once for the unit's own classes, once for its forms' - so a fake driver
 * that counts one template has to count this one too.
 */
export const CHARACTER_FORM_CLASS_LIKE_CLAUSE = "f.classes_json LIKE ? ESCAPE '\\'";

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
 * is what makes a 3-class local override findable. These are the unit's OWN
 * classes; a dual or VS unit's forms are read by `readCharacterClassStates`.
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

/**
 * 869f63gv6. The class sets a unit can hold, one at a time: its own, then each form's.
 *
 * A dual or VS unit's classes after a swap are its form's classes, and the game never gives it two
 * forms' classes at once - #1983 Smoker & Tashigi is Striker/Slasher, Striker/Driven as Smoker and
 * Slasher/Cerebral as Tashigi, and never Driven and Cerebral together. So a class filter matches a
 * unit when ONE of these sets matches it. For "any" that is every form's class counted; for "all"
 * it keeps "a character holds at most two classes" true, which the capacity rule above relies on.
 * It is the model the type column already follows: a dual unit's own state holds both its forms'
 * types, and each form holds one.
 */
export function readCharacterClassStates(record: CharacterFacetRecordLike): string[][] {
  return [
    readCharacterFacetValues('class', record),
    ...(record.forms ?? []).map((form) =>
      (form.classes ?? [])
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0),
    ),
  ];
}

/**
 * 869f63gv6. The marker a class match carries when the unit's own classes do not satisfy the
 * selection and one or more of its forms' do - or `null`, when the unit matches as it is, or not at
 * all. For "any" it names the selected classes only a form holds; for "all", every selected class.
 */
export function resolveFormOnlyClassMatch(
  record: CharacterFacetRecordLike,
  selection: CharacterFacetSelection | null | undefined,
): FormOnlyClassMatch | null {
  const normalized = normalizeCharacterFacetSelection('class', selection);
  const forms = record.forms ?? [];

  if (!normalized.values.length || !forms.length) {
    return null;
  }

  const ownClasses = readCharacterFacetValues('class', record);

  if (matchesCharacterFacetValues(ownClasses, normalized)) {
    return null;
  }

  const ownKeys = new Set(ownClasses.map(foldCharacterFacetValue));
  const matchingForms = forms.filter((form) =>
    matchesCharacterFacetValues(form.classes ?? [], normalized),
  );

  if (!matchingForms.length) {
    return null;
  }

  const formHolds = (value: string) =>
    matchingForms.some((form) =>
      (form.classes ?? []).some(
        (formClass) =>
          foldCharacterFacetValue(String(formClass ?? '')) === foldCharacterFacetValue(value),
      ),
    );

  return {
    classes:
      normalized.matchMode === 'all'
        ? [...normalized.values]
        : normalized.values.filter(
            (value) => formHolds(value) && !ownKeys.has(foldCharacterFacetValue(value)),
          ),
    forms: matchingForms
      .map((form) => String(form.name ?? '').trim())
      .filter((name) => name.length > 0),
  };
}

/** 869f63gv6. Several markers for one card - a class filter and a Captain's boost - as one. */
export function mergeFormOnlyClassMatches(
  ...matches: ReadonlyArray<FormOnlyClassMatch | null | undefined>
): FormOnlyClassMatch | null {
  const present = matches.filter((match): match is FormOnlyClassMatch => Boolean(match));

  if (!present.length) {
    return null;
  }

  const unique = (values: readonly string[]) => {
    const seen = new Set<string>();

    return values.filter((value) => {
      const key = foldCharacterFacetValue(value);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  };

  return {
    classes: unique(present.flatMap((match) => match.classes)),
    forms: unique(present.flatMap((match) => match.forms)),
  };
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

  // 869f63gv6. A class matches in the unit's own state or in any one form, never across two.
  if (kind === 'class') {
    return readCharacterClassStates(record).some((classes) =>
      matchesCharacterFacetValues(classes, normalized),
    );
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
  const params = normalized.values.map((value) =>
    kind === 'type' ? `%,${escapeSqlLikePattern(value)},%` : `%"${escapeSqlLikePattern(value)}"%`,
  );
  const own = `(${normalized.values.map(() => template).join(joiner)})`;

  if (kind === 'type') {
    return { clause: own, params };
  }

  // 869f63gv6. The unit's own classes, or one form's - `readCharacterClassStates` in SQL.
  const forms = `(${normalized.values.map(() => CHARACTER_FORM_CLASS_LIKE_CLAUSE).join(joiner)})`;

  return {
    clause: `(${own} OR EXISTS (SELECT 1 FROM character_forms f WHERE f.character_id = c.id AND ${forms}))`,
    params: [...params, ...params],
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
  const ownCount = built.clause.split(template).length - 1;
  const matchesColumn = (columnValue: string, patterns: readonly string[]) => {
    const results = patterns.map((pattern) => evaluateSqlLikePattern(columnValue, pattern));

    return joinsWithOr || patterns.length === 1 ? results.some(Boolean) : results.every(Boolean);
  };

  if (kind === 'type') {
    return matchesColumn(`,${row.type},`, built.params);
  }

  // 869f63gv6. The own half binds the first params; the EXISTS half, if emitted, the rest.
  const ownPatterns = built.params.slice(0, ownCount);
  const formPatterns = built.params.slice(ownCount);

  return (
    matchesColumn(row.classesJson, ownPatterns) ||
    (formPatterns.length > 0 &&
      built.clause.includes(CHARACTER_FORM_CLASS_LIKE_CLAUSE) &&
      (row.formClassesJson ?? []).some((formClassesJson) =>
        matchesColumn(formClassesJson, formPatterns),
      ))
  );
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

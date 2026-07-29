import {
  MAX_ABILITY_FILTER_TAG_SETS,
  normalizeAbilityTagSetOperator,
  type AbilityTagSetOperator,
} from '../models/auto-team-builder-ability.models';
import {
  type CharacterDetailRecord,
  type CharacterTagSet,
  type CharacterTagSetSelection,
} from '../models/optc.models';
import { createAbilityTagSetId } from './ability-filter-tag-set.utils';
import {
  intersectAbilityMatchingCharacterIds,
  unionAbilityMatchingCharacterIds,
} from './special-ability-filter.utils';

/**
 * `tag key -> ids of the characters carrying it`, keyed by the lower-cased tag
 * so lookups are case-insensitive while the catalog keeps the cased values the
 * user actually reads.
 */
export type CharacterTagMatchIndex = ReadonlyMap<string, readonly number[]>;

/**
 * Character tag sets share the ability picker's cap: the modal chrome, the
 * over-cap warning and the "add set" affordance are the same UI budget, so a
 * second magic number would only let the two drift apart.
 */
export const MAX_CHARACTER_TAG_SETS = MAX_ABILITY_FILTER_TAG_SETS;

export function createCharacterTagSet(
  tags: readonly string[] = [],
  operator: AbilityTagSetOperator = 'any',
  id = createAbilityTagSetId(),
): CharacterTagSet {
  return {
    id,
    operator: normalizeAbilityTagSetOperator(operator),
    tags: dedupeCharacterTags(tags),
  };
}

export function createEmptyCharacterTagSetSelection(): CharacterTagSetSelection {
  return { sets: [], operator: 'all' };
}

export function cloneCharacterTagSetSelection(
  selection: CharacterTagSetSelection,
): CharacterTagSetSelection {
  return {
    operator: normalizeAbilityTagSetOperator(selection.operator),
    sets: selection.sets.map((set) => ({
      id: set.id,
      operator: normalizeAbilityTagSetOperator(set.operator),
      tags: [...set.tags],
    })),
  };
}

/**
 * Rebuilds a selection from persisted or imported data. Unknown fields are
 * dropped and malformed sets are skipped, matching the defensive
 * field-by-field normalizer convention used across user-state.service.ts.
 *
 * Tags are trimmed and de-duplicated but deliberately NOT lower-cased.
 * `user-state.service.ts` persists `selectedCharacterTags` with their original
 * case (unlike character names), and the catalog holds them cased too, so
 * folding case here would rewrite existing user data on the first load.
 */
export function normalizeCharacterTagSetSelection(value: unknown): CharacterTagSetSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rawSets = record['sets'];

  if (!Array.isArray(rawSets)) {
    return null;
  }

  const sets: CharacterTagSet[] = [];

  for (const rawSet of rawSets) {
    if (!rawSet || typeof rawSet !== 'object' || Array.isArray(rawSet)) {
      continue;
    }

    const setRecord = rawSet as Record<string, unknown>;
    const rawTags = setRecord['tags'];
    const tags = Array.isArray(rawTags) ? dedupeCharacterTags(rawTags) : [];

    if (!tags.length) {
      continue;
    }

    const id = typeof setRecord['id'] === 'string' ? setRecord['id'].trim() : '';

    sets.push({
      id: id.length ? id : createAbilityTagSetId(),
      operator: normalizeAbilityTagSetOperator(
        typeof setRecord['operator'] === 'string' ? setRecord['operator'] : null,
      ),
      tags,
    });

    if (sets.length >= MAX_CHARACTER_TAG_SETS) {
      break;
    }
  }

  if (!sets.length) {
    return null;
  }

  return {
    operator: normalizeAbilityTagSetOperator(
      typeof record['operator'] === 'string' ? record['operator'] : null,
    ),
    sets,
  };
}

/**
 * Expands the legacy flat `selectedCharacterTags` + "require all" boolean into
 * the equivalent single-set selection, losslessly.
 *
 * The legacy model only ever had ONE bucket of tags joined by one boolean, so
 * the faithful expansion is one set carrying every tag with `all`/`any` taken
 * from that boolean. The selection operator is `'all'`, which is a no-op while
 * there is a single set but is the right identity once the user adds a second.
 */
export function expandCharacterTagsToSets(
  tags: readonly string[],
  requireAll: boolean,
): CharacterTagSetSelection {
  const normalizedTags = dedupeCharacterTags(tags);

  if (!normalizedTags.length) {
    return createEmptyCharacterTagSetSelection();
  }

  return {
    operator: 'all',
    sets: [createCharacterTagSet(normalizedTags, requireAll ? 'all' : 'any')],
  };
}

/**
 * Flattens a selection back to the flat tag list legacy call sites persist.
 *
 * Original case is preserved so a round-trip through the picker never rewrites
 * the values already stored in a saved enemy or box filter.
 */
export function flattenCharacterTagSets(selection: CharacterTagSetSelection): string[] {
  return dedupeCharacterTags(selection.sets.flatMap((set) => set.tags));
}

export function countCharacterTagSetTags(selection: CharacterTagSetSelection): number {
  return selection.sets.reduce((total, set) => total + set.tags.length, 0);
}

export function countPopulatedCharacterTagSets(selection: CharacterTagSetSelection): number {
  return selection.sets.filter((set) => set.tags.length > 0).length;
}

/** True when a selection already holds more sets than the picker lets a user add. */
export function isOverCharacterTagSetCap(selection: CharacterTagSetSelection): boolean {
  return selection.sets.length > MAX_CHARACTER_TAG_SETS;
}

/**
 * Evaluates a whole selection against one character's tags.
 *
 * Within a set, `any` means the character carries at least one of the set's
 * tags and `all` means it carries every one; the sets themselves are joined by
 * `selection.operator`. Empty sets are skipped rather than treated as "matches
 * nothing", so a half-built set in the modal never blanks the results, and a
 * selection with no populated sets applies no filter at all (returns `true`).
 *
 * Comparison is case-insensitive and whitespace-trimmed on both sides while the
 * stored values keep their case, matching how character tags are compared
 * everywhere else in the app.
 */
export function matchesCharacterTagSets(
  characterTags: readonly string[],
  selection: CharacterTagSetSelection,
): boolean {
  const populatedSets = selection.sets.filter((set) => set.tags.length > 0);

  if (!populatedSets.length) {
    return true;
  }

  const characterTagKeys = new Set(
    characterTags.map((tag) => normalizeCharacterTagKey(tag)).filter((tagKey) => tagKey.length > 0),
  );

  const setResults = populatedSets.map((set) => matchesCharacterTagSet(characterTagKeys, set));

  return normalizeAbilityTagSetOperator(selection.operator) === 'any'
    ? setResults.some((matches) => matches)
    : setResults.every((matches) => matches);
}

/**
 * Builds the `tag key -> character ids` index the picker previews counts from
 * and the id-set resolver below filters with.
 *
 * Lives here rather than on a page because four hosts need the identical map;
 * captain-coverage and manual-team-builder previously each carried their own
 * verbatim copy of this loop.
 */
export function buildCharacterTagMatchIndex(
  records: Iterable<{
    readonly id: number;
    readonly detail?: { readonly characterTags?: readonly string[] } | null;
  }>,
): CharacterTagMatchIndex {
  const characterIdsByTagKey = new Map<string, number[]>();

  for (const record of records) {
    for (const tag of record.detail?.characterTags ?? []) {
      const tagKey = normalizeCharacterTagKey(tag);

      if (!tagKey.length) {
        continue;
      }

      const characterIds = characterIdsByTagKey.get(tagKey);

      if (!characterIds) {
        characterIdsByTagKey.set(tagKey, [record.id]);
        continue;
      }

      // One character can list the same tag twice in different casing; both
      // normalize to the same key and would otherwise double-count it.
      if (characterIds[characterIds.length - 1] !== record.id) {
        characterIds.push(record.id);
      }
    }
  }

  return characterIdsByTagKey;
}

/**
 * Resolves a selection to the ids of the characters it matches, for the hosts
 * that filter through a repository/cache query rather than a client-side
 * predicate. It is the vocabulary-B twin of
 * `resolveTagSetSelectionMatchingCharacterIds`.
 *
 * Returns `undefined` — never `[]` — when no POPULATED set remains, and that
 * distinction is load-bearing: `intersectAbilityMatchingCharacterIds` drops
 * `undefined` but intersects `[]` down to empty, and `queryCharacters` reads
 * `undefined` as "no gate" and an empty list as "reject everyone". Testing
 * `selection.sets.length` instead of the populated count would blank the whole
 * catalog the moment a user adds a group in the modal before picking a tag.
 *
 * Within a set: union for `any`, intersection for `all`. Across sets:
 * `selection.operator`. This mirrors `matchesCharacterTagSets` exactly, and the
 * spec replays a matrix through both so they cannot drift.
 *
 * A `null` index (catalog not loaded, or the load failed) is deliberately
 * fail-open: it returns `undefined`, so an infrastructure failure can never
 * present an empty catalog as though it were a real filter result.
 */
export function resolveCharacterTagSetSelectionMatchingCharacterIds(
  selection: CharacterTagSetSelection,
  index: CharacterTagMatchIndex | null,
): number[] | undefined {
  if (!index) {
    return undefined;
  }

  const populatedSets = selection.sets.filter((set) => set.tags.length > 0);

  if (!populatedSets.length) {
    return undefined;
  }

  const selectionOperator = normalizeAbilityTagSetOperator(selection.operator);
  const setIdLists: number[][] = [];

  for (const set of populatedSets) {
    const tagKeys = set.tags
      .map((tag) => normalizeCharacterTagKey(tag))
      .filter((tagKey) => tagKey.length > 0);

    if (!tagKeys.length) {
      /*
       * `matchesCharacterTagSet` returns TRUE for a set whose tags all normalize
       * away, i.e. that set matches every character. ORed across sets that makes
       * the whole selection match everyone (no filter at all); ANDed it
       * constrains nothing and is simply skipped. Returning an empty id list
       * here instead would silently disagree with the predicate and blank the
       * page for a filter the predicate considers inert.
       */
      if (selectionOperator === 'any') {
        return undefined;
      }

      continue;
    }

    const perTagIdLists = tagKeys.map((tagKey) => index.get(tagKey) ?? []);

    /*
     * The `?? []` only satisfies the return type: these helpers return
     * `undefined` solely when EVERY input list is `undefined`, and every list
     * here is a defined array. It is not a safety net.
     */
    setIdLists.push(
      (normalizeAbilityTagSetOperator(set.operator) === 'all'
        ? intersectAbilityMatchingCharacterIds(perTagIdLists)
        : unionAbilityMatchingCharacterIds(perTagIdLists)) ?? [],
    );
  }

  if (!setIdLists.length) {
    return undefined;
  }

  return (
    (selectionOperator === 'any'
      ? unionAbilityMatchingCharacterIds(setIdLists)
      : intersectAbilityMatchingCharacterIds(setIdLists)) ?? []
  );
}

function matchesCharacterTagSet(
  characterTagKeys: ReadonlySet<string>,
  set: CharacterTagSet,
): boolean {
  const tagKeys = set.tags
    .map((tag) => normalizeCharacterTagKey(tag))
    .filter((tagKey) => tagKey.length > 0);

  if (!tagKeys.length) {
    return true;
  }

  return normalizeAbilityTagSetOperator(set.operator) === 'all'
    ? tagKeys.every((tagKey) => characterTagKeys.has(tagKey))
    : tagKeys.some((tagKey) => characterTagKeys.has(tagKey));
}

/** Trims and drops blanks, de-duplicating on the exact (case-preserved) value. */
function dedupeCharacterTags(tags: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalizedTag = typeof tag === 'string' ? tag.trim() : '';

    if (!normalizedTag.length || seen.has(normalizedTag)) {
      continue;
    }

    seen.add(normalizedTag);
    result.push(normalizedTag);
  }

  return result;
}

/** Match key only — never persisted, so stored tags keep their original case. */
/**
 * Match key only — never persisted, so the stored tags keep their original case.
 *
 * Internal whitespace is collapsed because
 * `OptcRepositoryService.getAvailableCharacterTags()` hands the picker
 * `tag.trim().replace(/\s+/g, ' ')`. Without the same collapse here, a raw
 * catalog tag carrying a double space would index under a key the user's
 * (already collapsed) selected value can never produce, and the filter would
 * silently match nothing. No tag in the current dataset is affected, so this is
 * latent rather than live — but it makes the predicate and the id-set resolver
 * provably agree instead of agreeing by luck.
 */
export function normalizeCharacterTagKey(tag: string): string {
  return typeof tag === 'string' ? tag.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

import {
  type CaptainCoverageSortMode,
  type CaptainCoverageCostRange,
} from './captain-coverage-result-pass.utils';
import {
  type CharacterFacetMatchMode,
  type CharacterFacetSelection,
  type CharacterIdOrder,
  type CharacterTagSetSelection,
} from '../models/optc.models';
import { type AbilityFilterTagSetSelection } from '../models/auto-team-builder-ability.models';

/**
 * 869f127c9. Shared by the two pages that hold a character filter panel of this shape - Captain
 * Coverage and the Manual Team Builder. `parseCharacterFilterDraft` returns only the keys it could
 * read, so a page that has no tiers, no character box or no sort simply gets no key for them, and
 * one codec serves both without either page carrying the other's fields.
 *
 * `persistTeamDraft()` parked the half-built team so it survived the trip to a
 * character's detail page - and parked nothing else, so the filter set the reader spent minutes
 * assembling was thrown away on the same trip. On the one page whose filter pass was expensive
 * enough to earn its own Web Worker.
 *
 * Filters ride in the SAME session key as the team rather than a second one. Two keys means two
 * write paths, two failure modes, and a state where the team comes back under filters that did
 * not - which looks like the page losing the team.
 *
 * Every reader here is defensive in the same specific way: a field is restored only when it is
 * still a value THIS build understands, and each field is decided ON ITS OWN. A tag set written by
 * a later build must not take a perfectly good type facet down with it.
 */

const FACET_MATCH_MODES: readonly CharacterFacetMatchMode[] = ['all', 'any'];
const TAG_SET_OPERATORS = ['all', 'any'] as const;
const SORT_MODES: readonly CaptainCoverageSortMode[] = [
  'catalog',
  'captainAtkBoost',
  'captainAverageBoost',
  'captainHpBoost',
  'nameAsc',
  'nameDesc',
];
const ID_ORDERS: readonly CharacterIdOrder[] = ['newest', 'oldest'];

/**
 * Every filter either page can restore. A page supplies its own defaults for the fields it does
 * not have; the reader above never writes a key it could not read, so nothing is invented on the
 * way back.
 */
export interface CharacterFilterDraft {
  searchTerm: string;
  typeFacet: CharacterFacetSelection;
  classFacet: CharacterFacetSelection;
  coverageCostRange: CaptainCoverageCostRange;
  sortMode: CaptainCoverageSortMode;
  idOrder: CharacterIdOrder;
  favoritesOnly: boolean;
  hideFavorites: boolean;
  requireSuperTandemPresence: boolean;
  requireSuperTypesClassesPresence: boolean;
  requiredTierNumbers: number[];
  characterTagSetSelection: CharacterTagSetSelection;
  abilityTagSetSelection: AbilityFilterTagSetSelection;
  selectedCharacterBoxId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...(value as string[])]
    : null;
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export function readFacetSelection(value: unknown): CharacterFacetSelection | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const values = readStringArray(record['values']);
  const matchMode = readOneOf(record['matchMode'], FACET_MATCH_MODES);

  // Both halves or neither: a facet with values and no match mode would silently filter under a
  // combinator the reader never chose.
  return values && matchMode ? { values, matchMode } : null;
}

export function readCostRange(value: unknown): CaptainCoverageCostRange | null {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const readBound = (bound: unknown): number | null | undefined => {
    if (bound === null) {
      return null;
    }

    return typeof bound === 'number' && Number.isFinite(bound) ? bound : undefined;
  };

  const min = readBound(record['min']);
  const max = readBound(record['max']);

  return min === undefined || max === undefined ? null : { min, max };
}

/**
 * Tier numbers are positive integers with no upper bound here: the tier count comes from the
 * dataset, and rejecting a tier this build has not loaded yet would drop a filter that is about to
 * become valid again. A tier the dataset does not have simply matches nothing.
 */
export function readTierNumbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const numbers = value.filter(
    (entry): entry is number => typeof entry === 'number' && Number.isInteger(entry) && entry > 0,
  );

  return numbers.length === value.length ? [...new Set(numbers)] : null;
}

export function readCharacterTagSetSelection(value: unknown): CharacterTagSetSelection | null {
  const record = asRecord(value);
  const operator = record && readOneOf(record['operator'], TAG_SET_OPERATORS);

  if (!record || !operator || !Array.isArray(record['sets'])) {
    return null;
  }

  const sets: CharacterTagSetSelection['sets'] = [];

  for (const entry of record['sets']) {
    const set = asRecord(entry);
    const id = set && readString(set['id']);
    const setOperator = set && readOneOf(set['operator'], TAG_SET_OPERATORS);
    const tags = set && readStringArray(set['tags']);

    if (!id || !setOperator || !tags) {
      return null;
    }

    sets.push({ id, operator: setOperator, tags });
  }

  return { sets, operator };
}

/**
 * Ability sets carry `AutoBuildAbilityRequirement` objects whose shape is owned elsewhere and is
 * far richer than anything worth re-validating field by field here. The structure is checked - a
 * set is an object with an id, an operator and an array of requirement objects - and the
 * requirements themselves are passed through. The page matches them against the live catalogue, so
 * a requirement that no longer exists narrows nothing rather than throwing.
 */
export function readAbilityTagSetSelection(value: unknown): AbilityFilterTagSetSelection | null {
  const record = asRecord(value);
  const operator = record && readOneOf(record['operator'], TAG_SET_OPERATORS);

  if (!record || !operator || !Array.isArray(record['sets'])) {
    return null;
  }

  const sets: AbilityFilterTagSetSelection['sets'] = [];

  for (const entry of record['sets']) {
    const set = asRecord(entry);
    const id = set && readString(set['id']);
    const setOperator = set && readOneOf(set['operator'], TAG_SET_OPERATORS);
    const requirements = set?.['requirements'];

    if (!id || !setOperator || !Array.isArray(requirements)) {
      return null;
    }

    if (!requirements.every((requirement) => asRecord(requirement) !== null)) {
      return null;
    }

    sets.push({
      id,
      operator: setOperator,
      requirements: requirements as AbilityFilterTagSetSelection['sets'][number]['requirements'],
    });
  }

  return { sets, operator };
}

/**
 * Every field the stored draft holds a usable value for, and no key at all for the ones it does
 * not - so the caller can apply exactly what was understood and leave its own defaults standing
 * everywhere else.
 */
export function parseCharacterFilterDraft(
  value: unknown,
): Partial<CharacterFilterDraft> {
  const record = asRecord(value);

  if (!record) {
    return {};
  }

  const draft: Partial<CharacterFilterDraft> = {};
  const assign = <K extends keyof CharacterFilterDraft>(
    key: K,
    parsed: CharacterFilterDraft[K] | null,
  ): void => {
    if (parsed !== null) {
      draft[key] = parsed;
    }
  };

  assign('searchTerm', readString(record['searchTerm']));
  assign('typeFacet', readFacetSelection(record['typeFacet']));
  assign('classFacet', readFacetSelection(record['classFacet']));
  assign('coverageCostRange', readCostRange(record['coverageCostRange']));
  assign('sortMode', readOneOf(record['sortMode'], SORT_MODES));
  assign('idOrder', readOneOf(record['idOrder'], ID_ORDERS));
  assign('favoritesOnly', readBoolean(record['favoritesOnly']));
  assign('hideFavorites', readBoolean(record['hideFavorites']));
  assign('requireSuperTandemPresence', readBoolean(record['requireSuperTandemPresence']));
  assign(
    'requireSuperTypesClassesPresence',
    readBoolean(record['requireSuperTypesClassesPresence']),
  );
  assign('requiredTierNumbers', readTierNumbers(record['requiredTierNumbers']));
  assign(
    'characterTagSetSelection',
    readCharacterTagSetSelection(record['characterTagSetSelection']),
  );
  assign('abilityTagSetSelection', readAbilityTagSetSelection(record['abilityTagSetSelection']));

  // null is a real value here - "no box selected" - so it is assigned rather than skipped.
  const boxId = record['selectedCharacterBoxId'];

  if (boxId === null || typeof boxId === 'string') {
    draft.selectedCharacterBoxId = boxId;
  }

  return draft;
}

/**
 * True when the draft holds nothing worth storing, so an untouched page removes its key instead of
 * parking a record of every default. Deliberately does NOT look at sort or id order: those are not
 * filters, and a reader who only changed the sort still changed something worth keeping.
 */
export function isEmptyCharacterFilterDraft(draft: CharacterFilterDraft): boolean {
  return (
    draft.searchTerm.trim().length === 0 &&
    draft.typeFacet.values.length === 0 &&
    draft.classFacet.values.length === 0 &&
    draft.coverageCostRange.min === null &&
    draft.coverageCostRange.max === null &&
    !draft.favoritesOnly &&
    !draft.hideFavorites &&
    !draft.requireSuperTandemPresence &&
    !draft.requireSuperTypesClassesPresence &&
    draft.requiredTierNumbers.length === 0 &&
    draft.characterTagSetSelection.sets.length === 0 &&
    draft.abilityTagSetSelection.sets.length === 0 &&
    draft.selectedCharacterBoxId === null
  );
}

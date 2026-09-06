import {
  type CharacterDetailRecord,
  type CharacterFacetSelection,
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSortMode,
  type CharacterTagSetSelection,
} from '../models/optc.models';
import {
  createCaptainBoostScopeCache,
  type CaptainCoverageResult,
} from './captain-coverage.utils';
import {
  type CaptainCoverageFilterState,
  type CaptainCoverageTargetSummary,
  resolveCaptainCoverageFilterResult,
  summarizeCaptainCoverageTarget,
} from './captain-coverage-filter.utils';
import { matchesCharacterFacet } from './character-facet-filter.utils';
import { matchesCharacterTagSets } from './character-tag-set.utils';

/**
 * Which characters Captain Coverage shows, in which order - and nothing else.
 *
 * This module exists so the pass has exactly ONE implementation. It runs inside
 * `captain-coverage-filter.worker.ts` when the browser gives us a Worker, and
 * on the main thread when it does not (older browsers, and every unit test,
 * which constructs the page class directly in an environment with no `Worker`).
 * A second copy written for the fallback would be a second thing to keep
 * correct, and the two would drift on the first bug fix that only landed in one.
 *
 * It deliberately returns **ids and counts, not card view models**. The card a
 * reader sees carries badge labels that need the i18n service, and a sub-slot
 * assignment that depends on the current team rather than on the filters - so
 * those are built on the main thread for the ~100 cards actually painted,
 * instead of for all 4614 and then shipped back across `postMessage`.
 */
export type CaptainCoverageSortMode =
  | Extract<
      CharacterSortMode,
      'catalog' | 'captainAtkBoost' | 'captainAverageBoost' | 'captainHpBoost' | 'nameAsc'
    >
  | 'nameDesc';

/** Structural copy of the filter row's range, so the worker pulls in no component code. */
export interface CaptainCoverageCostRange {
  min: number | null;
  max: number | null;
}

/**
 * One catalog entry as the pass needs it: the list item the reader sees, plus
 * the three-field projection of its detail record.
 *
 * The projection is the reason a worker is affordable here. A
 * `CharacterDetailRecord` carries every ability text the app knows; the pass
 * reads three fields out of it, so shipping the records themselves would clone
 * the whole catalog into a second heap to answer questions about tags and two
 * booleans.
 */
export interface CaptainCoverageResultPassEntry {
  character: CharacterListItem;
  summary: CaptainCoverageTargetSummary;
}

/**
 * Everything the pass reads that does not change between filter presses.
 * Shipped to the worker once, when the catalog loads.
 */
export interface CaptainCoverageResultPassDataset {
  entries: readonly CaptainCoverageResultPassEntry[];
}

export function buildCaptainCoverageResultPassDataset(
  characters: readonly CharacterListItem[],
  characterDetailsById: ReadonlyMap<number, CharacterDetailRecord>,
): CaptainCoverageResultPassDataset {
  return {
    entries: characters.map((character) => ({
      character,
      summary: summarizeCaptainCoverageTarget(characterDetailsById.get(character.id)),
    })),
  };
}

/** Everything that changes when the reader touches a filter. */
export interface CaptainCoverageResultPassParams {
  /**
   * The Captain alone. The Friend Captain is deliberately absent: it changes
   * the multiplier printed on a card, never which cards are in the list nor
   * their order, so it belongs to hydration and not to this pass.
   */
  captain: CharacterDetailRecord | null;
  filterState: CaptainCoverageFilterState;
  characterBoxIds: readonly number[] | null;
  typeFacet: CharacterFacetSelection;
  classFacet: CharacterFacetSelection;
  costRange: CaptainCoverageCostRange;
  favoritesOnly: boolean;
  hideFavorites: boolean;
  favoriteIds: readonly number[];
  characterTagSetSelection: CharacterTagSetSelection;
  requireSuperTandemPresence: boolean;
  requireSuperTypesClassesPresence: boolean;
  /** Already trimmed and lower-cased by the caller. */
  searchTerm: string;
  sortMode: CaptainCoverageSortMode;
  idOrder: CharacterIdOrder;
}

export interface CaptainCoverageResultPassOutcome {
  /** Every matching character id, in final sorted order. */
  ids: number[];
  /**
   * How many of those the Captain actually boosts.
   *
   * This is the one figure the main thread cannot recompute from `ids`: it is
   * the raw coverage verdict, and coverage only exists inside this pass.
   */
  boostedCount: number;
}

interface CaptainCoverageResultPassCandidate {
  character: CharacterListItem;
  coverage: CaptainCoverageResult | null;
  boosted: boolean;
}

export function runCaptainCoverageResultPass(
  dataset: CaptainCoverageResultPassDataset,
  params: CaptainCoverageResultPassParams,
): CaptainCoverageResultPassOutcome {
  const {
    captain,
    filterState,
    typeFacet,
    classFacet,
    costRange,
    favoritesOnly,
    hideFavorites,
    characterTagSetSelection,
    requireSuperTandemPresence,
    requireSuperTypesClassesPresence,
    searchTerm,
  } = params;
  const characterBoxIdSet = params.characterBoxIds ? new Set(params.characterBoxIds) : null;
  const favoriteIdSet = new Set(params.favoriteIds);
  const requiredAbilityCharacterIds = filterState.requiredAbilityCharacterIds;
  /*
   * One memo per pass. The captain's ability text is identical for every target
   * below and parsing it is the bulk of the cost; a cache that outlived the pass
   * would hold work for a captain nobody has selected any more.
   */
  const scopeCache = createCaptainBoostScopeCache();

  const candidates: CaptainCoverageResultPassCandidate[] = [];

  for (const { character, summary } of dataset.entries) {
    if (characterBoxIdSet && !characterBoxIdSet.has(character.id)) {
      continue;
    }

    // Ability tag sets resolve to character ids once, so the whole AND/OR
    // formula costs one membership test per character here.
    if (requiredAbilityCharacterIds && !requiredAbilityCharacterIds.has(character.id)) {
      continue;
    }

    /*
     * Type, class, cost and favorites read nothing but `character`, so they run
     * BEFORE the coverage work below. Ordering them after it meant every
     * character the reader had just filtered away still paid for a full
     * captain-ability parse first.
     */
    if (!matchesCharacterFacet('type', character, typeFacet)) {
      continue;
    }

    if (!matchesCharacterFacet('class', character, classFacet)) {
      continue;
    }

    if (costRange.min !== null && character.cost < costRange.min) {
      continue;
    }

    if (costRange.max !== null && character.cost > costRange.max) {
      continue;
    }

    if (favoritesOnly && !favoriteIdSet.has(character.id)) {
      continue;
    }

    if (hideFavorites && favoriteIdSet.has(character.id)) {
      continue;
    }

    const filterResult = captain
      ? resolveCaptainCoverageFilterResult(captain, { character, summary }, filterState, scopeCache)
      : null;

    if (filterResult && !filterResult.matches) {
      continue;
    }

    if (requireSuperTandemPresence && !summary.hasSuperTandemData) {
      continue;
    }

    if (requireSuperTypesClassesPresence && !summary.hasSuperTypesClassesData) {
      continue;
    }

    if (!matchesCharacterTagSets(summary.characterTags, characterTagSetSelection)) {
      continue;
    }

    const coverage = filterResult?.coverage ?? null;

    // Search runs last because it reads the coverage chips, which only exist
    // once the coverage above has been resolved.
    if (searchTerm.length && !matchesCaptainCoverageSearchTerm(character, coverage, searchTerm)) {
      continue;
    }

    candidates.push({
      character,
      coverage,
      // The raw coverage verdict, not the filter's `matches`: coverage no
      // longer gates the list, so this is the only honest source.
      boosted: captain ? (coverage?.matches ?? false) : false,
    });
  }

  sortCaptainCoverageCandidates(candidates, params.sortMode, params.idOrder);

  return {
    ids: candidates.map((candidate) => candidate.character.id),
    boostedCount: candidates.reduce((total, candidate) => total + (candidate.boosted ? 1 : 0), 0),
  };
}

export function matchesCaptainCoverageSearchTerm(
  character: CharacterListItem,
  coverage: CaptainCoverageResult | null,
  searchTerm: string,
): boolean {
  return [
    character.id,
    character.name,
    character.type,
    character.primaryClass,
    character.secondaryClass ?? '',
    ...character.classes,
    ...(coverage?.chips.map((chip) => chip.label) ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(searchTerm);
}

/*
 * The order this produces is a paging key, not just a presentation choice:
 * `visibleResultCount` compares the previous id sequence to the new one
 * POSITIONALLY, so an order that differs from the one the page used to compute
 * would silently drop the reader back to the first page on every filter press.
 */
function sortCaptainCoverageCandidates(
  candidates: CaptainCoverageResultPassCandidate[],
  sortMode: CaptainCoverageSortMode,
  idOrder: CharacterIdOrder,
): void {
  candidates.sort((left, right) => {
    if (
      sortMode === 'captainHpBoost' ||
      sortMode === 'captainAtkBoost' ||
      sortMode === 'captainAverageBoost'
    ) {
      const boostDifference = right.character[sortMode] - left.character[sortMode];

      if (boostDifference !== 0) {
        return boostDifference;
      }

      return compareCaptainCoverageIds(left.character.id, right.character.id, idOrder);
    }

    if (sortMode === 'nameAsc') {
      return (
        left.character.name.localeCompare(right.character.name, undefined, {
          sensitivity: 'base',
        }) || compareCaptainCoverageIds(left.character.id, right.character.id, idOrder)
      );
    }

    if (sortMode === 'nameDesc') {
      return (
        right.character.name.localeCompare(left.character.name, undefined, {
          sensitivity: 'base',
        }) || compareCaptainCoverageIds(left.character.id, right.character.id, idOrder)
      );
    }

    // 'catalog' is id order, not insertion order.
    return compareCaptainCoverageIds(left.character.id, right.character.id, idOrder);
  });
}

function compareCaptainCoverageIds(
  leftId: number,
  rightId: number,
  idOrder: CharacterIdOrder,
): number {
  return idOrder === 'oldest' ? leftId - rightId : rightId - leftId;
}

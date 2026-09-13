/**
 * 869f127c4. Saved Teams could already be narrowed by covered abilities and by nothing else: a
 * reader with many teams could not type a name and could not reorder the list. Measured on
 * 2026-09-12 and again on 2026-09-13 - `public/i18n/saved-teams/en.json` held 136 keys, 21 of them
 * filter-ish, and not one was `search`, `sort` or `order`.
 *
 * Pure over the smallest shape the page can supply, so the matching and ordering rules are
 * testable without a page, a DOM or a translation loader - which is the only way they are testable
 * at all here, since the page specs have no TestBed.
 */

/**
 * `default` is the order the list already had - the order teams come back from storage in - and it
 * is the default on purpose. A sort control is new; silently reordering every reader's list the
 * first time they open the page is not what they asked for, and this subtask is the control, not a
 * new default.
 */
export const SAVED_TEAM_SORT_KEYS = [
  'default',
  'updatedAt',
  'createdAt',
  'name',
  'captain',
] as const;
export type SavedTeamSortKey = (typeof SAVED_TEAM_SORT_KEYS)[number];
export type SavedTeamSortDirection = 'asc' | 'desc';

/** Exactly what ordering and matching need, and nothing the page would have to invent. */
export interface SavedTeamSortableCard {
  name: string;
  captainName: string;
  friendCaptainName: string;
  /** ISO timestamps as stored on the team. */
  createdAt: string;
  updatedAt: string;
}

/**
 * The order a reader means when they pick a key, before touching the toggle: A-Z for a name or a
 * captain, newest-first for a date. One global default gets one of the two wrong - picking "Team
 * name" and landing on Z-A reads as a bug, not as a default.
 */
export function defaultSavedTeamSortDirection(key: SavedTeamSortKey): SavedTeamSortDirection {
  return key === 'createdAt' || key === 'updatedAt' ? 'desc' : 'asc';
}

export function isSavedTeamSortKey(value: unknown): value is SavedTeamSortKey {
  return (SAVED_TEAM_SORT_KEYS as readonly string[]).includes(String(value));
}

export function isSavedTeamSortDirection(value: unknown): value is SavedTeamSortDirection {
  return value === 'asc' || value === 'desc';
}

/**
 * Fold case and strip diacritics so a Greek reader typing without accents still finds the team
 * they named with them, and so `Zorojuro` matches whichever case they used. NFD + combining-mark
 * removal rather than a hand-written map: the roster carries both alphabets.
 */
export function normalizeSavedTeamSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLocaleLowerCase();
}

/**
 * Every word must match SOMETHING, but not all in the same field - so `luffy nami` finds the team
 * whose Captain is one and whose Friend Captain is the other. Requiring one field to hold both
 * would make a two-name search useless, which is the search a reader with many teams actually runs.
 */
export function matchesSavedTeamSearch(card: SavedTeamSortableCard, query: string): boolean {
  const terms = normalizeSavedTeamSearchText(query).split(/\s+/u).filter(Boolean);

  if (!terms.length) {
    return true;
  }

  const haystack = normalizeSavedTeamSearchText(
    [card.name, card.captainName, card.friendCaptainName].join(' '),
  );

  return terms.every((term) => haystack.includes(term));
}

export function filterSavedTeamCardsBySearch<T extends SavedTeamSortableCard>(
  cards: readonly T[],
  query: string,
): T[] {
  return cards.filter((card) => matchesSavedTeamSearch(card, query));
}

function compareText(left: string, right: string): number {
  // localeCompare, not `<`: `Ω` sorts before `α` by code point, which puts Greek team names in an
  // order no reader would call alphabetical.
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  // An unparseable timestamp sorts last in BOTH directions rather than jumping to the top when the
  // reader flips the order - a team with broken metadata is not the newest team.
  if (!leftValid || !rightValid) {
    return leftValid ? -1 : rightValid ? 1 : 0;
  }

  return leftTime - rightTime;
}

/**
 * Ordered, never in place: the page holds the unsorted cards in a signal and a sort that mutated
 * them would reorder the source the ability filters read.
 */
export function sortSavedTeamCards<T extends SavedTeamSortableCard>(
  cards: readonly T[],
  key: SavedTeamSortKey,
  direction: SavedTeamSortDirection,
): T[] {
  const sorted = [...cards];

  // The stored order, copied but untouched - and the direction toggle does not apply to it, since
  // "as saved, reversed" is not an order anybody asked for.
  if (key === 'default') {
    return sorted;
  }

  const factor = direction === 'asc' ? 1 : -1;

  sorted.sort((left, right) => {
    let comparison = 0;

    switch (key) {
      case 'name':
        comparison = compareText(left.name, right.name);
        break;
      case 'captain':
        comparison = compareText(left.captainName, right.captainName);
        break;
      case 'createdAt':
        comparison = compareTimestamp(left.createdAt, right.createdAt);
        break;
      default:
        comparison = compareTimestamp(left.updatedAt, right.updatedAt);
        break;
    }

    if (comparison !== 0) {
      // An invalid timestamp is placed by compareTimestamp and must stay placed, so the direction
      // factor is not applied to it. Everything else flips with the reader's choice.
      const isUnorderedTimestamp =
        (key === 'createdAt' || key === 'updatedAt') &&
        !(
          Number.isFinite(Date.parse(key === 'createdAt' ? left.createdAt : left.updatedAt)) &&
          Number.isFinite(Date.parse(key === 'createdAt' ? right.createdAt : right.updatedAt))
        );

      return isUnorderedTimestamp ? comparison : comparison * factor;
    }

    // Name is the tie-break for every key, so two teams saved in the same second keep a stable
    // order between renders instead of swapping under the reader.
    return compareText(left.name, right.name);
  });

  return sorted;
}

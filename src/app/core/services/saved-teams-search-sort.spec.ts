import { describe, expect, it } from 'vitest';

import {
  defaultSavedTeamSortDirection,
  filterSavedTeamCardsBySearch,
  isSavedTeamSortDirection,
  isSavedTeamSortKey,
  matchesSavedTeamSearch,
  normalizeSavedTeamSearchText,
  sortSavedTeamCards,
  type SavedTeamSortableCard,
} from './saved-teams-search-sort.utils';

function card(overrides: Partial<SavedTeamSortableCard>): SavedTeamSortableCard {
  return {
    name: 'Team',
    captainName: '',
    friendCaptainName: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeSavedTeamSearchText', () => {
  it('folds case', () => {
    expect(normalizeSavedTeamSearchText('LuFFy')).toBe('luffy');
  });

  it('strips Greek accents, so an unaccented search finds an accented name', () => {
    expect(normalizeSavedTeamSearchText('Ομάδα')).toBe(normalizeSavedTeamSearchText('Ομαδα'));
  });
});

describe('matchesSavedTeamSearch', () => {
  const zoroAndNami = card({
    name: 'Rumble sweep',
    captainName: 'Roronoa Zoro',
    friendCaptainName: 'Nami',
  });

  it('matches an empty query, so an untouched box hides nothing', () => {
    expect(matchesSavedTeamSearch(zoroAndNami, '')).toBe(true);
    expect(matchesSavedTeamSearch(zoroAndNami, '   ')).toBe(true);
  });

  it('matches on the team name', () => {
    expect(matchesSavedTeamSearch(zoroAndNami, 'sweep')).toBe(true);
  });

  it('matches on the captain and on the friend captain', () => {
    expect(matchesSavedTeamSearch(zoroAndNami, 'zoro')).toBe(true);
    expect(matchesSavedTeamSearch(zoroAndNami, 'nami')).toBe(true);
  });

  it('lets two terms match two DIFFERENT fields', () => {
    // The search a reader with many teams actually runs. Requiring one field to hold both would
    // make it useless.
    expect(matchesSavedTeamSearch(zoroAndNami, 'zoro nami')).toBe(true);
  });

  it('still requires every term to match something', () => {
    expect(matchesSavedTeamSearch(zoroAndNami, 'zoro brook')).toBe(false);
  });

  it('ignores accents on both sides', () => {
    expect(matchesSavedTeamSearch(card({ name: 'Ομάδα Α' }), 'ομαδα')).toBe(true);
  });

  it('does not match an unrelated term', () => {
    expect(matchesSavedTeamSearch(zoroAndNami, 'kaido')).toBe(false);
  });
});

describe('filterSavedTeamCardsBySearch', () => {
  it('keeps only matching cards', () => {
    const cards = [
      card({ name: 'Alpha', captainName: 'Luffy' }),
      card({ name: 'Beta', captainName: 'Zoro' }),
    ];

    expect(filterSavedTeamCardsBySearch(cards, 'luffy').map((entry) => entry.name)).toEqual([
      'Alpha',
    ]);
  });

  it('returns a copy, so the caller cannot reorder the source list', () => {
    const cards = [card({ name: 'Alpha' })];

    expect(filterSavedTeamCardsBySearch(cards, '')).not.toBe(cards);
  });
});

describe('sortSavedTeamCards', () => {
  const a = card({ name: 'Alpha', captainName: 'Zoro', updatedAt: '2026-03-01T00:00:00.000Z' });
  const b = card({ name: 'beta', captainName: 'Luffy', updatedAt: '2026-01-01T00:00:00.000Z' });
  const c = card({ name: 'Gamma', captainName: 'Nami', updatedAt: '2026-02-01T00:00:00.000Z' });

  it('orders by name, case-insensitively', () => {
    expect(sortSavedTeamCards([c, a, b], 'name', 'asc').map((entry) => entry.name)).toEqual([
      'Alpha',
      'beta',
      'Gamma',
    ]);
  });

  it('orders Greek names as a reader would call alphabetical', () => {
    // `Ω` precedes `α` by code point, so a `<` comparison gets this wrong.
    const greek = [card({ name: 'Ωμέγα' }), card({ name: 'Άλφα' })];

    expect(sortSavedTeamCards(greek, 'name', 'asc').map((entry) => entry.name)).toEqual([
      'Άλφα',
      'Ωμέγα',
    ]);
  });

  it('orders by captain', () => {
    expect(sortSavedTeamCards([a, b, c], 'captain', 'asc').map((entry) => entry.captainName)).toEqual(
      ['Luffy', 'Nami', 'Zoro'],
    );
  });

  it('orders newest first when updatedAt runs descending', () => {
    expect(sortSavedTeamCards([b, a, c], 'updatedAt', 'desc').map((entry) => entry.name)).toEqual([
      'Alpha',
      'Gamma',
      'beta',
    ]);
  });

  it('flips with the direction', () => {
    expect(sortSavedTeamCards([b, a, c], 'updatedAt', 'asc').map((entry) => entry.name)).toEqual([
      'beta',
      'Gamma',
      'Alpha',
    ]);
  });

  it('breaks a tie on the name, so a re-render cannot reorder two equal teams', () => {
    const sameSecond = [
      card({ name: 'Zulu', updatedAt: '2026-01-01T00:00:00.000Z' }),
      card({ name: 'Alpha', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ];

    expect(sortSavedTeamCards(sameSecond, 'updatedAt', 'desc').map((entry) => entry.name)).toEqual([
      'Alpha',
      'Zulu',
    ]);
    expect(sortSavedTeamCards([...sameSecond].reverse(), 'updatedAt', 'desc').map((e) => e.name)).toEqual(
      ['Alpha', 'Zulu'],
    );
  });

  it('sorts an unparseable timestamp last in BOTH directions', () => {
    // A team with broken metadata is not the newest team, so flipping the order must not promote it.
    const broken = card({ name: 'Broken', updatedAt: 'not-a-date' });
    const good = card({ name: 'Good', updatedAt: '2026-01-01T00:00:00.000Z' });

    expect(sortSavedTeamCards([broken, good], 'updatedAt', 'desc').map((e) => e.name)).toEqual([
      'Good',
      'Broken',
    ]);
    expect(sortSavedTeamCards([broken, good], 'updatedAt', 'asc').map((e) => e.name)).toEqual([
      'Good',
      'Broken',
    ]);
  });

  it('leaves the stored order alone under the default key, in both directions', () => {
    const stored = [c, a, b];

    expect(sortSavedTeamCards(stored, 'default', 'desc').map((entry) => entry.name)).toEqual([
      'Gamma',
      'Alpha',
      'beta',
    ]);
    expect(sortSavedTeamCards(stored, 'default', 'asc').map((entry) => entry.name)).toEqual([
      'Gamma',
      'Alpha',
      'beta',
    ]);
  });

  it('does not sort in place', () => {
    const cards = [a, b];
    const sorted = sortSavedTeamCards(cards, 'name', 'asc');

    expect(sorted).not.toBe(cards);
    expect(cards[0]).toBe(a);
  });
});

describe('defaultSavedTeamSortDirection', () => {
  it('starts a date sort newest-first', () => {
    expect(defaultSavedTeamSortDirection('updatedAt')).toBe('desc');
    expect(defaultSavedTeamSortDirection('createdAt')).toBe('desc');
  });

  it('starts a text sort A-Z, because Z-A reads as a bug rather than a default', () => {
    expect(defaultSavedTeamSortDirection('name')).toBe('asc');
    expect(defaultSavedTeamSortDirection('captain')).toBe('asc');
  });
});

describe('stored value guards', () => {
  it('accepts the four sort keys and rejects anything else', () => {
    expect(isSavedTeamSortKey('default')).toBe(true);
    expect(isSavedTeamSortKey('name')).toBe(true);
    expect(isSavedTeamSortKey('captain')).toBe(true);
    expect(isSavedTeamSortKey('createdAt')).toBe(true);
    expect(isSavedTeamSortKey('updatedAt')).toBe(true);
    expect(isSavedTeamSortKey('shipId')).toBe(false);
    expect(isSavedTeamSortKey(null)).toBe(false);
  });

  it('accepts only the two directions', () => {
    expect(isSavedTeamSortDirection('asc')).toBe(true);
    expect(isSavedTeamSortDirection('desc')).toBe(true);
    expect(isSavedTeamSortDirection('ascending')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  isLeaderSlotIndex,
  isSubSlotIndex,
  maySlotHoldCharacter,
  resolveCharacterPartyConflictKeys,
  resolveOccupiedPartyConflictKeys,
  TEAM_CAPTAIN_SLOT_INDEX,
  TEAM_FIRST_SUB_SLOT_INDEX,
  TEAM_FRIEND_CAPTAIN_SLOT_INDEX,
} from './character-party-conflict-keys.utils';

/*
 * 869f127ej. The rule is owner-confirmed (2026-09-03) and absolute: the two leader seats are exempt
 * from the name-derived conflict rule, the four subs are not. It was applied per call site until
 * now, and `captain-coverage` was the outlier until 869eum54p - which is the failure mode of a rule
 * with no single owner.
 *
 * These drive the predicate itself. The per-page proof that each team-assembling page routes
 * through it lives in each page's own spec.
 */

/*
 * `detail` is deliberately omitted: `PartyConflictCharacter` makes it optional, and the resolver
 * falls back to name-derived keys without it - which is the path every one of these cases takes.
 * Supplying a half-built `detail` would not type-check, and building a whole `CharacterDetail` here
 * would add 20 fields none of these assertions read.
 */
function character(id: number, name: string) {
  return { id, name };
}

const LUFFY = character(1, 'Monkey D. Luffy');
const OTHER_LUFFY = character(2, 'Monkey D. Luffy - Gear 2');
const ZORO = character(3, 'Roronoa Zoro');
const NAMI = character(4, 'Nami');

describe('slot index helpers', () => {
  it('names the two leader seats and nothing else', () => {
    expect(isLeaderSlotIndex(TEAM_CAPTAIN_SLOT_INDEX)).toBe(true);
    expect(isLeaderSlotIndex(TEAM_FRIEND_CAPTAIN_SLOT_INDEX)).toBe(true);
    expect(isLeaderSlotIndex(TEAM_FIRST_SUB_SLOT_INDEX)).toBe(false);
    expect(isLeaderSlotIndex(5)).toBe(false);
  });

  it('names the four sub seats', () => {
    expect(isSubSlotIndex(2)).toBe(true);
    expect(isSubSlotIndex(5)).toBe(true);
    expect(isSubSlotIndex(1)).toBe(false);
    expect(isSubSlotIndex(1.5)).toBe(false);
  });
});

describe('maySlotHoldCharacter - the leader seats', () => {
  it('lets the SAME character hold both leader seats', () => {
    // The rule players get wrong and the app must not: the Friend Captain is borrowed from another
    // crew, so it is never constrained by your own.
    const slots = [LUFFY, null, null, null, null, null];

    expect(maySlotHoldCharacter(slots, TEAM_FRIEND_CAPTAIN_SLOT_INDEX, LUFFY)).toBe(true);
  });

  it('lets two cards of the same character hold the two leader seats', () => {
    const slots = [LUFFY, null, null, null, null, null];

    expect(maySlotHoldCharacter(slots, TEAM_FRIEND_CAPTAIN_SLOT_INDEX, OTHER_LUFFY)).toBe(true);
  });

  it('never blocks a Captain, whatever the subs already hold', () => {
    const slots = [null, null, LUFFY, ZORO, NAMI, null];

    expect(maySlotHoldCharacter(slots, TEAM_CAPTAIN_SLOT_INDEX, LUFFY)).toBe(true);
  });

  it('never blocks a Friend Captain, whatever the subs already hold', () => {
    const slots = [null, null, LUFFY, ZORO, NAMI, null];

    expect(maySlotHoldCharacter(slots, TEAM_FRIEND_CAPTAIN_SLOT_INDEX, LUFFY)).toBe(true);
  });

  it('exempts the leader seat BEFORE resolving any key', () => {
    /*
     * The ordering is the behaviour. A character with no name resolves to no keys at all, and a
     * leader seat must be allowed without that ever mattering - which is what stops the exemption
     * being lost behind a later condition, as it was on one page before.
     */
    const nameless = character(9, '');

    expect(resolveCharacterPartyConflictKeys(nameless)).toEqual([]);
    expect(maySlotHoldCharacter([nameless, null, null, null, null, null], 0, nameless)).toBe(true);
  });
});

describe('maySlotHoldCharacter - the four sub slots', () => {
  it('keeps the name-derived rule for subs', () => {
    const slots = [null, null, LUFFY, null, null, null];

    expect(maySlotHoldCharacter(slots, 3, OTHER_LUFFY)).toBe(false);
  });

  it('blocks a sub that repeats the CAPTAIN', () => {
    const slots = [LUFFY, null, null, null, null, null];

    expect(maySlotHoldCharacter(slots, 2, OTHER_LUFFY)).toBe(false);
  });

  it('does NOT block a sub that repeats the Friend Captain', () => {
    // The borrowed seat constrains nothing on your side - the other half of the same rule.
    const slots = [null, LUFFY, null, null, null, null];

    expect(maySlotHoldCharacter(slots, 2, OTHER_LUFFY)).toBe(true);
  });

  it('lets a character stay in the seat it already holds', () => {
    const slots = [null, null, LUFFY, null, null, null];

    expect(maySlotHoldCharacter(slots, 2, LUFFY)).toBe(true);
  });

  it('allows an unrelated character', () => {
    const slots = [LUFFY, null, ZORO, null, null, null];

    expect(maySlotHoldCharacter(slots, 3, NAMI)).toBe(true);
  });

  it('treats an empty candidate as allowed, so clearing a seat is never refused', () => {
    expect(maySlotHoldCharacter([LUFFY, null, null, null, null, null], 2, null)).toBe(true);
  });
});

describe('resolveOccupiedPartyConflictKeys', () => {
  it('never contributes the Friend Captain seat', () => {
    const keys = resolveOccupiedPartyConflictKeys([null, LUFFY, null, null, null, null], 5);

    expect(keys.size).toBe(0);
  });

  it('contributes the Captain seat', () => {
    const keys = resolveOccupiedPartyConflictKeys([LUFFY, null, null, null, null, null], 5);

    expect(keys.size).toBeGreaterThan(0);
  });

  it('never contributes the slot being filled', () => {
    const keys = resolveOccupiedPartyConflictKeys([null, null, LUFFY, null, null, null], 2);

    expect(keys.size).toBe(0);
  });

  it('contributes every other sub', () => {
    const keys = resolveOccupiedPartyConflictKeys([null, null, LUFFY, ZORO, null, null], 4);

    expect(keys.has('luffy')).toBe(true);
    expect(keys.has('zoro')).toBe(true);
  });

  it('ignores empty seats', () => {
    expect(resolveOccupiedPartyConflictKeys([null, null, null, null, null, null], 2).size).toBe(0);
  });
});

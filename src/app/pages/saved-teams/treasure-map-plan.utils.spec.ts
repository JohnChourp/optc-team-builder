import { describe, expect, it } from 'vitest';

import {
  TREASURE_MAP_FRIEND_CAPTAIN_SLOT_INDEX,
  checkTreasureMapPlan,
  groupTreasureMapConflictsByTeam,
  type TreasureMapPlanTeam,
} from './treasure-map-plan.utils';

/*
 * 869f63gy7. The Treasure Map plan check: five teams plus an Ambush team from one box, each unit
 * used once except in a Friend Captain seat and in the Ambush team. Every exemption below is
 * pinned WITH its control - the same seat or team without the exemption is reported - so a check
 * that reported nothing at all could not pass this file.
 */

function team(id: string, slots: Array<number | null>): TreasureMapPlanTeam {
  return { id, slots };
}

/** Six teams with no unit in common: team N holds N01..N06. */
function disjointPlan(): TreasureMapPlanTeam[] {
  return ['t1', 't2', 't3', 't4', 't5', 'ambush'].map((id, teamIndex) =>
    team(id, [1, 2, 3, 4, 5, 6].map((seat) => (teamIndex + 1) * 100 + seat)),
  );
}

/** The ids the check reports as repeated, in its order. */
function repeatedIds(plan: TreasureMapPlanTeam[], ambushTeamId: string | null = null): number[] {
  return checkTreasureMapPlan(plan, ambushTeamId).repeatedUnits.map((unit) => unit.characterId);
}

/** The disjoint plan with one seat of one team replaced. */
function withSeat(
  plan: TreasureMapPlanTeam[],
  teamId: string,
  slotIndex: number,
  characterId: number | null,
): TreasureMapPlanTeam[] {
  return plan.map((entry) =>
    entry.id === teamId
      ? team(
          entry.id,
          entry.slots.map((slot, index) => (index === slotIndex ? characterId : slot)),
        )
      : entry,
  );
}

describe('checkTreasureMapPlan (869f63gy7)', () => {
  it('reports nothing for a plan whose units are all different', () => {
    expect(checkTreasureMapPlan(disjointPlan(), null)).toEqual({
      ambushTeamId: null,
      repeatedUnits: [],
    });
  });

  it('reports a unit two teams share, with every use in plan order', () => {
    const plan = withSeat(withSeat(disjointPlan(), 't1', 3, 777), 't4', 5, 777);

    expect(checkTreasureMapPlan(plan, null).repeatedUnits).toEqual([
      {
        characterId: 777,
        uses: [
          { teamId: 't1', slotIndex: 3 },
          { teamId: 't4', slotIndex: 5 },
        ],
      },
    ]);
  });

  it('never counts a Friend Captain seat, whoever else fields that unit', () => {
    expect(TREASURE_MAP_FRIEND_CAPTAIN_SLOT_INDEX).toBe(1);

    // Borrowed in t1's Friend Captain seat, owned as a crew member of t2.
    const friendAndCrew = withSeat(withSeat(disjointPlan(), 't1', 1, 900), 't2', 3, 900);
    // The same unit borrowed as Friend Captain by two teams.
    const twoFriends = withSeat(withSeat(disjointPlan(), 't1', 1, 900), 't2', 1, 900);
    // Captain of t1 and Friend Captain of t2 - the same character in both leader seats is legal.
    const captainAndFriend = withSeat(withSeat(disjointPlan(), 't1', 0, 900), 't2', 1, 900);

    expect(checkTreasureMapPlan(friendAndCrew, null).repeatedUnits).toEqual([]);
    expect(checkTreasureMapPlan(twoFriends, null).repeatedUnits).toEqual([]);
    expect(checkTreasureMapPlan(captainAndFriend, null).repeatedUnits).toEqual([]);
  });

  it('counts the Captain seat and every crew seat: only the Friend Captain seat is exempt', () => {
    for (const slotIndex of [0, 2, 3, 4, 5]) {
      const plan = withSeat(withSeat(disjointPlan(), 't1', slotIndex, 900), 't2', 4, 900);

      expect(checkTreasureMapPlan(plan, null).repeatedUnits, `seat ${slotIndex}`).toEqual([
        {
          characterId: 900,
          uses: [
            { teamId: 't1', slotIndex },
            { teamId: 't2', slotIndex: 4 },
          ],
        },
      ]);
    }
  });

  it('never counts the Ambush team, which may reuse any unit', () => {
    // The Ambush team fields three units other teams use: as its Captain, and as two crew members.
    const plan = withSeat(
      withSeat(withSeat(disjointPlan(), 'ambush', 0, 101), 'ambush', 2, 203),
      'ambush',
      5,
      504,
    );

    expect(checkTreasureMapPlan(plan, 'ambush')).toEqual({
      ambushTeamId: 'ambush',
      repeatedUnits: [],
    });
    // The control: the same six teams with no Ambush team marked.
    expect(repeatedIds(plan)).toEqual([101, 203, 504]);
  });

  it('exempts only the team marked Ambush, so two other teams sharing a unit still show', () => {
    const plan = withSeat(
      withSeat(withSeat(disjointPlan(), 't2', 3, 555), 't5', 2, 555),
      'ambush',
      4,
      555,
    );

    expect(checkTreasureMapPlan(plan, 'ambush').repeatedUnits).toEqual([
      {
        characterId: 555,
        uses: [
          { teamId: 't2', slotIndex: 3 },
          { teamId: 't5', slotIndex: 2 },
        ],
      },
    ]);
  });

  it('ignores an Ambush mark on a team that is not in the plan', () => {
    const plan = withSeat(withSeat(disjointPlan(), 't1', 2, 555), 't2', 2, 555);
    const check = checkTreasureMapPlan(plan, 'not-selected');

    expect(check.ambushTeamId).toBeNull();
    expect(repeatedIds(plan, 'not-selected')).toEqual([555]);
  });

  it('checks by character id: two cards of one character are two units', () => {
    // Two Blackbeard cards, as a box can hold both at once.
    const twoCards = withSeat(withSeat(disjointPlan(), 't1', 2, 2963), 't2', 2, 2964);
    const oneCardTwice = withSeat(withSeat(disjointPlan(), 't1', 2, 2964), 't2', 2, 2964);

    expect(repeatedIds(twoCards)).toEqual([]);
    expect(repeatedIds(oneCardTwice)).toEqual([2964]);
  });

  it('reports a unit one team fields twice, since that is two uses from one box too', () => {
    const plan = withSeat(withSeat(disjointPlan(), 't3', 0, 42), 't3', 4, 42);

    expect(checkTreasureMapPlan(plan, null).repeatedUnits).toEqual([
      {
        characterId: 42,
        uses: [
          { teamId: 't3', slotIndex: 0 },
          { teamId: 't3', slotIndex: 4 },
        ],
      },
    ]);
  });

  it('skips empty seats', () => {
    const plan = [
      team('t1', [101, null, null, 104, null, null]),
      team('t2', [201, null, null, 204, null, null]),
    ];

    expect(checkTreasureMapPlan(plan, null).repeatedUnits).toEqual([]);
  });

  it('checks any number of teams rather than refusing a plan that is not six', () => {
    const eight = [
      ...disjointPlan(),
      team('t7', [701, 702, 703, 704, 705, 706]),
      team('t8', [801, 802, 803, 804, 805, 101]),
    ];

    expect(repeatedIds(eight)).toEqual([101]);
    expect(repeatedIds([team('solo', [1, 2, 3, 4, 5, 6])])).toEqual([]);
    expect(checkTreasureMapPlan([], 'ambush')).toEqual({ ambushTeamId: null, repeatedUnits: [] });
  });

  it('lists repeated units in order of first appearance', () => {
    const plan = [
      team('t1', [1, null, 300, 200, null, null]),
      team('t2', [200, null, null, null, null, 300]),
    ];

    expect(repeatedIds(plan)).toEqual([300, 200]);
  });
});

describe('groupTreasureMapConflictsByTeam (869f63gy7)', () => {
  it('names, next to each team, the unit it shares and every other team sharing it, once', () => {
    const plan = [
      team('t1', [10, 99, 20, 30, null, null]),
      team('t2', [30, 99, 10, null, null, null]),
      team('t3', [null, null, 10, 10, null, null]),
      team('t4', [40, null, 41, 42, 43, 44]),
    ];

    expect(groupTreasureMapConflictsByTeam(checkTreasureMapPlan(plan, null))).toEqual(
      new Map([
        [
          't1',
          [
            { characterId: 10, otherTeamIds: ['t2', 't3'], usesInTeam: 1 },
            { characterId: 30, otherTeamIds: ['t2'], usesInTeam: 1 },
          ],
        ],
        [
          // Ordered by t2's own seats: its Captain first, although 10 was the first repeat found.
          't2',
          [
            { characterId: 30, otherTeamIds: ['t1'], usesInTeam: 1 },
            { characterId: 10, otherTeamIds: ['t1', 't3'], usesInTeam: 1 },
          ],
        ],
        ['t3', [{ characterId: 10, otherTeamIds: ['t1', 't2'], usesInTeam: 2 }]],
      ]),
    );
  });

  it('names no other team for a unit only one team repeats', () => {
    const plan = withSeat(withSeat(disjointPlan(), 't3', 0, 42), 't3', 4, 42);

    expect(groupTreasureMapConflictsByTeam(checkTreasureMapPlan(plan, null))).toEqual(
      new Map([['t3', [{ characterId: 42, otherTeamIds: [], usesInTeam: 2 }]]]),
    );
  });

  it('gives the Ambush team and every team without a repeat no entry at all', () => {
    const plan = withSeat(
      withSeat(withSeat(disjointPlan(), 't1', 2, 555), 't2', 5, 555),
      'ambush',
      3,
      555,
    );
    const grouped = groupTreasureMapConflictsByTeam(checkTreasureMapPlan(plan, 'ambush'));

    expect([...grouped.keys()]).toEqual(['t1', 't2']);
    expect(grouped.get('t1')).toEqual([{ characterId: 555, otherTeamIds: ['t2'], usesInTeam: 1 }]);
  });
});

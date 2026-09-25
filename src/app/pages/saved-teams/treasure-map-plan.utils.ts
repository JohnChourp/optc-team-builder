/**
 * 869f63gy7. Checks the teams selected on Saved Teams as one Treasure Map plan.
 *
 * A Treasure Map run takes five teams plus an Ambush team from ONE box, and each unit can be used
 * once - except in a Friend Captain seat, which is borrowed from another player, and in the Ambush
 * team. That is the community's rule, as the lukforce TM planner states it: units cannot be used
 * more than once, except in the Friend Captain slot or the Ambush Team (Team 6).
 *
 * This reports every unit a plan uses more than once. It is a check, never a gate: a conflict is
 * marked and nothing is refused - not a repeat, not a plan of four teams or of eight. Nothing is
 * stored either: the plan is simply the teams selected right now.
 *
 * By CHARACTER ID, not by the same-character rule. A box holds specific cards, and two different
 * cards of one character are two units a player can own at once - so the name-derived conflict keys
 * the builders apply inside ONE crew are the wrong tool across crews.
 *
 * It assumes one copy of each unit. A player who owns two of a card can field it twice, and the app
 * holds no count of copies to know that, so the screen says so rather than the check guessing.
 */

/** Seat 2 is the Friend Captain: borrowed, so never counted against the player's own box. */
export const TREASURE_MAP_FRIEND_CAPTAIN_SLOT_INDEX = 1;

/** One team of the plan, as its ordered slots of character ids. */
export interface TreasureMapPlanTeam {
  id: string;
  slots: ReadonlyArray<number | null>;
}

/** One place a unit is fielded: which team, and which of its seats. */
export interface TreasureMapUnitUse {
  teamId: string;
  slotIndex: number;
}

/** A unit the plan fields more than once, with every counted use in plan order. */
export interface TreasureMapRepeatedUnit {
  characterId: number;
  uses: TreasureMapUnitUse[];
}

export interface TreasureMapPlanCheck {
  /**
   * The Ambush team the check actually applied: `null` when none was marked, or when the mark
   * names a team that is not in the plan - a mark on a team nobody selected exempts nothing.
   */
  ambushTeamId: string | null;
  /** In order of first appearance, so the list reads in the same order as the teams. */
  repeatedUnits: TreasureMapRepeatedUnit[];
}

/** One repeated unit as the team that holds it sees it. */
export interface TreasureMapTeamConflict {
  characterId: number;
  /** The OTHER teams fielding the same unit, each named once, in plan order. */
  otherTeamIds: string[];
  /** How often THIS team fields it. Two or more means the team repeats it on its own. */
  usesInTeam: number;
}

export function checkTreasureMapPlan(
  teams: readonly TreasureMapPlanTeam[],
  ambushTeamId: string | null,
): TreasureMapPlanCheck {
  const appliedAmbushTeamId = teams.some((team) => team.id === ambushTeamId)
    ? ambushTeamId
    : null;
  const usesByCharacter = new Map<number, TreasureMapUnitUse[]>();

  for (const team of teams) {
    // The Ambush team may reuse any unit, so none of its seats is counted.
    if (team.id === appliedAmbushTeamId) {
      continue;
    }

    team.slots.forEach((characterId, slotIndex) => {
      if (
        slotIndex === TREASURE_MAP_FRIEND_CAPTAIN_SLOT_INDEX ||
        typeof characterId !== 'number'
      ) {
        return;
      }

      const uses = usesByCharacter.get(characterId) ?? [];

      uses.push({ teamId: team.id, slotIndex });
      usesByCharacter.set(characterId, uses);
    });
  }

  return {
    ambushTeamId: appliedAmbushTeamId,
    repeatedUnits: [...usesByCharacter]
      .filter(([, uses]) => uses.length > 1)
      .map(([characterId, uses]) => ({ characterId, uses })),
  };
}

/**
 * The same finding turned around, so it can be shown next to each team: for every team that holds
 * a repeated unit, which unit and which other teams share it. Ordered by the team's own seats, so
 * a team reads Captain first. A team with no repeated unit has no entry.
 */
export function groupTreasureMapConflictsByTeam(
  check: TreasureMapPlanCheck,
): Map<string, TreasureMapTeamConflict[]> {
  const byTeam = new Map<string, Array<TreasureMapTeamConflict & { firstSlotIndex: number }>>();

  for (const unit of check.repeatedUnits) {
    const teamIds = [...new Set(unit.uses.map((use) => use.teamId))];

    for (const teamId of teamIds) {
      const ownUses = unit.uses.filter((use) => use.teamId === teamId);
      const conflicts = byTeam.get(teamId) ?? [];

      conflicts.push({
        characterId: unit.characterId,
        otherTeamIds: teamIds.filter((otherTeamId) => otherTeamId !== teamId),
        usesInTeam: ownUses.length,
        firstSlotIndex: Math.min(...ownUses.map((use) => use.slotIndex)),
      });
      byTeam.set(teamId, conflicts);
    }
  }

  return new Map(
    [...byTeam].map(([teamId, conflicts]) => [
      teamId,
      conflicts
        .sort((left, right) => left.firstSlotIndex - right.firstSlotIndex)
        .map(({ characterId, otherTeamIds, usesInTeam }) => ({
          characterId,
          otherTeamIds,
          usesInTeam,
        })),
    ]),
  );
}

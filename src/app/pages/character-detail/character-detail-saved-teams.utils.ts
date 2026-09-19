import type { SavedTeam } from '../../core/models/optc.models';

/**
 * 869f13c8r. How many of the reader's own saved teams use this character, for Character Detail.
 *
 * It counts teams, not slots. The same character may be both Captain and Friend Captain (CLAUDE.md),
 * and a team that does so still counts once. An empty seat is `null` and matches nothing. Only the
 * quest teams in `savedTeams` are read; Rumble teams have their own model.
 *
 * The number is shown, never used: nothing is ranked or reordered by it, following wave 3's rule
 * against ordering a list by an inferred signal.
 */
export function countSavedTeamsWithCharacter(
  teams: readonly Pick<SavedTeam, 'slots'>[],
  characterId: number,
): number {
  return teams.filter((team) => team.slots.includes(characterId)).length;
}

/**
 * An opponent crew a reader saved to face again.
 *
 * 869f12x45. The premise this task arrived with was that "the opponent is
 * re-entered every time". That is not quite right, and the difference decides
 * the design: `SavedRumbleTeam` already carries
 * `opponentActiveCharacterIds`, `opponentBenchCharacterIds` and
 * `opponentAwarenessEnabled`, and `loadSavedRumbleTeam` restores all three. An
 * opponent IS persisted - but only welded to one saved team.
 *
 * So the gap is narrower than "Rumble has no Saved Enemies": you cannot save an
 * opponent ON ITS OWN, and you cannot load one into a fresh build. Players face
 * the same opponents repeatedly across a Rumble season, which is what makes
 * that re-typing deliberate rather than incidental.
 *
 * Deliberately NOT a copy of `SavedRumbleTeam`. It stores the two things that
 * identify an opponent crew and nothing else - no settings, no results, no
 * awareness flag. Awareness is a choice about the build you are running now,
 * not a property of the crew you are facing.
 */
export interface SavedRumbleOpponent {
  id: string;
  name: string;
  /** Active slots, in order. `null` is an empty slot the reader left open. */
  activeCharacterIds: Array<number | null>;
  /** Bench slots, in order. */
  benchCharacterIds: Array<number | null>;
  createdAt: string;
  updatedAt: string;
}

/** The count a reader would call "the opponents I entered", ignoring empty slots. */
export function countSavedRumbleOpponentSlots(opponent: SavedRumbleOpponent): number {
  return [...opponent.activeCharacterIds, ...opponent.benchCharacterIds].filter(
    (characterId): characterId is number => typeof characterId === 'number',
  ).length;
}

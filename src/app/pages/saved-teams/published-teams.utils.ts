import {
  PUBLISHED_TEAMS,
  type PublishedTeam,
} from '../../core/data/published-teams.data';
import { type CharacterListItem, type SavedTeam } from '../../core/models/optc.models';

/**
 * 869f1pu2u. Reading the shipped published teams, and turning one into a saved team.
 *
 * The half of 869f12xc8 that needs no backend. Nothing is submitted here, so there is nothing to
 * moderate and nothing stored on anyone's behalf - the set ships in the bundle and is read-only.
 * The full shared layer stays the owner's decision.
 *
 * Every entry is a **worked example composed from the shipped dataset**, never a player's
 * submission and never a claimed clear; `scripts/check-published-teams.mjs` fails the build if an
 * entry stops saying so.
 */
export interface PublishedTeamCard {
  readonly team: PublishedTeam;
  /** Slot order, with the characters resolved. `null` for an empty seat. */
  readonly members: readonly (CharacterListItem | null)[];
  /** True when every non-empty slot resolved, so importing gives the team as published. */
  readonly complete: boolean;
}

/** Every character id the set needs, deduplicated. */
export function publishedTeamCharacterIds(
  teams: readonly PublishedTeam[] = PUBLISHED_TEAMS,
): number[] {
  return [
    ...new Set(
      teams.flatMap((team) => team.slots.filter((slot): slot is number => typeof slot === 'number')),
    ),
  ];
}

export function buildPublishedTeamCards(
  charactersById: ReadonlyMap<number, CharacterListItem>,
  teams: readonly PublishedTeam[] = PUBLISHED_TEAMS,
): PublishedTeamCard[] {
  return teams.map((team) => {
    const members = team.slots.map((slot) =>
      typeof slot === 'number' ? (charactersById.get(slot) ?? null) : null,
    );
    const complete = team.slots.every(
      (slot, index) => typeof slot !== 'number' || members[index] !== null,
    );

    return { team, members, complete };
  });
}

/**
 * The saved team an import would create.
 *
 * The notes field carries the provenance, because once a team is in Saved Teams it is
 * indistinguishable from one the reader built - and a worked example that loses the sentence
 * saying it is one becomes a claim nobody made.
 */
export function buildSavedTeamFromPublished(
  team: PublishedTeam,
  provenanceNote: string,
): Omit<SavedTeam, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: team.stage,
    slots: [...team.slots],
    shipId: null,
    notes: provenanceNote,
  };
}

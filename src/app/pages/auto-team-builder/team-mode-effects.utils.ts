import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import {
  detectCharacterModeEffects,
  type CharacterModeEffect,
  type GameMode,
} from '../../core/services/character-mode-effects.utils';

/**
 * 869f1mcdv. Which members of the built team do something different in the chosen mode.
 *
 * The honest boundary, and the card must repeat it: **this does not change what the search
 * picks.** 869f12xa5 asked for an objective the search takes as input, and the feasibility gate
 * closed on the half that needed event boost data - there is none in the dataset, so boost
 * weighting stays a hand-entered list and the owner's call. What this does is tell the reader
 * which of the units the builder already chose happen to care about the mode they are about to
 * play, which is a fact nothing in the app was reporting.
 *
 * Every member is listed, including the ones with no mode effect. A list of only the units that
 * matter reads as "these are your mode picks" - which would imply the builder chose them for the
 * mode, and it did not.
 */
export interface TeamModeEffectMember {
  readonly characterId: number;
  readonly characterName: string;
  readonly role: AutoBuildResult['slots'][number]['role'];
  readonly effect: CharacterModeEffect | null;
}

export interface TeamModeEffects {
  readonly mode: GameMode;
  readonly members: readonly TeamModeEffectMember[];
  /** How many of them behave differently in this mode. */
  readonly affectedCount: number;
}

export function buildTeamModeEffects(
  result: AutoBuildResult | null,
  mode: GameMode | null,
): TeamModeEffects | null {
  if (!result || !mode) {
    return null;
  }

  const members = result.slots.map((slot) => ({
    characterId: slot.character.id,
    characterName: slot.character.name,
    role: slot.role,
    effect:
      detectCharacterModeEffects(slot.character.detail?.specialText).find(
        (candidate) => candidate.mode === mode,
      ) ?? null,
  }));

  return {
    mode,
    members,
    affectedCount: members.filter((member) => member.effect !== null).length,
  };
}

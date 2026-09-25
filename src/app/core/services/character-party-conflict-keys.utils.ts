import conflictOverrideCatalog from '../data/auto-team-builder-party-conflict-overrides.json';
import {
  readPartyConflictOverrides,
  resolveNamePartyConflictKeys,
  resolveSameCharacterKeys,
} from '../grammar/same-character-keys';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';

export { normalizePartyConflictKey } from '../grammar/same-character-keys';

/**
 * The duplicate-character rule, and the name keys it falls back to.
 *
 * Lives apart from auto-team-builder.utils so a page that needs only the rule - Manual Team
 * Builder - does not pull the builder engine's shared chunk into its route for one function.
 * auto-team-builder.utils re-exports resolveCharacterPartyConflictKeys, so its importers are
 * unchanged.
 *
 * 869f63grj. The rule itself lives in `../grammar/same-character-keys.ts`, where the build-time
 * check of the published teams reads it too. This file binds it to the app's copy of the override
 * file, and offers it two ways:
 *
 *  - `resolveCharacterSameCharacterKeys` - whether two cards are the same in-game character:
 *    upstream's families first, the name keys only for a unit upstream names no family for. Every
 *    duplicate check asks this one, through `maySlotHoldCharacter` wherever it can.
 *  - `resolveCharacterPartyConflictKeys` - the name keys alone. The Auto Team Builder's
 *    super-criteria and name matching read these. They stopped being the duplicate rule in
 *    869f63grj, because a name's last word made `Pica: Neo` the same character as every other
 *    `: Neo` card while `Lucy` was never Luffy.
 */

type PartyConflictCharacter = Pick<CharacterListItem, 'id' | 'name' | 'families'> &
  Partial<Pick<CharacterDetailRecord, 'detail'>>;

const PARTY_CONFLICT_KEY_OVERRIDES = readPartyConflictOverrides(conflictOverrideCatalog);

export function resolveCharacterPartyConflictKeys(character: PartyConflictCharacter): string[] {
  return resolveNamePartyConflictKeys(character, PARTY_CONFLICT_KEY_OVERRIDES);
}

export function resolveCharacterSameCharacterKeys(character: PartyConflictCharacter): string[] {
  return resolveSameCharacterKeys(character, PARTY_CONFLICT_KEY_OVERRIDES);
}

/*
 * 869f127ej. The leader-seat exemption, in ONE place.
 *
 * The rule is owner-confirmed and absolute: slot 0 (Captain) and slot 1 (Friend Captain) are exempt
 * from the same-character rule; the four sub slots are not. In the game the Friend Captain is
 * borrowed from another player's crew, so it is never constrained by what is already in yours - the
 * same character may hold both leader seats, and two cards of the same character may hold them.
 *
 * `resolveCharacterSameCharacterKeys` always gives a character its own keys - its families, or its
 * name - so a character conflicts with ITSELF. That is correct for the four subs and wrong for the
 * two leaders, which is why applying it uniformly is a defect rather than a simplification.
 *
 * Before this, the exemption was written out per call site: Captain Coverage filtered the Friend
 * Captain out of its key set, the Manual Team Builder returned early below the first sub index, and
 * the Auto Team Builder engine had its own. `captain-coverage` was the outlier until 869eum54p -
 * which is precisely the failure mode of a rule with no single owner, and a new page that assembles
 * a team inherited nothing.
 *
 * Ask `maySlotHoldCharacter` instead of reaching for the raw keys. A page that reaches for them
 * directly is visible in a grep for `resolveCharacterSameCharacterKeys` outside this module.
 */

/** Slot 0. Exempt from the conflict rule. */
export const TEAM_CAPTAIN_SLOT_INDEX = 0;
/** Slot 1. Exempt, and it never contributes keys to anything either. */
export const TEAM_FRIEND_CAPTAIN_SLOT_INDEX = 1;
/** Slots 2..5. The only seats the same-character rule governs. */
export const TEAM_FIRST_SUB_SLOT_INDEX = 2;

export function isLeaderSlotIndex(slotIndex: number): boolean {
  return slotIndex === TEAM_CAPTAIN_SLOT_INDEX || slotIndex === TEAM_FRIEND_CAPTAIN_SLOT_INDEX;
}

export function isSubSlotIndex(slotIndex: number): boolean {
  return Number.isInteger(slotIndex) && slotIndex >= TEAM_FIRST_SUB_SLOT_INDEX;
}

/**
 * The conflict keys a candidate for `slotIndex` must not collide with.
 *
 * Two seats never contribute: the slot being filled (a character does not conflict with the seat it
 * is about to leave or re-take) and the Friend Captain (borrowed, so it constrains nothing). The
 * Captain DOES contribute, because a sub may not repeat the Captain.
 */
export function resolveOccupiedPartyConflictKeys(
  slots: ReadonlyArray<PartyConflictCharacter | null | undefined>,
  slotIndex: number,
): Set<string> {
  const keys = new Set<string>();

  slots.forEach((slot, index) => {
    if (!slot || index === slotIndex || index === TEAM_FRIEND_CAPTAIN_SLOT_INDEX) {
      return;
    }

    for (const key of resolveCharacterSameCharacterKeys(slot)) {
      keys.add(key);
    }
  });

  return keys;
}

/**
 * The one supported way to ask whether a slot may hold a character.
 *
 * A leader seat always may - unconditionally, before any key is even resolved. That ordering is the
 * point: it makes the exemption impossible to lose behind a later condition, which is how it went
 * missing on one page before.
 */
export function maySlotHoldCharacter(
  slots: ReadonlyArray<PartyConflictCharacter | null | undefined>,
  slotIndex: number,
  character: PartyConflictCharacter | null | undefined,
): boolean {
  if (!character) {
    return true;
  }

  if (isLeaderSlotIndex(slotIndex)) {
    return true;
  }

  const occupied = resolveOccupiedPartyConflictKeys(slots, slotIndex);

  return !resolveCharacterSameCharacterKeys(character).some((key) => occupied.has(key));
}

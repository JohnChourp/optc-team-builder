import {
  type CaptainCondition,
  type ConditionalBuilderAbility,
  type NormalizedBuilderAbility,
} from '../models/auto-team-builder-ability.models';
import { type AutoBuildSlot } from '../models/auto-team-builder.models';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';

/**
 * 869fhvfva. A special effect that holds only with a given captain lives in
 * `detail.conditionalBuilderAbilities`, outside `builderAbilities`. Where the whole crew is known
 * (Manual Team Builder, Saved Teams, the Auto Team Builder's result and compare views), it counts
 * when its condition is met by that crew; everywhere else it does not.
 *
 * Seats are the game's order: 0 Captain, 1 Friend Captain, 2-5 subs. A condition that asks for
 * more than a captain seat (`hasOtherRequirements`) is never met here, so a crew is never credited
 * with an effect it may not get - at worst it is not credited with one it does.
 */
export type CrewSeat = CharacterListItem | CharacterDetailRecord | null | undefined;

const CAPTAIN_SEAT = 0;
const FRIEND_CAPTAIN_SEAT = 1;

export function resolveCrewSeatAbilities(
  seats: readonly CrewSeat[],
  seatIndex: number,
): NormalizedBuilderAbility[] {
  const holder = seats[seatIndex];
  const detail = holder && 'detail' in holder ? holder.detail : null;

  if (!detail) {
    return [];
  }

  const metConditional = (detail.conditionalBuilderAbilities ?? []).filter((ability) =>
    isCaptainConditionMet(ability.captainCondition, seats, seatIndex),
  );

  return metConditional.length
    ? [...detail.builderAbilities, ...metConditional.map(withoutCaptainCondition)]
    : detail.builderAbilities;
}

/**
 * The same, for an Auto Team Builder result: its slots carry a role rather than a seat, and a
 * crew with no Friend Captain has no slot for it. Returns one list per slot, in slot order.
 */
export function resolveAutoBuildSlotAbilities(
  slots: readonly AutoBuildSlot[],
): NormalizedBuilderAbility[][] {
  const seats: CrewSeat[] = [
    slots.find((slot) => slot.role === 'captain')?.character,
    slots.find((slot) => slot.role === 'friendCaptain')?.character,
  ];
  const seatIndexes = slots.map((slot) => {
    if (slot.role === 'captain') {
      return 0;
    }

    if (slot.role === 'friendCaptain') {
      return 1;
    }

    seats.push(slot.character);

    return seats.length - 1;
  });

  return seatIndexes.map((seatIndex) => resolveCrewSeatAbilities(seats, seatIndex));
}

export function isCaptainConditionMet(
  condition: CaptainCondition | null | undefined,
  seats: readonly CrewSeat[],
  seatIndex: number,
): boolean {
  if (!condition || condition.hasOtherRequirements) {
    return false;
  }

  const captainSeats = condition.friendCaptain
    ? [CAPTAIN_SEAT, FRIEND_CAPTAIN_SEAT]
    : [CAPTAIN_SEAT];
  const captains = captainSeats
    .map((index) => seats[index])
    .filter((seat): seat is CharacterListItem => Boolean(seat));

  if (condition.captain === 'self' && captainSeats.includes(seatIndex) && seats[seatIndex]) {
    return true;
  }

  if (condition.captain === 'named' && captains.some((captain) => isNamed(captain, condition))) {
    return true;
  }

  // A captain-type condition, or the "or your Captain is a [STR] character" alternative of a
  // self or named one.
  const hasTypeCondition =
    condition.captainTypes.length > 0 ||
    condition.captainClasses.length > 0 ||
    condition.captainTags.length > 0;

  return hasTypeCondition && captains.some((captain) => hasTypeOrClass(captain, condition));
}

function isNamed(captain: CharacterListItem, condition: CaptainCondition): boolean {
  // Upstream's families name the character on the card ("Donquixote Rosinante", "Corazon",
  // "Monkey D. Luffy"); the condition uses the name players use ("Corazon", "Luffy").
  const families = (captain.families ?? []).map(normalizeName);

  return condition.names
    .map(normalizeName)
    .some((name) => families.some((family) => family === name || family.endsWith(` ${name}`)));
}

function hasTypeOrClass(captain: CharacterListItem, condition: CaptainCondition): boolean {
  const types = captain.type
    .split(/[,/]/)
    .map((type) => type.trim().toUpperCase())
    .filter(Boolean);
  const classes = captain.classes.map(normalizeName);
  const tags = (
    'detail' in captain ? ((captain as CharacterDetailRecord).detail.characterTags ?? []) : []
  ).map(normalizeName);
  const typeMatches = condition.captainTypes.some((type) => types.includes(type.toUpperCase()));
  const classMatches = condition.captainClasses.some((name) =>
    classes.includes(normalizeName(name)),
  );
  const tagMatches = condition.captainTags.some((tag) => tags.includes(normalizeName(tag)));

  if (condition.captainTypeAndClass) {
    return typeMatches && classMatches;
  }

  return typeMatches || classMatches || tagMatches;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function withoutCaptainCondition(ability: ConditionalBuilderAbility): NormalizedBuilderAbility {
  const { captainCondition: _condition, ...rest } = ability;

  return rest;
}

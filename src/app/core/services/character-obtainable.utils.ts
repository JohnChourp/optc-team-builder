import {
  type CharacterAcquisition,
  type CharacterDropSource,
  type CharacterEvolutionBranch,
} from '../models/optc.models';

/**
 * 869f63h04. What the opt-in "only units I can get from farming, shops or the Friend Point banner"
 * filter of the Auto Team Builder needs to know about one character.
 */
export interface CharacterObtainableSources {
  characterId: number;
  acquisition: CharacterAcquisition;
  dropSources: CharacterDropSource[];
  evolvesTo: CharacterEvolutionBranch[];
}

/** The two `flags.js` keys that name a shop, as the Character screen's "Sold in" reads them. */
const SHOP_FLAGS: readonly string[] = ['shop', 'tmshop'];

/** `banners.js` key of the Friend Point banner. */
const FRIEND_POINT_BANNER = 'FP';

/**
 * A unit upstream records as dropping from a stage, sold in a shop or pulled from the Friend Point
 * banner. Only positive facts count: a unit with nothing recorded is not "unobtainable", it is
 * simply not one this filter can vouch for.
 */
export function isDirectlyObtainable(sources: CharacterObtainableSources): boolean {
  const { acquisition, dropSources } = sources;

  return (
    dropSources.length > 0 ||
    acquisition.shops.length > 0 ||
    acquisition.flags.some((flag) => SHOP_FLAGS.includes(flag)) ||
    acquisition.banners.includes(FRIEND_POINT_BANNER)
  );
}

/**
 * Every unit the filter keeps: the directly obtainable ones, and every form they evolve into, at
 * any depth. Sorted, so the same data always gives the same list.
 */
export function resolveObtainableCharacterIds(
  entries: readonly CharacterObtainableSources[],
): number[] {
  const evolvesToById = new Map<number, number[]>();
  const obtainable = new Set<number>();
  const pending: number[] = [];

  for (const entry of entries) {
    evolvesToById.set(
      entry.characterId,
      entry.evolvesTo
        .map((branch) => branch.toId)
        .filter((toId): toId is number => Number.isInteger(toId) && toId > 0),
    );

    if (isDirectlyObtainable(entry) && !obtainable.has(entry.characterId)) {
      obtainable.add(entry.characterId);
      pending.push(entry.characterId);
    }
  }

  while (pending.length > 0) {
    const characterId = pending.pop()!;

    for (const toId of evolvesToById.get(characterId) ?? []) {
      if (!obtainable.has(toId)) {
        obtainable.add(toId);
        pending.push(toId);
      }
    }
  }

  return [...obtainable].sort((left, right) => left - right);
}

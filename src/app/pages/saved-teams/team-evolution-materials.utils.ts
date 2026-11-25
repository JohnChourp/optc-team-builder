import {
  type CharacterEvolutionLinks,
  type CharacterEvolutionMaterial,
} from '../../core/models/optc.models';

/**
 * 869f63gzu. The evolution materials the selected saved teams still need, measured from one box.
 *
 * For each unit of the teams, once:
 *
 *  - **in the box** - nothing to do;
 *  - **an earlier form is in the box** - every evolution from that form up to the team's form,
 *    summed. The nearest owned form wins, because it needs the fewest steps;
 *  - **neither** - the unit is listed as not in the box, and adds no materials. It has to be
 *    pulled or farmed first, and guessing which form the reader will get would be a guess.
 *
 * The box records only which characters the reader has, never how many copies or levels, so a
 * total is what the evolutions ask for, not what is left after what the reader already holds.
 *
 * Pure: the evolution links come in as a map, so this is testable without a database.
 */

/** The evolution links by character id. A character with no entry has none recorded. */
export type EvolutionLinksById = ReadonlyMap<
  number,
  Pick<CharacterEvolutionLinks, 'evolvesTo' | 'evolvesFrom'>
>;

export type TeamUnitEvolutionPlan =
  | { characterId: number; state: 'owned' }
  | {
      characterId: number;
      state: 'evolve';
      /** The owned form the evolutions start from. */
      fromId: number;
      /** Each form along the way, the owned one first and the team's form last. */
      path: number[];
    }
  | { characterId: number; state: 'notInBox' };

export interface EvolutionMaterialTotal {
  /** `c:<id>` for a character, `t:<token>` for anything else. Stable, for `track`. */
  key: string;
  characterId: number | null;
  token: string | null;
  count: number;
}

export interface TeamEvolutionMaterials {
  units: TeamUnitEvolutionPlan[];
  materials: EvolutionMaterialTotal[];
}

/**
 * How far back the search walks. The longest chain upstream has today is 4 steps; this is a guard
 * against a cycle in bad data, not a limit any real chain reaches.
 */
export const EVOLUTION_SEARCH_MAX_STEPS = 12;

/** The materials of the evolution `fromId` → `toId`, or null when upstream records none. */
function stepMaterials(
  links: EvolutionLinksById,
  fromId: number,
  toId: number,
): readonly CharacterEvolutionMaterial[] | null {
  return links.get(fromId)?.evolvesTo.find((branch) => branch.toId === toId)?.materials ?? null;
}

/**
 * The shortest way from an owned earlier form to `targetId`, owned form first, or null.
 *
 * Breadth-first backwards, so the first owned form found is the nearest. Ties keep upstream's
 * order of `evolvesFrom`. A step is followed only when the earlier form's own `evolvesTo` lists the
 * evolution, so every step on the path has its materials.
 */
export function findOwnedEvolutionPath(
  targetId: number,
  ownedIds: ReadonlySet<number>,
  links: EvolutionLinksById,
): number[] | null {
  let frontier: number[][] = [[targetId]];
  const seen = new Set<number>([targetId]);

  for (let step = 0; step < EVOLUTION_SEARCH_MAX_STEPS && frontier.length > 0; step += 1) {
    const next: number[][] = [];

    for (const path of frontier) {
      const current = path[0]!;

      for (const earlierId of links.get(current)?.evolvesFrom ?? []) {
        if (seen.has(earlierId) || stepMaterials(links, earlierId, current) === null) {
          continue;
        }

        seen.add(earlierId);

        const extended = [earlierId, ...path];

        if (ownedIds.has(earlierId)) {
          return extended;
        }

        next.push(extended);
      }
    }

    frontier = next;
  }

  return null;
}

/** Every character id whose links the search may read, given what is loaded so far. */
export function collectEarlierFormIds(ids: Iterable<number>, links: EvolutionLinksById): number[] {
  const earlier = new Set<number>();

  for (const id of ids) {
    for (const earlierId of links.get(id)?.evolvesFrom ?? []) {
      earlier.add(earlierId);
    }
  }

  return [...earlier];
}

function materialKey(material: CharacterEvolutionMaterial): string | null {
  if (material.characterId !== null) {
    return `c:${material.characterId}`;
  }

  return material.token ? `t:${material.token}` : null;
}

/** Adds every material of each step along `path` to `totals`. */
function addPathMaterials(
  totals: Map<string, EvolutionMaterialTotal>,
  links: EvolutionLinksById,
  path: readonly number[],
): void {
  for (let index = 1; index < path.length; index += 1) {
    for (const material of stepMaterials(links, path[index - 1]!, path[index]!) ?? []) {
      const key = materialKey(material);

      if (!key) {
        continue;
      }

      const total = totals.get(key);

      if (total) {
        total.count += 1;
      } else {
        totals.set(key, {
          key,
          characterId: material.characterId,
          token: material.characterId === null ? material.token : null,
          count: 1,
        });
      }
    }
  }
}

/** Most needed first; equal counts keep the order they were first met in. */
function sortTotals(totals: Map<string, EvolutionMaterialTotal>): EvolutionMaterialTotal[] {
  return [...totals.values()]
    .map((total, order) => ({ total, order }))
    .sort((left, right) => right.total.count - left.total.count || left.order - right.order)
    .map(({ total }) => total);
}

export function planTeamEvolutionMaterials(
  teamCharacterIds: Iterable<number>,
  ownedIds: ReadonlySet<number>,
  links: EvolutionLinksById,
): TeamEvolutionMaterials {
  const units: TeamUnitEvolutionPlan[] = [];
  const totals = new Map<string, EvolutionMaterialTotal>();

  for (const characterId of new Set(teamCharacterIds)) {
    if (ownedIds.has(characterId)) {
      units.push({ characterId, state: 'owned' });
      continue;
    }

    const path = findOwnedEvolutionPath(characterId, ownedIds, links);

    if (!path) {
      units.push({ characterId, state: 'notInBox' });
      continue;
    }

    units.push({ characterId, state: 'evolve', fromId: path[0]!, path });
    addPathMaterials(totals, links, path);
  }

  return { units, materials: sortTotals(totals) };
}

/*
 * 869f63gzu, second part: the whole box. The owner chose:
 *
 *  - every unit evolves **to its final form**, all steps summed;
 *  - a unit whose later form the box already holds is **skipped** - that later form is planned on
 *    its own, so only the steps after it count;
 *  - a unit whose evolutions lead to **more than one final form** is not summed: which one the
 *    reader wants is their choice, so it is listed apart.
 */

export type BoxUnitEvolutionPlan =
  | { characterId: number; state: 'final' }
  | { characterId: number; state: 'laterOwned'; laterId: number }
  | { characterId: number; state: 'choice'; finalIds: number[] }
  | {
      characterId: number;
      state: 'evolve';
      /** Each form along the way, the box's form first and the final form last. */
      path: number[];
    };

export interface BoxEvolutionMaterials {
  units: BoxUnitEvolutionPlan[];
  materials: EvolutionMaterialTotal[];
}

/** The later forms upstream lists for `characterId`, nearest first. Bounded against cycles. */
function laterForms(characterId: number, links: EvolutionLinksById): number[] {
  const later: number[] = [];
  const seen = new Set<number>([characterId]);
  let frontier = [characterId];

  for (let step = 0; step < EVOLUTION_SEARCH_MAX_STEPS && frontier.length > 0; step += 1) {
    const next: number[] = [];

    for (const id of frontier) {
      for (const branch of links.get(id)?.evolvesTo ?? []) {
        if (!seen.has(branch.toId)) {
          seen.add(branch.toId);
          later.push(branch.toId);
          next.push(branch.toId);
        }
      }
    }

    frontier = next;
  }

  return later;
}

/** The shortest way from `fromId` to `toId` along upstream's evolutions, or null. */
function forwardPath(fromId: number, toId: number, links: EvolutionLinksById): number[] | null {
  let frontier: number[][] = [[fromId]];
  const seen = new Set<number>([fromId]);

  for (let step = 0; step < EVOLUTION_SEARCH_MAX_STEPS && frontier.length > 0; step += 1) {
    const next: number[][] = [];

    for (const path of frontier) {
      for (const branch of links.get(path[path.length - 1]!)?.evolvesTo ?? []) {
        if (seen.has(branch.toId)) {
          continue;
        }

        seen.add(branch.toId);

        const extended = [...path, branch.toId];

        if (branch.toId === toId) {
          return extended;
        }

        next.push(extended);
      }
    }

    frontier = next;
  }

  return null;
}

/** Every character id whose links the box plan may read, given what is loaded so far. */
export function collectLaterFormIds(ids: Iterable<number>, links: EvolutionLinksById): number[] {
  const later = new Set<number>();

  for (const id of ids) {
    for (const branch of links.get(id)?.evolvesTo ?? []) {
      later.add(branch.toId);
    }
  }

  return [...later];
}

export function planBoxEvolutionMaterials(
  boxCharacterIds: Iterable<number>,
  links: EvolutionLinksById,
): BoxEvolutionMaterials {
  const boxIds = new Set(boxCharacterIds);
  const units: BoxUnitEvolutionPlan[] = [];
  const totals = new Map<string, EvolutionMaterialTotal>();

  for (const characterId of boxIds) {
    const later = laterForms(characterId, links);
    const laterOwned = later.find((id) => boxIds.has(id));

    if (laterOwned !== undefined) {
      units.push({ characterId, state: 'laterOwned', laterId: laterOwned });
      continue;
    }

    // A final form is one that evolves no further. A unit with none reachable (only in a cycle
    // of bad data) has nothing this card can count.
    const finalIds = later.filter((id) => !(links.get(id)?.evolvesTo.length ?? 0));

    if (finalIds.length === 0) {
      units.push({ characterId, state: 'final' });
      continue;
    }

    if (finalIds.length > 1) {
      units.push({ characterId, state: 'choice', finalIds });
      continue;
    }

    const path = forwardPath(characterId, finalIds[0]!, links);

    if (!path) {
      units.push({ characterId, state: 'final' });
      continue;
    }

    units.push({ characterId, state: 'evolve', path });
    addPathMaterials(totals, links, path);
  }

  return { units, materials: sortTotals(totals) };
}

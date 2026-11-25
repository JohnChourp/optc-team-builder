import { type CharacterEvolutionLinks } from '../../core/models/optc.models';
import { type OptcRepositoryService } from '../../core/services/optc-repository.service';
import {
  resolveSkullCharacterId,
  summarizeDropSources,
} from '../character-detail/character-progression.presenter';
import {
  EVOLUTION_SEARCH_MAX_STEPS,
  collectEarlierFormIds,
  collectLaterFormIds,
  type EvolutionLinksById,
  type EvolutionMaterialTotal,
} from './team-evolution-materials.utils';

/**
 * 869f63gzu. What the evolution materials cards read from the database, shared by the saved teams
 * card (which walks back to earlier forms) and the box card (which walks on to later forms).
 */
export interface EvolutionMaterialsCatalog {
  links: EvolutionLinksById;
  names: ReadonlyMap<number, string>;
  drops: ReadonlyMap<number, string[]>;
}

export interface EvolutionMaterialRow {
  key: string;
  count: number;
  /** A character material links to its page. */
  characterId: number | null;
  name: string;
  /** A unit's own skull reads "Skull of <name>". */
  skullOfName: string | null;
  drops: string[];
}

/**
 * The evolution links of `ids` and of every form reachable from them in `direction`, one level
 * per query, then the names and drop stages of everything those links mention.
 */
export async function loadEvolutionMaterialsCatalog(
  repository: OptcRepositoryService,
  ids: readonly number[],
  direction: 'earlier' | 'later',
): Promise<EvolutionMaterialsCatalog> {
  const links = new Map<number, CharacterEvolutionLinks>();
  const asked = new Set<number>();
  const next = direction === 'earlier' ? collectEarlierFormIds : collectLaterFormIds;
  let pending = [...ids];

  for (let step = 0; step <= EVOLUTION_SEARCH_MAX_STEPS && pending.length > 0; step += 1) {
    for (const entry of await repository.getCharacterEvolutionsByIds(pending)) {
      links.set(entry.characterId, entry);
    }

    const level = pending;

    level.forEach((id) => asked.add(id));
    pending = next(level, links).filter((id) => !asked.has(id));
  }

  const nameIds = new Set<number>([...ids, ...links.keys()]);
  const materialIds = new Set<number>();

  for (const entry of links.values()) {
    for (const branch of entry.evolvesTo) {
      nameIds.add(branch.toId);

      for (const material of branch.materials) {
        if (material.characterId !== null) {
          materialIds.add(material.characterId);
          nameIds.add(material.characterId);
        }

        const skullOf = resolveSkullCharacterId(material.token);

        if (skullOf !== null) {
          nameIds.add(skullOf);
        }
      }
    }
  }

  const [characters, drops] = await Promise.all([
    repository.getCharactersByIds([...nameIds]),
    repository.getCharacterDropSourcesByIds([...materialIds]),
  ]);

  return {
    links,
    names: new Map(characters.map((character) => [character.id, character.name])),
    drops: new Map(
      drops.map((entry) => [entry.characterId, summarizeDropSources(entry.dropSources)]),
    ),
  };
}

/** The catalog's name for a character, or its number when the database has none. */
export function evolutionCatalogName(catalog: EvolutionMaterialsCatalog, id: number): string {
  return catalog.names.get(id) ?? `#${id}`;
}

export function toEvolutionMaterialRows(
  materials: readonly EvolutionMaterialTotal[],
  catalog: EvolutionMaterialsCatalog,
): EvolutionMaterialRow[] {
  return materials.map((material) => {
    const skullOf = resolveSkullCharacterId(material.token);

    return {
      key: material.key,
      count: material.count,
      characterId: material.characterId,
      name:
        material.characterId !== null
          ? evolutionCatalogName(catalog, material.characterId)
          : (material.token ?? ''),
      skullOfName: skullOf !== null ? evolutionCatalogName(catalog, skullOf) : null,
      drops: material.characterId !== null ? (catalog.drops.get(material.characterId) ?? []) : [],
    };
  });
}

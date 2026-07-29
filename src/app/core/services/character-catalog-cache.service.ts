import { Injectable, signal } from '@angular/core';

import {
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSearchQuery,
  type CharacterSortMode,
} from '../models/optc.models';
import {
  createEmptyCharacterFacetSelection,
  matchesCharacterFacet,
  normalizeCharacterFacetSelection,
} from './character-facet-filter.utils';
import { CharacterOverridesService } from './character-overrides.service';
import { OptcRepositoryService } from './optc-repository.service';

@Injectable({ providedIn: 'root' })
export class CharacterCatalogCacheService {
  public readonly catalog = signal<CharacterListItem[]>([]);
  public readonly catalogById = signal<Map<number, CharacterListItem>>(new Map());
  public readonly loading = signal(false);
  public readonly loaded = signal(false);
  public readonly error = signal<unknown>(null);

  private preloadPromise: Promise<void> | null = null;
  private readonly searchIndex = new Map<number, string>();
  private lastAppliedOverrideRevision = -1;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterOverrides: CharacterOverridesService,
  ) {}

  public kickoffPreload(): void {
    void this.ensureLoaded().catch(() => undefined);
  }

  public async ensureLoaded(): Promise<void> {
    if (this.loaded() && this.lastAppliedOverrideRevision === this.characterOverrides.revision()) {
      return;
    }

    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    this.loading.set(true);
    this.error.set(null);
    this.preloadPromise = this.repository
      .getAllCharacters()
      .then((catalog) => {
        this.catalog.set(catalog);
        this.catalogById.set(
          new Map(catalog.map((character) => [character.id, character] as const)),
        );
        this.searchIndex.clear();

        catalog.forEach((character) => {
          this.searchIndex.set(character.id, this.buildSearchText(character));
        });

        this.lastAppliedOverrideRevision = this.characterOverrides.revision();
        this.loaded.set(true);
      })
      .catch((error: unknown) => {
        this.error.set(error);
        this.loaded.set(false);
        throw error;
      })
      .finally(() => {
        this.loading.set(false);
        this.preloadPromise = null;
      });

    return this.preloadPromise;
  }

  public queryCharacters(query: CharacterSearchQuery): CharacterListItem[] {
    const allowedCharacterIdSet =
      query.allowedCharacterIds === undefined
        ? null
        : new Set(
            query.allowedCharacterIds.filter(
              (characterId) => Number.isInteger(characterId) && characterId > 0,
            ),
          );
    const excludedCharacterIdSet = new Set(
      (query.excludedCharacterIds ?? []).filter(
        (characterId) => Number.isInteger(characterId) && characterId > 0,
      ),
    );
    const normalizedSearchTerm = query.searchTerm.trim().toLowerCase();
    // Boundary invariant: normalize here too, so no host bug can smuggle an
    // unsatisfiable `all` (3+ values) into a cached query.
    const typeFacet = normalizeCharacterFacetSelection(
      'type',
      query.typeFacet ?? createEmptyCharacterFacetSelection(),
    );
    const classFacet = normalizeCharacterFacetSelection(
      'class',
      query.classFacet ?? createEmptyCharacterFacetSelection(),
    );
    const maxCost =
      query.maxCost === null || query.maxCost === undefined || !Number.isInteger(query.maxCost)
        ? null
        : Math.max(0, query.maxCost);
    const filtered = this.catalog().filter((character) => {
      if (allowedCharacterIdSet && !allowedCharacterIdSet.has(character.id)) {
        return false;
      }

      if (excludedCharacterIdSet.has(character.id)) {
        return false;
      }

      if (normalizedSearchTerm.length) {
        const searchText = this.searchIndex.get(character.id) ?? '';

        if (!searchText.includes(normalizedSearchTerm)) {
          return false;
        }
      }

      if (!matchesCharacterFacet('type', character, typeFacet)) {
        return false;
      }

      if (!matchesCharacterFacet('class', character, classFacet)) {
        return false;
      }

      if (maxCost !== null && character.cost > maxCost) {
        return false;
      }

      return true;
    });

    const sorted = this.sortCharacters(filtered, query.sortMode ?? 'catalog', query.idOrder);

    return sorted.slice(query.offset, query.offset + query.limit);
  }

  public getCharactersByIds(ids: number[]): CharacterListItem[] {
    const characterMap = this.catalogById();

    return ids
      .map((id) => characterMap.get(id) ?? null)
      .filter((character): character is CharacterListItem => Boolean(character));
  }

  private buildSearchText(character: CharacterListItem): string {
    return [
      character.searchText ?? '',
      character.id,
      character.name,
      character.type,
      character.primaryClass,
      character.secondaryClass ?? '',
      ...character.classes,
    ]
      .join(' ')
      .toLowerCase();
  }

  private sortCharacters(
    characters: CharacterListItem[],
    sortMode: CharacterSortMode,
    idOrder: CharacterIdOrder | undefined = 'newest',
  ): CharacterListItem[] {
    return [...characters].sort((left, right) => {
      if (sortMode === 'captainHpBoost') {
        return this.compareBoostSortedCharacters(left, right, 'captainHpBoost', idOrder);
      }

      if (sortMode === 'captainAtkBoost') {
        return this.compareBoostSortedCharacters(left, right, 'captainAtkBoost', idOrder);
      }

      if (sortMode === 'captainAverageBoost') {
        return this.compareBoostSortedCharacters(left, right, 'captainAverageBoost', idOrder);
      }

      if (sortMode === 'nameAsc') {
        const nameDifference = left.name.localeCompare(right.name, undefined, {
          sensitivity: 'base',
        });

        return nameDifference || compareCharacterIds(left.id, right.id, idOrder);
      }

      if (sortMode === 'nameDesc') {
        const nameDifference = right.name.localeCompare(left.name, undefined, {
          sensitivity: 'base',
        });

        return nameDifference || compareCharacterIds(left.id, right.id, idOrder);
      }

      if (sortMode === 'idAsc') {
        return left.id - right.id;
      }

      if (sortMode === 'idDesc' || sortMode === 'newest' || sortMode === 'powerFirst') {
        return right.id - left.id;
      }

      return compareCharacterIds(left.id, right.id, idOrder);
    });
  }

  private compareBoostSortedCharacters(
    left: CharacterListItem,
    right: CharacterListItem,
    key: 'captainHpBoost' | 'captainAtkBoost' | 'captainAverageBoost',
    idOrder: CharacterIdOrder | undefined,
  ): number {
    const boostDifference = right[key] - left[key];

    if (boostDifference !== 0) {
      return boostDifference;
    }

    const idDifference = compareCharacterIds(left.id, right.id, idOrder);

    if (idDifference !== 0) {
      return idDifference;
    }

    const costDifference = right.cost - left.cost;

    if (costDifference !== 0) {
      return costDifference;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  }
}

function compareCharacterIds(
  leftId: number,
  rightId: number,
  idOrder: CharacterIdOrder | undefined,
): number {
  return idOrder === 'oldest' ? leftId - rightId : rightId - leftId;
}

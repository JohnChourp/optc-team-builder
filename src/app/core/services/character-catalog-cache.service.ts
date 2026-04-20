import { Injectable, signal } from '@angular/core';

import { type CharacterListItem, type CharacterSearchQuery } from '../models/optc.models';
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
    const normalizedTypeFilter = query.typeFilter.trim().toLowerCase();
    const normalizedClassFilter = query.classFilter.trim().toLowerCase();
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

      if (
        normalizedTypeFilter.length &&
        !character.type.toLowerCase().includes(normalizedTypeFilter)
      ) {
        return false;
      }

      if (
        normalizedClassFilter.length &&
        character.primaryClass.toLowerCase() !== normalizedClassFilter &&
        character.secondaryClass?.toLowerCase() !== normalizedClassFilter
      ) {
        return false;
      }

      return true;
    });

    return filtered.slice(query.offset, query.offset + query.limit);
  }

  public getCharactersByIds(ids: number[]): CharacterListItem[] {
    const characterMap = this.catalogById();

    return ids
      .map((id) => characterMap.get(id) ?? null)
      .filter((character): character is CharacterListItem => Boolean(character));
  }

  private buildSearchText(character: CharacterListItem): string {
    return [
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
}

import { Injectable } from '@angular/core';

import { type LocalCharacterOverride } from '../models/optc.models';
import { OptcbxImportService } from './optcbx-import.service';
import { OptcRepositoryService } from './optc-repository.service';
import { UserStateService } from './user-state.service';
import { CharacterOverridesService } from './character-overrides.service';
import {
  buildOptcbxFavoritesExportPayload,
  type OptcbxFavoritesExportPayload,
} from '../../pages/characters/characters-favorites.utils';
import {
  buildCharacterBoxesTransferPayload,
  clearUnavailableCharacterBoxCharacterIds,
  parseCharacterBoxesImportPayloadValue,
  sanitizeCharacterBoxesImportPayload,
  type CharacterBoxesTransferPayload,
} from '../../pages/character-boxes/character-boxes-transfer.utils';
import {
  buildCharacterOverridesTransferPayload,
  parseCharacterOverridesImportPayloadValue,
  sanitizeCharacterOverridesImportPayload,
  type CharacterOverridesTransferPayload,
} from '../../pages/character-detail/character-overrides-transfer.utils';
import {
  buildSavedEnemiesTransferPayload,
  parseSavedEnemiesImportPayloadValue,
  sanitizeSavedEnemiesImportPayload,
} from '../../pages/saved-enemies/saved-enemies-transfer.utils';
import {
  buildSavedTeamsTransferPayload,
  clearUnavailableSavedTeamSlots,
  parseSavedTeamsImportPayloadValue,
  sanitizeSavedTeamsImportPayload,
} from '../../pages/saved-teams/saved-teams-transfer.utils';
import {
  buildSavedRumbleTeamsTransferPayload,
  parseSavedRumbleTeamsImportPayloadValue,
} from '../../pages/saved-rumble-teams/saved-rumble-teams-transfer.utils';
import {
  buildSavedRumbleOpponentsTransferPayload,
  parseSavedRumbleOpponentsImportPayloadValue,
  sanitizeSavedRumbleOpponentsImportPayload,
} from '../../pages/auto-team-builder-rumble/saved-rumble-opponents-transfer.utils';
import {
  buildBoostedCharactersTransferPayload,
  parseBoostedCharactersTransferPayload,
} from '../../pages/auto-team-builder/boosted-characters-transfer.utils';
import {
  buildCrewForgeProfilesTransferPayload,
  parseCrewForgeProfilesImportPayloadValue,
  sanitizeCrewForgeProfilesImportPayload,
} from '../../pages/crew-forge/crew-forge-profiles-transfer.utils';
import {
  ALL_DATA_TRANSFER_SCOPES,
  buildAllDataTransferPayload,
  type AllDataTransferPayload,
  type AllDataTransferScope,
  type AllDataTransferSections,
} from '../../pages/settings/all-data-transfer.utils';
import {
  buildFavoriteShipsTransferPayload,
  filterAvailableFavoriteShips,
  parseFavoriteShipsImportPayloadValue,
  sanitizeFavoriteShipsImportPayload,
  type FavoriteShipsTransferPayload,
} from '../../pages/settings/favorite-ships-transfer.utils';
import { AppI18nService } from './app-i18n.service';

/**
 * 869f63gug. The count each scope reports under, declared once. `SyncScopeSummary` is derived from
 * it, so a scope without a count does not compile - the boost list had none, and was counted
 * nowhere.
 */
const SYNC_SCOPE_SUMMARY_KEYS = {
  favorites: 'favoriteCharacterCount',
  favoriteShips: 'favoriteShipCount',
  savedTeams: 'savedTeamsCount',
  savedRumbleTeams: 'savedRumbleTeamsCount',
  savedEnemies: 'savedEnemiesCount',
  characterBoxes: 'characterBoxesCount',
  characterOverrides: 'characterOverridesCount',
  crewForgeProfiles: 'crewForgeProfilesCount',
  savedRumbleOpponents: 'savedRumbleOpponentsCount',
  boostedCharacterIds: 'boostedCharacterCount',
} as const satisfies Record<AllDataTransferScope, string>;

export type SyncScopeSummary = Record<
  (typeof SYNC_SCOPE_SUMMARY_KEYS)[AllDataTransferScope],
  number
>;

/**
 * 869f63gug. What this service does with one scope. 1amndjnq718 removed `clear` and `countIn` with
 * the Drive restore, their only reader.
 */
interface SyncScopeHandler<Scope extends AllDataTransferScope> {
  /** This device's section of a full export. */
  build: () => AllDataTransferSections[Scope] | Promise<AllDataTransferSections[Scope]>;
  /** How many items this device holds. */
  count: () => number;
}

export interface FavoritesImportSummary {
  addedCount: number;
  alreadyFavoritedCount: number;
  duplicatesRemoved: number;
  matchedCount: number;
  unknownCharacterCount: number;
}

export interface FavoriteShipsImportSummary {
  addedCount: number;
  alreadyFavoritedCount: number;
  duplicateIdCount: number;
  invalidShipCount: number;
  matchedShipCount: number;
  unknownShipCount: number;
}

export interface CharacterBoxesImportSummary {
  addedCount: number;
  duplicateIdCount: number;
  invalidBoxCount: number;
  unknownCharacterIdCount: number;
  updatedCount: number;
}

export interface BoostedCharactersImportSummary {
  appliedCount: number;
  /** True when a list was actually read; false when the payload was not one. */
  replaced: boolean;
}

export interface SavedRumbleOpponentsImportSummary {
  addedCount: number;
  duplicateIdCount: number;
  invalidOpponentCount: number;
  updatedCount: number;
}

export interface CrewForgeProfilesImportSummary {
  addedCount: number;
  builtInProfileCount: number;
  duplicateProfileCount: number;
  invalidProfileCount: number;
  updatedCount: number;
}

export interface CharacterOverridesImportSummary {
  addedCount: number;
  duplicateCharacterIdCount: number;
  invalidOverrideCount: number;
  unknownCharacterIdCount: number;
  updatedCount: number;
}

export interface SavedTeamsImportSummary {
  addedCount: number;
  duplicateIdCount: number;
  invalidTeamCount: number;
  unknownSlotCount: number;
  updatedCount: number;
}

export interface SavedEnemiesImportSummary {
  addedCount: number;
  duplicateIdCount: number;
  invalidEnemyCount: number;
  updatedCount: number;
}

export interface SavedRumbleTeamsImportSummary {
  addedCount: number;
  updatedCount: number;
}

@Injectable({ providedIn: 'root' })
export class UserDataTransferService {
  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
    private readonly userState: UserStateService,
    private readonly characterOverrides: CharacterOverridesService,
    private readonly optcbxImport: OptcbxImportService,
  ) {}

  public async ready(): Promise<void> {
    await Promise.all([this.userState.ready(), this.characterOverrides.ready()]);
  }

  /**
   * 869f1q90b. Replaces the list rather than merging it.
   *
   * Every other scope here merges, because two devices can both have saved teams worth keeping. A
   * boost list describes ONE event, so merging two of them would produce a set that was never true
   * of any event - and the builder would prefer characters for a week that has passed.
   */
  public async importBoostedCharactersPayload(
    payload: unknown,
  ): Promise<BoostedCharactersImportSummary> {
    await this.ready();

    const parsed = parseBoostedCharactersTransferPayload(payload);

    if (!parsed) {
      return { appliedCount: 0, replaced: false };
    }

    await this.userState.setBoostedCharacterIds(parsed.characterIds);

    return { appliedCount: parsed.characterIds.length, replaced: true };
  }

  public async buildAllDataPayload(
    exportedAt = new Date().toISOString(),
  ): Promise<AllDataTransferPayload> {
    await this.ready();
    const handlers = this.syncScopeHandlers();
    const sections = Object.fromEntries(
      await Promise.all(
        ALL_DATA_TRANSFER_SCOPES.map(async (scope) => [scope, await handlers[scope].build()]),
      ),
    ) as AllDataTransferSections;

    return buildAllDataTransferPayload(sections, exportedAt);
  }

  public getSyncScopeSummary(): SyncScopeSummary {
    const handlers = this.syncScopeHandlers();

    return this.summarise((scope) => handlers[scope].count());
  }

  public async importCharacterBoxesPayload(payload: unknown): Promise<CharacterBoxesImportSummary> {
    await this.ready();
    const parsedPayload = parseCharacterBoxesImportPayloadValue(payload);
    const sanitizedImport = sanitizeCharacterBoxesImportPayload(parsedPayload, {
      untitledBoxName: this.i18n.translate('common.defaults.untitledBox'),
    });
    const candidateCharacterIds = [
      ...new Set(sanitizedImport.boxes.flatMap((box) => box.characterIds)),
    ];
    const availableCharacters = candidateCharacterIds.length
      ? await this.repository.getCharactersByIds(candidateCharacterIds)
      : [];
    const characterSanitizeResult = clearUnavailableCharacterBoxCharacterIds(
      sanitizedImport.boxes,
      new Set(availableCharacters.map((character) => character.id)),
    );
    const mergeResult = await this.userState.mergeImportedCharacterBoxes(
      characterSanitizeResult.boxes,
    );

    return {
      addedCount: mergeResult.addedCount,
      duplicateIdCount: sanitizedImport.duplicateIdCount,
      invalidBoxCount: sanitizedImport.invalidBoxCount,
      unknownCharacterIdCount: characterSanitizeResult.unknownCharacterIdCount,
      updatedCount: mergeResult.updatedCount,
    };
  }

  public async importCharacterOverridesPayload(
    payload: unknown,
  ): Promise<CharacterOverridesImportSummary> {
    await this.ready();
    const parsedPayload = parseCharacterOverridesImportPayloadValue(payload);
    const sanitizedImport = sanitizeCharacterOverridesImportPayload(parsedPayload);
    const candidateCharacterIds = sanitizedImport.overrides.map((override) => override.characterId);
    const availableCharacters = candidateCharacterIds.length
      ? await this.repository.getCharactersByIds(candidateCharacterIds)
      : [];
    const availableCharacterIdSet = new Set(availableCharacters.map((character) => character.id));
    const validOverrides = sanitizedImport.overrides.filter((override) =>
      availableCharacterIdSet.has(override.characterId),
    );
    const mergeResult = await this.characterOverrides.mergeImportedOverrides(validOverrides);

    return {
      addedCount: mergeResult.addedCount,
      duplicateCharacterIdCount: sanitizedImport.duplicateCharacterIdCount,
      invalidOverrideCount: sanitizedImport.invalidOverrideCount,
      unknownCharacterIdCount: sanitizedImport.overrides.length - validOverrides.length,
      updatedCount: mergeResult.updatedCount,
    };
  }

  public async importSavedRumbleOpponentsPayload(
    payload: unknown,
  ): Promise<SavedRumbleOpponentsImportSummary> {
    await this.ready();
    await this.userState.readySavedRumbleOpponents();

    const parsedPayload = parseSavedRumbleOpponentsImportPayloadValue(payload);
    const sanitizedImport = sanitizeSavedRumbleOpponentsImportPayload(parsedPayload);
    const mergeResult = await this.userState.mergeImportedRumbleOpponents(
      sanitizedImport.opponents,
    );

    return {
      addedCount: mergeResult.addedCount,
      duplicateIdCount: sanitizedImport.duplicateIdCount,
      invalidOpponentCount: sanitizedImport.invalidOpponentCount,
      updatedCount: mergeResult.updatedCount,
    };
  }

  public async importCrewForgeProfilesPayload(
    payload: unknown,
  ): Promise<CrewForgeProfilesImportSummary> {
    await this.ready();
    await this.userState.readyCrewForgeImageProfiles();

    const parsedPayload = parseCrewForgeProfilesImportPayloadValue(payload);
    const sanitizedImport = sanitizeCrewForgeProfilesImportPayload(parsedPayload);
    const existingIds = new Set(
      this.userState.crewForgeImageProfiles().map((profile) => profile.id),
    );
    let addedCount = 0;
    let updatedCount = 0;
    let invalidProfileCount = sanitizedImport.invalidProfileCount;

    for (const profile of sanitizedImport.profiles) {
      const wasPresent = existingIds.has(profile.id);
      /*
       * The service's own normaliser runs here rather than a second copy in the
       * transfer utils: it repairs slot blueprints, clamps thresholds, rebuilds
       * timestamps, and drops an exemplar whose fingerprint length disagrees
       * with the profile's preprocess size. A profile it rejects is counted as
       * invalid instead of being written half-formed.
       */
      const saved = await this.userState.saveCrewForgeImageProfile(profile);

      if (!saved) {
        invalidProfileCount += 1;
        continue;
      }

      if (wasPresent) {
        updatedCount += 1;
      } else {
        addedCount += 1;
        existingIds.add(saved.id);
      }
    }

    if (sanitizedImport.lastProfileId) {
      await this.userState.setCrewForgeLastImageProfileId(sanitizedImport.lastProfileId);
    }

    return {
      addedCount,
      builtInProfileCount: sanitizedImport.builtInProfileCount,
      duplicateProfileCount: sanitizedImport.duplicateProfileCount,
      invalidProfileCount,
      updatedCount,
    };
  }

  public async importFavoriteShipsPayload(payload: unknown): Promise<FavoriteShipsImportSummary> {
    await this.ready();
    const parsedPayload = parseFavoriteShipsImportPayloadValue(payload);
    const sanitizedImport = sanitizeFavoriteShipsImportPayload(parsedPayload);
    const ships = await this.repository.getShips();
    const availableShips = filterAvailableFavoriteShips(
      sanitizedImport.ships,
      new Set(ships.map((ship) => ship.id)),
    );
    const currentFavoriteShipIds = this.userState.favoriteShipIds();
    const currentFavoriteShipIdSet = new Set(currentFavoriteShipIds);
    const importedShipIds = availableShips.ships.map((ship) => ship.id);
    const addedCount = importedShipIds.filter(
      (shipId) => !currentFavoriteShipIdSet.has(shipId),
    ).length;

    await this.userState.setFavoriteShipIds(
      this.mergeFavoriteShipIds(importedShipIds, currentFavoriteShipIds),
    );

    return {
      addedCount,
      alreadyFavoritedCount: importedShipIds.length - addedCount,
      duplicateIdCount: sanitizedImport.duplicateIdCount,
      invalidShipCount: sanitizedImport.invalidShipCount,
      matchedShipCount: importedShipIds.length,
      unknownShipCount: availableShips.unknownShipCount,
    };
  }

  public async importFavoritesPayload(payload: unknown): Promise<FavoritesImportSummary> {
    await this.ready();
    const parsedImport = this.optcbxImport.parseExportPayload(payload);
    const currentFavoriteIds = this.userState.favoriteCharacterIds();
    const importResult = await this.optcbxImport.buildMergeImportResult(
      parsedImport,
      currentFavoriteIds,
    );

    await this.userState.setFavoriteCharacterIds(
      this.optcbxImport.mergeFavoriteIds(importResult.matchedIds, currentFavoriteIds),
    );

    return {
      addedCount: importResult.addedCount,
      alreadyFavoritedCount: importResult.alreadyFavoritedCount,
      duplicatesRemoved: parsedImport.duplicatesRemoved,
      matchedCount: importResult.matchedIds.length,
      unknownCharacterCount: importResult.unmatchedIds.length,
    };
  }

  public async importSavedEnemiesPayload(payload: unknown): Promise<SavedEnemiesImportSummary> {
    await this.ready();
    const parsedPayload = parseSavedEnemiesImportPayloadValue(payload);
    const sanitizedImport = sanitizeSavedEnemiesImportPayload(parsedPayload, {
      untitledEnemyName: this.i18n.translate('common.defaults.untitledEnemy'),
    });
    const mergeResult = await this.userState.mergeImportedEnemies(sanitizedImport.enemies);

    return {
      addedCount: mergeResult.addedCount,
      duplicateIdCount: sanitizedImport.duplicateIdCount,
      invalidEnemyCount: sanitizedImport.invalidEnemyCount,
      updatedCount: mergeResult.updatedCount,
    };
  }

  public async importSavedTeamsPayload(payload: unknown): Promise<SavedTeamsImportSummary> {
    await this.ready();
    const parsedPayload = parseSavedTeamsImportPayloadValue(payload);
    const sanitizedImport = sanitizeSavedTeamsImportPayload(parsedPayload, {
      untitledTeamName: this.i18n.translate('common.defaults.untitledCrew'),
    });
    const candidateCharacterIds = [
      ...new Set(
        sanitizedImport.teams.flatMap((team) =>
          team.slots.filter((slotId): slotId is number => typeof slotId === 'number'),
        ),
      ),
    ];
    const availableCharacters = candidateCharacterIds.length
      ? await this.repository.getCharactersByIds(candidateCharacterIds)
      : [];
    const slotSanitizeResult = clearUnavailableSavedTeamSlots(
      sanitizedImport.teams,
      new Set(availableCharacters.map((character) => character.id)),
    );
    const mergeResult = await this.userState.mergeImportedTeams(slotSanitizeResult.teams);

    return {
      addedCount: mergeResult.addedCount,
      duplicateIdCount: sanitizedImport.duplicateIdCount,
      invalidTeamCount: sanitizedImport.invalidTeamCount,
      unknownSlotCount: slotSanitizeResult.unknownSlotCount,
      updatedCount: mergeResult.updatedCount,
    };
  }

  public async importSavedRumbleTeamsPayload(
    payload: unknown,
  ): Promise<SavedRumbleTeamsImportSummary> {
    await this.ready();
    const parsedPayload = parseSavedRumbleTeamsImportPayloadValue(payload);
    const mergeResult = await this.userState.mergeImportedRumbleTeams(parsedPayload.rumbleTeams);

    return {
      addedCount: mergeResult.addedCount,
      updatedCount: mergeResult.updatedCount,
    };
  }

  private async buildFavoriteShipsExportPayload(): Promise<FavoriteShipsTransferPayload> {
    return buildFavoriteShipsTransferPayload(
      this.userState.favoriteShipIds(),
      await this.repository.getShips(),
    );
  }

  private async buildFavoritesExportPayload(): Promise<OptcbxFavoritesExportPayload> {
    const favoriteIds = this.userState.favoriteCharacterIds();
    const favoriteCharacters = favoriteIds.length
      ? await this.repository.getCharactersByIds(favoriteIds)
      : [];

    return buildOptcbxFavoritesExportPayload(favoriteIds, favoriteCharacters);
  }

  private buildCharacterBoxesExportPayload(): CharacterBoxesTransferPayload {
    return buildCharacterBoxesTransferPayload(this.userState.characterBoxes());
  }

  private buildCharacterOverridesExportPayload(): CharacterOverridesTransferPayload {
    return buildCharacterOverridesTransferPayload(
      this.characterOverrides.overrides() as LocalCharacterOverride[],
    );
  }

  private mergeFavoriteShipIds(
    importedShipIds: number[],
    currentFavoriteShipIds: number[],
  ): number[] {
    const nextFavoriteShipIds: number[] = [];
    const seenShipIds = new Set<number>();

    [...importedShipIds, ...currentFavoriteShipIds].forEach((shipId) => {
      if (!Number.isInteger(shipId) || shipId <= 0 || seenShipIds.has(shipId)) {
        return;
      }

      seenShipIds.add(shipId);
      nextFavoriteShipIds.push(shipId);
    });

    return nextFavoriteShipIds;
  }

  private summarise(countOf: (scope: AllDataTransferScope) => number): SyncScopeSummary {
    const summary = {} as SyncScopeSummary;

    for (const scope of ALL_DATA_TRANSFER_SCOPES) {
      summary[SYNC_SCOPE_SUMMARY_KEYS[scope]] = countOf(scope);
    }

    return summary;
  }

  /*
   * 869f63gug. Every scope's export and count in ONE record, typed over the declared scope
   * list - the guard SCOPE_CLONERS gives the builder. They were four hand-kept lists and they
   * disagreed: the export carried ten scopes while a restore cleared nine and the summaries counted
   * nine. A scope added later without an entry here does not compile.
   */
  private syncScopeHandlers(): { [Scope in AllDataTransferScope]: SyncScopeHandler<Scope> } {
    return {
      favorites: {
        build: () => this.buildFavoritesExportPayload(),
        count: () => this.userState.favoriteCharacterIds().length,
      },
      favoriteShips: {
        build: () => this.buildFavoriteShipsExportPayload(),
        count: () => this.userState.favoriteShipIds().length,
      },
      savedTeams: {
        build: () => buildSavedTeamsTransferPayload(this.userState.savedTeams()),
        count: () => this.userState.savedTeams().length,
      },
      savedRumbleTeams: {
        build: () => buildSavedRumbleTeamsTransferPayload(this.userState.savedRumbleTeams()),
        count: () => this.userState.savedRumbleTeams().length,
      },
      savedEnemies: {
        build: () => buildSavedEnemiesTransferPayload(this.userState.savedEnemies()),
        count: () => this.userState.savedEnemies().length,
      },
      characterBoxes: {
        build: () => this.buildCharacterBoxesExportPayload(),
        count: () => this.userState.characterBoxes().length,
      },
      characterOverrides: {
        build: () => this.buildCharacterOverridesExportPayload(),
        count: () => this.characterOverrides.overrides().length,
      },
      crewForgeProfiles: {
        build: () =>
          buildCrewForgeProfilesTransferPayload(
            this.userState.crewForgeImageProfiles(),
            this.userState.crewForgeLastImageProfileId(),
          ),
        count: () => this.userState.crewForgeImageProfiles().length,
      },
      savedRumbleOpponents: {
        build: () =>
          buildSavedRumbleOpponentsTransferPayload(this.userState.savedRumbleOpponents()),
        count: () => this.userState.savedRumbleOpponents().length,
      },
      boostedCharacterIds: {
        build: () => buildBoostedCharactersTransferPayload(this.userState.boostedCharacterIds()),
        count: () => this.userState.boostedCharacterIds().length,
      },
    };
  }
}

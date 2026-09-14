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
  buildAllDataTransferPayload,
  type AllDataTransferPayload,
} from '../../pages/settings/all-data-transfer.utils';
import {
  buildFavoriteShipsTransferPayload,
  filterAvailableFavoriteShips,
  parseFavoriteShipsImportPayloadValue,
  sanitizeFavoriteShipsImportPayload,
  type FavoriteShipsTransferPayload,
} from '../../pages/settings/favorite-ships-transfer.utils';
import { AppI18nService } from './app-i18n.service';

export type DriveImportStrategy = 'merge' | 'restore';

export interface SyncScopeSummary {
  characterBoxesCount: number;
  characterOverridesCount: number;
  crewForgeProfilesCount: number;
  savedRumbleOpponentsCount: number;
  favoriteCharacterCount: number;
  favoriteShipCount: number;
  savedEnemiesCount: number;
  savedRumbleTeamsCount: number;
  savedTeamsCount: number;
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

export interface AllDataApplySummary {
  characterBoxes?: CharacterBoxesImportSummary;
  characterOverrides?: CharacterOverridesImportSummary;
  crewForgeProfiles?: CrewForgeProfilesImportSummary;
  savedRumbleOpponents?: SavedRumbleOpponentsImportSummary;
  boostedCharacterIds?: BoostedCharactersImportSummary;
  favoriteShips?: FavoriteShipsImportSummary;
  favorites?: FavoritesImportSummary;
  savedEnemies?: SavedEnemiesImportSummary;
  savedRumbleTeams?: SavedRumbleTeamsImportSummary;
  savedTeams?: SavedTeamsImportSummary;
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

  public async applyAllDataPayload(
    payload: AllDataTransferPayload,
    strategy: DriveImportStrategy = 'merge',
  ): Promise<AllDataApplySummary> {
    await this.ready();

    if (strategy === 'restore') {
      await this.clearSyncScopedData();
    }

    const summary: AllDataApplySummary = {};

    if (payload.favorites !== undefined) {
      summary.favorites = await this.importFavoritesPayload(payload.favorites as unknown);
    }

    if (payload.favoriteShips !== undefined) {
      summary.favoriteShips = await this.importFavoriteShipsPayload(
        payload.favoriteShips as unknown,
      );
    }

    if (payload.savedTeams !== undefined) {
      summary.savedTeams = await this.importSavedTeamsPayload(payload.savedTeams as unknown);
    }

    if (payload.characterBoxes !== undefined) {
      summary.characterBoxes = await this.importCharacterBoxesPayload(
        payload.characterBoxes as unknown,
      );
    }

    if (payload.characterOverrides !== undefined) {
      summary.characterOverrides = await this.importCharacterOverridesPayload(
        payload.characterOverrides as unknown,
      );
    }

    if (payload.savedEnemies !== undefined) {
      summary.savedEnemies = await this.importSavedEnemiesPayload(payload.savedEnemies as unknown);
    }

    if (payload.savedRumbleTeams !== undefined) {
      summary.savedRumbleTeams = await this.importSavedRumbleTeamsPayload(
        payload.savedRumbleTeams as unknown,
      );
    }

    if (payload.crewForgeProfiles !== undefined) {
      summary.crewForgeProfiles = await this.importCrewForgeProfilesPayload(
        payload.crewForgeProfiles as unknown,
      );
    }

    if (payload.savedRumbleOpponents !== undefined) {
      summary.savedRumbleOpponents = await this.importSavedRumbleOpponentsPayload(
        payload.savedRumbleOpponents as unknown,
      );
    }

    if (payload.boostedCharacterIds !== undefined) {
      summary.boostedCharacterIds = await this.importBoostedCharactersPayload(
        payload.boostedCharacterIds as unknown,
      );
    }

    return summary;
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
    const [favorites, favoriteShips] = await Promise.all([
      this.buildFavoritesExportPayload(),
      this.buildFavoriteShipsExportPayload(),
    ]);

    return buildAllDataTransferPayload(
      {
        favorites,
        favoriteShips,
        characterBoxes: this.buildCharacterBoxesExportPayload(),
        characterOverrides: this.buildCharacterOverridesExportPayload(),
        savedTeams: buildSavedTeamsTransferPayload(this.userState.savedTeams()),
        savedEnemies: buildSavedEnemiesTransferPayload(this.userState.savedEnemies()),
        savedRumbleTeams: buildSavedRumbleTeamsTransferPayload(this.userState.savedRumbleTeams()),
        crewForgeProfiles: buildCrewForgeProfilesTransferPayload(
          this.userState.crewForgeImageProfiles(),
          this.userState.crewForgeLastImageProfileId(),
        ),
        savedRumbleOpponents: buildSavedRumbleOpponentsTransferPayload(
          this.userState.savedRumbleOpponents(),
        ),
        boostedCharacterIds: buildBoostedCharactersTransferPayload(
          this.userState.boostedCharacterIds(),
        ),
      },
      exportedAt,
    );
  }

  public async clearSyncScopedData(): Promise<void> {
    await this.ready();
    await Promise.all([
      this.userState.clearAllFavoriteCharacterIds(),
      this.userState.clearAllFavoriteShipIds(),
      this.userState.clearAllCharacterBoxes(),
      this.characterOverrides.clearAllOverrides(),
      this.userState.clearAllSavedTeams(),
      this.userState.clearAllSavedEnemies(),
      this.userState.clearAllSavedRumbleTeams(),
      this.userState.clearAllCrewForgeImageProfiles(),
      this.userState.clearAllSavedRumbleOpponents(),
    ]);
  }

  public getSyncScopeSummary(): SyncScopeSummary {
    return {
      characterBoxesCount: this.userState.characterBoxes().length,
      characterOverridesCount: this.characterOverrides.overrides().length,
      crewForgeProfilesCount: this.userState.crewForgeImageProfiles().length,
      savedRumbleOpponentsCount: this.userState.savedRumbleOpponents().length,
      favoriteCharacterCount: this.userState.favoriteCharacterIds().length,
      favoriteShipCount: this.userState.favoriteShipIds().length,
      savedEnemiesCount: this.userState.savedEnemies().length,
      savedRumbleTeamsCount: this.userState.savedRumbleTeams().length,
      savedTeamsCount: this.userState.savedTeams().length,
    };
  }

  public hasSyncScopedData(): boolean {
    const summary = this.getSyncScopeSummary();

    return (
      summary.favoriteCharacterCount > 0 ||
      summary.favoriteShipCount > 0 ||
      summary.characterBoxesCount > 0 ||
      summary.characterOverridesCount > 0 ||
      summary.savedTeamsCount > 0 ||
      summary.savedEnemiesCount > 0 ||
      summary.savedRumbleTeamsCount > 0 ||
      summary.crewForgeProfilesCount > 0 ||
      summary.savedRumbleOpponentsCount > 0
    );
  }

  public getSyncScopeSummaryFromPayload(payload: AllDataTransferPayload): SyncScopeSummary {
    return {
      characterBoxesCount: payload.characterBoxes?.boxes.length ?? 0,
      characterOverridesCount: payload.characterOverrides?.overrides.length ?? 0,
      crewForgeProfilesCount: payload.crewForgeProfiles?.profiles.length ?? 0,
      savedRumbleOpponentsCount: payload.savedRumbleOpponents?.opponents.length ?? 0,
      favoriteCharacterCount: payload.favorites?.characters.length ?? 0,
      favoriteShipCount: payload.favoriteShips?.ships.length ?? 0,
      savedEnemiesCount: payload.savedEnemies?.enemies.length ?? 0,
      savedRumbleTeamsCount: payload.savedRumbleTeams?.rumbleTeams.length ?? 0,
      savedTeamsCount: payload.savedTeams?.teams.length ?? 0,
    };
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
}

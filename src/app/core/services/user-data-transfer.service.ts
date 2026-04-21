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
  type SavedEnemiesTransferPayload,
} from '../../pages/saved-enemies/saved-enemies-transfer.utils';
import {
  buildSavedTeamsTransferPayload,
  clearUnavailableSavedTeamSlots,
  parseSavedTeamsImportPayloadValue,
  sanitizeSavedTeamsImportPayload,
  type SavedTeamsTransferPayload,
} from '../../pages/saved-teams/saved-teams-transfer.utils';
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

export type DriveConflictResolution = 'keep-local' | 'merge' | 'restore';
export type DriveImportStrategy = 'merge' | 'restore';

export interface SyncScopeSummary {
  characterBoxesCount: number;
  characterOverridesCount: number;
  favoriteCharacterCount: number;
  favoriteShipCount: number;
  savedEnemiesCount: number;
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

export interface AllDataApplySummary {
  characterBoxes?: CharacterBoxesImportSummary;
  characterOverrides?: CharacterOverridesImportSummary;
  favoriteShips?: FavoriteShipsImportSummary;
  favorites?: FavoritesImportSummary;
  savedEnemies?: SavedEnemiesImportSummary;
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
      summary.favoriteShips = await this.importFavoriteShipsPayload(payload.favoriteShips as unknown);
    }

    if (payload.savedTeams !== undefined) {
      summary.savedTeams = await this.importSavedTeamsPayload(payload.savedTeams as unknown);
    }

    if (payload.characterBoxes !== undefined) {
      summary.characterBoxes = await this.importCharacterBoxesPayload(payload.characterBoxes as unknown);
    }

    if (payload.characterOverrides !== undefined) {
      summary.characterOverrides = await this.importCharacterOverridesPayload(
        payload.characterOverrides as unknown,
      );
    }

    if (payload.savedEnemies !== undefined) {
      summary.savedEnemies = await this.importSavedEnemiesPayload(payload.savedEnemies as unknown);
    }

    return summary;
  }

  public async buildAllDataPayload(exportedAt = new Date().toISOString()): Promise<AllDataTransferPayload> {
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
    ]);
  }

  public getSyncScopeSummary(): SyncScopeSummary {
    return {
      characterBoxesCount: this.userState.characterBoxes().length,
      characterOverridesCount: this.characterOverrides.overrides().length,
      favoriteCharacterCount: this.userState.favoriteCharacterIds().length,
      favoriteShipCount: this.userState.favoriteShipIds().length,
      savedEnemiesCount: this.userState.savedEnemies().length,
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
      summary.savedEnemiesCount > 0
    );
  }

  public getSyncScopeSummaryFromPayload(payload: AllDataTransferPayload): SyncScopeSummary {
    return {
      characterBoxesCount: payload.characterBoxes?.boxes.length ?? 0,
      characterOverridesCount: payload.characterOverrides?.overrides.length ?? 0,
      favoriteCharacterCount: payload.favorites?.characters.length ?? 0,
      favoriteShipCount: payload.favoriteShips?.ships.length ?? 0,
      savedEnemiesCount: payload.savedEnemies?.enemies.length ?? 0,
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
    return buildCharacterOverridesTransferPayload(this.characterOverrides.overrides() as LocalCharacterOverride[]);
  }

  private mergeFavoriteShipIds(importedShipIds: number[], currentFavoriteShipIds: number[]): number[] {
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

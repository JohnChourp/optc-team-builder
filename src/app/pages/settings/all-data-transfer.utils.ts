import { type OptcbxFavoritesExportPayload } from '../characters/characters-favorites.utils';
import { type FavoriteShipsTransferPayload } from './favorite-ships-transfer.utils';
import { type SavedTeamsTransferPayload } from '../saved-teams/saved-teams-transfer.utils';
import { type SavedRumbleTeamsTransferPayload } from '../saved-rumble-teams/saved-rumble-teams-transfer.utils';
import { type SavedEnemiesTransferPayload } from '../saved-enemies/saved-enemies-transfer.utils';
import { type CharacterBoxesTransferPayload } from '../character-boxes/character-boxes-transfer.utils';
import { type CharacterOverridesTransferPayload } from '../character-detail/character-overrides-transfer.utils';
import { cloneRequiredCharacterGroups } from '../../core/services/required-character-groups.utils';

export interface AllDataTransferPayload {
  schemaVersion: 1;
  source: 'all-data';
  exportedAt: string;
  favorites?: OptcbxFavoritesExportPayload;
  favoriteShips?: FavoriteShipsTransferPayload;
  savedTeams?: SavedTeamsTransferPayload;
  savedRumbleTeams?: SavedRumbleTeamsTransferPayload;
  savedEnemies?: SavedEnemiesTransferPayload;
  characterBoxes?: CharacterBoxesTransferPayload;
  characterOverrides?: CharacterOverridesTransferPayload;
}

export type AllDataImportCandidate =
  | { kind: 'all-data'; payload: AllDataTransferPayload }
  | { kind: 'favorites'; payload: unknown }
  | { kind: 'favorite-ships'; payload: unknown }
  | { kind: 'saved-teams'; payload: unknown }
  | { kind: 'saved-rumble-teams'; payload: unknown }
  | { kind: 'saved-enemies'; payload: unknown }
  | { kind: 'character-boxes'; payload: unknown }
  | { kind: 'character-overrides'; payload: unknown };

export class AllDataImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'AllDataImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAllDataTransferPayload(value: unknown): value is AllDataTransferPayload {
  return (
    isRecord(value) &&
    value['schemaVersion'] === 1 &&
    value['source'] === 'all-data' &&
    typeof value['exportedAt'] === 'string'
  );
}

function padTimestampPart(value: number): string {
  return String(value).padStart(2, '0');
}

function buildExportDate(exportedAt: string): Date {
  const parsedDate = new Date(exportedAt);

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

function cloneFavoritesPayload(
  payload: OptcbxFavoritesExportPayload | undefined,
): OptcbxFavoritesExportPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    characters: payload.characters.map((character) => ({ ...character })),
  };
}

function cloneFavoriteShipsPayload(
  payload: FavoriteShipsTransferPayload | undefined,
): FavoriteShipsTransferPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    ...payload,
    ships: payload.ships.map((ship) => ({ ...ship })),
  };
}

function cloneSavedTeamsPayload(
  payload: SavedTeamsTransferPayload | undefined,
): SavedTeamsTransferPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    ...payload,
    teams: payload.teams.map((team) => ({
      ...team,
      slots: [...team.slots],
    })),
  };
}

function cloneSavedRumbleTeamsPayload(
  payload: SavedRumbleTeamsTransferPayload | undefined,
): SavedRumbleTeamsTransferPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    ...payload,
    rumbleTeams: payload.rumbleTeams.map((rumbleTeam) => JSON.parse(JSON.stringify(rumbleTeam))),
  };
}

function cloneSavedEnemiesPayload(
  payload: SavedEnemiesTransferPayload | undefined,
): SavedEnemiesTransferPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    ...payload,
    enemies: payload.enemies.map((enemy) => {
      const requiredCharacterGroups = cloneRequiredCharacterGroups(enemy.requiredCharacterGroups);

      return {
        ...enemy,
        selectedTypes: [...enemy.selectedTypes],
        selectedClasses: [...enemy.selectedClasses],
        requiredAbilities: enemy.requiredAbilities.map((requirement) => ({
          ...requirement,
          slotTokens: [...requirement.slotTokens],
        })),
        ...(requiredCharacterGroups.length ? { requiredCharacterGroups } : {}),
        enemyMechanics: enemy.enemyMechanics.map((mechanic) => ({
          ...mechanic,
          triggerTags: [...mechanic.triggerTags],
          responseTags: [...mechanic.responseTags],
          conditionTags: [...mechanic.conditionTags],
        })),
      };
    }),
  };
}

function cloneCharacterBoxesPayload(
  payload: CharacterBoxesTransferPayload | undefined,
): CharacterBoxesTransferPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    ...payload,
    boxes: payload.boxes.map((box) => ({
      ...box,
      characterIds: [...box.characterIds],
    })),
  };
}

function cloneCharacterOverridesPayload(
  payload: CharacterOverridesTransferPayload | undefined,
): CharacterOverridesTransferPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    ...payload,
    overrides: payload.overrides.map((override) => JSON.parse(JSON.stringify(override))),
  };
}

export function buildAllDataTransferPayload(
  sections: {
    favorites?: OptcbxFavoritesExportPayload;
    favoriteShips?: FavoriteShipsTransferPayload;
    savedTeams?: SavedTeamsTransferPayload;
    savedRumbleTeams?: SavedRumbleTeamsTransferPayload;
    savedEnemies?: SavedEnemiesTransferPayload;
    characterBoxes?: CharacterBoxesTransferPayload;
    characterOverrides?: CharacterOverridesTransferPayload;
  },
  exportedAt = new Date().toISOString(),
): AllDataTransferPayload {
  return {
    schemaVersion: 1,
    source: 'all-data',
    exportedAt,
    favorites: cloneFavoritesPayload(sections.favorites),
    favoriteShips: cloneFavoriteShipsPayload(sections.favoriteShips),
    savedTeams: cloneSavedTeamsPayload(sections.savedTeams),
    savedRumbleTeams: cloneSavedRumbleTeamsPayload(sections.savedRumbleTeams),
    savedEnemies: cloneSavedEnemiesPayload(sections.savedEnemies),
    characterBoxes: cloneCharacterBoxesPayload(sections.characterBoxes),
    characterOverrides: cloneCharacterOverridesPayload(sections.characterOverrides),
  };
}

export function buildAllDataExportFilename(exportedAt: string): string {
  const exactTimestampMatch = exportedAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);

  if (exactTimestampMatch) {
    const [, year, month, day, hours, minutes, seconds] = exactTimestampMatch;

    return `optc-all-data-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
  }

  const exportDate = buildExportDate(exportedAt);

  return (
    `optc-all-data-${exportDate.getFullYear()}` +
    `${padTimestampPart(exportDate.getMonth() + 1)}` +
    `${padTimestampPart(exportDate.getDate())}-` +
    `${padTimestampPart(exportDate.getHours())}` +
    `${padTimestampPart(exportDate.getMinutes())}` +
    `${padTimestampPart(exportDate.getSeconds())}.json`
  );
}

export function downloadAllDataExport(
  payload: AllDataTransferPayload | null,
  documentRef: Document = document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlRef.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2) + '\n'], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const anchor = documentRef.createElement('a');

  anchor.href = objectUrl;
  anchor.download = buildAllDataExportFilename(payload.exportedAt);
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

export function parseAllDataImportCandidate(rawContent: string): AllDataImportCandidate {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new AllDataImportError('management.allData.errors.invalidJson');
  }

  if (!isRecord(parsedPayload)) {
    throw new AllDataImportError('management.allData.errors.invalidPayload');
  }

  if (Array.isArray(parsedPayload['characters'])) {
    return {
      kind: 'favorites',
      payload: parsedPayload,
    };
  }

  const source = parsedPayload['source'];

  if (source === 'all-data') {
    if (!isAllDataTransferPayload(parsedPayload)) {
      throw new AllDataImportError('management.allData.errors.invalidPayload');
    }

    return {
      kind: 'all-data',
      payload: parsedPayload,
    };
  }

  if (parsedPayload['schemaVersion'] === 1 && source === 'favorite-ships') {
    return {
      kind: 'favorite-ships',
      payload: parsedPayload,
    };
  }

  if (parsedPayload['schemaVersion'] === 1 && source === 'saved-teams') {
    return {
      kind: 'saved-teams',
      payload: parsedPayload,
    };
  }

  if (parsedPayload['schemaVersion'] === 1 && source === 'saved-rumble-teams') {
    return {
      kind: 'saved-rumble-teams',
      payload: parsedPayload,
    };
  }

  if (parsedPayload['schemaVersion'] === 1 && source === 'saved-enemies') {
    return {
      kind: 'saved-enemies',
      payload: parsedPayload,
    };
  }

  if (parsedPayload['schemaVersion'] === 1 && source === 'character-boxes') {
    return {
      kind: 'character-boxes',
      payload: parsedPayload,
    };
  }

  if (parsedPayload['schemaVersion'] === 1 && source === 'character-overrides') {
    return {
      kind: 'character-overrides',
      payload: parsedPayload,
    };
  }

  if (typeof source === 'string') {
    throw new AllDataImportError('management.allData.errors.unsupportedSchema');
  }

  throw new AllDataImportError('management.allData.errors.invalidPayload');
}

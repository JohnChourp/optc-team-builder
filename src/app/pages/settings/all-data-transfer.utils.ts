import { type OptcbxFavoritesExportPayload } from '../characters/characters-favorites.utils';
import { type FavoriteShipsTransferPayload } from './favorite-ships-transfer.utils';
import {
  SAVED_TEAMS_TRANSFER_SCHEMA_VERSION,
  SAVED_TEAMS_TRANSFER_SOURCE,
  type SavedTeamsTransferPayload,
} from '../saved-teams/saved-teams-transfer.utils';
import { type SavedRumbleTeamsTransferPayload } from '../saved-rumble-teams/saved-rumble-teams-transfer.utils';
import { type SavedEnemiesTransferPayload } from '../saved-enemies/saved-enemies-transfer.utils';
import { type CharacterBoxesTransferPayload } from '../character-boxes/character-boxes-transfer.utils';
import { type CharacterOverridesTransferPayload } from '../character-detail/character-overrides-transfer.utils';
import { type CrewForgeProfilesTransferPayload } from '../crew-forge/crew-forge-profiles-transfer.utils';
import { type SavedRumbleOpponentsTransferPayload } from '../auto-team-builder-rumble/saved-rumble-opponents-transfer.utils';
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
  crewForgeProfiles?: CrewForgeProfilesTransferPayload;
  savedRumbleOpponents?: SavedRumbleOpponentsTransferPayload;
}

/**
 * 869f1935z. Every scope a full export carries, declared ONCE.
 *
 * The fields above stay optional, and must: this same type parses a file, and an older or partial
 * export legitimately lacks scopes. That is exactly what made the builder unguarded - deleting
 * `savedRumbleTeams` from the returned object compiled cleanly, passed all 14 tests of this file,
 * and produced a "full backup" missing an entire category of the reader's data. Measured, not
 * supposed: `tsc --noEmit` exited 0.
 *
 * So the completeness guarantee lives here instead. `SCOPE_CLONERS` below is typed against this
 * list, so a scope missing from the builder is a COMPILE error rather than a silent hole, and the
 * spec binds the same list to the import side, which is seven hand-written blocks with the same
 * failure mode in the opposite direction.
 */
export const ALL_DATA_TRANSFER_SCOPES = [
  'favorites',
  'favoriteShips',
  'savedTeams',
  'savedRumbleTeams',
  'savedEnemies',
  'characterBoxes',
  'characterOverrides',
  /*
   * 869f12x4p. Added after the list already existed: the Crew Forge image
   * profiles a player tuned were the only durable user data the "export all
   * data" file had never carried, so an export/import round trip lost them
   * silently. The compile-enforced SCOPE_CLONERS record below is what made
   * adding this one edit-and-follow-the-errors rather than a hunt.
   */
  'crewForgeProfiles',
  /* 869f12x45. A new stored entity is in the export from the day it exists. */
  'savedRumbleOpponents',
] as const;

export type AllDataTransferScope = (typeof ALL_DATA_TRANSFER_SCOPES)[number];

/** The sections a caller may hand the builder - one optional value per scope. */
export type AllDataTransferSections = {
  [Scope in AllDataTransferScope]?: NonNullable<AllDataTransferPayload[Scope]>;
};

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

function cloneCrewForgeProfilesPayload(
  payload: CrewForgeProfilesTransferPayload | undefined,
): CrewForgeProfilesTransferPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    ...payload,
    profiles: payload.profiles.map((profile) => ({
      ...profile,
      slotDefinitions: profile.slotDefinitions.map((slot) => ({ ...slot })),
      preprocess: { ...profile.preprocess },
      examples: profile.examples.map((example) => ({ ...example })),
      exemplars: profile.exemplars.map((exemplar) => ({
        ...exemplar,
        fingerprint: [...exemplar.fingerprint],
      })),
    })),
  };
}

function cloneSavedRumbleOpponentsPayload(
  payload: SavedRumbleOpponentsTransferPayload | undefined,
): SavedRumbleOpponentsTransferPayload | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    ...payload,
    opponents: payload.opponents.map((opponent) => ({
      ...opponent,
      activeCharacterIds: [...opponent.activeCharacterIds],
      benchCharacterIds: [...opponent.benchCharacterIds],
    })),
  };
}

/**
 * One cloner per scope. Typed as a complete record on purpose: **drop a scope here and the build
 * fails**, which is the guarantee the hand-written object literal could not give.
 */
const SCOPE_CLONERS: {
  [Scope in AllDataTransferScope]: (
    payload: NonNullable<AllDataTransferPayload[Scope]> | undefined,
  ) => AllDataTransferPayload[Scope];
} = {
  favorites: cloneFavoritesPayload,
  favoriteShips: cloneFavoriteShipsPayload,
  savedTeams: cloneSavedTeamsPayload,
  savedRumbleTeams: cloneSavedRumbleTeamsPayload,
  savedEnemies: cloneSavedEnemiesPayload,
  characterBoxes: cloneCharacterBoxesPayload,
  characterOverrides: cloneCharacterOverridesPayload,
  crewForgeProfiles: cloneCrewForgeProfilesPayload,
  savedRumbleOpponents: cloneSavedRumbleOpponentsPayload,
};

export function buildAllDataTransferPayload(
  sections: AllDataTransferSections,
  exportedAt = new Date().toISOString(),
): AllDataTransferPayload {
  const payload: AllDataTransferPayload = {
    schemaVersion: 1,
    source: 'all-data',
    exportedAt,
  };

  for (const scope of ALL_DATA_TRANSFER_SCOPES) {
    /*
     * The cast is confined to this one line and buys the guarantee above. TypeScript cannot
     * correlate `scope` with its own cloner across an iteration, so the alternative is the
     * seven-line literal this replaced - the one where a deletion compiled.
     */
    const clone = SCOPE_CLONERS[scope] as (payload: unknown) => unknown;

    (payload as unknown as Record<string, unknown>)[scope] = clone(sections[scope]);
  }

  return payload;
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

  if (
    parsedPayload['schemaVersion'] === SAVED_TEAMS_TRANSFER_SCHEMA_VERSION &&
    source === SAVED_TEAMS_TRANSFER_SOURCE
  ) {
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

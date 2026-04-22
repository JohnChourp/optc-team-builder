import { Injectable, Optional, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import {
  BUILT_IN_CREW_FORGE_IMAGE_PROFILES,
  BUILT_IN_CREW_FORGE_IMAGE_PROFILE_IDS,
} from '../data/crew-forge-built-in-profiles';
import {
  CREW_FORGE_IMAGE_SLOT_BLUEPRINTS,
  type CharacterBox,
  type CrewForgeImageExample,
  type CrewForgeImageExemplar,
  type CrewForgeImagePreprocessConfig,
  type CrewForgeImageProfile,
  type CrewForgeImageSlotDefinition,
  type SavedEnemy,
  type SavedTeam,
} from '../models/optc.models';
import { type AutoBuildAbilityRequirement } from '../models/auto-team-builder-ability.models';
import { AppI18nService } from './app-i18n.service';
import { DriveSyncStateService } from './drive-sync-state.service';
import { normalizeEnemyMechanicRequirements } from './enemy-mechanic-draft.utils';

const FAVORITES_KEY = 'favoriteCharacterIds';
const FAVORITE_SHIPS_KEY = 'favoriteShipIds';
const RECENTS_KEY = 'recentCharacterIds';
const CHARACTER_BOXES_KEY = 'characterBoxes';
const SAVED_TEAMS_KEY = 'savedTeams';
const SAVED_ENEMIES_KEY = 'savedEnemies';
const CREW_FORGE_IMAGE_PROFILES_KEY = 'crewForgeImageProfiles';
const CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY = 'crewForgeLastImageProfileId';
const AUTO_TEAM_BUILDER_WORKER_PREFERENCE_KEY = 'autoTeamBuilderWorkerPreference';
const LEGACY_ABILITY_KEY_ALIASES: Record<string, string> = {
  remove_defense_up: 'remove_enemy_increased_defense',
};
const AUTO_TEAM_BUILDER_DEFAULT_WORKER_PREFERENCE: AutoTeamBuilderWorkerPreference = {
  mode: 'auto',
  manualCount: 7,
};

export type AutoTeamBuilderWorkerMode = 'auto' | 'manual';

export interface AutoTeamBuilderWorkerPreference {
  mode: AutoTeamBuilderWorkerMode;
  manualCount: number;
}

export interface ResolvedAutoTeamBuilderWorkerPreference extends AutoTeamBuilderWorkerPreference {
  detectedCoreCount: number;
  effectiveCount: number;
}

@Injectable({ providedIn: 'root' })
export class UserStateService {
  public readonly favoriteCharacterIds = signal<number[]>([]);
  public readonly favoriteShipIds = signal<number[]>([]);
  public readonly recentCharacterIds = signal<number[]>([]);
  public readonly characterBoxes = signal<CharacterBox[]>([]);
  public readonly savedTeams = signal<SavedTeam[]>([]);
  public readonly savedEnemies = signal<SavedEnemy[]>([]);
  public readonly crewForgeImageProfiles = computed<CrewForgeImageProfile[]>(() => [
    ...BUILT_IN_CREW_FORGE_IMAGE_PROFILES,
    ...this.userCrewForgeImageProfiles(),
  ]);
  public readonly crewForgeLastImageProfileId = signal<string | null>(null);
  public readonly autoTeamBuilderWorkerPreference = signal<AutoTeamBuilderWorkerPreference>(
    AUTO_TEAM_BUILDER_DEFAULT_WORKER_PREFERENCE,
  );

  private readonly hydratePromise: Promise<void>;
  private readonly userCrewForgeImageProfiles = signal<CrewForgeImageProfile[]>([]);

  public constructor(
    private readonly i18n: AppI18nService,
    @Optional() private readonly driveSyncState?: DriveSyncStateService,
  ) {
    this.hydratePromise = this.hydrate();
  }

  public async ready(): Promise<void> {
    await this.hydratePromise;
  }

  public async toggleFavorite(characterId: number): Promise<void> {
    await this.ready();
    const current = this.favoriteCharacterIds();
    const next = current.includes(characterId)
      ? current.filter((value) => value !== characterId)
      : [characterId, ...current];

    this.favoriteCharacterIds.set(next);
    await this.persistJson(FAVORITES_KEY, next);
  }

  public async setFavoriteCharacterIds(characterIds: number[]): Promise<void> {
    await this.ready();
    const next = [...new Set(characterIds.filter((value) => Number.isInteger(value) && value > 0))];

    this.favoriteCharacterIds.set(next);
    await this.persistJson(FAVORITES_KEY, next);
  }

  public async clearAllFavoriteCharacterIds(): Promise<void> {
    await this.setFavoriteCharacterIds([]);
  }

  public async toggleShipFavorite(shipId: number): Promise<void> {
    await this.ready();
    const current = this.favoriteShipIds();
    const next = current.includes(shipId)
      ? current.filter((value) => value !== shipId)
      : [shipId, ...current];

    this.favoriteShipIds.set(next);
    await this.persistJson(FAVORITE_SHIPS_KEY, next);
  }

  public async setFavoriteShipIds(shipIds: number[]): Promise<void> {
    await this.ready();
    const next = [...new Set(shipIds.filter((value) => Number.isInteger(value) && value > 0))];

    this.favoriteShipIds.set(next);
    await this.persistJson(FAVORITE_SHIPS_KEY, next);
  }

  public async clearAllFavoriteShipIds(): Promise<void> {
    await this.setFavoriteShipIds([]);
  }

  public async saveCharacterBox(
    input: Omit<CharacterBox, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<CharacterBox | null> {
    await this.ready();

    const existing = this.characterBoxes().find((box) => box.id === input.id);
    const normalizedBox = this.normalizeCharacterBox(
      {
        ...input,
        id: input.id ?? this.createCharacterBoxId(),
      },
      existing,
    );

    if (!normalizedBox) {
      return null;
    }

    const next = existing
      ? this.characterBoxes().map((box) => (box.id === normalizedBox.id ? normalizedBox : box))
      : [normalizedBox, ...this.characterBoxes()];

    await this.replaceCharacterBoxes(next);

    return normalizedBox;
  }

  public async deleteCharacterBox(boxId: string): Promise<void> {
    await this.ready();
    const normalizedBoxId = this.normalizeEntityId(boxId);

    if (!normalizedBoxId) {
      return;
    }

    const next = this.characterBoxes().filter((box) => box.id !== normalizedBoxId);

    if (next.length === this.characterBoxes().length) {
      return;
    }

    await this.replaceCharacterBoxes(next);
  }

  public async clearAllCharacterBoxes(): Promise<void> {
    await this.ready();
    await this.replaceCharacterBoxes([]);
  }

  public getCharacterBoxById(boxId: string): CharacterBox | null {
    const normalizedBoxId = this.normalizeEntityId(boxId);

    if (!normalizedBoxId) {
      return null;
    }

    return this.characterBoxes().find((box) => box.id === normalizedBoxId) ?? null;
  }

  public async mergeImportedCharacterBoxes(
    boxes: CharacterBox[],
  ): Promise<{ addedCount: number; updatedCount: number; boxes: CharacterBox[] }> {
    await this.ready();

    const currentBoxes = this.characterBoxes();
    const currentBoxMap = new Map(currentBoxes.map((box) => [box.id, box] as const));
    const mergedBoxes: CharacterBox[] = [];
    const importedBoxIds = new Set<string>();
    let addedCount = 0;
    let updatedCount = 0;

    boxes.forEach((box) => {
      const existingBox = currentBoxMap.get(box.id);
      const normalizedBox = this.normalizeCharacterBox(
        existingBox
          ? {
              ...box,
              createdAt: undefined,
              updatedAt: undefined,
            }
          : box,
        existingBox,
      );

      if (!normalizedBox || importedBoxIds.has(normalizedBox.id)) {
        return;
      }

      importedBoxIds.add(normalizedBox.id);

      if (currentBoxMap.has(normalizedBox.id)) {
        updatedCount += 1;
      } else {
        addedCount += 1;
      }

      mergedBoxes.push(normalizedBox);
    });

    const next = [...mergedBoxes, ...currentBoxes.filter((box) => !importedBoxIds.has(box.id))];

    await this.replaceCharacterBoxes(next);

    return {
      addedCount,
      updatedCount,
      boxes: next,
    };
  }

  public getCrewForgeImageProfileById(profileId: string): CrewForgeImageProfile | null {
    const normalizedProfileId = this.normalizeEntityId(profileId);

    if (!normalizedProfileId) {
      return null;
    }

    return this.crewForgeImageProfiles().find((profile) => profile.id === normalizedProfileId) ?? null;
  }

  public findCrewForgeImageProfileByDimensions(
    imageWidth: number,
    imageHeight: number,
  ): CrewForgeImageProfile | null {
    if (!Number.isInteger(imageWidth) || imageWidth <= 0 || !Number.isInteger(imageHeight) || imageHeight <= 0) {
      return null;
    }

    const preferredProfileId = this.crewForgeLastImageProfileId();
    const exactProfiles = this.crewForgeImageProfiles().filter(
      (profile) => profile.imageWidth === imageWidth && profile.imageHeight === imageHeight,
    );

    if (!exactProfiles.length) {
      return null;
    }

    return (
      exactProfiles.find((profile) => profile.id === preferredProfileId) ??
      exactProfiles[0] ??
      null
    );
  }

  public async saveCrewForgeImageProfile(
    input: Omit<CrewForgeImageProfile, 'id' | 'source' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<CrewForgeImageProfile, 'id' | 'source' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CrewForgeImageProfile | null> {
    await this.ready();

    const requestedId =
      typeof input.id === 'string' && BUILT_IN_CREW_FORGE_IMAGE_PROFILE_IDS.has(input.id)
        ? undefined
        : input.id;
    const existing = this.userCrewForgeImageProfiles().find((profile) => profile.id === requestedId);
    const normalizedProfile = this.normalizeCrewForgeImageProfile(
      {
        ...input,
        id: requestedId ?? this.createCrewForgeImageProfileId(),
        source: 'user',
      },
      existing,
    );

    if (!normalizedProfile) {
      return null;
    }

    const next = existing
      ? this.userCrewForgeImageProfiles().map((profile) =>
          profile.id === normalizedProfile.id ? normalizedProfile : profile,
        )
      : [normalizedProfile, ...this.userCrewForgeImageProfiles()];

    await this.replaceCrewForgeImageProfiles(next);
    this.crewForgeLastImageProfileId.set(normalizedProfile.id);
    await this.persistJson(CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY, normalizedProfile.id);

    return normalizedProfile;
  }

  public async deleteCrewForgeImageProfile(profileId: string): Promise<void> {
    await this.ready();
    const normalizedProfileId = this.normalizeEntityId(profileId);

    if (!normalizedProfileId || BUILT_IN_CREW_FORGE_IMAGE_PROFILE_IDS.has(normalizedProfileId)) {
      return;
    }

    const next = this.userCrewForgeImageProfiles().filter((profile) => profile.id !== normalizedProfileId);

    if (next.length === this.userCrewForgeImageProfiles().length) {
      return;
    }

    await this.replaceCrewForgeImageProfiles(next);

    if (this.crewForgeLastImageProfileId() === normalizedProfileId) {
      const nextPreferredId = this.crewForgeImageProfiles().find((profile) => profile.id !== normalizedProfileId)?.id ?? null;
      this.crewForgeLastImageProfileId.set(nextPreferredId);
      await this.persistJson(CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY, nextPreferredId);
    }
  }

  public async setCrewForgeLastImageProfileId(profileId: string | null): Promise<void> {
    await this.ready();
    const normalizedProfileId =
      profileId === null ? null : this.getCrewForgeImageProfileById(profileId)?.id ?? null;

    this.crewForgeLastImageProfileId.set(normalizedProfileId);
    await this.persistJson(CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY, normalizedProfileId);
  }

  public async saveCrewForgeImageExample(
    profileId: string,
    input: Omit<CrewForgeImageExample, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<CrewForgeImageProfile | null> {
    await this.ready();
    const profile = await this.resolveCrewForgeImageProfileForMutation(profileId);

    if (!profile) {
      return null;
    }

    const nextExample = this.normalizeCrewForgeImageExample(
      {
        ...input,
        id: input.id ?? this.createCrewForgeImageExampleId(),
      },
      profile.examples.find((example) => example.id === input.id),
      profile.imageWidth,
      profile.imageHeight,
    );

    if (!nextExample) {
      return null;
    }

    const nextProfile = {
      ...profile,
      examples: input.id
        ? profile.examples.map((example) => (example.id === nextExample.id ? nextExample : example))
        : [nextExample, ...profile.examples],
    };

    return this.saveCrewForgeImageProfile(nextProfile);
  }

  public async saveCrewForgeImageExemplar(
    profileId: string,
    input: Omit<CrewForgeImageExemplar, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<CrewForgeImageProfile | null> {
    await this.ready();
    const profile = await this.resolveCrewForgeImageProfileForMutation(profileId);

    if (!profile) {
      return null;
    }

    const existing =
      profile.exemplars.find((exemplar) => exemplar.id === input.id) ??
      profile.exemplars.find(
        (exemplar) => exemplar.slotKey === input.slotKey && exemplar.characterId === input.characterId,
      );
    const nextExemplar = this.normalizeCrewForgeImageExemplar(
      {
        ...input,
        id: input.id ?? existing?.id ?? this.createCrewForgeImageExemplarId(),
      },
      existing,
      profile,
    );

    if (!nextExemplar) {
      return null;
    }

    const nextProfile = {
      ...profile,
      exemplars: existing
        ? profile.exemplars.map((exemplar) => (exemplar.id === nextExemplar.id ? nextExemplar : exemplar))
        : [nextExemplar, ...profile.exemplars],
    };

    return this.saveCrewForgeImageProfile(nextProfile);
  }

  private async resolveCrewForgeImageProfileForMutation(
    profileId: string,
  ): Promise<CrewForgeImageProfile | null> {
    const profile = this.getCrewForgeImageProfileById(profileId);

    if (!profile) {
      return null;
    }

    if (profile.source === 'user') {
      return profile;
    }

    return this.saveCrewForgeImageProfile({
      name: this.createCrewForgeCopiedProfileName(profile.name),
      imageWidth: profile.imageWidth,
      imageHeight: profile.imageHeight,
      slotDefinitions: profile.slotDefinitions.map((slot) => ({ ...slot })),
      preprocess: { ...profile.preprocess },
      examples: profile.examples.map((example) => ({ ...example })),
      exemplars: profile.exemplars.map((exemplar) => ({ ...exemplar })),
    });
  }

  public resolveAutoTeamBuilderWorkerPreference(): ResolvedAutoTeamBuilderWorkerPreference {
    const detectedCoreCount = this.resolveDetectedCoreCount();
    const normalizedPreference = this.normalizeAutoTeamBuilderWorkerPreference(
      this.autoTeamBuilderWorkerPreference(),
      detectedCoreCount,
    );

    return {
      ...normalizedPreference,
      detectedCoreCount,
      effectiveCount:
        normalizedPreference.mode === 'manual'
          ? normalizedPreference.manualCount
          : Math.min(4, Math.max(1, detectedCoreCount - 1)),
    };
  }

  public resolveAutoTeamBuilderWorkerCount(): number {
    return this.resolveAutoTeamBuilderWorkerPreference().effectiveCount;
  }

  public async setAutoTeamBuilderWorkerPreference(
    preference: AutoTeamBuilderWorkerPreference,
  ): Promise<void> {
    await this.ready();
    const normalizedPreference = this.normalizeAutoTeamBuilderWorkerPreference(preference);

    this.autoTeamBuilderWorkerPreference.set(normalizedPreference);
    await this.persistJson(AUTO_TEAM_BUILDER_WORKER_PREFERENCE_KEY, normalizedPreference);
  }

  public async markRecent(characterId: number): Promise<void> {
    await this.ready();
    const next = [
      characterId,
      ...this.recentCharacterIds().filter((value) => value !== characterId),
    ].slice(0, 24);

    this.recentCharacterIds.set(next);
    await this.persistJson(RECENTS_KEY, next);
  }

  public async saveTeam(
    input: Omit<SavedTeam, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<SavedTeam> {
    await this.ready();

    const existing = this.savedTeams().find((team) => team.id === input.id);
    const savedTeam = this.normalizeSavedTeam(
      {
        ...input,
        id: input.id ?? this.createTeamId(),
      },
      existing,
    );

    const next = existing
      ? this.savedTeams().map((team) => (team.id === savedTeam.id ? savedTeam : team))
      : [savedTeam, ...this.savedTeams()];

    await this.replaceSavedTeams(next);

    return savedTeam;
  }

  public async deleteTeam(teamId: string): Promise<void> {
    await this.deleteTeams([teamId]);
  }

  public async deleteTeams(teamIds: string[]): Promise<void> {
    await this.ready();
    const targetTeamIds = new Set(
      teamIds.map((teamId) => teamId.trim()).filter((teamId) => teamId.length > 0),
    );

    if (!targetTeamIds.size) {
      return;
    }

    const next = this.savedTeams().filter((team) => !targetTeamIds.has(team.id));

    if (next.length === this.savedTeams().length) {
      return;
    }

    await this.replaceSavedTeams(next);
  }

  public async clearAllSavedTeams(): Promise<void> {
    await this.ready();
    await this.replaceSavedTeams([]);
  }

  public getSavedTeamById(teamId: string): SavedTeam | null {
    const normalizedTeamId = this.normalizeEntityId(teamId);

    if (!normalizedTeamId) {
      return null;
    }

    return this.savedTeams().find((team) => team.id === normalizedTeamId) ?? null;
  }

  public getSavedEnemyById(enemyId: string): SavedEnemy | null {
    const normalizedEnemyId = this.normalizeEntityId(enemyId);

    if (!normalizedEnemyId) {
      return null;
    }

    return this.savedEnemies().find((enemy) => enemy.id === normalizedEnemyId) ?? null;
  }

  public async saveEnemy(
    input: Omit<SavedEnemy, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<SavedEnemy> {
    await this.ready();

    const existing = this.savedEnemies().find((enemy) => enemy.id === input.id);
    const savedEnemy = this.normalizeSavedEnemy(
      {
        ...input,
        id: input.id ?? this.createEnemyId(),
      },
      existing,
    );

    const next = existing
      ? this.savedEnemies().map((enemy) => (enemy.id === savedEnemy.id ? savedEnemy : enemy))
      : [savedEnemy, ...this.savedEnemies()];

    await this.replaceSavedEnemies(next);

    return savedEnemy;
  }

  public async deleteEnemy(enemyId: string): Promise<void> {
    await this.deleteEnemies([enemyId]);
  }

  public async deleteEnemies(enemyIds: string[]): Promise<void> {
    await this.ready();
    const targetEnemyIds = new Set(
      enemyIds
        .map((enemyId) => this.normalizeEntityId(enemyId))
        .filter((enemyId): enemyId is string => Boolean(enemyId)),
    );

    if (!targetEnemyIds.size) {
      return;
    }

    const next = this.savedEnemies().filter((enemy) => !targetEnemyIds.has(enemy.id));

    if (next.length === this.savedEnemies().length) {
      return;
    }

    await this.replaceSavedEnemies(next);
  }

  public async clearAllSavedEnemies(): Promise<void> {
    await this.ready();
    await this.replaceSavedEnemies([]);
  }

  public async mergeImportedTeams(
    teams: SavedTeam[],
  ): Promise<{ addedCount: number; updatedCount: number; teams: SavedTeam[] }> {
    await this.ready();

    const currentTeams = this.savedTeams();
    const currentTeamMap = new Map(currentTeams.map((team) => [team.id, team] as const));
    const mergedTeams: SavedTeam[] = [];
    const importedTeamIds = new Set<string>();
    let addedCount = 0;
    let updatedCount = 0;

    teams.forEach((team) => {
      const normalizedTeam = this.normalizeSavedTeam(team, currentTeamMap.get(team.id));

      if (importedTeamIds.has(normalizedTeam.id)) {
        return;
      }

      importedTeamIds.add(normalizedTeam.id);

      if (currentTeamMap.has(normalizedTeam.id)) {
        updatedCount += 1;
      } else {
        addedCount += 1;
      }

      mergedTeams.push(normalizedTeam);
    });

    const next = [...mergedTeams, ...currentTeams.filter((team) => !importedTeamIds.has(team.id))];

    await this.replaceSavedTeams(next);

    return {
      addedCount,
      updatedCount,
      teams: next,
    };
  }

  public async mergeImportedEnemies(
    enemies: SavedEnemy[],
  ): Promise<{ addedCount: number; updatedCount: number; enemies: SavedEnemy[] }> {
    await this.ready();

    const currentEnemies = this.savedEnemies();
    const currentEnemyMap = new Map(currentEnemies.map((enemy) => [enemy.id, enemy] as const));
    const mergedEnemies: SavedEnemy[] = [];
    const importedEnemyIds = new Set<string>();
    let addedCount = 0;
    let updatedCount = 0;

    enemies.forEach((enemy) => {
      const existingEnemy = currentEnemyMap.get(enemy.id);
      const normalizedEnemy = this.normalizeSavedEnemy(
        existingEnemy
          ? {
              ...enemy,
              createdAt: undefined,
              updatedAt: undefined,
            }
          : enemy,
        existingEnemy,
      );

      if (importedEnemyIds.has(normalizedEnemy.id)) {
        return;
      }

      importedEnemyIds.add(normalizedEnemy.id);

      if (currentEnemyMap.has(normalizedEnemy.id)) {
        updatedCount += 1;
      } else {
        addedCount += 1;
      }

      mergedEnemies.push(normalizedEnemy);
    });

    const next = [
      ...mergedEnemies,
      ...currentEnemies.filter((enemy) => !importedEnemyIds.has(enemy.id)),
    ];

    await this.replaceSavedEnemies(next);

    return {
      addedCount,
      updatedCount,
      enemies: next,
    };
  }

  private async hydrate(): Promise<void> {
    const [
      favorites,
      favoriteShips,
      recents,
      characterBoxes,
      teams,
      enemies,
      crewForgeImageProfiles,
      crewForgeLastImageProfileId,
      autoTeamBuilderWorkerPreference,
    ] =
      await Promise.all([
        this.readJson<number[]>(FAVORITES_KEY, []),
        this.readJson<number[]>(FAVORITE_SHIPS_KEY, []),
        this.readJson<number[]>(RECENTS_KEY, []),
        this.readJson<CharacterBox[]>(CHARACTER_BOXES_KEY, []),
        this.readJson<SavedTeam[]>(SAVED_TEAMS_KEY, []),
        this.readJson<SavedEnemy[]>(SAVED_ENEMIES_KEY, []),
        this.readJson<CrewForgeImageProfile[]>(CREW_FORGE_IMAGE_PROFILES_KEY, []),
        this.readJson<string | null>(CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY, null),
        this.readJson<AutoTeamBuilderWorkerPreference>(
          AUTO_TEAM_BUILDER_WORKER_PREFERENCE_KEY,
          AUTO_TEAM_BUILDER_DEFAULT_WORKER_PREFERENCE,
        ),
      ]);

    this.favoriteCharacterIds.set(favorites);
    this.favoriteShipIds.set(favoriteShips);
    this.recentCharacterIds.set(recents);
    this.characterBoxes.set(
      characterBoxes
        .map((box) => this.normalizeCharacterBox(box))
        .filter((box): box is CharacterBox => Boolean(box)),
    );
    this.savedTeams.set(teams.map((team) => this.normalizeSavedTeam(team)));
    this.savedEnemies.set(enemies.map((enemy) => this.normalizeSavedEnemy(enemy)));
    this.userCrewForgeImageProfiles.set(
      crewForgeImageProfiles
        .map((profile) => this.normalizeCrewForgeImageProfile(profile))
        .filter((profile): profile is CrewForgeImageProfile => {
          if (!profile) {
            return false;
          }

          return (
            profile.source === 'user' &&
            !BUILT_IN_CREW_FORGE_IMAGE_PROFILE_IDS.has(profile.id)
          );
        }),
    );
    this.crewForgeLastImageProfileId.set(
      this.getCrewForgeImageProfileById(crewForgeLastImageProfileId ?? '')?.id ?? null,
    );
    this.autoTeamBuilderWorkerPreference.set(
      this.normalizeAutoTeamBuilderWorkerPreference(autoTeamBuilderWorkerPreference),
    );
  }

  private async readJson<T>(key: string, fallback: T): Promise<T> {
    const { value } = await Preferences.get({ key });

    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private async persistJson(key: string, value: unknown): Promise<void> {
    await Preferences.set({ key, value: JSON.stringify(value) });
    await this.markSyncScopedLocalChange(key);
  }

  private async markSyncScopedLocalChange(key: string): Promise<void> {
    if (
      !this.driveSyncState ||
      ![
        FAVORITES_KEY,
        FAVORITE_SHIPS_KEY,
        CHARACTER_BOXES_KEY,
        SAVED_TEAMS_KEY,
        SAVED_ENEMIES_KEY,
      ].includes(key)
    ) {
      return;
    }

    await this.driveSyncState.markLocalChange();
  }

  private async replaceSavedTeams(teams: SavedTeam[]): Promise<void> {
    this.savedTeams.set(teams);
    await this.persistJson(SAVED_TEAMS_KEY, teams);
  }

  private async replaceCharacterBoxes(boxes: CharacterBox[]): Promise<void> {
    this.characterBoxes.set(boxes);
    await this.persistJson(CHARACTER_BOXES_KEY, boxes);
  }

  private async replaceSavedEnemies(enemies: SavedEnemy[]): Promise<void> {
    this.savedEnemies.set(enemies);
    await this.persistJson(SAVED_ENEMIES_KEY, enemies);
  }

  private async replaceCrewForgeImageProfiles(profiles: CrewForgeImageProfile[]): Promise<void> {
    this.userCrewForgeImageProfiles.set(profiles);
    await this.persistJson(CREW_FORGE_IMAGE_PROFILES_KEY, profiles);
  }

  private resolveDetectedCoreCount(): number {
    const hardwareConcurrency = globalThis.navigator?.hardwareConcurrency;

    if (!Number.isFinite(hardwareConcurrency)) {
      return 8;
    }

    return Math.max(1, Math.min(16, Math.floor(hardwareConcurrency ?? 8)));
  }

  private normalizeAutoTeamBuilderWorkerPreference(
    preference: AutoTeamBuilderWorkerPreference | null | undefined,
    detectedCoreCount = this.resolveDetectedCoreCount(),
  ): AutoTeamBuilderWorkerPreference {
    const mode = preference?.mode === 'manual' ? 'manual' : 'auto';
    const manualCount = Number.isFinite(preference?.manualCount)
      ? Math.floor(preference?.manualCount ?? 1)
      : AUTO_TEAM_BUILDER_DEFAULT_WORKER_PREFERENCE.manualCount;

    return {
      mode,
      manualCount: Math.max(1, Math.min(detectedCoreCount, manualCount)),
    };
  }

  private normalizeSavedTeam(
    team: Pick<SavedTeam, 'name' | 'notes' | 'shipId' | 'slots'> & Partial<SavedTeam>,
    existing?: SavedTeam,
  ): SavedTeam {
    const now = new Date().toISOString();

    return {
      id: this.normalizeEntityId(team.id) ?? existing?.id ?? this.createTeamId(),
      name: this.normalizeTeamName(team.name),
      slots: this.normalizeTeamSlots(team.slots),
      shipId: this.normalizeShipId(team.shipId),
      notes: this.normalizeNotes(team.notes),
      createdAt: this.normalizeTimestamp(team.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(team.updatedAt, now),
    };
  }

  private normalizeCharacterBox(
    box: Pick<CharacterBox, 'name' | 'characterIds'> & Partial<CharacterBox>,
    existing?: CharacterBox,
  ): CharacterBox | null {
    const normalizedName = typeof box.name === 'string' ? box.name.trim() : '';

    if (!normalizedName.length) {
      return null;
    }

    const now = new Date().toISOString();

    return {
      id: this.normalizeEntityId(box.id) ?? existing?.id ?? this.createCharacterBoxId(),
      name: normalizedName,
      characterIds: this.normalizePositiveIntegerCollection(box.characterIds),
      createdAt: this.normalizeTimestamp(box.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(box.updatedAt, now),
    };
  }

  private normalizeSavedEnemy(
    enemy: Pick<
      SavedEnemy,
      | 'name'
      | 'notes'
      | 'imageDataUrl'
      | 'selectedTypes'
      | 'selectedClasses'
      | 'requiredAbilities'
      | 'enemyMechanics'
      | 'requireAllSelectedTypesInTeam'
      | 'requireAllSelectedClassesPerCharacter'
    > &
      Partial<SavedEnemy>,
    existing?: SavedEnemy,
  ): SavedEnemy {
    const now = new Date().toISOString();

    return {
      id: this.normalizeEntityId(enemy.id) ?? existing?.id ?? this.createEnemyId(),
      name: this.normalizeEnemyName(enemy.name),
      notes: this.normalizeNotes(enemy.notes),
      imageDataUrl: this.normalizeEnemyImageDataUrl(enemy.imageDataUrl),
      selectedTypes: this.normalizeStringCollection(enemy.selectedTypes, {
        mapValue: (value) => value.toUpperCase(),
      }),
      selectedClasses: this.normalizeStringCollection(enemy.selectedClasses),
      requiredAbilities: this.normalizeRequiredAbilities(enemy.requiredAbilities),
      enemyMechanics: normalizeEnemyMechanicRequirements(enemy.enemyMechanics),
      requireAllSelectedTypesInTeam: Boolean(enemy.requireAllSelectedTypesInTeam),
      requireAllSelectedClassesPerCharacter: Boolean(enemy.requireAllSelectedClassesPerCharacter),
      createdAt: this.normalizeTimestamp(enemy.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(enemy.updatedAt, now),
    };
  }

  private normalizeCrewForgeImageProfile(
    profile:
      | (Pick<
          CrewForgeImageProfile,
          | 'name'
          | 'source'
          | 'imageWidth'
          | 'imageHeight'
          | 'slotDefinitions'
          | 'preprocess'
          | 'examples'
          | 'exemplars'
        > &
          Partial<CrewForgeImageProfile>)
      | null
      | undefined,
    existing?: CrewForgeImageProfile,
  ): CrewForgeImageProfile | null {
    if (!profile) {
      return null;
    }

    const normalizedName = typeof profile.name === 'string' ? profile.name.trim() : '';

    if (!normalizedName.length) {
      return null;
    }

    const imageWidth = this.normalizePositiveInteger(profile.imageWidth);
    const imageHeight = this.normalizePositiveInteger(profile.imageHeight);

    if (!imageWidth || !imageHeight) {
      return null;
    }

    const now = new Date().toISOString();
    const baseProfile: CrewForgeImageProfile = {
      id: this.normalizeEntityId(profile.id) ?? existing?.id ?? this.createCrewForgeImageProfileId(),
      name: normalizedName,
      source: profile.source === 'built-in' ? 'built-in' : 'user',
      imageWidth,
      imageHeight,
      slotDefinitions: this.normalizeCrewForgeImageSlotDefinitions(profile.slotDefinitions),
      preprocess: this.normalizeCrewForgeImagePreprocessConfig(profile.preprocess),
      examples: [],
      exemplars: [],
      createdAt: this.normalizeTimestamp(profile.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(profile.updatedAt, now),
    };

    baseProfile.examples = (Array.isArray(profile.examples) ? profile.examples : [])
      .map((example) =>
        this.normalizeCrewForgeImageExample(example, undefined, baseProfile.imageWidth, baseProfile.imageHeight),
      )
      .filter((example): example is CrewForgeImageExample => Boolean(example));
    baseProfile.exemplars = (Array.isArray(profile.exemplars) ? profile.exemplars : [])
      .map((exemplar) => this.normalizeCrewForgeImageExemplar(exemplar, undefined, baseProfile))
      .filter((exemplar): exemplar is CrewForgeImageExemplar => Boolean(exemplar));

    return baseProfile;
  }

  private normalizeCrewForgeImageSlotDefinitions(
    slotDefinitions: CrewForgeImageSlotDefinition[] | undefined,
  ): CrewForgeImageSlotDefinition[] {
    const rawByKey = new Map(
      (Array.isArray(slotDefinitions) ? slotDefinitions : []).map((slot) => [slot.key, slot] as const),
    );

    return CREW_FORGE_IMAGE_SLOT_BLUEPRINTS.map((blueprint) => {
      const raw = rawByKey.get(blueprint.key);

      return {
        key: blueprint.key,
        label: blueprint.label,
        role: blueprint.role,
        x: this.normalizeNonNegativeInteger(raw?.x),
        y: this.normalizeNonNegativeInteger(raw?.y),
        width: this.normalizeNonNegativeInteger(raw?.width),
        height: this.normalizeNonNegativeInteger(raw?.height),
      };
    });
  }

  private normalizeCrewForgeImagePreprocessConfig(
    preprocess: CrewForgeImagePreprocessConfig | undefined,
  ): CrewForgeImagePreprocessConfig {
    const fingerprintSize = this.normalizePositiveInteger(preprocess?.fingerprintSize) ?? 16;
    const matchThreshold = this.normalizeUnitInterval(preprocess?.matchThreshold, 0.92);
    const emptyVarianceThreshold = this.normalizeUnitInterval(
      preprocess?.emptyVarianceThreshold,
      0.005,
    );

    return {
      fingerprintSize: Math.max(8, Math.min(32, fingerprintSize)),
      contrast: this.normalizeNumber(preprocess?.contrast, 1),
      brightness: this.normalizeNumber(preprocess?.brightness, 0),
      grayscale: preprocess?.grayscale !== false,
      invert: Boolean(preprocess?.invert),
      blurRadius: Math.max(0, Math.min(12, this.normalizeNumber(preprocess?.blurRadius, 0))),
      matchThreshold,
      emptyVarianceThreshold,
    };
  }

  private normalizeCrewForgeImageExample(
    example:
      | (Pick<CrewForgeImageExample, 'name' | 'imageDataUrl' | 'imageWidth' | 'imageHeight'> &
          Partial<CrewForgeImageExample>)
      | null
      | undefined,
    existing: CrewForgeImageExample | undefined,
    imageWidth: number,
    imageHeight: number,
  ): CrewForgeImageExample | null {
    if (!example) {
      return null;
    }

    const normalizedImageDataUrl = this.normalizeEnemyImageDataUrl(example.imageDataUrl);

    if (!normalizedImageDataUrl) {
      return null;
    }

    const now = new Date().toISOString();

    return {
      id: this.normalizeEntityId(example.id) ?? existing?.id ?? this.createCrewForgeImageExampleId(),
      name: typeof example.name === 'string' && example.name.trim().length ? example.name.trim() : 'Example',
      imageDataUrl: normalizedImageDataUrl,
      imageWidth: this.normalizePositiveInteger(example.imageWidth) ?? imageWidth,
      imageHeight: this.normalizePositiveInteger(example.imageHeight) ?? imageHeight,
      createdAt: this.normalizeTimestamp(example.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(example.updatedAt, now),
    };
  }

  private normalizeCrewForgeImageExemplar(
    exemplar:
      | (Pick<CrewForgeImageExemplar, 'slotKey' | 'characterId' | 'fingerprint' | 'cropDataUrl'> &
          Partial<CrewForgeImageExemplar>)
      | null
      | undefined,
    existing: CrewForgeImageExemplar | undefined,
    profile: CrewForgeImageProfile,
  ): CrewForgeImageExemplar | null {
    if (!exemplar) {
      return null;
    }

    const slotKey = this.normalizeEntityId(exemplar.slotKey);
    const slotDefinition = profile.slotDefinitions.find((slot) => slot.key === slotKey);
    const characterId = this.normalizePositiveInteger(exemplar.characterId);
    const cropDataUrl = this.normalizeEnemyImageDataUrl(exemplar.cropDataUrl);

    if (!slotDefinition || !characterId || !cropDataUrl) {
      return null;
    }

    const fingerprintLength = profile.preprocess.fingerprintSize * profile.preprocess.fingerprintSize;
    const fingerprint = Array.isArray(exemplar.fingerprint)
      ? exemplar.fingerprint
          .map((value) => this.normalizeUnitInterval(value, -1))
          .filter((value) => value >= 0)
          .slice(0, fingerprintLength)
      : [];

    if (fingerprint.length !== fingerprintLength) {
      return null;
    }

    const now = new Date().toISOString();

    return {
      id: this.normalizeEntityId(exemplar.id) ?? existing?.id ?? this.createCrewForgeImageExemplarId(),
      slotKey: slotDefinition.key,
      characterId,
      fingerprint,
      cropDataUrl,
      createdAt: this.normalizeTimestamp(exemplar.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(exemplar.updatedAt, now),
    };
  }

  private normalizeEntityId(teamId: string | undefined): string | null {
    if (typeof teamId !== 'string') {
      return null;
    }

    const normalizedTeamId = teamId.trim();

    return normalizedTeamId.length ? normalizedTeamId : null;
  }

  private normalizeTeamName(teamName: string | undefined): string {
    if (typeof teamName !== 'string') {
      return this.i18n.translate('common.defaults.untitledCrew');
    }

    return teamName.trim() || this.i18n.translate('common.defaults.untitledCrew');
  }

  private normalizeEnemyName(enemyName: string | undefined): string {
    if (typeof enemyName !== 'string') {
      return this.i18n.translate('common.defaults.untitledEnemy');
    }

    return enemyName.trim() || this.i18n.translate('common.defaults.untitledEnemy');
  }

  private normalizeTeamSlots(slots: Array<number | null> | undefined): Array<number | null> {
    return Array.from({ length: 6 }, (_, index) => {
      const value = slots?.[index];

      return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
    });
  }

  private normalizeShipId(shipId: number | null | undefined): number | null {
    return typeof shipId === 'number' && Number.isInteger(shipId) && shipId > 0 ? shipId : null;
  }

  private normalizeNotes(notes: string | undefined): string {
    return typeof notes === 'string' ? notes.trim() : '';
  }

  private normalizeEnemyImageDataUrl(imageDataUrl: string | null | undefined): string | null {
    if (typeof imageDataUrl !== 'string') {
      return null;
    }

    const normalizedImageDataUrl = imageDataUrl.trim();

    if (!normalizedImageDataUrl.startsWith('data:image/')) {
      return null;
    }

    return normalizedImageDataUrl.includes(';base64,') ? normalizedImageDataUrl : null;
  }

  private normalizeStringCollection(
    values: string[] | undefined,
    options?: { mapValue?: (value: string) => string },
  ): string[] {
    if (!Array.isArray(values)) {
      return [];
    }

    const normalizedValues = new Set<string>();

    values.forEach((value) => {
      if (typeof value !== 'string') {
        return;
      }

      const normalizedValue = (options?.mapValue?.(value.trim()) ?? value.trim()).trim();

      if (!normalizedValue.length) {
        return;
      }

      normalizedValues.add(normalizedValue);
    });

    return [...normalizedValues];
  }

  private normalizePositiveIntegerCollection(values: number[] | undefined): number[] {
    if (!Array.isArray(values)) {
      return [];
    }

    const normalizedValues = new Set<number>();

    values.forEach((value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        return;
      }

      normalizedValues.add(value);
    });

    return [...normalizedValues];
  }

  private normalizePositiveInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
  }

  private normalizeNonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
  }

  private normalizeNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private normalizeUnitInterval(value: unknown, fallback: number): number {
    const normalizedValue = this.normalizeNumber(value, fallback);

    return Math.max(0, Math.min(1, normalizedValue));
  }

  private normalizeRequiredAbilities(
    requirements: AutoBuildAbilityRequirement[] | undefined,
  ): AutoBuildAbilityRequirement[] {
    if (!Array.isArray(requirements)) {
      return [];
    }

    const normalizedRequirements = new Map<string, AutoBuildAbilityRequirement>();

    requirements.forEach((requirement) => {
      if (!requirement || typeof requirement !== 'object') {
        return;
      }

      const abilityKey =
        typeof requirement.abilityKey === 'string'
          ? LEGACY_ABILITY_KEY_ALIASES[requirement.abilityKey.trim()] ?? requirement.abilityKey.trim()
          : '';

      if (!abilityKey.length) {
        return;
      }

      const minTurns =
        typeof requirement.minTurns === 'number' &&
        Number.isInteger(requirement.minTurns) &&
        requirement.minTurns > 0
          ? requirement.minTurns
          : null;
      const slotTokens = this.normalizeStringCollection(requirement.slotTokens, {
        mapValue: (value) => value.toUpperCase(),
      });
      const requiredCharacterCount =
        typeof requirement.requiredCharacterCount === 'number' &&
        Number.isInteger(requirement.requiredCharacterCount) &&
        requirement.requiredCharacterCount > 0
          ? requirement.requiredCharacterCount
          : 1;
      const key = `${abilityKey}|${minTurns ?? 'none'}|${slotTokens.join(',')}`;
      const existing = normalizedRequirements.get(key);

      if (existing) {
        existing.requiredCharacterCount = Math.max(
          existing.requiredCharacterCount,
          requiredCharacterCount,
        );
        return;
      }

      normalizedRequirements.set(key, {
        abilityKey,
        minTurns,
        slotTokens,
        requiredCharacterCount,
      });
    });

    return [...normalizedRequirements.values()];
  }

  private normalizeTimestamp(value: string | undefined, fallback: string): string {
    if (typeof value !== 'string') {
      return fallback;
    }

    const normalizedValue = value.trim();

    if (!normalizedValue.length || Number.isNaN(Date.parse(normalizedValue))) {
      return fallback;
    }

    return normalizedValue;
  }

  private createTeamId(): string {
    return `crew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createEnemyId(): string {
    return `enemy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createCharacterBoxId(): string {
    return `box-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createCrewForgeCopiedProfileName(name: string): string {
    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (!trimmedName.length) {
      return 'Profile Copy';
    }

    return /\bcopy$/i.test(trimmedName) ? trimmedName : `${trimmedName} Copy`;
  }

  private createCrewForgeImageProfileId(): string {
    return `crew-forge-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createCrewForgeImageExampleId(): string {
    return `crew-forge-example-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createCrewForgeImageExemplarId(): string {
    return `crew-forge-exemplar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

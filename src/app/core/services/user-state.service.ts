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
import { AUTO_TEAM_BUILDER_TYPES } from '../models/auto-team-builder.models';
import {
  cloneBattleRequirements,
  normalizeBattleRequirementsWithLegacyFallback,
} from './auto-team-builder-battle.utils';
import {
  cloneRequiredCharacterGroups,
  expandRequiredAbilitiesToCharacterGroups,
} from './required-character-groups.utils';
import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  RUMBLE_ACTIVE_SLOT_COUNT,
  RUMBLE_BENCH_SLOT_COUNT,
  RUMBLE_BUFF_FOCUS_RANKS,
  RUMBLE_BUFF_FOCUS_STATS,
  type RumbleBuildInput,
  type RumbleBuffFocusPreference,
  type RumbleTeamSlotRole,
} from '../models/auto-team-builder-rumble.models';
import {
  type SavedRumbleTeam,
  type SavedRumbleTeamResult,
  type SavedRumbleTeamSlot,
} from '../models/saved-rumble-team.models';
import { AppI18nService } from './app-i18n.service';
import { DriveSyncStateService } from './drive-sync-state.service';
import { normalizeEnemyMechanicRequirements } from './enemy-mechanic-draft.utils';

const FAVORITES_KEY = 'favoriteCharacterIds';
const FAVORITE_SHIPS_KEY = 'favoriteShipIds';
const RECENTS_KEY = 'recentCharacterIds';
const CHARACTER_BOXES_KEY = 'characterBoxes';
const SAVED_TEAMS_KEY = 'savedTeams';
const SAVED_ENEMIES_KEY = 'savedEnemies';
const SAVED_RUMBLE_TEAMS_KEY = 'savedRumbleTeams';
const CREW_FORGE_IMAGE_PROFILES_KEY = 'crewForgeImageProfiles';
const CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY = 'crewForgeLastImageProfileId';
const AUTO_TEAM_BUILDER_WORKER_PREFERENCE_KEY = 'autoTeamBuilderWorkerPreference';
const AUTO_TEAM_BUILDER_MANUAL_WORKER_MAX_RATIO = 0.65;
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
  manualMaxCount: number;
  manualMaxPercent: number;
}

type UserStateHydrationDomain =
  | 'favorites'
  | 'favoriteShips'
  | 'recents'
  | 'characterBoxes'
  | 'savedTeams'
  | 'savedEnemies'
  | 'savedRumbleTeams'
  | 'crewForgeImageProfiles'
  | 'autoTeamBuilderWorkerPreference';

@Injectable({ providedIn: 'root' })
export class UserStateService {
  public readonly favoriteCharacterIds = signal<number[]>([]);
  public readonly favoriteShipIds = signal<number[]>([]);
  public readonly recentCharacterIds = signal<number[]>([]);
  public readonly characterBoxes = signal<CharacterBox[]>([]);
  public readonly savedTeams = signal<SavedTeam[]>([]);
  public readonly savedEnemies = signal<SavedEnemy[]>([]);
  public readonly savedRumbleTeams = signal<SavedRumbleTeam[]>([]);
  public readonly crewForgeImageProfiles = computed<CrewForgeImageProfile[]>(() => [
    ...BUILT_IN_CREW_FORGE_IMAGE_PROFILES,
    ...this.userCrewForgeImageProfiles(),
  ]);
  public readonly crewForgeLastImageProfileId = signal<string | null>(null);
  public readonly autoTeamBuilderWorkerPreference = signal<AutoTeamBuilderWorkerPreference>(
    AUTO_TEAM_BUILDER_DEFAULT_WORKER_PREFERENCE,
  );

  private readonly hydratedDomains = new Set<UserStateHydrationDomain>();
  private readonly hydrationPromises = new Map<UserStateHydrationDomain, Promise<void>>();
  private readonly userCrewForgeImageProfiles = signal<CrewForgeImageProfile[]>([]);

  public constructor(
    private readonly i18n: AppI18nService,
    @Optional() private readonly driveSyncState?: DriveSyncStateService,
  ) {}

  public async ready(): Promise<void> {
    await Promise.all([
      this.readyFavoriteCharacterIds(),
      this.readyFavoriteShipIds(),
      this.readyRecentCharacterIds(),
      this.readyCharacterBoxes(),
      this.readySavedTeams(),
      this.readySavedEnemies(),
      this.readySavedRumbleTeams(),
      this.readyCrewForgeImageProfiles(),
      this.readyAutoTeamBuilderWorkerPreference(),
    ]);
  }

  public async readyFavoriteCharacterIds(): Promise<void> {
    await this.ensureHydrated('favorites', async () => {
      this.favoriteCharacterIds.set(await this.readJson<number[]>(FAVORITES_KEY, []));
    });
  }

  public async readyFavoriteShipIds(): Promise<void> {
    await this.ensureHydrated('favoriteShips', async () => {
      this.favoriteShipIds.set(await this.readJson<number[]>(FAVORITE_SHIPS_KEY, []));
    });
  }

  public async readyRecentCharacterIds(): Promise<void> {
    await this.ensureHydrated('recents', async () => {
      this.recentCharacterIds.set(await this.readJson<number[]>(RECENTS_KEY, []));
    });
  }

  public async readyCharacterBoxes(): Promise<void> {
    await this.ensureHydrated('characterBoxes', async () => {
      const characterBoxes = await this.readJson<CharacterBox[]>(CHARACTER_BOXES_KEY, []);
      this.characterBoxes.set(
        characterBoxes
          .map((box) => this.normalizeCharacterBox(box))
          .filter((box): box is CharacterBox => Boolean(box)),
      );
    });
  }

  public async readySavedTeams(): Promise<void> {
    await this.ensureHydrated('savedTeams', async () => {
      const teams = await this.readJson<SavedTeam[]>(SAVED_TEAMS_KEY, []);
      this.savedTeams.set(teams.map((team) => this.normalizeSavedTeam(team)));
    });
  }

  public async readySavedEnemies(): Promise<void> {
    await this.ensureHydrated('savedEnemies', async () => {
      const enemies = await this.readJson<SavedEnemy[]>(SAVED_ENEMIES_KEY, []);
      this.savedEnemies.set(enemies.map((enemy) => this.normalizeSavedEnemy(enemy)));
    });
  }

  public async readySavedRumbleTeams(): Promise<void> {
    await this.ensureHydrated('savedRumbleTeams', async () => {
      const rumbleTeams = await this.readJson<SavedRumbleTeam[]>(SAVED_RUMBLE_TEAMS_KEY, []);
      this.savedRumbleTeams.set(
        rumbleTeams.map((rumbleTeam) => this.normalizeSavedRumbleTeam(rumbleTeam)),
      );
    });
  }

  public async readyCrewForgeImageProfiles(): Promise<void> {
    await this.ensureHydrated('crewForgeImageProfiles', async () => {
      const [crewForgeImageProfiles, crewForgeLastImageProfileId] = await Promise.all([
        this.readJson<CrewForgeImageProfile[]>(CREW_FORGE_IMAGE_PROFILES_KEY, []),
        this.readJson<string | null>(CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY, null),
      ]);
      this.userCrewForgeImageProfiles.set(
        crewForgeImageProfiles
          .map((profile) => this.normalizeCrewForgeImageProfile(profile))
          .filter((profile): profile is CrewForgeImageProfile => {
            if (!profile) {
              return false;
            }

            return (
              profile.source === 'user' && !BUILT_IN_CREW_FORGE_IMAGE_PROFILE_IDS.has(profile.id)
            );
          }),
      );
      this.crewForgeLastImageProfileId.set(
        this.getCrewForgeImageProfileById(crewForgeLastImageProfileId ?? '')?.id ?? null,
      );
    });
  }

  public async readyAutoTeamBuilderWorkerPreference(): Promise<void> {
    await this.ensureHydrated('autoTeamBuilderWorkerPreference', async () => {
      const autoTeamBuilderWorkerPreference =
        await this.readJson<AutoTeamBuilderWorkerPreference>(
          AUTO_TEAM_BUILDER_WORKER_PREFERENCE_KEY,
          AUTO_TEAM_BUILDER_DEFAULT_WORKER_PREFERENCE,
        );
      this.autoTeamBuilderWorkerPreference.set(
        this.normalizeAutoTeamBuilderWorkerPreference(autoTeamBuilderWorkerPreference),
      );
    });
  }

  public async toggleFavorite(characterId: number): Promise<void> {
    await this.readyFavoriteCharacterIds();
    const current = this.favoriteCharacterIds();
    const next = current.includes(characterId)
      ? current.filter((value) => value !== characterId)
      : [characterId, ...current];

    this.favoriteCharacterIds.set(next);
    await this.persistJson(FAVORITES_KEY, next);
  }

  public async setFavoriteCharacterIds(characterIds: number[]): Promise<void> {
    await this.readyFavoriteCharacterIds();
    const next = [...new Set(characterIds.filter((value) => Number.isInteger(value) && value > 0))];

    this.favoriteCharacterIds.set(next);
    await this.persistJson(FAVORITES_KEY, next);
  }

  public async clearAllFavoriteCharacterIds(): Promise<void> {
    await this.setFavoriteCharacterIds([]);
  }

  public async toggleShipFavorite(shipId: number): Promise<void> {
    await this.readyFavoriteShipIds();
    const current = this.favoriteShipIds();
    const next = current.includes(shipId)
      ? current.filter((value) => value !== shipId)
      : [shipId, ...current];

    this.favoriteShipIds.set(next);
    await this.persistJson(FAVORITE_SHIPS_KEY, next);
  }

  public async setFavoriteShipIds(shipIds: number[]): Promise<void> {
    await this.readyFavoriteShipIds();
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
    await this.readyCharacterBoxes();

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
    await this.readyCharacterBoxes();
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
    await this.readyCharacterBoxes();
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
    await this.readyCharacterBoxes();

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

    return (
      this.crewForgeImageProfiles().find((profile) => profile.id === normalizedProfileId) ?? null
    );
  }

  public findCrewForgeImageProfileByDimensions(
    imageWidth: number,
    imageHeight: number,
  ): CrewForgeImageProfile | null {
    if (
      !Number.isInteger(imageWidth) ||
      imageWidth <= 0 ||
      !Number.isInteger(imageHeight) ||
      imageHeight <= 0
    ) {
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
      exactProfiles.find((profile) => profile.id === preferredProfileId) ?? exactProfiles[0] ?? null
    );
  }

  public async saveCrewForgeImageProfile(
    input: Omit<CrewForgeImageProfile, 'id' | 'source' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<CrewForgeImageProfile, 'id' | 'source' | 'createdAt' | 'updatedAt'>>,
  ): Promise<CrewForgeImageProfile | null> {
    await this.readyCrewForgeImageProfiles();

    const requestedId =
      typeof input.id === 'string' && BUILT_IN_CREW_FORGE_IMAGE_PROFILE_IDS.has(input.id)
        ? undefined
        : input.id;
    const existing = this.userCrewForgeImageProfiles().find(
      (profile) => profile.id === requestedId,
    );
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
    await this.readyCrewForgeImageProfiles();
    const normalizedProfileId = this.normalizeEntityId(profileId);

    if (!normalizedProfileId || BUILT_IN_CREW_FORGE_IMAGE_PROFILE_IDS.has(normalizedProfileId)) {
      return;
    }

    const next = this.userCrewForgeImageProfiles().filter(
      (profile) => profile.id !== normalizedProfileId,
    );

    if (next.length === this.userCrewForgeImageProfiles().length) {
      return;
    }

    await this.replaceCrewForgeImageProfiles(next);

    if (this.crewForgeLastImageProfileId() === normalizedProfileId) {
      const nextPreferredId =
        this.crewForgeImageProfiles().find((profile) => profile.id !== normalizedProfileId)?.id ??
        null;
      this.crewForgeLastImageProfileId.set(nextPreferredId);
      await this.persistJson(CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY, nextPreferredId);
    }
  }

  public async setCrewForgeLastImageProfileId(profileId: string | null): Promise<void> {
    await this.readyCrewForgeImageProfiles();
    const normalizedProfileId =
      profileId === null ? null : (this.getCrewForgeImageProfileById(profileId)?.id ?? null);

    this.crewForgeLastImageProfileId.set(normalizedProfileId);
    await this.persistJson(CREW_FORGE_LAST_IMAGE_PROFILE_ID_KEY, normalizedProfileId);
  }

  public async saveCrewForgeImageExample(
    profileId: string,
    input: Omit<CrewForgeImageExample, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<CrewForgeImageProfile | null> {
    await this.readyCrewForgeImageProfiles();
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
    await this.readyCrewForgeImageProfiles();
    const profile = await this.resolveCrewForgeImageProfileForMutation(profileId);

    if (!profile) {
      return null;
    }

    const existing =
      profile.exemplars.find((exemplar) => exemplar.id === input.id) ??
      profile.exemplars.find(
        (exemplar) =>
          exemplar.slotKey === input.slotKey && exemplar.characterId === input.characterId,
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
        ? profile.exemplars.map((exemplar) =>
            exemplar.id === nextExemplar.id ? nextExemplar : exemplar,
          )
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
    const manualMaxCount = this.resolveAutoTeamBuilderManualWorkerMaxCount(detectedCoreCount);

    return {
      ...normalizedPreference,
      detectedCoreCount,
      manualMaxCount,
      manualMaxPercent: Math.floor((manualMaxCount * 100) / detectedCoreCount),
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
    await this.readyAutoTeamBuilderWorkerPreference();
    const normalizedPreference = this.normalizeAutoTeamBuilderWorkerPreference(preference);

    this.autoTeamBuilderWorkerPreference.set(normalizedPreference);
    await this.persistJson(AUTO_TEAM_BUILDER_WORKER_PREFERENCE_KEY, normalizedPreference);
  }

  public async markRecent(characterId: number): Promise<void> {
    await this.readyRecentCharacterIds();
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
    await this.readySavedTeams();

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
    await Promise.all([this.readySavedTeams(), this.readySavedEnemies()]);
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
    await this.pruneAssociatedTeamIdsFromEnemies(targetTeamIds);
  }

  private async pruneAssociatedTeamIdsFromEnemies(
    removedTeamIds: ReadonlySet<string>,
  ): Promise<void> {
    if (!removedTeamIds.size) {
      return;
    }

    const enemies = this.savedEnemies();
    let mutated = false;

    const next = enemies.map((enemy) => {
      const associated = enemy.associatedTeamIds ?? [];

      if (!associated.length) {
        return enemy;
      }

      const filtered = associated.filter((teamId) => !removedTeamIds.has(teamId));

      if (filtered.length === associated.length) {
        return enemy;
      }

      mutated = true;
      return {
        ...enemy,
        associatedTeamIds: filtered,
        updatedAt: new Date().toISOString(),
      };
    });

    if (mutated) {
      await this.replaceSavedEnemies(next);
    }
  }

  public async clearAllSavedTeams(): Promise<void> {
    await this.readySavedTeams();
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
    input: Omit<
      SavedEnemy,
      'id' | 'createdAt' | 'updatedAt' | 'requiredCharacterGroups' | 'battleRequirements'
    > &
      Partial<Pick<SavedEnemy, 'requiredCharacterGroups' | 'battleRequirements'>> & { id?: string },
  ): Promise<SavedEnemy> {
    await this.readySavedEnemies();

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
    await this.readySavedEnemies();
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
    await this.readySavedEnemies();
    await this.replaceSavedEnemies([]);
  }

  public async mergeImportedTeams(
    teams: SavedTeam[],
  ): Promise<{ addedCount: number; updatedCount: number; teams: SavedTeam[] }> {
    await this.readySavedTeams();

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
    await this.readySavedEnemies();

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

  public getSavedRumbleTeamById(rumbleTeamId: string): SavedRumbleTeam | null {
    const normalizedRumbleTeamId = this.normalizeEntityId(rumbleTeamId);

    if (!normalizedRumbleTeamId) {
      return null;
    }

    return (
      this.savedRumbleTeams().find((rumbleTeam) => rumbleTeam.id === normalizedRumbleTeamId) ?? null
    );
  }

  public async saveRumbleTeam(
    input: Omit<SavedRumbleTeam, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<SavedRumbleTeam> {
    await this.readySavedRumbleTeams();

    const existing = this.savedRumbleTeams().find((rumbleTeam) => rumbleTeam.id === input.id);
    const savedRumbleTeam = this.normalizeSavedRumbleTeam(
      {
        ...input,
        id: input.id ?? this.createRumbleTeamId(),
      },
      existing,
    );
    const next = existing
      ? this.savedRumbleTeams().map((rumbleTeam) =>
          rumbleTeam.id === savedRumbleTeam.id ? savedRumbleTeam : rumbleTeam,
        )
      : [savedRumbleTeam, ...this.savedRumbleTeams()];

    await this.replaceSavedRumbleTeams(next);

    return savedRumbleTeam;
  }

  public async deleteRumbleTeam(rumbleTeamId: string): Promise<void> {
    await this.readySavedRumbleTeams();
    const normalizedRumbleTeamId = this.normalizeEntityId(rumbleTeamId);

    if (!normalizedRumbleTeamId) {
      return;
    }

    const next = this.savedRumbleTeams().filter(
      (rumbleTeam) => rumbleTeam.id !== normalizedRumbleTeamId,
    );

    if (next.length === this.savedRumbleTeams().length) {
      return;
    }

    await this.replaceSavedRumbleTeams(next);
  }

  public async clearAllSavedRumbleTeams(): Promise<void> {
    await this.readySavedRumbleTeams();
    await this.replaceSavedRumbleTeams([]);
  }

  public async mergeImportedRumbleTeams(
    rumbleTeams: SavedRumbleTeam[],
  ): Promise<{ addedCount: number; updatedCount: number; rumbleTeams: SavedRumbleTeam[] }> {
    await this.readySavedRumbleTeams();

    const currentRumbleTeams = this.savedRumbleTeams();
    const currentRumbleTeamMap = new Map(
      currentRumbleTeams.map((rumbleTeam) => [rumbleTeam.id, rumbleTeam] as const),
    );
    const mergedRumbleTeams: SavedRumbleTeam[] = [];
    const importedRumbleTeamIds = new Set<string>();
    let addedCount = 0;
    let updatedCount = 0;

    rumbleTeams.forEach((rumbleTeam) => {
      const existingRumbleTeam = currentRumbleTeamMap.get(rumbleTeam.id);
      const normalizedRumbleTeam = this.normalizeSavedRumbleTeam(
        existingRumbleTeam
          ? {
              ...rumbleTeam,
              createdAt: undefined,
              updatedAt: undefined,
            }
          : rumbleTeam,
        existingRumbleTeam,
      );

      if (importedRumbleTeamIds.has(normalizedRumbleTeam.id)) {
        return;
      }

      importedRumbleTeamIds.add(normalizedRumbleTeam.id);

      if (currentRumbleTeamMap.has(normalizedRumbleTeam.id)) {
        updatedCount += 1;
      } else {
        addedCount += 1;
      }

      mergedRumbleTeams.push(normalizedRumbleTeam);
    });

    const next = [
      ...mergedRumbleTeams,
      ...currentRumbleTeams.filter((rumbleTeam) => !importedRumbleTeamIds.has(rumbleTeam.id)),
    ];

    await this.replaceSavedRumbleTeams(next);

    return {
      addedCount,
      updatedCount,
      rumbleTeams: next,
    };
  }

  private async ensureHydrated(
    domain: UserStateHydrationDomain,
    loader: () => Promise<void>,
  ): Promise<void> {
    if (this.hydratedDomains.has(domain)) {
      return;
    }

    const existingPromise = this.hydrationPromises.get(domain);

    if (existingPromise) {
      await existingPromise;
      return;
    }

    const hydrationPromise = loader()
      .then(() => {
        this.hydratedDomains.add(domain);
      })
      .finally(() => {
        this.hydrationPromises.delete(domain);
      });

    this.hydrationPromises.set(domain, hydrationPromise);
    await hydrationPromise;
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
        SAVED_RUMBLE_TEAMS_KEY,
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

  private async replaceSavedRumbleTeams(rumbleTeams: SavedRumbleTeam[]): Promise<void> {
    this.savedRumbleTeams.set(rumbleTeams);
    await this.persistJson(SAVED_RUMBLE_TEAMS_KEY, rumbleTeams);
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
    const manualMaxCount = this.resolveAutoTeamBuilderManualWorkerMaxCount(detectedCoreCount);
    const manualCount = Number.isFinite(preference?.manualCount)
      ? Math.floor(preference?.manualCount ?? 1)
      : AUTO_TEAM_BUILDER_DEFAULT_WORKER_PREFERENCE.manualCount;

    return {
      mode,
      manualCount: Math.max(1, Math.min(manualMaxCount, manualCount)),
    };
  }

  private resolveAutoTeamBuilderManualWorkerMaxCount(detectedCoreCount: number): number {
    return Math.max(1, Math.floor(detectedCoreCount * AUTO_TEAM_BUILDER_MANUAL_WORKER_MAX_RATIO));
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
      | 'rawEnemyText'
      | 'imageDataUrl'
      | 'selectedTypes'
      | 'selectedClasses'
      | 'selectedCharacterTags'
      | 'selectedCharacterNames'
      | 'requiredAbilities'
      | 'enemyMechanics'
      | 'requireAllSelectedTypesInTeam'
      | 'requireAllSelectedClassesPerCharacter'
      | 'requireAllSelectedCharacterTagsInTeam'
      | 'requireAllSelectedCharacterNamesInTeam'
    > &
      Partial<SavedEnemy> & { associatedTeamIds?: readonly string[] | null },
    existing?: SavedEnemy,
  ): SavedEnemy {
    const now = new Date().toISOString();

    const requiredAbilities = this.normalizeRequiredAbilities(enemy.requiredAbilities);
    const enemyMechanics = normalizeEnemyMechanicRequirements(enemy.enemyMechanics);
    const requiredCharacterGroups = this.normalizeSavedEnemyRequiredCharacterGroups({
      ...enemy,
      requiredAbilities,
    });
    const battleRequirements = normalizeBattleRequirementsWithLegacyFallback({
      battles: enemy.battleRequirements,
      requiredCharacterGroups,
      enemyMechanics,
    });

    return {
      id: this.normalizeEntityId(enemy.id) ?? existing?.id ?? this.createEnemyId(),
      name: this.normalizeEnemyName(enemy.name),
      notes: this.normalizeNotes(enemy.notes),
      rawEnemyText: this.normalizeRawEnemyText(enemy.rawEnemyText),
      imageDataUrl: this.normalizeEnemyImageDataUrl(enemy.imageDataUrl),
      selectedTypes: this.normalizeStringCollection(enemy.selectedTypes, {
        mapValue: (value) => value.toUpperCase(),
      }),
      selectedClasses: this.normalizeStringCollection(enemy.selectedClasses),
      selectedCharacterTags: this.normalizeStringCollection(enemy.selectedCharacterTags ?? []),
      selectedCharacterNames: this.normalizeStringCollection(enemy.selectedCharacterNames ?? [], {
        mapValue: (value) => value.toLowerCase(),
      }),
      requiredAbilities,
      requiredCharacterGroups,
      battleRequirements,
      enemyMechanics,
      requireAllSelectedTypesInTeam: Boolean(enemy.requireAllSelectedTypesInTeam),
      requireAllSelectedClassesPerCharacter: Boolean(enemy.requireAllSelectedClassesPerCharacter),
      requireAllSelectedCharacterTagsInTeam: Boolean(
        enemy.requireAllSelectedCharacterTagsInTeam,
      ),
      requireAllSelectedCharacterNamesInTeam: Boolean(
        enemy.requireAllSelectedCharacterNamesInTeam,
      ),
      associatedTeamIds: this.normalizeAssociatedTeamIds(enemy.associatedTeamIds),
      createdAt: this.normalizeTimestamp(enemy.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(enemy.updatedAt, now),
    };
  }

  private normalizeAssociatedTeamIds(
    value: readonly string[] | null | undefined,
  ): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const result: string[] = [];

    value.forEach((entry) => {
      const normalized = this.normalizeEntityId(entry);

      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      result.push(normalized);
    });

    return result;
  }

  private normalizeSavedRumbleTeam(
    rumbleTeam: Pick<
      SavedRumbleTeam,
      | 'name'
      | 'notes'
      | 'settings'
      | 'teams'
      | 'selectedTeamIndex'
      | 'opponentActiveCharacterIds'
      | 'opponentBenchCharacterIds'
      | 'opponentAwarenessEnabled'
    > &
      Partial<SavedRumbleTeam>,
    existing?: SavedRumbleTeam,
  ): SavedRumbleTeam {
    const now = new Date().toISOString();
    const teams = (Array.isArray(rumbleTeam.teams) ? rumbleTeam.teams : [])
      .map((team) => this.normalizeSavedRumbleTeamResult(team))
      .filter((team): team is SavedRumbleTeamResult => Boolean(team))
      .slice(0, 2);
    const selectedTeamIndex =
      typeof rumbleTeam.selectedTeamIndex === 'number' &&
      Number.isInteger(rumbleTeam.selectedTeamIndex) &&
      rumbleTeam.selectedTeamIndex >= 0 &&
      rumbleTeam.selectedTeamIndex < Math.max(1, teams.length)
        ? rumbleTeam.selectedTeamIndex
        : 0;

    return {
      id: this.normalizeEntityId(rumbleTeam.id) ?? existing?.id ?? this.createRumbleTeamId(),
      name: this.normalizeRumbleTeamName(rumbleTeam.name),
      notes: this.normalizeNotes(rumbleTeam.notes),
      settings: this.normalizeRumbleBuildInput(rumbleTeam.settings),
      teams,
      selectedTeamIndex,
      opponentActiveCharacterIds: this.normalizeNullableCharacterIdSlots(
        rumbleTeam.opponentActiveCharacterIds,
        RUMBLE_ACTIVE_SLOT_COUNT,
      ),
      opponentBenchCharacterIds: this.normalizeNullableCharacterIdSlots(
        rumbleTeam.opponentBenchCharacterIds,
        RUMBLE_BENCH_SLOT_COUNT,
      ),
      opponentAwarenessEnabled: Boolean(rumbleTeam.opponentAwarenessEnabled),
      createdAt: this.normalizeTimestamp(rumbleTeam.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(rumbleTeam.updatedAt, now),
    };
  }

  private normalizeSavedRumbleTeamResult(
    result: Partial<SavedRumbleTeamResult> | null | undefined,
  ): SavedRumbleTeamResult | null {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const activeSlots = this.normalizeSavedRumbleTeamSlots(
      result.activeSlots,
      'active',
      RUMBLE_ACTIVE_SLOT_COUNT,
    );
    const benchSlots = this.normalizeSavedRumbleTeamSlots(
      result.benchSlots,
      'bench',
      RUMBLE_BENCH_SLOT_COUNT,
    );

    if (!activeSlots.length && !benchSlots.length) {
      return null;
    }

    return {
      activeSlots,
      benchSlots,
      candidateCount: this.normalizeNonNegativeInteger(result.candidateCount),
      classCoverage: this.normalizeStringCollection(result.classCoverage),
      droppedClasses: this.normalizeStringCollection(result.droppedClasses),
      droppedTypes: this.normalizeAutoBuilderTypes(result.droppedTypes),
      input: this.normalizeRumbleBuildInput(result.input),
      requestedClasses: this.normalizeStringCollection(result.requestedClasses),
      requestedTypes: this.normalizeAutoBuilderTypes(result.requestedTypes),
      resolvedClasses: this.normalizeStringCollection(result.resolvedClasses),
      resolvedTypes: this.normalizeAutoBuilderTypes(result.resolvedTypes),
      roleCoverage: this.normalizeRumbleRoleCoverage(result.roleCoverage),
      selectedCount: Math.max(
        activeSlots.length + benchSlots.length,
        this.normalizeNonNegativeInteger(result.selectedCount),
      ),
      topFactors: this.normalizeStringCollection(result.topFactors),
      totalScore: this.normalizeNumber(result.totalScore, 0),
      typeCoverage: this.normalizeStringCollection(result.typeCoverage, {
        mapValue: (value) => value.toUpperCase(),
      }),
    };
  }

  private normalizeSavedRumbleTeamSlots(
    slots: SavedRumbleTeamSlot[] | undefined,
    role: RumbleTeamSlotRole,
    maxCount: number,
  ): SavedRumbleTeamSlot[] {
    return (Array.isArray(slots) ? slots : [])
      .map((slot, fallbackIndex) => {
        if (!slot || typeof slot !== 'object') {
          return null;
        }

        const characterId = this.normalizePositiveInteger(slot.characterId);

        if (!characterId) {
          return null;
        }

        const index =
          typeof slot.index === 'number' &&
          Number.isInteger(slot.index) &&
          slot.index >= 0 &&
          slot.index < maxCount
            ? slot.index
            : fallbackIndex;

        return {
          characterId,
          index,
          reasonChips: this.normalizeStringCollection(slot.reasonChips),
          role,
          score: this.normalizeNumber(slot.score, 0),
        };
      })
      .filter((slot): slot is SavedRumbleTeamSlot => Boolean(slot))
      .slice(0, maxCount);
  }

  private normalizeRumbleBuildInput(
    input: Partial<RumbleBuildInput> | null | undefined,
  ): RumbleBuildInput {
    return {
      types: this.normalizeAutoBuilderTypes(input?.types),
      selectedClasses: this.normalizeStringCollection(input?.selectedClasses),
      onlySelectedTypes: Boolean(input?.onlySelectedTypes),
      onlySelectedClasses: Boolean(input?.onlySelectedClasses),
      favoritesOnly: Boolean(input?.favoritesOnly),
      favoriteCharacterIds: this.normalizePositiveIntegerCollection(input?.favoriteCharacterIds),
      characterBoxId: this.normalizeEntityId(input?.characterBoxId ?? undefined),
      candidateCharacterIds: input?.candidateCharacterIds
        ? this.normalizePositiveIntegerCollection(input.candidateCharacterIds)
        : undefined,
      opponentSlots: [],
      buffFocus: this.normalizeRumbleBuffFocus(input?.buffFocus),
      requireFullTeam: input?.requireFullTeam !== false,
    };
  }

  private normalizeRumbleBuffFocus(
    buffFocus: RumbleBuffFocusPreference[] | undefined,
  ): RumbleBuffFocusPreference[] {
    const focusByStat = new Map(
      (Array.isArray(buffFocus) ? buffFocus : [])
        .filter((preference) =>
          RUMBLE_BUFF_FOCUS_STATS.includes(preference?.stat as RumbleBuffFocusPreference['stat']),
        )
        .map(
          (preference) =>
            [
              preference.stat,
              RUMBLE_BUFF_FOCUS_RANKS.includes(preference.rank) ? preference.rank : 'ignored',
            ] as const,
        ),
    );

    return RUMBLE_BUFF_FOCUS_STATS.map((stat) => ({
      stat,
      rank:
        focusByStat.get(stat) ??
        DEFAULT_RUMBLE_BUFF_FOCUS.find((preference) => preference.stat === stat)?.rank ??
        'ignored',
    }));
  }

  private normalizeNullableCharacterIdSlots(
    values: Array<number | null> | undefined,
    count: number,
  ): Array<number | null> {
    return Array.from({ length: count }, (_value, index) => {
      const value = values?.[index];

      return this.normalizePositiveInteger(value);
    });
  }

  private normalizeAutoBuilderTypes(values: string[] | undefined): RumbleBuildInput['types'] {
    const validTypes = new Set<string>(AUTO_TEAM_BUILDER_TYPES);

    return this.normalizeStringCollection(values, {
      mapValue: (value) => value.toUpperCase(),
    }).filter((value) => validTypes.has(value)) as RumbleBuildInput['types'];
  }

  private normalizeRumbleRoleCoverage(
    values: SavedRumbleTeamResult['roleCoverage'] | undefined,
  ): SavedRumbleTeamResult['roleCoverage'] {
    const validRoles = new Set(['attacker', 'booster', 'defender', 'disruptor', 'healer', 'speed']);

    return this.normalizeStringCollection(values).filter((value) =>
      validRoles.has(value),
    ) as SavedRumbleTeamResult['roleCoverage'];
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
      id:
        this.normalizeEntityId(profile.id) ?? existing?.id ?? this.createCrewForgeImageProfileId(),
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
        this.normalizeCrewForgeImageExample(
          example,
          undefined,
          baseProfile.imageWidth,
          baseProfile.imageHeight,
        ),
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
      (Array.isArray(slotDefinitions) ? slotDefinitions : []).map(
        (slot) => [slot.key, slot] as const,
      ),
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
      id:
        this.normalizeEntityId(example.id) ?? existing?.id ?? this.createCrewForgeImageExampleId(),
      name:
        typeof example.name === 'string' && example.name.trim().length
          ? example.name.trim()
          : 'Example',
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

    const fingerprintLength =
      profile.preprocess.fingerprintSize * profile.preprocess.fingerprintSize;
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
      id:
        this.normalizeEntityId(exemplar.id) ??
        existing?.id ??
        this.createCrewForgeImageExemplarId(),
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

  private normalizeRumbleTeamName(rumbleTeamName: string | undefined): string {
    if (typeof rumbleTeamName !== 'string') {
      return this.i18n.translate('common.defaults.untitledRumbleTeam');
    }

    return rumbleTeamName.trim() || this.i18n.translate('common.defaults.untitledRumbleTeam');
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

  private normalizeRawEnemyText(rawEnemyText: string | undefined): string {
    return typeof rawEnemyText === 'string' ? rawEnemyText : '';
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

  private normalizeSavedEnemyRequiredCharacterGroups(
    enemy: Pick<SavedEnemy, 'requiredAbilities'> & Partial<SavedEnemy>,
  ): SavedEnemy['requiredCharacterGroups'] {
    const groups = cloneRequiredCharacterGroups(enemy.requiredCharacterGroups);

    if (groups.length > 0) {
      return groups;
    }

    return expandRequiredAbilitiesToCharacterGroups(
      this.normalizeRequiredAbilities(enemy.requiredAbilities),
    ).groups;
  }

  private normalizeRequiredAbilities(
    requirements: AutoBuildAbilityRequirement[] | undefined,
  ): AutoBuildAbilityRequirement[] {
    if (!Array.isArray(requirements)) {
      return [];
    }

    const normalizedRequirements: AutoBuildAbilityRequirement[] = [];

    requirements.forEach((requirement) => {
      if (!requirement || typeof requirement !== 'object') {
        return;
      }

      const abilityKey =
        typeof requirement.abilityKey === 'string'
          ? (LEGACY_ABILITY_KEY_ALIASES[requirement.abilityKey.trim()] ??
            requirement.abilityKey.trim())
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

      normalizedRequirements.push({
        abilityKey,
        minTurns,
        slotTokens,
        requiredCharacterCount,
        ...(requirement.slotScope === 'leader' || requirement.slotScope === 'sub'
          ? { slotScope: requirement.slotScope }
          : {}),
        ...(requirement.sourceScope === 'captainAbility'
          ? { sourceScope: requirement.sourceScope }
          : {}),
      });
    });

    return normalizedRequirements;
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

  private createRumbleTeamId(): string {
    return `rumble-team-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

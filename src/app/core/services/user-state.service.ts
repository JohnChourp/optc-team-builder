import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { type SavedEnemy, type SavedTeam } from '../models/optc.models';
import { type AutoBuildAbilityRequirement } from '../models/auto-team-builder-ability.models';
import { AppI18nService } from './app-i18n.service';
import { normalizeEnemyMechanicRequirements } from './enemy-mechanic-draft.utils';

const FAVORITES_KEY = 'favoriteCharacterIds';
const FAVORITE_SHIPS_KEY = 'favoriteShipIds';
const RECENTS_KEY = 'recentCharacterIds';
const SAVED_TEAMS_KEY = 'savedTeams';
const SAVED_ENEMIES_KEY = 'savedEnemies';
const LEGACY_ABILITY_KEY_ALIASES: Record<string, string> = {
  remove_defense_up: 'remove_enemy_increased_defense',
};

@Injectable({ providedIn: 'root' })
export class UserStateService {
  public readonly favoriteCharacterIds = signal<number[]>([]);
  public readonly favoriteShipIds = signal<number[]>([]);
  public readonly recentCharacterIds = signal<number[]>([]);
  public readonly savedTeams = signal<SavedTeam[]>([]);
  public readonly savedEnemies = signal<SavedEnemy[]>([]);

  private readonly hydratePromise: Promise<void>;

  public constructor(private readonly i18n: AppI18nService) {
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
    const [favorites, favoriteShips, recents, teams, enemies] = await Promise.all([
      this.readJson<number[]>(FAVORITES_KEY, []),
      this.readJson<number[]>(FAVORITE_SHIPS_KEY, []),
      this.readJson<number[]>(RECENTS_KEY, []),
      this.readJson<SavedTeam[]>(SAVED_TEAMS_KEY, []),
      this.readJson<SavedEnemy[]>(SAVED_ENEMIES_KEY, []),
    ]);

    this.favoriteCharacterIds.set(favorites);
    this.favoriteShipIds.set(favoriteShips);
    this.recentCharacterIds.set(recents);
    this.savedTeams.set(teams.map((team) => this.normalizeSavedTeam(team)));
    this.savedEnemies.set(enemies.map((enemy) => this.normalizeSavedEnemy(enemy)));
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
  }

  private async replaceSavedTeams(teams: SavedTeam[]): Promise<void> {
    this.savedTeams.set(teams);
    await this.persistJson(SAVED_TEAMS_KEY, teams);
  }

  private async replaceSavedEnemies(enemies: SavedEnemy[]): Promise<void> {
    this.savedEnemies.set(enemies);
    await this.persistJson(SAVED_ENEMIES_KEY, enemies);
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
      | 'requireAllSpecialsSupportTeam'
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
      requireAllSpecialsSupportTeam: Boolean(enemy.requireAllSpecialsSupportTeam),
      createdAt: this.normalizeTimestamp(enemy.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(enemy.updatedAt, now),
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
}

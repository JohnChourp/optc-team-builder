import { Injectable, signal } from "@angular/core";
import { Preferences } from "@capacitor/preferences";

import { type SavedTeam } from "../models/optc.models";
import { AppI18nService } from "./app-i18n.service";

const FAVORITES_KEY = "favoriteCharacterIds";
const RECENTS_KEY = "recentCharacterIds";
const SAVED_TEAMS_KEY = "savedTeams";

@Injectable({ providedIn: "root" })
export class UserStateService {
  public readonly favoriteCharacterIds = signal<number[]>([]);
  public readonly recentCharacterIds = signal<number[]>([]);
  public readonly savedTeams = signal<SavedTeam[]>([]);

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

  public async markRecent(characterId: number): Promise<void> {
    await this.ready();
    const next = [characterId, ...this.recentCharacterIds().filter((value) => value !== characterId)].slice(0, 24);

    this.recentCharacterIds.set(next);
    await this.persistJson(RECENTS_KEY, next);
  }

  public async saveTeam(input: Omit<SavedTeam, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<SavedTeam> {
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
      teamIds
        .map((teamId) => teamId.trim())
        .filter((teamId) => teamId.length > 0),
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

    const next = [
      ...mergedTeams,
      ...currentTeams.filter((team) => !importedTeamIds.has(team.id)),
    ];

    await this.replaceSavedTeams(next);

    return {
      addedCount,
      updatedCount,
      teams: next,
    };
  }

  private async hydrate(): Promise<void> {
    const [favorites, recents, teams] = await Promise.all([
      this.readJson<number[]>(FAVORITES_KEY, []),
      this.readJson<number[]>(RECENTS_KEY, []),
      this.readJson<SavedTeam[]>(SAVED_TEAMS_KEY, []),
    ]);

    this.favoriteCharacterIds.set(favorites);
    this.recentCharacterIds.set(recents);
    this.savedTeams.set(teams);
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

  private normalizeSavedTeam(
    team: Pick<SavedTeam, "name" | "notes" | "shipId" | "slots"> & Partial<SavedTeam>,
    existing?: SavedTeam,
  ): SavedTeam {
    const now = new Date().toISOString();

    return {
      id: this.normalizeTeamId(team.id) ?? existing?.id ?? this.createTeamId(),
      name: this.normalizeTeamName(team.name),
      slots: this.normalizeTeamSlots(team.slots),
      shipId: this.normalizeShipId(team.shipId),
      notes: this.normalizeNotes(team.notes),
      createdAt: this.normalizeTimestamp(team.createdAt, existing?.createdAt ?? now),
      updatedAt: this.normalizeTimestamp(team.updatedAt, now),
    };
  }

  private normalizeTeamId(teamId: string | undefined): string | null {
    if (typeof teamId !== "string") {
      return null;
    }

    const normalizedTeamId = teamId.trim();

    return normalizedTeamId.length ? normalizedTeamId : null;
  }

  private normalizeTeamName(teamName: string | undefined): string {
    if (typeof teamName !== "string") {
      return this.i18n.translate("common.defaults.untitledCrew");
    }

    return teamName.trim() || this.i18n.translate("common.defaults.untitledCrew");
  }

  private normalizeTeamSlots(slots: Array<number | null> | undefined): Array<number | null> {
    return Array.from({ length: 6 }, (_, index) => {
      const value = slots?.[index];

      return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
    });
  }

  private normalizeShipId(shipId: number | null | undefined): number | null {
    return typeof shipId === "number" && Number.isInteger(shipId) && shipId > 0 ? shipId : null;
  }

  private normalizeNotes(notes: string | undefined): string {
    return typeof notes === "string" ? notes.trim() : "";
  }

  private normalizeTimestamp(value: string | undefined, fallback: string): string {
    if (typeof value !== "string") {
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
}

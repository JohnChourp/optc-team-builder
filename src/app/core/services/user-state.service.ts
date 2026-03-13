import { Injectable, signal } from "@angular/core";
import { Preferences } from "@capacitor/preferences";

import { type SavedTeam } from "../models/optc.models";

const FAVORITES_KEY = "favoriteCharacterIds";
const RECENTS_KEY = "recentCharacterIds";
const SAVED_TEAMS_KEY = "savedTeams";

@Injectable({ providedIn: "root" })
export class UserStateService {
  public readonly favoriteCharacterIds = signal<number[]>([]);
  public readonly recentCharacterIds = signal<number[]>([]);
  public readonly savedTeams = signal<SavedTeam[]>([]);

  private readonly hydratePromise: Promise<void>;

  public constructor() {
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

    const now = new Date().toISOString();
    const existing = this.savedTeams().find((team) => team.id === input.id);
    const savedTeam: SavedTeam = {
      id: input.id ?? this.createTeamId(),
      name: input.name.trim() || "Untitled Crew",
      slots: [...input.slots],
      shipId: input.shipId ?? null,
      notes: input.notes.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const next = existing
      ? this.savedTeams().map((team) => (team.id === savedTeam.id ? savedTeam : team))
      : [savedTeam, ...this.savedTeams()];

    this.savedTeams.set(next);
    await this.persistJson(SAVED_TEAMS_KEY, next);

    return savedTeam;
  }

  public async deleteTeam(teamId: string): Promise<void> {
    await this.ready();
    const next = this.savedTeams().filter((team) => team.id !== teamId);

    this.savedTeams.set(next);
    await this.persistJson(SAVED_TEAMS_KEY, next);
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

  private createTeamId(): string {
    return `crew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

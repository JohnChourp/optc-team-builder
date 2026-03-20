import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { heart, heartOutline } from "ionicons/icons";

import { type CharacterListItem, type SavedTeam, type ShipRecord } from "../../core/models/optc.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { UserStateService } from "../../core/services/user-state.service";

@Component({
  selector: "app-team-builder-page",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: "./team-builder.page.html",
  styleUrl: "./team-builder.page.scss",
})
export class TeamBuilderPage implements OnInit {
  public readonly ships = signal<ShipRecord[]>([]);
  public readonly candidateCharacters = signal<CharacterListItem[]>([]);
  public readonly slotCharacters = signal<Array<CharacterListItem | null>>(Array.from({ length: 6 }, () => null));
  public readonly selectedSlotIndex = signal(0);
  public readonly selectedShipId = signal<number | null>(null);
  public readonly teamName = signal("New Crew");
  public readonly notes = signal("");
  public readonly savedTeams;
  public readonly favoriteIds;
  public readonly teamTotals = signal({ hp: 0, atk: 0, rcv: 0, cost: 0 });
  public readonly currentTeamId = signal<string | null>(null);
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
  ) {
    this.savedTeams = this.userState.savedTeams;
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    this.ships.set(await this.repository.getShips());
    await this.refreshCandidateCharacters("");
  }

  public async onSearchCandidates(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    await this.refreshCandidateCharacters((event.detail.value ?? "").trim());
  }

  public onTeamNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.teamName.set((event.detail.value ?? "").trimStart());
  }

  public onNotesChange(event: CustomEvent<{ value?: string | null }>): void {
    this.notes.set((event.detail.value ?? "").toString());
  }

  public selectSlot(index: number): void {
    this.selectedSlotIndex.set(index);
  }

  public async assignCharacter(character: CharacterListItem): Promise<void> {
    const next = [...this.slotCharacters()];
    next[this.selectedSlotIndex()] = character;
    this.slotCharacters.set(next);
    await this.refreshTeamTotals();
  }

  public async clearSlot(index: number): Promise<void> {
    const next = [...this.slotCharacters()];
    next[index] = null;
    this.slotCharacters.set(next);
    await this.refreshTeamTotals();
  }

  public async saveTeam(): Promise<void> {
    const saved = await this.userState.saveTeam({
      id: this.currentTeamId() ?? undefined,
      name: this.teamName(),
      notes: this.notes(),
      shipId: this.selectedShipId(),
      slots: this.slotCharacters().map((character) => character?.id ?? null),
    });

    this.currentTeamId.set(saved.id);
  }

  public async loadTeam(team: SavedTeam): Promise<void> {
    const characters = await this.repository.getCharactersByIds(
      team.slots.filter((value): value is number => typeof value === "number"),
    );
    const characterMap = new Map(characters.map((character) => [character.id, character]));
    const slots = team.slots.map((characterId) => (characterId ? characterMap.get(characterId) ?? null : null));

    this.currentTeamId.set(team.id);
    this.teamName.set(team.name);
    this.notes.set(team.notes);
    this.selectedShipId.set(team.shipId);
    this.slotCharacters.set(slots);
    await this.refreshTeamTotals();
  }

  public async deleteTeam(teamId: string): Promise<void> {
    await this.userState.deleteTeam(teamId);

    if (this.currentTeamId() === teamId) {
      this.resetEditor();
    }
  }

  public async toggleFavorite(characterId: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.userState.toggleFavorite(characterId);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }

  private async refreshCandidateCharacters(searchTerm: string): Promise<void> {
    this.candidateCharacters.set(
      await this.repository.searchCharacters({
        searchTerm,
        typeFilter: "",
        classFilter: "",
        limit: 24,
        offset: 0,
      }),
    );
  }

  private async refreshTeamTotals(): Promise<void> {
    const selected = this.slotCharacters().filter((character): character is CharacterListItem => Boolean(character));

    this.teamTotals.set(
      selected.reduce(
        (totals, character) => ({
          hp: totals.hp + character.stats.max.hp,
          atk: totals.atk + character.stats.max.atk,
          rcv: totals.rcv + character.stats.max.rcv,
          cost: totals.cost + character.cost,
        }),
        { hp: 0, atk: 0, rcv: 0, cost: 0 },
      ),
    );
  }

  private resetEditor(): void {
    this.currentTeamId.set(null);
    this.teamName.set("New Crew");
    this.notes.set("");
    this.selectedShipId.set(null);
    this.slotCharacters.set(Array.from({ length: 6 }, () => null));
    this.teamTotals.set({ hp: 0, atk: 0, rcv: 0, cost: 0 });
  }
}

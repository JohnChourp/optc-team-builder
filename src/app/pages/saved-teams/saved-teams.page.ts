import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { type ViewWillEnter } from "@ionic/angular";
import { IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar } from "@ionic/angular/standalone";

import { type CharacterListItem, type SavedTeam } from "../../core/models/optc.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { UserStateService } from "../../core/services/user-state.service";

interface SavedTeamPreviewCard {
  team: SavedTeam;
  slots: Array<CharacterListItem | null>;
}

@Component({
  selector: "app-saved-teams-page",
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonSpinner, IonTitle, IonToolbar, RouterLink],
  templateUrl: "./saved-teams.page.html",
  styleUrl: "./saved-teams.page.scss",
})
export class SavedTeamsPage implements OnInit, ViewWillEnter {
  public readonly loading = signal(true);
  public readonly savedTeams;
  public readonly savedTeamCards = signal<SavedTeamPreviewCard[]>([]);

  public constructor(
    private readonly userState: UserStateService,
    private readonly repository: OptcRepositoryService,
  ) {
    this.savedTeams = this.userState.savedTeams;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    await this.refreshSavedTeamCards();
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.userState.ready();
    await this.refreshSavedTeamCards();
  }

  public getCharacterDetailLink(
    character: Pick<CharacterListItem, "id"> | null | undefined,
  ): string[] | null {
    return character ? ["/characters", character.id.toString()] : null;
  }

  private async refreshSavedTeamCards(): Promise<void> {
    this.loading.set(true);
    const teams = this.savedTeams();

    if (!teams.length) {
      this.savedTeamCards.set([]);
      this.loading.set(false);
      return;
    }

    const characterIds = [...new Set(
      teams.flatMap((team) => team.slots.filter((slotId): slotId is number => typeof slotId === "number")),
    )];
    const characters = await this.repository.getCharactersByIds(characterIds);
    const characterMap = new Map(characters.map((character) => [character.id, character] as const));

    this.savedTeamCards.set(
      teams.map((team) => ({
        team,
        slots: team.slots.map((slotId) =>
          typeof slotId === "number" ? characterMap.get(slotId) ?? null : null,
        ),
      })),
    );
    this.loading.set(false);
  }
}

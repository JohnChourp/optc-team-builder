import { CommonModule } from "@angular/common";
import { Component, effect, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { IonButton, IonContent, IonHeader, IonTitle, IonToolbar } from "@ionic/angular/standalone";

import { type CharacterListItem } from "../../core/models/optc.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { UserStateService } from "../../core/services/user-state.service";

@Component({
  selector: "app-collection-page",
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonHeader, IonTitle, IonToolbar, RouterLink],
  templateUrl: "./collection.page.html",
  styleUrl: "./collection.page.scss",
})
export class CollectionPage {
  public readonly favoriteCharacters = signal<CharacterListItem[]>([]);
  public readonly recentCharacters = signal<CharacterListItem[]>([]);
  public readonly savedTeams;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
  ) {
    this.savedTeams = this.userState.savedTeams;

    effect(() => {
      const favoriteIds = this.userState.favoriteCharacterIds();
      const recentIds = this.userState.recentCharacterIds();
      this.savedTeams();
      void this.refreshCollections(favoriteIds, recentIds);
    });
  }

  private async refreshCollections(favoriteIds: number[], recentIds: number[]): Promise<void> {
    this.favoriteCharacters.set(await this.repository.getCharactersByIds(favoriteIds));
    this.recentCharacters.set(await this.repository.getCharactersByIds(recentIds.slice(0, 12)));
  }
}

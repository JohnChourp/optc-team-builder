import { CommonModule, JsonPipe } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  IonBackButton,
  IonButtons,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { heart, heartOutline } from "ionicons/icons";

import { type CharacterDetailRecord } from "../../core/models/optc.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { UserStateService } from "../../core/services/user-state.service";

@Component({
  selector: "app-character-detail-page",
  standalone: true,
  imports: [
    CommonModule,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
    JsonPipe,
    RouterLink,
  ],
  templateUrl: "./character-detail.page.html",
  styleUrl: "./character-detail.page.scss",
})
export class CharacterDetailPage implements OnInit {
  public readonly character = signal<CharacterDetailRecord | null>(null);
  public readonly loading = signal(true);
  public readonly favoriteIds;

  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    const characterId = Number(this.route.snapshot.paramMap.get("id"));

    if (!Number.isFinite(characterId)) {
      this.loading.set(false);
      return;
    }

    await this.userState.ready();
    this.character.set(await this.repository.getCharacterById(characterId));
    await this.userState.markRecent(characterId);
    this.loading.set(false);
  }

  public async toggleFavorite(characterId: number): Promise<void> {
    await this.userState.toggleFavorite(characterId);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }
}

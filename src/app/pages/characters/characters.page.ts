import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  IonButton,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import {
  heart,
  heartOutline,
  layersOutline,
  searchOutline,
  sparklesOutline,
} from "ionicons/icons";

import { type CharacterListItem, type DatasetManifest } from "../../core/models/optc.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { UserStateService } from "../../core/services/user-state.service";

const PAGE_SIZE = 48;

@Component({
  selector: "app-characters-page",
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: "./characters.page.html",
  styleUrl: "./characters.page.scss",
})
export class CharactersPage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly characters = signal<CharacterListItem[]>([]);
  public readonly loading = signal(true);
  public readonly loadingMore = signal(false);
  public readonly hasMore = signal(true);
  public readonly searchTerm = signal("");
  public readonly selectedType = signal("");
  public readonly selectedClass = signal("");
  public readonly favoriteIds;

  public readonly searchIcon = searchOutline;
  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    this.summary.set(await this.repository.getDatasetManifest());
    await this.loadCharacters(true);
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.searchTerm.set((event.detail.value ?? "").trim());
    await this.loadCharacters(true);
  }

  public async onTypeFilterChange(type: string): Promise<void> {
    this.selectedType.set(this.selectedType() === type ? "" : type);
    await this.loadCharacters(true);
  }

  public async onClassFilterChange(characterClass: string): Promise<void> {
    this.selectedClass.set(this.selectedClass() === characterClass ? "" : characterClass);
    await this.loadCharacters(true);
  }

  public async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }

    this.loadingMore.set(true);
    await this.loadCharacters(false);
    this.loadingMore.set(false);
  }

  public async toggleFavorite(characterId: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.userState.toggleFavorite(characterId);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }

  public trackCharacter(_: number, character: CharacterListItem): number {
    return character.id;
  }

  private async loadCharacters(reset: boolean): Promise<void> {
    if (reset) {
      this.loading.set(true);
    }

    const nextOffset = reset ? 0 : this.characters().length;
    const nextPage = await this.repository.searchCharacters({
      searchTerm: this.searchTerm(),
      typeFilter: this.selectedType(),
      classFilter: this.selectedClass(),
      limit: PAGE_SIZE,
      offset: nextOffset,
    });

    this.characters.set(reset ? nextPage : [...this.characters(), ...nextPage]);
    this.hasMore.set(nextPage.length === PAGE_SIZE);
    this.loading.set(false);
  }
}

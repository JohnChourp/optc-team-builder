import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSearchbar,
  IonSpinner,
  IonToggle,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  closeOutline,
  cloudUploadOutline,
  documentTextOutline,
  heart,
  heartOutline,
  layersOutline,
  searchOutline,
  sparklesOutline,
} from "ionicons/icons";

import { type CharacterListItem, type DatasetManifest } from "../../core/models/optc.models";
import { type OptcbxImportResult, type OptcbxParsedImport } from "../../core/models/optcbx-import.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { OptcbxImportService } from "../../core/services/optcbx-import.service";
import { UserStateService } from "../../core/services/user-state.service";
import {
  buildOptcbxFavoritesExportPayload,
  downloadOptcbxFavoritesExport,
} from "./characters-favorites.utils";

const PAGE_SIZE = 48;

@Component({
  selector: "app-characters-page",
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonModal,
    IonSearchbar,
    IonSpinner,
    IonToggle,
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
  public readonly typeQuery = signal("");
  public readonly classQuery = signal("");
  public readonly selectedType = signal("");
  public readonly selectedClass = signal("");
  public readonly favoritesOnly = signal(false);
  public readonly favoriteIds;
  public readonly canDownloadFavoritesExport = computed(() => this.favoriteIds().length > 0);
  public readonly importModalOpen = signal(false);
  public readonly draggingImportFile = signal(false);
  public readonly importFileName = signal("");
  public readonly importErrorMessage = signal("");
  public readonly parsedImport = signal<OptcbxParsedImport | null>(null);
  public readonly importResult = signal<OptcbxImportResult | null>(null);
  public readonly importingFavorites = signal(false);
  public readonly hasImportReady = computed(() => this.parsedImport() !== null);
  public readonly unmatchedPreview = computed(() => this.importResult()?.unmatchedIds.slice(0, 12) ?? []);
  public readonly remainingUnmatchedCount = computed(
    () => Math.max(0, (this.importResult()?.unmatchedIds.length ?? 0) - this.unmatchedPreview().length),
  );
  public readonly availableTypes = computed(() => this.normalizeOptions(this.summary()?.availableTypes ?? []));
  public readonly availableClasses = computed(() => this.normalizeOptions(this.summary()?.availableClasses ?? []));
  public readonly filteredTypeOptions = computed(() =>
    this.filterOptions(this.availableTypes(), this.typeQuery(), this.selectedType()),
  );
  public readonly filteredClassOptions = computed(() =>
    this.filterOptions(this.availableClasses(), this.classQuery(), this.selectedClass()),
  );
  public readonly showTypeSuggestions = computed(
    () => this.filteredTypeOptions().length > 0 && this.typeQuery().trim() !== this.selectedType(),
  );
  public readonly showClassSuggestions = computed(
    () => this.filteredClassOptions().length > 0 && this.classQuery().trim() !== this.selectedClass(),
  );
  public readonly favoritesOnlySupportLabel = computed(() =>
    this.favoriteIds().length
      ? `Limit results to your ${this.favoriteIds().length} favorited characters.`
      : "No favorites saved yet.",
  );

  public readonly searchIcon = searchOutline;
  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly uploadIcon = cloudUploadOutline;
  public readonly fileIcon = documentTextOutline;
  public readonly closeIcon = closeOutline;
  public readonly successIcon = checkmarkCircleOutline;
  public readonly errorIcon = alertCircleOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public readonly favoritesOnlyToggleLabel = "Show favorites only";

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
    private readonly optcbxImport: OptcbxImportService,
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

  public async onTypeQueryChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const nextValue = (event.detail.value ?? "").trimStart();
    this.typeQuery.set(nextValue);

    if (this.selectedType() && nextValue.trim() !== this.selectedType()) {
      this.selectedType.set("");
      await this.loadCharacters(true);
    }
  }

  public async onClassQueryChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const nextValue = (event.detail.value ?? "").trimStart();
    this.classQuery.set(nextValue);

    if (this.selectedClass() && nextValue.trim() !== this.selectedClass()) {
      this.selectedClass.set("");
      await this.loadCharacters(true);
    }
  }

  public async applyTypeFilter(type: string): Promise<void> {
    if (this.selectedType() === type) {
      return;
    }

    this.typeQuery.set(type);
    this.selectedType.set(type);
    await this.loadCharacters(true);
  }

  public async applyClassFilter(characterClass: string): Promise<void> {
    if (this.selectedClass() === characterClass) {
      return;
    }

    this.classQuery.set(characterClass);
    this.selectedClass.set(characterClass);
    await this.loadCharacters(true);
  }

  public async clearTypeFilter(): Promise<void> {
    const hadSelection = Boolean(this.selectedType());
    this.typeQuery.set("");

    if (!hadSelection) {
      return;
    }

    this.selectedType.set("");
    await this.loadCharacters(true);
  }

  public async clearClassFilter(): Promise<void> {
    const hadSelection = Boolean(this.selectedClass());
    this.classQuery.set("");

    if (!hadSelection) {
      return;
    }

    this.selectedClass.set("");
    await this.loadCharacters(true);
  }

  public async onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
    this.favoritesOnly.set(event.detail.checked);
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

  public openImportModal(): void {
    this.resetImportState();
    this.importModalOpen.set(true);
  }

  public closeImportModal(): void {
    this.importModalOpen.set(false);
    this.resetImportState();
  }

  public openFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = "";

    if (!file) {
      return;
    }

    await this.loadImportFile(file);
  }

  public onImportDragOver(event: DragEvent): void {
    event.preventDefault();
    this.draggingImportFile.set(true);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }

  public onImportDragLeave(event: DragEvent): void {
    event.preventDefault();

    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;

    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    this.draggingImportFile.set(false);
  }

  public async onImportDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.draggingImportFile.set(false);

    const file = event.dataTransfer?.files?.item(0);

    if (!file) {
      this.importErrorMessage.set("Drop a JSON file exported by OPTCbx.");
      return;
    }

    await this.loadImportFile(file);
  }

  public async importFavorites(): Promise<void> {
    const parsedImport = this.parsedImport();

    if (!parsedImport || this.importingFavorites()) {
      return;
    }

    this.importingFavorites.set(true);
    this.importErrorMessage.set("");

    try {
      const currentFavoriteIds = this.userState.favoriteCharacterIds();
      const importResult = await this.optcbxImport.buildMergeImportResult(parsedImport, currentFavoriteIds);
      const nextFavoriteIds = this.optcbxImport.mergeFavoriteIds(importResult.matchedIds, currentFavoriteIds);

      await this.userState.setFavoriteCharacterIds(nextFavoriteIds);
      this.importResult.set(importResult);

      if (this.favoritesOnly()) {
        await this.loadCharacters(true);
      }
    } catch (error) {
      this.importErrorMessage.set(this.resolveImportError(error));
    } finally {
      this.importingFavorites.set(false);
    }
  }

  public async downloadFavoritesExport(): Promise<void> {
    if (!this.canDownloadFavoritesExport()) {
      return;
    }

    const favoriteIds = this.favoriteIds();
    const favoriteCharacters = await this.repository.getCharactersByIds(favoriteIds);
    const payload = buildOptcbxFavoritesExportPayload(favoriteIds, favoriteCharacters);

    downloadOptcbxFavoritesExport(payload);
  }

  public async toggleFavorite(characterId: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.userState.toggleFavorite(characterId);

    if (this.favoritesOnly()) {
      await this.loadCharacters(true);
    }
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }

  public trackCharacter(_: number, character: CharacterListItem): number {
    return character.id;
  }

  public resetSelectedFile(): void {
    this.importFileName.set("");
    this.importErrorMessage.set("");
    this.parsedImport.set(null);
    this.importResult.set(null);
    this.draggingImportFile.set(false);
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
      allowedCharacterIds: this.favoritesOnly() ? this.favoriteIds() : undefined,
      limit: PAGE_SIZE,
      offset: nextOffset,
    });

    this.characters.set(reset ? nextPage : [...this.characters(), ...nextPage]);
    this.hasMore.set(nextPage.length === PAGE_SIZE);
    this.loading.set(false);
  }

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  private filterOptions(options: string[], query: string, selectedValue: string): string[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options.slice(0, 8);
    }

    return options
      .filter((option) => option.toLowerCase().includes(normalizedQuery))
      .filter((option) => option !== selectedValue)
      .slice(0, 8);
  }

  private async loadImportFile(file: File): Promise<void> {
    this.importFileName.set(file.name);
    this.importErrorMessage.set("");
    this.importResult.set(null);
    this.parsedImport.set(null);

    try {
      const rawContent = await file.text();
      const parsedImport = this.optcbxImport.parseExport(rawContent);

      this.parsedImport.set(parsedImport);
    } catch (error) {
      this.importErrorMessage.set(this.resolveImportError(error));
    }
  }

  private resolveImportError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return "The OPTCbx import failed. Please try another export file.";
  }

  private resetImportState(): void {
    this.draggingImportFile.set(false);
    this.importFileName.set("");
    this.importErrorMessage.set("");
    this.parsedImport.set(null);
    this.importResult.set(null);
    this.importingFavorites.set(false);
  }
}

import { CommonModule } from "@angular/common";
import { Component, computed, effect, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  closeOutline,
  cloudUploadOutline,
  documentTextOutline,
} from "ionicons/icons";

import { type CharacterListItem } from "../../core/models/optc.models";
import { type OptcbxImportResult, type OptcbxParsedImport } from "../../core/models/optcbx-import.models";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { OptcbxImportService } from "../../core/services/optcbx-import.service";
import { UserStateService } from "../../core/services/user-state.service";

@Component({
  selector: "app-collection-page",
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonModal,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterLink,
  ],
  templateUrl: "./collection.page.html",
  styleUrl: "./collection.page.scss",
})
export class CollectionPage {
  public readonly favoriteCharacters = signal<CharacterListItem[]>([]);
  public readonly recentCharacters = signal<CharacterListItem[]>([]);
  public readonly savedTeams;
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

  public readonly uploadIcon = cloudUploadOutline;
  public readonly fileIcon = documentTextOutline;
  public readonly closeIcon = closeOutline;
  public readonly successIcon = checkmarkCircleOutline;
  public readonly errorIcon = alertCircleOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
    private readonly optcbxImport: OptcbxImportService,
  ) {
    this.savedTeams = this.userState.savedTeams;

    effect(() => {
      const favoriteIds = this.userState.favoriteCharacterIds();
      const recentIds = this.userState.recentCharacterIds();
      this.savedTeams();
      void this.refreshCollections(favoriteIds, recentIds);
    });
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
    } catch (error) {
      this.importErrorMessage.set(this.resolveImportError(error));
    } finally {
      this.importingFavorites.set(false);
    }
  }

  public resetSelectedFile(): void {
    this.importFileName.set("");
    this.importErrorMessage.set("");
    this.parsedImport.set(null);
    this.importResult.set(null);
    this.draggingImportFile.set(false);
  }

  private async refreshCollections(favoriteIds: number[], recentIds: number[]): Promise<void> {
    this.favoriteCharacters.set(await this.repository.getCharactersByIds(favoriteIds));
    this.recentCharacters.set(await this.repository.getCharactersByIds(recentIds.slice(0, 12)));
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

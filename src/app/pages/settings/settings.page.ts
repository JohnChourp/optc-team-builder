import { CommonModule } from "@angular/common";
import { Component, OnInit, computed, signal } from "@angular/core";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { TranslocoDirective, TranslocoPipe } from "@jsverse/transloco";

import { type DatasetManifest } from "../../core/models/optc.models";
import { type SupportedLanguage } from "../../core/i18n/app-i18n.types";
import { AppI18nService } from "../../core/services/app-i18n.service";
import { OptcbxImportService } from "../../core/services/optcbx-import.service";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { UserStateService } from "../../core/services/user-state.service";
import {
  buildOptcbxFavoritesExportPayload,
  downloadOptcbxFavoritesExport,
} from "../characters/characters-favorites.utils";
import {
  buildFavoriteShipsTransferPayload,
  downloadFavoriteShipsExport,
  filterAvailableFavoriteShips,
  parseFavoriteShipsImportPayload,
  sanitizeFavoriteShipsImportPayload,
  type FavoriteShipsImportError,
} from "./favorite-ships-transfer.utils";
import {
  buildSavedTeamsTransferPayload,
  clearUnavailableSavedTeamSlots,
  downloadSavedTeamsExport,
  parseSavedTeamsImportPayload,
  sanitizeSavedTeamsImportPayload,
  type SavedTeamsImportError,
} from "../saved-teams/saved-teams-transfer.utils";
import {
  buildSavedEnemiesTransferPayload,
  downloadSavedEnemiesExport,
  parseSavedEnemiesImportPayload,
  sanitizeSavedEnemiesImportPayload,
  type SavedEnemiesImportError,
} from "../saved-enemies/saved-enemies-transfer.utils";

interface TransferFeedback {
  details: string[];
  title: string;
  tone: "error" | "success" | "warning";
}

@Component({
  selector: "app-settings-page",
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: "./settings.page.html",
  styleUrl: "./settings.page.scss",
})
export class SettingsPage implements OnInit {
  public readonly manifest = signal<DatasetManifest | null>(null);
  public readonly activeLanguage;
  public readonly availableLanguages;
  public readonly favoriteIds;
  public readonly favoriteShipIds;
  public readonly savedTeams;
  public readonly savedEnemies;

  public readonly canExportFavorites = computed(() => this.favoriteIds().length > 0);
  public readonly canDeleteAllFavorites = computed(() => this.favoriteIds().length > 0);
  public readonly canExportFavoriteShips = computed(() => this.favoriteShipIds().length > 0);
  public readonly canDeleteAllFavoriteShips = computed(() => this.favoriteShipIds().length > 0);
  public readonly canExportSavedTeams = computed(() => this.savedTeams().length > 0);
  public readonly canDeleteAllSavedTeams = computed(() => this.savedTeams().length > 0);
  public readonly canExportSavedEnemies = computed(() => this.savedEnemies().length > 0);
  public readonly canDeleteAllSavedEnemies = computed(() => this.savedEnemies().length > 0);

  public readonly favoritesImporting = signal(false);
  public readonly favoriteShipsImporting = signal(false);
  public readonly savedTeamsImporting = signal(false);
  public readonly savedEnemiesImporting = signal(false);
  public readonly favoritesFeedback = signal<TransferFeedback | null>(null);
  public readonly favoriteShipsFeedback = signal<TransferFeedback | null>(null);
  public readonly savedTeamsFeedback = signal<TransferFeedback | null>(null);
  public readonly savedEnemiesFeedback = signal<TransferFeedback | null>(null);

  public readonly commands = [
    "npm run data:import",
    "npm run data:import:glo-thumbs",
    "npm run data:import:all",
  ];

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
    private readonly userState: UserStateService,
    private readonly optcbxImport: OptcbxImportService,
  ) {
    this.activeLanguage = this.i18n.activeLanguage;
    this.availableLanguages = this.i18n.availableLanguages;
    this.favoriteIds = this.userState.favoriteCharacterIds;
    this.favoriteShipIds = this.userState.favoriteShipIds;
    this.savedTeams = this.userState.savedTeams;
    this.savedEnemies = this.userState.savedEnemies;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    this.manifest.set(await this.repository.getDatasetManifest());
  }

  public ionViewDidEnter(): void {
    console.log("SettingsPage component");
  }

  public async onLanguageChange(
    event: CustomEvent<{ value?: SupportedLanguage | null }>,
  ): Promise<void> {
    const language = event.detail.value;

    if (!language) {
      return;
    }

    await this.i18n.setLanguage(language);
  }

  public openFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onFavoritesFileSelected(
    event: Event,
    input: HTMLInputElement,
  ): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = "";

    if (!file) {
      return;
    }

    await this.importFavorites(file);
  }

  public async onSavedTeamsFileSelected(
    event: Event,
    input: HTMLInputElement,
  ): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = "";

    if (!file) {
      return;
    }

    await this.importSavedTeams(file);
  }

  public async onFavoriteShipsFileSelected(
    event: Event,
    input: HTMLInputElement,
  ): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = "";

    if (!file) {
      return;
    }

    await this.importFavoriteShips(file);
  }

  public async onSavedEnemiesFileSelected(
    event: Event,
    input: HTMLInputElement,
  ): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = "";

    if (!file) {
      return;
    }

    await this.importSavedEnemies(file);
  }

  public async exportFavorites(): Promise<void> {
    if (!this.canExportFavorites()) {
      return;
    }

    const favoriteIds = this.favoriteIds();
    const favoriteCharacters = await this.repository.getCharactersByIds(favoriteIds);
    const payload = buildOptcbxFavoritesExportPayload(favoriteIds, favoriteCharacters);

    downloadOptcbxFavoritesExport(payload);
  }

  public async exportFavoriteShips(): Promise<void> {
    if (!this.canExportFavoriteShips()) {
      return;
    }

    const payload = buildFavoriteShipsTransferPayload(
      this.favoriteShipIds(),
      await this.repository.getShips(),
    );

    downloadFavoriteShipsExport(payload);
  }

  public exportSavedTeams(): void {
    if (!this.canExportSavedTeams()) {
      return;
    }

    downloadSavedTeamsExport(buildSavedTeamsTransferPayload(this.savedTeams()));
  }

  public exportSavedEnemies(): void {
    if (!this.canExportSavedEnemies()) {
      return;
    }

    downloadSavedEnemiesExport(buildSavedEnemiesTransferPayload(this.savedEnemies()));
  }

  public async deleteAllFavorites(): Promise<void> {
    if (
      !this.canDeleteAllFavorites() ||
      !this.confirmAction(this.i18n.translate("management.confirm.deleteFavorites", undefined, "settings"))
    ) {
      return;
    }

    await this.userState.clearAllFavoriteCharacterIds();
  }

  public async deleteAllFavoriteShips(): Promise<void> {
    if (
      !this.canDeleteAllFavoriteShips() ||
      !this.confirmAction(
        this.i18n.translate("management.confirm.deleteFavoriteShips", undefined, "settings"),
      )
    ) {
      return;
    }

    await this.userState.clearAllFavoriteShipIds();
  }

  public async deleteAllSavedTeams(): Promise<void> {
    if (
      !this.canDeleteAllSavedTeams() ||
      !this.confirmAction(this.i18n.translate("management.confirm.deleteSavedTeams", undefined, "settings"))
    ) {
      return;
    }

    await this.userState.clearAllSavedTeams();
  }

  public async deleteAllSavedEnemies(): Promise<void> {
    if (
      !this.canDeleteAllSavedEnemies() ||
      !this.confirmAction(
        this.i18n.translate("management.confirm.deleteSavedEnemies", undefined, "settings"),
      )
    ) {
      return;
    }

    await this.userState.clearAllSavedEnemies();
  }

  private async importFavorites(file: File): Promise<void> {
    this.favoritesImporting.set(true);
    this.favoritesFeedback.set(null);

    try {
      const rawContent = await file.text();
      const parsedImport = this.optcbxImport.parseExport(rawContent);
      const currentFavoriteIds = this.userState.favoriteCharacterIds();
      const importResult = await this.optcbxImport.buildMergeImportResult(
        parsedImport,
        currentFavoriteIds,
      );
      const nextFavoriteIds = this.optcbxImport.mergeFavoriteIds(
        importResult.matchedIds,
        currentFavoriteIds,
      );

      await this.userState.setFavoriteCharacterIds(nextFavoriteIds);
      this.favoritesFeedback.set(
        this.buildFavoritesImportFeedback(parsedImport.duplicatesRemoved, importResult),
      );
    } catch (error) {
      this.favoritesFeedback.set({
        tone: "error",
        title: this.i18n.translate("management.favorites.feedback.errorTitle", undefined, "settings"),
        details: [this.resolveFavoritesImportError(error)],
      });
    } finally {
      this.favoritesImporting.set(false);
    }
  }

  private buildFavoritesImportFeedback(
    duplicatesRemoved: number,
    importResult: {
      addedCount: number;
      alreadyFavoritedCount: number;
      matchedIds: number[];
      unmatchedIds: number[];
    },
  ): TransferFeedback {
    const details: string[] = [];

    if (duplicatesRemoved > 0) {
      details.push(
        this.i18n.translate("import.removedDuplicates", { count: duplicatesRemoved }, "characters"),
      );
    }

    details.push(
      `${this.i18n.translate("import.stats.matched", undefined, "characters")}: ${importResult.matchedIds.length}`,
    );

    if (importResult.addedCount > 0) {
      details.push(
        `${this.i18n.translate("import.stats.added", undefined, "characters")}: ${importResult.addedCount}`,
      );
    }

    if (importResult.alreadyFavoritedCount > 0) {
      details.push(
        `${this.i18n.translate("import.stats.alreadyFavorited", undefined, "characters")}: ${importResult.alreadyFavoritedCount}`,
      );
    }

    if (importResult.unmatchedIds.length > 0) {
      details.push(
        `${this.i18n.translate("import.stats.unknownIds", undefined, "characters")}: ${importResult.unmatchedIds.length}`,
      );
    }

    const hasWarnings = duplicatesRemoved > 0 || importResult.unmatchedIds.length > 0;

    return {
      tone: hasWarnings ? "warning" : "success",
      title: this.i18n.translate(
        hasWarnings
          ? "management.favorites.feedback.warningTitle"
          : "management.favorites.feedback.successTitle",
        undefined,
        "settings",
      ),
      details,
    };
  }

  private resolveFavoritesImportError(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return this.i18n.translate("import.errors.generic", undefined, "characters");
  }

  private async importFavoriteShips(file: File): Promise<void> {
    this.favoriteShipsImporting.set(true);
    this.favoriteShipsFeedback.set(null);

    try {
      const rawContent = await file.text();
      const payload = parseFavoriteShipsImportPayload(rawContent);
      const sanitizedImport = sanitizeFavoriteShipsImportPayload(payload);
      const ships = await this.repository.getShips();
      const availableShips = filterAvailableFavoriteShips(
        sanitizedImport.ships,
        new Set(ships.map((ship) => ship.id)),
      );
      const currentFavoriteShipIds = this.userState.favoriteShipIds();
      const currentFavoriteShipIdSet = new Set(currentFavoriteShipIds);
      const importedShipIds = availableShips.ships.map((ship) => ship.id);
      const addedCount = importedShipIds.filter((shipId) => !currentFavoriteShipIdSet.has(shipId)).length;

      await this.userState.setFavoriteShipIds(
        this.mergeFavoriteShipIds(importedShipIds, currentFavoriteShipIds),
      );
      this.favoriteShipsFeedback.set(
        this.buildFavoriteShipsImportFeedback({
          addedCount,
          alreadyFavoritedCount: importedShipIds.length - addedCount,
          duplicateIdCount: sanitizedImport.duplicateIdCount,
          fileName: file.name,
          invalidShipCount: sanitizedImport.invalidShipCount,
          matchedShipCount: importedShipIds.length,
          unknownShipCount: availableShips.unknownShipCount,
        }),
      );
    } catch (error) {
      this.favoriteShipsFeedback.set({
        tone: "error",
        title: this.i18n.translate(
          "management.favoriteShips.feedback.errorTitle",
          undefined,
          "settings",
        ),
        details: [this.resolveFavoriteShipsImportError(error)],
      });
    } finally {
      this.favoriteShipsImporting.set(false);
    }
  }

  private buildFavoriteShipsImportFeedback(stats: {
    addedCount: number;
    alreadyFavoritedCount: number;
    duplicateIdCount: number;
    fileName: string;
    invalidShipCount: number;
    matchedShipCount: number;
    unknownShipCount: number;
  }): TransferFeedback {
    const details = [
      this.i18n.translate(
        "management.favoriteShips.feedback.loadedFromFile",
        { fileName: stats.fileName },
        "settings",
      ),
      this.i18n.translate(
        "management.favoriteShips.feedback.stats.matched",
        { count: stats.matchedShipCount },
        "settings",
      ),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate(
          "management.favoriteShips.feedback.stats.added",
          { count: stats.addedCount },
          "settings",
        ),
      );
    }

    if (stats.alreadyFavoritedCount > 0) {
      details.push(
        this.i18n.translate(
          "management.favoriteShips.feedback.stats.alreadyFavorited",
          { count: stats.alreadyFavoritedCount },
          "settings",
        ),
      );
    }

    if (stats.duplicateIdCount > 0) {
      details.push(
        this.i18n.translate(
          "management.favoriteShips.feedback.stats.duplicates",
          { count: stats.duplicateIdCount },
          "settings",
        ),
      );
    }

    if (stats.invalidShipCount > 0) {
      details.push(
        this.i18n.translate(
          "management.favoriteShips.feedback.stats.invalid",
          { count: stats.invalidShipCount },
          "settings",
        ),
      );
    }

    if (stats.unknownShipCount > 0) {
      details.push(
        this.i18n.translate(
          "management.favoriteShips.feedback.stats.unknown",
          { count: stats.unknownShipCount },
          "settings",
        ),
      );
    }

    const hasWarnings =
      stats.duplicateIdCount > 0 || stats.invalidShipCount > 0 || stats.unknownShipCount > 0;

    return {
      tone: hasWarnings ? "warning" : "success",
      title: this.i18n.translate(
        hasWarnings
          ? "management.favoriteShips.feedback.warningTitle"
          : "management.favoriteShips.feedback.successTitle",
        undefined,
        "settings",
      ),
      details,
    };
  }

  private resolveFavoriteShipsImportError(
    error: FavoriteShipsImportError | Error | unknown,
  ): string {
    if (error && typeof error === "object" && "key" in error && typeof error.key === "string") {
      return this.i18n.translate(error.key, undefined, "settings");
    }

    return this.i18n.translate("management.favoriteShips.errors.generic", undefined, "settings");
  }

  private mergeFavoriteShipIds(importedShipIds: number[], currentFavoriteShipIds: number[]): number[] {
    const nextFavoriteShipIds: number[] = [];
    const seenShipIds = new Set<number>();

    [...importedShipIds, ...currentFavoriteShipIds].forEach((shipId) => {
      if (!Number.isInteger(shipId) || shipId <= 0 || seenShipIds.has(shipId)) {
        return;
      }

      seenShipIds.add(shipId);
      nextFavoriteShipIds.push(shipId);
    });

    return nextFavoriteShipIds;
  }

  private async importSavedTeams(file: File): Promise<void> {
    this.savedTeamsImporting.set(true);
    this.savedTeamsFeedback.set(null);

    try {
      const rawContent = await file.text();
      const payload = parseSavedTeamsImportPayload(rawContent);
      const sanitizedImport = sanitizeSavedTeamsImportPayload(payload, {
        untitledTeamName: this.i18n.translate("common.defaults.untitledCrew"),
      });
      const candidateCharacterIds = [
        ...new Set(
          sanitizedImport.teams.flatMap((team) =>
            team.slots.filter((slotId): slotId is number => typeof slotId === "number"),
          ),
        ),
      ];
      const availableCharacters = candidateCharacterIds.length
        ? await this.repository.getCharactersByIds(candidateCharacterIds)
        : [];
      const slotSanitizeResult = clearUnavailableSavedTeamSlots(
        sanitizedImport.teams,
        new Set(availableCharacters.map((character) => character.id)),
      );
      const mergeResult = await this.userState.mergeImportedTeams(slotSanitizeResult.teams);

      this.savedTeamsFeedback.set(
        this.buildSavedTeamsImportFeedback({
          addedCount: mergeResult.addedCount,
          duplicateIdCount: sanitizedImport.duplicateIdCount,
          fileName: file.name,
          invalidTeamCount: sanitizedImport.invalidTeamCount,
          unknownSlotCount: slotSanitizeResult.unknownSlotCount,
          updatedCount: mergeResult.updatedCount,
        }),
      );
    } catch (error) {
      this.savedTeamsFeedback.set({
        tone: "error",
        title: this.i18n.translate("import.errorTitle", undefined, "saved-teams"),
        details: [this.resolveSavedTeamsImportError(error)],
      });
    } finally {
      this.savedTeamsImporting.set(false);
    }
  }

  private buildSavedTeamsImportFeedback(stats: {
    addedCount: number;
    duplicateIdCount: number;
    fileName: string;
    invalidTeamCount: number;
    unknownSlotCount: number;
    updatedCount: number;
  }): TransferFeedback {
    const details = [
      this.i18n.translate("import.loadedFromFile", { fileName: stats.fileName }, "saved-teams"),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate("import.stats.added", { count: stats.addedCount }, "saved-teams"),
      );
    }

    if (stats.updatedCount > 0) {
      details.push(
        this.i18n.translate("import.stats.updated", { count: stats.updatedCount }, "saved-teams"),
      );
    }

    if (stats.invalidTeamCount > 0) {
      details.push(
        this.i18n.translate("import.stats.invalid", { count: stats.invalidTeamCount }, "saved-teams"),
      );
    }

    if (stats.duplicateIdCount > 0) {
      details.push(
        this.i18n.translate(
          "import.stats.duplicates",
          { count: stats.duplicateIdCount },
          "saved-teams",
        ),
      );
    }

    if (stats.unknownSlotCount > 0) {
      details.push(
        this.i18n.translate(
          "import.stats.unknownSlots",
          { count: stats.unknownSlotCount },
          "saved-teams",
        ),
      );
    }

    const hasWarnings =
      stats.invalidTeamCount > 0 || stats.duplicateIdCount > 0 || stats.unknownSlotCount > 0;

    return {
      tone: hasWarnings ? "warning" : "success",
      title: this.i18n.translate(
        hasWarnings ? "import.warningTitle" : "import.successTitle",
        undefined,
        "saved-teams",
      ),
      details,
    };
  }

  private resolveSavedTeamsImportError(error: SavedTeamsImportError | Error | unknown): string {
    if (error && typeof error === "object" && "key" in error && typeof error.key === "string") {
      return this.i18n.translate(error.key, undefined, "saved-teams");
    }

    return this.i18n.translate("import.errors.generic", undefined, "saved-teams");
  }

  private async importSavedEnemies(file: File): Promise<void> {
    this.savedEnemiesImporting.set(true);
    this.savedEnemiesFeedback.set(null);

    try {
      const rawContent = await file.text();
      const payload = parseSavedEnemiesImportPayload(rawContent);
      const sanitizedImport = sanitizeSavedEnemiesImportPayload(payload, {
        untitledEnemyName: this.i18n.translate("common.defaults.untitledEnemy"),
      });
      const mergeResult = await this.userState.mergeImportedEnemies(sanitizedImport.enemies);

      this.savedEnemiesFeedback.set(
        this.buildSavedEnemiesImportFeedback({
          addedCount: mergeResult.addedCount,
          duplicateIdCount: sanitizedImport.duplicateIdCount,
          fileName: file.name,
          invalidEnemyCount: sanitizedImport.invalidEnemyCount,
          updatedCount: mergeResult.updatedCount,
        }),
      );
    } catch (error) {
      this.savedEnemiesFeedback.set({
        tone: "error",
        title: this.i18n.translate("bulkImport.errorTitle", undefined, "saved-enemies"),
        details: [this.resolveSavedEnemiesImportError(error)],
      });
    } finally {
      this.savedEnemiesImporting.set(false);
    }
  }

  private buildSavedEnemiesImportFeedback(stats: {
    addedCount: number;
    duplicateIdCount: number;
    fileName: string;
    invalidEnemyCount: number;
    updatedCount: number;
  }): TransferFeedback {
    const details = [
      this.i18n.translate("bulkImport.loadedFromFile", { fileName: stats.fileName }, "saved-enemies"),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate("bulkImport.stats.added", { count: stats.addedCount }, "saved-enemies"),
      );
    }

    if (stats.updatedCount > 0) {
      details.push(
        this.i18n.translate(
          "bulkImport.stats.updated",
          { count: stats.updatedCount },
          "saved-enemies",
        ),
      );
    }

    if (stats.invalidEnemyCount > 0) {
      details.push(
        this.i18n.translate(
          "bulkImport.stats.invalid",
          { count: stats.invalidEnemyCount },
          "saved-enemies",
        ),
      );
    }

    if (stats.duplicateIdCount > 0) {
      details.push(
        this.i18n.translate(
          "bulkImport.stats.duplicates",
          { count: stats.duplicateIdCount },
          "saved-enemies",
        ),
      );
    }

    const hasWarnings = stats.invalidEnemyCount > 0 || stats.duplicateIdCount > 0;

    return {
      tone: hasWarnings ? "warning" : "success",
      title: this.i18n.translate(
        hasWarnings ? "bulkImport.warningTitle" : "bulkImport.successTitle",
        undefined,
        "saved-enemies",
      ),
      details,
    };
  }

  private resolveSavedEnemiesImportError(error: SavedEnemiesImportError | Error | unknown): string {
    if (error && typeof error === "object" && "key" in error && typeof error.key === "string") {
      return this.i18n.translate(error.key, undefined, "saved-enemies");
    }

    return this.i18n.translate("bulkImport.errors.invalidPayload", undefined, "saved-enemies");
  }

  private confirmAction(message: string): boolean {
    return typeof globalThis.confirm === "function" ? globalThis.confirm(message) : false;
  }
}

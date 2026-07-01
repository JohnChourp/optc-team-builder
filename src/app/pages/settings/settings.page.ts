import { CommonModule } from '@angular/common';
import { Component, type OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonLabel,
  IonMenuButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { type CharacterBox } from '../../core/models/optc.models';
import { AnalyticsConsentService } from '../../core/services/analytics-consent.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import {
  DriveBackupService,
  type DriveManualSyncPromptAction,
} from '../../core/services/drive-backup.service';
import { GoogleAccountService } from '../../core/services/google-account.service';
import {
  InventoryCaptureImportService,
  type InventoryCapturePreview,
} from '../../core/services/inventory-capture-import.service';
import { OptcbxImportService } from '../../core/services/optcbx-import.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserDataTransferService } from '../../core/services/user-data-transfer.service';
import {
  UserStateService,
  type AutoTeamBuilderWorkerMode,
} from '../../core/services/user-state.service';
import {
  buildOptcbxFavoritesExportPayload,
  downloadOptcbxFavoritesExport,
  type OptcbxFavoritesExportPayload,
} from '../characters/characters-favorites.utils';
import {
  buildCharacterBoxesTransferPayload,
  downloadCharacterBoxesExport,
  parseCharacterBoxesImportPayload,
  type CharacterBoxesImportError,
  type CharacterBoxesTransferPayload,
} from '../character-boxes/character-boxes-transfer.utils';
import {
  buildCharacterOverridesTransferPayload,
  downloadCharacterOverridesExport,
  parseCharacterOverridesImportPayload,
  type CharacterOverridesImportError,
  type CharacterOverridesTransferPayload,
} from '../character-detail/character-overrides-transfer.utils';
import {
  buildSavedEnemiesTransferPayload,
  downloadSavedEnemiesExport,
  parseSavedEnemiesImportPayload,
  type SavedEnemiesImportError,
} from '../saved-enemies/saved-enemies-transfer.utils';
import {
  buildSavedTeamsTransferPayload,
  downloadSavedTeamsExport,
  parseSavedTeamsImportPayload,
  resolveSavedTeamsImportDiagnostic,
  type SavedTeamsImportError,
} from '../saved-teams/saved-teams-transfer.utils';
import {
  downloadAllDataExport,
  parseAllDataImportCandidate,
  type AllDataTransferPayload,
} from './all-data-transfer.utils';
import {
  buildFavoriteShipsTransferPayload,
  downloadFavoriteShipsExport,
  parseFavoriteShipsImportPayload,
  type FavoriteShipsImportError,
  type FavoriteShipsTransferPayload,
} from './favorite-ships-transfer.utils';
import { type InventoryCaptureImportError } from './inventory-capture.utils';

interface TransferFeedback {
  details: string[];
  title: string;
  tone: 'error' | 'success' | 'warning';
}

interface CombinedImportSectionFeedback {
  feedback: TransferFeedback;
  label: string;
}

interface CombinedImportSectionError {
  label: string;
  message: string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonLabel,
    IonMenuButton,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToolbar,
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage implements OnInit {
  public readonly favoriteIds;
  public readonly favoriteShipIds;
  public readonly characterBoxes;
  public readonly characterOverrides;
  public readonly savedTeams;
  public readonly savedEnemies;
  public readonly autoTeamBuilderWorkerPreference;
  public readonly autoTeamBuilderWorkerRuntime;
  public readonly autoTeamBuilderAvailableWorkerCounts;
  public readonly analyticsConsent;
  public readonly analyticsConsentStatusKey;
  public readonly driveRemoteBackup;
  public readonly driveManualSyncPrompt;
  public readonly driveSyncMetadata;
  public readonly driveSyncStatus;
  public readonly drivePrimaryStateKey;
  public readonly driveSecondaryMessage;
  public readonly driveOpenUrl;
  public readonly localSyncScopeSummary;
  public readonly googleAccountAvailable;
  public readonly googleAccountLastError;
  public readonly googleAccountProfile;
  public readonly googleAccountSignedIn;
  public readonly googleAccountStatus;
  public readonly remoteSyncScopeSummary;

  public readonly canExportFavorites = computed(() => this.favoriteIds().length > 0);
  public readonly canDeleteAllFavorites = computed(() => this.favoriteIds().length > 0);
  public readonly canExportFavoriteShips = computed(() => this.favoriteShipIds().length > 0);
  public readonly canDeleteAllFavoriteShips = computed(() => this.favoriteShipIds().length > 0);
  public readonly canExportCharacterBoxes = computed(() => this.characterBoxes().length > 0);
  public readonly canDeleteAllCharacterBoxes = computed(() => this.characterBoxes().length > 0);
  public readonly canExportCharacterOverrides = computed(
    () => this.characterOverrides().length > 0,
  );
  public readonly canDeleteAllCharacterOverrides = computed(
    () => this.characterOverrides().length > 0,
  );
  public readonly canExportSavedTeams = computed(() => this.savedTeams().length > 0);
  public readonly canDeleteAllSavedTeams = computed(() => this.savedTeams().length > 0);
  public readonly canExportSavedEnemies = computed(() => this.savedEnemies().length > 0);
  public readonly canDeleteAllSavedEnemies = computed(() => this.savedEnemies().length > 0);
  public readonly canCommitInventoryCapture = computed(() => {
    const preview = this.inventoryCapturePreview();

    return Boolean(
      preview &&
      (preview.payload.characterIds.length > 0 || preview.payload.shipIds.length > 0) &&
      (preview.payload.characterIds.length === 0 ||
        this.inventoryCaptureBoxName().trim().length > 0),
    );
  });

  public readonly allDataImporting = signal(false);
  public readonly favoritesImporting = signal(false);
  public readonly favoriteShipsImporting = signal(false);
  public readonly inventoryCaptureImporting = signal(false);
  public readonly characterBoxesImporting = signal(false);
  public readonly characterOverridesImporting = signal(false);
  public readonly savedTeamsImporting = signal(false);
  public readonly savedEnemiesImporting = signal(false);
  public readonly allDataFeedback = signal<TransferFeedback | null>(null);
  public readonly favoritesFeedback = signal<TransferFeedback | null>(null);
  public readonly favoriteShipsFeedback = signal<TransferFeedback | null>(null);
  public readonly inventoryCaptureFeedback = signal<TransferFeedback | null>(null);
  public readonly inventoryCapturePreview = signal<InventoryCapturePreview | null>(null);
  public readonly inventoryCaptureBoxSelection = signal<string | 'new'>('new');
  public readonly inventoryCaptureBoxName = signal('');
  public readonly characterBoxesFeedback = signal<TransferFeedback | null>(null);
  public readonly characterOverridesFeedback = signal<TransferFeedback | null>(null);
  public readonly savedTeamsFeedback = signal<TransferFeedback | null>(null);
  public readonly savedEnemiesFeedback = signal<TransferFeedback | null>(null);

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
    private readonly userState: UserStateService,
    private readonly characterOverrideState: CharacterOverridesService,
    private readonly analyticsConsentService: AnalyticsConsentService,
    private readonly optcbxImport: OptcbxImportService,
    private readonly inventoryCaptureImport: InventoryCaptureImportService,
    private readonly userDataTransfer: UserDataTransferService,
    private readonly googleAccount: GoogleAccountService,
    private readonly driveBackup: DriveBackupService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
    this.favoriteShipIds = this.userState.favoriteShipIds;
    this.characterBoxes = this.userState.characterBoxes;
    this.characterOverrides = this.characterOverrideState.overrides;
    this.savedTeams = this.userState.savedTeams;
    this.savedEnemies = this.userState.savedEnemies;
    this.autoTeamBuilderWorkerPreference = this.userState.autoTeamBuilderWorkerPreference;
    this.autoTeamBuilderWorkerRuntime = computed(() =>
      this.userState.resolveAutoTeamBuilderWorkerPreference(),
    );
    this.autoTeamBuilderAvailableWorkerCounts = computed(() =>
      Array.from(
        { length: this.autoTeamBuilderWorkerRuntime().manualMaxCount },
        (_, index) => index + 1,
      ),
    );
    this.analyticsConsent = this.analyticsConsentService.consent;
    this.analyticsConsentStatusKey = computed(() => `analytics.status.${this.analyticsConsent()}`);
    this.driveRemoteBackup = this.driveBackup.remoteBackup;
    this.driveManualSyncPrompt = this.driveBackup.manualSyncPrompt;
    this.driveSyncMetadata = this.driveBackup.metadata;
    this.driveSyncStatus = this.driveBackup.syncStatus;
    this.localSyncScopeSummary = computed(() => this.userDataTransfer.getSyncScopeSummary());
    this.remoteSyncScopeSummary = computed(() => this.driveSyncMetadata().remoteSummary);
    this.drivePrimaryStateKey = computed(() => {
      if (!this.googleAccountAvailable()) {
        return 'driveSync.overview.unavailable';
      }

      if (!this.googleAccountSignedIn()) {
        return 'driveSync.overview.signedOut';
      }

      if (
        this.googleAccountStatus() === 'reconnect-required' ||
        this.driveSyncStatus().phase === 'error'
      ) {
        return 'driveSync.overview.error';
      }

      if (this.driveSyncStatus().phase === 'uploading') {
        return 'driveSync.overview.uploading';
      }

      if (this.driveSyncStatus().phase === 'downloading') {
        return 'driveSync.overview.restoring';
      }

      if (this.driveManualSyncPrompt()) {
        return 'driveSync.overview.conflict';
      }

      if (this.driveSyncMetadata().pendingLocalChanges) {
        return 'driveSync.overview.pending';
      }

      if (!this.driveSyncMetadata().lastCheckedAt) {
        return 'driveSync.overview.connectedNotChecked';
      }

      if (this.driveSyncMetadata().hasRemoteBackup) {
        return 'driveSync.overview.backupFound';
      }

      return 'driveSync.overview.noBackup';
    });
    this.driveSecondaryMessage = computed(
      () => this.googleAccountLastError() ?? this.driveSyncStatus().detail,
    );
    this.driveOpenUrl = computed(() => {
      const metadata = this.driveSyncMetadata();

      if (metadata.knownFolderId) {
        return `https://drive.google.com/drive/folders/${encodeURIComponent(metadata.knownFolderId)}`;
      }

      if (metadata.knownBackupFileId) {
        return `https://drive.google.com/file/d/${encodeURIComponent(metadata.knownBackupFileId)}/view`;
      }

      return null;
    });
    this.googleAccountAvailable = this.googleAccount.isAvailable;
    this.googleAccountLastError = this.googleAccount.lastError;
    this.googleAccountProfile = this.googleAccount.profile;
    this.googleAccountSignedIn = this.googleAccount.isSignedIn;
    this.googleAccountStatus = this.googleAccount.status;
  }

  public async ngOnInit(): Promise<void> {
    await Promise.all([this.userState.ready(), this.characterOverrideState.ready()]);
  }

  public ionViewDidEnter(): void {
    void this.driveBackup.handleSettingsEntered();
  }

  public async onAutoTeamBuilderWorkerModeChange(
    event: CustomEvent<{ value?: AutoTeamBuilderWorkerMode | null }>,
  ): Promise<void> {
    const mode = event.detail.value;

    if (mode !== 'auto' && mode !== 'manual') {
      return;
    }

    await this.userState.setAutoTeamBuilderWorkerPreference({
      ...this.autoTeamBuilderWorkerPreference(),
      mode,
    });
  }

  public async onAutoTeamBuilderManualWorkerCountChange(
    event: CustomEvent<{ value?: number | string | null }>,
  ): Promise<void> {
    const nextValue = Number(event.detail.value);

    if (!Number.isInteger(nextValue) || nextValue <= 0) {
      return;
    }

    await this.userState.setAutoTeamBuilderWorkerPreference({
      ...this.autoTeamBuilderWorkerPreference(),
      manualCount: nextValue,
    });
  }

  public async acceptAnalyticsConsent(): Promise<void> {
    await this.analyticsConsentService.accept();
  }

  public async rejectAnalyticsConsent(): Promise<void> {
    await this.analyticsConsentService.reject();
  }

  public async reconnectGoogleDrive(): Promise<void> {
    await this.signInWithGoogle(true);
  }

  public async resolveDriveManualSyncPrompt(action: DriveManualSyncPromptAction): Promise<void> {
    await this.driveBackup.resolveManualSyncPrompt(action);
  }

  public async signInWithGoogle(forcePrompt = false): Promise<void> {
    try {
      await this.googleAccount.signIn(forcePrompt);
    } catch {
      return;
    }
  }

  public async signOutGoogle(): Promise<void> {
    await this.googleAccount.signOut();
  }

  public async syncDriveNow(): Promise<void> {
    await this.driveBackup.startManualSync({
      interactiveAuth: true,
      reason: 'manual-sync',
    });
  }

  public async refreshDriveInfo(): Promise<void> {
    await this.driveBackup.refreshRemoteState({
      interactiveAuth: true,
      reason: 'manual-refresh',
    });
  }

  public async showDriveRestorePrompt(): Promise<void> {
    await this.driveBackup.prepareRestorePrompt();
  }

  public openDriveLocation(): void {
    const url = this.driveOpenUrl();

    if (!url || typeof globalThis.open !== 'function') {
      return;
    }

    globalThis.open(url, '_blank', 'noopener');
  }

  public openFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onAllDataFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.importAllData(file);
  }

  public async onFavoritesFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.importFavorites(file);
  }

  public async onSavedTeamsFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.importSavedTeams(file);
  }

  public async onCharacterBoxesFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.importCharacterBoxes(file);
  }

  public async onFavoriteShipsFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.importFavoriteShips(file);
  }

  public async onCharacterOverridesFileSelected(
    event: Event,
    input: HTMLInputElement,
  ): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.importCharacterOverrides(file);
  }

  public async onSavedEnemiesFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.importSavedEnemies(file);
  }

  public async onInventoryOptcbxFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.prepareInventoryCapturePreview(file, 'optcbx-json');
  }

  public async onInventoryScreenshotFileSelected(
    event: Event,
    input: HTMLInputElement,
  ): Promise<void> {
    const file = this.extractSelectedFile(event, input);

    if (!file) {
      return;
    }

    await this.prepareInventoryCapturePreview(file, 'screenshot');
  }

  public onInventoryCaptureBoxSelectionChange(event: CustomEvent<{ value?: string | null }>): void {
    const nextSelection = typeof event.detail.value === 'string' ? event.detail.value : 'new';
    const existingBox = nextSelection === 'new' ? null : this.findInventoryTargetBox(nextSelection);

    this.inventoryCaptureBoxSelection.set(nextSelection || 'new');
    this.inventoryCaptureBoxName.set(
      existingBox?.name ?? this.inventoryCapturePreview()?.suggestedBoxName ?? '',
    );
  }

  public onInventoryCaptureBoxNameInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;

    this.inventoryCaptureBoxName.set(target?.value?.trim() ?? '');
  }

  public async exportAll(): Promise<void> {
    downloadAllDataExport(await this.userDataTransfer.buildAllDataPayload());
  }

  public async exportFavorites(): Promise<void> {
    if (!this.canExportFavorites()) {
      return;
    }

    downloadOptcbxFavoritesExport(await this.buildFavoritesExportPayload());
  }

  public async exportFavoriteShips(): Promise<void> {
    if (!this.canExportFavoriteShips()) {
      return;
    }

    downloadFavoriteShipsExport(await this.buildFavoriteShipsExportPayload());
  }

  public exportCharacterBoxes(): void {
    if (!this.canExportCharacterBoxes()) {
      return;
    }

    downloadCharacterBoxesExport(this.buildCharacterBoxesExportPayload());
  }

  public exportCharacterOverrides(): void {
    if (!this.canExportCharacterOverrides()) {
      return;
    }

    downloadCharacterOverridesExport(this.buildCharacterOverridesExportPayload());
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

  public clearInventoryCapturePreview(): void {
    this.inventoryCapturePreview.set(null);
    this.inventoryCaptureBoxSelection.set('new');
    this.inventoryCaptureBoxName.set('');
  }

  public async commitInventoryCapture(): Promise<void> {
    const preview = this.inventoryCapturePreview();

    if (!preview || !this.canCommitInventoryCapture()) {
      return;
    }

    this.inventoryCaptureImporting.set(true);
    this.inventoryCaptureFeedback.set(null);

    try {
      const applySummary = await this.inventoryCaptureImport.applyPreview(preview, {
        boxName: this.inventoryCaptureBoxName().trim() || preview.suggestedBoxName,
        boxSelection: this.inventoryCaptureBoxSelection(),
      });

      this.inventoryCaptureFeedback.set(this.buildInventoryCaptureApplyFeedback(applySummary));
      this.clearInventoryCapturePreview();
    } catch (error) {
      this.inventoryCaptureFeedback.set({
        tone: 'error',
        title: this.i18n.translate(
          'management.inventoryCapture.feedback.errorTitle',
          undefined,
          'settings',
        ),
        details: [this.resolveInventoryCaptureError(error)],
      });
    } finally {
      this.inventoryCaptureImporting.set(false);
    }
  }

  public async deleteAllFavorites(): Promise<void> {
    if (
      !this.canDeleteAllFavorites() ||
      !this.confirmAction(
        this.i18n.translate('management.confirm.deleteFavorites', undefined, 'settings'),
      )
    ) {
      return;
    }

    await this.userState.clearAllFavoriteCharacterIds();
  }

  public async deleteAllFavoriteShips(): Promise<void> {
    if (
      !this.canDeleteAllFavoriteShips() ||
      !this.confirmAction(
        this.i18n.translate('management.confirm.deleteFavoriteShips', undefined, 'settings'),
      )
    ) {
      return;
    }

    await this.userState.clearAllFavoriteShipIds();
  }

  public async deleteAllSavedTeams(): Promise<void> {
    if (
      !this.canDeleteAllSavedTeams() ||
      !this.confirmAction(
        this.i18n.translate('management.confirm.deleteSavedTeams', undefined, 'settings'),
      )
    ) {
      return;
    }

    await this.userState.clearAllSavedTeams();
  }

  public async deleteAllCharacterBoxes(): Promise<void> {
    if (
      !this.canDeleteAllCharacterBoxes() ||
      !this.confirmAction(
        this.i18n.translate('management.confirm.deleteCharacterBoxes', undefined, 'settings'),
      )
    ) {
      return;
    }

    await this.userState.clearAllCharacterBoxes();
  }

  public async deleteAllCharacterOverrides(): Promise<void> {
    if (
      !this.canDeleteAllCharacterOverrides() ||
      !this.confirmAction(
        this.i18n.translate('management.confirm.deleteCharacterOverrides', undefined, 'settings'),
      )
    ) {
      return;
    }

    await this.characterOverrideState.clearAllOverrides();
  }

  public async deleteAllSavedEnemies(): Promise<void> {
    if (
      !this.canDeleteAllSavedEnemies() ||
      !this.confirmAction(
        this.i18n.translate('management.confirm.deleteSavedEnemies', undefined, 'settings'),
      )
    ) {
      return;
    }

    await this.userState.clearAllSavedEnemies();
  }

  private extractSelectedFile(event: Event, input: HTMLInputElement): File | null {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = '';

    return file ?? null;
  }

  private async prepareInventoryCapturePreview(
    file: File,
    sourceKind: 'optcbx-json' | 'screenshot',
  ): Promise<void> {
    this.inventoryCaptureImporting.set(true);
    this.inventoryCaptureFeedback.set(null);

    try {
      const preview =
        sourceKind === 'optcbx-json'
          ? await this.inventoryCaptureImport.buildPreviewFromOptcbxFile(file)
          : await this.inventoryCaptureImport.buildPreviewFromScreenshotFile(file);

      this.inventoryCapturePreview.set(preview);
      this.inventoryCaptureBoxSelection.set('new');
      this.inventoryCaptureBoxName.set(preview.suggestedBoxName);
      this.inventoryCaptureFeedback.set(this.buildInventoryCapturePreviewFeedback(preview));
    } catch (error) {
      this.clearInventoryCapturePreview();
      this.inventoryCaptureFeedback.set({
        tone: 'error',
        title: this.i18n.translate(
          'management.inventoryCapture.feedback.errorTitle',
          undefined,
          'settings',
        ),
        details: [this.resolveInventoryCaptureError(error)],
      });
    } finally {
      this.inventoryCaptureImporting.set(false);
    }
  }

  private buildInventoryCapturePreviewFeedback(preview: InventoryCapturePreview): TransferFeedback {
    const details = [
      this.i18n.translate(
        'management.inventoryCapture.feedback.previewReady',
        { fileName: preview.fileName },
        'settings',
      ),
      this.i18n.translate(
        'management.inventoryCapture.feedback.stats.characters',
        { count: preview.payload.characterIds.length },
        'settings',
      ),
      this.i18n.translate(
        'management.inventoryCapture.feedback.stats.ships',
        { count: preview.payload.shipIds.length },
        'settings',
      ),
    ];

    if (preview.payload.unmatchedEntries.length > 0) {
      details.push(
        this.i18n.translate(
          'management.inventoryCapture.feedback.stats.unmatched',
          { count: preview.payload.unmatchedEntries.length },
          'settings',
        ),
      );
    }

    const tone: TransferFeedback['tone'] =
      preview.payload.characterIds.length > 0 || preview.payload.shipIds.length > 0
        ? preview.payload.unmatchedEntries.length > 0
          ? 'warning'
          : 'success'
        : 'warning';

    return {
      tone,
      title: this.i18n.translate(
        'management.inventoryCapture.feedback.successTitle',
        undefined,
        'settings',
      ),
      details,
    };
  }

  private buildInventoryCaptureApplyFeedback(
    summary: {
      addedShipCount: number;
      alreadyFavoritedShipCount: number;
      alreadyInBoxCount: number;
      boxAction: 'created' | 'skipped' | 'updated';
      boxName: string | null;
      matchedCharacterCount: number;
      matchedShipCount: number;
      unmatchedCount: number;
    },
  ): TransferFeedback {
    const details = [
      this.i18n.translate(
        'management.inventoryCapture.feedback.stats.characters',
        { count: summary.matchedCharacterCount },
        'settings',
      ),
      this.i18n.translate(
        'management.inventoryCapture.feedback.stats.ships',
        { count: summary.matchedShipCount },
        'settings',
      ),
    ];

    if (summary.boxAction === 'created' && summary.boxName) {
      details.push(
        this.i18n.translate(
          'management.inventoryCapture.feedback.stats.boxCreated',
          { name: summary.boxName },
          'settings',
        ),
      );
    }

    if (summary.boxAction === 'updated' && summary.boxName) {
      details.push(
        this.i18n.translate(
          'management.inventoryCapture.feedback.stats.boxUpdated',
          { name: summary.boxName },
          'settings',
        ),
      );
    }

    if (summary.alreadyInBoxCount > 0) {
      details.push(
        this.i18n.translate(
          'management.inventoryCapture.feedback.stats.alreadyInBox',
          { count: summary.alreadyInBoxCount },
          'settings',
        ),
      );
    }

    if (summary.addedShipCount > 0) {
      details.push(
        this.i18n.translate(
          'management.inventoryCapture.feedback.stats.addedShips',
          { count: summary.addedShipCount },
          'settings',
        ),
      );
    }

    if (summary.alreadyFavoritedShipCount > 0) {
      details.push(
        this.i18n.translate(
          'management.inventoryCapture.feedback.stats.alreadyFavoritedShips',
          { count: summary.alreadyFavoritedShipCount },
          'settings',
        ),
      );
    }

    if (summary.unmatchedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.inventoryCapture.feedback.stats.unmatched',
          { count: summary.unmatchedCount },
          'settings',
        ),
      );
    }

    details.push(
      this.i18n.translate('management.inventoryCapture.feedback.driveHint', undefined, 'settings'),
    );

    return {
      tone: summary.unmatchedCount > 0 ? 'warning' : 'success',
      title: this.i18n.translate(
        summary.unmatchedCount > 0
          ? 'management.inventoryCapture.feedback.warningTitle'
          : 'management.inventoryCapture.feedback.committedTitle',
        undefined,
        'settings',
      ),
      details,
    };
  }

  private resolveInventoryCaptureError(
    error: InventoryCaptureImportError | Error | unknown,
  ): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'settings');
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return this.i18n.translate('management.inventoryCapture.errors.generic', undefined, 'settings');
  }

  private findInventoryTargetBox(boxId: string): CharacterBox | null {
    return this.characterBoxes().find((box) => box.id === boxId) ?? null;
  }

  private async buildFavoritesExportPayload(): Promise<OptcbxFavoritesExportPayload> {
    const favoriteIds = this.favoriteIds();
    const favoriteCharacters = favoriteIds.length
      ? await this.repository.getCharactersByIds(favoriteIds)
      : [];

    return buildOptcbxFavoritesExportPayload(favoriteIds, favoriteCharacters);
  }

  private async buildFavoriteShipsExportPayload(): Promise<FavoriteShipsTransferPayload> {
    return buildFavoriteShipsTransferPayload(
      this.favoriteShipIds(),
      await this.repository.getShips(),
    );
  }

  private buildCharacterBoxesExportPayload(): CharacterBoxesTransferPayload {
    return buildCharacterBoxesTransferPayload(this.characterBoxes());
  }

  private buildCharacterOverridesExportPayload(): CharacterOverridesTransferPayload {
    return buildCharacterOverridesTransferPayload(this.characterOverrides());
  }

  private async importAllData(file: File): Promise<void> {
    this.allDataImporting.set(true);
    this.allDataFeedback.set(null);

    try {
      const rawContent = await file.text();
      const importCandidate = parseAllDataImportCandidate(rawContent);
      let feedback: TransferFeedback;

      switch (importCandidate.kind) {
        case 'all-data':
          feedback = await this.importAllDataBundle(importCandidate.payload, file.name);
          break;
        case 'favorites':
          feedback = this.buildCombinedAllDataFeedback(
            file.name,
            [
              {
                label: this.resolveAllDataSectionLabel('favorites'),
                feedback: await this.importFavoritesContent({
                  parsedPayload: importCandidate.payload,
                }),
              },
            ],
            [],
          );
          break;
        case 'favorite-ships':
          feedback = this.buildCombinedAllDataFeedback(
            file.name,
            [
              {
                label: this.resolveAllDataSectionLabel('favoriteShips'),
                feedback: await this.importFavoriteShipsContent({
                  fileName: file.name,
                  parsedPayload: importCandidate.payload,
                }),
              },
            ],
            [],
          );
          break;
        case 'saved-teams':
          feedback = this.buildCombinedAllDataFeedback(
            file.name,
            [
              {
                label: this.resolveAllDataSectionLabel('savedTeams'),
                feedback: await this.importSavedTeamsContent({
                  fileName: file.name,
                  parsedPayload: importCandidate.payload,
                }),
              },
            ],
            [],
          );
          break;
        case 'saved-rumble-teams':
          feedback = this.buildCombinedAllDataFeedback(
            file.name,
            [
              {
                label: this.resolveAllDataSectionLabel('savedRumbleTeams'),
                feedback: await this.importSavedRumbleTeamsContent({
                  fileName: file.name,
                  parsedPayload: importCandidate.payload,
                }),
              },
            ],
            [],
          );
          break;
        case 'saved-enemies':
          feedback = this.buildCombinedAllDataFeedback(
            file.name,
            [
              {
                label: this.resolveAllDataSectionLabel('savedEnemies'),
                feedback: await this.importSavedEnemiesContent({
                  fileName: file.name,
                  parsedPayload: importCandidate.payload,
                }),
              },
            ],
            [],
          );
          break;
        case 'character-boxes':
          feedback = this.buildCombinedAllDataFeedback(
            file.name,
            [
              {
                label: this.resolveAllDataSectionLabel('characterBoxes'),
                feedback: await this.importCharacterBoxesContent({
                  fileName: file.name,
                  parsedPayload: importCandidate.payload,
                }),
              },
            ],
            [],
          );
          break;
        case 'character-overrides':
          feedback = this.buildCombinedAllDataFeedback(
            file.name,
            [
              {
                label: this.resolveAllDataSectionLabel('characterOverrides'),
                feedback: await this.importCharacterOverridesContent({
                  fileName: file.name,
                  parsedPayload: importCandidate.payload,
                }),
              },
            ],
            [],
          );
          break;
      }

      this.allDataFeedback.set(feedback);
    } catch (error) {
      this.allDataFeedback.set({
        tone: 'error',
        title: this.i18n.translate('management.allData.feedback.errorTitle', undefined, 'settings'),
        details: [this.resolveAllDataImportError(error)],
      });
    } finally {
      this.allDataImporting.set(false);
    }
  }

  private async importAllDataBundle(
    payload: AllDataTransferPayload,
    fileName: string,
  ): Promise<TransferFeedback> {
    const successfulSections: CombinedImportSectionFeedback[] = [];
    const failedSections: CombinedImportSectionError[] = [];

    if (payload.favorites !== undefined) {
      await this.collectAllDataSectionResult({
        failedSections,
        label: this.resolveAllDataSectionLabel('favorites'),
        run: async () => {
          const stats = await this.userDataTransfer.importFavoritesPayload(
            payload.favorites as unknown,
          );

          return this.buildFavoritesImportFeedback(stats.duplicatesRemoved, {
            addedCount: stats.addedCount,
            alreadyFavoritedCount: stats.alreadyFavoritedCount,
            matchedIds: Array.from({ length: stats.matchedCount }, (_, index) => index),
            unmatchedIds: Array.from({ length: stats.unknownCharacterCount }, (_, index) => index),
          });
        },
        successfulSections,
        resolveError: (error) => this.resolveFavoritesImportError(error),
      });
    }

    if (payload.favoriteShips !== undefined) {
      await this.collectAllDataSectionResult({
        failedSections,
        label: this.resolveAllDataSectionLabel('favoriteShips'),
        run: async () =>
          this.buildFavoriteShipsImportFeedback({
            ...(await this.userDataTransfer.importFavoriteShipsPayload(
              payload.favoriteShips as unknown,
            )),
            fileName,
          }),
        successfulSections,
        resolveError: (error) => this.resolveFavoriteShipsImportError(error),
      });
    }

    if (payload.savedTeams !== undefined) {
      await this.collectAllDataSectionResult({
        failedSections,
        label: this.resolveAllDataSectionLabel('savedTeams'),
        run: async () =>
          this.buildSavedTeamsImportFeedback({
            ...(await this.userDataTransfer.importSavedTeamsPayload(payload.savedTeams as unknown)),
            fileName,
          }),
        successfulSections,
        resolveError: (error) => this.resolveSavedTeamsImportError(error),
      });
    }

    if (payload.characterBoxes !== undefined) {
      await this.collectAllDataSectionResult({
        failedSections,
        label: this.resolveAllDataSectionLabel('characterBoxes'),
        run: async () =>
          this.buildCharacterBoxesImportFeedback({
            ...(await this.userDataTransfer.importCharacterBoxesPayload(
              payload.characterBoxes as unknown,
            )),
            fileName,
          }),
        successfulSections,
        resolveError: (error) => this.resolveCharacterBoxesImportError(error),
      });
    }

    if (payload.savedRumbleTeams !== undefined) {
      await this.collectAllDataSectionResult({
        failedSections,
        label: this.resolveAllDataSectionLabel('savedRumbleTeams'),
        run: async () =>
          this.buildSavedRumbleTeamsImportFeedback({
            ...(await this.userDataTransfer.importSavedRumbleTeamsPayload(
              payload.savedRumbleTeams as unknown,
            )),
            fileName,
          }),
        successfulSections,
        resolveError: (error) => this.resolveSavedRumbleTeamsImportError(error),
      });
    }

    if (payload.characterOverrides !== undefined) {
      await this.collectAllDataSectionResult({
        failedSections,
        label: this.resolveAllDataSectionLabel('characterOverrides'),
        run: async () =>
          this.buildCharacterOverridesImportFeedback({
            ...(await this.userDataTransfer.importCharacterOverridesPayload(
              payload.characterOverrides as unknown,
            )),
            fileName,
          }),
        successfulSections,
        resolveError: (error) => this.resolveCharacterOverridesImportError(error),
      });
    }

    if (payload.savedEnemies !== undefined) {
      await this.collectAllDataSectionResult({
        failedSections,
        label: this.resolveAllDataSectionLabel('savedEnemies'),
        run: async () =>
          this.buildSavedEnemiesImportFeedback({
            ...(await this.userDataTransfer.importSavedEnemiesPayload(
              payload.savedEnemies as unknown,
            )),
            fileName,
          }),
        successfulSections,
        resolveError: (error) => this.resolveSavedEnemiesImportError(error),
      });
    }

    return this.buildCombinedAllDataFeedback(fileName, successfulSections, failedSections);
  }

  private async collectAllDataSectionResult(options: {
    failedSections: CombinedImportSectionError[];
    label: string;
    resolveError: (error: unknown) => string;
    run: () => Promise<TransferFeedback>;
    successfulSections: CombinedImportSectionFeedback[];
  }): Promise<void> {
    try {
      options.successfulSections.push({
        label: options.label,
        feedback: await options.run(),
      });
    } catch (error) {
      options.failedSections.push({
        label: options.label,
        message: options.resolveError(error),
      });
    }
  }

  private buildCombinedAllDataFeedback(
    fileName: string,
    successfulSections: CombinedImportSectionFeedback[],
    failedSections: CombinedImportSectionError[],
  ): TransferFeedback {
    const details = [
      this.i18n.translate('management.allData.feedback.loadedFromFile', { fileName }, 'settings'),
      ...successfulSections.flatMap(({ label, feedback }) => [
        `${label}: ${feedback.title}`,
        ...feedback.details.map((detail) => `${label}: ${detail}`),
      ]),
      ...failedSections.map(({ label, message }) => `${label}: ${message}`),
    ];
    const hasWarnings = successfulSections.some(({ feedback }) => feedback.tone === 'warning');
    const hasErrors = failedSections.length > 0;
    const tone: TransferFeedback['tone'] = hasErrors
      ? successfulSections.length > 0
        ? 'warning'
        : 'error'
      : hasWarnings
        ? 'warning'
        : 'success';

    return {
      tone,
      title: this.i18n.translate(
        tone === 'error'
          ? 'management.allData.feedback.errorTitle'
          : tone === 'warning'
            ? 'management.allData.feedback.warningTitle'
            : 'management.allData.feedback.successTitle',
        undefined,
        'settings',
      ),
      details,
    };
  }

  private resolveAllDataSectionLabel(
    section:
      | 'characterBoxes'
      | 'characterOverrides'
      | 'favoriteShips'
      | 'favorites'
      | 'savedEnemies'
      | 'savedRumbleTeams'
      | 'savedTeams',
  ): string {
    switch (section) {
      case 'favorites':
        return this.i18n.translate('management.favorites.title', undefined, 'settings');
      case 'favoriteShips':
        return this.i18n.translate('management.favoriteShips.title', undefined, 'settings');
      case 'characterBoxes':
        return this.i18n.translate('management.characterBoxes.title', undefined, 'settings');
      case 'characterOverrides':
        return this.i18n.translate('management.characterOverrides.title', undefined, 'settings');
      case 'savedTeams':
        return this.i18n.translate('management.savedTeams.title', undefined, 'settings');
      case 'savedRumbleTeams':
        return this.i18n.translate('management.savedRumbleTeams.title', undefined, 'settings');
      case 'savedEnemies':
        return this.i18n.translate('management.savedEnemies.title', undefined, 'settings');
    }
  }

  private resolveAllDataImportError(error: unknown): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'settings');
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return this.i18n.translate('management.allData.errors.generic', undefined, 'settings');
  }

  private async importFavorites(file: File): Promise<void> {
    this.favoritesImporting.set(true);
    this.favoritesFeedback.set(null);

    try {
      this.favoritesFeedback.set(
        await this.importFavoritesContent({
          rawContent: await file.text(),
        }),
      );
    } catch (error) {
      this.favoritesFeedback.set({
        tone: 'error',
        title: this.i18n.translate(
          'management.favorites.feedback.errorTitle',
          undefined,
          'settings',
        ),
        details: [this.resolveFavoritesImportError(error)],
      });
    } finally {
      this.favoritesImporting.set(false);
    }
  }

  private async importFavoritesContent(input: {
    parsedPayload?: unknown;
    rawContent?: string;
  }): Promise<TransferFeedback> {
    const parsedImport =
      input.parsedPayload === undefined
        ? this.optcbxImport.parseExport(input.rawContent ?? '')
        : this.optcbxImport.parseExportPayload(input.parsedPayload);
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

    return this.buildFavoritesImportFeedback(parsedImport.duplicatesRemoved, importResult);
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
        this.i18n.translate('import.removedDuplicates', { count: duplicatesRemoved }, 'characters'),
      );
    }

    details.push(
      `${this.i18n.translate('import.stats.matched', undefined, 'characters')}: ${importResult.matchedIds.length}`,
    );

    if (importResult.addedCount > 0) {
      details.push(
        `${this.i18n.translate('import.stats.added', undefined, 'characters')}: ${importResult.addedCount}`,
      );
    }

    if (importResult.alreadyFavoritedCount > 0) {
      details.push(
        `${this.i18n.translate('import.stats.alreadyFavorited', undefined, 'characters')}: ${importResult.alreadyFavoritedCount}`,
      );
    }

    if (importResult.unmatchedIds.length > 0) {
      details.push(
        `${this.i18n.translate('import.stats.unknownIds', undefined, 'characters')}: ${importResult.unmatchedIds.length}`,
      );
    }

    const hasWarnings = duplicatesRemoved > 0 || importResult.unmatchedIds.length > 0;

    return {
      tone: hasWarnings ? 'warning' : 'success',
      title: this.i18n.translate(
        hasWarnings
          ? 'management.favorites.feedback.warningTitle'
          : 'management.favorites.feedback.successTitle',
        undefined,
        'settings',
      ),
      details,
    };
  }

  private resolveFavoritesImportError(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return this.i18n.translate('import.errors.generic', undefined, 'characters');
  }

  private async importFavoriteShips(file: File): Promise<void> {
    this.favoriteShipsImporting.set(true);
    this.favoriteShipsFeedback.set(null);

    try {
      this.favoriteShipsFeedback.set(
        await this.importFavoriteShipsContent({
          fileName: file.name,
          rawContent: await file.text(),
        }),
      );
    } catch (error) {
      this.favoriteShipsFeedback.set({
        tone: 'error',
        title: this.i18n.translate(
          'management.favoriteShips.feedback.errorTitle',
          undefined,
          'settings',
        ),
        details: [this.resolveFavoriteShipsImportError(error)],
      });
    } finally {
      this.favoriteShipsImporting.set(false);
    }
  }

  private async importFavoriteShipsContent(input: {
    fileName: string;
    parsedPayload?: unknown;
    rawContent?: string;
  }): Promise<TransferFeedback> {
    const payload =
      input.parsedPayload === undefined
        ? parseFavoriteShipsImportPayload(input.rawContent ?? '')
        : input.parsedPayload;
    const stats = await this.userDataTransfer.importFavoriteShipsPayload(payload);

    return this.buildFavoriteShipsImportFeedback({
      ...stats,
      fileName: input.fileName,
    });
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
        'management.favoriteShips.feedback.loadedFromFile',
        { fileName: stats.fileName },
        'settings',
      ),
      this.i18n.translate(
        'management.favoriteShips.feedback.stats.matched',
        { count: stats.matchedShipCount },
        'settings',
      ),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.favoriteShips.feedback.stats.added',
          { count: stats.addedCount },
          'settings',
        ),
      );
    }

    if (stats.alreadyFavoritedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.favoriteShips.feedback.stats.alreadyFavorited',
          { count: stats.alreadyFavoritedCount },
          'settings',
        ),
      );
    }

    if (stats.duplicateIdCount > 0) {
      details.push(
        this.i18n.translate(
          'management.favoriteShips.feedback.stats.duplicates',
          { count: stats.duplicateIdCount },
          'settings',
        ),
      );
    }

    if (stats.invalidShipCount > 0) {
      details.push(
        this.i18n.translate(
          'management.favoriteShips.feedback.stats.invalid',
          { count: stats.invalidShipCount },
          'settings',
        ),
      );
    }

    if (stats.unknownShipCount > 0) {
      details.push(
        this.i18n.translate(
          'management.favoriteShips.feedback.stats.unknown',
          { count: stats.unknownShipCount },
          'settings',
        ),
      );
    }

    const hasWarnings =
      stats.duplicateIdCount > 0 || stats.invalidShipCount > 0 || stats.unknownShipCount > 0;

    return {
      tone: hasWarnings ? 'warning' : 'success',
      title: this.i18n.translate(
        hasWarnings
          ? 'management.favoriteShips.feedback.warningTitle'
          : 'management.favoriteShips.feedback.successTitle',
        undefined,
        'settings',
      ),
      details,
    };
  }

  private resolveFavoriteShipsImportError(
    error: FavoriteShipsImportError | Error | unknown,
  ): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'settings');
    }

    return this.i18n.translate('management.favoriteShips.errors.generic', undefined, 'settings');
  }

  private async importCharacterBoxes(file: File): Promise<void> {
    this.characterBoxesImporting.set(true);
    this.characterBoxesFeedback.set(null);

    try {
      this.characterBoxesFeedback.set(
        await this.importCharacterBoxesContent({
          fileName: file.name,
          rawContent: await file.text(),
        }),
      );
    } catch (error) {
      this.characterBoxesFeedback.set({
        tone: 'error',
        title: this.i18n.translate(
          'management.characterBoxes.feedback.errorTitle',
          undefined,
          'settings',
        ),
        details: [this.resolveCharacterBoxesImportError(error)],
      });
    } finally {
      this.characterBoxesImporting.set(false);
    }
  }

  private async importCharacterBoxesContent(input: {
    fileName: string;
    parsedPayload?: unknown;
    rawContent?: string;
  }): Promise<TransferFeedback> {
    const payload =
      input.parsedPayload === undefined
        ? parseCharacterBoxesImportPayload(input.rawContent ?? '')
        : input.parsedPayload;
    const stats = await this.userDataTransfer.importCharacterBoxesPayload(payload);

    return this.buildCharacterBoxesImportFeedback({
      ...stats,
      fileName: input.fileName,
    });
  }

  private buildCharacterBoxesImportFeedback(stats: {
    addedCount: number;
    duplicateIdCount: number;
    fileName: string;
    invalidBoxCount: number;
    unknownCharacterIdCount: number;
    updatedCount: number;
  }): TransferFeedback {
    const details = [
      this.i18n.translate(
        'management.characterBoxes.feedback.loadedFromFile',
        { fileName: stats.fileName },
        'settings',
      ),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterBoxes.feedback.stats.added',
          { count: stats.addedCount },
          'settings',
        ),
      );
    }

    if (stats.updatedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterBoxes.feedback.stats.updated',
          { count: stats.updatedCount },
          'settings',
        ),
      );
    }

    if (stats.invalidBoxCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterBoxes.feedback.stats.invalid',
          { count: stats.invalidBoxCount },
          'settings',
        ),
      );
    }

    if (stats.duplicateIdCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterBoxes.feedback.stats.duplicates',
          { count: stats.duplicateIdCount },
          'settings',
        ),
      );
    }

    if (stats.unknownCharacterIdCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterBoxes.feedback.stats.unknownCharacters',
          { count: stats.unknownCharacterIdCount },
          'settings',
        ),
      );
    }

    const hasWarnings =
      stats.invalidBoxCount > 0 || stats.duplicateIdCount > 0 || stats.unknownCharacterIdCount > 0;

    return {
      tone: hasWarnings ? 'warning' : 'success',
      title: this.i18n.translate(
        hasWarnings
          ? 'management.characterBoxes.feedback.warningTitle'
          : 'management.characterBoxes.feedback.successTitle',
        undefined,
        'settings',
      ),
      details,
    };
  }

  private resolveCharacterBoxesImportError(
    error: CharacterBoxesImportError | Error | unknown,
  ): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'settings');
    }

    return this.i18n.translate('management.characterBoxes.errors.generic', undefined, 'settings');
  }

  private async importCharacterOverrides(file: File): Promise<void> {
    this.characterOverridesImporting.set(true);
    this.characterOverridesFeedback.set(null);

    try {
      this.characterOverridesFeedback.set(
        await this.importCharacterOverridesContent({
          fileName: file.name,
          rawContent: await file.text(),
        }),
      );
    } catch (error) {
      this.characterOverridesFeedback.set({
        tone: 'error',
        title: this.i18n.translate(
          'management.characterOverrides.feedback.errorTitle',
          undefined,
          'settings',
        ),
        details: [this.resolveCharacterOverridesImportError(error)],
      });
    } finally {
      this.characterOverridesImporting.set(false);
    }
  }

  private async importCharacterOverridesContent(input: {
    fileName: string;
    parsedPayload?: unknown;
    rawContent?: string;
  }): Promise<TransferFeedback> {
    const payload =
      input.parsedPayload === undefined
        ? parseCharacterOverridesImportPayload(input.rawContent ?? '')
        : input.parsedPayload;
    const stats = await this.userDataTransfer.importCharacterOverridesPayload(payload);

    return this.buildCharacterOverridesImportFeedback({
      ...stats,
      fileName: input.fileName,
    });
  }

  private buildCharacterOverridesImportFeedback(stats: {
    addedCount: number;
    duplicateCharacterIdCount: number;
    fileName: string;
    invalidOverrideCount: number;
    unknownCharacterIdCount: number;
    updatedCount: number;
  }): TransferFeedback {
    const details = [
      this.i18n.translate(
        'management.characterOverrides.feedback.loadedFromFile',
        { fileName: stats.fileName },
        'settings',
      ),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterOverrides.feedback.stats.added',
          { count: stats.addedCount },
          'settings',
        ),
      );
    }

    if (stats.updatedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterOverrides.feedback.stats.updated',
          { count: stats.updatedCount },
          'settings',
        ),
      );
    }

    if (stats.invalidOverrideCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterOverrides.feedback.stats.invalid',
          { count: stats.invalidOverrideCount },
          'settings',
        ),
      );
    }

    if (stats.duplicateCharacterIdCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterOverrides.feedback.stats.duplicates',
          { count: stats.duplicateCharacterIdCount },
          'settings',
        ),
      );
    }

    if (stats.unknownCharacterIdCount > 0) {
      details.push(
        this.i18n.translate(
          'management.characterOverrides.feedback.stats.unknownCharacters',
          { count: stats.unknownCharacterIdCount },
          'settings',
        ),
      );
    }

    const hasWarnings =
      stats.invalidOverrideCount > 0 ||
      stats.duplicateCharacterIdCount > 0 ||
      stats.unknownCharacterIdCount > 0;

    return {
      tone: hasWarnings ? 'warning' : 'success',
      title: this.i18n.translate(
        hasWarnings
          ? 'management.characterOverrides.feedback.warningTitle'
          : 'management.characterOverrides.feedback.successTitle',
        undefined,
        'settings',
      ),
      details,
    };
  }

  private resolveCharacterOverridesImportError(
    error: CharacterOverridesImportError | Error | unknown,
  ): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'settings');
    }

    return this.i18n.translate(
      'management.characterOverrides.errors.generic',
      undefined,
      'settings',
    );
  }

  private async importSavedTeams(file: File): Promise<void> {
    this.savedTeamsImporting.set(true);
    this.savedTeamsFeedback.set(null);

    try {
      this.savedTeamsFeedback.set(
        await this.importSavedTeamsContent({
          fileName: file.name,
          rawContent: await file.text(),
        }),
      );
    } catch (error) {
      this.savedTeamsFeedback.set({
        tone: 'error',
        title: this.i18n.translate('import.errorTitle', undefined, 'saved-teams'),
        details: this.resolveSavedTeamsImportErrorDetails(error),
      });
    } finally {
      this.savedTeamsImporting.set(false);
    }
  }

  private async importSavedTeamsContent(input: {
    fileName: string;
    parsedPayload?: unknown;
    rawContent?: string;
  }): Promise<TransferFeedback> {
    const payload =
      input.parsedPayload === undefined
        ? parseSavedTeamsImportPayload(input.rawContent ?? '')
        : input.parsedPayload;
    const stats = await this.userDataTransfer.importSavedTeamsPayload(payload);

    return this.buildSavedTeamsImportFeedback({
      ...stats,
      fileName: input.fileName,
    });
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
      this.i18n.translate('import.loadedFromFile', { fileName: stats.fileName }, 'saved-teams'),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate('import.stats.added', { count: stats.addedCount }, 'saved-teams'),
      );
    }

    if (stats.updatedCount > 0) {
      details.push(
        this.i18n.translate('import.stats.updated', { count: stats.updatedCount }, 'saved-teams'),
      );
    }

    if (stats.invalidTeamCount > 0) {
      details.push(
        this.i18n.translate(
          'import.stats.invalid',
          { count: stats.invalidTeamCount },
          'saved-teams',
        ),
      );
    }

    if (stats.duplicateIdCount > 0) {
      details.push(
        this.i18n.translate(
          'import.stats.duplicates',
          { count: stats.duplicateIdCount },
          'saved-teams',
        ),
      );
    }

    if (stats.unknownSlotCount > 0) {
      details.push(
        this.i18n.translate(
          'import.stats.unknownSlots',
          { count: stats.unknownSlotCount },
          'saved-teams',
        ),
      );
    }

    const hasWarnings =
      stats.invalidTeamCount > 0 || stats.duplicateIdCount > 0 || stats.unknownSlotCount > 0;

    return {
      tone: hasWarnings ? 'warning' : 'success',
      title: this.i18n.translate(
        hasWarnings ? 'import.warningTitle' : 'import.successTitle',
        undefined,
        'saved-teams',
      ),
      details,
    };
  }

  private resolveSavedTeamsImportError(error: SavedTeamsImportError | Error | unknown): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'saved-teams');
    }

    return this.i18n.translate('import.errors.generic', undefined, 'saved-teams');
  }

  private resolveSavedTeamsImportErrorDetails(
    error: SavedTeamsImportError | Error | unknown,
  ): string[] {
    const details = [this.resolveSavedTeamsImportError(error)];
    const diagnostic = resolveSavedTeamsImportDiagnostic(error);

    if (diagnostic) {
      details.push(
        this.i18n.translate('import.diagnosticCode', { code: diagnostic.code }, 'saved-teams'),
        this.i18n.translate(diagnostic.recoveryKey, undefined, 'saved-teams'),
      );
    }

    return details;
  }

  private async importSavedRumbleTeamsContent(input: {
    fileName: string;
    parsedPayload: unknown;
  }): Promise<TransferFeedback> {
    const stats = await this.userDataTransfer.importSavedRumbleTeamsPayload(input.parsedPayload);

    return this.buildSavedRumbleTeamsImportFeedback({
      ...stats,
      fileName: input.fileName,
    });
  }

  private buildSavedRumbleTeamsImportFeedback(stats: {
    addedCount: number;
    fileName: string;
    updatedCount: number;
  }): TransferFeedback {
    const details = [
      this.i18n.translate(
        'management.savedRumbleTeams.feedback.loadedFromFile',
        { fileName: stats.fileName },
        'settings',
      ),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.savedRumbleTeams.feedback.stats.added',
          { count: stats.addedCount },
          'settings',
        ),
      );
    }

    if (stats.updatedCount > 0) {
      details.push(
        this.i18n.translate(
          'management.savedRumbleTeams.feedback.stats.updated',
          { count: stats.updatedCount },
          'settings',
        ),
      );
    }

    return {
      tone: 'success',
      title: this.i18n.translate(
        'management.savedRumbleTeams.feedback.successTitle',
        undefined,
        'settings',
      ),
      details,
    };
  }

  private resolveSavedRumbleTeamsImportError(error: Error | unknown): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'settings');
    }

    return this.i18n.translate('management.savedRumbleTeams.errors.generic', undefined, 'settings');
  }

  private async importSavedEnemies(file: File): Promise<void> {
    this.savedEnemiesImporting.set(true);
    this.savedEnemiesFeedback.set(null);

    try {
      this.savedEnemiesFeedback.set(
        await this.importSavedEnemiesContent({
          fileName: file.name,
          rawContent: await file.text(),
        }),
      );
    } catch (error) {
      this.savedEnemiesFeedback.set({
        tone: 'error',
        title: this.i18n.translate('bulkImport.errorTitle', undefined, 'saved-enemies'),
        details: [this.resolveSavedEnemiesImportError(error)],
      });
    } finally {
      this.savedEnemiesImporting.set(false);
    }
  }

  private async importSavedEnemiesContent(input: {
    fileName: string;
    parsedPayload?: unknown;
    rawContent?: string;
  }): Promise<TransferFeedback> {
    const payload =
      input.parsedPayload === undefined
        ? parseSavedEnemiesImportPayload(input.rawContent ?? '')
        : input.parsedPayload;
    const stats = await this.userDataTransfer.importSavedEnemiesPayload(payload);

    return this.buildSavedEnemiesImportFeedback({
      ...stats,
      fileName: input.fileName,
    });
  }

  private buildSavedEnemiesImportFeedback(stats: {
    addedCount: number;
    duplicateIdCount: number;
    fileName: string;
    invalidEnemyCount: number;
    updatedCount: number;
  }): TransferFeedback {
    const details = [
      this.i18n.translate(
        'bulkImport.loadedFromFile',
        { fileName: stats.fileName },
        'saved-enemies',
      ),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate('bulkImport.stats.added', { count: stats.addedCount }, 'saved-enemies'),
      );
    }

    if (stats.updatedCount > 0) {
      details.push(
        this.i18n.translate(
          'bulkImport.stats.updated',
          { count: stats.updatedCount },
          'saved-enemies',
        ),
      );
    }

    if (stats.invalidEnemyCount > 0) {
      details.push(
        this.i18n.translate(
          'bulkImport.stats.invalid',
          { count: stats.invalidEnemyCount },
          'saved-enemies',
        ),
      );
    }

    if (stats.duplicateIdCount > 0) {
      details.push(
        this.i18n.translate(
          'bulkImport.stats.duplicates',
          { count: stats.duplicateIdCount },
          'saved-enemies',
        ),
      );
    }

    const hasWarnings = stats.invalidEnemyCount > 0 || stats.duplicateIdCount > 0;

    return {
      tone: hasWarnings ? 'warning' : 'success',
      title: this.i18n.translate(
        hasWarnings ? 'bulkImport.warningTitle' : 'bulkImport.successTitle',
        undefined,
        'saved-enemies',
      ),
      details,
    };
  }

  private resolveSavedEnemiesImportError(error: SavedEnemiesImportError | Error | unknown): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'saved-enemies');
    }

    return this.i18n.translate('bulkImport.errors.invalidPayload', undefined, 'saved-enemies');
  }

  public formatTimestamp(value: string | null | undefined): string {
    if (!value) {
      return this.i18n.translate('driveSync.status.never', undefined, 'settings');
    }

    const parsedValue = new Date(value);

    if (Number.isNaN(parsedValue.getTime())) {
      return value;
    }

    return parsedValue.toLocaleString();
  }

  public getDriveLocationStatus(): string {
    const metadata = this.driveSyncMetadata();

    if (!metadata.lastCheckedAt) {
      return this.i18n.translate('driveSync.location.notChecked', undefined, 'settings');
    }

    if (metadata.knownFolderId) {
      return this.i18n.translate('driveSync.location.folderVisible', undefined, 'settings');
    }

    return this.i18n.translate('driveSync.location.folderAfterSync', undefined, 'settings');
  }

  public getDriveBackupFileStatus(): string {
    const metadata = this.driveSyncMetadata();

    if (!metadata.lastCheckedAt) {
      return this.i18n.translate('driveSync.location.notChecked', undefined, 'settings');
    }

    if (metadata.hasRemoteBackup) {
      return this.i18n.translate('driveSync.location.fileVisible', undefined, 'settings');
    }

    return this.i18n.translate('driveSync.location.fileMissing', undefined, 'settings');
  }

  public getRemoteSummaryState(): string {
    const metadata = this.driveSyncMetadata();

    if (!metadata.lastCheckedAt) {
      return this.i18n.translate('driveSync.summary.notChecked', undefined, 'settings');
    }

    if (!metadata.hasRemoteBackup) {
      return this.i18n.translate('driveSync.summary.noBackup', undefined, 'settings');
    }

    return this.i18n.translate('driveSync.summary.remoteReady', undefined, 'settings');
  }

  public getSummaryCountLabel(
    key:
      | 'characterBoxes'
      | 'characterOverrides'
      | 'favorites'
      | 'favoriteShips'
      | 'savedEnemies'
      | 'savedTeams',
    count: number,
  ): string {
    return this.i18n.translate(`management.counts.${key}`, { count }, 'settings');
  }

  private confirmAction(message: string): boolean {
    return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
  }
}

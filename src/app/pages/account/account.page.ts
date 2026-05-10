import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  cloudDoneOutline,
  cloudOfflineOutline,
  cloudUploadOutline,
  gitCompareOutline,
  personCircleOutline,
} from 'ionicons/icons';

import { type CharacterListItem } from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  DriveBackupService,
  type DriveManualSyncPromptAction,
  type DriveReviewedSyncAction,
} from '../../core/services/drive-backup.service';
import {
  GoogleAccountService,
  type GoogleAccountProfile,
} from '../../core/services/google-account.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserDataTransferService } from '../../core/services/user-data-transfer.service';
import {
  buildDriveSyncReviewDraft,
  buildReviewedAllDataPayload,
  type DriveSyncReviewChoice,
  type DriveSyncReviewDraft,
  type DriveSyncReviewRow,
  type DriveSyncReviewRowStatus,
  type DriveSyncReviewSection,
  type DriveSyncReviewSectionKey,
  updateDriveSyncReviewRowChoice,
} from '../drive-sync/drive-sync-review.utils';

@Component({
  selector: 'app-account-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonModal,
    IonSpinner,
    IonTitle,
    IonToolbar,
    TranslocoDirective,
  ],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
})
export class AccountPage {
  public readonly cloudDoneIcon = cloudDoneOutline;
  public readonly cloudOfflineIcon = cloudOfflineOutline;
  public readonly cloudUploadIcon = cloudUploadOutline;
  public readonly compareIcon = gitCompareOutline;
  public readonly accountIcon = personCircleOutline;

  public readonly driveManualSyncPrompt;
  public readonly driveSyncMetadata;
  public readonly driveSyncStatus;
  public readonly drivePrimaryStateKey;
  public readonly driveSecondaryMessage;
  public readonly googleAccountAvailable;
  public readonly googleAccountLastError;
  public readonly googleAccountProfile;
  public readonly googleAccountSignedIn;
  public readonly googleAccountStatus;
  public readonly localSyncScopeSummary;
  public readonly remoteSyncScopeSummary;
  public readonly reviewDraft = signal<DriveSyncReviewDraft | null>(null);
  public readonly reviewFilter = signal<DriveSyncReviewRowStatus | 'all'>('all');
  public readonly reviewOpening = signal(false);
  public readonly reviewStatusFilters = [
    'added',
    'changed',
    'kept',
    'removed',
  ] as const satisfies readonly DriveSyncReviewRowStatus[];
  public readonly reviewSubmitting = signal(false);

  private readonly reviewCharacterMap = signal<Map<number, CharacterListItem>>(new Map());

  public readonly reviewTotals = computed(() => {
    const draft = this.reviewDraft();
    const rows = draft?.sections.flatMap((section) => section.rows) ?? [];
    const counts = this.countReviewRows(rows);

    return {
      ...counts,
      total: rows.length,
    };
  });

  public readonly filteredReviewSections = computed(() => {
    const draft = this.reviewDraft();
    const filter = this.reviewFilter();

    if (!draft) {
      return [];
    }

    return draft.sections.flatMap((section): DriveSyncReviewSection[] => {
      const rows =
        filter === 'all'
          ? section.rows
          : section.rows.filter((row) => this.getReviewRowStatus(row) === filter);

      if (!rows.length) {
        return [];
      }

      const counts = this.countReviewRows(rows);

      return [
        {
          ...section,
          addedCount: counts.added,
          changedCount: counts.changed,
          keptCount: counts.kept,
          removedCount: counts.removed,
          rows,
        },
      ];
    });
  });

  public readonly driveOpenUrl = computed(() => {
    const metadata = this.driveSyncMetadata();

    if (metadata.knownFolderId) {
      return `https://drive.google.com/drive/folders/${encodeURIComponent(metadata.knownFolderId)}`;
    }

    if (metadata.knownBackupFileId) {
      return `https://drive.google.com/file/d/${encodeURIComponent(metadata.knownBackupFileId)}/view`;
    }

    return null;
  });

  public constructor(
    private readonly driveBackup: DriveBackupService,
    private readonly googleAccount: GoogleAccountService,
    private readonly i18n: AppI18nService,
    private readonly repository: OptcRepositoryService,
    private readonly userDataTransfer: UserDataTransferService,
  ) {
    this.driveManualSyncPrompt = this.driveBackup.manualSyncPrompt;
    this.driveSyncMetadata = this.driveBackup.metadata;
    this.driveSyncStatus = this.driveBackup.syncStatus;
    this.googleAccountAvailable = this.googleAccount.isAvailable;
    this.googleAccountLastError = this.googleAccount.lastError;
    this.googleAccountProfile = this.googleAccount.profile;
    this.googleAccountSignedIn = this.googleAccount.isSignedIn;
    this.googleAccountStatus = this.googleAccount.status;
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
  }

  public async ngOnInit(): Promise<void> {
    await this.driveBackup.ready();
  }

  public async confirmReview(): Promise<void> {
    const draft = this.reviewDraft();

    if (!draft) {
      return;
    }

    this.reviewSubmitting.set(true);

    try {
      const success = await this.driveBackup.commitReviewedManualSync(
        draft.action,
        buildReviewedAllDataPayload(draft),
      );

      if (success) {
        this.reviewDraft.set(null);
        this.reviewFilter.set('all');
      }
    } finally {
      this.reviewSubmitting.set(false);
    }
  }

  public closeReview(): void {
    if (this.reviewSubmitting()) {
      return;
    }

    this.reviewDraft.set(null);
    this.reviewFilter.set('all');
  }

  public formatTimestamp(value: string | null | undefined): string {
    if (!value) {
      return this.i18n.translate('driveSync.status.never', undefined, 'settings');
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsedDate);
  }

  public getChoiceLabelKey(choice: DriveSyncReviewChoice): string {
    return `driveSync.review.choices.${choice}`;
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

  public getProfileDisplayName(profile: GoogleAccountProfile): string {
    return profile.name ?? profile.email ?? profile.id;
  }

  public getProfileInitials(profile: GoogleAccountProfile): string {
    const source = this.getProfileDisplayName(profile);
    const initials = source
      .split(/[\s@._-]+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase())
      .join('');

    return initials || '?';
  }

  public getReviewActionLabelKey(action: DriveReviewedSyncAction): string {
    return `driveSync.review.actions.${action}`;
  }

  public getReviewRowImage(row: DriveSyncReviewRow): string | null {
    if (row.section !== 'favorites') {
      return null;
    }

    const characterId = Number(row.key);

    return this.reviewCharacterMap().get(characterId)?.imageUrl ?? null;
  }

  public getReviewStatusLabelKey(row: DriveSyncReviewRow): string {
    if (this.getReviewRowStatus(row) === 'removed') {
      return 'driveSync.review.status.removed';
    }

    return `driveSync.review.status.${row.status}`;
  }

  public getReviewStatsLabelKey(status: DriveSyncReviewRowStatus): string {
    return `driveSync.review.stats.${status}`;
  }

  public getSectionLabelKey(sectionKey: DriveSyncReviewSectionKey): string {
    return `driveSync.review.sections.${sectionKey}`;
  }

  public getSummaryCountLabel(
    key:
      | 'characterBoxes'
      | 'characterOverrides'
      | 'favorites'
      | 'favoriteShips'
      | 'savedEnemies'
      | 'savedRumbleTeams'
      | 'savedTeams',
    count: number,
  ): string {
    return this.i18n.translate(`management.counts.${key}`, { count }, 'settings');
  }

  public onReviewChoiceChange(
    sectionKey: DriveSyncReviewSectionKey,
    rowKey: string,
    event: Event,
  ): void {
    const draft = this.reviewDraft();
    const choice = (event.target as HTMLSelectElement | null)?.value as DriveSyncReviewChoice;

    if (!draft) {
      return;
    }

    this.reviewDraft.set(updateDriveSyncReviewRowChoice(draft, sectionKey, rowKey, choice));
  }

  public setReviewFilter(status: DriveSyncReviewRowStatus): void {
    this.reviewFilter.update((currentFilter) => (currentFilter === status ? 'all' : status));
  }

  public openDriveLocation(): void {
    const url = this.driveOpenUrl();

    if (!url || typeof globalThis.open !== 'function') {
      return;
    }

    globalThis.open(url, '_blank', 'noopener,noreferrer');
  }

  public async openReviewedSync(action: DriveReviewedSyncAction): Promise<void> {
    this.reviewOpening.set(true);

    try {
      const preview = await this.driveBackup.prepareReviewedManualSync(action);

      if (!preview) {
        return;
      }

      const draft = buildDriveSyncReviewDraft(preview.localPayload, preview.drivePayload, action);

      this.reviewFilter.set('all');
      this.reviewDraft.set(draft);
      await this.loadReviewCharacters(draft);
    } finally {
      this.reviewOpening.set(false);
    }
  }

  public async reconnectGoogleDrive(): Promise<void> {
    await this.signInWithGoogle(true);
  }

  public async refreshDriveInfo(): Promise<void> {
    await this.driveBackup.refreshRemoteState({
      interactiveAuth: true,
      reason: 'manual-refresh',
    });
  }

  public async resolveDriveManualSyncPrompt(action: DriveManualSyncPromptAction): Promise<void> {
    if (action === 'cancel' || action === 'upload-local') {
      await this.driveBackup.resolveManualSyncPrompt(action);
      return;
    }

    await this.openReviewedSync(action);
  }

  public async showDriveRestorePrompt(): Promise<void> {
    await this.driveBackup.prepareRestorePrompt();
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

  private async loadReviewCharacters(draft: DriveSyncReviewDraft): Promise<void> {
    const characterIds = [
      ...new Set(
        draft.sections
          .filter((section) => section.key === 'favorites')
          .flatMap((section) => section.rows.map((row) => Number(row.key)))
          .filter((characterId) => Number.isInteger(characterId) && characterId > 0),
      ),
    ];

    if (!characterIds.length) {
      this.reviewCharacterMap.set(new Map());
      return;
    }

    const characters = await this.repository.getCharactersByIds(characterIds);

    this.reviewCharacterMap.set(
      new Map(characters.map((character) => [character.id, character] as const)),
    );
  }

  private countReviewRows(rows: DriveSyncReviewRow[]): Record<DriveSyncReviewRowStatus, number> {
    return {
      added: rows.filter((row) => this.getReviewRowStatus(row) === 'added').length,
      changed: rows.filter((row) => this.getReviewRowStatus(row) === 'changed').length,
      kept: rows.filter((row) => this.getReviewRowStatus(row) === 'kept').length,
      removed: rows.filter((row) => this.getReviewRowStatus(row) === 'removed').length,
    };
  }

  private getReviewRowStatus(row: DriveSyncReviewRow): DriveSyncReviewRowStatus {
    if (row.choice === 'remove') {
      return 'removed';
    }

    return row.status;
  }
}

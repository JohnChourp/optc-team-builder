import { Inject, Injector, Optional, effect, Injectable, signal } from '@angular/core';

import { APP_SYNC_CONFIG, type AppSyncConfig } from '../sync/app-sync.config';
import { GoogleAccountService, type GoogleAccountProfile } from './google-account.service';
import {
  DriveSyncStateService,
  type StoredDriveSyncMetadata,
} from './drive-sync-state.service';
import {
  type AllDataTransferPayload,
  parseAllDataImportCandidate,
} from '../../pages/settings/all-data-transfer.utils';
import {
  type DriveConflictResolution,
  type SyncScopeSummary,
  UserDataTransferService,
} from './user-data-transfer.service';

const BACKUP_FILE_NAME = 'optc-all-data.latest.json';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface DriveRemoteBackupInfo {
  exportedAt: string | null;
  fileId: string;
  fileName: string;
  folderId: string;
  modifiedTime: string | null;
}

export interface DriveRestorePrompt {
  kind: 'conflict' | 'restore';
  remote: DriveRemoteBackupInfo;
}

export interface DriveSyncStatus {
  detail: string | null;
  phase: 'checking' | 'disabled' | 'downloading' | 'error' | 'idle' | 'needs-auth' | 'uploading';
  updatedAt: string | null;
}

interface DriveFileListResponse {
  files?: Array<{
    appProperties?: Record<string, string>;
    id?: string;
    modifiedTime?: string;
    name?: string;
    parents?: string[];
  }>;
}

interface DriveRemoteSnapshot {
  backup: DriveRemoteBackupInfo | null;
  folderId: string | null;
  summary: SyncScopeSummary | null;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function createIdleStatus(detail: string | null = null): DriveSyncStatus {
  return {
    detail,
    phase: 'idle',
    updatedAt: new Date().toISOString(),
  };
}

@Injectable({ providedIn: 'root' })
export class DriveBackupService {
  public readonly remoteBackup = signal<DriveRemoteBackupInfo | null>(null);
  public readonly restorePrompt = signal<DriveRestorePrompt | null>(null);
  public readonly syncStatus = signal<DriveSyncStatus>({
    detail: null,
    phase: 'disabled',
    updatedAt: null,
  });

  private readonly readyPromise: Promise<void>;

  public get metadata() {
    return this.syncState.metadata;
  }

  public constructor(
    @Inject(APP_SYNC_CONFIG) private readonly config: AppSyncConfig,
    private readonly account: GoogleAccountService,
    private readonly syncState: DriveSyncStateService,
    private readonly transfer: UserDataTransferService,
    @Optional() private readonly injector: Injector | null = null,
  ) {
    this.readyPromise = this.initialize();
    this.registerEffects();
  }

  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  public async flushPendingUploads(options: {
    interactiveAuth?: boolean;
    reason?: string;
  } = {}): Promise<boolean> {
    await this.ready();

    if (!this.account.isAvailable()) {
      this.syncStatus.set({
        detail: null,
        phase: 'disabled',
        updatedAt: new Date().toISOString(),
      });
      return false;
    }

    if (this.restorePrompt()) {
      this.syncStatus.set(
        createIdleStatus('Resolve the pending Drive conflict before starting a manual sync.'),
      );
      return false;
    }

    this.syncStatus.set({
      detail: options.reason ?? 'Checking Drive before syncing.',
      phase: 'checking',
      updatedAt: new Date().toISOString(),
    });

    try {
      const accessToken = await this.account.ensureAccessToken({
        interactive: options.interactiveAuth,
      });

      if (!accessToken) {
        this.syncStatus.set({
          detail: this.account.lastError(),
          phase: 'needs-auth',
          updatedAt: new Date().toISOString(),
        });
        return false;
      }

      const remoteSnapshot = await this.inspectRemoteSnapshot(accessToken, true);

      this.remoteBackup.set(remoteSnapshot.backup);
      await this.syncState.recordRemoteSnapshot({
        fileId: remoteSnapshot.backup?.fileId ?? null,
        folderId: remoteSnapshot.backup?.folderId ?? remoteSnapshot.folderId,
        hasRemoteBackup: remoteSnapshot.backup !== null,
        remoteExportedAt: remoteSnapshot.backup?.exportedAt ?? null,
        remoteModifiedTime: remoteSnapshot.backup?.modifiedTime ?? null,
        remoteSummary: remoteSnapshot.summary,
      });

      if (
        remoteSnapshot.backup &&
        this.syncState.pendingLocalChanges() &&
        this.isRemoteBackupNewer(remoteSnapshot.backup, this.syncState.metadata())
      ) {
        this.setPromptForRemoteBackup(remoteSnapshot.backup);
        this.syncStatus.set(
          createIdleStatus('A newer Drive backup needs your decision before syncing.'),
        );
        return false;
      }

      if (remoteSnapshot.backup && !this.syncState.pendingLocalChanges()) {
        this.restorePrompt.set(null);
        this.syncStatus.set(createIdleStatus('Drive backup is already up to date.'));
        return true;
      }

      this.syncStatus.set({
        detail: 'Uploading the current device backup to Drive.',
        phase: 'uploading',
        updatedAt: new Date().toISOString(),
      });

      const payload = await this.transfer.buildAllDataPayload();
      const remoteSummary = this.transfer.getSyncScopeSummary();
      const remoteBackup = await this.upsertRemoteBackup(
        accessToken,
        payload,
        this.account.profile(),
        remoteSnapshot.folderId,
      );

      this.remoteBackup.set(remoteBackup);
      this.restorePrompt.set(null);
      await this.syncState.recordUpload({
        account: this.account.profile(),
        exportedAt: payload.exportedAt,
        fileId: remoteBackup.fileId,
        folderId: remoteBackup.folderId,
        remoteModifiedTime: remoteBackup.modifiedTime,
        remoteSummary,
      });
      this.syncStatus.set(createIdleStatus('Drive backup updated.'));

      return true;
    } catch (error) {
      this.syncStatus.set({
        detail: this.resolveErrorMessage(error),
        phase: 'error',
        updatedAt: new Date().toISOString(),
      });
      return false;
    }
  }

  public async handleSettingsEntered(): Promise<void> {
    await this.ready();
  }

  public async noteLocalChange(): Promise<void> {
    await this.ready();
    await this.syncState.markLocalChange();
  }

  public async prepareRestorePrompt(): Promise<DriveRestorePrompt | null> {
    await this.ready();
    const remoteBackup = await this.refreshRemoteState({
      interactiveAuth: true,
      reason: 'Checking Drive before showing restore options.',
    });

    if (!remoteBackup) {
      return null;
    }

    this.setPromptForRemoteBackup(remoteBackup);

    return this.restorePrompt();
  }

  public async refreshRemoteState(options: {
    interactiveAuth?: boolean;
    reason?: string;
  } = {}): Promise<DriveRemoteBackupInfo | null> {
    await this.ready();

    if (!this.account.isAvailable()) {
      this.syncStatus.set({
        detail: null,
        phase: 'disabled',
        updatedAt: new Date().toISOString(),
      });
      return null;
    }

    this.syncStatus.set({
      detail: options.reason ?? 'Checking Google Drive.',
      phase: 'checking',
      updatedAt: new Date().toISOString(),
    });

    try {
      const accessToken = await this.account.ensureAccessToken({
        interactive: options.interactiveAuth,
      });

      if (!accessToken) {
        this.syncStatus.set({
          detail: this.account.lastError(),
          phase: 'needs-auth',
          updatedAt: new Date().toISOString(),
        });
        return null;
      }

      const remoteSnapshot = await this.inspectRemoteSnapshot(accessToken, true);

      this.remoteBackup.set(remoteSnapshot.backup);
      await this.syncState.recordRemoteSnapshot({
        fileId: remoteSnapshot.backup?.fileId ?? null,
        folderId: remoteSnapshot.backup?.folderId ?? remoteSnapshot.folderId,
        hasRemoteBackup: remoteSnapshot.backup !== null,
        remoteExportedAt: remoteSnapshot.backup?.exportedAt ?? null,
        remoteModifiedTime: remoteSnapshot.backup?.modifiedTime ?? null,
        remoteSummary: remoteSnapshot.summary,
      });

      if (remoteSnapshot.backup && this.isRemoteBackupNewer(remoteSnapshot.backup, this.syncState.metadata())) {
        this.setPromptForRemoteBackup(remoteSnapshot.backup);
      } else {
        this.restorePrompt.set(null);
      }

      this.syncStatus.set(
        createIdleStatus(
          remoteSnapshot.backup
            ? 'Drive backup details refreshed.'
            : remoteSnapshot.folderId
              ? 'No Drive backup file was found in the app folder.'
              : 'No Drive backup folder exists yet. It will appear after the first sync.',
        ),
      );

      return remoteSnapshot.backup;
    } catch (error) {
      this.syncStatus.set({
        detail: this.resolveErrorMessage(error),
        phase: 'error',
        updatedAt: new Date().toISOString(),
      });
      return null;
    }
  }

  public async resolveRestorePrompt(
    resolution: DriveConflictResolution,
  ): Promise<AllDataTransferPayload | null> {
    await this.ready();

    const prompt = this.restorePrompt();

    if (!prompt) {
      return null;
    }

    if (resolution === 'keep-local') {
      await this.syncState.markRemoteSeen(prompt.remote.modifiedTime);
      await this.syncState.markLocalChange();
      this.restorePrompt.set(null);
      this.syncStatus.set(
        createIdleStatus('Keeping local data. Use Sync now if you want to overwrite Drive.'),
      );

      return null;
    }

    this.syncStatus.set({
      detail: resolution === 'restore' ? 'Restoring from Drive.' : 'Merging Drive backup locally.',
      phase: 'downloading',
      updatedAt: new Date().toISOString(),
    });

    try {
      const accessToken = await this.account.ensureAccessToken({ interactive: true });

      if (!accessToken) {
        this.syncStatus.set({
          detail: this.account.lastError(),
          phase: 'needs-auth',
          updatedAt: new Date().toISOString(),
        });
        return null;
      }

      const payload = await this.downloadRemoteBackup(accessToken, prompt.remote.fileId);
      const remoteSummary = this.transfer.getSyncScopeSummaryFromPayload(payload);

      await this.transfer.applyAllDataPayload(
        payload,
        resolution === 'restore' ? 'restore' : 'merge',
      );
      await this.syncState.recordDownload({
        account: this.account.profile(),
        exportedAt: prompt.remote.exportedAt,
        fileId: prompt.remote.fileId,
        folderId: prompt.remote.folderId,
        remoteModifiedTime: prompt.remote.modifiedTime,
        remoteSummary,
      });

      this.restorePrompt.set(null);
      this.remoteBackup.set(prompt.remote);

      if (resolution === 'merge') {
        await this.syncState.markLocalChange();
      }

      this.syncStatus.set(
        createIdleStatus(
          resolution === 'restore'
            ? 'Local data restored from Drive.'
            : 'Drive backup merged locally. Use Sync now to upload the merged data.',
        ),
      );

      return payload;
    } catch (error) {
      this.syncStatus.set({
        detail: this.resolveErrorMessage(error),
        phase: 'error',
        updatedAt: new Date().toISOString(),
      });
      return null;
    }
  }

  private buildCachedRemoteBackup(metadata: StoredDriveSyncMetadata): DriveRemoteBackupInfo | null {
    if (!metadata.hasRemoteBackup || !metadata.knownBackupFileId || !metadata.knownFolderId) {
      return null;
    }

    return {
      exportedAt: metadata.remoteExportedAt,
      fileId: metadata.knownBackupFileId,
      fileName: BACKUP_FILE_NAME,
      folderId: metadata.knownFolderId,
      modifiedTime: metadata.remoteModifiedTime,
    };
  }

  private async createDriveFolder(accessToken: string): Promise<string> {
    const response = await this.authorizedFetch(accessToken, DRIVE_FILES_ENDPOINT, {
      body: JSON.stringify({
        appProperties: {
          optcApp: 'optc-team-builder',
          optcRole: 'backup-folder',
        },
        mimeType: DRIVE_FOLDER_MIME_TYPE,
        name: this.config.googleDriveFolderName,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    const payload = (await response.json()) as { id?: string };
    const folderId = normalizeOptionalString(payload.id);

    if (!folderId) {
      throw new Error('Google Drive did not return a folder id.');
    }

    return folderId;
  }

  private async downloadRemoteBackup(
    accessToken: string,
    fileId: string,
  ): Promise<AllDataTransferPayload> {
    const response = await this.authorizedFetch(
      accessToken,
      `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`,
    );
    const rawPayload = await response.text();
    const importCandidate = parseAllDataImportCandidate(rawPayload);

    if (importCandidate.kind !== 'all-data') {
      throw new Error('The Drive backup file does not contain a full all-data payload.');
    }

    return importCandidate.payload;
  }

  private async findBackupFile(
    accessToken: string,
    folderId: string,
  ): Promise<DriveRemoteBackupInfo | null> {
    const query =
      `'${folderId}' in parents and trashed = false and ` +
      `appProperties has { key='optcRole' and value='all-data-backup' }`;
    const response = await this.authorizedFetch(
      accessToken,
      `${DRIVE_FILES_ENDPOINT}?${this.buildListSearchParams(query)}`,
    );
    const payload = (await response.json()) as DriveFileListResponse;
    const file = payload.files?.[0];
    const fileId = normalizeOptionalString(file?.id);

    if (!fileId) {
      return null;
    }

    return {
      exportedAt: normalizeOptionalString(file?.appProperties?.['exportedAt']),
      fileId,
      fileName: normalizeOptionalString(file?.name) ?? BACKUP_FILE_NAME,
      folderId,
      modifiedTime: normalizeOptionalString(file?.modifiedTime),
    };
  }

  private async findVisibleDriveFolder(accessToken: string): Promise<string | null> {
    const query =
      `mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false and ` +
      `appProperties has { key='optcRole' and value='backup-folder' }`;
    const response = await this.authorizedFetch(
      accessToken,
      `${DRIVE_FILES_ENDPOINT}?${this.buildListSearchParams(query)}`,
    );
    const payload = (await response.json()) as DriveFileListResponse;

    return normalizeOptionalString(payload.files?.[0]?.id);
  }

  private async initialize(): Promise<void> {
    await Promise.all([this.account.ready(), this.syncState.ready(), this.transfer.ready()]);

    if (!this.account.isAvailable()) {
      this.syncStatus.set({
        detail: null,
        phase: 'disabled',
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    this.remoteBackup.set(this.buildCachedRemoteBackup(this.syncState.metadata()));
    this.syncStatus.set(
      this.account.isSignedIn()
        ? createIdleStatus(
            this.syncState.metadata().lastCheckedAt
              ? 'Drive details are cached from your last manual check.'
              : 'Google account connected. Drive has not been checked yet.',
          )
        : {
            detail: null,
            phase: 'needs-auth',
            updatedAt: new Date().toISOString(),
          },
    );
  }

  private async inspectRemoteSnapshot(
    accessToken: string,
    includePayloadSummary: boolean,
  ): Promise<DriveRemoteSnapshot> {
    const folderId = await this.ensureDriveFolderId(accessToken, false);

    if (!folderId) {
      return {
        backup: null,
        folderId: null,
        summary: null,
      };
    }

    const backup = await this.findBackupFile(accessToken, folderId);

    if (!backup || !includePayloadSummary) {
      return {
        backup,
        folderId,
        summary: null,
      };
    }

    const payload = await this.downloadRemoteBackup(accessToken, backup.fileId);

    return {
      backup,
      folderId,
      summary: this.transfer.getSyncScopeSummaryFromPayload(payload),
    };
  }

  private isRemoteBackupNewer(
    remoteBackup: DriveRemoteBackupInfo,
    metadata: StoredDriveSyncMetadata,
  ): boolean {
    const remoteModifiedTime = Date.parse(remoteBackup.modifiedTime ?? '');
    const lastSeenRemoteTime = Date.parse(metadata.lastSeenRemoteModifiedTime ?? '');

    if (!Number.isFinite(remoteModifiedTime)) {
      return false;
    }

    if (!Number.isFinite(lastSeenRemoteTime)) {
      return true;
    }

    return remoteModifiedTime > lastSeenRemoteTime;
  }

  private registerEffects(): void {
    if (!this.injector) {
      return;
    }

    effect(() => {
      const profile = this.account.profile();

      void this.syncState.setConnectedAccount(profile);
    }, { injector: this.injector });

    effect(() => {
      const revision = this.account.sessionRevision();

      if (revision === 0) {
        return;
      }

      this.restorePrompt.set(null);

      if (this.account.isSignedIn()) {
        const metadata = this.syncState.metadata();

        this.remoteBackup.set(this.buildCachedRemoteBackup(metadata));
        this.syncStatus.set(
          createIdleStatus(
            metadata.lastCheckedAt
              ? 'Google account connected. Drive details are cached from the last manual check.'
              : 'Google account connected. Drive has not been checked yet.',
          ),
        );
        return;
      }

      this.remoteBackup.set(null);
      this.syncStatus.set(
        this.account.isAvailable()
          ? {
              detail: null,
              phase: 'needs-auth',
              updatedAt: new Date().toISOString(),
            }
          : {
              detail: null,
              phase: 'disabled',
              updatedAt: new Date().toISOString(),
            },
      );
    }, { injector: this.injector });
  }

  private setPromptForRemoteBackup(remoteBackup: DriveRemoteBackupInfo): void {
    this.restorePrompt.set({
      kind:
        this.transfer.hasSyncScopedData() || this.syncState.pendingLocalChanges()
          ? 'conflict'
          : 'restore',
      remote: remoteBackup,
    });
  }

  private async upsertRemoteBackup(
    accessToken: string,
    payload: AllDataTransferPayload,
    account: GoogleAccountProfile | null,
    existingFolderId: string | null,
  ): Promise<DriveRemoteBackupInfo> {
    const folderId = existingFolderId ?? (await this.ensureDriveFolderId(accessToken, true));

    if (!folderId) {
      throw new Error('Google Drive folder is unavailable.');
    }

    const existingBackup = await this.findBackupFile(accessToken, folderId);
    const metadata = {
      appProperties: {
        accountId: account?.id ?? '',
        deviceId: this.syncState.metadata().deviceId,
        exportedAt: payload.exportedAt,
        optcApp: 'optc-team-builder',
        optcRole: 'all-data-backup',
      },
      mimeType: 'application/json',
      name: BACKUP_FILE_NAME,
      ...(existingBackup ? {} : { parents: [folderId] }),
    };
    const formData = new FormData();

    formData.append(
      'metadata',
      new Blob([JSON.stringify(metadata)], {
        type: 'application/json',
      }),
    );
    formData.append(
      'file',
      new Blob([JSON.stringify(payload, null, 2) + '\n'], {
        type: 'application/json',
      }),
    );

    const response = await this.authorizedFetch(
      accessToken,
      existingBackup
        ? `${DRIVE_UPLOAD_ENDPOINT}/${encodeURIComponent(existingBackup.fileId)}?uploadType=multipart&fields=id,modifiedTime,appProperties,name`
        : `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id,modifiedTime,appProperties,name`,
      {
        body: formData,
        method: existingBackup ? 'PATCH' : 'POST',
      },
    );
    const updatedFile = (await response.json()) as {
      appProperties?: Record<string, string>;
      id?: string;
      modifiedTime?: string;
      name?: string;
    };
    const fileId = normalizeOptionalString(updatedFile.id);

    if (!fileId) {
      throw new Error('Google Drive did not return a backup file id.');
    }

    return {
      exportedAt:
        normalizeOptionalString(updatedFile.appProperties?.['exportedAt']) ?? payload.exportedAt,
      fileId,
      fileName: normalizeOptionalString(updatedFile.name) ?? BACKUP_FILE_NAME,
      folderId,
      modifiedTime: normalizeOptionalString(updatedFile.modifiedTime),
    };
  }

  private buildListSearchParams(query: string): string {
    const params = new URLSearchParams({
      fields: 'files(id,name,modifiedTime,appProperties,parents)',
      pageSize: '10',
      q: query,
      spaces: 'drive',
    });

    return params.toString();
  }

  private async ensureDriveFolderId(
    accessToken: string,
    createIfMissing: boolean,
  ): Promise<string | null> {
    const existingFolderId = await this.findVisibleDriveFolder(accessToken);

    if (existingFolderId || !createIfMissing) {
      return existingFolderId;
    }

    return this.createDriveFolder(accessToken);
  }

  private async authorizedFetch(
    accessToken: string,
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);

    headers.set('Authorization', `Bearer ${accessToken}`);

    const response = await fetch(input, {
      ...init,
      headers,
    });

    if (response.ok) {
      return response;
    }

    const errorBody = await response.text();

    throw new Error(
      `Google Drive request failed with ${response.status}${errorBody ? `: ${errorBody}` : ''}`,
    );
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return 'Google Drive sync failed.';
  }
}

import { Inject, Injector, Optional, effect, Injectable, signal } from '@angular/core';
import { App } from '@capacitor/app';

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

  private foregroundListenerRegistered = false;
  private readonly readyPromise: Promise<void>;
  private uploadTimer: ReturnType<typeof setTimeout> | null = null;

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
    return this.flushPendingUploadsInternal(options);
  }

  private async flushPendingUploadsInternal(options: {
    interactiveAuth?: boolean;
    reason?: string;
  } = {}): Promise<boolean> {
    if (!this.account.isAvailable()) {
      this.syncStatus.set({
        detail: null,
        phase: 'disabled',
        updatedAt: new Date().toISOString(),
      });
      return false;
    }

    if (this.restorePrompt()) {
      this.syncStatus.set(createIdleStatus('A newer Drive backup needs your decision first.'));
      return false;
    }

    if (!this.syncState.pendingLocalChanges()) {
      this.syncStatus.set(createIdleStatus(options.reason ?? null));
      return false;
    }

    this.syncStatus.set({
      detail: options.reason ?? null,
      phase: 'uploading',
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

      const payload = await this.transfer.buildAllDataPayload();
      const remoteBackup = await this.upsertRemoteBackup(accessToken, payload, this.account.profile());

      this.remoteBackup.set(remoteBackup);
      await this.syncState.recordUpload({
        account: this.account.profile(),
        exportedAt: payload.exportedAt,
        remoteModifiedTime: remoteBackup.modifiedTime,
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
    await this.refreshRemoteState({ reason: 'settings-opened' });

    if (!this.restorePrompt()) {
      await this.flushPendingUploads({ reason: 'settings-opened' });
    }
  }

  public async noteLocalChange(): Promise<void> {
    await this.ready();
    await this.syncState.markLocalChange();
    this.scheduleUpload();
  }

  public async prepareRestorePrompt(): Promise<DriveRestorePrompt | null> {
    await this.ready();
    const remoteBackup = await this.refreshRemoteState({
      interactiveAuth: true,
      reason: 'restore-requested',
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
    return this.refreshRemoteStateInternal(options);
  }

  private async refreshRemoteStateInternal(options: {
    interactiveAuth?: boolean;
    reason?: string;
  } = {}): Promise<DriveRemoteBackupInfo | null> {
    if (!this.account.isAvailable()) {
      this.syncStatus.set({
        detail: null,
        phase: 'disabled',
        updatedAt: new Date().toISOString(),
      });
      return null;
    }

    this.syncStatus.set({
      detail: options.reason ?? null,
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

      const remoteBackup = await this.findRemoteBackup(accessToken);

      this.remoteBackup.set(remoteBackup);

      if (remoteBackup && this.isRemoteBackupNewer(remoteBackup, this.syncState.metadata())) {
        this.setPromptForRemoteBackup(remoteBackup);
      } else if (!remoteBackup) {
        this.restorePrompt.set(null);
      }

      this.syncStatus.set(createIdleStatus(options.reason ?? null));

      return remoteBackup;
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
      this.scheduleUpload(300);
      this.syncStatus.set(createIdleStatus('Keeping local data and scheduling a new upload.'));

      return null;
    }

    this.syncStatus.set({
      detail: resolution === 'restore' ? 'Restoring from Drive.' : 'Merging Drive backup.',
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

      await this.transfer.applyAllDataPayload(
        payload,
        resolution === 'restore' ? 'restore' : 'merge',
      );
      await this.syncState.recordDownload({
        account: this.account.profile(),
        exportedAt: prompt.remote.exportedAt,
        remoteModifiedTime: prompt.remote.modifiedTime,
      });

      this.restorePrompt.set(null);
      this.remoteBackup.set(prompt.remote);

      if (resolution === 'merge') {
        await this.syncState.markLocalChange();
        this.scheduleUpload(300);
      }

      this.syncStatus.set(
        createIdleStatus(
          resolution === 'restore'
            ? 'Local data restored from Drive.'
            : 'Drive backup merged into local data.',
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

  private async findRemoteBackup(accessToken: string): Promise<DriveRemoteBackupInfo | null> {
    const folderId = await this.ensureDriveFolderId(accessToken, false);

    if (!folderId) {
      return null;
    }

    return this.findBackupFile(accessToken, folderId);
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

  private async handleAuthenticated(): Promise<void> {
    await this.syncState.setConnectedAccount(this.account.profile());

    const remoteBackup = await this.refreshRemoteStateInternal({ reason: 'account-connected' });

    if (!remoteBackup || !this.restorePrompt()) {
      await this.flushPendingUploadsInternal({ reason: 'account-connected' });
    }
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

    if (!this.foregroundListenerRegistered) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void this.onAppForeground();
        }
      });
      this.foregroundListenerRegistered = true;
    }

    this.syncStatus.set(
      this.account.isSignedIn()
        ? createIdleStatus()
        : {
            detail: null,
            phase: 'needs-auth',
            updatedAt: new Date().toISOString(),
          },
    );

    if (this.account.isSignedIn()) {
      await this.handleAuthenticated();
    }
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

      if (this.account.isSignedIn()) {
        void this.handleAuthenticated();
        return;
      }

      this.remoteBackup.set(null);
      this.restorePrompt.set(null);
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

    effect(() => {
      const pendingLocalChanges = this.syncState.pendingLocalChanges();

      if (!pendingLocalChanges || !this.account.isSignedIn() || this.restorePrompt()) {
        return;
      }

      this.scheduleUpload();
    }, { injector: this.injector });
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

  private async onAppForeground(): Promise<void> {
    await this.ready();

    const remoteBackup = await this.refreshRemoteState({ reason: 'app-foregrounded' });

    if (!remoteBackup || !this.restorePrompt()) {
      await this.flushPendingUploads({ reason: 'app-foregrounded' });
    }
  }

  private scheduleUpload(delay = 1500): void {
    if (this.uploadTimer !== null) {
      clearTimeout(this.uploadTimer);
    }

    this.uploadTimer = setTimeout(() => {
      this.uploadTimer = null;
      void this.flushPendingUploads({ reason: 'local-change' });
    }, delay);
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
  ): Promise<DriveRemoteBackupInfo> {
    const folderId = await this.ensureDriveFolderId(accessToken, true);

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
      exportedAt: normalizeOptionalString(updatedFile.appProperties?.['exportedAt']) ?? payload.exportedAt,
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

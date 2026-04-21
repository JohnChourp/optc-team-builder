import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { type GoogleAccountProfile } from './google-account.service';
import { type SyncScopeSummary } from './user-data-transfer.service';

const DRIVE_SYNC_METADATA_KEY = 'driveSyncMetadata';

export interface StoredDriveSyncMetadata {
  connectedAccountEmail: string | null;
  connectedAccountId: string | null;
  deviceId: string;
  hasRemoteBackup: boolean;
  knownBackupFileId: string | null;
  knownFolderId: string | null;
  lastCheckedAt: string | null;
  lastDownloadedExportedAt: string | null;
  lastSeenRemoteModifiedTime: string | null;
  lastUploadedExportedAt: string | null;
  pendingLocalChanges: boolean;
  remoteExportedAt: string | null;
  remoteModifiedTime: string | null;
  remoteSummary: SyncScopeSummary | null;
}

function createFallbackDeviceId(): string {
  return `device-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function createDeviceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return createFallbackDeviceId();
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeSummaryCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeSyncScopeSummary(value: unknown): SyncScopeSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    characterBoxesCount: normalizeSummaryCount(record['characterBoxesCount']),
    characterOverridesCount: normalizeSummaryCount(record['characterOverridesCount']),
    favoriteCharacterCount: normalizeSummaryCount(record['favoriteCharacterCount']),
    favoriteShipCount: normalizeSummaryCount(record['favoriteShipCount']),
    savedEnemiesCount: normalizeSummaryCount(record['savedEnemiesCount']),
    savedTeamsCount: normalizeSummaryCount(record['savedTeamsCount']),
  };
}

function normalizeStoredDriveSyncMetadata(value: unknown): StoredDriveSyncMetadata {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    connectedAccountEmail: normalizeOptionalString(record['connectedAccountEmail']),
    connectedAccountId: normalizeOptionalString(record['connectedAccountId']),
    deviceId: normalizeOptionalString(record['deviceId']) ?? createDeviceId(),
    hasRemoteBackup: record['hasRemoteBackup'] === true,
    knownBackupFileId: normalizeOptionalString(record['knownBackupFileId']),
    knownFolderId: normalizeOptionalString(record['knownFolderId']),
    lastCheckedAt: normalizeOptionalString(record['lastCheckedAt']),
    lastDownloadedExportedAt: normalizeOptionalString(record['lastDownloadedExportedAt']),
    lastSeenRemoteModifiedTime: normalizeOptionalString(record['lastSeenRemoteModifiedTime']),
    lastUploadedExportedAt: normalizeOptionalString(record['lastUploadedExportedAt']),
    pendingLocalChanges: record['pendingLocalChanges'] === true,
    remoteExportedAt: normalizeOptionalString(record['remoteExportedAt']),
    remoteModifiedTime: normalizeOptionalString(record['remoteModifiedTime']),
    remoteSummary: normalizeSyncScopeSummary(record['remoteSummary']),
  };
}

@Injectable({ providedIn: 'root' })
export class DriveSyncStateService {
  public readonly metadata = signal<StoredDriveSyncMetadata>({
    connectedAccountEmail: null,
    connectedAccountId: null,
    deviceId: createDeviceId(),
    hasRemoteBackup: false,
    knownBackupFileId: null,
    knownFolderId: null,
    lastCheckedAt: null,
    lastDownloadedExportedAt: null,
    lastSeenRemoteModifiedTime: null,
    lastUploadedExportedAt: null,
    pendingLocalChanges: false,
    remoteExportedAt: null,
    remoteModifiedTime: null,
    remoteSummary: null,
  });
  public readonly pendingLocalChanges = computed(() => this.metadata().pendingLocalChanges);

  private readonly hydratePromise: Promise<void>;

  public constructor() {
    this.hydratePromise = this.hydrate();
  }

  public async ready(): Promise<void> {
    await this.hydratePromise;
  }

  public async markLocalChange(): Promise<void> {
    await this.ready();
    await this.replaceMetadata({
      ...this.metadata(),
      pendingLocalChanges: true,
    });
  }

  public async markRemoteSeen(remoteModifiedTime: string | null): Promise<void> {
    await this.ready();
    await this.replaceMetadata({
      ...this.metadata(),
      lastSeenRemoteModifiedTime: normalizeOptionalString(remoteModifiedTime),
    });
  }

  public async recordDownload(input: {
    account: GoogleAccountProfile | null;
    exportedAt: string | null;
    fileId: string | null;
    folderId: string | null;
    remoteModifiedTime: string | null;
    remoteSummary: SyncScopeSummary | null;
  }): Promise<void> {
    await this.ready();
    await this.replaceMetadata({
      ...this.metadata(),
      connectedAccountEmail: input.account?.email ?? this.metadata().connectedAccountEmail,
      connectedAccountId: input.account?.id ?? this.metadata().connectedAccountId,
      hasRemoteBackup: true,
      knownBackupFileId: normalizeOptionalString(input.fileId),
      knownFolderId: normalizeOptionalString(input.folderId),
      lastCheckedAt: new Date().toISOString(),
      lastDownloadedExportedAt: normalizeOptionalString(input.exportedAt),
      lastSeenRemoteModifiedTime: normalizeOptionalString(input.remoteModifiedTime),
      pendingLocalChanges: false,
      remoteExportedAt: normalizeOptionalString(input.exportedAt),
      remoteModifiedTime: normalizeOptionalString(input.remoteModifiedTime),
      remoteSummary: input.remoteSummary,
    });
  }

  public async recordUpload(input: {
    account: GoogleAccountProfile | null;
    exportedAt: string;
    fileId: string;
    folderId: string;
    remoteModifiedTime: string | null;
    remoteSummary: SyncScopeSummary;
  }): Promise<void> {
    await this.ready();
    await this.replaceMetadata({
      ...this.metadata(),
      connectedAccountEmail: input.account?.email ?? this.metadata().connectedAccountEmail,
      connectedAccountId: input.account?.id ?? this.metadata().connectedAccountId,
      hasRemoteBackup: true,
      knownBackupFileId: normalizeOptionalString(input.fileId),
      knownFolderId: normalizeOptionalString(input.folderId),
      lastCheckedAt: new Date().toISOString(),
      lastSeenRemoteModifiedTime: normalizeOptionalString(input.remoteModifiedTime),
      lastUploadedExportedAt: normalizeOptionalString(input.exportedAt),
      pendingLocalChanges: false,
      remoteExportedAt: normalizeOptionalString(input.exportedAt),
      remoteModifiedTime: normalizeOptionalString(input.remoteModifiedTime),
      remoteSummary: input.remoteSummary,
    });
  }

  public async recordRemoteSnapshot(input: {
    fileId: string | null;
    folderId: string | null;
    hasRemoteBackup: boolean;
    remoteExportedAt: string | null;
    remoteModifiedTime: string | null;
    remoteSummary: SyncScopeSummary | null;
  }): Promise<void> {
    await this.ready();
    await this.replaceMetadata({
      ...this.metadata(),
      hasRemoteBackup: input.hasRemoteBackup,
      knownBackupFileId: normalizeOptionalString(input.fileId),
      knownFolderId: normalizeOptionalString(input.folderId),
      lastCheckedAt: new Date().toISOString(),
      remoteExportedAt: normalizeOptionalString(input.remoteExportedAt),
      remoteModifiedTime: normalizeOptionalString(input.remoteModifiedTime),
      remoteSummary: input.remoteSummary,
    });
  }

  public async setConnectedAccount(account: GoogleAccountProfile | null): Promise<void> {
    await this.ready();
    const currentMetadata = this.metadata();
    const nextAccountId = account?.id ?? null;
    const nextAccountEmail = account?.email ?? null;
    const accountChanged =
      currentMetadata.connectedAccountId !== nextAccountId ||
      currentMetadata.connectedAccountEmail !== nextAccountEmail;

    await this.replaceMetadata({
      ...currentMetadata,
      connectedAccountEmail: nextAccountEmail,
      connectedAccountId: nextAccountId,
      ...(accountChanged
        ? {
            hasRemoteBackup: false,
            knownBackupFileId: null,
            knownFolderId: null,
            lastCheckedAt: null,
            lastDownloadedExportedAt: null,
            lastSeenRemoteModifiedTime: null,
            lastUploadedExportedAt: null,
            remoteExportedAt: null,
            remoteModifiedTime: null,
            remoteSummary: null,
          }
        : {}),
    });
  }

  private async hydrate(): Promise<void> {
    const { value } = await Preferences.get({ key: DRIVE_SYNC_METADATA_KEY });

    if (!value) {
      return;
    }

    try {
      this.metadata.set(normalizeStoredDriveSyncMetadata(JSON.parse(value) as unknown));
    } catch {
      this.metadata.set(normalizeStoredDriveSyncMetadata(null));
    }
  }

  private async replaceMetadata(metadata: StoredDriveSyncMetadata): Promise<void> {
    this.metadata.set(metadata);
    await Preferences.set({
      key: DRIVE_SYNC_METADATA_KEY,
      value: JSON.stringify(metadata),
    });
  }
}

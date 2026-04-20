import { Injectable, computed, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { type GoogleAccountProfile } from './google-account.service';

const DRIVE_SYNC_METADATA_KEY = 'driveSyncMetadata';

export interface StoredDriveSyncMetadata {
  connectedAccountEmail: string | null;
  connectedAccountId: string | null;
  deviceId: string;
  lastDownloadedExportedAt: string | null;
  lastSeenRemoteModifiedTime: string | null;
  lastUploadedExportedAt: string | null;
  pendingLocalChanges: boolean;
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

function normalizeStoredDriveSyncMetadata(value: unknown): StoredDriveSyncMetadata {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    connectedAccountEmail: normalizeOptionalString(record['connectedAccountEmail']),
    connectedAccountId: normalizeOptionalString(record['connectedAccountId']),
    deviceId: normalizeOptionalString(record['deviceId']) ?? createDeviceId(),
    lastDownloadedExportedAt: normalizeOptionalString(record['lastDownloadedExportedAt']),
    lastSeenRemoteModifiedTime: normalizeOptionalString(record['lastSeenRemoteModifiedTime']),
    lastUploadedExportedAt: normalizeOptionalString(record['lastUploadedExportedAt']),
    pendingLocalChanges: record['pendingLocalChanges'] === true,
  };
}

@Injectable({ providedIn: 'root' })
export class DriveSyncStateService {
  public readonly metadata = signal<StoredDriveSyncMetadata>({
    connectedAccountEmail: null,
    connectedAccountId: null,
    deviceId: createDeviceId(),
    lastDownloadedExportedAt: null,
    lastSeenRemoteModifiedTime: null,
    lastUploadedExportedAt: null,
    pendingLocalChanges: false,
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
    remoteModifiedTime: string | null;
  }): Promise<void> {
    await this.ready();
    await this.replaceMetadata({
      ...this.metadata(),
      connectedAccountEmail: input.account?.email ?? this.metadata().connectedAccountEmail,
      connectedAccountId: input.account?.id ?? this.metadata().connectedAccountId,
      lastDownloadedExportedAt: normalizeOptionalString(input.exportedAt),
      lastSeenRemoteModifiedTime: normalizeOptionalString(input.remoteModifiedTime),
      pendingLocalChanges: false,
    });
  }

  public async recordUpload(input: {
    account: GoogleAccountProfile | null;
    exportedAt: string;
    remoteModifiedTime: string | null;
  }): Promise<void> {
    await this.ready();
    await this.replaceMetadata({
      ...this.metadata(),
      connectedAccountEmail: input.account?.email ?? this.metadata().connectedAccountEmail,
      connectedAccountId: input.account?.id ?? this.metadata().connectedAccountId,
      lastSeenRemoteModifiedTime: normalizeOptionalString(input.remoteModifiedTime),
      lastUploadedExportedAt: normalizeOptionalString(input.exportedAt),
      pendingLocalChanges: false,
    });
  }

  public async setConnectedAccount(account: GoogleAccountProfile | null): Promise<void> {
    await this.ready();
    await this.replaceMetadata({
      ...this.metadata(),
      connectedAccountEmail: account?.email ?? null,
      connectedAccountId: account?.id ?? null,
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

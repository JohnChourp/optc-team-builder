import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DriveBackupService } from './drive-backup.service';

const { addListener } = vi.hoisted(() => ({
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener,
  },
}));

describe('DriveBackupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not auto-refresh or auto-upload on initialization when already signed in', async () => {
    const service = new DriveBackupService(
      {
        googleDriveFolderName: 'OPTC Team Builder',
        googleIosClientId: '',
        googleWebClientId: '123456.apps.googleusercontent.com',
      },
      createGoogleAccountStub() as never,
      createDriveSyncStateStub() as never,
      createTransferStub() as never,
    );

    await service.ready();

    expect(fetch).not.toHaveBeenCalled();
    expect(addListener).not.toHaveBeenCalled();
  });

  it('creates the Drive folder and canonical backup file on first manual sync even when local changes are not flagged', async () => {
    const account = createGoogleAccountStub();
    const syncState = createDriveSyncStateStub({
      pendingLocalChanges: false,
    });
    const transfer = createTransferStub();
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ files: [] }))
      .mockResolvedValueOnce(createJsonResponse({ files: [] }))
      .mockResolvedValueOnce(createJsonResponse({ id: 'folder-1' }))
      .mockResolvedValueOnce(createJsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        createJsonResponse({
          appProperties: {
            exportedAt: '2026-04-20T18:00:00.000Z',
          },
          id: 'file-1',
          modifiedTime: '2026-04-20T18:00:05.000Z',
          name: 'optc-all-data.latest.json',
        }),
      );

    const service = new DriveBackupService(
      {
        googleDriveFolderName: 'OPTC Team Builder',
        googleIosClientId: '',
        googleWebClientId: '123456.apps.googleusercontent.com',
      },
      account as never,
      syncState as never,
      transfer as never,
    );
    await service.ready();

    const didSync = await service.flushPendingUploads({ interactiveAuth: true, reason: 'manual-sync' });

    expect(didSync).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(syncState.recordUpload).toHaveBeenCalledWith({
      account: account.profile(),
      exportedAt: '2026-04-20T18:00:00.000Z',
      fileId: 'file-1',
      folderId: 'folder-1',
      remoteModifiedTime: '2026-04-20T18:00:05.000Z',
      remoteSummary: {
        characterBoxesCount: 2,
        characterOverridesCount: 1,
        favoriteCharacterCount: 2,
        favoriteShipCount: 1,
        savedEnemiesCount: 2,
        savedTeamsCount: 2,
      },
    });
  });

  it('refreshes Drive metadata manually and caches the remote summary', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub({ hasSyncScopedData: false });
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          files: [
            {
              id: 'folder-1',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          files: [
            {
              appProperties: {
                exportedAt: '2026-04-20T18:00:00.000Z',
              },
              id: 'file-1',
              modifiedTime: '2026-04-20T18:00:05.000Z',
              name: 'optc-all-data.latest.json',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createTextResponse(
          JSON.stringify({
            exportedAt: '2026-04-20T18:00:00.000Z',
            favorites: {
              characters: [
                { number: 1001, name: 'Luffy' },
                { number: 1002, name: 'Zoro' },
              ],
            },
            favoriteShips: {
              exportedAt: '2026-04-20T18:00:00.000Z',
              schemaVersion: 1,
              ships: [{ id: 9003, name: 'Shark Superb' }],
              source: 'favorite-ships',
            },
            schemaVersion: 1,
            source: 'all-data',
          }),
        ),
      );

    const service = new DriveBackupService(
      {
        googleDriveFolderName: 'OPTC Team Builder',
        googleIosClientId: '',
        googleWebClientId: '123456.apps.googleusercontent.com',
      },
      createGoogleAccountStub() as never,
      syncState as never,
      transfer as never,
    );
    await service.ready();
    await service.refreshRemoteState({ interactiveAuth: true, reason: 'manual-refresh' });

    expect(syncState.recordRemoteSnapshot).toHaveBeenCalledWith({
      fileId: 'file-1',
      folderId: 'folder-1',
      hasRemoteBackup: true,
      remoteExportedAt: '2026-04-20T18:00:00.000Z',
      remoteModifiedTime: '2026-04-20T18:00:05.000Z',
      remoteSummary: {
        characterBoxesCount: 0,
        characterOverridesCount: 0,
        favoriteCharacterCount: 2,
        favoriteShipCount: 1,
        savedEnemiesCount: 0,
        savedTeamsCount: 0,
      },
    });
    expect(service.restorePrompt()).toMatchObject({
      kind: 'restore',
      remote: {
        fileId: 'file-1',
      },
    });
  });

  it('does not auto-refresh when the settings page is entered', async () => {
    const service = new DriveBackupService(
      {
        googleDriveFolderName: 'OPTC Team Builder',
        googleIosClientId: '',
        googleWebClientId: '123456.apps.googleusercontent.com',
      },
      createGoogleAccountStub() as never,
      createDriveSyncStateStub() as never,
      createTransferStub() as never,
    );

    await service.ready();
    await service.handleSettingsEntered();

    expect(fetch).not.toHaveBeenCalled();
  });
});

function createDriveSyncStateStub(overrides: Partial<ReturnType<typeof createStoredMetadata>> = {}) {
  const metadata = signal(createStoredMetadata(overrides));

  return {
    metadata,
    pendingLocalChanges: computed(() => metadata().pendingLocalChanges),
    ready: vi.fn().mockResolvedValue(undefined),
    markLocalChange: vi.fn().mockImplementation(async () => {
      metadata.update((current) => ({
        ...current,
        pendingLocalChanges: true,
      }));
    }),
    markRemoteSeen: vi.fn().mockImplementation(async (remoteModifiedTime: string | null) => {
      metadata.update((current) => ({
        ...current,
        lastSeenRemoteModifiedTime: remoteModifiedTime,
      }));
    }),
    recordDownload: vi.fn().mockResolvedValue(undefined),
    recordRemoteSnapshot: vi.fn().mockImplementation(async (input) => {
      metadata.update((current) => ({
        ...current,
        hasRemoteBackup: input.hasRemoteBackup,
        knownBackupFileId: input.fileId,
        knownFolderId: input.folderId,
        lastCheckedAt: '2026-04-20T18:05:00.000Z',
        remoteExportedAt: input.remoteExportedAt,
        remoteModifiedTime: input.remoteModifiedTime,
        remoteSummary: input.remoteSummary,
      }));
    }),
    recordUpload: vi.fn().mockImplementation(async (input) => {
      metadata.update((current) => ({
        ...current,
        hasRemoteBackup: true,
        knownBackupFileId: input.fileId,
        knownFolderId: input.folderId,
        lastCheckedAt: '2026-04-20T18:05:00.000Z',
        lastSeenRemoteModifiedTime: input.remoteModifiedTime,
        lastUploadedExportedAt: input.exportedAt,
        pendingLocalChanges: false,
        remoteExportedAt: input.exportedAt,
        remoteModifiedTime: input.remoteModifiedTime,
        remoteSummary: input.remoteSummary,
      }));
    }),
    setConnectedAccount: vi.fn().mockResolvedValue(undefined),
  };
}

function createGoogleAccountStub() {
  return {
    ready: vi.fn().mockResolvedValue(undefined),
    ensureAccessToken: vi.fn().mockResolvedValue('google-access-token'),
    isAvailable: signal(true),
    isSignedIn: signal(true),
    lastError: signal<string | null>(null),
    profile: signal({
      email: 'captain@example.com',
      familyName: 'D.',
      givenName: 'Monkey',
      id: 'google-user-1',
      imageUrl: null,
      name: 'Monkey D. Luffy',
    }),
    sessionRevision: signal(0),
  };
}

function createJsonResponse(payload: unknown): Response {
  return {
    json: vi.fn().mockResolvedValue(payload),
    ok: true,
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

function createTextResponse(payload: string): Response {
  return {
    json: vi.fn(),
    ok: true,
    text: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function createStoredMetadata(
  overrides: Partial<{
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
    remoteSummary: {
      characterBoxesCount: number;
      characterOverridesCount: number;
      favoriteCharacterCount: number;
      favoriteShipCount: number;
      savedEnemiesCount: number;
      savedTeamsCount: number;
    } | null;
  }> = {},
) {
  return {
    connectedAccountEmail: overrides.connectedAccountEmail ?? null,
    connectedAccountId: overrides.connectedAccountId ?? null,
    deviceId: overrides.deviceId ?? 'device-1',
    hasRemoteBackup: overrides.hasRemoteBackup ?? false,
    knownBackupFileId: overrides.knownBackupFileId ?? null,
    knownFolderId: overrides.knownFolderId ?? null,
    lastCheckedAt: overrides.lastCheckedAt ?? null,
    lastDownloadedExportedAt: overrides.lastDownloadedExportedAt ?? null,
    lastSeenRemoteModifiedTime: overrides.lastSeenRemoteModifiedTime ?? null,
    lastUploadedExportedAt: overrides.lastUploadedExportedAt ?? null,
    pendingLocalChanges: overrides.pendingLocalChanges ?? false,
    remoteExportedAt: overrides.remoteExportedAt ?? null,
    remoteModifiedTime: overrides.remoteModifiedTime ?? null,
    remoteSummary: overrides.remoteSummary ?? null,
  };
}

function createTransferStub(options: { hasSyncScopedData?: boolean } = {}) {
  return {
    ready: vi.fn().mockResolvedValue(undefined),
    applyAllDataPayload: vi.fn().mockResolvedValue({}),
    buildAllDataPayload: vi.fn().mockResolvedValue({
      exportedAt: '2026-04-20T18:00:00.000Z',
      schemaVersion: 1,
      source: 'all-data',
    }),
    getSyncScopeSummary: vi.fn(() => ({
      characterBoxesCount: 2,
      characterOverridesCount: 1,
      favoriteCharacterCount: 2,
      favoriteShipCount: 1,
      savedEnemiesCount: 2,
      savedTeamsCount: 2,
    })),
    getSyncScopeSummaryFromPayload: vi.fn((payload: { favorites?: { characters?: unknown[] }; favoriteShips?: { ships?: unknown[] } }) => ({
      characterBoxesCount: 0,
      characterOverridesCount: 0,
      favoriteCharacterCount: payload.favorites?.characters?.length ?? 0,
      favoriteShipCount: payload.favoriteShips?.ships?.length ?? 0,
      savedEnemiesCount: 0,
      savedTeamsCount: 0,
    })),
    hasSyncScopedData: vi.fn(() => options.hasSyncScopedData ?? true),
  };
}

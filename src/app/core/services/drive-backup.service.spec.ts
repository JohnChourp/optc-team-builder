import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DriveBackupService } from './drive-backup.service';
import { type AllDataTransferPayload } from '../../pages/settings/all-data-transfer.utils';

const { addListener } = vi.hoisted(() => ({
  addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener,
  },
}));

interface FetchMockQueue {
  mockResolvedValueOnce(value: Response): FetchMockQueue;
}

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

  it('reports when manual sync finds no local data and no Drive backup without creating Drive files', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub({ hasSyncScopedData: false });
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValueOnce(createJsonResponse({ files: [] }));

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

    const didSync = await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });

    expect(didSync).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map((call) => String(call[0])).some((url) => url.includes('/upload/drive/v3/files'))).toBe(false);
    expect(service.manualSyncPrompt()).toBeNull();
    expect(service.syncStatus().detail).toBe('No local data or Drive backup was found.');
    expect(syncState.recordRemoteSnapshot).toHaveBeenCalledWith({
      fileId: null,
      folderId: null,
      hasRemoteBackup: false,
      remoteExportedAt: null,
      remoteModifiedTime: null,
      remoteSummary: null,
    });
  });

  it('asks to upload local data when no Drive backup exists, then creates the backup on confirmation', async () => {
    const account = createGoogleAccountStub();
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub();
    const fetchMock = vi.mocked(fetch);

    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ files: [] }))
      .mockResolvedValueOnce(createJsonResponse({ files: [] }))
      .mockResolvedValueOnce(createJsonResponse({ id: 'folder-1' }))
      .mockResolvedValueOnce(createJsonResponse({ files: [] }))
      .mockResolvedValueOnce(createJsonResponse(createUploadedFilePayload('file-1')));

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
    await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });

    expect(service.manualSyncPrompt()).toMatchObject({
      kind: 'upload-local',
      remote: null,
    });

    await service.resolveManualSyncPrompt('upload-local');

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
    expect(service.manualSyncPrompt()).toBeNull();
  });

  it('asks to use Drive data when local data is empty, then replaces this device on confirmation', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub({ hasSyncScopedData: false });
    const fetchMock = vi.mocked(fetch);

    mockRemoteBackupInspection(fetchMock);
    fetchMock.mockResolvedValueOnce(createTextResponse(JSON.stringify(createRemoteAllDataPayload())));

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
    await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });

    expect(service.manualSyncPrompt()).toMatchObject({
      kind: 'restore-cloud',
      remote: {
        fileId: 'file-1',
      },
    });

    await service.resolveManualSyncPrompt('replace-local');

    expect(transfer.applyAllDataPayload).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'all-data' }),
      'restore',
    );
    expect(syncState.recordDownload).toHaveBeenCalledWith({
      account: expect.any(Object),
      exportedAt: '2026-04-20T18:00:00.000Z',
      fileId: 'file-1',
      folderId: 'folder-1',
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
    expect(service.syncStatus().detail).toBe('This device data replaced with the Drive backup.');
  });

  it('merges Drive data into local data and immediately uploads the merged result', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub();
    const fetchMock = vi.mocked(fetch);

    mockRemoteBackupInspection(fetchMock);
    fetchMock
      .mockResolvedValueOnce(createTextResponse(JSON.stringify(createRemoteAllDataPayload())))
      .mockResolvedValueOnce(createJsonResponse({ files: [createDriveFilePayload('file-1')] }))
      .mockResolvedValueOnce(createJsonResponse(createUploadedFilePayload('file-1')));

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
    await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });

    expect(service.manualSyncPrompt()).toMatchObject({
      kind: 'local-cloud-conflict',
    });

    await service.resolveManualSyncPrompt('merge-and-upload');

    expect(transfer.applyAllDataPayload).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'all-data' }),
      'merge',
    );
    expect(syncState.recordDownload).toHaveBeenCalledOnce();
    expect(syncState.recordUpload).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[5]?.[0])).toContain('/upload/drive/v3/files/file-1?uploadType=multipart');
    expect(service.syncStatus().detail).toBe('Merged data uploaded to Drive.');
  });

  it('replaces the Drive backup with local data when both sides have data', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub();
    const fetchMock = vi.mocked(fetch);

    mockRemoteBackupInspection(fetchMock);
    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ files: [createDriveFilePayload('file-1')] }))
      .mockResolvedValueOnce(createJsonResponse(createUploadedFilePayload('file-1')));

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
    await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });
    await service.resolveManualSyncPrompt('replace-cloud');

    expect(transfer.applyAllDataPayload).not.toHaveBeenCalled();
    expect(syncState.recordUpload).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain('/upload/drive/v3/files/file-1?uploadType=multipart');
    expect(service.syncStatus().detail).toBe('Drive backup replaced with this device data.');
  });

  it('downloads Drive data for review without applying or uploading it', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub();
    const fetchMock = vi.mocked(fetch);

    mockRemoteBackupInspection(fetchMock);
    fetchMock.mockResolvedValueOnce(createTextResponse(JSON.stringify(createRemoteAllDataPayload())));

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
    await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });

    const preview = await service.prepareReviewedManualSync('merge-and-upload');

    expect(preview?.action).toBe('merge-and-upload');
    expect(preview?.drivePayload).toEqual(expect.objectContaining({ source: 'all-data' }));
    expect(preview?.localPayload).toEqual(expect.objectContaining({ source: 'all-data' }));
    expect(transfer.applyAllDataPayload).not.toHaveBeenCalled();
    expect(syncState.recordUpload).not.toHaveBeenCalled();
    expect(service.manualSyncPrompt()).toMatchObject({ kind: 'local-cloud-conflict' });
  });

  it('commits a reviewed device replacement only after confirmation', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub();
    const fetchMock = vi.mocked(fetch);

    mockRemoteBackupInspection(fetchMock);

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
    await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });

    const reviewedPayload = createReviewedAllDataPayload();
    const didCommit = await service.commitReviewedManualSync('replace-local', reviewedPayload);

    expect(didCommit).toBe(true);
    expect(transfer.applyAllDataPayload).toHaveBeenCalledWith(reviewedPayload, 'restore');
    expect(syncState.recordDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-1',
        remoteSummary: expect.objectContaining({
          favoriteCharacterCount: 1,
          favoriteShipCount: 0,
        }),
      }),
    );
    expect(syncState.recordUpload).not.toHaveBeenCalled();
    expect(service.manualSyncPrompt()).toBeNull();
  });

  it('commits a reviewed Drive replacement by uploading the reviewed payload', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub();
    const fetchMock = vi.mocked(fetch);

    mockRemoteBackupInspection(fetchMock);
    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ files: [createDriveFilePayload('file-1')] }))
      .mockResolvedValueOnce(createJsonResponse(createUploadedFilePayload('file-1')));

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
    await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });

    const didCommit = await service.commitReviewedManualSync(
      'replace-cloud',
      createReviewedAllDataPayload(),
    );

    expect(didCommit).toBe(true);
    expect(transfer.applyAllDataPayload).not.toHaveBeenCalled();
    expect(syncState.recordUpload).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain('/upload/drive/v3/files/file-1?uploadType=multipart');
    expect(service.syncStatus().detail).toBe('Drive backup replaced with reviewed data.');
  });

  it('commits a reviewed merge by restoring the draft and uploading it', async () => {
    const syncState = createDriveSyncStateStub();
    const transfer = createTransferStub();
    const fetchMock = vi.mocked(fetch);

    mockRemoteBackupInspection(fetchMock);
    fetchMock
      .mockResolvedValueOnce(createJsonResponse({ files: [createDriveFilePayload('file-1')] }))
      .mockResolvedValueOnce(createJsonResponse(createUploadedFilePayload('file-1')));

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
    await service.startManualSync({ interactiveAuth: true, reason: 'manual-sync' });

    const reviewedPayload = createReviewedAllDataPayload();
    const didCommit = await service.commitReviewedManualSync('merge-and-upload', reviewedPayload);

    expect(didCommit).toBe(true);
    expect(transfer.applyAllDataPayload).toHaveBeenCalledWith(reviewedPayload, 'restore');
    expect(syncState.recordDownload).toHaveBeenCalledOnce();
    expect(syncState.recordUpload).toHaveBeenCalledOnce();
    expect(service.syncStatus().detail).toBe('Reviewed merge uploaded to Drive.');
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

function createDriveFilePayload(fileId: string) {
  return {
    appProperties: {
      exportedAt: '2026-04-20T18:00:00.000Z',
    },
    id: fileId,
    modifiedTime: '2026-04-20T18:00:05.000Z',
    name: 'optc-all-data.latest.json',
  };
}

function createRemoteAllDataPayload() {
  return {
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
  };
}

function createReviewedAllDataPayload(): AllDataTransferPayload {
  return {
    exportedAt: '2026-04-20T20:00:00.000Z',
    favorites: {
      characters: [{ number: 1004, name: 'Sanji' }],
    },
    schemaVersion: 1,
    source: 'all-data',
  };
}

function createUploadedFilePayload(fileId: string) {
  return {
    appProperties: {
      exportedAt: '2026-04-20T18:00:00.000Z',
    },
    id: fileId,
    modifiedTime: '2026-04-20T18:00:05.000Z',
    name: 'optc-all-data.latest.json',
  };
}

function mockRemoteBackupInspection(fetchMock: FetchMockQueue): void {
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
        files: [createDriveFilePayload('file-1')],
      }),
    )
    .mockResolvedValueOnce(createTextResponse(JSON.stringify(createRemoteAllDataPayload())));
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

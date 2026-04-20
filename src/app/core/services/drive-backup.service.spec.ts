import '@angular/compiler';
import { signal } from '@angular/core';
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

  it('creates the Drive folder and canonical backup file on first upload', async () => {
    const account = createGoogleAccountStub();
    const syncState = createDriveSyncStateStub({
      pendingLocalChanges: true,
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

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/drive/v3/files');
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(syncState.recordUpload).toHaveBeenCalledWith({
      account: account.profile(),
      exportedAt: '2026-04-20T18:00:00.000Z',
      remoteModifiedTime: '2026-04-20T18:00:05.000Z',
    });
  });

  it('prompts for restore when a newer remote backup exists and local sync data is empty', async () => {
    const account = createGoogleAccountStub();
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
    await service.refreshRemoteState({ reason: 'test-refresh' });

    expect(service.restorePrompt()).toMatchObject({
      kind: 'restore',
      remote: {
        fileId: 'file-1',
      },
    });
  });
});

function createDriveSyncStateStub(overrides: Partial<ReturnType<typeof createStoredMetadata>> = {}) {
  const metadata = signal(createStoredMetadata(overrides));

  return {
    metadata,
    pendingLocalChanges: signal(Boolean(overrides.pendingLocalChanges)),
    ready: vi.fn().mockResolvedValue(undefined),
    markLocalChange: vi.fn().mockImplementation(async () => {
      metadata.update((current) => ({
        ...current,
        pendingLocalChanges: true,
      }));
    }),
    markRemoteSeen: vi.fn().mockResolvedValue(undefined),
    recordDownload: vi.fn().mockResolvedValue(undefined),
    recordUpload: vi.fn().mockImplementation(async (input: { remoteModifiedTime: string | null; exportedAt: string }) => {
      metadata.update((current) => ({
        ...current,
        lastSeenRemoteModifiedTime: input.remoteModifiedTime,
        lastUploadedExportedAt: input.exportedAt,
        pendingLocalChanges: false,
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

function createStoredMetadata(overrides: Partial<{
  connectedAccountEmail: string | null;
  connectedAccountId: string | null;
  deviceId: string;
  lastDownloadedExportedAt: string | null;
  lastSeenRemoteModifiedTime: string | null;
  lastUploadedExportedAt: string | null;
  pendingLocalChanges: boolean;
}> = {}) {
  return {
    connectedAccountEmail: overrides.connectedAccountEmail ?? null,
    connectedAccountId: overrides.connectedAccountId ?? null,
    deviceId: overrides.deviceId ?? 'device-1',
    lastDownloadedExportedAt: overrides.lastDownloadedExportedAt ?? null,
    lastSeenRemoteModifiedTime: overrides.lastSeenRemoteModifiedTime ?? null,
    lastUploadedExportedAt: overrides.lastUploadedExportedAt ?? null,
    pendingLocalChanges: overrides.pendingLocalChanges ?? false,
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
    hasSyncScopedData: vi.fn(() => options.hasSyncScopedData ?? true),
  };
}

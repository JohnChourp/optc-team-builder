import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDriveSyncServer } from './drive-sync-server.mjs';

const tempDirs = [];

describe('drive sync backend', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
  });

  it('starts Google OAuth with offline access and an HttpOnly state cookie', async () => {
    const { baseUrl, server } = await startTestServer();

    try {
      const response = await fetch(
        `${baseUrl}/auth/google/start?return_to=${encodeURIComponent('http://localhost:4200/tabs/account')}`,
        { redirect: 'manual' },
      );
      const location = new URL(response.headers.get('location'));

      expect(response.status).toBe(302);
      expect(location.origin).toBe('https://accounts.google.com');
      expect(location.searchParams.get('access_type')).toBe('offline');
      expect(location.searchParams.get('include_granted_scopes')).toBe('true');
      expect(location.searchParams.get('scope')).toContain(
        'https://www.googleapis.com/auth/drive.file',
      );
      expect(response.headers.get('set-cookie')).toContain('optc_drive_oauth_state=');
      expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    } finally {
      server.close();
    }
  });

  it('stores only an encrypted refresh token and exposes session status without tokens', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'callback-access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token-secret',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          email: 'captain@example.com',
          id: 'google-user-1',
          name: 'Monkey D. Luffy',
          picture: 'https://example.com/luffy.png',
        }),
      );
    const { baseUrl, server, store } = await startTestServer({ fetchImpl });

    try {
      const startResponse = await fetch(`${baseUrl}/auth/google/start`, { redirect: 'manual' });
      const state = new URL(startResponse.headers.get('location')).searchParams.get('state');
      const stateCookie = getCookieHeader(startResponse, 'optc_drive_oauth_state');
      const callbackResponse = await fetch(
        `${baseUrl}/auth/google/callback?code=auth-code&state=${state}`,
        {
          headers: { cookie: stateCookie },
          redirect: 'manual',
        },
      );
      const sessionCookie = getCookieHeader(callbackResponse, 'optc_drive_session');
      const statusResponse = await fetch(`${baseUrl}/auth/google/status`, {
        headers: { cookie: sessionCookie },
      });
      const statusPayload = await statusResponse.json();
      const db = await store.read();
      const rawDb = JSON.stringify(db);

      expect(callbackResponse.status).toBe(302);
      expect(statusPayload).toMatchObject({
        authenticated: true,
        profile: {
          email: 'captain@example.com',
          id: 'google-user-1',
        },
        status: 'signed-in',
      });
      expect(rawDb).not.toContain('refresh-token-secret');
      expect(rawDb).not.toContain('callback-access-token');
      expect(statusPayload).not.toHaveProperty('access_token');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      server.close();
    }
  });

  it('uploads a pending all-data payload with a refreshed access token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'callback-access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token-secret',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          email: 'captain@example.com',
          id: 'google-user-1',
          name: 'Monkey D. Luffy',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'refreshed-access-token',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'folder-1' }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          appProperties: {
            exportedAt: '2026-05-11T10:00:00.000Z',
          },
          id: 'file-1',
          modifiedTime: '2026-05-11T10:00:05.000Z',
          name: 'optc-all-data.latest.json',
        }),
      );
    const { baseUrl, server, store } = await startTestServer({ fetchImpl });

    try {
      const sessionCookie = await connectGoogleSession(baseUrl);
      const syncResponse = await fetch(`${baseUrl}/drive/sync/run`, {
        body: JSON.stringify({
          deviceId: 'device-1',
          payload: {
            exportedAt: '2026-05-11T10:00:00.000Z',
            favorites: {
              characters: [{ name: 'Luffy', number: 1001 }],
            },
            schemaVersion: 1,
            source: 'all-data',
          },
        }),
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookie,
        },
        method: 'POST',
      });
      const syncPayload = await syncResponse.json();
      const db = await store.read();
      const user = db.users['google-user-1'];

      expect(syncResponse.status).toBe(200);
      expect(syncPayload).toMatchObject({
        remoteBackup: {
          fileId: 'file-1',
          folderId: 'folder-1',
        },
        status: 'uploaded',
      });
      expect(user.encryptedPendingUpload).toBeNull();
      expect(user.knownBackupFileId).toBe('file-1');
      expect(user.remoteSummary.favoriteCharacterCount).toBe(1);
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    } finally {
      server.close();
    }

    async function connectGoogleSession(baseUrl) {
      const startResponse = await fetch(`${baseUrl}/auth/google/start`, { redirect: 'manual' });
      const state = new URL(startResponse.headers.get('location')).searchParams.get('state');
      const stateCookie = getCookieHeader(startResponse, 'optc_drive_oauth_state');
      const callbackResponse = await fetch(
        `${baseUrl}/auth/google/callback?code=auth-code&state=${state}`,
        {
          headers: { cookie: stateCookie },
          redirect: 'manual',
        },
      );

      return getCookieHeader(callbackResponse, 'optc_drive_session');
    }
  });

  it('rejects sync requests without an authenticated backend session', async () => {
    const { baseUrl, server } = await startTestServer();

    try {
      const syncResponse = await fetch(`${baseUrl}/drive/sync/run`, {
        body: JSON.stringify({
          deviceId: 'device-1',
          payload: {
            exportedAt: '2026-05-11T10:00:00.000Z',
            schemaVersion: 1,
            source: 'all-data',
          },
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const syncPayload = await syncResponse.json();

      expect(syncResponse.status).toBe(401);
      expect(syncPayload).toMatchObject({
        error: 'needs_reconnect',
      });
    } finally {
      server.close();
    }
  });

  it('treats invalid sync payloads as remote checks without enqueueing an upload', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'callback-access-token',
          expires_in: 3600,
          refresh_token: 'refresh-token-secret',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          email: 'captain@example.com',
          id: 'google-user-1',
          name: 'Monkey D. Luffy',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'refreshed-access-token',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ files: [] }));
    const { baseUrl, server, store } = await startTestServer({ fetchImpl });

    try {
      const sessionCookie = await connectGoogleSession(baseUrl);
      const syncResponse = await fetch(`${baseUrl}/drive/sync/run`, {
        body: JSON.stringify({
          deviceId: 'device-1',
          payload: {
            exportedAt: '2026-05-11T10:00:00.000Z',
            schemaVersion: 1,
            source: 'not-all-data',
          },
        }),
        headers: {
          'Content-Type': 'application/json',
          cookie: sessionCookie,
        },
        method: 'POST',
      });
      const syncPayload = await syncResponse.json();
      const db = await store.read();
      const user = db.users['google-user-1'];

      expect(syncResponse.status).toBe(200);
      expect(syncPayload).toMatchObject({
        remoteSnapshot: {
          backup: null,
          folderId: null,
          summary: null,
        },
        status: 'checked',
      });
      expect(user.encryptedPendingUpload).toBeNull();
      expect(user.syncStatus).toBe('idle');
    } finally {
      server.close();
    }
  });
});

async function connectGoogleSession(baseUrl) {
  const startResponse = await fetch(`${baseUrl}/auth/google/start`, { redirect: 'manual' });
  const state = new URL(startResponse.headers.get('location')).searchParams.get('state');
  const stateCookie = getCookieHeader(startResponse, 'optc_drive_oauth_state');
  const callbackResponse = await fetch(
    `${baseUrl}/auth/google/callback?code=auth-code&state=${state}`,
    {
      headers: { cookie: stateCookie },
      redirect: 'manual',
    },
  );

  return getCookieHeader(callbackResponse, 'optc_drive_session');
}

async function startTestServer(options = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'optc-drive-sync-'));

  tempDirs.push(tempDir);

  const driveSyncServer = createDriveSyncServer({
    config: {
      appOrigin: 'http://localhost:4200',
      cookieSecure: false,
      dataFile: join(tempDir, 'drive-sync-db.json'),
      folderName: 'OPTC Team Builder',
      googleClientId: '123456.apps.googleusercontent.com',
      googleClientSecret: 'client-secret',
      googleRedirectUri: 'http://127.0.0.1:8787/auth/google/callback',
      maxJsonBytes: 1024 * 1024,
      publicBaseUrl: 'http://127.0.0.1:8787',
      sessionCookieName: 'optc_drive_session',
      sessionSecret: 'session-secret',
      sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
      stateCookieName: 'optc_drive_oauth_state',
      tokenEncryptionKey: Buffer.alloc(32, 7),
      workerIntervalMs: 0,
    },
    fetchImpl: options.fetchImpl ?? vi.fn(),
  });
  const nodeServer = await driveSyncServer.listen(0, '127.0.0.1');
  const address = nodeServer.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server: nodeServer,
    store: driveSyncServer.store,
  };
}

function getCookieHeader(response, name) {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const cookie = setCookie
    .split(/,(?= [^;,]+=)/u)
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Missing cookie ${name}`);
  }

  return cookie.split(';')[0];
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });
}

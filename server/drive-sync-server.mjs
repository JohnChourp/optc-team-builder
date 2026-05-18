import {
  createHmac,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_APP_ORIGIN = 'http://localhost:4200';
const DEFAULT_PORT = 8787;
const DEFAULT_SESSION_DAYS = 30;
const DEFAULT_WORKER_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MAX_JSON_BYTES = 20 * 1024 * 1024;
const DEFAULT_RATE_LIMIT_GLOBAL_PER_MINUTE = 120;
const DEFAULT_RATE_LIMIT_WRITE_PER_MINUTE = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const BACKUP_FILE_NAME = 'optc-all-data.latest.json';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.file'];

export class DriveSyncAuthError extends Error {
  constructor(message = 'Google Drive reconnect required.') {
    super(message);
    this.name = 'DriveSyncAuthError';
  }
}

export class JsonDriveSyncStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async read() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return normalizeDatabase(JSON.parse(raw));
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return createEmptyDatabase();
      }

      throw error;
    }
  }

  async update(mutator) {
    const run = this.writeQueue.then(async () => {
      const db = await this.read();
      const result = await mutator(db);
      await this.write(db);
      return result;
    });

    this.writeQueue = run.catch(() => undefined);

    return run;
  }

  async write(db) {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(normalizeDatabase(db), null, 2)}\n`, 'utf8');
    await rename(tmpPath, this.filePath);
  }
}

export function resolveDriveSyncConfig(env = process.env) {
  const appOrigin = normalizeOrigin(
    env.APP_ORIGIN || env.DRIVE_SYNC_APP_ORIGIN || DEFAULT_APP_ORIGIN,
  );
  const publicBaseUrl = normalizeOrigin(
    env.DRIVE_SYNC_PUBLIC_BASE_URL || `http://localhost:${parseInteger(env.PORT, DEFAULT_PORT)}`,
  );
  const redirectUri =
    normalizeUrl(env.GOOGLE_OAUTH_REDIRECT_URI) || `${publicBaseUrl}/auth/google/callback`;
  const cookieSecure = parseCookieSecure(env.DRIVE_SYNC_COOKIE_SECURE, redirectUri);
  const dataDir = resolve(process.cwd(), env.DRIVE_SYNC_DATA_DIR || '.data/drive-sync');

  return {
    appOrigin,
    cookieSecure,
    dataFile: resolve(dataDir, 'drive-sync-db.json'),
    folderName: normalizeDriveFolderName(env.APP_GOOGLE_DRIVE_FOLDER_NAME),
    googleClientId: normalizeRequiredString(
      env.GOOGLE_OAUTH_CLIENT_ID || env.APP_GOOGLE_WEB_CLIENT_ID,
      'GOOGLE_OAUTH_CLIENT_ID',
    ),
    googleClientSecret: normalizeRequiredString(
      env.GOOGLE_OAUTH_CLIENT_SECRET,
      'GOOGLE_OAUTH_CLIENT_SECRET',
    ),
    googleRedirectUri: redirectUri,
    maxJsonBytes: parseInteger(env.DRIVE_SYNC_MAX_JSON_BYTES, DEFAULT_MAX_JSON_BYTES),
    port: parseInteger(env.PORT, DEFAULT_PORT),
    rateLimitGlobalPerMinute: parseNonNegativeInteger(
      env.DRIVE_SYNC_RATE_LIMIT_PER_MINUTE,
      DEFAULT_RATE_LIMIT_GLOBAL_PER_MINUTE,
    ),
    rateLimitWritePerMinute: parseNonNegativeInteger(
      env.DRIVE_SYNC_RATE_LIMIT_WRITE_PER_MINUTE,
      DEFAULT_RATE_LIMIT_WRITE_PER_MINUTE,
    ),
    publicBaseUrl,
    sessionCookieName: env.DRIVE_SYNC_SESSION_COOKIE || 'optc_drive_session',
    sessionSecret: normalizeRequiredString(
      env.DRIVE_SYNC_SESSION_SECRET,
      'DRIVE_SYNC_SESSION_SECRET',
    ),
    sessionTtlMs:
      parseInteger(env.DRIVE_SYNC_SESSION_DAYS, DEFAULT_SESSION_DAYS) * 24 * 60 * 60 * 1000,
    stateCookieName: env.DRIVE_SYNC_STATE_COOKIE || 'optc_drive_oauth_state',
    tokenEncryptionKey: deriveEncryptionKey(
      normalizeRequiredString(
        env.DRIVE_SYNC_TOKEN_ENCRYPTION_KEY,
        'DRIVE_SYNC_TOKEN_ENCRYPTION_KEY',
      ),
    ),
    workerIntervalMs: parseInteger(env.DRIVE_SYNC_WORKER_INTERVAL_MS, DEFAULT_WORKER_INTERVAL_MS),
  };
}

export function createDriveSyncServer(options = {}) {
  const config = {
    ...(options.config ? {} : resolveDriveSyncConfig(options.env ?? process.env)),
    ...(options.config ?? {}),
  };
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const store = options.store ?? new JsonDriveSyncStore(config.dataFile);
  const app = createDriveSyncApp({ config, fetchImpl, store });
  const server = createServer((request, response) => {
    void app.handle(request, response);
  });

  return {
    ...app,
    listen: (port = config.port, hostname) =>
      new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(port, hostname, () => {
          server.off('error', rejectListen);
          resolveListen(server);
        });
      }),
    server,
  };
}

export function createDriveSyncApp({ config, fetchImpl, store, now = () => Date.now() }) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for Google OAuth and Drive calls.');
  }

  const signer = createCookieSigner(config.sessionSecret);
  const cipher = createJsonCipher(config.tokenEncryptionKey);
  const rateLimiter = createRateLimiter({
    globalPerMinute: config.rateLimitGlobalPerMinute,
    writePerMinute: config.rateLimitWritePerMinute,
    now,
  });

  async function handle(request, response) {
    applyCorsHeaders(response, config);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const clientKey = resolveClientKey(request);
    const isWrite = request.method !== 'GET' && request.method !== 'HEAD';
    const rateDecision = rateLimiter.consume(clientKey, isWrite);

    if (!rateDecision.allowed) {
      response.setHeader('Retry-After', String(rateDecision.retryAfterSeconds));
      sendJson(response, 429, {
        error: 'rate_limited',
        message: 'Too many requests. Slow down and try again shortly.',
        retryAfterSeconds: rateDecision.retryAfterSeconds,
      });
      return;
    }

    const requestUrl = new URL(request.url ?? '/', config.publicBaseUrl);

    try {
      if (request.method === 'GET' && requestUrl.pathname === '/auth/google/start') {
        await handleGoogleStart(request, response, requestUrl);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/auth/google/callback') {
        await handleGoogleCallback(request, response, requestUrl);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/auth/google/status') {
        await handleGoogleStatus(request, response);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/auth/google/sign-out') {
        await handleGoogleSignOut(request, response);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/drive/sync/remote') {
        await handleDriveRemote(request, response, requestUrl);
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname.startsWith('/drive/sync/backup/')) {
        await handleDriveBackupDownload(request, response, requestUrl);
        return;
      }

      if (request.method === 'POST' && requestUrl.pathname === '/drive/sync/run') {
        await handleDriveSyncRun(request, response);
        return;
      }

      sendJson(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof DriveSyncAuthError) {
        sendJson(response, 401, {
          error: 'needs_reconnect',
          message: error.message,
        });
        return;
      }

      sendJson(response, 500, {
        error: 'drive_sync_failed',
        message: resolveErrorMessage(error),
      });
    }
  }

  function startWorker() {
    if (config.workerIntervalMs <= 0) {
      return () => undefined;
    }

    let running = false;
    const tick = async () => {
      if (running) {
        return;
      }

      running = true;

      try {
        await runPendingUploads({ cipher, config, fetchImpl, store });
      } finally {
        running = false;
      }
    };
    const interval = setInterval(() => {
      void tick();
    }, config.workerIntervalMs);

    void tick();

    return () => clearInterval(interval);
  }

  async function handleGoogleStart(_request, response, requestUrl) {
    const forceConsent = requestUrl.searchParams.get('force') === '1';
    const returnTo = sanitizeReturnTo(requestUrl.searchParams.get('return_to'), config.appOrigin);
    const state = {
      nonce: randomToken(),
      returnTo,
    };
    const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);

    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('client_id', config.googleClientId);
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('redirect_uri', config.googleRedirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    authUrl.searchParams.set('state', state.nonce);

    if (forceConsent) {
      authUrl.searchParams.set('prompt', 'consent select_account');
    }

    setCookie(response, config.stateCookieName, signer.signJson(state), {
      httpOnly: true,
      maxAge: 10 * 60,
      sameSite: 'Lax',
      secure: config.cookieSecure,
    });
    redirect(response, authUrl.toString());
  }

  async function handleGoogleCallback(request, response, requestUrl) {
    const stateCookie = readSignedJsonCookie(request, config.stateCookieName, signer);
    const state = normalizeStateCookie(stateCookie);
    const incomingState = requestUrl.searchParams.get('state');
    const code = requestUrl.searchParams.get('code');

    clearCookie(response, config.stateCookieName, { secure: config.cookieSecure });

    if (!state || state.nonce !== incomingState || !code) {
      redirect(
        response,
        appendErrorToReturnTo(state?.returnTo, config.appOrigin, 'invalid_oauth_state'),
      );
      return;
    }

    try {
      const tokens = await exchangeCodeForTokens(code, { config, fetchImpl });
      const accessToken = normalizeOptionalString(tokens.access_token);

      if (!accessToken) {
        throw new Error('Google did not return an access token.');
      }

      const profile = await fetchGoogleProfile(accessToken, fetchImpl);
      const expiresAt = new Date(
        Date.now() + normalizeExpiresIn(tokens.expires_in) * 1000,
      ).toISOString();
      const sessionId = randomToken(32);

      await store.update((db) => {
        const existingUser = db.users[profile.id] ?? null;
        const refreshToken =
          normalizeOptionalString(tokens.refresh_token) ??
          (existingUser?.encryptedRefreshToken
            ? cipher.decryptString(existingUser.encryptedRefreshToken)
            : null);

        if (!refreshToken) {
          throw new Error(
            'Google did not return an offline refresh token. Reconnect with consent.',
          );
        }

        db.users[profile.id] = {
          ...existingUser,
          email: profile.email,
          encryptedRefreshToken: cipher.encryptString(refreshToken),
          googleAccountId: profile.id,
          imageUrl: profile.imageUrl,
          latestAccessTokenExpiresAt: expiresAt,
          lastSyncError: null,
          name: profile.name,
          needsReconnect: false,
          tokenUpdatedAt: new Date().toISOString(),
        };
        db.sessions[sessionId] = {
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + config.sessionTtlMs).toISOString(),
          userId: profile.id,
        };
      });

      setCookie(response, config.sessionCookieName, signer.signString(sessionId), {
        httpOnly: true,
        maxAge: Math.floor(config.sessionTtlMs / 1000),
        sameSite: 'Lax',
        secure: config.cookieSecure,
      });
      redirect(response, state.returnTo);
    } catch (error) {
      redirect(
        response,
        appendErrorToReturnTo(state.returnTo, config.appOrigin, resolveErrorMessage(error)),
      );
    }
  }

  async function handleGoogleStatus(request, response) {
    const session = await readSession(request);

    if (!session) {
      sendJson(response, 200, {
        authenticated: false,
        status: 'signed-out',
      });
      return;
    }

    sendJson(response, 200, {
      authenticated: true,
      profile: mapUserToProfile(session.user),
      status: session.user.needsReconnect ? 'reconnect-required' : 'signed-in',
      sync: mapUserToSyncStatus(session.user),
    });
  }

  async function handleGoogleSignOut(request, response) {
    const signedSessionId = readCookie(request, config.sessionCookieName);
    const sessionId = signedSessionId ? signer.unsignString(signedSessionId) : null;

    if (sessionId) {
      await store.update((db) => {
        delete db.sessions[sessionId];
      });
    }

    clearCookie(response, config.sessionCookieName, { secure: config.cookieSecure });
    sendJson(response, 200, { ok: true });
  }

  async function handleDriveRemote(request, response, requestUrl) {
    const session = await requireSession(request);
    const includePayloadSummary = requestUrl.searchParams.get('includePayloadSummary') === 'true';
    const accessToken = await getAccessTokenForUser(session.user.googleAccountId, {
      cipher,
      config,
      fetchImpl,
      store,
    });
    const remoteSnapshot = await inspectRemoteSnapshot(accessToken, includePayloadSummary, {
      config,
      fetchImpl,
    });

    await recordRemoteSnapshot(session.user.googleAccountId, remoteSnapshot);

    sendJson(response, 200, { remoteSnapshot });
  }

  async function handleDriveBackupDownload(request, response, requestUrl) {
    const session = await requireSession(request);
    const fileId = decodeURIComponent(requestUrl.pathname.slice('/drive/sync/backup/'.length));
    const accessToken = await getAccessTokenForUser(session.user.googleAccountId, {
      cipher,
      config,
      fetchImpl,
      store,
    });
    const payload = await downloadRemoteBackup(accessToken, fileId, fetchImpl);

    sendJson(response, 200, { payload });
  }

  async function handleDriveSyncRun(request, response) {
    const session = await requireSession(request);
    const body = await readJsonBody(request, config.maxJsonBytes);
    const payload = normalizeAllDataPayload(body?.payload);
    const existingFolderId = normalizeOptionalString(body?.existingFolderId);
    const deviceId = normalizeOptionalString(body?.deviceId);

    if (!payload) {
      const accessToken = await getAccessTokenForUser(session.user.googleAccountId, {
        cipher,
        config,
        fetchImpl,
        store,
      });
      const remoteSnapshot = await inspectRemoteSnapshot(accessToken, true, { config, fetchImpl });

      await recordRemoteSnapshot(session.user.googleAccountId, remoteSnapshot);
      sendJson(response, 200, {
        remoteSnapshot,
        status: 'checked',
      });
      return;
    }

    await store.update((db) => {
      const user = db.users[session.user.googleAccountId];

      if (!user) {
        throw new DriveSyncAuthError();
      }

      user.encryptedPendingUpload = cipher.encryptJson({
        deviceId,
        existingFolderId,
        payload,
      });
      user.lastSyncError = null;
      user.syncStatus = 'pending-upload';
    });

    const remoteBackup = await uploadPendingPayloadForUser(session.user.googleAccountId, {
      cipher,
      config,
      fetchImpl,
      store,
    });

    sendJson(response, 200, {
      remoteBackup,
      status: 'uploaded',
    });
  }

  async function readSession(request) {
    const signedSessionId = readCookie(request, config.sessionCookieName);
    const sessionId = signedSessionId ? signer.unsignString(signedSessionId) : null;

    if (!sessionId) {
      return null;
    }

    const db = await store.read();
    const session = db.sessions[sessionId];

    if (!session || Date.parse(session.expiresAt) <= Date.now()) {
      await store.update((nextDb) => {
        delete nextDb.sessions[sessionId];
      });
      return null;
    }

    const user = db.users[session.userId];

    if (!user) {
      return null;
    }

    return {
      sessionId,
      user,
    };
  }

  async function requireSession(request) {
    const session = await readSession(request);

    if (!session) {
      throw new DriveSyncAuthError('Google account sign-in required.');
    }

    if (session.user.needsReconnect) {
      throw new DriveSyncAuthError(
        session.user.lastSyncError ?? 'Google Drive reconnect required.',
      );
    }

    return session;
  }

  async function recordRemoteSnapshot(userId, remoteSnapshot) {
    await store.update((db) => {
      const user = db.users[userId];

      if (!user) {
        return;
      }

      user.hasRemoteBackup = remoteSnapshot.backup !== null;
      user.knownBackupFileId = remoteSnapshot.backup?.fileId ?? null;
      user.knownFolderId = remoteSnapshot.backup?.folderId ?? remoteSnapshot.folderId;
      user.lastSyncAt = new Date().toISOString();
      user.remoteExportedAt = remoteSnapshot.backup?.exportedAt ?? null;
      user.remoteModifiedTime = remoteSnapshot.backup?.modifiedTime ?? null;
      user.remoteSummary = remoteSnapshot.summary;
      user.syncStatus = 'idle';
    });
  }

  return {
    config,
    handle,
    startWorker,
    store,
  };
}

export async function runPendingUploads({ cipher, config, fetchImpl, store }) {
  const db = await store.read();
  const pendingUserIds = Object.values(db.users)
    .filter((user) => user.encryptedPendingUpload && !user.needsReconnect)
    .map((user) => user.googleAccountId);

  for (const userId of pendingUserIds) {
    try {
      await uploadPendingPayloadForUser(userId, { cipher, config, fetchImpl, store });
    } catch {
      // The per-user error is stored by uploadPendingPayloadForUser.
    }
  }
}

async function uploadPendingPayloadForUser(userId, { cipher, config, fetchImpl, store }) {
  const db = await store.read();
  const user = db.users[userId];

  if (!user?.encryptedPendingUpload) {
    return null;
  }

  let pendingUpload;

  try {
    pendingUpload = cipher.decryptJson(user.encryptedPendingUpload);
  } catch (error) {
    await store.update((nextDb) => {
      const nextUser = nextDb.users[userId];

      if (!nextUser) {
        return;
      }

      nextUser.lastSyncError = `Unable to read pending upload: ${resolveErrorMessage(error)}`;
      nextUser.syncStatus = 'error';
    });
    throw error;
  }

  try {
    const accessToken = await getAccessTokenForUser(userId, { cipher, config, fetchImpl, store });
    const remoteBackup = await upsertRemoteBackup(accessToken, {
      accountId: user.googleAccountId,
      deviceId: pendingUpload.deviceId,
      existingFolderId: pendingUpload.existingFolderId,
      fetchImpl,
      folderName: config.folderName,
      payload: pendingUpload.payload,
    });

    await store.update((nextDb) => {
      const nextUser = nextDb.users[userId];

      if (!nextUser) {
        return;
      }

      nextUser.encryptedPendingUpload = null;
      nextUser.hasRemoteBackup = true;
      nextUser.knownBackupFileId = remoteBackup.fileId;
      nextUser.knownFolderId = remoteBackup.folderId;
      nextUser.lastSyncAt = new Date().toISOString();
      nextUser.lastSyncError = null;
      nextUser.lastUploadedExportedAt = pendingUpload.payload.exportedAt;
      nextUser.remoteExportedAt = remoteBackup.exportedAt;
      nextUser.remoteModifiedTime = remoteBackup.modifiedTime;
      nextUser.remoteSummary = getSyncScopeSummaryFromPayload(pendingUpload.payload);
      nextUser.syncStatus = 'idle';
    });

    return remoteBackup;
  } catch (error) {
    await store.update((nextDb) => {
      const nextUser = nextDb.users[userId];

      if (!nextUser) {
        return;
      }

      nextUser.lastSyncError = resolveErrorMessage(error);
      nextUser.needsReconnect =
        error instanceof DriveSyncAuthError ? true : nextUser.needsReconnect;
      nextUser.syncStatus = error instanceof DriveSyncAuthError ? 'needs-auth' : 'error';
    });
    throw error;
  }
}

async function getAccessTokenForUser(userId, { cipher, config, fetchImpl, store }) {
  const db = await store.read();
  const user = db.users[userId];

  if (!user?.encryptedRefreshToken) {
    throw new DriveSyncAuthError();
  }

  let refreshToken;

  try {
    refreshToken = cipher.decryptString(user.encryptedRefreshToken);
  } catch (error) {
    throw new DriveSyncAuthError(
      `Stored Google token could not be read: ${resolveErrorMessage(error)}`,
    );
  }

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
  const payload = await readGoogleJsonResponse(response);

  if (!response.ok) {
    const message = resolveGoogleErrorMessage(payload, 'Google refresh token failed.');

    await store.update((nextDb) => {
      const nextUser = nextDb.users[userId];

      if (!nextUser) {
        return;
      }

      nextUser.lastSyncError = message;
      nextUser.needsReconnect = true;
      nextUser.syncStatus = 'needs-auth';
    });
    throw new DriveSyncAuthError(message);
  }

  const accessToken = normalizeOptionalString(payload.access_token);

  if (!accessToken) {
    throw new DriveSyncAuthError('Google did not return a refreshed access token.');
  }

  await store.update((nextDb) => {
    const nextUser = nextDb.users[userId];

    if (!nextUser) {
      return;
    }

    nextUser.latestAccessTokenExpiresAt = new Date(
      Date.now() + normalizeExpiresIn(payload.expires_in) * 1000,
    ).toISOString();
    nextUser.lastSyncError = null;
    nextUser.needsReconnect = false;
  });

  return accessToken;
}

async function exchangeCodeForTokens(code, { config, fetchImpl }) {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.googleRedirectUri,
  });
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
  const payload = await readGoogleJsonResponse(response);

  if (!response.ok) {
    throw new Error(resolveGoogleErrorMessage(payload, 'Google authorization failed.'));
  }

  return payload;
}

async function fetchGoogleProfile(accessToken, fetchImpl) {
  const response = await fetchImpl(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await readGoogleJsonResponse(response);

  if (!response.ok) {
    throw new Error(resolveGoogleErrorMessage(payload, 'Google profile lookup failed.'));
  }

  const id = normalizeOptionalString(payload.id);

  if (!id) {
    throw new Error('Google profile did not include an account id.');
  }

  return {
    email: normalizeOptionalString(payload.email),
    id,
    imageUrl: normalizeOptionalString(payload.picture),
    name: normalizeOptionalString(payload.name),
  };
}

async function inspectRemoteSnapshot(accessToken, includePayloadSummary, { config, fetchImpl }) {
  const folderId = await ensureDriveFolderId(accessToken, false, config.folderName, fetchImpl);

  if (!folderId) {
    return {
      backup: null,
      folderId: null,
      summary: null,
    };
  }

  const backup = await findBackupFile(accessToken, folderId, fetchImpl);

  if (!backup || !includePayloadSummary) {
    return {
      backup,
      folderId,
      summary: null,
    };
  }

  const payload = await downloadRemoteBackup(accessToken, backup.fileId, fetchImpl);

  return {
    backup,
    folderId,
    summary: getSyncScopeSummaryFromPayload(payload),
  };
}

async function createDriveFolder(accessToken, folderName, fetchImpl) {
  const response = await driveFetch(fetchImpl, accessToken, DRIVE_FILES_ENDPOINT, {
    body: JSON.stringify({
      appProperties: {
        optcApp: 'optc-team-builder',
        optcRole: 'backup-folder',
      },
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      name: folderName,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const payload = await response.json();
  const folderId = normalizeOptionalString(payload.id);

  if (!folderId) {
    throw new Error('Google Drive did not return a folder id.');
  }

  return folderId;
}

async function downloadRemoteBackup(accessToken, fileId, fetchImpl) {
  if (!normalizeOptionalString(fileId)) {
    throw new Error('A Google Drive file id is required.');
  }

  const response = await driveFetch(
    fetchImpl,
    accessToken,
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`,
  );
  const payload = await response.json();

  if (!normalizeAllDataPayload(payload)) {
    throw new Error('The Drive backup file does not contain a full all-data payload.');
  }

  return payload;
}

async function findBackupFile(accessToken, folderId, fetchImpl) {
  const query =
    `'${folderId}' in parents and trashed = false and ` +
    `appProperties has { key='optcRole' and value='all-data-backup' }`;
  const response = await driveFetch(
    fetchImpl,
    accessToken,
    `${DRIVE_FILES_ENDPOINT}?${buildListSearchParams(query)}`,
  );
  const payload = await response.json();
  const file = payload.files?.[0];
  const fileId = normalizeOptionalString(file?.id);

  if (!fileId) {
    return null;
  }

  return {
    exportedAt: normalizeOptionalString(file?.appProperties?.exportedAt),
    fileId,
    fileName: normalizeOptionalString(file?.name) ?? BACKUP_FILE_NAME,
    folderId,
    modifiedTime: normalizeOptionalString(file?.modifiedTime),
  };
}

async function findVisibleDriveFolder(accessToken, fetchImpl) {
  const query =
    `mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false and ` +
    `appProperties has { key='optcRole' and value='backup-folder' }`;
  const response = await driveFetch(
    fetchImpl,
    accessToken,
    `${DRIVE_FILES_ENDPOINT}?${buildListSearchParams(query)}`,
  );
  const payload = await response.json();

  return normalizeOptionalString(payload.files?.[0]?.id);
}

async function ensureDriveFolderId(accessToken, createIfMissing, folderName, fetchImpl) {
  const existingFolderId = await findVisibleDriveFolder(accessToken, fetchImpl);

  if (existingFolderId || !createIfMissing) {
    return existingFolderId;
  }

  return createDriveFolder(accessToken, folderName, fetchImpl);
}

async function upsertRemoteBackup(
  accessToken,
  { accountId, deviceId, existingFolderId, fetchImpl, folderName, payload },
) {
  const folderId =
    existingFolderId ?? (await ensureDriveFolderId(accessToken, true, folderName, fetchImpl));

  if (!folderId) {
    throw new Error('Google Drive folder is unavailable.');
  }

  const existingBackup = await findBackupFile(accessToken, folderId, fetchImpl);
  const metadata = {
    appProperties: {
      accountId: accountId ?? '',
      deviceId: deviceId ?? '',
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
    new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: 'application/json',
    }),
  );

  const response = await driveFetch(
    fetchImpl,
    accessToken,
    existingBackup
      ? `${DRIVE_UPLOAD_ENDPOINT}/${encodeURIComponent(existingBackup.fileId)}?uploadType=multipart&fields=id,modifiedTime,appProperties,name`
      : `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id,modifiedTime,appProperties,name`,
    {
      body: formData,
      method: existingBackup ? 'PATCH' : 'POST',
    },
  );
  const updatedFile = await response.json();
  const fileId = normalizeOptionalString(updatedFile.id);

  if (!fileId) {
    throw new Error('Google Drive did not return a backup file id.');
  }

  return {
    exportedAt:
      normalizeOptionalString(updatedFile.appProperties?.exportedAt) ?? payload.exportedAt,
    fileId,
    fileName: normalizeOptionalString(updatedFile.name) ?? BACKUP_FILE_NAME,
    folderId,
    modifiedTime: normalizeOptionalString(updatedFile.modifiedTime),
  };
}

async function driveFetch(fetchImpl, accessToken, input, init = {}) {
  const headers = new Headers(init.headers);

  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetchImpl(input, {
    ...init,
    headers,
  });

  if (response.ok) {
    return response;
  }

  const errorBody = await response.text();

  if (response.status === 401 || response.status === 403) {
    throw new DriveSyncAuthError(
      `Google Drive request failed with ${response.status}${errorBody ? `: ${errorBody}` : ''}`,
    );
  }

  throw new Error(
    `Google Drive request failed with ${response.status}${errorBody ? `: ${errorBody}` : ''}`,
  );
}

function createCookieSigner(secret) {
  return {
    signJson(value) {
      return this.signString(JSON.stringify(value));
    },
    signString(value) {
      const encoded = base64UrlEncode(Buffer.from(value, 'utf8'));
      const signature = createHmac('sha256', secret).update(encoded).digest('base64url');

      return `${encoded}.${signature}`;
    },
    unsignJson(value) {
      const unsigned = this.unsignString(value);

      if (!unsigned) {
        return null;
      }

      try {
        return JSON.parse(unsigned);
      } catch {
        return null;
      }
    },
    unsignString(value) {
      const [encoded, signature] = String(value ?? '').split('.');

      if (!encoded || !signature) {
        return null;
      }

      const expectedSignature = createHmac('sha256', secret).update(encoded).digest('base64url');

      if (!safeEqual(signature, expectedSignature)) {
        return null;
      }

      return Buffer.from(encoded, 'base64url').toString('utf8');
    },
  };
}

function createJsonCipher(key) {
  return {
    decryptJson(value) {
      return JSON.parse(this.decryptString(value));
    },
    decryptString(value) {
      if (!value || value.v !== 1 || value.alg !== 'aes-256-gcm') {
        throw new Error('Unsupported encrypted payload.');
      }

      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64url'));

      decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(value.data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
    encryptJson(value) {
      return this.encryptString(JSON.stringify(value));
    },
    encryptString(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);

      return {
        alg: 'aes-256-gcm',
        data: base64UrlEncode(encrypted),
        iv: base64UrlEncode(iv),
        tag: base64UrlEncode(cipher.getAuthTag()),
        v: 1,
      };
    },
  };
}

function applyCorsHeaders(response, config) {
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Origin', config.appOrigin);
  response.setHeader('Vary', 'Origin');
}

function appendErrorToReturnTo(returnTo, appOrigin, error) {
  const url = new URL(sanitizeReturnTo(returnTo, appOrigin));

  url.searchParams.set('drive_sync_error', error);

  return url.toString();
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function buildListSearchParams(query) {
  return new URLSearchParams({
    fields: 'files(id,name,modifiedTime,appProperties,parents)',
    pageSize: '10',
    q: query,
    spaces: 'drive',
  }).toString();
}

function clearCookie(response, name, { secure }) {
  setCookie(response, name, '', {
    httpOnly: true,
    maxAge: 0,
    sameSite: 'Lax',
    secure,
  });
}

function createEmptyDatabase() {
  return {
    sessions: {},
    users: {},
  };
}

function deriveEncryptionKey(value) {
  const trimmedValue = value.trim();

  if (/^[A-Fa-f0-9]{64}$/u.test(trimmedValue)) {
    return Buffer.from(trimmedValue, 'hex');
  }

  try {
    const decoded = Buffer.from(trimmedValue, 'base64');

    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to passphrase hashing.
  }

  return createHash('sha256').update(trimmedValue).digest();
}

function getSyncScopeSummaryFromPayload(payload) {
  return {
    characterBoxesCount: Array.isArray(payload.characterBoxes?.boxes)
      ? payload.characterBoxes.boxes.length
      : 0,
    characterOverridesCount: Array.isArray(payload.characterOverrides?.overrides)
      ? payload.characterOverrides.overrides.length
      : 0,
    favoriteCharacterCount: Array.isArray(payload.favorites?.characters)
      ? payload.favorites.characters.length
      : 0,
    favoriteShipCount: Array.isArray(payload.favoriteShips?.ships)
      ? payload.favoriteShips.ships.length
      : 0,
    savedEnemiesCount: Array.isArray(payload.savedEnemies?.enemies)
      ? payload.savedEnemies.enemies.length
      : 0,
    savedRumbleTeamsCount: Array.isArray(payload.savedRumbleTeams?.rumbleTeams)
      ? payload.savedRumbleTeams.rumbleTeams.length
      : 0,
    savedTeamsCount: Array.isArray(payload.savedTeams?.teams) ? payload.savedTeams.teams.length : 0,
  };
}

function mapUserToProfile(user) {
  return {
    email: user.email ?? null,
    familyName: null,
    givenName: null,
    id: user.googleAccountId,
    imageUrl: user.imageUrl ?? null,
    name: user.name ?? null,
  };
}

function mapUserToSyncStatus(user) {
  return {
    hasRemoteBackup: user.hasRemoteBackup === true,
    knownBackupFileId: user.knownBackupFileId ?? null,
    knownFolderId: user.knownFolderId ?? null,
    lastSyncAt: user.lastSyncAt ?? null,
    lastSyncError: user.lastSyncError ?? null,
    lastUploadedExportedAt: user.lastUploadedExportedAt ?? null,
    remoteExportedAt: user.remoteExportedAt ?? null,
    remoteModifiedTime: user.remoteModifiedTime ?? null,
    remoteSummary: user.remoteSummary ?? null,
    syncStatus: user.syncStatus ?? 'idle',
  };
}

function normalizeAllDataPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value.source === 'all-data' && typeof value.exportedAt === 'string' ? value : null;
}

function normalizeDatabase(value) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return {
    sessions:
      record.sessions && typeof record.sessions === 'object' && !Array.isArray(record.sessions)
        ? record.sessions
        : {},
    users:
      record.users && typeof record.users === 'object' && !Array.isArray(record.users)
        ? Object.fromEntries(
            Object.entries(record.users).map(([key, user]) => [
              key,
              normalizeUserRecord(user, key),
            ]),
          )
        : {},
  };
}

function normalizeDriveFolderName(value) {
  if (typeof value !== 'string') {
    return 'OPTC Team Builder';
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : 'OPTC Team Builder';
}

function normalizeExpiresIn(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 3600;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeOrigin(value) {
  const url = new URL(value || DEFAULT_APP_ORIGIN);

  return url.origin;
}

function normalizeRequiredString(value, name) {
  const normalizedValue = normalizeOptionalString(value);

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

function normalizeStateCookie(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const nonce = normalizeOptionalString(value.nonce);
  const returnTo = normalizeOptionalString(value.returnTo);

  if (!nonce || !returnTo) {
    return null;
  }

  return {
    nonce,
    returnTo,
  };
}

function normalizeUrl(value) {
  const normalizedValue = normalizeOptionalString(value);

  if (!normalizedValue) {
    return null;
  }

  return new URL(normalizedValue).toString();
}

function normalizeUserRecord(value, fallbackId) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return {
    email: normalizeOptionalString(record.email),
    encryptedPendingUpload: record.encryptedPendingUpload ?? null,
    encryptedRefreshToken: record.encryptedRefreshToken ?? null,
    googleAccountId: normalizeOptionalString(record.googleAccountId) ?? fallbackId,
    hasRemoteBackup: record.hasRemoteBackup === true,
    imageUrl: normalizeOptionalString(record.imageUrl),
    knownBackupFileId: normalizeOptionalString(record.knownBackupFileId),
    knownFolderId: normalizeOptionalString(record.knownFolderId),
    lastSyncAt: normalizeOptionalString(record.lastSyncAt),
    lastSyncError: normalizeOptionalString(record.lastSyncError),
    lastUploadedExportedAt: normalizeOptionalString(record.lastUploadedExportedAt),
    latestAccessTokenExpiresAt: normalizeOptionalString(record.latestAccessTokenExpiresAt),
    name: normalizeOptionalString(record.name),
    needsReconnect: record.needsReconnect === true,
    remoteExportedAt: normalizeOptionalString(record.remoteExportedAt),
    remoteModifiedTime: normalizeOptionalString(record.remoteModifiedTime),
    remoteSummary: record.remoteSummary ?? null,
    syncStatus: normalizeOptionalString(record.syncStatus) ?? 'idle',
    tokenUpdatedAt: normalizeOptionalString(record.tokenUpdatedAt),
  };
}

function parseCookieSecure(value, redirectUri) {
  const normalizedValue = String(value ?? '')
    .trim()
    .toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }

  return new URL(redirectUri).protocol === 'https:';
}

function parseInteger(value, fallbackValue) {
  const parsedValue = Number.parseInt(String(value ?? ''), 10);

  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

function parseNonNegativeInteger(value, fallbackValue) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallbackValue;
  }

  const parsedValue = Number.parseInt(String(value), 10);

  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallbackValue;
}

export function createRateLimiter({ globalPerMinute, writePerMinute, now = () => Date.now() }) {
  const buckets = new Map();

  function getBucket(key) {
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { global: [], write: [] };
      buckets.set(key, bucket);
    }

    return bucket;
  }

  function trim(timestamps, current) {
    const cutoff = current - RATE_LIMIT_WINDOW_MS;
    let drop = 0;

    while (drop < timestamps.length && timestamps[drop] <= cutoff) {
      drop += 1;
    }

    if (drop > 0) {
      timestamps.splice(0, drop);
    }
  }

  return {
    consume(key, isWrite) {
      const current = now();
      const bucket = getBucket(key);

      trim(bucket.global, current);
      trim(bucket.write, current);

      if (globalPerMinute > 0 && bucket.global.length >= globalPerMinute) {
        const oldest = bucket.global[0];
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - current) / 1000),
        );

        return { allowed: false, retryAfterSeconds };
      }

      if (isWrite && writePerMinute > 0 && bucket.write.length >= writePerMinute) {
        const oldest = bucket.write[0];
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - current) / 1000),
        );

        return { allowed: false, retryAfterSeconds };
      }

      bucket.global.push(current);

      if (isWrite) {
        bucket.write.push(current);
      }

      return { allowed: true, retryAfterSeconds: 0 };
    },
    snapshot() {
      return {
        clientCount: buckets.size,
        globalPerMinute,
        writePerMinute,
      };
    },
  };
}

function resolveClientKey(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  if (typeof raw === 'string') {
    const first = raw.split(',')[0]?.trim();

    if (first) {
      return first;
    }
  }

  return request.socket?.remoteAddress ?? 'unknown';
}

function randomToken(size = 24) {
  return randomBytes(size).toString('base64url');
}

async function readGoogleJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function readJsonBody(request, maxBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > maxBytes) {
      throw new Error('Request body is too large.');
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function readCookie(request, name) {
  const cookieHeader = request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  for (const cookiePart of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = cookiePart.trim().split('=');

    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join('='));
    }
  }

  return null;
}

function readSignedJsonCookie(request, name, signer) {
  const value = readCookie(request, name);

  return value ? signer.unsignJson(value) : null;
}

function redirect(response, location) {
  response.writeHead(302, {
    Location: location,
  });
  response.end();
}

function resolveErrorMessage(error) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'Google Drive sync failed.';
}

function resolveGoogleErrorMessage(payload, fallbackMessage) {
  return (
    normalizeOptionalString(payload?.error_description) ??
    normalizeOptionalString(payload?.error) ??
    fallbackMessage
  );
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sanitizeReturnTo(value, appOrigin) {
  try {
    const url = new URL(value || appOrigin, appOrigin);

    return url.origin === appOrigin ? url.toString() : appOrigin;
  } catch {
    return appOrigin;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function setCookie(response, name, value, { httpOnly, maxAge, sameSite, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    `SameSite=${sameSite}`,
  ];

  if (httpOnly) {
    parts.push('HttpOnly');
  }

  if (secure) {
    parts.push('Secure');
  }

  const current = response.getHeader('Set-Cookie');
  const nextCookie = parts.join('; ');

  if (!current) {
    response.setHeader('Set-Cookie', nextCookie);
    return;
  }

  response.setHeader(
    'Set-Cookie',
    Array.isArray(current) ? [...current, nextCookie] : [current, nextCookie],
  );
}

const mainModulePath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (mainModulePath && import.meta.url === mainModulePath) {
  const server = createDriveSyncServer();
  const stopWorker = server.startWorker();

  server
    .listen()
    .then(() => {
      console.log(`Drive sync backend listening on ${server.config.publicBaseUrl}`);
    })
    .catch((error) => {
      stopWorker?.();
      console.error(resolveErrorMessage(error));
      process.exitCode = 1;
    });
}

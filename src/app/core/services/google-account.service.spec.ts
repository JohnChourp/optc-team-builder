import '@angular/compiler';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { socialLogin } from '../../../test-mocks/social-login';

import { GoogleAccountService } from './google-account.service';
import type { AppSyncConfig } from '../sync/app-sync.config';

describe('GoogleAccountService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    // Tests that sign in persist `optc_google_account_session`; in environments where
    // localStorage is a real shared store (CI's ng test) that would leak into later
    // tests. Clear it up front so each test starts with no remembered session.
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('optc_google_account_session');
      }
    } catch {
      // localStorage unavailable in this environment — nothing to clear.
    }
    try {
      if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
        globalThis.localStorage.removeItem('optc_google_account_session');
      }
    } catch {
      // localStorage unavailable in this environment — nothing to clear.
    }
    vi.stubGlobal('location', {
      assign: vi.fn(),
      hash: '',
      href: 'https://optcteambuilder.com/',
      origin: 'https://optcteambuilder.com',
      pathname: '/',
      search: '',
    });
  });

  it('restores a signed-in session from the stored authorization state', async () => {
    socialLogin.initialize.mockResolvedValue(undefined);
    socialLogin.isLoggedIn.mockResolvedValue({ isLoggedIn: true });
    socialLogin.getAuthorizationCode.mockResolvedValue({
      accessToken: 'access-token',
      jwt: buildIdToken({
        email: 'captain@example.com',
        family_name: 'D.',
        given_name: 'Monkey',
        name: 'Monkey D. Luffy',
        picture: 'https://example.com/luffy.png',
        sub: 'google-user-1',
      }),
    });

    const service = createService({
      googleDriveFolderName: 'OPTC Team Builder',
      googleIosClientId: '',
      googleWebClientId: '123456.apps.googleusercontent.com',
    });
    await service.ready();

    expect(socialLogin.initialize).toHaveBeenCalledOnce();
    expect(socialLogin.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        google: expect.objectContaining({
          redirectUrl: 'https://optcteambuilder.com',
          webClientId: '123456.apps.googleusercontent.com',
        }),
      }),
    );
    expect(service.isSignedIn()).toBe(true);
    expect(service.profile()).toMatchObject({
      email: 'captain@example.com',
      id: 'google-user-1',
      name: 'Monkey D. Luffy',
    });
  });

  it('signs in interactively and stores the google profile', async () => {
    socialLogin.initialize.mockResolvedValue(undefined);
    socialLogin.isLoggedIn.mockResolvedValue({ isLoggedIn: false });
    socialLogin.login.mockResolvedValue({
      provider: 'google',
      result: {
        accessToken: {
          token: 'login-access-token',
        },
        idToken: buildIdToken({
          email: 'captain@example.com',
          family_name: 'D.',
          given_name: 'Monkey',
          name: 'Monkey D. Luffy',
          sub: 'google-user-1',
        }),
        profile: {
          email: 'captain@example.com',
          familyName: 'D.',
          givenName: 'Monkey',
          id: 'google-user-1',
          imageUrl: null,
          name: 'Monkey D. Luffy',
        },
        responseType: 'online',
      },
    });

    const service = createService({
      googleDriveFolderName: 'OPTC Team Builder',
      googleIosClientId: '',
      googleWebClientId: '123456.apps.googleusercontent.com',
    });
    await service.ready();
    await service.signIn();

    expect(socialLogin.login).toHaveBeenCalledOnce();
    expect(socialLogin.login).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        options: expect.objectContaining({
          scopes: ['email', 'profile', 'https://www.googleapis.com/auth/drive.file'],
        }),
      }),
    );
    expect(service.isSignedIn()).toBe(true);
    expect(service.profile()?.id).toBe('google-user-1');
    expect(service.sessionRevision()).toBe(1);
  });

  it('finishes a Google OAuth popup callback and posts the login result to the opener', async () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    const removeItem = vi.fn();
    const idToken = buildIdToken({
      email: 'captain@example.com',
      family_name: 'D.',
      given_name: 'Monkey',
      name: 'Monkey D. Luffy',
      sub: 'google-user-1',
    });

    vi.stubGlobal('window', {
      close,
      location: {
        hash: `#state=popup&access_token=popup-access-token&id_token=${idToken}`,
        href: 'https://optcteambuilder.com/',
        origin: 'https://optcteambuilder.com',
        pathname: '/',
        search: '',
      },
      localStorage: {
        getItem: vi.fn(() =>
          JSON.stringify({
            nonce: 'popup-nonce',
            provider: 'google',
          }),
        ),
        removeItem,
      },
      opener: {
        postMessage,
      },
    });

    class BroadcastChannelStub {
      public static readonly messages: unknown[] = [];

      public constructor(public readonly name: string) {}

      public close(): void {}

      public postMessage(message: unknown): void {
        BroadcastChannelStub.messages.push({ message, name: this.name });
      }
    }

    vi.stubGlobal('BroadcastChannel', BroadcastChannelStub);

    const service = createService({
      googleDriveFolderName: 'OPTC Team Builder',
      googleIosClientId: '',
      googleWebClientId: '123456.apps.googleusercontent.com',
    });
    await service.ready();

    expect(socialLogin.initialize).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: { token: 'popup-access-token' },
        idToken,
        provider: 'google',
        responseType: 'online',
        type: 'oauth-response',
      }),
      'https://optcteambuilder.com',
    );
    expect(BroadcastChannelStub.messages).toEqual([
      expect.objectContaining({
        name: 'google_oauth_popup-nonce',
      }),
    ]);
    expect(removeItem).toHaveBeenCalledWith('social_login_oauth_pending');
    expect(close).toHaveBeenCalledOnce();
  });

  it('requires reconnect when the stored token cannot be refreshed silently', async () => {
    socialLogin.initialize.mockResolvedValue(undefined);
    socialLogin.isLoggedIn.mockResolvedValue({ isLoggedIn: true });
    socialLogin.getAuthorizationCode.mockRejectedValue(new Error('Token expired'));

    const service = createService({
      googleDriveFolderName: 'OPTC Team Builder',
      googleIosClientId: '',
      googleWebClientId: '123456.apps.googleusercontent.com',
    });
    await service.ready();

    expect(service.needsReconnect()).toBe(true);
    expect(service.lastError()).toBe('Token expired');
    await expect(service.ensureAccessToken()).resolves.toBeNull();
  });

  it('restores a backend Google session without initializing browser social login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authenticated: true,
            profile: {
              email: 'captain@example.com',
              familyName: null,
              givenName: null,
              id: 'google-user-1',
              imageUrl: null,
              name: 'Monkey D. Luffy',
            },
            status: 'signed-in',
          }),
          {
            status: 200,
          },
        ),
      ),
    );

    const service = createService({
      googleDriveBackendUrl: 'http://localhost:8787',
      googleDriveFolderName: 'OPTC Team Builder',
      googleIosClientId: '',
      googleWebClientId: '',
    });
    await service.ready();

    expect(socialLogin.initialize).not.toHaveBeenCalled();
    expect(service.isAvailable()).toBe(true);
    expect(service.isSignedIn()).toBe(true);
    expect(service.profile()?.id).toBe('google-user-1');
  });

  it('starts backend OAuth with a redirect instead of exposing a browser access token', async () => {
    const assign = vi.fn();

    vi.stubGlobal('location', {
      assign,
      hash: '',
      href: 'https://optcteambuilder.com/tabs/account',
      origin: 'https://optcteambuilder.com',
      pathname: '/tabs/account',
      search: '',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authenticated: false,
            status: 'signed-out',
          }),
          {
            status: 200,
          },
        ),
      ),
    );

    const service = createService({
      googleDriveBackendUrl: 'http://localhost:8787',
      googleDriveFolderName: 'OPTC Team Builder',
      googleIosClientId: '',
      googleWebClientId: '',
    });
    await service.ready();
    await service.signIn(true);

    expect(socialLogin.login).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledOnce();
    expect(String(assign.mock.calls[0]?.[0])).toContain('/auth/google/start');
    expect(String(assign.mock.calls[0]?.[0])).toContain('force=1');
    expect(String(assign.mock.calls[0]?.[0])).toContain(
      encodeURIComponent('https://optcteambuilder.com/tabs/account'),
    );
  });

  it('keeps the account connected after the access token expires instead of signing out', async () => {
    const storage = createMemoryStorage();

    stubBrowserWindow(storage);
    socialLogin.initialize.mockResolvedValue(undefined);
    socialLogin.isLoggedIn.mockResolvedValue({ isLoggedIn: true });
    socialLogin.getAuthorizationCode.mockResolvedValue({
      accessToken: 'access-token',
      jwt: buildIdToken({
        email: 'captain@example.com',
        name: 'Monkey D. Luffy',
        sub: 'google-user-1',
      }),
    });

    const firstLoad = createService(webConfig());
    await firstLoad.ready();

    expect(firstLoad.isSignedIn()).toBe(true);
    expect(storage.getItem('optc_google_account_session')).not.toBeNull();

    // A later load, hours on: the web plugin has discarded the expired token and
    // reports the user as logged out. The account must stay connected regardless.
    socialLogin.isLoggedIn.mockResolvedValue({ isLoggedIn: false });
    socialLogin.getAuthorizationCode.mockReset();

    const laterLoad = createService(webConfig());
    await laterLoad.ready();

    expect(laterLoad.isSignedIn()).toBe(true);
    expect(laterLoad.status()).toBe('signed-in');
    expect(laterLoad.needsReconnect()).toBe(false);
    expect(laterLoad.profile()).toMatchObject({ id: 'google-user-1' });
    expect(socialLogin.getAuthorizationCode).not.toHaveBeenCalled();
  });

  it('forgets the remembered session only after an explicit sign-out', async () => {
    const storage = createMemoryStorage();

    stubBrowserWindow(storage);
    socialLogin.initialize.mockResolvedValue(undefined);
    socialLogin.isLoggedIn.mockResolvedValue({ isLoggedIn: true });
    socialLogin.getAuthorizationCode.mockResolvedValue({
      accessToken: 'access-token',
      jwt: buildIdToken({ name: 'Monkey D. Luffy', sub: 'google-user-1' }),
    });
    socialLogin.logout.mockResolvedValue(undefined);

    const service = createService(webConfig());
    await service.ready();

    expect(service.isSignedIn()).toBe(true);

    await service.signOut();

    expect(service.isSignedIn()).toBe(false);
    expect(storage.getItem('optc_google_account_session')).toBeNull();

    // Reloading after a real sign-out stays signed out — no remembered profile.
    socialLogin.isLoggedIn.mockResolvedValue({ isLoggedIn: false });

    const reloaded = createService(webConfig());
    await reloaded.ready();

    expect(reloaded.isSignedIn()).toBe(false);
    expect(reloaded.status()).toBe('signed-out');
  });

  it('keeps a remembered account connected when an interactive re-auth is cancelled', async () => {
    const storage = createMemoryStorage();

    stubBrowserWindow(storage);
    storage.setItem(
      'optc_google_account_session',
      JSON.stringify({
        profile: {
          email: 'captain@example.com',
          familyName: null,
          givenName: null,
          id: 'google-user-1',
          imageUrl: null,
          name: 'Monkey D. Luffy',
        },
      }),
    );
    socialLogin.initialize.mockResolvedValue(undefined);
    socialLogin.isLoggedIn.mockResolvedValue({ isLoggedIn: false });

    const service = createService(webConfig());
    await service.ready();

    expect(service.isSignedIn()).toBe(true);

    // The user starts an interactive re-auth and closes the popup.
    socialLogin.login.mockRejectedValue(new Error('Popup closed'));

    await expect(service.signIn(true)).rejects.toThrow('Popup closed');

    // A cancelled re-auth is not a disconnect: the remembered account survives.
    expect(service.isSignedIn()).toBe(true);
    expect(service.status()).toBe('signed-in');
    expect(service.profile()).toMatchObject({ id: 'google-user-1' });
    expect(storage.getItem('optc_google_account_session')).not.toBeNull();
  });
});

function createService(config: AppSyncConfig): GoogleAccountService {
  return new GoogleAccountService(config, socialLogin);
}

function webConfig(): AppSyncConfig {
  return {
    googleDriveFolderName: 'OPTC Team Builder',
    googleIosClientId: '',
    googleWebClientId: '123456.apps.googleusercontent.com',
  };
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number): string | null {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  } satisfies Storage;
}

function stubBrowserWindow(storage: Storage): void {
  vi.stubGlobal('window', {
    localStorage: storage,
    location: {
      hash: '',
      href: 'https://optcteambuilder.com/',
      origin: 'https://optcteambuilder.com',
      pathname: '/',
      search: '',
    },
  });
}

function buildIdToken(payload: Record<string, unknown>): string {
  return `header.${encodeJwtPayload(payload)}.signature`;
}

function encodeJwtPayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/*
 * 869f13d63. "Two or three distinct authentication paths depending on where the app runs"
 * was the premise. Measured 2026-09-21, and the first pass at this got it WRONG in a way
 * worth recording: a grep for `isNativePlatform` returned zero and the conclusion drawn was
 * "no platform branch anywhere". This service branches four times - on
 * `Capacitor.getPlatform()`. A negative assertion over one spelling of a concept proves
 * nothing about the concept.
 *
 * What the four branches actually are:
 *
 *   1. `getWebRedirectUrl` - web only, because only the web flow has a redirect URL;
 *   2. `completeGooglePopupRedirectIfNeeded` - web only, same reason;
 *   3. `getPlatform() === 'ios'` -> `googleIosClientId` - UNREACHABLE today. It needs a
 *      native Capacitor iOS app, and there is none since 2026-09-20. On iPhone the PWA
 *      reports `web`. Kept, not deleted: `docs/ios-platform-footprint.md` records that
 *      `APP_GOOGLE_IOS_CLIENT_ID` is supplied by four workflows including the one that
 *      builds the WEBSITE, and that removing "the iOS things" by name would take Google
 *      sign-in down on the web app;
 *   4. `isBackendSessionEnabled` - web AND a configured URL. There is no such URL: it is
 *      the empty string in production and no workflow sets it, so the third "path" the
 *      task counted is unreachable in every shipped build.
 *
 * So the answer to the task: **the things it asked to compare cannot differ.** Session
 * lifetime, expiry behaviour and Drive reach are decided by code with no platform branch at
 * all - `refreshAuthorizationState` and the two Drive services. The branches that exist are
 * about how a token is OBTAINED, never about how long it lasts or what it reaches.
 *
 * These assertions keep that true. In this EXISTING spec rather than a new lane: the
 * defect has not recurred, so it has not earned one.
 */
describe('what the three sign-in paths can and cannot differ on', () => {
  const read = (file: string) => readFileSync(file, 'utf8');

  const ACCOUNT = 'src/app/core/services/google-account.service.ts';
  const DRIVE = [
    'src/app/core/services/drive-backup.service.ts',
    'src/app/core/services/drive-sync-state.service.ts',
  ];

  it('reads the real files, so nothing below passes vacuously', () => {
    for (const file of [ACCOUNT, ...DRIVE]) {
      expect(read(file).length, file).toBeGreaterThan(1000);
    }
  });

  it('decides Drive reach with no platform branch at all', () => {
    // Both spellings, because the first pass at this checked only one and was wrong.
    for (const file of DRIVE) {
      const source = read(file);

      expect(source, `${file} branches on platform`).not.toMatch(/isNativePlatform|getPlatform\s*\(/u);
    }
  });

  it('decides session lifetime and expiry with no platform branch', () => {
    // The slice is guarded: if refreshAuthorizationState is renamed, this fails loudly
    // rather than silently checking an empty string.
    const source = read(ACCOUNT);
    const from = source.indexOf('private async refreshAuthorizationState(');
    const to = source.indexOf('\n  private ', from + 10);

    expect(from, 'refreshAuthorizationState must exist').toBeGreaterThan(-1);
    expect(to, 'its end must be findable').toBeGreaterThan(from);

    const body = source.slice(from, to);
    expect(body.length, 'a slice that misses makes this trivially pass').toBeGreaterThan(900);
    expect(body).not.toMatch(/isNativePlatform|getPlatform\s*\(/u);
  });

  it('keeps every platform branch in the one place that obtains a token', () => {
    const source = read(ACCOUNT);
    const branches = [...source.matchAll(/Capacitor\.getPlatform\(\)\s*(?:!==?|===?)\s*'(\w+)'/gu)].map((m) => m[1]);

    // Four, and no more. A fifth means somebody made a NEW thing platform-dependent.
    expect(branches.sort()).toEqual(['ios', 'web', 'web', 'web']);
  });

  it('ships with the backend session path unreachable', () => {
    // The third "path". `git grep -l` exits 1 when nothing matches, which is the answer
    // wanted here - so the exit code is what is asserted, not stdout.
    let matched = true;
    try {
      execFileSync('git', ['grep', '-l', 'APP_GOOGLE_DRIVE_BACKEND_URL', '--', '.github/workflows'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch {
      matched = false;
    }

    expect(matched, 'no workflow may configure a backend that is frozen').toBe(false);
    expect(read(ACCOUNT)).toMatch(/getPlatform\(\) === 'web' && this\.getBackendUrl\(\)\.length > 0/u);
  });
});

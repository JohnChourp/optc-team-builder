import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { socialLogin } from '../../../test-mocks/social-login';

import { GoogleAccountService } from './google-account.service';
import type { AppSyncConfig } from '../sync/app-sync.config';

describe('GoogleAccountService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
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

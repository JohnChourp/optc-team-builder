import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleAccountService } from './google-account.service';

const { getPlatform, socialLogin } = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'web'),
  socialLogin: {
    getAuthorizationCode: vi.fn(),
    initialize: vi.fn(),
    isLoggedIn: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform,
  },
}));

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: socialLogin,
}));

describe('GoogleAccountService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    getPlatform.mockReturnValue('web');
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

    const service = new GoogleAccountService({
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

    const service = new GoogleAccountService({
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

    const service = new GoogleAccountService({
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

    const service = new GoogleAccountService({
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

    const service = new GoogleAccountService({
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

    const service = new GoogleAccountService({
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
});

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

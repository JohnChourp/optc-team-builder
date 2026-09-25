import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppSyncConfig } from '../sync/app-sync.config';
import { GoogleAccountService } from './google-account.service';

/*
 * 869f6td25. A Greek or accented Google name, after a reload on the website.
 *
 * Right after sign-in the name was right, because the sign-in plugin decodes the ID token's UTF-8
 * itself. Every refresh after that went through the app's own decoder, which took `atob`'s one
 * character per BYTE as the text - so "Γιάννης Χουρπουλιάδης" came back as a run of Latin-1
 * letters in the side menu and the Account title, and that is what got remembered.
 *
 * Every token here is assembled at runtime from JSON claims, so no token-shaped literal exists in
 * this file. Each test builds its own sign-in client and puts every stubbed global back, so nothing
 * here reaches the next spec file in the worker.
 */

const REMEMBERED_SESSION_KEY = 'optc_google_account_session';

const CONFIG: AppSyncConfig = {
  googleDriveFolderName: 'OPTC Team Builder',
  googleIosClientId: '',
  googleWebClientId: '123456.apps.googleusercontent.com',
};

function base64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** An ID token as Google shapes it - header, claims, signature - built from its claims. */
function idToken(claims: Record<string, unknown>): string {
  return [base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), base64Url(JSON.stringify(claims)), 'signature'].join('.');
}

/** What the app used to make of `name`: its UTF-8 bytes read one per character. */
function garbled(name: string): string {
  return Buffer.from(name, 'utf8').toString('latin1');
}

function createStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length(): number {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  } satisfies Storage;
}

function createClient(options: { loggedIn: boolean; jwt?: string }) {
  return {
    getAuthorizationCode: vi.fn().mockResolvedValue({ accessToken: 'access-token', jwt: options.jwt }),
    initialize: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockResolvedValue({ isLoggedIn: options.loggedIn }),
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

function stubWebsite(storage: Storage, hash = ''): void {
  vi.stubGlobal('window', {
    localStorage: storage,
    location: {
      hash,
      href: 'https://optcteambuilder.com/',
      origin: 'https://optcteambuilder.com',
      pathname: '/',
      search: '',
    },
  });
}

function rememberedName(storage: Storage): unknown {
  return (JSON.parse(storage.getItem(REMEMBERED_SESSION_KEY) ?? '{}') as { profile?: { name?: unknown } }).profile?.name;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const NAMES = [
  { case: 'a Greek name', name: 'Γιάννης Χουρπουλιάδης', given: 'Γιάννης', family: 'Χουρπουλιάδης' },
  { case: 'an accented Latin name', name: 'José Müller-Łukasz', given: 'José', family: 'Müller-Łukasz' },
  // The control: an ASCII name decoded the same before the fix, and must still.
  { case: 'an ASCII name', name: 'Monkey D. Luffy', given: 'Monkey', family: 'D. Luffy' },
] as const;

describe('a Google account name after a reload on the website', () => {
  for (const person of NAMES) {
    it(`shows and remembers ${person.case} exactly as Google sent it`, async () => {
      const storage = createStorage();

      stubWebsite(storage);

      const service = new GoogleAccountService(
        CONFIG,
        createClient({
          loggedIn: true,
          jwt: idToken({ sub: 'google-user-1', name: person.name, given_name: person.given, family_name: person.family }),
        }) as never,
      );

      await service.ready();

      expect(service.status()).toBe('signed-in');
      expect(service.profile()).toMatchObject({
        id: 'google-user-1',
        name: person.name,
        givenName: person.given,
        familyName: person.family,
      });
      expect(rememberedName(storage)).toBe(person.name);
    });
  }

  it('heals a name remembered garbled on the next refresh', async () => {
    const storage = createStorage();
    const name = NAMES[0].name;

    storage.setItem(REMEMBERED_SESSION_KEY, JSON.stringify({ profile: { id: 'google-user-1', name: garbled(name) } }));
    stubWebsite(storage);

    const service = new GoogleAccountService(
      CONFIG,
      createClient({ loggedIn: true, jwt: idToken({ sub: 'google-user-1', name }) }) as never,
    );

    await service.ready();

    expect(service.profile()?.name).toBe(name);
    expect(rememberedName(storage)).toBe(name);
  });

  it('does not guess at a garbled name when there is no fresh token to read it from', async () => {
    const storage = createStorage();
    const stored = garbled(NAMES[0].name);

    // The positive control for the test above: the stored value really is the garbled one.
    expect(stored).not.toBe(NAMES[0].name);

    storage.setItem(REMEMBERED_SESSION_KEY, JSON.stringify({ profile: { id: 'google-user-1', name: stored } }));
    stubWebsite(storage);

    // The plugin has discarded its expired token: the remembered account stays, as remembered.
    const service = new GoogleAccountService(CONFIG, createClient({ loggedIn: false }) as never);

    await service.ready();

    expect(service.status()).toBe('signed-in');
    expect(service.profile()?.name).toBe(stored);
  });

  it('hands the sign-in window the name exactly as Google sent it', async () => {
    const postMessage = vi.fn();
    const name = NAMES[0].name;
    const token = idToken({ sub: 'google-user-1', name });

    vi.stubGlobal('window', {
      close: vi.fn(),
      location: {
        hash: `#state=popup&access_token=popup-access-token&id_token=${token}`,
        href: 'https://optcteambuilder.com/',
        origin: 'https://optcteambuilder.com',
        pathname: '/',
        search: '',
      },
      localStorage: { getItem: vi.fn(() => null), removeItem: vi.fn() },
      opener: { postMessage },
    });

    const client = createClient({ loggedIn: false });
    const service = new GoogleAccountService(CONFIG, client as never);

    await service.ready();

    expect(client.initialize).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ idToken: token, profile: expect.objectContaining({ name }), type: 'oauth-response' }),
      'https://optcteambuilder.com',
    );
  });
});

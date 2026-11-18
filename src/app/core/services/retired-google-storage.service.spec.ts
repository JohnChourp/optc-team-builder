import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DRIVE_SYNC_METADATA_KEY,
  GOOGLE_ACCOUNT_SESSION_KEY,
  RetiredGoogleStorageService,
  SOCIAL_LOGIN_GOOGLE_STATE_KEY,
  SOCIAL_LOGIN_OAUTH_RESULT_PREFIX,
  SOCIAL_LOGIN_OAUTH_STATE_KEY,
} from './retired-google-storage.service';

/** A real-enough Storage: the suite runs in Node, which has no localStorage of its own. */
function memoryStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));

  return {
    store,
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: vi.fn((key: string) => void store.delete(key)),
  };
}

describe('RetiredGoogleStorageService (1amndjnq718)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deletes the Google session, the OAuth state and the Drive bookkeeping a former user kept', async () => {
    const storage = memoryStorage({
      [GOOGLE_ACCOUNT_SESSION_KEY]: '{"email":"player@example.com"}',
      [SOCIAL_LOGIN_OAUTH_STATE_KEY]: 'state',
      savedTeams: '[]',
    });
    const preferences = { remove: vi.fn(async () => undefined) };

    vi.stubGlobal('localStorage', storage);

    await new RetiredGoogleStorageService(preferences as never).init();

    expect(storage.store.has(GOOGLE_ACCOUNT_SESSION_KEY)).toBe(false);
    expect(storage.store.has(SOCIAL_LOGIN_OAUTH_STATE_KEY)).toBe(false);
    expect(preferences.remove).toHaveBeenCalledWith({ key: DRIVE_SYNC_METADATA_KEY });
    expect(storage.store.get('savedTeams'), 'the player data stays').toBe('[]');
  });

  it("deletes the Google tokens and sign-in results the social-login plugin kept for itself", async () => {
    const storage = memoryStorage({
      [SOCIAL_LOGIN_GOOGLE_STATE_KEY]: '{"accessToken":"a","idToken":"b"}',
      [`${SOCIAL_LOGIN_OAUTH_RESULT_PREFIX}nonce-1`]: '{}',
      [`${SOCIAL_LOGIN_OAUTH_RESULT_PREFIX}nonce-2`]: '{}',
      savedTeams: '[]',
      'optc.unrelated': 'kept',
    });

    vi.stubGlobal('localStorage', storage);

    await new RetiredGoogleStorageService({ remove: vi.fn(async () => undefined) } as never).init();

    expect([...storage.store.keys()].sort()).toEqual(['optc.unrelated', 'savedTeams']);
  });

  it('starts the app even when storage refuses', async () => {
    const storage = memoryStorage({});
    const preferences = { remove: vi.fn(async () => Promise.reject(new Error('blocked'))) };

    storage.removeItem.mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.stubGlobal('localStorage', storage);

    await expect(new RetiredGoogleStorageService(preferences as never).init()).resolves.toBeUndefined();
    expect(preferences.remove).toHaveBeenCalledOnce();
  });

  it('starts the app where there is no localStorage at all', async () => {
    const preferences = { remove: vi.fn(async () => undefined) };

    vi.stubGlobal('localStorage', undefined);

    await expect(new RetiredGoogleStorageService(preferences as never).init()).resolves.toBeUndefined();
    expect(preferences.remove).toHaveBeenCalledWith({ key: DRIVE_SYNC_METADATA_KEY });
  });

  it('keeps the canonical spellings from the storage register', () => {
    expect([
      DRIVE_SYNC_METADATA_KEY,
      GOOGLE_ACCOUNT_SESSION_KEY,
      SOCIAL_LOGIN_OAUTH_STATE_KEY,
      SOCIAL_LOGIN_GOOGLE_STATE_KEY,
      SOCIAL_LOGIN_OAUTH_RESULT_PREFIX,
    ]).toEqual([
      'driveSyncMetadata',
      'optc_google_account_session',
      'social_login_oauth_pending',
      'capgo_social_login_google_state',
      'social_login_oauth_result_',
    ]);
  });
});

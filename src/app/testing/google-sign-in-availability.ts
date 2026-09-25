import { Capacitor } from '@capacitor/core';
import { vi } from 'vitest';

import { BROWSER_STORAGE_KEYS } from '../core/data/browser-storage-keys.data';
import { GoogleAccountService } from '../core/services/google-account.service';

/**
 * Where `GoogleAccountService` remembers a signed-in reader in `window.localStorage`, read from
 * the storage-key registry rather than written out again: the registry is the one place that key
 * is named, and `storage-keys` refuses a second constant for it.
 */
function rememberedSessionStorageKey(): string {
  const record = BROWSER_STORAGE_KEYS.find(
    (entry) => entry.constantName === 'GOOGLE_ACCOUNT_SESSION_KEY',
  );

  if (!record) {
    throw new Error('createAndroidGoogleAccount: the registry no longer names GOOGLE_ACCOUNT_SESSION_KEY.');
  }

  return record.key;
}

/**
 * The real `GoogleAccountService`, as the Android app builds it - signed out, whatever ran before.
 *
 * 869f63gqt. The published APK is built without the Google web client id, so on Android
 * `isAvailable()` is false and no screen may offer sign-in there. The sign-in gate specs build
 * their screens on THIS service rather than on a stub, because the claim they prove is that the
 * screens use the service's own check - so that an Android build that does carry the id offers
 * sign-in again with no second code path. A stub's `isAvailable` would prove only that the stub
 * was set.
 *
 * ORDER-INDEPENDENT BY CONSTRUCTION. `ng test` runs Vitest with `isolate: false` and reuses each
 * worker process for several spec files, so a file inherits whatever the file before it left in
 * that process. Measured 2026-09-25 with the queue forced: `google-account.service.spec.ts` ends
 * with `window` still stubbed by `vi.stubGlobal` - its `beforeEach` unstubs, nothing after its
 * last test does - and that stub's in-memory `localStorage` holds a remembered session for
 * `google-user-1`. The next file in the same process got a SIGNED-IN service from this helper,
 * so Home showed the reader's profile instead of offering sign-in, and two assertions failed.
 * This helper used to clear `globalThis.localStorage`, which under that stub is a different
 * object from the `window.localStorage` the service reads, so the clear missed.
 *
 * So nothing here is inherited:
 *
 *   - globals an earlier file stubbed are put back, which also makes `window` real again. That
 *     includes any global the CALLING spec stubbed, so call this before stubbing anything;
 *   - the remembered session is removed from the storage the service actually reads;
 *   - the service gets a sign-in client of its own, so no other file's resolved values or
 *     queued `Once` values on the shared `socialLogin` mock can reach it;
 *   - and it refuses to hand back a signed-in service, so a leak that gets past all of that
 *     fails here, by name, instead of as a missing button three calls later.
 *
 * The id is the same harmless literal `google-account.service.spec.ts` uses. The platform spy
 * is the caller's to restore; `vi.restoreAllMocks()` in an `afterEach` does it.
 */
export async function createAndroidGoogleAccount(options: {
  readonly clientIdConfigured: boolean;
}): Promise<GoogleAccountService> {
  vi.unstubAllGlobals();

  try {
    window.localStorage?.removeItem(rememberedSessionStorageKey());
  } catch {
    // No storage in this environment: nothing can be remembered.
  }

  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');

  const signedOutClient = {
    getAuthorizationCode: vi.fn().mockRejectedValue(new Error('Not signed in.')),
    initialize: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockResolvedValue({ isLoggedIn: false }),
    login: vi.fn().mockRejectedValue(new Error('Sign-in is not exercised by these specs.')),
    logout: vi.fn().mockResolvedValue(undefined),
  };
  const service = new GoogleAccountService(
    {
      googleDriveFolderName: 'OPTC Team Builder',
      googleIosClientId: '',
      googleWebClientId: options.clientIdConfigured ? '123456.apps.googleusercontent.com' : '',
    },
    signedOutClient,
  );

  await service.ready();

  if (service.profile() !== null || service.status() === 'signed-in') {
    throw new Error(
      `createAndroidGoogleAccount: the service came up signed in (${service.status()}) - ` +
        'a remembered session leaked in from an earlier spec file.',
    );
  }

  return service;
}

import { Capacitor } from '@capacitor/core';
import { vi } from 'vitest';

import { socialLogin } from '../../test-mocks/social-login';
import { GoogleAccountService } from '../core/services/google-account.service';

/**
 * The real `GoogleAccountService`, as the Android app builds it.
 *
 * 869f63gqt. The published APK is built without the Google web client id, so on Android
 * `isAvailable()` is false and no screen may offer sign-in there. The sign-in gate specs build
 * their screens on THIS service rather than on a stub, because the claim they prove is that the
 * screens use the service's own check - so that an Android build that does carry the id offers
 * sign-in again with no second code path. A stub's `isAvailable` would prove only that the stub
 * was set.
 *
 * The id is the same harmless literal `google-account.service.spec.ts` uses. The platform spy is
 * the caller's to restore; `vi.restoreAllMocks()` in an `afterEach` does it.
 */
export async function createAndroidGoogleAccount(options: {
  readonly clientIdConfigured: boolean;
}): Promise<GoogleAccountService> {
  vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');

  try {
    globalThis.localStorage?.removeItem('optc_google_account_session');
  } catch {
    // No storage in this environment: nothing remembered to clear.
  }

  if (options.clientIdConfigured) {
    // Queued once: an unavailable service never calls them, and a leftover would leak.
    socialLogin.initialize.mockResolvedValueOnce(undefined);
    socialLogin.isLoggedIn.mockResolvedValueOnce({ isLoggedIn: false });
  }

  const service = new GoogleAccountService(
    {
      googleDriveFolderName: 'OPTC Team Builder',
      googleIosClientId: '',
      googleWebClientId: options.clientIdConfigured ? '123456.apps.googleusercontent.com' : '',
    },
    socialLogin,
  );

  await service.ready();

  return service;
}

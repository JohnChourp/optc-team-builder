import { Injectable } from '@angular/core';

import { PreferencesAdapterService } from './preferences-adapter.service';

/*
 * 1amndjnq718. Google sign-in and Drive sync were removed on 2026-11-18. A player who used them
 * still has three keys on the device, and two of them say who they were: the signed-in profile
 * and the Drive sync bookkeeping, which carried the account's email and id. Nothing reads them
 * any more, so they are deleted once at startup instead of being left behind.
 *
 * The spellings are the canonical ones from `browser-storage-keys.data.ts` and must not change:
 * a different spelling would delete nothing.
 */
export const DRIVE_SYNC_METADATA_KEY = 'driveSyncMetadata';
export const GOOGLE_ACCOUNT_SESSION_KEY = 'optc_google_account_session';
export const SOCIAL_LOGIN_OAUTH_STATE_KEY = 'social_login_oauth_pending';

@Injectable({ providedIn: 'root' })
export class RetiredGoogleStorageService {
  public constructor(private readonly preferences: PreferencesAdapterService) {}

  /** Never throws: a key that cannot be removed is no reason to stop the app starting. */
  public async init(): Promise<void> {
    const storage = this.getLocalStorage();

    try {
      storage?.removeItem(GOOGLE_ACCOUNT_SESSION_KEY);
      storage?.removeItem(SOCIAL_LOGIN_OAUTH_STATE_KEY);
    } catch {
      // Blocked or unavailable storage holds nothing this could remove.
    }

    try {
      await this.preferences.remove({ key: DRIVE_SYNC_METADATA_KEY });
    } catch {
      // Same: the app starts whether or not the old bookkeeping could be deleted.
    }
  }

  private getLocalStorage(): Storage | null {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }
}

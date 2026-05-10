import { Inject, Injectable, computed, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  SocialLogin,
  type GoogleLoginResponseOnline,
  type GoogleLoginOptions,
} from '@capgo/capacitor-social-login';

import { APP_SYNC_CONFIG, type AppSyncConfig } from '../sync/app-sync.config';

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_DEFAULT_SCOPES = ['email', 'profile', GOOGLE_DRIVE_SCOPE];

export interface GoogleAccountProfile {
  email: string | null;
  familyName: string | null;
  givenName: string | null;
  id: string;
  imageUrl: string | null;
  name: string | null;
}

export type GoogleAccountStatus =
  | 'initializing'
  | 'reconnect-required'
  | 'signed-in'
  | 'signed-out'
  | 'signing-in'
  | 'unavailable';

interface GoogleAuthorizationState {
  accessToken: string;
  idToken: string | null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const tokenParts = token.split('.');

  if (tokenParts.length < 2) {
    return null;
  }

  try {
    const normalizedPayload = tokenParts[1]?.replace(/-/g, '+').replace(/_/g, '/');

    if (!normalizedPayload) {
      return null;
    }

    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    const decodedPayload =
      typeof globalThis.atob === 'function' ? globalThis.atob(paddedPayload) : null;

    if (!decodedPayload) {
      return null;
    }

    return JSON.parse(decodedPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function mapProfileFromJwt(idToken: string | null): GoogleAccountProfile | null {
  if (!idToken) {
    return null;
  }

  const payload = decodeJwtPayload(idToken);
  const id = normalizeOptionalString(payload?.['sub']);

  if (!id) {
    return null;
  }

  return {
    email: normalizeOptionalString(payload?.['email']),
    familyName: normalizeOptionalString(payload?.['family_name']),
    givenName: normalizeOptionalString(payload?.['given_name']),
    id,
    imageUrl: normalizeOptionalString(payload?.['picture']),
    name: normalizeOptionalString(payload?.['name']),
  };
}

function mapProfileFromLoginResult(result: GoogleLoginResponseOnline): GoogleAccountProfile | null {
  const id = normalizeOptionalString(result.profile.id);

  if (!id) {
    return mapProfileFromJwt(result.idToken);
  }

  return {
    email: normalizeOptionalString(result.profile.email),
    familyName: normalizeOptionalString(result.profile.familyName),
    givenName: normalizeOptionalString(result.profile.givenName),
    id,
    imageUrl: normalizeOptionalString(result.profile.imageUrl),
    name: normalizeOptionalString(result.profile.name),
  };
}

@Injectable({ providedIn: 'root' })
export class GoogleAccountService {
  public readonly lastError = signal<string | null>(null);
  public readonly profile = signal<GoogleAccountProfile | null>(null);
  public readonly sessionRevision = signal(0);
  public readonly status = signal<GoogleAccountStatus>('initializing');
  public readonly isAvailable = computed(() => this.hasPlatformConfig());
  public readonly isSignedIn = computed(() => this.status() === 'signed-in' && this.profile() !== null);
  public readonly needsReconnect = computed(() => this.status() === 'reconnect-required');

  private authorizationState: GoogleAuthorizationState | null = null;
  private initialized = false;
  private readonly readyPromise: Promise<void>;

  public constructor(@Inject(APP_SYNC_CONFIG) private readonly config: AppSyncConfig) {
    this.readyPromise = this.initialize();
  }

  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  public async ensureAccessToken(options: { interactive?: boolean } = {}): Promise<string | null> {
    await this.ready();

    if (!this.isAvailable()) {
      return null;
    }

    const authorizationState = await this.refreshAuthorizationState();

    if (authorizationState?.accessToken) {
      return authorizationState.accessToken;
    }

    if (!options.interactive) {
      this.status.set('reconnect-required');
      return null;
    }

    await this.signIn(true);

    return this.authorizationState?.accessToken ?? null;
  }

  public async refreshSession(): Promise<boolean> {
    await this.ready();

    if (!this.isAvailable()) {
      return false;
    }

    const authorizationState = await this.refreshAuthorizationState();

    if (!authorizationState) {
      return false;
    }

    this.status.set('signed-in');

    return true;
  }

  public async signIn(forcePrompt = false): Promise<GoogleAccountProfile | null> {
    await this.ready();

    if (!this.isAvailable()) {
      return null;
    }

    this.lastError.set(null);
    this.status.set('signing-in');

    try {
      const result = await SocialLogin.login({
        provider: 'google',
        options: this.buildLoginOptions(forcePrompt),
      });

      if (result.result.responseType !== 'online') {
        throw new Error('Google sign-in did not return an online session.');
      }

      const accessToken = normalizeOptionalString(result.result.accessToken?.token);
      const profile = mapProfileFromLoginResult(result.result);

      if (!accessToken || !profile) {
        throw new Error('Google sign-in did not return a usable access token.');
      }

      this.authorizationState = {
        accessToken,
        idToken: result.result.idToken,
      };
      this.profile.set(profile);
      this.status.set('signed-in');
      this.sessionRevision.update((value) => value + 1);

      return profile;
    } catch (error) {
      const message = this.resolveErrorMessage(error);

      this.authorizationState = null;
      this.profile.set(null);
      this.lastError.set(message);
      this.status.set('reconnect-required');

      throw error;
    }
  }

  public async signOut(): Promise<void> {
    await this.ready();

    if (!this.isAvailable()) {
      return;
    }

    try {
      await SocialLogin.logout({ provider: 'google' });
    } catch {
      // Ignore logout failures and clear local account state anyway.
    } finally {
      this.authorizationState = null;
      this.profile.set(null);
      this.lastError.set(null);
      this.status.set('signed-out');
      this.sessionRevision.update((value) => value + 1);
    }
  }

  private buildLoginOptions(forcePrompt: boolean): GoogleLoginOptions {
    return {
      autoSelectEnabled: !forcePrompt,
      filterByAuthorizedAccounts: false,
      forcePrompt,
      prompt: forcePrompt ? 'select_account consent' : undefined,
      scopes: [...GOOGLE_DEFAULT_SCOPES],
      style: 'standard',
    };
  }

  private getWebRedirectUrl(): string | undefined {
    if (Capacitor.getPlatform() !== 'web') {
      return undefined;
    }

    const origin = globalThis.location?.origin;

    return origin ? `${origin}/` : undefined;
  }

  private hasPlatformConfig(): boolean {
    if (Capacitor.getPlatform() === 'ios') {
      return this.config.googleIosClientId.length > 0;
    }

    return this.config.googleWebClientId.length > 0;
  }

  private async initialize(): Promise<void> {
    if (!this.isAvailable()) {
      this.status.set('unavailable');
      return;
    }

    if (!this.initialized) {
      await SocialLogin.initialize({
        google: {
          iOSClientId: this.config.googleIosClientId || undefined,
          iOSServerClientId: this.config.googleWebClientId || undefined,
          mode: 'online',
          redirectUrl: this.getWebRedirectUrl(),
          webClientId: this.config.googleWebClientId || undefined,
        },
      });
      this.initialized = true;
    }

    await this.refreshAuthorizationState();

    if (this.authorizationState?.accessToken && this.profile()) {
      this.status.set('signed-in');
      return;
    }

    if (this.status() === 'reconnect-required') {
      return;
    }

    this.status.set('signed-out');
  }

  private async refreshAuthorizationState(): Promise<GoogleAuthorizationState | null> {
    try {
      const { isLoggedIn } = await SocialLogin.isLoggedIn({ provider: 'google' });

      if (!isLoggedIn) {
        this.authorizationState = null;
        this.profile.set(null);
        this.status.set('signed-out');
        return null;
      }

      const authorizationCode = await SocialLogin.getAuthorizationCode({ provider: 'google' });
      const accessToken = normalizeOptionalString(authorizationCode.accessToken);
      const profile = mapProfileFromJwt(authorizationCode.jwt ?? null);

      if (!accessToken || !profile) {
        this.authorizationState = null;
        this.profile.set(null);
        this.status.set('reconnect-required');
        return null;
      }

      this.authorizationState = {
        accessToken,
        idToken: authorizationCode.jwt ?? null,
      };
      this.profile.set(profile);
      this.lastError.set(null);

      return this.authorizationState;
    } catch (error) {
      this.authorizationState = null;
      this.profile.set(null);
      this.lastError.set(this.resolveErrorMessage(error));
      this.status.set('reconnect-required');
      return null;
    }
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return 'Google sign-in failed.';
  }
}

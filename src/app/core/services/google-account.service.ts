import { Inject, Injectable, InjectionToken, Optional, computed, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  SocialLogin,
  type GoogleLoginResponseOnline,
  type GoogleLoginOptions,
} from '@capgo/capacitor-social-login';

import { APP_SYNC_CONFIG, type AppSyncConfig } from '../sync/app-sync.config';

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GOOGLE_DEFAULT_SCOPES = ['email', 'profile', GOOGLE_DRIVE_SCOPE];
const SOCIAL_LOGIN_OAUTH_STATE_KEY = 'social_login_oauth_pending';
// Locally remembered identity for the client-side (implicit) token flow. Google
// access tokens expire ~hourly and the web plugin wipes its own stored state when
// they do, so without this the user would be silently signed out on the next page
// load. We keep the remembered profile until an explicit signOut() so the account
// only ever disconnects on purpose. The backend-session flow does not use this key
// (its server-side refresh token is authoritative), so a stale value is inert there.
const GOOGLE_ACCOUNT_SESSION_KEY = 'optc_google_account_session';

type GoogleSocialLoginClient = Pick<
  typeof SocialLogin,
  'getAuthorizationCode' | 'initialize' | 'isLoggedIn' | 'login' | 'logout'
>;

export const GOOGLE_SOCIAL_LOGIN_CLIENT = new InjectionToken<GoogleSocialLoginClient>(
  'GOOGLE_SOCIAL_LOGIN_CLIENT',
  {
    factory: () => SocialLogin,
    providedIn: 'root',
  },
);

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

interface GoogleBackendStatusResponse {
  authenticated?: boolean;
  message?: string;
  profile?: GoogleAccountProfile | null;
  status?: 'reconnect-required' | 'signed-in' | 'signed-out';
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

    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      '=',
    );
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

function sanitizeStoredProfile(value: unknown): GoogleAccountProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeOptionalString(record['id']);

  if (!id) {
    return null;
  }

  return {
    email: normalizeOptionalString(record['email']),
    familyName: normalizeOptionalString(record['familyName']),
    givenName: normalizeOptionalString(record['givenName']),
    id,
    imageUrl: normalizeOptionalString(record['imageUrl']),
    name: normalizeOptionalString(record['name']),
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

function isGooglePopupRedirect(windowRef: Window): boolean {
  const params = new URLSearchParams(windowRef.location.hash.replace(/^#/u, ''));

  return (
    params.get('state') === 'popup' &&
    (params.has('access_token') || params.has('id_token') || params.has('error'))
  );
}

@Injectable({ providedIn: 'root' })
export class GoogleAccountService {
  public readonly lastError = signal<string | null>(null);
  public readonly profile = signal<GoogleAccountProfile | null>(null);
  public readonly sessionRevision = signal(0);
  public readonly status = signal<GoogleAccountStatus>('initializing');
  public readonly isAvailable = computed(() => this.hasPlatformConfig());
  public readonly isSignedIn = computed(
    () => this.status() === 'signed-in' && this.profile() !== null,
  );
  public readonly needsReconnect = computed(() => this.status() === 'reconnect-required');
  public readonly usesBackendSession = computed(() => this.isBackendSessionEnabled());

  private authorizationState: GoogleAuthorizationState | null = null;
  private initialized = false;
  private readonly readyPromise: Promise<void>;
  private readonly socialLogin: GoogleSocialLoginClient;

  public constructor(
    @Inject(APP_SYNC_CONFIG) private readonly config: AppSyncConfig,
    @Optional()
    @Inject(GOOGLE_SOCIAL_LOGIN_CLIENT)
    socialLogin: GoogleSocialLoginClient | null = null,
  ) {
    this.socialLogin = socialLogin ?? SocialLogin;
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

    if (this.isBackendSessionEnabled()) {
      const status = await this.refreshBackendSession();

      if (status === 'signed-in') {
        return null;
      }

      if (options.interactive) {
        await this.signIn(true);
      } else {
        this.status.set('reconnect-required');
      }

      return null;
    }

    const authorizationState = await this.refreshAuthorizationState();

    if (authorizationState?.accessToken) {
      return authorizationState.accessToken;
    }

    if (!options.interactive) {
      // Only a caller with no remembered identity gets pushed to reconnect-required;
      // a remembered account stays connected and simply reports "no token right now".
      if (!this.profile()) {
        this.status.set('reconnect-required');
      }

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

    if (this.isBackendSessionEnabled()) {
      return (await this.refreshBackendSession()) === 'signed-in';
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

    if (this.isBackendSessionEnabled()) {
      this.startBackendSignIn(forcePrompt);
      return null;
    }

    try {
      const result = await this.socialLogin.login({
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
      this.persistLocalSession(profile);
      this.status.set('signed-in');
      this.sessionRevision.update((value) => value + 1);

      return profile;
    } catch (error) {
      const message = this.resolveErrorMessage(error);

      this.authorizationState = null;

      // A cancelled or failed interactive re-auth must not visibly disconnect a
      // remembered account — keep the user connected (they can retry) so the account
      // only ever drops on an explicit signOut(). Only a first-time sign-in with no
      // remembered identity falls through to the reconnect-required state.
      if (!this.applyRememberedSession()) {
        this.profile.set(null);
        this.lastError.set(message);
        this.status.set('reconnect-required');
      }

      throw error;
    }
  }

  public async signOut(): Promise<void> {
    await this.ready();

    if (!this.isAvailable()) {
      return;
    }

    if (this.isBackendSessionEnabled()) {
      try {
        await this.fetchBackend('/auth/google/sign-out', {
          method: 'POST',
        });
      } catch {
        // Clear local account state even if the backend session has already expired.
      } finally {
        this.clearLocalSession();
        this.authorizationState = null;
        this.profile.set(null);
        this.lastError.set(null);
        this.status.set('signed-out');
        this.sessionRevision.update((value) => value + 1);
      }
      return;
    }

    try {
      await this.socialLogin.logout({ provider: 'google' });
    } catch {
      // Ignore logout failures and clear local account state anyway.
    } finally {
      this.clearLocalSession();
      this.authorizationState = null;
      this.profile.set(null);
      this.lastError.set(null);
      this.status.set('signed-out');
      this.sessionRevision.update((value) => value + 1);
    }
  }

  public requireReconnect(message: string | null = null): void {
    this.authorizationState = null;
    this.profile.set(null);
    this.lastError.set(message);
    this.status.set('reconnect-required');
    this.sessionRevision.update((value) => value + 1);
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

    return origin || undefined;
  }

  private completeGooglePopupRedirectIfNeeded(): boolean {
    if (Capacitor.getPlatform() !== 'web' || typeof window === 'undefined') {
      return false;
    }

    const windowRef = window;

    if (!isGooglePopupRedirect(windowRef)) {
      return false;
    }

    const params = new URLSearchParams(windowRef.location.hash.replace(/^#/u, ''));
    const pendingState = this.readPendingPopupState();

    if (!windowRef.opener && !pendingState?.nonce) {
      return false;
    }

    const message = this.buildPopupRedirectMessage(params);

    if (!message) {
      return false;
    }

    try {
      windowRef.opener?.postMessage(message, windowRef.location.origin);
    } catch {
      // BroadcastChannel below handles same-origin popup delivery when opener is unavailable.
    }

    if (pendingState?.nonce && typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel(`google_oauth_${pendingState.nonce}`);
        channel.postMessage(message);
        channel.close();
      } catch {
        // If BroadcastChannel is blocked, the opener postMessage path may still succeed.
      }
    }

    try {
      windowRef.localStorage.removeItem(SOCIAL_LOGIN_OAUTH_STATE_KEY);
    } catch {
      // Ignore storage failures during popup shutdown.
    }

    try {
      windowRef.close();
    } catch {
      // Some browsers may refuse to close windows they do not consider script-opened.
    }

    return true;
  }

  private hasPlatformConfig(): boolean {
    if (this.isBackendSessionEnabled()) {
      return true;
    }

    if (Capacitor.getPlatform() === 'ios') {
      return this.config.googleIosClientId.length > 0;
    }

    return this.config.googleWebClientId.length > 0;
  }

  private async initialize(): Promise<void> {
    if (this.completeGooglePopupRedirectIfNeeded()) {
      return;
    }

    if (!this.isAvailable()) {
      this.status.set('unavailable');
      return;
    }

    if (this.isBackendSessionEnabled()) {
      await this.refreshBackendSession();
      return;
    }

    if (!this.initialized) {
      await this.socialLogin.initialize({
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

    // The access token has expired (it lives ~1 hour), but a remembered profile
    // means the user connected before and never signed out — keep them connected
    // and mint a fresh token lazily the next time a Drive action needs one.
    if (this.profile()) {
      this.status.set('signed-in');
      return;
    }

    if (this.status() === 'reconnect-required') {
      return;
    }

    this.status.set('signed-out');
  }

  private isBackendSessionEnabled(): boolean {
    return Capacitor.getPlatform() === 'web' && this.getBackendUrl().length > 0;
  }

  private async refreshBackendSession(): Promise<GoogleAccountStatus> {
    try {
      const response = await this.fetchBackend('/auth/google/status');
      const statusResponse = (await response.json()) as GoogleBackendStatusResponse;

      if (!statusResponse.authenticated || statusResponse.status === 'signed-out') {
        this.authorizationState = null;
        this.profile.set(null);
        this.status.set('signed-out');
        this.lastError.set(null);
        return 'signed-out';
      }

      if (statusResponse.status === 'reconnect-required') {
        this.authorizationState = null;
        this.profile.set(statusResponse.profile ?? null);
        this.status.set('reconnect-required');
        this.lastError.set(statusResponse.message ?? 'Google Drive reconnect required.');
        return 'reconnect-required';
      }

      if (statusResponse.profile) {
        this.authorizationState = null;
        this.profile.set(statusResponse.profile);
        this.status.set('signed-in');
        this.lastError.set(null);
        return 'signed-in';
      }

      this.authorizationState = null;
      this.profile.set(null);
      this.status.set('signed-out');
      return 'signed-out';
    } catch (error) {
      this.authorizationState = null;
      this.profile.set(null);
      this.status.set('reconnect-required');
      this.lastError.set(this.resolveErrorMessage(error));
      return 'reconnect-required';
    }
  }

  private startBackendSignIn(forcePrompt: boolean): void {
    const startUrl = this.buildBackendUrl('/auth/google/start');
    const returnTo = globalThis.location?.href ?? globalThis.location?.origin ?? '/';

    startUrl.searchParams.set('return_to', returnTo);

    if (forcePrompt) {
      startUrl.searchParams.set('force', '1');
    }

    globalThis.location.assign(startUrl.toString());
  }

  private async fetchBackend(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);

    if (init.body) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(this.buildBackendUrl(path), {
      ...init,
      credentials: 'include',
      headers,
    });

    if (response.ok) {
      return response;
    }

    throw new Error(await this.readBackendError(response));
  }

  private buildBackendUrl(path: string): URL {
    return new URL(path, `${this.getBackendUrl()}/`);
  }

  private getBackendUrl(): string {
    return this.config.googleDriveBackendUrl ?? '';
  }

  private async readBackendError(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { message?: unknown };
      const message = normalizeOptionalString(payload.message);

      if (message) {
        return message;
      }
    } catch {
      // Fall through to a generic message below.
    }

    return `Google Drive backend request failed with ${response.status}.`;
  }

  private async refreshAuthorizationState(): Promise<GoogleAuthorizationState | null> {
    try {
      const { isLoggedIn } = await this.socialLogin.isLoggedIn({ provider: 'google' });

      if (!isLoggedIn) {
        this.authorizationState = null;

        // The web plugin returns false (and discards its own token) once the access
        // token expires. Never treat that as a sign-out when we still remember the
        // account — only an explicit signOut() clears the remembered profile.
        if (this.applyRememberedSession()) {
          return null;
        }

        this.profile.set(null);
        this.status.set('signed-out');
        return null;
      }

      const authorizationCode = await this.socialLogin.getAuthorizationCode({ provider: 'google' });
      const accessToken = normalizeOptionalString(authorizationCode.accessToken);
      const profile = mapProfileFromJwt(authorizationCode.jwt ?? null);

      if (!accessToken || !profile) {
        this.authorizationState = null;

        if (this.applyRememberedSession()) {
          return null;
        }

        this.profile.set(null);
        this.status.set('reconnect-required');
        return null;
      }

      this.authorizationState = {
        accessToken,
        idToken: authorizationCode.jwt ?? null,
      };
      this.profile.set(profile);
      this.persistLocalSession(profile);
      this.lastError.set(null);

      return this.authorizationState;
    } catch (error) {
      this.authorizationState = null;

      // A network hiccup while validating the token (e.g. the tokeninfo call) must
      // not sign a remembered user out either.
      if (this.applyRememberedSession()) {
        return null;
      }

      this.profile.set(null);
      this.lastError.set(this.resolveErrorMessage(error));
      this.status.set('reconnect-required');
      return null;
    }
  }

  private applyRememberedSession(): boolean {
    const remembered = this.loadLocalSession();

    if (!remembered) {
      return false;
    }

    this.profile.set(remembered);
    this.status.set('signed-in');
    this.lastError.set(null);

    return true;
  }

  private getLocalStorage(): Storage | null {
    try {
      if (typeof window === 'undefined') {
        return null;
      }

      return window.localStorage ?? null;
    } catch {
      return null;
    }
  }

  private persistLocalSession(profile: GoogleAccountProfile): void {
    const storage = this.getLocalStorage();

    if (!storage) {
      return;
    }

    try {
      storage.setItem(GOOGLE_ACCOUNT_SESSION_KEY, JSON.stringify({ profile }));
    } catch {
      // Ignore storage quota or privacy-mode failures; remembering is best-effort.
    }
  }

  private loadLocalSession(): GoogleAccountProfile | null {
    const storage = this.getLocalStorage();

    if (!storage) {
      return null;
    }

    try {
      const rawSession = storage.getItem(GOOGLE_ACCOUNT_SESSION_KEY);

      if (!rawSession) {
        return null;
      }

      const parsedSession = JSON.parse(rawSession) as { profile?: unknown };

      return sanitizeStoredProfile(parsedSession?.profile);
    } catch {
      return null;
    }
  }

  private clearLocalSession(): void {
    const storage = this.getLocalStorage();

    if (!storage) {
      return;
    }

    try {
      storage.removeItem(GOOGLE_ACCOUNT_SESSION_KEY);
    } catch {
      // Ignore storage failures; the in-memory state is already cleared by callers.
    }
  }

  private resolveErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return 'Google sign-in failed.';
  }

  private readPendingPopupState(): { nonce?: string } | null {
    try {
      const rawState = window.localStorage.getItem(SOCIAL_LOGIN_OAUTH_STATE_KEY);

      if (!rawState) {
        return null;
      }

      const parsedState = JSON.parse(rawState) as Record<string, unknown>;
      const nonce = normalizeOptionalString(parsedState['nonce']);

      return nonce ? { nonce } : {};
    } catch {
      return null;
    }
  }

  private buildPopupRedirectMessage(params: URLSearchParams): Record<string, unknown> | null {
    const error = params.get('error');

    if (error) {
      return {
        error: params.get('error_description') || error,
        provider: 'google',
        type: 'oauth-error',
      };
    }

    const accessToken = normalizeOptionalString(params.get('access_token'));
    const idToken = normalizeOptionalString(params.get('id_token'));
    const profile = mapProfileFromJwt(idToken);

    if (!accessToken || !idToken || !profile) {
      return null;
    }

    return {
      accessToken: {
        token: accessToken,
      },
      idToken,
      profile,
      provider: 'google',
      responseType: 'online',
      type: 'oauth-response',
    };
  }
}

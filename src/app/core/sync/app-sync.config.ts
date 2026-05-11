import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';

export interface AppSyncConfig {
  googleDriveBackendUrl?: string;
  googleDriveFolderName: string;
  googleIosClientId: string;
  googleWebClientId: string;
}

function normalizeGoogleClientId(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const normalizedValue = value.trim();

  return /^[0-9]+[-a-z0-9_]*\.apps\.googleusercontent\.com$/i.test(normalizedValue)
    ? normalizedValue
    : '';
}

function normalizeDriveFolderName(value: unknown): string {
  if (typeof value !== 'string') {
    return 'OPTC Team Builder';
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : 'OPTC Team Builder';
}

function normalizeOptionalUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return '';
  }

  try {
    const url = new URL(normalizedValue);

    return url.origin;
  } catch {
    return '';
  }
}

function resolveAppSyncConfig(document: Document): AppSyncConfig {
  return {
    googleDriveBackendUrl: normalizeOptionalUrl(
      document.defaultView?.__appConfig?.googleDriveBackendUrl,
    ),
    googleDriveFolderName: normalizeDriveFolderName(
      document.defaultView?.__appConfig?.googleDriveFolderName,
    ),
    googleIosClientId: normalizeGoogleClientId(
      document.defaultView?.__appConfig?.googleIosClientId,
    ),
    googleWebClientId: normalizeGoogleClientId(
      document.defaultView?.__appConfig?.googleWebClientId,
    ),
  };
}

export const APP_SYNC_CONFIG = new InjectionToken<AppSyncConfig>('APP_SYNC_CONFIG', {
  providedIn: 'root',
  factory: () => resolveAppSyncConfig(inject(DOCUMENT)),
});

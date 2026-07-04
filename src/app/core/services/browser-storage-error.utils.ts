export type BrowserStorageFailureCode =
  | 'BROWSER_STORAGE_QUOTA_EXCEEDED'
  | 'BROWSER_STORAGE_UNAVAILABLE';

export interface BrowserStorageFailureDiagnostic {
  code: BrowserStorageFailureCode;
  recoveryKey: string;
}

const BROWSER_STORAGE_FAILURE_DIAGNOSTICS: Record<
  BrowserStorageFailureCode,
  BrowserStorageFailureDiagnostic
> = {
  BROWSER_STORAGE_QUOTA_EXCEEDED: {
    code: 'BROWSER_STORAGE_QUOTA_EXCEEDED',
    recoveryKey: 'storageFailures.recovery.quota',
  },
  BROWSER_STORAGE_UNAVAILABLE: {
    code: 'BROWSER_STORAGE_UNAVAILABLE',
    recoveryKey: 'storageFailures.recovery.unavailable',
  },
};

export class BrowserStoragePersistenceError extends Error {
  public readonly diagnostic: BrowserStorageFailureDiagnostic;
  public readonly diagnosticCode: BrowserStorageFailureCode;
  public readonly key: string;
  public readonly originalError: unknown;

  public constructor(code: BrowserStorageFailureCode, cause?: unknown) {
    super(code);
    this.name = 'BrowserStoragePersistenceError';
    this.originalError = cause;
    this.diagnostic = BROWSER_STORAGE_FAILURE_DIAGNOSTICS[code];
    this.diagnosticCode = this.diagnostic.code;
    this.key =
      code === 'BROWSER_STORAGE_QUOTA_EXCEEDED'
        ? 'storageFailures.errors.quota'
        : 'storageFailures.errors.unavailable';
  }
}

export function classifyBrowserStorageFailure(
  error: unknown,
): BrowserStorageFailureCode | null {
  if (error instanceof DOMException) {
    if (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    ) {
      return 'BROWSER_STORAGE_QUOTA_EXCEEDED';
    }

    if (error.name === 'SecurityError' || error.name === 'InvalidStateError') {
      return 'BROWSER_STORAGE_UNAVAILABLE';
    }
  }

  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase();

    if (normalizedMessage.includes('quota')) {
      return 'BROWSER_STORAGE_QUOTA_EXCEEDED';
    }

    if (
      normalizedMessage.includes('storage') ||
      normalizedMessage.includes('access is denied')
    ) {
      return 'BROWSER_STORAGE_UNAVAILABLE';
    }
  }

  return null;
}

export function toBrowserStoragePersistenceError(
  error: unknown,
): BrowserStoragePersistenceError | null {
  const code = classifyBrowserStorageFailure(error);

  return code ? new BrowserStoragePersistenceError(code, error) : null;
}

export function resolveBrowserStorageFailureDiagnostic(
  error: unknown,
): BrowserStorageFailureDiagnostic | null {
  return error instanceof BrowserStoragePersistenceError ? error.diagnostic : null;
}

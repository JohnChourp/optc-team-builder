import { expect, vi, type Mock } from 'vitest';

type UrlBlobStatics = typeof URL & {
  createObjectURL?: (object: Blob | MediaSource) => string;
  revokeObjectURL?: (url: string) => void;
};

export interface JsonDownloadCapture {
  createObjectURL: Mock<(object: Blob | MediaSource) => string>;
  revokeObjectURL: Mock<(url: string) => void>;
}

const urlBlobStatics = URL as UrlBlobStatics;
const originalCreateObjectURL = urlBlobStatics.createObjectURL;
const originalRevokeObjectURL = urlBlobStatics.revokeObjectURL;

export function captureJsonDownloads(): JsonDownloadCapture {
  const createObjectURL = vi.fn<(object: Blob | MediaSource) => string>(
    () => 'blob:captured-download',
  );
  const revokeObjectURL = vi.fn<(url: string) => void>();

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: createObjectURL,
    writable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: revokeObjectURL,
    writable: true,
  });

  return {
    createObjectURL,
    revokeObjectURL,
  };
}

export function restoreJsonDownloadCapture(): void {
  restoreUrlStatic('createObjectURL', originalCreateObjectURL);
  restoreUrlStatic('revokeObjectURL', originalRevokeObjectURL);
}

export async function readJsonDownloadPayload<T = unknown>(
  capture: JsonDownloadCapture,
  index = 0,
): Promise<T> {
  const blob = capture.createObjectURL.mock.calls[index]?.[0] as Blob | undefined;

  expect(blob).toBeTruthy();
  expect(typeof blob?.text).toBe('function');

  return JSON.parse(await blob!.text()) as T;
}

function restoreUrlStatic<Key extends keyof UrlBlobStatics>(
  key: Key,
  originalValue: UrlBlobStatics[Key],
): void {
  if (originalValue) {
    Object.defineProperty(URL, key, {
      configurable: true,
      value: originalValue,
      writable: true,
    });
    return;
  }

  delete (URL as UrlBlobStatics)[key];
}

/** Why a clipboard write failed, in words the feedback can use without the raw exception text. */
export type ClipboardFailureKind =
  'insecureContext' | 'permissionDenied' | 'unavailable' | 'unknown';

/**
 * Writes text to the clipboard. Resolves `null` once the text is there, or the reason it is not,
 * so every caller can offer the same manual-copy fallback. Saved Teams and Auto Team Builder's
 * debug report both copy through here.
 */
export async function copyTextToClipboard(text: string): Promise<ClipboardFailureKind | null> {
  try {
    const clipboard = globalThis.navigator?.clipboard;

    if (!clipboard?.writeText) {
      throw new Error('Clipboard API unavailable');
    }

    await clipboard.writeText(text);
    return null;
  } catch (error) {
    return resolveClipboardFailureKind(error);
  }
}

export function resolveClipboardFailureKind(error: Error | unknown): ClipboardFailureKind {
  if (globalThis.isSecureContext === false) {
    return 'insecureContext';
  }

  const errorName = error && typeof error === 'object' && 'name' in error ? error.name : null;

  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return 'permissionDenied';
  }

  const clipboard = globalThis.navigator?.clipboard;

  if (!clipboard?.writeText) {
    return 'unavailable';
  }

  return 'unknown';
}

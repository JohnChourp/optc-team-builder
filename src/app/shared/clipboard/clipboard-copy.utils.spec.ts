import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyTextToClipboard } from './clipboard-copy.utils';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves null once the text is written', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('report')).resolves.toBeNull();
    expect(writeText).toHaveBeenCalledWith('report');
  });

  it('names why the text could not be written', async () => {
    const refuse = (name: string) =>
      vi.fn().mockRejectedValue(Object.assign(new Error(name), { name }));

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {});
    await expect(copyTextToClipboard('report')).resolves.toBe('unavailable');

    vi.stubGlobal('navigator', { clipboard: { writeText: refuse('NotAllowedError') } });
    await expect(copyTextToClipboard('report')).resolves.toBe('permissionDenied');

    vi.stubGlobal('navigator', { clipboard: { writeText: refuse('SecurityError') } });
    await expect(copyTextToClipboard('report')).resolves.toBe('permissionDenied');

    vi.stubGlobal('navigator', { clipboard: { writeText: refuse('DataError') } });
    await expect(copyTextToClipboard('report')).resolves.toBe('unknown');

    // An insecure page is the reason whatever the browser threw.
    vi.stubGlobal('isSecureContext', false);
    await expect(copyTextToClipboard('report')).resolves.toBe('insecureContext');
  });
});

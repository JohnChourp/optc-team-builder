import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { NativeUpdateService } from './native-update.service';

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn(),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

function createService(options?: {
  native?: boolean;
  currentVersion?: string;
  latest?: { tag_name?: string; html_url?: string } | null;
  ok?: boolean;
}) {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(options?.native ?? true);
  (App.getInfo as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    version: options?.currentVersion ?? '1.0.0',
  });

  const open = vi.fn();
  const fetch = vi.fn().mockResolvedValue({
    ok: options?.ok ?? true,
    json: async () =>
      options?.latest ?? {
        tag_name: 'v1.1.0',
        html_url: 'https://github.com/JohnChourp/optc-team-builder/releases/tag/v1.1.0',
      },
  });
  const documentStub = { defaultView: { fetch, open } } as unknown as Document;

  const service = new NativeUpdateService(documentStub);

  return { service, open, fetch };
}

describe('NativeUpdateService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    // restore (not just clear) so the `Capacitor.isNativePlatform` spy this spec
    // installs does not leak `isNativePlatform → true` into sibling spec files
    // (e.g. app.component's browser-install-banner tests) under the shared
    // Angular unit-test builder.
    vi.restoreAllMocks();
  });

  it('stays inert on web platforms', () => {
    const { service, fetch } = createService({ native: false });

    service.init();

    expect(fetch).not.toHaveBeenCalled();
    expect(service.availableUpdate()).toBeNull();
  });

  it('flags an update when the latest release is newer than the running version', async () => {
    const { service } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.2.0', html_url: 'https://rel/1.2.0' },
    });

    await service.check();

    expect(service.availableUpdate()).toEqual({ version: '1.2.0', url: 'https://rel/1.2.0' });
  });

  it('ignores releases that are not newer', async () => {
    const { service } = createService({
      currentVersion: '2.0.0',
      latest: { tag_name: 'v1.9.9', html_url: 'https://rel/1.9.9' },
    });

    await service.check();

    expect(service.availableUpdate()).toBeNull();
  });

  it('ignores a non-ok GitHub response', async () => {
    const { service } = createService({ currentVersion: '1.0.0', ok: false });

    await service.check();

    expect(service.availableUpdate()).toBeNull();
  });

  it('opens the release download page for the pending update', async () => {
    const { service, open } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.1.0', html_url: 'https://rel/1.1.0' },
    });

    await service.check();
    service.openReleasePage();

    expect(open).toHaveBeenCalledWith('https://rel/1.1.0', '_blank');
  });

  it('snoozes and re-surfaces the same pending update after the interval', async () => {
    const { service } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.1.0', html_url: 'https://rel/1.1.0' },
    });

    await service.check();
    expect(service.availableUpdate()).not.toBeNull();

    service.snooze();
    expect(service.availableUpdate()).toBeNull();

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(service.availableUpdate()?.version).toBe('1.1.0');
  });

  it('keeps a snoozed update hidden when a later poll finds the same version', async () => {
    const { service } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.1.0', html_url: 'https://rel/1.1.0' },
    });

    await service.check();
    service.snooze();
    expect(service.availableUpdate()).toBeNull();

    await service.check();
    expect(service.availableUpdate()).toBeNull();
  });

  it('overrides an active snooze when an even newer version appears', async () => {
    const { service, fetch } = createService({
      currentVersion: '1.0.0',
      latest: { tag_name: 'v1.1.0', html_url: 'https://rel/1.1.0' },
    });

    await service.check();
    service.snooze();
    expect(service.availableUpdate()).toBeNull();

    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v1.2.0', html_url: 'https://rel/1.2.0' }),
    });

    await service.check();
    expect(service.availableUpdate()).toEqual({ version: '1.2.0', url: 'https://rel/1.2.0' });
  });
});

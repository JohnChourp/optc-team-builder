import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoragePersistenceService } from './storage-persistence.service';

/**
 * 869f17haa. A storage hint must never be able to fail startup, so most of these
 * assert that it stays quiet rather than that it succeeds.
 *
 * No TestBed: the service injects nothing, and page specs here run without one.
 */

function withStorage(storage: unknown) {
  vi.stubGlobal('navigator', storage === undefined ? {} : { storage });
}

describe('StoragePersistenceService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks the browser to persist when nothing has yet', async () => {
    const persist = vi.fn().mockResolvedValue(true);

    withStorage({ persisted: vi.fn().mockResolvedValue(false), persist });

    await expect(new StoragePersistenceService().requestPersistence()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  /* Asking again when it is already granted is a wasted call, not a harmless one. */
  it('does not ask again when storage is already persisted', async () => {
    const persist = vi.fn();

    withStorage({ persisted: vi.fn().mockResolvedValue(true), persist });

    await expect(new StoragePersistenceService().requestPersistence()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  /*
   * The measured case. `persist()` returns false on both WebKit and Chromium in a
   * context with no engagement signal, and that is a normal answer rather than a
   * failure - the app reports it and carries on.
   */
  it('reports a refusal without treating it as an error', async () => {
    withStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    });

    await expect(new StoragePersistenceService().requestPersistence()).resolves.toBe(false);
  });

  it('returns null when the Storage API is absent', async () => {
    withStorage(undefined);

    await expect(new StoragePersistenceService().requestPersistence()).resolves.toBeNull();
  });

  it('returns null when the API exists but has no persist()', async () => {
    withStorage({ persisted: vi.fn().mockResolvedValue(false) });

    await expect(new StoragePersistenceService().requestPersistence()).resolves.toBeNull();
  });

  /* A rejected hint must not reach the app initializer as a rejection. */
  it('swallows a rejection rather than failing startup', async () => {
    withStorage({
      persisted: vi.fn().mockRejectedValue(new Error('SecurityError')),
      persist: vi.fn(),
    });

    await expect(new StoragePersistenceService().requestPersistence()).resolves.toBeNull();
  });

  /*
   * Prerender builds 4,619 character pages with no browser globals at all. An
   * unguarded `navigator` read there fails the build, not the browser.
   */
  it('survives a context with no navigator, which is how prerender runs', async () => {
    vi.stubGlobal('navigator', undefined);

    await expect(new StoragePersistenceService().requestPersistence()).resolves.toBeNull();
  });
});

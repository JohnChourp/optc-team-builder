import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { type VersionEvent } from '@angular/service-worker';

import { AppUpdateService } from './app-update.service';

function createService(options?: { isEnabled?: boolean; hasUpdate?: boolean }) {
  const versionUpdates = new Subject<VersionEvent>();
  const swUpdate = {
    isEnabled: options?.isEnabled ?? true,
    versionUpdates,
    checkForUpdate: vi.fn().mockResolvedValue(options?.hasUpdate ?? false),
    activateUpdate: vi.fn().mockResolvedValue(true),
  };
  const reload = vi.fn();
  const documentStub = {
    defaultView: { location: { reload } },
  } as unknown as Document;

  const service = new AppUpdateService(swUpdate as never, documentStub);

  return { service, swUpdate, versionUpdates, reload };
}

function versionReadyEvent(): VersionEvent {
  return {
    type: 'VERSION_READY',
    currentVersion: { hash: 'old' },
    latestVersion: { hash: 'new' },
  } as VersionEvent;
}

describe('AppUpdateService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('stays inert and never polls when the service worker is disabled', () => {
    const { service, swUpdate } = createService({ isEnabled: false });

    service.init();

    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    expect(service.updateAvailable()).toBe(false);
  });

  it('marks an update available on a VERSION_READY event', () => {
    const { service, versionUpdates } = createService();

    service.init();
    expect(service.updateAvailable()).toBe(false);

    versionUpdates.next(versionReadyEvent());

    expect(service.updateAvailable()).toBe(true);
  });

  it('does not eagerly check on init but marks an update when a later poll finds one', async () => {
    const { service, swUpdate } = createService({ hasUpdate: true });

    service.init();
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    expect(service.updateAvailable()).toBe(false);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(swUpdate.checkForUpdate).toHaveBeenCalled();
    expect(service.updateAvailable()).toBe(true);
  });

  it('activates the pending version and reloads when applying the update', async () => {
    const { service, swUpdate, reload } = createService();

    await service.applyUpdate();

    expect(swUpdate.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('still reloads even if activating the update fails', async () => {
    const { service, swUpdate, reload } = createService();
    swUpdate.activateUpdate.mockRejectedValueOnce(new Error('boom'));

    await service.applyUpdate();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('hides the prompt when snoozed and re-surfaces it after the interval', () => {
    const { service, versionUpdates } = createService();

    service.init();
    versionUpdates.next(versionReadyEvent());
    expect(service.updateAvailable()).toBe(true);

    service.snooze();
    expect(service.updateAvailable()).toBe(false);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(service.updateAvailable()).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { ToolbarBackNavigationService } from './toolbar-back-navigation.service';

describe('ToolbarBackNavigationService', () => {
  it('uses real back navigation when a previous in-app route exists', async () => {
    const { service, locationStub, routerStub } = createService();

    service.recordNavigation('/tabs/characters');
    service.recordNavigation('/tabs/privacy');

    await service.goBackOrFallback();

    expect(locationStub.back).toHaveBeenCalledOnce();
    expect(routerStub.navigateByUrl).not.toHaveBeenCalled();
  });

  it('falls back to the characters page when opened directly', async () => {
    const { service, locationStub, routerStub } = createService();

    service.recordNavigation('/tabs/privacy');

    await service.goBackOrFallback();

    expect(locationStub.back).not.toHaveBeenCalled();
    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/tabs/characters', {
      replaceUrl: true,
    });
  });

  it('uses replaceUrl when navigating to a custom fallback route', async () => {
    const { service, routerStub } = createService();

    await service.goBackOrFallback('/tabs/saved-teams');

    expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/tabs/saved-teams', {
      replaceUrl: true,
    });
  });

  it('pops nested history in order when backing through multiple inner pages', async () => {
    const { service, locationStub, routerStub } = createService();

    service.recordNavigation('/tabs/characters');
    service.recordNavigation('/characters/101');
    service.recordNavigation('/characters/101/edit');

    await service.goBackOrFallback();
    expect(locationStub.back).toHaveBeenCalledOnce();
    service.recordNavigation('/characters/101');

    await service.goBackOrFallback();

    expect(locationStub.back).toHaveBeenCalledTimes(2);
    expect(routerStub.navigateByUrl).not.toHaveBeenCalled();
  });
});

function createService() {
  const locationStub = {
    back: vi.fn(),
  };
  const routerStub = {
    navigateByUrl: vi.fn().mockResolvedValue(true),
  };

  return {
    service: new ToolbarBackNavigationService(locationStub as never, routerStub as never),
    locationStub,
    routerStub,
  };
}

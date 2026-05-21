import "@angular/compiler";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsConsentService } from "./analytics-consent.service";
import { type PreferencesAdapterService } from "./preferences-adapter.service";

describe("AnalyticsConsentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to unknown consent when nothing valid is stored", async () => {
    const { service, analytics } = createService(null);

    await service.ready();

    expect(service.consent()).toBe("unknown");
    expect(service.hasAnsweredConsent()).toBe(false);
    expect(analytics.disable).toHaveBeenCalledOnce();
  });

  it("hydrates accepted consent and enables analytics", async () => {
    const { service, analytics } = createService("accepted");

    await service.ready();

    expect(service.consent()).toBe("accepted");
    expect(service.canTrack()).toBe(true);
    expect(analytics.enable).toHaveBeenCalledOnce();
  });

  it("hydrates rejected consent and keeps analytics disabled", async () => {
    const { service, analytics } = createService("rejected");

    await service.ready();

    expect(service.consent()).toBe("rejected");
    expect(service.canTrack()).toBe(false);
    expect(analytics.disable).toHaveBeenCalledOnce();
  });

  it("persists acceptance and enables analytics", async () => {
    const { service, analytics, preferences } = createService(null);

    await service.ready();
    await service.accept();

    expect(service.consent()).toBe("accepted");
    expect(preferences.set).toHaveBeenLastCalledWith({
      key: "analyticsConsent",
      value: "accepted",
    });
    expect(analytics.enable).toHaveBeenCalledOnce();
  });

  it("persists rejection and disables analytics", async () => {
    const { service, analytics, preferences } = createService("accepted");

    await service.ready();
    await service.reject();

    expect(service.consent()).toBe("rejected");
    expect(preferences.set).toHaveBeenLastCalledWith({
      key: "analyticsConsent",
      value: "rejected",
    });
    expect(analytics.disable).toHaveBeenCalledOnce();
  });
});

function createService(storedConsent: string | null) {
  const analytics = {
    enable: vi.fn(),
    disable: vi.fn(),
  };

  const preferences = {
    get: vi.fn().mockResolvedValue({ value: storedConsent }),
    set: vi.fn().mockResolvedValue(undefined),
  } satisfies PreferencesAdapterService;

  const service = new AnalyticsConsentService(
    analytics as never,
    preferences as unknown as PreferencesAdapterService,
  );

  return {
    service,
    analytics,
    preferences,
  };
}

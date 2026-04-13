import "@angular/compiler";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Preferences } from "@capacitor/preferences";

import { AnalyticsConsentService } from "./analytics-consent.service";

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

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
    const { service, analytics } = createService(null);

    await service.ready();
    await service.accept();

    expect(service.consent()).toBe("accepted");
    expect(vi.mocked(Preferences.set)).toHaveBeenLastCalledWith({
      key: "analyticsConsent",
      value: "accepted",
    });
    expect(analytics.enable).toHaveBeenCalledOnce();
  });

  it("persists rejection and disables analytics", async () => {
    const { service, analytics } = createService("accepted");

    await service.ready();
    await service.reject();

    expect(service.consent()).toBe("rejected");
    expect(vi.mocked(Preferences.set)).toHaveBeenLastCalledWith({
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

  vi.mocked(Preferences.get).mockResolvedValue({
    value: storedConsent,
  });
  vi.mocked(Preferences.set).mockResolvedValue();

  const service = new AnalyticsConsentService(analytics as never);

  return {
    service,
    analytics,
  };
}

import "@angular/compiler";
import { signal } from "@angular/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";

import { NavigationEnd } from "@angular/router";

import { type AnalyticsConsentState } from "./core/services/analytics-consent.service";

let routerStub: {
  events: Subject<unknown>;
  navigated: boolean;
  url: string;
};
let analyticsConsentStub: {
  accept: ReturnType<typeof vi.fn>;
  consent: ReturnType<typeof signal>;
  reject: ReturnType<typeof vi.fn>;
};
let analyticsStub: {
  trackPageView: ReturnType<typeof vi.fn>;
};

vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: vi.fn().mockResolvedValue({
      version: "9.9.9",
    }),
  },
}));

vi.mock("@ionic/angular/standalone", () => ({
  IonApp: class {},
  IonButton: class {},
  IonRouterOutlet: class {},
}));

vi.mock("@jsverse/transloco", () => ({
  TranslocoPipe: class {},
}));

vi.mock("@angular/core/rxjs-interop", () => ({
  takeUntilDestroyed: () => (source: unknown) => source,
}));

vi.mock("@angular/core", async () => {
  const actual = await vi.importActual<typeof import("@angular/core")>("@angular/core");

  return {
    ...actual,
    inject: (token: { name?: string }) => {
      switch (token.name) {
        case "DestroyRef":
          return {};
        case "Router":
          return routerStub;
        case "AnalyticsConsentService":
          return analyticsConsentStub;
        case "GoogleAnalyticsService":
          return analyticsStub;
        default:
          throw new Error(`Unexpected inject token: ${token.name ?? "unknown"}`);
      }
    },
  };
});

describe("AppComponent", () => {
  beforeEach(() => {
    routerStub = {
      url: "/tabs/characters",
      navigated: false,
      events: new Subject<unknown>(),
    };
    analyticsConsentStub = createAnalyticsConsentStub("unknown");
    analyticsStub = {
      trackPageView: vi.fn(),
    };
  });

  afterEach(() => {
    routerStub.events.complete();
    vi.clearAllMocks();
  });

  it("renders the analytics consent banner actions in the template", () => {
    const template = readFileSync(resolve(process.cwd(), "src/app/app.component.ts"), "utf8");

    expect(template).toContain('"analyticsConsent.banner.title" | transloco');
    expect(template).toContain('(click)="acceptAnalyticsConsent()"');
    expect(template).toContain('(click)="rejectAnalyticsConsent()"');
    expect(template).toContain("[routerLink]=\"['/tabs/privacy']\"");
    expect(template).toContain("[routerLink]=\"['/tabs/cookies']\"");
    expect(template).toContain('"legalNav.privacy" | transloco');
    expect(template).toContain('"legalNav.cookies" | transloco');
  });

  it("shows the banner while consent is unknown and hides it after acceptance", async () => {
    const { AppComponent } = await import("./app.component");
    const component = new AppComponent();

    expect(component.showAnalyticsConsentBanner()).toBe(true);

    await component.acceptAnalyticsConsent();

    expect(component.showAnalyticsConsentBanner()).toBe(false);
    expect(analyticsConsentStub.accept).toHaveBeenCalledOnce();
    expect(analyticsStub.trackPageView).toHaveBeenCalledWith("/tabs/characters");
  });

  it("tracks navigation events only when consent is accepted", async () => {
    analyticsConsentStub = createAnalyticsConsentStub("accepted");
    const { AppComponent } = await import("./app.component");
    new AppComponent();

    routerStub.events.next(new NavigationEnd(1, "/tabs/settings", "/tabs/settings"));
    expect(analyticsStub.trackPageView).toHaveBeenCalledWith("/tabs/settings");

    analyticsStub.trackPageView.mockClear();
    analyticsConsentStub = createAnalyticsConsentStub("rejected");
    routerStub = {
      url: "/tabs/saved-teams",
      navigated: false,
      events: new Subject<unknown>(),
    };
    const anotherComponent = new AppComponent();

    routerStub.events.next(new NavigationEnd(2, "/tabs/saved-teams", "/tabs/saved-teams"));

    expect(analyticsStub.trackPageView).not.toHaveBeenCalled();

    await anotherComponent.rejectAnalyticsConsent();
    expect(analyticsConsentStub.reject).toHaveBeenCalledOnce();
  });

  it("tracks the current route on startup when consent was already accepted", async () => {
    analyticsConsentStub = createAnalyticsConsentStub("accepted");
    routerStub = {
      url: "/tabs/auto-team-builder",
      navigated: true,
      events: new Subject<unknown>(),
    };
    const { AppComponent } = await import("./app.component");

    new AppComponent();

    expect(analyticsStub.trackPageView).toHaveBeenCalledWith("/tabs/auto-team-builder");
  });
});

function createAnalyticsConsentStub(initialConsent: AnalyticsConsentState) {
  const consent = signal<AnalyticsConsentState>(initialConsent);

  return {
    consent,
    accept: vi.fn().mockImplementation(async () => {
      consent.set("accepted");
    }),
    reject: vi.fn().mockImplementation(async () => {
      consent.set("rejected");
    }),
  };
}

import "@angular/compiler";
import { signal } from "@angular/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { CookiePolicyPage } from "./cookie-policy.page";

vi.mock("@ionic/angular/standalone", () => ({
  IonButton: class {},
  IonContent: class {},
  IonHeader: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe("CookiePolicyPage", () => {
  it("renders the required cookie policy sections in the template", () => {
    const template = readFileSync(
      resolve(process.cwd(), "src/app/pages/cookie-policy/cookie-policy.page.html"),
      "utf8",
    );

    expect(template).toContain('t("sections.whatTheyAre.title")');
    expect(template).toContain('t("sections.analytics.title")');
    expect(template).toContain('t("sections.manageConsent.title")');
    expect(template).toContain('t("consent.statusLabel")');
    expect(template).toContain("(click)=\"acceptAnalyticsConsent()\"");
    expect(template).toContain("(click)=\"rejectAnalyticsConsent()\"");
    expect(template).toContain("[routerLink]=\"['/tabs/privacy']\"");
    expect(template).toContain("[routerLink]=\"['/tabs/terms']\"");
    expect(template).not.toContain("ion-back-button");
  });

  it("updates analytics consent from the cookie policy page", async () => {
    const analyticsConsent = signal<"accepted" | "rejected" | "unknown">("unknown");
    const analyticsConsentService = {
      consent: analyticsConsent,
      accept: vi.fn().mockImplementation(async () => {
        analyticsConsent.set("accepted");
      }),
      reject: vi.fn().mockImplementation(async () => {
        analyticsConsent.set("rejected");
      }),
    };
    const page = new CookiePolicyPage(analyticsConsentService as never);

    await page.acceptAnalyticsConsent();
    await page.rejectAnalyticsConsent();

    expect(analyticsConsentService.accept).toHaveBeenCalledOnce();
    expect(analyticsConsentService.reject).toHaveBeenCalledOnce();
    expect(page.analyticsConsentStatusKey()).toBe("consent.status.rejected");
  });
});

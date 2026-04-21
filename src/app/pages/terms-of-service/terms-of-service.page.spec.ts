import "@angular/compiler";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TermsOfServicePage", () => {
  it("renders the required terms sections in the template", () => {
    const template = readFileSync(
      resolve(process.cwd(), "src/app/pages/terms-of-service/terms-of-service.page.html"),
      "utf8",
    );

    expect(template).toContain('t("sections.acceptance.title")');
    expect(template).toContain('t("sections.service.title")');
    expect(template).toContain('t("sections.fanProject.title")');
    expect(template).toContain('t("sections.ip.title")');
    expect(template).toContain('t("sections.acceptableUse.title")');
    expect(template).toContain('t("sections.googleServices.title")');
    expect(template).toContain('t("sections.warranty.title")');
    expect(template).toContain('t("sections.liability.title")');
    expect(template).toContain('t("sections.lawAndContact.title")');
    expect(template).toContain('t("sections.updates.lastUpdatedLabel")');
    expect(template).toContain("[routerLink]=\"['/tabs/privacy']\"");
    expect(template).toContain("[routerLink]=\"['/tabs/cookies']\"");
    expect(template).toContain("[routerLink]=\"['/tabs/settings']\"");
    expect(template).not.toContain("ion-back-button");
  });
});

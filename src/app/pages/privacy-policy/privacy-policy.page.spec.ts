import "@angular/compiler";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PrivacyPolicyPage", () => {
  it("renders the required privacy sections in the template", () => {
    const template = readFileSync(
      resolve(process.cwd(), "src/app/pages/privacy-policy/privacy-policy.page.html"),
      "utf8",
    );

    expect(template).toContain('t("sections.controller.title")');
    expect(template).toContain('t("sections.data.title")');
    expect(template).toContain('t("sections.purposes.title")');
    expect(template).toContain('t("sections.legalBasis.title")');
    expect(template).toContain('t("sections.recipients.title")');
    expect(template).toContain('t("sections.retention.title")');
    expect(template).toContain('t("sections.rights.title")');
    expect(template).toContain('t("sections.complaints.title")');
    expect(template).toContain("[routerLink]=\"['/tabs/cookies']\"");
    expect(template).toContain("[routerLink]=\"['/tabs/terms']\"");
    expect(template).not.toContain("ion-back-button");
  });
});

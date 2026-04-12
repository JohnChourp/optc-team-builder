import "@angular/compiler";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TabsPage", () => {
  it("uses the settings tab label instead of offline", () => {
    const template = readFileSync(resolve(process.cwd(), "src/app/layout/tabs.page.html"), "utf8");

    expect(template).toContain('"tabs.settings" | transloco');
    expect(template).not.toContain('"tabs.offline" | transloco');
  });
});

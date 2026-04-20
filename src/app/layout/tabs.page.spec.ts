import "@angular/compiler";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TabsPage", () => {
  it("renders the drawer navigation items and removes the bottom tab bar", () => {
    const template = readFileSync(resolve(process.cwd(), "src/app/layout/tabs.page.html"), "utf8");

    expect(template).toContain("<ion-menu");
    expect(template).toContain('id="tabs-menu-content"');
    expect(template).toContain("[routerLink]=\"[item.route]\"");
    expect(template).toContain('"tabs.menuTitle" | transloco');
    expect(template).toContain('"tabs.menuCopy" | transloco');
    expect(template).not.toContain("<ion-tab-bar");
  });

  it("uses the expected navigation translation keys", () => {
    const component = readFileSync(resolve(process.cwd(), "src/app/layout/tabs.page.ts"), "utf8");

    expect(component).toContain('"tabs.characters"');
    expect(component).toContain('"tabs.team"');
    expect(component).toContain('"tabs.auto"');
    expect(component).toContain('"tabs.savedTeams"');
    expect(component).toContain('"tabs.characterBoxes"');
    expect(component).toContain('"tabs.savedEnemies"');
    expect(component).toContain('"tabs.settings"');
    expect(component).not.toContain('"tabs.offline"');
  });
});

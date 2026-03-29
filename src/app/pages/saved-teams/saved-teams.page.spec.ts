import "@angular/compiler";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { SavedTeamsPage } from "./saved-teams.page";

vi.mock("@ionic/angular/standalone", () => ({
  IonContent: class {},
  IonHeader: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe("SavedTeamsPage", () => {
  it("exposes only the saved teams signal from user state", async () => {
    const userState = {
      ready: vi.fn().mockResolvedValue(undefined),
      savedTeams: vi.fn(() => [
        { id: "team-1", name: "Slashers", notes: "Burst team" },
      ]),
    };
    const page = new SavedTeamsPage(userState as never);

    await page.ngOnInit();

    expect(page.loading()).toBe(false);
    expect(page.savedTeams()).toEqual([{ id: "team-1", name: "Slashers", notes: "Burst team" }]);
  });

  it("renders saved teams copy without favorites or recents sections", () => {
    const template = readFileSync(new URL("./saved-teams.page.html", import.meta.url), "utf8");

    expect(template).toContain("Saved Teams");
    expect(template).not.toContain("Favorites");
    expect(template).not.toContain("Recently viewed");
    expect(template).not.toContain("Saved crews");
  });
});

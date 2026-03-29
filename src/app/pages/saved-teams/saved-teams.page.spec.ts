import "@angular/compiler";
import { signal } from "@angular/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  it("hydrates saved team previews and preserves empty slots", async () => {
    const savedTeams = signal([
      {
        id: "team-1",
        name: "Slashers",
        notes: "Burst team",
        shipId: null,
        slots: [101, null, 202, null, null, 303],
        createdAt: "2026-03-29T10:00:00.000Z",
        updatedAt: "2026-03-29T10:00:00.000Z",
      },
      {
        id: "team-2",
        name: "Auto Crew",
        notes: "Saved from auto builder",
        shipId: 9001,
        slots: [404, 505, null, null, null, null],
        createdAt: "2026-03-29T11:00:00.000Z",
        updatedAt: "2026-03-29T11:00:00.000Z",
      },
    ]);
    const userState = {
      ready: vi.fn().mockResolvedValue(undefined),
      savedTeams,
    };
    const repository = {
      getCharactersByIds: vi.fn().mockResolvedValue([
        createCharacter(101, "Zoro"),
        createCharacter(202, "Law"),
        createCharacter(303, "Luffy"),
        createCharacter(404, "Nami"),
        createCharacter(505, "Robin"),
      ]),
    };
    const page = new SavedTeamsPage(userState as never, repository as never);

    await page.ngOnInit();

    expect(page.loading()).toBe(false);
    expect(repository.getCharactersByIds).toHaveBeenCalledWith([101, 202, 303, 404, 505]);
    expect(page.savedTeamCards()).toHaveLength(2);
    expect(page.savedTeamCards()[0]?.slots.map((slot) => slot?.id ?? null)).toEqual([
      101,
      null,
      202,
      null,
      null,
      303,
    ]);
    expect(page.savedTeamCards()[1]?.slots.map((slot) => slot?.id ?? null)).toEqual([
      404,
      505,
      null,
      null,
      null,
      null,
    ]);
  });

  it("returns detail links only for valid character slots", () => {
    const userState = {
      ready: vi.fn().mockResolvedValue(undefined),
      savedTeams: signal([]),
    };
    const repository = {
      getCharactersByIds: vi.fn().mockResolvedValue([]),
    };
    const page = new SavedTeamsPage(userState as never, repository as never);

    expect(page.getCharacterDetailLink({ id: 707 } as never)).toEqual(["/characters", "707"]);
    expect(page.getCharacterDetailLink(null)).toBeNull();
  });

  it("renders saved team slot previews with detail links", () => {
    const template = readFileSync(
      resolve(process.cwd(), "src/app/pages/saved-teams/saved-teams.page.html"),
      "utf8",
    );

    expect(template).toContain('t("title")');
    expect(template).toContain("saved-team-preview");
    expect(template).toContain("[routerLink]=\"getCharacterDetailLink(currentSlot)\"");
  });
});

function createCharacter(id: number, name: string) {
  return {
    id,
    name,
    imageUrl: `assets/${id}.png`,
  };
}

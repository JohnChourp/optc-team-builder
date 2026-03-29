import "@angular/compiler";
import { signal } from "@angular/core";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { TeamBuilderPage } from "./team-builder.page";

vi.mock("@ionic/angular/standalone", () => ({
  IonButton: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonItem: class {},
  IonLabel: class {},
  IonList: class {},
  IonSearchbar: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonTextarea: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe("TeamBuilderPage", () => {
  it("returns a detail route only for occupied slots", () => {
    const { page } = createPage();

    expect(
      page.getCharacterDetailLink({
        id: 101,
      } as never),
    ).toEqual(["/characters", "101"]);
    expect(page.getCharacterDetailLink(null)).toBeNull();
  });

  it("keeps slot selection independent from detail navigation availability", () => {
    const { page } = createPage();

    page.selectSlot(4);

    expect(page.selectedSlotIndex()).toBe(4);
    expect(page.getCharacterDetailLink(page.slotCharacters()[4])).toBeNull();
  });

  it("renders a dedicated slot detail action without adding it to candidate cards", () => {
    const template = readFileSync(new URL("./team-builder.page.html", import.meta.url), "utf8");

    expect(template).toContain("[routerLink]=\"getCharacterDetailLink(slot)\"");
    expect(template.match(/View details/g)).toHaveLength(1);
    expect(template).toContain("(click)=\"assignCharacter(candidate)\"");
  });
});

function createPage() {
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: signal<number[]>([]),
    savedTeams: signal([]),
    saveTeam: vi.fn(),
    deleteTeam: vi.fn(),
    toggleFavorite: vi.fn(),
  };
  const repository = {
    getShips: vi.fn().mockResolvedValue([]),
    searchCharacters: vi.fn().mockResolvedValue([]),
    getCharactersByIds: vi.fn().mockResolvedValue([]),
  };
  const page = new TeamBuilderPage(repository as never, userState as never);

  return { page, repository, userState };
}

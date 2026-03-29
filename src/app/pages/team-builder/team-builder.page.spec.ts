import "@angular/compiler";
import { signal } from "@angular/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    const template = readFileSync(
      resolve(process.cwd(), "src/app/pages/team-builder/team-builder.page.html"),
      "utf8",
    );

    expect(template).toContain("[routerLink]=\"getCharacterDetailLink(slot)\"");
    expect(template.match(/common\.actions\.viewDetails/g)).toHaveLength(1);
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
  const i18n = {
    activeLanguage: signal<"en" | "el">("en"),
    availableLanguages: [
      { id: "en", label: "English" },
      { id: "el", label: "Ελληνικά" },
    ] as const,
    preloadScope: vi.fn().mockResolvedValue(undefined),
    ready: vi.fn().mockResolvedValue(undefined),
    setLanguage: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string) => {
      if (key === "common.defaults.newCrew") {
        return "New Crew";
      }

      return key;
    }),
  };
  const page = new TeamBuilderPage(repository as never, userState as never, i18n as never);

  return { page, repository, userState, i18n };
}

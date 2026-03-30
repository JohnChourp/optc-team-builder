import "@angular/compiler";
import { signal } from "@angular/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SavedTeamsPage } from "./saved-teams.page";

vi.mock("@ionic/angular/standalone", () => ({
  IonButton: class {},
  IonCheckbox: class {},
  IonContent: class {},
  IonHeader: class {},
  IonIcon: class {},
  IonInput: class {},
  IonModal: class {},
  IonSpinner: class {},
  IonTextarea: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe("SavedTeamsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates saved team previews and preserves empty slots", async () => {
    const { page, repository } = createPage();

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

  it("selects all teams and enables bulk actions", async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.onSelectAllChange({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    expect(page.selectedTeamIds()).toEqual(["team-1", "team-2"]);
    expect(page.hasSelection()).toBe(true);
    expect(page.allSelected()).toBe(true);
  });

  it("removes a single team after confirm and prunes the selection", async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.selectedTeamIds.set(["team-1", "team-2"]);

    await page.confirmAndDeleteTeam("team-1");

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.deleteTeam).toHaveBeenCalledWith("team-1");
    expect(page.selectedTeamIds()).toEqual(["team-2"]);
  });

  it("deletes the selected teams in bulk after confirm", async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.onSelectAllChange({
      detail: {
        checked: true,
      },
    } as CustomEvent<{ checked: boolean }>);

    await page.confirmAndDeleteSelectedTeams();

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.deleteTeams).toHaveBeenCalledWith(["team-1", "team-2"]);
    expect(page.selectedTeamIds()).toEqual([]);
  });

  it("opens the edit modal with the selected team metadata prefilled", async () => {
    const { page } = createPage();

    await page.ngOnInit();
    page.openEditModal(page.savedTeams()[0]!);

    expect(page.editModalOpen()).toBe(true);
    expect(page.editingTeam()?.id).toBe("team-1");
    expect(page.editTeamName()).toBe("Slashers");
    expect(page.editNotes()).toBe("Burst team");
  });

  it("saves edited team metadata without changing slots or ship", async () => {
    const { page, userState } = createPage();

    await page.ngOnInit();
    page.openEditModal(page.savedTeams()[0]!);
    page.onEditTeamNameChange({ detail: { value: "Edited Slashers" } } as CustomEvent<{ value?: string | null }>);
    page.onEditNotesChange({ detail: { value: "Updated notes" } } as CustomEvent<{ value?: string | null }>);

    await page.saveEditedTeam();

    expect(userState.saveTeam).toHaveBeenCalledWith({
      id: "team-1",
      name: "Edited Slashers",
      notes: "Updated notes",
      shipId: null,
      slots: [101, null, 202, null, null, 303],
    });
    expect(page.editModalOpen()).toBe(false);
    expect(page.savedTeams()[0]).toMatchObject({
      id: "team-1",
      name: "Edited Slashers",
      notes: "Updated notes",
      shipId: null,
      slots: [101, null, 202, null, null, 303],
    });
  });

  it("returns detail links only for valid character slots", () => {
    const { page } = createPage({ savedTeams: [] });

    expect(page.getCharacterDetailLink({ id: 707 } as never)).toEqual(["/characters", "707"]);
    expect(page.getCharacterDetailLink(null)).toBeNull();
  });

  it("renders saved team tools, import controls and slot previews in the template", () => {
    const template = readFileSync(
      resolve(process.cwd(), "src/app/pages/saved-teams/saved-teams.page.html"),
      "utf8",
    );

    expect(template).toContain('t("title")');
    expect(template).toContain('t("hero.savedEnemiesCta")');
    expect(template).toContain('t("tools.export")');
    expect(template).toContain('t("tools.import")');
    expect(template).toContain('t("selection.selectAll")');
    expect(template).toContain('t("edit.actions.edit")');
    expect(template).toContain("edit.teamNameLabel");
    expect(template).toContain("edit.notesLabel");
    expect(template).toContain("ion-checkbox");
    expect(template).toContain("ion-input");
    expect(template).toContain("ion-textarea");
    expect(template).toContain("edit-modal-shell");
    expect(template).toContain("import-dropzone");
    expect(template).toContain("saved-team-preview");
    expect(template).toContain("[routerLink]=\"['/tabs/saved-enemies']\"");
    expect(template).toContain("[routerLink]=\"getCharacterDetailLink(currentSlot)\"");
  });
});

function createPage(overrides: { savedTeams?: ReturnType<typeof buildSavedTeams> } = {}) {
  const savedTeams = signal(overrides.savedTeams ?? buildSavedTeams());
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    savedTeams,
    deleteTeam: vi.fn().mockImplementation(async (teamId: string) => {
      savedTeams.set(savedTeams().filter((team) => team.id !== teamId));
    }),
    deleteTeams: vi.fn().mockImplementation(async (teamIds: string[]) => {
      const targetIds = new Set(teamIds);
      savedTeams.set(savedTeams().filter((team) => !targetIds.has(team.id)));
    }),
    mergeImportedTeams: vi.fn(),
    saveTeam: vi.fn().mockImplementation(
      async (input: {
        id?: string;
        name: string;
        notes: string;
        shipId: number | null;
        slots: Array<number | null>;
      }) => {
        const existing = savedTeams().find((team) => team.id === input.id);
        const nextTeam = {
          id: input.id ?? "team-new",
          name: input.name.trim(),
          notes: input.notes.trim(),
          shipId: input.shipId,
          slots: input.slots,
          createdAt: existing?.createdAt ?? "2026-03-29T12:00:00.000Z",
          updatedAt: "2026-03-29T12:05:00.000Z",
        };

        savedTeams.set(
          existing
            ? savedTeams().map((team) => (team.id === nextTeam.id ? nextTeam : team))
            : [nextTeam, ...savedTeams()],
        );

        return nextTeam;
      },
    ),
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
  const i18n = {
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key === "confirm.deleteSingle") {
        return `Delete ${params?.["name"] ?? ""}`;
      }

      if (key === "confirm.deleteSelected") {
        return `Delete ${params?.["count"] ?? 0}`;
      }

      if (key === "common.defaults.untitledCrew") {
        return "Untitled Crew";
      }

      if (key === "import.errorTitle") {
        return "Import failed";
      }

      if (key === "import.errors.generic") {
        return "Generic import error";
      }

      return key;
    }),
  };
  const page = new SavedTeamsPage(userState as never, repository as never, i18n as never);

  return { page, repository, userState, i18n };
}

function buildSavedTeams() {
  return [
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
  ];
}

function createCharacter(id: number, name: string) {
  return {
    id,
    name,
    imageUrl: `assets/${id}.png`,
  };
}

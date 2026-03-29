import "@angular/compiler";
import { describe, expect, it, beforeEach, vi } from "vitest";

import { Preferences } from "@capacitor/preferences";

import { UserStateService } from "./user-state.service";

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("UserStateService saved teams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes only the requested saved teams and persists the next state", async () => {
    const { service, setCalls } = await createService([
      createTeam("team-1", "Slashers"),
      createTeam("team-2", "Driven"),
    ]);

    await service.deleteTeams(["team-2", "missing"]);

    expect(service.savedTeams().map((team) => team.id)).toEqual(["team-1"]);
    expect(JSON.parse(setCalls.at(-1)?.value ?? "[]")).toEqual([createTeam("team-1", "Slashers")]);
  });

  it("merges imported teams by id and keeps untouched teams behind them", async () => {
    const { service, setCalls } = await createService([
      createTeam("team-1", "Original one"),
      createTeam("team-2", "Untouched"),
    ]);

    const result = await service.mergeImportedTeams([
      {
        ...createTeam("team-1", "Updated import"),
        notes: "merged",
        shipId: 9001,
      },
      createTeam("team-3", "Brand new"),
    ]);

    expect(result).toMatchObject({
      addedCount: 1,
      updatedCount: 1,
    });
    expect(service.savedTeams().map((team) => team.id)).toEqual(["team-1", "team-3", "team-2"]);
    expect(service.savedTeams()[0]?.name).toBe("Updated import");
    expect(JSON.parse(setCalls.at(-1)?.value ?? "[]").map((team: { id: string }) => team.id)).toEqual([
      "team-1",
      "team-3",
      "team-2",
    ]);
  });

  it("updates an existing saved team by id while preserving createdAt and refreshing updatedAt", async () => {
    const originalTeam = createTeam("team-1", "Original one");
    const { service, setCalls } = await createService([originalTeam]);

    const result = await service.saveTeam({
      id: "team-1",
      name: "  Updated name  ",
      notes: "  updated notes  ",
      shipId: 9001,
      slots: [999, null, 202, null, null, 303],
    });

    expect(result).toMatchObject({
      id: "team-1",
      name: "Updated name",
      notes: "updated notes",
      shipId: 9001,
      slots: [999, null, 202, null, null, 303],
      createdAt: originalTeam.createdAt,
    });
    expect(result.updatedAt).not.toBe(originalTeam.updatedAt);
    expect(service.savedTeams()).toHaveLength(1);
    expect(service.savedTeams()[0]).toMatchObject({
      id: "team-1",
      name: "Updated name",
      notes: "updated notes",
      shipId: 9001,
      slots: [999, null, 202, null, null, 303],
      createdAt: originalTeam.createdAt,
    });
    expect(service.savedTeams()[0]?.updatedAt).not.toBe(originalTeam.updatedAt);
    expect(JSON.parse(setCalls.at(-1)?.value ?? "[]")[0]).toMatchObject({
      id: "team-1",
      name: "Updated name",
      notes: "updated notes",
      shipId: 9001,
      slots: [999, null, 202, null, null, 303],
      createdAt: originalTeam.createdAt,
    });
  });
});

async function createService(storedTeams: unknown[]) {
  const store = new Map<string, string>([
    ["favoriteCharacterIds", JSON.stringify([])],
    ["recentCharacterIds", JSON.stringify([])],
    ["savedTeams", JSON.stringify(storedTeams)],
  ]);
  const setCalls: Array<{ key: string; value: string }> = [];

  vi.mocked(Preferences.get).mockImplementation(async ({ key }) => ({
    value: store.get(key) ?? null,
  }));
  vi.mocked(Preferences.set).mockImplementation(async ({ key, value }) => {
    setCalls.push({ key, value });
    store.set(key, value);
  });

  const i18n = {
    translate: vi.fn((key: string) => (key === "common.defaults.untitledCrew" ? "Untitled Crew" : key)),
  };
  const service = new UserStateService(i18n as never);

  await service.ready();

  return { service, setCalls };
}

function createTeam(id: string, name: string) {
  return {
    id,
    name,
    notes: "",
    shipId: null,
    slots: [101, null, 202, null, null, 303],
    createdAt: "2026-03-29T10:00:00.000Z",
    updatedAt: "2026-03-29T10:05:00.000Z",
  };
}

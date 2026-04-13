import "@angular/compiler";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import {
  type FavoriteShipsTransferPayload,
} from "./favorite-ships-transfer.utils";
import {
  type SavedEnemiesTransferPayload,
} from "../saved-enemies/saved-enemies-transfer.utils";
import {
  type SavedTeamsTransferPayload,
} from "../saved-teams/saved-teams-transfer.utils";
import {
  AllDataImportError,
  buildAllDataExportFilename,
  buildAllDataTransferPayload,
  downloadAllDataExport,
  parseAllDataImportCandidate,
} from "./all-data-transfer.utils";

describe("All data transfer helpers", () => {
  it("builds a full nested export payload", () => {
    const favorites = {
      characters: [{ number: 1001, name: "Luffy" }],
    };
    const favoriteShips: FavoriteShipsTransferPayload = {
      schemaVersion: 1,
      source: "favorite-ships",
      exportedAt: "2026-04-13T09:15:00.000Z",
      ships: [{ id: 9001, name: "Going Merry" }],
    };
    const savedTeams: SavedTeamsTransferPayload = {
      schemaVersion: 1,
      source: "saved-teams",
      exportedAt: "2026-04-13T09:15:00.000Z",
      teams: [
        {
          id: "team-1",
          name: "Crew 1",
          notes: "",
          shipId: null,
          slots: [1001, null, null, null, null, null],
          createdAt: "2026-04-13T09:15:00.000Z",
          updatedAt: "2026-04-13T09:15:00.000Z",
        },
      ],
    };
    const savedEnemies: SavedEnemiesTransferPayload = {
      schemaVersion: 1,
      source: "saved-enemies",
      exportedAt: "2026-04-13T09:15:00.000Z",
      enemies: [
        {
          id: "enemy-1",
          name: "Boss",
          notes: "",
          imageDataUrl: null,
          selectedTypes: ["DEX"],
          selectedClasses: ["Fighter"],
          requiredAbilities: [],
          enemyMechanics: [],
          requireAllSelectedTypesInTeam: false,
          requireAllSelectedClassesPerCharacter: false,
          createdAt: "2026-04-13T09:15:00.000Z",
          updatedAt: "2026-04-13T09:15:00.000Z",
        },
      ],
    };

    const payload = buildAllDataTransferPayload(
      {
        favorites,
        favoriteShips,
        savedTeams,
        savedEnemies,
      },
      "2026-04-13T09:15:00.000Z",
    );

    favoriteShips.ships[0]!.name = "Changed";
    savedTeams.teams[0]!.slots[0] = 9999;
    savedEnemies.enemies[0]!.selectedTypes.push("PSY");

    expect(payload).toEqual({
      schemaVersion: 1,
      source: "all-data",
      exportedAt: "2026-04-13T09:15:00.000Z",
      favorites: {
        characters: [{ number: 1001, name: "Luffy" }],
      },
      favoriteShips: {
        schemaVersion: 1,
        source: "favorite-ships",
        exportedAt: "2026-04-13T09:15:00.000Z",
        ships: [{ id: 9001, name: "Going Merry" }],
      },
      savedTeams: {
        schemaVersion: 1,
        source: "saved-teams",
        exportedAt: "2026-04-13T09:15:00.000Z",
        teams: [
          expect.objectContaining({
            id: "team-1",
            slots: [1001, null, null, null, null, null],
          }),
        ],
      },
      savedEnemies: {
        schemaVersion: 1,
        source: "saved-enemies",
        exportedAt: "2026-04-13T09:15:00.000Z",
        enemies: [
          expect.objectContaining({
            id: "enemy-1",
            selectedTypes: ["DEX"],
          }),
        ],
      },
    });
  });

  it("builds the all-data filename with the expected timestamp format", () => {
    expect(buildAllDataExportFilename("2026-04-13T09:15:00.000Z")).toBe(
      "optc-all-data-20260413-091500.json",
    );
  });

  it("downloads the all-data export with the shared filename", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const urlRef = {
      createObjectURL: vi.fn(() => "blob:all-data"),
      revokeObjectURL: vi.fn(),
    };

    downloadAllDataExport(
      buildAllDataTransferPayload({}, "2026-04-13T09:15:00.000Z"),
      dom.window.document,
      urlRef,
    );

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith("blob:all-data");
  });

  it("detects a full all-data bundle", () => {
    const result = parseAllDataImportCandidate(
      JSON.stringify(
        buildAllDataTransferPayload(
          {
            favorites: { characters: [{ number: 1001, name: "Luffy" }] },
          },
          "2026-04-13T09:15:00.000Z",
        ),
      ),
    );

    expect(result).toMatchObject({
      kind: "all-data",
      payload: expect.objectContaining({
        source: "all-data",
      }),
    });
  });

  it("detects a partial all-data bundle", () => {
    const result = parseAllDataImportCandidate(
      JSON.stringify({
        schemaVersion: 1,
        source: "all-data",
        exportedAt: "2026-04-13T09:15:00.000Z",
        savedTeams: {
          schemaVersion: 1,
          source: "saved-teams",
          exportedAt: "2026-04-13T09:15:00.000Z",
          teams: [],
        },
      }),
    );

    expect(result.kind).toBe("all-data");
  });

  it("detects a raw favorites export", () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          characters: [{ number: 1001, name: "Luffy" }],
        }),
      ),
    ).toMatchObject({ kind: "favorites" });
  });

  it("detects a favorite ships export", () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 1,
          source: "favorite-ships",
          exportedAt: "2026-04-13T09:15:00.000Z",
          ships: [],
        }),
      ),
    ).toMatchObject({ kind: "favorite-ships" });
  });

  it("detects a saved teams export", () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 1,
          source: "saved-teams",
          exportedAt: "2026-04-13T09:15:00.000Z",
          teams: [],
        }),
      ),
    ).toMatchObject({ kind: "saved-teams" });
  });

  it("detects a saved enemies export", () => {
    expect(
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 1,
          source: "saved-enemies",
          exportedAt: "2026-04-13T09:15:00.000Z",
          enemies: [],
        }),
      ),
    ).toMatchObject({ kind: "saved-enemies" });
  });

  it("throws a typed error for invalid json", () => {
    try {
      parseAllDataImportCandidate("{");
      throw new Error("Expected invalid json to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(AllDataImportError);
      expect(error).toMatchObject({ key: "management.allData.errors.invalidJson" });
    }
  });

  it("throws a typed error for invalid payloads", () => {
    try {
      parseAllDataImportCandidate(JSON.stringify([]));
      throw new Error("Expected invalid payload to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(AllDataImportError);
      expect(error).toMatchObject({ key: "management.allData.errors.invalidPayload" });
    }
  });

  it("throws a typed error for unsupported schemas", () => {
    try {
      parseAllDataImportCandidate(
        JSON.stringify({
          schemaVersion: 2,
          source: "future-export",
          exportedAt: "2026-04-13T09:15:00.000Z",
        }),
      );
      throw new Error("Expected unsupported schema to throw.");
    } catch (error) {
      expect(error).toBeInstanceOf(AllDataImportError);
      expect(error).toMatchObject({ key: "management.allData.errors.unsupportedSchema" });
    }
  });
});

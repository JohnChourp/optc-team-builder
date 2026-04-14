import "@angular/compiler";
import { signal } from "@angular/core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../characters/characters-favorites.utils", async () => {
  const actual = await vi.importActual<typeof import("../characters/characters-favorites.utils")>(
    "../characters/characters-favorites.utils",
  );

  return {
    ...actual,
    downloadOptcbxFavoritesExport: vi.fn(),
  };
});

vi.mock("../character-boxes/character-boxes-transfer.utils", async () => {
  const actual = await vi.importActual<
    typeof import("../character-boxes/character-boxes-transfer.utils")
  >("../character-boxes/character-boxes-transfer.utils");

  return {
    ...actual,
    downloadCharacterBoxesExport: vi.fn(),
  };
});

vi.mock("./favorite-ships-transfer.utils", async () => {
  const actual = await vi.importActual<typeof import("./favorite-ships-transfer.utils")>(
    "./favorite-ships-transfer.utils",
  );

  return {
    ...actual,
    downloadFavoriteShipsExport: vi.fn(),
  };
});

vi.mock("./all-data-transfer.utils", async () => {
  const actual = await vi.importActual<typeof import("./all-data-transfer.utils")>(
    "./all-data-transfer.utils",
  );

  return {
    ...actual,
    downloadAllDataExport: vi.fn(),
  };
});

vi.mock("../saved-teams/saved-teams-transfer.utils", async () => {
  const actual = await vi.importActual<typeof import("../saved-teams/saved-teams-transfer.utils")>(
    "../saved-teams/saved-teams-transfer.utils",
  );

  return {
    ...actual,
    downloadSavedTeamsExport: vi.fn(),
  };
});

vi.mock("../saved-enemies/saved-enemies-transfer.utils", async () => {
  const actual = await vi.importActual<
    typeof import("../saved-enemies/saved-enemies-transfer.utils")
  >("../saved-enemies/saved-enemies-transfer.utils");

  return {
    ...actual,
    downloadSavedEnemiesExport: vi.fn(),
  };
});

import { downloadAllDataExport } from "./all-data-transfer.utils";
import { downloadCharacterBoxesExport } from "../character-boxes/character-boxes-transfer.utils";
import { downloadOptcbxFavoritesExport } from "../characters/characters-favorites.utils";
import { downloadSavedEnemiesExport } from "../saved-enemies/saved-enemies-transfer.utils";
import { downloadSavedTeamsExport } from "../saved-teams/saved-teams-transfer.utils";
import { downloadFavoriteShipsExport } from "./favorite-ships-transfer.utils";
import { SettingsPage } from "./settings.page";

vi.mock("@ionic/angular/standalone", () => ({
  IonButton: class {},
  IonContent: class {},
  IonHeader: class {},
  IonLabel: class {},
  IonSelect: class {},
  IonSelectOption: class {},
  IonSpinner: class {},
  IonTitle: class {},
  IonToolbar: class {},
}));

describe("SettingsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders settings data management actions in the template", () => {
    const template = readFileSync(
      resolve(process.cwd(), "src/app/pages/settings/settings.page.html"),
      "utf8",
    );

    expect(template).toContain('t("performance.title")');
    expect(template).toContain('t("performance.mode.label")');
    expect(template).toContain('t("performance.manualCount.label")');
    expect(template).toContain('t("analytics.title")');
    expect(template).toContain('t("analytics.statusLabel")');
    expect(template).toContain('t("analytics.actions.accept")');
    expect(template).toContain('t("analytics.actions.reject")');
    expect(template).toContain('t("analytics.links.privacy")');
    expect(template).toContain('t("analytics.links.cookies")');
    expect(template).toContain('t("sections.dataManagement")');
    expect(template).toContain('t("management.allData.export")');
    expect(template).toContain('t("management.allData.import")');
    expect(template).toContain('t("management.favorites.export")');
    expect(template).toContain('t("management.favorites.import")');
    expect(template).toContain('t("management.favorites.deleteAll")');
    expect(template).toContain('t("management.favoriteShips.export")');
    expect(template).toContain('t("management.favoriteShips.import")');
    expect(template).toContain('t("management.favoriteShips.deleteAll")');
    expect(template).toContain('t("management.savedTeams.export")');
    expect(template).toContain('t("management.savedTeams.import")');
    expect(template).toContain('t("management.savedTeams.deleteAll")');
    expect(template).toContain('t("management.characterBoxes.export")');
    expect(template).toContain('t("management.characterBoxes.import")');
    expect(template).toContain('t("management.characterBoxes.deleteAll")');
    expect(template).toContain('t("management.savedEnemies.export")');
    expect(template).toContain('t("management.savedEnemies.import")');
    expect(template).toContain('t("management.savedEnemies.deleteAll")');
    expect(template).toContain('t("sections.legal")');
    expect(template).toContain('t("legal.actions.privacy")');
    expect(template).toContain('t("legal.actions.cookies")');
    expect(template).toContain("[routerLink]=\"['/tabs/privacy']\"");
    expect(template).toContain("[routerLink]=\"['/tabs/cookies']\"");
  });

  it("exports all favorites through the shared OPTCbx payload helper", async () => {
    const { page, repository } = createPage();

    await page.exportFavorites();

    expect(repository.getCharactersByIds).toHaveBeenCalledWith([1001, 1002]);
    expect(vi.mocked(downloadOptcbxFavoritesExport)).toHaveBeenCalledWith({
      characters: [
        { number: 1001, name: "Luffy" },
        { number: 1002, name: "Zoro" },
      ],
    });
  });

  it("exports all favorite ships from settings", async () => {
    const { page, repository } = createPage();

    await page.exportFavoriteShips();

    expect(repository.getShips).toHaveBeenCalledOnce();
    expect(vi.mocked(downloadFavoriteShipsExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: "favorite-ships",
        ships: [
          { id: 9001, name: "Going Merry" },
          { id: 9002, name: "Thousand Sunny" },
        ],
      }),
    );
  });

  it("exports all saved teams from offline management", () => {
    const { page } = createPage();

    page.exportSavedTeams();

    expect(vi.mocked(downloadSavedTeamsExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: "saved-teams",
        teams: expect.arrayContaining([
          expect.objectContaining({ id: "team-1" }),
          expect.objectContaining({ id: "team-2" }),
        ]),
      }),
    );
  });

  it("exports all character boxes from offline management", () => {
    const { page } = createPage();

    page.exportCharacterBoxes();

    expect(vi.mocked(downloadCharacterBoxesExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: "character-boxes",
        boxes: expect.arrayContaining([
          expect.objectContaining({ id: "box-1" }),
          expect.objectContaining({ id: "box-2" }),
        ]),
      }),
    );
  });

  it("exports all saved enemies from offline management", () => {
    const { page } = createPage();

    page.exportSavedEnemies();

    expect(vi.mocked(downloadSavedEnemiesExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: "saved-enemies",
        enemies: expect.arrayContaining([
          expect.objectContaining({ id: "enemy-1" }),
          expect.objectContaining({ id: "enemy-2" }),
        ]),
      }),
    );
  });

  it("exports all local data through the nested bundle helper", async () => {
    const { page, repository } = createPage();

    await page.exportAll();

    expect(repository.getCharactersByIds).toHaveBeenCalledWith([1001, 1002]);
    expect(repository.getShips).toHaveBeenCalledOnce();
    expect(vi.mocked(downloadAllDataExport)).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        source: "all-data",
        favorites: {
          characters: [
            { number: 1001, name: "Luffy" },
            { number: 1002, name: "Zoro" },
          ],
        },
        favoriteShips: expect.objectContaining({
          source: "favorite-ships",
          ships: [
            { id: 9001, name: "Going Merry" },
            { id: 9002, name: "Thousand Sunny" },
          ],
        }),
        characterBoxes: expect.objectContaining({
          source: "character-boxes",
          boxes: expect.arrayContaining([
            expect.objectContaining({ id: "box-1" }),
            expect.objectContaining({ id: "box-2" }),
          ]),
        }),
        savedTeams: expect.objectContaining({
          source: "saved-teams",
        }),
        savedEnemies: expect.objectContaining({
          source: "saved-enemies",
        }),
      }),
    );
  });

  it("imports favorites directly from offline management", async () => {
    const { page, optcbxImport, userState } = createPage();

    optcbxImport.buildMergeImportResult.mockResolvedValue({
      matchedIds: [1003, 1004],
      unmatchedIds: [9999],
      duplicatesRemoved: 1,
      addedCount: 2,
      alreadyFavoritedCount: 0,
    });
    optcbxImport.mergeFavoriteIds.mockReturnValue([1003, 1004, 1001, 1002]);

    await page.onFavoritesFileSelected(
      createFileEvent(
        buildFile(
          "favorites.json",
          JSON.stringify({
            characters: [
              { number: 1003, name: "Nami" },
              { number: 1004, name: "Sanji" },
            ],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.setFavoriteCharacterIds).toHaveBeenCalledWith([1003, 1004, 1001, 1002]);
    expect(page.favoritesFeedback()).toMatchObject({
      tone: "warning",
    });
  });

  it("imports favorite ships from settings and ignores duplicate or unknown ids", async () => {
    const { page, repository, userState } = createPage();

    await page.onFavoriteShipsFileSelected(
      createFileEvent(
        buildFile(
          "favorite-ships.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "favorite-ships",
            exportedAt: "2026-04-12T09:00:00.000Z",
            ships: [
              { id: 9002, name: "Thousand Sunny" },
              { id: 9999, name: "Ghost Ship" },
              { id: 9002, name: "Duplicate Thousand Sunny" },
              { id: 9003, name: "Shark Superb" },
            ],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(repository.getShips).toHaveBeenCalledOnce();
    expect(userState.setFavoriteShipIds).toHaveBeenCalledWith([9002, 9003, 9001]);
    expect(page.favoriteShipsFeedback()).toMatchObject({
      tone: "warning",
    });
  });

  it("imports saved teams from offline management and sanitizes unknown slots", async () => {
    const { page, repository, userState } = createPage();

    await page.onSavedTeamsFileSelected(
      createFileEvent(
        buildFile(
          "saved-teams.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "saved-teams",
            exportedAt: "2026-04-12T09:00:00.000Z",
            teams: [
              {
                id: "team-imported",
                name: "Imported Team",
                notes: "",
                shipId: null,
                slots: [1001, 999999, null, null, null, null],
                createdAt: "2026-04-12T09:00:00.000Z",
                updatedAt: "2026-04-12T09:00:00.000Z",
              },
            ],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(repository.getCharactersByIds).toHaveBeenCalledWith([1001, 999999]);
    expect(userState.mergeImportedTeams).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "team-imported",
        slots: [1001, null, null, null, null, null],
      }),
    ]);
    expect(page.savedTeamsFeedback()).toMatchObject({
      tone: "warning",
    });
  });

  it("imports character boxes from settings and sanitizes unknown character ids", async () => {
    const { page, repository, userState } = createPage();

    await page.onCharacterBoxesFileSelected(
      createFileEvent(
        buildFile(
          "character-boxes.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "character-boxes",
            exportedAt: "2026-04-12T09:00:00.000Z",
            boxes: [
              {
                id: "box-imported",
                name: "Imported Box",
                characterIds: [1001, 999999, 1002],
                createdAt: "2026-04-12T09:00:00.000Z",
                updatedAt: "2026-04-12T09:00:00.000Z",
              },
            ],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(repository.getCharactersByIds).toHaveBeenCalledWith([1001, 999999, 1002]);
    expect(userState.mergeImportedCharacterBoxes).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "box-imported",
        characterIds: [1001, 1002],
      }),
    ]);
    expect(page.characterBoxesFeedback()).toMatchObject({
      tone: "warning",
    });
  });

  it("imports saved enemies from offline management", async () => {
    const { page, userState } = createPage();

    await page.onSavedEnemiesFileSelected(
      createFileEvent(
        buildFile(
          "saved-enemies.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "saved-enemies",
            exportedAt: "2026-04-12T09:00:00.000Z",
            enemies: [
              {
                id: "enemy-imported",
                name: "Imported Enemy",
                notes: "",
                imageDataUrl: null,
                selectedTypes: ["DEX"],
                selectedClasses: ["Fighter"],
                requiredAbilities: [],
                enemyMechanics: [],
                requireAllSelectedTypesInTeam: false,
                requireAllSelectedClassesPerCharacter: false,
                createdAt: "2026-04-12T09:00:00.000Z",
                updatedAt: "2026-04-12T09:00:00.000Z",
              },
            ],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.mergeImportedEnemies).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "enemy-imported",
      }),
    ]);
    expect(page.savedEnemiesFeedback()).toMatchObject({
      tone: "success",
    });
  });

  it("imports a full all-data bundle from settings", async () => {
    const { page, optcbxImport, userState } = createPage();

    optcbxImport.buildMergeImportResult.mockResolvedValue({
      matchedIds: [1003],
      unmatchedIds: [],
      duplicatesRemoved: 0,
      addedCount: 1,
      alreadyFavoritedCount: 0,
    });
    optcbxImport.mergeFavoriteIds.mockReturnValue([1003, 1001, 1002]);

    await page.onAllDataFileSelected(
      createFileEvent(
        buildFile(
          "all-data.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "all-data",
            exportedAt: "2026-04-12T09:00:00.000Z",
            favorites: {
              characters: [{ number: 1003, name: "Nami" }],
            },
            favoriteShips: {
              schemaVersion: 1,
              source: "favorite-ships",
              exportedAt: "2026-04-12T09:00:00.000Z",
              ships: [{ id: 9003, name: "Shark Superb" }],
            },
            characterBoxes: {
              schemaVersion: 1,
              source: "character-boxes",
              exportedAt: "2026-04-12T09:00:00.000Z",
              boxes: [createBox("box-imported", [1001, 1002])],
            },
            savedTeams: {
              schemaVersion: 1,
              source: "saved-teams",
              exportedAt: "2026-04-12T09:00:00.000Z",
              teams: [createTeam("team-imported", [1001, null, null, null, null, null])],
            },
            savedEnemies: {
              schemaVersion: 1,
              source: "saved-enemies",
              exportedAt: "2026-04-12T09:00:00.000Z",
              enemies: [createEnemy("enemy-imported")],
            },
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.setFavoriteCharacterIds).toHaveBeenCalledWith([1003, 1001, 1002]);
    expect(userState.setFavoriteShipIds).toHaveBeenCalledWith([9003, 9001, 9002]);
    expect(userState.mergeImportedCharacterBoxes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "box-imported" }),
    ]);
    expect(userState.mergeImportedTeams).toHaveBeenCalledWith([
      expect.objectContaining({ id: "team-imported" }),
    ]);
    expect(userState.mergeImportedEnemies).toHaveBeenCalledWith([
      expect.objectContaining({ id: "enemy-imported" }),
    ]);
    expect(page.allDataFeedback()).toMatchObject({
      tone: "success",
    });
  });

  it("imports a raw favorites export through import all", async () => {
    const { page, optcbxImport, userState } = createPage();

    optcbxImport.buildMergeImportResult.mockResolvedValue({
      matchedIds: [1004],
      unmatchedIds: [],
      duplicatesRemoved: 0,
      addedCount: 1,
      alreadyFavoritedCount: 0,
    });
    optcbxImport.mergeFavoriteIds.mockReturnValue([1004, 1001, 1002]);

    await page.onAllDataFileSelected(
      createFileEvent(
        buildFile(
          "favorites.json",
          JSON.stringify({
            characters: [{ number: 1004, name: "Sanji" }],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.setFavoriteCharacterIds).toHaveBeenCalledWith([1004, 1001, 1002]);
    expect(page.allDataFeedback()).toMatchObject({
      tone: "success",
    });
  });

  it("imports a favorite ships export through import all", async () => {
    const { page, userState } = createPage();

    await page.onAllDataFileSelected(
      createFileEvent(
        buildFile(
          "favorite-ships.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "favorite-ships",
            exportedAt: "2026-04-12T09:00:00.000Z",
            ships: [{ id: 9003, name: "Shark Superb" }],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.setFavoriteShipIds).toHaveBeenCalledWith([9003, 9001, 9002]);
    expect(page.allDataFeedback()).toMatchObject({
      tone: "success",
    });
  });

  it("imports a single saved team export through import all", async () => {
    const { page, userState } = createPage();

    await page.onAllDataFileSelected(
      createFileEvent(
        buildFile(
          "saved-team.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "saved-teams",
            exportedAt: "2026-04-12T09:00:00.000Z",
            teams: [createTeam("team-single", [1001, null, null, null, null, null])],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.mergeImportedTeams).toHaveBeenCalledWith([
      expect.objectContaining({ id: "team-single" }),
    ]);
    expect(page.allDataFeedback()).toMatchObject({
      tone: "success",
    });
  });

  it("imports a single character boxes export through import all", async () => {
    const { page, userState } = createPage();

    await page.onAllDataFileSelected(
      createFileEvent(
        buildFile(
          "character-boxes.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "character-boxes",
            exportedAt: "2026-04-12T09:00:00.000Z",
            boxes: [createBox("box-single", [1001, 1002])],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.mergeImportedCharacterBoxes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "box-single" }),
    ]);
    expect(page.allDataFeedback()).toMatchObject({
      tone: "success",
    });
  });

  it("imports a single saved enemy export through import all", async () => {
    const { page, userState } = createPage();

    await page.onAllDataFileSelected(
      createFileEvent(
        buildFile(
          "saved-enemy.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "saved-enemies",
            exportedAt: "2026-04-12T09:00:00.000Z",
            enemies: [createEnemy("enemy-single")],
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.mergeImportedEnemies).toHaveBeenCalledWith([
      expect.objectContaining({ id: "enemy-single" }),
    ]);
    expect(page.allDataFeedback()).toMatchObject({
      tone: "success",
    });
  });

  it("keeps importing valid sections when a bundle has warnings", async () => {
    const { page, userState } = createPage();

    await page.onAllDataFileSelected(
      createFileEvent(
        buildFile(
          "all-data-warning.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "all-data",
            exportedAt: "2026-04-12T09:00:00.000Z",
            favoriteShips: {
              schemaVersion: 1,
              source: "favorite-ships",
              exportedAt: "2026-04-12T09:00:00.000Z",
              ships: [
                { id: 9003, name: "Shark Superb" },
                { id: 9999, name: "Ghost Ship" },
              ],
            },
            savedTeams: {
              schemaVersion: 1,
              source: "saved-teams",
              exportedAt: "2026-04-12T09:00:00.000Z",
              teams: [createTeam("team-warning", [1001, null, null, null, null, null])],
            },
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.setFavoriteShipIds).toHaveBeenCalledWith([9003, 9001, 9002]);
    expect(userState.mergeImportedTeams).toHaveBeenCalledWith([
      expect.objectContaining({ id: "team-warning" }),
    ]);
    expect(page.allDataFeedback()).toMatchObject({
      tone: "warning",
    });
  });

  it("continues importing valid sections when one bundle section fails", async () => {
    const { page, userState } = createPage();

    await page.onAllDataFileSelected(
      createFileEvent(
        buildFile(
          "all-data-partial-failure.json",
          JSON.stringify({
            schemaVersion: 1,
            source: "all-data",
            exportedAt: "2026-04-12T09:00:00.000Z",
            favoriteShips: 42,
            savedEnemies: {
              schemaVersion: 1,
              source: "saved-enemies",
              exportedAt: "2026-04-12T09:00:00.000Z",
              enemies: [createEnemy("enemy-valid")],
            },
          }),
        ),
      ),
      { value: "" } as HTMLInputElement,
    );

    expect(userState.mergeImportedEnemies).toHaveBeenCalledWith([
      expect.objectContaining({ id: "enemy-valid" }),
    ]);
    expect(page.allDataFeedback()).toMatchObject({
      tone: "warning",
    });
  });

  it("confirms before deleting all favorite ships", async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);
    const { page, userState } = createPage();

    await page.deleteAllFavoriteShips();

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.clearAllFavoriteShipIds).toHaveBeenCalledOnce();
  });

  it("confirms before deleting all saved teams", async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);
    const { page, userState } = createPage();

    await page.deleteAllSavedTeams();

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.clearAllSavedTeams).toHaveBeenCalledOnce();
  });

  it("confirms before deleting all character boxes", async () => {
    const confirmSpy = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirmSpy);
    const { page, userState } = createPage();

    await page.deleteAllCharacterBoxes();

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(userState.clearAllCharacterBoxes).toHaveBeenCalledOnce();
  });

  it("updates the auto team builder worker mode from settings", async () => {
    const { page, userState } = createPage();

    await page.onAutoTeamBuilderWorkerModeChange(
      { detail: { value: "manual" } } as CustomEvent<{ value?: "auto" | "manual" | null }>,
    );

    expect(userState.setAutoTeamBuilderWorkerPreference).toHaveBeenCalledWith({
      mode: "manual",
      manualCount: 7,
    });
  });

  it("updates the manual worker count from settings", async () => {
    const { page, userState } = createPage();

    await page.onAutoTeamBuilderManualWorkerCountChange(
      { detail: { value: 4 } } as CustomEvent<{ value?: number | string | null }>,
    );

    expect(userState.setAutoTeamBuilderWorkerPreference).toHaveBeenCalledWith({
      mode: "auto",
      manualCount: 4,
    });
  });

  it("accepts analytics consent from settings", async () => {
    const { page, analyticsConsentService } = createPage();

    await page.acceptAnalyticsConsent();

    expect(analyticsConsentService.accept).toHaveBeenCalledOnce();
  });

  it("rejects analytics consent from settings", async () => {
    const { page, analyticsConsentService } = createPage();

    await page.rejectAnalyticsConsent();

    expect(analyticsConsentService.reject).toHaveBeenCalledOnce();
  });
});

function createPage() {
  const favoriteIds = signal([1001, 1002]);
  const favoriteShipIds = signal([9001, 9002]);
  const characterBoxes = signal([createBox("box-1", [1001, 1002]), createBox("box-2", [1002])]);
  const savedTeams = signal([
    createTeam("team-1", [1001, 1002, null, null, null, null]),
    createTeam("team-2", [1002, null, null, null, null, null]),
  ]);
  const savedEnemies = signal([createEnemy("enemy-1"), createEnemy("enemy-2")]);
  const autoTeamBuilderWorkerPreference = signal({
    mode: "auto" as const,
    manualCount: 7,
  });
  const analyticsConsent = signal<"accepted" | "rejected" | "unknown">("unknown");
  const userState = {
    ready: vi.fn().mockResolvedValue(undefined),
    favoriteCharacterIds: favoriteIds,
    favoriteShipIds,
    characterBoxes,
    savedTeams,
    savedEnemies,
    autoTeamBuilderWorkerPreference,
    resolveAutoTeamBuilderWorkerPreference: vi.fn(() => ({
      ...autoTeamBuilderWorkerPreference(),
      detectedCoreCount: 8,
      effectiveCount: autoTeamBuilderWorkerPreference().mode === "manual" ? autoTeamBuilderWorkerPreference().manualCount : 7,
    })),
    setFavoriteCharacterIds: vi.fn().mockImplementation(async (nextFavoriteIds: number[]) => {
      favoriteIds.set(nextFavoriteIds);
    }),
    setFavoriteShipIds: vi.fn().mockImplementation(async (nextFavoriteShipIds: number[]) => {
      favoriteShipIds.set(nextFavoriteShipIds);
    }),
    clearAllFavoriteCharacterIds: vi.fn().mockImplementation(async () => {
      favoriteIds.set([]);
    }),
    clearAllFavoriteShipIds: vi.fn().mockImplementation(async () => {
      favoriteShipIds.set([]);
    }),
    clearAllCharacterBoxes: vi.fn().mockImplementation(async () => {
      characterBoxes.set([]);
    }),
    clearAllSavedTeams: vi.fn().mockImplementation(async () => {
      savedTeams.set([]);
    }),
    clearAllSavedEnemies: vi.fn().mockImplementation(async () => {
      savedEnemies.set([]);
    }),
    setAutoTeamBuilderWorkerPreference: vi.fn().mockImplementation(
      async (nextPreference: { mode: "auto" | "manual"; manualCount: number }) => {
        autoTeamBuilderWorkerPreference.set(nextPreference);
      },
    ),
    mergeImportedTeams: vi.fn().mockResolvedValue({
      addedCount: 1,
      updatedCount: 0,
      teams: [],
    }),
    mergeImportedCharacterBoxes: vi.fn().mockResolvedValue({
      addedCount: 1,
      updatedCount: 0,
      boxes: [],
    }),
    mergeImportedEnemies: vi.fn().mockResolvedValue({
      addedCount: 1,
      updatedCount: 0,
      enemies: [],
    }),
  };
  const repository = {
    getDatasetManifest: vi.fn().mockResolvedValue({
      packs: [],
    }),
    getCharactersByIds: vi.fn().mockImplementation(async (ids: number[]) =>
      ids
        .filter((id) => id !== 999999)
        .map((id) => ({
          id,
          name: id === 1001 ? "Luffy" : id === 1002 ? "Zoro" : `Character ${id}`,
        })),
    ),
    getShips: vi.fn().mockResolvedValue([
      {
        id: 9001,
        name: "Going Merry",
        thumb: null,
        thumbUrl: null,
        description: "A classic ship.",
      },
      {
        id: 9002,
        name: "Thousand Sunny",
        thumb: null,
        thumbUrl: null,
        description: "A sunny ship.",
      },
      {
        id: 9003,
        name: "Shark Superb",
        thumb: null,
        thumbUrl: null,
        description: "A fast ship.",
      },
    ]),
  };
  const optcbxImport = {
    parseExport: vi.fn().mockReturnValue({
      importedNumbers: [1003, 1004],
      duplicatesRemoved: 1,
    }),
    parseExportPayload: vi.fn().mockReturnValue({
      importedNumbers: [1003, 1004],
      duplicatesRemoved: 0,
    }),
    buildMergeImportResult: vi.fn(),
    mergeFavoriteIds: vi.fn(),
  };
  const i18n = {
    activeLanguage: signal<"en" | "el">("en"),
    availableLanguages: [
      { id: "en", label: "English" },
      { id: "el", label: "Ελληνικά" },
    ] as const,
    setLanguage: vi.fn().mockResolvedValue(undefined),
    translate: vi.fn((key: string, params?: Record<string, string | number>) => {
      if (key === "management.confirm.deleteSavedTeams") {
        return "Delete all saved teams?";
      }

      if (key === "management.confirm.deleteFavoriteShips") {
        return "Delete all favorite ships?";
      }

      if (key === "management.confirm.deleteCharacterBoxes") {
        return "Delete all character boxes?";
      }

      if (key === "management.favorites.feedback.warningTitle") {
        return "Favorites import completed with warnings";
      }

      if (key === "management.favorites.feedback.successTitle") {
        return "Favorites import completed";
      }

      if (key === "management.favorites.feedback.errorTitle") {
        return "Favorites import failed";
      }

      if (key === "management.favoriteShips.feedback.errorTitle") {
        return "Favorite ships import failed";
      }

      if (key === "management.allData.feedback.errorTitle") {
        return "All data import failed";
      }

      if (key === "management.allData.feedback.warningTitle") {
        return "All data import completed with warnings";
      }

      if (key === "management.allData.feedback.successTitle") {
        return "All data import completed";
      }

      if (key === "management.allData.feedback.loadedFromFile") {
        return `Loaded from ${params?.["fileName"] ?? ""}.`;
      }

      if (key === "management.favoriteShips.feedback.warningTitle") {
        return "Favorite ships import completed with warnings";
      }

      if (key === "management.favoriteShips.feedback.successTitle") {
        return "Favorite ships import completed";
      }

      if (key === "management.favoriteShips.feedback.loadedFromFile") {
        return `Loaded from ${params?.["fileName"] ?? ""}.`;
      }

      if (key === "management.favoriteShips.feedback.stats.matched") {
        return `Matched ${params?.["count"] ?? 0} ships.`;
      }

      if (key === "management.favoriteShips.feedback.stats.added") {
        return `Added ${params?.["count"] ?? 0} ships.`;
      }

      if (key === "management.favoriteShips.feedback.stats.alreadyFavorited") {
        return `Already favorited ${params?.["count"] ?? 0} ships.`;
      }

      if (key === "management.favoriteShips.feedback.stats.duplicates") {
        return `Duplicates ${params?.["count"] ?? 0} ships.`;
      }

      if (key === "management.favoriteShips.feedback.stats.invalid") {
        return `Invalid ${params?.["count"] ?? 0} ships.`;
      }

      if (key === "management.favoriteShips.feedback.stats.unknown") {
        return `Unknown ${params?.["count"] ?? 0} ships.`;
      }

      if (key.startsWith("management.favoriteShips.errors.")) {
        return key;
      }

      if (key === "common.defaults.untitledBox") {
        return "Untitled Box";
      }

      if (key === "management.favorites.title") {
        return "Favorites";
      }

      if (key === "analytics.status.unknown") {
        return "No choice saved yet";
      }

      if (key === "management.favoriteShips.title") {
        return "Favorite Ships";
      }

      if (key === "management.characterBoxes.title") {
        return "Character Boxes";
      }

      if (key === "management.savedTeams.title") {
        return "Saved Teams";
      }

      if (key === "management.savedEnemies.title") {
        return "Saved Enemies";
      }

      if (key.startsWith("management.allData.errors.")) {
        return key;
      }

      if (key === "import.loadedFromFile" || key === "bulkImport.loadedFromFile") {
        return `Loaded ${params?.["fileName"] ?? ""}.`;
      }

      if (
        key === "import.warningTitle" ||
        key === "bulkImport.warningTitle" ||
        key === "import.successTitle" ||
        key === "bulkImport.successTitle" ||
        key === "import.errorTitle" ||
        key === "bulkImport.errorTitle"
      ) {
        return key;
      }

      if (key.endsWith(".added")) {
        return `Added ${params?.["count"] ?? 0}.`;
      }

      if (key.endsWith(".updated")) {
        return `Updated ${params?.["count"] ?? 0}.`;
      }

      if (key.endsWith(".invalid")) {
        return `Invalid ${params?.["count"] ?? 0}.`;
      }

      if (key.endsWith(".duplicates")) {
        return `Duplicates ${params?.["count"] ?? 0}.`;
      }

      if (key.endsWith(".unknownCharacters")) {
        return `Unknown characters ${params?.["count"] ?? 0}.`;
      }

      if (key.endsWith(".unknownSlots")) {
        return `Unknown slots ${params?.["count"] ?? 0}.`;
      }

      if (key === "import.removedDuplicates") {
        return `Removed ${params?.["count"] ?? 0} duplicates.`;
      }

      if (key.startsWith("management.characterBoxes.errors.")) {
        return key;
      }

      if (key === "import.stats.matched") {
        return `Matched ${params?.["count"] ?? 0}.`;
      }

      if (key === "import.stats.alreadyFavorited") {
        return `Already favorited ${params?.["count"] ?? 0}.`;
      }

      if (key === "import.stats.unknownIds") {
        return `Unknown ids ${params?.["count"] ?? 0}.`;
      }

      return key;
    }),
  };
  const analyticsConsentService = {
    consent: analyticsConsent,
    accept: vi.fn().mockImplementation(async () => {
      analyticsConsent.set("accepted");
    }),
    reject: vi.fn().mockImplementation(async () => {
      analyticsConsent.set("rejected");
    }),
  };
  const page = new SettingsPage(
    repository as never,
    i18n as never,
    userState as never,
    analyticsConsentService as never,
    optcbxImport as never,
  );

  return { page, repository, userState, optcbxImport, i18n, analyticsConsentService };
}

function buildFile(name: string, content: string): File {
  return {
    name,
    text: vi.fn().mockResolvedValue(content),
  } as unknown as File;
}

function createFileEvent(file: File): Event {
  return {
    target: {
      files: [file],
    },
  } as unknown as Event;
}

function createTeam(id: string, slots: Array<number | null>) {
  return {
    id,
    name: id,
    notes: "",
    shipId: null,
    slots,
    createdAt: "2026-04-12T09:00:00.000Z",
    updatedAt: "2026-04-12T09:00:00.000Z",
  };
}

function createEnemy(id: string) {
  return {
    id,
    name: id,
    notes: "",
    imageDataUrl: null,
    selectedTypes: ["DEX"],
    selectedClasses: ["Fighter"],
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    createdAt: "2026-04-12T09:00:00.000Z",
    updatedAt: "2026-04-12T09:00:00.000Z",
  };
}

function createBox(id: string, characterIds: number[]) {
  return {
    id,
    name: id,
    characterIds,
    createdAt: "2026-04-12T09:00:00.000Z",
    updatedAt: "2026-04-12T09:00:00.000Z",
  };
}

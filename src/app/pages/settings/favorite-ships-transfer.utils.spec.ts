import "@angular/compiler";
import { describe, expect, it } from "vitest";

import {
  FavoriteShipsImportError,
  buildFavoriteShipsExportFilename,
  buildFavoriteShipsTransferPayload,
  filterAvailableFavoriteShips,
  parseFavoriteShipsImportPayload,
  sanitizeFavoriteShipsImportPayload,
} from "./favorite-ships-transfer.utils";

describe("favorite ships transfer utils", () => {
  it("builds an export payload with normalized ids and ship names", () => {
    expect(
      buildFavoriteShipsTransferPayload(
        [9002, 9002, -1, 9001],
        [
          {
            id: 9001,
            name: " Going Merry ",
            thumb: null,
            thumbUrl: null,
            description: "",
          },
          {
            id: 9002,
            name: "Thousand Sunny",
            thumb: null,
            thumbUrl: null,
            description: "",
          },
        ],
        "2026-04-12T09:00:00.000Z",
      ),
    ).toEqual({
      schemaVersion: 1,
      source: "favorite-ships",
      exportedAt: "2026-04-12T09:00:00.000Z",
      ships: [
        { id: 9002, name: "Thousand Sunny" },
        { id: 9001, name: "Going Merry" },
      ],
    });
  });

  it("parses a valid favorite ships payload", () => {
    expect(
      parseFavoriteShipsImportPayload(
        JSON.stringify({
          schemaVersion: 1,
          source: "favorite-ships",
          exportedAt: "2026-04-12T09:00:00.000Z",
          ships: [{ id: 9001, name: "Going Merry" }],
        }),
      ),
    ).toEqual({
      schemaVersion: 1,
      source: "favorite-ships",
      exportedAt: "2026-04-12T09:00:00.000Z",
      ships: [{ id: 9001, name: "Going Merry" }],
    });
  });

  it("rejects invalid json and unsupported schemas", () => {
    expect(() => parseFavoriteShipsImportPayload("{invalid")).toThrowError(
      new FavoriteShipsImportError("management.favoriteShips.errors.invalidJson"),
    );
    expect(() =>
      parseFavoriteShipsImportPayload(
        JSON.stringify({
          schemaVersion: 2,
          source: "favorite-ships",
          exportedAt: "2026-04-12T09:00:00.000Z",
          ships: [],
        }),
      ),
    ).toThrowError(new FavoriteShipsImportError("management.favoriteShips.errors.unsupportedSchema"));
  });

  it("sanitizes duplicates and invalid ships", () => {
    expect(
      sanitizeFavoriteShipsImportPayload({
        schemaVersion: 1,
        source: "favorite-ships",
        exportedAt: "2026-04-12T09:00:00.000Z",
        ships: [
          { id: 9001, name: "Going Merry" },
          { id: 9001, name: "Going Merry duplicate" },
          { id: -1, name: "Invalid" },
          { name: "Missing id" } as never,
          { id: 9002, name: " Thousand Sunny " },
        ],
      }),
    ).toEqual({
      duplicateIdCount: 1,
      invalidShipCount: 2,
      ships: [
        { id: 9001, name: "Going Merry duplicate" },
        { id: 9002, name: "Thousand Sunny" },
      ],
    });
  });

  it("filters out ships that do not exist in the current build", () => {
    expect(
      filterAvailableFavoriteShips(
        [
          { id: 9001, name: "Going Merry" },
          { id: 9999, name: "Ghost Ship" },
          { id: 9002, name: "Thousand Sunny" },
        ],
        new Set([9001, 9002]),
      ),
    ).toEqual({
      ships: [
        { id: 9001, name: "Going Merry" },
        { id: 9002, name: "Thousand Sunny" },
      ],
      unknownShipCount: 1,
    });
  });

  it("builds a deterministic export filename from the timestamp", () => {
    expect(buildFavoriteShipsExportFilename("2026-04-12T09:00:07.000Z")).toBe(
      "favorite-ships-20260412-090007.json",
    );
  });
});

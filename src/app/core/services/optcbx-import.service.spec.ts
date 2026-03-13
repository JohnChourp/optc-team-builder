import { describe, expect, it, vi } from "vitest";

import { type CharacterListItem } from "../models/optc.models";
import { OptcbxImportService } from "./optcbx-import.service";

describe("OptcbxImportService", () => {
  it("parses a valid OPTCbx export with characters only", () => {
    const service = createService();

    const result = service.parseExport(
      JSON.stringify({
        characters: [
          { name: "Luffy", number: 1001 },
          { name: "Zoro", number: 1002 },
        ],
      }),
    );

    expect(result.importedNumbers).toEqual([1001, 1002]);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it("parses a valid OPTCbx export that also contains thumbnails", () => {
    const service = createService();

    const result = service.parseExport(
      JSON.stringify({
        characters: [{ name: "Nami", number: 2001 }],
        thumbnails: ["thumb.png"],
      }),
    );

    expect(result.importedNumbers).toEqual([2001]);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it("rejects invalid JSON", () => {
    const service = createService();

    expect(() => service.parseExport("{invalid")).toThrow("The selected file is not valid JSON.");
  });

  it("rejects payloads without a valid characters array", () => {
    const service = createService();

    expect(() => service.parseExport(JSON.stringify({ thumbnails: [] }))).toThrow(
      "The selected file is not a raw OPTCbx export.",
    );
  });

  it("removes duplicate character ids from the import", () => {
    const service = createService();

    const result = service.parseExport(
      JSON.stringify({
        characters: [
          { number: 3001 },
          { number: 3001 },
          { number: "3002" },
        ],
      }),
    );

    expect(result.importedNumbers).toEqual([3001, 3002]);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it("reports unmatched ids that are not present in the local dataset", async () => {
    const service = createService([
      createCharacter(4001),
      createCharacter(4003),
    ]);

    const parsedImport = service.parseExport(
      JSON.stringify({
        characters: [{ number: 4001 }, { number: 4002 }, { number: 4003 }],
      }),
    );
    const result = await service.buildMergeImportResult(parsedImport, []);

    expect(result.matchedIds).toEqual([4001, 4003]);
    expect(result.unmatchedIds).toEqual([4002]);
  });

  it("computes merge counts against existing favorites", async () => {
    const service = createService([
      createCharacter(5001),
      createCharacter(5002),
      createCharacter(5003),
    ]);

    const parsedImport = service.parseExport(
      JSON.stringify({
        characters: [{ number: 5001 }, { number: 5002 }, { number: 5003 }],
      }),
    );
    const result = await service.buildMergeImportResult(parsedImport, [5002, 9999]);
    const mergedIds = service.mergeFavoriteIds(result.matchedIds, [5002, 9999]);

    expect(result.addedCount).toBe(2);
    expect(result.alreadyFavoritedCount).toBe(1);
    expect(mergedIds).toEqual([5001, 5002, 5003, 9999]);
  });
});

function createService(returnCharacters: CharacterListItem[] = []): OptcbxImportService {
  const repository = {
    getCharactersByIds: vi.fn().mockResolvedValue(returnCharacters),
  };

  return new OptcbxImportService(repository as never);
}

function createCharacter(id: number): CharacterListItem {
  return {
    id,
    name: `Character ${id}`,
    type: "DEX",
    classes: ["Fighter"],
    primaryClass: "Fighter",
    secondaryClass: null,
    stars: 6,
    cost: 55,
    combo: 4,
    maxLevel: 99,
    maxExperience: 5000000,
    stats: {
      min: { hp: 1000, atk: 500, rcv: 100 },
      max: { hp: 3000, atk: 1500, rcv: 300 },
      growth: 1,
    },
    regionAvailability: {
      exactLocal: true,
      thumbnailGlobal: true,
      thumbnailJapan: false,
      fullTransparent: false,
    },
    assets: {
      exactLocal: null,
      thumbnailGlobal: null,
      thumbnailJapan: null,
      fullTransparent: null,
    },
    imageUrl: "assets/placeholders/character-card.svg",
  };
}

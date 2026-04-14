import "@angular/compiler";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import {
  buildCharacterBoxesExportFilename,
  buildCharacterBoxesTransferPayload,
  clearUnavailableCharacterBoxCharacterIds,
  downloadCharacterBoxesExport,
  parseCharacterBoxesImportPayload,
  sanitizeCharacterBoxesImportPayload,
} from "./character-boxes-transfer.utils";

describe("Character boxes transfer utils", () => {
  it("builds the transfer payload and export filename", () => {
    const payload = buildCharacterBoxesTransferPayload(
      [
        {
          id: "box-1",
          name: "Powerhouse Box",
          characterIds: [101, 202, 303],
          createdAt: "2026-04-13T09:00:00.000Z",
          updatedAt: "2026-04-13T09:05:00.000Z",
        },
      ],
      "2026-04-13T11:15:30.000Z",
    );

    expect(payload).toEqual({
      schemaVersion: 1,
      source: "character-boxes",
      exportedAt: "2026-04-13T11:15:30.000Z",
      boxes: [
        {
          id: "box-1",
          name: "Powerhouse Box",
          characterIds: [101, 202, 303],
          createdAt: "2026-04-13T09:00:00.000Z",
          updatedAt: "2026-04-13T09:05:00.000Z",
        },
      ],
    });
    expect(buildCharacterBoxesExportFilename(payload.exportedAt)).toBe(
      "character-boxes-20260413-111530.json",
    );
  });

  it("downloads the character boxes payload as json", async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const payload = buildCharacterBoxesTransferPayload(
      [
        {
          id: "box-1",
          name: "Powerhouse Box",
          characterIds: [101, 202, 303],
          createdAt: "2026-04-13T09:00:00.000Z",
          updatedAt: "2026-04-13T09:05:00.000Z",
        },
      ],
      "2026-04-13T11:15:30.000Z",
    );
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    let downloadedBlob: Blob | null = null;
    const urlRef = {
      createObjectURL: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return "blob:character-boxes";
      }),
      revokeObjectURL: vi.fn(),
    };

    downloadCharacterBoxesExport(payload, dom.window.document, urlRef);

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith("blob:character-boxes");
    expect(downloadedBlob).not.toBeNull();
    expect(JSON.parse(await downloadedBlob!.text())).toEqual(payload);
  });

  it("parses and sanitizes imported payloads while collapsing duplicates", () => {
    const payload = parseCharacterBoxesImportPayload(
      JSON.stringify({
        schemaVersion: 1,
        source: "character-boxes",
        exportedAt: "2026-04-13T09:00:00.000Z",
        boxes: [
          {
            id: " box-1 ",
            name: "",
            characterIds: [101, 101, "bad", 202, 0],
            createdAt: "bad-date",
            updatedAt: "2026-04-13T09:05:00.000Z",
          },
          {
            name: "Invalid box without id",
          },
          {
            id: "box-1",
            name: "Updated import",
            characterIds: [404, 505, 505, 606],
            createdAt: "2026-04-13T10:00:00.000Z",
            updatedAt: "2026-04-13T10:05:00.000Z",
          },
        ],
      }),
    );
    const sanitized = sanitizeCharacterBoxesImportPayload(payload, {
      now: "2026-04-13T12:00:00.000Z",
      untitledBoxName: "Untitled Box",
    });

    expect(sanitized.invalidBoxCount).toBe(1);
    expect(sanitized.duplicateIdCount).toBe(1);
    expect(sanitized.boxes).toEqual([
      {
        id: "box-1",
        name: "Updated import",
        characterIds: [404, 505, 606],
        createdAt: "2026-04-13T10:00:00.000Z",
        updatedAt: "2026-04-13T10:05:00.000Z",
      },
    ]);
  });

  it("clears unavailable character ids from imported boxes", () => {
    const result = clearUnavailableCharacterBoxCharacterIds(
      [
        {
          id: "box-1",
          name: "Imported Box",
          characterIds: [101, 999, 202, 303, 404],
          createdAt: "2026-04-13T10:00:00.000Z",
          updatedAt: "2026-04-13T10:05:00.000Z",
        },
      ],
      new Set([101, 202, 404]),
    );

    expect(result.unknownCharacterIdCount).toBe(2);
    expect(result.boxes[0]?.characterIds).toEqual([101, 202, 404]);
  });

  it("rejects invalid json", () => {
    try {
      parseCharacterBoxesImportPayload("{");
      throw new Error("Expected invalid json to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        key: "management.characterBoxes.errors.invalidJson",
      });
    }
  });

  it("rejects invalid payloads", () => {
    try {
      parseCharacterBoxesImportPayload(JSON.stringify([]));
      throw new Error("Expected invalid payload to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        key: "management.characterBoxes.errors.invalidPayload",
      });
    }
  });

  it("rejects unsupported schemas", () => {
    try {
      parseCharacterBoxesImportPayload(
        JSON.stringify({
          schemaVersion: 2,
          source: "future-character-boxes",
          exportedAt: "2026-04-13T09:00:00.000Z",
          boxes: [],
        }),
      );
      throw new Error("Expected unsupported schema to throw.");
    } catch (error) {
      expect(error).toMatchObject({
        key: "management.characterBoxes.errors.unsupportedSchema",
      });
    }
  });
});

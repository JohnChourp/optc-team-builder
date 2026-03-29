import "@angular/compiler";
import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import {
  buildSavedTeamsExportFilename,
  buildSavedTeamsTransferPayload,
  clearUnavailableSavedTeamSlots,
  downloadSavedTeamsExport,
  parseSavedTeamsImportPayload,
  sanitizeSavedTeamsImportPayload,
} from "./saved-teams-transfer.utils";

describe("Saved teams transfer utils", () => {
  it("builds the transfer payload and export filename", () => {
    const payload = buildSavedTeamsTransferPayload(
      [
        {
          id: "team-1",
          name: "Slashers",
          notes: "Burst",
          shipId: null,
          slots: [101, null, 202, null, null, 303],
          createdAt: "2026-03-29T10:00:00.000Z",
          updatedAt: "2026-03-29T10:00:00.000Z",
        },
      ],
      "2026-03-29T14:05:09.000Z",
    );

    expect(payload).toEqual({
      schemaVersion: 1,
      source: "saved-teams",
      exportedAt: "2026-03-29T14:05:09.000Z",
      teams: [
        {
          id: "team-1",
          name: "Slashers",
          notes: "Burst",
          shipId: null,
          slots: [101, null, 202, null, null, 303],
          createdAt: "2026-03-29T10:00:00.000Z",
          updatedAt: "2026-03-29T10:00:00.000Z",
        },
      ],
    });
    expect(buildSavedTeamsExportFilename(payload.exportedAt)).toBe("saved-teams-20260329-140509.json");
  });

  it("downloads the selected teams payload as json", async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const payload = buildSavedTeamsTransferPayload(
      [
        {
          id: "team-1",
          name: "Slashers",
          notes: "Burst",
          shipId: null,
          slots: [101, null, 202, null, null, 303],
          createdAt: "2026-03-29T10:00:00.000Z",
          updatedAt: "2026-03-29T10:00:00.000Z",
        },
      ],
      "2026-03-29T14:05:09.000Z",
    );
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    let downloadedBlob: Blob | null = null;
    const urlRef = {
      createObjectURL: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return "blob:saved-teams";
      }),
      revokeObjectURL: vi.fn(),
    };

    downloadSavedTeamsExport(payload, dom.window.document, urlRef);

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith("blob:saved-teams");
    expect(downloadedBlob).not.toBeNull();
    expect(JSON.parse(await downloadedBlob!.text())).toEqual(payload);
  });

  it("parses and sanitizes imported payloads while collapsing duplicates", () => {
    const payload = parseSavedTeamsImportPayload(
      JSON.stringify({
        schemaVersion: 1,
        source: "saved-teams",
        exportedAt: "2026-03-29T10:00:00.000Z",
        teams: [
          {
            id: " team-1 ",
            name: "",
            notes: 7,
            shipId: -5,
            slots: [101, null, "bad", 202, 0, 303, 404],
            createdAt: "bad-date",
            updatedAt: "2026-03-29T10:05:00.000Z",
          },
          {
            name: "Invalid team without id",
          },
          {
            id: "team-1",
            name: "Updated import",
            notes: "  merged  ",
            shipId: 9001,
            slots: [404, 505, 606],
            createdAt: "2026-03-29T11:00:00.000Z",
            updatedAt: "2026-03-29T11:05:00.000Z",
          },
        ],
      }),
    );
    const sanitized = sanitizeSavedTeamsImportPayload(payload, {
      now: "2026-03-29T12:00:00.000Z",
      untitledTeamName: "Untitled Crew",
    });

    expect(sanitized.invalidTeamCount).toBe(1);
    expect(sanitized.duplicateIdCount).toBe(1);
    expect(sanitized.teams).toEqual([
      {
        id: "team-1",
        name: "Updated import",
        notes: "merged",
        shipId: 9001,
        slots: [404, 505, 606, null, null, null],
        createdAt: "2026-03-29T11:00:00.000Z",
        updatedAt: "2026-03-29T11:05:00.000Z",
      },
    ]);
  });

  it("clears unavailable character ids from imported slots", () => {
    const result = clearUnavailableSavedTeamSlots(
      [
        {
          id: "team-1",
          name: "Imported",
          notes: "",
          shipId: null,
          slots: [101, 999, null, 202, 303, 404],
          createdAt: "2026-03-29T11:00:00.000Z",
          updatedAt: "2026-03-29T11:05:00.000Z",
        },
      ],
      new Set([101, 202, 404]),
    );

    expect(result.unknownSlotCount).toBe(2);
    expect(result.teams[0]?.slots).toEqual([101, null, null, 202, null, 404]);
  });
});

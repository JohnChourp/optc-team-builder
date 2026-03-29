import "@angular/compiler";
import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import {
  buildOptcbxFavoritesExportFilename,
  buildOptcbxFavoritesExportPayload,
  downloadOptcbxFavoritesExport,
} from "./characters-favorites.utils";

describe("Characters favorites export helpers", () => {
  it("builds an optcbx-compatible payload with unresolved id fallback", () => {
    const payload = buildOptcbxFavoritesExportPayload(
      [103, 101, 103, 999, 0, -2],
      [
        { id: 101, name: "Roronoa Zoro" },
        { id: 103, name: "Monkey D. Luffy" },
      ] as never,
    );

    expect(payload).toEqual({
      characters: [
        { number: 103, name: "Monkey D. Luffy" },
        { number: 101, name: "Roronoa Zoro" },
        { number: 999, name: "" },
      ],
    });
  });

  it("builds the exporter filename with the expected timestamp format", () => {
    expect(buildOptcbxFavoritesExportFilename(new Date(2026, 2, 25, 14, 5, 9))).toBe(
      "optcbx-favorites-20260325-140509.json",
    );
  });

  it("does not start a download when the payload is missing", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const urlRef = {
      createObjectURL: vi.fn(),
      revokeObjectURL: vi.fn(),
    };

    downloadOptcbxFavoritesExport(null, new Date(2026, 2, 25, 14, 5, 9), dom.window.document, urlRef);

    expect(urlRef.createObjectURL).not.toHaveBeenCalled();
    expect(urlRef.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("downloads the exporter-compatible payload with the expected filename", async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const payload = buildOptcbxFavoritesExportPayload(
      [101, 999],
      [{ id: 101, name: "Nami" }] as never,
    );
    const clickSpy = vi
      .spyOn(dom.window.HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const urlRef = {
      createObjectURL: vi.fn((blob: Blob) => {
        downloadedBlob = blob;
        return "blob:collection-favorites";
      }),
      revokeObjectURL: vi.fn(),
    };
    let downloadedBlob: Blob | null = null;

    downloadOptcbxFavoritesExport(
      payload,
      new Date(2026, 2, 25, 14, 5, 9),
      dom.window.document,
      urlRef,
    );

    expect(urlRef.createObjectURL).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(urlRef.revokeObjectURL).toHaveBeenCalledWith("blob:collection-favorites");
    expect(downloadedBlob).not.toBeNull();

    const exportedJson = JSON.parse(await downloadedBlob!.text()) as ReturnType<
      typeof buildOptcbxFavoritesExportPayload
    >;

    expect(exportedJson).toEqual({
      characters: [
        { number: 101, name: "Nami" },
        { number: 999, name: "" },
      ],
    });
  });
});

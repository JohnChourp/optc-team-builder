import { Injectable } from "@angular/core";

import { type OptcbxImportResult, type OptcbxParsedImport } from "../models/optcbx-import.models";
import { OptcRepositoryService } from "./optc-repository.service";

interface OptcbxCharacterRecord {
  number?: unknown;
}

interface OptcbxExportPayload {
  characters: OptcbxCharacterRecord[];
  thumbnails?: unknown[];
}

@Injectable({ providedIn: "root" })
export class OptcbxImportService {
  public constructor(private readonly repository: OptcRepositoryService) {}

  public parseExport(rawContent: string): OptcbxParsedImport {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawContent) as unknown;
    } catch {
      throw new Error("The selected file is not valid JSON.");
    }

    if (!this.isExportPayload(parsed)) {
      throw new Error("The selected file is not a raw OPTCbx export.");
    }

    const seen = new Set<number>();
    const importedNumbers: number[] = [];
    let duplicatesRemoved = 0;

    parsed.characters.forEach((entry, index) => {
      const normalizedNumber = this.normalizeCharacterNumber(entry?.number);

      if (normalizedNumber === null) {
        throw new Error(`Character entry ${index + 1} is missing a valid number field.`);
      }

      if (seen.has(normalizedNumber)) {
        duplicatesRemoved += 1;
        return;
      }

      seen.add(normalizedNumber);
      importedNumbers.push(normalizedNumber);
    });

    if (!importedNumbers.length) {
      throw new Error("The OPTCbx export does not contain any character ids.");
    }

    return {
      importedNumbers,
      duplicatesRemoved,
    };
  }

  public async buildMergeImportResult(
    parsedImport: OptcbxParsedImport,
    existingFavoriteIds: number[],
  ): Promise<OptcbxImportResult> {
    const matchedCharacters = await this.repository.getCharactersByIds(parsedImport.importedNumbers);
    const matchedIds = matchedCharacters.map((character) => character.id);
    const matchedIdSet = new Set(matchedIds);
    const unmatchedIds = parsedImport.importedNumbers.filter((id) => !matchedIdSet.has(id));
    const existingFavoriteSet = new Set(existingFavoriteIds);
    const addedCount = matchedIds.filter((id) => !existingFavoriteSet.has(id)).length;

    return {
      importedNumbers: parsedImport.importedNumbers,
      matchedIds,
      unmatchedIds,
      duplicatesRemoved: parsedImport.duplicatesRemoved,
      addedCount,
      alreadyFavoritedCount: matchedIds.length - addedCount,
    };
  }

  public mergeFavoriteIds(matchedIds: number[], existingFavoriteIds: number[]): number[] {
    const matchedIdSet = new Set(matchedIds);
    const nextFavoriteIds = [...matchedIds];

    existingFavoriteIds.forEach((id) => {
      if (!matchedIdSet.has(id)) {
        nextFavoriteIds.push(id);
      }
    });

    return nextFavoriteIds;
  }

  private isExportPayload(value: unknown): value is OptcbxExportPayload {
    return Boolean(
      value &&
        typeof value === "object" &&
        "characters" in value &&
        Array.isArray((value as OptcbxExportPayload).characters),
    );
  }

  private normalizeCharacterNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }

    return null;
  }
}

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

/**
 * 869f6td63. The scope every {@link OptcbxImportError} key lives in. The Characters screen owns the
 * OPTCbx import; Settings reaches the same parser from its favourites import, Import all data and
 * the inventory capture, and translates from here too.
 */
export const OPTCBX_IMPORT_I18N_SCOPE = "characters";

export type OptcbxImportErrorKey =
  | "import.errors.notJson"
  | "import.errors.notOptcbxExport"
  | "import.errors.entryWithoutNumber"
  | "import.errors.noCharacters";

/**
 * 869f6td63. A file the parser turned down, as a key a screen translates.
 *
 * The parser used to throw plain `Error`s, and every screen showed their English `message` as it
 * was - on the Greek UI too, where the i18n guards could not see it, because they compare keys.
 * `message` is still the parser's own English words: the Recent problems log on Settings keeps
 * them, and nothing else shows them.
 */
export class OptcbxImportError extends Error {
  public constructor(
    message: string,
    public readonly key: OptcbxImportErrorKey,
    public readonly parameters?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "OptcbxImportError";
  }
}

@Injectable({ providedIn: "root" })
export class OptcbxImportService {
  public constructor(private readonly repository: OptcRepositoryService) {}

  public parseExport(rawContent: string): OptcbxParsedImport {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawContent) as unknown;
    } catch {
      throw new OptcbxImportError("The selected file is not valid JSON.", "import.errors.notJson");
    }

    return this.parseExportPayload(parsed);
  }

  public parseExportPayload(value: unknown): OptcbxParsedImport {
    if (!this.isExportPayload(value)) {
      throw new OptcbxImportError(
        "The selected file is not a raw OPTCbx export.",
        "import.errors.notOptcbxExport",
      );
    }

    const seen = new Set<number>();
    const importedNumbers: number[] = [];
    let duplicatesRemoved = 0;

    value.characters.forEach((entry, index) => {
      const normalizedNumber = this.normalizeCharacterNumber(entry?.number);

      if (normalizedNumber === null) {
        throw new OptcbxImportError(
          `Character entry ${index + 1} is missing a valid number field.`,
          "import.errors.entryWithoutNumber",
          { entry: index + 1 },
        );
      }

      if (seen.has(normalizedNumber)) {
        duplicatesRemoved += 1;
        return;
      }

      seen.add(normalizedNumber);
      importedNumbers.push(normalizedNumber);
    });

    if (!importedNumbers.length) {
      throw new OptcbxImportError(
        "The OPTCbx export does not contain any character ids.",
        "import.errors.noCharacters",
      );
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

    /*
     * 869f26084. The other direction of the same comparison.
     *
     * A favourite qualifies for removal only when BOTH are true: this import did not mention it,
     * AND we can still resolve it to a character. The second half is the trap the task names -
     * "this import did not mention it" and "we could not recognise it" look identical in a count
     * and mean opposite things. A favourite we cannot resolve says something about OUR dataset,
     * not about what the reader owns, so it is counted and never offered.
     */
    const resolvedFavorites = await this.repository.getCharactersByIds(existingFavoriteIds);
    const resolvedFavoriteIdSet = new Set(resolvedFavorites.map((character) => character.id));
    const removableIds = existingFavoriteIds.filter(
      (id) => resolvedFavoriteIdSet.has(id) && !matchedIdSet.has(id),
    );

    return {
      importedNumbers: parsedImport.importedNumbers,
      matchedIds,
      unmatchedIds,
      duplicatesRemoved: parsedImport.duplicatesRemoved,
      addedCount,
      alreadyFavoritedCount: matchedIds.length - addedCount,
      removableIds,
      unresolvedFavoriteCount: existingFavoriteIds.length - resolvedFavoriteIdSet.size,
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

  /**
   * 869f26084. Applies a removal the reader explicitly chose, and nothing else.
   *
   * Takes the ids to remove rather than recomputing them, so the list the reader saw is exactly
   * the list that is applied - a second computation between showing and applying is how a control
   * ends up deleting something that was never on screen.
   *
   * Ids outside `removableIds` are ignored rather than trusted, so a caller cannot widen a removal
   * past what `buildMergeImportResult` was willing to offer.
   */
  public removeFavoriteIds(
    idsToRemove: readonly number[],
    existingFavoriteIds: readonly number[],
    removableIds: readonly number[],
  ): number[] {
    const offeredSet = new Set(removableIds);
    const removeSet = new Set(idsToRemove.filter((id) => offeredSet.has(id)));

    return existingFavoriteIds.filter((id) => !removeSet.has(id));
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

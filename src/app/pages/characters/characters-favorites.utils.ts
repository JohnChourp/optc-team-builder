import { type CharacterListItem } from "../../core/models/optc.models";

export interface OptcbxFavoritesExportCharacter {
  number: number;
  name: string;
}

export interface OptcbxFavoritesExportPayload {
  characters: OptcbxFavoritesExportCharacter[];
}

function normalizeFavoriteIds(favoriteIds: number[]): number[] {
  const seen = new Set<number>();

  return favoriteIds.filter((favoriteId) => {
    if (!Number.isInteger(favoriteId) || favoriteId <= 0 || seen.has(favoriteId)) {
      return false;
    }

    seen.add(favoriteId);
    return true;
  });
}

function padTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildOptcbxFavoritesExportPayload(
  favoriteIds: number[],
  favoriteCharacters: CharacterListItem[],
): OptcbxFavoritesExportPayload {
  const favoriteCharacterMap = new Map(
    favoriteCharacters.map((character) => [character.id, character] as const),
  );

  return {
    characters: normalizeFavoriteIds(favoriteIds).map((favoriteId) => ({
      number: favoriteId,
      name: favoriteCharacterMap.get(favoriteId)?.name.trim() ?? "",
    })),
  };
}

export function buildOptcbxFavoritesExportFilename(exportedAt = new Date()): string {
  return (
    `optcbx-favorites-${exportedAt.getFullYear()}` +
    `${padTimestampPart(exportedAt.getMonth() + 1)}` +
    `${padTimestampPart(exportedAt.getDate())}-` +
    `${padTimestampPart(exportedAt.getHours())}` +
    `${padTimestampPart(exportedAt.getMinutes())}` +
    `${padTimestampPart(exportedAt.getSeconds())}.json`
  );
}

export function downloadOptcbxFavoritesExport(
  payload: OptcbxFavoritesExportPayload | null,
  exportedAt = new Date(),
  documentRef: Document = document,
  urlRef: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlRef.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2) + "\n"], {
      type: "application/json;charset=utf-8",
    }),
  );
  const anchor = documentRef.createElement("a");

  anchor.href = objectUrl;
  anchor.download = buildOptcbxFavoritesExportFilename(exportedAt);
  anchor.style.display = "none";
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

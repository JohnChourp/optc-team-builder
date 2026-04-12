import { type ShipRecord } from "../../core/models/optc.models";

export interface FavoriteShipsTransferShip {
  id: number;
  name: string;
}

export interface FavoriteShipsTransferPayload {
  schemaVersion: 1;
  source: "favorite-ships";
  exportedAt: string;
  ships: FavoriteShipsTransferShip[];
}

export interface FavoriteShipsImportResult {
  ships: FavoriteShipsTransferShip[];
  duplicateIdCount: number;
  invalidShipCount: number;
}

export interface FavoriteShipsAvailabilityResult {
  ships: FavoriteShipsTransferShip[];
  unknownShipCount: number;
}

export class FavoriteShipsImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = "FavoriteShipsImportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeShipName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function padTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

function buildExportDate(exportedAt: string): Date {
  const parsedDate = new Date(exportedAt);

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

export function buildFavoriteShipsTransferPayload(
  favoriteShipIds: number[],
  ships: ShipRecord[],
  exportedAt = new Date().toISOString(),
): FavoriteShipsTransferPayload {
  const shipMap = new Map(ships.map((ship) => [ship.id, ship] as const));
  const seen = new Set<number>();

  return {
    schemaVersion: 1,
    source: "favorite-ships",
    exportedAt,
    ships: favoriteShipIds.flatMap((shipId) => {
      if (!Number.isInteger(shipId) || shipId <= 0 || seen.has(shipId)) {
        return [];
      }

      seen.add(shipId);

      return [
        {
          id: shipId,
          name: shipMap.get(shipId)?.name.trim() ?? "",
        },
      ];
    }),
  };
}

export function buildFavoriteShipsExportFilename(exportedAt: string): string {
  const exactTimestampMatch = exportedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );

  if (exactTimestampMatch) {
    const [, year, month, day, hours, minutes, seconds] = exactTimestampMatch;

    return `favorite-ships-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
  }

  const exportDate = buildExportDate(exportedAt);

  return (
    `favorite-ships-${exportDate.getFullYear()}` +
    `${padTimestampPart(exportDate.getMonth() + 1)}` +
    `${padTimestampPart(exportDate.getDate())}-` +
    `${padTimestampPart(exportDate.getHours())}` +
    `${padTimestampPart(exportDate.getMinutes())}` +
    `${padTimestampPart(exportDate.getSeconds())}.json`
  );
}

export function downloadFavoriteShipsExport(
  payload: FavoriteShipsTransferPayload | null,
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
  anchor.download = buildFavoriteShipsExportFilename(payload.exportedAt);
  anchor.style.display = "none";
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

export function parseFavoriteShipsImportPayload(rawContent: string): FavoriteShipsTransferPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new FavoriteShipsImportError("management.favoriteShips.errors.invalidJson");
  }

  if (!isRecord(parsedPayload)) {
    throw new FavoriteShipsImportError("management.favoriteShips.errors.invalidPayload");
  }

  if (parsedPayload["schemaVersion"] !== 1 || parsedPayload["source"] !== "favorite-ships") {
    throw new FavoriteShipsImportError("management.favoriteShips.errors.unsupportedSchema");
  }

  if (
    typeof parsedPayload["exportedAt"] !== "string" ||
    !Array.isArray(parsedPayload["ships"])
  ) {
    throw new FavoriteShipsImportError("management.favoriteShips.errors.invalidPayload");
  }

  return {
    schemaVersion: 1,
    source: "favorite-ships",
    exportedAt: parsedPayload["exportedAt"],
    ships: parsedPayload["ships"] as FavoriteShipsTransferShip[],
  };
}

export function sanitizeFavoriteShipsImportPayload(
  payload: FavoriteShipsTransferPayload,
): FavoriteShipsImportResult {
  const sanitizedShips = new Map<number, FavoriteShipsTransferShip>();
  let duplicateIdCount = 0;
  let invalidShipCount = 0;

  payload.ships.forEach((ship) => {
    if (!isRecord(ship)) {
      invalidShipCount += 1;
      return;
    }

    const shipId = normalizePositiveInteger(ship["id"]);

    if (shipId === null) {
      invalidShipCount += 1;
      return;
    }

    if (sanitizedShips.has(shipId)) {
      duplicateIdCount += 1;
      sanitizedShips.delete(shipId);
    }

    sanitizedShips.set(shipId, {
      id: shipId,
      name: normalizeShipName(ship["name"]),
    });
  });

  return {
    ships: [...sanitizedShips.values()],
    duplicateIdCount,
    invalidShipCount,
  };
}

export function filterAvailableFavoriteShips(
  ships: FavoriteShipsTransferShip[],
  availableShipIds: Set<number>,
): FavoriteShipsAvailabilityResult {
  let unknownShipCount = 0;

  return {
    ships: ships.filter((ship) => {
      if (availableShipIds.has(ship.id)) {
        return true;
      }

      unknownShipCount += 1;
      return false;
    }),
    unknownShipCount,
  };
}

import { type CharacterBox } from "../../core/models/optc.models";

export interface CharacterBoxesTransferPayload {
  schemaVersion: 1;
  source: "character-boxes";
  exportedAt: string;
  boxes: CharacterBox[];
}

export interface CharacterBoxesImportSanitizeOptions {
  now?: string;
  untitledBoxName: string;
}

export interface CharacterBoxesImportResult {
  boxes: CharacterBox[];
  duplicateIdCount: number;
  invalidBoxCount: number;
}

export interface CharacterBoxesUnavailableCharacterResult {
  boxes: CharacterBox[];
  unknownCharacterIdCount: number;
}

export class CharacterBoxesImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = "CharacterBoxesImportError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue.length || Number.isNaN(Date.parse(normalizedValue))) {
    return fallback;
  }

  return normalizedValue;
}

function padTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

function buildExportDate(exportedAt: string): Date {
  const parsedDate = new Date(exportedAt);

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

function normalizeImportedCharacterIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenCharacterIds = new Set<number>();
  const normalizedCharacterIds: number[] = [];

  value.forEach((entry) => {
    const characterId = normalizePositiveInteger(entry);

    if (!characterId || seenCharacterIds.has(characterId)) {
      return;
    }

    seenCharacterIds.add(characterId);
    normalizedCharacterIds.push(characterId);
  });

  return normalizedCharacterIds;
}

function cloneCharacterBox(box: CharacterBox): CharacterBox {
  return {
    ...box,
    characterIds: [...box.characterIds],
  };
}

export function buildCharacterBoxesTransferPayload(
  boxes: CharacterBox[],
  exportedAt = new Date().toISOString(),
): CharacterBoxesTransferPayload {
  return {
    schemaVersion: 1,
    source: "character-boxes",
    exportedAt,
    boxes: boxes.map((box) => cloneCharacterBox(box)),
  };
}

export function buildCharacterBoxesExportFilename(exportedAt: string): string {
  const exactTimestampMatch = exportedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );

  if (exactTimestampMatch) {
    const [, year, month, day, hours, minutes, seconds] = exactTimestampMatch;

    return `character-boxes-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
  }

  const exportDate = buildExportDate(exportedAt);

  return (
    `character-boxes-${exportDate.getFullYear()}` +
    `${padTimestampPart(exportDate.getMonth() + 1)}` +
    `${padTimestampPart(exportDate.getDate())}-` +
    `${padTimestampPart(exportDate.getHours())}` +
    `${padTimestampPart(exportDate.getMinutes())}` +
    `${padTimestampPart(exportDate.getSeconds())}.json`
  );
}

export function downloadCharacterBoxesExport(
  payload: CharacterBoxesTransferPayload | null,
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
  anchor.download = buildCharacterBoxesExportFilename(payload.exportedAt);
  anchor.style.display = "none";
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

export function parseCharacterBoxesImportPayload(rawContent: string): CharacterBoxesTransferPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new CharacterBoxesImportError("management.characterBoxes.errors.invalidJson");
  }

  return parseCharacterBoxesImportPayloadValue(parsedPayload);
}

export function parseCharacterBoxesImportPayloadValue(
  parsedPayload: unknown,
): CharacterBoxesTransferPayload {
  if (!isRecord(parsedPayload)) {
    throw new CharacterBoxesImportError("management.characterBoxes.errors.invalidPayload");
  }

  if (parsedPayload["schemaVersion"] !== 1 || parsedPayload["source"] !== "character-boxes") {
    throw new CharacterBoxesImportError("management.characterBoxes.errors.unsupportedSchema");
  }

  if (
    typeof parsedPayload["exportedAt"] !== "string" ||
    !Array.isArray(parsedPayload["boxes"])
  ) {
    throw new CharacterBoxesImportError("management.characterBoxes.errors.invalidPayload");
  }

  return {
    schemaVersion: 1,
    source: "character-boxes",
    exportedAt: parsedPayload["exportedAt"],
    boxes: parsedPayload["boxes"] as CharacterBox[],
  };
}

export function sanitizeCharacterBoxesImportPayload(
  payload: CharacterBoxesTransferPayload,
  options: CharacterBoxesImportSanitizeOptions,
): CharacterBoxesImportResult {
  const fallbackTimestamp = normalizeTimestamp(payload.exportedAt, options.now ?? new Date().toISOString());
  const sanitizedBoxes = new Map<string, CharacterBox>();
  let invalidBoxCount = 0;
  let duplicateIdCount = 0;

  payload.boxes.forEach((box) => {
    if (!isRecord(box)) {
      invalidBoxCount += 1;
      return;
    }

    const normalizedBoxId = typeof box["id"] === "string" ? box["id"].trim() : "";

    if (!normalizedBoxId.length) {
      invalidBoxCount += 1;
      return;
    }

    const sanitizedBox: CharacterBox = {
      id: normalizedBoxId,
      name:
        typeof box["name"] === "string" && box["name"].trim().length
          ? box["name"].trim()
          : options.untitledBoxName,
      characterIds: normalizeImportedCharacterIds(box["characterIds"]),
      createdAt: normalizeTimestamp(box["createdAt"], fallbackTimestamp),
      updatedAt: normalizeTimestamp(box["updatedAt"], fallbackTimestamp),
    };

    if (sanitizedBoxes.has(sanitizedBox.id)) {
      duplicateIdCount += 1;
      sanitizedBoxes.delete(sanitizedBox.id);
    }

    sanitizedBoxes.set(sanitizedBox.id, sanitizedBox);
  });

  return {
    boxes: [...sanitizedBoxes.values()],
    duplicateIdCount,
    invalidBoxCount,
  };
}

export function clearUnavailableCharacterBoxCharacterIds(
  boxes: CharacterBox[],
  availableCharacterIds: Set<number>,
): CharacterBoxesUnavailableCharacterResult {
  let unknownCharacterIdCount = 0;

  return {
    boxes: boxes.map((box) => ({
      ...box,
      characterIds: box.characterIds.filter((characterId) => {
        if (availableCharacterIds.has(characterId)) {
          return true;
        }

        unknownCharacterIdCount += 1;
        return false;
      }),
    })),
    unknownCharacterIdCount,
  };
}

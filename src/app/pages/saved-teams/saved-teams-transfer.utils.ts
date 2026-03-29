import { type SavedTeam } from "../../core/models/optc.models";

export interface SavedTeamsTransferPayload {
  schemaVersion: 1;
  source: "saved-teams";
  exportedAt: string;
  teams: SavedTeam[];
}

export interface SavedTeamsImportSanitizeOptions {
  now?: string;
  untitledTeamName: string;
}

export interface SavedTeamsImportResult {
  teams: SavedTeam[];
  duplicateIdCount: number;
  invalidTeamCount: number;
}

export interface SavedTeamsUnavailableSlotResult {
  teams: SavedTeam[];
  unknownSlotCount: number;
}

export class SavedTeamsImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = "SavedTeamsImportError";
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

function normalizeImportedTeamSlots(value: unknown): Array<number | null> {
  const slots = Array.isArray(value) ? value : [];

  return Array.from({ length: 6 }, (_, index) => normalizePositiveInteger(slots[index]));
}

export function buildSavedTeamsTransferPayload(
  teams: SavedTeam[],
  exportedAt = new Date().toISOString(),
): SavedTeamsTransferPayload {
  return {
    schemaVersion: 1,
    source: "saved-teams",
    exportedAt,
    teams: teams.map((team) => ({
      ...team,
      slots: [...team.slots],
    })),
  };
}

export function buildSavedTeamsExportFilename(exportedAt: string): string {
  const exactTimestampMatch = exportedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );

  if (exactTimestampMatch) {
    const [, year, month, day, hours, minutes, seconds] = exactTimestampMatch;

    return `saved-teams-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
  }

  const exportDate = buildExportDate(exportedAt);

  return (
    `saved-teams-${exportDate.getFullYear()}` +
    `${padTimestampPart(exportDate.getMonth() + 1)}` +
    `${padTimestampPart(exportDate.getDate())}-` +
    `${padTimestampPart(exportDate.getHours())}` +
    `${padTimestampPart(exportDate.getMinutes())}` +
    `${padTimestampPart(exportDate.getSeconds())}.json`
  );
}

export function downloadSavedTeamsExport(
  payload: SavedTeamsTransferPayload | null,
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
  anchor.download = buildSavedTeamsExportFilename(payload.exportedAt);
  anchor.style.display = "none";
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

export function parseSavedTeamsImportPayload(rawContent: string): SavedTeamsTransferPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new SavedTeamsImportError("import.errors.invalidJson");
  }

  if (!isRecord(parsedPayload)) {
    throw new SavedTeamsImportError("import.errors.invalidPayload");
  }

  if (parsedPayload["schemaVersion"] !== 1 || parsedPayload["source"] !== "saved-teams") {
    throw new SavedTeamsImportError("import.errors.unsupportedSchema");
  }

  if (
    typeof parsedPayload["exportedAt"] !== "string" ||
    !Array.isArray(parsedPayload["teams"])
  ) {
    throw new SavedTeamsImportError("import.errors.invalidPayload");
  }

  return {
    schemaVersion: 1,
    source: "saved-teams",
    exportedAt: parsedPayload["exportedAt"],
    teams: parsedPayload["teams"] as SavedTeam[],
  };
}

export function sanitizeSavedTeamsImportPayload(
  payload: SavedTeamsTransferPayload,
  options: SavedTeamsImportSanitizeOptions,
): SavedTeamsImportResult {
  const fallbackTimestamp = normalizeTimestamp(payload.exportedAt, options.now ?? new Date().toISOString());
  const sanitizedTeams = new Map<string, SavedTeam>();
  let invalidTeamCount = 0;
  let duplicateIdCount = 0;

  payload.teams.forEach((team) => {
    if (!isRecord(team)) {
      invalidTeamCount += 1;
      return;
    }

    const normalizedTeamId = typeof team["id"] === "string" ? team["id"].trim() : "";

    if (!normalizedTeamId.length) {
      invalidTeamCount += 1;
      return;
    }

    const sanitizedTeam: SavedTeam = {
      id: normalizedTeamId,
      name:
        typeof team["name"] === "string" && team["name"].trim().length
          ? team["name"].trim()
          : options.untitledTeamName,
      notes: typeof team["notes"] === "string" ? team["notes"].trim() : "",
      shipId: normalizePositiveInteger(team["shipId"]),
      slots: normalizeImportedTeamSlots(team["slots"]),
      createdAt: normalizeTimestamp(team["createdAt"], fallbackTimestamp),
      updatedAt: normalizeTimestamp(team["updatedAt"], fallbackTimestamp),
    };

    if (sanitizedTeams.has(sanitizedTeam.id)) {
      duplicateIdCount += 1;
      sanitizedTeams.delete(sanitizedTeam.id);
    }

    sanitizedTeams.set(sanitizedTeam.id, sanitizedTeam);
  });

  return {
    teams: [...sanitizedTeams.values()],
    duplicateIdCount,
    invalidTeamCount,
  };
}

export function clearUnavailableSavedTeamSlots(
  teams: SavedTeam[],
  availableCharacterIds: Set<number>,
): SavedTeamsUnavailableSlotResult {
  let unknownSlotCount = 0;

  return {
    teams: teams.map((team) => ({
      ...team,
      slots: team.slots.map((slotId) => {
        if (typeof slotId !== "number") {
          return null;
        }

        if (availableCharacterIds.has(slotId)) {
          return slotId;
        }

        unknownSlotCount += 1;
        return null;
      }),
    })),
    unknownSlotCount,
  };
}

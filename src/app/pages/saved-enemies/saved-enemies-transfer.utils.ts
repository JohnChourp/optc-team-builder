import { type SavedEnemy } from "../../core/models/optc.models";

export interface SavedEnemiesTransferPayload {
  schemaVersion: 1;
  source: "saved-enemies";
  exportedAt: string;
  enemies: SavedEnemy[];
}

function padTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

function buildExportDate(exportedAt: string): Date {
  const parsedDate = new Date(exportedAt);

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

function buildTimestampSegment(exportedAt: string): string {
  const exactTimestampMatch = exportedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );

  if (exactTimestampMatch) {
    const [, year, month, day, hours, minutes, seconds] = exactTimestampMatch;

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }

  const exportDate = buildExportDate(exportedAt);

  return (
    `${exportDate.getFullYear()}` +
    `${padTimestampPart(exportDate.getMonth() + 1)}` +
    `${padTimestampPart(exportDate.getDate())}-` +
    `${padTimestampPart(exportDate.getHours())}` +
    `${padTimestampPart(exportDate.getMinutes())}` +
    `${padTimestampPart(exportDate.getSeconds())}`
  );
}

function buildSafeNameSegment(value: string): string {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return normalizedValue.length > 0 ? normalizedValue : "untitled";
}

function cloneSavedEnemy(enemy: SavedEnemy): SavedEnemy {
  return {
    ...enemy,
    selectedTypes: [...enemy.selectedTypes],
    selectedClasses: [...enemy.selectedClasses],
    requiredAbilities: enemy.requiredAbilities.map((requirement) => ({
      ...requirement,
      slotTokens: [...requirement.slotTokens],
    })),
    enemyMechanics: enemy.enemyMechanics.map((mechanic) => ({
      ...mechanic,
      triggerTags: [...mechanic.triggerTags],
      responseTags: [...mechanic.responseTags],
      conditionTags: [...mechanic.conditionTags],
    })),
  };
}

export function buildSavedEnemiesTransferPayload(
  enemies: SavedEnemy[],
  exportedAt = new Date().toISOString(),
): SavedEnemiesTransferPayload {
  return {
    schemaVersion: 1,
    source: "saved-enemies",
    exportedAt,
    enemies: enemies.map((enemy) => cloneSavedEnemy(enemy)),
  };
}

export function buildSavedEnemiesExportFilename(exportedAt: string): string {
  return `saved-enemies-${buildTimestampSegment(exportedAt)}.json`;
}

export function buildSavedEnemyExportFilename(enemyName: string, exportedAt: string): string {
  return `saved-enemy-${buildSafeNameSegment(enemyName)}-${buildTimestampSegment(exportedAt)}.json`;
}

export function downloadSavedEnemiesExport(
  payload: SavedEnemiesTransferPayload | null,
  documentReference: Document = document,
  urlReference: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlReference.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2) + "\n"], {
      type: "application/json;charset=utf-8",
    }),
  );
  const anchor = documentReference.createElement("a");
  const singleEnemy = payload.enemies.length === 1 ? payload.enemies[0] : null;

  anchor.href = objectUrl;
  anchor.download = singleEnemy
    ? buildSavedEnemyExportFilename(singleEnemy.name, payload.exportedAt)
    : buildSavedEnemiesExportFilename(payload.exportedAt);
  anchor.style.display = "none";
  documentReference.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlReference.revokeObjectURL(objectUrl);
  }
}

import { type LocalCharacterOverride } from '../../core/models/optc.models';
import { normalizeLocalCharacterOverride } from '../../core/services/character-overrides.utils';

export interface CharacterOverridesTransferPayload {
  schemaVersion: 1;
  source: 'character-overrides';
  exportedAt: string;
  overrides: LocalCharacterOverride[];
}

export interface CharacterOverridesImportResult {
  duplicateCharacterIdCount: number;
  invalidOverrideCount: number;
  overrides: LocalCharacterOverride[];
}

export class CharacterOverridesImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'CharacterOverridesImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function padTimestampPart(value: number): string {
  return String(value).padStart(2, '0');
}

function buildExportDate(exportedAt: string): Date {
  const parsedDate = new Date(exportedAt);

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
}

export function buildCharacterOverridesTransferPayload(
  overrides: LocalCharacterOverride[],
  exportedAt = new Date().toISOString(),
): CharacterOverridesTransferPayload {
  return {
    schemaVersion: 1,
    source: 'character-overrides',
    exportedAt,
    overrides: overrides.map(
      (override) => JSON.parse(JSON.stringify(override)) as LocalCharacterOverride,
    ),
  };
}

export function buildCharacterOverridesExportFilename(exportedAt: string): string {
  const exactTimestampMatch = exportedAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);

  if (exactTimestampMatch) {
    const [, year, month, day, hours, minutes, seconds] = exactTimestampMatch;

    return `character-overrides-${year}${month}${day}-${hours}${minutes}${seconds}.json`;
  }

  const exportDate = buildExportDate(exportedAt);

  return (
    `character-overrides-${exportDate.getFullYear()}` +
    `${padTimestampPart(exportDate.getMonth() + 1)}` +
    `${padTimestampPart(exportDate.getDate())}-` +
    `${padTimestampPart(exportDate.getHours())}` +
    `${padTimestampPart(exportDate.getMinutes())}` +
    `${padTimestampPart(exportDate.getSeconds())}.json`
  );
}

export function downloadCharacterOverridesExport(
  payload: CharacterOverridesTransferPayload | null,
  documentRef: Document = document,
  urlRef: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL,
): void {
  if (!payload) {
    return;
  }

  const objectUrl = urlRef.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2) + '\n'], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const anchor = documentRef.createElement('a');

  anchor.href = objectUrl;
  anchor.download = buildCharacterOverridesExportFilename(payload.exportedAt);
  anchor.style.display = 'none';
  documentRef.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    documentRef.body.removeChild(anchor);
    urlRef.revokeObjectURL(objectUrl);
  }
}

export function parseCharacterOverridesImportPayload(
  rawContent: string,
): CharacterOverridesTransferPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new CharacterOverridesImportError('management.characterOverrides.errors.invalidJson');
  }

  return parseCharacterOverridesImportPayloadValue(parsedPayload);
}

export function parseCharacterOverridesImportPayloadValue(
  parsedPayload: unknown,
): CharacterOverridesTransferPayload {
  if (!isRecord(parsedPayload)) {
    throw new CharacterOverridesImportError('management.characterOverrides.errors.invalidPayload');
  }

  if (parsedPayload['schemaVersion'] !== 1 || parsedPayload['source'] !== 'character-overrides') {
    throw new CharacterOverridesImportError(
      'management.characterOverrides.errors.unsupportedSchema',
    );
  }

  if (
    typeof parsedPayload['exportedAt'] !== 'string' ||
    !Array.isArray(parsedPayload['overrides'])
  ) {
    throw new CharacterOverridesImportError('management.characterOverrides.errors.invalidPayload');
  }

  return {
    schemaVersion: 1,
    source: 'character-overrides',
    exportedAt: parsedPayload['exportedAt'],
    overrides: parsedPayload['overrides'] as LocalCharacterOverride[],
  };
}

export function sanitizeCharacterOverridesImportPayload(
  payload: CharacterOverridesTransferPayload,
): CharacterOverridesImportResult {
  const sanitizedOverrides = new Map<number, LocalCharacterOverride>();
  let duplicateCharacterIdCount = 0;
  let invalidOverrideCount = 0;

  payload.overrides.forEach((override) => {
    const normalizedOverride = normalizeLocalCharacterOverride(override);

    if (!normalizedOverride) {
      invalidOverrideCount += 1;
      return;
    }

    if (sanitizedOverrides.has(normalizedOverride.characterId)) {
      duplicateCharacterIdCount += 1;
      sanitizedOverrides.delete(normalizedOverride.characterId);
    }

    sanitizedOverrides.set(normalizedOverride.characterId, normalizedOverride);
  });

  return {
    overrides: [...sanitizedOverrides.values()],
    duplicateCharacterIdCount,
    invalidOverrideCount,
  };
}

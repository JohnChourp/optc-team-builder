export interface InventoryCapturePayload {
  schemaVersion: 1;
  source: 'inventory-capture';
  capturedAt: string;
  characterIds: number[];
  shipIds: number[];
  unmatchedEntries: string[];
}

export interface InventoryCaptureSanitizeResult {
  payload: InventoryCapturePayload;
  duplicateCharacterCount: number;
  duplicateShipCount: number;
  invalidCharacterCount: number;
  invalidShipCount: number;
}

export class InventoryCaptureImportError extends Error {
  public constructor(public readonly key: string) {
    super(key);
    this.name = 'InventoryCaptureImportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue.length || Number.isNaN(Date.parse(normalizedValue))) {
    return fallback;
  }

  return normalizedValue;
}

function normalizeUnmatchedEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const entries: string[] = [];

  value.forEach((entry) => {
    const normalizedEntry = typeof entry === 'string' ? entry.trim() : '';
    const dedupeKey = normalizedEntry.toLowerCase();

    if (!normalizedEntry.length || seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    entries.push(normalizedEntry);
  });

  return entries;
}

export function buildInventoryCapturePayload(
  sections: {
    characterIds?: number[];
    shipIds?: number[];
    unmatchedEntries?: string[];
  },
  capturedAt = new Date().toISOString(),
): InventoryCapturePayload {
  return {
    schemaVersion: 1,
    source: 'inventory-capture',
    capturedAt,
    characterIds: [...(sections.characterIds ?? [])],
    shipIds: [...(sections.shipIds ?? [])],
    unmatchedEntries: [...(sections.unmatchedEntries ?? [])],
  };
}

export function parseInventoryCapturePayload(rawContent: string): InventoryCapturePayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(rawContent) as unknown;
  } catch {
    throw new InventoryCaptureImportError('management.inventoryCapture.errors.invalidJson');
  }

  return parseInventoryCapturePayloadValue(parsedPayload);
}

function parseInventoryCapturePayloadValue(
  parsedPayload: unknown,
): InventoryCapturePayload {
  if (!isRecord(parsedPayload)) {
    throw new InventoryCaptureImportError('management.inventoryCapture.errors.invalidPayload');
  }

  if (
    parsedPayload['schemaVersion'] !== 1 ||
    parsedPayload['source'] !== 'inventory-capture'
  ) {
    throw new InventoryCaptureImportError(
      'management.inventoryCapture.errors.unsupportedSchema',
    );
  }

  if (
    typeof parsedPayload['capturedAt'] !== 'string' ||
    !Array.isArray(parsedPayload['characterIds']) ||
    !Array.isArray(parsedPayload['shipIds']) ||
    !Array.isArray(parsedPayload['unmatchedEntries'])
  ) {
    throw new InventoryCaptureImportError('management.inventoryCapture.errors.invalidPayload');
  }

  return {
    schemaVersion: 1,
    source: 'inventory-capture',
    capturedAt: parsedPayload['capturedAt'],
    characterIds: parsedPayload['characterIds'] as number[],
    shipIds: parsedPayload['shipIds'] as number[],
    unmatchedEntries: parsedPayload['unmatchedEntries'] as string[],
  };
}

export function sanitizeInventoryCapturePayload(
  payload: InventoryCapturePayload,
  now = new Date().toISOString(),
): InventoryCaptureSanitizeResult {
  const characterIds: number[] = [];
  const shipIds: number[] = [];
  const seenCharacterIds = new Set<number>();
  const seenShipIds = new Set<number>();
  let duplicateCharacterCount = 0;
  let duplicateShipCount = 0;
  let invalidCharacterCount = 0;
  let invalidShipCount = 0;

  payload.characterIds.forEach((entry) => {
    const characterId = normalizePositiveInteger(entry);

    if (!characterId) {
      invalidCharacterCount += 1;
      return;
    }

    if (seenCharacterIds.has(characterId)) {
      duplicateCharacterCount += 1;
      return;
    }

    seenCharacterIds.add(characterId);
    characterIds.push(characterId);
  });

  payload.shipIds.forEach((entry) => {
    const shipId = normalizePositiveInteger(entry);

    if (!shipId) {
      invalidShipCount += 1;
      return;
    }

    if (seenShipIds.has(shipId)) {
      duplicateShipCount += 1;
      return;
    }

    seenShipIds.add(shipId);
    shipIds.push(shipId);
  });

  return {
    payload: {
      schemaVersion: 1,
      source: 'inventory-capture',
      capturedAt: normalizeTimestamp(payload.capturedAt, now),
      characterIds,
      shipIds,
      unmatchedEntries: normalizeUnmatchedEntries(payload.unmatchedEntries),
    },
    duplicateCharacterCount,
    duplicateShipCount,
    invalidCharacterCount,
    invalidShipCount,
  };
}

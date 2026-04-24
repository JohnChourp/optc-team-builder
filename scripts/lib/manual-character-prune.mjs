import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function pruneManualCharactersCoveredByImport({
  importedCharacterIds,
  overlayPath,
  sourceImageDir,
  preservedImageFiles = [],
  logger = null,
} = {}) {
  const importedIds = normalizeIdSet(importedCharacterIds);
  const rawOverlay = await readManualOverlay(overlayPath);

  if (!rawOverlay) {
    return createEmptyResult();
  }

  const retainedEntries = [];
  const removedRecords = [];

  for (const [rawId, record] of Object.entries(rawOverlay)) {
    const manualId = parsePositiveInteger(rawId);
    const canonicalId = parsePositiveInteger(record?.detail?.characterId ?? record?.characterId);
    const coveredId = [manualId, canonicalId].find((candidate) => importedIds.has(candidate));

    if (coveredId) {
      removedRecords.push({
        id: manualId,
        canonicalId: canonicalId && canonicalId !== manualId ? canonicalId : null,
        coveredId,
        name: normalizeRecordName(record),
        imageFiles: collectRecordImageFiles(record),
      });
      continue;
    }

    retainedEntries.push([rawId, record]);
  }

  if (!removedRecords.length) {
    return {
      ...createEmptyResult(),
      retainedCount: retainedEntries.length,
    };
  }

  const retainedImageFiles = new Set(preservedImageFiles);
  for (const [, record] of retainedEntries) {
    for (const imageFile of collectRecordImageFiles(record)) {
      retainedImageFiles.add(imageFile);
    }
  }

  const removedImageFiles = [
    ...new Set(removedRecords.flatMap((record) => record.imageFiles)),
  ].filter((imageFile) => !retainedImageFiles.has(imageFile));

  await mkdir(path.dirname(overlayPath), { recursive: true });
  await writeFile(
    overlayPath,
    JSON.stringify(sortOverlayEntries(retainedEntries), null, 2),
  );

  await Promise.all(
    removedImageFiles.map((imageFile) =>
      rm(path.join(sourceImageDir, imageFile), { force: true }),
    ),
  );

  logger?.(
    `[manual-characters] pruned ${removedRecords.length} manual record(s) covered by upstream import: ${removedRecords
      .map(formatRemovedRecord)
      .join(', ')}.`,
  );

  if (removedImageFiles.length) {
    logger?.(
      `[manual-characters] deleted ${removedImageFiles.length} unused manual image file(s): ${removedImageFiles.join(', ')}.`,
    );
  }

  return {
    pruned: true,
    removedRecords,
    removedImageFiles,
    retainedCount: retainedEntries.length,
  };
}

export function collectManualImageOverrideFiles(imageOverrides) {
  const preservedImageFiles = [];

  for (const override of imageOverrides?.values?.() ?? []) {
    if (override?.source === 'manual' && typeof override.file === 'string' && override.file.trim()) {
      preservedImageFiles.push(override.file.trim());
    }
  }

  return preservedImageFiles;
}

async function readManualOverlay(overlayPath) {
  try {
    const rawOverlay = JSON.parse(await readFile(overlayPath, 'utf8'));

    if (!rawOverlay || typeof rawOverlay !== 'object' || Array.isArray(rawOverlay)) {
      throw new Error(`Invalid manual overlay JSON in ${overlayPath}.`);
    }

    return rawOverlay;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function normalizeIdSet(values) {
  const ids = new Set();

  for (const value of values ?? []) {
    const parsed = parsePositiveInteger(value);

    if (parsed) {
      ids.add(parsed);
    }
  }

  return ids;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function collectRecordImageFiles(record) {
  return [record?.image?.file, record?.image?.thumbnailFile]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .filter((value) => path.basename(value) === value);
}

function sortOverlayEntries(entries) {
  return Object.fromEntries(
    entries.sort(([leftId], [rightId]) => Number(leftId) - Number(rightId)),
  );
}

function normalizeRecordName(record) {
  const name = String(record?.name ?? '').trim();
  return name.length ? name : 'Unnamed manual character';
}

function formatRemovedRecord(record) {
  return record.canonicalId
    ? `${record.id}->${record.canonicalId} ${record.name}`
    : `${record.id} ${record.name}`;
}

function createEmptyResult() {
  return {
    pruned: false,
    removedRecords: [],
    removedImageFiles: [],
    retainedCount: 0,
  };
}

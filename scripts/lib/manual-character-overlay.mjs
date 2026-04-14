import { readFile } from 'node:fs/promises';

import {
  createCharacterSearchText,
  createEmptyAssets,
  createEmptyRegionAvailability,
  validTypes,
} from './optc-dataset.mjs';

export const MANUAL_CHARACTER_ID_MIN = 900000;

const MANUAL_DETAIL_NULLABLE_TEXT_KEYS = [
  'captainAbility',
  'captainNotes',
  'specialName',
  'specialText',
  'specialNotes',
  'superSpecialText',
  'superSpecialCriteriaText',
  'superSpecialNotes',
  'sailorNotes',
];
const MANUAL_DETAIL_ARRAY_OBJECT_KEYS = [
  'captainAbilityVariants',
  'limitBreak',
  'potentialAbilities',
  'supportData',
  'builderAbilities',
];
const MANUAL_DETAIL_OBJECT_KEYS = [
  'superSpecialCriteria',
  'swapData',
  'vsSpecial',
  'superType',
  'superTandemData',
  'finalTapData',
  'superClass',
  'rumbleData',
];
const MANUAL_DETAIL_STRING_ARRAY_KEYS = ['partyConflictKeys', 'characterTags', 'sailorAbilities'];
export function isManualCharacterId(value) {
  return Number.isInteger(value) && value >= MANUAL_CHARACTER_ID_MIN;
}

export function createEmptyManualDetail(characterId) {
  return {
    characterId,
    captainAbility: null,
    captainAbilityVariants: [],
    captainNotes: null,
    specialName: null,
    specialText: null,
    specialNotes: null,
    superSpecialText: null,
    superSpecialCriteriaText: null,
    superSpecialNotes: null,
    superSpecialCriteria: null,
    partyConflictKeys: [],
    characterTags: [],
    builderAbilities: [],
    sailorAbilities: [],
    sailorNotes: null,
    limitBreak: [],
    potentialAbilities: [],
    supportData: [],
    swapData: null,
    vsSpecial: null,
    superType: null,
    superTandemData: null,
    finalTapData: null,
    superClass: null,
    rumbleData: null,
  };
}

export async function loadManualCharacterOverlay(overlayPath, { availableClasses = [] } = {}) {
  try {
    const rawOverlay = JSON.parse(await readFile(overlayPath, 'utf8'));
    const records = new Map();

    if (!rawOverlay || typeof rawOverlay !== 'object' || Array.isArray(rawOverlay)) {
      throw new Error(`Invalid manual overlay JSON in ${overlayPath}.`);
    }

    for (const [rawId, rawRecord] of Object.entries(rawOverlay)) {
      const characterId = normalizeManualCharacterId(rawId, 'manual overlay key');
      const record = normalizeStoredManualCharacterRecord(rawRecord, {
        availableClasses,
        characterId,
      });

      records.set(characterId, record);
    }

    return records;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }
}

export function serializeManualCharacterOverlay(records) {
  return Object.fromEntries(
    [...records.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([characterId, record]) => [String(characterId), record]),
  );
}

export function resolveManualCharacterUpsert(records, draft) {
  const requestedId =
    draft.id === undefined || draft.id === null
      ? null
      : normalizeManualCharacterId(draft.id, 'manual character id');
  const requestedName = normalizeRequiredString(draft.name, 'manual character name');
  const nameKey = normalizeNameKey(requestedName);
  const recordsByName = new Map(
    [...records.values()].map((record) => [normalizeNameKey(record.name), record]),
  );
  const matchedByName = recordsByName.get(nameKey) ?? null;

  if (requestedId !== null) {
    const matchedById = records.get(requestedId) ?? null;

    if (matchedByName && matchedByName.id !== requestedId) {
      throw new Error(
        `Manual character id ${requestedId} conflicts with existing manual character "${matchedByName.name}" (${matchedByName.id}).`,
      );
    }

    return {
      characterId: requestedId,
      existingRecord: matchedById,
      mode: matchedById ? 'update' : 'create',
    };
  }

  if (matchedByName) {
    return {
      characterId: matchedByName.id,
      existingRecord: matchedByName,
      mode: 'update',
    };
  }

  const nextId =
    Math.max(MANUAL_CHARACTER_ID_MIN - 1, ...[...records.keys()].filter(isManualCharacterId)) + 1;

  return {
    characterId: nextId,
    existingRecord: null,
    mode: 'create',
  };
}

export function normalizeIncomingManualCharacterPayload(
  rawPayload,
  {
    availableClasses = [],
    characterId,
    storedImageFile,
    storedThumbnailFile,
  },
) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    throw new Error('Manual character payload must be a JSON object.');
  }

  const classes = normalizeClasses(rawPayload.classes, availableClasses);
  const detail = normalizeManualDetail(rawPayload, characterId);
  const imageFile = normalizeStoredImageFile(storedImageFile);
  const thumbnailFile = normalizeOptionalStoredImageFile(
    storedThumbnailFile ?? rawPayload.thumbnailImage ?? rawPayload.image?.thumbnailFile,
  );
  const hasIncompleteStats = hasIncompleteManualStats(rawPayload);
  const normalized = {
    id: characterId,
    name: normalizeRequiredString(rawPayload.name, 'manual character name'),
    isIncomplete: normalizeIncompleteFlag(rawPayload.isIncomplete, hasIncompleteStats),
    type: normalizeType(rawPayload.type),
    classes,
    stars: normalizeNonNegativeNumber(rawPayload.stars, 'stars'),
    cost: normalizeNonNegativeNumber(rawPayload.cost, 'cost'),
    combo: normalizeNonNegativeNumber(rawPayload.combo, 'combo'),
    maxLevel: normalizeNonNegativeNumber(rawPayload.maxLevel, 'maxLevel'),
    maxExperience: normalizeNullableNonNegativeNumber(rawPayload.maxExperience, 'maxExperience'),
    minHp: normalizeNullableNonNegativeNumber(rawPayload.minHp, 'minHp'),
    minAtk: normalizeNullableNonNegativeNumber(rawPayload.minAtk, 'minAtk'),
    minRcv: normalizeNullableNonNegativeNumber(rawPayload.minRcv, 'minRcv'),
    maxHp: normalizeNullableNonNegativeNumber(rawPayload.maxHp, 'maxHp'),
    maxAtk: normalizeNullableNonNegativeNumber(rawPayload.maxAtk, 'maxAtk'),
    maxRcv: normalizeNullableNonNegativeNumber(rawPayload.maxRcv, 'maxRcv'),
    growth: normalizeNullableNonNegativeNumber(rawPayload.growth, 'growth'),
    image: {
      file: imageFile,
      ...(thumbnailFile ? { thumbnailFile } : {}),
    },
    detail,
  };

  validateStatRanges(normalized);

  return normalized;
}

export function buildAppliedManualCharacter(record) {
  const classes = [...record.classes];
  const assets = {
    ...createEmptyAssets(),
    exactLocal: `assets/exact-character-images/${record.image.file}`,
    ...(record.image.thumbnailFile
      ? { thumbnailLocal: `assets/exact-character-images/${record.image.thumbnailFile}` }
      : {}),
  };
  const regionAvailability = {
    ...createEmptyRegionAvailability(),
    exactLocal: true,
  };

  return {
    id: record.id,
    name: record.name,
    isIncomplete: record.isIncomplete === true,
    type: record.type,
    primaryClass: classes[0] ?? '',
    secondaryClass: classes[1] ?? null,
    classes,
    stars: record.stars,
    cost: record.cost,
    combo: record.combo,
    maxLevel: record.maxLevel,
    maxExperience: record.maxExperience,
    minHp: record.minHp,
    minAtk: record.minAtk,
    minRcv: record.minRcv,
    maxHp: record.maxHp,
    maxAtk: record.maxAtk,
    maxRcv: record.maxRcv,
    growth: record.growth,
    searchText: createCharacterSearchText(record.name, record.type, classes),
    regionAvailability,
    assets,
    detail: {
      ...createEmptyManualDetail(record.id),
      ...record.detail,
      characterId: record.id,
    },
  };
}

function normalizeStoredManualCharacterRecord(rawRecord, { availableClasses, characterId }) {
  if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
    throw new Error(`Invalid stored manual record for ${characterId}.`);
  }

  const classes = normalizeClasses(rawRecord.classes, availableClasses);
  const detail = normalizeManualDetail(rawRecord, characterId);
  const hasIncompleteStats = hasIncompleteManualStats(rawRecord);
  const normalized = {
    id: characterId,
    name: normalizeRequiredString(rawRecord.name, `manual character ${characterId} name`),
    isIncomplete: normalizeIncompleteFlag(rawRecord.isIncomplete, hasIncompleteStats),
    type: normalizeType(rawRecord.type),
    classes,
    stars: normalizeNonNegativeNumber(rawRecord.stars, `manual character ${characterId} stars`),
    cost: normalizeNonNegativeNumber(rawRecord.cost, `manual character ${characterId} cost`),
    combo: normalizeNonNegativeNumber(rawRecord.combo, `manual character ${characterId} combo`),
    maxLevel: normalizeNonNegativeNumber(
      rawRecord.maxLevel,
      `manual character ${characterId} maxLevel`,
    ),
    maxExperience: normalizeNullableNonNegativeNumber(
      rawRecord.maxExperience,
      `manual character ${characterId} maxExperience`,
    ),
    minHp: normalizeNullableNonNegativeNumber(rawRecord.minHp, `manual character ${characterId} minHp`),
    minAtk: normalizeNullableNonNegativeNumber(rawRecord.minAtk, `manual character ${characterId} minAtk`),
    minRcv: normalizeNullableNonNegativeNumber(rawRecord.minRcv, `manual character ${characterId} minRcv`),
    maxHp: normalizeNullableNonNegativeNumber(rawRecord.maxHp, `manual character ${characterId} maxHp`),
    maxAtk: normalizeNullableNonNegativeNumber(rawRecord.maxAtk, `manual character ${characterId} maxAtk`),
    maxRcv: normalizeNullableNonNegativeNumber(rawRecord.maxRcv, `manual character ${characterId} maxRcv`),
    growth: normalizeNullableNonNegativeNumber(
      rawRecord.growth,
      `manual character ${characterId} growth`,
    ),
    image: {
      file: normalizeStoredImageFile(rawRecord.image?.file),
      ...(normalizeOptionalStoredImageFile(rawRecord.image?.thumbnailFile)
        ? { thumbnailFile: normalizeOptionalStoredImageFile(rawRecord.image?.thumbnailFile) }
        : {}),
    },
    detail,
  };

  validateStatRanges(normalized);

  return normalized;
}

function normalizeManualDetail(rawRecord, characterId) {
  const rawDetail =
    rawRecord.detail && typeof rawRecord.detail === 'object' && !Array.isArray(rawRecord.detail)
      ? rawRecord.detail
      : {};
  const detail = createEmptyManualDetail(characterId);

  for (const key of MANUAL_DETAIL_NULLABLE_TEXT_KEYS) {
    const candidate = rawDetail[key] ?? rawRecord[key];
    detail[key] = normalizeNullableString(candidate);
  }

  for (const key of MANUAL_DETAIL_STRING_ARRAY_KEYS) {
    const candidate = rawDetail[key] ?? rawRecord[key];
    detail[key] = normalizeStringArray(candidate, key);
  }

  for (const key of MANUAL_DETAIL_ARRAY_OBJECT_KEYS) {
    const candidate = rawDetail[key] ?? rawRecord[key];
    detail[key] = normalizeObjectArray(candidate, key);
  }

  for (const key of MANUAL_DETAIL_OBJECT_KEYS) {
    const candidate = rawDetail[key] ?? rawRecord[key];
    detail[key] = normalizeNullableObject(candidate, key);
  }

  detail.characterId = characterId;

  return detail;
}

function normalizeManualCharacterId(value, label) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < MANUAL_CHARACTER_ID_MIN) {
    throw new Error(`${label} must be an integer >= ${MANUAL_CHARACTER_ID_MIN}.`);
  }

  return parsed;
}

function normalizeRequiredString(value, label) {
  const normalized = String(value ?? '').trim();

  if (!normalized.length) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

function normalizeNullableString(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value).trim();
}

function normalizeType(value) {
  const normalized = String(value ?? '').trim().toUpperCase();

  if (!validTypes.has(normalized)) {
    throw new Error(`Character type must be one of: ${[...validTypes].join(', ')}.`);
  }

  return normalized;
}

function normalizeClasses(value, availableClasses) {
  if (!Array.isArray(value)) {
    throw new Error('Character classes must be an array with 1 or 2 values.');
  }

  const availableClassMap = new Map(
    availableClasses.map((entry) => [String(entry).trim().toLowerCase(), String(entry).trim()]),
  );
  const classes = value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .map((entry) => availableClassMap.get(entry.toLowerCase()) ?? null);

  if (classes.some((entry) => !entry)) {
    throw new Error(`Character classes must match the dataset class list: ${availableClasses.join(', ')}.`);
  }

  const dedupedClasses = [...new Set(classes)];

  if (dedupedClasses.length < 1 || dedupedClasses.length > 2) {
    throw new Error('Character classes must contain 1 or 2 values.');
  }

  return dedupedClasses;
}

function normalizeNonNegativeNumber(value, label) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }

  return parsed;
}

function normalizeOptionalNonNegativeNumber(value, label, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return normalizeNonNegativeNumber(value, label);
}

function normalizeNullableNonNegativeNumber(value, label) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return normalizeNonNegativeNumber(value, label);
}

function normalizeIncompleteFlag(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return Boolean(value);
}

function hasIncompleteManualStats(record) {
  return [
    record.maxExperience,
    record.minHp,
    record.minAtk,
    record.minRcv,
    record.maxHp,
    record.maxAtk,
    record.maxRcv,
    record.growth,
  ].some((value) => value === null || value === undefined || value === '');
}

function validateStatRanges(record) {
  if (record.maxHp !== null && record.minHp !== null && record.maxHp < record.minHp) {
    throw new Error('maxHp cannot be smaller than minHp.');
  }

  if (record.maxAtk !== null && record.minAtk !== null && record.maxAtk < record.minAtk) {
    throw new Error('maxAtk cannot be smaller than minAtk.');
  }

  if (record.maxRcv !== null && record.minRcv !== null && record.maxRcv < record.minRcv) {
    throw new Error('maxRcv cannot be smaller than minRcv.');
  }
}

function normalizeStringArray(value, label) {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of strings.`);
  }

  return value.map((entry) => normalizeRequiredString(entry, label));
}

function normalizeObjectArray(value, label) {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((entry) => !entry || typeof entry !== 'object')) {
    throw new Error(`${label} must be an array of objects.`);
  }

  return value;
}

function normalizeNullableObject(value, label) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object or null.`);
  }

  return value;
}

function normalizeStoredImageFile(value) {
  const normalized = String(value ?? '').trim();

  if (!normalized.length) {
    throw new Error('Manual character image file is required.');
  }

  return normalized;
}

function normalizeOptionalStoredImageFile(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length ? normalized : null;
}

function normalizeNameKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

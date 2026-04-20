import {
  type CharacterDetail,
  type CharacterDetailRecord,
  type CharacterListItem,
  type LocalCharacterOverride,
} from '../models/optc.models';

export interface LocalCharacterOverrideInput {
  characterId: number;
  name: string;
  isIncomplete: boolean;
  type: string;
  classes: string[];
  stars: number;
  cost: number;
  combo: number;
  maxLevel: number;
  maxExperience: number | null;
  minHp: number | null;
  minAtk: number | null;
  minRcv: number | null;
  maxHp: number | null;
  maxAtk: number | null;
  maxRcv: number | null;
  growth: number | null;
  detail: CharacterDetail;
  images?: Partial<LocalCharacterOverride['images']> | null;
  createdAt?: string;
  updatedAt?: string;
}

const NULLABLE_TEXT_DETAIL_KEYS = [
  'captainAbility',
  'captainNotes',
  'specialName',
  'specialText',
  'specialNotes',
  'superSpecialText',
  'superSpecialCriteriaText',
  'superSpecialNotes',
  'sailorNotes',
] as const;
const ARRAY_DETAIL_KEYS = [
  'captainAbilityVariants',
  'partyConflictKeys',
  'characterTags',
  'builderAbilities',
  'sailorAbilities',
  'limitBreak',
  'potentialAbilities',
  'supportData',
] as const;
const OBJECT_OR_NULL_DETAIL_KEYS = [
  'superSpecialCriteria',
  'swapData',
  'vsSpecial',
  'superType',
  'superTandemData',
  'finalTapData',
  'rushSugoSpecialData',
  'superClass',
  'rumbleData',
] as const;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeOverrideImageDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue.startsWith('data:image/')) {
    return null;
  }

  return normalizedValue.includes(';base64,') ? normalizedValue : null;
}

export function createEmptyCharacterDetail(characterId: number): CharacterDetail {
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
    rushSugoSpecialData: null,
    superClass: null,
    rumbleData: null,
  };
}

export function cloneCharacterDetail(detail: CharacterDetail): CharacterDetail {
  return deepClone(detail);
}

export function normalizeCharacterDetailInput(
  characterId: number,
  value: unknown,
): CharacterDetail {
  const fallback = createEmptyCharacterDetail(characterId);

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  const detail: CharacterDetail = {
    ...fallback,
    characterId,
  };

  NULLABLE_TEXT_DETAIL_KEYS.forEach((key) => {
    const entry = record[key];
    detail[key] = typeof entry === 'string' && entry.trim().length > 0 ? entry.trim() : null;
  });

  ARRAY_DETAIL_KEYS.forEach((key) => {
    const entry = record[key];
    detail[key] = Array.isArray(entry) ? deepClone(entry) : [];
  });

  OBJECT_OR_NULL_DETAIL_KEYS.forEach((key) => {
    const entry = record[key];
    (detail as unknown as Record<string, unknown>)[key] =
      entry && typeof entry === 'object' && !Array.isArray(entry) ? deepClone(entry) : null;
  });

  return detail;
}

export function normalizeLocalCharacterOverride(
  input: Partial<LocalCharacterOverrideInput> | LocalCharacterOverride | null | undefined,
  existing?: LocalCharacterOverride | null,
): LocalCharacterOverride | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const characterId = normalizeNonNegativeInteger(input.characterId);
  const stars = normalizeNonNegativeInteger(input.stars);
  const cost = normalizeNonNegativeInteger(input.cost);
  const combo = normalizeNonNegativeInteger(input.combo);
  const maxLevel = normalizeNonNegativeInteger(input.maxLevel);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const type = typeof input.type === 'string' ? input.type.trim().toUpperCase() : '';
  const classes = [
    ...new Set(
      (Array.isArray(input.classes) ? input.classes : [])
        .map((characterClass) => String(characterClass ?? '').trim())
        .filter((characterClass) => characterClass.length > 0),
    ),
  ];

  if (
    !characterId ||
    !name.length ||
    !type.length ||
    classes.length === 0 ||
    stars === null ||
    cost === null ||
    combo === null ||
    maxLevel === null
  ) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    characterId,
    name,
    isIncomplete: Boolean(input.isIncomplete),
    type,
    classes,
    stars,
    cost,
    combo,
    maxLevel,
    maxExperience: normalizeNullableNumber(input.maxExperience),
    minHp: normalizeNullableNumber(input.minHp),
    minAtk: normalizeNullableNumber(input.minAtk),
    minRcv: normalizeNullableNumber(input.minRcv),
    maxHp: normalizeNullableNumber(input.maxHp),
    maxAtk: normalizeNullableNumber(input.maxAtk),
    maxRcv: normalizeNullableNumber(input.maxRcv),
    growth: normalizeNullableNumber(input.growth),
    detail: normalizeCharacterDetailInput(characterId, input.detail),
    images: {
      thumbnailDataUrl: normalizeOverrideImageDataUrl(input.images?.thumbnailDataUrl),
      detailDataUrl: normalizeOverrideImageDataUrl(input.images?.detailDataUrl),
    },
    createdAt:
      typeof input.createdAt === 'string' && !Number.isNaN(Date.parse(input.createdAt))
        ? input.createdAt
        : (existing?.createdAt ?? now),
    updatedAt:
      typeof input.updatedAt === 'string' && !Number.isNaN(Date.parse(input.updatedAt))
        ? input.updatedAt
        : now,
  };
}

export function createLocalCharacterOverrideFromRecord(
  character: CharacterDetailRecord,
  existing?: LocalCharacterOverride | null,
): LocalCharacterOverride {
  return {
    characterId: character.id,
    name: character.name,
    isIncomplete: character.isIncomplete,
    type: character.type,
    classes: [...character.classes],
    stars: character.stars,
    cost: character.cost,
    combo: character.combo,
    maxLevel: character.maxLevel,
    maxExperience: character.maxExperience,
    minHp: character.stats.min.hp,
    minAtk: character.stats.min.atk,
    minRcv: character.stats.min.rcv,
    maxHp: character.stats.max.hp,
    maxAtk: character.stats.max.atk,
    maxRcv: character.stats.max.rcv,
    growth: character.stats.growth,
    detail: cloneCharacterDetail(character.detail),
    images: {
      thumbnailDataUrl: existing?.images.thumbnailDataUrl ?? null,
      detailDataUrl: existing?.images.detailDataUrl ?? null,
    },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function applyOverrideToCharacterListItem(
  character: CharacterListItem,
  override: LocalCharacterOverride | null,
): CharacterListItem {
  if (!override || override.characterId !== character.id) {
    return character;
  }

  const [primaryClass, secondaryClass] = override.classes;

  return {
    ...character,
    name: override.name,
    isIncomplete: override.isIncomplete,
    type: override.type,
    classes: [...override.classes],
    primaryClass: primaryClass ?? character.primaryClass,
    secondaryClass: secondaryClass ?? null,
    stars: override.stars,
    cost: override.cost,
    combo: override.combo,
    maxLevel: override.maxLevel,
    maxExperience: override.maxExperience,
    stats: {
      min: {
        hp: override.minHp,
        atk: override.minAtk,
        rcv: override.minRcv,
      },
      max: {
        hp: override.maxHp,
        atk: override.maxAtk,
        rcv: override.maxRcv,
      },
      growth: override.growth,
    },
    imageUrl:
      override.images.thumbnailDataUrl ?? override.images.detailDataUrl ?? character.imageUrl,
  };
}

export function applyOverrideToCharacterDetailRecord(
  character: CharacterDetailRecord,
  override: LocalCharacterOverride | null,
): CharacterDetailRecord {
  if (!override || override.characterId !== character.id) {
    return character;
  }

  const overlaidRecord = applyOverrideToCharacterListItem(character, override);

  return {
    ...overlaidRecord,
    detail: cloneCharacterDetail(override.detail),
    detailImageUrl: override.images.detailDataUrl ?? character.detailImageUrl,
  };
}

export function createEditableCharacterOverridePayload(
  override: LocalCharacterOverride,
): Omit<LocalCharacterOverride, 'createdAt' | 'updatedAt' | 'images'> {
  return {
    characterId: override.characterId,
    name: override.name,
    isIncomplete: override.isIncomplete,
    type: override.type,
    classes: [...override.classes],
    stars: override.stars,
    cost: override.cost,
    combo: override.combo,
    maxLevel: override.maxLevel,
    maxExperience: override.maxExperience,
    minHp: override.minHp,
    minAtk: override.minAtk,
    minRcv: override.minRcv,
    maxHp: override.maxHp,
    maxAtk: override.maxAtk,
    maxRcv: override.maxRcv,
    growth: override.growth,
    detail: cloneCharacterDetail(override.detail),
  };
}

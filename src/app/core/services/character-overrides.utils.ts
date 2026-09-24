import {
  type CharacterDetail,
  type CharacterDetailRecord,
  type CharacterListItem,
  type LocalCharacterOverride,
} from '../models/optc.models';
import { resolveCaptainBoosts } from '../grammar/captain-boost-grammar';
import { normalizeHtmlToText } from './html-text.utils';

export interface LocalCharacterOverrideInput {
  characterId: number;
  name: string;
  isIncomplete: boolean;
  type: string;
  classes: string[];
  stars: number;
  cost: number;
  combo: number;
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

/**
 * 869f63gqd. The dataset's own captain fields for an overridden character - the text its shipped
 * Captain boosts and tiers were read from. A Local edit that still carries this text keeps them.
 */
export type LocalCharacterOverrideDatasetCaptain = Pick<
  CharacterDetail,
  'captainAbility' | 'captainAbilityVariants'
>;

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

/**
 * Any finite number, the same rule the repository applies when it reads the dataset
 * (`parseNullableNumber`). Stats can be negative - 59 characters ship a negative RCV, down to
 * #894's -999 - and the old `>= 0` turned each of them into "unknown" on every save of the
 * editor, even one that changed nothing. A blank or whitespace-only field is "unknown", not the
 * zero `Number('  ')` would make of it.
 */
function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOverrideImageDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue.startsWith('data:image/')) {
    return null;
  }

  return normalizedValue.includes(';base64,') ? normalizedValue : null;
}

function createEmptyCharacterDetail(characterId: number): CharacterDetail {
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

function cloneCharacterDetail(detail: CharacterDetail): CharacterDetail {
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

  // 869f63gqd. Upstream writes 90 Captain Shifts as plain text ("Recovers 2x character's RCV").
  // Only an object used to survive here, so every save of the editor nulled them.
  const swapData = record['swapData'];

  if (typeof swapData === 'string' && swapData.trim().length > 0) {
    detail.swapData = swapData;
  }

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
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const type = typeof input.type === 'string' ? input.type.trim().toUpperCase() : '';
  const classes = [
    ...new Set(
      (Array.isArray(input.classes) ? input.classes : [])
        .map((characterClass) => String(characterClass ?? '').trim())
        .filter((characterClass) => characterClass.length > 0),
    ),
  ];

  // No class is not a missing field: the 18 VS units ship with no classes of their own, and
  // refusing them made every one of them impossible to save, export or import (869f63gqd).
  if (
    !characterId ||
    !name.length ||
    !type.length ||
    stars === null ||
    cost === null ||
    combo === null
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
  /**
   * The dataset's captain fields for this character. A list row carries no detail, so the
   * repository reads them for overridden ids; without them the boosts are read from the
   * override's own text, which is all a caller with no dataset can do.
   */
  datasetCaptain?: LocalCharacterOverrideDatasetCaptain | null,
): CharacterListItem {
  if (!override || override.characterId !== character.id) {
    return character;
  }

  const [primaryClass, secondaryClass] = override.classes;
  // 869f63gqd. The dataset's boosts stand while the captain text does; re-reading them from the
  // override is only for a text the player actually changed. An untouched save used to move 189.
  const keepsDatasetCaptain =
    datasetCaptain !== undefined &&
    datasetCaptain !== null &&
    hasSameCaptainText(datasetCaptain, override.detail);

  return {
    ...character,
    name: override.name,
    isIncomplete: override.isIncomplete,
    type: override.type,
    classes: [...override.classes],
    primaryClass: primaryClass ?? character.primaryClass,
    secondaryClass: secondaryClass ?? null,
    stars: override.stars,
    // The upstream label ("6+", a trained rarity) is only rebuilt when the rarity itself changed.
    starsLabel:
      override.stars === character.stars
        ? (character.starsLabel ?? String(override.stars))
        : String(override.stars),
    cost: override.cost,
    combo: override.combo,
    ...(keepsDatasetCaptain ? {} : resolveCaptainBoosts(override.detail, normalizeHtmlToText)),
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

  const overlaidRecord = applyOverrideToCharacterListItem(character, override, character.detail);
  /*
   * 869f63gqd. An override stores only the fields the editor knows. Replacing the detail with it
   * dropped everything else - `captainAbilityCoverage`, `exSuperData`, `switchEffectData`,
   * `captainShiftData` - so a save that changed nothing wiped the Captain tiers of 4,007
   * characters. The edited fields go over the dataset's detail instead, which also heals an
   * override stored before this: what it never kept is read from the dataset again.
   */
  const detail: CharacterDetail = {
    ...cloneCharacterDetail(character.detail),
    ...cloneCharacterDetail(override.detail),
  };

  // The tiers describe the dataset's captain text. Once the player rewrites it they describe
  // nothing, and a stale tier filter would be worse than none.
  if (!hasSameCaptainText(character.detail, override.detail)) {
    delete detail.captainAbilityCoverage;
  }

  return {
    ...overlaidRecord,
    detail,
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

/**
 * Whether a Local edit still carries the dataset's captain text, compared the way the grammar
 * reads it: HTML-normalized, and variant by variant, because a tier belongs to one variant.
 */
function hasSameCaptainText(
  datasetCaptain: LocalCharacterOverrideDatasetCaptain,
  detail: LocalCharacterOverrideDatasetCaptain,
): boolean {
  return describeCaptainText(datasetCaptain) === describeCaptainText(detail);
}

function describeCaptainText(captain: LocalCharacterOverrideDatasetCaptain): string {
  return JSON.stringify([
    normalizeHtmlToText(captain.captainAbility),
    ...captain.captainAbilityVariants.map((variant) => [
      variant.key,
      normalizeHtmlToText(variant.text),
    ]),
  ]);
}

import {
  type CharacterDetail,
  type CharacterDetailRecord,
  type CharacterListItem,
  type LocalCharacterOverride,
} from '../models/optc.models';
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
const CAPTAIN_BRANCH_PATTERN =
  /\b(always active|standard captain|powered up captain|rampage captain)\s*:\s*/gi;
const CAPTAIN_EFFECT_CLAUSE_SEPARATOR =
  /,\s+(?=(?:and\s+)?(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)|\s+\band\s+(?=(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)/gi;
const DEFAULT_CAPTAIN_BRANCH_LABELS = new Set(['always active', 'standard captain']);
const PREFERRED_DEFAULT_CAPTAIN_VARIANT_KEYS = [
  'base',
  'captain',
  'description',
  'level0',
  'llbbase',
  'level1',
];

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

function resolveCaptainBoosts(detail: CharacterDetail): {
  captainHpBoost: number;
  captainAtkBoost: number;
  captainAverageBoost: number;
} {
  const captainText = resolveDefaultCaptainAbilityText(detail);
  const defaultCaptainText = extractDefaultCaptainBoostText(captainText);
  const captainHpBoost = extractHighestBoost(defaultCaptainText, 'hp');
  const captainAtkBoost = extractHighestBoost(defaultCaptainText, 'atk');

  return {
    captainHpBoost,
    captainAtkBoost,
    captainAverageBoost: (captainHpBoost + captainAtkBoost) / 2,
  };
}

function resolveDefaultCaptainAbilityText(detail: CharacterDetail): string {
  const preferredVariant = PREFERRED_DEFAULT_CAPTAIN_VARIANT_KEYS.map((key) =>
    detail.captainAbilityVariants.find((variant) => variant.key.toLowerCase() === key),
  ).find(Boolean);
  const fallbackVariant = detail.captainAbilityVariants.find((variant) => variant.text);

  return (preferredVariant?.text ?? fallbackVariant?.text ?? detail.captainAbility ?? '').trim();
}

function extractDefaultCaptainBoostText(text: string): string {
  const normalizedText = normalizeCaptainBoostText(text);
  const branches = extractCaptainBranches(normalizedText);

  if (!branches.length) {
    return normalizedText;
  }

  const defaultBranches = branches
    .filter((branch) => DEFAULT_CAPTAIN_BRANCH_LABELS.has(branch.label))
    .map((branch) => branch.text)
    .filter(Boolean);

  return defaultBranches.length
    ? defaultBranches.join('. ')
    : (branches[0]?.text ?? normalizedText);
}

function extractCaptainBranches(text: string): Array<{ label: string; text: string }> {
  const matches = [...text.matchAll(CAPTAIN_BRANCH_PATTERN)];

  return matches
    .map((match, index) => {
      const nextMatch = matches[index + 1] ?? null;
      const start = (match.index ?? 0) + match[0].length;
      const end = nextMatch?.index ?? text.length;

      return {
        label: String(match[1] ?? '').toLowerCase(),
        text: text.slice(start, end).trim(),
      };
    })
    .filter((branch) => branch.text.length > 0);
}

function extractHighestBoost(text: string, stat: 'atk' | 'hp'): number {
  const pattern = new RegExp(`\\b${stat}\\b[^.;]*?\\bby\\s+(\\d+(?:\\.\\d+)?)x`, 'gi');

  return extractDefaultCaptainBoostClauses(text).reduce((highest, clause) => {
    return [...clause.matchAll(pattern)].reduce((clauseHighest, match) => {
      if (isSelfOnlyCaptainBoostMatch(match[0])) {
        return clauseHighest;
      }

      const value = Number(match[1]);
      return Number.isFinite(value) && value > clauseHighest ? value : clauseHighest;
    }, highest);
  }, 0);
}

function extractDefaultCaptainBoostClauses(text: string): string[] {
  return splitCaptainEffectClauses(text).filter(
    (clause) =>
      !isConditionalCaptainBoostClause(clause) &&
      /\bboosts?\b/i.test(clause) &&
      /\b(?:atk|hp)\b/i.test(clause) &&
      /\bby\s+\d+(?:\.\d+)?x\b/i.test(clause),
  );
}

function splitCaptainEffectClauses(text: string): string[] {
  return splitCaptainSentences(text)
    .flatMap((clause) =>
      isConditionalCaptainBoostClause(clause)
        ? [clause]
        : clause.split(CAPTAIN_EFFECT_CLAUSE_SEPARATOR),
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function splitCaptainSentences(text: string): string[] {
  const clauses: string[] = [];
  let current = '';

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const previousCharacter = text[index - 1] ?? '';
    const nextCharacter = text[index + 1] ?? '';
    const isDecimalPoint =
      character === '.' && /\d/.test(previousCharacter) && /\d/.test(nextCharacter);

    if ((character === '.' && !isDecimalPoint) || character === ';') {
      clauses.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  clauses.push(current);

  return clauses;
}

function isConditionalCaptainBoostClause(clause: string): boolean {
  return /^(?:(?:and|or|also|additionally|furthermore|then|otherwise)\b,?\s*)*(?:if|when)\b/i.test(
    clause.trim(),
  );
}

function isSelfOnlyCaptainBoostMatch(matchText: string): boolean {
  const normalizedText = normalizeCaptainBoostText(matchText);

  return (
    /\b(?:atk|hp)\b[^,.;]{0,80}\b(?:this character|self)\b/i.test(normalizedText) ||
    /\bown\s+(?:atk|hp)\b/i.test(normalizedText)
  );
}

function normalizeCaptainBoostText(text: string): string {
  return normalizeHtmlToText(text);
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
    starsLabel: String(override.stars),
    cost: override.cost,
    combo: override.combo,
    ...resolveCaptainBoosts(override.detail),
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

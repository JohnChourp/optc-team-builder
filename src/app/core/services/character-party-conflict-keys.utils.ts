import conflictOverrideCatalog from '../data/auto-team-builder-party-conflict-overrides.json';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';

/**
 * The name-derived "same in-game character" keys behind the duplicate-character rule.
 *
 * Lives apart from auto-team-builder.utils so a page that needs only the rule - Manual Team
 * Builder - does not pull the builder engine's shared chunk into its route for one function.
 * auto-team-builder.utils re-exports resolveCharacterPartyConflictKeys, so its importers are
 * unchanged.
 */

type PartyConflictCharacter = Pick<CharacterListItem, 'id' | 'name'> &
  Partial<Pick<CharacterDetailRecord, 'detail'>>;

const CHARACTER_NAME_KEY_ALIASES: Record<string, string[]> = {
  aokiji: ['kuzan'],
  akainu: ['sakazuki'],
  'big mom': ['charlotte linlin'],
  blackbeard: ['marshall d teach'],
  'bon clay': ['bentham'],
  cora: ['corazon', 'donquixote rosinante'],
  corazon: ['donquixote rosinante'],
  'cat viper': ['nekomamushi'],
  dogstorm: ['inuarashi'],
  fujitora: ['issho'],
  kizaru: ['borsalino'],
  komurasaki: ['kozuki hiyori'],
  'mr 1': ['daz bones'],
  'mr 2 bon clay': ['bentham'],
  'mr 3': ['galdino'],
  'mr 4': ['babe'],
  'mr 5': ['gem'],
  'miss doublefinger': ['zala'],
  'miss goldenweek': ['marianne'],
  'miss merry christmas': ['drophy'],
  'miss valentine': ['mikita'],
  franosuke: ['franky'],
  luffytaro: ['luffy', 'monkey d luffy'],
  olin: ['big mom', 'charlotte linlin'],
  'olin the oiran': ['big mom', 'charlotte linlin'],
  onami: ['nami'],
  orobi: ['robin'],
  'soba mask': ['sanji'],
  'tenguyama hitetsu': ['kozuki sukiyaki'],
  usohachi: ['usopp'],
  whitebeard: ['edward newgate'],
  violet: ['viola'],
  z: ['zephyr'],
  zorojuro: ['zoro', 'roronoa zoro'],
};

const PARTY_CONFLICT_KEY_OVERRIDES = new Map<number, string[]>(
  Object.entries(conflictOverrideCatalog).map(([characterId, keys]) => [
    Number(characterId),
    Array.isArray(keys) ? keys.map((value) => String(value)) : [],
  ]),
);

export function normalizePartyConflictKey(name: string): string {
  const trimmedName = name
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return trimmedName.toLowerCase();
}

function resolveCharacterBaseNameKey(name: string): string {
  const trimmedName = name
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const [baseName = trimmedName] = trimmedName.split(' - ', 1);

  return normalizePartyConflictKey(baseName);
}

function resolveNameDerivedPartyConflictKeys(name: string): string[] {
  const primaryKey = resolveCharacterBaseNameKey(name);

  if (!primaryKey.length) {
    return [];
  }

  const keys = new Set<string>([primaryKey]);
  const baseNameWithoutParentheses = normalizePartyConflictKey(
    name.split(' - ', 1)[0]?.replace(/\([^)]*\)/g, ' ') ?? '',
  );

  if (baseNameWithoutParentheses.length > 0) {
    keys.add(baseNameWithoutParentheses);
  }

  const parentheticalKeys = [...name.matchAll(/\(([^)]+)\)/g)]
    .map((match) => normalizePartyConflictKey(match[1]))
    .filter((value) => value.length > 0);

  parentheticalKeys.forEach((value) => keys.add(value));

  if (primaryKey.includes('&')) {
    primaryKey
      .split('&')
      .map((value) => normalizePartyConflictKey(value))
      .filter((value) => value.length > 0)
      .forEach((value) => keys.add(value));
  }

  const titledNameParts = [primaryKey, ...primaryKey.split('&')]
    .map((value) => value.split(':', 1)[0] ?? '')
    .map((value) => normalizePartyConflictKey(value))
    .filter((value) => value.length > 0 && value !== primaryKey);

  for (const titledNamePart of titledNameParts) {
    keys.add(titledNamePart);

    const titledNameTokens = titledNamePart
      .split(' ')
      .map((value) => normalizePartyConflictKey(value))
      .filter((value) => value.length > 1);
    const [lastTitledNameToken = ''] = titledNameTokens.slice(-1);

    if (titledNameTokens.length >= 2 && lastTitledNameToken.length > 1) {
      keys.add(lastTitledNameToken);
    }
  }

  const baseNameParts = baseNameWithoutParentheses
    .split(' ')
    .map((value) => normalizePartyConflictKey(value))
    .filter((value) => value.length > 0);
  const [lastBaseNamePart = ''] = baseNameParts.slice(-1);

  if (baseNameParts.length >= 2 && lastBaseNamePart.length > 1) {
    keys.add(lastBaseNamePart);
  }

  for (const key of [...keys]) {
    (CHARACTER_NAME_KEY_ALIASES[key] ?? []).forEach((alias) => keys.add(alias));
  }

  return [...keys];
}

export function resolveCharacterPartyConflictKeys(character: PartyConflictCharacter): string[] {
  const explicitKeys = Array.isArray(character.detail?.partyConflictKeys)
    ? character.detail.partyConflictKeys
    : [];
  const overrideKeys = PARTY_CONFLICT_KEY_OVERRIDES.get(character.id) ?? [];

  return [
    ...new Set(
      [...resolveNameDerivedPartyConflictKeys(character.name), ...explicitKeys, ...overrideKeys]
        .map((value) => normalizePartyConflictKey(String(value ?? '')))
        .filter((value) => value.length > 0),
    ),
  ];
}

/*
 * 869f127ej. The leader-seat exemption, in ONE place.
 *
 * The rule is owner-confirmed and absolute: slot 0 (Captain) and slot 1 (Friend Captain) are exempt
 * from the name-derived conflict rule; the four sub slots are not. In the game the Friend Captain is
 * borrowed from another player's crew, so it is never constrained by what is already in yours - the
 * same character may hold both leader seats, and two cards of the same character may hold them.
 *
 * `resolveCharacterPartyConflictKeys` is name-derived and a character always carries its own primary
 * key, so a character conflicts with ITSELF. That is correct for the four subs and wrong for the two
 * leaders, which is why applying it uniformly is a defect rather than a simplification.
 *
 * Before this, the exemption was written out per call site: Captain Coverage filtered the Friend
 * Captain out of its key set, the Manual Team Builder returned early below the first sub index, and
 * the Auto Team Builder engine had its own. `captain-coverage` was the outlier until 869eum54p -
 * which is precisely the failure mode of a rule with no single owner, and a new page that assembles
 * a team inherited nothing.
 *
 * Ask `maySlotHoldCharacter` instead of reaching for the raw keys. A page that reaches for them
 * directly is visible in a grep for `resolveCharacterPartyConflictKeys` outside this module.
 */

/** Slot 0. Exempt from the conflict rule. */
export const TEAM_CAPTAIN_SLOT_INDEX = 0;
/** Slot 1. Exempt, and it never contributes keys to anything either. */
export const TEAM_FRIEND_CAPTAIN_SLOT_INDEX = 1;
/** Slots 2..5. The only seats the name-derived rule governs. */
export const TEAM_FIRST_SUB_SLOT_INDEX = 2;

export function isLeaderSlotIndex(slotIndex: number): boolean {
  return slotIndex === TEAM_CAPTAIN_SLOT_INDEX || slotIndex === TEAM_FRIEND_CAPTAIN_SLOT_INDEX;
}

export function isSubSlotIndex(slotIndex: number): boolean {
  return Number.isInteger(slotIndex) && slotIndex >= TEAM_FIRST_SUB_SLOT_INDEX;
}

/**
 * The conflict keys a candidate for `slotIndex` must not collide with.
 *
 * Two seats never contribute: the slot being filled (a character does not conflict with the seat it
 * is about to leave or re-take) and the Friend Captain (borrowed, so it constrains nothing). The
 * Captain DOES contribute, because a sub may not repeat the Captain.
 */
export function resolveOccupiedPartyConflictKeys(
  slots: ReadonlyArray<PartyConflictCharacter | null | undefined>,
  slotIndex: number,
): Set<string> {
  const keys = new Set<string>();

  slots.forEach((slot, index) => {
    if (!slot || index === slotIndex || index === TEAM_FRIEND_CAPTAIN_SLOT_INDEX) {
      return;
    }

    for (const key of resolveCharacterPartyConflictKeys(slot)) {
      keys.add(key);
    }
  });

  return keys;
}

/**
 * The one supported way to ask whether a slot may hold a character.
 *
 * A leader seat always may - unconditionally, before any key is even resolved. That ordering is the
 * point: it makes the exemption impossible to lose behind a later condition, which is how it went
 * missing on one page before.
 */
export function maySlotHoldCharacter(
  slots: ReadonlyArray<PartyConflictCharacter | null | undefined>,
  slotIndex: number,
  character: PartyConflictCharacter | null | undefined,
): boolean {
  if (!character) {
    return true;
  }

  if (isLeaderSlotIndex(slotIndex)) {
    return true;
  }

  const occupied = resolveOccupiedPartyConflictKeys(slots, slotIndex);

  return !resolveCharacterPartyConflictKeys(character).some((key) => occupied.has(key));
}

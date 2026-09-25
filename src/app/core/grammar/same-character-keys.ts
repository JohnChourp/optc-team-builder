/**
 * 869f63grj. The one copy of the rule that decides whether two cards are the same in-game
 * character, shared by the app - every page that assembles a crew - and by the build-time check of
 * the published teams (`scripts/check-published-teams.mjs`).
 *
 * `resolveSameCharacterKeys` answers it, in this order:
 *
 *  1. An entry in the party-conflict override file states a unit's keys by hand, and wins. It is
 *     for the case where the source below is wrong about one unit.
 *  2. Otherwise upstream's own answer: `common/data/families.js` in the importer's source repository
 *     names the character(s) on every card, and the importer stores that list per unit as
 *     `families` (the `families_json` column).
 *  3. Otherwise - the units families.js has no entry for (82 in the dataset of 2026-09-24, nearly
 *     all of them fodder and evolution material, plus the Luffy cards #4130 and #4131) and any
 *     manually added character - the name rule below.
 *
 * Two cards are the same character when their keys intersect. Family names and name-derived keys
 * share one key space on purpose: `Monkey D. Luffy` is the family name and the name rule's primary
 * key alike, so a card upstream has not named yet still meets the cards it has.
 *
 * Why upstream first. Measured 2026-09-24 over the shipped seed, the name rule and families.js
 * disagreed on 18,449 unit pairs. 258 of the pairs the name rule let into one crew are two stages of
 * ONE evolution chain (#38 Buggy -> #39 Buggy the Clown, #2386 Kaido -> #2387), so the game's own
 * data calls them one character; none of the pairs it refused was. Its refusals came from a derived
 * token such as a name's last word - `neo` alone made #1622 Donquixote Doflamingo: Neo "the same
 * character" as #1646 Pica: Neo.
 *
 * Why family NAMES and not family identity. families.js builds each unit's list out of named
 * constants, and exactly two display names belong to more than one constant. `Onimaru` is in both
 * the Onimaru and the Gyukimaru family, and matching by name is what keeps #2993 Gyukimaru (listed
 * as Onimaru only) with the other Gyukimaru cards, as the game does. `BB` is in both the Blackbeard
 * and the Blackback family, which would make Marshall D. Teach the same character as the Blackback
 * cards #2179 and #3537; the override file states those two by hand instead.
 *
 * The name rule was MOVED here from `character-party-conflict-keys.utils.ts`, unchanged. It is also
 * what the Auto Team Builder's super-criteria and name matching read, and the importer bakes an
 * older copy of it into `detail.partyConflictKeys` (`scripts/lib/party-conflict-keys.mjs`), which
 * the SEO pages' related characters read. None of those is a legality rule, so none of them moved to
 * families.
 *
 * It keeps the three constraints `captain-boost-grammar.ts` beside it documents, so the Node build
 * scripts can import this file directly: import-free, erasable syntax only, and the `package.json`
 * in this folder declares `"type": "module"`. That is why the override map is passed in rather than
 * imported - each side reads its own copy of the file.
 */

/** Character id -> the keys the override file states for it. */
export type PartyConflictOverrides = ReadonlyMap<number, readonly string[]>;

/** What the name rule reads. A dataset record, a list item and a Local edit all fit. */
export interface PartyConflictSource {
  id: number;
  name: string;
  detail?: { partyConflictKeys?: readonly unknown[] | null } | null;
}

/** What the same-character rule reads: the name rule's input, plus upstream's families. */
export interface SameCharacterSource extends PartyConflictSource {
  families?: readonly string[] | null;
}

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

/** The override file's JSON, read the way both copies are read. A non-array entry reads as none. */
export function readPartyConflictOverrides(
  catalog: Record<string, unknown>,
): Map<number, string[]> {
  return new Map<number, string[]>(
    Object.entries(catalog).map(([characterId, keys]) => [
      Number(characterId),
      Array.isArray(keys) ? keys.map((value) => String(value)) : [],
    ]),
  );
}

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
    .map((match) => normalizePartyConflictKey(match[1] ?? ''))
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

/**
 * The name rule: keys derived from the card name, plus any the dataset states for the unit, plus the
 * unit's override entry. Super-criteria and name matching read this, and so does step 3 of
 * `resolveSameCharacterKeys`.
 */
export function resolveNamePartyConflictKeys(
  character: PartyConflictSource,
  overrides: PartyConflictOverrides,
): string[] {
  const explicitKeys = Array.isArray(character.detail?.partyConflictKeys)
    ? character.detail.partyConflictKeys
    : [];
  const overrideKeys = overrides.get(character.id) ?? [];

  return [
    ...new Set(
      [...resolveNameDerivedPartyConflictKeys(character.name), ...explicitKeys, ...overrideKeys]
        .map((value) => normalizePartyConflictKey(String(value ?? '')))
        .filter((value) => value.length > 0),
    ),
  ];
}

function normalizeKeyList(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => normalizePartyConflictKey(String(value ?? '')))
        .filter((value) => value.length > 0),
    ),
  ];
}

/** The keys that decide whether two cards are the same in-game character. See the header. */
export function resolveSameCharacterKeys(
  character: SameCharacterSource,
  overrides: PartyConflictOverrides,
): string[] {
  const overrideKeys = normalizeKeyList(overrides.get(character.id) ?? []);

  if (overrideKeys.length > 0) {
    return overrideKeys;
  }

  const familyKeys = normalizeKeyList(character.families ?? []);

  if (familyKeys.length > 0) {
    return familyKeys;
  }

  return resolveNamePartyConflictKeys(character, overrides);
}

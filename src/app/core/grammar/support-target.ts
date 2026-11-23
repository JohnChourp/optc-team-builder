/**
 * 869f63gy0. Who a support can attach to, read from its "Supported characters" sentence.
 *
 * Upstream writes the target as prose - "Driven characters", "[INT] Cerebral characters",
 * "Characters with cost 40 or less", or a list of names - and the app only displayed it, so the
 * question "who can support this unit?" sent players to an outside database. This reads the
 * sentence into rules and answers, per character, `yes`, `no` or `undetermined`. It never ranks
 * supports: eligibility only.
 *
 * The sentence forms, measured on the shipped seed of 2026-11-19 (2,299 supports, 1,099 distinct
 * sentences):
 *
 *  - "All characters".
 *  - "Characters with cost N or less" / "... or more".
 *  - A group: types in brackets ([STR] ... [PSY]), the eight classes, and crew tags in brackets
 *    ([Navy], [Egghead Arc]), ending in "character(s)". Words joined by ",", "and" or "/" are
 *    alternatives of the same kind ("[STR], [DEX] and [PSY]"), words side by side must all hold
 *    ("[INT] Cerebral"), and a separator followed by a new kind of word starts a new alternative
 *    ("[INT] Slasher and [INT] Free Spirit").
 *  - Anything else is a list of names, matched against the character's upstream families
 *    (`families.js`), the same names the sentence uses ("Monkey D. Luffy", "Kuzan (Aokiji)").
 *
 * When the dataset cannot say, the answer is `undetermined`, never `no`:
 *
 *  - a crew tag the character does not carry - only some characters have tags at all;
 *  - a type or class that only another form of a dual or VS unit has;
 *  - a name that is no family in the dataset, or a character with no family;
 *  - a sentence this file cannot read.
 *
 * It keeps the constraints of `captain-boost-grammar.ts` (import-free, erasable syntax only, the
 * `package.json` beside it), so a script can measure the dataset with this very file.
 */

export type SupportEligibility = 'yes' | 'no' | 'undetermined';

export interface SupportTargetAlternative {
  types: string[];
  classes: string[];
  tags: string[];
}

export type SupportTarget =
  | { kind: 'all' }
  | { kind: 'cost'; limit: number; direction: 'atMost' | 'atLeast' }
  | { kind: 'groups'; alternatives: SupportTargetAlternative[] }
  | { kind: 'names'; names: string[]; qualifier: SupportTargetAlternative[] | null }
  | { kind: 'unreadable' };

/** The fields the rule reads. A `CharacterDetailRecord` fits. */
export interface SupportTargetCandidate {
  /** The card name, "Monkey D. Luffy - Gear 2"; it narrows a name the families do not know. */
  name?: string;
  type: string;
  classes: readonly string[];
  cost: number;
  families?: readonly string[] | null;
  forms?: ReadonlyArray<{ type: string; classes: readonly string[] }> | null;
  detail?: { characterTags?: readonly string[] | null } | null;
}

const TYPES = ['STR', 'DEX', 'QCK', 'INT', 'PSY'];
const CLASSES = [
  'Free Spirit',
  'Powerhouse',
  'Cerebral',
  'Fighter',
  'Slasher',
  'Striker',
  'Shooter',
  'Driven',
];

type TokenKind = 'types' | 'classes' | 'tags';

type GroupToken = { kind: TokenKind; value: string } | { kind: 'separator' };

export function parseSupportTarget(text: string): SupportTarget {
  const sentence = normalizeSpaces(text);

  if (!sentence) {
    return { kind: 'unreadable' };
  }

  if (/^all characters?\.?$/i.test(sentence)) {
    return { kind: 'all' };
  }

  const cost = /^characters? with cost (\d+) or (less|more)\.?$/i.exec(sentence);

  if (cost) {
    return {
      kind: 'cost',
      limit: Number(cost[1]),
      direction: (cost[2] ?? '').toLowerCase() === 'less' ? 'atMost' : 'atLeast',
    };
  }

  const group = /^(.+?)\s+characters?\.?$/i.exec(sentence);

  if (group) {
    const alternatives = readGroup(group[1] ?? '');

    return alternatives ? { kind: 'groups', alternatives } : { kind: 'unreadable' };
  }

  // "[INT] of the following: Nami, Usopp", "[QCK] Monkey D. Luffy", "[DEX] Free Spirit Franky,
  // Brook, Jinbe": a type or class that every listed character must also have.
  const following = /^(.+?)\s+of the following:\s*(.+)$/i.exec(sentence);
  const leading = following ? null : readLeadingQualifier(sentence);
  const qualifierText = following?.[1] ?? leading?.qualifier ?? '';
  const namesText = following?.[2] ?? leading?.rest ?? sentence;
  const qualifier = qualifierText ? readGroup(qualifierText) : null;

  if (
    (qualifierText && !qualifier) ||
    /[[\]]/.test(namesText) ||
    /\bcharacters?\b/i.test(namesText)
  ) {
    return { kind: 'unreadable' };
  }

  const names = splitNames(namesText.replace(/\.$/, ''));

  return names.length ? { kind: 'names', names, qualifier } : { kind: 'unreadable' };
}

/**
 * Whether `candidate` can receive a support whose sentence reads as `target`.
 *
 * `knownFamilies` is every family name in the dataset, normalised with `normalizeSupportName`; a
 * listed name outside it cannot be checked, so it makes a non-match `undetermined`.
 */
export function matchSupportTarget(
  target: SupportTarget,
  candidate: SupportTargetCandidate,
  knownFamilies: ReadonlySet<string>,
): SupportEligibility {
  switch (target.kind) {
    case 'all':
      return 'yes';
    case 'cost':
      return (
        target.direction === 'atMost'
          ? candidate.cost <= target.limit
          : candidate.cost >= target.limit
      )
        ? 'yes'
        : 'no';
    case 'groups':
      return combine(
        target.alternatives.map((alternative) => matchAlternative(alternative, candidate)),
      );
    case 'names':
      return both(
        matchNames(target.names, candidate, knownFamilies),
        target.qualifier
          ? combine(target.qualifier.map((alternative) => matchAlternative(alternative, candidate)))
          : 'yes',
      );
    default:
      return 'undetermined';
  }
}

/** Lower case, single spaces, no accents: "Senor Pink" in a sentence is the family "Señor Pink". */
export function normalizeSupportName(value: string): string {
  return normalizeSpaces(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function readGroup(body: string): SupportTargetAlternative[] | null {
  const tokens = tokenize(body);

  if (!tokens || tokens.length === 0) {
    return null;
  }

  const alternatives: SupportTargetAlternative[] = [];
  let current: SupportTargetAlternative = { types: [], classes: [], tags: [] };
  let lastKind: TokenKind | null = null;
  let afterSeparator = false;

  for (const token of tokens) {
    if (token.kind === 'separator') {
      if (lastKind === null || afterSeparator) {
        return null;
      }

      afterSeparator = true;
      continue;
    }

    if (afterSeparator && token.kind !== lastKind) {
      alternatives.push(current);
      current = { types: [], classes: [], tags: [] };
    } else if (!afterSeparator && token.kind === lastKind) {
      // "[Navy] [SWORD]" side by side, with no separator: not a form upstream uses.
      return null;
    }

    current[token.kind].push(token.value);
    lastKind = token.kind;
    afterSeparator = false;
  }

  if (afterSeparator) {
    return null;
  }

  alternatives.push(current);

  return alternatives;
}

function tokenize(body: string): GroupToken[] | null {
  const { tokens, rest } = tokenizePrefix(body);

  return rest.length ? null : tokens;
}

/** The type and class words at the start of a name list, and the names after them. */
function readLeadingQualifier(sentence: string): { qualifier: string; rest: string } | null {
  const { tokens, rest } = tokenizePrefix(sentence);
  const words = tokens.filter((token) => token.kind !== 'separator');

  if (
    !rest.length ||
    words.length === 0 ||
    words.some((token) => token.kind === 'tags') ||
    tokens[tokens.length - 1]?.kind === 'separator'
  ) {
    return null;
  }

  return { qualifier: sentence.slice(0, sentence.length - rest.length).trim(), rest };
}

function tokenizePrefix(body: string): { tokens: GroupToken[]; rest: string } {
  const tokens: GroupToken[] = [];
  let rest = body.trim();

  while (rest.length) {
    const bracket = /^\[([^\]]+)\]/.exec(rest);
    const separator = /^(?:,\s*and\b|,\s*or\b|,|\/|and\b|or\b)/i.exec(rest);
    const className = CLASSES.map((name) =>
      new RegExp(`^${name.replace(' ', '\\s+')}\\b`, 'i').exec(rest),
    ).find(Boolean);

    if (bracket) {
      const value = normalizeSpaces(bracket[1] ?? '');
      const type = value.toUpperCase();

      tokens.push(TYPES.includes(type) ? { kind: 'types', value: type } : { kind: 'tags', value });
      rest = rest.slice(bracket[0].length);
    } else if (separator) {
      tokens.push({ kind: 'separator' });
      rest = rest.slice(separator[0].length);
    } else if (className) {
      const value = CLASSES.find(
        (name) => normalizeSupportName(name) === normalizeSupportName(className[0]),
      );

      tokens.push({ kind: 'classes', value: value ?? normalizeSpaces(className[0]) });
      rest = rest.slice(className[0].length);
    } else {
      break;
    }

    rest = rest.trimStart();
  }

  return { tokens, rest };
}

/**
 * "A, B and C", "Heat or Wire"; a comma inside brackets ("Baron Tamago (Viscount Hiyoko, Count
 * Niwatori)") is no separator. Brackets that do not balance give no names, so the sentence reads
 * as unreadable rather than as the wrong names.
 */
function splitNames(text: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of text) {
    depth += char === '(' ? 1 : char === ')' ? -1 : 0;

    if (depth < 0) {
      return [];
    }

    if (char === ',' && depth === 0) {
      names.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (depth !== 0) {
    return [];
  }

  names.push(current);

  return names
    .flatMap(splitOutsideBrackets)
    .map((name) => name.trim().replace(/^(?:and|or)\s+/i, ''))
    .filter(Boolean);
}

function splitOutsideBrackets(part: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  const separator = /\s+(?:and|or)\s+/gi;

  for (let index = 0; index < part.length; index += 1) {
    depth += part[index] === '(' ? 1 : part[index] === ')' ? -1 : 0;

    if (depth === 0) {
      separator.lastIndex = index;
      const match = separator.exec(part);

      if (match && match.index === index) {
        pieces.push(part.slice(start, index));
        start = index + match[0].length;
        index = start - 1;
      }
    }
  }

  pieces.push(part.slice(start));

  return pieces;
}

/** "Edward Newgate (Whitebeard)" is "Edward Newgate", "Whitebeard" or the whole, as families name it. */
export function supportNameKeys(name: string): string[] {
  const keys = [normalizeSupportName(name)];
  const aka = /^(.+?)\s*\((.+)\)$/.exec(name.trim());

  if (aka) {
    keys.push(normalizeSupportName(aka[1] ?? ''));
    keys.push(...(aka[2] ?? '').split(',').map(normalizeSupportName));
  }

  return keys.filter(Boolean);
}

function matchAlternative(
  alternative: SupportTargetAlternative,
  candidate: SupportTargetCandidate,
): SupportEligibility {
  const results: SupportEligibility[] = [];
  const forms = candidate.forms ?? [];

  if (alternative.types.length) {
    results.push(
      matchOwnOrForm(
        (type) => alternative.types.some((wanted) => splitTypes(type).includes(wanted)),
        candidate,
        forms,
      ),
    );
  }

  if (alternative.classes.length) {
    results.push(
      matchOwnOrForm(
        (_type, classes) =>
          alternative.classes.some((wanted) =>
            classes.some((name) => normalizeSupportName(name) === normalizeSupportName(wanted)),
          ),
        candidate,
        forms,
      ),
    );
  }

  if (alternative.tags.length) {
    results.push(matchTags(alternative.tags, candidate.detail?.characterTags ?? []));
  }

  if (results.includes('no')) {
    return 'no';
  }

  return results.includes('undetermined') ? 'undetermined' : 'yes';
}

function matchOwnOrForm(
  matches: (type: string, classes: readonly string[]) => boolean,
  candidate: SupportTargetCandidate,
  forms: ReadonlyArray<{ type: string; classes: readonly string[] }>,
): SupportEligibility {
  if (matches(candidate.type, candidate.classes)) {
    return 'yes';
  }

  return forms.some((form) => matches(form.type, form.classes)) ? 'undetermined' : 'no';
}

/**
 * A tag counts when the character carries it, or carries it as the first part of a longer tag
 * ("Paramythia-type / Devil Fruit User" for [Paramythia-type]). "Former / Navy", or no tag at all,
 * cannot say either way: tags cover some characters only.
 */
function matchTags(wanted: readonly string[], tags: readonly string[]): SupportEligibility {
  const heads = tags.map((tag) => normalizeSupportName(tag.split('/')[0] ?? ''));
  const full = tags.map(normalizeSupportName);

  return wanted.some((tag) => {
    const key = normalizeSupportName(tag);

    return full.includes(key) || heads.includes(key);
  })
    ? 'yes'
    : 'undetermined';
}

/**
 * A family hit is a yes. Otherwise it is "cannot tell" when the card's own name is a listed name
 * (upstream's family for the card disagrees with it: cards named "Tank Lepanto - ..." carry the
 * family "Princess Scarlet"), when the unit has no family, or when a listed name is no family in
 * the dataset and shares a word with the unit's name or families ("Pacifista PX-1" and the
 * Pacifista cards). Every other unit is a no.
 */
function matchNames(
  names: readonly string[],
  candidate: SupportTargetCandidate,
  knownFamilies: ReadonlySet<string>,
): SupportEligibility {
  const families = new Set((candidate.families ?? []).map(normalizeSupportName));
  const keysByName = names.map(supportNameKeys);

  if (keysByName.some((keys) => keys.some((key) => families.has(key)))) {
    return 'yes';
  }

  const cardName = normalizeSupportName((candidate.name ?? '').split(' - ')[0] ?? '');

  if (families.size === 0 || (cardName && keysByName.some((keys) => keys.includes(cardName)))) {
    return 'undetermined';
  }

  const unknown = keysByName.filter((keys) => !keys.some((key) => knownFamilies.has(key)));

  if (unknown.length === 0) {
    return 'no';
  }

  // Without the card name there is nothing to narrow an unknown name with.
  if (candidate.name === undefined) {
    return 'undetermined';
  }

  const ownWords = new Set([cardName, ...families].flatMap(significantWords));

  return unknown.some((keys) => keys.flatMap(significantWords).some((word) => ownWords.has(word)))
    ? 'undetermined'
    : 'no';
}

const NAME_STOP_WORDS = new Set(['and', 'the', 'of', 'mr', 'mrs', 'miss', 'dr', 'st']);

function significantWords(value: string): string[] {
  return value.split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !NAME_STOP_WORDS.has(word));
}

/** Both must hold. */
function both(left: SupportEligibility, right: SupportEligibility): SupportEligibility {
  if (left === 'no' || right === 'no') {
    return 'no';
  }

  return left === 'yes' && right === 'yes' ? 'yes' : 'undetermined';
}

/** Any one must hold: a yes wins, then "cannot tell". */
export function combine(results: readonly SupportEligibility[]): SupportEligibility {
  if (results.includes('yes')) {
    return 'yes';
  }

  return results.includes('undetermined') ? 'undetermined' : 'no';
}

function splitTypes(type: string): string[] {
  return type
    .split(/[,/]/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

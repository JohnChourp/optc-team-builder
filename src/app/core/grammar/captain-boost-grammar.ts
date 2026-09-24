/**
 * 869f63guq. The one copy of the rules that read a Captain boost out of the ability text,
 * shared by the build that writes the dataset and by the app that reads it.
 *
 * Until this file those rules lived in several copies that had already drifted apart, and both
 * drifts reached the player:
 *
 *  - The cost and rarity scope ("Boosts ATK of Cost 20 or less characters by 3x") was taught to
 *    the build-time scope check in 869dc7dj5 and never to the runtime one, so Captain Coverage
 *    listed #458 Sengoku's 2,009 matching cards as "0 boosted" (869f63gqz).
 *  - The Character Edit override path re-derived boosts with an older copy of the dataset's
 *    parser, so a save that changed nothing moved 189 Captain boosts - #1044 Law ATK 4 -> 2
 *    (869f63gqd).
 *
 * The build is canonical. Every rule below was MOVED here from `scripts/lib/optc-dataset.mjs` and
 * `scripts/lib/captain-ability-coverage.mjs`, not rewritten, and the shipped dataset regenerates
 * unchanged from it. `scripts/lib/captain-grammar-parity.spec.ts`, in the `captain-contracts`
 * lane, checks over the whole shipped dataset that the build and the app still read every
 * Captain's boosts and cost or rarity scope the same way.
 *
 * Who reads what:
 *
 *  - `resolveCaptainBoosts` - the dataset's `captain_hp_boost` / `captain_atk_boost` /
 *    `captain_average_boost` (`resolveCharacterCaptainBoosts` in optc-dataset.mjs), a Local edit
 *    whose captain text changed (character-overrides.utils.ts), and a candidate's captain
 *    multipliers in the Auto Team Builder (auto-team-builder.utils.ts).
 *  - `hasCaptainCostOrRarityScope`, `readCaptainClauseRanges`, `captainValueInRange` - the cost
 *    and rarity scope of every generated tier (captain-ability-coverage.mjs), and who a cost- or
 *    rarity-scoped Captain actually boosts at runtime (captain-coverage.utils.ts and
 *    captain-coverage-filter.utils.ts).
 *
 * Three constraints keep it importable from both sides. Do not relax them:
 *
 *  1. IMPORT-FREE. Node loads this file by stripping its types, and then resolves imports the way
 *     it resolves JavaScript: an extensionless `./html-text.utils` does not load. That is why the
 *     HTML normalizer is passed in (`normalizeText`) rather than imported - each side hands over
 *     its own `normalizeHtmlToText`.
 *  2. ERASABLE SYNTAX ONLY - no `enum`, no `namespace`, no parameter properties. Type stripping
 *     deletes types; it does not compile anything.
 *  3. The `package.json` beside this file declares `"type": "module"`. Without it Node has to
 *     guess the format, re-parses the file as ESM and prints `MODULE_TYPELESS_PACKAGE_JSON` on
 *     every run of the importer - measured on Node 22.22.3, 24.15.0 and 26.0.0. Adding the field
 *     to the app's own package.json instead would turn every `.js` file in the repository into
 *     ESM.
 */

interface CaptainAbilityTextVariant {
  key?: string | null;
  text?: string | null;
}

/** The two fields the boost grammar reads. A dataset detail and a Local edit's detail both fit. */
export interface CaptainAbilityTextSource {
  captainAbility?: string | null;
  captainAbilityVariants?: readonly CaptainAbilityTextVariant[] | null;
}

export interface CaptainBoosts {
  captainHpBoost: number;
  captainAtkBoost: number;
  captainAverageBoost: number;
}

export interface CaptainValueRange {
  min?: number;
  max?: number;
}

export interface CaptainClauseRanges {
  costRange?: CaptainValueRange;
  rarityRange?: CaptainValueRange;
}

const CAPTAIN_BRANCH_PATTERN =
  /\b(always active|standard captain|powered up captain|rampage captain)\s*:\s*/gi;
const CAPTAIN_EFFECT_CLAUSE_SEPARATOR =
  /,\s+(?=(?:and\s+)?(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)|\s+\band\s+(?=(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)/gi;
const SHARED_CAPTAIN_BOOST_MULTIPLIER_PATTERN =
  /\b(boosts?\s+(?:ATK|HP)\s+of\s+)((?:(?!\bby\s+\d).)+?)(\s+and\s+boosts?\s+(?:ATK|HP)\s+of\s+(?:(?!\bby\s+\d).)+?)(\s+by\s+(\d+(?:\.\d+)?)x)\b/gi;
const CONDITIONAL_CAPTAIN_BOOST_PREFIX_PATTERN =
  /^(?:(?:and|or|also|additionally|furthermore|then|otherwise)\b,?\s*)*(?:if|when)\b/i;
const INLINE_CAPTAIN_BOOST_CONDITION_PATTERN = /\b(?:if|when)\b/i;
const INLINE_CONDITIONAL_BOOST_RIDER_PATTERN =
  /,\s*(?:or\s+)?by\s+\d+(?:\.\d+)?x(?:-\d+(?:\.\d+)?x)?\s+instead\b[^,.;]*/gi;
const TRAILING_CAPTAIN_BOOST_ALTERNATIVE_PATTERN =
  /(?:,\s*(?:(?:or|and)\s+)?|\s+and\s+)by\s+(\d+(?:\.\d+)?x(?:-\d+(?:\.\d+)?x)?)(?:\s+instead)?\b((?:(?!(?:,\s*(?:(?:or|and)\s+)?|\s+and\s+)by\s+\d+(?:\.\d+)?x(?:-\d+(?:\.\d+)?x)?\b)(?!\s+(?:and|but)\s+(?:boosts?|reduces?|makes?|changes?|increases?|restores?|deals?|cuts?|lowers?|decreases?|sets?|adds?)\b)[^,;])*)/gi;
const CAPTAIN_BOOST_MULTIPLIER_VALUE_PATTERN = /\bby\s+\d+(?:\.\d+)?x(?:-\d+(?:\.\d+)?x)?\b/gi;
const DEFAULT_CAPTAIN_BRANCH_LABELS = new Set(['always active', 'standard captain']);
const PREFERRED_DEFAULT_CAPTAIN_VARIANT_KEYS = [
  'base',
  'captain',
  'description',
  'level0',
  'llbbase',
  'level1',
];

const COST_SUBSET_PATTERN =
  /\bcost\s+(?:\d+\s+or\s+(?:more|less|higher|lower)|\d+\s*-\s*\d+|\d+)\s+characters?\b/i;
const COST_RANGE_PATTERN = /\bcost\s+(\d+)\s*-\s*(\d+)\s+characters?\b/i;
const COST_EXACT_PATTERN = /\bcost\s+(\d+)\s+characters?\b/i;
const COST_MIN_PATTERN = /\bcost\s+(\d+)\s+or\s+(?:more|higher)\s+characters?\b/i;
const COST_MAX_PATTERN = /\bcost\s+(\d+)\s+or\s+(?:less|lower)\s+characters?\b/i;
const RARITY_SUBSET_PATTERN =
  /\brarity\s+(?:\d+\s+or\s+(?:more|less|higher|lower|\d+\+))\s+characters?\b/i;
const RARITY_MIN_PATTERN = /\brarity\s+(\d+)\s+or\s+(?:more|higher)\s+characters?\b/i;
const RARITY_MAX_PATTERN = /\brarity\s+(\d+)\s+or\s+(?:less|lower)\s+characters?\b/i;
const RARITY_TIERED_PATTERN = /\brarity\s+(\d+)\s+or\s+\1\+\s+characters?\b/i;

/**
 * The HP, ATK and average boost a Captain gives, read from its default captain text: the
 * unconditional clauses of its "Always Active" / "Standard Captain" branch, or of the whole text
 * when it has no branches.
 *
 * `normalizeText` is the caller's own `normalizeHtmlToText` - see the header for why it is not
 * imported. The captain text is normalized once here, and a match is normalized again before the
 * self-only test, exactly as the build always did.
 */
export function resolveCaptainBoosts(
  detail: CaptainAbilityTextSource | null | undefined,
  normalizeText: (text: string) => string,
): CaptainBoosts {
  const captainText = resolveDefaultCaptainAbilityText(detail);
  const defaultCaptainText = extractDefaultCaptainBoostText(captainText, normalizeText);
  const captainHpBoost = extractHighestCaptainBoost(defaultCaptainText, 'hp', normalizeText);
  const captainAtkBoost = extractHighestCaptainBoost(defaultCaptainText, 'atk', normalizeText);

  return {
    captainHpBoost,
    captainAtkBoost,
    captainAverageBoost: (captainHpBoost + captainAtkBoost) / 2,
  };
}

/**
 * The captain text a boost is read from: the first preferred variant that has text, then any
 * variant with text, then `captainAbility`.
 */
function resolveDefaultCaptainAbilityText(
  detail: CaptainAbilityTextSource | null | undefined,
): string {
  const candidateVariants = detail?.captainAbilityVariants;
  const variants: readonly CaptainAbilityTextVariant[] = Array.isArray(candidateVariants)
    ? candidateVariants
    : [];
  const preferredVariant = PREFERRED_DEFAULT_CAPTAIN_VARIANT_KEYS.map((key) =>
    variants.find((variant) => String(variant?.key ?? '').toLowerCase() === key && variant?.text),
  ).find(Boolean);
  const fallbackVariant = variants.find((variant) => variant?.text);

  return String(
    preferredVariant?.text ?? fallbackVariant?.text ?? detail?.captainAbility ?? '',
  ).trim();
}

/** A clause scoped by cost ("Cost 20 or less characters") or rarity ("Rarity 4 or 4+ characters"). */
export function hasCaptainCostOrRarityScope(clause: string): boolean {
  return COST_SUBSET_PATTERN.test(clause) || RARITY_SUBSET_PATTERN.test(clause);
}

/**
 * The cost and rarity range one clause names, folded over the ranges already read from earlier
 * clauses of the same tier (`previous`).
 *
 * The fold is the build's: every match spreads the range read so far and then writes its own
 * bound, so the generated tiers keep the exact key order they have always had. A caller reading a
 * single clause passes nothing.
 */
export function readCaptainClauseRanges(
  clause: string,
  previous: CaptainClauseRanges = {},
): CaptainClauseRanges {
  let costRange = previous.costRange;
  let rarityRange = previous.rarityRange;

  const costRangeMatch = clause.match(COST_RANGE_PATTERN);
  if (costRangeMatch !== null) {
    costRange = {
      ...(costRange ?? {}),
      min: Number(costRangeMatch[1]),
      max: Number(costRangeMatch[2]),
    };
  } else {
    // "Cost N characters" (exact, no qualifier) - equivalent to a closed range [N, N].
    // Only applied when no other cost qualifier already matched, to avoid double-counting
    // patterns like "Cost N or more" / "Cost A-B" which contain "Cost N" as a substring.
    const costExact = clause.match(COST_EXACT_PATTERN);
    const hasOtherCostMatch = COST_MIN_PATTERN.test(clause) || COST_MAX_PATTERN.test(clause);
    if (costExact !== null && !hasOtherCostMatch) {
      const exact = Number(costExact[1]);
      costRange = {
        ...(costRange ?? {}),
        min: exact,
        max: exact,
      };
    }
  }
  const costMin = clause.match(COST_MIN_PATTERN);
  const costMax = clause.match(COST_MAX_PATTERN);
  if (costMin !== null) {
    costRange = {
      ...(costRange ?? {}),
      min: Number(costMin[1]),
    };
  }
  if (costMax !== null) {
    costRange = {
      ...(costRange ?? {}),
      max: Number(costMax[1]),
    };
  }

  const rarityTiered = clause.match(RARITY_TIERED_PATTERN);
  if (rarityTiered !== null) {
    // "Rarity N or N+ characters" - exact-tier (both base and trained Rarity N units).
    // The "+" suffix is OPTC's trained-rarity marker; the boost still scopes to that single
    // rarity level (a Rarity 5 unit does not get the Rarity 4 tier's boost).
    const exact = Number(rarityTiered[1]);
    rarityRange = {
      ...(rarityRange ?? {}),
      min: exact,
      max: exact,
    };
  } else {
    const rarityMin = clause.match(RARITY_MIN_PATTERN);
    const rarityMax = clause.match(RARITY_MAX_PATTERN);
    if (rarityMin !== null) {
      rarityRange = {
        ...(rarityRange ?? {}),
        min: Number(rarityMin[1]),
      };
    }
    if (rarityMax !== null) {
      rarityRange = {
        ...(rarityRange ?? {}),
        max: Number(rarityMax[1]),
      };
    }
  }

  return { costRange, rarityRange };
}

/** Whether a cost or rarity value is inside a range; an absent range admits everything. */
export function captainValueInRange(value: number, range: CaptainValueRange | undefined): boolean {
  return (
    range === undefined ||
    ((range.min === undefined || value >= range.min) &&
      (range.max === undefined || value <= range.max))
  );
}

function extractDefaultCaptainBoostText(
  text: string,
  normalizeText: (text: string) => string,
): string {
  const normalizedText = normalizeSharedCaptainBoostMultipliers(normalizeText(text));
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

// "boosts ATK of X and boosts HP of Y by Nx" -> "boosts ATK of X by Nx and boosts HP of Y by Nx"
// so each side carries its own multiplier through the clause splitter.
function normalizeSharedCaptainBoostMultipliers(text: string): string {
  if (!text) {
    return text;
  }

  return String(text).replace(
    SHARED_CAPTAIN_BOOST_MULTIPLIER_PATTERN,
    (
      _match: string,
      prefix: string,
      firstTarget: string,
      middle: string,
      byClause: string,
      multiplier: string,
    ) => `${prefix}${firstTarget.trimEnd()} by ${multiplier}x${middle}${byClause}`,
  );
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

function extractHighestCaptainBoost(
  text: string,
  stat: 'atk' | 'hp',
  normalizeText: (text: string) => string,
): number {
  const pattern = new RegExp(`\\b${stat}\\b[^.;]*?\\bby\\s+(\\d+(?:\\.\\d+)?)x`, 'gi');

  return extractDefaultCaptainBoostClauses(text).reduce((highest, clause) => {
    return [...clause.matchAll(pattern)].reduce((clauseHighest, match) => {
      if (isSelfOnlyCaptainBoostMatch(match[0], normalizeText)) {
        return clauseHighest;
      }

      const value = Number(match[1]);
      return Number.isFinite(value) && value > clauseHighest ? value : clauseHighest;
    }, highest);
  }, 0);
}

function extractDefaultCaptainBoostClauses(text: string): string[] {
  return splitCaptainEffectClauses(text)
    .map(stripInlineConditionalBoostRiders)
    .filter(
      (clause) =>
        !isConditionGatedCaptainBoostClause(clause) &&
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
        : clause
            .split(CAPTAIN_EFFECT_CLAUSE_SEPARATOR)
            .flatMap(expandTrailingCaptainBoostAlternatives),
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function splitCaptainSentences(text: string): string[] {
  const clauses: string[] = [];
  let current = '';
  const value = String(text ?? '');

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const previousCharacter = value[index - 1] ?? '';
    const nextCharacter = value[index + 1] ?? '';
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
  return CONDITIONAL_CAPTAIN_BOOST_PREFIX_PATTERN.test(clause.trim());
}

function stripInlineConditionalBoostRiders(clause: string): string {
  return normalizeCaptainBoostClause(clause.replace(INLINE_CONDITIONAL_BOOST_RIDER_PATTERN, ''));
}

function expandTrailingCaptainBoostAlternatives(clause: string): string[] {
  const alternatives = [...clause.matchAll(TRAILING_CAPTAIN_BOOST_ALTERNATIVE_PATTERN)];
  if (alternatives.length === 0) {
    return [clause];
  }

  const firstAlternative = alternatives[0];
  const firstAlternativeIndex = firstAlternative?.index;
  if (firstAlternativeIndex === undefined) {
    return [clause];
  }

  const primaryClause = clause.slice(0, firstAlternativeIndex).trim();
  const primaryMultiplier = resolvePrimaryMultiplierForTrailingAlternative(primaryClause);
  if (primaryMultiplier?.index === undefined) {
    return [clause];
  }

  const sharedBoostPrefix = primaryClause.slice(0, primaryMultiplier.index).trimEnd();
  if (!/\bboosts?\b/i.test(sharedBoostPrefix) || !/\b(?:atk|hp)\b/i.test(sharedBoostPrefix)) {
    return [clause];
  }

  const trailingSharedSuffix = extractTrailingSharedBoostSuffix(clause, alternatives);

  return [
    normalizeCaptainBoostClause(`${primaryClause}${trailingSharedSuffix}`),
    ...alternatives.map((alternative) =>
      normalizeCaptainBoostClause(
        `${sharedBoostPrefix} by ${alternative[1]}${alternative[2] ?? ''}${trailingSharedSuffix}`,
      ),
    ),
  ];
}

function resolvePrimaryMultiplierForTrailingAlternative(
  primaryClause: string,
): RegExpMatchArray | undefined {
  const primaryMultipliers = [...primaryClause.matchAll(CAPTAIN_BOOST_MULTIPLIER_VALUE_PATTERN)];
  CAPTAIN_BOOST_MULTIPLIER_VALUE_PATTERN.lastIndex = 0;
  if (
    primaryMultipliers.length > 1 &&
    /\batk\b/i.test(primaryClause) &&
    /\bhp\b/i.test(primaryClause) &&
    /\bstart of the chain\b/i.test(primaryClause)
  ) {
    return primaryMultipliers[0];
  }

  return primaryMultipliers.at(-1);
}

function extractTrailingSharedBoostSuffix(
  clause: string,
  alternatives: readonly RegExpMatchArray[],
): string {
  const finalAlternative = alternatives.at(-1);
  if (finalAlternative?.index === undefined) {
    return '';
  }

  const finalAlternativeEnd = finalAlternative.index + finalAlternative[0].length;
  let suffix = clause.slice(finalAlternativeEnd).replace(/^\s*,\s*/, '').trim();
  if (suffix && !/^(?:and|but)\b/i.test(suffix) && /\b(?:atk|hp)\b/i.test(suffix)) {
    suffix = `and ${suffix}`;
  }
  return suffix ? ` ${suffix}` : '';
}

function normalizeCaptainBoostClause(clause: string): string {
  return String(clause ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function isConditionGatedCaptainBoostClause(clause: string): boolean {
  const normalizedClause = clause.trim();

  if (isConditionalCaptainBoostClause(normalizedClause)) {
    return true;
  }

  const conditionIndex = findInlineConditionIndex(normalizedClause);
  const multiplierIndex = normalizedClause.search(/\bby\s+\d+(?:\.\d+)?x\b/i);

  return conditionIndex > multiplierIndex && multiplierIndex >= 0;
}

function findInlineConditionIndex(clause: string): number {
  const multiplierMatch = CAPTAIN_BOOST_MULTIPLIER_VALUE_PATTERN.exec(clause);
  CAPTAIN_BOOST_MULTIPLIER_VALUE_PATTERN.lastIndex = 0;
  if (multiplierMatch?.index === undefined) {
    return -1;
  }

  const conditionPattern = new RegExp(INLINE_CAPTAIN_BOOST_CONDITION_PATTERN, 'gi');
  let conditionMatch: RegExpExecArray | null;
  while ((conditionMatch = conditionPattern.exec(clause)) !== null) {
    if ((conditionMatch.index ?? -1) > multiplierMatch.index) {
      return conditionMatch.index;
    }
  }

  return -1;
}

function isSelfOnlyCaptainBoostMatch(
  matchText: string,
  normalizeText: (text: string) => string,
): boolean {
  const normalizedText = normalizeText(matchText);

  return (
    /\b(?:atk|hp)\b[^,.;]{0,80}\b(?:this character|self)\b/i.test(normalizedText) ||
    /\bown\s+(?:atk|hp)\b/i.test(normalizedText)
  );
}

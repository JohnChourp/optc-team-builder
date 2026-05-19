import { normalizeHtmlToText } from './html-text.mjs';

const AUTO_TEAM_BUILDER_TYPES = ['DEX', 'STR', 'QCK', 'PSY', 'INT'];
const AUTO_TEAM_BUILDER_CLASSES = [
  'Booster',
  'Cerebral',
  'Driven',
  'Evolver',
  'Fighter',
  'Free Spirit',
  'Powerhouse',
  'Shooter',
  'Slasher',
  'Striker',
];
const UNIVERSAL_SCOPE_PATTERN = /\b(?:all|all characters|all units|all crewmates|crew)\b/i;
const FALLBACK_OTHER_SCOPE_PATTERN = /\ball other (?:characters|units|crewmates)\b/i;
const SELF_SCOPE_PATTERN = /\b(?:this character|own attacks|their own attacks)\b/i;
const BRANCH_LABEL_PATTERN =
  /(?<!Special\s)\b(?:Always Active|Standard Captain|Powered Up Captain|Rampage Captain|Captain Ability|Base Captain Ability|LLB Base Captain Ability|Limit Break Level \d+ Captain Ability|LLB Level \d+ Captain Ability):/gi;
const CAPTAIN_BRANCH_PATTERN =
  /(?<!Special\s)\b(Always Active|Standard Captain|Powered Up Captain|Rampage Captain|Captain Ability|Base Captain Ability|LLB Base Captain Ability|Limit Break Level \d+ Captain Ability|LLB Level \d+ Captain Ability):/gi;
const DEFAULT_CAPTAIN_BRANCH_LABELS = new Set([
  'always active',
  'standard captain',
  'captain ability',
  'base captain ability',
  'llb base captain ability',
]);
const CAPTAIN_EFFECT_CLAUSE_SEPARATOR =
  /,\s+(?=(?:and\s+)?(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b)|\s+and\s+(?=(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?)\b)/gi;
const SHARED_CAPTAIN_BOOST_MULTIPLIER_PATTERN =
  /\b(boosts?\s+(?:ATK|HP)\s+of\s+)((?:(?!\bby\s+\d).)+?)(\s+and\s+boosts?\s+(?:ATK|HP)\s+of\s+(?:(?!\bby\s+\d).)+?)(\s+by\s+(\d+(?:\.\d+)?)x)\b/gi;
const CONDITIONAL_CAPTAIN_BOOST_PREFIX_PATTERN =
  /^(?:(?:and|or|also|additionally|furthermore|then|otherwise)\b,?\s*)*(?:if|when)\b/i;
const CAPTAIN_MULTIPLIER_PATTERN =
  /\bby\s+(?:a\s+further\s+|an?\s+additional\s+|another\s+)?\d+(?:\.\d+)?x\b/i;
const INLINE_CONDITIONAL_BOOST_RIDER_PATTERN =
  /,\s*(?:or\s+)?by\s+\d+(?:\.\d+)?x\s+instead\b[^,.;]*/gi;
const BOOST_INSTEAD_SUFFIX_PATTERN = /\bby\s+(\d+(?:\.\d+)?)x\s+instead\b/gi;
const START_OF_FIGHT_EFFECT_PATTERN =
  /\b(?:at|from)\s+(?:the\s+)?start\s+of\s+(?:the\s+)?(?:fight|quest|adventure)\b/i;
const BRACKETED_LABEL_PATTERN = /\[([^\]]+)\]/g;
const COST_SUBSET_PATTERN = /\bcost\s+\d+\s+or\s+(?:more|less)\s+characters?\b/i;
const ATK_CLAUSE_PATTERN = /\batk\b/i;
const HP_CLAUSE_PATTERN = /\bhp\b/i;
const BOOST_TARGET_FRAGMENT_PATTERNS = [
  /\b(?:of|for)\s+([^.;]{1,220}?)\s+(?:characters|units)\b/gi,
  /\b(?:of|for)\s+(crew)\b/gi,
  /\bboosts?\s+([^.;]{1,220}?)\s+(?:characters|units)(?:'|’)?\s+(?:atk|hp)\b/gi,
  /\bboosts?\s+(crew)(?:'|’)?s?\s+(?:atk|hp)\b/gi,
];
const SPECIAL_COOLDOWN_TARGET_FRAGMENT_PATTERNS = [
  /\breduces?\s+Special Cooldown\s+of\s+([^.;]{1,220}?)\s+(?:characters|units)\s+by\s+\d+\s+turns?\b/gi,
];
const CAPTAIN_SCOPE_ORDER = new Map([
  ['none', 0],
  ['captain-only', 1],
  ['subset', 2],
  ['crew-wide', 3],
]);

export function buildCaptainAbilityCoverage(captainAbilityVariants) {
  const entries = Array.isArray(captainAbilityVariants)
    ? captainAbilityVariants
        .map((entry) => {
          const key = String(entry?.key ?? '').trim();
          const label = String(entry?.label ?? '').trim();
          const text = String(entry?.text ?? '').trim();

          if (!key.length || !label.length || !text.length) {
            return null;
          }

          const coverage = summarizeCaptainAbilityCoverageText(text);

          return {
            key,
            label,
            firstCoverageScope: coverage.firstCoverageScope,
            secondCoverageScope: coverage.secondCoverageScope,
            firstCoverageClauses: coverage.firstCoverageClauses,
            secondCoverageClauses: coverage.secondCoverageClauses,
          };
        })
        .filter(Boolean)
    : [];

  return { entries };
}

export function summarizeCaptainAbilityCoverageText(captainText) {
  const normalizedCaptainText = normalizeSharedCaptainBoostMultipliers(
    normalizeHtmlToText(captainText),
  );

  if (!normalizedCaptainText) {
    return {
      firstCoverageScope: 'none',
      secondCoverageScope: 'none',
      firstCoverageClauses: [],
      secondCoverageClauses: [],
    };
  }

  const defaultCaptainText = extractDefaultCaptainBoostText(normalizedCaptainText);
  const defaultClauses = resolveCaptainBoostScopeClauses(defaultCaptainText, false);
  const fullClauses = resolveCaptainBoostScopeClauses(normalizedCaptainText, true);
  const conditionalOnlyClauses = fullClauses.filter((clause) => !defaultClauses.includes(clause));

  const { baselineClauses, topClauses } = splitCaptainBoostTiers(
    defaultClauses,
    conditionalOnlyClauses,
  );

  const baseFirstScope = resolveCaptainAbilityScope(defaultCaptainText, false);
  const baseSecondScope = resolveCaptainAbilityScope(normalizedCaptainText, true);

  return {
    firstCoverageScope: resolveScopeFromTierClauses(baselineClauses, baseFirstScope),
    secondCoverageScope: resolveScopeFromTierClauses(topClauses, baseSecondScope),
    firstCoverageClauses: baselineClauses,
    secondCoverageClauses: topClauses,
  };
}

// Splits the default boost clauses into a baseline tier (the boost that applies to the broadest
// audience, e.g. "all other characters") and a top tier (the specialised boost for a subset, e.g.
// "Cost 70 or more characters"). HP clauses are repeated in both tiers because HP boosts don't
// participate in OPTC's ATK tier-up convention. When the default has no clause that survives the
// boost-scope filter (typical of captains whose unconditional boost is self-only), the top tier
// falls back to conditional clauses so the user can still see the "real" payoff.
function splitCaptainBoostTiers(defaultClauses, conditionalOnlyClauses) {
  const atkClauses = defaultClauses.filter((clause) => ATK_CLAUSE_PATTERN.test(clause));
  const hpClauses = defaultClauses.filter((clause) => HP_CLAUSE_PATTERN.test(clause));
  const fallbackAtk = atkClauses.filter((clause) => FALLBACK_OTHER_SCOPE_PATTERN.test(clause));
  const nonFallbackAtk = atkClauses.filter((clause) => !FALLBACK_OTHER_SCOPE_PATTERN.test(clause));

  let baselineAtk;
  let topAtk;
  if (fallbackAtk.length > 0 && nonFallbackAtk.length > 0) {
    baselineAtk = fallbackAtk;
    topAtk = nonFallbackAtk;
  } else {
    baselineAtk = atkClauses;
    topAtk = atkClauses;
  }

  if (topAtk.length === 0 && conditionalOnlyClauses.length > 0) {
    topAtk = conditionalOnlyClauses.filter((clause) => ATK_CLAUSE_PATTERN.test(clause));
  }

  return {
    baselineClauses: dedupeClauses([...baselineAtk, ...hpClauses]),
    topClauses: dedupeClauses([...topAtk, ...hpClauses]),
  };
}

function resolveScopeFromTierClauses(tierClauses, fallbackScope) {
  if (!tierClauses.length) {
    return fallbackScope;
  }

  return tierClauses.reduce(
    (scope, clause) => higherCaptainScope(scope, resolveCaptainClauseScope(clause)),
    'none',
  );
}

function dedupeClauses(items) {
  return [...new Set(items)];
}

export function resolveCaptainAbilityScope(captainText, includeConditional = false) {
  const normalizedCaptainText = normalizeSharedCaptainBoostMultipliers(
    normalizeHtmlToText(captainText),
  );

  if (!normalizedCaptainText.length) {
    return 'none';
  }

  return splitCaptainEffectClauses(normalizedCaptainText.replace(BRANCH_LABEL_PATTERN, '. '))
    .map(stripInlineConditionalBoostRiders)
    .map(stripBoostInsteadSuffix)
    .filter((clause) => includeConditional || !isConditionalCaptainBoostClause(clause))
    .reduce((scope, clause) => {
      return higherCaptainScope(scope, resolveCaptainClauseScope(clause));
    }, 'none');
}

function resolveCaptainClauseScope(clause) {
  const normalizedClause = normalizeCoverageClause(clause);

  if (!isCaptainScopedEffectClause(normalizedClause)) {
    return 'none';
  }

  if (boostClauseHasUniversalScope(normalizedClause)) {
    return 'crew-wide';
  }

  if (
    COST_SUBSET_PATTERN.test(normalizedClause) ||
    extractAllowedTypesFromCoverageClause(normalizedClause).length > 0 ||
    extractAllowedClassesFromCoverageClause(normalizedClause).length > 0 ||
    extractAllowedCharacterTagsFromCoverageClause(normalizedClause).length > 0
  ) {
    return 'subset';
  }

  return SELF_SCOPE_PATTERN.test(normalizedClause) ? 'captain-only' : 'none';
}

function isCaptainScopedEffectClause(clause) {
  return (
    /\bboosts?\b/i.test(clause) &&
    /\b(?:atk|hp)\b/i.test(clause) &&
    CAPTAIN_MULTIPLIER_PATTERN.test(clause)
  );
}

function higherCaptainScope(left, right) {
  return (CAPTAIN_SCOPE_ORDER.get(right) ?? 0) > (CAPTAIN_SCOPE_ORDER.get(left) ?? 0)
    ? right
    : left;
}

function resolveCaptainBoostScopeClauses(captainText, includeConditional) {
  return extractCaptainBoostScopeClauses(captainText, includeConditional).map(
    normalizeCoverageClause,
  );
}

// "boosts ATK of X and boosts HP of Y by Nx" -> "boosts ATK of X by Nx and boosts HP of Y by Nx"
// so each side carries its own multiplier through the clause splitter.
function normalizeSharedCaptainBoostMultipliers(text) {
  if (!text) {
    return text;
  }

  return String(text).replace(
    SHARED_CAPTAIN_BOOST_MULTIPLIER_PATTERN,
    (_match, prefix, firstTarget, middle, byClause, multiplier) =>
      `${prefix}${firstTarget.trimEnd()} by ${multiplier}x${middle}${byClause}`,
  );
}

function extractDefaultCaptainBoostText(captainText) {
  const normalizedCaptainText = normalizeSharedCaptainBoostMultipliers(
    normalizeHtmlToText(captainText),
  );
  const branches = extractCaptainBranches(normalizedCaptainText);

  if (!branches.length) {
    return normalizedCaptainText;
  }

  const defaultBranches = branches
    .filter((branch) => DEFAULT_CAPTAIN_BRANCH_LABELS.has(branch.label))
    .map((branch) => branch.text)
    .filter(Boolean);

  return defaultBranches.length
    ? defaultBranches.join('. ')
    : (branches[0]?.text ?? normalizedCaptainText);
}

function extractCaptainBranches(text) {
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

function extractCaptainBoostScopeClauses(text, includeConditional) {
  const boostClauses = splitCaptainEffectClauses(text.replace(BRANCH_LABEL_PATTERN, '. '))
    .map(stripInlineConditionalBoostRiders)
    .map(stripBoostInsteadSuffix)
    .filter(
      (clause) =>
        (includeConditional || !isConditionalCaptainBoostClause(clause)) &&
        isCaptainBoostScopeClause(clause),
    );

  if (!includeConditional) {
    return boostClauses;
  }

  return [...boostClauses, ...extractCaptainStartOfFightCooldownTagClauses(text)];
}

function splitCaptainEffectClauses(text) {
  return splitCaptainSentences(text)
    .flatMap((clause) =>
      isConditionalCaptainBoostClause(clause)
        ? [clause]
        : clause.split(CAPTAIN_EFFECT_CLAUSE_SEPARATOR),
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function splitCaptainSentences(text) {
  const clauses = [];
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

function isConditionalCaptainBoostClause(clause) {
  return CONDITIONAL_CAPTAIN_BOOST_PREFIX_PATTERN.test(clause.trim());
}

function isCaptainBoostScopeClause(clause) {
  const normalizedClause = normalizeCoverageClause(clause);

  return (
    /\bboosts?\b/i.test(normalizedClause) &&
    /\b(?:atk|hp)\b/i.test(normalizedClause) &&
    CAPTAIN_MULTIPLIER_PATTERN.test(normalizedClause) &&
    !SELF_SCOPE_PATTERN.test(normalizedClause) &&
    (boostClauseHasUniversalScope(normalizedClause) ||
      COST_SUBSET_PATTERN.test(normalizedClause) ||
      extractAllowedTypesFromCoverageClause(normalizedClause).length > 0 ||
      extractAllowedClassesFromCoverageClause(normalizedClause).length > 0 ||
      extractAllowedCharacterTagsFromCoverageClause(normalizedClause).length > 0)
  );
}

function stripInlineConditionalBoostRiders(clause) {
  return normalizeCoverageClause(clause.replace(INLINE_CONDITIONAL_BOOST_RIDER_PATTERN, ''));
}

function stripBoostInsteadSuffix(clause) {
  return normalizeCoverageClause(clause.replace(BOOST_INSTEAD_SUFFIX_PATTERN, 'by $1x'));
}

function extractCaptainStartOfFightCooldownTagClauses(text) {
  return splitCaptainSentences(text)
    .map((sentence) => normalizeCoverageClause(sentence))
    .filter(
      (sentence) =>
        START_OF_FIGHT_EFFECT_PATTERN.test(sentence) &&
        SPECIAL_COOLDOWN_TARGET_FRAGMENT_PATTERNS.some((pattern) => pattern.test(sentence)) &&
        extractAllowedCharacterTagsFromCoverageClause(sentence).length > 0,
    );
}

function extractCoverageTargetFragments(clause) {
  return [
    ...new Set([
      ...extractBoostTargetFragments(clause),
      ...extractSpecialCooldownTargetFragments(clause),
    ]),
  ];
}

function extractBoostTargetFragments(clause) {
  return [
    ...new Set(
      BOOST_TARGET_FRAGMENT_PATTERNS.flatMap((pattern) =>
        [...clause.matchAll(pattern)].map((match) => normalizeCoverageClause(match[1] ?? '')),
      ).filter(Boolean),
    ),
  ];
}

function extractSpecialCooldownTargetFragments(clause) {
  return [
    ...new Set(
      SPECIAL_COOLDOWN_TARGET_FRAGMENT_PATTERNS.flatMap((pattern) =>
        [...clause.matchAll(pattern)].map((match) => normalizeCoverageClause(match[1] ?? '')),
      ).filter(Boolean),
    ),
  ];
}

function boostClauseHasUniversalScope(clause) {
  return extractBoostTargetFragments(clause).some((fragment) =>
    UNIVERSAL_SCOPE_PATTERN.test(fragment),
  );
}

function extractAllowedTypesFromCoverageClause(clause) {
  const text = normalizeCoverageClause(clause);

  return AUTO_TEAM_BUILDER_TYPES.filter((type) => new RegExp(`\\[${type}\\]`, 'i').test(text));
}

function extractAllowedClassesFromCoverageClause(clause) {
  const text = normalizeCoverageClause(clause);

  return AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
    new RegExp(`\\b${escapeRegExp(characterClass)}\\b`, 'i').test(text),
  );
}

function extractAllowedCharacterTagsFromCoverageClause(clause) {
  const targetFragments = extractCoverageTargetFragments(clause);
  const fragments = targetFragments.length ? targetFragments : [clause];
  const typeSet = new Set(AUTO_TEAM_BUILDER_TYPES.map((type) => type.toLowerCase()));
  const classSet = new Set(
    AUTO_TEAM_BUILDER_CLASSES.map((characterClass) => characterClass.toLowerCase()),
  );

  return [
    ...new Set(
      fragments.flatMap((fragment) =>
        [...fragment.matchAll(BRACKETED_LABEL_PATTERN)]
          .map((match) => normalizeCoverageClause(match[1] ?? ''))
          .filter((label) => {
            const normalizedLabel = label.toLowerCase();
            return (
              label.length > 0 &&
              !typeSet.has(normalizedLabel) &&
              !classSet.has(normalizedLabel)
            );
          }),
      ),
    ),
  ];
}

function normalizeCoverageClause(value) {
  return String(value ?? '').replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

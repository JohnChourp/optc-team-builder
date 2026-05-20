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
const DOMINANT_TYPE_SCOPE_PATTERN = /\b(?:the\s+)?Dominant Type\b/i;
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
          const tiers = extractCoverageTiers(text);

          return {
            key,
            label,
            firstCoverageScope: coverage.firstCoverageScope,
            secondCoverageScope: coverage.secondCoverageScope,
            firstCoverageClauses: coverage.firstCoverageClauses,
            secondCoverageClauses: coverage.secondCoverageClauses,
            tiers,
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
  const dominantTypeAtkClauses = conditionalOnlyClauses.filter(
    (clause) => ATK_CLAUSE_PATTERN.test(clause) && boostClauseHasDominantTypeScope(clause),
  );

  if (atkClauses.length === 0 && hpClauses.length > 0 && dominantTypeAtkClauses.length > 0) {
    const dominantTypeClauses = dedupeClauses([...dominantTypeAtkClauses, ...hpClauses]);
    return {
      baselineClauses: dominantTypeClauses,
      topClauses: dominantTypeClauses,
    };
  }

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
    boostClauseHasDominantTypeScope(normalizedClause) ||
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
    .flatMap((clause) => normalizeCaptainBoostScopeClauseCandidates(clause, includeConditional))
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

function normalizeCaptainBoostScopeClauseCandidates(clause, includeConditional) {
  const normalizedClause = stripBoostInsteadSuffix(stripInlineConditionalBoostRiders(clause));

  if (!includeConditional || !isConditionalCaptainBoostClause(normalizedClause)) {
    return [normalizedClause];
  }

  return extractEffectClausesFromConditionalSentence(normalizedClause)
    .map(stripInlineConditionalBoostRiders)
    .map(stripBoostInsteadSuffix);
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
      boostClauseHasDominantTypeScope(normalizedClause) ||
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

const CREW_TEAM_CONDITION_PATTERN =
  /\bcrew\s+has\s+(\d+)\s*(?:\+|or\s+more)?\s+(?!(?:or\s+more\s+)?characters?\s+(?:of|with)\s+the\s+same\s+Type\b)([^,.;]{1,220}?)\s+(?:characters|units)\b/gi;
// Alternative count phrasing: "you have N or more X characters in your crew".
const CREW_TEAM_ALT_COUNT_PATTERN =
  /\byou\s+have\s+(\d+)\s*(?:\+|or\s+more)?\s+(?!(?:or\s+more\s+)?characters?\s+(?:of|with)\s+the\s+same\s+Type\b)([^,.;]{1,220}?)\s+(?:characters|units)\s+in\s+your\s+crew\b/gi;
const CREW_TEAM_SAME_TYPE_PATTERN =
  /\b(?:your\s+)?crew\s+has\s+(\d+)\s*(?:\+|or\s+more)?\s+characters?\s+(?:of|with)\s+the\s+same\s+Type\b/gi;
const CREW_TEAM_ALT_SAME_TYPE_PATTERN =
  /\byou\s+have\s+(\d+)\s*(?:\+|or\s+more)?\s+characters?\s+(?:of|with)\s+the\s+same\s+Type\s+in\s+your\s+crew\b/gi;
// Rainbow / presence-all phrasing: "there is/are a [STR], [DEX] ... character(s) in your crew".
const CREW_TEAM_RAINBOW_PATTERN =
  /\bthere(?:'?s|\s+is|\s+are)\s+a?\s*((?:\[[A-Z]{3}\][\s,/]*(?:and\s+)?){2,5})\s*characters?\s+in\s+your\s+crew\b/gi;
// Negative crew presence: "there are no [PSY] or [INT] characters on/in your crew".
const CREW_TEAM_EXCLUSION_PATTERN =
  /\bthere\s+(?:are\s+no|aren'?t(?:\s+any)?)\s+([^,.;]{1,220}?)\s+(?:characters|units)\s+(?:on|in)\s+your\s+crew\b/gi;
const TERRITORY_FIELD_PATTERN =
  /\bfield\s+has\s+Territory\s*[:\s]+([^,.;]+?)(?=,|\.|;|$)/gi;
const ACTION_SPECIAL_EXCELLENT_PATTERN = /\bperforms?\s+EXCELLENT\s+with\s+their\s+Action\s+Special\b/i;
const ACTION_SPECIAL_PERFECT_PATTERN = /\bperforms?\s+PERFECT\s+with\s+their\s+Action\s+Special\b/i;
const HP_THRESHOLD_PATTERN = /\bHP\s+is\s+(below|above)\s+(\d+)\s*%/i;
const DEFEATED_ENEMY_PATTERN = /\bdefeated\s+an?\s+enemy\s+last\s+turn\b/i;
const REQUIRES_CAPTAIN_PATTERN = /\b(?:this character is your Captain|if you have this character as your Captain)\b/i;
const FOR_N_TURNS_PATTERN = /\bfor\s+(\d+)\s+turns?\b/i;
const COST_MIN_PATTERN = /\bcost\s+(\d+)\s+or\s+more\s+characters?\b/i;
const COST_MAX_PATTERN = /\bcost\s+(\d+)\s+or\s+less\s+characters?\b/i;

// Produces an ordered list of tiers (1-indexed) describing distinct (conditions → effects) bundles
// in the captain ability. Tier 1 is the baseline — clauses that apply with the broadest scope (or
// the "all other characters" fallback). Tier 2 is the unconditional top tier (subset boost without
// any If/When prefix). Tier 3+ are conditional clauses gated by If/When (trigger / team / field
// conditions).
export function extractCoverageTiers(captainText) {
  const normalizedCaptainText = normalizeSharedCaptainBoostMultipliers(
    normalizeHtmlToText(captainText),
  );

  if (!normalizedCaptainText) {
    return [];
  }

  const defaultCaptainText = extractDefaultCaptainBoostText(normalizedCaptainText);
  const defaultBoostClauses = resolveCaptainBoostScopeClauses(defaultCaptainText, false);
  const conditionalTiers = extractConditionalSentenceClusters(normalizedCaptainText)
    .map((cluster) => buildConditionalTier(cluster))
    .filter((tier) => tier !== null);

  const tiers = [];

  // 1. Split default clauses into baseline (fallback ATK + shared HP/utility) and top (subset ATK).
  const atkClauses = defaultBoostClauses.filter((clause) => ATK_CLAUSE_PATTERN.test(clause));
  const hpClauses = defaultBoostClauses.filter((clause) => HP_CLAUSE_PATTERN.test(clause));
  const fallbackAtk = atkClauses.filter((clause) => FALLBACK_OTHER_SCOPE_PATTERN.test(clause));
  const subsetAtk = atkClauses.filter((clause) => !FALLBACK_OTHER_SCOPE_PATTERN.test(clause));
  const shouldMergeDefaultHpIntoDominantTypeTier =
    atkClauses.length === 0 &&
    hpClauses.length > 0 &&
    conditionalTiers.some((tier) => tier.characterConditions.dominantType && tier.atkBoost);

  if (shouldMergeDefaultHpIntoDominantTypeTier) {
    for (const tier of conditionalTiers) {
      tiers.push(
        tier.characterConditions.dominantType && tier.atkBoost
          ? mergeDefaultClausesIntoConditionalTier(tier, hpClauses)
          : tier,
      );
    }
  } else if (fallbackAtk.length > 0 && subsetAtk.length > 0) {
    tiers.push(
      buildDefaultTier('baseline', dedupeClauses([...fallbackAtk, ...hpClauses])),
      buildDefaultTier('unconditional-top', dedupeClauses([...subsetAtk, ...hpClauses])),
    );
  } else if (defaultBoostClauses.length > 0) {
    tiers.push(buildDefaultTier('baseline', dedupeClauses(defaultBoostClauses)));
  }

  // 2. Each conditional clause becomes its own tier.
  if (!shouldMergeDefaultHpIntoDominantTypeTier) {
    for (const tier of conditionalTiers) {
      tiers.push(tier);
    }
  }

  // 3. Renumber tiers sequentially after filtering.
  return tiers.map((tier, index) => ({ ...tier, tier: index + 1 }));
}

function mergeDefaultClausesIntoConditionalTier(tier, defaultClauses) {
  const clauses = dedupeClauses([...tier.clauses, ...defaultClauses]);
  const characterConditions = resolveTierCharacterConditions(clauses);

  return {
    ...tier,
    scope: resolveScopeFromTierClauses(clauses, tier.scope),
    characterConditions,
    clauses,
    atkBoost: resolveTierBoost(clauses, 'atk'),
    hpBoost: resolveTierBoost(clauses, 'hp'),
  };
}

function buildDefaultTier(kind, clauses) {
  const characterConditions = resolveTierCharacterConditions(clauses);
  const scope = resolveScopeFromTierClauses(clauses, 'none');

  return {
    tier: 0,
    kind,
    scope,
    characterConditions,
    teamConditions: [],
    fieldConditions: [],
    triggerConditions: [],
    clauses,
    atkBoost: resolveTierBoost(clauses, 'atk'),
    hpBoost: resolveTierBoost(clauses, 'hp'),
  };
}

function buildConditionalTier(cluster) {
  const clauseBoosts = cluster.clauses
    .map(stripInlineConditionalBoostRiders)
    .map(stripBoostInsteadSuffix)
    .filter(isCaptainBoostScopeClause)
    .map(normalizeCoverageClause);

  if (clauseBoosts.length === 0) {
    return null;
  }

  const characterConditions = resolveTierCharacterConditions(clauseBoosts);
  const scope = resolveScopeFromTierClauses(clauseBoosts, 'none');

  return {
    tier: 0,
    kind: 'conditional',
    scope,
    characterConditions,
    teamConditions: cluster.teamConditions,
    fieldConditions: cluster.fieldConditions,
    triggerConditions: cluster.triggerConditions,
    clauses: dedupeClauses(clauseBoosts),
    atkBoost: resolveTierBoost(clauseBoosts, 'atk'),
    hpBoost: resolveTierBoost(clauseBoosts, 'hp'),
  };
}

function extractConditionalSentenceClusters(text) {
  return splitCaptainSentences(text.replace(BRANCH_LABEL_PATTERN, '. '))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0 && isConditionalCaptainBoostClause(sentence))
    .map((sentence) => buildConditionalCluster(sentence));
}

function buildConditionalCluster(sentence) {
  const teamConditions = [];
  const fieldConditions = [];
  const triggerConditions = [];

  let match;
  CREW_TEAM_SAME_TYPE_PATTERN.lastIndex = 0;
  while ((match = CREW_TEAM_SAME_TYPE_PATTERN.exec(sentence)) !== null) {
    teamConditions.push(parseSameTypeTeamCondition(match[1], match[0]));
  }
  CREW_TEAM_ALT_SAME_TYPE_PATTERN.lastIndex = 0;
  while ((match = CREW_TEAM_ALT_SAME_TYPE_PATTERN.exec(sentence)) !== null) {
    teamConditions.push(parseSameTypeTeamCondition(match[1], match[0]));
  }
  CREW_TEAM_CONDITION_PATTERN.lastIndex = 0;
  while ((match = CREW_TEAM_CONDITION_PATTERN.exec(sentence)) !== null) {
    teamConditions.push(parseCrewTeamCondition(match[1], match[2], match[0]));
  }
  CREW_TEAM_ALT_COUNT_PATTERN.lastIndex = 0;
  while ((match = CREW_TEAM_ALT_COUNT_PATTERN.exec(sentence)) !== null) {
    teamConditions.push(parseCrewTeamCondition(match[1], match[2], match[0]));
  }
  CREW_TEAM_RAINBOW_PATTERN.lastIndex = 0;
  while ((match = CREW_TEAM_RAINBOW_PATTERN.exec(sentence)) !== null) {
    teamConditions.push(parseRainbowTeamCondition(match[1], match[0]));
  }
  CREW_TEAM_EXCLUSION_PATTERN.lastIndex = 0;
  while ((match = CREW_TEAM_EXCLUSION_PATTERN.exec(sentence)) !== null) {
    teamConditions.push(parseExclusionTeamCondition(match[1], match[0]));
  }

  TERRITORY_FIELD_PATTERN.lastIndex = 0;
  while ((match = TERRITORY_FIELD_PATTERN.exec(sentence)) !== null) {
    fieldConditions.push(parseTerritoryFieldCondition(match[1], match[0]));
  }

  if (ACTION_SPECIAL_EXCELLENT_PATTERN.test(sentence)) {
    triggerConditions.push(buildActionSpecialTrigger('action-special-excellent', sentence));
  }
  if (ACTION_SPECIAL_PERFECT_PATTERN.test(sentence)) {
    triggerConditions.push(buildActionSpecialTrigger('action-special-perfect', sentence));
  }

  const hpThreshold = sentence.match(HP_THRESHOLD_PATTERN);
  if (hpThreshold !== null) {
    triggerConditions.push({
      kind: hpThreshold[1].toLowerCase() === 'below' ? 'hp-below' : 'hp-above',
      hpPercent: Number(hpThreshold[2]),
      rawClause: hpThreshold[0],
    });
  }

  if (DEFEATED_ENEMY_PATTERN.test(sentence)) {
    triggerConditions.push({
      kind: 'defeated-enemy-last-turn',
      rawClause: DEFEATED_ENEMY_PATTERN.exec(sentence)?.[0] ?? '',
    });
  }

  if (
    REQUIRES_CAPTAIN_PATTERN.test(sentence) &&
    !teamConditions.some((condition) => condition.kind === 'requires-captain')
  ) {
    teamConditions.push({
      kind: 'requires-captain',
      rawClause: REQUIRES_CAPTAIN_PATTERN.exec(sentence)?.[0] ?? '',
    });
  }

  // The conditional sentence keeps the whole "If X, ..." block as a single token in the regular
  // splitter — bypass that and extract just the effect portion (after the condition's trailing
  // comma, optionally past a "for N turns" rider).
  const clauses = extractEffectClausesFromConditionalSentence(sentence);

  return {
    sentence,
    clauses,
    teamConditions,
    fieldConditions,
    triggerConditions,
  };
}

function extractEffectClausesFromConditionalSentence(sentence) {
  const effectStartPattern =
    /,\s*(?:for\s+\d+\s+turns?\s+)?(?:boosts?|reduces?|cuts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?|allows?|launches?|deals?|restores?|inflicts?)\b/i;
  const effectStartMatch = sentence.match(effectStartPattern);
  if (effectStartMatch === null || effectStartMatch.index === undefined) {
    return [];
  }

  const effectText = sentence
    .slice(effectStartMatch.index + 1)
    .replace(/^\s*for\s+\d+\s+turns?\s+/i, '')
    .trim();

  return effectText
    .split(CAPTAIN_EFFECT_CLAUSE_SEPARATOR)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function parseSameTypeTeamCondition(countText, rawClause) {
  const minCount = Number(countText);

  return {
    kind: 'crew-composition',
    minCount: Number.isFinite(minCount) && minCount > 0 ? minCount : undefined,
    types: [],
    classes: [],
    characterTags: [],
    sameType: true,
    rawClause,
  };
}

function parseExclusionTeamCondition(descriptor, rawClause) {
  const types = [];
  const classes = [];
  const characterTags = [];

  for (const typeLabel of AUTO_TEAM_BUILDER_TYPES) {
    if (new RegExp(`\\[${typeLabel}\\]`, 'i').test(descriptor)) {
      types.push(typeLabel);
    }
  }
  for (const classLabel of AUTO_TEAM_BUILDER_CLASSES) {
    if (new RegExp(`\\b${escapeRegExp(classLabel)}s?\\b`, 'i').test(descriptor)) {
      classes.push(classLabel);
    }
  }
  const tagMatches = [...descriptor.matchAll(BRACKETED_LABEL_PATTERN)].map((tag) => tag[1]);
  for (const tag of tagMatches) {
    const lowerTag = tag.toLowerCase();
    if (
      !AUTO_TEAM_BUILDER_TYPES.some((typeLabel) => typeLabel.toLowerCase() === lowerTag) &&
      !AUTO_TEAM_BUILDER_CLASSES.some((classLabel) => classLabel.toLowerCase() === lowerTag)
    ) {
      characterTags.push(tag);
    }
  }

  return {
    kind: 'crew-exclusion',
    types,
    classes,
    characterTags,
    rawClause,
  };
}

function parseRainbowTeamCondition(typeListText, rawClause) {
  const types = [];
  for (const typeLabel of AUTO_TEAM_BUILDER_TYPES) {
    if (new RegExp(`\\[${typeLabel}\\]`, 'i').test(typeListText)) {
      types.push(typeLabel);
    }
  }
  return {
    kind: 'crew-composition',
    minCount: types.length > 0 ? types.length : undefined,
    types,
    classes: [],
    characterTags: [],
    rawClause,
  };
}

function parseCrewTeamCondition(countText, descriptor, rawClause) {
  const minCount = Number(countText);
  const types = [];
  const classes = [];
  const characterTags = [];

  const lowerDescriptor = descriptor.toLowerCase();

  for (const typeLabel of AUTO_TEAM_BUILDER_TYPES) {
    if (new RegExp(`\\[${typeLabel}\\]`, 'i').test(descriptor)) {
      types.push(typeLabel);
    }
  }
  for (const classLabel of AUTO_TEAM_BUILDER_CLASSES) {
    // Allow plural form (Slashers, Strikers, ...) when matching crew condition descriptors —
    // some captain abilities say "5 or more Slashers characters" instead of "5 or more Slasher".
    if (new RegExp(`\\b${escapeRegExp(classLabel)}s?\\b`, 'i').test(lowerDescriptor)) {
      classes.push(classLabel);
    }
  }

  const tagMatches = [...descriptor.matchAll(BRACKETED_LABEL_PATTERN)].map((tag) => tag[1]);
  for (const tag of tagMatches) {
    const lowerTag = tag.toLowerCase();
    if (
      !AUTO_TEAM_BUILDER_TYPES.some((typeLabel) => typeLabel.toLowerCase() === lowerTag) &&
      !AUTO_TEAM_BUILDER_CLASSES.some((classLabel) => classLabel.toLowerCase() === lowerTag)
    ) {
      characterTags.push(tag);
    }
  }

  return {
    kind: 'crew-composition',
    minCount: Number.isFinite(minCount) && minCount > 0 ? minCount : undefined,
    types,
    classes,
    characterTags,
    rawClause,
  };
}

function parseTerritoryFieldCondition(descriptor, rawClause) {
  const territories = [];
  const tagMatches = [...descriptor.matchAll(BRACKETED_LABEL_PATTERN)].map((tag) => tag[1]);
  for (const tag of tagMatches) {
    territories.push(tag);
  }
  if (territories.length === 0) {
    const trimmed = descriptor.trim();
    if (trimmed.length > 0) {
      territories.push(trimmed);
    }
  }

  return {
    kind: 'territory',
    territories,
    rawClause,
  };
}

function buildActionSpecialTrigger(kind, sentence) {
  const turnsMatch = sentence.match(FOR_N_TURNS_PATTERN);
  return {
    kind,
    durationTurns: turnsMatch !== null ? Number(turnsMatch[1]) : undefined,
    rawClause:
      kind === 'action-special-excellent'
        ? (ACTION_SPECIAL_EXCELLENT_PATTERN.exec(sentence)?.[0] ?? '')
        : (ACTION_SPECIAL_PERFECT_PATTERN.exec(sentence)?.[0] ?? ''),
  };
}

function resolveTierCharacterConditions(clauses) {
  const conditions = {
    universal: false,
    fallbackOther: false,
    selfOnly: false,
    types: [],
    classes: [],
    characterTags: [],
  };

  for (const clause of clauses) {
    if (boostClauseHasUniversalScope(clause)) {
      conditions.universal = true;
    }
    if (FALLBACK_OTHER_SCOPE_PATTERN.test(clause)) {
      conditions.fallbackOther = true;
    }
    if (SELF_SCOPE_PATTERN.test(clause)) {
      conditions.selfOnly = true;
    }
    if (boostClauseHasDominantTypeScope(clause)) {
      conditions.dominantType = true;
    }

    for (const type of extractAllowedTypesFromCoverageClause(clause)) {
      if (!conditions.types.includes(type)) {
        conditions.types.push(type);
      }
    }
    for (const characterClass of extractAllowedClassesFromCoverageClause(clause)) {
      if (!conditions.classes.includes(characterClass)) {
        conditions.classes.push(characterClass);
      }
    }
    for (const tag of extractAllowedCharacterTagsFromCoverageClause(clause)) {
      if (!conditions.characterTags.includes(tag)) {
        conditions.characterTags.push(tag);
      }
    }

    const costMin = clause.match(COST_MIN_PATTERN);
    const costMax = clause.match(COST_MAX_PATTERN);
    if (costMin !== null) {
      conditions.costRange = {
        ...(conditions.costRange ?? {}),
        min: Number(costMin[1]),
      };
    }
    if (costMax !== null) {
      conditions.costRange = {
        ...(conditions.costRange ?? {}),
        max: Number(costMax[1]),
      };
    }
  }

  return conditions;
}

function resolveTierBoost(clauses, stat) {
  const pattern = new RegExp(
    `\\b${stat}\\b[^.;]*?\\bby\\s+(?:a\\s+further\\s+|an?\\s+additional\\s+|another\\s+)?(\\d+(?:\\.\\d+)?)x`,
    'gi',
  );

  let highest = 0;
  for (const clause of clauses) {
    if (SELF_SCOPE_PATTERN.test(clause) && !UNIVERSAL_SCOPE_PATTERN.test(clause)) {
      continue;
    }
    const matches = [...clause.matchAll(pattern)];
    for (const match of matches) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > highest) {
        highest = value;
      }
    }
  }

  return highest > 0 ? highest : undefined;
}

function boostClauseHasDominantTypeScope(clause) {
  return extractBoostTargetFragments(clause).some((fragment) =>
    DOMINANT_TYPE_SCOPE_PATTERN.test(fragment),
  );
}

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
const FALLBACK_OTHER_SCOPE_PATTERN = /\ball other (?:characters|units|crewmates)\b/i;
const SELF_SCOPE_PATTERN = /\b(?:this character|own attacks|their own attacks)\b/i;
const DOMINANT_TYPE_SCOPE_PATTERN = /\b(?:the\s+)?Dominant Type\b/i;
const BRANCH_LABEL_PATTERN =
  /(?<!Special\s)(?<!['’]s\s)\b(?:Always Active|Standard Captain|Powered Up Captain|Rampage Captain|Gear\s+\d+(?:\s*-\s*[A-Za-z]+)?\s+Captain|Captain Swap|Captain Shift|Captain Ability|Base Captain Ability|LLB Base Captain Ability|Limit Break Level \d+ Captain Ability|LLB Level \d+ Captain Ability):/gi;
const CAPTAIN_BRANCH_PATTERN =
  /(?<!Special\s)(?<!['’]s\s)\b(Always Active|Standard Captain|Powered Up Captain|Rampage Captain|Gear\s+\d+(?:\s*-\s*[A-Za-z]+)?\s+Captain|Captain Swap|Captain Shift|Captain Ability|Base Captain Ability|LLB Base Captain Ability|Limit Break Level \d+ Captain Ability|LLB Level \d+ Captain Ability):/gi;
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
const CAPTAIN_BASE_STAT_BOOST_PATTERN =
  /\bboosts?\s+base\b[^.;]*\b(?:ATK|HP)\b[^.;]*\bby\s+\d+(?:,\d{3})*\b/i;
const INLINE_CONDITIONAL_BOOST_RIDER_PATTERN =
  /,\s*(?:or\s+)?by\s+\d+(?:\.\d+)?x\s+instead\b[^,.;]*/gi;
const BOOST_INSTEAD_SUFFIX_PATTERN = /\bby\s+(\d+(?:\.\d+)?)x\s+instead\b/gi;
const SELF_OVERRIDE_RIDER_PATTERN =
  /,?\s*but\s+boosts?\s+(?:atk|hp|rcv|atk\s+and\s+hp)[^,.;]*?\bof\s+this\s+character\b[^,.;]*?\bby\s+\d+(?:\.\d+)?x\b(?:\s+instead)?/gi;
const SELF_ACTIVATION_RIDER_PATTERN =
  /(?:,\s*|\s+and\s+)(?:(?:at|from)\s+(?:the\s+)?start\s+of\s+(?:the\s+)?(?:fight|quest|adventure),?\s+)?this character activates their own special\b[^,.;]*/gi;
const START_OF_FIGHT_EFFECT_PATTERN =
  /\b(?:at|from)\s+(?:the\s+)?start\s+of\s+(?:the\s+)?(?:fight|quest|adventure)\b/i;
const BRACKETED_LABEL_PATTERN = /\[([^\]]+)\]/g;
const COST_SUBSET_PATTERN =
  /\bcost\s+(?:\d+\s+or\s+(?:more|less|higher|lower)|\d+\s*-\s*\d+|\d+)\s+characters?\b/i;
const COST_RANGE_PATTERN = /\bcost\s+(\d+)\s*-\s*(\d+)\s+characters?\b/i;
const COST_EXACT_PATTERN = /\bcost\s+(\d+)\s+characters?\b/i;
const RARITY_SUBSET_PATTERN =
  /\brarity\s+(?:\d+\s+or\s+(?:more|less|higher|lower|\d+\+))\s+characters?\b/i;
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

          return {
            key,
            label,
            tiers: extractCoverageTiers(text),
          };
        })
        .filter(Boolean)
    : [];

  return { entries };
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

function resolveCaptainClauseScope(clause) {
  const normalizedClause = normalizeCoverageClause(clause);

  if (
    !isCaptainScopedEffectClause(normalizedClause) &&
    !isCaptainTierEffectClause(normalizedClause)
  ) {
    return 'none';
  }

  if (boostClauseHasUniversalScope(normalizedClause)) {
    return 'crew-wide';
  }

  if (
    COST_SUBSET_PATTERN.test(normalizedClause) ||
    RARITY_SUBSET_PATTERN.test(normalizedClause) ||
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
  return isCaptainBoostScopeClause(clause);
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
      const rawLabel = String(match[1] ?? '').trim();

      return {
        label: rawLabel.toLowerCase(),
        displayLabel: rawLabel,
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
  const normalizedClause = stripBoostInsteadSuffix(
    stripSelfActivationRider(stripSelfOverrideRider(stripInlineConditionalBoostRiders(clause))),
  );

  if (!includeConditional || !isConditionalCaptainBoostClause(normalizedClause)) {
    return [normalizedClause];
  }

  return extractEffectClausesFromConditionalSentence(normalizedClause)
    .map(stripInlineConditionalBoostRiders)
    .map(stripSelfOverrideRider)
    .map(stripSelfActivationRider)
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
    (CAPTAIN_MULTIPLIER_PATTERN.test(normalizedClause) ||
      CAPTAIN_BASE_STAT_BOOST_PATTERN.test(normalizedClause)) &&
    !SELF_SCOPE_PATTERN.test(normalizedClause) &&
    (boostClauseHasUniversalScope(normalizedClause) ||
      FALLBACK_OTHER_SCOPE_PATTERN.test(normalizedClause) ||
      COST_SUBSET_PATTERN.test(normalizedClause) ||
      RARITY_SUBSET_PATTERN.test(normalizedClause) ||
      boostClauseHasDominantTypeScope(normalizedClause) ||
      extractAllowedTypesFromCoverageClause(normalizedClause).length > 0 ||
      extractAllowedClassesFromCoverageClause(normalizedClause).length > 0 ||
      extractAllowedCharacterTagsFromCoverageClause(normalizedClause).length > 0)
  );
}

// Captain coverage tiers are stat-boost tiers only. Utility effects are still imported as
// captainAbility builder abilities and remain available through the Captain Ability picker.
function isCaptainTierEffectClause(clause) {
  return isCaptainBoostScopeClause(normalizeCoverageClause(clause));
}

function stripInlineConditionalBoostRiders(clause) {
  return normalizeCoverageClause(clause.replace(INLINE_CONDITIONAL_BOOST_RIDER_PATTERN, ''));
}

function stripSelfOverrideRider(clause) {
  return normalizeCoverageClause(clause.replace(SELF_OVERRIDE_RIDER_PATTERN, ''));
}

function stripSelfActivationRider(clause) {
  return normalizeCoverageClause(clause.replace(SELF_ACTIVATION_RIDER_PATTERN, ''));
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
  return extractBoostTargetFragments(clause).some(isUniversalScopeFragment);
}

function isUniversalScopeFragment(fragment) {
  const normalizedFragment = normalizeCoverageClause(fragment)
    .replace(BRACKETED_LABEL_PATTERN, '')
    .trim()
    .toLowerCase();

  return ['all', 'all characters', 'all units', 'all crewmates', 'crew', 'the crew'].includes(
    normalizedFragment,
  );
}

function extractAllowedTypesFromCoverageClause(clause) {
  // Restrict scope detection to the clause's TARGET fragments (e.g. "X characters") so we don't
  // accidentally pick up orb-color tokens like `[STR]` from clauses such as
  // "allows all characters to perform Super Tandem with [STR] orbs for 10 turns".
  const targetFragments = extractCoverageTargetFragments(clause);
  if (targetFragments.length === 0) {
    return [];
  }
  return AUTO_TEAM_BUILDER_TYPES.filter((type) =>
    targetFragments.some((fragment) => new RegExp(`\\[${type}\\]`, 'i').test(fragment)),
  );
}

function extractAllowedClassesFromCoverageClause(clause) {
  const targetFragments = extractCoverageTargetFragments(clause);
  if (targetFragments.length === 0) {
    return [];
  }
  // Match both singular and plural forms ("Striker" / "Strikers") since OPTC text is inconsistent
  // — already handled the same way in the team-condition class extractor (line ~1129).
  return AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
    targetFragments.some((fragment) =>
      new RegExp(`\\b${escapeRegExp(characterClass)}s?\\b`, 'i').test(fragment),
    ),
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
const COST_MIN_PATTERN = /\bcost\s+(\d+)\s+or\s+(?:more|higher)\s+characters?\b/i;
const COST_MAX_PATTERN = /\bcost\s+(\d+)\s+or\s+(?:less|lower)\s+characters?\b/i;
const RARITY_MIN_PATTERN = /\brarity\s+(\d+)\s+or\s+(?:more|higher)\s+characters?\b/i;
const RARITY_MAX_PATTERN = /\brarity\s+(\d+)\s+or\s+(?:less|lower)\s+characters?\b/i;
const RARITY_TIERED_PATTERN = /\brarity\s+(\d+)\s+or\s+\1\+\s+characters?\b/i;
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
  const defaultEffectClauses = resolveCaptainTierEffectClauses(defaultCaptainText);
  const defaultNonBoostEffectClauses = defaultEffectClauses.filter(
    (clause) => !defaultBoostClauses.includes(clause),
  );
  const conditionalTiers = extractConditionalSentenceClusters(normalizedCaptainText)
    .map((cluster) => buildConditionalTier(cluster))
    .filter((tier) => tier !== null)
    .filter((tier) => !isUnactionableTriggerOnlyTier(tier));

  const tiers = [];

  // 1. Split default clauses into baseline (fallback ATK + shared HP/utility) and top (subset ATK).
  const atkClauses = defaultBoostClauses.filter((clause) => ATK_CLAUSE_PATTERN.test(clause));
  const hpClauses = defaultBoostClauses.filter((clause) => HP_CLAUSE_PATTERN.test(clause));
  const fallbackAtk = atkClauses.filter((clause) => FALLBACK_OTHER_SCOPE_PATTERN.test(clause));
  const subsetAtk = atkClauses.filter((clause) => !FALLBACK_OTHER_SCOPE_PATTERN.test(clause));
  const defaultHpIsUniversal =
    hpClauses.length > 0 && hpClauses.every((clause) => boostClauseHasUniversalScope(clause));
  const shouldMergeDefaultHpIntoDominantTypeTier =
    atkClauses.length === 0 &&
    hpClauses.length > 0 &&
    conditionalTiers.some((tier) => tier.characterConditions.dominantType && tier.atkBoost);
  // Roger-style: default branch contributes only universal HP (no ATK); a conditional tier
  // contributes ATK with the same universal scope. The character provides both HP and ATK across
  // the whole crew — gating one of them shouldn't fork the breakdown into two tiers. Fold the
  // baseline HP into the conditional ATK tier and tag the merged tier as baseline-and-conditional
  // so the UI can render the unconditional HP and the gated ATK as labeled subsections.
  const shouldMergeDefaultHpIntoUniversalConditionalAtkTier =
    !shouldMergeDefaultHpIntoDominantTypeTier &&
    atkClauses.length === 0 &&
    defaultHpIsUniversal &&
    conditionalTiers.some((tier) => isUniversalConditionalAtkTierMergeTarget(tier));

  if (shouldMergeDefaultHpIntoDominantTypeTier) {
    for (const tier of conditionalTiers) {
      tiers.push(
        tier.characterConditions.dominantType && tier.atkBoost
          ? mergeDefaultClausesIntoConditionalTier(tier, hpClauses)
          : tier,
      );
    }
  } else if (shouldMergeDefaultHpIntoUniversalConditionalAtkTier) {
    // Carry over any default non-boost effects (e.g. "makes badly matching orbs beneficial")
    // alongside the HP boost so the baseline subsection isn't reduced to a bare stat line.
    const baselineExtras = defaultNonBoostEffectClauses.filter((clause) =>
      clauseFitsTierScope(clause, {
        universal: true,
        fallbackOther: false,
        selfOnly: false,
        types: [],
        classes: [],
        characterTags: [],
      }),
    );
    const baselineClauses = dedupeClauses([...hpClauses, ...baselineExtras]);
    for (const tier of conditionalTiers) {
      tiers.push(
        isUniversalConditionalAtkTierMergeTarget(tier)
          ? mergeBaselineClausesIntoConditionalTier(tier, baselineClauses)
          : tier,
      );
    }
  } else if (fallbackAtk.length > 0 && subsetAtk.length > 0) {
    const baselinePrimary = dedupeClauses([...fallbackAtk, ...hpClauses]);
    const topPrimary = dedupeClauses([...subsetAtk, ...hpClauses]);
    tiers.push(
      buildDefaultTier(
        'baseline',
        baselinePrimary,
        routeExtrasToTierScope(defaultNonBoostEffectClauses, baselinePrimary),
      ),
      buildDefaultTier(
        'unconditional-top',
        topPrimary,
        routeExtrasToTierScope(defaultNonBoostEffectClauses, topPrimary),
      ),
    );
  } else if (defaultBoostClauses.length > 0) {
    // Split default boost clauses by target scope so additive base ATK/HP boosts for character
    // tags (e.g. "[Giant]") get their own tier instead of being merged into unrelated ATK/HP
    // multiplier scopes.
    const boostGroups = groupBoostClausesByTargetScope(defaultBoostClauses);
    if (boostGroups.length > 1) {
      for (let i = 0; i < boostGroups.length; i++) {
        const primary = dedupeClauses(boostGroups[i]);
        const kind = i === 0 ? 'baseline' : 'unconditional-top';
        tiers.push(
          buildDefaultTier(
            kind,
            primary,
            routeExtrasToTierScope(defaultNonBoostEffectClauses, primary),
          ),
        );
      }
    } else {
      const primary = dedupeClauses(defaultBoostClauses);
      tiers.push(
        buildDefaultTier(
          'baseline',
          primary,
          routeExtrasToTierScope(defaultNonBoostEffectClauses, primary),
        ),
      );
    }
  }

  // 2. Each non-default branch label ("Powered Up Captain:", "Gear 3 Captain:", "Captain Swap:")
  // becomes its own tier gated by a `captain-branch-state` trigger.
  const branchStateTiers = extractCaptainBranchStateTiers(normalizedCaptainText);
  for (const tier of branchStateTiers) {
    tiers.push(tier);
  }

  // 3. Each conditional clause becomes its own tier.
  if (
    !shouldMergeDefaultHpIntoDominantTypeTier &&
    !shouldMergeDefaultHpIntoUniversalConditionalAtkTier
  ) {
    for (const tier of conditionalTiers) {
      tiers.push(tier);
    }
  }

  // 4. Renumber tiers sequentially after filtering.
  return tiers.map((tier, index) => ({ ...tier, tier: index + 1 }));
}

function extractCaptainBranchStateTiers(captainText) {
  const branches = extractCaptainBranches(captainText);
  if (!branches.length) {
    return [];
  }
  const tiers = [];
  for (const branch of branches) {
    if (DEFAULT_CAPTAIN_BRANCH_LABELS.has(branch.label)) {
      continue;
    }
    const branchEffectClauses = splitCaptainEffectClauses(branch.text)
      .map(stripInlineConditionalBoostRiders)
      .map(stripSelfOverrideRider)
      .map(stripSelfActivationRider)
      .map(stripBoostInsteadSuffix)
      .filter((clause) => !isConditionalCaptainBoostClause(clause))
      .filter(isCaptainTierEffectClause)
      .map(normalizeCoverageClause);
    if (branchEffectClauses.length === 0) {
      continue;
    }
    const dedupedClauses = dedupeClauses(branchEffectClauses);
    const characterConditions = resolveTierCharacterConditions(dedupedClauses);
    const scope = resolveScopeFromTierClauses(dedupedClauses, 'none');
    const triggers = [
      {
        kind: 'captain-branch-state',
        branchLabel: branch.displayLabel,
        rawClause: `${branch.displayLabel}:`,
      },
    ];
    const consecutivePerfects = branch.text.match(
      /\bafter\s+(\d+)\s+consecutive\s+PERFECTs\b/i,
    );
    if (consecutivePerfects !== null) {
      triggers.push({
        kind: 'consecutive-perfects',
        perfectStreak: Number(consecutivePerfects[1]),
        rawClause: consecutivePerfects[0],
      });
    }
    tiers.push({
      tier: 0,
      kind: 'conditional',
      scope,
      characterConditions,
      teamConditions: [],
      fieldConditions: [],
      triggerConditions: triggers,
      clauses: dedupedClauses,
      atkBoost: resolveTierBoost(dedupedClauses, 'atk'),
      hpBoost: resolveTierBoost(dedupedClauses, 'hp'),
    });
  }
  return tiers;
}

function resolveCaptainTierEffectClauses(captainText) {
  const branchStripped = captainText.replace(BRANCH_LABEL_PATTERN, '. ');
  return splitCaptainEffectClauses(branchStripped)
    .map(stripInlineConditionalBoostRiders)
    .map(stripSelfOverrideRider)
    .map(stripSelfActivationRider)
    .map(stripBoostInsteadSuffix)
    .filter((clause) => !isConditionalCaptainBoostClause(clause))
    .filter(isCaptainTierEffectClause)
    .map(normalizeCoverageClause);
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

// Roger-style merge: keep the conditional tier as the spine (its team/field/trigger conditions
// gate the ATK clauses) and graft the unconditional baseline clauses on top with explicit split
// fields so the UI can label the unconditional vs gated effects without losing either side. We
// stamp `kind: 'baseline-and-conditional'` so consumers can opt into the split-section rendering
// without breaking existing single-kind tiers.
function mergeBaselineClausesIntoConditionalTier(tier, baselineClauses) {
  const conditionalClauses = dedupeClauses(tier.clauses);
  const baselineDedup = dedupeClauses(baselineClauses);
  const clauses = dedupeClauses([...baselineDedup, ...conditionalClauses]);
  const characterConditions = resolveTierCharacterConditions(clauses);

  return {
    ...tier,
    kind: 'baseline-and-conditional',
    scope: resolveScopeFromTierClauses(clauses, tier.scope),
    characterConditions,
    clauses,
    baselineClauses: baselineDedup,
    conditionalClauses,
    atkBoost: resolveTierBoost(clauses, 'atk'),
    hpBoost: resolveTierBoost(clauses, 'hp'),
  };
}

function isUniversalConditionalAtkTierMergeTarget(tier) {
  return (
    tier.atkBoost !== undefined &&
    !tier.hpBoost &&
    tier.characterConditions.universal === true &&
    tier.characterConditions.fallbackOther !== true &&
    tier.characterConditions.dominantType !== true &&
    tier.characterConditions.types.length === 0 &&
    tier.characterConditions.classes.length === 0 &&
    tier.characterConditions.characterTags.length === 0 &&
    tier.characterConditions.costRange === undefined &&
    tier.characterConditions.rarityRange === undefined
  );
}

// Decides which of the non-boost extra clauses should be attached as "context" effects on a
// default tier whose target characters are defined by the given primary clauses. Universal
// extras attach to every tier; subset extras only attach when their scope overlaps the tier's
// primary scope (so an "SCD reduction for Cost 70+" clause appears only on the Cost 70+ tier and
// not on the "all other characters" fallback tier).
function routeExtrasToTierScope(extras, primaryClauses) {
  if (!extras.length) {
    return [];
  }
  const tierScope = resolveTierCharacterConditions(primaryClauses);
  return extras.filter((extra) => clauseFitsTierScope(extra, tierScope));
}

function clauseFitsTierScope(clause, tierScope) {
  const clauseScope = resolveTierCharacterConditions([clause]);

  if (clauseScope.universal) {
    // "all characters" / crew-wide extras apply to every tier's targets.
    return true;
  }
  if (clauseScope.fallbackOther) {
    // "all other characters" extras only make sense on the fallback tier.
    return tierScope.fallbackOther === true;
  }

  const clauseHasSubset =
    clauseScope.types.length > 0 ||
    clauseScope.classes.length > 0 ||
    clauseScope.characterTags.length > 0 ||
    clauseScope.costRange !== undefined ||
    clauseScope.rarityRange !== undefined ||
    clauseScope.dominantType === true;

  if (!clauseHasSubset) {
    // Effect without a recognisable subset (e.g. status removal "reduces Despair on self") —
    // attach to the broadest tier only: that's the baseline if the tier has fallbackOther true,
    // otherwise any non-fallback tier.
    return tierScope.fallbackOther !== true;
  }

  // Cost-range overlap: same minimum or maximum.
  if (clauseScope.costRange?.min !== undefined && tierScope.costRange?.min !== undefined) {
    return clauseScope.costRange.min === tierScope.costRange.min;
  }
  if (clauseScope.costRange?.max !== undefined && tierScope.costRange?.max !== undefined) {
    return clauseScope.costRange.max === tierScope.costRange.max;
  }
  if (clauseScope.costRange !== undefined && tierScope.costRange === undefined) {
    return false;
  }

  // Rarity-range overlap: same minimum or maximum.
  if (clauseScope.rarityRange?.min !== undefined && tierScope.rarityRange?.min !== undefined) {
    return clauseScope.rarityRange.min === tierScope.rarityRange.min;
  }
  if (clauseScope.rarityRange?.max !== undefined && tierScope.rarityRange?.max !== undefined) {
    return clauseScope.rarityRange.max === tierScope.rarityRange.max;
  }
  if (clauseScope.rarityRange !== undefined && tierScope.rarityRange === undefined) {
    return false;
  }

  // Type / class / tag overlap.
  const typeOverlap = clauseScope.types.some((type) => tierScope.types.includes(type));
  const classOverlap = clauseScope.classes.some((characterClass) =>
    tierScope.classes.includes(characterClass),
  );
  const tagOverlap = clauseScope.characterTags.some((tag) =>
    tierScope.characterTags.includes(tag),
  );
  return typeOverlap || classOverlap || tagOverlap;
}

// Groups default boost clauses by their exact target signature. Clauses with the same scope
// (for example ATK + HP for [INT]/Striker) collapse into one tier; different scopes, including
// additive base ATK tags such as [Giant], become separate tiers.
function groupBoostClausesByTargetScope(boostClauses) {
  if (boostClauses.length <= 1) {
    return [boostClauses];
  }

  const hpClauses = boostClauses.filter((clause) => HP_CLAUSE_PATTERN.test(clause));
  const universalHpClauses = hpClauses.filter(
    (clause) => boostClauseHasUniversalScope(clause) && !ATK_CLAUSE_PATTERN.test(clause),
  );
  const groupedClauses = boostClauses.filter((clause) => !universalHpClauses.includes(clause));

  if (groupedClauses.length === 0) {
    return [boostClauses];
  }

  const groups = new Map();
  for (const clause of groupedClauses) {
    const key = buildBoostScopeGroupKey(resolveTierCharacterConditions([clause]));
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(clause);
  }

  if (groups.size <= 1) {
    return [boostClauses];
  }

  return [...groups.values()].map((group) => dedupeClauses([...group, ...universalHpClauses]));
}

function buildBoostScopeGroupKey(conditions) {
  const normalized = {
    universal: conditions.universal === true,
    fallbackOther: conditions.fallbackOther === true,
    dominantType: conditions.dominantType === true,
    types: [...conditions.types].sort(),
    classes: [...conditions.classes].sort(),
    characterTags: [...conditions.characterTags].sort(),
    costRange: conditions.costRange ?? null,
    rarityRange: conditions.rarityRange ?? null,
  };

  return JSON.stringify(normalized);
}

function buildDefaultTier(kind, primaryClauses, extraClauses = []) {
  // `primaryClauses` drive tier-defining metadata (scope, character conditions, atk/hp boost).
  // `extraClauses` are attached for display purposes but do not contaminate the tier's character
  // scope (e.g. attaching a "[STR] orbs" Super Tandem clause to a Cost 70+ tier should not introduce
  // a spurious type/cost filter).
  const characterConditions = resolveTierCharacterConditions(primaryClauses);
  const scope = resolveScopeFromTierClauses(primaryClauses, 'none');
  const clauses = dedupeClauses([...primaryClauses, ...extraClauses]);

  return {
    tier: 0,
    kind,
    scope,
    characterConditions,
    teamConditions: [],
    fieldConditions: [],
    triggerConditions: [],
    clauses,
    atkBoost: resolveTierBoost(primaryClauses, 'atk'),
    hpBoost: resolveTierBoost(primaryClauses, 'hp'),
  };
}

function buildConditionalTier(cluster) {
  const clauseEffects = cluster.clauses
    .map(stripInlineConditionalBoostRiders)
    .map(stripSelfOverrideRider)
    .map(stripSelfActivationRider)
    .map(stripBoostInsteadSuffix)
    .filter(isCaptainTierEffectClause)
    .map(normalizeCoverageClause);

  if (clauseEffects.length === 0) {
    return null;
  }

  const characterConditions = resolveTierCharacterConditions(clauseEffects);
  const scope = resolveScopeFromTierClauses(clauseEffects, 'none');

  return {
    tier: 0,
    kind: 'conditional',
    scope,
    characterConditions,
    teamConditions: cluster.teamConditions,
    fieldConditions: cluster.fieldConditions,
    triggerConditions: cluster.triggerConditions,
    clauses: dedupeClauses(clauseEffects),
    atkBoost: resolveTierBoost(clauseEffects, 'atk'),
    hpBoost: resolveTierBoost(clauseEffects, 'hp'),
  };
}

// "defeated an enemy last turn" depends on a mid-battle event the team builder cannot influence,
// so a tier whose only gate is that trigger gives the user no extra team-composition advice.
const UNACTIONABLE_TRIGGER_KINDS = new Set(['defeated-enemy-last-turn']);

function isUnactionableTriggerOnlyTier(tier) {
  if (tier.teamConditions.length > 0 || tier.fieldConditions.length > 0) {
    return false;
  }
  if (tier.triggerConditions.length === 0) {
    return false;
  }
  return tier.triggerConditions.every((trigger) =>
    UNACTIONABLE_TRIGGER_KINDS.has(trigger.kind),
  );
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

    const costRange = clause.match(COST_RANGE_PATTERN);
    if (costRange !== null) {
      conditions.costRange = {
        ...(conditions.costRange ?? {}),
        min: Number(costRange[1]),
        max: Number(costRange[2]),
      };
    } else {
      // "Cost N characters" (exact, no qualifier) — equivalent to a closed range [N, N].
      // Only applied when no other cost qualifier already matched, to avoid double-counting
      // patterns like "Cost N or more" / "Cost A-B" which contain "Cost N" as a substring.
      const costExact = clause.match(COST_EXACT_PATTERN);
      const hasOtherCostMatch =
        COST_MIN_PATTERN.test(clause) || COST_MAX_PATTERN.test(clause);
      if (costExact !== null && !hasOtherCostMatch) {
        const exact = Number(costExact[1]);
        conditions.costRange = {
          ...(conditions.costRange ?? {}),
          min: exact,
          max: exact,
        };
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

    const rarityTiered = clause.match(RARITY_TIERED_PATTERN);
    if (rarityTiered !== null) {
      // "Rarity N or N+ characters" — exact-tier (both base and trained Rarity N units).
      // The "+" suffix is OPTC's trained-rarity marker; the boost still scopes to that single
      // rarity level (a Rarity 5 unit does not get the Rarity 4 tier's boost).
      const exact = Number(rarityTiered[1]);
      conditions.rarityRange = {
        ...(conditions.rarityRange ?? {}),
        min: exact,
        max: exact,
      };
    } else {
      const rarityMin = clause.match(RARITY_MIN_PATTERN);
      const rarityMax = clause.match(RARITY_MAX_PATTERN);
      if (rarityMin !== null) {
        conditions.rarityRange = {
          ...(conditions.rarityRange ?? {}),
          min: Number(rarityMin[1]),
        };
      }
      if (rarityMax !== null) {
        conditions.rarityRange = {
          ...(conditions.rarityRange ?? {}),
          max: Number(rarityMax[1]),
        };
      }
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
    if (SELF_SCOPE_PATTERN.test(clause) && !boostClauseHasUniversalScope(clause)) {
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

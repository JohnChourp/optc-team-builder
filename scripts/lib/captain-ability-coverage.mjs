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
const BOOST_TARGET_FRAGMENT_PATTERNS = [
  /\b(?:of|for)\s+([^.;]{1,220}?)\s+(?:characters|units)\b/gi,
  /\b(?:of|for)\s+(crew)\b/gi,
  /\bboosts?\s+([^.;]{1,220}?)\s+(?:characters|units)(?:'|’)?\s+(?:atk|hp)\b/gi,
  /\bboosts?\s+(crew)(?:'|’)?s?\s+(?:atk|hp)\b/gi,
];
const SPECIAL_COOLDOWN_TARGET_FRAGMENT_PATTERNS = [
  /\breduces?\s+Special Cooldown\s+of\s+([^.;]{1,220}?)\s+(?:characters|units)\s+by\s+\d+\s+turns?\b/gi,
];

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
            firstCoverageClauses: coverage.firstCoverageClauses,
            secondCoverageClauses: coverage.secondCoverageClauses,
          };
        })
        .filter(Boolean)
    : [];

  return { entries };
}

export function summarizeCaptainAbilityCoverageText(captainText) {
  const normalizedCaptainText = normalizeHtmlToText(captainText);

  if (!normalizedCaptainText) {
    return {
      firstCoverageClauses: [],
      secondCoverageClauses: [],
    };
  }

  return {
    firstCoverageClauses: resolveCaptainBoostScopeClauses(
      extractDefaultCaptainBoostText(normalizedCaptainText),
      false,
    ),
    secondCoverageClauses: resolveCaptainBoostScopeClauses(normalizedCaptainText, true),
  };
}

function resolveCaptainBoostScopeClauses(captainText, includeConditional) {
  return extractCaptainBoostScopeClauses(captainText, includeConditional).map(
    normalizeCoverageClause,
  );
}

function extractDefaultCaptainBoostText(captainText) {
  const normalizedCaptainText = normalizeHtmlToText(captainText);
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
    !FALLBACK_OTHER_SCOPE_PATTERN.test(normalizedClause) &&
    (boostClauseHasUniversalScope(normalizedClause) ||
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
  if (FALLBACK_OTHER_SCOPE_PATTERN.test(clause)) {
    return false;
  }

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

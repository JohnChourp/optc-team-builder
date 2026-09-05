import {
  type CaptainCoverageTierKind,
  type CharacterCaptainAbilityCoverageTier,
} from '../models/optc.models';

/**
 * A piece of a tier's scope label. `key` is a translatable phrase; `text` is game
 * data - a type, a class, a character tag - which stays exactly as the dataset
 * spells it in every language.
 */
export type CaptainCoverageTierScopeToken =
  | { key: string; params?: Record<string, string | number>; text?: undefined }
  | { text: string; key?: undefined; params?: undefined };

export const CAPTAIN_TIER_SCOPE_SEPARATOR = ' \u00b7 ';

export interface CaptainCoverageTierViewModel {
  tier: number;
  kind: CaptainCoverageTierKind;
  /**
   * English, and kept: the condition lines around it are 96% raw parser output
   * that cannot be translated, so a half-Greek label would read worse than a
   * consistent English one. Prefer `scopeLabelTokens` for anything rendered.
   */
  scopeLabel: string;
  /** The same label, in pieces, so a template can translate the phrases. */
  scopeLabelTokens: CaptainCoverageTierScopeToken[];
  /**
   * English, and kept: `check-whats-new`-style consumers and the specs compare
   * against it, and it is the fallback whenever a line has no structural form.
   * Prefer `conditionLineTokens` for anything rendered.
   */
  conditionLines: string[];
  /**
   * The same lines, in pieces, so a template can translate the structural parts.
   * One token list per line, in the same order as `conditionLines`.
   */
  conditionLineTokens: CaptainCoverageTierScopeToken[][];
  effectClauses: string[];
  // Populated for `baseline-and-conditional` tiers so the UI can render the unconditional
  // baseline and the gated effects under separate labels within the same tier panel.
  baselineEffectClauses?: string[];
  conditionalEffectClauses?: string[];
  atkBoost?: number;
  hpBoost?: number;
}

export function buildCaptainCoverageTierView(
  tier: CharacterCaptainAbilityCoverageTier,
): CaptainCoverageTierViewModel {
  const hasSplit =
    tier.kind === 'baseline-and-conditional' &&
    Array.isArray(tier.baselineClauses) &&
    Array.isArray(tier.conditionalClauses) &&
    tier.baselineClauses.length > 0 &&
    tier.conditionalClauses.length > 0;

  return {
    tier: tier.tier,
    kind: tier.kind,
    scopeLabel: buildCaptainCoverageTierScopeLabel(tier),
    scopeLabelTokens: buildCaptainCoverageTierScopeTokens(tier),
    conditionLines: collectCaptainCoverageTierConditionLines(tier),
    conditionLineTokens: buildCaptainCoverageTierConditionLineTokens(tier),
    effectClauses: [...tier.clauses],
    ...(hasSplit
      ? {
          baselineEffectClauses: [...tier.baselineClauses!],
          conditionalEffectClauses: [...tier.conditionalClauses!],
        }
      : {}),
    atkBoost: tier.atkBoost,
    hpBoost: tier.hpBoost,
  };
}

export function buildCaptainCoverageTierScopeTokens(
  tier: CharacterCaptainAbilityCoverageTier,
): CaptainCoverageTierScopeToken[] {
  const tokens: CaptainCoverageTierScopeToken[] = [];
  const conditions = tier.characterConditions;

  if (conditions.fallbackOther) {
    tokens.push({ key: 'captainTiers.scope.allOtherCharacters' });
  } else if (conditions.universal) {
    tokens.push({ key: 'captainTiers.scope.allCharacters' });
  }
  if (conditions.dominantType) {
    tokens.push({ key: 'captainTiers.scope.dominantType' });
  }
  if (conditions.costRange?.min !== undefined) {
    tokens.push({ key: 'captainTiers.scope.costMin', params: { min: conditions.costRange.min } });
  }
  if (conditions.costRange?.max !== undefined) {
    tokens.push({ key: 'captainTiers.scope.costMax', params: { max: conditions.costRange.max } });
  }
  if (conditions.rarityRange?.min !== undefined) {
    tokens.push({
      key: 'captainTiers.scope.rarityMin',
      params: { min: conditions.rarityRange.min },
    });
  }
  if (conditions.rarityRange?.max !== undefined) {
    tokens.push({
      key: 'captainTiers.scope.rarityMax',
      params: { max: conditions.rarityRange.max },
    });
  }
  // Types, classes and character tags are the game's own names. They are not
  // translated in any language, which is why they are text rather than keys.
  if (conditions.types.length > 0) {
    tokens.push({ text: conditions.types.map((type) => `[${type}]`).join(' / ') });
  }
  if (conditions.classes.length > 0) {
    tokens.push({ text: conditions.classes.join(' / ') });
  }
  if (conditions.characterTags.length > 0) {
    tokens.push({ text: conditions.characterTags.map((tag) => `[${tag}]`).join(' / ') });
  }

  return tokens.length > 0
    ? tokens
    : [{ key: 'captainTiers.scope.tierFallback', params: { tier: tier.tier } }];
}

function buildCaptainCoverageTierScopeLabel(tier: CharacterCaptainAbilityCoverageTier): string {
  const fragments: string[] = [];
  const conditions = tier.characterConditions;

  if (conditions.fallbackOther) {
    fragments.push('all other characters');
  } else if (conditions.universal) {
    fragments.push('all characters');
  }
  if (conditions.dominantType) {
    fragments.push('Dominant Type characters');
  }
  if (conditions.costRange?.min !== undefined) {
    fragments.push(`Cost ${conditions.costRange.min}+`);
  }
  if (conditions.costRange?.max !== undefined) {
    fragments.push(`Cost ≤ ${conditions.costRange.max}`);
  }
  if (conditions.rarityRange?.min !== undefined) {
    fragments.push(`Rarity ${conditions.rarityRange.min}+`);
  }
  if (conditions.rarityRange?.max !== undefined) {
    fragments.push(`Rarity ≤ ${conditions.rarityRange.max}`);
  }
  if (conditions.types.length > 0) {
    fragments.push(conditions.types.map((type) => `[${type}]`).join(' / '));
  }
  if (conditions.classes.length > 0) {
    fragments.push(conditions.classes.join(' / '));
  }
  if (conditions.characterTags.length > 0) {
    fragments.push(conditions.characterTags.map((tag) => `[${tag}]`).join(' / '));
  }

  return fragments.length > 0 ? fragments.join(' · ') : `Tier ${tier.tier}`;
}

/**
 * The structured shape of a crew condition, or null when the dataset gave us
 * nothing but prose.
 *
 * Extracted because the English collector and the token builder must agree
 * exactly - a test renders the tokens through the English catalogue and demands
 * the old string back - and the cheapest way to guarantee that is to make both
 * ask the same question.
 */
function describeCrewComposition(condition: {
  minCount?: number;
  exactCount?: number;
  types?: string[];
  classes?: string[];
  characterTags?: string[];
  sameType?: boolean;
}): { count: string; targets: string[]; sameType: boolean; oneOfEach: boolean } | null {
  const targets = [
    ...(condition.types ?? []).map((type) => `[${type}]`),
    ...(condition.classes ?? []),
    ...(condition.characterTags ?? []).map((tag) => `[${tag}]`),
  ];

  if (!condition.minCount && !condition.exactCount && !condition.sameType && targets.length === 0) {
    return null;
  }

  const count = condition.minCount
    ? `${condition.minCount}+`
    : condition.exactCount
      ? `${condition.exactCount}`
      : '';

  /*
   * "one of each", not "N of any". The parser sets `minCount` to the number of
   * listed targets for the `there is a [STR], [DEX] and [QCK] character in your
   * crew` family - 125 of the 240 crew conditions in the shipped dataset - so
   * rendering those as `crew has 3+ [DEX] [STR] [QCK]` would state a different
   * requirement. Two or more targets, because with a single target the equality
   * is true by construction and means nothing.
   */
  const oneOfEach =
    Boolean(condition.minCount) && condition.minCount === targets.length && targets.length > 1;

  return { count, targets, sameType: Boolean(condition.sameType), oneOfEach };
}

function collectCaptainCoverageTierConditionLines(
  tier: CharacterCaptainAbilityCoverageTier,
): string[] {
  const lines: string[] = [];
  for (const condition of tier.teamConditions) {
    if (condition.kind === 'crew-exclusion') {
      const targetParts = [
        ...(condition.types ?? []).map((type) => `[${type}]`),
        ...(condition.classes ?? []),
        ...(condition.characterTags ?? []).map((tag) => `[${tag}]`),
      ];
      const detail = targetParts.length ? targetParts.join(' / ') : condition.rawClause || '?';
      lines.push(`Team excludes: ${detail}`);
      continue;
    }
    if (condition.kind === 'requires-captain') {
      lines.push('Team: this character is your Captain');
      continue;
    }
    const crew =
      condition.kind === 'crew-composition' || condition.kind === 'crew-count'
        ? describeCrewComposition(condition)
        : null;
    if (crew) {
      if (crew.oneOfEach) {
        lines.push(`Team: crew has one of each of ${crew.targets.join(' / ')}`);
      } else if (crew.sameType && crew.targets.length === 0) {
        lines.push(`Team: crew has ${crew.count} same Type`.replace('  ', ' ').trim());
      } else {
        lines.push(
          `Team: crew has ${[crew.count, ...crew.targets].filter(Boolean).join(' ')}`.trim(),
        );
      }
    } else if (condition.rawClause.trim().length) {
      lines.push(`Team: ${condition.rawClause}`);
    }
  }
  for (const condition of tier.fieldConditions) {
    lines.push(`Field: Territory ${condition.territories.map((t) => `[${t}]`).join(' / ')}`);
  }
  for (const condition of tier.triggerConditions) {
    if (condition.kind === 'captain-branch-state') {
      lines.push(`Branch state: ${condition.branchLabel ?? condition.rawClause}`);
      continue;
    }
    if (condition.kind === 'consecutive-perfects' && condition.perfectStreak) {
      lines.push(`Trigger: after ${condition.perfectStreak} consecutive PERFECTs`);
      continue;
    }
    if (condition.kind === 'action-special-excellent') {
      lines.push('Trigger: performs EXCELLENT with their Action Special');
      continue;
    }
    if (condition.kind === 'hp-above' && condition.hpPercent !== undefined) {
      lines.push(`Trigger: HP is above ${condition.hpPercent}%`);
      continue;
    }
    if (condition.kind === 'hp-below' && condition.hpPercent !== undefined) {
      lines.push(`Trigger: HP is below ${condition.hpPercent}%`);
      continue;
    }
    lines.push(`Trigger: ${condition.rawClause || condition.kind}`);
  }
  return lines;
}

/**
 * Fixed clauses the parser emits verbatim, mapped to their own keys.
 *
 * These are not a parser change and not a guess: each is a single distinct
 * string measured across the shipped dataset - `this character is your Captain`
 * (52 instances), `performs EXCELLENT with their Action Special` (52),
 * `if they have a beneficial orb` (291, a quarter of every condition line in the
 * app) and `if they have the applicable tag` (45). Matching the exact string is
 * deliberate: anything else falls through to the raw clause unchanged, so an
 * upstream rewording degrades to today's English instead of breaking.
 */
const CAPTAIN_TIER_FIXED_TRIGGER_CLAUSES: Readonly<Record<string, string>> = {
  'if they have a beneficial orb': 'triggerBeneficialOrb',
  'if they have the applicable tag': 'triggerApplicableTag',
};

function conditionKey(key: string, params?: Record<string, string | number>) {
  return params
    ? { key: `captainTiers.condition.${key}`, params }
    : { key: `captainTiers.condition.${key}` };
}

/**
 * The condition lines, in pieces a template can translate.
 *
 * Every line gets a translated structural prefix. A line whose tail is game data
 * - types, classes, character tags, territories, a branch label - becomes fully
 * translatable; a line whose tail is raw parser English keeps that English after
 * a Greek prefix, because inventing a translation for text the dataset spells in
 * English would be worse than showing what the game says.
 *
 * Measured over the shipped roster: 1172 condition lines, of which 46 are fully
 * structural today and a further 440 are fixed clauses handled above. The rest
 * carry a translated prefix and their own English clause.
 */
export function buildCaptainCoverageTierConditionLineTokens(
  tier: CharacterCaptainAbilityCoverageTier,
): CaptainCoverageTierScopeToken[][] {
  const lines: CaptainCoverageTierScopeToken[][] = [];

  for (const condition of tier.teamConditions) {
    if (condition.kind === 'crew-exclusion') {
      const targetParts = [
        ...(condition.types ?? []).map((type) => `[${type}]`),
        ...(condition.classes ?? []),
        ...(condition.characterTags ?? []).map((tag) => `[${tag}]`),
      ];
      const detail = targetParts.length ? targetParts.join(' / ') : condition.rawClause || '?';
      lines.push([conditionKey('teamExcludes', { detail })]);
      continue;
    }
    if (condition.kind === 'requires-captain') {
      lines.push([conditionKey('teamRequiresCaptain')]);
      continue;
    }
    const crew =
      condition.kind === 'crew-composition' || condition.kind === 'crew-count'
        ? describeCrewComposition(condition)
        : null;
    if (crew) {
      if (crew.oneOfEach) {
        lines.push([conditionKey('teamCrewHasOneOfEach', { targets: crew.targets.join(' / ') })]);
      } else if (crew.sameType && crew.targets.length === 0) {
        lines.push([conditionKey('teamCrewHasSameType', { count: crew.count })]);
      } else {
        lines.push([
          conditionKey('teamCrewHas', {
            parts: [crew.count, ...crew.targets].filter(Boolean).join(' '),
          }),
        ]);
      }
      continue;
    }
    if (condition.rawClause.trim().length) {
      lines.push([conditionKey('teamRaw', { clause: condition.rawClause })]);
    }
  }

  for (const condition of tier.fieldConditions) {
    const territories = condition.territories.map((t) => `[${t}]`).join(' / ');
    lines.push([conditionKey('fieldTerritory', { territories })]);
  }

  for (const condition of tier.triggerConditions) {
    if (condition.kind === 'captain-branch-state') {
      lines.push([
        conditionKey('branchState', { label: condition.branchLabel ?? condition.rawClause }),
      ]);
      continue;
    }
    if (condition.kind === 'consecutive-perfects' && condition.perfectStreak) {
      lines.push([conditionKey('triggerConsecutivePerfects', { count: condition.perfectStreak })]);
      continue;
    }
    if (condition.kind === 'action-special-excellent') {
      lines.push([conditionKey('triggerActionSpecialExcellent')]);
      continue;
    }
    if (condition.kind === 'hp-above' && condition.hpPercent !== undefined) {
      lines.push([conditionKey('triggerHpAbove', { percent: condition.hpPercent })]);
      continue;
    }
    if (condition.kind === 'hp-below' && condition.hpPercent !== undefined) {
      lines.push([conditionKey('triggerHpBelow', { percent: condition.hpPercent })]);
      continue;
    }
    const clause = (condition.rawClause || condition.kind).trim();
    const fixed = CAPTAIN_TIER_FIXED_TRIGGER_CLAUSES[clause];
    lines.push([
      fixed
        ? conditionKey(fixed)
        : conditionKey('triggerRaw', { clause: condition.rawClause || condition.kind }),
    ]);
  }

  return lines;
}

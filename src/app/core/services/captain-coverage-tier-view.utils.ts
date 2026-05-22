import {
  type CaptainCoverageTierKind,
  type CharacterCaptainAbilityCoverageTier,
} from '../models/optc.models';

export interface CaptainCoverageTierViewModel {
  tier: number;
  kind: CaptainCoverageTierKind;
  scopeLabel: string;
  conditionLines: string[];
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
    conditionLines: collectCaptainCoverageTierConditionLines(tier),
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

function buildCaptainCoverageTierScopeLabel(
  tier: CharacterCaptainAbilityCoverageTier,
): string {
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
      const detail = targetParts.length ? targetParts.join(' / ') : (condition.rawClause || '?');
      lines.push(`Team excludes: ${detail}`);
      continue;
    }
    if (condition.rawClause.trim().length) {
      lines.push(`Team: ${condition.rawClause}`);
    } else if (condition.kind === 'crew-composition' || condition.kind === 'crew-count') {
      const labelParts: string[] = [];
      if (condition.minCount) {
        labelParts.push(`${condition.minCount}+`);
      } else if (condition.exactCount) {
        labelParts.push(`${condition.exactCount}`);
      }
      const targetParts = [
        condition.sameType ? 'same Type' : null,
        ...(condition.types ?? []).map((type) => `[${type}]`),
        ...(condition.classes ?? []),
        ...(condition.characterTags ?? []).map((tag) => `[${tag}]`),
      ].filter((part): part is string => Boolean(part));
      lines.push(`Team: crew has ${[...labelParts, ...targetParts].join(' ')}`.trim());
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
    lines.push(`Trigger: ${condition.rawClause || condition.kind}`);
  }
  return lines;
}

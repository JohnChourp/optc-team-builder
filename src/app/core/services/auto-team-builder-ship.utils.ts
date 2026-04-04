import {
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildResult,
  type AutoBuildShipSelection,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { type ShipRecord } from '../models/optc.models';
import { resolveCharacterTypeTokens } from './auto-team-builder.utils';

interface ShipUtilitySignal {
  label: string;
  matched: boolean;
  score: number;
}

interface ShipAnalysis {
  description: string;
  scopedClasses: string[];
  scopedTypes: AutoTeamBuilderType[];
  attackMultiplier: number;
  hpMultiplier: number;
  matchingSlots: number;
  totalSlots: number;
  scopeLabel: string | null;
  utilitySignals: ShipUtilitySignal[];
  hardRestriction: boolean;
  softRestriction: boolean;
  costCap: number | null;
  exceedsCostCap: boolean;
  score: number;
}

interface RecommendedShipCandidate {
  ship: ShipRecord;
  analysis: ShipAnalysis;
}

const ATTACK_MULTIPLIER_PATTERNS = [
  /boosts atk and hp(?: of [^.]+?)? by (\d+(?:\.\d+)?)x/gi,
  /boosted ability:\s*boosts atk and hp(?: of [^.]+?)? by (\d+(?:\.\d+)?)x/gi,
  /boosts atk(?: of [^.]+?)? by (\d+(?:\.\d+)?)x/gi,
  /boosts the atk of all other characters by (\d+(?:\.\d+)?)x/gi,
];

const HP_MULTIPLIER_PATTERNS = [
  /boosts atk and hp(?: of [^.]+?)? by (\d+(?:\.\d+)?)x/gi,
  /boosted ability:\s*boosts atk and hp(?: of [^.]+?)? by (\d+(?:\.\d+)?)x/gi,
  /boosts hp(?: of [^.]+?)? by (\d+(?:\.\d+)?)x/gi,
  /and their hp by (\d+(?:\.\d+)?)x/gi,
  /their hp by (\d+(?:\.\d+)?)x/gi,
];

const UTILITY_SIGNAL_BUILDERS: Array<{
  label: string;
  pattern: RegExp;
  score: number;
}> = [
  {
    label: 'Cooldown',
    pattern: /reduces cooldown|cooldown of .*? by \d+|special cooldown/i,
    score: 26,
  },
  {
    label: 'Matching orbs',
    pattern: /matching orbs?|boosts chances of getting matching/i,
    score: 20,
  },
  {
    label: 'PERFECT help',
    pattern: /perfects easier to hit|makes perfects easier/i,
    score: 14,
  },
  {
    label: 'Chain',
    pattern: /adds .* to chain|boosts chain/i,
    score: 18,
  },
  {
    label: 'Damage reduction',
    pattern: /reduces damage received|damage received above/i,
    score: 16,
  },
  {
    label: 'Heal',
    pattern: /heals|heals the crew|recovers \d+ hp/i,
    score: 14,
  },
  {
    label: 'Fixed damage',
    pattern: /typeless damage|fixed damage|cuts the current hp/i,
    score: 8,
  },
];

export function resolveAutoBuildShipSelection(
  result: Pick<AutoBuildResult, 'slots' | 'input'>,
  ships: ShipRecord[],
): AutoBuildShipSelection | null {
  const excludedShipIdSet = new Set(result.input.excludedShipIds ?? []);
  const eligibleShips = ships.filter((ship) => !excludedShipIdSet.has(ship.id));

  if (!eligibleShips.length) {
    return null;
  }

  const manualShip = eligibleShips.find((ship) => ship.id === result.input.manualShipId);

  if (manualShip) {
    const analysis = analyzeShipForResult(manualShip, result);

    return {
      ship: manualShip,
      source: 'manual',
      reasonChips: buildShipReasonChips(analysis, true),
    };
  }

  const [recommendedShip] = eligibleShips
    .map<RecommendedShipCandidate>((ship) => ({
      ship,
      analysis: analyzeShipForResult(ship, result),
    }))
    .sort(compareRecommendedShips);

  if (!recommendedShip) {
    return null;
  }

  return {
    ship: recommendedShip.ship,
    source: 'recommended',
    reasonChips: buildShipReasonChips(recommendedShip.analysis),
  };
}

function compareRecommendedShips(
  left: RecommendedShipCandidate,
  right: RecommendedShipCandidate,
): number {
  if (left.analysis.score !== right.analysis.score) {
    return right.analysis.score - left.analysis.score;
  }

  const leftAttackCoverage = left.analysis.attackMultiplier * left.analysis.matchingSlots;
  const rightAttackCoverage = right.analysis.attackMultiplier * right.analysis.matchingSlots;

  if (leftAttackCoverage !== rightAttackCoverage) {
    return rightAttackCoverage - leftAttackCoverage;
  }

  const leftHpCoverage = left.analysis.hpMultiplier * left.analysis.matchingSlots;
  const rightHpCoverage = right.analysis.hpMultiplier * right.analysis.matchingSlots;

  if (leftHpCoverage !== rightHpCoverage) {
    return rightHpCoverage - leftHpCoverage;
  }

  if (left.analysis.matchingSlots !== right.analysis.matchingSlots) {
    return right.analysis.matchingSlots - left.analysis.matchingSlots;
  }

  return left.ship.id - right.ship.id;
}

function analyzeShipForResult(
  ship: ShipRecord,
  result: Pick<AutoBuildResult, 'slots' | 'input'>,
): ShipAnalysis {
  const description = ship.description.trim();
  const scopedClasses = AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
    new RegExp(`\\b${escapeRegExp(characterClass)}\\b`, 'i').test(description),
  );
  const scopedTypes = AUTO_TEAM_BUILDER_TYPES.filter((type) =>
    new RegExp(`\\b\\[?${type}\\]?\\b`, 'i').test(description),
  );
  const costCapMatch = description.match(/(\d+)\s+cost or less/i);
  const costCap = costCapMatch ? Number(costCapMatch[1]) : null;
  const matchingSlots = result.slots.filter((slot) =>
    doesShipMatchSlot(slot.character, scopedClasses, scopedTypes, costCap),
  ).length;
  const totalSlots = result.slots.length;
  const utilitySignals = UTILITY_SIGNAL_BUILDERS.map((signal) => ({
    label: signal.label,
    matched: signal.pattern.test(description),
    score: signal.score,
  }));
  const attackMultiplier = resolveMaxMultiplier(description, ATTACK_MULTIPLIER_PATTERNS);
  const hpMultiplier = resolveMaxMultiplier(description, HP_MULTIPLIER_PATTERNS);
  const hardRestriction = /everyone else by 99%|sharply reduces .*non-|reduces the hp of everyone else|reduces atk and hp of non-/i.test(
    description,
  );
  const softRestriction =
    /\bonly\b/i.test(description) || /\bcost or less\b/i.test(description);
  const exceedsCostCap =
    costCap !== null && result.slots.some((slot) => slot.character.cost > costCap);
  const scopeLabel = buildScopeLabel(scopedClasses, scopedTypes, costCap);

  let score = attackMultiplier * matchingSlots * 100;
  score += hpMultiplier * matchingSlots * 40;
  score += utilitySignals.reduce(
    (sum, signal) => sum + (signal.matched ? signal.score : 0),
    0,
  );
  score += matchingSlots * 6;

  if (!scopedClasses.length && !scopedTypes.length && costCap === null) {
    score += 18;
  }

  if (hardRestriction && matchingSlots < totalSlots) {
    score -= 1200;
  } else if (softRestriction && matchingSlots < totalSlots) {
    score -= 180;
  }

  if (costCap !== null) {
    score += exceedsCostCap ? -720 : 48;
  }

  if ((scopedClasses.length || scopedTypes.length) && matchingSlots < Math.ceil(totalSlots / 2)) {
    score -= 120;
  }

  return {
    description,
    scopedClasses,
    scopedTypes,
    attackMultiplier,
    hpMultiplier,
    matchingSlots,
    totalSlots,
    scopeLabel,
    utilitySignals,
    hardRestriction,
    softRestriction,
    costCap,
    exceedsCostCap,
    score,
  };
}

function buildShipReasonChips(analysis: ShipAnalysis, isManual = false): string[] {
  const chips: string[] = [];

  if (isManual) {
    chips.push('Manual ship');
  }

  if (analysis.attackMultiplier > 0) {
    chips.push(`ATK ${analysis.attackMultiplier}x`);
  }

  if (analysis.hpMultiplier > 0) {
    chips.push(`HP ${analysis.hpMultiplier}x`);
  }

  if (analysis.scopeLabel) {
    chips.push(`${analysis.matchingSlots}/${analysis.totalSlots} slots`);
  }

  const [firstUtility] = analysis.utilitySignals.filter((signal) => signal.matched);

  if (firstUtility) {
    chips.push(firstUtility.label);
  }

  return [...new Set(chips)].slice(0, 4);
}

function resolveMaxMultiplier(description: string, patterns: RegExp[]): number {
  return patterns.reduce((currentMax, pattern) => {
    let match: RegExpExecArray | null;
    let nextMax = currentMax;

    while ((match = pattern.exec(description)) !== null) {
      const rawValue = Number(match[1]);

      if (Number.isFinite(rawValue)) {
        nextMax = Math.max(nextMax, rawValue);
      }
    }

    pattern.lastIndex = 0;
    return nextMax;
  }, 0);
}

function doesShipMatchSlot(
  character: AutoBuildResult['slots'][number]['character'],
  scopedClasses: string[],
  scopedTypes: AutoTeamBuilderType[],
  costCap: number | null,
): boolean {
  if (costCap !== null && character.cost > costCap) {
    return false;
  }

  if (!scopedClasses.length && !scopedTypes.length) {
    return true;
  }

  const matchesClass =
    !scopedClasses.length ||
    character.classes.some((characterClass) => scopedClasses.includes(characterClass));
  const characterTypes = resolveCharacterTypeTokens(character.type);
  const matchesType =
    !scopedTypes.length || characterTypes.some((type) => scopedTypes.includes(type));

  return matchesClass && matchesType;
}

function buildScopeLabel(
  scopedClasses: string[],
  scopedTypes: AutoTeamBuilderType[],
  costCap: number | null,
): string | null {
  if (costCap !== null) {
    return `<=${costCap} cost`;
  }

  const scopeParts = [...scopedTypes, ...scopedClasses];

  return scopeParts.length ? scopeParts.join(' / ') : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

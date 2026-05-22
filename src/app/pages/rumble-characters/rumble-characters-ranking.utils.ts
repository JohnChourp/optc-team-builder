import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  type NormalizedRumbleEffect,
  type RumbleBuffFocusPreference,
  type RumbleBuffFocusStat,
  type RumbleUnitScore,
} from '../../core/models/auto-team-builder-rumble.models';
import { buildRumbleBuffFocusWeightMap } from '../../core/services/auto-team-builder-rumble-focus.utils';

export interface RumbleCharacterRankedScore {
  unit: RumbleUnitScore;
  focusedScore: number;
  focusBonus: number;
  focusContributions: Record<RumbleBuffFocusStat, number>;
}

const EMPTY_FOCUS_CONTRIBUTIONS: Record<RumbleBuffFocusStat, number> = {
  ATK: 0,
  HP: 0,
  DEF: 0,
  SPD: 0,
  RCV: 0,
  'Special CT': 0,
};

const STAT_ALIASES: Record<RumbleBuffFocusStat, string[]> = {
  ATK: ['atk', 'attack'],
  HP: ['hp'],
  DEF: ['def', 'defense', 'guard'],
  SPD: ['spd', 'speed'],
  RCV: ['rcv', 'heal', 'healing', 'recovery'],
  'Special CT': ['special ct', 'ct', 'cooldown', 'special cooldown'],
};

export function rankRumbleCharacters(
  units: readonly RumbleUnitScore[],
  buffFocus: readonly RumbleBuffFocusPreference[] = DEFAULT_RUMBLE_BUFF_FOCUS,
): RumbleCharacterRankedScore[] {
  const focusWeights = buildRumbleBuffFocusWeightMap(buffFocus);

  return units
    .map((unit) => {
      const focusContributions = resolveFocusContributions(unit);
      const focusBonus = Object.entries(focusContributions).reduce(
        (total, [stat, value]) => total + value * focusWeights[stat as RumbleBuffFocusStat],
        0,
      );
      const focusedScore = Math.round(resolveBaseScore(unit) + focusBonus);

      return {
        unit,
        focusedScore,
        focusBonus: Math.round(focusBonus),
        focusContributions,
      };
    })
    .sort(compareRankedRumbleCharacters);
}

function resolveFocusContributions(
  unit: RumbleUnitScore,
): Record<RumbleBuffFocusStat, number> {
  const character = unit.character;
  const normalized = unit.normalized;
  const contributions: Record<RumbleBuffFocusStat, number> = {
    ...EMPTY_FOCUS_CONTRIBUTIONS,
    ATK: (character.stats.max.atk ?? 0) / 28,
    HP: (character.stats.max.hp ?? 0) / 150,
    DEF: (normalized.def ?? 0) * 1.1,
    SPD: (normalized.spd ?? 0) * 1,
    RCV: (character.stats.max.rcv ?? 0) / 55,
    'Special CT': normalized.cooldown ? Math.max(0, 50 - normalized.cooldown) * 1.8 : 0,
  };

  [...normalized.passiveEffects, ...normalized.specialEffects].forEach((effect) => {
    const stats = resolveEffectFocusStats(effect);

    if (!stats.length) {
      return;
    }

    const effectValue = resolveEffectFocusValue(effect);

    stats.forEach((stat) => {
      contributions[stat] += effectValue;
    });
  });

  return contributions;
}

function compareRankedRumbleCharacters(
  left: RumbleCharacterRankedScore,
  right: RumbleCharacterRankedScore,
): number {
  const focusedDifference = right.focusedScore - left.focusedScore;

  if (focusedDifference !== 0) {
    return focusedDifference;
  }

  const baseDifference = resolveBaseScore(right.unit) - resolveBaseScore(left.unit);

  if (baseDifference !== 0) {
    return baseDifference;
  }

  return right.unit.character.id - left.unit.character.id;
}

function resolveBaseScore(unit: RumbleUnitScore): number {
  return unit.breakdown.total || Math.round(unit.baseScore);
}

function resolveEffectFocusStats(effect: NormalizedRumbleEffect): RumbleBuffFocusStat[] {
  const haystack = [
    effect.targetStat ?? '',
    effect.type ?? '',
    effect.effect,
    ...effect.attributes,
    ...effect.targetTokens,
  ]
    .join(' ')
    .toLowerCase();

  return (Object.keys(STAT_ALIASES) as RumbleBuffFocusStat[]).filter((stat) =>
    STAT_ALIASES[stat].some((alias) => haystack.includes(alias)),
  );
}

function resolveEffectFocusValue(effect: NormalizedRumbleEffect): number {
  const sourceWeight = effect.source === 'special' ? 5 : 3.5;
  const amountWeight = Math.max(1, effect.amount ?? 1);
  const chanceWeight = effect.chance ? Math.max(0.4, effect.chance / 100) : 1;
  const durationWeight = effect.duration ? Math.min(4, effect.duration) * 0.6 : 0;
  const coverageWeight = effect.targetScope === 'crew' ? 1.25 : 1;

  return (sourceWeight + amountWeight * 1.4 + durationWeight) * chanceWeight * coverageWeight;
}

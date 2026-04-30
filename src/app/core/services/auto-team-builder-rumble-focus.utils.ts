import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  RUMBLE_BUFF_FOCUS_RANKS,
  RUMBLE_BUFF_FOCUS_STATS,
  type RumbleBuffFocusPreference,
  type RumbleBuffFocusRank,
  type RumbleBuffFocusStat,
} from '../models/auto-team-builder-rumble.models';

export type RumbleBuffFocusDirection = 'up' | 'down';

export const RUMBLE_BUFF_FOCUS_RANK_WEIGHTS: Record<RumbleBuffFocusRank, number> = {
  primary: 1.75,
  secondary: 1,
  tertiary: 0.55,
  ignored: 0,
};

export function normalizeRumbleBuffFocus(
  values: readonly RumbleBuffFocusPreference[] | undefined,
): RumbleBuffFocusPreference[] {
  const statSet = new Set<RumbleBuffFocusStat>(RUMBLE_BUFF_FOCUS_STATS);
  const rankSet = new Set<RumbleBuffFocusRank>(RUMBLE_BUFF_FOCUS_RANKS);
  const byStat = new Map<RumbleBuffFocusStat, RumbleBuffFocusRank>();

  if (Array.isArray(values)) {
    values.forEach((value) => {
      if (!value || typeof value !== 'object') {
        return;
      }

      const stat = value.stat;
      const rank = value.rank;

      if (!statSet.has(stat) || !rankSet.has(rank) || byStat.has(stat)) {
        return;
      }

      byStat.set(stat, rank);
    });
  }

  DEFAULT_RUMBLE_BUFF_FOCUS.forEach((preference) => {
    if (!byStat.has(preference.stat)) {
      byStat.set(preference.stat, preference.rank);
    }
  });

  return RUMBLE_BUFF_FOCUS_STATS.map((stat) => ({
    stat,
    rank: byStat.get(stat) ?? 'ignored',
  }));
}

export function buildRumbleBuffFocusWeightMap(
  buffFocus: readonly RumbleBuffFocusPreference[],
): Record<RumbleBuffFocusStat, number> {
  const normalizedFocus = normalizeRumbleBuffFocus(buffFocus);

  return normalizedFocus.reduce(
    (weights, preference) => ({
      ...weights,
      [preference.stat]: RUMBLE_BUFF_FOCUS_RANK_WEIGHTS[preference.rank],
    }),
    {} as Record<RumbleBuffFocusStat, number>,
  );
}

export function resolveRumbleBuffFocusRank(
  buffFocus: readonly RumbleBuffFocusPreference[],
  stat: RumbleBuffFocusStat,
): RumbleBuffFocusRank {
  return (
    normalizeRumbleBuffFocus(buffFocus).find((preference) => preference.stat === stat)?.rank ??
    'ignored'
  );
}

export function getRumbleBuffFocusStatsForRank(
  buffFocus: readonly RumbleBuffFocusPreference[],
  rank: RumbleBuffFocusRank,
): RumbleBuffFocusStat[] {
  return normalizeRumbleBuffFocus(buffFocus)
    .filter((preference) => preference.rank === rank)
    .map((preference) => preference.stat);
}

export function canMoveRumbleBuffFocusStat(
  buffFocus: readonly RumbleBuffFocusPreference[],
  stat: RumbleBuffFocusStat,
  direction: RumbleBuffFocusDirection,
): boolean {
  const rankIndex = RUMBLE_BUFF_FOCUS_RANKS.indexOf(resolveRumbleBuffFocusRank(buffFocus, stat));

  return direction === 'up'
    ? rankIndex > 0
    : rankIndex >= 0 && rankIndex < RUMBLE_BUFF_FOCUS_RANKS.length - 1;
}

export function moveRumbleBuffFocusStat(
  buffFocus: readonly RumbleBuffFocusPreference[],
  stat: RumbleBuffFocusStat,
  direction: RumbleBuffFocusDirection,
): RumbleBuffFocusPreference[] {
  if (!canMoveRumbleBuffFocusStat(buffFocus, stat, direction)) {
    return normalizeRumbleBuffFocus(buffFocus);
  }

  const currentRankIndex = RUMBLE_BUFF_FOCUS_RANKS.indexOf(
    resolveRumbleBuffFocusRank(buffFocus, stat),
  );
  const nextRank =
    RUMBLE_BUFF_FOCUS_RANKS[direction === 'up' ? currentRankIndex - 1 : currentRankIndex + 1] ??
    'ignored';

  return normalizeRumbleBuffFocus(buffFocus).map((preference) => ({
    ...preference,
    rank: preference.stat === stat ? nextRank : preference.rank,
  }));
}

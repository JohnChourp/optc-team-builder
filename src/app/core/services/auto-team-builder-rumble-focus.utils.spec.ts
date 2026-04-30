import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  type RumbleBuffFocusPreference,
} from '../models/auto-team-builder-rumble.models';
import {
  buildRumbleBuffFocusWeightMap,
  canMoveRumbleBuffFocusStat,
  getRumbleBuffFocusStatsForRank,
  moveRumbleBuffFocusStat,
  normalizeRumbleBuffFocus,
} from './auto-team-builder-rumble-focus.utils';

describe('auto-team-builder-rumble-focus utils', () => {
  it('normalizes incomplete focus preferences back to every known stat', () => {
    const focus = normalizeRumbleBuffFocus([{ stat: 'SPD', rank: 'primary' }]);

    expect(focus.map((preference) => preference.stat)).toEqual([
      'ATK',
      'HP',
      'DEF',
      'SPD',
      'RCV',
      'Special CT',
    ]);
    expect(focus.find((preference) => preference.stat === 'SPD')?.rank).toBe('primary');
    expect(focus.find((preference) => preference.stat === 'ATK')?.rank).toBe('primary');
  });

  it('moves a stat between lanes without changing the other stat order', () => {
    const nextFocus = moveRumbleBuffFocusStat(DEFAULT_RUMBLE_BUFF_FOCUS, 'SPD', 'up');

    expect(getRumbleBuffFocusStatsForRank(nextFocus, 'primary')).toEqual([
      'ATK',
      'HP',
      'DEF',
      'SPD',
    ]);
    expect(getRumbleBuffFocusStatsForRank(nextFocus, 'secondary')).toEqual(['RCV', 'Special CT']);
    expect(canMoveRumbleBuffFocusStat(nextFocus, 'SPD', 'up')).toBe(false);
  });

  it('maps ignored focus to zero weight', () => {
    const ignoredFocus: RumbleBuffFocusPreference[] = DEFAULT_RUMBLE_BUFF_FOCUS.map(
      (preference) => ({
        ...preference,
        rank: 'ignored',
      }),
    );

    expect(buildRumbleBuffFocusWeightMap(ignoredFocus).ATK).toBe(0);
    expect(buildRumbleBuffFocusWeightMap(ignoredFocus)['Special CT']).toBe(0);
  });
});

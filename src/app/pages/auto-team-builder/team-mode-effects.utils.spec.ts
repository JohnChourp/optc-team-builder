import { describe, expect, it } from 'vitest';

import { type AutoBuildResult } from '../../core/models/auto-team-builder.models';
import { buildTeamModeEffects } from './team-mode-effects.utils';

const TM_TEXT =
  "Boosts own ATK by 1.5x for 2 turns. If you are on a Treasure Map, deals 10%-25% of enemies' " +
  'current HP in True damage to all enemies, depending on your Treasure Map Level';
const KZ_TEXT =
  'Reduces Special Cooldown of all characters by 1 turn. If you are in Kizuna Clash, reduces ' +
  "enemies' Increased Defense duration by 4 turns";
const PLAIN_TEXT = 'Deals 15x character\'s ATK in [STR] damage to one enemy';

function team(
  members: [role: 'captain' | 'friendCaptain' | 'sub', id: number, name: string, text: string][],
): AutoBuildResult {
  return {
    slots: members.map(([role, id, name, specialText]) => ({
      role,
      reasonChips: [],
      character: { id, name, detail: { characterId: id, specialText } },
    })),
  } as unknown as AutoBuildResult;
}

describe('team mode effects', () => {
  it('returns nothing without a team or without a mode', () => {
    expect(buildTeamModeEffects(null, 'treasureMap')).toBeNull();
    expect(buildTeamModeEffects(team([['captain', 1, 'A', TM_TEXT]]), null)).toBeNull();
  });

  /*
   * Every member is listed, not just the ones that match. A list of only the matches reads as
   * "these are your mode picks", which would imply the builder chose them for the mode - it did
   * not, and this module changes nothing about what it picks.
   */
  it('lists every member, and marks only the ones the mode touches', () => {
    const effects = buildTeamModeEffects(
      team([
        ['captain', 1001, 'Luffy', TM_TEXT],
        ['sub', 1002, 'Zoro', PLAIN_TEXT],
        ['sub', 1003, 'Nami', KZ_TEXT],
      ]),
      'treasureMap',
    );

    expect(effects?.members).toHaveLength(3);
    expect(effects?.affectedCount).toBe(1);
    expect(effects?.members.map((member) => member.effect !== null)).toEqual([true, false, false]);
  });

  it('answers for the mode asked about, not whichever one the character has', () => {
    const built = team([['captain', 1003, 'Nami', KZ_TEXT]]);

    expect(buildTeamModeEffects(built, 'kizunaClash')?.affectedCount).toBe(1);
    expect(buildTeamModeEffects(built, 'treasureMap')?.affectedCount).toBe(0);
  });

  it('carries the game text through so the card can quote it', () => {
    const effects = buildTeamModeEffects(team([['captain', 1001, 'Luffy', TM_TEXT]]), 'treasureMap');

    expect(effects?.members[0].effect?.clause).toContain('If you are on a Treasure Map');
    expect(effects?.members[0].effect?.conditional).toBe(true);
    expect(effects?.members[0].effect?.scaling).toBe(true);
  });

  it('keeps slot order, so the Captain stays first', () => {
    const effects = buildTeamModeEffects(
      team([
        ['captain', 1001, 'Luffy', PLAIN_TEXT],
        ['friendCaptain', 1002, 'Zoro', TM_TEXT],
        ['sub', 1003, 'Nami', PLAIN_TEXT],
      ]),
      'treasureMap',
    );

    expect(effects?.members.map((member) => member.role)).toEqual([
      'captain',
      'friendCaptain',
      'sub',
    ]);
  });

  it('survives a character with no special text at all', () => {
    const built = {
      slots: [{ role: 'sub', reasonChips: [], character: { id: 189, name: 'Turtle', detail: {} } }],
    } as unknown as AutoBuildResult;

    expect(buildTeamModeEffects(built, 'treasureMap')).toMatchObject({
      affectedCount: 0,
      members: [{ characterName: 'Turtle', effect: null }],
    });
  });
});

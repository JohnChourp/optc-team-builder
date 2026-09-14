import { describe, expect, it } from 'vitest';

import {
  detectCharacterModeEffects,
  GAME_MODES,
  hasModeEffect,
} from './character-mode-effects.utils';

/*
 * Every string here is real dataset text, not invented phrasing. The whole point of this module is
 * that the game writes these clauses one way and we read them; a fixture we made up would test our
 * own imagination.
 */
const TM_CONDITIONAL_AND_SCALING =
  "Boosts own ATK by 1.5x and adds 1.5x character's ATK as Additional Typeless Damage for 2 turns. " +
  'If you are on a Treasure Map, deals 10%-25% of enemies\' current HP in True damage to all ' +
  'enemies, depending on your Treasure Map Level';

const KZ_CONDITIONAL =
  'Reduces Special Cooldown of all characters by 1 turn. If you are in Kizuna Clash, reduces ' +
  "enemies' Increased Defense duration by 4 turns and reduces Percent Damage Reduction duration " +
  'by 4 turns';

const KZ_SCALING_ONLY =
  'Boosts ATK of [STR], [DEX] and [QCK] characters by 1.75x-2.25x for 1 turn depending on your ' +
  'Kizuna Clash Level.';

const NO_MODE =
  'Reduces Despair duration by 3 turns, deals 15x character\'s ATK in [STR] damage to one enemy';

describe('character mode effects', () => {
  it('finds nothing in a special that names no mode', () => {
    expect(detectCharacterModeEffects(NO_MODE)).toEqual([]);
  });

  it.each([null, undefined, '', '   '])('finds nothing in %p', (value) => {
    expect(detectCharacterModeEffects(value)).toEqual([]);
  });

  it('reports a conditional and its scaling as one effect, not two', () => {
    const effects = detectCharacterModeEffects(TM_CONDITIONAL_AND_SCALING);

    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      mode: 'treasureMap',
      conditional: true,
      scaling: true,
    });
  });

  it('quotes the mode sentence, not the whole special', () => {
    const [effect] = detectCharacterModeEffects(TM_CONDITIONAL_AND_SCALING);

    expect(effect.clause).toBe(
      "If you are on a Treasure Map, deals 10%-25% of enemies' current HP in True damage to all " +
        'enemies, depending on your Treasure Map Level',
    );
    // The effects that fire everywhere are left out of the quote.
    expect(effect.clause).not.toContain('Additional Typeless Damage');
  });

  /* Sentences are split on ". " so a percentage range and a decimal multiplier survive the cut. */
  it('does not break the quote on a decimal or a percent range', () => {
    const [effect] = detectCharacterModeEffects(TM_CONDITIONAL_AND_SCALING);

    expect(effect.clause).toContain('10%-25%');
  });

  it('reads Kizuna Clash as well as Treasure Map', () => {
    const effects = detectCharacterModeEffects(KZ_CONDITIONAL);

    expect(effects).toEqual([
      {
        mode: 'kizunaClash',
        conditional: true,
        scaling: false,
        clause:
          'If you are in Kizuna Clash, reduces enemies\' Increased Defense duration by 4 turns ' +
          'and reduces Percent Damage Reduction duration by 4 turns',
      },
    ]);
  });

  /*
   * One Treasure Map unit and two Kizuna ones scale without a conditional clause: the special
   * always fires and the mode only decides how big it is. Reporting that as "conditional" would
   * tell the reader the effect does not exist outside the mode, which is wrong.
   */
  it('separates a scaling-only special from a conditional one', () => {
    const effects = detectCharacterModeEffects(KZ_SCALING_ONLY);

    expect(effects[0]).toMatchObject({
      mode: 'kizunaClash',
      conditional: false,
      scaling: true,
    });
    expect(effects[0].clause).toContain('depending on your Kizuna Clash Level');
  });

  it('matches the phrasings the dataset actually uses', () => {
    // "on a Treasure Map" and "in Kizuna Clash" - both prepositions, article optional.
    expect(hasModeEffect('If you are on the Treasure Map, boosts ATK', 'treasureMap')).toBe(true);
    expect(hasModeEffect('If you are in a Treasure Map, boosts ATK', 'treasureMap')).toBe(true);
    expect(hasModeEffect('If you are in Kizuna, boosts ATK', 'kizunaClash')).toBe(true);
    expect(hasModeEffect('depending on your Kizuna Level', 'kizunaClash')).toBe(true);
  });

  it('does not fire on a mode named without a clause', () => {
    // Naming the mode is not the same as behaving differently in it.
    expect(detectCharacterModeEffects('Usable in Treasure Map and Kizuna Clash')).toEqual([]);
  });

  it('answers per mode', () => {
    expect(hasModeEffect(KZ_CONDITIONAL, 'kizunaClash')).toBe(true);
    expect(hasModeEffect(KZ_CONDITIONAL, 'treasureMap')).toBe(false);
    expect(hasModeEffect(NO_MODE, 'treasureMap')).toBe(false);
  });

  it('exposes the modes it knows, so a caller cannot invent one', () => {
    expect(GAME_MODES).toEqual(['treasureMap', 'kizunaClash']);
  });
});

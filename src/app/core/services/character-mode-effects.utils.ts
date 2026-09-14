/**
 * 869f1mcdv. What a character does differently in Treasure Map or Kizuna Clash.
 *
 * 869f12xa5 asked for an objective the search could take as input - clear, score, sustain - and
 * the feasibility gate closed on the half it was built around. **There is no event or boost data
 * in this dataset at all**: `meta` holds one row, and no `detail_json` key is event-scoped. A boost
 * list is event-scoped and time-bound, so boost weighting can only ever be hand-entered, and that
 * half stays out.
 *
 * The half that IS in the data is permanent, and nothing was reading it. Character ability text
 * carries mode clauses that no screen, filter or search knows about - they are not even among the
 * 586 unresolved clauses the ability parser reports, so they were being absorbed silently.
 *
 * Measured over all 4,618 characters of `sourceVersion` 36, and the shape is narrower than the
 * research assumed - **only `specialText` carries them**, not captain abilities, sailors or
 * supports:
 *
 * | mode | characters |
 * | --- | --- |
 * | Treasure Map | 60 |
 * | Kizuna Clash | 12 |
 * | both | 0 |
 *
 * Two phrasings, and they mean different things:
 *
 * - **conditional** - `"If you are on a Treasure Map, deals 10%-25% of enemies' current HP..."`.
 *   The effect only exists in that mode.
 * - **scaling** - `"...depending on your Treasure Map Level"`. The effect always fires; the mode
 *   decides how big it is.
 *
 * 47 characters carry both, because the scaling usually qualifies the conditional. They are
 * reported as two flags on one effect rather than two effects, which is what the text says.
 *
 * **This reads the shipped text and nothing else.** No importer change, no new column, no dataset
 * regeneration - the data has been there all along.
 */
export type GameMode = 'treasureMap' | 'kizunaClash';

export const GAME_MODES: readonly GameMode[] = ['treasureMap', 'kizunaClash'];

export interface CharacterModeEffect {
  readonly mode: GameMode;
  /** The special does something it would not do outside this mode. */
  readonly conditional: boolean;
  /** The mode's level decides how large the effect is. */
  readonly scaling: boolean;
  /**
   * The game's own words for it, so the reader gets the effect rather than our summary of it.
   * Null when the phrasing matched but no sentence could be isolated.
   */
  readonly clause: string | null;
}

interface ModePatterns {
  readonly conditional: RegExp;
  readonly scaling: RegExp;
}

/*
 * Built from every phrasing present in the dataset rather than from what the modes are called.
 * `(?:on|in)` and the optional article are both real: the text says "on a Treasure Map" and "in
 * Kizuna Clash". "Kizuna" appears without "Clash" in the scaling phrasing, hence the optional
 * group there too.
 */
const MODE_PATTERNS: Record<GameMode, ModePatterns> = {
  treasureMap: {
    conditional: /if you are (?:on|in) (?:a |the )?treasure map/iu,
    scaling: /depending on your treasure map level/iu,
  },
  kizunaClash: {
    conditional: /if you are (?:on|in) (?:a |the )?kizuna(?: clash)?\b/iu,
    scaling: /depending on your kizuna(?: clash)? level/iu,
  },
};

/**
 * The sentence the match sits in, trimmed of the trailing full stop.
 *
 * Special text is one long run of sentences separated by `. `, and quoting the whole thing would
 * bury the mode clause in effects that fire everywhere. Sentence boundaries are taken on `. `
 * rather than on `.` so decimals and `10%-25%` ranges survive.
 */
function extractClause(text: string, match: RegExpMatchArray): string | null {
  const index = match.index ?? -1;

  if (index < 0) {
    return null;
  }

  const before = text.lastIndexOf('. ', index);
  const start = before === -1 ? 0 : before + 2;
  const after = text.indexOf('. ', index);
  const end = after === -1 ? text.length : after;
  const clause = text.slice(start, end).trim().replace(/[.\s]+$/u, '');

  return clause.length > 0 ? clause : null;
}

/** Every mode this character's special behaves differently in. Empty for the other 4,546. */
export function detectCharacterModeEffects(
  specialText: string | null | undefined,
): CharacterModeEffect[] {
  if (typeof specialText !== 'string' || specialText.trim().length === 0) {
    return [];
  }

  const effects: CharacterModeEffect[] = [];

  for (const mode of GAME_MODES) {
    const patterns = MODE_PATTERNS[mode];
    const conditionalMatch = specialText.match(patterns.conditional);
    const scalingMatch = specialText.match(patterns.scaling);

    if (!conditionalMatch && !scalingMatch) {
      continue;
    }

    /*
     * The conditional clause is quoted in preference to the scaling one: it says what the effect
     * IS, where the scaling phrase only says how big. When a character has only the scaling
     * phrasing - one Treasure Map unit and two Kizuna ones - that phrase is all there is.
     */
    const source = conditionalMatch ?? scalingMatch;

    effects.push({
      mode,
      conditional: Boolean(conditionalMatch),
      scaling: Boolean(scalingMatch),
      clause: source ? extractClause(specialText, source) : null,
    });
  }

  return effects;
}

/** Whether this character does anything different in the given mode. */
export function hasModeEffect(specialText: string | null | undefined, mode: GameMode): boolean {
  return detectCharacterModeEffects(specialText).some((effect) => effect.mode === mode);
}

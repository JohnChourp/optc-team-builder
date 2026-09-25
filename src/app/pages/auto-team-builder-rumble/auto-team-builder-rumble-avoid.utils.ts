import { type AutoTeamBuilderType } from '../../core/models/auto-team-builder.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { resolveCharacterFacetMatches } from '../../core/services/auto-team-builder.utils';

/**
 * 869f63gyq. The Rumble builder's opt-in "Avoid style / type / class" filter - for an Assault
 * Rumble boss that punishes a style, a class or a type.
 *
 * The owner's decisions, recorded where the code is:
 *
 *  - It is a candidate filter, applied where the page resolves its candidate pool, and the engine is
 *    left alone. That is the Rumble side of the same avoid a Saved Enemy carries into the quest
 *    builder; the quest search can relax its avoid because it has a relaxation model, and the Rumble
 *    engine has none (`TEAM_BUILDER_ENGINE_DIVERGENCES`, "what-happens-when-nothing-fits"). So when
 *    avoiding leaves too few units, the page says so - it never quietly builds with them.
 *  - The player enters the rules. There is no curated boss list and nothing is remembered between
 *    visits: the rules change every month and would be stale data the day after they shipped.
 *  - Filters only: nothing here scores, weighs or predicts a clear.
 */

export interface RumbleAvoidRules {
  styles: string[];
  types: AutoTeamBuilderType[];
  classes: string[];
}

export function hasRumbleAvoidRules(rules: RumbleAvoidRules): boolean {
  return rules.styles.length > 0 || rules.types.length > 0 || rules.classes.length > 0;
}

/**
 * The candidates the avoid leaves out.
 *
 * A style is the one `resolveStyle` returns, which the page takes from the engine's own
 * `normalizeRumbleData` over the whole candidate list - so the units that inherit their style
 * through `basedOn` are read with it. Compared trimmed and case-folded, as Rumble Characters
 * compares it. A type or class is matched by `resolveCharacterFacetMatches`, the quest builder's
 * rule: a dual unit carrying an avoided type is avoided.
 */
export function resolveRumbleAvoidedCharacterIds(
  candidates: readonly CharacterDetailRecord[],
  resolveStyle: (candidate: CharacterDetailRecord) => string | null,
  rules: RumbleAvoidRules,
): Set<number> {
  const avoidedStyles = new Set(rules.styles.map((style) => style.trim().toLowerCase()));

  return new Set(
    candidates
      .filter(
        (candidate) =>
          avoidedStyles.has((resolveStyle(candidate) ?? '').trim().toLowerCase()) ||
          resolveCharacterFacetMatches(candidate, rules.types, rules.classes).length > 0,
      )
      .map((candidate) => candidate.id),
  );
}

/** The distinct styles the candidates carry, sorted, for the picker - read off the data, not listed. */
export function collectRumbleStyles(styles: Iterable<string | null>): string[] {
  return [
    ...new Set(
      [...styles]
        .map((style) => (style ?? '').trim())
        .filter((style) => style.length > 0),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

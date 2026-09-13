import { type CharacterTagSetSelection } from '../../core/models/optc.models';
import { readCharacterTagSetSelection } from '../../core/services/character-filter-draft.utils';

/**
 * 869f1935z. The Auto Team Builder's own filter selection, parked for the session.
 *
 * `869f127c9` asked for the same rule across the builders and got as far as Captain Coverage and
 * the Manual Team Builder picker. The Auto Team Builder was left out, and the reason recorded in
 * the audit was not size: its SELECTION also has a purpose-built preset codec whose apply path is
 * async, repository-backed, and raises reader-visible warnings plus an embedded team and a
 * preset-name banner. Replaying that on every page load is a different change with a different
 * blast radius, and it would compete with the reader's own preset export.
 *
 * So this stores the four filters and NOTHING else - no preset, no built team, no required
 * characters, no ability requirements, no enemy mechanics. That is what makes it the same change
 * Captain Coverage already shipped rather than a second preset system:
 *
 *  - nothing here is async, and nothing touches the repository;
 *  - restoring raises no warning and shows no banner, because there is no preset to name;
 *  - a preset arriving by route still wins, because it is applied after the restore.
 *
 * Session scope, matching Saved Teams and Captain Coverage: this is how the reader is set up right
 * now, and it should survive a trip to a character's detail page - not greet them weeks later.
 */

export const AUTO_TEAM_BUILDER_SELECTION_SESSION_KEY = 'autoTeamBuilder.selectionState.v1';

export interface AutoTeamBuilderSelectionState {
  selectedTypes: string[];
  selectedClasses: string[];
  selectedCharacterNames: string[];
  characterTagSets: CharacterTagSetSelection;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.every((entry) => typeof entry === 'string') ? [...new Set(value as string[])] : null;
}

/**
 * An all-default selection is stored as nothing, so a reader who cleared their filters is not
 * handed them back on the next visit - and the key does not linger for a state that is already
 * what the page resets to.
 */
export function isDefaultSelectionState(state: AutoTeamBuilderSelectionState): boolean {
  return (
    state.selectedTypes.length === 0 &&
    state.selectedClasses.length === 0 &&
    state.selectedCharacterNames.length === 0 &&
    state.characterTagSets.sets.every((set) => set.tags.length === 0)
  );
}

/**
 * Every field is restored independently. A single malformed field must not discard the other
 * three - that is the correction `869f127c9` already had to make once, when one bad value threw
 * away a whole draft the reader could see no reason to lose.
 */
export function parseSelectionState(value: unknown): Partial<AutoTeamBuilderSelectionState> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const record = value as Record<string, unknown>;
  const parsed: Partial<AutoTeamBuilderSelectionState> = {};

  const types = readStringArray(record['selectedTypes']);
  const classes = readStringArray(record['selectedClasses']);
  const names = readStringArray(record['selectedCharacterNames']);
  const tagSets = readCharacterTagSetSelection(record['characterTagSets']);

  if (types) {
    parsed.selectedTypes = types;
  }

  if (classes) {
    parsed.selectedClasses = classes;
  }

  if (names) {
    parsed.selectedCharacterNames = names;
  }

  if (tagSets) {
    parsed.characterTagSets = tagSets;
  }

  return parsed;
}

/**
 * Restored values are narrowed to what this build still offers. A type or class that upstream
 * renamed away would otherwise sit in the filter bar as a chip that matches nothing, which reads
 * as the builder being broken rather than as a stale filter.
 */
export function narrowToAvailable(values: string[], available: readonly string[]): string[] {
  const allowed = new Set(available);

  return values.filter((value) => allowed.has(value));
}

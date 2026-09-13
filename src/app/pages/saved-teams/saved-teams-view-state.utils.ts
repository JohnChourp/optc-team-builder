import { type AbilityTagSetOperator } from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterTagSet,
  type CharacterTagSetSelection,
} from '../../core/models/optc.models';

/**
 * 869f1935z. Validators for the Saved Teams view state read back out of `sessionStorage`.
 *
 * The ability filters had no storage key at all, so a trip to a character's detail page and back
 * cleared them while the search box and the order survived - reported as "Saved Teams ability
 * filters do not persist". They persist now, on the same session scope and for the same reason:
 * this is how the reader is looking at the list right now, not a preference they set weeks ago.
 *
 * Stored state is UNTRUSTED INPUT. It can come from an older build, a newer one, or a tab that was
 * open across a deploy, and the page already states the rule for the sort key: a value is restored
 * only when it is still one this build understands. These do the same for shapes rather than
 * enums - a malformed set must fall back to "no filter", never to a filter that silently matches
 * nothing and leaves the reader staring at an empty list they cannot explain.
 */

const TAG_SET_OPERATORS: readonly AbilityTagSetOperator[] = ['all', 'any'];

function isOperator(value: unknown): value is AbilityTagSetOperator {
  return TAG_SET_OPERATORS.includes(value as AbilityTagSetOperator);
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.every((entry) => typeof entry === 'string') ? [...new Set(value as string[])] : null;
}

/** Stored ability identities, de-duplicated. `null` means "nothing usable was stored". */
export function toStoredAbilityIds(value: unknown): string[] | null {
  return toStringArray(value);
}

function toTagSet(value: unknown): CharacterTagSet | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { id?: unknown; operator?: unknown; tags?: unknown };
  const tags = toStringArray(candidate.tags);

  if (typeof candidate.id !== 'string' || !isOperator(candidate.operator) || tags === null) {
    return null;
  }

  return { id: candidate.id, operator: candidate.operator, tags };
}

/**
 * A whole selection, or `null`. Deliberately all-or-nothing per SET rather than per selection:
 * one malformed set is dropped and the rest are kept, because losing a reader's other three
 * filters over one bad entry is worse than losing the bad one.
 */
export function toStoredTagSetSelection(value: unknown): CharacterTagSetSelection | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { sets?: unknown; operator?: unknown };

  if (!Array.isArray(candidate.sets) || !isOperator(candidate.operator)) {
    return null;
  }

  const sets = candidate.sets
    .map((entry) => toTagSet(entry))
    .filter((entry): entry is CharacterTagSet => entry !== null);

  return { sets, operator: candidate.operator };
}

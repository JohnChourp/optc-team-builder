import {
  CONTENT_LADDER,
  type ContentLadderMilestone,
  type ContentLadderRequirement,
} from '../../core/data/content-ladder.data';
import { type CharacterListItem } from '../../core/models/optc.models';

/**
 * 869f1naz5. What a box can field, measured against the curated ladder.
 *
 * **It says field, never clear.** 869f12xb1 asked what a box's next goal is, and the dataset
 * answers only half of that: it carries 787 stage names and **no requirements at all** - zero rows
 * mention player level, stamina or unlock. Difficulty is game-balance knowledge this project has
 * no source for, so every verdict here is about the box, and any milestone whose numbers are a
 * starting point rather than an established fact carries `provisional` through to the screen.
 *
 * The three verdicts are the ones the brief asked for - reachable now, one unit away, not close -
 * with "one unit away" meaning exactly that: a single character would satisfy the requirement.
 */
export type ContentLadderVerdict = 'ready' | 'oneAway' | 'notClose';

export interface ContentLadderEntry {
  readonly milestone: ContentLadderMilestone;
  readonly verdict: ContentLadderVerdict;
  /** How many characters the box is short of the requirement. Zero when ready. */
  readonly shortBy: number;
  /** Each unmet part, so the card can say WHAT is missing rather than only how much. */
  readonly missing: readonly string[];
}

export interface ContentLadderReport {
  readonly boxSize: number;
  readonly entries: readonly ContentLadderEntry[];
  readonly readyCount: number;
  /** The first milestone the box cannot field yet - the "next goal" the brief asked for. */
  readonly nextGoal: ContentLadderEntry | null;
}

function countAtLeastStars(characters: readonly CharacterListItem[], stars: number): number {
  return characters.filter((character) => (character.stars ?? 0) >= stars).length;
}

function countWithClass(characters: readonly CharacterListItem[], className: string): number {
  return characters.filter((character) => character.classes?.includes(className)).length;
}

function countWithType(characters: readonly CharacterListItem[], type: string): number {
  return characters.filter((character) => character.type === type).length;
}

/**
 * Every unmet part of the requirement, as `key:shortfall` pairs the caller turns into copy.
 *
 * A requirement can be short on more than one axis at once, and the shortfall reported is the
 * LARGEST of them rather than their sum: one character can satisfy several axes at the same time,
 * so adding them up would overstate how far away the box is.
 */
function measure(
  characters: readonly CharacterListItem[],
  requirement: ContentLadderRequirement,
): { shortBy: number; missing: string[] } {
  const missing: string[] = [];
  let shortBy = 0;

  const sizeShortfall = requirement.teamSize - characters.length;

  if (sizeShortfall > 0) {
    missing.push(`teamSize:${sizeShortfall}`);
    shortBy = Math.max(shortBy, sizeShortfall);
  }

  if (requirement.minStars) {
    const { stars, count } = requirement.minStars;
    const shortfall = count - countAtLeastStars(characters, stars);

    if (shortfall > 0) {
      missing.push(`minStars:${stars}:${shortfall}`);
      shortBy = Math.max(shortBy, shortfall);
    }
  }

  for (const [className, required] of Object.entries(requirement.classCounts ?? {})) {
    const shortfall = required - countWithClass(characters, className);

    if (shortfall > 0) {
      missing.push(`class:${className}:${shortfall}`);
      shortBy = Math.max(shortBy, shortfall);
    }
  }

  for (const [type, required] of Object.entries(requirement.typeCounts ?? {})) {
    const shortfall = required - countWithType(characters, type);

    if (shortfall > 0) {
      missing.push(`type:${type}:${shortfall}`);
      shortBy = Math.max(shortBy, shortfall);
    }
  }

  return { shortBy, missing };
}

export function buildContentLadderReport(
  characters: readonly CharacterListItem[] | null | undefined,
  ladder: readonly ContentLadderMilestone[] = CONTENT_LADDER,
): ContentLadderReport | null {
  if (!characters) {
    return null;
  }

  const entries = ladder.map<ContentLadderEntry>((milestone) => {
    const { shortBy, missing } = measure(characters, milestone.requirement);

    return {
      milestone,
      shortBy,
      missing,
      verdict: shortBy === 0 ? 'ready' : shortBy === 1 ? 'oneAway' : 'notClose',
    };
  });

  return {
    boxSize: characters.length,
    entries,
    readyCount: entries.filter((entry) => entry.verdict === 'ready').length,
    nextGoal: entries.find((entry) => entry.verdict !== 'ready') ?? null,
  };
}

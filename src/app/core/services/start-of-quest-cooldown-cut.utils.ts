import {
  AUTO_TEAM_BUILDER_CLASSES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoTeamBuilderType,
} from '../models/auto-team-builder.models';
import { START_OF_FIGHT_EFFECT_PATTERN } from './captain-coverage.utils';
import { normalizeCaptainTagKey } from './captain-tag-conditions.utils';
import { normalizeHtmlToText } from './html-text.utils';

/**
 * 869f63gm7. How many turns a piece of ability text takes off a special's cooldown at the start
 * of the quest, and whose special.
 *
 * The special charge timeline (869f1k107) measured every special from a full cooldown, so a unit
 * the player has on turn 1 read as "not ready until stage 4". The amount is stated in the shipped
 * text, it was just never read: the dataset tags 26 characters
 * `crewmate_special_charge_start_of_quest`, but as presence, with no amount. This reads the amount.
 *
 * **One grammar, not a second copy.** The timing is `START_OF_FIGHT_EFFECT_PATTERN`, the phrase
 * Captain Coverage already reads start-of-fight cooldown clauses with. Only the cut and its target
 * are new, because nothing in the app read an AMOUNT before.
 *
 * **What it counts, and what it refuses.** A cut counts only when the text states both halves:
 * an amount - "by N turns", or "to MAX" / "completely", which is the whole cooldown - and the
 * start of the fight, quest or adventure. Everything else is left out rather than guessed:
 *
 *  - a cut gated by a condition ("If your crew has 6 ... characters, reduces ...") - nothing here
 *    can tell whether the condition holds. An alternative under a condition ("by 2 turns, by 3
 *    turns instead if ...") keeps the amount that holds without it;
 *  - a percentage ("by 50% of Max Cooldown") - 2 characters, and the result depends on rounding
 *    the text does not settle;
 *  - the SHIP's own special ("reduces Special Cooldown of ship by 2 turns"), which is not a crew
 *    member's special;
 *  - a target it cannot read. A scope it does not recognise is not counted at all, because
 *    counting it for everyone would claim a cut the unit does not get.
 *
 * Only the default Captain branch is read - the text before any label, "Always Active", and the
 * "Standard Captain" or first Captain branch - because the start of the fight is before any branch
 * can switch. "Boosted Ability" and "Action" sections are left out: whether a unit or a ship is
 * boosted is event state the dataset does not carry, which is why the event cut is entered by the
 * player instead.
 */

export type StartOfQuestCutScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'allOthers' }
  | { readonly kind: 'self' }
  | {
      readonly kind: 'listed';
      readonly types: readonly AutoTeamBuilderType[];
      readonly classes: readonly string[];
      /** Normalised character-tag keys, as `normalizeCaptainTagKey` writes them. */
      readonly tags: readonly string[];
    };

export interface StartOfQuestCooldownCut {
  /** Turns taken off the cooldown, or `null` when the text charges it completely. */
  readonly turns: number | null;
  readonly scope: StartOfQuestCutScope;
}

/** The three facts a scope is decided on. A `CharacterDetailRecord` fits. */
export interface StartOfQuestCutTarget {
  readonly type: string;
  readonly classes: readonly string[];
  readonly detail?: { readonly characterTags?: readonly string[] } | null;
}

export interface ReadStartOfQuestCutOptions {
  /**
   * Also count a cut that states no timing at all. Only a SHIP's text may: "Reduces cooldown of
   * all specials by 1 turn" has no other trigger to wait for, and read either as a cut at the
   * start or as a shorter cooldown it charges the first special one turn sooner - the one number
   * this timeline reports. Of the 16 ships with a counted cut, 6 state the timing and 10 leave it
   * out, every one of the 10 in this same wording.
   */
  readonly allowUntimed?: boolean;
}

const EFFECT_VERB =
  '(?:boosts?|reduces?|advances?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?|restores?|deals?|cuts?|lowers?|allows?|removes?|inflicts?|protects?|locks?|enables?|launches?)';

/** A new effect after a comma. "..., by 2 turns instead if ..." is NOT one - it stays attached. */
const CLAUSE_SEPARATOR = new RegExp(`,\\s+(?:(?:and|but)\\s+)?(?=${EFFECT_VERB}\\b)`, 'gi');

/** The next effect joined by "and", which ends the text a cut's own condition can sit in. */
const JOINED_EFFECT = new RegExp(`\\s+and\\s+(?=${EFFECT_VERB}\\b)`, 'i');

/** An effect verb that is not itself a cut, so it cannot share a cut's timing. */
const NON_CUT_EFFECT = /\b(?:boosts?|makes?|changes?|increases?|decreases?|adds?|recovers?|heals?|sets?|guarantees?|restores?|deals?|cuts?|lowers?|allows?|removes?|inflicts?|protects?|locks?|enables?|launches?)\b/i;

/*
 * The cut. Every stated amount in the shipped text uses one of four phrasings:
 *
 *   "Reduces Special Cooldown of <scope> by N turns"    Captains, crewmates, potentials, ships
 *   "Reduces cooldown of <scope> specials by N turns"   ships: "all specials", "Shooter specials"
 *   "Reduces character's Special charge time by N ..."  the newer Cooldown Reduction potential
 *   "advances Special Cooldown of <scope> to MAX"       the whole cooldown
 *
 * `(?!\d|\s*%|\s*-\s*\d)` refuses "by 50% of Max Cooldown" and "by 1-3 turns".
 */
const CUT_PATTERN =
  /\b(?:reduces?|advances?)\s+(?:the\s+)?(?:(?<owner>[a-z]+(?:\s+[a-z]+)?)(?:'s|’s)\s+)?(?:special\s+(?:cooldown|charge\s+time)|cooldown)(?:\s+of\s+(?<scope>[^.;]+?))?\s+(?:by\s+(?<turns>\d+)(?!\d|\s*%|\s*-\s*\d)(?:\s+turns?)?|(?<full>to\s+max|completely))\b/gi;

/** The same timing, ending in a colon that introduces a list of effects. */
const TIMING_HEADER = new RegExp(`${START_OF_FIGHT_EFFECT_PATTERN.source}\\s*:\\s*`, 'i');

/** ", by 3 turns instead if ..." - an alternative amount under a condition. */
const INSTEAD_RIDER = /,\s*(?:or\s+)?by\s+\d+\s+turns?\s+instead\b[^,.;]*/gi;

/** A condition that gates everything after it in the sentence. */
const LEADING_CONDITION = /^(?:(?:and|but|or)\s+)?(?:if|when|whenever|once|after|while|unless|during|each\s+time|every\s+time|as\s+long\s+as)\b/i;

/** A condition or an alternative inside a cut's own words. */
const INLINE_CONDITION = /\b(?:if|when|whenever|unless|while|instead|depending|for\s+each|per)\b/i;

/*
 * The labels a text is split into. A ship's "Special:" is the special it activates, with its own
 * cooldown - never a cut at the start.
 */
const SECTION_LABEL =
  /^(Always Active|Standard Captain|Base Ability|Default Ability|Boosted Ability(?:\s+\d+)?|Action|Special Captain Ability|(?:ACTIVATED\s+)?Special|Gear\s+\d+(?:\s*-\s*[A-Za-z]+)?(?:\s+Captain)?|[A-Z][A-Za-z']*(?:\s+[A-Z][A-Za-z']*){0,2}\s+Captain)\s*:\s*/;

const SCOPE_ALL = new Set(['all', 'crew', 'the crew', 'your crew']);
const SCOPE_ALL_OTHERS = new Set(['all other']);
/** "of this character", and the potential's "character's Special charge time". */
const SELF_SCOPE = /^(?:(?:this|the)\s+(?:character|unit)|character|itself|self|own)$/i;

export function readStartOfQuestCooldownCuts(
  text: string | null | undefined,
  options: ReadStartOfQuestCutOptions = {},
): StartOfQuestCooldownCut[] {
  const normalized = normalizeHtmlToText(text);

  if (!normalized) {
    return [];
  }

  return selectStartOfQuestSentences(splitSentences(normalized)).flatMap((sentence) =>
    readSentenceCuts(sentence, options),
  );
}

/**
 * Whether a cut reaches a team member. `isSource` is true for the unit whose text it is, which
 * "this character" means and "all other characters" leaves out.
 *
 * A listed scope is a union - "[QCK], Fighter and Free Spirit characters" reaches a unit that is
 * any of them, and a dual-Type unit when either Type is listed - which is how Captain Coverage's
 * tier filter reads the same lists.
 */
export function startOfQuestCutReaches(
  cut: StartOfQuestCooldownCut,
  target: StartOfQuestCutTarget,
  isSource: boolean,
): boolean {
  const { scope } = cut;

  if (scope.kind === 'all') {
    return true;
  }

  if (scope.kind === 'allOthers') {
    return !isSource;
  }

  if (scope.kind === 'self') {
    return isSource;
  }

  const targetTypes = target.type.split(',').map((entry) => entry.trim().toUpperCase());
  const targetClasses = target.classes.map((entry) => entry.toLowerCase());
  const targetTags = (target.detail?.characterTags ?? []).map(normalizeCaptainTagKey);

  return (
    scope.types.some((type) => targetTypes.includes(type)) ||
    scope.classes.some((characterClass) => targetClasses.includes(characterClass.toLowerCase())) ||
    scope.tags.some((tag) => targetTags.includes(tag))
  );
}

/** On "." and ";" - except a decimal point, which has a digit on BOTH sides ("by 1.5x"). */
function splitSentences(text: string): string[] {
  return text
    .split(/\.(?!\d)|(?<!\d)\.|;/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * The sentences in force at the start of the fight: everything before the first label, plus the
 * "Always Active", "Base Ability" / "Default Ability", and "Standard Captain" sections - or, with
 * no "Standard Captain", the first Captain branch ("Sheathed Captain", "Base Captain").
 */
function selectStartOfQuestSentences(sentences: string[]): string[] {
  const labelled = sentences.map((sentence) => {
    const match = SECTION_LABEL.exec(sentence);

    return match
      ? { label: (match[1] ?? '').toLowerCase(), text: sentence.slice(match[0].length) }
      : { label: null, text: sentence };
  });
  const hasStandardCaptain = labelled.some((entry) => entry.label === 'standard captain');
  let section: string | null = null;
  let firstCaptainBranch: string | null = null;

  return labelled
    .filter((entry) => {
      if (entry.label !== null) {
        section = entry.label;

        if (firstCaptainBranch === null && /captain$/.test(section)) {
          firstCaptainBranch = section;
        }
      }

      return isStartOfQuestSection(section, hasStandardCaptain, firstCaptainBranch);
    })
    .map((entry) => entry.text);
}

function isStartOfQuestSection(
  section: string | null,
  hasStandardCaptain: boolean,
  firstCaptainBranch: string | null,
): boolean {
  if (
    section === null ||
    section === 'always active' ||
    section === 'base ability' ||
    section === 'default ability' ||
    section === 'standard captain'
  ) {
    return true;
  }

  return (
    !hasStandardCaptain &&
    /captain$/.test(section) &&
    !/^(?:gear\s|powered up|rampage)/.test(section) &&
    section === firstCaptainBranch
  );
}

function readSentenceCuts(
  sentence: string,
  options: ReadStartOfQuestCutOptions,
): StartOfQuestCooldownCut[] {
  // "..., and launches the following effect at start of fight: reduces ..., reduces ..." - the
  // colon times every effect after it in the sentence, and nothing before it.
  const header = TIMING_HEADER.exec(sentence);

  if (!header) {
    return readClauseCuts(sentence, false, options);
  }

  return [
    ...readClauseCuts(sentence.slice(0, header.index), false, options),
    ...readClauseCuts(sentence.slice(header.index + header[0].length), true, options),
  ];
}

function readClauseCuts(
  text: string,
  timedByHeader: boolean,
  options: ReadStartOfQuestCutOptions,
): StartOfQuestCooldownCut[] {
  // "by 2 turns, by 3 turns instead if they are a Free Spirit character, at the start of the
  // fight" keeps the amount that holds without the condition, as the Captain boost grammar does.
  const body = text.trim().replace(INSTEAD_RIDER, '');

  if (!body || LEADING_CONDITION.test(body)) {
    return [];
  }

  const clauses = body.split(CLAUSE_SEPARATOR);
  const cuts: StartOfQuestCooldownCut[] = [];

  clauses.forEach((clause, index) => {
    if (index > 0 && endsInCondition(clauses[index - 1] ?? '')) {
      return;
    }

    for (const match of clause.matchAll(CUT_PATTERN)) {
      const rest = clause.slice((match.index ?? 0) + match[0].length);
      const ownWords = ownWordsOf(rest);

      if (INLINE_CONDITION.test(ownWords)) {
        continue;
      }

      const timed =
        timedByHeader ||
        START_OF_FIGHT_EFFECT_PATTERN.test(ownWords) ||
        sharesLaterTiming(rest) ||
        sharesListTiming(clauses.slice(index + 1)) ||
        options.allowUntimed === true;
      const scope = timed
        ? readScope(match.groups?.['scope'] ?? match.groups?.['owner'] ?? null)
        : null;
      const turns = match.groups?.['full'] ? null : Number(match.groups?.['turns']);

      if (scope && (turns === null || turns > 0)) {
        cuts.push({ turns, scope });
      }
    }
  });

  return cuts;
}

/** A cut's own words: up to the next comma, or up to the next effect joined by "and". */
function ownWordsOf(rest: string): string {
  const words = rest.replace(/^\s*,\s*/, '').split(JOINED_EFFECT)[0] ?? '';

  return words.split(',')[0] ?? '';
}

/**
 * "Reduces Special Cooldown of all characters by 2 turns and advances Special Cooldown of this
 * character to MAX at the start of the fight": the timing at the end covers both cuts, because
 * nothing but another cut stands between them.
 */
function sharesLaterTiming(rest: string): boolean {
  const timing = START_OF_FIGHT_EFFECT_PATTERN.exec(rest);

  if (!timing) {
    return false;
  }

  const between = rest.slice(0, timing.index);

  return !NON_CUT_EFFECT.test(between) && !INLINE_CONDITION.test(between);
}

/**
 * "Reduces crew's current HP by 25%, reduces Special Cooldown of all characters by 3 turns, and
 * reduces Switch Effect of this character by 3 at the start of the fight": a list of reductions
 * that ends in the timing shares it. Anything but another reduction ends the list.
 */
function sharesListTiming(laterClauses: readonly string[]): boolean {
  for (const clause of laterClauses) {
    if (!/^(?:reduces?|advances?)\b/i.test(clause.trim()) || INLINE_CONDITION.test(clause)) {
      return false;
    }

    if (START_OF_FIGHT_EFFECT_PATTERN.test(clause)) {
      return true;
    }
  }

  return false;
}

/**
 * "..., and if your crew has 6 Slasher characters, reduces ..." - the condition sits before the
 * comma.
 */
function endsInCondition(previousClause: string): boolean {
  const lastFragment = previousClause.split(',').at(-1) ?? '';

  return LEADING_CONDITION.test(lastFragment.trim());
}

function readScope(rawScope: string | null): StartOfQuestCutScope | null {
  if (rawScope === null) {
    return null;
  }

  const target = rawScope
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(?:'s|’s)$/i, '')
    .replace(/\s+specials?$/i, '');

  // Before the plural is dropped: "this character" must not become "this".
  if (SELF_SCOPE.test(target)) {
    return { kind: 'self' };
  }

  const core = target.replace(/\s+(?:characters?|units?|crewmates?)$/i, '').trim();
  const lowered = core.toLowerCase();

  if (lowered === 'ship' || lowered === 'the ship') {
    return null;
  }

  if (SCOPE_ALL.has(lowered)) {
    return { kind: 'all' };
  }

  if (SCOPE_ALL_OTHERS.has(lowered)) {
    return { kind: 'allOthers' };
  }

  const types: AutoTeamBuilderType[] = [];
  const classes: string[] = [];
  const tags: string[] = [];
  const items = core.split(/\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/).filter(Boolean);

  for (const item of items) {
    const bare = item.replace(/^\[(.+)\]$/, '$1').trim();
    const type = AUTO_TEAM_BUILDER_TYPES.find((candidate) => candidate === bare.toUpperCase());
    const characterClass = AUTO_TEAM_BUILDER_CLASSES.find(
      (candidate) => candidate.toLowerCase() === bare.toLowerCase(),
    );

    if (type) {
      types.push(type);
    } else if (characterClass) {
      classes.push(characterClass);
    } else if (/^\[.+\]$/.test(item)) {
      tags.push(normalizeCaptainTagKey(item));
    } else {
      return null;
    }
  }

  return items.length ? { kind: 'listed', types, classes, tags } : null;
}

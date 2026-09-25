import { normalizeHtmlToText } from '../../core/services/html-text.utils';

/**
 * 869f63gz3. What a support fires by itself, and when: its Auto+ clause, read into parts.
 *
 * Since the AUTO update of February 2026 a support can fire the supported character's Special,
 * Super Effect or Switch Effect by itself - on reaching a stage, or when an enemy does something -
 * and a support can also keep one from firing. The community database appends that to the support's
 * own text, after a bold marker:
 *
 *   ... reduces enemies' Resilience duration by 3 turns. <b>[AUTO+]</b> When an enemy has a Barrier,
 *   activates supported character's Super Effect. When you reach the final stage, activates
 *   supported character's Special.
 *
 * Measured on the shipped seed, 2026-09-25: 42 supports on 42 characters carry one, in 13 distinct
 * phrasings once the stage numbers are set aside, always at the END of the text, one instruction
 * per sentence.
 *
 * The ability parser strips this clause on purpose (`addSupportEnemyEffectReductionKeys` in
 * `scripts/auto-team-builder-ability-parser.mjs`): it is a trigger, not the support's own action,
 * and must not become a support tag. This reads it for the Character screen only and changes
 * nothing a builder reads.
 *
 * One sentence is one reading. A sentence this does not recognise comes back as its own text,
 * whole - never dropped, never guessed at. Only the shapes below are read: a new trigger, a status
 * written another way, or triggers joined some other way all fall back, because a wrong "fires by
 * itself" is worse than the dataset's own English.
 */

/** The part of the supported character that Auto+ fires, or keeps from firing. */
export type SupportAutoPlusEffect = 'Special' | 'Super Effect' | 'Switch Effect';

export type SupportAutoPlusTrigger =
  | { readonly kind: 'stage'; readonly stage: number }
  | { readonly kind: 'final-stage' }
  | { readonly kind: 'enemy-barrier' }
  /** "When an enemy inflicts you with ATK Down or Paralysis" - any one of the statuses. */
  | { readonly kind: 'enemy-inflicts'; readonly statuses: readonly string[] }
  /** "When an enemy applies Territory", and "When enemy launches DEF Up status". */
  | { readonly kind: 'enemy-applies'; readonly status: string };

export type SupportAutoPlusReading =
  | {
      /** `never-fires` is "Does not activate supported character's Special" - no trigger. */
      readonly kind: 'fires' | 'never-fires';
      readonly triggers: readonly SupportAutoPlusTrigger[];
      /** `any`: one trigger is enough. `all`: they hold together. Null for one trigger, or none. */
      readonly join: 'any' | 'all' | null;
      readonly effects: readonly SupportAutoPlusEffect[];
      readonly source: string;
    }
  | { readonly kind: 'unrecognised'; readonly source: string };

const AUTO_PLUS_MARKER = /\[AUTO\+\]/iu;
const FIRES = /^When (.+), activates (?:the )?supported character's (.+?)\.?$/iu;
const NEVER_FIRES = /^Does not activate (?:the )?supported character's (.+?)\.?$/iu;
/** A status as the game spells one: capitalised words - "ATK Down", "Paralysis", "DEF Up". */
const STATUS_NAME = /^[A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)*$/u;
const EFFECTS_BY_NAME = new Map<string, SupportAutoPlusEffect>([
  ['special', 'Special'],
  ['super effect', 'Super Effect'],
  ['switch effect', 'Switch Effect'],
]);

/**
 * Every Auto+ instruction in one support description, in order. Takes the text as the dataset
 * holds it - markup and all - and reads it after the app's own HTML-to-text normaliser.
 */
export function readSupportAutoPlus(description: string | null | undefined): SupportAutoPlusReading[] {
  const [, ...clauses] = normalizeHtmlToText(description).split(AUTO_PLUS_MARKER);

  return clauses.flatMap((clause) => splitSentences(clause)).map((sentence) => readSentence(sentence));
}

function splitSentences(clause: string): string[] {
  return clause
    .split(/(?<=\.)\s+(?=[A-Z])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function readSentence(sentence: string): SupportAutoPlusReading {
  const neverFires = NEVER_FIRES.exec(sentence);

  if (neverFires) {
    const effects = readEffects(neverFires[1] ?? '');

    return effects
      ? { kind: 'never-fires', triggers: [], join: null, effects, source: sentence }
      : { kind: 'unrecognised', source: sentence };
  }

  const fires = FIRES.exec(sentence);
  const triggers = fires ? readTriggers(fires[1] ?? '') : null;
  const effects = fires ? readEffects(fires[2] ?? '') : null;

  return triggers && effects
    ? { kind: 'fires', ...triggers, effects, source: sentence }
    : { kind: 'unrecognised', source: sentence };
}

function readTriggers(
  expression: string,
): { triggers: SupportAutoPlusTrigger[]; join: 'any' | 'all' | null } | null {
  const joins = [
    [/\s+or\s+when\s+/iu, 'any'],
    [/\s+and\s+(?:when\s+)?/iu, 'all'],
  ] as const;

  for (const [separator, join] of joins) {
    const parts = expression.split(separator);

    if (parts.length > 1) {
      const triggers = parts.map((part) => readTrigger(part));

      return triggers.every((trigger) => trigger !== null)
        ? { triggers: triggers as SupportAutoPlusTrigger[], join }
        : null;
    }
  }

  const trigger = readTrigger(expression);

  return trigger ? { triggers: [trigger], join: null } : null;
}

function readTrigger(part: string): SupportAutoPlusTrigger | null {
  const text = part.trim().replace(/^when\s+/iu, '');
  const stage = /^you reach the (\d{1,2})(?:st|nd|rd|th) stage$/iu.exec(text);

  if (stage) {
    const number = Number(stage[1]);

    return number > 0 ? { kind: 'stage', stage: number } : null;
  }

  if (/^(?:you reach the final stage|at (?:the )?final (?:stage|battle))$/iu.test(text)) {
    return { kind: 'final-stage' };
  }

  if (/^an? enemy has an? Barrier$/iu.test(text)) {
    return { kind: 'enemy-barrier' };
  }

  const inflicts = /^an? enemy inflicts you with (.+)$/iu.exec(text);

  if (inflicts) {
    const statuses = (inflicts[1] ?? '').split(/\s+or\s+/iu);

    return statuses.every((status) => STATUS_NAME.test(status))
      ? { kind: 'enemy-inflicts', statuses }
      : null;
  }

  const applies = /^(?:an? )?enemy (?:applies (.+)|launches (.+) status)$/iu.exec(text);
  const status = applies ? (applies[1] ?? applies[2] ?? '') : '';

  return applies && STATUS_NAME.test(status) ? { kind: 'enemy-applies', status } : null;
}

function readEffects(text: string): SupportAutoPlusEffect[] | null {
  const effects = text
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/iu)
    .map((name) => EFFECTS_BY_NAME.get(name.trim().toLowerCase()));

  return effects.length > 0 && effects.every((effect) => effect !== undefined)
    ? (effects as SupportAutoPlusEffect[])
    : null;
}

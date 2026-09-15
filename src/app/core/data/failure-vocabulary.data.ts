/**
 * What the app says when something fails, in one place.
 *
 * 869f135ra. 19 of 22 pages catch their own exceptions, 38 of those catches
 * reach the player, and every one of them phrased failure its own way. An error
 * message is the only part of the app a player reads carefully, because they are
 * stuck - and if each screen words it differently they cannot build a mental
 * model of what this app does when things go wrong. The report then arrives as
 * "it broke", which is not a report anybody can act on.
 *
 * This is a shared VOCABULARY, not a shared component. The pages keep their own
 * feedback surfaces - a panel on Settings, a toast on Saved Teams - and draw the
 * words from here, so the sentences match without the screens having to.
 *
 * Every failure says three things, in this order:
 *
 *   1. WHAT happened, in the player's words.
 *   2. WHETHER THEIR DATA IS SAFE. Never left to inference.
 *   3. THE ONE THING TO TRY. Exactly one, and something they can actually do.
 *
 * Part 2 is the one that did not exist before, and it is the reason the subtask
 * singles out storage failures: "Browser storage is full, so the saved teams
 * could not be stored" leaves a player genuinely unsure whether the teams they
 * already had are still there. They are. Saying so costs one sentence.
 *
 * `dataSafety` is a property of the FAILURE, not of the screen, which is why it
 * lives here rather than at the call site:
 *
 *   safe     nothing on the device changed - a read failed, or input was rejected
 *            before anything was written.
 *   lost     the thing being written did not get written. What was already there
 *            is untouched - that is the half players assume the worst about.
 *   partial  some of it landed. Only for operations that genuinely apply in
 *            pieces, never as a hedge when nobody checked.
 *
 * The copy lives in the `failures` i18n namespace so both languages move
 * together, and `npm run test:failure-vocabulary` fails when a family is missing
 * a part in either language, or when a page builds an error message without
 * going through this.
 */

/** Whether the player's data survived the failure. Never inferred at a call site. */
export type FailureDataSafety = 'safe' | 'lost' | 'partial';

export interface FailureFamily {
  /** Stable id, and the i18n key under `failures.what` and `failures.action`. */
  readonly id: string;
  readonly dataSafety: FailureDataSafety;
  /**
   * Why this family exists rather than being folded into another. A family that
   * cannot answer this is a duplicate, and duplicates are how the vocabulary
   * drifts back into 38 different phrasings.
   */
  readonly note: string;
}

export const FAILURE_FAMILIES: readonly FailureFamily[] = [
  {
    id: 'invalidFile',
    dataSafety: 'safe',
    note: 'The file is not readable as an export at all - malformed JSON, or not JSON. Rejected before anything is touched.',
  },
  {
    id: 'unsupportedPayload',
    dataSafety: 'safe',
    note: 'The file parsed but is not a shape this screen imports. Distinct from invalidFile because the fix is different: the player picked a real export, just the wrong kind.',
  },
  {
    id: 'nothingUsable',
    dataSafety: 'safe',
    note: 'The file was read and understood and contained nothing to import. Distinct again, because nothing is wrong with the file - it is empty, and telling the player it is "invalid" would send them looking for a fault that is not there.',
  },
  {
    id: 'storageQuota',
    dataSafety: 'lost',
    note: 'Browser storage is full. The write did not happen; everything already stored is untouched, which is exactly what a player cannot tell from "storage is full".',
  },
  {
    id: 'storageUnavailable',
    dataSafety: 'lost',
    note: 'The browser refuses storage - a private window, or site data blocked. Same data outcome as quota, different action, so it stays its own family.',
  },
  {
    id: 'saveFailed',
    dataSafety: 'lost',
    note: 'A write failed for a reason that is not storage capacity or permission.',
  },
  {
    id: 'loadFailed',
    dataSafety: 'safe',
    note: 'Something could not be read. Nothing was written, so the stored copy is intact.',
  },
  {
    id: 'partialImport',
    dataSafety: 'partial',
    note: 'An import applied some rows and skipped others. The only family that may claim `partial`, and only where the code really does apply in pieces.',
  },
  {
    id: 'recognitionFailed',
    dataSafety: 'safe',
    note: 'A screenshot could not be read into characters. Nothing is stored until the player confirms, so their box is untouched.',
  },
  {
    id: 'buildFailed',
    dataSafety: 'safe',
    note: 'A team build stopped before finishing. Builds write nothing until a team is saved.',
  },
  {
    id: 'searchTooLarge',
    dataSafety: 'safe',
    note: 'The search exceeded what this browser session can hold. Its own family because the action is specific and useful - narrow the filters - rather than "try again", which would fail identically.',
  },
  {
    id: 'offline',
    dataSafety: 'safe',
    note: '869f135r8. The reader has no connection. Checked FIRST, before anything else is classified, because every other family would otherwise describe a symptom of this one - a Drive upload that cannot reach Google is not a save that failed, and telling the reader to try again is advice that cannot work until the connection returns.',
  },
  {
    id: 'unexpected',
    dataSafety: 'safe',
    note: 'The fallback. Claims `safe` because every write path in this app has a named family above; a failure that reaches here did not get as far as writing. If that ever stops being true, the failure needs a family, not a change to this note.',
  },
];

/**
 * The family every unclassified failure lands in. Exported as a value rather than
 * looked up, so the composer has a fallback the type system can see is present -
 * a lookup that might return `undefined` inside an error handler is how a bad
 * message becomes no message.
 */
export const UNEXPECTED_FAILURE_FAMILY: FailureFamily = {
  dataSafety: 'safe',
  id: 'unexpected',
  note: 'The fallback. Claims `safe` because every write path in this app has a named family above; a failure that reaches here did not get as far as writing. If that ever stops being true, the failure needs a family, not a change to this note.',
};

const FAMILY_BY_ID = new Map(FAILURE_FAMILIES.map((family) => [family.id, family]));

export function findFailureFamily(id: string): FailureFamily | null {
  return FAMILY_BY_ID.get(id) ?? null;
}

export const FAILURE_FAMILY_IDS: readonly string[] = FAILURE_FAMILIES.map((family) => family.id);

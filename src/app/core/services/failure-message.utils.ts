import {
  UNEXPECTED_FAILURE_FAMILY,
  type FailureDataSafety,
  type FailureFamily,
  findFailureFamily,
} from '../data/failure-vocabulary.data';
import { classifyBrowserStorageFailure } from './browser-storage-error.utils';
import { isBrowserOffline } from './network-status.service';

/**
 * Composes the three sentences a failure owes the player.
 *
 * 869f135ra. The vocabulary is in `failure-vocabulary.data.ts`; this turns a
 * family into the words, in the reader's language, in the fixed order: what
 * happened, whether their data is safe, the one thing to try.
 *
 * A function rather than a component on purpose. The pages keep their own
 * feedback surfaces - a panel on Settings, an inline block on Saved Teams - and
 * a shared component would have meant rebuilding all of them to change the
 * words. What has to match is the sentences, not the markup.
 */

export const FAILURE_I18N_SCOPE = 'failures';

/** Matches the app's own `I18nService.translate` signature, so a page can pass it straight through. */
export type TranslateFn = (
  key: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  scope?: string,
) => string;

export interface FailureMessage {
  readonly familyId: string;
  readonly dataSafety: FailureDataSafety;
  readonly what: string;
  readonly safety: string;
  readonly action: string;
  /** The three parts in order, ready to drop into a feedback surface's details. */
  readonly lines: readonly string[];
}

/**
 * The family a thrown value belongs to.
 *
 * Storage failures are classified by the existing
 * `classifyBrowserStorageFailure`, which already reads the DOMException names
 * and codes browsers actually use, rather than by a second guess at the same
 * thing. Everything else falls to `unexpected`, and a caller that knows better
 * passes its own family - which is most of them, because the call site usually
 * knows it is an import rather than a save.
 */
export function classifyFailure(error: unknown): string {
  /*
   * 869f135r8. Offline is checked FIRST, and deliberately before the error is
   * examined at all.
   *
   * Every other family would otherwise describe a symptom of this one: a Drive
   * upload that cannot reach Google is not "a save that failed", and "try again"
   * is advice that cannot work until the connection comes back. The reader is
   * owed the cause, not the nearest thing to it.
   */
  if (isBrowserOffline()) {
    return 'offline';
  }

  const storage = classifyBrowserStorageFailure(error);

  if (storage === 'BROWSER_STORAGE_QUOTA_EXCEEDED') {
    return 'storageQuota';
  }
  if (storage === 'BROWSER_STORAGE_UNAVAILABLE') {
    return 'storageUnavailable';
  }

  return 'unexpected';
}

/**
 * The family to use when the call site knows what it was DOING but not what went
 * wrong.
 *
 * A saved-team import can fail because the file is malformed, or because the
 * browser refused to store the result - and those owe the reader different
 * sentences, including different answers to "is my data safe". The call site
 * passes what it was attempting; a storage failure overrides it, because that is
 * the one the error itself can prove.
 */
export function resolveFailureFamily(error: unknown, attempted: string): string {
  const classified = classifyFailure(error);

  return classified === 'unexpected' ? attempted : classified;
}

/**
 * Never throws on an unknown family, and never silently substitutes one either:
 * an id that is not in the vocabulary resolves to `unexpected`, which is a real
 * message the player can act on. The guard is what stops an unknown id existing
 * in the first place, and a runtime crash inside an error handler would replace
 * a bad message with no message.
 */
export function buildFailureMessage(familyId: string, translate: TranslateFn): FailureMessage {
  const family: FailureFamily = findFailureFamily(familyId) ?? UNEXPECTED_FAILURE_FAMILY;

  const what = translate(`what.${family.id}`, undefined, FAILURE_I18N_SCOPE);
  const safety = translate(`safety.${family.dataSafety}`, undefined, FAILURE_I18N_SCOPE);
  const action = translate(`action.${family.id}`, undefined, FAILURE_I18N_SCOPE);

  return {
    action,
    dataSafety: family.dataSafety,
    familyId: family.id,
    lines: [what, safety, action],
    safety,
    what,
  };
}

/**
 * The three parts, plus any detail the screen can add that the vocabulary cannot
 * know - the name of the row that was skipped, the count that did not import.
 *
 * The extra detail goes AFTER what happened and BEFORE the safety sentence, so
 * the last thing the player reads is still the thing to do. A message that ends
 * on a technical detail ends on the part they cannot act on.
 */
export function buildFailureLines(
  familyId: string,
  translate: TranslateFn,
  detail?: string | readonly string[] | null,
): readonly string[] {
  const message = buildFailureMessage(familyId, translate);
  const extras = (Array.isArray(detail) ? detail : detail ? [detail] : []).filter(
    (line): line is string => typeof line === 'string' && line.trim().length > 0,
  );

  return [message.what, ...extras, message.safety, message.action];
}

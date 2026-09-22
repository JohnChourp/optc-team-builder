import { type WhatsNewEntry } from '../../core/data/whats-new.data';

/**
 * 201 entries in one list, and the two questions a player actually arrives with.
 *
 * 869f13gaq. The modal listed every version, newest first, unbounded. A player
 * opening it wants one of two things - what changed since they last looked, or what
 * changed recently - and a reverse-chronological list of 201 entries serves neither.
 * It gets worse on its own, too: measured 2026-09-22, the nightly upstream-data
 * chain shipped 66 releases in a fortnight, which is 4.7 entries a day that nobody
 * asked for.
 *
 * The whole history stays. Nothing is dropped, nothing below the newest entry is
 * regenerated, and "show older" reaches every version back to 0.0.1 - that rule is
 * correct and this does not touch it. Only the READING changes.
 *
 * Kept as a pure function rather than living in the component because the partition
 * is the part with edge cases - an unknown stored version, a reader who has never
 * opened the modal, a stored version newer than the build after a downgrade - and
 * those are worth asserting without a TestBed.
 */

/** Entries newer than the version the reader last had open, in list order. */
export interface WhatsNewPartition {
  /** Shipped since `lastSeenVersion`. Empty when the reader is up to date. */
  readonly unseen: readonly WhatsNewEntry[];
  /** Shown expanded under the divider: the most recent entries the reader has seen. */
  readonly recent: readonly WhatsNewEntry[];
  /** Everything else, behind "show older". Never dropped. */
  readonly older: readonly WhatsNewEntry[];
}

/**
 * How many already-seen entries stay expanded.
 *
 * Small on purpose. At 4.7 releases a day even a week away puts ~33 entries in
 * `unseen`, and those are shown in full; `recent` exists so the modal is not empty
 * for a reader who is already up to date, not to reproduce the unbounded list.
 */
export const RECENT_ENTRY_COUNT = 5;

/**
 * `lastSeenVersion` is matched by EQUALITY against the entry list, never parsed and
 * compared as a number.
 *
 * Two-digit segments and a 0.0.100 that shipped before the cap was enforced make
 * semver ordering here a way to be quietly wrong; the entry list is already in
 * release order, so the index of the stored version is the answer. A version that
 * is not in the list - a downgrade, a hand-edited value, a build older than the
 * stored one - finds no index, and then everything is `unseen`, which is the safe
 * direction: the reader sees more than they needed rather than missing something.
 */
export function partitionWhatsNewEntries(
  entries: readonly WhatsNewEntry[],
  lastSeenVersion: string | null,
  recentCount: number = RECENT_ENTRY_COUNT,
): WhatsNewPartition {
  const seenIndex = lastSeenVersion
    ? entries.findIndex((entry) => entry.version === lastSeenVersion)
    : -1;

  /*
   * A reader who has never opened the modal has seen nothing, and telling them all
   * 201 entries are new is true but useless. They get the normal recent/older split
   * with no divider at all.
   */
  const unseen = seenIndex > 0 ? entries.slice(0, seenIndex) : [];
  const rest = entries.slice(unseen.length);

  return {
    unseen,
    recent: rest.slice(0, Math.max(0, recentCount)),
    older: rest.slice(Math.max(0, recentCount)),
  };
}

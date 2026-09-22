import { describe, expect, it } from 'vitest';

import { type WhatsNewEntry } from '../../core/data/whats-new.data';
import { RECENT_ENTRY_COUNT, partitionWhatsNewEntries } from './whats-new-partition.utils';

/**
 * 869f13gaq. The partition is where every edge case lives, so each one is a case
 * here rather than a branch nobody ever runs.
 *
 * The invariant asserted in every case: nothing is lost. `unseen + recent + older`
 * is the original list, in order. The history is permanent and "collapse" must never
 * become "drop" - that is the one way this change could do real harm.
 */
const entry = (version: string): WhatsNewEntry =>
  ({
    version,
    date: '2026-09-22',
    userVisible: true,
    headline: { en: version, el: version },
    summaryEn: version,
    summaryEl: version,
    added: [],
    improved: [],
    fixed: [],
  }) as WhatsNewEntry;

const list = ['0.6.2', '0.6.1', '0.6.0', '0.5.6', '0.5.5', '0.5.4', '0.5.3', '0.5.2'].map(entry);

function expectNothingLost(parts: ReturnType<typeof partitionWhatsNewEntries>) {
  expect([...parts.unseen, ...parts.recent, ...parts.older]).toEqual(list);
}

describe('partitionWhatsNewEntries', () => {
  it('puts everything shipped since the stored version above the divider', () => {
    const parts = partitionWhatsNewEntries(list, '0.5.6');

    expect(parts.unseen.map((e) => e.version)).toEqual(['0.6.2', '0.6.1', '0.6.0']);
    expectNothingLost(parts);
  });

  it('leaves the divider empty for a reader who is already up to date', () => {
    const parts = partitionWhatsNewEntries(list, '0.6.2');

    expect(parts.unseen).toEqual([]);
    expect(parts.recent).toHaveLength(RECENT_ENTRY_COUNT);
    expectNothingLost(parts);
  });

  /*
   * Never opened it: true that all 201 are new, useless to say so. No divider,
   * normal split.
   */
  it('shows no divider when nothing was ever stored', () => {
    const parts = partitionWhatsNewEntries(list, null);

    expect(parts.unseen).toEqual([]);
    expect(parts.recent.map((e) => e.version)).toEqual(['0.6.2', '0.6.1', '0.6.0', '0.5.6', '0.5.5']);
    expectNothingLost(parts);
  });

  /*
   * A stored version this build has never heard of - a downgrade, a hand-edited
   * value, an import from a newer device. Finding no index must not silently behave
   * like "up to date", because that hides entries.
   */
  it('treats an unknown stored version as never-seen rather than as up to date', () => {
    const parts = partitionWhatsNewEntries(list, '9.9.9');

    expect(parts.unseen).toEqual([]);
    expect(parts.recent).toHaveLength(RECENT_ENTRY_COUNT);
    expectNothingLost(parts);
  });

  it('keeps every entry reachable however the list is cut', () => {
    for (const seen of [null, '9.9.9', ...list.map((e) => e.version)]) {
      expectNothingLost(partitionWhatsNewEntries(list, seen));
    }
  });

  it('survives a list shorter than the recent count', () => {
    const short = list.slice(0, 2);
    const parts = partitionWhatsNewEntries(short, null);

    expect(parts.recent).toEqual(short);
    expect(parts.older).toEqual([]);
  });
});

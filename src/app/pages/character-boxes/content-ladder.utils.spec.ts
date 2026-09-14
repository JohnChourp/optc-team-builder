import { describe, expect, it } from 'vitest';

import { type ContentLadderMilestone } from '../../core/data/content-ladder.data';
import { type CharacterListItem } from '../../core/models/optc.models';
import { buildContentLadderReport } from './content-ladder.utils';

function character(
  id: number,
  overrides: Partial<CharacterListItem> = {},
): CharacterListItem {
  return { id, name: `C${id}`, stars: 5, type: 'STR', classes: ['Fighter'], ...overrides } as CharacterListItem;
}

function box(size: number, overrides: Partial<CharacterListItem> = {}): CharacterListItem[] {
  return Array.from({ length: size }, (_, index) => character(index + 1, overrides));
}

function milestone(
  id: string,
  requirement: ContentLadderMilestone['requirement'],
): ContentLadderMilestone {
  return {
    id,
    group: 'Story Island',
    stage: 'Syrup Village',
    requirement,
    curatedOn: '2026-09-14',
    sourceNote: 'A note long enough to be a note rather than a placeholder for these tests.',
  };
}

describe('content ladder report', () => {
  it('returns nothing without a box', () => {
    expect(buildContentLadderReport(null)).toBeNull();
    expect(buildContentLadderReport(undefined)).toBeNull();
  });

  it('calls a met requirement ready, with nothing missing', () => {
    const report = buildContentLadderReport(box(6), [milestone('a', { teamSize: 6 })]);

    expect(report?.entries[0]).toMatchObject({ verdict: 'ready', shortBy: 0, missing: [] });
    expect(report?.readyCount).toBe(1);
    expect(report?.nextGoal).toBeNull();
  });

  /* "One unit away" is the brief's own phrase and it means exactly one character. */
  it('calls a requirement one character short "one away"', () => {
    const report = buildContentLadderReport(box(5), [milestone('a', { teamSize: 6 })]);

    expect(report?.entries[0]).toMatchObject({ verdict: 'oneAway', shortBy: 1 });
    expect(report?.entries[0].missing).toEqual(['teamSize:1']);
  });

  it('calls anything further away not close', () => {
    const report = buildContentLadderReport(box(2), [milestone('a', { teamSize: 6 })]);

    expect(report?.entries[0]).toMatchObject({ verdict: 'notClose', shortBy: 4 });
  });

  /*
   * The boundary, pinned at exactly one. A mutation that widened "one away" to two survived every
   * other test here: 1 and 4 were covered and 2 was not, so the one number the phrase actually
   * means was the one number nothing checked.
   */
  it.each([
    [6, 'ready' as const, 0],
    [5, 'oneAway' as const, 1],
    [4, 'notClose' as const, 2],
  ])('a box of %i is %s, %i short', (size, verdict, shortBy) => {
    const report = buildContentLadderReport(box(size), [milestone('a', { teamSize: 6 })]);

    expect(report?.entries[0]).toMatchObject({ verdict, shortBy });
  });

  it('counts a rarity floor against the box, not against the whole game', () => {
    const characters = [...box(4, { stars: 5 }), ...box(2, { stars: 3 })];
    const report = buildContentLadderReport(characters, [
      milestone('a', { teamSize: 6, minStars: { stars: 5, count: 5 } }),
    ]);

    expect(report?.entries[0]).toMatchObject({ verdict: 'oneAway', shortBy: 1 });
    expect(report?.entries[0].missing).toEqual(['minStars:5:1']);
  });

  /*
   * One character can satisfy several axes at once, so the shortfall is the LARGEST unmet axis
   * rather than their sum. Adding them would tell the reader they are four characters away when
   * two would do it, which is the kind of overstatement that makes advice worthless.
   */
  it('takes the largest shortfall, never the sum', () => {
    const report = buildContentLadderReport(box(4, { stars: 3, classes: ['Slasher'] }), [
      milestone('a', {
        teamSize: 6,
        minStars: { stars: 5, count: 6 },
        classCounts: { Fighter: 3 },
      }),
    ]);

    // short 2 on size, 6 on rarity, 3 on class - the answer is 6, not 11.
    expect(report?.entries[0].shortBy).toBe(6);
    expect(report?.entries[0].missing).toEqual(['teamSize:2', 'minStars:5:6', 'class:Fighter:3']);
  });

  it('names every unmet part, so the card can say what is missing', () => {
    const report = buildContentLadderReport(box(6, { type: 'QCK', classes: [] }), [
      milestone('a', { teamSize: 6, classCounts: { Fighter: 2 }, typeCounts: { STR: 1 } }),
    ]);

    expect(report?.entries[0].missing).toEqual(['class:Fighter:2', 'type:STR:1']);
  });

  it('points at the first milestone the box cannot field as the next goal', () => {
    const report = buildContentLadderReport(box(4), [
      milestone('easy', { teamSize: 2 }),
      milestone('next', { teamSize: 5 }),
      milestone('later', { teamSize: 6, minStars: { stars: 5, count: 6 } }),
    ]);

    expect(report?.readyCount).toBe(1);
    expect(report?.nextGoal?.milestone.id).toBe('next');
  });

  it('handles an empty box without pretending it can field anything', () => {
    const report = buildContentLadderReport([], [milestone('a', { teamSize: 1 })]);

    expect(report?.boxSize).toBe(0);
    expect(report?.entries[0].verdict).toBe('oneAway');
    expect(report?.readyCount).toBe(0);
  });

  it('survives a character with no classes or stars recorded', () => {
    const report = buildContentLadderReport(
      [{ id: 1, name: 'Unknown' } as CharacterListItem],
      [milestone('a', { teamSize: 1, minStars: { stars: 5, count: 1 }, classCounts: { Fighter: 1 } })],
    );

    expect(report?.entries[0].missing).toEqual(['minStars:5:1', 'class:Fighter:1']);
  });

  it('reads the real shipped ladder without throwing', () => {
    const report = buildContentLadderReport(box(6));

    expect(report?.entries.length).toBeGreaterThan(0);
    expect(report?.entries.every((entry) => entry.milestone.sourceNote.length > 0)).toBe(true);
  });
});

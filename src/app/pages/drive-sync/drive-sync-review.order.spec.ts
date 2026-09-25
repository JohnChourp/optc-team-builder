import { describe, expect, it } from 'vitest';

import { buildDriveSyncReviewDraft, buildReviewedAllDataPayload } from './drive-sync-review.utils';
import { type AllDataTransferPayload } from '../settings/all-data-transfer.utils';
import { type SavedTeam } from '../../core/models/optc.models';

/*
 * 869f6td2j. A reviewed Drive sync keeps the order the reader built.
 *
 * The review rebuilt every list from its rows, and sorted the rows by id first. Saved Teams, which
 * the reader keeps newest-first, came back oldest-first - the ids start with a timestamp - and
 * favourites came back sorted by number, after a Merge that changed nothing at all. Measured
 * before the fix: teams Newest, Middle, Oldest became Oldest, Middle, Newest, and favourites
 * [4551, 201, 1003] became [1003, 201, 4551].
 *
 * The rule now, for every action: this device's order first, then what only Drive has, in Drive's
 * order.
 */

const STAMP = '2026-09-24T10:00:00.000Z';

function team(id: string, name: string): SavedTeam {
  return {
    createdAt: STAMP,
    id,
    name,
    notes: '',
    shipId: null,
    slots: [1001, null, null, null, null, null],
    updatedAt: STAMP,
  };
}

/* Newest-first, as saveTeam writes them; the ids sort the other way round. */
const NEWEST = team('crew-1758441600000-cccccc', 'Newest crew (Sep 21)');
const MIDDLE = team('crew-1757923200000-bbbbbb', 'Middle crew (Sep 15)');
const OLDEST = team('crew-1757404800000-aaaaaa', 'Oldest crew (Sep 9)');
/* In the order they were starred, which is not numeric order either way. */
const FAVOURITES = [4551, 201, 1003];

function payload(teams: SavedTeam[], favourites: number[]): AllDataTransferPayload {
  return {
    exportedAt: STAMP,
    favorites: { characters: favourites.map((number) => ({ name: `Char ${number}`, number })) },
    savedTeams: { exportedAt: STAMP, schemaVersion: 1, source: 'saved-teams', teams },
    schemaVersion: 1,
    source: 'all-data',
  };
}

function teamIds(result: AllDataTransferPayload): string[] | undefined {
  return result.savedTeams?.teams.map((entry) => entry.id);
}

function reviewed(
  local: AllDataTransferPayload,
  drive: AllDataTransferPayload,
  action: 'merge-and-upload' | 'replace-cloud' | 'replace-local',
): AllDataTransferPayload {
  return buildReviewedAllDataPayload(buildDriveSyncReviewDraft(local, drive, action), STAMP);
}

describe('a reviewed Drive sync keeps the order the reader built (869f6td2j)', () => {
  it('keeps Saved Teams newest-first through a Merge that changes nothing', () => {
    const same = payload([NEWEST, MIDDLE, OLDEST], FAVOURITES);
    const draft = buildDriveSyncReviewDraft(same, same, 'merge-and-upload');
    const teamRows = draft.sections.find((section) => section.key === 'savedTeams')?.rows ?? [];

    // 869f6td68. A row's name is its own text, or a phrase to translate - these teams have names.
    expect(teamRows.map((row) => [row.label, row.status])).toEqual([
      [{ text: 'Newest crew (Sep 21)' }, 'kept'],
      [{ text: 'Middle crew (Sep 15)' }, 'kept'],
      [{ text: 'Oldest crew (Sep 9)' }, 'kept'],
    ]);
    expect(teamIds(buildReviewedAllDataPayload(draft, STAMP))).toEqual([
      NEWEST.id,
      MIDDLE.id,
      OLDEST.id,
    ]);
  });

  it('keeps favourites in the order they were starred', () => {
    const same = payload([], FAVOURITES);

    expect(
      reviewed(same, same, 'merge-and-upload').favorites?.characters.map((entry) => entry.number),
    ).toEqual(FAVOURITES);
  });

  it("adds what only Drive has after this device's list, in Drive's order", () => {
    const local = payload([team('team-z', 'Z'), team('team-m', 'M')], []);
    const drive = payload([team('team-y', 'Y'), team('team-m', 'M'), team('team-a', 'A')], []);

    expect(teamIds(reviewed(local, drive, 'merge-and-upload'))).toEqual([
      'team-z',
      'team-m',
      'team-y',
      'team-a',
    ]);
  });

  it("keeps the same rule for both Replace actions: this device's order, then Drive's", () => {
    const local = payload([team('team-z', 'Z'), team('team-m', 'M')], []);
    const drive = payload([team('team-y', 'Y'), team('team-m', 'M'), team('team-a', 'A')], []);

    // Replacing Drive keeps this device's rows and drops what only Drive had, by default.
    expect(teamIds(reviewed(local, drive, 'replace-cloud'))).toEqual(['team-z', 'team-m']);
    // Replacing this device drops what only it had, by default, and keeps Drive's rows.
    expect(teamIds(reviewed(local, drive, 'replace-local'))).toEqual([
      'team-m',
      'team-y',
      'team-a',
    ]);
  });
});

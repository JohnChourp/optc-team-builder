import { describe, expect, it } from 'vitest';

import { type PublishedTeam } from '../../core/data/published-teams.data';
import { type CharacterListItem } from '../../core/models/optc.models';
import {
  buildPublishedTeamCards,
  buildSavedTeamFromPublished,
  publishedTeamCharacterIds,
} from './published-teams.utils';

function character(id: number): CharacterListItem {
  return { id, name: `C${id}` } as CharacterListItem;
}

function team(overrides: Partial<PublishedTeam> = {}): PublishedTeam {
  return {
    id: 'free-spirit-crew',
    group: 'Raid',
    stage: 'Clash!! Buster Call',
    slots: [1, 2, 3, 4, 5, 6],
    rationale: 'All six carry the Free Spirit class, composed for this app rather than submitted.',
    curatedOn: '2026-09-14',
    workedExample: true,
    ...overrides,
  } as PublishedTeam;
}

function lookup(ids: number[]): ReadonlyMap<number, CharacterListItem> {
  return new Map(ids.map((id) => [id, character(id)]));
}

describe('published teams', () => {
  it('collects every character the set needs, deduplicated', () => {
    expect(
      publishedTeamCharacterIds([
        team({ slots: [1, 1, 2, 3, null, 4] }),
        team({ id: 'b', slots: [4, 5, null, null, null, null] }),
      ]),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it('resolves members in slot order, keeping empty seats empty', () => {
    const [card] = buildPublishedTeamCards(lookup([1, 3]), [
      team({ slots: [1, null, 3, null, null, null] }),
    ]);

    expect(card.members.map((member) => member?.id ?? null)).toEqual([1, null, 3, null, null, null]);
    expect(card.complete).toBe(true);
  });

  /*
   * A published team the app cannot assemble is worse than none, so a card says when it is
   * incomplete rather than quietly showing five of six. The guard stops this reaching a release;
   * this is what the reader sees if a dataset update ever lands ahead of the data file.
   */
  it('marks a card incomplete when a character is missing from the dataset', () => {
    const [card] = buildPublishedTeamCards(lookup([1, 2, 3, 4, 5]), [team()]);

    expect(card.complete).toBe(false);
    expect(card.members[5]).toBeNull();
  });

  it('does not call an empty seat a missing character', () => {
    const [card] = buildPublishedTeamCards(lookup([1]), [
      team({ slots: [1, null, null, null, null, null] }),
    ]);

    expect(card.complete).toBe(true);
  });

  it('names the saved team after the content it is published against', () => {
    const saved = buildSavedTeamFromPublished(team(), 'note');

    expect(saved.name).toBe('Clash!! Buster Call');
    expect(saved.slots).toEqual([1, 2, 3, 4, 5, 6]);
    expect(saved.shipId).toBeNull();
  });

  /*
   * Once a team is in Saved Teams it is indistinguishable from one the reader built, so the
   * provenance rides along in the notes. A worked example that loses that sentence becomes a
   * claim nobody made.
   */
  it('carries the provenance into the saved team notes', () => {
    const saved = buildSavedTeamFromPublished(team(), 'Worked example, not a submitted team.');

    expect(saved.notes).toBe('Worked example, not a submitted team.');
  });

  it('copies the slots rather than sharing them with the shipped constant', () => {
    const source = team();
    const saved = buildSavedTeamFromPublished(source, 'note');

    saved.slots[0] = 999;

    expect(source.slots[0]).toBe(1);
  });

  it('reads the real shipped set without throwing', () => {
    const ids = publishedTeamCharacterIds();
    const cards = buildPublishedTeamCards(lookup(ids));

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.complete)).toBe(true);
    expect(cards.every((card) => card.team.workedExample)).toBe(true);
  });
});

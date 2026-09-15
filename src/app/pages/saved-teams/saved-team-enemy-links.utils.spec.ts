import { describe, expect, it } from 'vitest';

import { buildSavedTeamEnemyLinkIndex } from './saved-team-enemy-links.utils';

const enemy = (
  id: string,
  name: string,
  associatedTeamIds: string[] | undefined,
  updatedAt = '2026-09-01T00:00:00.000Z',
) =>
  ({
    id,
    name,
    notes: '',
    rawEnemyText: '',
    imageDataUrl: null,
    selectedTypes: [],
    selectedClasses: [],
    requiredAbilities: [],
    enemyMechanics: [],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    associatedTeamIds,
    createdAt: updatedAt,
    updatedAt,
  }) as never;

describe('buildSavedTeamEnemyLinkIndex', () => {
  it('reads the existing one-way link backwards', () => {
    const index = buildSavedTeamEnemyLinkIndex([enemy('e1', 'Kaido 30 Stamina', ['t1', 't2'])]);

    expect(index.get('t1')?.map((link) => link.enemyName)).toEqual(['Kaido 30 Stamina']);
    expect(index.get('t2')?.map((link) => link.enemyName)).toEqual(['Kaido 30 Stamina']);
  });

  it('lists every enemy a team answers, newest first', () => {
    const index = buildSavedTeamEnemyLinkIndex([
      enemy('e1', 'Older', ['t1'], '2026-08-01T00:00:00.000Z'),
      enemy('e2', 'Newer', ['t1'], '2026-09-10T00:00:00.000Z'),
    ]);

    expect(index.get('t1')?.map((link) => link.enemyName)).toEqual(['Newer', 'Older']);
  });

  it('returns nothing for a team no enemy references', () => {
    const index = buildSavedTeamEnemyLinkIndex([enemy('e1', 'Kaido', ['t1'])]);

    expect(index.get('t2')).toBeUndefined();
  });

  it('tolerates an enemy with no associations at all', () => {
    expect(buildSavedTeamEnemyLinkIndex([enemy('e1', 'Kaido', undefined)]).size).toBe(0);
  });

  it('ignores blank and whitespace-only team ids rather than creating an empty row', () => {
    const index = buildSavedTeamEnemyLinkIndex([enemy('e1', 'Kaido', ['', '   ', 't1'])]);

    expect([...index.keys()]).toEqual(['t1']);
  });

  /**
   * A stored list that repeats an id is not a reason to show the same enemy twice. It can only
   * come from a hand-edited backup, and duplicating the row would look like two different stages.
   */
  it('lists an enemy once however many times its stored list repeats the team', () => {
    const index = buildSavedTeamEnemyLinkIndex([enemy('e1', 'Kaido', ['t1', 't1', 't1'])]);

    expect(index.get('t1')).toHaveLength(1);
  });

  it('keeps two different enemies that both answer the same team', () => {
    const index = buildSavedTeamEnemyLinkIndex([
      enemy('e1', 'Kaido', ['t1'], '2026-09-01T00:00:00.000Z'),
      enemy('e2', 'Big Mom', ['t1'], '2026-09-02T00:00:00.000Z'),
    ]);

    expect(index.get('t1')?.map((link) => link.enemyId)).toEqual(['e2', 'e1']);
  });
});

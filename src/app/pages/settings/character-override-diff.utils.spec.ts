import { describe, expect, it } from 'vitest';

import {
  type CharacterListItem,
  type LocalCharacterOverride,
} from '../../core/models/optc.models';
import {
  buildCharacterOverrideDiff,
  buildCharacterOverrideDiffs,
} from './character-override-diff.utils';

function createDatasetCharacter(overrides: Partial<CharacterListItem> = {}) {
  return {
    id: 4208,
    name: 'Kozuki Hiyori',
    isIncomplete: false,
    type: 'INT',
    classes: ['Free Spirit', 'Cerebral'],
    primaryClass: 'Free Spirit',
    secondaryClass: 'Cerebral',
    stars: 5,
    cost: 40,
    combo: 4,
    stats: { min: { hp: 100, atk: 200, rcv: 50 }, max: { hp: 3000, atk: 1200, rcv: 400 }, growth: 1.5 },
    ...overrides,
  } as unknown as CharacterListItem;
}

function createOverride(overrides: Partial<LocalCharacterOverride> = {}) {
  return {
    characterId: 4208,
    name: 'Kozuki Hiyori',
    isIncomplete: false,
    type: 'INT',
    classes: ['Free Spirit', 'Cerebral'],
    stars: 5,
    cost: 40,
    combo: 4,
    minHp: 100,
    minAtk: 200,
    minRcv: 50,
    maxHp: 3000,
    maxAtk: 1200,
    maxRcv: 400,
    growth: 1.5,
    updatedAt: '2026-09-14T10:00:00.000Z',
    ...overrides,
  } as unknown as LocalCharacterOverride;
}

describe('character override diff', () => {
  it('names the field, the dataset value and the reader value', () => {
    const diff = buildCharacterOverrideDiff(
      createOverride({ maxAtk: 1500, cost: 45 }),
      createDatasetCharacter(),
    );

    expect(diff?.changes).toEqual([
      { field: 'cost', from: '40', to: '45' },
      { field: 'maxAtk', from: '1200', to: '1500' },
    ]);
  });

  it('reads the dataset stats where they really live', () => {
    /*
     * The dataset nests min/max ranges while an override stores them flat.
     * Reading `stats.minHp` yields undefined and reports every stat as
     * unchanged - the comparison would pass and say nothing, which is the
     * worst way for a diff to be wrong.
     */
    const diff = buildCharacterOverrideDiff(
      createOverride({ minHp: 999 }),
      createDatasetCharacter(),
    );

    expect(diff?.changes).toEqual([{ field: 'minHp', from: '100', to: '999' }]);
  });

  it('says nothing when an edit was undone', () => {
    /*
     * A reader who edits a field and puts it back should not still be listed as
     * having edited the character - the override record survives, but it now
     * matches the dataset exactly.
     */
    expect(buildCharacterOverrideDiff(createOverride(), createDatasetCharacter())).toBeNull();
  });

  it('does not invent a change between null and undefined', () => {
    /*
     * An override writes null for a stat the reader cleared; the dataset may
     * simply not carry it. Treating those as different would report an edit
     * nobody made, on every character.
     */
    const diff = buildCharacterOverrideDiff(
      createOverride({ growth: null }),
      createDatasetCharacter({
        stats: { min: { hp: 100, atk: 200, rcv: 50 }, max: { hp: 3000, atk: 1200, rcv: 400 }, growth: null },
      } as never),
    );

    expect(diff).toBeNull();
  });

  it('compares classes as a list, not as a string', () => {
    const reordered = buildCharacterOverrideDiff(
      createOverride({ classes: ['Cerebral', 'Free Spirit'] }),
      createDatasetCharacter(),
    );

    expect(reordered?.changes).toEqual([
      { field: 'classes', from: 'Free Spirit, Cerebral', to: 'Cerebral, Free Spirit' },
    ]);
  });

  it('keeps an override whose character the dataset no longer has', () => {
    /*
     * Deleting it would be losing the reader's work over a data update. It is
     * kept and flagged, so the list can say why it shows no changes.
     */
    const diff = buildCharacterOverrideDiff(createOverride({ name: 'Gone' }), null);

    expect(diff?.datasetMissing).toBe(true);
    expect(diff?.name).toBe('Gone');
    expect(diff?.changes).toEqual([]);
  });

  it('lists the most recently edited character first', () => {
    const characters = new Map([[4208, createDatasetCharacter()], [5601, createDatasetCharacter({ id: 5601 })]]);
    const diffs = buildCharacterOverrideDiffs(
      [
        createOverride({ characterId: 4208, cost: 41, updatedAt: '2026-09-10T00:00:00.000Z' }),
        createOverride({ characterId: 5601, cost: 42, updatedAt: '2026-09-14T00:00:00.000Z' }),
      ],
      characters,
    );

    expect(diffs.map((diff) => diff.characterId)).toEqual([5601, 4208]);
  });

  it('leaves undone edits out of the list entirely', () => {
    const diffs = buildCharacterOverrideDiffs(
      [createOverride(), createOverride({ characterId: 5601, cost: 99 })],
      new Map([[4208, createDatasetCharacter()], [5601, createDatasetCharacter({ id: 5601 })]]),
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0].characterId).toBe(5601);
  });

  it('shows an unset value as a dash rather than as "null"', () => {
    const diff = buildCharacterOverrideDiff(
      createOverride({ maxRcv: null }),
      createDatasetCharacter(),
    );

    expect(diff?.changes).toEqual([{ field: 'maxRcv', from: '400', to: '—' }]);
  });
});

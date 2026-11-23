import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { buildSupportFinder } from './character-support-finder.utils';

/*
 * 869f63gy0. Both sides of the Character screen's support finder, for the whole catalogue and for
 * one box.
 */

function record(
  id: number,
  name: string,
  fields: {
    type?: string;
    classes?: string[];
    families?: string[];
    tags?: string[];
    supports?: string[];
  } = {},
): CharacterDetailRecord {
  return {
    id,
    name,
    type: fields.type ?? 'STR',
    classes: fields.classes ?? ['Fighter'],
    cost: 30,
    families: fields.families ?? [name],
    detail: {
      characterTags: fields.tags ?? [],
      supportData: (fields.supports ?? []).map((sentence) => ({
        supportedCharactersText: sentence,
        levelDescriptions: [],
      })),
    },
  } as unknown as CharacterDetailRecord;
}

const NAMI = record(1, 'Nami', { type: 'INT', classes: ['Cerebral'], supports: ['Usopp'] });
const USOPP = record(2, 'Usopp', { type: 'DEX', classes: ['Shooter'] });
const INT_SUPPORT = record(3, 'Robin', { supports: ['[INT] characters'] });
const NAVY_SUPPORT = record(4, 'Coby', { supports: ['[Navy] characters'] });
const STR_SUPPORT = record(5, 'Zoro', { supports: ['[STR] characters', 'Nami'] });
const NAMI_ONLY = record(6, 'Nojiko', { supports: ['Nami'] });
const CATALOG = [STR_SUPPORT, NAMI, USOPP, INT_SUPPORT, NAVY_SUPPORT, NAMI_ONLY];

describe('support finder', () => {
  it('lists who can support the character, by id, with "cannot tell" kept apart', () => {
    const finder = buildSupportFinder(NAMI, CATALOG, null);

    // Zoro fits through his second support; a unit fits when any one of its supports does.
    expect(finder.receives.yes.map((unit) => unit.id)).toEqual([3, 5, 6]);
    expect(finder.receives.undetermined.map((unit) => unit.id)).toEqual([4]);
  });

  it('lists who each of its supports fits, never the character itself', () => {
    const finder = buildSupportFinder(NAMI, CATALOG, null);

    expect(finder.gives).toHaveLength(1);
    expect(finder.gives[0]?.sentence).toBe('Usopp');
    expect(finder.gives[0]?.yes.map((unit) => unit.id)).toEqual([2]);
    expect(finder.gives[0]?.undetermined).toEqual([]);
  });

  it('narrows both sides to the chosen box', () => {
    const finder = buildSupportFinder(NAMI, CATALOG, new Set([1, 6]));

    expect(finder.receives.yes.map((unit) => unit.id)).toEqual([6]);
    expect(finder.receives.undetermined).toEqual([]);
    expect(finder.gives[0]?.yes).toEqual([]);
  });

  it('names a unit with no family by its card name, so fodder is a "no", not "cannot tell"', () => {
    const luffy = record(4131, 'Monkey D. Luffy - Warrior in White Going Wild', { families: [] });
    const penguin = record(78, 'Red Robber Penguin', { families: [] });
    const luffySupport = record(7, 'Sabo', { supports: ['Monkey D. Luffy and Nami'] });
    const catalog = [record(8, 'Monkey D. Luffy'), luffy, penguin, luffySupport, NAMI];

    expect(buildSupportFinder(luffy, catalog, null).receives.yes.map((unit) => unit.id)).toEqual([
      7,
    ]);

    const given = buildSupportFinder(luffySupport, catalog, null).gives[0];

    expect(given?.yes.map((unit) => unit.id)).toEqual([1, 8, 4131]);
    expect(given?.undetermined).toEqual([]);
  });

  it('has nothing to give for a character with no support of its own', () => {
    expect(buildSupportFinder(USOPP, CATALOG, null).gives).toEqual([]);
  });
});

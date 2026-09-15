import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ENEMY_MECHANIC_MEANINGS,
  buildEnemyMechanicVocabulary,
  findChecklistProseDrift,
  findVocabularyFailures,
  parseEnemyMechanicCatalog,
} from './lib/enemy-mechanic-vocabulary.mjs';
import { CHECKLIST_UTILS_PATH, readVocabulary } from './generate-enemy-vocabulary.mjs';

const ROOT = resolve(import.meta.dirname, '..');

const CATALOG_SOURCE = [
  'const ENEMY_MECHANIC_CATALOG = [',
  "  createEnemyMechanicCatalogItem({ key: 'enemy_barrier', label: 'Barrier', category: 'enemyDefense', derivedAbilityKey: 'remove_enemy_barrier' }),",
  "  createEnemyMechanicCatalogItem({ key: 'enemy_immunity', label: 'Immunity', category: 'enemyDefense', derivedAbilityKey: null }),",
  '];',
  'function cloneEnemyMechanicCatalogItem() {}',
].join('\n');

describe('parseEnemyMechanicCatalog', () => {
  it('reads each mechanic and whether an ability answers it', () => {
    expect(parseEnemyMechanicCatalog(CATALOG_SOURCE)).toEqual([
      {
        key: 'enemy_barrier',
        label: 'Barrier',
        category: 'enemyDefense',
        derivedAbilityKey: 'remove_enemy_barrier',
      },
      { key: 'enemy_immunity', label: 'Immunity', category: 'enemyDefense', derivedAbilityKey: null },
    ]);
  });

  it('throws rather than returning nothing when the catalogue cannot be found', () => {
    expect(() => parseEnemyMechanicCatalog('// nothing here')).toThrow(/catalogue/u);
  });
});

describe('buildEnemyMechanicVocabulary', () => {
  it('separates what constrains the search from what only the checklist can report', () => {
    const vocabulary = buildEnemyMechanicVocabulary({
      draftSource: CATALOG_SOURCE,
      generatedAt: 'fixed',
    });

    expect(vocabulary.constrainingCount).toBe(1);
    expect(vocabulary.checklistOnlyCount).toBe(1);
    expect(vocabulary.mechanics[1]?.engineBehaviour).toContain('constrains nothing');
  });
});

describe('findVocabularyFailures', () => {
  it('fails a mechanic with no declared meaning', () => {
    const failures = findVocabularyFailures({
      mechanics: [{ key: 'enemy_new_thing', meaning: null }],
    } as never);

    expect(failures.join(' ')).toContain('no meaning declared');
  });

  it('fails a meaning left behind after its mechanic is removed', () => {
    const failures = findVocabularyFailures({
      mechanics: [{ key: 'enemy_barrier', meaning: 'x' }],
    } as never);

    expect(failures.join(' ')).toContain('no longer in the catalogue');
  });

  it('accepts the shipped vocabulary', () => {
    expect(findVocabularyFailures(readVocabulary({ generatedAt: 'fixed' }))).toEqual([]);
  });
});

/**
 * 869f1328q. This guard found a real stale number on its first run: the checklist's own prose said
 * fourteen mechanics carry `derivedAbilityKey: null` while the catalogue held fifteen. This
 * project has paid for a carried-forward figure in a comment before, so the figure is checked
 * against the thing it describes.
 */
describe('findChecklistProseDrift', () => {
  it('fails when the written-out count disagrees with the catalogue', () => {
    const failures = findChecklistProseDrift(
      "Fourteen of the catalogue's 38 mechanics carry `derivedAbilityKey: null`, so",
      { checklistOnlyCount: 15, mechanicCount: 38 } as never,
    );

    expect(failures.join(' ')).toContain('the catalogue holds 15');
  });

  it('fails when the total disagrees with the catalogue', () => {
    const failures = findChecklistProseDrift(
      "Fifteen of the catalogue's 38 mechanics carry `derivedAbilityKey: null`, so",
      { checklistOnlyCount: 15, mechanicCount: 40 } as never,
    );

    expect(failures.join(' ')).toContain('it holds 40');
  });

  it('fails when the sentence is removed, because then the guard protects nothing', () => {
    const failures = findChecklistProseDrift('// no such sentence', {
      checklistOnlyCount: 15,
      mechanicCount: 38,
    } as never);

    expect(failures.join(' ')).toContain('no longer states');
  });

  it('accepts the shipped checklist prose', () => {
    expect(
      findChecklistProseDrift(
        readFileSync(resolve(ROOT, CHECKLIST_UTILS_PATH), 'utf8'),
        readVocabulary({ generatedAt: 'fixed' }),
      ),
    ).toEqual([]);
  });
});

describe('the shipped vocabulary', () => {
  it('declares a meaning for every mechanic, in the player sense rather than the label', () => {
    const vocabulary = readVocabulary({ generatedAt: 'fixed' });

    expect(vocabulary.mechanicCount).toBe(Object.keys(ENEMY_MECHANIC_MEANINGS).length);

    for (const mechanic of vocabulary.mechanics) {
      expect(mechanic.meaning, `${mechanic.key} has no meaning`).toBeTruthy();
      // A meaning that only repeats the label explains nothing.
      expect(mechanic.meaning?.toLowerCase()).not.toBe(mechanic.label?.toLowerCase());
    }
  });

  it('says plainly that an unanswerable mechanic constrains nothing', () => {
    const vocabulary = readVocabulary({ generatedAt: 'fixed' });
    const immunity = vocabulary.mechanics.find((mechanic) => mechanic.key === 'enemy_immunity');

    expect(immunity?.derivedAbilityKey).toBeNull();
    expect(immunity?.engineBehaviour).toContain('constrains nothing');
    expect(immunity?.engineBehaviour).toContain('unanswerable');
  });
});

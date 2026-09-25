import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { buildCharacterDetailViewModel } from './character-detail.presenter';

/*
 * 869f63gv6. The Character screen shows each form of a dual or VS unit with its type and its
 * classes - the classes the class filters and Captain Coverage count for it after a swap.
 */

describe('the Character screen and a dual unit', () => {
  it('shows each form, in order, with its type and classes, after the unit\'s own classes', () => {
    const view = buildCharacterDetailViewModel(smokerAndTashigi());
    const labels = view.heroMeta.map((row) => row.labelKey);

    expect(view.heroMeta.filter((row) => row.labelKey === 'fields.form')).toEqual([
      { labelKey: 'fields.form', value: 'Smoker · INT · Striker / Driven' },
      { labelKey: 'fields.form', value: 'Tashigi · PSY · Slasher / Cerebral' },
    ]);
    expect(labels.indexOf('fields.form')).toBeGreaterThan(labels.indexOf('fields.secondaryClass'));
    expect(labels.lastIndexOf('fields.form')).toBeLessThan(labels.indexOf('fields.stars'));
  });

  it('shows no form row for a unit without forms', () => {
    const view = buildCharacterDetailViewModel({ ...smokerAndTashigi(), forms: undefined });

    expect(view.heroMeta.map((row) => row.labelKey)).not.toContain('fields.form');
  });

  it('labels the row in English and in Greek, with "swap" kept as the game says it', () => {
    const read = (language: string) =>
      JSON.parse(
        readFileSync(resolve(process.cwd(), `public/i18n/character-detail/${language}.json`), 'utf8'),
      ).fields.form;

    expect(read('en')).toBe('After swap');
    expect(read('el')).toBe('Μετά από swap');
  });
});

function smokerAndTashigi(): CharacterDetailRecord {
  return {
    id: 1983,
    name: 'Smoker & Tashigi - Straw Hat Pursuer',
    type: 'INT,PSY',
    classes: ['Striker', 'Slasher'],
    primaryClass: 'Striker',
    secondaryClass: 'Slasher',
    stars: 4,
    cost: 15,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: 264, atk: 138, rcv: 30 },
      max: { hp: 1858, atk: 1421, rcv: 325 },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: true, thumbnailJapan: true },
    regionRelease: { availableOnGlobal: true },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    forms: [
      {
        key: '1',
        name: 'Smoker',
        type: 'INT',
        classes: ['Striker', 'Driven'],
        combo: 4,
        stats: { min: { hp: 194, atk: 98, rcv: 15 }, max: { hp: 1828, atk: 1348, rcv: 62 } },
      },
      {
        key: '2',
        name: 'Tashigi',
        type: 'PSY',
        classes: ['Slasher', 'Cerebral'],
        combo: 6,
        stats: { min: { hp: 188, atk: 89, rcv: 19 }, max: { hp: 1704, atk: 1028, rcv: 324 } },
      },
    ],
    imageUrl: '/assets/test.png',
    detailImageUrl: '/assets/test-detail.png',
    isIncomplete: false,
    detail: {
      characterId: 1983,
      captainAbility: null,
      captainAbilityVariants: [],
      captainNotes: null,
      specialName: null,
      specialText: null,
      specialNotes: null,
      superSpecialText: null,
      superSpecialCriteriaText: null,
      superSpecialNotes: null,
      superSpecialCriteria: null,
      partyConflictKeys: [],
      builderAbilities: [],
      sailorAbilities: [],
      sailorNotes: null,
      potentialAbilities: [],
      supportData: [],
      swapData: null,
      vsSpecial: null,
      superType: null,
      superClass: null,
      rumbleData: null,
    },
  };
}

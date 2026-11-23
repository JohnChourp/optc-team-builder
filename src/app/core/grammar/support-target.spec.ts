import { describe, expect, it } from 'vitest';

import {
  matchSupportTarget,
  normalizeSupportName,
  parseSupportTarget,
  supportNameKeys,
  type SupportTargetCandidate,
} from './support-target';

/*
 * 869f63gy0. Every sentence below is a real "Supported characters" sentence of the shipped seed of
 * 2026-11-19, where all 1,099 distinct sentences read (none `unreadable`).
 */

const FAMILIES = new Set(
  [
    'Monkey D. Luffy',
    'Nami',
    'Edward Newgate',
    'Whitebeard',
    'Kuzan',
    'Aokiji',
    'Baron Tamago',
  ].map(normalizeSupportName),
);

function unit(overrides: Partial<SupportTargetCandidate> = {}): SupportTargetCandidate {
  return {
    type: 'INT',
    classes: ['Cerebral', 'Driven'],
    cost: 45,
    families: ['Nami'],
    forms: null,
    detail: { characterTags: ['Straw Hat Pirates'] },
    ...overrides,
  };
}

function match(sentence: string, candidate: SupportTargetCandidate = unit()) {
  return matchSupportTarget(parseSupportTarget(sentence), candidate, FAMILIES);
}

describe('support target: reading the sentence', () => {
  it('reads "All characters" and the cost thresholds', () => {
    expect(parseSupportTarget('All characters')).toEqual({ kind: 'all' });
    expect(parseSupportTarget('Characters with cost 40 or less')).toEqual({
      kind: 'cost',
      limit: 40,
      direction: 'atMost',
    });
    expect(parseSupportTarget('Characters with Cost 70 or more')).toEqual({
      kind: 'cost',
      limit: 70,
      direction: 'atLeast',
    });
  });

  it('reads alternatives of one kind, words side by side, and a new alternative after a separator', () => {
    expect(parseSupportTarget('[STR], [DEX] and [PSY] characters')).toEqual({
      kind: 'groups',
      alternatives: [{ types: ['STR', 'DEX', 'PSY'], classes: [], tags: [] }],
    });
    expect(parseSupportTarget('[INT] Cerebral and Powerhouse characters')).toEqual({
      kind: 'groups',
      alternatives: [{ types: ['INT'], classes: ['Cerebral', 'Powerhouse'], tags: [] }],
    });
    expect(parseSupportTarget('[INT] Slasher and [INT] Free Spirit characters')).toEqual({
      kind: 'groups',
      alternatives: [
        { types: ['INT'], classes: ['Slasher'], tags: [] },
        { types: ['INT'], classes: ['Free Spirit'], tags: [] },
      ],
    });
    expect(parseSupportTarget('[QCK] Slasher/Striker characters')).toEqual({
      kind: 'groups',
      alternatives: [{ types: ['QCK'], classes: ['Slasher', 'Striker'], tags: [] }],
    });
    expect(parseSupportTarget('[DEX] [Child], [Giant] characters')).toEqual({
      kind: 'groups',
      alternatives: [{ types: ['DEX'], classes: [], tags: ['Child', 'Giant'] }],
    });
    expect(parseSupportTarget('Slasher Characters')).toEqual({
      kind: 'groups',
      alternatives: [{ types: [], classes: ['Slasher'], tags: [] }],
    });
  });

  it('reads a name list, brackets kept whole, and a type or class every listed name must have', () => {
    expect(parseSupportTarget('Portgas D. Ace and Edward Newgate (Whitebeard)')).toEqual({
      kind: 'names',
      names: ['Portgas D. Ace', 'Edward Newgate (Whitebeard)'],
      qualifier: null,
    });
    expect(
      parseSupportTarget('Baron Tamago (Viscount Hiyoko, Count Niwatori), Pekoms and Heat or Wire'),
    ).toEqual({
      kind: 'names',
      names: ['Baron Tamago (Viscount Hiyoko, Count Niwatori)', 'Pekoms', 'Heat', 'Wire'],
      qualifier: null,
    });
    expect(parseSupportTarget('[INT] of the following: Nami, Usopp')).toEqual({
      kind: 'names',
      names: ['Nami', 'Usopp'],
      qualifier: [{ types: ['INT'], classes: [], tags: [] }],
    });
    expect(parseSupportTarget('[DEX] Free Spirit Franky, Brook, Jinbe')).toEqual({
      kind: 'names',
      names: ['Franky', 'Brook', 'Jinbe'],
      qualifier: [{ types: ['DEX'], classes: ['Free Spirit'], tags: [] }],
    });
  });

  it('gives up on a sentence it cannot read rather than guessing', () => {
    expect(parseSupportTarget('')).toEqual({ kind: 'unreadable' });
    expect(parseSupportTarget('[Navy] [SWORD] characters')).toEqual({ kind: 'unreadable' });
    expect(parseSupportTarget('[STR] and characters')).toEqual({ kind: 'unreadable' });
    expect(matchSupportTarget({ kind: 'unreadable' }, unit(), FAMILIES)).toBe('undetermined');
  });

  it('names a character by its family, by its alias or by the whole', () => {
    expect(supportNameKeys('Edward Newgate (Whitebeard)')).toEqual([
      'edward newgate (whitebeard)',
      'edward newgate',
      'whitebeard',
    ]);
  });
});

describe('support target: who it fits', () => {
  it('answers all, cost, type and class', () => {
    expect(match('All characters')).toBe('yes');
    expect(match('Characters with cost 40 or less')).toBe('no');
    expect(match('Characters with cost 40 or less', unit({ cost: 40 }))).toBe('yes');
    expect(match('[INT] Cerebral characters')).toBe('yes');
    expect(match('[STR] Cerebral characters')).toBe('no');
    expect(match('[STR] Driven and [INT] Driven characters')).toBe('yes');
    expect(match('[INT] characters', unit({ type: 'PSY,INT' }))).toBe('yes');
  });

  it('says undetermined, never no, when only another form of a dual unit fits', () => {
    const dual = unit({
      type: 'STR',
      classes: ['Fighter'],
      forms: [{ type: 'INT', classes: ['Cerebral'] }],
    });

    expect(match('[INT] characters', dual)).toBe('undetermined');
    expect(match('[PSY] characters', dual)).toBe('no');
  });

  it('says undetermined, never no, for a crew tag the character does not carry', () => {
    expect(match('[Straw Hat Pirates] characters')).toBe('yes');
    expect(match('[Navy] characters')).toBe('undetermined');
    expect(match('[STR] [Navy] characters')).toBe('no');
    expect(
      match(
        '[Paramythia-type] characters',
        unit({ detail: { characterTags: ['Paramythia-type / Devil Fruit User'] } }),
      ),
    ).toBe('yes');
    expect(match('[Navy] characters', unit({ detail: { characterTags: ['Former / Navy'] } }))).toBe(
      'undetermined',
    );
  });

  it('matches names through families, and cannot say for an unknown name or a unit with no family', () => {
    expect(match('Monkey D. Luffy and Nami')).toBe('yes');
    expect(match('Monkey D. Luffy')).toBe('no');
    expect(match('Edward Newgate (Whitebeard)', unit({ families: ['Whitebeard'] }))).toBe('yes');
    expect(match('Monkey D. Luffy and Mamboshi')).toBe('undetermined');
    expect(match('Monkey D. Luffy', unit({ families: [] }))).toBe('undetermined');
    expect(match('[INT] of the following: Nami')).toBe('yes');
    expect(match('[DEX] of the following: Nami')).toBe('no');
  });
});

describe('support target: names the families do not settle', () => {
  it('folds accents, so "Senor Pink" is the family "Señor Pink"', () => {
    expect(normalizeSupportName('Señor  Pink')).toBe('senor pink');
    expect(match('Senor Pink', unit({ families: ['Señor Pink'] }))).toBe('yes');
  });

  it('says cannot tell, never no, when the card name is listed but its family disagrees', () => {
    const card = unit({ name: 'Tank Lepanto - Tontatta Hero', families: ['Princess Scarlet'] });
    const families = new Set([...FAMILIES, 'tank lepanto', 'princess scarlet']);

    expect(matchSupportTarget(parseSupportTarget('Tank Lepanto'), card, families)).toBe(
      'undetermined',
    );
  });

  it('narrows an unknown name to the units that share a word with it', () => {
    const target = parseSupportTarget('Monkey D. Luffy and Pacifista PX-1');

    expect(
      matchSupportTarget(
        target,
        unit({ name: 'Pacifista - Mk. III', families: ['Pacifista'] }),
        FAMILIES,
      ),
    ).toBe('undetermined');
    expect(
      matchSupportTarget(target, unit({ name: 'Nami - Thief', families: ['Nami'] }), FAMILIES),
    ).toBe('no');
    // Without a card name there is nothing to narrow with.
    expect(matchSupportTarget(target, unit({ families: ['Nami'] }), FAMILIES)).toBe('undetermined');
  });

  it('reads brackets that do not balance as unreadable, not as the wrong names', () => {
    expect(parseSupportTarget('Mr. 3), Nami and Usopp')).toEqual({ kind: 'unreadable' });
    expect(parseSupportTarget('Galdino (Mr. 3, Nami')).toEqual({ kind: 'unreadable' });
  });
});

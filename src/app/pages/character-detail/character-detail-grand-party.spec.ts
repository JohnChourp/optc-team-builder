import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { setFormattingLanguage } from '../../core/i18n/app-locale-format';
import { type CharacterDetail, type CharacterDetailRecord } from '../../core/models/optc.models';
import {
  buildCharacterDetailViewModel,
  buildGrandPartyCardModel,
  type DetailDisplayCard,
  type DetailDisplayLine,
} from './character-detail.presenter';

/*
 * 869f63gz7. Grand Party on the Character screen: its own card after the Rumble card, titled Leader
 * Skill, Burst and Burst Condition in both languages, with the condition in words - "After 2 crew
 * members are defeated" - where it used to be raw Count / Type / Team rows.
 *
 * No TestBed, like every page spec here: the view model is built by the real presenter, each line is
 * resolved against the real copy the way the template's `t()` resolves it, and the template is read
 * as the source it is. The formatting language is module state that `src/test-setup.ts` resets after
 * every test.
 */

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const copy = {
  en: JSON.parse(read('public/i18n/character-detail/en.json')) as unknown,
  el: JSON.parse(read('public/i18n/character-detail/el.json')) as unknown,
};
type Language = keyof typeof copy;

function leaf(language: Language, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      copy[language],
    );

  return typeof value === 'string' ? value : undefined;
}

function translate(language: Language, key: string, params: Record<string, string> = {}): string {
  const template = leaf(language, key);

  if (template === undefined) {
    throw new Error(`${key} is missing from ${language}.json`);
  }

  return template.replace(/\{\{\s*(\w+)\s*\}\}/gu, (_match, name: string) => {
    const value = params[name];

    if (value === undefined) {
      throw new Error(`${key} asks for {{${name}}} and the line does not give it`);
    }

    return value;
  });
}

function shown(line: DetailDisplayLine, language: Language): string {
  const label = line.labelKey ? `${translate(language, line.labelKey)}: ` : '';

  return (
    label +
    line.tokens
      .map((token) => (token.key ? translate(language, token.key, token.params) : token.text))
      .join('')
  );
}

function burstConditionLines(card: DetailDisplayCard | null): DetailDisplayLine[] {
  return card?.entries.find((entry) => entry.titleKey === 'grandParty.burstCondition')?.lines ?? [];
}

/** A Grand Party unit's Rumble data, shaped like the shipped seed's. */
const RUMBLE = {
  id: 3613,
  stats: { rumbleType: 'SPT', def: 200, spd: 100 },
  ability: [{ effects: [{ attributes: ['ATK'], effect: 'buff', level: 5, targeting: { targets: ['crew'] } }] }],
  special: [{ cooldown: 28, effects: [{ amount: 2.5, effect: 'damage', type: 'atk' }] }],
  gpability: [
    {
      effects: [
        { attributes: ['HP', 'SPD', 'ATK'], effect: 'buff', level: 6, targeting: { targets: ['[STR]', '[QCK]'] } },
      ],
    },
  ],
  gpspecial: [
    {
      uses: 2,
      effects: [
        {
          attributes: ['Action Bind'],
          chance: 100,
          duration: 10,
          effect: 'hinderance',
          targeting: { targets: ['[DEX]', '[QCK]'] },
        },
      ],
    },
  ],
  gpcondition: [{ count: 2, type: 'defeat', team: 'crew' }],
};

describe('character detail: the Grand Party card', () => {
  const cards = buildCharacterDetailViewModel(createRecord({ rumbleData: RUMBLE }))
    .groups.flatMap((group) => group.cards);
  const rumble = cards.find((card) => card.titleKey === 'sections.rumbleData');
  const grandParty = cards.find((card) => card.titleKey === 'sections.grandParty');

  it('follows the Rumble card, and the Rumble card no longer carries its three fields', () => {
    const titleKeys = cards.map((card) => card.titleKey);

    expect(titleKeys.indexOf('sections.grandParty')).toBe(titleKeys.indexOf('sections.rumbleData') + 1);
    expect(rumble?.entries.map((entry) => entry.title)).toEqual(['Passive', 'Special']);
    // The raw condition rows the Rumble card used to print.
    expect(JSON.stringify(rumble)).not.toMatch(/"(?:Count|Team)"|defeat|GP /u);
  });

  it('names its three parts with keys, never an English title', () => {
    expect(grandParty?.entries.map((entry) => entry.titleKey)).toEqual([
      'grandParty.leaderSkill',
      'grandParty.burst',
      'grandParty.burstCondition',
    ]);
    expect(grandParty?.entries.map((entry) => entry.title)).toEqual([undefined, undefined, undefined]);
  });

  it('keeps the Leader Skill and Burst effects as the Rumble card reads effects', () => {
    const [leaderSkill, burst] = grandParty?.entries ?? [];

    expect(leaderSkill?.lists).toEqual([
      { labelKey: 'fields.effects', items: ['buff • HP, SPD, ATK • Lv 6 • [STR], [QCK]'] },
    ]);
    expect(burst?.rows).toEqual([{ labelKey: 'fields.uses', value: '2' }]);
    expect(burst?.lists).toEqual([
      {
        labelKey: 'fields.effects',
        items: ['hinderance • Action Bind • 100% chance • 10 duration • [DEX], [QCK]'],
      },
    ]);
  });

  it('says when the Burst fires, in words, in both languages', () => {
    const [line] = burstConditionLines(grandParty ?? null);

    expect(line && shown(line, 'en')).toBe('After 2 crew members are defeated');
    expect(line && shown(line, 'el')).toBe('Αφού ηττηθούν 2 μέλη του crew');
  });

  it('titles itself in both languages, keeping the game terms English', () => {
    const titles = (language: Language) =>
      ['sections.grandParty', 'grandParty.leaderSkill', 'grandParty.burst', 'grandParty.burstCondition', 'fields.uses'].map(
        (key) => translate(language, key),
      );

    expect(titles('en')).toEqual(['Grand Party', 'Leader Skill', 'Burst', 'Burst Condition', 'Uses']);
    expect(titles('el')).toEqual(['Grand Party', 'Leader Skill', 'Burst', 'Συνθήκη Burst', 'Χρήσεις']);
  });

  it('is not there for a unit with no Grand Party data', () => {
    const plainRumble = { id: RUMBLE.id, stats: RUMBLE.stats, ability: RUMBLE.ability, special: RUMBLE.special };

    expect(buildGrandPartyCardModel(plainRumble)).toBeNull();
    expect(buildGrandPartyCardModel(null)).toBeNull();
  });
});

describe('character detail: the Burst Condition in words', () => {
  const shapes: ReadonlyArray<{ condition: Record<string, unknown>; en: string; el: string }> = [
    { condition: { count: 2, type: 'defeat', team: 'crew' }, en: 'After 2 crew members are defeated', el: 'Αφού ηττηθούν 2 μέλη του crew' },
    { condition: { count: 5, type: 'defeat', team: 'enemies' }, en: 'After 5 enemies are defeated', el: 'Αφού ηττηθούν 5 εχθροί' },
    { condition: { count: 7, type: 'special', team: 'crew' }, en: 'After your crew uses 7 Rumble Specials', el: 'Αφού το crew σου χρησιμοποιήσει 7 Rumble Specials' },
    { condition: { count: 6, type: 'special', team: 'enemies' }, en: 'After the enemies use 6 Rumble Specials', el: 'Αφού οι εχθροί χρησιμοποιήσουν 6 Rumble Specials' },
    { condition: { count: 50, type: 'time', comparator: 'after' }, en: 'After 50 seconds', el: 'Μετά από 50 δευτερόλεπτα' },
    { condition: { count: 20, type: 'time' }, en: 'At exactly 20 seconds', el: 'Ακριβώς στα 20 δευτερόλεπτα' },
    { condition: { count: 25, type: 'damage' }, en: 'After dealing damage 25 times', el: 'Αφού κάνεις damage 25 φορές' },
    // The one place a count is large enough to be written differently in the two languages.
    { condition: { count: 55000, type: 'dmgdealt' }, en: 'After dealing 55,000 damage', el: 'Αφού κάνεις 55.000 damage' },
    { condition: { count: 55000, type: 'dmgreceived' }, en: 'After taking 55,000 damage', el: 'Αφού δεχτείς 55.000 damage' },
    { condition: { count: 20, type: 'hitreceived' }, en: 'After taking 20 hits', el: 'Αφού δεχτείς 20 χτυπήματα' },
    { condition: { count: 6, type: 'dbfreceived' }, en: 'After receiving 6 debuffs', el: 'Αφού δεχτείς 6 debuffs' },
    { condition: { count: 5, type: 'attack', attack: 'Power' }, en: 'After landing 5 Power attacks', el: 'Αφού πετύχεις 5 Power attacks' },
    { condition: { count: 8, type: 'debuff', attribute: 'Critical Hit' }, en: 'After landing Critical Hit 8 times', el: 'Αφού πετύχεις Critical Hit 8 φορές' },
    { condition: { count: 10, type: 'action', action: 'heal' }, en: 'After 10 heal actions', el: 'Αφού κάνεις heal 10 φορές' },
  ];

  function conditionText(condition: unknown, language: Language): string[] {
    setFormattingLanguage(language);

    return burstConditionLines(buildGrandPartyCardModel({ gpcondition: [condition] })).map((line) =>
      shown(line, language),
    );
  }

  it('has a sentence for every key the reader can produce', () => {
    // The fourteen keys of `GrandPartyConditionKey`, each in this table at least once.
    const keys = new Set(
      shapes.flatMap(({ condition }) =>
        burstConditionLines(buildGrandPartyCardModel({ gpcondition: [condition] })).flatMap((line) =>
          line.tokens.flatMap((token) => (token.key ? [token.key] : [])),
        ),
      ),
    );

    expect(keys.size).toBe(14);

    for (const key of keys) {
      expect(leaf('en', key), key).toBeTypeOf('string');
      expect(leaf('el', key), `${key} contains no Greek`).toMatch(/[Ͱ-Ͽἀ-῿]/u);
    }
  });

  it.each(shapes)('reads $en', ({ condition, en, el }) => {
    expect(conditionText(condition, 'en')).toEqual([en]);
    expect(conditionText(condition, 'el')).toEqual([el]);
  });

  it('shows a shape it cannot read as readable key: value text, never dropped', () => {
    expect(conditionText({ count: 3, type: 'healreceived' }, 'en')).toEqual(['Count: 3 • Type: healreceived']);
    expect(conditionText({ count: 2, type: 'defeat', team: 'crew', families: ['Straw Hat Crew'] }, 'en')).toEqual([
      'Count: 2 • Type: defeat • Team: crew • Families: Straw Hat Crew',
    ]);
  });
});

/** Every character detail in the committed seed that carries a Grand Party condition. */
function readSeedGrandPartyDetails(): CharacterDetail[] {
  const sql = read('public/assets/data/optc-seed.sql');
  const details: CharacterDetail[] = [];

  for (const match of sql.matchAll(
    /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu,
  )) {
    const detail = JSON.parse(match[2]!.replace(/''/gu, "'")) as CharacterDetail;

    if (detail.rumbleData?.['gpcondition']) {
      details.push(detail);
    }
  }

  return details;
}

describe('character detail: Grand Party over the shipped seed', () => {
  const details = readSeedGrandPartyDetails();

  it('has Grand Party units to show', () => {
    expect(details.length).toBeGreaterThan(0);
  });

  it('gives every one of them the card, with a Burst Condition that reads in both languages', () => {
    for (const detail of details) {
      const lines = burstConditionLines(buildGrandPartyCardModel(detail.rumbleData));

      expect(lines.length, `character ${detail.characterId}`).toBeGreaterThan(0);

      for (const line of lines) {
        for (const language of ['en', 'el'] as const) {
          // `translate` throws on a missing key or a placeholder the line does not fill.
          expect(shown(line, language), `character ${detail.characterId}`).not.toMatch(
            /^\s*$|\[object Object\]|undefined/u,
          );
        }
      }
    }
  });
});

describe('character detail template: the Grand Party card', () => {
  const template = read('src/app/pages/character-detail/character-detail.page.html');

  it('lays out like the Rumble card', () => {
    expect(template).toMatch(
      /\[class\.detail-card--rumble\]="\s*card\.titleKey === 'sections\.rumbleData' \|\|\s*card\.titleKey === 'sections\.grandParty'\s*"/u,
    );
  });
});

function createRecord(detail: Partial<CharacterDetail>): CharacterDetailRecord {
  return {
    id: 3613,
    name: 'Hancock & Nami & Robin - Mesmerizing Beauties',
    searchText: 'hancock nami robin',
    isIncomplete: false,
    type: 'STR',
    classes: ['Striker', 'Free Spirit'],
    primaryClass: 'Striker',
    secondaryClass: 'Free Spirit',
    stars: 6,
    cost: 60,
    combo: 4,
    captainHpBoost: 0,
    captainAtkBoost: 0,
    captainAverageBoost: 0,
    stats: {
      min: { hp: null, atk: null, rcv: null },
      max: { hp: null, atk: null, rcv: null },
      growth: null,
    },
    regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
    regionRelease: { availableOnGlobal: null },
    assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
    imageUrl: 'assets/placeholders/character-card.svg',
    detailImageUrl: 'assets/placeholders/character-card.svg',
    detail: {
      characterId: 3613,
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
      characterTags: [],
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
      ...detail,
    },
  } satisfies CharacterDetailRecord;
}

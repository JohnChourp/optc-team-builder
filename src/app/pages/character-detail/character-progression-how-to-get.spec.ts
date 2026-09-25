import '@angular/compiler';
import { signal } from '@angular/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Database, SqlJsStatic } from 'sql.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type CharacterAcquisition,
  type CharacterDetailRecord,
  type CharacterProgression,
} from '../../core/models/optc.models';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { CharacterDetailPage } from './character-detail.page';
import {
  buildHowToGetCard,
  type ProgressionDisplayCard,
  type ProgressionDisplayText,
} from './character-progression.presenter';

vi.mock('@ionic/angular', () => ({ IonIcon: class {} }));
vi.mock('@ionic/angular/ion-button', () => ({ IonButton: class {} }));
vi.mock('@ionic/angular/ion-content', () => ({ IonContent: class {} }));
vi.mock('@ionic/angular/ion-header', () => ({ IonHeader: class {} }));
vi.mock('@ionic/angular/ion-spinner', () => ({ IonSpinner: class {} }));
vi.mock('@ionic/angular/ion-title', () => ({ IonTitle: class {} }));
vi.mock('@ionic/angular/ion-toolbar', () => ({ IonToolbar: class {} }));

/*
 * 869f63gm1. The Character screen's drop card became "How to get it": upstream records the Rare
 * Recruit and its limited kinds, the shops and the Friend Point banner, and the card now says so -
 * only ever a positive statement, and nothing at all when nothing is recorded.
 */

const NONE: CharacterAcquisition = { flags: [], shops: [], banners: [] };

function progression(overrides: Partial<CharacterProgression> = {}): CharacterProgression {
  return {
    characterId: 1,
    maxSockets: null,
    specialCooldownMax: null,
    specialCooldownMin: null,
    evolvesTo: [],
    evolvesFrom: [],
    dropSources: [],
    acquisition: NONE,
    ...overrides,
  };
}

const NAMES = new Map([[16, 'Sogeking']]);
const resolveName = (characterId: number): string | null => NAMES.get(characterId) ?? null;

/** What each list says, as translation keys: `labelKey: item key, item key`. */
function keysOf(card: ProgressionDisplayCard | null): string[] {
  return (card?.lists ?? []).map(
    (list) =>
      `${list.labelKey}: ${list.items
        .map((item, index) => list.texts?.[index]?.key ?? item)
        .join(', ')}`,
  );
}

function acquisition(fields: Partial<CharacterAcquisition>): CharacterAcquisition {
  return { ...NONE, ...fields };
}

describe('buildHowToGetCard', () => {
  it('names the Rare Recruit for a Sugo unit', () => {
    const card = buildHowToGetCard(
      progression({ acquisition: acquisition({ flags: ['rr'] }) }),
      resolveName,
    );

    expect(card?.titleKey).toBe('sections.howToGet');
    expect(keysOf(card)).toEqual([
      'progression.recruitedFrom: progression.acquisition.rareRecruit',
    ]);
  });

  it('names the limited Rare Recruit, and its kind, rather than the ordinary one it is not in', () => {
    expect(
      keysOf(
        buildHowToGetCard(
          progression({ acquisition: acquisition({ flags: ['rr', 'lrr'] }) }),
          resolveName,
        ),
      ),
    ).toEqual(['progression.recruitedFrom: progression.acquisition.limitedRareRecruit']);
    expect(
      keysOf(
        buildHowToGetCard(
          progression({ acquisition: acquisition({ flags: ['rr', 'lrr', 'tmlrr'] }) }),
          resolveName,
        ),
      ),
    ).toEqual(['progression.recruitedFrom: progression.acquisition.treasureMapLimitedRareRecruit']);
    expect(
      keysOf(
        buildHowToGetCard(
          progression({ acquisition: acquisition({ flags: ['rr', 'lrr', 'kclrr', 'pflrr'] }) }),
          resolveName,
        ),
      ),
    ).toEqual([
      'progression.recruitedFrom: progression.acquisition.kizunaClashLimitedRareRecruit, progression.acquisition.pirateFestivalLimitedRareRecruit',
    ]);
  });

  it('names the Friend Point banner with the recruits, and any other banner by its name', () => {
    const card = buildHowToGetCard(
      progression({ acquisition: acquisition({ flags: ['rr'], banners: ['FP', 'Gala'] }) }),
      resolveName,
    );

    expect(keysOf(card)).toEqual([
      'progression.recruitedFrom: progression.acquisition.rareRecruit, progression.acquisition.friendPointBanner, progression.acquisition.bannerNamed',
    ]);
    expect(card?.lists[0]?.texts?.[2]).toEqual({
      key: 'progression.acquisition.bannerNamed',
      params: { name: 'Gala' },
    });
  });

  it('names each shop once, whether upstream records it in shops.js, in a flag, or both', () => {
    const card = buildHowToGetCard(
      progression({
        acquisition: acquisition({
          flags: ['shop', 'tmshop'],
          shops: ['Ray', 'TM', 'PKA', 'Garp'],
        }),
      }),
      resolveName,
    );

    expect(keysOf(card)).toEqual([
      'progression.soldIn: progression.acquisition.rayleighShop, progression.acquisition.treasureMapShop, progression.acquisition.pirateKingAdventuresShop, progression.acquisition.shopNamed',
    ]);
    // A shop upstream adds later still reads the way upstream shows it: "<name> Shop".
    expect(card?.lists[0]?.texts?.[3]).toEqual({
      key: 'progression.acquisition.shopNamed',
      params: { name: 'Garp' },
    });
    // The flag alone names the shop too: 30 of the 37 Rayleigh-flag units are in no shops.js list.
    expect(
      keysOf(
        buildHowToGetCard(
          progression({ acquisition: acquisition({ flags: ['shop'] }) }),
          resolveName,
        ),
      ),
    ).toEqual(['progression.soldIn: progression.acquisition.rayleighShop']);
  });

  it('says a unit is given as a Login Bonus or through a promo code', () => {
    expect(
      keysOf(
        buildHowToGetCard(
          progression({ acquisition: acquisition({ flags: ['promo', 'special'] }) }),
          resolveName,
        ),
      ),
    ).toEqual([
      'progression.givenThrough: progression.acquisition.loginBonus, progression.acquisition.promoCode',
    ]);
  });

  it('lists the recruits, the shops, the stages and the gifts in that order', () => {
    const card = buildHowToGetCard(
      progression({
        acquisition: acquisition({ flags: ['rr', 'special', 'shop'], banners: ['FP'] }),
        dropSources: [
          {
            group: 'Story Island',
            stage: 'Fushia Village',
            dropId: 'story1',
            slot: '1',
            global: true,
          },
        ],
      }),
      resolveName,
    );

    expect(card?.lists.map((list) => list.labelKey)).toEqual([
      'progression.recruitedFrom',
      'progression.soldIn',
      'progression.dropsFrom',
      'progression.givenThrough',
    ]);
    expect(card?.lists[2]).toEqual({
      labelKey: 'progression.dropsFrom',
      items: ['Fushia Village (Story Island)'],
    });
  });

  it('says a stage is Japan-only in the reader language', () => {
    const card = buildHowToGetCard(
      progression({
        dropSources: [
          { group: 'Raid', stage: 'Mihawk', dropId: 'raid1', slot: '1', global: false },
          { group: 'Raid', stage: 'Arlong', dropId: 'raid2', slot: '1', global: true },
        ],
      }),
      resolveName,
    );

    expect(card?.lists[0]?.items).toEqual(['Mihawk (Raid, JP only)', 'Arlong (Raid)']);
    expect(card?.lists[0]?.texts).toEqual([
      { key: 'progression.dropStageJapanOnly', params: { stage: 'Mihawk', group: 'Raid' } },
      null,
    ]);
  });

  it('says a unit that exists only as an evolution comes from evolving its earlier form', () => {
    expect(buildHowToGetCard(progression({ evolvesFrom: [16] }), resolveName)?.lists).toEqual([
      { labelKey: 'progression.byEvolving', items: ['Sogeking'] },
    ]);
    // With a source of its own, the evolution card already names the earlier form.
    expect(
      keysOf(
        buildHowToGetCard(
          progression({ evolvesFrom: [16], acquisition: acquisition({ flags: ['rr'] }) }),
          resolveName,
        ),
      ),
    ).toEqual(['progression.recruitedFrom: progression.acquisition.rareRecruit']);
  });

  it('renders NOTHING when nothing is recorded - never "not obtainable"', () => {
    expect(buildHowToGetCard(progression(), resolveName)).toBeNull();
  });
});

describe('the words, in English and Greek', () => {
  /** Every phrase the card can say: all flags, all six shops, both banners, a stage, a gift. */
  function everyText(): ProgressionDisplayText[] {
    const card = buildHowToGetCard(
      progression({
        acquisition: acquisition({
          flags: [
            'rr',
            'lrr',
            'tmlrr',
            'kclrr',
            'pflrr',
            'slrr',
            'superlrr',
            'annilrr',
            'promo',
            'special',
            'shop',
            'tmshop',
          ],
          shops: ['Ray', 'Medal', 'TM', 'Rumble', 'Kizuna', 'PKA', 'Garp'],
          banners: ['FP', 'Gala'],
        }),
        dropSources: [{ group: 'Raid', stage: 'Mihawk', dropId: 'r', slot: '1', global: false }],
      }),
      resolveName,
    );
    const texts = (card?.lists ?? []).flatMap((list) => list.texts ?? []);
    const plain = ['rr', 'lrr'].map(
      (flag) =>
        buildHowToGetCard(
          progression({ acquisition: acquisition({ flags: ['rr', flag] }) }),
          resolveName,
        )?.lists[0]?.texts?.[0],
    );

    return [...texts, ...plain].filter((text): text is ProgressionDisplayText => Boolean(text));
  }

  it('has every phrase and every label in both languages, with the same placeholders', () => {
    const keys = [
      'sections.howToGet',
      'progression.recruitedFrom',
      'progression.soldIn',
      'progression.dropsFrom',
      'progression.givenThrough',
      'progression.byEvolving',
      ...everyText().map((text) => text.key),
    ];

    // 6 limited kinds + Rare Recruit + limited + 2 banners + 7 shops + 2 gifts + a stage.
    expect(new Set(keys).size).toBe(6 + 20);

    for (const key of keys) {
      const english = lookup('en', key);
      const greek = lookup('el', key);

      expect(english, key).toBeTypeOf('string');
      expect(greek, key).toBeTypeOf('string');
      expect(placeholders(greek!), key).toEqual(placeholders(english!));
    }
  });
});

describe('over the shipped seed, through the repository', () => {
  let database: Database;
  let repository: OptcRepositoryService;

  beforeAll(async () => {
    database = await openSeedRows([3177, 779, 39, 1]);
    repository = Object.create(OptcRepositoryService.prototype) as OptcRepositoryService;
    Object.assign(repository, { databasePromise: Promise.resolve(database) });
  });

  afterAll(() => database.close());

  async function show(characterId: number, language: 'en' | 'el'): Promise<string[] | null> {
    const loaded = await repository.getCharacterProgression(characterId);
    const card = loaded ? buildHowToGetCard(loaded, () => null) : null;

    return card ? render(card, language) : null;
  }

  it('a Sugo-only Legend is recruited from the limited Rare Recruit', async () => {
    // Gol D. Roger - Captain of the Roger Pirates: upstream flags it rr + lrr, and nothing else.
    expect(await show(3177, 'en')).toEqual([
      'How to get it',
      'Recruited from: Limited Rare Recruit',
    ]);
    expect(await show(3177, 'el')).toEqual([
      'Πώς τον αποκτάς',
      'Βγαίνει από: Rare Recruit περιορισμένης διάρκειας',
    ]);
  });

  it("a Rayleigh Shop unit is sold in Rayleigh's shop", async () => {
    // Rebecca - Coliseum Sword Fighter: in shops.js under Ray, and in no other record.
    expect(await show(779, 'en')).toEqual(['How to get it', 'Sold in: Rayleigh Shop']);
    expect(await show(779, 'el')).toEqual([
      'Πώς τον αποκτάς',
      'Πωλείται στο: Κατάστημα του Rayleigh',
    ]);
  });

  it('a Friend Point unit is recruited from the Friend Point banner', async () => {
    // Buggy the Clown: in banners.js under FP, and in no other record.
    expect(await show(39, 'en')).toEqual(['How to get it', 'Recruited from: Friend Point banner']);
    expect(await show(39, 'el')).toEqual([
      'Πώς τον αποκτάς',
      'Βγαίνει από: Banner των Friend Points',
    ]);
  });

  it('a unit with no record still shows nothing', async () => {
    // Unit 1 listed "Smoker's Great Pursuit" until 869f63gm1: a score threshold read as unit 1.
    const loaded = await repository.getCharacterProgression(1);

    expect(loaded?.acquisition).toEqual(NONE);
    expect(loaded?.dropSources).toEqual([]);
    expect(await show(1, 'en')).toBeNull();
  });
});

describe('the Character screen', () => {
  it('puts the card last in its section, from the progression it loads', async () => {
    const repository = {
      getCharacterProgression: vi.fn(async () =>
        progression({
          characterId: 779,
          maxSockets: 5,
          acquisition: acquisition({ shops: ['Ray'] }),
        }),
      ),
      getDetailedCharactersByIds: vi.fn(async () => []),
    };
    const page = new CharacterDetailPage(
      {} as never,
      repository as never,
      { favoriteCharacterIds: signal<number[]>([]) } as never,
      {} as never,
      { translate: (key: string) => key } as never,
    );

    await (
      page as unknown as { loadProgression(character: CharacterDetailRecord): Promise<void> }
    ).loadProgression({ id: 779, cost: 30, detail: { captainAbility: null } } as never);

    expect(page.progressionCards().map((card) => card.titleKey)).toEqual([
      'sections.investment',
      'sections.howToGet',
    ]);
    expect(keysOf(page.progressionCards()[1] ?? null)).toEqual([
      'progression.soldIn: progression.acquisition.rayleighShop',
    ]);
  });

  it('shows a phrase in place of its item, in the reader language', () => {
    const template = readFileSync(
      resolve(process.cwd(), 'src/app/pages/character-detail/character-detail.page.html'),
      'utf8',
    );

    expect(template).toMatch(
      /@if \(list\.texts\?\.\[\$index\]; as text\) \{\s*\{\{ t\(text\.key, text\.params\) \}\}\s*\} @else \{\s*\{\{ item \}\}\s*\}/u,
    );
  });
});

type Copy = Record<string, unknown>;

const COPY: Record<'en' | 'el', Copy> = {
  en: readCopy('en'),
  el: readCopy('el'),
};

function readCopy(language: 'en' | 'el'): Copy {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `public/i18n/character-detail/${language}.json`), 'utf8'),
  ) as Copy;
}

function lookup(language: 'en' | 'el', key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Copy | undefined)?.[part], COPY[language]);

  return typeof value === 'string' ? value : undefined;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/gu)].map((match) => match[1]!).sort();
}

function translate(language: 'en' | 'el', text: ProgressionDisplayText): string {
  return lookup(language, text.key)!.replace(/\{\{\s*(\w+)\s*\}\}/gu, (_whole, name: string) =>
    String(text.params?.[name] ?? ''),
  );
}

/** The card as a reader sees it: the title, then one `Label: item | item` line per list. */
function render(card: ProgressionDisplayCard, language: 'en' | 'el'): string[] {
  return [
    lookup(language, card.titleKey)!,
    ...card.lists.map(
      (list) =>
        `${lookup(language, list.labelKey)}: ${list.items
          .map((item, index) => {
            const text = list.texts?.[index];

            return text ? translate(language, text) : item;
          })
          .join(' | ')}`,
    ),
  ];
}

/**
 * A database holding the committed seed's tables, and those characters' rows in every table - the
 * real schema and the real rows, without executing 28 MB of SQL for four characters.
 */
async function openSeedRows(ids: readonly number[]): Promise<Database> {
  const seed = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const wanted = new Set(ids);
  const statements = splitSqlStatements(seed).filter((statement) => {
    if (statement.startsWith('CREATE TABLE')) {
      return true;
    }

    const match = /^INSERT INTO character\w*\s*\([^)]*\)\s*VALUES\s*\(\s*(\d+),/u.exec(statement);

    return match !== null && wanted.has(Number(match[1]));
  });
  const initSqlJs = (await import('sql.js')).default;
  const SQL: SqlJsStatic = await initSqlJs();
  const database = new SQL.Database();

  database.run(statements.join('\n'));

  return database;
}

/** Statements split on `;` outside quoted strings, each trimmed. */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let inString = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];

    if (character === "'") {
      inString = !inString;
    } else if (character === ';' && !inString) {
      statements.push(sql.slice(start, index + 1).trim());
      start = index + 1;
    }
  }

  return statements.filter((statement) => statement.length > 0);
}

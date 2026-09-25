import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type CharacterDetail, type CharacterDetailRecord } from '../../core/models/optc.models';
import {
  buildCharacterDetailViewModel,
  type DetailDisplayCard,
  type DetailDisplayLine,
} from './character-detail.presenter';

/*
 * 869f63gz3. The Character screen says what a support fires by itself, and when - its own line
 * under the support, "Auto+: at stage 3, fires the supported character's Special by itself", in the
 * reader's language - and the support text above it no longer shows the dataset's `<b>` tags.
 *
 * No TestBed, like every page spec here: the view model is built by the real presenter, each line is
 * resolved against the real copy the way the template's `t()` resolves it, and the template is read
 * as the source it is.
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

/** One line as the template renders it: the label, a colon, then every token in order. */
function shown(line: DetailDisplayLine, language: Language): string {
  const label = line.labelKey ? `${translate(language, line.labelKey)}: ` : '';

  return (
    label +
    line.tokens
      .map((token) => (token.key ? translate(language, token.key, token.params) : token.text))
      .join('')
  );
}

function supportCard(detail: Partial<CharacterDetail>): DetailDisplayCard | undefined {
  return buildCharacterDetailViewModel(createRecord(detail))
    .groups.flatMap((group) => group.cards)
    .find((card) => card.titleKey === 'sections.supportData');
}

function autoPlusLines(description: string): DetailDisplayLine[] {
  const card = supportCard({
    supportData: [{ supportedCharactersText: 'All characters', levelDescriptions: [description] }],
  });

  return card?.entries.flatMap((entry) => entry.lines ?? []) ?? [];
}

const MARKER = '<b>[AUTO+]</b>';
const FINAL_EN = "Auto+: at the final stage, fires the supported character's Special by itself";
const FINAL_EL =
  'Auto+: στο τελευταίο stage, ενεργοποιεί αυτόματα το Special του υποστηριζόμενου χαρακτήρα';
const FINAL_SPECIAL = "When you reach the final stage, activates supported character's Special.";

describe('character detail: the Auto+ line under a support', () => {
  const phrasings: ReadonlyArray<{ clause: string; en: string[]; el: string[] }> = [
    {
      clause: "When you reach the 1st stage, activates supported character's Special.",
      en: ["Auto+: at stage 1, fires the supported character's Special by itself"],
      el: ['Auto+: στο stage 1, ενεργοποιεί αυτόματα το Special του υποστηριζόμενου χαρακτήρα'],
    },
    {
      clause: `When you reach the 1st stage, activates supported character's Super Effect. ${FINAL_SPECIAL}`,
      en: ["Auto+: at stage 1, fires the supported character's Super Effect by itself", FINAL_EN],
      el: [
        'Auto+: στο stage 1, ενεργοποιεί αυτόματα το Super Effect του υποστηριζόμενου χαρακτήρα',
        FINAL_EL,
      ],
    },
    {
      clause: `When you reach the 3rd stage, activates supported character's Switch Effect. ${FINAL_SPECIAL}`,
      en: ["Auto+: at stage 3, fires the supported character's Switch Effect by itself", FINAL_EN],
      el: [
        'Auto+: στο stage 3, ενεργοποιεί αυτόματα το Switch Effect του υποστηριζόμενου χαρακτήρα',
        FINAL_EL,
      ],
    },
    {
      // The one sentence nothing reads: shown as the dataset wrote it, in both languages.
      clause: `Supported character is more likely to hit PERFECTs. ${FINAL_SPECIAL}`,
      en: ['Auto+: Supported character is more likely to hit PERFECTs.', FINAL_EN],
      el: ['Auto+: Supported character is more likely to hit PERFECTs.', FINAL_EL],
    },
    {
      clause: "Does not activate supported character's Special.",
      en: ["Auto+: never fires the supported character's Special by itself"],
      el: [
        'Auto+: δεν ενεργοποιεί ποτέ αυτόματα το Special του υποστηριζόμενου χαρακτήρα',
      ],
    },
    {
      clause: "When you reach the 2nd stage, activates supported character's Super Effect.",
      en: ["Auto+: at stage 2, fires the supported character's Super Effect by itself"],
      el: ['Auto+: στο stage 2, ενεργοποιεί αυτόματα το Super Effect του υποστηριζόμενου χαρακτήρα'],
    },
    {
      clause:
        "When an enemy inflicts you with ATK Down or Paralysis or when you reach the final stage, activates supported character's Special.",
      en: [
        "Auto+: when an enemy inflicts you with ATK Down or Paralysis or at the final stage, fires the supported character's Special by itself",
      ],
      el: [
        'Auto+: όταν ένας εχθρός σού προκαλεί ATK Down ή Paralysis ή στο τελευταίο stage, ενεργοποιεί αυτόματα το Special του υποστηριζόμενου χαρακτήρα',
      ],
    },
    {
      clause:
        "When you reach the final stage and an enemy applies Territory, activates supported character's Special.",
      en: [
        "Auto+: at the final stage, when an enemy applies Territory, fires the supported character's Special by itself",
      ],
      el: [
        'Auto+: στο τελευταίο stage, όταν ένας εχθρός εφαρμόζει Territory, ενεργοποιεί αυτόματα το Special του υποστηριζόμενου χαρακτήρα',
      ],
    },
    {
      clause:
        "When an enemy inflicts you with Despair or when you reach the final stage, activates supported character's Special.",
      en: [
        "Auto+: when an enemy inflicts you with Despair or at the final stage, fires the supported character's Special by itself",
      ],
      el: [
        'Auto+: όταν ένας εχθρός σού προκαλεί Despair ή στο τελευταίο stage, ενεργοποιεί αυτόματα το Special του υποστηριζόμενου χαρακτήρα',
      ],
    },
    {
      clause:
        "When enemy launches DEF Up status and at final battle, activates supported character's Special",
      en: [
        "Auto+: at the final stage, when an enemy applies DEF Up, fires the supported character's Special by itself",
      ],
      el: [
        'Auto+: στο τελευταίο stage, όταν ένας εχθρός εφαρμόζει DEF Up, ενεργοποιεί αυτόματα το Special του υποστηριζόμενου χαρακτήρα',
      ],
    },
    {
      // Two effects, two lines: no sentence has to join them in an order only English allows.
      clause: "When you reach the 2nd stage, activates supported character's Super Effect and Special.",
      en: [
        "Auto+: at stage 2, fires the supported character's Super Effect by itself",
        "Auto+: at stage 2, fires the supported character's Special by itself",
      ],
      el: [
        'Auto+: στο stage 2, ενεργοποιεί αυτόματα το Super Effect του υποστηριζόμενου χαρακτήρα',
        'Auto+: στο stage 2, ενεργοποιεί αυτόματα το Special του υποστηριζόμενου χαρακτήρα',
      ],
    },
    {
      clause:
        "When an enemy has a Barrier or when you reach the final stage, activates supported character's Special.",
      en: [
        "Auto+: when an enemy has a Barrier or at the final stage, fires the supported character's Special by itself",
      ],
      el: [
        'Auto+: όταν ένας εχθρός έχει Barrier ή στο τελευταίο stage, ενεργοποιεί αυτόματα το Special του υποστηριζόμενου χαρακτήρα',
      ],
    },
    {
      clause: `When an enemy has a Barrier, activates supported character's Super Effect. ${FINAL_SPECIAL}`,
      en: [
        "Auto+: when an enemy has a Barrier, fires the supported character's Super Effect by itself",
        FINAL_EN,
      ],
      el: [
        'Auto+: όταν ένας εχθρός έχει Barrier, ενεργοποιεί αυτόματα το Super Effect του υποστηριζόμενου χαρακτήρα',
        FINAL_EL,
      ],
    },
  ];

  it('covers the thirteen phrasings the shipped seed carries', () => {
    expect(new Set(phrasings.map((entry) => entry.clause)).size).toBe(13);
  });

  it.each(phrasings)('reads "$clause" in English and in Greek', ({ clause, en, el }) => {
    const lines = autoPlusLines(`Reduces enemies' Resilience duration by 3 turns. ${MARKER} ${clause}`);

    expect(lines.map((line) => shown(line, 'en'))).toEqual(en);
    expect(lines.map((line) => shown(line, 'el'))).toEqual(el);
  });

  it('adds no line to a support without Auto+', () => {
    expect(autoPlusLines('Boosts ATK of supported character by 1.5x.')).toEqual([]);
  });

  it('translates every sentence it builds, and keeps the game terms English', () => {
    const keys = new Set(
      phrasings.flatMap(({ clause }) =>
        autoPlusLines(`${MARKER} ${clause}`).flatMap((line) =>
          line.tokens.flatMap((token) => (token.key ? [token.key] : [])),
        ),
      ),
    );

    // Every key the lines use today, so a key added without copy cannot slip past.
    expect([...keys].sort()).toEqual([
      'support.autoPlus.enemyApplies',
      'support.autoPlus.enemyBarrier',
      'support.autoPlus.enemyInflicts',
      'support.autoPlus.finalStage',
      'support.autoPlus.fires',
      'support.autoPlus.neverFires',
      'support.autoPlus.or',
      'support.autoPlus.stage',
    ]);

    for (const key of keys) {
      const english = leaf('en', key);
      const greek = leaf('el', key);

      expect(english, key).toBeTypeOf('string');
      expect(greek, `${key} is still the English string`).not.toBe(english);
      expect(greek, `${key} contains no Greek`).toMatch(/[Ͱ-Ͽἀ-῿]/u);
    }

    // "Auto+" is the game's own name for it, in both languages.
    expect(leaf('en', 'support.autoPlus.label')).toBe('Auto+');
    expect(leaf('el', 'support.autoPlus.label')).toBe('Auto+');
  });

  it('can follow the first status with more, because both languages end on it', () => {
    // A second status is appended after the key's text: "... ATK Down or Paralysis".
    for (const language of ['en', 'el'] as const) {
      expect(leaf(language, 'support.autoPlus.enemyInflicts')).toMatch(/\{\{status\}\}$/u);
    }
  });
});

/** Every character detail in the committed seed, as the importer wrote it. */
function readSeedDetails(): Map<number, CharacterDetail> {
  const sql = read('public/assets/data/optc-seed.sql');
  const details = new Map<number, CharacterDetail>();

  for (const match of sql.matchAll(
    /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu,
  )) {
    details.set(Number(match[1]), JSON.parse(match[2]!.replace(/''/gu, "'")) as CharacterDetail);
  }

  return details;
}

describe('character detail: support text without the dataset markup', () => {
  const details = readSeedDetails();
  const withMarkup = [...details.values()].filter((detail) =>
    detail.supportData.some((entry) =>
      [entry.supportedCharactersText, ...entry.levelDescriptions].some((text) => /<[a-z/]/iu.test(text)),
    ),
  );

  /** Every string the support card puts on screen, labels aside. */
  function shownStrings(card: DetailDisplayCard | undefined): string[] {
    return (card?.entries ?? []).flatMap((entry) => [
      ...entry.rows.map((row) => row.value),
      ...entry.lists.flatMap((list) => list.items),
      ...(entry.lines ?? []).flatMap((line) => line.tokens.map((token) => token.text ?? '')),
    ]);
  }

  it('has supports carrying markup in the shipped seed, so the check below reads something', () => {
    expect(withMarkup.length).toBeGreaterThan(0);
  });

  it('shows no tag and no entity in any string of their support card', () => {
    for (const detail of withMarkup) {
      const strings = shownStrings(supportCard(detail));

      expect(strings.length, `character ${detail.characterId}`).toBeGreaterThan(0);

      for (const text of strings) {
        expect(text, `character ${detail.characterId}`).not.toMatch(/<\/?[a-z]|&(?:lt|gt|amp|quot);/iu);
      }
    }
  });

  it('keeps the words the tags wrapped - the marker is still there, as text', () => {
    const [text] = shownStrings(
      supportCard({
        supportData: [
          {
            supportedCharactersText: 'Cerebral [Child], [Giant] characters',
            levelDescriptions: [
              `Once per adventure, reduces enemies' Resilience duration by 3 turns. ${MARKER} ${FINAL_SPECIAL}`,
            ],
          },
        ],
      }),
    ).slice(1);

    expect(text).toBe(
      `Once per adventure, reduces enemies' Resilience duration by 3 turns. [AUTO+] ${FINAL_SPECIAL}`,
    );
  });

  it('leaves support text that carries no markup exactly as it was', () => {
    // The control: the normaliser changes the markup rows and nothing else.
    const plain = 'Boosts Color Affinity of supported character by 1.5x.';

    expect(shownStrings(supportCard({ supportData: [{ supportedCharactersText: '[STR] Powerhouse characters', levelDescriptions: [plain] }] }))).toEqual([
      '[STR] Powerhouse characters',
      plain,
    ]);
  });
});

describe('character detail template: the lines under an entry', () => {
  const template = read('src/app/pages/character-detail/character-detail.page.html');
  const entryLoop = template.indexOf('@for (entry of card.entries; track $index) {');
  const block = template.indexOf('@if (entry.lines?.length) {');

  it('sits inside the loop over a card\'s entries, after the entry\'s lists', () => {
    expect(entryLoop).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(entryLoop);
    expect(block).toBeGreaterThan(template.indexOf('@for (list of entry.lists; track $index) {'));
  });

  it('renders the label, then every token - a key through t(), text as it is', () => {
    const body = template.slice(block, template.indexOf('</section>', block));

    expect(body).toContain('@for (line of entry.lines; track $index) {');
    expect(body).toContain("@if (line.labelKey) {<strong>{{ t(line.labelKey) }}: </strong>}");
    expect(body).toContain(
      '@for (token of line.tokens; track $index) {@if (token.key) {{{ t(token.key, token.params) }}} @else {{{ token.text }}}}',
    );
  });

  it('never binds dataset text as HTML', () => {
    expect(template).not.toMatch(/innerHTML/u);
  });
});

function createRecord(detail: Partial<CharacterDetail>): CharacterDetailRecord {
  return {
    id: 4646,
    name: 'Ange',
    searchText: 'ange',
    isIncomplete: false,
    type: 'INT',
    classes: ['Cerebral'],
    primaryClass: 'Cerebral',
    secondaryClass: null,
    stars: 5,
    cost: 1,
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
      characterId: 4646,
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

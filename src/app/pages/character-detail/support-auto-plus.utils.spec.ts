import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeHtmlToText } from '../../core/services/html-text.utils';
import {
  readSupportAutoPlus,
  type SupportAutoPlusEffect,
  type SupportAutoPlusReading,
  type SupportAutoPlusTrigger,
} from './support-auto-plus.utils';

/*
 * 869f63gz3. The Auto+ clause of a support, read into a trigger and an effect.
 *
 * The first half pins the 13 phrasings the shipped seed carried on 2026-09-25, verbatim, with the
 * marker written the way the dataset writes it. They are literals rather than rows read at run time
 * on purpose: the seed moves at release time, and a phrasing it stops carrying must not take a test
 * with it. The second half runs the parser over whatever the seed carries now and holds only what
 * must stay true of any phrasing - nothing is dropped, and nothing is invented.
 */

const MARKER = '<b>[AUTO+]</b>';

const stage = (number: number): SupportAutoPlusTrigger => ({ kind: 'stage', stage: number });
const FINAL: SupportAutoPlusTrigger = { kind: 'final-stage' };
const BARRIER: SupportAutoPlusTrigger = { kind: 'enemy-barrier' };

function fires(
  source: string,
  triggers: SupportAutoPlusTrigger[],
  effects: SupportAutoPlusEffect[],
  join: 'any' | 'all' | null = null,
): SupportAutoPlusReading {
  return { kind: 'fires', triggers, join, effects, source };
}

const FIRST_STAGE_SUPER =
  "When you reach the 1st stage, activates supported character's Super Effect.";
const FINAL_SPECIAL = "When you reach the final stage, activates supported character's Special.";

describe('readSupportAutoPlus over the thirteen phrasings of the shipped seed', () => {
  const phrasings: ReadonlyArray<{
    carriedBy: string;
    clause: string;
    readings: SupportAutoPlusReading[];
  }> = [
    {
      carriedBy: '2936 and eleven more',
      clause: "When you reach the 1st stage, activates supported character's Special.",
      readings: [
        fires("When you reach the 1st stage, activates supported character's Special.", [stage(1)], [
          'Special',
        ]),
      ],
    },
    {
      carriedBy: '2938 and ten more',
      clause: `${FIRST_STAGE_SUPER} ${FINAL_SPECIAL}`,
      readings: [
        fires(FIRST_STAGE_SUPER, [stage(1)], ['Super Effect']),
        fires(FINAL_SPECIAL, [FINAL], ['Special']),
      ],
    },
    {
      carriedBy: '2950 and six more',
      clause: `When you reach the 3rd stage, activates supported character's Switch Effect. ${FINAL_SPECIAL}`,
      readings: [
        fires(
          "When you reach the 3rd stage, activates supported character's Switch Effect.",
          [stage(3)],
          ['Switch Effect'],
        ),
        fires(FINAL_SPECIAL, [FINAL], ['Special']),
      ],
    },
    {
      carriedBy: '2952',
      clause: `Supported character is more likely to hit PERFECTs. ${FINAL_SPECIAL}`,
      readings: [
        // Not a trigger and an effect: it comes back whole, and the sentence after it still reads.
        { kind: 'unrecognised', source: 'Supported character is more likely to hit PERFECTs.' },
        fires(FINAL_SPECIAL, [FINAL], ['Special']),
      ],
    },
    {
      carriedBy: '3884 and 4542',
      clause: "Does not activate supported character's Special.",
      readings: [
        {
          kind: 'never-fires',
          triggers: [],
          join: null,
          effects: ['Special'],
          source: "Does not activate supported character's Special.",
        },
      ],
    },
    {
      carriedBy: '4534',
      clause: "When you reach the 2nd stage, activates supported character's Super Effect.",
      readings: [
        fires(
          "When you reach the 2nd stage, activates supported character's Super Effect.",
          [stage(2)],
          ['Super Effect'],
        ),
      ],
    },
    {
      carriedBy: '4567',
      clause:
        "When an enemy inflicts you with ATK Down or Paralysis or when you reach the final stage, activates supported character's Special.",
      readings: [
        fires(
          "When an enemy inflicts you with ATK Down or Paralysis or when you reach the final stage, activates supported character's Special.",
          [{ kind: 'enemy-inflicts', statuses: ['ATK Down', 'Paralysis'] }, FINAL],
          ['Special'],
          'any',
        ),
      ],
    },
    {
      carriedBy: '4568',
      clause:
        "When you reach the final stage and an enemy applies Territory, activates supported character's Special.",
      readings: [
        fires(
          "When you reach the final stage and an enemy applies Territory, activates supported character's Special.",
          [FINAL, { kind: 'enemy-applies', status: 'Territory' }],
          ['Special'],
          'all',
        ),
      ],
    },
    {
      carriedBy: '4599',
      clause:
        "When an enemy inflicts you with Despair or when you reach the final stage, activates supported character's Special.",
      readings: [
        fires(
          "When an enemy inflicts you with Despair or when you reach the final stage, activates supported character's Special.",
          [{ kind: 'enemy-inflicts', statuses: ['Despair'] }, FINAL],
          ['Special'],
          'any',
        ),
      ],
    },
    {
      // The one with no full stop, and the one that says "at final battle".
      carriedBy: '4600',
      clause:
        "When enemy launches DEF Up status and at final battle, activates supported character's Special",
      readings: [
        fires(
          "When enemy launches DEF Up status and at final battle, activates supported character's Special",
          [{ kind: 'enemy-applies', status: 'DEF Up' }, FINAL],
          ['Special'],
          'all',
        ),
      ],
    },
    {
      carriedBy: '4632',
      clause: "When you reach the 2nd stage, activates supported character's Super Effect and Special.",
      readings: [
        fires(
          "When you reach the 2nd stage, activates supported character's Super Effect and Special.",
          [stage(2)],
          ['Super Effect', 'Special'],
        ),
      ],
    },
    {
      carriedBy: '4643',
      clause:
        "When an enemy has a Barrier or when you reach the final stage, activates supported character's Special.",
      readings: [
        fires(
          "When an enemy has a Barrier or when you reach the final stage, activates supported character's Special.",
          [BARRIER, FINAL],
          ['Special'],
          'any',
        ),
      ],
    },
    {
      carriedBy: '4645 and 4646',
      clause: `When an enemy has a Barrier, activates supported character's Super Effect. ${FINAL_SPECIAL}`,
      readings: [
        fires(
          "When an enemy has a Barrier, activates supported character's Super Effect.",
          [BARRIER],
          ['Super Effect'],
        ),
        fires(FINAL_SPECIAL, [FINAL], ['Special']),
      ],
    },
  ];

  it('holds thirteen distinct phrasings', () => {
    expect(new Set(phrasings.map((entry) => entry.clause)).size).toBe(13);
  });

  it.each(phrasings)('reads the phrasing carried by $carriedBy', ({ clause, readings }) => {
    expect(readSupportAutoPlus(`Boosts ATK of supported character by 1.5x. ${MARKER} ${clause}`)).toEqual(
      readings,
    );
  });

  it('reads every stage the dataset numbers, from its own ordinal', () => {
    for (const [ordinal, number] of [
      ['1st', 1],
      ['2nd', 2],
      ['3rd', 3],
      ['4th', 4],
      ['5th', 5],
    ] as const) {
      const [reading] = readSupportAutoPlus(
        `${MARKER} When you reach the ${ordinal} stage, activates supported character's Special.`,
      );

      expect(reading).toMatchObject({ kind: 'fires', triggers: [stage(number)] });
    }
  });

  it('reads the marker with and without the bold tags, and never the text before it', () => {
    const bare = readSupportAutoPlus(
      "Adds 20% of this character's base HP to the supported character's base HP. [AUTO+] Does not activate supported character's Special.",
    );
    const bold = readSupportAutoPlus(
      `Adds 20% of this character's base HP to the supported character's base HP. ${MARKER} Does not activate supported character's Special.`,
    );

    expect(bare).toEqual(bold);
    expect(bare).toHaveLength(1);
    expect(readSupportAutoPlus("Boosts ATK of supported character by 1.5x. When you reach the 1st stage, activates supported character's Special.")).toEqual([]);
  });
});

describe('readSupportAutoPlus when it does not recognise a sentence', () => {
  it.each([
    ['a trigger it does not know', "When your HP is below 30%, activates supported character's Special."],
    ['an effect it does not know', "When you reach the 2nd stage, activates supported character's Captain Ability."],
    ['a status joined with "and"', "When an enemy inflicts you with ATK Down and Paralysis, activates supported character's Special."],
    ['a status not written as a status', "When an enemy applies a new buff, activates supported character's Special."],
    ['an "or" and an "and" in one trigger', "When an enemy has a Barrier or when you reach the 2nd stage and an enemy applies Territory, activates supported character's Special."],
    ['a stage numbered zero', "When you reach the 0th stage, activates supported character's Special."],
    ['a conditional "does not activate"', "When you reach the 2nd stage, does not activate supported character's Special."],
  ])('comes back whole for %s - never dropped, never guessed at', (_label, sentence) => {
    expect(readSupportAutoPlus(`${MARKER} ${sentence}`)).toEqual([
      { kind: 'unrecognised', source: sentence },
    ]);
  });

  it('keeps reading the sentences around one it does not know', () => {
    const readings = readSupportAutoPlus(
      `${MARKER} Supported character glows. ${FINAL_SPECIAL} Supported character hums.`,
    );

    expect(readings.map((reading) => reading.kind)).toEqual(['unrecognised', 'fires', 'unrecognised']);
    expect(readings.map((reading) => reading.source)).toEqual([
      'Supported character glows.',
      FINAL_SPECIAL,
      'Supported character hums.',
    ]);
  });

  it('reads nothing from empty or missing text', () => {
    expect(readSupportAutoPlus(null)).toEqual([]);
    expect(readSupportAutoPlus(undefined)).toEqual([]);
    expect(readSupportAutoPlus('')).toEqual([]);
    expect(readSupportAutoPlus(`Boosts ATK. ${MARKER}`)).toEqual([]);
  });
});

/** Every support description in the committed seed, as the importer wrote it. */
function readSeedSupportDescriptions(): string[] {
  const sql = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const descriptions: string[] = [];

  for (const match of sql.matchAll(
    /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu,
  )) {
    const detail = JSON.parse(match[2]!.replace(/''/gu, "'")) as {
      supportData?: Array<{ levelDescriptions?: string[] }>;
    };

    for (const entry of detail.supportData ?? []) {
      descriptions.push(...(entry.levelDescriptions ?? []));
    }
  }

  return descriptions;
}

describe('readSupportAutoPlus over every support the shipped seed carries', () => {
  const descriptions = readSeedSupportDescriptions();
  const withAutoPlus = descriptions.filter((description) => description.includes('[AUTO+]'));

  it('has Auto+ supports to read, and supports without one', () => {
    // Without these two the assertions below would pass over nothing.
    expect(withAutoPlus.length).toBeGreaterThan(0);
    expect(descriptions.length).toBeGreaterThan(withAutoPlus.length);
  });

  it('drops no sentence: the readings put back together are the clause', () => {
    for (const description of withAutoPlus) {
      const clause = normalizeHtmlToText(description).split('[AUTO+]').slice(1).join(' ').trim();

      expect(
        readSupportAutoPlus(description)
          .map((reading) => reading.source)
          .join(' '),
        description,
      ).toBe(clause);
    }
  });

  it('invents no stage: every stage it reads is written in its own sentence', () => {
    for (const description of withAutoPlus) {
      for (const reading of readSupportAutoPlus(description)) {
        if (reading.kind === 'unrecognised') {
          continue;
        }

        for (const trigger of reading.triggers) {
          if (trigger.kind === 'stage') {
            expect(reading.source).toMatch(new RegExp(`\\b${trigger.stage}(?:st|nd|rd|th) stage\\b`, 'u'));
          }
        }
      }
    }
  });

  it('reads nothing from a support without the marker', () => {
    for (const description of descriptions.filter((entry) => !entry.includes('[AUTO+]'))) {
      expect(readSupportAutoPlus(description)).toEqual([]);
    }
  });
});

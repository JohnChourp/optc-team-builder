import { describe, expect, it } from 'vitest';

import { readDatasetStages, stageKey } from './check-content-ladder.mjs';
import {
  parsePublishedTeams,
  readCharacterIds,
  readSameCharacterKeys,
  validatePublishedTeams,
} from './check-published-teams.mjs';

/*
 * 869f63grj. The published-teams guard checks the rule the app enforces: the one copy in
 * `src/app/core/grammar/same-character-keys.ts` (upstream's families first), and the Captain as
 * well as the four subs. It used to read the dataset's name-derived keys and compare the subs
 * only, so it passed teams the app would refuse.
 */

const RATIONALE = {
  en: 'A worked example for this spec, long enough to count as a rationale: it names nothing but the six characters it holds.',
  el: 'Ένα παράδειγμα για αυτό το spec, αρκετά μεγάλο για να μετρήσει ως αιτιολόγηση: δεν αναφέρει τίποτα άλλο από τους έξι χαρακτήρες του.',
};

function tinySeed(
  rows: ReadonlyArray<{ id: number; name: string; families: string[]; keys?: string[] }>,
): string {
  const statements = [
    'CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT NOT NULL, families_json TEXT NOT NULL);',
    'CREATE TABLE character_details (character_id INTEGER PRIMARY KEY, detail_json TEXT NOT NULL);',
  ];

  for (const row of rows) {
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

    statements.push(
      `INSERT INTO characters (id, name, families_json) VALUES (${row.id}, ${quote(row.name)}, ${quote(JSON.stringify(row.families))});`,
      `INSERT INTO character_details (character_id, detail_json) VALUES (${row.id}, ${quote(JSON.stringify({ partyConflictKeys: row.keys ?? [] }))});`,
    );
  }

  return `${statements.join('\n')}\n`;
}

describe('readSameCharacterKeys', () => {
  it('reads each unit through the app rule: families, else the name, and an override over both', async () => {
    const keys = await readSameCharacterKeys({
      sql: tinySeed([
        {
          id: 1,
          name: 'Lucy - Corrida Coliseum C-Block Mystery Gladiator',
          families: ['Monkey D. Luffy'],
        },
        { id: 2, name: 'Monkey D. Luffy - Warrior in White Going Wild', families: [] },
        { id: 3, name: 'BB - Whale Forest Guardian', families: ['Blackback', 'BB'] },
      ]),
      overrides: new Map([[3, ['blackback']]]),
    });

    expect(keys.get(1)).toEqual(['monkey d. luffy']);
    expect(keys.get(2)).toContain('monkey d. luffy');
    expect(keys.get(3)).toEqual(['blackback']);
  });
});

describe('the Captain and the subs', () => {
  const stages = new Set([stageKey('Raid', 'Clash!! Buster Call')]);
  const characterIds = new Set([1, 2, 3, 4, 5, 6, 7]);
  const conflictKeys = new Map<number, string[]>([
    [1, ['monkey d. luffy']],
    [2, ['monkey d. luffy']],
    [3, ['nami']],
    [4, ['roronoa zoro']],
    [5, ['usopp']],
    [6, ['sanji']],
    [7, ['tony tony chopper']],
  ]);
  const check = (slots: Array<number | null>) =>
    validatePublishedTeams({
      entries: [
        {
          id: 'spec-team',
          group: 'Raid',
          stage: 'Clash!! Buster Call',
          slots,
          rationale: RATIONALE,
          curatedOn: '2026-09-24',
          workedExample: true,
        },
      ],
      found: true,
      stages,
      characterIds,
      conflictKeys,
      today: new Date('2026-09-25T00:00:00Z'),
    });

  it('MUTATION - a sub that repeats the Captain goes red', () => {
    const result = check([1, null, 2, 3, 4, 5]);

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('A sub may not repeat the Captain');
  });

  it('lets the Friend Captain repeat the Captain, and a sub repeat the Friend Captain', () => {
    expect(check([1, 2, 3, 4, 5, 6]).ok).toBe(true);
    expect(check([3, 1, 2, 4, 5, 6]).ok).toBe(true);
  });
});

describe('the shipped seed and teams', () => {
  it('passes both published teams, and fires on a Captain repeated by a sub under another name', async () => {
    const conflictKeys = await readSameCharacterKeys();
    const stages = readDatasetStages();
    const characterIds = readCharacterIds();
    const { entries, found } = parsePublishedTeams();
    const verdict = (teams: Record<string, unknown>[]) =>
      validatePublishedTeams({ entries: teams, found, stages, characterIds, conflictKeys });

    expect(entries).toHaveLength(2);
    expect(verdict(entries).errors).toEqual([]);

    // The control: #1 Monkey D. Luffy as Captain and #1791 Lucy as a sub. Lucy is Luffy in the
    // game and in upstream's families; the name-derived keys never said so, and the old guard did
    // not look at the Captain at all.
    const [freeSpirit] = entries.filter((entry) => entry['id'] === 'free-spirit-crew');
    const slots = [...(freeSpirit!['slots'] as number[])];

    slots[0] = 1;
    slots[2] = 1791;

    const control = verdict([{ ...freeSpirit, slots }]);

    expect(control.ok).toBe(false);
    expect(control.errors.join('\n')).toContain('A sub may not repeat the Captain');
  });
});

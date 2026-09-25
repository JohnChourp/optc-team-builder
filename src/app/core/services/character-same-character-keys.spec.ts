import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  readPartyConflictOverrides,
  resolveSameCharacterKeys,
} from '../grammar/same-character-keys';
import { type CharacterDetailRecord, type CharacterListItem } from '../models/optc.models';
import {
  maySlotHoldCharacter,
  resolveCharacterPartyConflictKeys,
  resolveCharacterSameCharacterKeys,
  TEAM_FRIEND_CAPTAIN_SLOT_INDEX,
} from './character-party-conflict-keys.utils';

/*
 * 869f63grj. Which cards are the same in-game character: upstream's families first, the name rule
 * only for a unit upstream names no family for, and the override file for a unit upstream gets
 * wrong. The name rule these replace disagreed with upstream's families.js on 18,449 unit pairs.
 *
 * The first half drives the rule on hand-built cards. The second half runs it over the shipped seed:
 * the 26 disagreeing pairs the audit sampled against the game, and the two override entries that
 * exist because upstream's data is wrong.
 */

/** What the app hands the rule: a list record, with the detail when the caller has one. */
type Card = Pick<CharacterListItem, 'id' | 'name' | 'families'> &
  Partial<Pick<CharacterDetailRecord, 'detail'>>;

/** Only the detail field the name rule reads, which is all these cards need. */
function nameKeysDetail(partyConflictKeys: string[]): CharacterDetailRecord['detail'] {
  return { partyConflictKeys } as unknown as CharacterDetailRecord['detail'];
}

function sameCharacter(left: Card, right: Card): boolean {
  const keys = new Set(resolveCharacterSameCharacterKeys(left));

  return resolveCharacterSameCharacterKeys(right).some((key) => keys.has(key));
}

function sameByName(left: Card, right: Card): boolean {
  const keys = new Set(resolveCharacterPartyConflictKeys(left));

  return resolveCharacterPartyConflictKeys(right).some((key) => keys.has(key));
}

// Ids in the reserved manual range, so no override entry can apply to them.
const LUFFY: Card = { id: 900001, name: 'Monkey D. Luffy', families: ['Monkey D. Luffy'] };
const LUCY: Card = {
  id: 900002,
  name: 'Lucy - Corrida Coliseum C-Block Mystery Gladiator',
  families: ['Monkey D. Luffy'],
};
const DOFLAMINGO_NEO: Card = {
  id: 900003,
  name: 'Donquixote Doflamingo: Neo',
  families: ['Donquixote Doflamingo', 'Doffy'],
};
const PICA_NEO: Card = { id: 900004, name: 'Pica: Neo', families: ['Pica'] };

describe('resolveCharacterSameCharacterKeys - hand-built cards', () => {
  it("decides by upstream's families, not by the card name", () => {
    // Control first: the name rule reads these two pairs the other way round, so the assertions
    // below would fail if the families were not what decided them.
    expect(sameByName(LUFFY, LUCY)).toBe(false);
    expect(sameByName(DOFLAMINGO_NEO, PICA_NEO)).toBe(true);

    expect(sameCharacter(LUFFY, LUCY)).toBe(true);
    expect(sameCharacter(DOFLAMINGO_NEO, PICA_NEO)).toBe(false);
  });

  it('gives a card that carries several characters a key for each', () => {
    const kidAndKiller: Card = {
      id: 900005,
      name: 'Kid & Killer - The Worst vs. The Strongest',
      families: ['Eustass Kid', 'Killer'],
    };

    expect(resolveCharacterSameCharacterKeys(kidAndKiller)).toEqual(['eustass kid', 'killer']);
    expect(sameCharacter(kidAndKiller, { id: 900006, name: 'Killer', families: ['Killer'] })).toBe(
      true,
    );
  });

  it('falls back to the name rule for a card with no families', () => {
    const unnamedByUpstream: Card = {
      id: 900007,
      name: 'Monkey D. Luffy - Warrior in White Going Wild',
      detail: nameKeysDetail([]),
    };

    expect(resolveCharacterSameCharacterKeys(unnamedByUpstream)).toEqual(
      resolveCharacterPartyConflictKeys(unnamedByUpstream),
    );
    expect(resolveCharacterSameCharacterKeys({ ...unnamedByUpstream, families: [] })).toEqual(
      resolveCharacterPartyConflictKeys(unnamedByUpstream),
    );
    // The family name and the name rule's primary key share one key space, so a card upstream has
    // not named yet still meets the cards it has.
    expect(sameCharacter(unnamedByUpstream, LUFFY)).toBe(true);
  });

  it('lets an override entry replace the families of a unit upstream gets wrong', () => {
    const blackback: Card = {
      id: 2179,
      name: 'BB - Whale Forest Guardian',
      families: ['Blackback', 'BB'],
    };
    const teach: Card = {
      id: 446,
      name: 'Marshall D. Teach',
      families: ['Marshall D. Teach', 'Blackbeard', 'BB'],
    };

    // Without the entry, upstream's shared nickname makes Blackback the same character as Teach.
    expect(resolveSameCharacterKeys(blackback, new Map())).toEqual(['blackback', 'bb']);
    expect(resolveCharacterSameCharacterKeys(blackback)).toEqual(['blackback']);
    expect(sameCharacter(blackback, teach)).toBe(false);
  });

  it('reads the override file the way both of its copies are read', () => {
    const overrides = readPartyConflictOverrides({ 7: ['a', 'b'], 8: 'not a list' });

    expect(overrides.get(7)).toEqual(['a', 'b']);
    expect(overrides.get(8)).toEqual([]);
  });
});

describe('maySlotHoldCharacter - with families', () => {
  it('refuses a sub who is the same character as the Captain under another name', () => {
    expect(maySlotHoldCharacter([LUFFY, null, null, null, null, null], 2, LUCY)).toBe(false);
  });

  it('reads the families of the seats already filled, not only of the candidate', () => {
    // The Captain is known only by its families here: "Lucy" shares no name key with Luffy, so a
    // rule that read the occupied seats by name would let this Luffy in.
    expect(maySlotHoldCharacter([LUCY, null, null, null, null, null], 2, LUFFY)).toBe(false);
  });

  it('still lets the same character hold both leader seats', () => {
    expect(
      maySlotHoldCharacter(
        [LUFFY, null, null, null, null, null],
        TEAM_FRIEND_CAPTAIN_SLOT_INDEX,
        LUCY,
      ),
    ).toBe(true);
  });

  it('still lets a sub repeat the Friend Captain', () => {
    expect(maySlotHoldCharacter([null, LUFFY, null, null, null, null], 2, LUCY)).toBe(true);
  });

  it('no longer refuses two different characters who share only a word of their names', () => {
    expect(maySlotHoldCharacter([DOFLAMINGO_NEO, null, null, null, null, null], 2, PICA_NEO)).toBe(
      true,
    );
  });
});

/** Every `characters` row of the committed seed, as the repository would hand it to the rule. */
function readSeedCards(): Map<number, Card> {
  const sql = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const partyConflictKeysById = new Map<number, string[]>();
  const cards = new Map<number, Card>();

  for (const match of sql.matchAll(
    /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu,
  )) {
    const detail = JSON.parse(match[2]!.replace(/''/gu, "'")) as { partyConflictKeys?: string[] };

    partyConflictKeysById.set(Number(match[1]), detail.partyConflictKeys ?? []);
  }

  // The importer writes one value per line; a count that disagrees with the column list means the
  // format moved, and this says so rather than reading a shifted row.
  for (const match of sql.matchAll(
    /INSERT INTO characters \(\s*([^)]*?)\s*\) VALUES \(\n([\s\S]*?)\n\s*\);/gu,
  )) {
    const columns = match[1]!.split(',').map((column) => column.trim());
    const values = match[2]!
      .split('\n')
      .map((line) => line.trim().replace(/,$/u, ''))
      .map((token) => (token.startsWith("'") ? token.slice(1, -1).replace(/''/gu, "'") : token));

    if (values.length !== columns.length) {
      throw new Error(`Seed row with ${values.length} values for ${columns.length} columns.`);
    }

    const value = (column: string): string => values[columns.indexOf(column)] ?? '';
    const id = Number(value('id'));

    cards.set(id, {
      id,
      name: value('name'),
      families: JSON.parse(value('families_json')) as string[],
      detail: nameKeysDetail(partyConflictKeysById.get(id) ?? []),
    });
  }

  return cards;
}

describe('the rule over the shipped seed', () => {
  const cards = readSeedCards();
  const card = (id: number): Card => {
    const found = cards.get(id);

    if (!found) {
      throw new Error(`The shipped seed has no character ${id}.`);
    }

    return found;
  };

  it('reads families for nearly every unit', () => {
    // Without the column the whole rule silently degrades to the name rule; this is the tripwire.
    const withFamilies = [...cards.values()].filter((entry) => (entry.families ?? []).length > 0);

    expect(cards.size).toBeGreaterThan(4000);
    expect(withFamilies.length / cards.size).toBeGreaterThan(0.95);
  });

  /*
   * The audit's sample, 2026-09-24: 26 unit pairs on which the name rule and families.js disagreed,
   * each checked against the game. families.js was right in 22, likely right in 3 (the two team
   * cards and the VS card) and uncertain in 1 (Stussy and her clone), so the rule follows it in
   * all 26. The 27th row is the pair the name rule had right and families.js does not - Blackback,
   * whom upstream also calls "BB" - which the override file corrects.
   */
  const SAMPLE: ReadonlyArray<readonly [number, number, boolean, string]> = [
    [1622, 1646, false, 'Donquixote Doflamingo: Neo / Pica: Neo'],
    [142, 147, false, 'two different Fighter and Slasher group crews'],
    [989, 2859, false, 'Impostor Straw Hat Pirates / Arlong Pirates'],
    [790, 1655, false, "Onion, Pepper & Carrot (Usopp's crew) / Carrot (the Mink)"],
    [307, 703, false, 'Trafalgar Law / Watchdog Unit of the Law'],
    [39, 837, false, 'Buggy the Clown / Caesar Clown'],
    [1546, 2593, false, 'Soul King / PSY King'],
    [1463, 1465, false, "Luffy's Tea Party / Chopper's Tea Party"],
    [2339, 4389, false, 'Stussy / Miss Buckingham Stussy (uncertain: a clone)'],
    [1791, 1793, false, 'Lucy (Luffy) / Lucy (Sabo)'],
    [4154, 4212, false, 'Ace / Yamato, both "from ONE PIECE magazine"'],
    [38, 39, true, 'Buggy / Buggy the Clown - one evolution chain'],
    [2386, 2387, true, 'Kaido / Kaido, King of the Beasts - one evolution chain'],
    [13, 16, true, 'Usopp / Sogeking'],
    [71, 72, true, 'Miss Wednesday / Nefeltari Vivi'],
    [446, 447, true, 'Marshall D. Teach / Blackbeard'],
    [2963, 2964, true, 'Marshall D. Teach - Emperor / Blackbeard - Emperor'],
    [1, 1791, true, 'Monkey D. Luffy / Lucy'],
    [1, 1360, true, "Monkey D. Luffy / Luffy's Winter Island Adventure"],
    [17, 224, true, 'Sanji / Mr. Prince'],
    [1, 4210, true, 'Monkey D. Luffy / Luffy VS Kaido (likely)'],
    [1, 2875, true, 'Monkey D. Luffy / a Straw Hat Pirates team card (likely)'],
    [76, 2861, true, 'Shanks / a Red-Hair Pirates team card (likely)'],
    [311, 3145, true, 'Killer / Hitokiri Kamazo'],
    [31, 860, true, 'Coby / Coby, Hero of the Battlefield'],
    [121, 142, true, 'a fodder evolution: Cabin Boy / Crew of one group'],
    [446, 2179, false, 'Marshall D. Teach / BB - Whale Forest Guardian (the override entry)'],
  ];

  it('agrees with the game on every sampled pair', () => {
    const wrong = SAMPLE.filter(
      ([left, right, same]) => sameCharacter(card(left), card(right)) !== same,
    ).map(([left, right, , label]) => `${left} x ${right} ${label}`);

    expect(wrong).toEqual([]);
  });

  it('differs from the name rule on every sampled pair it was sampled for', () => {
    // The discrimination control: all 26 were chosen because the name rule got them the other way
    // round, and the 27th because it got it right. If the name rule agreed here, the sample would
    // prove nothing about the families.
    const nameRuleVerdicts = SAMPLE.map(([left, right]) => sameByName(card(left), card(right)));

    expect(nameRuleVerdicts.slice(0, 26)).toEqual(SAMPLE.slice(0, 26).map(([, , same]) => !same));
    expect(nameRuleVerdicts[26]).toBe(false);
  });

  it('keeps #2993 with the other Gyukimaru cards, which only family NAMES do', () => {
    // Upstream lists #2993 as the Onimaru family and the rest as Gyukimaru; the shared name
    // "Onimaru" is what joins them.
    for (const gyukimaru of [3017, 3230, 3231]) {
      expect(sameCharacter(card(2993), card(gyukimaru))).toBe(true);
    }
  });

  it('still needs the two Blackback entries: upstream still calls Blackback "BB"', () => {
    // The staleness signal the overlay register names. When upstream stops sharing the nickname,
    // these go red and the entries can be deleted.
    for (const blackbackId of [2179, 3537]) {
      expect(resolveSameCharacterKeys(card(blackbackId), new Map())).toContain('bb');
      expect(resolveSameCharacterKeys(card(446), new Map())).toContain('bb');
      expect(sameCharacter(card(blackbackId), card(446))).toBe(false);
    }

    expect(sameCharacter(card(2179), card(3537))).toBe(true);
  });

  it("gives #3574 the same crew-mates through its override entry as through upstream's families", () => {
    // The entry exists for the name keys. If upstream's families for the card ever change, the
    // entry would start overruling them, and this goes red so somebody looks.
    const partnersOf = (keys: string[]) =>
      [...cards.values()]
        .filter((other) => other.id !== 3574)
        .filter((other) =>
          resolveCharacterSameCharacterKeys(other).some((key) => keys.includes(key)),
        )
        .map((other) => other.id);
    const viaFamilies = partnersOf(resolveSameCharacterKeys(card(3574), new Map()));

    expect(viaFamilies.length).toBeGreaterThan(100);
    expect(partnersOf(resolveCharacterSameCharacterKeys(card(3574)))).toEqual(viaFamilies);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isSupportOnlyCharacter,
  isSupportOnlyCharacterDetail,
  type SupportOnlyDetailSource,
} from '../grammar/support-only-character';

/*
 * 869f6td4p. A Support-only character has support data and no Captain Ability and no special - the
 * shape of the characters the Global letter of 2026-04-16 says can only go in a Support slot. The
 * first half drives the rule on hand-built details, one condition broken at a time; the second runs
 * it over the shipped seed.
 */

const SUPPORT = [{ supportedCharactersText: 'Blade', levelDescriptions: ['Reduces Poison.'] }];

function detail(fields: Partial<SupportOnlyDetailSource>): SupportOnlyDetailSource {
  return {
    captainAbility: null,
    captainAbilityVariants: [],
    specialText: null,
    supportData: SUPPORT,
    ...fields,
  };
}

describe('isSupportOnlyCharacterDetail', () => {
  it('is true for support data with no Captain Ability and no special', () => {
    expect(isSupportOnlyCharacterDetail(detail({}))).toBe(true);
  });

  it('is false as soon as any one of the three facts does not hold', () => {
    expect(isSupportOnlyCharacterDetail(detail({ supportData: [] }))).toBe(false);
    expect(
      isSupportOnlyCharacterDetail(
        detail({ captainAbility: 'Boosts ATK of all characters by 2x' }),
      ),
    ).toBe(false);
    expect(isSupportOnlyCharacterDetail(detail({ specialText: 'Deals 5x damage' }))).toBe(false);
  });

  it('reads a Captain Ability that only a variant carries', () => {
    expect(
      isSupportOnlyCharacterDetail(
        detail({ captainAbilityVariants: [{ text: 'Boosts ATK of STR characters by 2.5x' }] }),
      ),
    ).toBe(false);
  });

  it('treats blank text as no text, as the dataset writes an absent ability', () => {
    expect(
      isSupportOnlyCharacterDetail(
        detail({ captainAbility: '  ', specialText: '', captainAbilityVariants: [{ text: ' ' }] }),
      ),
    ).toBe(true);
  });

  it('cannot answer yes without a detail, so a list item is never refused by it', () => {
    expect(isSupportOnlyCharacter({ id: 4645, name: 'Biblo' })).toBe(false);
    expect(isSupportOnlyCharacter(null)).toBe(false);
    expect(isSupportOnlyCharacter({ id: 4645, detail: detail({}) })).toBe(true);
  });
});

/** Every detail row of the committed seed, as the importer wrote it. */
function readSeedDetails(): Map<number, SupportOnlyDetailSource> {
  const sql = readFileSync(resolve(process.cwd(), 'public/assets/data/optc-seed.sql'), 'utf8');
  const details = new Map<number, SupportOnlyDetailSource>();

  for (const match of sql.matchAll(
    /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu,
  )) {
    details.set(Number(match[1]), JSON.parse(match[2]!.replace(/''/gu, "'")));
  }

  return details;
}

describe('the rule over the shipped seed', () => {
  const details = readSeedDetails();
  const measurements = JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/app/core/data/dataset-measurements.json'), 'utf8'),
  ) as { supportOnlyCharacters: number };

  it('marks the six units the Global letter describes', () => {
    // Demalo Black, Monkey D. Dragon, St. Figarland Garling, Blade, Biblo and Ange.
    for (const id of [4542, 4567, 4568, 4643, 4645, 4646]) {
      expect(isSupportOnlyCharacterDetail(details.get(id)), `unit ${id}`).toBe(true);
    }
  });

  it('leaves alone a unit with support data that can lead, and fodder with no support at all', () => {
    // The control on each side: Gear 2 Luffy has a support, a Captain Ability and a special; the
    // Robber Penguin evolver has none of the three.
    expect(isSupportOnlyCharacterDetail(details.get(4))).toBe(false);
    expect(isSupportOnlyCharacterDetail(details.get(78))).toBe(false);
  });

  it('counts exactly what the recorded census says, so the two cannot drift apart', () => {
    const counted = [...details.values()].filter((entry) => isSupportOnlyCharacterDetail(entry));

    expect(details.size).toBeGreaterThan(4000);
    expect(counted.length).toBe(measurements.supportOnlyCharacters);
  });
});

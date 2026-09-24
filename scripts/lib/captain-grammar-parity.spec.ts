import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  applyOverrideToCharacterListItem,
  createLocalCharacterOverrideFromRecord,
} from '../../src/app/core/services/character-overrides.utils';
import { type CharacterDetailRecord } from '../../src/app/core/models/optc.models';
import { buildDatasetDatabaseBytes, loadSqlJs } from './dataset-binary.mjs';
import { resolveCharacterCaptainBoosts } from './optc-dataset.mjs';

/**
 * 869f63guq. The build and the app must read every Captain the same way, over the WHOLE shipped
 * dataset.
 *
 * The rules for reading a Captain boost out of the ability text used to exist in several copies,
 * and two of them had drifted far enough for a player to see it: an untouched Character Edit save
 * re-derived 189 boosts with the override path's older parser (#1044 Law ATK 4 -> 2), and
 * Captain Coverage could not read a cost or rarity scope the build had read since 869dc7dj5.
 * Both paths now import `src/app/core/grammar/captain-boost-grammar.ts`; this spec is what keeps
 * them honest if a copy ever comes back.
 *
 * It reads the committed seed rather than fixtures, because the defect was never in a case anyone
 * had thought to write down - it was in 189 real Captains nobody had looked at.
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEED_PATH = path.join(APP_ROOT, 'public/assets/data/optc-seed.sql');

interface SeedCharacter {
  record: CharacterDetailRecord;
  shipped: { hp: number; atk: number; average: number };
}

let seedCharacters: SeedCharacter[] = [];

beforeAll(async () => {
  const SQL = await loadSqlJs();
  const database = new SQL.Database(
    buildDatasetDatabaseBytes(SQL, readFileSync(SEED_PATH, 'utf8')),
  );

  try {
    const details = new Map(
      (database.exec('SELECT character_id, detail_json FROM character_details')[0]?.values ?? []).map(
        ([characterId, detailJson]) => [Number(characterId), JSON.parse(String(detailJson))],
      ),
    );
    const characterResult = database.exec(
      `SELECT id, name, is_incomplete, type, classes_json, stars, stars_label, cost, combo,
              captain_hp_boost, captain_atk_boost, captain_average_boost
         FROM characters ORDER BY id`,
    )[0];

    seedCharacters = (characterResult?.values ?? []).map((values) => {
      const row = Object.fromEntries(
        characterResult!.columns.map((column, index) => [column, values[index]]),
      );
      const id = Number(row['id']);
      const classes = JSON.parse(String(row['classes_json'])) as string[];

      return {
        record: {
          id,
          name: String(row['name']),
          isIncomplete: Number(row['is_incomplete']) === 1,
          type: String(row['type']),
          classes,
          primaryClass: classes[0] ?? '',
          secondaryClass: classes[1] ?? null,
          stars: Number(row['stars']),
          starsLabel: String(row['stars_label'] ?? row['stars']),
          cost: Number(row['cost']),
          combo: Number(row['combo']),
          captainHpBoost: Number(row['captain_hp_boost']),
          captainAtkBoost: Number(row['captain_atk_boost']),
          captainAverageBoost: Number(row['captain_average_boost']),
          stats: {
            min: { hp: null, atk: null, rcv: null },
            max: { hp: null, atk: null, rcv: null },
            growth: null,
          },
          regionArtwork: { exactLocal: false, thumbnailGlobal: false, thumbnailJapan: false },
          regionRelease: { availableOnGlobal: null },
          assets: { exactLocal: null, thumbnailGlobal: null, thumbnailJapan: null },
          imageUrl: '',
          detailImageUrl: '',
          detail: details.get(id),
        } as CharacterDetailRecord,
        shipped: {
          hp: Number(row['captain_hp_boost']),
          atk: Number(row['captain_atk_boost']),
          average: Number(row['captain_average_boost']),
        },
      };
    });
  } finally {
    database.close();
  }
}, 60_000);

describe('captain grammar parity over the shipped dataset', () => {
  it('reads a real, non-empty dataset', () => {
    // A parity check over an empty list agrees with everything. 4,622 rows shipped on 2026-09-24.
    expect(seedCharacters.length).toBeGreaterThan(4000);
    expect(seedCharacters.every(({ record }) => record.detail !== undefined)).toBe(true);
    expect(seedCharacters.filter(({ shipped }) => shipped.atk > 0).length).toBeGreaterThan(3000);
  });

  it('rebuilds every shipped Captain boost column from the build path', () => {
    const drifted = seedCharacters.flatMap(({ record, shipped }) => {
      const built = resolveCharacterCaptainBoosts(record.detail);

      return built.captainHpBoost === shipped.hp &&
        built.captainAtkBoost === shipped.atk &&
        built.captainAverageBoost === shipped.average
        ? []
        : [`#${record.id} shipped ${shipped.hp}/${shipped.atk} built ${built.captainHpBoost}/${built.captainAtkBoost}`];
    });

    expect(drifted).toEqual([]);
  });

  it('reads the same boosts on the Local edit path as the dataset shipped', () => {
    /*
     * The override path is handed a list item - no detail, as the repository hands it over -
     * whose boosts are poisoned, and no dataset captain text, so the only way to print the
     * shipped number is to derive it. A path that kept the item's own boosts would print -1 for
     * every Captain.
     */
    const drifted = seedCharacters.flatMap(({ record, shipped }) => {
      const override = createLocalCharacterOverrideFromRecord(record);
      const { detail: _detail, detailImageUrl: _detailImageUrl, ...listItem } = record;
      const overlaid = applyOverrideToCharacterListItem(
        { ...listItem, captainHpBoost: -1, captainAtkBoost: -1, captainAverageBoost: -1 },
        override,
      );

      return overlaid.captainHpBoost === shipped.hp &&
        overlaid.captainAtkBoost === shipped.atk &&
        overlaid.captainAverageBoost === shipped.average
        ? []
        : [`#${record.id} shipped ${shipped.hp}/${shipped.atk} local edit ${overlaid.captainHpBoost}/${overlaid.captainAtkBoost}`];
    });

    expect(drifted).toEqual([]);
  });

  it('keeps the case that exposed the old override parser', () => {
    // #1044 Trafalgar Law read ATK 2 on the Local edit path while the dataset shipped 4.
    const law = seedCharacters.find(({ record }) => record.id === 1044);

    expect(law?.shipped.atk).toBe(4);
    expect(
      applyOverrideToCharacterListItem(
        { ...law!.record, captainAtkBoost: -1 },
        createLocalCharacterOverrideFromRecord(law!.record),
      ).captainAtkBoost,
    ).toBe(4);
  });
});

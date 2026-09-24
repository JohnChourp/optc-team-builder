import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { resolveCaptainCoverage } from '../../src/app/core/services/captain-coverage.utils';
import {
  applyOverrideToCharacterListItem,
  createLocalCharacterOverrideFromRecord,
} from '../../src/app/core/services/character-overrides.utils';
import { type CharacterDetailRecord } from '../../src/app/core/models/optc.models';
import { extractCoverageTiers } from './captain-ability-coverage.mjs';
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

interface ValueRange {
  min?: number;
  max?: number;
}

interface RangeClause {
  captainIds: number[];
  clause: string;
  costRange?: ValueRange;
  rarityRange?: ValueRange;
  types: string[];
  classes: string[];
  characterTags: string[];
  dominantType: boolean;
}

const TYPES = ['STR', 'DEX', 'QCK', 'PSY', 'INT'];
const CLASSES = ['Fighter', 'Slasher', 'Striker', 'Shooter', 'Free Spirit', 'Driven', 'Cerebral', 'Powerhouse', 'Evolver', 'Booster'];

/** Written out rather than imported: the oracle must not be the function under test. */
function inRange(value: number, range: ValueRange | undefined): boolean {
  return (
    range === undefined ||
    ((range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max))
  );
}

/** Both edges of a range, one step outside each, and a value inside an open end. */
function edgeValues(range: ValueRange | undefined, fallback: number): number[] {
  if (range === undefined) {
    return [fallback];
  }

  const values = new Set<number>();

  if (range.min !== undefined) {
    values.add(range.min - 1);
    values.add(range.min);
  } else {
    values.add(1);
  }

  if (range.max !== undefined) {
    values.add(range.max);
    values.add(range.max + 1);
  } else {
    values.add((range.min ?? 0) + 20);
  }

  return [...values].filter((value) => value >= 0);
}

function collectRangeClauses(): RangeClause[] {
  const byClause = new Map<string, RangeClause>();

  for (const { record } of seedCharacters) {
    for (const entry of record.detail.captainAbilityCoverage?.entries ?? []) {
      for (const tier of entry.tiers) {
        if (!tier.characterConditions.costRange && !tier.characterConditions.rarityRange) {
          continue;
        }

        for (const clause of tier.clauses) {
          // The build's own reading of this one clause, so a tier that folds two clauses into
          // one range (#4313 Tier 2 reads Cost 40 AND Cost 39 or lower) is checked clause by
          // clause, the way the app reads it.
          const [built] = extractCoverageTiers(clause).filter(
            (candidate: { characterConditions: { costRange?: ValueRange; rarityRange?: ValueRange } }) =>
              candidate.characterConditions.costRange || candidate.characterConditions.rarityRange,
          );

          if (!built) {
            continue;
          }

          const existing = byClause.get(clause);

          if (existing) {
            existing.captainIds.push(record.id);
            continue;
          }

          byClause.set(clause, {
            captainIds: [record.id],
            clause,
            costRange: built.characterConditions.costRange,
            rarityRange: built.characterConditions.rarityRange,
            types: built.characterConditions.types,
            classes: built.characterConditions.classes,
            characterTags: built.characterConditions.characterTags,
            dominantType: built.characterConditions.dominantType === true,
          });
        }
      }
    }
  }

  return [...byClause.values()];
}

function createTarget(
  id: number,
  shape: { cost: number; stars: number; type: string; classes: string[] },
): CharacterDetailRecord {
  return {
    ...seedCharacters[0]!.record,
    id,
    name: `Target ${id}`,
    type: shape.type,
    classes: shape.classes,
    primaryClass: shape.classes[0] ?? '',
    secondaryClass: shape.classes[1] ?? null,
    cost: shape.cost,
    stars: shape.stars,
  };
}

function createCaptain(clause: string): CharacterDetailRecord {
  return {
    ...seedCharacters[0]!.record,
    id: 990001,
    name: 'Parity Captain',
    searchText: '',
    detail: {
      ...seedCharacters[0]!.record.detail,
      captainAbility: clause,
      captainAbilityVariants: [],
      captainAbilityCoverage: undefined,
    },
  };
}

describe('captain cost and rarity scope parity over the shipped dataset', () => {
  /*
   * 869f63gqz. The build has read "Cost 20 or less characters" as a scope since 869dc7dj5 and the
   * app never did, so Captain Coverage listed #458 Sengoku's 2,009 matching cards as 0 boosted.
   * Every shipped tier clause that carries a cost or rarity range is read by both paths here: the
   * build's (`extractCoverageTiers`, which wrote the tier) and the app's (`resolveCaptainCoverage`,
   * which decides who is boosted). The app must boost exactly the characters inside the range the
   * build read, at both edges of it, and only those of them the clause's category names.
   */
  it('checks a real, non-empty set of cost and rarity clauses', () => {
    const clauses = collectRangeClauses();

    expect(clauses.length).toBeGreaterThan(30);
    expect(clauses.some((clause) => clause.costRange)).toBe(true);
    expect(clauses.some((clause) => clause.rarityRange)).toBe(true);
    expect(clauses.some((clause) => clause.types.length + clause.classes.length > 0)).toBe(true);
    expect(clauses.find((clause) => clause.captainIds.includes(458))?.costRange).toEqual({ max: 20 });
  });

  it('boosts exactly the characters inside every range the build read', () => {
    const disagreements: string[] = [];
    let checked = 0;
    let boosted = 0;

    for (const rangeClause of collectRangeClauses()) {
      const captain = createCaptain(rangeClause.clause);
      const hasCategory =
        rangeClause.dominantType ||
        rangeClause.types.length + rangeClause.classes.length + rangeClause.characterTags.length > 0;
      const namedShape = {
        type: rangeClause.types[0] ?? 'STR',
        classes: rangeClause.classes.length ? [rangeClause.classes[0]!] : ['Fighter'],
        characterTags: rangeClause.characterTags.slice(0, 1),
      };
      // A character the clause's category does not name - only meaningful when it names one.
      const unnamedShape = {
        type: TYPES.find((type) => !rangeClause.types.includes(type))!,
        classes: [CLASSES.find((characterClass) => !rangeClause.classes.includes(characterClass))!],
        characterTags: [] as string[],
      };
      const shapes = hasCategory && !rangeClause.dominantType ? [namedShape, unnamedShape] : [namedShape];

      for (const cost of edgeValues(rangeClause.costRange, 30)) {
        for (const stars of edgeValues(rangeClause.rarityRange, 5)) {
          for (const shape of shapes) {
            const expected =
              inRange(cost, rangeClause.costRange) &&
              inRange(stars, rangeClause.rarityRange) &&
              shape === namedShape;
            const coverage = resolveCaptainCoverage(
              captain,
              createTarget(990002 + checked, { cost, stars, type: shape.type, classes: shape.classes }),
              { coverageMode: 'fullAbilityCoverage', targetCharacterTags: shape.characterTags },
            );

            checked += 1;
            boosted += coverage.matches ? 1 : 0;

            if (coverage.matches !== expected) {
              disagreements.push(
                `#${rangeClause.captainIds[0]} "${rangeClause.clause}" cost ${cost} rarity ${stars} ${shape.type}/${shape.classes.join(',')}: build ${expected} app ${coverage.matches}`,
              );
            }
          }
        }
      }
    }

    expect(disagreements).toEqual([]);
    // Both verdicts occur, or the comparison proved nothing.
    expect(checked).toBeGreaterThan(100);
    expect(boosted).toBeGreaterThan(30);
    expect(checked - boosted).toBeGreaterThan(30);
  });
});

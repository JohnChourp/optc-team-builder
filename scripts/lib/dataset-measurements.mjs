/**
 * 869f127e9. Hard numbers measured over the shipped roster used to live only inside doc-comments,
 * where nothing verified them and one had already gone wrong - `486` was carried forward after the
 * real figure became `960`, and the comment said so about itself.
 *
 * Measuring the sweep the task asked for found the same rot again, in the same file: the comment
 * claims `291` instances of `if they have a beneficial orb`; the shipped dataset has **292**.
 * Nobody changed the comment. Upstream added a character.
 *
 * Every metric here is a plain count over the shipped dataset - no rendering, no catalogue, no
 * branch logic - so this module can never disagree with the app about what a number MEANS. The
 * figures that do depend on rendering (`1172` / `960` / `212`) are deliberately not here; see
 * `check-dataset-measurements.spec.ts`, which measures those through the app's own module rather
 * than reimplementing it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const MEASUREMENTS_SCHEMA_VERSION = 1;
export const SEED_PATH = 'public/assets/data/optc-seed.sql';
export const MEASUREMENTS_PATH = 'src/app/core/data/dataset-measurements.json';

/** The fixed trigger clauses the tier view maps verbatim, counted by exact string. */
export const COUNTED_TRIGGER_CLAUSES = Object.freeze({
  beneficialOrb: 'if they have a beneficial orb',
  applicableTag: 'if they have the applicable tag',
  performsExcellentActionSpecial: 'performs EXCELLENT with their Action Special',
});

/*
 * id, name, is_incomplete, type, primary_class, secondary_class, classes_json - the first seven
 * columns, in the order the importer writes them. The INSERT is multi-line with one value per
 * line, so `\s*` between the parts is load-bearing rather than cosmetic.
 *
 * A first attempt matched on fewer columns and silently read `is_incomplete` as the type, which
 * reported 0 dual-type characters where the dataset has 190. A parser that returns a plausible
 * wrong number is worse than one that throws, so the spec pins a value this can only produce by
 * reading the right column.
 */
const CHARACTER_ROW_PATTERN =
  /INSERT INTO characters \([^)]*\)\s*VALUES \(\s*\d+,\s*'(?:[^']|'')*',\s*\d+,\s*'([^']*)',\s*(?:NULL|'(?:[^']|'')*'),\s*(?:NULL|'(?:[^']|'')*'),\s*'((?:[^']|'')*)'/gu;

const DETAIL_ROW_PATTERN =
  /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu;

function unescapeSqlString(value) {
  return value.replace(/''/gu, "'");
}

/**
 * Counts over the shipped seed, in one pass.
 *
 * The seed is 25 MB and written by exactly one generator, so it is read with narrow patterns
 * rather than a SQL parser: a parser here would be a second thing to keep in step with the importer
 * for no gain in what these counts mean.
 */
export function measureDataset({ appRoot = process.cwd(), sql } = {}) {
  const source = sql ?? readFileSync(path.join(appRoot, SEED_PATH), 'utf8');

  let characterRows = 0;
  let charactersWithTwoTypes = 0;
  let charactersWithOneType = 0;
  let charactersWithTwoClasses = 0;
  let charactersWithOneClass = 0;
  let charactersWithNoClasses = 0;

  CHARACTER_ROW_PATTERN.lastIndex = 0;

  let match;

  while ((match = CHARACTER_ROW_PATTERN.exec(source)) !== null) {
    characterRows += 1;

    // `type` is `STR` for one and `QCK,DEX` for two - a COMMA, not the slash the display uses.
    if (match[1].includes(',')) {
      charactersWithTwoTypes += 1;
    } else {
      charactersWithOneType += 1;
    }

    let classes = [];

    try {
      classes = JSON.parse(unescapeSqlString(match[2]));
    } catch {
      classes = [];
    }

    const classCount = Array.isArray(classes) ? classes.length : 0;

    if (classCount >= 2) {
      charactersWithTwoClasses += 1;
    } else if (classCount === 1) {
      charactersWithOneClass += 1;
    } else {
      charactersWithNoClasses += 1;
    }
  }

  let detailRows = 0;
  let teamConditions = 0;
  let triggerConditions = 0;
  let fieldConditions = 0;
  const teamConditionsByKind = {};
  const triggerClauseInstances = Object.fromEntries(
    Object.keys(COUNTED_TRIGGER_CLAUSES).map((key) => [key, 0]),
  );
  const clauseToKey = new Map(
    Object.entries(COUNTED_TRIGGER_CLAUSES).map(([key, clause]) => [clause, key]),
  );

  DETAIL_ROW_PATTERN.lastIndex = 0;

  while ((match = DETAIL_ROW_PATTERN.exec(source)) !== null) {
    detailRows += 1;

    let detail;

    try {
      detail = JSON.parse(unescapeSqlString(match[2]));
    } catch {
      continue;
    }

    for (const entry of detail?.captainAbilityCoverage?.entries ?? []) {
      for (const tier of entry?.tiers ?? []) {
        for (const condition of tier?.teamConditions ?? []) {
          teamConditions += 1;

          const kind = String(condition?.kind ?? 'unknown');

          teamConditionsByKind[kind] = (teamConditionsByKind[kind] ?? 0) + 1;
        }

        for (const trigger of tier?.triggerConditions ?? []) {
          triggerConditions += 1;

          const key = clauseToKey.get(String(trigger?.rawClause ?? ''));

          if (key) {
            triggerClauseInstances[key] += 1;
          }
        }

        fieldConditions += (tier?.fieldConditions ?? []).length;
      }
    }
  }

  return {
    characterRows,
    charactersWithOneType,
    charactersWithTwoTypes,
    charactersWithTwoClasses,
    charactersWithOneClass,
    charactersWithNoClasses,
    detailRows,
    teamConditions,
    triggerConditions,
    fieldConditions,
    teamConditionsByKind: Object.fromEntries(
      Object.entries(teamConditionsByKind).sort(([left], [right]) => left.localeCompare(right)),
    ),
    triggerClauseInstances,
  };
}

/** Dotted metric path to value, which is what a `[@dataset name]` marker resolves against. */
export function flattenMeasurements(measurements, prefix = '') {
  const flat = {};

  for (const [key, value] of Object.entries(measurements ?? {})) {
    if (key === 'schemaVersion' || key === 'generatedAt' || key === 'note') {
      continue;
    }

    const name = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flat, flattenMeasurements(value, name));
    } else if (typeof value === 'number') {
      flat[name] = value;
    }
  }

  return flat;
}

export function buildMeasurementsFile(measurements) {
  return {
    schemaVersion: MEASUREMENTS_SCHEMA_VERSION,
    note: 'Generated by scripts/measure-dataset-facts.mjs. Quote a value in a comment as `<number> [@dataset <metric>]` and the guard keeps the two in step.',
    ...measurements,
  };
}

export function readMeasurementsFile({ appRoot = process.cwd() } = {}) {
  return JSON.parse(readFileSync(path.join(appRoot, MEASUREMENTS_PATH), 'utf8'));
}

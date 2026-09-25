#!/usr/bin/env node
/**
 * 869f1pu2u. The guard that keeps the read-only published team set honest.
 *
 * `src/app/core/data/published-teams.data.ts` is hand-curated and ships in the bundle, so it rots
 * the same way the content ladder would: a character retired upstream, a stage renamed, and the
 * entry keeps reading as a real team that the app can no longer assemble. This makes that a red
 * lane.
 *
 * Six things are enforced:
 *
 *  1. **every character id exists in the dataset**, so a team can always be imported;
 *  2. **every team names a stage the dataset carries**, matched on the exact `(group, stage)` pair;
 *  3. **no sub repeats the Captain or another sub**, by the app's own same-character rule -
 *     `src/app/core/grammar/same-character-keys.ts`, the one copy the app reads too, fed from the
 *     same seed and the same override file (869f63grj). It used to read the dataset's name-derived
 *     `partyConflictKeys` and compare the four subs only, which was a weaker rule than the app
 *     enforces. The Friend Captain seat is **never** constrained, and the Captain and Friend Captain
 *     may be the same character. That exception is the owner's, confirmed on 2026-09-03, and
 *     getting it backwards here would ship a team the app itself would reject;
 *  4. **six slots**, ids unique where they must be, and dated;
 *  5. **a substantive rationale**, because a team with no checkable reason is an opinion about
 *     play and this file is not entitled to ship those;
 *  6. **every entry is flagged as a worked example.** Nothing here was submitted by a player, and
 *     a set that stops saying so starts implying a record nobody wrote.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

import { readDatasetStages, stageKey } from './check-content-ladder.mjs';
import { buildDatasetDatabaseBytes, loadSqlJs } from './lib/dataset-binary.mjs';
import {
  readPartyConflictOverrides,
  resolveSameCharacterKeys,
} from '../src/app/core/grammar/same-character-keys.ts';
import { pathToFileURL } from 'node:url';

export const SEED_PATH = 'public/assets/data/optc-seed.sql';
export const TEAMS_PATH = 'src/app/core/data/published-teams.data.ts';
export const OVERRIDES_PATH = 'scripts/data/party-conflict-overrides.json';

export const MINIMUM_RATIONALE_LENGTH = 60;
export const TEAM_SLOT_COUNT = 6;
/** Slots 2 to 5. The two leader seats are deliberately excluded - see the header. */
export const SUB_SLOT_INDEXES = [2, 3, 4, 5];
/** The Captain. A sub may not repeat it, while the Friend Captain (slot 1) may. */
export const CAPTAIN_SLOT_INDEX = 0;

const CHARACTER_ROW_PATTERN =
  /INSERT INTO characters \([^)]*\) VALUES \(\s*(\d+),/gu;

/** Every character id the dataset carries. */
export function readCharacterIds({ appRoot = process.cwd(), sql } = {}) {
  const source = sql ?? readFileSync(path.join(appRoot, SEED_PATH), 'utf8');
  const ids = new Set();

  CHARACTER_ROW_PATTERN.lastIndex = 0;

  let match;

  while ((match = CHARACTER_ROW_PATTERN.exec(source)) !== null) {
    ids.add(Number(match[1]));
  }

  return ids;
}

function parseJsonOr(value, fallback) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : fallback;
  } catch {
    // Unparseable rows belong to the dataset integrity checks, not this one.
    return fallback;
  }
}

/**
 * The same-character keys of every character in the seed, by the app's own rule.
 *
 * The seed is opened as the database the app opens (`buildDatasetDatabaseBytes`), and each row
 * gives the rule what the repository gives it at runtime: the name, the `families_json` column and
 * the detail's `partyConflictKeys`, with the override file's scripts copy - byte-identical to the
 * app's, which `npm run data:overlay-register` enforces.
 */
export async function readSameCharacterKeys({ appRoot = process.cwd(), sql, overrides } = {}) {
  const source = sql ?? readFileSync(path.join(appRoot, SEED_PATH), 'utf8');
  const overrideMap =
    overrides ??
    readPartyConflictOverrides(
      JSON.parse(readFileSync(path.join(appRoot, OVERRIDES_PATH), 'utf8')),
    );
  const SQL = await loadSqlJs();
  const database = new SQL.Database(buildDatasetDatabaseBytes(SQL, source));
  const keys = new Map();

  try {
    const [result] = database.exec(`
      SELECT c.id, c.name, c.families_json, d.detail_json
      FROM characters c
      LEFT JOIN character_details d ON d.character_id = c.id
    `);

    for (const [id, name, familiesJson, detailJson] of result?.values ?? []) {
      const detail = parseJsonOr(detailJson, {});
      const character = {
        id: Number(id),
        name: String(name ?? ''),
        families: parseJsonOr(familiesJson, []),
        detail: { partyConflictKeys: detail?.partyConflictKeys ?? [] },
      };

      keys.set(character.id, resolveSameCharacterKeys(character, overrideMap));
    }
  } finally {
    database.close();
  }

  return keys;
}

function literalValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => literalValue(element));
  }

  if (ts.isObjectLiteralExpression(node)) {
    const value = {};

    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }

      const key =
        ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : null;

      if (key !== null) {
        value[key] = literalValue(property.initializer);
      }
    }

    return value;
  }

  if (ts.isIdentifier(node)) {
    return { identifierRef: node.text };
  }

  return undefined;
}

export function parsePublishedTeams({ appRoot = process.cwd(), source } = {}) {
  const text = source ?? readFileSync(path.join(appRoot, TEAMS_PATH), 'utf8');
  const file = ts.createSourceFile(TEAMS_PATH, text, ts.ScriptTarget.Latest, true);
  const constants = new Map();
  let entries = null;

  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      const name = declaration.name.text;

      if (ts.isStringLiteral(declaration.initializer)) {
        constants.set(name, declaration.initializer.text);
        continue;
      }

      if (name !== 'PUBLISHED_TEAMS') {
        continue;
      }

      const initializer = ts.isAsExpression(declaration.initializer)
        ? declaration.initializer.expression
        : declaration.initializer;

      if (ts.isArrayLiteralExpression(initializer)) {
        entries = initializer.elements.map((element) => literalValue(element));
      }
    }
  }

  const resolved = (entries ?? []).map((entry) => {
    const copy = { ...entry };

    for (const [key, value] of Object.entries(copy)) {
      if (value && typeof value === 'object' && typeof value.identifierRef === 'string') {
        copy[key] = constants.get(value.identifierRef);
      }
    }

    return copy;
  });

  return { entries: resolved, found: entries !== null };
}

export function validatePublishedTeams({
  entries,
  found,
  stages,
  characterIds,
  conflictKeys,
  today = new Date(),
}) {
  const errors = [];

  if (!found) {
    errors.push(`${TEAMS_PATH}: no PUBLISHED_TEAMS array found.`);

    return { ok: false, entryCount: 0, errors };
  }

  const seenIds = new Set();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/u;

  for (const entry of entries) {
    const label = `${TEAMS_PATH} "${entry.id ?? '(no id)'}"`;

    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      errors.push(`${label} has no id.`);
    } else if (seenIds.has(entry.id)) {
      errors.push(`${label} repeats an id.`);
    } else {
      seenIds.add(entry.id);
    }

    if (typeof entry.group !== 'string' || typeof entry.stage !== 'string') {
      errors.push(`${label} has no group/stage pair.`);
    } else if (!stages.has(stageKey(entry.group, entry.stage))) {
      errors.push(
        `${label} is published against "${entry.group} / ${entry.stage}", which the dataset does ` +
          'not carry.',
      );
    }

    if (typeof entry.curatedOn !== 'string' || !isoDate.test(entry.curatedOn)) {
      errors.push(`${label} has no ISO curatedOn date.`);
    } else if (new Date(`${entry.curatedOn}T00:00:00Z`).getTime() > today.getTime()) {
      errors.push(`${label} is curated in the future (${entry.curatedOn}).`);
    }

    /*
     * Both languages, because every player-facing string in this app is bilingual - and a
     * rationale is the most visible of them. A live pass caught this rendering as English inside
     * Greek copy, so the guard now refuses a half-translated entry.
     */
    for (const language of ['en', 'el']) {
      const rationale =
        typeof entry.rationale?.[language] === 'string' ? entry.rationale[language].trim() : '';

      if (rationale.length < MINIMUM_RATIONALE_LENGTH) {
        errors.push(
          `${label} has no real ${language} rationale. A team with no checkable reason is an ` +
            'opinion about play, and this file is not entitled to ship those - in either language.',
        );
      }
    }

    if (entry.workedExample !== true) {
      errors.push(
        `${label} is not flagged as a worked example. Nothing in this set was submitted by a ` +
          'player, and a set that stops saying so implies a record nobody wrote.',
      );
    }

    const slots = entry.slots;

    if (!Array.isArray(slots) || slots.length !== TEAM_SLOT_COUNT) {
      errors.push(`${label} does not have ${TEAM_SLOT_COUNT} slots.`);
      continue;
    }

    for (const [index, slot] of slots.entries()) {
      if (slot === null) {
        continue;
      }

      if (!Number.isInteger(slot)) {
        errors.push(`${label} slot ${index} is not a character id.`);
      } else if (!characterIds.has(slot)) {
        errors.push(
          `${label} slot ${index} is character ${slot}, which the dataset no longer carries. ` +
            'A published team the app cannot assemble is worse than none.',
        );
      }
    }

    /*
     * The same-character rule, as `maySlotHoldCharacter` applies it: no sub may repeat the Captain
     * or another sub. The Friend Captain seat is left out entirely - it is borrowed from another
     * player, so the same character may legally hold both leader seats, and applying the rule
     * there would reject a legal team.
     */
    const crewKeys = new Map();

    for (const index of [CAPTAIN_SLOT_INDEX, ...SUB_SLOT_INDEXES]) {
      const characterId = slots[index];

      if (typeof characterId !== 'number') {
        continue;
      }

      for (const key of conflictKeys.get(characterId) ?? []) {
        const existing = crewKeys.get(key);

        if (existing?.index === CAPTAIN_SLOT_INDEX) {
          errors.push(
            `${label} has character ${characterId} in a sub slot, and it is the same character as ` +
              `the Captain ${existing.characterId} ("${key}"). A sub may not repeat the Captain.`,
          );
        } else if (existing !== undefined && existing.characterId !== characterId) {
          errors.push(
            `${label} has characters ${existing.characterId} and ${characterId} in sub slots, and ` +
              `they share the conflict key "${key}". The app would reject this team.`,
          );
        } else if (existing !== undefined) {
          errors.push(
            `${label} has character ${characterId} in two sub slots. A character conflicts with ` +
              'itself everywhere except the two leader seats.',
          );
        }

        crewKeys.set(key, { characterId, index });
      }
    }
  }

  return { ok: errors.length === 0, entryCount: entries.length, errors };
}

export function formatResult(result, characterCount) {
  if (result.ok) {
    return (
      `[published-teams] ${result.entryCount} team(s) checked against ${characterCount} characters; ` +
      'every id exists, every stage is real, and no sub repeats the Captain or another sub.'
    );
  }

  return [
    `[published-teams] found ${result.errors.length} issue(s):`,
    ...result.errors.map((error) => `- ${error}`),
  ].join('\n');
}

async function main() {
  const appRoot = process.cwd();
  const sql = readFileSync(path.join(appRoot, SEED_PATH), 'utf8');
  const stages = readDatasetStages({ sql });
  const characterIds = readCharacterIds({ sql });
  const conflictKeys = await readSameCharacterKeys({ appRoot, sql });
  const { entries, found } = parsePublishedTeams({ appRoot });
  const result = validatePublishedTeams({ entries, found, stages, characterIds, conflictKeys });

  process.stdout.write(`${formatResult(result, characterIds.size)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

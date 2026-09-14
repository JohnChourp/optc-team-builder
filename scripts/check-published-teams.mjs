#!/usr/bin/env node
/**
 * 869f1p4wx. The guard that keeps the read-only published team set honest.
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
 *  3. **no two SUB slots share a `partyConflictKeys` entry.** The dataset's conflict keys are
 *     name-derived, and a character always carries its own - so the rule applies to the four sub
 *     slots and **never** to the two leader seats, where the same character is legal twice. That
 *     exception is the owner's, confirmed on 2026-09-03, and getting it backwards here would ship
 *     a team the app itself would reject;
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

export const SEED_PATH = 'public/assets/data/optc-seed.sql';
export const TEAMS_PATH = 'src/app/core/data/published-teams.data.ts';

export const MINIMUM_RATIONALE_LENGTH = 60;
export const TEAM_SLOT_COUNT = 6;
/** Slots 2 to 5. The two leader seats are deliberately excluded - see the header. */
export const SUB_SLOT_INDEXES = [2, 3, 4, 5];

const CHARACTER_ROW_PATTERN =
  /INSERT INTO characters \([^)]*\) VALUES \(\s*(\d+),/gu;
const DETAIL_ROW_PATTERN =
  /INSERT INTO character_details \(character_id, detail_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu;

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

/** `partyConflictKeys` per character, for the sub-slot rule. */
export function readConflictKeys({ appRoot = process.cwd(), sql } = {}) {
  const source = sql ?? readFileSync(path.join(appRoot, SEED_PATH), 'utf8');
  const keys = new Map();

  DETAIL_ROW_PATTERN.lastIndex = 0;

  let match;

  while ((match = DETAIL_ROW_PATTERN.exec(source)) !== null) {
    try {
      const detail = JSON.parse(match[2].replace(/''/gu, "'"));

      if (Array.isArray(detail?.partyConflictKeys)) {
        keys.set(Number(match[1]), detail.partyConflictKeys);
      }
    } catch {
      // Unparseable rows belong to the dataset integrity checks, not this one.
    }
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

    const rationale = typeof entry.rationale === 'string' ? entry.rationale.trim() : '';

    if (rationale.length < MINIMUM_RATIONALE_LENGTH) {
      errors.push(
        `${label} has no real rationale. A team with no checkable reason is an opinion about ` +
          'play, and this file is not entitled to ship those.',
      );
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
     * The sub-slot conflict rule, and ONLY the sub slots. In this game the Friend Captain is
     * borrowed from another player, so the same character may legally hold both leader seats -
     * applying the name-derived conflict keys there would reject a legal team.
     */
    const subKeys = new Map();

    for (const index of SUB_SLOT_INDEXES) {
      const characterId = slots[index];

      if (typeof characterId !== 'number') {
        continue;
      }

      for (const key of conflictKeys.get(characterId) ?? []) {
        const existing = subKeys.get(key);

        if (existing !== undefined && existing !== characterId) {
          errors.push(
            `${label} has characters ${existing} and ${characterId} in sub slots, and they share ` +
              `the conflict key "${key}". The app would reject this team.`,
          );
        } else if (existing === characterId) {
          errors.push(
            `${label} has character ${characterId} in two sub slots. A character conflicts with ` +
              'itself everywhere except the two leader seats.',
          );
        }

        subKeys.set(key, characterId);
      }
    }
  }

  return { ok: errors.length === 0, entryCount: entries.length, errors };
}

export function formatResult(result, characterCount) {
  if (result.ok) {
    return (
      `[published-teams] ${result.entryCount} team(s) checked against ${characterCount} characters; ` +
      'every id exists, every stage is real, and no two subs conflict.'
    );
  }

  return [
    `[published-teams] found ${result.errors.length} issue(s):`,
    ...result.errors.map((error) => `- ${error}`),
  ].join('\n');
}

function main() {
  const appRoot = process.cwd();
  const sql = readFileSync(path.join(appRoot, SEED_PATH), 'utf8');
  const stages = readDatasetStages({ sql });
  const characterIds = readCharacterIds({ sql });
  const conflictKeys = readConflictKeys({ sql });
  const { entries, found } = parsePublishedTeams({ appRoot });
  const result = validatePublishedTeams({ entries, found, stages, characterIds, conflictKeys });

  process.stdout.write(`${formatResult(result, characterIds.size)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}

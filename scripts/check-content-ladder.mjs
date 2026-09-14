#!/usr/bin/env node
/**
 * 869f1naz5. The guard that keeps the hand-curated content ladder honest.
 *
 * `src/app/core/data/content-ladder.data.ts` is maintained by hand, and 869f12xb1's own objection
 * to that was the right one: **an unmaintainable ladder is worse than none.** A curated list of
 * content goes stale silently - a stage renamed upstream keeps reading as a real goal, and nothing
 * tells anyone. This is what makes staleness a red lane instead of a lie.
 *
 * Five things are enforced, and deliberately nothing more:
 *
 *  1. **every milestone names a stage the dataset actually carries**, matched on the exact
 *     `(group, stage)` pair from `character_drops` - 787 of them across 14 groups;
 *  2. **ids are unique**, because the reachability list is keyed by them;
 *  3. **every entry is dated**, and not in the future - an undated requirement cannot be judged
 *     stale;
 *  4. **every entry carries a substantive source note.** A difficulty requirement with no
 *     traceable basis is an opinion, and opinions about difficulty are exactly what this file must
 *     not ship;
 *  5. **a provisional entry says so in its note.** The dataset supports what a box can FIELD, not
 *     what it can CLEAR; any number that is a starting point has to be visible as one, or the
 *     distinction survives only in a comment nobody reads.
 *
 * The ladder is read from the TypeScript source rather than a build output, so the check runs
 * before anything is compiled - the same approach the other data-registry guards here use.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

export const SEED_PATH = 'public/assets/data/optc-seed.sql';
export const LADDER_PATH = 'src/app/core/data/content-ladder.data.ts';

/** Below this a source note is a placeholder rather than a note. */
export const MINIMUM_NOTE_LENGTH = 40;

const DROP_ROW_PATTERN =
  /INSERT INTO character_drops \(character_id, sources_json\)\s*VALUES \(\s*(\d+),\s*'((?:[^']|'')*)'\s*\);/gu;

/** A collision-free key for a group/stage pair - a stage name may contain anything. */
export function stageKey(group, stage) {
  return JSON.stringify([group, stage]);
}

/** Every `(group, stage)` pair the dataset knows about. */
export function readDatasetStages({ appRoot = process.cwd(), sql } = {}) {
  const source = sql ?? readFileSync(path.join(appRoot, SEED_PATH), 'utf8');
  const stages = new Set();

  DROP_ROW_PATTERN.lastIndex = 0;

  let match;

  while ((match = DROP_ROW_PATTERN.exec(source)) !== null) {
    let sources;

    try {
      sources = JSON.parse(match[2].replace(/''/gu, "'"));
    } catch {
      // A row this cannot parse is the dataset integrity checks' problem, not this one's.
      continue;
    }

    if (!Array.isArray(sources)) {
      continue;
    }

    for (const entry of sources) {
      if (entry && typeof entry.group === 'string' && typeof entry.stage === 'string') {
        stages.add(stageKey(entry.group, entry.stage));
      }
    }
  }

  return stages;
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

/**
 * The milestones, read out of the TypeScript source.
 *
 * `curatedOn` is a shared constant rather than a literal on every entry, so an identifier is
 * resolved against the file's own top-level `const` declarations before it is judged missing.
 */
export function parseContentLadder({ appRoot = process.cwd(), source } = {}) {
  const text = source ?? readFileSync(path.join(appRoot, LADDER_PATH), 'utf8');
  const file = ts.createSourceFile(LADDER_PATH, text, ts.ScriptTarget.Latest, true);
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

      if (name !== 'CONTENT_LADDER') {
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

export function validateContentLadder({ entries, found, stages, today = new Date() }) {
  const errors = [];

  if (!found) {
    errors.push(`${LADDER_PATH}: no CONTENT_LADDER array found.`);

    return { ok: false, entryCount: 0, errors };
  }

  if (entries.length === 0) {
    errors.push(`${LADDER_PATH}: the ladder is empty. Remove the feature or give it a milestone.`);
  }

  const seenIds = new Set();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/u;

  for (const entry of entries) {
    const label = `${LADDER_PATH} "${entry.id ?? '(no id)'}"`;

    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      errors.push(`${label} has no id.`);
    } else if (seenIds.has(entry.id)) {
      errors.push(`${label} repeats an id. The reachability list is keyed by it.`);
    } else {
      seenIds.add(entry.id);
    }

    if (typeof entry.group !== 'string' || typeof entry.stage !== 'string') {
      errors.push(`${label} has no group/stage pair.`);
    } else if (!stages.has(stageKey(entry.group, entry.stage))) {
      errors.push(
        `${label} points at "${entry.group} / ${entry.stage}", which the dataset does not carry. ` +
          'A curated ladder that drifts off the dataset reads as a real goal and is not one - ' +
          'rename it to a stage that exists, or drop the milestone.',
      );
    }

    if (typeof entry.curatedOn !== 'string' || !isoDate.test(entry.curatedOn)) {
      errors.push(
        `${label} has no ISO curatedOn date. An undated requirement cannot go stale visibly.`,
      );
    } else if (new Date(`${entry.curatedOn}T00:00:00Z`).getTime() > today.getTime()) {
      errors.push(`${label} is curated in the future (${entry.curatedOn}).`);
    }

    const note = typeof entry.sourceNote === 'string' ? entry.sourceNote.trim() : '';

    if (note.length < MINIMUM_NOTE_LENGTH) {
      errors.push(
        `${label} has no real sourceNote. A difficulty requirement with no traceable basis is an ` +
          'opinion, and this file must not ship opinions about difficulty.',
      );
    } else if (entry.provisional === true && !/provisional/iu.test(note)) {
      errors.push(
        `${label} is provisional but its note does not say so. The dataset supports what a box ` +
          'can FIELD, not what it can CLEAR - a starting point has to be visible as one.',
      );
    }

    const requirement = entry.requirement;

    if (!requirement || typeof requirement !== 'object') {
      errors.push(`${label} has no requirement.`);
      continue;
    }

    const { teamSize, minStars } = requirement;

    if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 6) {
      errors.push(`${label} has a teamSize of ${teamSize}. A team is 1 to 6 slots.`);
    }

    if (minStars !== undefined) {
      if (!Number.isInteger(minStars?.stars) || minStars.stars < 1) {
        errors.push(`${label} has a minStars.stars of ${minStars?.stars}.`);
      }

      if (!Number.isInteger(minStars?.count) || minStars.count < 1 || minStars.count > 6) {
        errors.push(`${label} has a minStars.count of ${minStars?.count}, outside 1 to 6.`);
      }
    }
  }

  return { ok: errors.length === 0, entryCount: entries.length, errors };
}

export function formatResult(result, stageCount) {
  if (result.ok) {
    return (
      `[content-ladder] ${result.entryCount} milestone(s) checked; every one names a stage the ` +
      `dataset carries (${stageCount} known), is dated, and says where its requirement came from.`
    );
  }

  return [
    `[content-ladder] found ${result.errors.length} issue(s):`,
    ...result.errors.map((error) => `- ${error}`),
  ].join('\n');
}

function main() {
  const appRoot = process.cwd();
  const stages = readDatasetStages({ appRoot });
  const { entries, found } = parseContentLadder({ appRoot });
  const result = validateContentLadder({ entries, found, stages });

  process.stdout.write(`${formatResult(result, stages.size)}\n`);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}

#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * The recorded quest/Rumble engine differences must still be true.
 *
 * 869f12x69. A record of "why these two engines differ" is only worth having if
 * it cannot quietly become a description of a codebase that has moved on - the
 * failure mode of every comment that outlived its code. So every divergence
 * cites symbols, and this fails when one of them stops existing.
 *
 *   A. an evidence file that is gone, or a symbol no longer in it;
 *   B. a `deliberate` divergence with no decision recorded - which is an
 *      assertion that somebody decided, with no way to check;
 *   C. an `unreviewed` divergence carrying a decision, which means it is not
 *      unreviewed;
 *   D. a duplicate id, or a description too short to say anything.
 *
 * `unreviewed` entries are NOT failures. They are the open questions this
 * record exists to make visible, and the count is printed so it cannot sit at
 * zero by accident.
 *
 * Run: npm run engines:divergences
 */

const REGISTRY_PATH = 'src/app/core/data/team-builder-engine-divergences.data.ts';

function readProperty(objectLiteral, name) {
  const property = objectLiteral.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) && candidate.name.getText().replace(/['"]/gu, '') === name,
  );

  if (!property) {
    return undefined;
  }

  if (ts.isStringLiteralLike(property.initializer)) {
    return property.initializer.text;
  }

  if (ts.isArrayLiteralExpression(property.initializer)) {
    return property.initializer.elements
      .filter((element) => ts.isObjectLiteralExpression(element))
      .map((element) => ({
        file: readProperty(element, 'file'),
        symbol: readProperty(element, 'symbol'),
      }));
  }

  return undefined;
}

export function parseDivergences(source, fileName = REGISTRY_PATH) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const records = [];

  (function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'TEAM_BUILDER_ENGINE_DIVERGENCES' &&
      node.initializer
    ) {
      const array = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;

      if (ts.isArrayLiteralExpression(array)) {
        for (const element of array.elements) {
          if (!ts.isObjectLiteralExpression(element)) {
            continue;
          }

          records.push({
            id: readProperty(element, 'id'),
            summary: readProperty(element, 'summary'),
            quest: readProperty(element, 'quest'),
            rumble: readProperty(element, 'rumble'),
            status: readProperty(element, 'status'),
            decision: readProperty(element, 'decision'),
            evidence: readProperty(element, 'evidence') ?? [],
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  })(sourceFile);

  return records;
}

export function inspectDivergences({ divergences, fileExists, readFile }) {
  const errors = [];
  const seenIds = new Set();

  if (divergences.length === 0) {
    errors.push(`No divergences found in ${REGISTRY_PATH} - it could not be read.`);
  }

  for (const divergence of divergences) {
    const label = divergence.id ?? '(unnamed)';

    if (!divergence.id || seenIds.has(divergence.id)) {
      errors.push(`Divergence "${label}" has a missing or duplicated id.`);
    }

    seenIds.add(divergence.id);

    for (const field of ['summary', 'quest', 'rumble']) {
      if (typeof divergence[field] !== 'string' || divergence[field].trim().length < 30) {
        errors.push(`Divergence "${label}" needs a real ${field}, not a placeholder.`);
      }
    }

    if (divergence.status === 'deliberate' && !divergence.decision) {
      errors.push(
        `Divergence "${label}" is marked deliberate with no decision recorded. "Somebody decided" ` +
          'with nothing to check is exactly the claim this record exists to stop.',
      );
    }

    if (divergence.status === 'unreviewed' && divergence.decision) {
      errors.push(
        `Divergence "${label}" is marked unreviewed but carries a decision. If it was decided, say so.`,
      );
    }

    if (!['deliberate', 'unreviewed'].includes(divergence.status)) {
      errors.push(`Divergence "${label}" has an unknown status "${divergence.status}".`);
    }

    if (divergence.evidence.length === 0) {
      errors.push(`Divergence "${label}" cites no evidence, so nothing can check it is still true.`);
    }

    for (const entry of divergence.evidence) {
      if (!entry.file || !entry.symbol) {
        errors.push(`Divergence "${label}" has an evidence entry missing its file or symbol.`);
        continue;
      }

      if (!fileExists(entry.file)) {
        errors.push(`Divergence "${label}" cites ${entry.file}, which no longer exists.`);
        continue;
      }

      if (!readFile(entry.file).includes(entry.symbol)) {
        errors.push(
          `Divergence "${label}" cites "${entry.symbol}" in ${entry.file}, which no longer contains it. ` +
            'Either the difference is gone, or the record has outlived the code.',
        );
      }
    }
  }

  const unreviewed = divergences.filter((divergence) => divergence.status === 'unreviewed');

  return { total: divergences.length, unreviewedCount: unreviewed.length, errors };
}

export function formatDivergenceResult(result) {
  if (result.errors.length > 0) {
    return result.errors.map((error) => `[engines:divergences] ${error}`).join('\n');
  }

  return (
    `[engines:divergences] ${result.total} recorded differences, ` +
    `${result.unreviewedCount} still unreviewed and named as open questions.`
  );
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = inspectDivergences({
    divergences: parseDivergences(
      readFileSync(path.join(projectRoot, ...REGISTRY_PATH.split('/')), 'utf8'),
    ),
    fileExists: (file) => existsSync(path.join(projectRoot, ...file.split('/'))),
    readFile: (file) => readFileSync(path.join(projectRoot, ...file.split('/')), 'utf8'),
  });
  const output = formatDivergenceResult(result);

  if (result.errors.length > 0) {
    console.error(output);
    process.exitCode = 1;

    return;
  }

  console.log(output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { REGISTRY_PATH };

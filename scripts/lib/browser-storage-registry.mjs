import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

/**
 * Reads `src/app/core/data/browser-storage-keys.data.ts` from Node.
 *
 * 869f12x56. Same approach as `lib/public-routes.mjs`: the registry is
 * TypeScript because the app depends on its types, and the scripts are plain
 * `.mjs` with no build step, so they read it through the compiler API.
 */
const REGISTRY_RELATIVE_PATH = 'src/app/core/data/browser-storage-keys.data.ts';

function readProperty(objectLiteral, name) {
  const property = objectLiteral.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      candidate.name.getText().replace(/['"]/gu, '') === name,
  );

  if (!property) {
    return undefined;
  }

  if (ts.isStringLiteralLike(property.initializer)) {
    return property.initializer.text;
  }

  if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  return undefined;
}

function readArrayOfObjects(source, variableName, fields) {
  const sourceFile = ts.createSourceFile(
    REGISTRY_RELATIVE_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const records = [];

  (function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText() === variableName && node.initializer) {
      const array = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;

      if (ts.isArrayLiteralExpression(array)) {
        for (const element of array.elements) {
          if (!ts.isObjectLiteralExpression(element)) {
            continue;
          }

          const record = {};

          for (const field of fields) {
            record[field] = readProperty(element, field);
          }

          records.push(record);
        }
      }
    }

    ts.forEachChild(node, visit);
  })(sourceFile);

  return records;
}

export function readStorageRegistry(projectRoot) {
  const source = readFileSync(
    path.join(projectRoot, ...REGISTRY_RELATIVE_PATH.split('/')),
    'utf8',
  );

  return readArrayOfObjects(source, 'BROWSER_STORAGE_KEYS', [
    'key',
    'constantName',
    'owner',
    'backend',
    'classification',
    'exportedAs',
    'legacySpelling',
    'note',
  ]);
}

export function readNonStorageConstants(projectRoot) {
  const source = readFileSync(
    path.join(projectRoot, ...REGISTRY_RELATIVE_PATH.split('/')),
    'utf8',
  );

  return readArrayOfObjects(source, 'NON_STORAGE_KEY_CONSTANTS', ['constantName', 'reason']);
}

export { REGISTRY_RELATIVE_PATH };

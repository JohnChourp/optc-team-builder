import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Reads `src/app/core/data/public-routes.data.ts` from Node.
 *
 * 869f12x57. The registry is TypeScript because the app imports it directly and
 * has to keep its types; the scripts are plain `.mjs` with no build step, so
 * they read it through the compiler API - the same way
 * `check-route-sitemap-coverage.mjs` and `check-whats-new.mjs` already read
 * router config and release data.
 *
 * A JSON file would have been importable by both, but then the app would carry
 * a second, untyped shape or a wrapper around it - and the whole point of the
 * registry is to stop one fact having two forms.
 */
const DEFAULT_REGISTRY_PATH = 'src/app/core/data/public-routes.data.ts';

function readStringProperty(objectLiteral, name) {
  const property = objectLiteral.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      candidate.name.getText().replace(/['"]/gu, '') === name,
  );

  return property && ts.isStringLiteralLike(property.initializer)
    ? property.initializer.text
    : null;
}

export function parsePublicRoutes(source, fileName = DEFAULT_REGISTRY_PATH) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const records = [];

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'PUBLIC_ROUTES' &&
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

          const aliasProperty = element.properties.find(
            (candidate) =>
              ts.isPropertyAssignment(candidate) &&
              candidate.name.getText().replace(/['"]/gu, '') === 'aliases',
          );

          records.push({
            routePath: readStringProperty(element, 'routePath'),
            canonicalPath: readStringProperty(element, 'canonicalPath'),
            title: readStringProperty(element, 'title'),
            description: readStringProperty(element, 'description'),
            aliases:
              aliasProperty && ts.isArrayLiteralExpression(aliasProperty.initializer)
                ? aliasProperty.initializer.elements
                    .filter((alias) => ts.isStringLiteralLike(alias))
                    .map((alias) => alias.text)
                : [],
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return records;
}

export function loadPublicRoutes(projectRoot) {
  const root =
    projectRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const registryPath = path.join(root, ...DEFAULT_REGISTRY_PATH.split('/'));
  const records = parsePublicRoutes(readFileSync(registryPath, 'utf8'));

  if (records.length === 0) {
    throw new Error(
      `No PUBLIC_ROUTES records found in ${DEFAULT_REGISTRY_PATH}. ` +
        'Reading an empty list would make every consumer pass for the wrong reason.',
    );
  }

  return records;
}

/** Canonical paths plus every alias - what the sitemap actually publishes. */
export function publishedPaths(records) {
  return records.flatMap((record) => [record.canonicalPath, ...record.aliases]);
}

export { DEFAULT_REGISTRY_PATH };

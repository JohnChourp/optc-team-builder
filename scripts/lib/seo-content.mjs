import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

/**
 * Reads `src/app/pages/seo-content/seo-content.data.ts` from Node.
 *
 * 869f13c5t. The words on the four tool pages and the three guides live in that one TypeScript file,
 * which the app page imports; the generator is plain `.mjs` with no build step, so it reads the file
 * through the compiler API, the same way `public-routes.mjs` reads the route registry. Only string
 * literals are accepted: a record built from an expression would be something the generator cannot
 * see, and the static fallback would silently lose it.
 */
export const SEO_CONTENT_DATA_PATH = 'src/app/pages/seo-content/seo-content.data.ts';

function propertyName(property) {
  return property.name.getText().replace(/['"]/gu, '');
}

function readLiteral(node, where) {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element, index) => readLiteral(element, `${where}[${index}]`));
  }

  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) {
          throw new Error(`${where}: only plain properties are allowed`);
        }

        return [propertyName(property), readLiteral(property.initializer, `${where}.${propertyName(property)}`)];
      }),
    );
  }

  throw new Error(`${where}: expected a string, array or object literal, found ${ts.SyntaxKind[node.kind]}`);
}

export function parseSeoContentPages(source, fileName = SEO_CONTENT_DATA_PATH) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  let pages = null;

  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText() === 'SEO_CONTENT_PAGES' && node.initializer) {
      const initializer = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;

      if (!ts.isObjectLiteralExpression(initializer)) {
        throw new Error(`${fileName}: SEO_CONTENT_PAGES must be an object literal`);
      }

      pages = readLiteral(initializer, 'SEO_CONTENT_PAGES');
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (!pages) {
    throw new Error(`${fileName}: no SEO_CONTENT_PAGES declaration`);
  }

  return pages;
}

export function loadSeoContentPages(projectRoot, relativePath = SEO_CONTENT_DATA_PATH) {
  return parseSeoContentPages(readFileSync(path.join(projectRoot, relativePath), 'utf8'), relativePath);
}

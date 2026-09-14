#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Every route the router declares must be in the generated sitemap, or be
 * excluded on purpose.
 *
 * 869f12x4k. `/faq` shipped across v0.4.17-v0.4.19 as a top-level public route
 * beside `privacy`, `cookies` and `terms` - all three of which are in the
 * sitemap. It reached 0 of the 4,637 live URLs, because the sitemap's route
 * list is a second hand-written copy in `scripts/generate-seo-pages.mjs` and
 * nothing connected the two. An FAQ is the highest-intent search surface this
 * app has; it was invisible to search engines for three releases.
 *
 * Adding `faq` to the generator fixes that one row and leaves the next new
 * route to be found by hand, which is exactly how this one got here. So the
 * check asks the general question instead:
 *
 *   A. a router route that is neither generated, aliased, nor excluded fails;
 *   B. an exclusion naming a route that no longer exists fails, so the
 *      registry cannot rot into a list of ghosts that silently permit;
 *   C. a route that is both generated and excluded fails, because the two
 *      answers disagree and neither can be trusted;
 *   D. a generated path with no router route behind it fails - a sitemap entry
 *      for a page that 404s is worse than a missing one.
 *
 * Both lists are read from source rather than imported: `app.routes.ts` is
 * Angular's config with lazy `loadComponent` calls, and the generator writes
 * files at import time. A single shared registry is the wave-2 data-clarity
 * job (869f12x57); this is the guard that stops the bleeding meanwhile.
 *
 * Run: npm run routes:sitemap-coverage
 */

/**
 * Routes deliberately absent from the sitemap, each with the reason.
 *
 * A reason is required and is the whole point of the registry: "excluded"
 * without one is indistinguishable from "forgotten", which is the state this
 * check exists to end. Adding a row here is a decision, not a way to pass.
 */
export const ROUTE_SITEMAP_EXCLUSIONS = [
  {
    route: 'tabs',
    reason: 'Bare redirect to tabs/characters, which is itself in the sitemap.',
  },
  {
    route: 'tabs/settings',
    reason: 'Local device settings - nothing to index and nothing a search result could usefully open.',
  },
  {
    route: 'tabs/saved-teams',
    reason: "Shows only this device's saved teams; empty for every visitor arriving from search.",
  },
  {
    route: 'tabs/saved-rumble-teams',
    reason: "Shows only this device's saved Rumble teams; empty for every visitor arriving from search.",
  },
  {
    route: 'tabs/saved-enemies',
    reason: "Shows only this device's saved enemies; empty for every visitor arriving from search.",
  },
  {
    route: 'tabs/character-boxes',
    reason: "Shows only this device's character boxes; empty for every visitor arriving from search.",
  },
  {
    route: 'tabs/collection',
    reason: 'Redirect into tabs/saved-teams, which is excluded for the same reason.',
  },
  {
    route: 'characters/:id',
    reason: 'Parameterised: the generator emits one page per character from the seed instead.',
  },
  {
    route: 'characters/:id/edit',
    reason: 'Parameterised local editor for overrides stored on the device.',
  },
  {
    route: '**',
    reason: 'Wildcard fallback, not a page.',
  },
];

function isStringLiteral(node) {
  return Boolean(node) && ts.isStringLiteralLike(node);
}

function readStringProperty(objectLiteral, name) {
  const property = objectLiteral.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) && candidate.name.getText().replace(/['"]/gu, '') === name,
  );

  if (!property) {
    return undefined;
  }

  return isStringLiteral(property.initializer) ? property.initializer.text : null;
}

function readArrayProperty(objectLiteral, name) {
  const property = objectLiteral.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) && candidate.name.getText().replace(/['"]/gu, '') === name,
  );

  if (!property || !ts.isArrayLiteralExpression(property.initializer)) {
    return undefined;
  }

  return property.initializer;
}

function joinRoutePath(prefix, segment) {
  return [prefix, segment].filter((part) => part !== '').join('/');
}

/** Every route path the router declares, with nested `children` resolved to full paths. */
export function readAppRoutes(source, fileName = 'app.routes.ts') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const routes = [];

  function collect(arrayLiteral, prefix) {
    for (const element of arrayLiteral.elements) {
      if (!ts.isObjectLiteralExpression(element)) {
        continue;
      }

      const routePath = readStringProperty(element, 'path');

      if (routePath === undefined || routePath === null) {
        continue;
      }

      const fullPath = joinRoutePath(prefix, routePath);
      const children = readArrayProperty(element, 'children');

      routes.push({
        path: fullPath,
        redirectTo: readStringProperty(element, 'redirectTo') ?? null,
      });

      if (children) {
        collect(children, fullPath);
      }
    }
  }

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'routes' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      collect(node.initializer, '');
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return routes;
}

/** The paths and aliases `generate-seo-pages.mjs` writes into the sitemap. */
export function readGeneratedRoutes(source, fileName = 'generate-seo-pages.mjs') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const paths = [];
  const aliases = [];

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'publicRoutes' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) {
          continue;
        }

        const routePath = readStringProperty(element, 'path');

        if (typeof routePath === 'string') {
          paths.push(routePath);
        }

        const aliasArray = readArrayProperty(element, 'aliases');

        for (const alias of aliasArray?.elements ?? []) {
          if (isStringLiteral(alias)) {
            aliases.push(alias.text);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { paths, aliases };
}

export function inspectRouteSitemapCoverage({
  routesSource,
  generatorSource,
  exclusions = ROUTE_SITEMAP_EXCLUSIONS,
}) {
  const routes = readAppRoutes(routesSource);
  const { paths, aliases } = readGeneratedRoutes(generatorSource);
  const routePaths = new Set(routes.map((route) => route.path));
  const generated = new Set([...paths, ...aliases]);
  const excluded = new Map(exclusions.map((entry) => [entry.route, entry.reason]));
  const errors = [];

  if (routes.length === 0) {
    errors.push('No routes found in app.routes.ts - the router config could not be read.');
  }

  if (paths.length === 0) {
    errors.push('No publicRoutes found in generate-seo-pages.mjs - the generator could not be read.');
  }

  for (const route of routePaths) {
    const isGenerated = generated.has(route);
    const exclusionReason = excluded.get(route);

    if (isGenerated && exclusionReason !== undefined) {
      errors.push(
        `Route "${route}" is both generated into the sitemap and excluded from it. Remove one of the two.`,
      );
      continue;
    }

    if (!isGenerated && exclusionReason === undefined) {
      errors.push(
        `Route "${route}" is declared in app.routes.ts but has no sitemap entry and no exclusion. ` +
          'Add it to publicRoutes in scripts/generate-seo-pages.mjs, or add it to ROUTE_SITEMAP_EXCLUSIONS with a reason.',
      );
    }
  }

  for (const [route] of excluded) {
    if (!routePaths.has(route)) {
      errors.push(
        `ROUTE_SITEMAP_EXCLUSIONS names "${route}", which no longer exists in app.routes.ts. Remove the entry.`,
      );
    }
  }

  for (const entry of exclusions) {
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 12) {
      errors.push(`ROUTE_SITEMAP_EXCLUSIONS entry "${entry.route}" needs a real reason, not a placeholder.`);
    }
  }

  for (const generatedPath of generated) {
    if (!routePaths.has(generatedPath)) {
      errors.push(
        `The sitemap generator emits "${generatedPath}", which no router route serves. ` +
          'A sitemap entry that 404s is worse than a missing one.',
      );
    }
  }

  return {
    routeCount: routePaths.size,
    generatedCount: generated.size,
    excludedCount: excluded.size,
    errors,
  };
}

export function formatRouteSitemapCoverageResult(result) {
  if (result.errors.length > 0) {
    return result.errors.map((error) => `[routes:sitemap] ${error}`).join('\n');
  }

  return (
    `[routes:sitemap] ${result.routeCount} router routes: ` +
    `${result.generatedCount} in the generated sitemap, ${result.excludedCount} excluded on purpose.`
  );
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = inspectRouteSitemapCoverage({
    routesSource: readFileSync(path.join(projectRoot, 'src', 'app', 'app.routes.ts'), 'utf8'),
    generatorSource: readFileSync(path.join(projectRoot, 'scripts', 'generate-seo-pages.mjs'), 'utf8'),
  });
  const output = formatRouteSitemapCoverageResult(result);

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

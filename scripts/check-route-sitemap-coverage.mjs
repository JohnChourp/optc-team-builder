#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { findUnmaintainedRuntimeAlternates, validateLanguageDeclarations } from './lib/public-page-language.mjs';
import { loadPublicRoutes } from './lib/public-routes.mjs';

/**
 * The router and the public route registry must describe the same site.
 *
 * 869f12x4k found the first half: `/faq` shipped as a top-level public route
 * and reached 0 of the 4,637 generated sitemap URLs, because the sitemap's
 * route list was a second hand-written copy. 869f12x57 found the second half in
 * production - `/faq` also had no `data.seo`, so the app served it
 * `noindex,follow` with a home-page canonical while the sitemap advertised it.
 *
 * `src/app/core/data/public-routes.data.ts` is now the one list, and this is
 * what binds the router to it:
 *
 *   A. a router route that is neither registered, aliased, nor excluded fails;
 *   B. a registered route that the router does not declare fails, so the
 *      registry cannot describe pages the app does not serve;
 *   C. a registered route whose router declaration has no
 *      `seo: publicRouteSeo(...)` fails - without it the app marks the page
 *      `noindex,follow`, which is how `/faq` was advertised and disowned;
 *   D. `publicRouteSeo('x')` called from a route whose path is not `x` fails,
 *      because that silently gives a page another page's title and canonical;
 *   E. an exclusion naming a route that no longer exists fails, so the registry
 *      cannot rot into ghosts that silently permit;
 *   F. a route both registered and excluded fails, because the two answers
 *      disagree and neither can be trusted;
 *   G. a page in another language - or under a language-scoped path - that
 *      names no alternates fails, and so do alternates that are not reciprocal,
 *      point at nothing, or disagree about the language; and the first page to
 *      name an alternate fails while `app.component.ts` still leaves alternate
 *      links alone across client-side navigation (869f13c6b,
 *      `scripts/lib/public-page-language.mjs`).
 *
 * Both sides are read from source rather than imported: `app.routes.ts` is
 * Angular config full of lazy `loadComponent` calls, and the registry is
 * TypeScript the app depends on. `scripts/lib/public-routes.mjs` does the
 * reading, and every other consumer uses it too.
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
    route: 'tabs/supported',
    reason:
      '869f17h3g. Answers "should I trust this tool" for someone who already has the app open, not for a search result. Its claims are kept true by the support-claims lane, which is a check rather than a crawler.',
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

/** The argument of `seo: publicRouteSeo('...')`, or null when the route declares none. */
function readPublicRouteSeoArgument(seoProperty) {
  if (!seoProperty || !ts.isPropertyAssignment(seoProperty)) {
    return null;
  }

  const call = seoProperty.initializer;

  if (
    !ts.isCallExpression(call) ||
    call.expression.getText() !== 'publicRouteSeo' ||
    call.arguments.length !== 1 ||
    !ts.isStringLiteralLike(call.arguments[0])
  ) {
    return null;
  }

  return call.arguments[0].text;
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
      const data = element.properties.find(
        (candidate) =>
          ts.isPropertyAssignment(candidate) &&
          candidate.name.getText().replace(/['"]/gu, '') === 'data',
      );
      const seo =
        data && ts.isObjectLiteralExpression(data.initializer)
          ? data.initializer.properties.find(
              (candidate) =>
                ts.isPropertyAssignment(candidate) &&
                candidate.name.getText().replace(/['"]/gu, '') === 'seo',
            )
          : undefined;

      routes.push({
        path: fullPath,
        redirectTo: readStringProperty(element, 'redirectTo') ?? null,
        /*
         * The path the route asks the registry for. `null` means the route
         * declared no `data.seo` at all; a string means it called
         * `publicRouteSeo(<that string>)`, which check D compares to its own
         * path - a typo there hands a page another page's title and canonical
         * and nothing else would notice.
         */
        seoLookup: readPublicRouteSeoArgument(seo),
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

export function inspectRouteSitemapCoverage({
  routesSource,
  publicRoutes = loadPublicRoutes(),
  exclusions = ROUTE_SITEMAP_EXCLUSIONS,
  appComponentSource,
}) {
  const routes = readAppRoutes(routesSource);
  const routePaths = new Set(routes.map((route) => route.path));
  const routesByPath = new Map(routes.map((route) => [route.path, route]));
  const excluded = new Map(exclusions.map((entry) => [entry.route, entry.reason]));
  const errors = [];

  /** Every path the registry accounts for: where it lives, where it publishes, and its aliases. */
  const registered = new Set();

  for (const record of publicRoutes) {
    registered.add(record.routePath);
    registered.add(record.canonicalPath);

    for (const alias of record.aliases) {
      registered.add(alias);
    }
  }

  if (routes.length === 0) {
    errors.push('No routes found in app.routes.ts - the router config could not be read.');
  }

  if (publicRoutes.length === 0) {
    errors.push('No records found in the public route registry - it could not be read.');
  }

  for (const route of routePaths) {
    const isRegistered = registered.has(route);
    const exclusionReason = excluded.get(route);

    if (isRegistered && exclusionReason !== undefined) {
      errors.push(
        `Route "${route}" is both in the public route registry and excluded from it. Remove one of the two.`,
      );
      continue;
    }

    if (!isRegistered && exclusionReason === undefined) {
      errors.push(
        `Route "${route}" is declared in app.routes.ts but is not in the public route registry and has ` +
          'no exclusion. Add it to PUBLIC_ROUTES in src/app/core/data/public-routes.data.ts, or add it ' +
          'to ROUTE_SITEMAP_EXCLUSIONS with a reason.',
      );
    }
  }

  for (const record of publicRoutes) {
    const route = routesByPath.get(record.routePath);

    if (!route) {
      errors.push(
        `The public route registry lists "${record.routePath}", which app.routes.ts does not declare. ` +
          'The registry would publish a page the app does not serve.',
      );
      continue;
    }

    if (route.seoLookup === null) {
      errors.push(
        `Route "${record.routePath}" is published by the registry but its router declaration has no ` +
          "`seo: publicRouteSeo(...)`. Without it the app writes noindex,follow and a canonical " +
          'pointing at the home page once it hydrates - so the URL is advertised and then disowned.',
      );
      continue;
    }

    if (route.seoLookup !== record.routePath) {
      errors.push(
        `Route "${record.routePath}" calls publicRouteSeo("${route.seoLookup}"), which is a different ` +
          "route. That hands this page another page's title, description and canonical.",
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

  /* G. */
  errors.push(...validateLanguageDeclarations(publicRoutes));

  if (appComponentSource !== undefined) {
    errors.push(...findUnmaintainedRuntimeAlternates(publicRoutes, appComponentSource));
  }

  return {
    routeCount: routePaths.size,
    registeredCount: publicRoutes.length,
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
    `${result.registeredCount} in the public route registry, ${result.excludedCount} excluded on purpose.`
  );
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = inspectRouteSitemapCoverage({
    routesSource: readFileSync(path.join(projectRoot, 'src', 'app', 'app.routes.ts'), 'utf8'),
    publicRoutes: loadPublicRoutes(projectRoot),
    appComponentSource: readFileSync(path.join(projectRoot, 'src', 'app', 'app.component.ts'), 'utf8'),
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

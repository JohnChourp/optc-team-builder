#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Exactly one thing may be servable as the sitemap.
 *
 * 869f12x4y. `public/sitemap.xml` was checked in with **7** `<loc>` entries
 * beside a generated sitemap of **4,638**, in the folder Angular copies verbatim
 * into the build output. A file that looks authoritative was 0.17% of the truth.
 *
 * The question the subtask asked first - could it ever reach production? -
 * was answered by measurement, and the answer is no:
 *
 *   `deploy-pages.yml` runs only `npm run build:pages`, which is
 *   `ng build && seo:pages && pwa:ngsw:pages && seo:audit`, `&&`-chained.
 *   `seo:pages` overwrites `dist/.../sitemap.xml`, and `seo:audit` runs last.
 *   Measured on a correct build with ONLY sitemap.xml swapped for the committed
 *   one, `seo:audit` exits 1 and names every missing public URL.
 *
 * So it was a readability defect rather than a live SEO failure - but a real
 * one: a plain `npm run build`, with no generator step, leaves the 7-URL file
 * sitting in `dist/` looking like the sitemap. That was reproduced by accident
 * while measuring the above, which is exactly how it would mislead someone.
 *
 * The fix is to delete it, because the alternative the subtask allowed - a
 * placeholder that `seo:audit` rejects - is the same ambiguity with a comment on
 * it. Absent is honest; stale is a lie.
 *
 * This check keeps it that way, and generalises to the whole class: a file the
 * generator owns must not sit in `public/` shadowing it, unless it is a small
 * constant that a committed mirror can legitimately match - in which case the
 * mirror is pinned to the generator's own value so the two cannot drift.
 *
 * Run: npm run seo:public-assets
 */

/**
 * Every path `generate-seo-pages.mjs` writes into the build output, and what
 * `public/` is allowed to hold for it.
 *
 * `absent`: the generated form is per-character, per-route, or otherwise too
 * large for a committed copy to ever be right.
 * `mirrors`: the generated form is a short constant, so a committed copy is a
 * legitimate convenience - pinned here to the generator's own value.
 */
export const GENERATOR_OWNED_OUTPUTS = [
  {
    publicPath: 'sitemap.xml',
    rule: 'absent',
    reason:
      'Generated from the seed, one URL per character: 4,638 entries against the 7 a committed copy held.',
  },
  {
    publicPath: 'sitemap.html',
    rule: 'absent',
    reason: 'Generated from the same public route list as sitemap.xml.',
  },
  {
    publicPath: 'robots.txt',
    rule: 'mirrors',
    reason:
      'Four lines built from one constant, so a committed copy is a working plain-build fallback rather than a second truth.',
  },
];

function normalize(value) {
  return String(value ?? '').replace(/\r\n/gu, '\n').trim();
}

/** The values the generator would emit, read from its source rather than a build. */
export function readGeneratorConstants(generatorSource) {
  const siteBaseUrl = generatorSource.match(
    /process\.env\.SEO_SITE_BASE_URL \?\? '([^']+)'/u,
  )?.[1];
  const indexNowKey = generatorSource.match(/const indexNowKey = '([0-9a-f]+)'/u)?.[1];
  const writesRobots = /await writeFile\(path\.join\(outputDir, 'robots\.txt'\), robots\)/u.test(
    generatorSource,
  );
  const writesSitemap = /await writeFile\(path\.join\(outputDir, 'sitemap\.xml'\), sitemap\)/u.test(
    generatorSource,
  );
  const writesSitemapHtml = /path\.join\(outputDir, 'sitemap\.html'\)/u.test(generatorSource);
  const writesIndexNowKey = /path\.join\(outputDir, `\$\{indexNowKey\}\.txt`\)/u.test(
    generatorSource,
  );

  return {
    siteBaseUrl,
    indexNowKey,
    writes: {
      'robots.txt': writesRobots,
      'sitemap.xml': writesSitemap,
      'sitemap.html': writesSitemapHtml,
      indexNowKey: writesIndexNowKey,
    },
  };
}

export function inspectPublicAssetShadowing({
  generatorSource,
  readPublicFile,
  publicFileExists,
  outputs = GENERATOR_OWNED_OUTPUTS,
}) {
  const constants = readGeneratorConstants(generatorSource);
  const errors = [];

  if (!constants.siteBaseUrl || !constants.indexNowKey) {
    errors.push(
      'generate-seo-pages.mjs no longer declares its site base URL and IndexNow key where this check reads them.',
    );

    return { checked: 0, errors };
  }

  for (const output of outputs) {
    if (constants.writes[output.publicPath] === false) {
      errors.push(
        `GENERATOR_OWNED_OUTPUTS claims generate-seo-pages.mjs writes "${output.publicPath}", and it no longer does. Remove the entry.`,
      );
      continue;
    }

    if (typeof output.reason !== 'string' || output.reason.trim().length < 12) {
      errors.push(`GENERATOR_OWNED_OUTPUTS entry "${output.publicPath}" needs a real reason.`);
    }

    const exists = publicFileExists(output.publicPath);

    if (output.rule === 'absent') {
      if (exists) {
        errors.push(
          `public/${output.publicPath} shadows a file the sitemap generator owns. ` +
            'Angular copies public/ verbatim into the build output, so a committed copy is served ' +
            'by any build that skips the generator. Delete it.',
        );
      }

      continue;
    }

    if (!exists) {
      errors.push(
        `public/${output.publicPath} is missing. It is declared as a mirror of the generated file, ` +
          'so a plain build has no copy of it at all.',
      );
      continue;
    }

    const expected = normalize(
      `User-agent: *\nAllow: /\n\nSitemap: ${constants.siteBaseUrl.replace(/\/$/u, '')}/sitemap.xml\n`,
    );
    const actual = normalize(readPublicFile(output.publicPath));

    if (actual !== expected) {
      errors.push(
        `public/${output.publicPath} has drifted from what generate-seo-pages.mjs writes. ` +
          `Expected:\n${expected}\nFound:\n${actual}`,
      );
    }
  }

  /*
   * The IndexNow key file is named after the key itself, so it cannot be a fixed
   * entry above - the name moves when the key does. Same rule, resolved.
   */
  const indexNowPath = `${constants.indexNowKey}.txt`;

  if (publicFileExists(indexNowPath)) {
    const actual = normalize(readPublicFile(indexNowPath));

    if (actual !== constants.indexNowKey) {
      errors.push(
        `public/${indexNowPath} must contain exactly the IndexNow key generate-seo-pages.mjs writes.`,
      );
    }
  }

  return { checked: outputs.length + 1, errors };
}

export function formatPublicAssetShadowingResult(result) {
  if (result.errors.length > 0) {
    return result.errors.map((error) => `[seo:public-assets] ${error}`).join('\n');
  }

  return `[seo:public-assets] ${result.checked} generator-owned output(s): none shadowed, no mirror drifted.`;
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const publicDir = path.join(projectRoot, 'public');
  const result = inspectPublicAssetShadowing({
    generatorSource: readFileSync(
      path.join(projectRoot, 'scripts', 'generate-seo-pages.mjs'),
      'utf8',
    ),
    publicFileExists: (relativePath) => existsSync(path.join(publicDir, relativePath)),
    readPublicFile: (relativePath) => readFileSync(path.join(publicDir, relativePath), 'utf8'),
  });
  const output = formatPublicAssetShadowingResult(result);

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

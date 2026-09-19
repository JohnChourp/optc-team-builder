import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadPublicRoutes, publishedPaths } from './lib/public-routes.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultOutputDir = path.join(projectRoot, 'dist', 'optc-team-builder', 'browser');
const outputDir = path.resolve(process.env.SEO_OUTPUT_DIR ?? defaultOutputDir);
const siteBaseUrl = normalizeSiteBaseUrl(
  process.env.SEO_SITE_BASE_URL ?? 'https://optcteambuilder.com',
);
const sitemapPath = path.join(outputDir, 'sitemap.xml');
const robotsPath = path.join(outputDir, 'robots.txt');
const sitemapHtmlPath = path.join(outputDir, 'sitemap.html');
const indexNowKey = '0e9b739514c64e9a9a762120955f79dc';
const indexNowKeyPath = path.join(outputDir, `${indexNowKey}.txt`);
const publicRouteRecords = loadPublicRoutes(projectRoot);

/*
 * 869f12x57. Both lists come from the app's own public route registry rather
 * than being restated here. They were two of the five copies of "which routes
 * are public", and `/faq` had to be added to each by hand - which is how it
 * reached the router and none of the others.
 *
 * The split is the registry's own: a record's `canonicalPath` is the URL the
 * sitemap must carry, and its `aliases` are extra paths the generator renders
 * for the same page. An alias must NOT appear in the sitemap - two URLs for one
 * page is the duplicate-content problem the canonical tag exists to prevent -
 * so adding an alias now forbids it automatically instead of needing a second
 * edit here.
 */
const publicToolPaths = new Set(publicRouteRecords.map((record) => record.canonicalPath));
const forbiddenSitemapPaths = new Set([
  ...publicRouteRecords.flatMap((record) => record.aliases),
  // Screens holding the reader's own data: rendered by the app, never indexed.
  'tabs/settings',
  'tabs/saved-teams',
  'tabs/saved-enemies',
  'tabs/character-boxes',
]);
const errors = [];

await auditRobotsTxt();
await auditIndexNowKey();
const sitemapUrls = await auditSitemapXml();
await auditGeneratedPages(sitemapUrls);
await auditSitemapHtml();

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[seo:audit] ${error}`);
  }

  process.exitCode = 1;
} else {
  console.log(
    `[seo:audit] checked ${sitemapUrls.length} sitemap URLs in ${path.relative(projectRoot, outputDir)}.`,
  );
}

async function auditRobotsTxt() {
  const robots = await readRequiredTextFile(robotsPath);
  const expectedSitemapLine = `Sitemap: ${siteBaseUrl}/sitemap.xml`;

  if (!/^User-agent:\s*\*/imu.test(robots)) {
    errors.push('robots.txt must include "User-agent: *".');
  }

  if (!/^Allow:\s*\/\s*$/imu.test(robots)) {
    errors.push('robots.txt must allow crawling with "Allow: /".');
  }

  if (!robots.split(/\r?\n/u).includes(expectedSitemapLine)) {
    errors.push(`robots.txt must reference "${expectedSitemapLine}".`);
  }
}

async function auditIndexNowKey() {
  const keyFile = await readRequiredTextFile(indexNowKeyPath);

  if (keyFile.trim() !== indexNowKey) {
    errors.push(`${relative(indexNowKeyPath)} must contain the IndexNow key.`);
  }
}

async function auditSitemapXml() {
  const sitemap = await readRequiredTextFile(sitemapPath);
  const locMatches = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)];
  const urls = locMatches.map((match) => decodeXml(match[1] ?? '').trim());
  const uniqueUrls = new Set(urls);

  if (!urls.length) {
    errors.push('sitemap.xml must include at least one URL.');
  }

  if (uniqueUrls.size !== urls.length) {
    errors.push('sitemap.xml must not include duplicate URLs.');
  }

  for (const requiredPath of publicToolPaths) {
    const requiredUrl = buildAbsoluteUrl(requiredPath);

    if (!uniqueUrls.has(requiredUrl)) {
      errors.push(`sitemap.xml is missing required public URL ${requiredUrl}.`);
    }
  }

  for (const url of urls) {
    if (!url.startsWith(`${siteBaseUrl}/`)) {
      errors.push(`sitemap URL must stay under ${siteBaseUrl}: ${url}`);
      continue;
    }

    if (/[?#]/u.test(url)) {
      errors.push(`sitemap URL must not include query strings or hashes: ${url}`);
    }

    if (!url.endsWith('/')) {
      errors.push(`sitemap URL must use trailing slash canonical form: ${url}`);
    }

    const routePath = routePathFromUrl(url);

    if (forbiddenSitemapPaths.has(routePath)) {
      errors.push(`sitemap.xml must not include non-canonical or private URL path: ${routePath}`);
    }

    if (!isAllowedSitemapPath(routePath)) {
      errors.push(`sitemap.xml includes a non-public URL path: ${routePath || '(root)'}`);
    }
  }

  return urls;
}

async function auditGeneratedPages(urls) {
  for (const url of urls) {
    const routePath = routePathFromUrl(url);
    const htmlPath = htmlPathForRoute(routePath);
    const html = await readRequiredTextFile(htmlPath);
    const canonicalHrefs = extractAttributeValues(
      html,
      /<link\s+[^>]*rel=["']canonical["'][^>]*>/giu,
      'href',
    );
    const robotsContents = extractAttributeValues(
      html,
      /<meta\s+[^>]*name=["']robots["'][^>]*>/giu,
      'content',
    );
    const descriptionContents = extractAttributeValues(
      html,
      /<meta\s+[^>]*name=["']description["'][^>]*>/giu,
      'content',
    );
    const title = html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]?.trim() ?? '';
    const jsonLd = parseJsonLd(html, htmlPath);

    if (canonicalHrefs.length !== 1) {
      errors.push(`${relative(htmlPath)} must include exactly one canonical link.`);
    } else if (decodeHtmlAttribute(canonicalHrefs[0]) !== url) {
      errors.push(`${relative(htmlPath)} canonical must be ${url}.`);
    }

    if (robotsContents.length !== 1) {
      errors.push(`${relative(htmlPath)} must include exactly one robots meta tag.`);
    } else if (decodeHtmlAttribute(robotsContents[0]) !== 'index,follow') {
      errors.push(`${relative(htmlPath)} robots meta must be index,follow.`);
    }

    if (
      descriptionContents.length !== 1 ||
      decodeHtmlAttribute(descriptionContents[0] ?? '').length === 0
    ) {
      errors.push(`${relative(htmlPath)} must include one non-empty meta description.`);
    }

    if (!title.length) {
      errors.push(`${relative(htmlPath)} must include a non-empty title.`);
    }

    if (!/<app-root\b[\s\S]*?<main\b[\s\S]*?<\/main>[\s\S]*?<\/app-root>/iu.test(html)) {
      errors.push(
        `${relative(htmlPath)} must include crawlable fallback <main> content inside <app-root>.`,
      );
    }

    if (/\.seo-fallback\s*\{[^}]*display:\s*none\s*!important/iu.test(html)) {
      errors.push(`${relative(htmlPath)} must not hide SEO fallback content by default.`);
    }

    auditJsonLdGraph(jsonLd, htmlPath, routePath);

    if (routePath === '') {
      auditRootFallbackHtml(html, htmlPath);
    }

    if (/^characters\/[1-9]\d*$/u.test(routePath)) {
      auditCharacterFallbackHtml(html, htmlPath, Number(routePath.split('/')[1]));
    }
  }
}

function auditRootFallbackHtml(html, htmlPath) {
  if (!/<main\s+class=["']seo-fallback seo-home-fallback["']/iu.test(html)) {
    errors.push(`${relative(htmlPath)} root fallback must render the styled homepage fallback.`);
  }

  if (/<main\s+class=["']seo-fallback seo-home-fallback["'][\s\S]*?\salt=["']["']/iu.test(html)) {
    errors.push(`${relative(htmlPath)} root fallback images must not use empty alt text.`);
  }

  for (const routePath of [
    'tabs/characters',
    'tabs/rumble-characters',
    'tabs/auto-team-builder',
    'tabs/manual-team-builder',
    'tabs/captain-coverage',
    'tabs/auto-team-builder-rumble',
    'tabs/crew-forge',
    'tools/optc-team-builder',
    'tools/optc-character-database',
    'guides/how-to-build-an-optc-team',
    'guides/guided-build-compare-team-sharing',
  ]) {
    const expectedHref = buildAbsoluteUrl(routePath);

    if (!html.includes(`href="${expectedHref}"`)) {
      errors.push(`${relative(htmlPath)} root fallback must link to ${expectedHref}.`);
    }
  }
}

function auditCharacterFallbackHtml(html, htmlPath, characterId) {
  for (const expectedText of [
    'OPTC Team Builder character tools',
    'Browse OPTC characters',
    'Open Auto Team Builder',
    'Rank Rumble characters',
  ]) {
    if (!html.includes(expectedText)) {
      errors.push(`${relative(htmlPath)} character fallback must include "${expectedText}".`);
    }
  }

  /*
   * 869f13c5c. The tool links' first entry is the page's primary action: Captain Coverage with this
   * character as Captain when it has a Captain Ability, Auto Team Builder otherwise. No destination
   * appears twice, and two lines that used to misreport Rumble data stay gone.
   */
  const toolLinks = [
    ...(html.match(/<nav aria-label="OPTC Team Builder character tools">([\s\S]*?)<\/nav>/u)?.[1] ?? '').matchAll(
      /<a href="([^"]*)">([^<]*)<\/a>/gu,
    ),
  ].map((match) => ({ href: match[1], label: match[2] }));
  const expectedFirst = html.includes('<p>Captain ability: ')
    ? {
        href: `${buildAbsoluteUrl('tabs/captain-coverage')}?captain=${characterId}`,
        label: 'See who this Captain boosts',
      }
    : { href: buildAbsoluteUrl('tabs/auto-team-builder'), label: 'Open Auto Team Builder' };

  if (toolLinks[0]?.href !== expectedFirst.href || toolLinks[0]?.label !== expectedFirst.label) {
    errors.push(
      `${relative(htmlPath)} character fallback must lead with "${expectedFirst.label}" (${expectedFirst.href}).`,
    );
  }

  if (new Set(toolLinks.map((link) => link.href)).size !== toolLinks.length) {
    errors.push(`${relative(htmlPath)} character fallback must not link the same destination twice.`);
  }

  for (const misreport of ['Pirate Rumble passive: Rumble type', 'Pirate Rumble special: Cooldown']) {
    if (html.includes(misreport)) {
      errors.push(`${relative(htmlPath)} character fallback must not print "${misreport}".`);
    }
  }
}

async function auditSitemapHtml() {
  let sitemapHtml = '';

  try {
    await access(sitemapHtmlPath);
    sitemapHtml = await readFile(sitemapHtmlPath, 'utf8');
  } catch {
    errors.push('sitemap.html must be generated next to sitemap.xml.');
  }

  for (const expectedText of ['Main public pages', 'Newest generated OPTC character pages']) {
    if (sitemapHtml && !sitemapHtml.includes(expectedText)) {
      errors.push(`sitemap.html must include "${expectedText}".`);
    }
  }
}

async function readRequiredTextFile(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    errors.push(`Missing required file ${relative(filePath)}.`);

    if (error instanceof Error) {
      errors.push(error.message);
    }

    return '';
  }
}

function isAllowedSitemapPath(routePath) {
  return publicToolPaths.has(routePath) || /^characters\/[1-9]\d*$/u.test(routePath);
}

function parseJsonLd(html, htmlPath) {
  const match = html.match(
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/iu,
  );

  if (!match) {
    errors.push(`${relative(htmlPath)} must include JSON-LD structured data.`);
    return null;
  }

  try {
    return JSON.parse(decodeHtmlScript(match[1] ?? '').trim());
  } catch (error) {
    errors.push(`${relative(htmlPath)} must include valid JSON-LD.`);

    if (error instanceof Error) {
      errors.push(error.message);
    }

    return null;
  }
}

function auditJsonLdGraph(jsonLd, htmlPath, routePath) {
  const graph = Array.isArray(jsonLd?.['@graph']) ? jsonLd['@graph'] : [];

  if (!graph.length) {
    errors.push(`${relative(htmlPath)} JSON-LD must include @graph nodes.`);
    return;
  }

  if (!graph.some((node) => node?.['@type'] === 'WebSite' && node?.potentialAction?.['@type'] === 'SearchAction')) {
    errors.push(`${relative(htmlPath)} JSON-LD WebSite must include SearchAction.`);
  }

  if (!graph.some((node) => node?.['@type'] === 'BreadcrumbList')) {
    errors.push(`${relative(htmlPath)} JSON-LD must include BreadcrumbList.`);
  }

  if (routePath.startsWith('tools/') && !graph.some((node) => node?.['@type'] === 'SoftwareApplication')) {
    errors.push(`${relative(htmlPath)} tool pages must include SoftwareApplication JSON-LD.`);
  }

  if (
    ['tabs/characters', 'tabs/rumble-characters', 'tools/optc-character-database'].includes(
      routePath,
    ) &&
    !graph.some((node) => node?.['@type'] === 'CollectionPage')
  ) {
    errors.push(`${relative(htmlPath)} catalog pages must include CollectionPage JSON-LD.`);
  }
}

function htmlPathForRoute(routePath) {
  return routePath.length === 0
    ? path.join(outputDir, 'index.html')
    : path.join(outputDir, ...routePath.split('/'), 'index.html');
}

function routePathFromUrl(url) {
  const withoutBase = url.slice(siteBaseUrl.length).replace(/^\/+|\/+$/gu, '');

  return withoutBase;
}

function buildAbsoluteUrl(routePath) {
  const normalizedRoutePath = routePath.replace(/^\/+|\/+$/gu, '');

  return normalizedRoutePath.length ? `${siteBaseUrl}/${normalizedRoutePath}/` : `${siteBaseUrl}/`;
}

function normalizeSiteBaseUrl(value) {
  return String(value).trim().replace(/\/+$/gu, '');
}

function extractAttributeValues(html, tagPattern, attributeName) {
  return [...html.matchAll(tagPattern)]
    .map((match) => match[0])
    .map((tag) => {
      const attributePattern = new RegExp(`${attributeName}=["']([^"']*)["']`, 'iu');

      return tag.match(attributePattern)?.[1] ?? '';
    });
}

function decodeXml(value) {
  return decodeHtmlAttribute(value).replaceAll('&apos;', "'");
}

function decodeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function decodeHtmlScript(value) {
  return String(value).replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function relative(filePath) {
  return path.relative(projectRoot, filePath);
}

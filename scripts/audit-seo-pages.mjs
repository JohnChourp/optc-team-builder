import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultOutputDir = path.join(projectRoot, 'dist', 'optc-team-builder', 'browser');
const outputDir = path.resolve(process.env.SEO_OUTPUT_DIR ?? defaultOutputDir);
const siteBaseUrl = normalizeSiteBaseUrl(
  process.env.SEO_SITE_BASE_URL ?? 'https://johnchourp.github.io/optc-team-builder',
);
const sitemapPath = path.join(outputDir, 'sitemap.xml');
const robotsPath = path.join(outputDir, 'robots.txt');
const sitemapHtmlPath = path.join(outputDir, 'sitemap.html');
const publicToolPaths = new Set([
  '',
  'tabs/characters',
  'tabs/team-builder',
  'tabs/auto-team-builder',
  'tabs/crew-forge',
  'privacy',
  'cookies',
  'terms',
]);
const forbiddenSitemapPaths = new Set([
  'tabs/privacy',
  'tabs/cookies',
  'tabs/terms',
  'tabs/settings',
  'tabs/saved-teams',
  'tabs/saved-enemies',
  'tabs/character-boxes',
]);
const errors = [];

await auditRobotsTxt();
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

    if (routePath === '') {
      auditRootFallbackHtml(html, htmlPath);
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
    'tabs/team-builder',
    'tabs/auto-team-builder',
    'tabs/crew-forge',
  ]) {
    const expectedHref = buildAppRoutePath(routePath);

    if (!html.includes(`href="${expectedHref}"`)) {
      errors.push(`${relative(htmlPath)} root fallback must link to ${expectedHref}.`);
    }
  }
}

async function auditSitemapHtml() {
  try {
    await access(sitemapHtmlPath);
  } catch {
    errors.push('sitemap.html must be generated next to sitemap.xml.');
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

function buildAppRoutePath(routePath) {
  const normalizedRoutePath = routePath.replace(/^\/+|\/+$/gu, '');
  const sitePath = new URL(siteBaseUrl).pathname.replace(/\/+$/gu, '');

  return `${sitePath}/${normalizedRoutePath}/`.replace(/\/{2,}/gu, '/');
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

function relative(filePath) {
  return path.relative(projectRoot, filePath);
}

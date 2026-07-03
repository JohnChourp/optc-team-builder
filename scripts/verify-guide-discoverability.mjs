#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultOutputDir = path.join(projectRoot, 'dist', 'optc-team-builder', 'browser');
const defaultReportPath = path.join(defaultOutputDir, 'guide-discoverability-report.json');
const siteBaseUrl = normalizeSiteBaseUrl(
  process.env.SEO_SITE_BASE_URL ?? 'https://optcteambuilder.com',
);

export const GUIDE_DISCOVERABILITY_INVENTORY = [
  {
    id: 'team-building-guide',
    path: 'guides/how-to-build-an-optc-team',
    title: 'How to Build an OPTC Team | One Piece Treasure Cruise Guide',
    heading: 'How to Build an OPTC Team',
    sourceHints: [
      { file: 'README.md', text: 'https://optcteambuilder.com/guides/how-to-build-an-optc-team/' },
      { file: 'scripts/generate-seo-pages.mjs', text: 'guides/how-to-build-an-optc-team' },
      { file: 'docs/feature-coverage-map.md', text: 'Public team-building guides in `README.md`' },
    ],
    appHelpHints: [],
  },
  {
    id: 'guided-compare-sharing-guide',
    path: 'guides/guided-build-compare-team-sharing',
    title: 'Guided Build, Compare Mode, and Team Sharing | OPTC Team Builder',
    heading: 'Guided Build, Compare Mode, and Team Sharing',
    sourceHints: [
      {
        file: 'README.md',
        text: 'https://optcteambuilder.com/guides/guided-build-compare-team-sharing/',
      },
      { file: 'scripts/generate-seo-pages.mjs', text: 'guides/guided-build-compare-team-sharing' },
      { file: 'docs/post-merge-smoke-pack.md', text: 'guided-build-compare-team-sharing' },
    ],
    appHelpHints: [
      {
        file: 'src/app/pages/auto-team-builder/auto-team-builder.page.html',
        text: '/guides/guided-build-compare-team-sharing',
      },
      {
        file: 'src/app/pages/saved-teams/saved-teams.page.html',
        text: '/guides/guided-build-compare-team-sharing',
      },
    ],
  },
  {
    id: 'pirate-rumble-guide',
    path: 'guides/optc-pirate-rumble-team-building',
    title: 'OPTC Pirate Rumble Team Building Guide | Rumble Builder',
    heading: 'OPTC Pirate Rumble Team Building',
    sourceHints: [
      {
        file: 'scripts/generate-seo-pages.mjs',
        text: 'guides/optc-pirate-rumble-team-building',
      },
      { file: 'docs/feature-coverage-map.md', text: 'Pirate Rumble character ranking' },
    ],
    appHelpHints: [],
  },
];

export async function verifyGuideDiscoverability({
  appRoot = projectRoot,
  outputDir = defaultOutputDir,
  reportPath = defaultReportPath,
  siteBaseUrl: rawSiteBaseUrl = siteBaseUrl,
} = {}) {
  const normalizedSiteBaseUrl = normalizeSiteBaseUrl(rawSiteBaseUrl);
  const errors = [];
  const guideResults = [];
  const sitemapXml = await readRequiredTextFile(path.join(outputDir, 'sitemap.xml'), errors);
  const sitemapHtml = await readRequiredTextFile(path.join(outputDir, 'sitemap.html'), errors);
  const appRoutes = await readRequiredTextFile(path.join(appRoot, 'src', 'app', 'app.routes.ts'), errors);
  const sitemapUrls = extractSitemapUrls(sitemapXml);

  for (const guide of GUIDE_DISCOVERABILITY_INVENTORY) {
    const canonicalUrl = buildAbsoluteUrl(normalizedSiteBaseUrl, guide.path);
    const htmlPath = htmlPathForRoute(outputDir, guide.path);
    const html = await readRequiredTextFile(htmlPath, errors);
    const guideErrors = [];

    expectContains(sitemapUrls, canonicalUrl, guideErrors, `${guide.id}: sitemap.xml`);
    expectText(sitemapHtml, canonicalUrl, guideErrors, `${guide.id}: sitemap.html`);
    expectText(sitemapHtml, guide.heading, guideErrors, `${guide.id}: sitemap.html`);
    auditGeneratedGuidePage({ guide, html, canonicalUrl, htmlPath, guideErrors });
    auditAppRouteRegistration({ guide, appRoutes, guideErrors });
    await auditSourceHints({ appRoot, guide, guideErrors });

    for (const error of guideErrors) {
      errors.push(error);
    }

    guideResults.push({
      id: guide.id,
      path: guide.path,
      canonicalUrl,
      status: guideErrors.length === 0 ? 'ok' : 'failed',
      errors: guideErrors,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    siteBaseUrl: normalizedSiteBaseUrl,
    outputDir: path.relative(appRoot, outputDir),
    checkedGuides: guideResults,
    status: errors.length === 0 ? 'ok' : 'failed',
  };

  if (reportPath) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  return { errors, report };
}

function auditGeneratedGuidePage({ guide, html, canonicalUrl, htmlPath, guideErrors }) {
  const relativeHtmlPath = path.relative(projectRoot, htmlPath);
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
  const title = decodeHtmlText(html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]?.trim() ?? '');
  const jsonLd = parseJsonLd(html, relativeHtmlPath, guideErrors);

  if (canonicalHrefs.length !== 1 || decodeHtmlAttribute(canonicalHrefs[0] ?? '') !== canonicalUrl) {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} must use canonical ${canonicalUrl}.`);
  }

  if (robotsContents.length !== 1 || decodeHtmlAttribute(robotsContents[0] ?? '') !== 'index,follow') {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} must use robots index,follow.`);
  }

  if (descriptionContents.length !== 1 || !decodeHtmlAttribute(descriptionContents[0] ?? '').trim()) {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} must include one non-empty meta description.`);
  }

  if (title !== guide.title) {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} title must be "${guide.title}".`);
  }

  const fallbackText = extractFallbackMainText(html);

  if (!fallbackText.includes(guide.heading)) {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} fallback content must include "${guide.heading}".`);
  }

  auditJsonLd({ guide, jsonLd, canonicalUrl, relativeHtmlPath, guideErrors });
}

function auditAppRouteRegistration({ guide, appRoutes, guideErrors }) {
  expectText(appRoutes, `path: '${guide.path}'`, guideErrors, `${guide.id}: src/app/app.routes.ts`);
  expectText(
    appRoutes,
    `canonicalPath: '${guide.path}'`,
    guideErrors,
    `${guide.id}: src/app/app.routes.ts`,
  );
  expectText(appRoutes, `title: '${guide.title}'`, guideErrors, `${guide.id}: src/app/app.routes.ts`);
}

async function auditSourceHints({ appRoot, guide, guideErrors }) {
  for (const hint of [...guide.sourceHints, ...guide.appHelpHints]) {
    const filePath = path.join(appRoot, ...hint.file.split('/'));
    const source = await readRequiredTextFile(filePath, guideErrors);

    if (!source.includes(hint.text)) {
      guideErrors.push(`${guide.id}: ${hint.file} must reference ${hint.text}.`);
    }
  }
}

function auditJsonLd({ guide, jsonLd, canonicalUrl, relativeHtmlPath, guideErrors }) {
  const graph = Array.isArray(jsonLd?.['@graph']) ? jsonLd['@graph'] : [];

  if (!graph.length) {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} JSON-LD must include @graph nodes.`);
    return;
  }

  if (!graph.some((node) => node?.['@type'] === 'WebPage' && node?.url === canonicalUrl)) {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} JSON-LD must include a WebPage node for ${canonicalUrl}.`);
  }

  if (!graph.some((node) => node?.['@type'] === 'BreadcrumbList')) {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} JSON-LD must include BreadcrumbList.`);
  }

  if (!graph.some((node) => node?.['@type'] === 'WebSite' && node?.potentialAction?.['@type'] === 'SearchAction')) {
    guideErrors.push(`${guide.id}: ${relativeHtmlPath} JSON-LD WebSite must include SearchAction.`);
  }
}

async function readRequiredTextFile(filePath, errors) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    errors.push(`Missing required file ${path.relative(projectRoot, filePath)}.`);

    if (error instanceof Error) {
      errors.push(error.message);
    }

    return '';
  }
}

function extractSitemapUrls(sitemapXml) {
  return [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) =>
    decodeHtmlAttribute(match[1] ?? '').trim(),
  );
}

function parseJsonLd(html, relativeHtmlPath, guideErrors) {
  const match = html.match(
    /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/iu,
  );

  if (!match) {
    guideErrors.push(`${relativeHtmlPath} must include JSON-LD structured data.`);
    return null;
  }

  try {
    return JSON.parse(decodeHtmlScript(match[1] ?? '').trim());
  } catch (error) {
    guideErrors.push(`${relativeHtmlPath} must include valid JSON-LD.`);

    if (error instanceof Error) {
      guideErrors.push(error.message);
    }

    return null;
  }
}

function extractAttributeValues(html, tagPattern, attributeName) {
  return [...html.matchAll(tagPattern)]
    .map((match) => match[0])
    .map((tag) => {
      const attributePattern = new RegExp(`${attributeName}=["']([^"']*)["']`, 'iu');

      return tag.match(attributePattern)?.[1] ?? '';
    });
}

function extractFallbackMainText(html) {
  const mainHtml =
    html.match(/<app-root\b[^>]*>[\s\S]*?<main\b[^>]*>([\s\S]*?)<\/main>[\s\S]*?<\/app-root>/iu)?.[1] ??
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1] ??
    '';

  return decodeHtmlText(mainHtml.replace(/<[^>]*>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

function expectContains(values, expected, errors, label) {
  if (!values.includes(expected)) {
    errors.push(`${label} must include ${expected}.`);
  }
}

function expectText(source, expected, errors, label) {
  if (!source.includes(expected)) {
    errors.push(`${label} must include ${expected}.`);
  }
}

function htmlPathForRoute(outputDir, routePath) {
  return path.join(outputDir, ...routePath.split('/'), 'index.html');
}

function buildAbsoluteUrl(normalizedSiteBaseUrl, routePath) {
  return `${normalizedSiteBaseUrl}/${routePath.replace(/^\/+|\/+$/gu, '')}/`;
}

function normalizeSiteBaseUrl(value) {
  return String(value).trim().replace(/\/+$/gu, '');
}

function decodeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function decodeHtmlText(value) {
  return decodeHtmlAttribute(value).replaceAll('&#39;', "'");
}

function decodeHtmlScript(value) {
  return String(value).replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectRun()) {
  const outputDir = path.resolve(process.env.GUIDE_DISCOVERABILITY_OUTPUT_DIR ?? defaultOutputDir);
  const reportPath = path.resolve(process.env.GUIDE_DISCOVERABILITY_REPORT ?? defaultReportPath);
  const { errors, report } = await verifyGuideDiscoverability({ outputDir, reportPath });

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[guide-discoverability] ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `[guide-discoverability] checked ${report.checkedGuides.length} public guide/help routes; report=${path.relative(
        projectRoot,
        reportPath,
      )}.`,
    );
  }
}

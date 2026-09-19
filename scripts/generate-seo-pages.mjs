import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SITE_LANGUAGE, hreflangLinks, languageOf } from './lib/public-page-language.mjs';
import { loadPublicRoutes } from './lib/public-routes.mjs';
import { loadSeoContentPages } from './lib/seo-content.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultOutputDir = path.join(projectRoot, 'dist', 'optc-team-builder', 'browser');
const defaultSeedPath = path.join(projectRoot, 'public', 'assets', 'data', 'optc-seed.sql');
const outputDir = path.resolve(process.env.SEO_OUTPUT_DIR ?? defaultOutputDir);
const seedPath = path.resolve(process.env.SEO_SEED_PATH ?? defaultSeedPath);
const siteBaseUrl = normalizeSiteBaseUrl(
  process.env.SEO_SITE_BASE_URL ?? 'https://optcteambuilder.com',
);
const generatedAt = new Date().toISOString().slice(0, 10);
const siteName = 'OPTC Team Builder';
const homePageTitle = 'OPTC Team Builder | One Piece Treasure Cruise Tools';
const siteDescription =
  'Plan OPTC crews with character search, Rumble rankings, captain coverage, auto team building, Crew Forge, saved teams, enemies, boxes, Drive sync, and offline tools.';
const defaultImageUrl = `${siteBaseUrl}/brand/favicon-master-v2-optimized.png`;
const indexNowKey = '0e9b739514c64e9a9a762120955f79dc';
/*
 * 869f13c5m. No analytics tag is written into any generated page. They take the app shell, which has
 * none since 869f13c5m, and `sitemap.html` carried its own copy of the tag manager snippet, removed
 * with it: the tag manager loads only after a reader accepts analytics, inside the app.
 */
const homeFallbackHeroCharacters = [
  {
    alt: 'Kozuki Hiyori - Graveside Prayer character artwork',
    src: 'assets/exact-character-images/4208.png',
  },
  {
    alt: 'Kozuki Hiyori - Resounding Shamisen character artwork',
    src: 'assets/exact-character-images/4209.png',
  },
  {
    alt: 'Kid & Killer DEX character artwork',
    src: 'assets/exact-character-images/5601.png',
  },
];

const publicRouteContent = [
  {
    path: '',
    heading: 'OPTC Team Builder for One Piece Treasure Cruise',
    paragraphs: [
      'OPTC Team Builder is a fan-made workspace for One Piece Treasure Cruise players who want a faster way to find characters, compare abilities, check Rumble rankings and captain coverage, plan crews, and keep useful setups organized. The app combines a searchable character catalog, manual and automatic team building, Pirate Rumble tools, Crew Forge screenshot imports, saved teams, saved enemies, character boxes, Drive sync, and settings for import/export and backups.',
      'Use Characters to search by name, type, class, favorites, and ability data before opening detailed character pages. Rumble Characters ranks Pirate Rumble units, Captain Coverage starts from a chosen Captain and lists units covered by that Captain ability, Manual Team Builder saves fixed crews, and Auto Team Builder matches enemy mechanics and ability requirements against the local catalog.',
      'Auto Team Rumble Builder scores rumble-capable units and fills active and bench slots. Crew Forge can import a crew screenshot and match recognized slots back to editable OPTC character data. Saved Teams, Saved Rumble Teams, Character Boxes, and Saved Enemies keep recurring planning data available in your browser, while Settings and Drive Sync cover language, backups, analytics consent, and data transfer tools.',
      'The project is not an official Bandai Namco tool. It exists to make OPTC planning easier with clear links, readable character summaries, and generated pages that describe the same tools available in the web app.',
    ],
    links: [
      { label: 'Browse OPTC characters', path: 'tabs/characters' },
      { label: 'Rank Pirate Rumble characters', path: 'tabs/rumble-characters' },
      { label: 'Check captain coverage', path: 'tabs/captain-coverage' },
      { label: 'Build an OPTC team', path: 'tabs/auto-team-builder' },
      { label: 'Build a manual OPTC team', path: 'tabs/manual-team-builder' },
      { label: 'Build a Pirate Rumble team', path: 'tabs/auto-team-builder-rumble' },
      { label: 'Import crew screenshots', path: 'tabs/crew-forge' },
      { label: 'OPTC team builder tool', path: 'tools/optc-team-builder' },
      { label: 'OPTC character database', path: 'tools/optc-character-database' },
      { label: 'How to build an OPTC team', path: 'guides/how-to-build-an-optc-team' },
      { label: 'Guided build, compare mode, and team sharing', path: 'guides/guided-build-compare-team-sharing' },
      { label: 'Open the public sitemap', path: 'sitemap.html' },
    ],
  },
  {
    path: 'tabs/characters',
    heading: 'OPTC Character Catalog',
    paragraphs: [
      'Browse the One Piece Treasure Cruise character catalog by id, name, type, class, stars, cost, and ability data. Character pages include searchable OPTC details for captain abilities, specials, support effects, rumble information, and team-building notes.',
      'This page is the main entry point for finding units before opening a character detail page or adding candidates to a crew plan.',
    ],
    schemaType: 'CollectionPage',
    links: [
      { label: 'Use the OPTC character database', path: 'tools/optc-character-database' },
      { label: 'Open Auto Team Builder', path: 'tabs/auto-team-builder' },
    ],
  },
  {
    path: 'tabs/rumble-characters',
    heading: 'OPTC Rumble Characters',
    paragraphs: [
      'Rumble Characters ranks One Piece Treasure Cruise Pirate Rumble units by score, favorites, core filters, and custom stat focus.',
      'Use this page before building Pirate Rumble teams when you need to compare units by rumble data instead of regular quest abilities.',
    ],
    schemaType: 'CollectionPage',
    links: [
      { label: 'Build a Pirate Rumble team', path: 'tabs/auto-team-builder-rumble' },
      { label: 'Read the Pirate Rumble team-building guide', path: 'guides/optc-pirate-rumble-team-building' },
    ],
  },
  {
    path: 'tabs/auto-team-builder',
    heading: 'OPTC Auto Team Builder',
    paragraphs: [
      'Auto Team Builder helps find One Piece Treasure Cruise crew candidates by enemy mechanics, character abilities, type filters, class filters, manual locks, and team-building requirements.',
      'Lock known units when you already have part of the team, or enter the mechanics and requirements you need covered to review matching character candidates from the local OPTC data.',
    ],
    links: [
      { label: 'Build a manual OPTC team', path: 'tabs/manual-team-builder' },
      { label: 'Read how to build an OPTC team', path: 'guides/how-to-build-an-optc-team' },
      { label: 'Browse OPTC characters', path: 'tabs/characters' },
    ],
  },
  {
    path: 'tabs/manual-team-builder',
    heading: 'OPTC Manual Team Builder',
    paragraphs: [
      'Manual Team Builder is the fixed crew workspace for One Piece Treasure Cruise players who already know the exact characters they want to save.',
      'Choose six character slots, attach an optional ship, add notes, and use the local max-cost control to keep future character picks inside the budget before saving the team.',
    ],
    links: [
      { label: 'Open Auto Team Builder', path: 'tabs/auto-team-builder' },
      { label: 'Browse OPTC characters', path: 'tabs/characters' },
      { label: 'Open saved teams', path: 'tabs/saved-teams' },
    ],
  },
  {
    path: 'tabs/captain-coverage',
    heading: 'OPTC Captain Coverage',
    paragraphs: [
      'Captain Coverage starts from a selected OPTC Captain and shows characters covered by that Captain Ability under strict type, class, cost, universal, and self-scope matching.',
      'Use this page when you want to build from a known Captain and verify which characters naturally fit that Captain ability before committing to a crew plan.',
    ],
    links: [
      { label: 'Open Auto Team Builder', path: 'tabs/auto-team-builder' },
      { label: 'Browse OPTC characters', path: 'tabs/characters' },
    ],
  },
  {
    path: 'tabs/auto-team-builder-rumble',
    heading: 'OPTC Auto Team Rumble Builder',
    paragraphs: [
      'Auto Team Rumble Builder builds Pirate Rumble teams from local OPTC rumble data with deterministic scoring and synergy ranking.',
      'Use this page to compare active and bench candidates, inspect synergy, and shape Rumble teams from the same local data used elsewhere in the app.',
    ],
    links: [
      { label: 'Rank Rumble characters', path: 'tabs/rumble-characters' },
      { label: 'Read the Pirate Rumble team-building guide', path: 'guides/optc-pirate-rumble-team-building' },
    ],
  },
  {
    path: 'tabs/crew-forge',
    heading: 'OPTC Crew Forge',
    paragraphs: [
      'Crew Forge imports One Piece Treasure Cruise crew screenshots and matches recognized slots against the OPTC character catalog. It helps turn an existing crew image into editable team data.',
      'Use this tool when you want to rebuild, inspect, or refine a crew from a screenshot instead of searching for every character manually.',
    ],
    links: [
      { label: 'Browse matched OPTC characters', path: 'tabs/characters' },
      { label: 'Open Auto Team Builder', path: 'tabs/auto-team-builder' },
    ],
  },
  {
    path: 'tabs/account',
    heading: 'OPTC Team Builder Account and Drive Sync',
    paragraphs: [
      'The account page manages optional Google sign-in and Google Drive sync for OPTC Team Builder.',
      'Use it to connect a Google account, create or review a Drive backup, restore data on another device, and keep local browser data under your control.',
    ],
    links: [
      { label: 'Browse OPTC characters', path: 'tabs/characters' },
      { label: 'Open saved teams', path: 'tabs/saved-teams' },
      { label: 'Open character boxes', path: 'tabs/character-boxes' },
    ],
  },
  {
    path: 'faq',
    heading: 'OPTC Team Builder FAQ',
    paragraphs: [
      'The OPTC Team Builder FAQ answers the questions players ask while building a One Piece Treasure Cruise team: where to start between the two builders, what the filters and tags actually mean, and how they combine.',
      'It also covers the results themselves - when an Auto Team Builder result changes, what happens when nothing fits every requirement, how to check a team before saving it, and what to do when a suggested team looks wrong.',
      'The in-app version of this page is available in English and Greek, with links that open the screen each answer describes.',
    ],
    links: [
      { label: 'Open the FAQ', path: 'tabs/faq' },
      { label: 'Open Auto Team Builder', path: 'tabs/auto-team-builder' },
      { label: 'Open Manual Team Builder', path: 'tabs/manual-team-builder' },
      { label: 'Read the team-building guide', path: 'guides/how-to-build-an-optc-team' },
    ],
  },
  {
    path: 'privacy',
    heading: 'Privacy Policy',
    paragraphs: [
      'Read how OPTC Team Builder handles privacy for the web app, including local app data, optional analytics consent, and related browser storage.',
    ],
  },
  {
    path: 'cookies',
    heading: 'Cookie Policy',
    paragraphs: [
      'Read how OPTC Team Builder uses cookies or browser storage for app preferences, consent choices, and optional analytics behavior.',
    ],
  },
  {
    path: 'terms',
    heading: 'Terms of Service',
    paragraphs: [
      'Read the terms for using OPTC Team Builder, a fan-made One Piece Treasure Cruise planning tool and character catalog.',
    ],
  },
];

/*
 * 869f13c5t. The four tool pages and the three guides are not written here. Their words live once,
 * in the app's `src/app/pages/seo-content/seo-content.data.ts`, which the page renders after
 * hydration; this builds their static fallback from the same records. Until then each page had a
 * second, different body here, sharing no sentence with the one a visitor reads, so a search snippet
 * could quote a line nobody could find on the page. The schema type is the one fact only crawlers
 * need, so it stays here.
 */
const seoContentSchemaTypes = {
  'tools/optc-team-builder': 'SoftwareApplication',
  'tools/optc-auto-team-builder': 'SoftwareApplication',
  'tools/optc-rumble-team-builder': 'SoftwareApplication',
  'tools/optc-character-database': 'CollectionPage',
  'guides/how-to-build-an-optc-team': 'WebPage',
  'guides/guided-build-compare-team-sharing': 'WebPage',
  'guides/optc-pirate-rumble-team-building': 'WebPage',
};

for (const [pagePath, page] of Object.entries(loadSeoContentPages(projectRoot))) {
  const schemaType = seoContentSchemaTypes[pagePath];

  if (!schemaType) {
    throw new Error(
      `seo-content.data.ts has a page "${pagePath}" with no schema type in seoContentSchemaTypes.`,
    );
  }

  publicRouteContent.push({
    path: pagePath,
    heading: page.title,
    schemaType,
    paragraphs: [page.summary],
    sections: page.sections,
    links: page.links.map((link) => ({ label: link.label, path: link.route.replace(/^\//u, '') })),
  });
}

/*
 * 869f12x57. The list above holds only what the generator alone renders -
 * headings, paragraphs, in-page links, schema type. Every route's path,
 * `<title>`, meta description and aliases now come from the app's own registry,
 * because those four were also written in `app.routes.ts` and drifted: four
 * routes carried two different descriptions and one carried two different
 * titles, and `/faq` was published here while the app served it `noindex`.
 */
const publicRouteRecords = loadPublicRoutes(projectRoot);
const publicRoutes = publicRouteRecords.map((record) => {
  const content = publicRouteContent.find((entry) => entry.path === record.canonicalPath);

  if (!content) {
    throw new Error(
      `No page content for public route "${record.canonicalPath}". Add it to publicRouteContent ` +
        '(a tool or guide page: to src/app/pages/seo-content/seo-content.data.ts), ' +
        'or remove the record from src/app/core/data/public-routes.data.ts.',
    );
  }

  return {
    ...content,
    path: record.canonicalPath,
    title: record.title,
    description: record.description,
    ...(record.aliases.length > 0 ? { aliases: record.aliases } : {}),
    // 869f13c6b. `en` and no alternates for every page today, so nothing below changes a byte.
    language: languageOf(record),
    alternateLinks: hreflangLinks(record, buildAbsoluteUrl),
  };
});

for (const content of publicRouteContent) {
  if (!publicRouteRecords.some((record) => record.canonicalPath === content.path)) {
    throw new Error(
      `publicRouteContent has an entry for "${content.path}", which the public route registry ` +
        'does not list. One of the two is wrong.',
    );
  }
}

const indexHtmlPath = path.join(outputDir, 'index.html');
const indexHtml = await readFile(indexHtmlPath, 'utf8');
const seedSql = await readFile(seedPath, 'utf8');
const characterDetails = extractRows(seedSql, 'character_details').reduce((details, row) => {
  const characterId = Number(row.character_id);

  if (!Number.isInteger(characterId) || characterId <= 0) {
    return details;
  }

  details.set(characterId, parseJson(row.detail_json, null));
  return details;
}, new Map());
const characters = extractRows(seedSql, 'characters')
  .map((row) => normalizeCharacterRow(row, characterDetails.get(Number(row.id)) ?? null))
  .filter((character) => character !== null)
  .sort((left, right) => left.id - right.id);

if (!characters.length) {
  throw new Error(`No character rows found in ${seedPath}.`);
}

const relatedCharactersByConflictKey = buildRelatedCharactersByConflictKey(characters);
const sitemapEntries = [];

for (const route of publicRoutes) {
  await writeRoutePage(route.path, buildStaticPageSeo(route));
  sitemapEntries.push(route.path);

  for (const alias of route.aliases ?? []) {
    await writeRoutePage(
      alias,
      buildStaticPageSeo({ ...route, path: alias, canonicalPath: route.path }),
    );
  }
}

for (const character of characters) {
  const routePath = `characters/${character.id}`;
  await writeRoutePage(routePath, buildCharacterPageSeo(character));
  sitemapEntries.push(routePath);
}

await writeSitemap(sitemapEntries);
await writeRobotsTxt();
await writeIndexNowKey();
await writeSitemapHtml();

console.log(
  `[seo] generated ${characters.length} character pages, ${publicRoutes.length} public pages, sitemap.xml, robots.txt, IndexNow key, and sitemap.html in ${path.relative(
    projectRoot,
    outputDir,
  )}.`,
);

async function writeRoutePage(routePath, seo) {
  const targetPath =
    routePath.length === 0
      ? path.join(outputDir, 'index.html')
      : path.join(outputDir, ...routePath.split('/'), 'index.html');

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, injectSeo(indexHtml, seo));
}

async function writeSitemap(routePaths) {
  const uniquePaths = [...new Set(routePaths)];
  const alternatesByPath = new Map(publicRoutes.map((route) => [route.path, route.alternateLinks]));
  const hasAlternates = [...alternatesByPath.values()].some((links) => links.length > 0);
  const urls = uniquePaths
    .map(
      (routePath) => `  <url>
    <loc>${escapeXml(buildAbsoluteUrl(routePath))}</loc>
    <lastmod>${generatedAt}</lastmod>${(alternatesByPath.get(routePath) ?? [])
      .map(
        (link) => `
    <xhtml:link rel="alternate" hreflang="${escapeXml(link.hreflang)}" href="${escapeXml(link.href)}"/>`,
      )
      .join('')}
  </url>`,
    )
    .join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${
    hasAlternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''
  }>
${urls}
</urlset>
`;

  await writeFile(path.join(outputDir, 'sitemap.xml'), sitemap);
}

async function writeRobotsTxt() {
  const robots = `User-agent: *
Allow: /

Sitemap: ${buildAbsoluteUrl('sitemap.xml').replace(/\/$/u, '')}
`;

  await writeFile(path.join(outputDir, 'robots.txt'), robots);
}

async function writeIndexNowKey() {
  await writeFile(path.join(outputDir, `${indexNowKey}.txt`), indexNowKey);
}

/*
 * 869f13c5r. What `sitemap.html` is for, written down because five waves kept finding generated files
 * nobody could name a reader for.
 *
 * It is the one static, JavaScript-free index of every public page that is not a character page:
 * for crawlers that do not run the app, and for screen readers and text browsers that reach the site
 * without it. It is NOT the list of the 4,622 character pages - `sitemap.xml` is, and this page
 * never was - and it is not a navigation aid for a person using the app, whose map is the side menu.
 * The only characters it names are the newest few, so a character generated by the latest release
 * has a static link a crawler can follow before `sitemap.xml` is read again. It is linked from the
 * home page's fallback, and costs one small file per build.
 *
 * Every public route belongs to exactly one section; a route that fits none stops the build, so a new
 * public page cannot land here unsorted.
 */
async function writeSitemapHtml() {
  // Declared inside, not beside the function: the top-level code calls this before a module-level
  // const below it would be initialised.
  const SITEMAP_HTML_SECTIONS = [
    { heading: 'Home', matches: (routePath) => routePath === '' },
    { heading: 'Tools', matches: (routePath) => routePath.startsWith('tools/') },
    { heading: 'Guides', matches: (routePath) => routePath.startsWith('guides/') },
    { heading: 'App screens', matches: (routePath) => routePath.startsWith('tabs/') },
    { heading: 'Help and legal', matches: (routePath) => ['faq', 'privacy', 'cookies', 'terms'].includes(routePath) },
  ];

  for (const route of publicRoutes) {
    const sections = SITEMAP_HTML_SECTIONS.filter((section) => section.matches(route.path));

    if (sections.length !== 1) {
      throw new Error(
        `sitemap.html: public route "${route.path}" matches ${sections.length} sections; give it exactly one in SITEMAP_HTML_SECTIONS.`,
      );
    }
  }

  const routeSections = SITEMAP_HTML_SECTIONS.map(
    (section) => `    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      <ul>
${publicRoutes
  .filter((route) => section.matches(route.path))
  .map(
    (route) => `        <li>
          <a href="${escapeHtmlAttribute(buildAbsoluteUrl(route.path))}">${escapeHtml(route.title)}</a>
          <p>${escapeHtml(route.description)}</p>
        </li>`,
  )
  .join('\n')}
      </ul>
    </section>`,
  ).join('\n');
  const characterEntryLinks = [
    { label: 'Newest OPTC character pages', characters: characters.slice(-12).reverse() },
  ]
    .map(
      (group) => `    <section>
      <h2>${escapeHtml(group.label)}</h2>
      <ul>
${group.characters
  .map(
    (character) => `        <li>
          <a href="${escapeHtmlAttribute(buildAbsoluteUrl(`characters/${character.id}`))}">#${character.id} ${escapeHtml(character.name)}</a>
          <p>${escapeHtml(buildCharacterDescription(character))}</p>
        </li>`,
  )
  .join('\n')}
      </ul>
    </section>`,
    )
    .join('\n');
  const canonicalUrl = `${siteBaseUrl}/sitemap.html`;
  const sitemapHtml = `<!doctype html>
<html lang="${SITE_LANGUAGE}">
<head>
  <meta charset="utf-8">
  <title>Sitemap | OPTC Team Builder</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A plain index of every public OPTC Team Builder page, grouped into tools, guides, app screens and help, with the newest character pages.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}">
  <style>
    :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #101820; color: #f8fbff; }
    main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
    a { color: #f5c84c; font-weight: 700; }
    p { color: rgba(248, 251, 255, 0.74); line-height: 1.6; }
    h2 { margin-top: 36px; }
    ul { display: grid; gap: 18px; padding: 0; list-style: none; }
    li { border-top: 1px solid rgba(255, 255, 255, 0.12); padding-top: 18px; }
  </style>
</head>
<body>
  <main>
    <h1>OPTC Team Builder Sitemap</h1>
    <p>Every public page of OPTC Team Builder in plain links, grouped into tools, guides, app screens and help, followed by the newest character pages. Every character page is listed in sitemap.xml.</p>
${routeSections}
${characterEntryLinks}
  </main>
</body>
</html>
`;

  await writeFile(path.join(outputDir, 'sitemap.html'), sitemapHtml);
}

function buildStaticPageSeo(route) {
  const canonicalPath = route.canonicalPath ?? route.path;
  const canonicalUrl = buildAbsoluteUrl(canonicalPath);
  const pageType = route.schemaType === 'CollectionPage' ? 'CollectionPage' : 'WebPage';
  const extraGraphNodes = route.schemaType === 'SoftwareApplication' || route.path.startsWith('tools/')
    ? [buildSoftwareApplicationNode(route, canonicalUrl)]
    : [];

  return {
    title: route.title,
    description: route.description,
    canonicalUrl,
    imageUrl: defaultImageUrl,
    language: route.language,
    alternateLinks: route.alternateLinks,
    fallbackHtml: route.path === '' ? buildHomeFallbackHtml(route) : buildStaticFallbackHtml(route),
    jsonLd: buildJsonLd(
      {
        '@type': pageType,
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: route.title,
        description: route.description,
        isPartOf: { '@id': `${buildAbsoluteUrl('')}#website` },
        inLanguage: route.language,
        ...(defaultImageUrl ? { image: defaultImageUrl } : {}),
      },
      [buildBreadcrumbNode(canonicalUrl, route.heading ?? route.title, canonicalPath), ...extraGraphNodes],
    ),
  };
}

function buildCharacterPageSeo(character) {
  const canonicalUrl = buildAbsoluteUrl(`characters/${character.id}`);
  const description = buildCharacterDescription(character);
  const imageUrl = resolveCharacterImageUrl(character);

  return {
    title: `#${character.id} ${character.name} | OPTC Team Builder`,
    description,
    canonicalUrl,
    imageUrl,
    fallbackHtml: buildCharacterFallbackHtml(character, description),
    jsonLd: buildJsonLd(
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: `#${character.id} ${character.name}`,
        description,
        isPartOf: { '@id': `${buildAbsoluteUrl('')}#website` },
        inLanguage: SITE_LANGUAGE,
        about: {
          '@type': 'Thing',
          name: character.name,
          identifier: String(character.id),
          additionalType: 'One Piece Treasure Cruise character',
          description,
          ...(imageUrl ? { image: imageUrl } : {}),
          ...(character.type ? { disambiguatingDescription: character.type } : {}),
          ...(character.classes.length ? { keywords: character.classes.join(', ') } : {}),
        },
      },
      [buildBreadcrumbNode(canonicalUrl, `#${character.id} ${character.name}`, `characters/${character.id}`)],
    ),
  };
}

function buildJsonLd(pageNode, extraGraphNodes = []) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${buildAbsoluteUrl('')}#website`,
        name: siteName,
        alternateName: 'One Piece Treasure Cruise Team Builder',
        url: buildAbsoluteUrl(''),
        description: siteDescription,
        inLanguage: SITE_LANGUAGE,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${buildAbsoluteUrl('tabs/characters')}?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      pageNode,
      ...extraGraphNodes,
    ],
  };
}

function buildSoftwareApplicationNode(route, canonicalUrl) {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${canonicalUrl}#software`,
    name: route.heading ?? route.title,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web browser',
    url: canonicalUrl,
    description: route.description,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    isPartOf: { '@id': `${buildAbsoluteUrl('')}#website` },
  };
}

function buildBreadcrumbNode(canonicalUrl, name, routePath) {
  const normalizedRoutePath = routePath.replace(/^\/+|\/+$/g, '');
  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: siteName,
      item: buildAbsoluteUrl(''),
    },
    ...(normalizedRoutePath
      ? [
          {
            '@type': 'ListItem',
            position: 2,
            name,
            item: canonicalUrl,
          },
        ]
      : []),
  ];

  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl}#breadcrumb`,
    itemListElement,
  };
}

function injectSeo(html, seo) {
  const titlePattern = /<title>[\s\S]*?<\/title>/i;

  if (!titlePattern.test(html)) {
    throw new Error('Failed to inject SEO metadata because no <title> tag was found.');
  }

  const withSeo = removeExistingSeo(html)
    .replace(titlePattern, `<title>${escapeHtml(seo.title)}</title>\n${buildSeoTags(seo)}`)
    // 869f13c6b. Every page is English today, so this rewrites `lang="en"` with itself.
    .replace(/<html lang="[^"]*"/u, `<html lang="${seo.language ?? SITE_LANGUAGE}"`);

  return injectAppRootFallback(withSeo, seo.fallbackHtml);
}

function buildSeoTags(seo) {
  const imageTags = seo.imageUrl
    ? `
  <meta property="og:image" content="${escapeHtmlAttribute(seo.imageUrl)}">
  <meta name="twitter:image" content="${escapeHtmlAttribute(seo.imageUrl)}">`
    : '';

  const alternateTags = (seo.alternateLinks ?? [])
    .map(
      (link) =>
        `\n  <link rel="alternate" hreflang="${escapeHtmlAttribute(link.hreflang)}" href="${escapeHtmlAttribute(link.href)}">`,
    )
    .join('');

  return `  <meta name="description" content="${escapeHtmlAttribute(seo.description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtmlAttribute(seo.canonicalUrl)}">${alternateTags}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escapeHtmlAttribute(siteName)}">
  <meta property="og:title" content="${escapeHtmlAttribute(seo.title)}">
  <meta property="og:description" content="${escapeHtmlAttribute(seo.description)}">
  <meta property="og:url" content="${escapeHtmlAttribute(seo.canonicalUrl)}">${imageTags}
  <meta name="twitter:card" content="${seo.imageUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escapeHtmlAttribute(seo.title)}">
  <meta name="twitter:description" content="${escapeHtmlAttribute(seo.description)}">
  <script type="application/ld+json">
    ${escapeJsonForHtml(seo.jsonLd)}
  </script>`;
}

function removeExistingSeo(html) {
  return html
    .replace(/\s*<meta\s+name=["']description["'][^>]*>\n?/gi, '\n')
    .replace(/\s*<meta\s+name=["']robots["'][^>]*>\n?/gi, '\n')
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>\n?/gi, '\n')
    .replace(/\s*<link\s+rel=["']alternate["'][^>]*\bhreflang=[^>]*>\n?/gi, '\n')
    .replace(/\s*<meta\s+property=["']og:[^"']+["'][^>]*>\n?/gi, '\n')
    .replace(/\s*<meta\s+name=["']twitter:[^"']+["'][^>]*>\n?/gi, '\n')
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\n?/gi, '\n');
}

function injectAppRootFallback(html, fallbackHtml) {
  const appRootPattern = /<app-root([^>]*)>[\s\S]*?<\/app-root>/i;

  if (!appRootPattern.test(html)) {
    throw new Error('Failed to inject fallback content because no <app-root> tag was found.');
  }

  return html.replace(
    appRootPattern,
    (_match, attributes = '') => `<app-root${attributes}>
${fallbackHtml}
  </app-root>`,
  );
}

function buildStaticFallbackHtml(route) {
  const paragraphs = route.paragraphs ?? [route.description];
  const links = route.links?.length
    ? `
      <nav aria-label="Public OPTC Team Builder pages">
        <ul>
${route.links
  .map(
    (link) =>
      `          <li><a href="${escapeHtmlAttribute(buildPublicLinkUrl(link.path))}">${escapeHtml(
        link.label,
      )}</a></li>`,
  )
  .join('\n')}
        </ul>
      </nav>`
    : '';

  // 869f13c5t. The tool and guide pages carry the same sections a visitor reads after hydration.
  const sections = (route.sections ?? [])
    .map(
      (section) =>
        `\n      <h2>${escapeHtml(section.title)}</h2>\n      <p>${escapeHtml(section.copy)}</p>`,
    )
    .join('');

  return `    <main class="seo-fallback seo-page-fallback">
      <h1>${escapeHtml(route.heading ?? route.title)}</h1>
${paragraphs.map((paragraph) => `      <p>${escapeHtml(paragraph)}</p>`).join('\n')}${sections}${links}
    </main>`;
}

function buildHomeFallbackHtml(route) {
  const actions = route.links ?? [];
  const actionLinks = actions
    .map(
      (link) =>
        `          <li><a href="${escapeHtmlAttribute(buildPublicLinkUrl(link.path))}">${escapeHtml(
          link.label,
        )}</a></li>`,
    )
    .join('\n');
  const characterImages = homeFallbackHeroCharacters
    .map(
      (character) =>
        `          <img src="${escapeHtmlAttribute(character.src)}" alt="${escapeHtmlAttribute(
          character.alt,
        )}" loading="lazy">`,
    )
    .join('\n');

  return `    <main class="seo-fallback seo-home-fallback">
      <section class="seo-home-copy" aria-labelledby="seo-home-title">
        <span class="seo-home-label">Fan-made OPTC tools</span>
        <h1 id="seo-home-title">Plan One Piece Treasure Cruise crews faster</h1>
        <p>${escapeHtml(route.description)}</p>
        <nav aria-label="Primary OPTC Team Builder pages">
          <ul class="seo-home-actions">
${actionLinks}
          </ul>
        </nav>
      </section>
      <section class="seo-home-visual" aria-label="OPTC Team Builder preview">
        <div class="seo-home-brand">
          <img src="brand/favicon-master-v2-optimized.png" alt="OPTC Team Builder logo">
        </div>
        <div class="seo-home-character-stack">
${characterImages}
        </div>
      </section>
    </main>`;
}

function buildCharacterFallbackHtml(character, description) {
  const classes = character.classes.length ? character.classes.join(' / ') : 'Unknown class';
  const stats = [
    character.type ? `Type: ${character.type}` : null,
    `Classes: ${classes}`,
    character.stars ? `Stars: ${character.stars}` : null,
    character.cost ? `Cost: ${character.cost}` : null,
  ].filter(Boolean);
  const captainAbility = normalizeDetailText(character.detail?.captainAbility);
  const specialName = normalizeDetailText(character.detail?.specialName);
  const specialText = normalizeDetailText(character.detail?.specialText);
  const supportSummary = buildSupportSummary(character.detail?.supportData);
  const rumblePassive = buildRumbleSummary(character.detail?.rumbleData, 'ability');
  const rumbleStats = buildRumbleStats(character.detail?.rumbleData);
  const rumbleSpecial = buildRumbleSummary(character.detail?.rumbleData, 'special');
  const relatedCharacters = findRelatedCharacters(character);
  /*
   * 869f13c5c. The first link is the page's one primary action, the same bridge the app page makes
   * solid (`character-detail-bridge.utils.ts`): a character with a Captain Ability opens Captain
   * Coverage with itself as Captain, any other opens Auto Team Builder. The page used to add up to
   * three "Browse <type/class> characters" links, which all opened the same unfiltered catalogue.
   */
  const appLinks = [
    ...(captainAbility
      ? [
          {
            label: 'See who this Captain boosts',
            href: `${buildAbsoluteUrl('tabs/captain-coverage')}?captain=${character.id}`,
          },
        ]
      : []),
    { label: 'Open Auto Team Builder', path: 'tabs/auto-team-builder' },
    { label: 'Browse OPTC characters', path: 'tabs/characters' },
    { label: 'Rank Rumble characters', path: 'tabs/rumble-characters' },
  ];
  const detailParagraphs = [
    captainAbility ? `Captain ability: ${truncateForMeta(captainAbility, 320)}` : null,
    specialText
      ? `Special${specialName ? ` "${specialName}"` : ''}: ${truncateForMeta(specialText, 340)}`
      : null,
    supportSummary ? `Support: ${truncateForMeta(supportSummary, 260)}` : null,
    rumblePassive ? `Pirate Rumble passive: ${truncateForMeta(rumblePassive, 260)}` : null,
    rumbleStats ? `Pirate Rumble stats: ${truncateForMeta(rumbleStats, 260)}` : null,
    rumbleSpecial ? `Pirate Rumble special: ${truncateForMeta(rumbleSpecial, 260)}` : null,
  ].filter(Boolean);
  const relatedLinks = relatedCharacters.length
    ? `
      <h2>Related OPTC characters</h2>
      <ul>
${relatedCharacters
  .map(
    (relatedCharacter) =>
      `        <li><a href="${escapeHtmlAttribute(
        buildAbsoluteUrl(`characters/${relatedCharacter.id}`),
      )}">#${relatedCharacter.id} ${escapeHtml(relatedCharacter.name)}</a></li>`,
  )
  .join('\n')}
      </ul>`
    : '';

  return `    <main class="seo-fallback seo-page-fallback">
      <h1>#${character.id} ${escapeHtml(character.name)}</h1>
      <p>${escapeHtml(description)}</p>
      <ul>
${stats.map((stat) => `        <li>${escapeHtml(stat)}</li>`).join('\n')}
      </ul>
${detailParagraphs.map((paragraph) => `      <p>${escapeHtml(paragraph)}</p>`).join('\n')}
      <nav aria-label="OPTC Team Builder character tools">
        <ul>
${appLinks
  .map(
    (link) =>
      `          <li><a href="${escapeHtmlAttribute(link.href ?? buildPublicLinkUrl(link.path))}">${escapeHtml(
        link.label,
      )}</a></li>`,
  )
  .join('\n')}
        </ul>
      </nav>${relatedLinks}
    </main>`;
}

function buildSupportSummary(supportData) {
  if (!Array.isArray(supportData) || supportData.length === 0) {
    return '';
  }

  const supportEntry = supportData.find((entry) => entry && typeof entry === 'object');

  if (!supportEntry) {
    return '';
  }

  const supportedCharacters = normalizeDetailText(
    supportEntry.supportedCharactersText ?? supportEntry.Characters,
  );
  const descriptions = Array.isArray(supportEntry.description)
    ? supportEntry.description.map((item) => normalizeDetailText(item)).filter(Boolean)
    : [];
  const effect = descriptions.at(-1) ?? '';

  return [supportedCharacters ? `Supports ${supportedCharacters}` : '', effect]
    .filter(Boolean)
    .join(' - ');
}

function buildRumbleSummary(rumbleData, key) {
  if (!rumbleData || typeof rumbleData !== 'object' || Array.isArray(rumbleData)) {
    return '';
  }

  const entries = Array.isArray(rumbleData[key]) ? rumbleData[key] : [];

  return normalizeRumbleLevelEntry(entries.at(-1));
}

/*
 * 869f13c5c. These are stats, and are labelled as stats. They used to stand in for a missing passive
 * and print as "Pirate Rumble passive: Rumble type BAL, DEF 50, SPD 100" - on 4,145 pages, which is
 * every character whose Rumble data holds no text the generator can read.
 */
function buildRumbleStats(rumbleData) {
  if (!rumbleData || typeof rumbleData !== 'object' || Array.isArray(rumbleData)) {
    return '';
  }

  const stats = rumbleData.stats && typeof rumbleData.stats === 'object' ? rumbleData.stats : {};
  // DEF and SPD are numbers in the dataset, which `normalizeDetailText` drops - so until 869f13c5c this
  // line only ever printed the Rumble type.
  const statText = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : normalizeDetailText(value);
  const rumbleType = statText(stats.rumbleType);
  const def = statText(stats.def);
  const spd = statText(stats.spd);

  return [rumbleType ? `Rumble type ${rumbleType}` : '', def ? `DEF ${def}` : '', spd ? `SPD ${spd}` : '']
    .filter(Boolean)
    .join(', ');
}

function normalizeRumbleLevelEntry(entry) {
  if (!entry) {
    return '';
  }

  if (typeof entry === 'string') {
    return normalizeDetailText(entry);
  }

  if (typeof entry !== 'object' || Array.isArray(entry)) {
    return normalizeDetailText(entry);
  }

  /*
   * 869f13c5c. `cooldown` is left out of the fallback: a Rumble special stores its effects in an
   * array this does not read, so the fallback used to print the cooldown alone - "Pirate Rumble
   * special: Cooldown: 23" on 1,289 pages. A special with nothing readable now prints nothing.
   */
  const candidate =
    entry.description ??
    entry.effect ??
    entry.text ??
    entry.details ??
    entry.summary ??
    Object.entries(entry)
      .filter(
        ([key, value]) => key !== 'cooldown' && (typeof value === 'string' || typeof value === 'number'),
      )
      .map(([key, value]) => `${humanizeSlug(key)}: ${value}`)
      .join(', ');

  return normalizeDetailText(candidate);
}

function buildRelatedCharactersByConflictKey(characterList) {
  const relatedByKey = new Map();

  for (const character of characterList) {
    for (const key of character.detail?.partyConflictKeys ?? []) {
      const normalizedKey = normalizeDetailText(key).toLowerCase();

      if (!normalizedKey) {
        continue;
      }

      const relatedCharacters = relatedByKey.get(normalizedKey) ?? [];
      relatedCharacters.push(character);
      relatedByKey.set(normalizedKey, relatedCharacters);
    }
  }

  return relatedByKey;
}

function findRelatedCharacters(character) {
  const related = new Map();

  for (const key of character.detail?.partyConflictKeys ?? []) {
    const normalizedKey = normalizeDetailText(key).toLowerCase();

    for (const relatedCharacter of relatedCharactersByConflictKey.get(normalizedKey) ?? []) {
      if (relatedCharacter.id !== character.id) {
        related.set(relatedCharacter.id, relatedCharacter);
      }
    }
  }

  return [...related.values()]
    .sort((left, right) => Math.abs(left.id - character.id) - Math.abs(right.id - character.id))
    .slice(0, 5);
}

function normalizeCharacterRow(row, detail) {
  const id = Number(row.id);

  if (!Number.isInteger(id) || id <= 0 || typeof row.name !== 'string' || !row.name.trim()) {
    return null;
  }

  return {
    id,
    name: row.name.trim(),
    isIncomplete: Number(row.is_incomplete) === 1,
    type: String(row.type ?? '').trim(),
    primaryClass: String(row.primary_class ?? '').trim(),
    secondaryClass: typeof row.secondary_class === 'string' ? row.secondary_class.trim() : null,
    classes: parseJson(row.classes_json, []),
    stars: normalizeNumber(row.stars),
    cost: normalizeNumber(row.cost),
    assets: parseJson(row.assets_json, {}),
    detail,
  };
}

function buildCharacterDescription(character) {
  const classes = character.classes.length ? character.classes.join(' / ') : 'unknown class';
  const base = `#${character.id} ${character.name} is a ${character.stars}-star ${character.type} ${classes} character in One Piece Treasure Cruise.`;
  const specialName =
    character.detail && typeof character.detail.specialName === 'string'
      ? character.detail.specialName.trim()
      : '';
  const suffix = specialName
    ? ` View stats, captain ability, special "${specialName}", support, rumble data, and team-building details.`
    : ' View stats, captain ability, special, support, rumble data, and team-building details.';

  return truncateForMeta(`${base}${suffix}`);
}

function resolveCharacterImageUrl(character) {
  const assets = character.assets && typeof character.assets === 'object' ? character.assets : {};
  const relativePath =
    assets.exactLocal ??
    assets.thumbnailLocal ??
    (assets.thumbnailGlobal
      ? `assets/offline-packs/thumbnails-glo/${assets.thumbnailGlobal}`
      : null) ??
    (assets.thumbnailJapan ? `assets/offline-packs/thumbnails-jap/${assets.thumbnailJapan}` : null);

  return typeof relativePath === 'string' && relativePath.trim().length > 0
    ? `${siteBaseUrl}/${relativePath.replace(/^\/+/, '')}`
    : null;
}

function truncateForMeta(value, maxLength = 220) {
  const normalized = String(value).replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeDetailText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function extractRows(sql, tableName) {
  const rows = [];
  const marker = `INSERT INTO ${tableName}`;
  let searchIndex = 0;

  while (searchIndex < sql.length) {
    const insertIndex = sql.indexOf(marker, searchIndex);

    if (insertIndex === -1) {
      break;
    }

    const columnsStart = sql.indexOf('(', insertIndex);
    const columnsEnd = findMatchingParen(sql, columnsStart);
    const valuesIndex = sql.indexOf('VALUES', columnsEnd);
    const valuesStart = sql.indexOf('(', valuesIndex);
    const parsedValues = parseSqlTuple(sql, valuesStart);
    const columns = sql
      .slice(columnsStart + 1, columnsEnd)
      .split(',')
      .map((column) => column.trim());

    rows.push(
      Object.fromEntries(columns.map((column, index) => [column, parsedValues.values[index]])),
    );
    searchIndex = parsedValues.endIndex + 1;
  }

  return rows;
}

function parseSqlTuple(sql, startIndex) {
  if (sql[startIndex] !== '(') {
    throw new Error(`Expected SQL tuple at index ${startIndex}.`);
  }

  const values = [];
  let index = startIndex + 1;

  while (index < sql.length) {
    index = skipWhitespace(sql, index);

    if (sql[index] === ')') {
      return { values, endIndex: index };
    }

    const parsedValue = parseSqlValue(sql, index);
    values.push(parsedValue.value);
    index = skipWhitespace(sql, parsedValue.endIndex);

    if (sql[index] === ',') {
      index += 1;
      continue;
    }

    if (sql[index] === ')') {
      return { values, endIndex: index };
    }

    throw new Error(`Unexpected SQL tuple token ${sql[index]} at index ${index}.`);
  }

  throw new Error(`Unterminated SQL tuple at index ${startIndex}.`);
}

function parseSqlValue(sql, startIndex) {
  if (sql[startIndex] === "'") {
    let value = '';
    let index = startIndex + 1;

    while (index < sql.length) {
      const char = sql[index];

      if (char === "'") {
        if (sql[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }

        return { value, endIndex: index + 1 };
      }

      value += char;
      index += 1;
    }

    throw new Error(`Unterminated SQL string at index ${startIndex}.`);
  }

  let index = startIndex;

  while (index < sql.length && ![',', ')'].includes(sql[index])) {
    index += 1;
  }

  const rawValue = sql.slice(startIndex, index).trim();

  if (/^null$/i.test(rawValue)) {
    return { value: null, endIndex: index };
  }

  const numberValue = Number(rawValue);

  return {
    value: Number.isFinite(numberValue) ? numberValue : rawValue,
    endIndex: index,
  };
}

function findMatchingParen(value, startIndex) {
  if (value[startIndex] !== '(') {
    throw new Error(`Expected opening parenthesis at index ${startIndex}.`);
  }

  let depth = 0;

  for (let index = startIndex; index < value.length; index += 1) {
    if (value[index] === '(') {
      depth += 1;
    } else if (value[index] === ')') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`No matching closing parenthesis found for index ${startIndex}.`);
}

function skipWhitespace(value, index) {
  let currentIndex = index;

  while (/\s/.test(value[currentIndex] ?? '')) {
    currentIndex += 1;
  }

  return currentIndex;
}

function parseJson(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function buildAbsoluteUrl(routePath) {
  const normalizedRoutePath = routePath.replace(/^\/+|\/+$/g, '');

  return normalizedRoutePath.length ? `${siteBaseUrl}/${normalizedRoutePath}/` : `${siteBaseUrl}/`;
}

function buildPublicLinkUrl(routePath) {
  const normalizedRoutePath = routePath.replace(/^\/+|\/+$/g, '');

  return normalizedRoutePath.endsWith('.html')
    ? `${siteBaseUrl}/${normalizedRoutePath}`
    : buildAbsoluteUrl(normalizedRoutePath);
}

function buildAppRoutePath(routePath) {
  const normalizedRoutePath = routePath.replace(/^\/+|\/+$/g, '');
  const sitePath = new URL(siteBaseUrl).pathname.replace(/\/+$/g, '');

  return `${sitePath}/${normalizedRoutePath}/`.replace(/\/{2,}/g, '/');
}

function normalizeSiteBaseUrl(value) {
  return String(value).trim().replace(/\/+$/g, '');
}

function humanizeSlug(value) {
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function escapeXml(value) {
  return escapeHtmlAttribute(value).replaceAll("'", '&apos;');
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value, null, 2).replaceAll('<', '\\u003c');
}

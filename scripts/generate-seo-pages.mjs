import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultOutputDir = path.join(projectRoot, 'dist', 'optc-team-builder', 'browser');
const defaultSeedPath = path.join(projectRoot, 'public', 'assets', 'data', 'optc-seed.sql');
const outputDir = path.resolve(process.env.SEO_OUTPUT_DIR ?? defaultOutputDir);
const seedPath = path.resolve(process.env.SEO_SEED_PATH ?? defaultSeedPath);
const siteBaseUrl = normalizeSiteBaseUrl(
  process.env.SEO_SITE_BASE_URL ?? 'https://johnchourp.github.io/optc-team-builder',
);
const generatedAt = new Date().toISOString().slice(0, 10);
const siteName = 'OPTC Team Builder';
const homePageTitle = 'OPTC Team Builder | One Piece Treasure Cruise Tools';
const siteDescription =
  'Plan OPTC crews with character search, Rumble rankings, captain coverage, auto team building, Crew Forge, saved teams, enemies, boxes, Drive sync, and offline tools.';
const googleTagManagerHeadHtml = `  <!-- Google Tag Manager consent bootstrap -->
  <script>
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function() { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      wait_for_update: 500,
    });
  </script>
  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-TBW6L4T');</script>
  <!-- End Google Tag Manager -->`;
const googleTagManagerBodyHtml = `  <!-- Google Tag Manager (noscript) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TBW6L4T"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <!-- End Google Tag Manager (noscript) -->`;
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

const publicRoutes = [
  {
    path: '',
    title: homePageTitle,
    description: siteDescription,
    heading: 'OPTC Team Builder for One Piece Treasure Cruise',
    paragraphs: [
      'OPTC Team Builder is a fan-made workspace for One Piece Treasure Cruise players who want a faster way to find characters, compare abilities, check Rumble rankings and captain coverage, plan crews, and keep useful setups organized. The app combines a searchable character catalog, manual and automatic team building, Pirate Rumble tools, Crew Forge screenshot imports, saved teams, saved enemies, character boxes, Drive sync, and settings for import/export and backups.',
      'Use Characters to search by name, type, class, favorites, and ability data before opening detailed character pages. Rumble Characters ranks Pirate Rumble units, Captain Coverage finds leaders that fully cover a chosen unit, and Auto Team Builder can fill fixed manual crew slots or match enemy mechanics and ability requirements against the local catalog.',
      'Auto Team Rumble Builder scores rumble-capable units and fills active and bench slots. Crew Forge can import a crew screenshot and match recognized slots back to editable OPTC character data. Saved Teams, Saved Rumble Teams, Character Boxes, and Saved Enemies keep recurring planning data available in your browser, while Settings and Drive Sync cover language, backups, analytics consent, and data transfer tools.',
      'The project is not an official Bandai Namco tool. It exists to make OPTC planning easier with clear links, readable character summaries, and generated pages that describe the same tools available in the web app.',
    ],
    links: [
      { label: 'Browse OPTC characters', path: 'tabs/characters' },
      { label: 'Rank Pirate Rumble characters', path: 'tabs/rumble-characters' },
      { label: 'Check captain coverage', path: 'tabs/captain-coverage' },
      { label: 'Build an OPTC team', path: 'tabs/auto-team-builder' },
      { label: 'Build a Pirate Rumble team', path: 'tabs/auto-team-builder-rumble' },
      { label: 'Import crew screenshots', path: 'tabs/crew-forge' },
      { label: 'Open the public sitemap', path: 'sitemap.html' },
    ],
  },
  {
    path: 'tabs/characters',
    title: 'OPTC Characters | OPTC Team Builder',
    description:
      'Browse the One Piece Treasure Cruise character catalog with stats, classes, abilities, and team-building data.',
    heading: 'OPTC Character Catalog',
    paragraphs: [
      'Browse the One Piece Treasure Cruise character catalog by id, name, type, class, stars, cost, and ability data. Character pages include searchable OPTC details for captain abilities, specials, support effects, rumble information, and team-building notes.',
      'This page is the main entry point for finding units before opening a character detail page or adding candidates to a crew plan.',
    ],
  },
  {
    path: 'tabs/rumble-characters',
    title: 'Rumble Characters | OPTC Team Builder',
    description:
      'Rank One Piece Treasure Cruise Pirate Rumble characters by full Rumble score, favorites, core filters, and custom stat focus.',
    heading: 'OPTC Rumble Characters',
    paragraphs: [
      'Rumble Characters ranks One Piece Treasure Cruise Pirate Rumble units by score, favorites, core filters, and custom stat focus.',
      'Use this page before building Pirate Rumble teams when you need to compare units by rumble data instead of regular quest abilities.',
    ],
  },
  {
    path: 'tabs/auto-team-builder',
    title: 'Auto Team Builder | OPTC Team Builder',
    description:
      'Build OPTC teams manually or find candidates by enemy mechanics, character abilities, type filters, and team-building requirements.',
    heading: 'OPTC Auto Team Builder',
    paragraphs: [
      'Auto Team Builder helps build One Piece Treasure Cruise crews manually with fixed slots or automatically by enemy mechanics, character abilities, type filters, class filters, and team-building requirements.',
      'Fill the crew yourself when you already know the team, or enter the mechanics and requirements you need covered to review matching character candidates from the local OPTC data.',
    ],
  },
  {
    path: 'tabs/captain-coverage',
    title: 'Captain Coverage | OPTC Team Builder',
    description:
      'Pick an OPTC character and find captain abilities that fully cover that character under strict type, class, cost, universal, and self-scope matching.',
    heading: 'OPTC Captain Coverage',
    paragraphs: [
      'Captain Coverage helps pick an OPTC character and find captain abilities that fully cover it under strict type, class, cost, universal, and self-scope matching.',
      'Use this page when you want to verify which leaders naturally include a target character before committing to a crew plan.',
    ],
  },
  {
    path: 'tabs/auto-team-builder-rumble',
    title: 'Auto Team Rumble Builder | OPTC Team Builder',
    description:
      'Build a Pirate Rumble team from local OPTC rumble data with deterministic scoring and synergy ranking.',
    heading: 'OPTC Auto Team Rumble Builder',
    paragraphs: [
      'Auto Team Rumble Builder builds Pirate Rumble teams from local OPTC rumble data with deterministic scoring and synergy ranking.',
      'Use this page to compare active and bench candidates, inspect synergy, and shape Rumble teams from the same local data used elsewhere in the app.',
    ],
  },
  {
    path: 'tabs/crew-forge',
    title: 'Crew Forge | OPTC Team Builder',
    description:
      'Import crew screenshots and match recognized slots against the OPTC character catalog.',
    heading: 'OPTC Crew Forge',
    paragraphs: [
      'Crew Forge imports One Piece Treasure Cruise crew screenshots and matches recognized slots against the OPTC character catalog. It helps turn an existing crew image into editable team data.',
      'Use this tool when you want to rebuild, inspect, or refine a crew from a screenshot instead of searching for every character manually.',
    ],
  },
  {
    path: 'privacy',
    title: 'Privacy Policy | OPTC Team Builder',
    description: 'Read the privacy policy for OPTC Team Builder.',
    heading: 'Privacy Policy',
    paragraphs: [
      'Read how OPTC Team Builder handles privacy for the web app, including local app data, optional analytics consent, and related browser storage.',
    ],
    aliases: ['tabs/privacy'],
  },
  {
    path: 'cookies',
    title: 'Cookie Policy | OPTC Team Builder',
    description: 'Read the cookie policy for OPTC Team Builder.',
    heading: 'Cookie Policy',
    paragraphs: [
      'Read how OPTC Team Builder uses cookies or browser storage for app preferences, consent choices, and optional analytics behavior.',
    ],
    aliases: ['tabs/cookies'],
  },
  {
    path: 'terms',
    title: 'Terms of Service | OPTC Team Builder',
    description: 'Read the terms of service for OPTC Team Builder.',
    heading: 'Terms of Service',
    paragraphs: [
      'Read the terms for using OPTC Team Builder, a fan-made One Piece Treasure Cruise planning tool and character catalog.',
    ],
    aliases: ['tabs/terms'],
  },
];

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
await writeSitemapHtml();

console.log(
  `[seo] generated ${characters.length} character pages, ${publicRoutes.length} public pages, sitemap.xml, robots.txt, and sitemap.html in ${path.relative(
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
  const urls = uniquePaths
    .map(
      (routePath) => `  <url>
    <loc>${escapeXml(buildAbsoluteUrl(routePath))}</loc>
    <lastmod>${generatedAt}</lastmod>
  </url>`,
    )
    .join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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

async function writeSitemapHtml() {
  const sitemapLinks = publicRoutes
    .filter((route) => route.path.length > 0)
    .map(
      (route) => `      <li>
        <a href="${escapeHtmlAttribute(buildAbsoluteUrl(route.path))}">${escapeHtml(route.title)}</a>
        <p>${escapeHtml(route.description)}</p>
      </li>`,
    )
    .join('\n');
  const canonicalUrl = `${siteBaseUrl}/sitemap.html`;
  const sitemapHtml = `<!doctype html>
<html lang="en">
<head>
${googleTagManagerHeadHtml}
  <meta charset="utf-8">
  <title>Sitemap | OPTC Team Builder</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Public sitemap for the main OPTC Team Builder pages.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}">
  <style>
    :root { color-scheme: dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #101820; color: #f8fbff; }
    main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
    a { color: #f5c84c; font-weight: 700; }
    p { color: rgba(248, 251, 255, 0.74); line-height: 1.6; }
    ul { display: grid; gap: 18px; padding: 0; list-style: none; }
    li { border-top: 1px solid rgba(255, 255, 255, 0.12); padding-top: 18px; }
  </style>
</head>
<body>
${googleTagManagerBodyHtml}
  <main>
    <h1>OPTC Team Builder Sitemap</h1>
    <p>Links to the main public pages for browsing OPTC characters, building teams with Auto Team Builder, importing Crew Forge screenshots, and reading legal information.</p>
    <ul>
${sitemapLinks}
    </ul>
  </main>
</body>
</html>
`;

  await writeFile(path.join(outputDir, 'sitemap.html'), sitemapHtml);
}

function buildStaticPageSeo(route) {
  const canonicalPath = route.canonicalPath ?? route.path;
  const canonicalUrl = buildAbsoluteUrl(canonicalPath);

  return {
    title: route.title,
    description: route.description,
    canonicalUrl,
    imageUrl: null,
    fallbackHtml: route.path === '' ? buildHomeFallbackHtml(route) : buildStaticFallbackHtml(route),
    jsonLd: buildJsonLd({
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: route.title,
      description: route.description,
      isPartOf: { '@id': `${buildAbsoluteUrl('')}#website` },
      inLanguage: 'en',
    }),
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
    jsonLd: buildJsonLd({
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: `#${character.id} ${character.name}`,
      description,
      isPartOf: { '@id': `${buildAbsoluteUrl('')}#website` },
      inLanguage: 'en',
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
    }),
  };
}

function buildJsonLd(pageNode) {
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
        inLanguage: 'en',
      },
      pageNode,
    ],
  };
}

function injectSeo(html, seo) {
  const titlePattern = /<title>[\s\S]*?<\/title>/i;

  if (!titlePattern.test(html)) {
    throw new Error('Failed to inject SEO metadata because no <title> tag was found.');
  }

  const withSeo = removeExistingSeo(html).replace(
    titlePattern,
    `<title>${escapeHtml(seo.title)}</title>\n${buildSeoTags(seo)}`,
  );

  return injectAppRootFallback(withSeo, seo.fallbackHtml);
}

function buildSeoTags(seo) {
  const imageTags = seo.imageUrl
    ? `
  <meta property="og:image" content="${escapeHtmlAttribute(seo.imageUrl)}">
  <meta name="twitter:image" content="${escapeHtmlAttribute(seo.imageUrl)}">`
    : '';

  return `  <meta name="description" content="${escapeHtmlAttribute(seo.description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtmlAttribute(seo.canonicalUrl)}">
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

  return `    <main class="seo-fallback seo-page-fallback">
      <h1>${escapeHtml(route.heading ?? route.title)}</h1>
${paragraphs.map((paragraph) => `      <p>${escapeHtml(paragraph)}</p>`).join('\n')}${links}
    </main>`;
}

function buildHomeFallbackHtml(route) {
  const actions = (route.links ?? []).filter((link) => link.path.startsWith('tabs/'));
  const actionLinks = actions
    .map(
      (link) =>
        `          <li><a href="${escapeHtmlAttribute(buildAppRoutePath(link.path))}">${escapeHtml(
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
  const detailParagraphs = [
    captainAbility ? `Captain ability: ${truncateForMeta(captainAbility, 320)}` : null,
    specialText
      ? `Special${specialName ? ` "${specialName}"` : ''}: ${truncateForMeta(specialText, 340)}`
      : null,
  ].filter(Boolean);

  return `    <main class="seo-fallback seo-page-fallback">
      <h1>#${character.id} ${escapeHtml(character.name)}</h1>
      <p>${escapeHtml(description)}</p>
      <ul>
${stats.map((stat) => `        <li>${escapeHtml(stat)}</li>`).join('\n')}
      </ul>
${detailParagraphs.map((paragraph) => `      <p>${escapeHtml(paragraph)}</p>`).join('\n')}
    </main>`;
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

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
const siteDescription =
  'Fan-made One Piece Treasure Cruise team builder for browsing characters, ships, abilities, and preparing teams offline.';

const publicRoutes = [
  {
    path: '',
    title: 'OPTC Team Builder',
    description: siteDescription,
  },
  {
    path: 'tabs/characters',
    title: 'OPTC Characters | OPTC Team Builder',
    description:
      'Browse the One Piece Treasure Cruise character catalog with stats, classes, abilities, and team-building data.',
  },
  {
    path: 'tabs/team-builder',
    title: 'Team Builder | OPTC Team Builder',
    description:
      'Build and review One Piece Treasure Cruise teams with character slots, ships, favorites, and offline catalog data.',
  },
  {
    path: 'tabs/auto-team-builder',
    title: 'Auto Team Builder | OPTC Team Builder',
    description:
      'Find OPTC team candidates by enemy mechanics, character abilities, type filters, and team-building requirements.',
  },
  {
    path: 'tabs/crew-forge',
    title: 'Crew Forge | OPTC Team Builder',
    description:
      'Import crew screenshots and match recognized slots against the OPTC character catalog.',
  },
  {
    path: 'privacy',
    title: 'Privacy Policy | OPTC Team Builder',
    description: 'Read the privacy policy for OPTC Team Builder.',
    aliases: ['tabs/privacy'],
  },
  {
    path: 'cookies',
    title: 'Cookie Policy | OPTC Team Builder',
    description: 'Read the cookie policy for OPTC Team Builder.',
    aliases: ['tabs/cookies'],
  },
  {
    path: 'terms',
    title: 'Terms of Service | OPTC Team Builder',
    description: 'Read the terms of service for OPTC Team Builder.',
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

console.log(
  `[seo] generated ${characters.length} character pages, ${publicRoutes.length} public pages, and sitemap.xml in ${path.relative(
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

function buildStaticPageSeo(route) {
  const canonicalPath = route.canonicalPath ?? route.path;
  const canonicalUrl = buildAbsoluteUrl(canonicalPath);

  return {
    title: route.title,
    description: route.description,
    canonicalUrl,
    imageUrl: null,
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

  return removeExistingSeo(html).replace(
    titlePattern,
    `<title>${escapeHtml(seo.title)}</title>\n${buildSeoTags(seo)}`,
  );
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
    (assets.thumbnailJapan
      ? `assets/offline-packs/thumbnails-jap/${assets.thumbnailJapan}`
      : null) ??
    (assets.fullTransparent
      ? `assets/offline-packs/full-transparent/${assets.fullTransparent}`
      : null);

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

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultOutputDir = path.join(projectRoot, 'dist', 'optc-team-builder', 'browser');
const outputDir = path.resolve(process.env.SEO_OUTPUT_DIR ?? defaultOutputDir);
const siteBaseUrl = normalizeSiteBaseUrl(
  process.env.SEO_SITE_BASE_URL ?? 'https://optcteambuilder.com',
);
const host = new URL(siteBaseUrl).host;
const key = process.env.INDEXNOW_KEY ?? '0e9b739514c64e9a9a762120955f79dc';
const keyLocation = `${siteBaseUrl}/${key}.txt`;
const endpoint = process.env.INDEXNOW_ENDPOINT ?? 'https://api.indexnow.org/indexnow';
const urls = await readSitemapUrls();
const selectedUrls = selectUrls(urls);

if (!selectedUrls.length) {
  throw new Error('No IndexNow URLs selected for submission.');
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'content-type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify({
    host,
    key,
    keyLocation,
    urlList: selectedUrls,
  }),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`IndexNow submission failed with ${response.status}: ${body}`);
}

console.log(`[indexnow] submitted ${selectedUrls.length} URLs for ${host}.`);

async function readSitemapUrls() {
  const sitemap = await readFile(path.join(outputDir, 'sitemap.xml'), 'utf8');

  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)]
    .map((match) => decodeXml(match[1] ?? '').trim())
    .filter(Boolean);
}

function selectUrls(urlList) {
  const explicitUrls = (process.env.INDEXNOW_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  if (explicitUrls.length) {
    return explicitUrls;
  }

  const priorityPatterns = [
    /^https:\/\/optcteambuilder\.com\/$/u,
    /\/tabs\/(?:characters|auto-team-builder|auto-team-builder-rumble|rumble-characters|captain-coverage|crew-forge)\/$/u,
    /\/tools\/[^/]+\/$/u,
    /\/guides\/[^/]+\/$/u,
    /\/characters\/1\/$/u,
  ];

  return urlList.filter((url) => priorityPatterns.some((pattern) => pattern.test(url)));
}

function decodeXml(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function normalizeSiteBaseUrl(value) {
  return String(value).trim().replace(/\/+$/gu, '');
}

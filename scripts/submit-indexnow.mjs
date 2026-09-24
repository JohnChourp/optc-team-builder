import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Submits URLs from the deployed sitemap to IndexNow.
 *
 * `deploy-pages.yml` submits the priority set after every push deploy. 869f1zxuy: the release
 * workflow's own Pages deploy submits the priority set PLUS the page of every character the release
 * added or changed, because a release is the deploy that changes character pages - and until then
 * no run ever submitted one when it changed.
 *
 *   INDEXNOW_URLS              comma-separated URLs that REPLACE the priority set, for a manual run
 *   INDEXNOW_CHANGED_IDS_FILE  a `dataset-change-digest.mjs --changed-ids-output` file; the page of
 *                              each added or changed character is ADDED to the selection
 *   INDEXNOW_DRY_RUN=1         print what would be submitted, and send nothing
 */

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
/*
 * A hung endpoint fails this step instead of holding its job to the job's own timeout. On a release
 * the submission shares a job with the Pages deploy, and the production smoke runs only when that
 * job succeeds.
 */
const submitTimeoutMs = 60_000;
const priorityPatterns = [
  /^https:\/\/optcteambuilder\.com\/$/u,
  /\/tabs\/(?:characters|auto-team-builder|auto-team-builder-rumble|rumble-characters|captain-coverage|crew-forge)\/$/u,
  /\/tools\/[^/]+\/$/u,
  /\/guides\/[^/]+\/$/u,
  /\/characters\/1\/$/u,
];
/** A character page as the sitemap lists it - the same shape as the `/characters/1/` entry above. */
const characterPagePattern = /\/characters\/(\d+)\/$/u;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await submit();
}

async function submit() {
  const urls = await readSitemapUrls();
  const changedCharacterIds = await readChangedCharacterIds(process.env.INDEXNOW_CHANGED_IDS_FILE);
  const selectedUrls = selectUrls(urls, {
    explicitUrls: (process.env.INDEXNOW_URLS ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean),
    changedCharacterIds,
  });

  if (!selectedUrls.length) {
    throw new Error('No IndexNow URLs selected for submission.');
  }

  if (changedCharacterIds.length) {
    console.log(
      `[indexnow] ${changedCharacterIds.length} added or changed character(s) read from ${process.env.INDEXNOW_CHANGED_IDS_FILE}.`,
    );
  }

  if (process.env.INDEXNOW_DRY_RUN === '1') {
    console.log(`[indexnow] dry run, nothing sent: would submit ${selectedUrls.length} URLs for ${host}.`);
    console.log(selectedUrls.join('\n'));
    return;
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
    signal: AbortSignal.timeout(submitTimeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`IndexNow submission failed with ${response.status}: ${body}`);
  }

  console.log(`[indexnow] submitted ${selectedUrls.length} URLs for ${host}.`);
}

async function readSitemapUrls() {
  const sitemap = await readFile(path.join(outputDir, 'sitemap.xml'), 'utf8');

  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)]
    .map((match) => decodeXml(match[1] ?? '').trim())
    .filter(Boolean);
}

/**
 * The priority set - or INDEXNOW_URLS, which replaces it - plus the page of every changed character.
 *
 * A changed character is submitted as the URL the sitemap lists for it, never one built here, so
 * nothing is submitted that the deploy does not serve. When NOT ONE of them has a page, the page
 * shape has drifted from `characterPagePattern`; that throws, rather than quietly submitting the
 * priority set alone on every release from then on.
 */
export function selectUrls(sitemapUrls, { explicitUrls = [], changedCharacterIds = [] } = {}) {
  const selected = explicitUrls.length
    ? explicitUrls
    : sitemapUrls.filter((url) => priorityPatterns.some((pattern) => pattern.test(url)));
  const pageById = new Map(
    sitemapUrls.flatMap((url) => {
      const id = characterPagePattern.exec(url)?.[1];

      return id ? [[Number(id), url]] : [];
    }),
  );
  const changedPages = changedCharacterIds.flatMap((id) => pageById.get(id) ?? []);

  if (changedCharacterIds.length && !changedPages.length) {
    throw new Error(
      `None of the ${changedCharacterIds.length} changed characters has a page in the sitemap: ` +
        'the character page URL no longer matches characterPagePattern.',
    );
  }

  return [...new Set([...selected, ...changedPages])];
}

/**
 * The characters a digest range added or changed, from `dataset-change-digest.mjs
 * --changed-ids-output`.
 *
 * Removed characters are left out on purpose: their page is no longer generated, so the deployed
 * sitemap has no URL to submit for them.
 */
export async function readChangedCharacterIds(filePath) {
  if (!filePath) {
    return [];
  }

  const characters = JSON.parse(await readFile(filePath, 'utf8'))?.characters;

  if (!Array.isArray(characters?.added) || !Array.isArray(characters?.changed)) {
    throw new Error(`${filePath} is not a dataset-change-digest --changed-ids-output file.`);
  }

  return [...characters.added, ...characters.changed].map(Number);
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

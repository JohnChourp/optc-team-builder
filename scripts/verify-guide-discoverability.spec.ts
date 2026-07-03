import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GUIDE_DISCOVERABILITY_INVENTORY,
  verifyGuideDiscoverability,
} from './verify-guide-discoverability.mjs';

async function writeFixtureFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function buildGuideHtml({
  canonicalUrl,
  title,
  heading,
}: {
  canonicalUrl: string;
  title: string;
  heading: string;
}) {
  return `<!doctype html>
<html>
<head>
  <title>${title}</title>
  <meta name="description" content="${heading} guide.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${canonicalUrl}">
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {"@type":"WebSite","url":"https://optcteambuilder.com/","potentialAction":{"@type":"SearchAction"}},
        {"@type":"BreadcrumbList","itemListElement":[]},
        {"@type":"WebPage","url":"${canonicalUrl}","name":"${heading}"}
      ]
    }
  </script>
</head>
<body><app-root><main><h1>${heading}</h1></main></app-root></body>
</html>
`;
}

async function createFixture(tmp: string) {
  const appRoot = path.join(tmp, 'app');
  const outputDir = path.join(tmp, 'dist');
  const sourceHintsByFile = new Map<string, Set<string>>();
  const sitemapUrls = GUIDE_DISCOVERABILITY_INVENTORY.map(
    (guide) => `https://optcteambuilder.com/${guide.path}/`,
  );

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, 'sitemap.xml'),
    `<urlset>${sitemapUrls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`,
  );
  await writeFile(
    path.join(outputDir, 'sitemap.html'),
    GUIDE_DISCOVERABILITY_INVENTORY.map(
      (guide) => `<a href="https://optcteambuilder.com/${guide.path}/">${guide.heading}</a>`,
    ).join('\n'),
  );

  for (const guide of GUIDE_DISCOVERABILITY_INVENTORY) {
    await writeFixtureFile(
      outputDir,
      `${guide.path}/index.html`,
      buildGuideHtml({
        canonicalUrl: `https://optcteambuilder.com/${guide.path}/`,
        title: guide.title,
        heading: guide.heading,
      }),
    );

    for (const hint of [...guide.sourceHints, ...guide.appHelpHints]) {
      const hints = sourceHintsByFile.get(hint.file) ?? new Set<string>();
      hints.add(hint.text);
      sourceHintsByFile.set(hint.file, hints);
    }
  }

  for (const [file, hints] of sourceHintsByFile.entries()) {
    await writeFixtureFile(appRoot, file, [...hints].map((hint) => `fixture ${hint}`).join('\n'));
  }

  return { appRoot, outputDir };
}

describe('verifyGuideDiscoverability', () => {
  it('accepts generated guide pages and source help links that match the inventory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guide-discoverability-'));
    const { appRoot, outputDir } = await createFixture(root);
    const { errors, report } = await verifyGuideDiscoverability({
      appRoot,
      outputDir,
      reportPath: path.join(root, 'report.json'),
    });

    expect(errors).toEqual([]);
    expect(report.status).toBe('ok');
    expect(report.checkedGuides.map((guide) => guide.id)).toEqual(
      GUIDE_DISCOVERABILITY_INVENTORY.map((guide) => guide.id),
    );
  });

  it('rejects a guide route that is missing from the sitemap and app help source', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guide-discoverability-'));
    const { appRoot, outputDir } = await createFixture(root);
    await writeFile(path.join(outputDir, 'sitemap.xml'), '<urlset></urlset>');
    await writeFixtureFile(
      appRoot,
      'src/app/pages/saved-teams/saved-teams.page.html',
      'missing guide link',
    );

    const { errors, report } = await verifyGuideDiscoverability({
      appRoot,
      outputDir,
      reportPath: path.join(root, 'report.json'),
    });

    expect(report.status).toBe('failed');
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'guided-compare-sharing-guide: sitemap.xml must include https://optcteambuilder.com/guides/guided-build-compare-team-sharing/',
        ),
        expect.stringContaining(
          'guided-compare-sharing-guide: src/app/pages/saved-teams/saved-teams.page.html must reference /guides/guided-build-compare-team-sharing',
        ),
      ]),
    );
  });
});

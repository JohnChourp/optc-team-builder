import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_REGISTRY_PATH } from './lib/public-routes.mjs';
import { SEO_CONTENT_DATA_PATH } from './lib/seo-content.mjs';
import {
  GUIDE_DISCOVERABILITY_INVENTORY,
  resolveGuideDiscoverabilityCliPaths,
  verifyGuideDiscoverability,
} from './verify-guide-discoverability.mjs';

type Guide = (typeof GUIDE_DISCOVERABILITY_INVENTORY)[number];

async function writeFixtureFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

/*
 * 869f13c5t. The fixture writes each fact where the app keeps it: the route in `app.routes.ts`, the
 * canonical path and title in the public route registry, the page text in `seo-content.data.ts`. It
 * used to write all three into `app.routes.ts`, the layout before 869f12x57, so this spec stayed green
 * for five days while the real check failed on every run.
 */
function buildAppRoutes(guides: readonly Guide[]) {
  return guides.map((guide) => `{ path: '${guide.path}', loadComponent: loadSeoContentPage },`).join('\n');
}

function buildPublicRoutes(guides: readonly Guide[], titleFor = (guide: Guide) => guide.title) {
  return `export const PUBLIC_ROUTES = [
${guides
  .map(
    (guide) =>
      `  { routePath: ${JSON.stringify(guide.path)}, canonicalPath: ${JSON.stringify(guide.path)}, title: ${JSON.stringify(titleFor(guide))} },`,
  )
  .join('\n')}
] as const;
`;
}

function buildSeoContentPages(guides: readonly Guide[]) {
  return `export const SEO_CONTENT_PAGES = {
${guides
  .map(
    (guide) =>
      `  ${JSON.stringify(guide.path)}: { eyebrow: 'Guide', title: ${JSON.stringify(guide.heading)}, summary: 'Fixture.', sections: [], links: [] },`,
  )
  .join('\n')}
};
`;
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

  // Written after the hints: the data file is one of the hinted files, and its keys are the hints.
  await writeFixtureFile(appRoot, 'src/app/app.routes.ts', buildAppRoutes(GUIDE_DISCOVERABILITY_INVENTORY));
  await writeFixtureFile(appRoot, DEFAULT_REGISTRY_PATH, buildPublicRoutes(GUIDE_DISCOVERABILITY_INVENTORY));
  await writeFixtureFile(appRoot, SEO_CONTENT_DATA_PATH, buildSeoContentPages(GUIDE_DISCOVERABILITY_INVENTORY));

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

  it('rejects a guide page that only includes the heading outside fallback content', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guide-discoverability-'));
    const { appRoot, outputDir } = await createFixture(root);
    const guide = GUIDE_DISCOVERABILITY_INVENTORY[0];
    await writeFixtureFile(
      outputDir,
      `${guide.path}/index.html`,
      buildGuideHtml({
        canonicalUrl: `https://optcteambuilder.com/${guide.path}/`,
        title: guide.title,
        heading: 'Generic fallback content',
      }).replace('Generic fallback content guide.', `${guide.heading} guide.`),
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
          `fallback content must include "${guide.heading}".`,
        ),
      ]),
    );
  });

  it('rejects a guide inventory item that is missing from Angular routes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guide-discoverability-'));
    const { appRoot, outputDir } = await createFixture(root);
    await writeFixtureFile(appRoot, 'src/app/app.routes.ts', "path: 'tabs/auto-team-builder'");

    const { errors, report } = await verifyGuideDiscoverability({
      appRoot,
      outputDir,
      reportPath: path.join(root, 'report.json'),
    });

    expect(report.status).toBe('failed');
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "team-building-guide: src/app/app.routes.ts must include path: 'guides/how-to-build-an-optc-team'.",
        ),
      ]),
    );
  });

  it('never looks for the canonical path or title in app.routes.ts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guide-discoverability-'));
    const { appRoot, outputDir } = await createFixture(root);
    const routes = await readFile(path.join(appRoot, 'src', 'app', 'app.routes.ts'), 'utf8');

    // The regression itself: a route file that names neither fact must still pass.
    expect(routes).not.toContain('canonicalPath');
    expect(routes).not.toContain(GUIDE_DISCOVERABILITY_INVENTORY[0].title);

    const { errors } = await verifyGuideDiscoverability({ appRoot, outputDir, reportPath: null });

    expect(errors).toEqual([]);
  });

  it('rejects a guide the public route registry does not register or titles differently', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guide-discoverability-'));
    const { appRoot, outputDir } = await createFixture(root);
    const [first, second, ...rest] = GUIDE_DISCOVERABILITY_INVENTORY;
    await writeFixtureFile(
      appRoot,
      DEFAULT_REGISTRY_PATH,
      buildPublicRoutes([second, ...rest], (guide) => (guide === second ? 'A different title' : guide.title)),
    );

    const { errors, report } = await verifyGuideDiscoverability({ appRoot, outputDir, reportPath: null });

    expect(report.status).toBe('failed');
    expect(errors).toEqual([
      `${first.id}: ${DEFAULT_REGISTRY_PATH} must register canonicalPath ${first.path}.`,
      `${second.id}: ${DEFAULT_REGISTRY_PATH} must title ${second.path} "${second.title}".`,
    ]);
  });

  it('rejects a guide whose page text is missing from seo-content.data.ts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guide-discoverability-'));
    const { appRoot, outputDir } = await createFixture(root);
    const [first, ...rest] = GUIDE_DISCOVERABILITY_INVENTORY;
    // The first guide's path stays in the file as a comment, so only the missing record can fail.
    await writeFixtureFile(appRoot, SEO_CONTENT_DATA_PATH, `// ${first.path}\n${buildSeoContentPages(rest)}`);

    const { errors } = await verifyGuideDiscoverability({ appRoot, outputDir, reportPath: null });

    expect(errors).toEqual([
      `${first.id}: ${SEO_CONTENT_DATA_PATH} must hold the page ${first.path}, headed "${first.heading}".`,
    ]);
  });

  it('reports a data file it cannot read as literals instead of throwing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'guide-discoverability-'));
    const { appRoot, outputDir } = await createFixture(root);
    await writeFixtureFile(
      appRoot,
      SEO_CONTENT_DATA_PATH,
      `// ${GUIDE_DISCOVERABILITY_INVENTORY.map((guide) => guide.path).join(' ')}\nexport const SEO_CONTENT_PAGES = buildPages();\n`,
    );

    const { errors, report } = await verifyGuideDiscoverability({ appRoot, outputDir, reportPath: null });

    expect(report.status).toBe('failed');
    expect(errors[0]).toBe(`${SEO_CONTENT_DATA_PATH}: SEO_CONTENT_PAGES must be an object literal`);
    expect(errors).toHaveLength(1 + GUIDE_DISCOVERABILITY_INVENTORY.length);
  });

  it('resolves SEO_OUTPUT_DIR for CLI artifact verification', () => {
    const seoOutputDir = path.join(os.tmpdir(), 'guide-discoverability-seo-output');
    const overrideOutputDir = path.join(os.tmpdir(), 'guide-discoverability-override-output');

    expect(resolveGuideDiscoverabilityCliPaths({ SEO_OUTPUT_DIR: seoOutputDir })).toEqual({
      outputDir: seoOutputDir,
      reportPath: path.join(seoOutputDir, 'guide-discoverability-report.json'),
    });
    expect(
      resolveGuideDiscoverabilityCliPaths({
        SEO_OUTPUT_DIR: seoOutputDir,
        GUIDE_DISCOVERABILITY_OUTPUT_DIR: overrideOutputDir,
      }).outputDir,
    ).toBe(overrideOutputDir);
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  checkI18nRegression,
  formatI18nRegressionResult,
} from './i18n-regression-check.mjs';

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeFixture(files: Record<string, string>) {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'optc-i18n-regression-'));
  tempDirs.push(appRoot);

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(appRoot, ...relativePath.split('/'));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }

  return appRoot;
}

function buildTranslationFiles({
  english = {
    import: {
      errorTitle: 'Import failed',
      diagnosticCode: 'Diagnostic code: {{code}}.',
    },
  },
  greek = {
    import: {
      errorTitle: 'Η εισαγωγή απέτυχε',
      diagnosticCode: 'Κωδικός diagnostic: {{code}}.',
    },
  },
}: {
  english?: unknown;
  greek?: unknown;
} = {}) {
  return {
    'public/i18n/saved-teams/en.json': JSON.stringify(english),
    'public/i18n/saved-teams/el.json': JSON.stringify(greek),
  };
}

function buildGuideFiles({ includeHelpSource = true } = {}) {
  return {
    'src/app/app.routes.ts': [
      "path: 'guides/example'",
      "canonicalPath: 'guides/example'",
      "title: 'Example Guide | OPTC Team Builder'",
      "title: 'Example Guide'",
      'Important app route help text',
    ].join('\n'),
    'scripts/generate-seo-pages.mjs': [
      "path: 'guides/example'",
      "title: 'Example Guide | OPTC Team Builder'",
      "heading: 'Example Guide'",
      'Important generated guide text',
    ].join('\n'),
    'src/app/pages/example/example.page.html': includeHelpSource ? '/guides/example' : '',
    'README.md': includeHelpSource ? 'https://example.test/guides/example/' : '',
  };
}

const translationCases = [
  {
    scope: 'saved-teams',
    keys: ['import.errorTitle', 'import.diagnosticCode'],
  },
];

const publicGuideCases = [
  {
    id: 'example-guide',
    path: 'guides/example',
    seoTitle: 'Example Guide | OPTC Team Builder',
    heading: 'Example Guide',
    appRouteFragments: ['Important app route help text'],
    seoGeneratorFragments: ['Important generated guide text'],
    helpSources: [
      {
        file: 'src/app/pages/example/example.page.html',
        text: '/guides/example',
      },
      {
        file: 'README.md',
        text: 'https://example.test/guides/example/',
      },
    ],
  },
];

describe('i18n regression check', () => {
  it('accepts matching EN/EL critical strings and guide source references', async () => {
    const appRoot = await makeFixture({
      ...buildTranslationFiles(),
      ...buildGuideFiles(),
    });

    const result = checkI18nRegression({ appRoot, translationCases, publicGuideCases });

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('ok');
    expect(formatI18nRegressionResult(result)).toContain('checked 2 critical EN/EL strings');
  });

  it('rejects missing-value fallbacks, English fallback, and placeholder drift', async () => {
    const appRoot = await makeFixture({
      ...buildTranslationFiles({
        english: {
          import: {
            errorTitle: 'Import failed',
            diagnosticCode: 'Diagnostic code: {{code}}.',
          },
        },
        greek: {
          import: {
            errorTitle: 'Import failed',
            diagnosticCode: "Missing value for 'import.diagnosticCode' {{wrong}}.",
          },
        },
      }),
      ...buildGuideFiles(),
    });

    const result = checkI18nRegression({ appRoot, translationCases, publicGuideCases });

    expect(result.status).toBe('failed');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('saved-teams.import.errorTitle (el) is identical to the English value'),
        expect.stringContaining('saved-teams.import.errorTitle (el) must contain Greek text'),
        expect.stringContaining('saved-teams.import.diagnosticCode (el) still contains a Transloco missing-value fallback'),
        expect.stringContaining('saved-teams.import.diagnosticCode placeholder mismatch: en=code el=wrong'),
      ]),
    );
  });

  it('rejects missing public guide and help source anchors', async () => {
    const appRoot = await makeFixture({
      ...buildTranslationFiles(),
      ...buildGuideFiles({ includeHelpSource: false }),
      'scripts/generate-seo-pages.mjs': "path: 'guides/example'",
    });

    const result = checkI18nRegression({ appRoot, translationCases, publicGuideCases });

    expect(result.status).toBe('failed');
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('example-guide: scripts/generate-seo-pages.mjs must include "Example Guide | OPTC Team Builder"'),
        expect.stringContaining('example-guide: src/app/pages/example/example.page.html must include "/guides/example"'),
        expect.stringContaining('example-guide: README.md must include "https://example.test/guides/example/"'),
      ]),
    );
  });

  it('rejects broken app route registration even when canonical guide strings remain', async () => {
    const appRoot = await makeFixture({
      ...buildTranslationFiles(),
      ...buildGuideFiles(),
      'src/app/app.routes.ts': [
        "path: 'guides/example-broken'",
        "canonicalPath: 'guides/example'",
        "title: 'Example Guide | OPTC Team Builder'",
        "title: 'Example Guide'",
        'Important app route help text',
      ].join('\n'),
    });

    const result = checkI18nRegression({ appRoot, translationCases, publicGuideCases });

    expect(result.status).toBe('failed');
    expect(result.errors).toContain(
      'example-guide: src/app/app.routes.ts must include "path: \'guides/example\'".',
    );
  });
});

describe('i18n scopes are reachable', () => {
  const i18nRoot = path.resolve(process.cwd(), 'public/i18n');
  const srcRoot = path.resolve(process.cwd(), 'src');

  function readSource(): string {
    const parts: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(?:ts|html)$/u.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
          parts.push(readFileSync(full, 'utf8'));
        }
      }
    };
    walk(srcRoot);

    return parts.join('\n');
  }

  /*
   * `enemy-mechanics-picker` was a 38-key bundle in two languages that nothing
   * read. Commit 61c49a90 ("remove unused enemy mechanic functions and
   * components") deleted the component and its `read:`/`scope:` usage, and left
   * the bundle behind - along with two `preloadScope` calls that went on
   * DOWNLOADING it on every visit to Auto Team Builder and Saved Enemies.
   *
   * A preload is not a use. Scopes are discovered from the directory listing,
   * so a bundle nobody reads is invisible to every other i18n check: parity
   * passes (both languages are there), and the regression check only looks at
   * its own allowlist.
   */
  it('has no bundle that only a preloadScope call keeps alive', () => {
    const source = readSource();
    const scopes = readdirSync(i18nRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(scopes.length).toBeGreaterThan(20);

    const unreadable = scopes.filter((scope) => {
      const read = source.includes(`read: '${scope}'`) || source.includes(`read: "${scope}"`);
      const scoped = source.includes(`scope: '${scope}'`) || source.includes(`scope: "${scope}"`);
      const translated =
        source.includes(`, '${scope}')`) || source.includes(`, "${scope}")`);

      return !read && !scoped && !translated;
    });

    expect(
      unreadable,
      'these bundles ship and are never read - delete them, or wire up whatever was meant to read them',
    ).toEqual([]);
  });
});

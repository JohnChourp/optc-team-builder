import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

describe('orphaned translation keys', () => {
  /*
   * Keys that exist in a bundle and are referenced by no production code.
   *
   * EMPTY, and it must stay that way. These SHIP - every scope is fetched
   * whole, so an orphan is bytes the reader downloads and copy that looks live
   * to anyone reading the bundle. A new orphan fails the scan above.
   *
   * The backlog it used to hold was cleared on 2026-09-10: 82 entries, of which
   * 80 were deleted from `en.json` and `el.json` together, and 2 were not
   * orphans at all. Both traps the old comment warned about were checked
   * mechanically for all 82 rather than by sampling - none sat under a dynamic
   * prefix (61 exist), and no nested `read:` exists in this codebase to make a
   * short path resolve to one.
   *
   * The two survivors are the reason a list like this is dangerous.
   * `chips.addedNoCount` and `chips.removedNoCount` are built at runtime by
   * `announceWithCount` as `${key}NoCount`, so their names appear nowhere and
   * the prefix scan could not see them. They had been sitting in this backlog
   * as deletion candidates; deleting them would have silently removed the
   * screen-reader announcement for the case where no count is available.
   * `isReachable` above now knows about suffix composition, and that is what
   * took them off this list rather than a human noticing.
   *
   * Two more that looked used and were not, both scope collisions rather than
   * references: `settings:sections.analytics` has six grep hits and every one
   * is `cookie-policy` scope, and `characters:favorites.clearAll` is a prefix
   * of the live `favorites.clearAllConfirm`.
   */
  const KNOWN_ORPHANS = new Set<string>([]);

  const flatten = (node: unknown, prefix = '', out: string[] = []): string[] => {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const full = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        flatten(value, full, out);
      } else {
        out.push(full);
      }
    }

    return out;
  };

  /**
   * One definition of "reachable", shared by both halves of this guard.
   *
   * They used to carry the same four lines twice, and the suffix rule was
   * added to one of them first - which would have let the backlog half call a
   * key an orphan while the scan half called it reachable, the two disagreeing
   * about the same key with nothing failing.
   */
  function isReachable(
    key: string,
    {
      prod,
      dynamicPrefixes,
      dynamicSuffixes,
    }: { prod: string; dynamicPrefixes: string[]; dynamicSuffixes: string[] },
  ): boolean {
    const quoted = (needle: string): boolean =>
      [`'${needle}'`, `"${needle}"`, `\`${needle}\``].some((form) => prod.includes(form));

    const leaf = key.split('.').pop()!;

    if (quoted(key) || quoted(leaf)) {
      return true;
    }

    if (dynamicPrefixes.some((prefix) => key.startsWith(prefix))) {
      return true;
    }

    // Composed by suffix: `${stem}NoCount`. The stem must itself be a key the
    // code names, or any key merely ENDING in a common fragment would be
    // excused - which would turn this rule into a hole rather than a fix.
    return dynamicSuffixes.some(
      (suffix) => key.endsWith(suffix) && key.length > suffix.length && quoted(key.slice(0, -suffix.length)),
    );
  }

  function readSources(): { prod: string; dynamicPrefixes: string[]; dynamicSuffixes: string[] } {
    const prod: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = `${dir}/${entry.name}`;

        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(?:ts|html)$/u.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
          prod.push(readFileSync(full, 'utf8'));
        }
      }
    };
    walk('src');

    const joined = prod.join('\n');
    const dynamicPrefixes = new Set<string>();

    // A key whose prefix is composed at runtime is reachable without its full
    // name ever appearing. 60-odd such prefixes exist; ignoring them is how a
    // naive scan invents false orphans.
    for (const [, prefix] of joined.matchAll(/['"`]([a-zA-Z0-9_.-]+\.)\$\{/gu)) {
      if (prefix) dynamicPrefixes.add(prefix);
    }

    for (const [, prefix] of joined.matchAll(/['"`]([a-zA-Z0-9_.-]+\.)['"`]\s*\+/gu)) {
      if (prefix) dynamicPrefixes.add(prefix);
    }

    // A key can also be composed by SUFFIX, and that blind spot cost two real
    // false orphans. `character-tag-set-picker.component.ts` announces through
    //
    //   private announceWithCount(key, params) {
    //     if (count === null) { this.announce(`${key}NoCount`, params); ... }
    //
    // so `chips.addedNoCount` and `chips.removedNoCount` are produced at
    // runtime and their names never appear anywhere. The prefix scan cannot
    // see them - the composed part is at the front - and both were sitting in
    // the backlog below waiting to be deleted, which would have silently
    // broken the no-count screen-reader announcement.
    const dynamicSuffixes = new Set<string>();

    for (const [, suffix] of joined.matchAll(/\$\{[^}]*\}([a-zA-Z0-9_.-]+)['"`]/gu)) {
      if (suffix) dynamicSuffixes.add(suffix);
    }

    return { prod: joined, dynamicPrefixes: [...dynamicPrefixes], dynamicSuffixes: [...dynamicSuffixes] };
  }

  it('gains no new orphaned key', () => {
    const { prod, dynamicPrefixes, dynamicSuffixes } = readSources();
    const root = 'public/i18n';
    const found: string[] = [];
    let scannedBundles = 0;
    let scannedKeys = 0;

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const enPath = `${root}/${entry.name}/en.json`;

      if (!existsSync(enPath)) {
        continue;
      }

      for (const key of flatten(JSON.parse(readFileSync(enPath, 'utf8')))) {
        scannedKeys += 1;

        if (isReachable(key, { prod, dynamicPrefixes, dynamicSuffixes })) {
          continue;
        }

        found.push(`${entry.name}:${key}`);
      }

      scannedBundles += 1;
    }

    // This used to assert `found.length > 0` - "the scan found nothing at all,
    // so it has stopped working". That was true only while orphans existed. The
    // backlog is empty now, so the same assertion would demand the repo keep at
    // least one orphan forever. Prove the scan RAN instead: it reads every
    // bundle and every leaf either way, and a broken walk collapses both counts.
    expect(scannedBundles, 'the orphan scan read no bundles, so it has stopped working').toBeGreaterThan(20);
    expect(scannedKeys, 'the orphan scan read no keys, so it has stopped working').toBeGreaterThan(1500);

    const added = found.filter((key) => !KNOWN_ORPHANS.has(key));

    expect(added, 'these translation keys are referenced by no production code').toEqual([]);
  });

  it('keeps the backlog honest: every listed orphan still exists and is still an orphan', () => {
    const { prod, dynamicPrefixes, dynamicSuffixes } = readSources();
    const stale: string[] = [];

    for (const entry of KNOWN_ORPHANS) {
      const [scope, key] = entry.split(':') as [string, string];
      const enPath = `public/i18n/${scope}/en.json`;

      if (!existsSync(enPath)) {
        stale.push(`${entry} (scope gone)`);
        continue;
      }

      if (!flatten(JSON.parse(readFileSync(enPath, 'utf8'))).includes(key)) {
        stale.push(`${entry} (key deleted)`);
        continue;
      }

      if (isReachable(key, { prod, dynamicPrefixes, dynamicSuffixes })) {
        stale.push(`${entry} (now referenced)`);
      }
    }

    expect(stale, 'remove these from KNOWN_ORPHANS - the backlog is out of date').toEqual([]);
  });
});

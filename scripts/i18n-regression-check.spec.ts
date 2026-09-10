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
   * These SHIP: every scope is fetched whole, so an orphan is bytes the reader
   * downloads and copy that looks live to anyone reading the bundle. The set
   * below is the state on 2026-09-10 and is a BACKLOG, not an approval - each
   * needs its own read before deletion, because the traps are real. Measured
   * while writing this guard: `settings:sections.analytics` looks used if you
   * grep for it (six hits) and every one is `cookie-policy` scope.
   *
   * Twenty-one keys in wholly-dead subtrees were deleted rather than listed:
   * where every leaf under a parent is unreferenced, the group went with the
   * control it labelled.
   *
   * The point of the list is that it must not GROW. A new orphan fails here.
   */
  const KNOWN_ORPHANS = new Set([
  // auto-team-builder
  'auto-team-builder:abilityRequirements.configuredRows',
  'auto-team-builder:abilityRequirements.emptyCatalog',
  'auto-team-builder:abilityRequirements.emptyCatalogSuffix',
  'auto-team-builder:abilityRequirements.placeholders.selectSlotTokens',
  'auto-team-builder:actions.build.favoriteFlexible',
  'auto-team-builder:actions.build.favoriteStrict',
  'auto-team-builder:actions.build.selectTypes',
  'auto-team-builder:compare.shipPresence.present',
  'auto-team-builder:crewmateFilters.configuredRows',
  'auto-team-builder:crewmateFilters.emptyCatalog',
  'auto-team-builder:crewmateFilters.emptyCatalogSuffix',
  'auto-team-builder:enemyMechanics.configuredRows',
  'auto-team-builder:errors.requirements.characterNameCoverage',
  'auto-team-builder:errors.requirements.characterTagCoverage',
  'auto-team-builder:errors.requirements.superTandemCriteria',
  'auto-team-builder:fallback.ignoredLeaderSuperSpecialCriteria',
  'auto-team-builder:filters.captainAbilityCoverage.support.simple',
  'auto-team-builder:filters.leaderBoost.placeholder',
  'auto-team-builder:filters.leaderBoost.range.atkMax',
  'auto-team-builder:filters.leaderBoost.range.atkMin',
  'auto-team-builder:filters.leaderBoost.range.hpMax',
  'auto-team-builder:filters.leaderBoost.range.hpMin',
  'auto-team-builder:hero.strictModes.bothLeadersCaptainCoverage',
  'auto-team-builder:hero.strictModes.perCharacterClasses',
  'auto-team-builder:hero.strictModes.superSpecialCriteriaCoverage',
  'auto-team-builder:hero.strictModes.superTandemCriteriaCoverage',
  'auto-team-builder:manualCounters.configuredRows',
  'auto-team-builder:manualCounters.emptyCatalog',
  'auto-team-builder:manualCounters.emptyCatalogSuffix',
  'auto-team-builder:potentialFilters.configuredRows',
  'auto-team-builder:potentialFilters.emptyCatalog',
  'auto-team-builder:potentialFilters.emptyCatalogSuffix',
  'auto-team-builder:progress.allowingLeadersWithSuperEffects',
  'auto-team-builder:progress.ignoringLeaderSuperSpecialCriteria',
  'auto-team-builder:progress.ignoringTypes',
  'auto-team-builder:save.savingCopy',
  'auto-team-builder:ships.changeAction',
  'auto-team-builder:ships.emptySelectionLabel',
  'auto-team-builder:ships.openAction',
  'auto-team-builder:ships.pickerCopy',
  'auto-team-builder:ships.pickerTitle',
  'auto-team-builder:specialFilters.configuredRows',
  'auto-team-builder:specialFilters.emptyCatalog',
  'auto-team-builder:specialFilters.emptyCatalogSuffix',
  'auto-team-builder:supportFilters.configuredRows',
  'auto-team-builder:supportFilters.emptyCatalog',
  'auto-team-builder:supportFilters.emptyCatalogSuffix',
  // auto-team-builder-rumble
  'auto-team-builder-rumble:summary.totalScore',
  // captain-coverage
  'captain-coverage:boosts.ariaLabel',
  'captain-coverage:boosts.avg',
  // character-tag-sets
  'character-tag-sets:chips.removedNoCount',
  // crew-forge
  'crew-forge:imageImport.errors.invalidProfile',
  // saved-enemies
  'saved-enemies:bulkImport.chooseAnotherFile',
  'saved-enemies:bulkImport.dropzone.subtitle',
  'saved-enemies:bulkImport.processing',
  'saved-enemies:editor.addAbility',
  'saved-enemies:editor.associatedTeams.toggleAria',
  'saved-enemies:editor.crewmateFilters.actions.openPicker',
  'saved-enemies:editor.editAbilities',
  'saved-enemies:editor.enemyMechanics.actions.openPicker',
  'saved-enemies:editor.manualCounters.actions.openPicker',
  'saved-enemies:editor.noAbilityCatalog',
  'saved-enemies:editor.potentialFilters.actions.openPicker',
  'saved-enemies:editor.removeAbility',
  'saved-enemies:editor.specialFilters.actions.openPicker',
  'saved-enemies:editor.supportFilters.actions.openPicker',
  'saved-enemies:editor.toggles.classesCopy',
  'saved-enemies:editor.toggles.typesCopy',
  // settings
  'settings:driveSync.account.signedOut',
  'settings:sections.analytics',
    // Referenced only by specs, never by production code. Some are deliberate
    // negative guards (a spec asserting the key is NOT rendered); each needs
    // reading before deletion, exactly like the rest of this backlog.
    'auto-team-builder:filters.captainAbilityCoverage.toggle',
    'auto-team-builder:abilityRequirements.placeholders.selectAbility',
    'captain-coverage:filters.tierCoverage.panelEyebrow',
    'captain-coverage:filters.tierCoverage.panelTitle',
    'character-tag-sets:chips.addedNoCount',
    'characters:favorites.clearAll',
    'manual-team-builder:captainHelper.scopeChip',
    'saved-enemies:hero.savedTeamsCta',
    'saved-teams:hero.savedEnemiesCta',
    'settings:language.helper',
    'settings:driveSync.localOnly',
    'settings:driveSync.actions.openPage',
  ]);

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

  function readSources(): { prod: string; dynamicPrefixes: string[] } {
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

    return { prod: joined, dynamicPrefixes: [...dynamicPrefixes] };
  }

  it('gains no new orphaned key', () => {
    const { prod, dynamicPrefixes } = readSources();
    const root = 'public/i18n';
    const found: string[] = [];

    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const enPath = `${root}/${entry.name}/en.json`;

      if (!existsSync(enPath)) {
        continue;
      }

      for (const key of flatten(JSON.parse(readFileSync(enPath, 'utf8')))) {
        const leaf = key.split('.').pop()!;
        const referenced = [key, leaf].some((needle) =>
          [`'${needle}'`, `"${needle}"`, `\`${needle}\``].some((quoted) => prod.includes(quoted)),
        );

        if (referenced || dynamicPrefixes.some((prefix) => key.startsWith(prefix))) {
          continue;
        }

        found.push(`${entry.name}:${key}`);
      }
    }

    expect(found.length, 'the orphan scan found nothing at all, so it has stopped working').toBeGreaterThan(0);

    const added = found.filter((key) => !KNOWN_ORPHANS.has(key));

    expect(added, 'these translation keys are referenced by no production code').toEqual([]);
  });

  it('keeps the backlog honest: every listed orphan still exists and is still an orphan', () => {
    const { prod, dynamicPrefixes } = readSources();
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

      const leaf = key.split('.').pop()!;
      const referenced = [key, leaf].some((needle) =>
        [`'${needle}'`, `"${needle}"`, `\`${needle}\``].some((quoted) => prod.includes(quoted)),
      );

      if (referenced || dynamicPrefixes.some((prefix) => key.startsWith(prefix))) {
        stale.push(`${entry} (now referenced)`);
      }
    }

    expect(stale, 'remove these from KNOWN_ORPHANS - the backlog is out of date').toEqual([]);
  });
});

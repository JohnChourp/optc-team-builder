import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const GREEK_SCRIPT_PATTERN = /\p{Script=Greek}/u;
const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu;

export const CRITICAL_TRANSLATION_CASES = [
  {
    scope: 'saved-teams',
    keys: [
      'guide.cta',
      'guide.importLink',
      'import.errorTitle',
      'import.errors.invalidShareCode',
      'import.diagnosticCode',
      'import.recovery.invalidShareCode',
      'share.errorTitle',
      'share.manualCopyTitle',
      'share.errors.permissionDenied',
      'share.errors.insecureContext',
      'share.errors.jsonClipboard',
      'storageRecovery.title',
      'storageFailures.errors.quota',
      'storageFailures.recovery.quota',
    ],
  },
  {
    scope: 'auto-team-builder',
    keys: [
      'filters.guidedAutoBuild.toggle',
      'filters.guidedAutoBuild.guideLink',
      'filters.guidedAutoBuild.support.next',
      'filters.guidedAutoBuild.support.complete',
      'preset.importFailedTitle',
      'preset.errors.invalidJson',
      'preset.warnings.favoriteCountMismatch',
      'compare.guideLink',
      'compare.import.errors.invalid',
      'compare.storage.diagnosticCode',
      'compare.storage.recovery.quota',
      'compare.errors.loadFailed',
      'candidatePoolBox.saveFailedTitle',
    ],
  },
  {
    scope: 'manual-team-builder',
    keys: [
      'builder.copy',
      'picker.copy',
      'picker.filters.costError',
      'drag.invalidCost',
      'save.error',
      'shareImport.error',
      'validation.captain.missing.title',
      'validation.captain.missing.copy',
      'validation.captain.coverage.copy',
      'validation.cost.title',
      'summary.copy',
    ],
  },
];

export const PUBLIC_GUIDE_CASES = [
  {
    id: 'team-building-guide',
    path: 'guides/how-to-build-an-optc-team',
    seoTitle: 'How to Build an OPTC Team | One Piece Treasure Cruise Guide',
    heading: 'How to Build an OPTC Team',
    appRouteFragments: ['Start with the captain', 'Map the mechanics', 'Lock and search'],
    seoGeneratorFragments: [
      'cover bind, despair, paralysis',
      'let Auto Team Builder search for candidates',
    ],
    helpSources: [
      {
        file: 'README.md',
        text: 'https://optcteambuilder.com/guides/how-to-build-an-optc-team/',
      },
    ],
  },
  {
    id: 'guided-compare-sharing-guide',
    path: 'guides/guided-build-compare-team-sharing',
    seoTitle: 'Guided Build, Compare Mode, and Team Sharing | OPTC Team Builder',
    heading: 'Guided Build, Compare Mode, and Team Sharing',
    appRouteFragments: ['Guided auto build', 'Supported transfer formats', 'Current limits'],
    seoGeneratorFragments: [
      'Saved Teams transfer supports schema v1',
      'browser blocks native share or clipboard access',
    ],
    helpSources: [
      {
        file: 'src/app/pages/auto-team-builder/auto-team-builder.page.html',
        text: '/guides/guided-build-compare-team-sharing',
      },
      {
        file: 'src/app/pages/saved-teams/saved-teams.page.html',
        text: '/guides/guided-build-compare-team-sharing',
      },
    ],
  },
];

export function checkI18nRegression({
  appRoot = process.cwd(),
  translationCases = CRITICAL_TRANSLATION_CASES,
  publicGuideCases = PUBLIC_GUIDE_CASES,
} = {}) {
  const errors = [];
  const translationTrees = new Map();
  const flattenedTranslationCases = flattenTranslationCases(translationCases);

  for (const translationCase of flattenedTranslationCases) {
    const english = readTranslationValue({
      appRoot,
      cache: translationTrees,
      language: 'en',
      scope: translationCase.scope,
      key: translationCase.key,
      errors,
    });
    const greek = readTranslationValue({
      appRoot,
      cache: translationTrees,
      language: 'el',
      scope: translationCase.scope,
      key: translationCase.key,
      errors,
    });

    validateTranslationValue({
      language: 'en',
      scope: translationCase.scope,
      key: translationCase.key,
      value: english,
      errors,
    });
    validateTranslationValue({
      language: 'el',
      scope: translationCase.scope,
      key: translationCase.key,
      value: greek,
      englishValue: english,
      requiresGreekScript: translationCase.requiresGreekScript !== false,
      errors,
    });
    comparePlaceholders({
      scope: translationCase.scope,
      key: translationCase.key,
      english,
      greek,
      errors,
    });
  }

  checkPublicGuideSources({ appRoot, publicGuideCases, errors });

  return {
    status: errors.length === 0 ? 'ok' : 'failed',
    errors,
    checkedTranslations: flattenedTranslationCases.length,
    checkedGuides: publicGuideCases.map((guide) => guide.id),
  };
}

export function formatI18nRegressionResult(result) {
  if (result.errors.length === 0) {
    return [
      `[i18n-regression] checked ${result.checkedTranslations} critical EN/EL strings`,
      `[i18n-regression] checked ${result.checkedGuides.length} public guide/help routes`,
    ].join('\n');
  }

  return [
    '[i18n-regression] multilingual regression checks failed:',
    ...result.errors.map((error) => `- ${error}`),
  ].join('\n');
}

function flattenTranslationCases(translationCases) {
  return translationCases.flatMap((entry) =>
    entry.keys.map((key) => ({
      scope: entry.scope,
      key,
      requiresGreekScript: entry.requiresGreekScript,
    })),
  );
}

function readTranslationValue({ appRoot, cache, language, scope, key, errors }) {
  const cacheKey = `${scope}:${language}`;
  const tree =
    cache.get(cacheKey) ??
    readTranslationTree({
      appRoot,
      language,
      scope,
      errors,
    });
  cache.set(cacheKey, tree);

  if (tree === null) {
    return undefined;
  }

  return key.split('.').reduce((value, part) => {
    if (
      value === null ||
      typeof value !== 'object' ||
      !Object.prototype.hasOwnProperty.call(value, part)
    ) {
      return undefined;
    }

    return value[part];
  }, tree);
}

function readTranslationTree({ appRoot, language, scope, errors }) {
  const filePath =
    scope === 'root'
      ? path.join(appRoot, 'public', 'i18n', `${language}.json`)
      : path.join(appRoot, 'public', 'i18n', scope, `${language}.json`);

  if (!existsSync(filePath)) {
    errors.push(`Missing translation file: ${path.relative(appRoot, filePath)}`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(
      `Invalid translation JSON in ${path.relative(appRoot, filePath)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function validateTranslationValue({
  language,
  scope,
  key,
  value,
  englishValue,
  requiresGreekScript = false,
  errors,
}) {
  const label = `${scope}.${key} (${language})`;

  if (typeof value !== 'string') {
    errors.push(`${label} must be a string translation.`);
    return;
  }

  if (value.trim().length === 0) {
    errors.push(`${label} must not be empty.`);
  }

  if (/Missing value for/u.test(value)) {
    errors.push(`${label} still contains a Transloco missing-value fallback.`);
  }

  if (language !== 'el') {
    return;
  }

  if (
    typeof englishValue === 'string' &&
    normalizeForComparison(value) === normalizeForComparison(englishValue)
  ) {
    errors.push(`${label} is identical to the English value, which indicates wrong-language fallback.`);
  }

  if (requiresGreekScript && !GREEK_SCRIPT_PATTERN.test(value)) {
    errors.push(`${label} must contain Greek text around approved English OPTC terms.`);
  }
}

function comparePlaceholders({ scope, key, english, greek, errors }) {
  if (typeof english !== 'string' || typeof greek !== 'string') {
    return;
  }

  const englishPlaceholders = extractPlaceholders(english);
  const greekPlaceholders = extractPlaceholders(greek);

  if (setsEqual(englishPlaceholders, greekPlaceholders)) {
    return;
  }

  errors.push(
    `${scope}.${key} placeholder mismatch: en=${formatSet(englishPlaceholders)} el=${formatSet(
      greekPlaceholders,
    )}`,
  );
}

function extractPlaceholders(value) {
  const placeholders = new Set();

  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1]);
  }

  return placeholders;
}

function checkPublicGuideSources({ appRoot, publicGuideCases, errors }) {
  const appRoutesPath = path.join(appRoot, 'src', 'app', 'app.routes.ts');
  const seoGeneratorPath = path.join(appRoot, 'scripts', 'generate-seo-pages.mjs');
  const appRoutes = readSourceFile(appRoot, appRoutesPath, errors);
  const seoGenerator = readSourceFile(appRoot, seoGeneratorPath, errors);

  for (const guide of publicGuideCases) {
    expectSourceContains({
      source: appRoutes,
      appRoot,
      filePath: appRoutesPath,
      guideId: guide.id,
      values: [guide.path, guide.seoTitle, guide.heading, ...guide.appRouteFragments],
      errors,
    });
    expectSourceContains({
      source: seoGenerator,
      appRoot,
      filePath: seoGeneratorPath,
      guideId: guide.id,
      values: [guide.path, guide.seoTitle, guide.heading, ...guide.seoGeneratorFragments],
      errors,
    });

    for (const helpSource of guide.helpSources) {
      const helpSourcePath = path.join(appRoot, ...helpSource.file.split('/'));
      const helpSourceText = readSourceFile(appRoot, helpSourcePath, errors);
      expectSourceContains({
        source: helpSourceText,
        appRoot,
        filePath: helpSourcePath,
        guideId: guide.id,
        values: [helpSource.text],
        errors,
      });
    }
  }
}

function readSourceFile(appRoot, filePath, errors) {
  if (!existsSync(filePath)) {
    errors.push(`Missing source file: ${path.relative(appRoot, filePath)}`);
    return '';
  }

  return readFileSync(filePath, 'utf8');
}

function expectSourceContains({ source, appRoot, filePath, guideId, values, errors }) {
  for (const value of values) {
    if (source.includes(value)) {
      continue;
    }

    errors.push(`${guideId}: ${path.relative(appRoot, filePath)} must include "${value}".`);
  }
}

function normalizeForComparison(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function setsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function formatSet(values) {
  return values.size === 0 ? 'none' : [...values].sort().join(',');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = checkI18nRegression();
  const output = formatI18nRegressionResult(result);

  if (result.status === 'ok') {
    console.log(output);
    process.exit(0);
  }

  console.error(output);
  process.exit(1);
}

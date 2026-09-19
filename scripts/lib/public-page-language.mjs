/**
 * 869f13c6b. Which language each public page is in, and how its other languages are announced.
 *
 * Every public page is English today and says so: `<html lang="en">` from `src/index.html`, and
 * `inLanguage: 'en'` in its JSON-LD. The app also ships a complete Greek translation, which the
 * owner decided on 2026-09-15 (wave 10, 869f17hbm) not to publish as a public channel. So the one
 * honest declaration today is "English, no alternates", and this module keeps it that way.
 *
 * What it adds is the mechanism for the day that decision changes, so the first page in another
 * language is discoverable when it ships instead of months later - which is what happened to
 * `/faq`, published with 0 of 4,637 sitemap URLs because the route list lived in five places:
 *
 *   - a registry record may name its `language` (default `en`) and its `alternates`,
 *     `{ <language>: <canonicalPath> }`;
 *   - `hreflangLinks` gives the page itself, each alternate and `x-default`, and NOTHING for a
 *     page without alternates, so the generated output is byte-identical until one exists;
 *   - `validateLanguageDeclarations` fails a page in another language, or under a
 *     language-scoped path, that names no alternates; alternates that are not reciprocal; an
 *     alternate the registry does not carry; and a language that disagrees with its path.
 *
 * Not built, on purpose: route-driven language in the running app. A Greek public page also needs
 * the app to boot in Greek on that route, or the rendered page contradicts its own `lang` and
 * `hreflang` - that is the content project (869f13c59), not this correctness layer. So
 * `findUnmaintainedRuntimeAlternates` fails the day an alternate appears while `app.component.ts`
 * still does not keep alternate links right across client-side navigation.
 */
export const SITE_LANGUAGE = 'en';

const LANGUAGE_SCOPED_PATH = /^([a-z]{2})(?:\/|$)/u;

export function languageOf(record) {
  return record.language ?? SITE_LANGUAGE;
}

function alternatesOf(record) {
  return Object.entries(record.alternates ?? {});
}

export function validateLanguageDeclarations(records) {
  const errors = [];
  const byPath = new Map(records.map((record) => [record.canonicalPath, record]));

  for (const record of records) {
    const language = languageOf(record);
    const alternates = alternatesOf(record);
    const scopedLanguage = record.canonicalPath.match(LANGUAGE_SCOPED_PATH)?.[1];

    if ((language !== SITE_LANGUAGE || scopedLanguage) && alternates.length === 0) {
      errors.push(
        `"${record.canonicalPath}" is a language-scoped route with no alternate annotation: a page in "${language}" ` +
          'must name the page it translates in `alternates`, or searches in the other language never find it.',
      );
    }

    if (scopedLanguage && scopedLanguage !== language) {
      errors.push(
        `"${record.canonicalPath}" sits under "${scopedLanguage}/" but declares language "${language}".`,
      );
    }

    for (const [alternateLanguage, alternatePath] of alternates) {
      if (alternateLanguage === language) {
        errors.push(`"${record.canonicalPath}" names itself as its own ${language} alternate.`);
        continue;
      }

      const target = byPath.get(alternatePath);

      if (!target) {
        errors.push(
          `"${record.canonicalPath}" names a ${alternateLanguage} alternate, "${alternatePath}", that the registry does not carry.`,
        );
        continue;
      }

      if (languageOf(target) !== alternateLanguage) {
        errors.push(
          `"${record.canonicalPath}" names "${alternatePath}" as its ${alternateLanguage} alternate, but that page declares "${languageOf(target)}".`,
        );
      }

      if ((target.alternates ?? {})[language] !== record.canonicalPath) {
        errors.push(
          `"${alternatePath}" does not name "${record.canonicalPath}" back as its ${language} alternate; ` +
            'hreflang pairs must be reciprocal or search engines ignore both.',
        );
      }
    }
  }

  return errors;
}

/**
 * Alternate links for one page: itself, each alternate and `x-default` (the site-language page),
 * sorted by language. Empty for a page without alternates - every page today.
 */
export function hreflangLinks(record, absoluteUrl) {
  const alternates = alternatesOf(record);

  if (alternates.length === 0) {
    return [];
  }

  const defaultPath =
    languageOf(record) === SITE_LANGUAGE
      ? record.canonicalPath
      : (record.alternates[SITE_LANGUAGE] ?? record.canonicalPath);

  return [
    ...[[languageOf(record), record.canonicalPath], ...alternates]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([hreflang, pagePath]) => ({ hreflang, href: absoluteUrl(pagePath) })),
    { hreflang: 'x-default', href: absoluteUrl(defaultPath) },
  ];
}

/** Tripwire: alternates exist, but the running app would leave the landing page's links in place. */
export function findUnmaintainedRuntimeAlternates(records, appComponentSource) {
  const withAlternates = records.filter((record) => alternatesOf(record).length > 0);

  if (withAlternates.length === 0 || /hreflang/u.test(appComponentSource)) {
    return [];
  }

  return [
    `${withAlternates.length} public page(s) name alternates, and src/app/app.component.ts never touches ` +
      'hreflang links. The prerendered links stay in the document after client-side navigation, so ' +
      'every page reached from them would announce another page\'s alternates. Maintain them beside ' +
      'the canonical link before publishing the first alternate.',
  ];
}

import { DEFAULT_APP_LANGUAGE, type SupportedLanguage } from './app-i18n.types';

/**
 * The locale that player-facing formatting must use.
 *
 * 869f17h2x. `toLocaleString()` with no argument formats in the BROWSER's locale,
 * which has nothing to do with the language this app is running in. Measured:
 * `1234567.89` is `1,234,567.89` in `en` and `1.234.567,89` in `el`, so a Greek
 * reader with an English browser saw a thousands separator where they expect a
 * decimal point.
 *
 * A module-level value rather than an injected service, deliberately: these call
 * sites live in presenters and `*.utils.ts` files with no injector, and page specs
 * here run without a TestBed. A plain function is reachable from all of them.
 *
 * `AppI18nService.setLanguage` is the only writer, and it is also the only place
 * `documentElement.lang` is written, so the two cannot disagree.
 *
 * Call sites pass this to the existing `toLocaleString` rather than being rewritten
 * around a new helper: the receiver expressions are things like
 * `this.effectiveAutoBuildCandidateIds()?.length`, and re-parsing 41 of those to
 * wrap them is a way to introduce a bug while fixing a formatting one.
 */

let activeLanguage: SupportedLanguage = DEFAULT_APP_LANGUAGE;

export function setFormattingLanguage(language: SupportedLanguage): void {
  activeLanguage = language;
}

/**
 * The locale for numbers and dates inside TRANSLATED copy.
 *
 * Not for a number inside an untranslated English sentence built from dataset
 * text: `'50% chance to resist Poison'` is English whatever the interface language
 * is, and formatting its number as Greek produces a sentence in neither. Those
 * sites keep an explicit `'en-US'` and are listed in the formatting guard.
 */
export function formattingLanguage(): SupportedLanguage {
  return activeLanguage;
}

/**
 * A boolean as a player reads it, in the interface language.
 *
 * 869f13c58. `formatScalar` on Character Detail returned a hard-coded `'Yes'` / `'No'`
 * on the line *below* one that formats numbers with `formattingLanguage()`. So a Greek
 * reader saw a Greek-formatted number and an English word in the same row, from the
 * same function, four lines apart.
 *
 * It lives beside `formattingLanguage` for the reason that function's own note gives:
 * the call sites are presenters and `*.utils.ts` files with no injector, and page specs
 * here run without a TestBed. A translation key would need one.
 *
 * This is for a boolean the APP computes. A `Yes` inside untranslated English dataset
 * prose stays English, exactly as the note above says of numbers.
 */
const BOOLEAN_WORDS: Readonly<Record<SupportedLanguage, readonly [string, string]>> = {
  en: ['Yes', 'No'],
  el: ['Ναι', 'Όχι'],
};

export function formatBoolean(value: boolean): string {
  const [yes, no] = BOOLEAN_WORDS[activeLanguage] ?? BOOLEAN_WORDS[DEFAULT_APP_LANGUAGE];
  return value ? yes : no;
}

/** Restores the module default. Exposed for tests, which share module state. */
export function resetFormattingLanguageForTests(): void {
  activeLanguage = DEFAULT_APP_LANGUAGE;
}

/**
 * A timestamp as a player reads it, in the interface language and their own zone.
 *
 * 869f13gb9. `character-boxes.page.html` interpolated `box.updatedAt` straight into
 * a translated sentence, so the Character Boxes list read `Updated
 * 2026-09-22T07:30:00.000Z` - a raw ISO 8601 string, in both languages, on a screen
 * a player uses every session.
 *
 * The rules A-E in `scripts/check-locale-formatting.mjs` could not see it, and that
 * is the point worth carrying: every one of them reads a CALL SITE - a `toLocale*`,
 * an `Intl` construction, a `toFixed`. Here there was no call at all. A guard over
 * how a formatter is invoked is blind to a value that was never formatted, so rule
 * F reads the templates instead.
 *
 * Storage stays UTC and untouched: `updatedAt` is compared, sorted and round-tripped
 * through the Drive backup, and converting a payload field corrupts stored data,
 * which is far worse than a date that reads a day early. Only display converts - and
 * omitting `timeZone` is what does it, because `Intl` then uses the runtime's own
 * zone rather than UTC.
 *
 * Returns the input unchanged when it does not parse. A player pasting a bad value
 * into an import should see what they actually have, not `Invalid Date`.
 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(formattingLanguage(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

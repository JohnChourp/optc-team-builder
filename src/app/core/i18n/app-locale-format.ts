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

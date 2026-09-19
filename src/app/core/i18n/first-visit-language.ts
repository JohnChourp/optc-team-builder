import {
  APP_I18N_AVAILABLE_LANGUAGES,
  DEFAULT_APP_LANGUAGE,
  type SupportedLanguage,
} from './app-i18n.types';

/**
 * The language a first visit starts in, when this device has no stored choice yet.
 *
 * 869f13c59. Until then every first visit started in English, and the only way to Greek was the
 * switch in the side menu - so a Greek-speaking reader met an English app and had to know where to
 * change it. Now the browser's own list decides: its languages are walked in the reader's order and
 * the first one this app is translated into wins. `el-GR` or `el` gives Greek, `en-US` gives
 * English, `['de-DE', 'el']` gives Greek, and a list with neither (`fr-FR`) falls back to English.
 *
 * Only a FIRST visit. `AppI18nService.setLanguage` stores whatever it applies, so from the second
 * visit on the stored choice wins, and a reader who picks English on a Greek phone keeps English.
 * The same store means readers who came before this change keep the English that was stored for
 * them then: a stored `en` cannot tell a choice from the old default, so it is left alone.
 *
 * Public pages are unaffected. The prerendered documents stay `lang="en"` (`docs/first-paint.md`),
 * crawlers send English, and nothing here changes a URL.
 */
export function resolveFirstVisitLanguage(
  browserLanguages: readonly string[] | null | undefined,
): SupportedLanguage {
  for (const tag of browserLanguages ?? []) {
    const primary = tag.trim().toLowerCase().split(/[-_]/u)[0];
    const match = APP_I18N_AVAILABLE_LANGUAGES.find((language) => language.id === primary);

    if (match) {
      return match.id;
    }
  }

  return DEFAULT_APP_LANGUAGE;
}

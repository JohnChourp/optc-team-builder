export const APP_I18N_AVAILABLE_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "el", label: "Ελληνικά" },
] as const;

export type SupportedLanguage = (typeof APP_I18N_AVAILABLE_LANGUAGES)[number]["id"];

export const DEFAULT_APP_LANGUAGE: SupportedLanguage = "en";
export const APP_LANGUAGE_PREFERENCE_KEY = "appLanguage";

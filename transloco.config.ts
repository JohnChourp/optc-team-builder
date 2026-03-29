import { type TranslocoGlobalConfig } from "@jsverse/transloco-utils";

const config: TranslocoGlobalConfig = {
  rootTranslationsPath: "public/i18n",
  langs: ["en", "el"],
  defaultLang: "en",
  keysManager: {
    input: ["src/app"],
    output: "public/i18n",
    fileFormat: "json",
    addMissingKeys: true,
    unflat: true,
    sort: true,
  },
};

export default config;

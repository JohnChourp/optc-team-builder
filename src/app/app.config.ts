import { provideHttpClient } from "@angular/common/http";
import { ApplicationConfig, inject, isDevMode, provideAppInitializer } from "@angular/core";
import { provideAnimations } from "@angular/platform-browser/animations";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { provideIonicAngular } from "@ionic/angular/standalone";
import { provideTransloco, translocoConfig } from "@jsverse/transloco";

import { routes } from "./app.routes";
import { APP_I18N_AVAILABLE_LANGUAGES } from "./core/i18n/app-i18n.types";
import { TranslocoHttpLoader } from "./core/i18n/transloco-loader";
import { AppI18nService } from "./core/services/app-i18n.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideAnimations(),
    provideIonicAngular(),
    provideRouter(routes, withComponentInputBinding()),
    provideTransloco({
      config: translocoConfig({
        availableLangs: APP_I18N_AVAILABLE_LANGUAGES.map(({ id, label }) => ({ id, label })),
        defaultLang: "en",
        fallbackLang: "en",
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: {
          logMissingKey: isDevMode(),
          useFallbackTranslation: true,
        },
        scopes: {
          keepCasing: true,
          autoPrefixKeys: true,
        },
      }),
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => inject(AppI18nService).ready()),
  ],
};

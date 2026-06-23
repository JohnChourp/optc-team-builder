import { provideHttpClient } from '@angular/common/http';
import { type ApplicationConfig, inject, isDevMode, provideAppInitializer } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideTransloco, translocoConfig } from '@jsverse/transloco';
import { provideLottieOptions } from 'ngx-lottie';

import { routes } from './app.routes';
import { APP_I18N_AVAILABLE_LANGUAGES } from './core/i18n/app-i18n.types';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { AnalyticsConsentService } from './core/services/analytics-consent.service';
import { AppI18nService } from './core/services/app-i18n.service';
import { GoogleAccountService } from './core/services/google-account.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideAnimations(),
    provideLottieOptions({
      player: () => import('lottie-web/build/player/esm/lottie_svg.min.js'),
    }),
    provideIonicAngular(),
    provideRouter(routes, withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideTransloco({
      config: translocoConfig({
        availableLangs: APP_I18N_AVAILABLE_LANGUAGES.map(({ id, label }) => ({ id, label })),
        defaultLang: 'en',
        fallbackLang: 'en',
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
    provideAppInitializer(() => inject(AnalyticsConsentService).ready()),
    provideAppInitializer(() => inject(GoogleAccountService).ready()),
  ],
};

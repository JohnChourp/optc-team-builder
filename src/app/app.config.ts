import { provideHttpClient } from '@angular/common/http';
import {
  type ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideIonicAngular } from '@ionic/angular';
import { provideTransloco, translocoConfig } from '@jsverse/transloco';
import { provideLottieOptions } from 'ngx-lottie';

import { routes } from './app.routes';
import { APP_I18N_AVAILABLE_LANGUAGES } from './core/i18n/app-i18n.types';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { AnalyticsConsentService } from './core/services/analytics-consent.service';
import { AppI18nService } from './core/services/app-i18n.service';
import { AppUpdateService } from './core/services/app-update.service';
import { ErrorLogService, LoggingErrorHandler } from './core/services/error-log.service';
import { GoogleAccountService } from './core/services/google-account.service';
import { NativeUpdateService } from './core/services/native-update.service';
import { StoragePersistenceService } from './core/services/storage-persistence.service';

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
    /*
     * 869f13d6y. Angular's handler sees anything thrown inside its zone; the two
     * window listeners in ErrorLogService.init() catch what it never does. Both
     * halves are needed - an unhandled promise rejection reaches neither the
     * framework nor `window.onerror`.
     */
    { provide: ErrorHandler, useClass: LoggingErrorHandler },
    provideAppInitializer(() => inject(ErrorLogService).init()),
    provideAppInitializer(() => inject(AppI18nService).ready()),
    provideAppInitializer(() => inject(AnalyticsConsentService).ready()),
    provideAppInitializer(() => inject(GoogleAccountService).ready()),
    provideAppInitializer(() => inject(AppUpdateService).init()),
    provideAppInitializer(() => inject(NativeUpdateService).init()),
    /*
     * 869f17haa. Last, and deliberately not awaited for its result: a storage
     * hint must never be able to delay or fail startup. Measured before adding
     * it - `persisted()` was false and nothing had ever asked, while 15 records
     * classified `durable-user-data` sit in evictable origin storage.
     */
    provideAppInitializer(() => {
      void inject(StoragePersistenceService).requestPersistence();
    }),
  ],
};

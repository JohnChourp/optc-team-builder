import { provideHttpClient } from '@angular/common/http';
import {
  Injector,
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTransloco, translocoConfig } from '@jsverse/transloco';
import { provideLottieOptions } from 'ngx-lottie';

import { routes } from './app.routes';
import { APP_I18N_AVAILABLE_LANGUAGES } from './core/i18n/app-i18n.types';
import { provideOptcIonicAngular } from './core/ionic/optc-ionic-angular.provider';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { AnalyticsConsentService } from './core/services/analytics-consent.service';
import { AppI18nService } from './core/services/app-i18n.service';

const scheduleGoogleAccountWarmup = (injector: Injector): void => {
  const warmup = () => {
    void import('./core/services/google-account.service')
      .then(({ GoogleAccountService }) => injector.get(GoogleAccountService).ready())
      .catch(() => undefined);
  };
  const runtime = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };

  if (typeof runtime.requestIdleCallback === 'function') {
    runtime.requestIdleCallback(warmup, { timeout: 2_000 });
    return;
  }

  window.setTimeout(warmup, 0);
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideAnimationsAsync(),
    provideLottieOptions({
      player: () => import('lottie-web/build/player/esm/lottie_svg.min.js'),
    }),
    provideOptcIonicAngular(),
    provideRouter(routes, withComponentInputBinding()),
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
    provideAppInitializer(() => scheduleGoogleAccountWarmup(inject(Injector))),
  ],
};

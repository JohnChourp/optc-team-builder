import { DOCUMENT } from '@angular/common';
import {
  APP_INITIALIZER,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';
import { AngularDelegate, ConfigToken, provideComponentInputBinding } from '@ionic/angular/common';
import { initialize, type IonicConfig } from '@ionic/core/components';

export const provideOptcIonicAngular = (config: IonicConfig = {}): EnvironmentProviders =>
  makeEnvironmentProviders([
    {
      provide: ConfigToken,
      useValue: config,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeIonicAngular,
      multi: true,
      deps: [ConfigToken, DOCUMENT],
    },
    provideComponentInputBinding(),
    AngularDelegate,
  ]);

const initializeIonicAngular = (config: IonicConfig, doc: Document): (() => void) => {
  return () => {
    doc.documentElement.classList.add('ion-ce');
    initialize(config);
  };
};

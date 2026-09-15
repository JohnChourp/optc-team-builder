import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonMenuButton } from '@ionic/angular/ion-menu-button';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { TranslocoDirective } from '@jsverse/transloco';

import { SUPPORTED_SECTIONS, type SupportedSection } from './supported.data';

/**
 * "What this app supports", reached from the side menu above the FAQ.
 *
 * 869f17h3g. The questions arrive together - which browsers work, is there an
 * iPhone app, what survives without a connection, what does the Android app ask
 * for, where does the data come from - so they are answered together, on one
 * screen, rather than as scattered lines nobody finds.
 *
 * Plain sections rather than an accordion, unlike the FAQ: this page is short and
 * a reader deciding whether to trust an unofficial tool wants to see all of it at
 * once, not to open five things.
 */
@Component({
  selector: 'app-supported-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButtons,
    IonContent,
    IonHeader,
    IonMenuButton,
    IonTitle,
    IonToolbar,
    TranslocoDirective,
  ],
  templateUrl: './supported.page.html',
  styleUrl: './supported.page.scss',
})
export class SupportedPage {
  public readonly sections: readonly SupportedSection[] = SUPPORTED_SECTIONS;
}

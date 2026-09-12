import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonAccordion } from '@ionic/angular/ion-accordion';
import { IonAccordionGroup } from '@ionic/angular/ion-accordion-group';
import { IonButton } from '@ionic/angular/ion-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonItem } from '@ionic/angular/ion-item';
import { IonLabel } from '@ionic/angular/ion-label';
import { IonMenuButton } from '@ionic/angular/ion-menu-button';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import { TranslocoDirective } from '@jsverse/transloco';

import { FAQ_SECTIONS, type FaqSection } from './faq.data';

/**
 * The in-app FAQ, reached from the side menu directly above "What's new".
 *
 * A page rather than a `faq.md` in the repo (owner, 2026-09-12): the app is
 * bilingual and the questions are the player's, so an answer that only exists
 * as English markdown in a GitHub checkout answers nobody.
 *
 * Every answer starts closed. The list is long enough that opening it all at
 * once turns the screen into a wall, and a reader arriving from the menu is
 * looking for one question, not reading the page.
 */
@Component({
  selector: 'app-faq-page',
  standalone: true,
  imports: [
    CommonModule,
    IonAccordion,
    IonAccordionGroup,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonMenuButton,
    IonTitle,
    IonToolbar,
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './faq.page.html',
  styleUrl: './faq.page.scss',
})
export class FaqPage {
  public readonly sections: readonly FaqSection[] = FAQ_SECTIONS;
}

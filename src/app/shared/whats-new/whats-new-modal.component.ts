import { Component, EventEmitter, Input, Output, computed } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonIcon, IonModal } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { closeOutline, sparklesOutline } from 'ionicons/icons';

import { WHATS_NEW_ENTRIES, type WhatsNewEntry } from '../../core/data/whats-new.data';
import { AppI18nService } from '../../core/services/app-i18n.service';

/**
 * Every release, newest first, in the words a player understands.
 *
 * A modal rather than a route on purpose: this is something you glance at and
 * dismiss, not a destination anyone links to. The whole history is scrollable in
 * one list, so a reader who has been away for ten versions can keep going until
 * they reach one they recognise.
 *
 * Releases that changed nothing a player can see are kept in the list rather
 * than hidden. Skipping them would leave gaps in the version numbers and make
 * the reader wonder what was hidden from them; saying "nothing you can see"
 * costs one line and is the honest answer.
 */
@Component({
  selector: 'app-whats-new-modal',
  standalone: true,
  imports: [IonButton, IonButtons, IonContent, IonIcon, IonModal, TranslocoPipe],
  template: `
    <ion-modal
      [isOpen]="isOpen"
      cssClass="whats-new-modal"
      [attr.aria-label]="'whatsNew.title' | transloco"
      (didDismiss)="dismiss.emit()"
    >
      <ng-template>
        <ion-content class="whats-new">
          <header class="whats-new__head">
            <div>
              <div class="section-label">
                <ion-icon [icon]="titleIcon" aria-hidden="true"></ion-icon>
                <span>{{ 'whatsNew.eyebrow' | transloco }}</span>
              </div>
              <h2>{{ 'whatsNew.title' | transloco }}</h2>
              <p>{{ 'whatsNew.copy' | transloco }}</p>
            </div>

            <ion-buttons>
              <ion-button
                fill="clear"
                color="light"
                data-test="whats-new-close"
                [attr.aria-label]="'common.actions.close' | transloco"
                (click)="dismiss.emit()"
              >
                <ion-icon slot="icon-only" [icon]="closeIcon" aria-hidden="true"></ion-icon>
              </ion-button>
            </ion-buttons>
          </header>

          <ol class="whats-new__list">
            @for (entry of entries(); track entry.version) {
              <li
                class="whats-new__entry"
                [class.whats-new__entry--quiet]="!entry.userVisible"
                [attr.data-test]="'whats-new-entry-' + entry.version"
              >
                <header class="whats-new__entry-head">
                  <strong class="whats-new__version">v{{ entry.version }}</strong>
                  <time class="whats-new__date" [attr.datetime]="entry.date">{{ entry.date }}</time>
                </header>

                <h3 class="whats-new__headline">{{ localised(entry.headline) }}</h3>
                <p class="whats-new__summary">{{ summary(entry) }}</p>

                @if (entry.added.length) {
                  <section class="whats-new__group whats-new__group--added">
                    <span>{{ 'whatsNew.added' | transloco }}</span>
                    <ul>
                      @for (item of entry.added; track $index) {
                        <li>{{ localised(item) }}</li>
                      }
                    </ul>
                  </section>
                }

                @if (entry.improved.length) {
                  <section class="whats-new__group whats-new__group--improved">
                    <span>{{ 'whatsNew.improved' | transloco }}</span>
                    <ul>
                      @for (item of entry.improved; track $index) {
                        <li>{{ localised(item) }}</li>
                      }
                    </ul>
                  </section>
                }

                @if (entry.fixed.length) {
                  <section class="whats-new__group whats-new__group--fixed">
                    <span>{{ 'whatsNew.fixed' | transloco }}</span>
                    <ul>
                      @for (item of entry.fixed; track $index) {
                        <li>{{ localised(item) }}</li>
                      }
                    </ul>
                  </section>
                }
              </li>
            }
          </ol>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styleUrl: './whats-new-modal.component.scss',
})
export class WhatsNewModalComponent {
  @Input() public isOpen = false;
  @Output() public readonly dismiss = new EventEmitter<void>();

  public readonly titleIcon = sparklesOutline;
  public readonly closeIcon = closeOutline;

  public readonly entries = computed<readonly WhatsNewEntry[]>(() => WHATS_NEW_ENTRIES);

  public constructor(private readonly i18n: AppI18nService) {}

  public localised(bullet: { en: string; el: string }): string {
    return this.i18n.activeLanguage() === 'el' ? bullet.el : bullet.en;
  }

  public summary(entry: WhatsNewEntry): string {
    return this.i18n.activeLanguage() === 'el' ? entry.summaryEl : entry.summaryEn;
  }
}

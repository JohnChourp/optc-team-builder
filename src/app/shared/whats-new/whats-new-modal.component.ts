import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { IonIcon, IonModal } from '@ionic/angular';
import { IonButton } from '@ionic/angular/ion-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { TranslocoPipe } from '@jsverse/transloco';
import { closeOutline, sparklesOutline } from 'ionicons/icons';

import { APP_VERSION } from '../../core/data/app-version.data';
import { WHATS_NEW_ENTRIES, type WhatsNewEntry } from '../../core/data/whats-new.data';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { PreferencesAdapterService } from '../../core/services/preferences-adapter.service';
import { partitionWhatsNewEntries } from './whats-new-partition.utils';

/**
 * The version the reader last had this modal open on.
 *
 * `transient-ui-state`: losing it costs them one extra scroll, and it is about this
 * device rather than their work, so it is deliberately not in the export payload.
 */
const WHATS_NEW_LAST_SEEN_VERSION_KEY = 'whatsNewLastSeenVersion';

/**
 * Every release, newest first, in the words a player understands.
 *
 * A modal rather than a route on purpose: this is something you glance at and
 * dismiss, not a destination anyone links to.
 *
 * 869f13gaq split the one unbounded list into three. It had reached 201 entries and
 * grows by 4.7 a day from the nightly upstream-data chain, so "keep scrolling until
 * you reach one you recognise" had stopped being a plan. Now: everything since the
 * version you last had open, then the five most recent, then the rest behind one
 * step. Nothing is dropped and every version back to 0.0.1 is still reachable - the
 * rule that the history is permanent is untouched, only the reading changed.
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
      (didDismiss)="onDismiss()"
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
                (click)="onDismiss()"
              >
                <ion-icon slot="icon-only" [icon]="closeIcon" aria-hidden="true"></ion-icon>
              </ion-button>
            </ion-buttons>
          </header>

          @if (unseen().length) {
            <p class="whats-new__divider" data-test="whats-new-unseen-divider">
              {{ 'whatsNew.sinceLastOpened' | transloco: { count: unseen().length } }}
            </p>

            <ol class="whats-new__list">
              @for (entry of unseen(); track entry.version) {
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
          }

          @if (recent().length) {
            @if (unseen().length) {
              <p class="whats-new__divider whats-new__divider--quiet">{{ 'whatsNew.earlier' | transloco }}</p>
            }

            <ol class="whats-new__list">
              @for (entry of recent(); track entry.version) {
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
          }

          @if (older().length) {
            @if (!showOlder()) {
              <button
                type="button"
                class="whats-new__more"
                data-test="whats-new-show-older"
                [attr.aria-expanded]="false"
                (click)="revealOlder()"
              >
                {{ 'whatsNew.showOlder' | transloco: { count: older().length } }}
              </button>
            } @else {
              <ol class="whats-new__list" data-test="whats-new-older-list">
                @for (entry of older(); track entry.version) {
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
            }
          }
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

  private readonly preferences = inject(PreferencesAdapterService);

  public readonly entries = computed<readonly WhatsNewEntry[]>(() => WHATS_NEW_ENTRIES);

  private readonly lastSeenVersion = signal<string | null>(null);
  public readonly showOlder = signal(false);

  private readonly partition = computed(() =>
    partitionWhatsNewEntries(this.entries(), this.lastSeenVersion()),
  );

  public readonly unseen = computed(() => this.partition().unseen);
  public readonly recent = computed(() => this.partition().recent);
  public readonly older = computed(() => this.partition().older);

  public constructor(private readonly i18n: AppI18nService) {
    void this.restoreLastSeenVersion();
  }

  public onDismiss(): void {
    void this.markSeen();
    this.dismiss.emit();
  }

  public revealOlder(): void {
    this.showOlder.set(true);
  }

  /*
   * Read once, at construction, and deliberately NOT re-read when the modal opens:
   * the divider has to keep saying "since you last looked" for the whole visit. The
   * new version is written on dismissal instead, so the next open is measured from
   * this one.
   */
  private async restoreLastSeenVersion(): Promise<void> {
    try {
      const stored = await this.preferences.get({ key: WHATS_NEW_LAST_SEEN_VERSION_KEY });

      this.lastSeenVersion.set(stored.value ?? null);
    } catch {
      /*
       * Private mode, a quota, a browser blocking site data. Null means "never
       * opened", which shows the normal recent/older split with no divider - the
       * safe direction, because it hides nothing.
       */
    }
  }

  public async markSeen(): Promise<void> {
    try {
      await this.preferences.set({ key: WHATS_NEW_LAST_SEEN_VERSION_KEY, value: APP_VERSION });
    } catch {
      /* The divider reappearing next time is a smaller cost than a thrown dismissal. */
    }
  }

  public localised(bullet: { en: string; el: string }): string {
    return this.i18n.activeLanguage() === 'el' ? bullet.el : bullet.en;
  }

  public summary(entry: WhatsNewEntry): string {
    return this.i18n.activeLanguage() === 'el' ? entry.summaryEl : entry.summaryEn;
  }
}

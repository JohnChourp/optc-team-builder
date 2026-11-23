import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton } from '@ionic/angular/ion-button';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { TranslocoDirective } from '@jsverse/transloco';

import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { buildSupportFinder, type SupportFinderCharacter } from './character-support-finder.utils';

/** A list longer than this shows its first names and how many more there are. */
export const SUPPORT_FINDER_LIST_LIMIT = 30;

/**
 * 869f63gy0. "Who can support this character, and who can it support" on the Character screen,
 * for the whole catalogue or one of the reader's boxes. It reads every character's details, so it
 * waits for the reader to ask rather than slowing every visit to the page.
 */
@Component({
  selector: 'app-character-support-finder',
  standalone: true,
  imports: [IonButton, IonSpinner, NgTemplateOutlet, RouterLink, TranslocoDirective],
  templateUrl: './character-support-finder.component.html',
  styleUrl: './character-support-finder.component.scss',
})
export class CharacterSupportFinderComponent {
  public readonly character = input.required<CharacterDetailRecord>();
  public readonly opened = signal(false);
  public readonly loading = signal(false);
  public readonly failed = signal(false);
  public readonly catalog = signal<CharacterDetailRecord[] | null>(null);
  public readonly selectedBoxId = signal<string | null>(null);
  public readonly boxes;
  public readonly selectedBox = computed(
    () => this.boxes().find((box) => box.id === this.selectedBoxId()) ?? null,
  );
  public readonly result = computed(() => {
    const catalog = this.catalog();
    const box = this.selectedBox();

    return catalog
      ? buildSupportFinder(this.character(), catalog, box ? new Set(box.characterIds) : null)
      : null;
  });

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
  ) {
    this.boxes = this.userState.characterBoxes;
  }

  public async open(): Promise<void> {
    this.opened.set(true);

    if (this.catalog() || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.failed.set(false);

    try {
      // The boxes are a filter only: without them the finder still answers for the whole catalogue.
      const [catalog] = await Promise.all([
        this.repository.getDetailedCharacterCatalog(),
        this.userState.readyCharacterBoxes().catch(() => undefined),
      ]);

      this.catalog.set(catalog);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  public onBoxChange(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? 'all';

    this.selectedBoxId.set(value !== 'all' ? value : null);
  }

  public shown(list: readonly SupportFinderCharacter[]): readonly SupportFinderCharacter[] {
    return list.slice(0, SUPPORT_FINDER_LIST_LIMIT);
  }

  public hiddenCount(list: readonly SupportFinderCharacter[]): number {
    return Math.max(0, list.length - SUPPORT_FINDER_LIST_LIMIT);
  }
}

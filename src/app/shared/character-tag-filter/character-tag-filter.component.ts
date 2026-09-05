import {
  Component,
  EventEmitter,
  Input,
  type OnChanges,
  type OnInit,
  Output,
  type SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { funnelOutline } from 'ionicons/icons';

import { normalizeAbilityTagSetOperator } from '../../core/models/auto-team-builder-ability.models';
import { type CharacterTagSetSelection } from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  cloneCharacterTagSetSelection,
  countCharacterTagSetTags,
  countPopulatedCharacterTagSets,
  createEmptyCharacterTagSetSelection,
  resolveCharacterTagSetSelectionMatchingCharacterIds,
  type CharacterTagMatchIndex,
} from '../../core/services/character-tag-set.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { CharacterTagSetPickerComponent } from '../character-tag-set-picker/character-tag-set-picker.component';
import { CharacterTagFilterStylePanelsComponent } from './character-tag-filter-style-panels.component';

/** Emitted payload: the new selection plus the ids it resolves to, so no host ever touches the index. */
export interface CharacterTagFilterChange {
  readonly selection: CharacterTagSetSelection;
  /** `undefined` means "no filter"; `[]` means "nothing matches". Never conflate them. */
  readonly matchingCharacterIds: number[] | undefined;
}

/**
 * `idle` before the first open, `loading` while the detailed catalog resolves,
 * then `ready` or `unavailable`. The `loading` state is what removes the "dead
 * tap": the trigger reports work is happening instead of silently doing nothing.
 */
export type CharacterTagFilterStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface CharacterTagFilterChipView {
  readonly id: string;
  readonly label: string;
  readonly removeLabel: string;
}

@Component({
  selector: 'app-character-tag-filter',
  standalone: true,
  imports: [
    CharacterTagFilterStylePanelsComponent,
    CharacterTagSetPickerComponent,
    IonButton,
    IonIcon,
    IonSpinner,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './character-tag-filter.component.html',
  styleUrl: './character-tag-filter.component.scss',
})
export class CharacterTagFilterComponent implements OnChanges, OnInit {
  /** Host-owned source of truth. A host reset propagates here through `ngOnChanges`. */
  @Input({ required: true }) public selection: CharacterTagSetSelection =
    createEmptyCharacterTagSetSelection();

  /** Host name prefix for the trigger test id, e.g. `characters` -> `characters-character-tag-trigger`. */
  @Input({ required: true }) public testIdPrefix = '';

  /**
   * Mirrored into `disabledState` by `ngOnChanges` because `triggerDisabled` is a
   * `computed()`. A `computed()` only recomputes when a SIGNAL it read changes;
   * reading a plain `@Input` property inside one caches whatever that property
   * happened to hold on first evaluation. Hosts bind this to a load flag
   * (`[disabled]="loading()"`), which is true during the very first render, so
   * without the mirror the trigger latched disabled and never recovered — the
   * whole filter was unreachable on the Characters page.
   */
  @Input() public disabled = false;

  /** Optional modal-heading override. Hosts normally pass nothing. */
  @Input() public titleOverride = '';

  /**
   * Overrides the sentence the picker shows above its tag list. Left empty, the
   * picker inherits this wrapper's own `supportText()` - the same sentence
   * already rendered beside the trigger - so the modal explains AND/OR at the
   * moment the reader is actually choosing tags.
   *
   * That is what Captain Coverage has always done: it hosts this picker
   * directly and passes its own sentence in (captain-coverage.page.html:300).
   * Every host reached through this wrapper had a silent modal instead, purely
   * because the wrapper exposed no route to the picker's inputs.
   */
  @Input() public pickerSupportText = '';

  /** Pass-through to the picker's modal scope class. Empty leaves it unscoped. */
  @Input() public pickerModalScopeClass = '';

  @Output() public readonly filterChange = new EventEmitter<CharacterTagFilterChange>();

  public readonly pickerOpen = signal(false);
  public readonly availableTags = signal<string[]>([]);
  public readonly matchIndex = signal<CharacterTagMatchIndex | null>(null);
  public readonly status = signal<CharacterTagFilterStatus>('idle');
  /** Signal mirror of the `disabled` @Input — see the note on that property. */
  public readonly disabledState = signal(false);
  public readonly announcement = signal('');
  public readonly filterIcon = funnelOutline;

  public readonly workingSelection = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );

  public readonly hasSelection = computed(
    () => countPopulatedCharacterTagSets(this.workingSelection()) > 0,
  );

  public readonly chips = computed<CharacterTagFilterChipView[]>(() =>
    this.workingSelection()
      .sets.filter((set) => set.tags.length > 0)
      .map((set) => {
        // The joiner padding lives here, never inside the JSON: a translator
        // cannot then glue two tags together by trimming their value.
        const joiner = this.t(`joiners.${normalizeAbilityTagSetOperator(set.operator)}`);
        const label = set.tags.join(` ${joiner} `);

        return {
          id: set.id,
          label,
          removeLabel: this.t('removeGroup', { group: label }),
        } satisfies CharacterTagFilterChipView;
      }),
  );

  public readonly triggerLabel = computed(() => {
    if (this.status() === 'loading') {
      return this.t('trigger.loading');
    }

    const selection = this.workingSelection();

    return countPopulatedCharacterTagSets(selection) > 0
      ? this.t('trigger.active', {
          tags: countCharacterTagSetTags(selection),
          groups: countPopulatedCharacterTagSets(selection),
        })
      : this.t('trigger.empty');
  });

  public readonly supportText = computed(() => {
    if (this.status() === 'unavailable') {
      return this.t('support.unavailable');
    }

    const selection = this.workingSelection();

    if (countPopulatedCharacterTagSets(selection) < 2) {
      return this.t('support.empty');
    }

    return this.t(`support.${normalizeAbilityTagSetOperator(selection.operator)}`);
  });

  public readonly triggerDisabled = computed(
    () => this.disabledState() || this.status() === 'loading' || this.status() === 'unavailable',
  );

  /** Last ids handed to the host, so a refreshed index only re-emits on a real change. */
  private lastEmittedIds: number[] | undefined;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
  ) {}

  public async ngOnInit(): Promise<void> {
    // Warm the shell's own scope and the modal's scope so nothing renders a raw
    // key. Cheap: two small JSON fetches, no detailed-catalog load.
    await Promise.all([
      this.i18n.preloadScope('character-tag-filter'),
      this.i18n.preloadScope('character-tag-sets'),
    ]);
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['disabled']) {
      this.disabledState.set(this.disabled);
    }

    if (changes['selection']) {
      // The host is the source of truth. This is what makes a host reset
      // visibly clear the chips and the trigger label.
      this.workingSelection.set(cloneCharacterTagSetSelection(this.selection));
    }
  }

  public async openPicker(): Promise<void> {
    if (this.triggerDisabled()) {
      return;
    }

    await this.ensureTagCatalog();

    if (this.status() !== 'ready') {
      // The support line now reads `support.unavailable` and the trigger is
      // disabled, so the tap produced visible feedback rather than nothing.
      return;
    }

    this.pickerOpen.set(true);
  }

  public closePicker(): void {
    this.pickerOpen.set(false);
  }

  public savePicker(selection: CharacterTagSetSelection): void {
    this.applySelection(cloneCharacterTagSetSelection(selection));
    this.pickerOpen.set(false);
  }

  public removeSet(setId: string): void {
    const selection = this.workingSelection();

    this.applySelection({
      operator: selection.operator,
      sets: selection.sets.filter((set) => set.id !== setId),
    });
  }

  public clear(): void {
    this.applySelection(createEmptyCharacterTagSetSelection());
  }

  /**
   * Runs on EVERY open: both repository calls are memoised per character-override
   * revision, so a repeat open is free and always fresh after a character edit.
   *
   * The `typeof … === 'function'` guards and the `try/catch` are mandatory —
   * every host page spec supplies a partial `OptcRepositoryService` fake, and a
   * shell that throws there would take the whole host down.
   */
  private async ensureTagCatalog(): Promise<void> {
    this.status.set('loading');

    try {
      const [tags, index] = await Promise.all([
        typeof this.repository.getAvailableCharacterTags === 'function'
          ? this.repository.getAvailableCharacterTags()
          : Promise.resolve<string[]>([]),
        typeof this.repository.getCharacterTagMatchIndex === 'function'
          ? this.repository.getCharacterTagMatchIndex()
          : Promise.resolve<CharacterTagMatchIndex | null>(null),
      ]);

      this.availableTags.set(tags);
      this.matchIndex.set(index);
      this.status.set(tags.length > 0 && index !== null ? 'ready' : 'unavailable');
    } catch {
      this.availableTags.set([]);
      this.matchIndex.set(null);
      /*
       * Back to `idle`, NOT `unavailable`. `unavailable` disables the trigger
       * permanently, which is the right answer for a catalog that genuinely
       * carries no tags but a dead end for a transient failure (a storage hiccup,
       * an interrupted first load) — the filter would stay unreachable for the
       * rest of the session with no way to retry. `idle` re-enables the trigger
       * so the next tap tries again; both repository calls are memoised per
       * override revision, so a successful retry is still only one catalog pass.
       */
      this.status.set('idle');
      return;
    }

    this.syncResolvedIds();
  }

  /** Closes the staleness window: a refreshed index re-resolves an active filter. */
  private syncResolvedIds(): void {
    if (!this.hasSelection()) {
      return;
    }

    const next = resolveCharacterTagSetSelectionMatchingCharacterIds(
      this.workingSelection(),
      this.matchIndex(),
    );

    if (sameIdList(next, this.lastEmittedIds)) {
      return;
    }

    this.lastEmittedIds = next;
    this.filterChange.emit({
      selection: this.workingSelection(),
      matchingCharacterIds: next,
    });
  }

  /** The single write path: every mutation resolves, announces and emits here. */
  private applySelection(selection: CharacterTagSetSelection): void {
    this.workingSelection.set(selection);

    const matchingCharacterIds = resolveCharacterTagSetSelectionMatchingCharacterIds(
      selection,
      this.matchIndex(),
    );

    this.lastEmittedIds = matchingCharacterIds;
    this.announcement.set(
      countPopulatedCharacterTagSets(selection) > 0
        ? this.t('a11y.applied', {
            tags: countCharacterTagSetTags(selection),
            groups: countPopulatedCharacterTagSets(selection),
          })
        : this.t('a11y.cleared'),
    );
    this.filterChange.emit({ selection, matchingCharacterIds });
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, params, 'character-tag-filter');
  }
}

/** `undefined` (no filter) and `[]` (nothing matches) are deliberately different. */
function sameIdList(left: number[] | undefined, right: number[] | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  return left.length === right.length && left.every((id, index) => id === right[index]);
}

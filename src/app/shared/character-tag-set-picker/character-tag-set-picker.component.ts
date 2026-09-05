import {
  Component,
  EventEmitter,
  Input,
  type OnChanges,
  type OnDestroy,
  Output,
  type SimpleChanges,
  computed,
  signal,
} from '@angular/core';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonSearchbar,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addOutline, closeOutline, funnelOutline, swapHorizontalOutline } from 'ionicons/icons';

import {
  normalizeAbilityTagSetOperator,
  type AbilityTagSetOperator,
} from '../../core/models/auto-team-builder-ability.models';
import { type CharacterTagSet, type CharacterTagSetSelection } from '../../core/models/optc.models';
import {
  MAX_CHARACTER_TAG_SETS,
  cloneCharacterTagSetSelection,
  countCharacterTagSetTags,
  createCharacterTagSet,
  createEmptyCharacterTagSetSelection,
  isOverCharacterTagSetCap,
  type CharacterTagMatchIndex,
} from '../../core/services/character-tag-set.utils';
import { applyIonicModalDialogLabel } from '../a11y/ionic-modal-dialog-label.utils';
import { AbilityTagSetPickerStylePanelsComponent } from '../ability-tag-set-picker/ability-tag-set-picker-style-panels.component';

/**
 * Optional host-supplied index of `tag -> character ids that carry it`.
 *
 * Keys are matched case-insensitively, mirroring how character tags compare
 * everywhere else. Hosts that cannot afford to build it pass `null` and the
 * picker hides every count instead of rendering a zero it cannot stand behind.
 *
 * Re-exported from `character-tag-set.utils` rather than declared here: the
 * same index now also feeds the id-set resolver in core, and core must not
 * import from shared. Existing import sites keep working unchanged.
 */
export { type CharacterTagMatchIndex } from '../../core/services/character-tag-set.utils';

interface CatalogTileView {
  tag: string;
  badge: string;
  matchCount: number | null;
  memberSetIndexes: number[];
  inActiveSet: boolean;
}

interface TagChipView {
  tag: string;
  badge: string;
}

interface SetCardView {
  set: CharacterTagSet;
  index: number;
  chips: TagChipView[];
  matchCount: number | null;
  /** Match count each operator WOULD produce, so the user picks by outcome. */
  anyCount: number | null;
  allCount: number | null;
  isActive: boolean;
  showsOperator: boolean;
  isNullifying: boolean;
}

const CARD_LEAVE_MS = 180;

@Component({
  selector: 'app-character-tag-set-picker',
  standalone: true,
  imports: [
    AbilityTagSetPickerStylePanelsComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonModal,
    IonSearchbar,
    IonToolbar,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './character-tag-set-picker.component.html',
  styleUrl: './character-tag-set-picker.component.scss',
})
export class CharacterTagSetPickerComponent implements OnChanges, OnDestroy {
  private dismissReason: 'save' | 'cancel' | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  @Input({ required: true }) public isOpen = false;
  /** Flat, host-ordered catalog of the tags characters actually carry. */
  @Input({ required: true }) public availableTags: string[] = [];
  @Input({ required: true }) public selection: CharacterTagSetSelection =
    createEmptyCharacterTagSetSelection();
  @Input() public title = '';
  @Input() public maxSets = MAX_CHARACTER_TAG_SETS;
  /**
   * Hosts whose engine cannot express "any set may match" lock the cross-set
   * operator to `all` and explain why, instead of offering a control that lies.
   */
  @Input() public allowSelectionOperator = true;
  @Input() public tagCharacterIds: CharacterTagMatchIndex | null = null;
  /**
   * The host's own one-line explanation of what this filter does. Hosts that
   * used to print it on the page pass it here instead, so the sentence lives
   * next to the control it describes. Empty renders nothing.
   */
  @Input() public supportText = '';

  /**
   * Extra class beside the picker's own modal class, so a host can scope rules
   * to its own instance. The sibling ability picker has had this since
   * 869etpmp3; this one hardcoded its class, which is why the short-viewport
   * rule that keeps a support paragraph from eating the catalog could be
   * written for Captain Coverage's ability modal and for no host of this one.
   * Empty by default, so every existing host renders the same markup as before.
   */
  @Input() public modalScopeClass = '';

  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveSelection = new EventEmitter<CharacterTagSetSelection>();

  /** Extra class the host asked for, kept beside the picker's own modal class. */
  public modalCssClass(): string {
    return this.modalScopeClass
      ? `character-tag-set-picker-modal ${this.modalScopeClass}`
      : 'character-tag-set-picker-modal';
  }

  public readonly closeIcon = closeOutline;
  public readonly pickerIcon = funnelOutline;
  public readonly addIcon = addOutline;
  public readonly swapIcon = swapHorizontalOutline;
  public readonly operators: AbilityTagSetOperator[] = ['any', 'all'];

  public readonly searchTerm = signal('');
  public readonly workingSelection = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );
  public readonly availableTagsState = signal<string[]>([]);
  public readonly matchIndexState = signal<CharacterTagMatchIndex | null>(null);
  public readonly activeSetId = signal<string | null>(null);
  public readonly leavingSetId = signal<string | null>(null);
  public readonly isCatalogOpen = signal(false);
  /** Short delta sentences for the polite live region, never the whole formula. */
  public readonly liveAnnouncement = signal<{
    key: string;
    params: Record<string, string | number>;
  } | null>(null);

  /** Case-folded lookup, built once per index so per-tile counts stay cheap. */
  private readonly matchIndex = computed<Map<string, ReadonlySet<number>> | null>(() => {
    const source = this.matchIndexState();

    if (!source) {
      return null;
    }

    const index = new Map<string, Set<number>>();

    for (const [tag, characterIds] of source) {
      const key = normalizeTagKey(tag);

      if (!key.length) {
        continue;
      }

      const bucket = index.get(key) ?? new Set<number>();

      for (const characterId of characterIds) {
        bucket.add(characterId);
      }

      index.set(key, bucket);
    }

    return index;
  });

  public readonly hasMatchCounts = computed(() => this.matchIndex() !== null);

  public readonly catalogTags = computed(() => dedupeTags(this.availableTagsState()));

  public readonly selectionOperator = computed(() =>
    this.allowSelectionOperator
      ? normalizeAbilityTagSetOperator(this.workingSelection().operator)
      : 'all',
  );
  public readonly populatedSets = computed(() =>
    this.workingSelection().sets.filter((set) => set.tags.length > 0),
  );
  public readonly totalTagCount = computed(() => countCharacterTagSetTags(this.workingSelection()));
  /**
   * `null` whenever there is nothing honest to report: no host index, or no
   * populated set yet. The formula's empty clause already says "every
   * character", so pairing it with "0 characters match" would contradict it.
   */
  public readonly totalMatchCount = computed<number | null>(() => {
    const populatedSets = this.populatedSets();

    if (!this.hasMatchCounts() || !populatedSets.length) {
      return null;
    }

    const setIdSets = populatedSets.map<ReadonlySet<number>>(
      (set) =>
        this.resolveSetIds(set, normalizeAbilityTagSetOperator(set.operator)) ?? new Set<number>(),
    );

    return combineIdSets(setIdSets, this.selectionOperator()).size;
  });
  public readonly isOverCap = computed(() => isOverCharacterTagSetCap(this.workingSelection()));
  public readonly activeSetIndex = computed(
    () => this.workingSelection().sets.findIndex((set) => set.id === this.activeSetId()) + 1,
  );
  public readonly canAddSet = computed(() => this.workingSelection().sets.length < this.maxSets);

  public readonly setCards = computed<SetCardView[]>(() =>
    this.workingSelection().sets.map((set, index) => {
      const hasCounts = this.hasMatchCounts();
      const anyCount =
        hasCounts && set.tags.length > 1 ? (this.resolveSetIds(set, 'any')?.size ?? 0) : null;
      const allCount =
        hasCounts && set.tags.length > 1 ? (this.resolveSetIds(set, 'all')?.size ?? 0) : null;
      const matchCount =
        hasCounts && set.tags.length
          ? (this.resolveSetIds(set, normalizeAbilityTagSetOperator(set.operator))?.size ?? 0)
          : null;

      return {
        set,
        index: index + 1,
        chips: set.tags.map((tag) => this.buildChip(tag)),
        matchCount,
        anyCount,
        allCount,
        isActive: this.activeSetId() === set.id,
        // With one tag the operator is a no-op, so offering it would be a lie.
        showsOperator: set.tags.length > 1,
        isNullifying:
          matchCount === 0 &&
          set.tags.length > 0 &&
          normalizeAbilityTagSetOperator(set.operator) === 'all',
      } satisfies SetCardView;
    }),
  );

  /** The bracketed clauses of the living formula, one per populated set. */
  public readonly formulaClauses = computed(() =>
    this.setCards()
      .filter((card) => card.set.tags.length > 0)
      .map((card) => ({
        setId: card.set.id,
        index: card.index,
        operator: normalizeAbilityTagSetOperator(card.set.operator),
        labels: card.chips.map((chip) => chip.tag),
      })),
  );

  public readonly filteredTags = computed<CatalogTileView[]>(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const activeSet = this.activeSet();
    const activeKeys = new Set((activeSet?.tags ?? []).map((tag) => normalizeTagKey(tag)));
    const memberIndexes = this.tagSetIndexes();

    return this.catalogTags()
      .filter((tag) => !searchTerm.length || tag.toLowerCase().includes(searchTerm))
      .map((tag) => {
        const key = normalizeTagKey(tag);

        return {
          tag,
          badge: resolveBadge(tag),
          matchCount: this.matchIndex()?.get(key)?.size ?? null,
          memberSetIndexes: memberIndexes.get(key) ?? [],
          inActiveSet: activeKeys.has(key),
        } satisfies CatalogTileView;
      });
  });

  public labelModalDialog(event: Event, label: string): void {
    applyIonicModalDialogLabel(event, label);
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['availableTags']) {
      this.availableTagsState.set(this.availableTags);
    }

    if (changes['tagCharacterIds']) {
      this.matchIndexState.set(this.tagCharacterIds);
    }

    if (changes['isOpen'] && this.isOpen) {
      this.dismissReason = null;
      this.searchTerm.set('');
      this.liveAnnouncement.set(null);
      this.leavingSetId.set(null);
      this.isCatalogOpen.set(false);

      const cloned = cloneCharacterTagSetSelection(this.selection);
      this.workingSelection.set(cloned);
      this.activeSetId.set(cloned.sets[0]?.id ?? null);
    }
  }

  public ngOnDestroy(): void {
    this.clearLeaveTimer();
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  /** Enter in the searchbar drops the top hit into the active set. */
  public onSearchEnter(): void {
    const firstTile = this.filteredTags()[0];

    if (firstTile) {
      this.toggleTag(firstTile.tag);
    }
  }

  public addSet(): void {
    if (!this.canAddSet()) {
      return;
    }

    // Character tags are mostly-disjoint crew/family groupings, so an AND
    // across two of them is almost always empty: a new set starts as `any`.
    const set = createCharacterTagSet([], 'any');

    this.workingSelection.update((selection) => ({
      ...selection,
      sets: [...selection.sets, set],
    }));
    this.activeSetId.set(set.id);
    this.isCatalogOpen.set(true);
    this.announce('sets.added', { index: this.workingSelection().sets.length });
  }

  public removeSet(setId: string): void {
    this.clearLeaveTimer();
    this.leavingSetId.set(setId);

    const commit = (): void => {
      this.leavingSetId.set(null);
      this.workingSelection.update((selection) => ({
        ...selection,
        sets: selection.sets.filter((set) => set.id !== setId),
      }));

      if (this.activeSetId() === setId) {
        this.activeSetId.set(this.workingSelection().sets[0]?.id ?? null);
      }
    };

    // CSS cannot shorten a setTimeout, so reduced motion is handled here too.
    if (this.prefersReducedMotion()) {
      commit();
      return;
    }

    this.leaveTimer = setTimeout(commit, CARD_LEAVE_MS);
  }

  public activateSet(setId: string): void {
    this.activeSetId.set(setId);
  }

  public openCatalogFor(setId: string): void {
    this.activateSet(setId);
    this.isCatalogOpen.set(true);
  }

  public closeCatalog(): void {
    this.isCatalogOpen.set(false);
  }

  public setSetOperator(setId: string, operator: AbilityTagSetOperator): void {
    this.workingSelection.update((selection) => ({
      ...selection,
      sets: selection.sets.map((set) =>
        set.id === setId ? { ...set, operator: normalizeAbilityTagSetOperator(operator) } : set,
      ),
    }));
    this.announceWithCount(`sets.operator.announced.${operator}`, {
      index: this.indexOfSet(setId),
    });
  }

  public toggleSelectionOperator(): void {
    if (!this.allowSelectionOperator) {
      return;
    }

    const next: AbilityTagSetOperator = this.selectionOperator() === 'all' ? 'any' : 'all';

    this.workingSelection.update((selection) => ({ ...selection, operator: next }));
    this.announceWithCount(`selection.announced.${next}`, {});
  }

  /**
   * Adds or removes one catalog tag from the active set.
   *
   * Membership is decided on the case-folded value so a persisted
   * `"straw hat pirates"` is recognised as the catalog's
   * `"Straw Hat Pirates"` rather than added a second time, while the value
   * already stored keeps the exact case the user's data has.
   */
  public toggleTag(tag: string): void {
    const targetSet = this.activeSet() ?? this.ensureSet();

    if (!targetSet) {
      return;
    }

    const key = normalizeTagKey(tag);
    const alreadyPresent = targetSet.tags.some((setTag) => normalizeTagKey(setTag) === key);

    this.workingSelection.update((selection) => ({
      ...selection,
      sets: selection.sets.map((set) =>
        set.id !== targetSet.id
          ? set
          : {
              ...set,
              tags: alreadyPresent
                ? set.tags.filter((setTag) => normalizeTagKey(setTag) !== key)
                : [...set.tags, tag],
            },
      ),
    }));

    this.announceWithCount(alreadyPresent ? 'chips.removed' : 'chips.added', {
      label: tag,
      index: this.indexOfSet(targetSet.id),
    });
  }

  public removeTag(setId: string, tag: string): void {
    const key = normalizeTagKey(tag);

    this.workingSelection.update((selection) => ({
      ...selection,
      sets: selection.sets.map((set) =>
        set.id !== setId
          ? set
          : { ...set, tags: set.tags.filter((setTag) => normalizeTagKey(setTag) !== key) },
      ),
    }));

    this.announceWithCount('chips.removed', { label: tag, index: this.indexOfSet(setId) });
  }

  public clearAll(): void {
    this.clearLeaveTimer();
    this.leavingSetId.set(null);
    this.workingSelection.set(createEmptyCharacterTagSetSelection());
    this.activeSetId.set(null);
    this.announce('actions.clearedAll', {});
  }

  public save(): void {
    this.dismissReason = 'save';
    this.saveSelection.emit(
      cloneCharacterTagSetSelection({
        ...this.workingSelection(),
        operator: this.selectionOperator(),
        // A half-built set filters nothing, so it never reaches the host.
        sets: this.workingSelection().sets.filter((set) => set.tags.length > 0),
      }),
    );
  }

  public cancel(): void {
    this.dismissReason = 'cancel';
    this.dismiss.emit();
  }

  public onModalDidDismiss(): void {
    this.clearLeaveTimer();

    if (this.dismissReason !== null) {
      this.dismissReason = null;
      return;
    }

    this.dismiss.emit();
  }

  private activeSet(): CharacterTagSet | null {
    const activeSetId = this.activeSetId();

    return this.workingSelection().sets.find((set) => set.id === activeSetId) ?? null;
  }

  private ensureSet(): CharacterTagSet | null {
    if (!this.canAddSet()) {
      return null;
    }

    this.addSet();

    return this.activeSet();
  }

  private indexOfSet(setId: string): number {
    return this.workingSelection().sets.findIndex((set) => set.id === setId) + 1;
  }

  private tagSetIndexes(): Map<string, number[]> {
    const indexes = new Map<string, number[]>();

    this.workingSelection().sets.forEach((set, index) => {
      for (const tag of set.tags) {
        const key = normalizeTagKey(tag);
        const current = indexes.get(key) ?? [];
        current.push(index + 1);
        indexes.set(key, current);
      }
    });

    return indexes;
  }

  private resolveSetIds(
    set: CharacterTagSet,
    operator: AbilityTagSetOperator,
  ): ReadonlySet<number> | null {
    const index = this.matchIndex();

    if (!index) {
      return null;
    }

    const tagIdSets = set.tags
      .map((tag) => normalizeTagKey(tag))
      .filter((key) => key.length > 0)
      .map((key) => index.get(key) ?? new Set<number>());

    return combineIdSets(tagIdSets, operator);
  }

  private buildChip(tag: string): TagChipView {
    return { tag, badge: resolveBadge(tag) };
  }

  private announce(key: string, params: Record<string, string | number>): void {
    this.liveAnnouncement.set({ key, params });
  }

  /**
   * Counts are optional, so the sentence with the tally and the sentence
   * without it are separate keys rather than one string with an empty slot.
   */
  private announceWithCount(key: string, params: Record<string, string | number>): void {
    const count = this.totalMatchCount();

    if (count === null) {
      this.announce(`${key}NoCount`, params);
      return;
    }

    this.announce(key, { ...params, count });
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof globalThis.matchMedia === 'function' &&
      globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private clearLeaveTimer(): void {
    if (this.leaveTimer !== null) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
  }
}

/** `any` unions the buckets, `all` intersects them; no buckets means no ids. */
function combineIdSets(
  idSets: readonly ReadonlySet<number>[],
  operator: AbilityTagSetOperator,
): ReadonlySet<number> {
  if (!idSets.length) {
    return new Set<number>();
  }

  if (operator === 'any') {
    const union = new Set<number>();

    for (const idSet of idSets) {
      for (const id of idSet) {
        union.add(id);
      }
    }

    return union;
  }

  const [first, ...rest] = idSets;
  let intersection = new Set<number>(first);

  for (const idSet of rest) {
    intersection = new Set<number>([...intersection].filter((id) => idSet.has(id)));
  }

  return intersection;
}

/** Trims and drops blanks, de-duplicating on the exact (case-preserved) value. */
function dedupeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const normalizedTag = typeof tag === 'string' ? tag.trim() : '';

    if (!normalizedTag.length || seen.has(normalizedTag)) {
      continue;
    }

    seen.add(normalizedTag);
    result.push(normalizedTag);
  }

  return result;
}

/** Match key only — never persisted, so displayed tags keep their case. */
function normalizeTagKey(tag: string): string {
  return typeof tag === 'string' ? tag.trim().toLowerCase() : '';
}

function resolveBadge(label: string): string {
  return label
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

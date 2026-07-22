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
  MAX_ABILITY_FILTER_TAG_SETS,
  normalizeAbilityTagSetOperator,
  type AbilityFilterTagSet,
  type AbilityFilterTagSetSelection,
  type AbilityTagSetOperator,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import {
  cloneAbilityFilterTagSetSelection,
  countTagSetRequirements,
  createAbilityFilterTagSet,
  createEmptyAbilityFilterTagSetSelection,
  isOverAbilityTagSetCap,
  resolveTagSetMatchingCharacterIds,
  resolveTagSetSelectionMatchingCharacterIds,
} from '../../core/services/ability-filter-tag-set.utils';
import { isCaptainAbilityRequirement } from '../../core/services/special-ability-filter.utils';
import { applyIonicModalDialogLabel } from '../a11y/ionic-modal-dialog-label.utils';
import { AbilityTagSetPickerStylePanelsComponent } from './ability-tag-set-picker-style-panels.component';

/** One catalog grouping the host chooses to expose, in rail order. */
export interface AbilityTagSetPickerSection {
  category: string;
  label: string;
  items: AutoBuildAbilityCatalogItem[];
  /** Adds `sourceScope: 'captainAbility'` + `slotScope: 'leader'` to picked tags. */
  captainAbility?: boolean;
}

interface CatalogTileView {
  item: AutoBuildAbilityCatalogItem;
  badge: string;
  memberSetIndexes: number[];
  inActiveSet: boolean;
  /**
   * Whether this tile is rendered under the captain-ability section. The same
   * ability key can appear in BOTH the captain section and its category section
   * (e.g. "Enemy Damage Reduction" is captain- and special-sourced), so every
   * selection/highlight identity is keyed on (abilityKey, captain-scope), never
   * on the bare key — otherwise one click would light the tile in both sections
   * and force the requirement to captain scope regardless of where it was picked.
   */
  isCaptainScope: boolean;
}

interface CatalogSectionView {
  key: string;
  label: string;
  tiles: CatalogTileView[];
}

interface TagChipView {
  requirement: AutoBuildAbilityRequirement;
  label: string;
  badge: string;
}

interface SetCardView {
  set: AbilityFilterTagSet;
  index: number;
  chips: TagChipView[];
  matchCount: number;
  /** Match count each operator WOULD produce, so the user picks by outcome. */
  anyCount: number;
  allCount: number;
  isActive: boolean;
  showsOperator: boolean;
  isNullifying: boolean;
}

const CARD_LEAVE_MS = 180;

@Component({
  selector: 'app-ability-tag-set-picker',
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
  templateUrl: './ability-tag-set-picker.component.html',
  styleUrl: './ability-tag-set-picker.component.scss',
})
export class AbilityTagSetPickerComponent implements OnChanges, OnDestroy {
  private dismissReason: 'save' | 'cancel' | null = null;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  @Input({ required: true }) public isOpen = false;
  @Input({ required: true }) public sections: AbilityTagSetPickerSection[] = [];
  @Input({ required: true }) public selection: AbilityFilterTagSetSelection =
    createEmptyAbilityFilterTagSetSelection();
  @Input() public title = '';
  @Input() public maxSets = MAX_ABILITY_FILTER_TAG_SETS;
  /**
   * Hosts whose engine cannot express "any set may match" lock the cross-set
   * operator to `all` and explain why, instead of offering a control that lies.
   */
  @Input() public allowSelectionOperator = true;

  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveSelection = new EventEmitter<AbilityFilterTagSetSelection>();

  public readonly closeIcon = closeOutline;
  public readonly pickerIcon = funnelOutline;
  public readonly addIcon = addOutline;
  public readonly swapIcon = swapHorizontalOutline;
  public readonly operators: AbilityTagSetOperator[] = ['any', 'all'];

  public readonly searchTerm = signal('');
  public readonly workingSelection = signal<AbilityFilterTagSetSelection>(
    createEmptyAbilityFilterTagSetSelection(),
  );
  public readonly sectionsState = signal<AbilityTagSetPickerSection[]>([]);
  public readonly activeSetId = signal<string | null>(null);
  public readonly leavingSetId = signal<string | null>(null);
  public readonly isCatalogOpen = signal(false);
  /** Short delta sentences for the polite live region, never the whole formula. */
  public readonly liveAnnouncement = signal<{
    key: string;
    params: Record<string, string | number>;
  } | null>(null);

  private readonly catalogItems = computed<AutoBuildAbilityCatalogItem[]>(() =>
    this.sectionsState().flatMap((section) => section.items),
  );
  private readonly catalogMap = computed(
    () => new Map(this.catalogItems().map((item) => [item.key, item] as const)),
  );
  public readonly selectionOperator = computed(() =>
    this.allowSelectionOperator
      ? normalizeAbilityTagSetOperator(this.workingSelection().operator)
      : 'all',
  );
  public readonly populatedSets = computed(() =>
    this.workingSelection().sets.filter((set) => set.requirements.length > 0),
  );
  public readonly totalRequirementCount = computed(() =>
    countTagSetRequirements(this.workingSelection()),
  );
  public readonly totalMatchCount = computed(
    () =>
      resolveTagSetSelectionMatchingCharacterIds(
        { ...this.workingSelection(), operator: this.selectionOperator() },
        this.catalogItems(),
      )?.length ?? 0,
  );
  public readonly isOverCap = computed(() => isOverAbilityTagSetCap(this.workingSelection()));
  public readonly activeSetIndex = computed(
    () => this.workingSelection().sets.findIndex((set) => set.id === this.activeSetId()) + 1,
  );
  public readonly canAddSet = computed(() => this.workingSelection().sets.length < this.maxSets);

  public readonly setCards = computed<SetCardView[]>(() =>
    this.workingSelection().sets.map((set, index) => {
      const anyCount =
        set.requirements.length > 1
          ? resolveTagSetMatchingCharacterIds({ ...set, operator: 'any' }, this.catalogItems())
              .length
          : 0;
      const allCount =
        set.requirements.length > 1
          ? resolveTagSetMatchingCharacterIds({ ...set, operator: 'all' }, this.catalogItems())
              .length
          : 0;
      const matchCount = set.requirements.length
        ? resolveTagSetMatchingCharacterIds(set, this.catalogItems()).length
        : 0;

      return {
        set,
        index: index + 1,
        chips: set.requirements.map((requirement) => this.buildChip(requirement)),
        matchCount,
        anyCount,
        allCount,
        isActive: this.activeSetId() === set.id,
        // With one tag the operator is a no-op, so offering it would be a lie.
        showsOperator: set.requirements.length > 1,
        isNullifying:
          matchCount === 0 &&
          set.requirements.length > 0 &&
          normalizeAbilityTagSetOperator(set.operator) === 'all',
      } satisfies SetCardView;
    }),
  );

  /** The bracketed clauses of the living formula, one per populated set. */
  public readonly formulaClauses = computed(() =>
    this.setCards()
      .filter((card) => card.set.requirements.length > 0)
      .map((card) => ({
        setId: card.set.id,
        index: card.index,
        operator: normalizeAbilityTagSetOperator(card.set.operator),
        labels: card.chips.map((chip) => chip.label),
      })),
  );

  public readonly filteredSections = computed<CatalogSectionView[]>(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const activeSet = this.activeSet();
    const memberIndexes = this.requirementSetIndexes();

    return this.sectionsState()
      .map((section) => {
        const isCaptainScope = Boolean(section.captainAbility);

        return {
          key: section.category,
          label: section.label,
          tiles: section.items
            .filter((item) => {
              if (!searchTerm.length) {
                return true;
              }

              return [item.label, item.key, item.groupLabel ?? '']
                .join(' ')
                .toLowerCase()
                .includes(searchTerm);
            })
            .map((item) => ({
              item,
              badge: this.resolveBadge(item.label),
              isCaptainScope,
              memberSetIndexes:
                memberIndexes.get(this.tileMembershipKey(item.key, isCaptainScope)) ?? [],
              inActiveSet: Boolean(
                activeSet?.requirements.some(
                  (requirement) =>
                    requirement.abilityKey === item.key &&
                    isCaptainAbilityRequirement(requirement) === isCaptainScope,
                ),
              ),
            })),
        };
      })
      .filter((section) => section.tiles.length > 0);
  });

  public labelModalDialog(event: Event, label: string): void {
    applyIonicModalDialogLabel(event, label);
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['sections']) {
      this.sectionsState.set(this.sections);
    }

    if (changes['isOpen'] && this.isOpen) {
      this.dismissReason = null;
      this.searchTerm.set('');
      this.liveAnnouncement.set(null);
      this.leavingSetId.set(null);
      this.isCatalogOpen.set(false);

      const cloned = cloneAbilityFilterTagSetSelection(this.selection);
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
    const firstTile = this.filteredSections()[0]?.tiles[0];

    if (firstTile) {
      this.toggleCatalogItem(firstTile.item, firstTile.isCaptainScope);
    }
  }

  public addSet(): void {
    if (!this.canAddSet()) {
      return;
    }

    const set = createAbilityFilterTagSet([], 'any');

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
    this.announce(`sets.operator.announced.${operator}`, {
      index: this.indexOfSet(setId),
      count: this.totalMatchCount(),
    });
  }

  public toggleSelectionOperator(): void {
    if (!this.allowSelectionOperator) {
      return;
    }

    const next: AbilityTagSetOperator = this.selectionOperator() === 'all' ? 'any' : 'all';

    this.workingSelection.update((selection) => ({ ...selection, operator: next }));
    this.announce(`selection.announced.${next}`, { count: this.totalMatchCount() });
  }

  public toggleCatalogItem(item: AutoBuildAbilityCatalogItem, isCaptainScope = false): void {
    const targetSet = this.activeSet() ?? this.ensureSet();

    if (!targetSet) {
      return;
    }

    // Identity is (abilityKey, captain-scope): the same key can be picked from
    // both the captain section and its category section as two independent tags.
    const matchesTile = (requirement: AutoBuildAbilityRequirement): boolean =>
      requirement.abilityKey === item.key &&
      isCaptainAbilityRequirement(requirement) === isCaptainScope;
    const alreadyPresent = targetSet.requirements.some(matchesTile);

    this.workingSelection.update((selection) => ({
      ...selection,
      sets: selection.sets.map((set) =>
        set.id !== targetSet.id
          ? set
          : {
              ...set,
              requirements: alreadyPresent
                ? set.requirements.filter((requirement) => !matchesTile(requirement))
                : [...set.requirements, this.createRequirement(item, isCaptainScope)],
            },
      ),
    }));

    this.announce(alreadyPresent ? 'chips.removed' : 'chips.added', {
      label: item.label,
      index: this.indexOfSet(targetSet.id),
      count: this.totalMatchCount(),
    });
  }

  public removeRequirement(setId: string, target: AutoBuildAbilityRequirement): void {
    const label = this.catalogMap().get(target.abilityKey)?.label ?? target.abilityKey;
    const targetIsCaptain = isCaptainAbilityRequirement(target);

    this.workingSelection.update((selection) => ({
      ...selection,
      sets: selection.sets.map((set) =>
        set.id !== setId
          ? set
          : {
              ...set,
              // Drop only the chip that shares this key AND captain-scope, so the
              // other scope of the same key (if also picked) stays selected.
              requirements: set.requirements.filter(
                (requirement) =>
                  !(
                    requirement.abilityKey === target.abilityKey &&
                    isCaptainAbilityRequirement(requirement) === targetIsCaptain
                  ),
              ),
            },
      ),
    }));

    this.announce('chips.removed', {
      label,
      index: this.indexOfSet(setId),
      count: this.totalMatchCount(),
    });
  }

  public clearAll(): void {
    this.clearLeaveTimer();
    this.leavingSetId.set(null);
    this.workingSelection.set(createEmptyAbilityFilterTagSetSelection());
    this.activeSetId.set(null);
    this.announce('actions.clearedAll', {});
  }

  public save(): void {
    this.dismissReason = 'save';
    this.saveSelection.emit(
      cloneAbilityFilterTagSetSelection({
        ...this.workingSelection(),
        operator: this.selectionOperator(),
        // A half-built set filters nothing, so it never reaches the host.
        sets: this.workingSelection().sets.filter((set) => set.requirements.length > 0),
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

  private activeSet(): AbilityFilterTagSet | null {
    const activeSetId = this.activeSetId();

    return this.workingSelection().sets.find((set) => set.id === activeSetId) ?? null;
  }

  private ensureSet(): AbilityFilterTagSet | null {
    if (!this.canAddSet()) {
      return null;
    }

    this.addSet();

    return this.activeSet();
  }

  private indexOfSet(setId: string): number {
    return this.workingSelection().sets.findIndex((set) => set.id === setId) + 1;
  }

  private requirementSetIndexes(): Map<string, number[]> {
    const indexes = new Map<string, number[]>();

    this.workingSelection().sets.forEach((set, index) => {
      for (const requirement of set.requirements) {
        const key = this.tileMembershipKey(
          requirement.abilityKey,
          isCaptainAbilityRequirement(requirement),
        );
        const current = indexes.get(key) ?? [];
        current.push(index + 1);
        indexes.set(key, current);
      }
    });

    return indexes;
  }

  /**
   * Membership/highlight identity for a catalog tile. Composite of the ability
   * key and whether the tile lives in the captain section, so a shared key never
   * lights up (or counts against) both sections from a single-section pick.
   */
  private tileMembershipKey(abilityKey: string, isCaptainScope: boolean): string {
    return `${isCaptainScope ? 'captain' : 'any'}:${abilityKey}`;
  }

  private createRequirement(
    item: AutoBuildAbilityCatalogItem,
    isCaptainScope: boolean,
  ): AutoBuildAbilityRequirement {
    return {
      abilityKey: item.key,
      minTurns: null,
      slotTokens: [],
      requiredCharacterCount: 1,
      slotScope: isCaptainScope ? 'leader' : 'any',
      ...(isCaptainScope ? { sourceScope: 'captainAbility' as const } : {}),
    };
  }

  private buildChip(requirement: AutoBuildAbilityRequirement): TagChipView {
    const label = this.catalogMap().get(requirement.abilityKey)?.label ?? requirement.abilityKey;

    return { requirement, label, badge: this.resolveBadge(label) };
  }

  private announce(key: string, params: Record<string, string | number>): void {
    this.liveAnnouncement.set({ key, params });
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

  private resolveBadge(label: string): string {
    return label
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}

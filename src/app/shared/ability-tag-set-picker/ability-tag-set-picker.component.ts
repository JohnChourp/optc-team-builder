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
  IonSelect,
  IonSelectOption,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  addOutline,
  closeOutline,
  eyeOffOutline,
  eyeOutline,
  funnelOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';

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
import { normalizeAbilityRequirementTurns } from '../../core/services/ability-requirement-draft.utils';
import { applyIonicModalDialogLabel } from '../a11y/ionic-modal-dialog-label.utils';
import { AbilityTagSetPickerStylePanelsComponent } from './ability-tag-set-picker-style-panels.component';

/** One catalog grouping the host chooses to expose, in rail order. */
export interface AbilityTagSetPickerSection {
  category: string;
  label: string;
  items: AutoBuildAbilityCatalogItem[];
  /** Adds `sourceScope: 'captainAbility'` + `slotScope: 'leader'` to picked tags. */
  captainAbility?: boolean;
  /**
   * Optional one-line explanation rendered under the section head. Host-supplied
   * and already translated, because the picker's transloco scope is shared by
   * every host and cannot carry per-host copy.
   */
  description?: string;
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
  /**
   * The number the tile prints. Identical to `item.matchCount` unless the host
   * opted into `captainScopedTileCounts`, where a captain-section tile reports
   * how many characters carry the ability AS A CAPTAIN ABILITY - the only set
   * the filter can actually return for that scope.
   */
  matchCount: number;
  /** Section name shown before the label when the host opted into scope markers. */
  scopeLabel: string;
}

interface CatalogSectionView {
  key: string;
  label: string;
  description: string;
  tiles: CatalogTileView[];
}

/** A selectable "minimum turns" threshold offered for a turn-based chip. */
interface TurnOption {
  value: number;
  /** A 99+/999 sentinel bucket ("effectively permanent"), labelled as such. */
  permanent: boolean;
}

interface TagChipView {
  requirement: AutoBuildAbilityRequirement;
  label: string;
  badge: string;
  /** Stable (abilityKey, captain-scope) identity — the @for track key, since a
   * set can hold the same key in both the captain and the category scope. */
  chipKey: string;
  /**
   * Whether to show a turn selector: the ability supports turns AND its
   * scope-appropriate bucket list is non-empty. The scope check hides the
   * control where a captain-source has no per-turn index (e.g. captain
   * "Reduce Damage"), which would otherwise collapse the match set to 0.
   */
  supportsTurns: boolean;
  /** Distinct minimum-turn thresholds for this chip's scope, ascending. */
  turnOptions: TurnOption[];
  /**
   * Section name rendered before the label so the same ability picked as a
   * captain requirement and as a category requirement is not two identical
   * chips. Empty unless the host opted into `scopeMarkers`.
   */
  scopeLabel: string;
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
/**
 * Turn counts at/above this are upstream's "effectively permanent" sentinels
 * ("for 99+ turns", "for 999 turns"); the picker collapses them into one
 * "Permanent" threshold rather than offering a literal 99/999-turn option.
 */
const PERMANENT_TURN_SENTINEL = 99;

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
    IonSelect,
    IonSelectOption,
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
  /**
   * Extra class placed on the ion-modal alongside `ability-tag-set-picker-modal`,
   * so one host can style its own instance. The modal content is teleported to
   * the app root, so a class on the modal is the only selector a page's own
   * (unencapsulated) style panel can reach it by.
   */
  @Input() public modalScopeClass = '';
  /** Hides the per-tile character count behind a header toggle, hidden first. */
  @Input() public collapsibleTileCounts = false;
  /** Captain-section tiles report the captain-scoped match count. */
  @Input() public captainScopedTileCounts = false;
  /** Renders the always-available "how this filter works" block. */
  @Input() public showHelp = false;
  /** Prefixes captain-scope tiles and chips with their section name. */
  @Input() public scopeMarkers = false;

  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveSelection = new EventEmitter<AbilityFilterTagSetSelection>();

  public readonly closeIcon = closeOutline;
  public readonly countsShownIcon = eyeOutline;
  public readonly countsHiddenIcon = eyeOffOutline;
  public readonly pickerIcon = funnelOutline;
  public readonly addIcon = addOutline;
  public readonly swapIcon = swapHorizontalOutline;
  public readonly operators: AbilityTagSetOperator[] = ['any', 'all'];

  public readonly searchTerm = signal('');
  /** Per-tile counts start hidden only where the host asked for the toggle. */
  public readonly tileCountsVisible = signal(true);
  public readonly helpOpen = signal(false);
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
          description: section.description ?? '',
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
              matchCount: this.resolveTileMatchCount(item, isCaptainScope),
              scopeLabel: this.scopeMarkers && isCaptainScope ? section.label : '',
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
      this.tileCountsVisible.set(!this.collapsibleTileCounts);
      this.helpOpen.set(false);

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

  /** Extra class the host asked for, kept beside the picker's own modal class. */
  public modalCssClass(): string {
    return this.modalScopeClass
      ? `ability-tag-set-picker-modal ${this.modalScopeClass}`
      : 'ability-tag-set-picker-modal';
  }

  public toggleTileCounts(): void {
    this.tileCountsVisible.update((visible) => !visible);
  }

  public toggleHelp(): void {
    this.helpOpen.update((open) => !open);
  }

  /**
   * A captain-section tile must report the captain-scoped list, not the
   * crew-wide `matchCount`: the same key is usually a crew ability too, so the
   * crew-wide number promises matches the captain-scoped filter cannot return
   * (Damage prints 1,837 crew-wide against 142 captains). Hosts that have not
   * opted in keep the crew-wide number, so nothing changes for them.
   */
  private resolveTileMatchCount(item: AutoBuildAbilityCatalogItem, isCaptainScope: boolean): number {
    if (!this.captainScopedTileCounts || !isCaptainScope) {
      return item.matchCount;
    }

    return item.captainAbilityMatchingCharacterIds?.length ?? item.matchCount;
  }

  private captainSectionLabel(): string {
    return this.sectionsState().find((section) => section.captainAbility)?.label ?? '';
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
    const item = this.catalogMap().get(requirement.abilityKey);
    const label = item?.label ?? requirement.abilityKey;
    const isCaptainScope = isCaptainAbilityRequirement(requirement);
    // Read the SCOPE-appropriate per-turn index: captain chips filter against the
    // captain turn buckets, category chips against the crew-wide ones. Picking the
    // wrong list would offer thresholds the matching then resolves to nobody.
    const buckets = isCaptainScope
      ? (item?.captainAbilityTurnMatchingCharacterIds ?? [])
      : (item?.turnMatchingCharacterIds ?? []);
    const turnOptions = this.buildTurnOptions(buckets);

    return {
      requirement,
      label,
      scopeLabel: this.scopeMarkers && isCaptainScope ? this.captainSectionLabel() : '',
      badge: this.resolveBadge(label),
      chipKey: this.tileMembershipKey(requirement.abilityKey, isCaptainScope),
      // Gate on the scope buckets, not just item.supportsTurns, so a scope with no
      // per-turn data shows no control instead of a filter that matches nobody.
      supportsTurns: Boolean(item?.supportsTurns) && turnOptions.length > 0,
      turnOptions,
    };
  }

  /**
   * Distinct minimum-turn thresholds from a chip's turn buckets. Buckets at or
   * above the 99 sentinel ("for 99+/999 turns" — effectively permanent) collapse
   * into ONE permanent option valued at 99, so filtering `>= 99` keeps every
   * permanent holder and the picker never offers a misleading literal "999 turns".
   */
  private buildTurnOptions(buckets: readonly { minTurns: number }[]): TurnOption[] {
    const finite = [
      ...new Set(
        buckets
          .map((bucket) => bucket.minTurns)
          .filter((minTurns) => minTurns >= 1 && minTurns < PERMANENT_TURN_SENTINEL),
      ),
    ].sort((left, right) => left - right);
    const options: TurnOption[] = finite.map((value) => ({ value, permanent: false }));

    if (buckets.some((bucket) => bucket.minTurns >= PERMANENT_TURN_SENTINEL)) {
      options.push({ value: PERMANENT_TURN_SENTINEL, permanent: true });
    }

    return options;
  }

  /**
   * Sets the minimum-turn threshold on exactly the (abilityKey, captain-scope)
   * requirement the chip represents, so the captain and category copies of a
   * shared key keep independent turn thresholds. `'any'`/blank/0 clear to null.
   */
  public setRequirementTurns(
    setId: string,
    target: AutoBuildAbilityRequirement,
    value: number | string | null,
  ): void {
    const targetIsCaptain = isCaptainAbilityRequirement(target);
    const minTurns = normalizeAbilityRequirementTurns(
      typeof value === 'number' || typeof value === 'string' ? value : null,
    );

    this.workingSelection.update((selection) => ({
      ...selection,
      sets: selection.sets.map((set) =>
        set.id !== setId
          ? set
          : {
              ...set,
              requirements: set.requirements.map((requirement) =>
                requirement.abilityKey === target.abilityKey &&
                isCaptainAbilityRequirement(requirement) === targetIsCaptain
                  ? { ...requirement, minTurns }
                  : requirement,
              ),
            },
      ),
    }));

    this.announce('chips.turnsChanged', {
      label: this.catalogMap().get(target.abilityKey)?.label ?? target.abilityKey,
      index: this.indexOfSet(setId),
      count: this.totalMatchCount(),
    });
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

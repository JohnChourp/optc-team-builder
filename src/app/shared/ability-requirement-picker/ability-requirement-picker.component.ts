import {
  Component,
  EventEmitter,
  Input,
  type OnChanges,
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
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonToolbar,
} from '@ionic/angular/standalone';
import { closeOutline, optionsOutline } from 'ionicons/icons';

import {
  applyCatalogAbilityToDraft,
  cloneAbilityRequirementDrafts,
  createAbilityRequirementDraft,
  normalizeAbilityRequirementTurns,
  resolveAbilityRequirementPainSelectableDebuffBadges,
  resolveAbilityRequirementVisual,
  resolvePositiveInteger,
  resolveNonNegativeInteger,
  type AbilityRequirementDraft,
  type AbilityRequirementMiniBadge,
} from '../../core/services/ability-requirement-draft.utils';
import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityEffectTargetScope,
  type AutoBuildAbilitySlotScope,
} from '../../core/models/auto-team-builder-ability.models';
import {
  AUTO_BUILD_LEADER_BOOST_FILTERS,
  createEmptyAutoBuildLeaderBoostRanges,
  type AutoBuildLeaderBoostFilter,
  type AutoBuildLeaderBoostRange,
  type AutoBuildLeaderBoostRanges,
} from '../../core/models/auto-team-builder.models';
import { applyIonicModalDialogLabel } from '../a11y/ionic-modal-dialog-label.utils';
import { AbilityRequirementPickerStylePanelsComponent } from './ability-requirement-picker-style-panels.component';

interface AbilityRequirementCatalogTileView {
  item: AutoBuildAbilityCatalogItem;
  visual: ReturnType<typeof resolveAbilityRequirementVisual>;
  isSelected: boolean;
  selectedCount: number;
  supportsSelectableDebuff: boolean;
  painSelectableBadges: AbilityRequirementMiniBadge[];
  /**
   * How many characters can actually satisfy this requirement in the CURRENT
   * mode. In captain mode that is the captain-scoped count, which can be far
   * smaller than the ability-wide `matchCount` — "Enemy Resilience" matches 137
   * characters overall but only 1 as a captain.
   */
  matchCount: number;
  /** Few enough matches that picking this is likely to over-constrain the search. */
  isScarce: boolean;
}

/**
 * Below this many matching characters a requirement is flagged as scarce. The
 * captain-scoped counts have a median of 17.5, and 18 of the 60 captain-offerable
 * keys sit at 5 or fewer — so 5 marks the genuinely near-unsatisfiable ones
 * without flagging a third of the catalog.
 */
const SCARCE_MATCH_COUNT_THRESHOLD = 5;

interface AbilityRequirementSelectedRowView {
  draft: AbilityRequirementDraft;
  label: string;
  visual: ReturnType<typeof resolveAbilityRequirementVisual>;
  supportsTurns: boolean;
  supportsSlotTokens: boolean;
  supportsMinEffectValue: boolean;
  supportsEffectTargetScope: boolean;
  availableEffectTargetScopes: AutoBuildAbilityEffectTargetScope[];
  availableSlotTokens: string[];
  painSelectableBadges: AbilityRequirementMiniBadge[];
}

export interface AbilityRequirementPickerLeaderBoostSettings {
  filters: AutoBuildLeaderBoostFilter[];
  ranges: AutoBuildLeaderBoostRanges;
}

@Component({
  selector: 'app-ability-requirement-picker',
  standalone: true,
  imports: [
    AbilityRequirementPickerStylePanelsComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonInput,
    IonModal,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonToolbar,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './ability-requirement-picker.component.html',
  styleUrl: './ability-requirement-picker.component.scss',
})
export class AbilityRequirementPickerComponent implements OnChanges {
  private dismissReason: 'save' | 'cancel' | null = null;

  @Input({ required: true }) public isOpen = false;
  @Input({ required: true }) public title = '';
  @Input({ required: true }) public copy = '';
  @Input({ required: true }) public drafts: AbilityRequirementDraft[] = [];
  @Input({ required: true }) public catalogItems: AutoBuildAbilityCatalogItem[] = [];
  @Input() public showCharacterCount = true;
  @Input() public showLeaderBoostControls = false;
  @Input() public captainAbilityMode = false;
  @Input() public leaderBoostFilters: AutoBuildLeaderBoostFilter[] = [
    ...AUTO_BUILD_LEADER_BOOST_FILTERS,
  ];
  @Input() public leaderBoostRanges: AutoBuildLeaderBoostRanges =
    createEmptyAutoBuildLeaderBoostRanges();
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveDrafts = new EventEmitter<AbilityRequirementDraft[]>();
  @Output() public readonly saveLeaderBoostSettings =
    new EventEmitter<AbilityRequirementPickerLeaderBoostSettings>();

  public readonly closeIcon = closeOutline;
  public readonly pickerIcon = optionsOutline;
  public readonly availableLeaderBoostFilters = AUTO_BUILD_LEADER_BOOST_FILTERS;
  // 'any' ("don't filter by scope") is always offered; the real scopes beside it
  // are data-gated per ability on the row, so a scope that no character
  // implements is never offered. See `selectedRows`.
  private static readonly ANY_EFFECT_TARGET_SCOPE: AutoBuildAbilityEffectTargetScope = 'any';
  public readonly searchTerm = signal('');
  public readonly workingDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly catalogItemsState = signal<AutoBuildAbilityCatalogItem[]>([]);
  public readonly workingLeaderBoostFilters = signal<AutoBuildLeaderBoostFilter[]>([
    ...AUTO_BUILD_LEADER_BOOST_FILTERS,
  ]);
  public readonly workingLeaderBoostRanges = signal<AutoBuildLeaderBoostRanges>(
    createEmptyAutoBuildLeaderBoostRanges(),
  );
  public readonly hasInvalidLeaderBoostRanges = computed(() =>
    AUTO_BUILD_LEADER_BOOST_FILTERS.some((filter) => {
      const range = this.workingLeaderBoostRanges()[filter];

      return range.min !== null && range.max !== null && range.min > range.max;
    }),
  );
  public readonly selectedDraftCounts = computed(() => {
    const counts = new Map<string, number>();

    for (const draft of this.workingDrafts()) {
      const abilityKey = draft.abilityKey.trim();

      if (!abilityKey.length) {
        continue;
      }

      counts.set(abilityKey, (counts.get(abilityKey) ?? 0) + 1);
    }

    return counts;
  });
  public readonly catalogMap = computed(
    () => new Map(this.catalogItemsState().map((item) => [item.key, item] as const)),
  );
  public readonly filteredCatalogTiles = computed<AbilityRequirementCatalogTileView[]>(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedCounts = this.selectedDraftCounts();

    return this.catalogItemsState()
      .filter((item) => {
        if (!searchTerm.length) {
          return true;
        }

        return [item.key, item.label].some((value) => value.toLowerCase().includes(searchTerm));
      })
      .map((item) => {
        const matchCount = this.resolveTileMatchCount(item);

        return {
          item,
          visual: resolveAbilityRequirementVisual(item.key),
          isSelected: selectedCounts.has(item.key),
          selectedCount: selectedCounts.get(item.key) ?? 0,
          supportsSelectableDebuff: (item.availableCoverageModes ?? ['explicit']).includes(
            'selectedDebuff',
          ),
          painSelectableBadges: resolveAbilityRequirementPainSelectableDebuffBadges(item.key),
          matchCount,
          isScarce: matchCount <= SCARCE_MATCH_COUNT_THRESHOLD,
        };
      });
  });
  public readonly selectedRows = computed<AbilityRequirementSelectedRowView[]>(() =>
    this.workingDrafts().map((draft) => {
      const catalogItem = this.catalogMap().get(draft.abilityKey);
      const resolvedEffectTargetScopes = this.resolveAvailableEffectTargetScopes(catalogItem);

      return {
        draft,
        label: catalogItem?.label ?? draft.abilityKey,
        visual: resolveAbilityRequirementVisual(draft.abilityKey),
        supportsTurns: catalogItem?.supportsTurns ?? false,
        supportsSlotTokens:
          catalogItem?.supportsSlotTokens === true ||
          (this.captainAbilityMode && draft.abilityKey === 'make_slots_favorable'),
        supportsMinEffectValue: this.captainAbilityMode && draft.abilityKey === 'reduce_damage',
        // Data-gated: offered only where real characters implement a scope, and
        // read from whichever index actually backs the filter in this mode —
        // captain requirements resolve through captainAbilityEffectMatches,
        // everything else through effectTargetScopeMatchingCharacterIds. Reading
        // the wrong one would offer a scope the filter cannot honour.
        supportsEffectTargetScope: resolvedEffectTargetScopes.length > 0,
        availableEffectTargetScopes: [
          AbilityRequirementPickerComponent.ANY_EFFECT_TARGET_SCOPE,
          ...resolvedEffectTargetScopes,
        ],
        availableSlotTokens: catalogItem?.availableSlotTokens ?? [],
        painSelectableBadges: resolveAbilityRequirementPainSelectableDebuffBadges(draft.abilityKey),
      };
    }),
  );

  /**
   * Scopes this ability can actually be filtered by, taken from whichever index
   * backs the filter in the current mode. Captain requirements resolve through
   * `captainAbilityEffectMatches` (captain-scoped by construction); everything
   * else resolves through `effectTargetScopeMatchingCharacterIds`, which
   * deliberately excludes captain structured effects.
   */
  private resolveAvailableEffectTargetScopes(
    catalogItem: AutoBuildAbilityCatalogItem | undefined,
  ): AutoBuildAbilityEffectTargetScope[] {
    if (!catalogItem) {
      return [];
    }

    if (this.captainAbilityMode) {
      const captainScopes = (catalogItem.captainAbilityEffectMatches ?? [])
        .map((match) => match.effectTargetScope)
        .filter(
          (scope): scope is Exclude<AutoBuildAbilityEffectTargetScope, 'any'> =>
            scope !== undefined && scope !== 'any',
        );

      return [...new Set(captainScopes)].sort((left, right) => left.localeCompare(right));
    }

    return [...(catalogItem.availableEffectTargetScopes ?? [])];
  }

  public labelModalDialog(event: Event, label: string): void {
    applyIonicModalDialogLabel(event, label);
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['catalogItems']) {
      this.catalogItemsState.set(this.catalogItems);
    }

    if (changes['isOpen'] && this.isOpen) {
      this.searchTerm.set('');
      this.workingDrafts.set(cloneAbilityRequirementDrafts(this.drafts));
      this.workingLeaderBoostFilters.set(this.normalizeLeaderBoostFilters(this.leaderBoostFilters));
      this.workingLeaderBoostRanges.set(this.cloneLeaderBoostRanges(this.leaderBoostRanges));
    }
  }

  /**
   * The count that is honest for the mode the picker is in. A captain requirement
   * is resolved against `captainAbilityMatchingCharacterIds`, so showing the
   * ability-wide `matchCount` there would promise matches the filter will not
   * return. Falls back to the ability-wide count when the ability carries no
   * captain-scoped index, which is what the filter itself falls back to.
   */
  private resolveTileMatchCount(item: AutoBuildAbilityCatalogItem): number {
    if (this.captainAbilityMode && item.captainAbilityMatchingCharacterIds !== undefined) {
      return item.captainAbilityMatchingCharacterIds.length;
    }

    return item.matchCount;
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  public onCatalogItemSelect(item: AutoBuildAbilityCatalogItem): void {
    this.workingDrafts.update((currentDrafts) => [
      ...currentDrafts,
      createAbilityRequirementDraft(
        item,
        this.captainAbilityMode
          ? { sourceScope: 'captainAbility', slotScope: 'leader' }
          : undefined,
      ),
    ]);
  }

  public clearAll(): void {
    this.workingDrafts.set([]);
  }

  public removeDraft(draftId: string): void {
    this.workingDrafts.update((currentDrafts) =>
      currentDrafts.filter((draft) => draft.draftId !== draftId),
    );
  }

  public onRequiredCharacterCountChange(
    draftId: string,
    event: CustomEvent<{ value?: string | number | null }> | Event,
  ): void {
    const nextValue = resolvePositiveInteger(this.resolveInputEventValue(event));

    this.patchDraft(draftId, {
      requiredCharacterCount: nextValue,
    });
  }

  public onRequiredTurnsChange(
    draftId: string,
    event: CustomEvent<{ value?: string | number | null }> | Event,
  ): void {
    const nextValue = resolveNonNegativeInteger(this.resolveInputEventValue(event));

    this.patchDraft(draftId, {
      minTurns: nextValue,
    });
  }

  public setSlotScope(draftId: string, slotScope: AutoBuildAbilitySlotScope): void {
    this.patchDraft(draftId, {
      slotScope,
    });
  }

  public setEffectTargetScope(
    draftId: string,
    effectTargetScope: AutoBuildAbilityEffectTargetScope,
  ): void {
    this.patchDraft(draftId, {
      effectTargetScope,
    });
  }

  public onMinEffectValueChange(
    draftId: string,
    event: CustomEvent<{ value?: string | number | null }> | Event,
  ): void {
    const rawValue = this.resolveInputEventValue(event);
    const nextValue =
      rawValue === null || rawValue === undefined || rawValue === '' ? null : Number(rawValue);

    this.patchDraft(draftId, {
      minEffectValue:
        typeof nextValue === 'number' && Number.isFinite(nextValue) && nextValue >= 0
          ? nextValue
          : null,
    });
  }

  public toggleSlotToken(draftId: string, token: string): void {
    this.workingDrafts.update((currentDrafts) =>
      currentDrafts.map((draft) => {
        if (draft.draftId !== draftId) {
          return draft;
        }

        const normalizedToken = token.trim().toUpperCase();
        const slotTokens = draft.slotTokens.includes(normalizedToken)
          ? draft.slotTokens.filter((currentToken) => currentToken !== normalizedToken)
          : [...draft.slotTokens, normalizedToken];

        return {
          ...draft,
          slotTokens,
        };
      }),
    );
  }

  public onLeaderBoostFilterChange(
    event: CustomEvent<{
      value?: AutoBuildLeaderBoostFilter[] | AutoBuildLeaderBoostFilter | null;
    }>,
  ): void {
    const nextFilters = this.normalizeLeaderBoostFilters(event.detail.value);

    this.workingLeaderBoostFilters.set(
      nextFilters.length ? nextFilters : [...AUTO_BUILD_LEADER_BOOST_FILTERS],
    );
  }

  public onLeaderBoostRangeChange(
    filter: AutoBuildLeaderBoostFilter,
    bound: keyof AutoBuildLeaderBoostRange,
    event: CustomEvent<{ value?: string | number | null }>,
  ): void {
    const nextBound = this.resolveLeaderBoostRangeBound(event.detail.value);
    const currentRanges = this.workingLeaderBoostRanges();

    this.workingLeaderBoostRanges.set({
      HP: { ...currentRanges.HP },
      ATK: { ...currentRanges.ATK },
      [filter]: {
        ...currentRanges[filter],
        [bound]: nextBound,
      },
    });
  }

  public save(): void {
    if (this.hasInvalidLeaderBoostRanges()) {
      return;
    }

    this.dismissReason = 'save';
    if (this.showLeaderBoostControls) {
      this.saveLeaderBoostSettings.emit({
        filters: [...this.workingLeaderBoostFilters()],
        ranges: this.cloneLeaderBoostRanges(this.workingLeaderBoostRanges()),
      });
    }
    this.saveDrafts.emit(cloneAbilityRequirementDrafts(this.workingDrafts()));
  }

  public cancel(): void {
    this.dismissReason = 'cancel';
    this.dismiss.emit();
  }

  public onModalDidDismiss(): void {
    if (this.dismissReason !== null) {
      this.dismissReason = null;
      return;
    }

    this.dismiss.emit();
  }

  private patchDraft(draftId: string, patch: Partial<AbilityRequirementDraft>): void {
    this.workingDrafts.update((currentDrafts) =>
      currentDrafts.map((draft) => {
        if (draft.draftId !== draftId) {
          return draft;
        }

        const nextDraft = {
          ...draft,
          ...patch,
        };
        const abilityKey = nextDraft.abilityKey.trim();

        if (abilityKey.length === 0) {
          return {
            ...nextDraft,
            minTurns: normalizeAbilityRequirementTurns(nextDraft.minTurns),
          };
        }

        return abilityKey.length
          ? applyCatalogAbilityToDraft(nextDraft, abilityKey, this.catalogMap())
          : nextDraft;
      }),
    );
  }

  private resolveInputEventValue(
    event: CustomEvent<{ value?: string | number | null }> | Event,
  ): string | number | null | undefined {
    if ('detail' in event && typeof event.detail === 'object' && event.detail !== null) {
      return event.detail.value;
    }

    return (event.target as HTMLInputElement | null)?.value;
  }

  private normalizeLeaderBoostFilters(
    value: readonly AutoBuildLeaderBoostFilter[] | AutoBuildLeaderBoostFilter | null | undefined,
  ): AutoBuildLeaderBoostFilter[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];
    const uniqueValues = [...new Set(nextValues)];

    return uniqueValues.filter((filter): filter is AutoBuildLeaderBoostFilter =>
      AUTO_BUILD_LEADER_BOOST_FILTERS.includes(filter as AutoBuildLeaderBoostFilter),
    );
  }

  private resolveLeaderBoostRangeBound(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const nextValue = Number(value);

    return Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : null;
  }

  private cloneLeaderBoostRanges(
    ranges: Partial<Record<AutoBuildLeaderBoostFilter, Partial<AutoBuildLeaderBoostRange> | null>>,
  ): AutoBuildLeaderBoostRanges {
    return {
      HP: {
        min: this.resolveLeaderBoostRangeBound(ranges.HP?.min),
        max: this.resolveLeaderBoostRangeBound(ranges.HP?.max),
      },
      ATK: {
        min: this.resolveLeaderBoostRangeBound(ranges.ATK?.min),
        max: this.resolveLeaderBoostRangeBound(ranges.ATK?.max),
      },
    };
  }
}

import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
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
  IonToolbar,
} from '@ionic/angular/standalone';
import { closeOutline, optionsOutline } from 'ionicons/icons';

import {
  applyCatalogAbilityToDraft,
  cloneAbilityRequirementDrafts,
  createAbilityRequirementDraft,
  resolveAbilityRequirementPainSelectableDebuffBadges,
  resolveAbilityRequirementVisual,
  resolvePositiveInteger,
  type AbilityRequirementDraft,
  type AbilityRequirementMiniBadge,
} from '../../core/services/ability-requirement-draft.utils';
import { type AutoBuildAbilityCatalogItem } from '../../core/models/auto-team-builder-ability.models';

interface AbilityRequirementCatalogTileView {
  item: AutoBuildAbilityCatalogItem;
  visual: ReturnType<typeof resolveAbilityRequirementVisual>;
  isSelected: boolean;
  selectedCount: number;
  supportsSelectableDebuff: boolean;
  painSelectableBadges: AbilityRequirementMiniBadge[];
}

interface AbilityRequirementSelectedRowView {
  draft: AbilityRequirementDraft;
  label: string;
  visual: ReturnType<typeof resolveAbilityRequirementVisual>;
  supportsTurns: boolean;
  supportsSlotTokens: boolean;
  availableSlotTokens: string[];
  painSelectableBadges: AbilityRequirementMiniBadge[];
}

@Component({
  selector: 'app-ability-requirement-picker',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonInput,
    IonModal,
    IonSearchbar,
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
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveDrafts = new EventEmitter<AbilityRequirementDraft[]>();

  public readonly closeIcon = closeOutline;
  public readonly pickerIcon = optionsOutline;
  public readonly searchTerm = signal('');
  public readonly workingDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly catalogItemsState = signal<AutoBuildAbilityCatalogItem[]>([]);
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
      .map((item) => ({
        item,
        visual: resolveAbilityRequirementVisual(item.key),
        isSelected: selectedCounts.has(item.key),
        selectedCount: selectedCounts.get(item.key) ?? 0,
        supportsSelectableDebuff: (item.availableCoverageModes ?? ['explicit']).includes(
          'selectedDebuff',
        ),
        painSelectableBadges: resolveAbilityRequirementPainSelectableDebuffBadges(item.key),
      }));
  });
  public readonly selectedRows = computed<AbilityRequirementSelectedRowView[]>(() =>
    this.workingDrafts().map((draft) => {
      const catalogItem = this.catalogMap().get(draft.abilityKey);

      return {
        draft,
        label: catalogItem?.label ?? draft.abilityKey,
        visual: resolveAbilityRequirementVisual(draft.abilityKey),
        supportsTurns: catalogItem?.supportsTurns ?? false,
        supportsSlotTokens: catalogItem?.supportsSlotTokens ?? false,
        availableSlotTokens: catalogItem?.availableSlotTokens ?? [],
        painSelectableBadges: resolveAbilityRequirementPainSelectableDebuffBadges(draft.abilityKey),
      };
    }),
  );

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['catalogItems']) {
      this.catalogItemsState.set(this.catalogItems);
    }

    if (changes['isOpen'] && this.isOpen) {
      console.log('AbilityRequirementPickerComponent component');
      this.searchTerm.set('');
      this.workingDrafts.set(cloneAbilityRequirementDrafts(this.drafts));
    }
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  public onCatalogItemSelect(item: AutoBuildAbilityCatalogItem): void {
    const existingDraft = this.workingDrafts().find((draft) => draft.abilityKey === item.key);

    if (existingDraft) {
      return;
    }

    this.workingDrafts.update((currentDrafts) => [
      ...currentDrafts,
      createAbilityRequirementDraft(item),
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
    const nextValue = resolvePositiveInteger(this.resolveInputEventValue(event));

    this.patchDraft(draftId, {
      minTurns: nextValue,
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

  public save(): void {
    this.dismissReason = 'save';
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
}

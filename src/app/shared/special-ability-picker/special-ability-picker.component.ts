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
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSearchbar,
  IonToolbar,
} from '@ionic/angular/standalone';
import { closeOutline, sparklesOutline } from 'ionicons/icons';

import {
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
} from '../../core/models/auto-team-builder-ability.models';
import {
  cloneAbilityRequirementDrafts,
  createAbilityRequirementDraft,
  resolveNonNegativeInteger,
  type AbilityRequirementDraft,
} from '../../core/services/ability-requirement-draft.utils';

interface CategoryAbilityTileView {
  item: AutoBuildAbilityCatalogItem;
  isSelected: boolean;
  badge: string;
}

interface CategoryAbilitySectionView {
  groupLabel: string;
  groupOrder: number;
  items: CategoryAbilityTileView[];
}

@Component({
  selector: 'app-special-ability-picker',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonModal,
    IonSearchbar,
    IonToolbar,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './special-ability-picker.component.html',
  styleUrl: './special-ability-picker.component.scss',
})
export class SpecialAbilityPickerComponent implements OnChanges {
  private dismissReason: 'save' | 'cancel' | null = null;

  @Input({ required: true }) public isOpen = false;
  @Input({ required: true }) public category: AutoBuildAbilityCategory = 'special';
  @Input({ required: true }) public eyebrow = '';
  @Input({ required: true }) public title = '';
  @Input({ required: true }) public copy = '';
  @Input({ required: true }) public drafts: AbilityRequirementDraft[] = [];
  @Input({ required: true }) public catalogItems: AutoBuildAbilityCatalogItem[] = [];
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveDrafts = new EventEmitter<AbilityRequirementDraft[]>();

  public readonly closeIcon = closeOutline;
  public readonly pickerIcon = sparklesOutline;
  public readonly searchTerm = signal('');
  public readonly workingDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly catalogItemsState = signal<AutoBuildAbilityCatalogItem[]>([]);
  public readonly selectedKeys = computed(
    () =>
      new Set(
        this.workingDrafts()
          .map((draft) => draft.abilityKey.trim())
          .filter(Boolean),
      ),
  );
  public readonly selectedRows = computed(() => {
    const catalogMap = new Map(this.catalogItemsState().map((item) => [item.key, item] as const));

    return this.workingDrafts().map((draft) => ({
      draft,
      item: catalogMap.get(draft.abilityKey),
      label: catalogMap.get(draft.abilityKey)?.label ?? draft.abilityKey,
      badge: this.resolveBadge(catalogMap.get(draft.abilityKey)?.label ?? draft.abilityKey),
      supportsTurns: catalogMap.get(draft.abilityKey)?.supportsTurns ?? false,
    }));
  });
  public readonly filteredSections = computed<CategoryAbilitySectionView[]>(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedKeys = this.selectedKeys();
    const sectionMap = new Map<string, CategoryAbilitySectionView>();

    for (const item of this.catalogItemsState()) {
      if (item.category !== this.category) {
        continue;
      }

      const haystack = [item.label, item.key, item.groupLabel ?? ''].join(' ').toLowerCase();

      if (searchTerm.length > 0 && !haystack.includes(searchTerm)) {
        continue;
      }

      const groupLabel = item.groupLabel ?? this.eyebrow;
      const groupOrder = item.groupOrder ?? Number.MAX_SAFE_INTEGER;
      const section =
        sectionMap.get(groupLabel) ??
        ({
          groupLabel,
          groupOrder,
          items: [],
        } satisfies CategoryAbilitySectionView);

      section.items.push({
        item,
        isSelected: selectedKeys.has(item.key),
        badge: this.resolveBadge(item.label),
      });
      sectionMap.set(groupLabel, section);
    }

    return [...sectionMap.values()]
      .map((section) => ({
        ...section,
        items: [...section.items].sort(
          (left, right) =>
            (left.item.effectOrder ?? Number.MAX_SAFE_INTEGER) -
              (right.item.effectOrder ?? Number.MAX_SAFE_INTEGER) ||
            left.item.label.localeCompare(right.item.label),
        ),
      }))
      .sort(
        (left, right) =>
          left.groupOrder - right.groupOrder || left.groupLabel.localeCompare(right.groupLabel),
      );
  });

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['catalogItems']) {
      this.catalogItemsState.set(this.catalogItems);
    }

    if (changes['isOpen'] && this.isOpen) {
      this.dismissReason = null;
      this.searchTerm.set('');
      this.workingDrafts.set(cloneAbilityRequirementDrafts(this.drafts));
    }
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  public toggleCatalogItem(item: AutoBuildAbilityCatalogItem): void {
    if (this.selectedKeys().has(item.key)) {
      this.workingDrafts.update((drafts) =>
        drafts.filter((draft) => draft.abilityKey !== item.key),
      );
      return;
    }

    this.workingDrafts.update((drafts) => [...drafts, createAbilityRequirementDraft(item)]);
  }

  public removeDraft(draftId: string): void {
    this.workingDrafts.update((drafts) => drafts.filter((draft) => draft.draftId !== draftId));
  }

  public onRequiredTurnsChange(
    draftId: string,
    event: CustomEvent<{ value?: string | number | null }> | Event,
  ): void {
    const minTurns = resolveNonNegativeInteger(this.resolveInputEventValue(event));

    this.workingDrafts.update((drafts) =>
      drafts.map((draft) => (draft.draftId === draftId ? { ...draft, minTurns } : draft)),
    );
  }

  public clearAll(): void {
    this.workingDrafts.set([]);
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

  private resolveInputEventValue(
    event: CustomEvent<{ value?: string | number | null }> | Event,
  ): string | number | null | undefined {
    if ('detail' in event && typeof event.detail === 'object' && event.detail !== null) {
      return event.detail.value;
    }

    return (event.target as HTMLInputElement | null)?.value;
  }
}

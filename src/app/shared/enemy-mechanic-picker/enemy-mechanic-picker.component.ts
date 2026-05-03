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
  IonToolbar,
} from '@ionic/angular/standalone';
import { closeOutline, optionsOutline } from 'ionicons/icons';

import {
  ENEMY_MECHANIC_CATEGORY_ORDER,
  applyCatalogEnemyMechanicToDraft,
  cloneEnemyMechanicDrafts,
  createEnemyMechanicDraft,
  resolveEnemyMechanicVisual,
  type EnemyMechanicDraft,
} from '../../core/services/enemy-mechanic-draft.utils';
import {
  type AutoBuildEnemyMechanicCatalogItem,
  type AutoBuildEnemyMechanicCategory,
  type AutoBuildEnemyMechanicConditionTag,
  type AutoBuildEnemyMechanicRequirement,
  type AutoBuildEnemyMechanicResponseTag,
  type AutoBuildEnemyMechanicTriggerTag,
} from '../../core/models/auto-team-builder-ability.models';
import { resolvePositiveInteger } from '../../core/services/ability-requirement-draft.utils';

interface EnemyMechanicCatalogTileView {
  item: AutoBuildEnemyMechanicCatalogItem;
  visual: ReturnType<typeof resolveEnemyMechanicVisual>;
  isSelected: boolean;
  selectedCount: number;
}

interface EnemyMechanicCatalogSectionView {
  category: AutoBuildEnemyMechanicCategory;
  items: EnemyMechanicCatalogTileView[];
}

interface EnemyMechanicSelectedRowView {
  draft: EnemyMechanicDraft;
  label: string;
  visual: ReturnType<typeof resolveEnemyMechanicVisual>;
  supportsTurns: boolean;
  availableTriggerTags: AutoBuildEnemyMechanicTriggerTag[];
  availableResponseTags: AutoBuildEnemyMechanicResponseTag[];
  availableConditionTags: AutoBuildEnemyMechanicConditionTag[];
}

@Component({
  selector: 'app-enemy-mechanic-picker',
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
  templateUrl: './enemy-mechanic-picker.component.html',
  styleUrl: './enemy-mechanic-picker.component.scss',
})
export class EnemyMechanicPickerComponent implements OnChanges {
  private dismissReason: 'save' | 'cancel' | null = null;

  @Input({ required: true }) public isOpen = false;
  @Input({ required: true }) public title = '';
  @Input({ required: true }) public copy = '';
  @Input({ required: true }) public drafts: EnemyMechanicDraft[] = [];
  @Input({ required: true }) public catalogItems: AutoBuildEnemyMechanicCatalogItem[] = [];
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveDrafts = new EventEmitter<AutoBuildEnemyMechanicRequirement[]>();

  public readonly closeIcon = closeOutline;
  public readonly pickerIcon = optionsOutline;
  public readonly searchTerm = signal('');
  public readonly workingDrafts = signal<EnemyMechanicDraft[]>([]);
  public readonly catalogItemsState = signal<AutoBuildEnemyMechanicCatalogItem[]>([]);
  public readonly selectedDraftCounts = computed(() => {
    const counts = new Map<string, number>();

    for (const draft of this.workingDrafts()) {
      const mechanicKey = draft.mechanicKey.trim();

      if (!mechanicKey.length) {
        continue;
      }

      counts.set(mechanicKey, (counts.get(mechanicKey) ?? 0) + 1);
    }

    return counts;
  });
  public readonly catalogMap = computed(
    () => new Map(this.catalogItemsState().map((item) => [item.key, item] as const)),
  );
  public readonly filteredCatalogSections = computed<EnemyMechanicCatalogSectionView[]>(() => {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedCounts = this.selectedDraftCounts();

    return ENEMY_MECHANIC_CATEGORY_ORDER.map((category) => ({
      category,
      items: this.catalogItemsState()
        .filter((item) => item.category === category)
        .filter((item) => {
          if (!searchTerm.length) {
            return true;
          }

          return [item.key, item.label, ...item.keywords].some((value) =>
            value.toLowerCase().includes(searchTerm),
          );
        })
        .map((item) => ({
          item,
          visual: resolveEnemyMechanicVisual(item.key),
          isSelected: selectedCounts.has(item.key),
          selectedCount: selectedCounts.get(item.key) ?? 0,
        })),
    })).filter((section) => section.items.length > 0);
  });
  public readonly selectedRows = computed<EnemyMechanicSelectedRowView[]>(() =>
    this.workingDrafts().map((draft) => {
      const catalogItem = this.catalogMap().get(draft.mechanicKey);

      return {
        draft,
        label: catalogItem?.label ?? draft.mechanicKey,
        visual: resolveEnemyMechanicVisual(draft.mechanicKey),
        supportsTurns: catalogItem?.supportsTurns ?? true,
        availableTriggerTags: catalogItem?.availableTriggerTags ?? [],
        availableResponseTags: catalogItem?.availableResponseTags ?? [],
        availableConditionTags: catalogItem?.availableConditionTags ?? [],
      };
    }),
  );

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['catalogItems']) {
      this.catalogItemsState.set(this.catalogItems);
    }

    if (changes['isOpen'] && this.isOpen) {
      console.log('EnemyMechanicPickerComponent component');
      this.searchTerm.set('');
      this.workingDrafts.set(cloneEnemyMechanicDrafts(this.drafts));
    }
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  public onCatalogItemSelect(item: AutoBuildEnemyMechanicCatalogItem): void {
    const existingDraft = this.workingDrafts().find((draft) => draft.mechanicKey === item.key);

    if (existingDraft) {
      return;
    }

    this.workingDrafts.update((currentDrafts) => [
      ...currentDrafts,
      createEnemyMechanicDraft(item),
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

  public onRequiredTurnsChange(
    draftId: string,
    event: CustomEvent<{ value?: string | number | null }> | Event,
  ): void {
    this.patchDraft(draftId, {
      minTurns: resolvePositiveInteger(this.resolveInputEventValue(event)),
    });
  }

  public toggleTriggerTag(draftId: string, tag: AutoBuildEnemyMechanicTriggerTag): void {
    this.toggleTag(draftId, 'triggerTags', tag);
  }

  public toggleResponseTag(draftId: string, tag: AutoBuildEnemyMechanicResponseTag): void {
    this.toggleTag(draftId, 'responseTags', tag);
  }

  public toggleConditionTag(draftId: string, tag: AutoBuildEnemyMechanicConditionTag): void {
    this.toggleTag(draftId, 'conditionTags', tag);
  }

  public save(): void {
    this.dismissReason = 'save';
    this.saveDrafts.emit(
      this.workingDrafts().map((draft) => ({
        mechanicKey: draft.mechanicKey,
        category: draft.category,
        minTurns: draft.minTurns,
        requiredCharacterCount: resolvePositiveInteger(draft.requiredCharacterCount) ?? undefined,
        triggerTags: [...draft.triggerTags],
        responseTags: [...draft.responseTags],
        conditionTags: [...draft.conditionTags],
        derivedAbilityKey: draft.derivedAbilityKey,
      })),
    );
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

  private toggleTag<
    T extends 'triggerTags' | 'responseTags' | 'conditionTags',
    TagType extends EnemyMechanicDraft[T][number],
  >(draftId: string, key: T, tag: TagType): void {
    this.workingDrafts.update((currentDrafts) =>
      currentDrafts.map((draft) => {
        if (draft.draftId !== draftId) {
          return draft;
        }

        const currentTags = [...draft[key]] as TagType[];
        const nextTags = currentTags.includes(tag)
          ? currentTags.filter((currentTag) => currentTag !== tag)
          : [...currentTags, tag];

        return {
          ...draft,
          [key]: nextTags,
        } as EnemyMechanicDraft;
      }),
    );
  }

  private patchDraft(draftId: string, patch: Partial<EnemyMechanicDraft>): void {
    this.workingDrafts.update((currentDrafts) =>
      currentDrafts.map((draft) => {
        if (draft.draftId !== draftId) {
          return draft;
        }

        const nextDraft = {
          ...draft,
          ...patch,
        };
        const mechanicKey = nextDraft.mechanicKey.trim();

        return mechanicKey.length
          ? applyCatalogEnemyMechanicToDraft(nextDraft, mechanicKey, this.catalogMap())
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

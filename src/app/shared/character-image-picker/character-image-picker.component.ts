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
  IonModal,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToolbar,
} from '@ionic/angular/standalone';
import { closeOutline } from 'ionicons/icons';

import { type AutoBuildAbilityCatalog } from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSearchQuery,
  type CharacterSortMode,
  type DatasetManifest,
} from '../../core/models/optc.models';
import {
  createAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from '../../core/services/ability-requirement-draft.utils';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  getAbilityCatalogItemsByCategory,
  intersectAbilityMatchingCharacterIds,
  resolveCategoryAbilityMatchingCharacterIds,
  resolveSpecialAbilityMatchingCharacterIds,
  serializeCategoryAbilityDrafts,
  serializeSpecialAbilityDrafts,
} from '../../core/services/special-ability-filter.utils';
import {
  AbilityFilterRailComponent,
  type AbilityFilterRailCategory,
} from '../ability-filter-rail/ability-filter-rail.component';
import { SpecialAbilityPickerComponent } from '../special-ability-picker/special-ability-picker.component';

const PAGE_SIZE = 48;
const CHARACTER_IMAGE_PICKER_MODAL_NAME = 'CharacterImagePickerComponent';

@Component({
  selector: 'app-character-image-picker',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonModal,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonToolbar,
    AbilityFilterRailComponent,
    SpecialAbilityPickerComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './character-image-picker.component.html',
  styleUrl: './character-image-picker.component.scss',
})
export class CharacterImagePickerComponent implements OnChanges {
  @Input({ required: true }) public isOpen = false;
  @Input({ required: true }) public title = '';
  @Input({ required: true }) public copy = '';
  @Input() public applyingSelection = false;
  @Input() public allowedCharacterIds: number[] | null = null;
  @Input() public maxCost: number | null = null;
  @Output() public readonly dismiss = new EventEmitter<void>();
  @Output() public readonly saveSelection = new EventEmitter<CharacterListItem>();

  public readonly closeIcon = closeOutline;
  public readonly loading = signal(false);
  public readonly loadingMore = signal(false);
  public readonly hasMore = signal(true);
  public readonly searchTerm = signal('');
  public readonly selectedType = signal('');
  public readonly selectedClass = signal('');
  public readonly selectedSortMode = signal<CharacterSortMode>('catalog');
  public readonly selectedIdOrder = signal<CharacterIdOrder>('newest');
  public readonly favoritesOnly = signal(false);
  public readonly hideFavorites = signal(false);
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly specialAbilityPickerOpen = signal(false);
  public readonly specialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly crewmateAbilityPickerOpen = signal(false);
  public readonly crewmateAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly potentialAbilityPickerOpen = signal(false);
  public readonly potentialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly supportAbilityPickerOpen = signal(false);
  public readonly supportAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly characters = signal<CharacterListItem[]>([]);
  public readonly selectedCharacter = signal<CharacterListItem | null>(null);
  public readonly selectedCharacterId = computed(() => this.selectedCharacter()?.id ?? null);
  public readonly selectedCharacterActionLabel = computed(
    () => this.selectedCharacter()?.name.trim() ?? '',
  );
  public readonly availableTypes = computed(() =>
    this.normalizeOptions(this.summary()?.availableTypes ?? []),
  );
  public readonly availableClasses = computed(() =>
    this.normalizeOptions(this.summary()?.availableClasses ?? []),
  );
  public readonly availableSpecialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.abilityCatalog()?.abilities ?? [], 'special'),
  );
  public readonly availableCrewmateAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.abilityCatalog()?.abilities ?? [], 'crewmate'),
  );
  public readonly availablePotentialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.abilityCatalog()?.abilities ?? [], 'potential'),
  );
  public readonly availableSupportAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.abilityCatalog()?.abilities ?? [], 'support'),
  );
  public readonly specialAbilityRequirements = computed(() =>
    serializeSpecialAbilityDrafts(
      this.specialAbilityDrafts(),
      this.availableSpecialAbilityCatalogItems(),
    ),
  );
  public readonly specialFilterCharacterIds = computed(() =>
    resolveSpecialAbilityMatchingCharacterIds(
      this.specialAbilityRequirements(),
      this.availableSpecialAbilityCatalogItems(),
    ),
  );
  public readonly crewmateAbilityRequirements = computed(() =>
    serializeCategoryAbilityDrafts(
      this.crewmateAbilityDrafts(),
      this.availableCrewmateAbilityCatalogItems(),
      'crewmate',
    ),
  );
  public readonly potentialAbilityRequirements = computed(() =>
    serializeCategoryAbilityDrafts(
      this.potentialAbilityDrafts(),
      this.availablePotentialAbilityCatalogItems(),
      'potential',
    ),
  );
  public readonly supportAbilityRequirements = computed(() =>
    serializeCategoryAbilityDrafts(
      this.supportAbilityDrafts(),
      this.availableSupportAbilityCatalogItems(),
      'support',
    ),
  );
  public readonly crewmateFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.crewmateAbilityRequirements(),
      this.availableCrewmateAbilityCatalogItems(),
      'crewmate',
    ),
  );
  public readonly potentialFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.potentialAbilityRequirements(),
      this.availablePotentialAbilityCatalogItems(),
      'potential',
    ),
  );
  public readonly supportFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.supportAbilityRequirements(),
      this.availableSupportAbilityCatalogItems(),
      'support',
    ),
  );

  private dismissReason: 'save' | 'cancel' | null = null;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly userState: UserStateService,
  ) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      console.log(`[Modal Open] ${CHARACTER_IMAGE_PICKER_MODAL_NAME}`);
      this.dismissReason = null;
      this.resetState();
      void this.initializePicker();
      return;
    }

    if ((changes['maxCost'] || changes['allowedCharacterIds']) && this.isOpen) {
      void this.loadCharacters(true);
    }
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    this.searchTerm.set((event.detail.value ?? '').trimStart());
    await this.loadCharacters(true);
  }

  public async onTypeChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    this.selectedType.set(typeof event.detail.value === 'string' ? event.detail.value : '');
    await this.loadCharacters(true);
  }

  public async onClassChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    this.selectedClass.set(typeof event.detail.value === 'string' ? event.detail.value : '');
    await this.loadCharacters(true);
  }

  public async onSortModeChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    const value = event.detail.value;

    if (isCharacterSortMode(value)) {
      this.selectedSortMode.set(value);
      await this.loadCharacters(true);
    }
  }

  public async onIdOrderChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    this.selectedIdOrder.set(normalizeCharacterIdOrder(event.detail.value));
    await this.loadCharacters(true);
  }

  public async toggleFavoritesOnly(): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    const nextValue = !this.favoritesOnly();
    this.favoritesOnly.set(nextValue);

    if (nextValue) {
      this.hideFavorites.set(false);
    }

    await this.loadCharacters(true);
  }

  public async toggleHideFavorites(): Promise<void> {
    if (this.applyingSelection) {
      return;
    }

    const nextValue = !this.hideFavorites();
    this.hideFavorites.set(nextValue);

    if (nextValue) {
      this.favoritesOnly.set(false);
    }

    await this.loadCharacters(true);
  }

  public async loadMore(): Promise<void> {
    if (this.applyingSelection || this.loading() || this.loadingMore() || !this.hasMore()) {
      return;
    }

    await this.loadCharacters(false);
  }

  public openSpecialAbilityPicker(): void {
    if (this.applyingSelection || !this.availableSpecialAbilityCatalogItems().length) {
      return;
    }

    this.specialAbilityPickerOpen.set(true);
  }

  public closeSpecialAbilityPicker(): void {
    this.specialAbilityPickerOpen.set(false);
  }

  public async saveSpecialAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.specialAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeSpecialAbilityDrafts(drafts, this.availableSpecialAbilityCatalogItems()),
      ),
    );
    this.specialAbilityPickerOpen.set(false);
    await this.loadCharacters(true);
  }

  public async clearSpecialAbilityFilters(): Promise<void> {
    this.specialAbilityDrafts.set([]);
    await this.loadCharacters(true);
  }

  public openCrewmateAbilityPicker(): void {
    if (this.applyingSelection || !this.availableCrewmateAbilityCatalogItems().length) {
      return;
    }

    this.crewmateAbilityPickerOpen.set(true);
  }

  public closeCrewmateAbilityPicker(): void {
    this.crewmateAbilityPickerOpen.set(false);
  }

  public async saveCrewmateAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.crewmateAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(
          drafts,
          this.availableCrewmateAbilityCatalogItems(),
          'crewmate',
        ),
      ),
    );
    this.crewmateAbilityPickerOpen.set(false);
    await this.loadCharacters(true);
  }

  public async clearCrewmateAbilityFilters(): Promise<void> {
    this.crewmateAbilityDrafts.set([]);
    await this.loadCharacters(true);
  }

  public openPotentialAbilityPicker(): void {
    if (this.applyingSelection || !this.availablePotentialAbilityCatalogItems().length) {
      return;
    }

    this.potentialAbilityPickerOpen.set(true);
  }

  public closePotentialAbilityPicker(): void {
    this.potentialAbilityPickerOpen.set(false);
  }

  public async savePotentialAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.potentialAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(
          drafts,
          this.availablePotentialAbilityCatalogItems(),
          'potential',
        ),
      ),
    );
    this.potentialAbilityPickerOpen.set(false);
    await this.loadCharacters(true);
  }

  public async clearPotentialAbilityFilters(): Promise<void> {
    this.potentialAbilityDrafts.set([]);
    await this.loadCharacters(true);
  }

  public openSupportAbilityPicker(): void {
    if (this.applyingSelection || !this.availableSupportAbilityCatalogItems().length) {
      return;
    }

    this.supportAbilityPickerOpen.set(true);
  }

  public closeSupportAbilityPicker(): void {
    this.supportAbilityPickerOpen.set(false);
  }

  public async saveSupportAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.supportAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(
          drafts,
          this.availableSupportAbilityCatalogItems(),
          'support',
        ),
      ),
    );
    this.supportAbilityPickerOpen.set(false);
    await this.loadCharacters(true);
  }

  public async clearSupportAbilityFilters(): Promise<void> {
    this.supportAbilityDrafts.set([]);
    await this.loadCharacters(true);
  }

  public openAbilityFilterCategory(category: AbilityFilterRailCategory): void {
    switch (category) {
      case 'special':
        this.openSpecialAbilityPicker();
        break;
      case 'crewmate':
        this.openCrewmateAbilityPicker();
        break;
      case 'potential':
        this.openPotentialAbilityPicker();
        break;
      case 'support':
        this.openSupportAbilityPicker();
        break;
    }
  }

  public async clearAbilityFilterCategory(category: AbilityFilterRailCategory): Promise<void> {
    switch (category) {
      case 'special':
        await this.clearSpecialAbilityFilters();
        break;
      case 'crewmate':
        await this.clearCrewmateAbilityFilters();
        break;
      case 'potential':
        await this.clearPotentialAbilityFilters();
        break;
      case 'support':
        await this.clearSupportAbilityFilters();
        break;
    }
  }

  public selectCharacter(character: CharacterListItem): void {
    if (this.applyingSelection) {
      return;
    }

    this.selectedCharacter.set(character);
  }

  public save(): void {
    const selectedCharacter = this.selectedCharacter();

    if (!selectedCharacter || this.applyingSelection) {
      return;
    }

    this.dismissReason = 'save';
    this.saveSelection.emit(selectedCharacter);
  }

  public cancel(): void {
    if (this.applyingSelection) {
      return;
    }

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

  private async initializePicker(): Promise<void> {
    this.loading.set(true);

    try {
      const [, summary, abilityCatalog] = await Promise.all([
        this.userState.ready(),
        this.repository.getDatasetManifest(),
        typeof this.repository.getAutoBuilderAbilityCatalog === 'function'
          ? this.repository.getAutoBuilderAbilityCatalog().catch(() => null)
          : Promise.resolve(null),
        this.characterCatalogCache.ensureLoaded(),
      ]);
      const query = {
        searchTerm: '',
        typeFilter: '',
        classFilter: '',
        sortMode: this.selectedSortMode(),
        idOrder: this.selectedIdOrder(),
        limit: PAGE_SIZE,
        offset: 0,
      };
      const characters = this.characterCatalogCache.queryCharacters(this.applyPickerScope(query));

      this.summary.set(summary);
      this.abilityCatalog.set(abilityCatalog);
      this.characters.set(characters);
      this.hasMore.set(characters.length === PAGE_SIZE);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCharacters(reset: boolean): Promise<void> {
    if (reset) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }

    try {
      await Promise.all([this.userState.ready(), this.characterCatalogCache.ensureLoaded()]);
      const nextOffset = reset ? 0 : this.characters().length;
      const allowedCharacterIds = intersectAbilityMatchingCharacterIds([
        this.specialFilterCharacterIds(),
        this.crewmateFilterCharacterIds(),
        this.potentialFilterCharacterIds(),
        this.supportFilterCharacterIds(),
      ]);
      const query = {
        searchTerm: this.searchTerm().trim(),
        typeFilter: this.selectedType(),
        classFilter: this.selectedClass(),
        sortMode: this.selectedSortMode(),
        idOrder: this.selectedIdOrder(),
        limit: PAGE_SIZE,
        offset: nextOffset,
      };
      const nextPage = this.characterCatalogCache.queryCharacters(
        this.applyPickerScope(
          allowedCharacterIds === undefined ? query : { ...query, allowedCharacterIds },
        ),
      );

      this.characters.set(reset ? nextPage : [...this.characters(), ...nextPage]);
      this.hasMore.set(nextPage.length === PAGE_SIZE);

      const selectedCharacterId = this.selectedCharacterId();

      if (!selectedCharacterId) {
        return;
      }

      const refreshedSelectedCharacter = nextPage.find(
        (character) => character.id === selectedCharacterId,
      );

      if (refreshedSelectedCharacter) {
        this.selectedCharacter.set(refreshedSelectedCharacter);
      }
    } finally {
      if (reset) {
        this.loading.set(false);
      } else {
        this.loadingMore.set(false);
      }
    }
  }

  private resetState(): void {
    this.loading.set(false);
    this.loadingMore.set(false);
    this.hasMore.set(true);
    this.searchTerm.set('');
    this.selectedType.set('');
    this.selectedClass.set('');
    this.selectedSortMode.set('catalog');
    this.selectedIdOrder.set('newest');
    this.favoritesOnly.set(false);
    this.hideFavorites.set(false);
    this.specialAbilityPickerOpen.set(false);
    this.specialAbilityDrafts.set([]);
    this.crewmateAbilityPickerOpen.set(false);
    this.crewmateAbilityDrafts.set([]);
    this.potentialAbilityPickerOpen.set(false);
    this.potentialAbilityDrafts.set([]);
    this.supportAbilityPickerOpen.set(false);
    this.supportAbilityDrafts.set([]);
    this.characters.set([]);
    this.selectedCharacter.set(null);
  }

  private applyPickerScope(query: CharacterSearchQuery): CharacterSearchQuery {
    const favoriteCharacterIds = this.userState.favoriteCharacterIds();
    const scopedAllowedCharacterIds =
      this.allowedCharacterIds === null
        ? query.allowedCharacterIds
        : intersectAbilityMatchingCharacterIds([
            query.allowedCharacterIds,
            this.allowedCharacterIds,
          ]);
    const favoriteScopedAllowedCharacterIds = this.favoritesOnly()
      ? intersectAbilityMatchingCharacterIds([scopedAllowedCharacterIds, favoriteCharacterIds])
      : scopedAllowedCharacterIds;
    const excludedCharacterIds = this.hideFavorites()
      ? [...(query.excludedCharacterIds ?? []), ...favoriteCharacterIds]
      : query.excludedCharacterIds;

    return {
      ...query,
      ...(this.maxCost === null ? {} : { maxCost: this.maxCost }),
      ...(favoriteScopedAllowedCharacterIds === undefined
        ? {}
        : { allowedCharacterIds: favoriteScopedAllowedCharacterIds }),
      ...(excludedCharacterIds === undefined ? {} : { excludedCharacterIds }),
    };
  }

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
  }
}

function isCharacterSortMode(value: string | null | undefined): value is CharacterSortMode {
  return (
    value === 'catalog' ||
    value === 'nameAsc' ||
    value === 'nameDesc' ||
    value === 'captainHpBoost' ||
    value === 'captainAtkBoost' ||
    value === 'captainAverageBoost'
  );
}

function normalizeCharacterIdOrder(value: string | null | undefined): CharacterIdOrder {
  return value === 'oldest' ? 'oldest' : 'newest';
}

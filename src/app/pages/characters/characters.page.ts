import { CommonModule } from '@angular/common';
import { Component, type OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonMenuButton,
  IonModal,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToggle,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  closeOutline,
  cloudUploadOutline,
  documentTextOutline,
  heart,
  heartOutline,
  layersOutline,
  searchOutline,
  sparklesOutline,
} from 'ionicons/icons';

import { type AutoBuildAbilityCatalog } from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSortMode,
  type DatasetManifest,
} from '../../core/models/optc.models';
import {
  type OptcbxImportResult,
  type OptcbxParsedImport,
} from '../../core/models/optcbx-import.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { OptcbxImportService } from '../../core/services/optcbx-import.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  createAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from '../../core/services/ability-requirement-draft.utils';
import {
  getAbilityCatalogItemsByCategory,
  intersectAbilityMatchingCharacterIds,
  resolveCategoryAbilityMatchingCharacterIds,
  resolveSpecialAbilityMatchingCharacterIds,
  serializeCategoryAbilityDrafts,
  serializeSpecialAbilityDrafts,
} from '../../core/services/special-ability-filter.utils';
import { SpecialAbilityPickerComponent } from '../../shared/special-ability-picker/special-ability-picker.component';
import {
  AbilityFilterRailComponent,
  type AbilityFilterRailItem,
  type AbilityFilterRailCategory,
} from '../../shared/ability-filter-rail/ability-filter-rail.component';
import {
  buildOptcbxFavoritesExportPayload,
  downloadOptcbxFavoritesExport,
} from './characters-favorites.utils';

const PAGE_SIZE = 100;
type CharacterDisplayMode = 'list' | 'compact';
type CompactAbilityFilterCategory = AbilityFilterRailCategory;

interface CharacterCatalogCardView {
  character: CharacterListItem;
  detailLink: string[];
  isFavorite: boolean;
  favoriteAriaLabel: string;
}

interface AbilityFilterBadgeView {
  draftId: string;
  abilityKey: string;
  label: string;
  badge: string;
}

interface AbilityFilterGroupView {
  category: CompactAbilityFilterCategory;
  labelKey: string;
  clearLabelKey: string;
  badges: AbilityFilterBadgeView[];
}

@Component({
  selector: 'app-characters-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonMenuButton,
    IonModal,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonToggle,
    IonTitle,
    IonToolbar,
    AbilityFilterRailComponent,
    SpecialAbilityPickerComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './characters.page.html',
  styleUrl: './characters.page.scss',
})
export class CharactersPage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly characters = signal<CharacterListItem[]>([]);
  public readonly loading = signal(true);
  public readonly loadingMore = signal(false);
  public readonly hasMore = signal(true);
  public readonly searchTerm = signal('');
  public readonly typeQuery = signal('');
  public readonly classQuery = signal('');
  public readonly selectedType = signal('');
  public readonly selectedClass = signal('');
  public readonly favoritesOnly = signal(false);
  public readonly hideFavorites = signal(false);
  public readonly selectedSortMode = signal<CharacterSortMode>('catalog');
  public readonly selectedIdOrder = signal<CharacterIdOrder>('newest');
  public readonly specialAbilityPickerOpen = signal(false);
  public readonly specialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly crewmateAbilityPickerOpen = signal(false);
  public readonly crewmateAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly potentialAbilityPickerOpen = signal(false);
  public readonly potentialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly supportAbilityPickerOpen = signal(false);
  public readonly supportAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly displayMode = signal<CharacterDisplayMode>('compact');
  public readonly favoriteIds;
  public readonly canDownloadFavoritesExport = computed(() => this.favoriteIds().length > 0);
  public readonly canClearAllFavorites = computed(() => this.favoriteIds().length > 0);
  public readonly importModalOpen = signal(false);
  public readonly draggingImportFile = signal(false);
  public readonly importFileName = signal('');
  public readonly importErrorMessage = signal('');
  public readonly parsedImport = signal<OptcbxParsedImport | null>(null);
  public readonly importResult = signal<OptcbxImportResult | null>(null);
  public readonly importingFavorites = signal(false);
  public readonly hasImportReady = computed(() => this.parsedImport() !== null);
  public readonly unmatchedPreview = computed(
    () => this.importResult()?.unmatchedIds.slice(0, 12) ?? [],
  );
  public readonly remainingUnmatchedCount = computed(() =>
    Math.max(0, (this.importResult()?.unmatchedIds.length ?? 0) - this.unmatchedPreview().length),
  );
  public readonly availableTypes = computed(() =>
    this.normalizeOptions(this.summary()?.availableTypes ?? []),
  );
  public readonly availableClasses = computed(() =>
    this.normalizeOptions(this.summary()?.availableClasses ?? []),
  );
  public readonly filteredTypeOptions = computed(() =>
    this.filterOptions(this.availableTypes(), this.typeQuery(), this.selectedType()),
  );
  public readonly filteredClassOptions = computed(() =>
    this.filterOptions(this.availableClasses(), this.classQuery(), this.selectedClass()),
  );
  public readonly showTypeSuggestions = computed(
    () => this.filteredTypeOptions().length > 0 && this.typeQuery().trim() !== this.selectedType(),
  );
  public readonly showClassSuggestions = computed(
    () =>
      this.filteredClassOptions().length > 0 && this.classQuery().trim() !== this.selectedClass(),
  );
  public readonly isCompactDisplayMode = computed(() => this.displayMode() === 'compact');
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
  public readonly specialFilterCharacterIds = computed(() =>
    resolveSpecialAbilityMatchingCharacterIds(
      this.specialAbilityRequirements(),
      this.availableSpecialAbilityCatalogItems(),
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
  public readonly activeAbilityFilterGroups = computed<AbilityFilterGroupView[]>(() =>
    [
      this.buildAbilityFilterGroup(
        'special',
        this.specialAbilityDrafts(),
        this.availableSpecialAbilityCatalogItems(),
      ),
      this.buildAbilityFilterGroup(
        'crewmate',
        this.crewmateAbilityDrafts(),
        this.availableCrewmateAbilityCatalogItems(),
      ),
      this.buildAbilityFilterGroup(
        'potential',
        this.potentialAbilityDrafts(),
        this.availablePotentialAbilityCatalogItems(),
      ),
      this.buildAbilityFilterGroup(
        'support',
        this.supportAbilityDrafts(),
        this.availableSupportAbilityCatalogItems(),
      ),
    ].filter((group) => group.badges.length > 0),
  );
  public readonly abilityFilterRailItems = computed<AbilityFilterRailItem[]>(() => [
    {
      category: 'special',
      label: this.i18n.translate('filters.special.eyebrow', undefined, 'characters'),
      count: this.specialAbilityDrafts().length,
      disabled: !this.availableSpecialAbilityCatalogItems().length,
    },
    {
      category: 'crewmate',
      label: this.i18n.translate('filters.crewmate.eyebrow', undefined, 'characters'),
      count: this.crewmateAbilityDrafts().length,
      disabled: !this.availableCrewmateAbilityCatalogItems().length,
    },
    {
      category: 'potential',
      label: this.i18n.translate('filters.potential.eyebrow', undefined, 'characters'),
      count: this.potentialAbilityDrafts().length,
      disabled: !this.availablePotentialAbilityCatalogItems().length,
    },
    {
      category: 'support',
      label: this.i18n.translate('filters.support.eyebrow', undefined, 'characters'),
      count: this.supportAbilityDrafts().length,
      disabled: !this.availableSupportAbilityCatalogItems().length,
    },
  ]);
  public readonly characterCardViews = computed<CharacterCatalogCardView[]>(() =>
    this.characters().map((character) => {
      const isFavorite = this.isFavorite(character.id);

      return {
        character,
        detailLink: ['/characters', character.id.toString()],
        isFavorite,
        favoriteAriaLabel: this.i18n.translate(
          isFavorite ? 'favorites.removeAria' : 'favorites.addAria',
          { name: character.name },
          'characters',
        ),
      };
    }),
  );
  public readonly hideFavoritesSupportLabel = computed(() =>
    this.favoriteIds().length
      ? this.i18n.translate(
          'filters.hideFavorites.withCount',
          { count: this.favoriteIds().length },
          'characters',
        )
      : this.i18n.translate('filters.hideFavorites.empty', undefined, 'characters'),
  );
  public readonly favoritesOnlySupportLabel = computed(() =>
    this.favoriteIds().length
      ? this.i18n.translate(
          'filters.favoritesOnly.withCount',
          { count: this.favoriteIds().length },
          'characters',
        )
      : this.i18n.translate('filters.favoritesOnly.empty', undefined, 'characters'),
  );

  public readonly searchIcon = searchOutline;
  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly uploadIcon = cloudUploadOutline;
  public readonly fileIcon = documentTextOutline;
  public readonly closeIcon = closeOutline;
  public readonly successIcon = checkmarkCircleOutline;
  public readonly errorIcon = alertCircleOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly userState: UserStateService,
    private readonly optcbxImport: OptcbxImportService,
    private readonly i18n: AppI18nService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    const [summary, abilityCatalog] = await Promise.all([
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      this.characterCatalogCache.ensureLoaded(),
    ]);
    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);
    await this.loadCharacters(true);
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.searchTerm.set((event.detail.value ?? '').trim());
    await this.loadCharacters(true);
  }

  public async onTypeQueryChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const nextValue = (event.detail.value ?? '').trimStart();
    this.typeQuery.set(nextValue);

    if (this.selectedType() && nextValue.trim() !== this.selectedType()) {
      this.selectedType.set('');
      await this.loadCharacters(true);
    }
  }

  public async onClassQueryChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const nextValue = (event.detail.value ?? '').trimStart();
    this.classQuery.set(nextValue);

    if (this.selectedClass() && nextValue.trim() !== this.selectedClass()) {
      this.selectedClass.set('');
      await this.loadCharacters(true);
    }
  }

  public async applyTypeFilter(type: string): Promise<void> {
    if (this.selectedType() === type) {
      return;
    }

    this.typeQuery.set(type);
    this.selectedType.set(type);
    await this.loadCharacters(true);
  }

  public async applyClassFilter(characterClass: string): Promise<void> {
    if (this.selectedClass() === characterClass) {
      return;
    }

    this.classQuery.set(characterClass);
    this.selectedClass.set(characterClass);
    await this.loadCharacters(true);
  }

  public async clearTypeFilter(): Promise<void> {
    const hadSelection = Boolean(this.selectedType());
    this.typeQuery.set('');

    if (!hadSelection) {
      return;
    }

    this.selectedType.set('');
    await this.loadCharacters(true);
  }

  public async clearClassFilter(): Promise<void> {
    const hadSelection = Boolean(this.selectedClass());
    this.classQuery.set('');

    if (!hadSelection) {
      return;
    }

    this.selectedClass.set('');
    await this.loadCharacters(true);
  }

  public async onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
    this.favoritesOnly.set(event.detail.checked);

    if (event.detail.checked) {
      this.hideFavorites.set(false);
    }

    await this.loadCharacters(true);
  }

  public async onHideFavoritesToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
    this.hideFavorites.set(event.detail.checked);

    if (event.detail.checked) {
      this.favoritesOnly.set(false);
    }

    await this.loadCharacters(true);
  }

  public setDisplayMode(displayMode: CharacterDisplayMode): void {
    this.displayMode.set(displayMode);
  }

  public async onSortModeChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedSortMode.set(this.normalizeSortMode(event.detail.value));
    await this.loadCharacters(true);
  }

  public async onIdOrderChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedIdOrder.set(this.normalizeIdOrder(event.detail.value));
    await this.loadCharacters(true);
  }

  public openSpecialAbilityPicker(): void {
    if (!this.availableSpecialAbilityCatalogItems().length) {
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
    if (!this.availableCrewmateAbilityCatalogItems().length) {
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
    if (!this.availablePotentialAbilityCatalogItems().length) {
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
    if (!this.availableSupportAbilityCatalogItems().length) {
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

  public async removeAbilityFilterBadge(
    category: CompactAbilityFilterCategory,
    draftId: string,
  ): Promise<void> {
    const updateDrafts = (drafts: AbilityRequirementDraft[]) =>
      drafts.filter((draft) => draft.draftId !== draftId);

    switch (category) {
      case 'special':
        this.specialAbilityDrafts.update(updateDrafts);
        break;
      case 'crewmate':
        this.crewmateAbilityDrafts.update(updateDrafts);
        break;
      case 'potential':
        this.potentialAbilityDrafts.update(updateDrafts);
        break;
      case 'support':
        this.supportAbilityDrafts.update(updateDrafts);
        break;
    }

    await this.loadCharacters(true);
  }

  public async clearAbilityFilterCategory(category: CompactAbilityFilterCategory): Promise<void> {
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

  public openAbilityFilterCategory(category: CompactAbilityFilterCategory): void {
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

  public async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }

    this.loadingMore.set(true);
    await this.loadCharacters(false);
    this.loadingMore.set(false);
  }

  public openImportModal(): void {
    this.resetImportState();
    this.importModalOpen.set(true);
  }

  public closeImportModal(): void {
    this.importModalOpen.set(false);
    this.resetImportState();
  }

  public openFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = '';

    if (!file) {
      return;
    }

    await this.loadImportFile(file);
  }

  public onImportDragOver(event: DragEvent): void {
    event.preventDefault();
    this.draggingImportFile.set(true);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  public onImportDragLeave(event: DragEvent): void {
    event.preventDefault();

    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;

    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    this.draggingImportFile.set(false);
  }

  public async onImportDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.draggingImportFile.set(false);

    const file = event.dataTransfer?.files?.item(0);

    if (!file) {
      this.importErrorMessage.set(
        this.i18n.translate('import.errors.dropJson', undefined, 'characters'),
      );
      return;
    }

    await this.loadImportFile(file);
  }

  public async importFavorites(): Promise<void> {
    const parsedImport = this.parsedImport();

    if (!parsedImport || this.importingFavorites()) {
      return;
    }

    this.importingFavorites.set(true);
    this.importErrorMessage.set('');

    try {
      const currentFavoriteIds = this.userState.favoriteCharacterIds();
      const importResult = await this.optcbxImport.buildMergeImportResult(
        parsedImport,
        currentFavoriteIds,
      );
      const nextFavoriteIds = this.optcbxImport.mergeFavoriteIds(
        importResult.matchedIds,
        currentFavoriteIds,
      );

      await this.userState.setFavoriteCharacterIds(nextFavoriteIds);
      this.importResult.set(importResult);

      if (this.favoritesOnly() || this.hideFavorites()) {
        await this.loadCharacters(true);
      }
    } catch (error) {
      this.importErrorMessage.set(this.resolveImportError(error));
    } finally {
      this.importingFavorites.set(false);
    }
  }

  public async downloadFavoritesExport(): Promise<void> {
    if (!this.canDownloadFavoritesExport()) {
      return;
    }

    await this.characterCatalogCache.ensureLoaded();
    const favoriteIds = this.favoriteIds();
    const favoriteCharacters = this.characterCatalogCache.getCharactersByIds(favoriteIds);
    const payload = buildOptcbxFavoritesExportPayload(favoriteIds, favoriteCharacters);

    downloadOptcbxFavoritesExport(payload);
  }

  public async toggleFavorite(characterId: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.userState.toggleFavorite(characterId);

    if (this.favoritesOnly() || this.hideFavorites()) {
      await this.loadCharacters(true);
    }
  }

  public async clearAllFavorites(): Promise<void> {
    if (
      !this.canClearAllFavorites() ||
      !this.confirmAction(this.i18n.translate('favorites.clearAllConfirm', undefined, 'characters'))
    ) {
      return;
    }

    await this.userState.setFavoriteCharacterIds([]);

    if (this.favoritesOnly() || this.hideFavorites()) {
      await this.loadCharacters(true);
    }
  }

  public async resetPage(): Promise<void> {
    this.searchTerm.set('');
    this.typeQuery.set('');
    this.classQuery.set('');
    this.selectedType.set('');
    this.selectedClass.set('');
    this.favoritesOnly.set(false);
    this.hideFavorites.set(false);
    this.selectedSortMode.set('catalog');
    this.selectedIdOrder.set('newest');
    this.specialAbilityPickerOpen.set(false);
    this.specialAbilityDrafts.set([]);
    this.crewmateAbilityPickerOpen.set(false);
    this.crewmateAbilityDrafts.set([]);
    this.potentialAbilityPickerOpen.set(false);
    this.potentialAbilityDrafts.set([]);
    this.supportAbilityPickerOpen.set(false);
    this.supportAbilityDrafts.set([]);
    this.characters.set([]);
    this.loadingMore.set(false);
    this.hasMore.set(true);
    this.importModalOpen.set(false);
    this.resetImportState();
    await this.loadCharacters(true);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }

  public trackCharacter(_: number, character: CharacterListItem): number {
    return character.id;
  }

  public resetSelectedFile(): void {
    this.importFileName.set('');
    this.importErrorMessage.set('');
    this.parsedImport.set(null);
    this.importResult.set(null);
    this.draggingImportFile.set(false);
  }

  private async loadCharacters(reset: boolean): Promise<void> {
    if (reset) {
      this.loading.set(true);
    }

    await this.characterCatalogCache.ensureLoaded();
    const nextOffset = reset ? 0 : this.characters().length;
    const excludedCharacterIds = this.hideFavorites() ? this.favoriteIds() : undefined;
    const nextPage = this.characterCatalogCache.queryCharacters({
      searchTerm: this.searchTerm(),
      typeFilter: this.selectedType(),
      classFilter: this.selectedClass(),
      allowedCharacterIds: this.resolveAllowedCharacterIds(),
      ...(excludedCharacterIds ? { excludedCharacterIds } : {}),
      sortMode: this.selectedSortMode(),
      idOrder: this.selectedIdOrder(),
      limit: PAGE_SIZE,
      offset: nextOffset,
    });

    this.characters.set(reset ? nextPage : [...this.characters(), ...nextPage]);
    this.hasMore.set(nextPage.length === PAGE_SIZE);
    this.loading.set(false);
  }

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  private resolveAllowedCharacterIds(): number[] | undefined {
    const favoriteIds = this.favoritesOnly() ? this.favoriteIds() : undefined;
    return intersectAbilityMatchingCharacterIds([
      this.specialFilterCharacterIds(),
      this.crewmateFilterCharacterIds(),
      this.potentialFilterCharacterIds(),
      this.supportFilterCharacterIds(),
      favoriteIds,
    ]);
  }

  private normalizeSortMode(value: string | null | undefined): CharacterSortMode {
    return value === 'nameAsc' ||
      value === 'nameDesc' ||
      value === 'captainHpBoost' ||
      value === 'captainAtkBoost' ||
      value === 'captainAverageBoost'
      ? value
      : 'catalog';
  }

  private normalizeIdOrder(value: string | null | undefined): CharacterIdOrder {
    return value === 'oldest' ? 'oldest' : 'newest';
  }

  private filterOptions(options: string[], query: string, selectedValue: string): string[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options.slice(0, 8);
    }

    return options
      .filter((option) => option.toLowerCase().includes(normalizedQuery))
      .filter((option) => option !== selectedValue)
      .slice(0, 8);
  }

  private buildAbilityFilterGroup(
    category: CompactAbilityFilterCategory,
    drafts: AbilityRequirementDraft[],
    catalogItems: { key: string; label: string }[],
  ): AbilityFilterGroupView {
    const catalogMap = new Map(catalogItems.map((item) => [item.key, item.label] as const));

    return {
      category,
      labelKey: `filters.${category}.label`,
      clearLabelKey: `filters.${category}.clear`,
      badges: drafts.map((draft) => {
        const label = catalogMap.get(draft.abilityKey) ?? draft.abilityKey;

        return {
          draftId: draft.draftId,
          abilityKey: draft.abilityKey,
          label,
          badge: this.resolveAbilityBadge(label),
        };
      }),
    };
  }

  private resolveAbilityBadge(label: string): string {
    return label
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  private async loadImportFile(file: File): Promise<void> {
    this.importFileName.set(file.name);
    this.importErrorMessage.set('');
    this.importResult.set(null);
    this.parsedImport.set(null);

    try {
      const rawContent = await file.text();
      const parsedImport = this.optcbxImport.parseExport(rawContent);

      this.parsedImport.set(parsedImport);
    } catch (error) {
      this.importErrorMessage.set(this.resolveImportError(error));
    }
  }

  private resolveImportError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }

    return this.i18n.translate('import.errors.generic', undefined, 'characters');
  }

  private resetImportState(): void {
    this.draggingImportFile.set(false);
    this.importFileName.set('');
    this.importErrorMessage.set('');
    this.parsedImport.set(null);
    this.importResult.set(null);
    this.importingFavorites.set(false);
  }

  private confirmAction(message: string): boolean {
    return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
  }
}

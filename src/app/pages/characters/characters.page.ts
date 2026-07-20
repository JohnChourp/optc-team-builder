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
  IonMenuButton,
  IonModal,
  IonSearchbar,
  IonSpinner,
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

import {
  type AbilityFilterTagSetSelection,
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSortMode,
  type CharacterTagSetSelection,
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
  cloneAbilityFilterTagSetSelection,
  createEmptyAbilityFilterTagSetSelection,
  resolveTagSetSelectionMatchingCharacterIds,
} from '../../core/services/ability-filter-tag-set.utils';
import { createEmptyCharacterTagSetSelection } from '../../core/services/character-tag-set.utils';
import {
  getAbilityCatalogItemsByCategory,
  getCaptainAbilityCatalogItems,
  intersectAbilityMatchingCharacterIds,
  isCaptainAbilityRequirement,
} from '../../core/services/special-ability-filter.utils';
import {
  AbilityTagSetPickerComponent,
  type AbilityTagSetPickerSection,
} from '../../shared/ability-tag-set-picker/ability-tag-set-picker.component';
import {
  AbilityFilterRailComponent,
  type AbilityFilterRailItem,
  type AbilityFilterRailCategory,
} from '../../shared/ability-filter-rail/ability-filter-rail.component';
import {
  CharacterFilterRowComponent,
  type CharacterFilterOption,
} from '../../shared/character-filter-row/character-filter-row.component';
import {
  CharacterTagFilterComponent,
  type CharacterTagFilterChange,
} from '../../shared/character-tag-filter/character-tag-filter.component';
import {
  buildOptcbxFavoritesExportPayload,
  downloadOptcbxFavoritesExport,
} from './characters-favorites.utils';
import {
  CharactersCatalogPanelComponent,
  CharactersImportPanelComponent,
} from './characters-style-panels.component';

const PAGE_SIZE = 100;
/** Shared empty catalog so `allCatalogItems` keeps a stable identity while loading. */
const EMPTY_CATALOG_ITEMS: AutoBuildAbilityCatalogItem[] = [];
/** Non-captain rail categories, in the order a requirement is attributed to one. */
const CATALOG_ABILITY_CATEGORIES = ['special', 'crewmate', 'potential', 'support'] as const;
type CharacterDisplayMode = 'list' | 'compact';
type CompactAbilityFilterCategory = AbilityFilterRailCategory;

interface CharacterCatalogCardView {
  character: CharacterListItem;
  detailLink: string[];
  isFavorite: boolean;
  favoriteAriaLabel: string;
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
    IonMenuButton,
    IonModal,
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToolbar,
    AbilityFilterRailComponent,
    CharacterFilterRowComponent,
    CharacterTagFilterComponent,
    CharactersCatalogPanelComponent,
    CharactersImportPanelComponent,
    AbilityTagSetPickerComponent,
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
  public readonly tagSetPickerOpen = signal(false);
  public readonly tagSetSelection = signal<AbilityFilterTagSetSelection>(
    createEmptyAbilityFilterTagSetSelection(),
  );
  public readonly characterTagSetSelection = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );
  /** `undefined` = no tag filter. NEVER assign `[]` here for an empty selection. */
  public readonly characterTagCharacterIds = signal<number[] | undefined>(undefined);
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
  /**
   * The full catalog behind every tag set, kept as one memoized array because
   * `getCatalogAbilityIndex` caches by array identity — a fresh array per read
   * would silently downgrade its O(1) lookups to full catalog scans.
   */
  public readonly allCatalogItems = computed<AutoBuildAbilityCatalogItem[]>(
    () => this.abilityCatalog()?.abilities ?? EMPTY_CATALOG_ITEMS,
  );
  public readonly availableCaptainAbilityCatalogItems = computed(() =>
    getCaptainAbilityCatalogItems(this.allCatalogItems()),
  );
  public readonly availableSpecialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.allCatalogItems(), 'special'),
  );
  public readonly availableCrewmateAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.allCatalogItems(), 'crewmate'),
  );
  public readonly availablePotentialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.allCatalogItems(), 'potential'),
  );
  public readonly availableSupportAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.allCatalogItems(), 'support'),
  );
  public readonly abilityFilterCharacterIds = computed(() =>
    resolveTagSetSelectionMatchingCharacterIds(this.tagSetSelection(), this.allCatalogItems()),
  );
  /** Ability keys per rail category, so a requirement can be attributed to a chip. */
  private readonly abilityFilterCategoryKeys = computed(() => ({
    captainAbility: new Set(this.availableCaptainAbilityCatalogItems().map((item) => item.key)),
    special: new Set(this.availableSpecialAbilityCatalogItems().map((item) => item.key)),
    crewmate: new Set(this.availableCrewmateAbilityCatalogItems().map((item) => item.key)),
    potential: new Set(this.availablePotentialAbilityCatalogItems().map((item) => item.key)),
    support: new Set(this.availableSupportAbilityCatalogItems().map((item) => item.key)),
  }));
  /** How many requirements of each category the selection holds, across all sets. */
  private readonly abilityFilterCategoryCounts = computed<
    Record<CompactAbilityFilterCategory, number>
  >(() => {
    const counts: Record<CompactAbilityFilterCategory, number> = {
      captainAbility: 0,
      special: 0,
      crewmate: 0,
      potential: 0,
      support: 0,
    };

    for (const set of this.tagSetSelection().sets) {
      for (const requirement of set.requirements) {
        const category = this.resolveRequirementCategory(requirement);

        if (category) {
          counts[category] += 1;
        }
      }
    }

    return counts;
  });
  public readonly tagSetPickerSections = computed<AbilityTagSetPickerSection[]>(() =>
    [
      {
        category: 'captainAbility',
        label: this.i18n.translate('filters.captainAbility.eyebrow', undefined, 'characters'),
        items: this.availableCaptainAbilityCatalogItems(),
        captainAbility: true,
      },
      {
        category: 'special',
        label: this.i18n.translate('filters.special.eyebrow', undefined, 'characters'),
        items: this.availableSpecialAbilityCatalogItems(),
      },
      {
        category: 'crewmate',
        label: this.i18n.translate('filters.crewmate.eyebrow', undefined, 'characters'),
        items: this.availableCrewmateAbilityCatalogItems(),
      },
      {
        category: 'potential',
        label: this.i18n.translate('filters.potential.eyebrow', undefined, 'characters'),
        items: this.availablePotentialAbilityCatalogItems(),
      },
      {
        category: 'support',
        label: this.i18n.translate('filters.support.eyebrow', undefined, 'characters'),
        items: this.availableSupportAbilityCatalogItems(),
      },
    ].filter((section) => section.items.length > 0),
  );
  public readonly abilityFilterRailItems = computed<AbilityFilterRailItem[]>(() => {
    const counts = this.abilityFilterCategoryCounts();

    return [
      {
        category: 'captainAbility',
        label: this.i18n.translate('filters.captainAbility.eyebrow', undefined, 'characters'),
        count: counts.captainAbility,
        disabled: !this.availableCaptainAbilityCatalogItems().length,
      },
      {
        category: 'special',
        label: this.i18n.translate('filters.special.eyebrow', undefined, 'characters'),
        count: counts.special,
        disabled: !this.availableSpecialAbilityCatalogItems().length,
      },
      {
        category: 'crewmate',
        label: this.i18n.translate('filters.crewmate.eyebrow', undefined, 'characters'),
        count: counts.crewmate,
        disabled: !this.availableCrewmateAbilityCatalogItems().length,
      },
      {
        category: 'potential',
        label: this.i18n.translate('filters.potential.eyebrow', undefined, 'characters'),
        count: counts.potential,
        disabled: !this.availablePotentialAbilityCatalogItems().length,
      },
      {
        category: 'support',
        label: this.i18n.translate('filters.support.eyebrow', undefined, 'characters'),
        count: counts.support,
        disabled: !this.availableSupportAbilityCatalogItems().length,
      },
    ];
  });
  public readonly sortFilterOptions = computed<CharacterFilterOption[]>(() => [
    { value: 'catalog', label: this.i18n.translate('sort.options.catalog', undefined, 'characters') },
    { value: 'nameAsc', label: this.i18n.translate('sort.options.nameAsc', undefined, 'characters') },
    {
      value: 'nameDesc',
      label: this.i18n.translate('sort.options.nameDesc', undefined, 'characters'),
    },
    {
      value: 'captainHpBoost',
      label: this.i18n.translate('sort.options.captainHpBoost', undefined, 'characters'),
    },
    {
      value: 'captainAtkBoost',
      label: this.i18n.translate('sort.options.captainAtkBoost', undefined, 'characters'),
    },
    {
      value: 'captainAverageBoost',
      label: this.i18n.translate('sort.options.captainAverageBoost', undefined, 'characters'),
    },
  ]);
  public readonly idOrderFilterOptions = computed<CharacterFilterOption[]>(() => [
    {
      value: 'newest',
      label: this.i18n.translate('idOrder.options.newest', undefined, 'characters'),
    },
    {
      value: 'oldest',
      label: this.i18n.translate('idOrder.options.oldest', undefined, 'characters'),
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
    await this.userState.readyFavoriteCharacterIds();
    const [summary, abilityCatalog] = await Promise.all([
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      this.characterCatalogCache.ensureLoaded(),
      this.i18n.preloadScope('ability-tag-sets'),
      this.i18n.preloadScope('character-tag-sets'),
      this.i18n.preloadScope('character-tag-filter'),
    ]);
    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);
    await this.loadCharacters(true);
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.searchTerm.set((event.detail.value ?? '').trim());
    await this.loadCharacters(true);
  }

  public async onTypeQueryChange(
    input: string | CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    const nextValue = this.resolveStringInput(input).trimStart();
    this.typeQuery.set(nextValue);

    if (this.selectedType() && nextValue.trim() !== this.selectedType()) {
      this.selectedType.set('');
      await this.loadCharacters(true);
    }
  }

  public async onClassQueryChange(
    input: string | CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    const nextValue = this.resolveStringInput(input).trimStart();
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

  public async onFavoritesOnlyToggle(
    input: boolean | CustomEvent<{ checked?: boolean | null }>,
  ): Promise<void> {
    const checked = this.resolveCheckedInput(input);

    this.favoritesOnly.set(checked);

    if (checked) {
      this.hideFavorites.set(false);
    }

    await this.loadCharacters(true);
  }

  public async onHideFavoritesToggle(
    input: boolean | CustomEvent<{ checked?: boolean | null }>,
  ): Promise<void> {
    const checked = this.resolveCheckedInput(input);

    this.hideFavorites.set(checked);

    if (checked) {
      this.favoritesOnly.set(false);
    }

    await this.loadCharacters(true);
  }

  public setDisplayMode(displayMode: CharacterDisplayMode): void {
    this.displayMode.set(displayMode);
  }

  public async onSortModeChange(
    input: string | CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    this.selectedSortMode.set(this.normalizeSortMode(this.resolveStringInput(input)));
    await this.loadCharacters(true);
  }

  public async onIdOrderChange(
    input: string | CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    this.selectedIdOrder.set(this.normalizeIdOrder(this.resolveStringInput(input)));
    await this.loadCharacters(true);
  }

  /** Every rail chip opens the same modal — the chips only report per-category counts. */
  public openAbilityTagSetPicker(): void {
    if (!this.tagSetPickerSections().length) {
      return;
    }

    this.tagSetPickerOpen.set(true);
  }

  public closeAbilityTagSetPicker(): void {
    this.tagSetPickerOpen.set(false);
  }

  public async saveAbilityTagSetPicker(selection: AbilityFilterTagSetSelection): Promise<void> {
    this.tagSetSelection.set(cloneAbilityFilterTagSetSelection(selection));
    this.tagSetPickerOpen.set(false);
    await this.loadCharacters(true);
  }

  /**
   * The shared character-tag shell owns the modal and the id resolution; the page
   * only stores what it emits. `matchingCharacterIds` is `undefined` for a
   * selection that constrains nothing, and must never be coerced to `[]`.
   */
  public async onCharacterTagFilterChange(change: CharacterTagFilterChange): Promise<void> {
    this.characterTagSetSelection.set(change.selection);
    this.characterTagCharacterIds.set(change.matchingCharacterIds);
    await this.loadCharacters(true);
  }

  /**
   * Drops one category's requirements out of every set. A set left empty is
   * removed too: an empty set constrains nothing, so keeping it would only show
   * a phantom group the next time the modal opens.
   */
  public async clearAbilityFilterCategory(category: CompactAbilityFilterCategory): Promise<void> {
    this.tagSetSelection.update((selection) => ({
      ...selection,
      sets: selection.sets
        .map((set) => ({
          ...set,
          requirements: set.requirements.filter(
            (requirement) => this.resolveRequirementCategory(requirement) !== category,
          ),
        }))
        .filter((set) => set.requirements.length > 0),
    }));
    await this.loadCharacters(true);
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
    this.tagSetPickerOpen.set(false);
    this.tagSetSelection.set(createEmptyAbilityFilterTagSetSelection());
    this.characterTagSetSelection.set(createEmptyCharacterTagSetSelection());
    this.characterTagCharacterIds.set(undefined);
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

  private resolveStringInput(input: string | CustomEvent<{ value?: string | null }>): string {
    return typeof input === 'string' ? input : (input.detail.value ?? '');
  }

  private resolveCheckedInput(input: boolean | CustomEvent<{ checked?: boolean | null }>): boolean {
    return typeof input === 'boolean' ? input : Boolean(input.detail.checked);
  }

  private resolveAllowedCharacterIds(): number[] | undefined {
    const favoriteIds = this.favoritesOnly() ? this.favoriteIds() : undefined;
    return intersectAbilityMatchingCharacterIds([
      this.abilityFilterCharacterIds(),
      this.characterTagCharacterIds(),
      favoriteIds,
    ]);
  }

  /**
   * Maps a requirement back to the rail chip that owns it. Captain requirements
   * are identified by their source scope rather than their key, because the same
   * ability key also exists as a plain Special entry.
   */
  private resolveRequirementCategory(
    requirement: AutoBuildAbilityRequirement,
  ): CompactAbilityFilterCategory | null {
    const categoryKeys = this.abilityFilterCategoryKeys();

    if (isCaptainAbilityRequirement(requirement)) {
      return categoryKeys.captainAbility.has(requirement.abilityKey) ? 'captainAbility' : null;
    }

    return (
      CATALOG_ABILITY_CATEGORIES.find((category) =>
        categoryKeys[category].has(requirement.abilityKey),
      ) ?? null
    );
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

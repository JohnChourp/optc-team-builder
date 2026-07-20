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
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  addCircleOutline,
  albumsOutline,
  heart,
  heartOutline,
  layersOutline,
  peopleOutline,
  searchOutline,
  trashOutline,
} from 'ionicons/icons';

import {
  type CharacterBox,
  type CharacterDetailRecord,
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSortMode,
  type CharacterTagSetSelection,
  type DatasetManifest,
  type DetailedCharacterSearchQuery,
} from '../../core/models/optc.models';
import {
  type AbilityFilterTagSetSelection,
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  cloneAbilityFilterTagSetSelection,
  createEmptyAbilityFilterTagSetSelection,
  resolveTagSetSelectionMatchingCharacterIds,
} from '../../core/services/ability-filter-tag-set.utils';
import { createEmptyCharacterTagSetSelection } from '../../core/services/character-tag-set.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import {
  getAbilityCatalogItemsByCategory,
  getCaptainAbilityCatalogItems,
  intersectAbilityMatchingCharacterIds,
} from '../../core/services/special-ability-filter.utils';
import { UserStateService } from '../../core/services/user-state.service';
import {
  AbilityFilterRailComponent,
  type AbilityFilterRailCategory,
  type AbilityFilterRailItem,
} from '../../shared/ability-filter-rail/ability-filter-rail.component';
import {
  AbilityTagSetPickerComponent,
  type AbilityTagSetPickerSection,
} from '../../shared/ability-tag-set-picker/ability-tag-set-picker.component';
import {
  CharacterFilterRowComponent,
  type CharacterFilterCostBound,
  type CharacterFilterOption,
} from '../../shared/character-filter-row/character-filter-row.component';
import {
  CharacterTagFilterComponent,
  type CharacterTagFilterChange,
} from '../../shared/character-tag-filter/character-tag-filter.component';
import { CharacterBoxesStylePanelsComponent } from './character-boxes-style-panels.component';

const PAGE_SIZE = 48;
const FILTERED_SELECT_PAGE_SIZE = 500;
type CharacterBoxesFavoriteFilter = 'all' | 'favorites' | 'hideFavorites';
type CharacterBoxesMembershipFilter = 'all' | 'inBox' | 'notInBox';
type CharacterBoxesDisplayMode = 'list' | 'compact';
type CharacterBoxesAbilityFilterCategory = AbilityFilterRailCategory;

interface CharacterBoxesCostRange {
  min: number | null;
  max: number | null;
}

interface CharacterBoxCharacterCardView {
  character: CharacterDetailRecord;
  subtitle: string;
  inSelectedBox: boolean;
  isFavorite: boolean;
  favoriteAriaLabel: string;
  membershipActionLabel: string;
}

@Component({
  selector: 'app-character-boxes-page',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonMenuButton,
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToolbar,
    AbilityFilterRailComponent,
    AbilityTagSetPickerComponent,
    CharacterFilterRowComponent,
    CharacterTagFilterComponent,
    CharacterBoxesStylePanelsComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './character-boxes.page.html',
  styleUrl: './character-boxes.page.scss',
})
export class CharacterBoxesPage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly boxes;
  public readonly favoriteCharacterIds;
  public readonly selectedBoxId = signal<string | null>(null);
  public readonly boxNameDraft = signal('');
  public readonly searchTerm = signal('');
  public readonly typeQuery = signal('');
  public readonly classQuery = signal('');
  public readonly selectedType = signal('');
  public readonly selectedClass = signal('');
  public readonly selectedFavoriteFilter = signal<CharacterBoxesFavoriteFilter>('all');
  public readonly selectedMembershipFilter = signal<CharacterBoxesMembershipFilter>('all');
  public readonly selectedSortMode = signal<CharacterSortMode>('catalog');
  public readonly selectedIdOrder = signal<CharacterIdOrder>('newest');
  public readonly costRange = signal<CharacterBoxesCostRange>({ min: null, max: null });
  public readonly abilityTagSetPickerOpen = signal(false);
  public readonly tagSetSelection = signal<AbilityFilterTagSetSelection>(
    createEmptyAbilityFilterTagSetSelection(),
  );
  public readonly characterTagSetSelection = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );
  /** `undefined` = no character-tag gate. Never assign `[]` for an empty selection. */
  public readonly characterTagCharacterIds = signal<number[] | undefined>(undefined);
  public readonly displayMode = signal<CharacterBoxesDisplayMode>('list');
  public readonly characters = signal<CharacterDetailRecord[]>([]);
  public readonly loading = signal(true);
  public readonly loadingMore = signal(false);
  public readonly selectingFilteredCharacters = signal(false);
  public readonly hasMore = signal(true);

  public readonly selectedBox = computed(
    () => this.boxes().find((box) => box.id === this.selectedBoxId()) ?? null,
  );
  public readonly availableTypes = computed(() =>
    this.normalizeOptions(this.summary()?.availableTypes ?? []),
  );
  public readonly availableClasses = computed(() =>
    this.normalizeOptions(this.summary()?.availableClasses ?? []),
  );
  public readonly favoriteFilterOptions = computed<CharacterFilterOption[]>(() => [
    { value: 'all', label: this.t('filters.favoritesOptions.all') },
    { value: 'favorites', label: this.t('filters.favoritesOptions.favorites') },
    { value: 'hideFavorites', label: this.t('filters.favoritesOptions.hideFavorites') },
  ]);
  public readonly membershipFilterOptions = computed<CharacterFilterOption[]>(() => [
    { value: 'all', label: this.t('filters.membershipOptions.all') },
    { value: 'inBox', label: this.t('filters.membershipOptions.inBox') },
    { value: 'notInBox', label: this.t('filters.membershipOptions.notInBox') },
  ]);
  public readonly sortFilterOptions = computed<CharacterFilterOption[]>(() => [
    { value: 'catalog', label: this.t('sort.options.catalog') },
    { value: 'nameAsc', label: this.t('sort.options.nameAsc') },
    { value: 'nameDesc', label: this.t('sort.options.nameDesc') },
    { value: 'captainHpBoost', label: this.t('sort.options.captainHpBoost') },
    { value: 'captainAtkBoost', label: this.t('sort.options.captainAtkBoost') },
    {
      value: 'captainAverageBoost',
      label: this.t('sort.options.captainAverageBoost'),
    },
  ]);
  public readonly idOrderFilterOptions = computed<CharacterFilterOption[]>(() => [
    { value: 'newest', label: this.t('idOrder.options.newest') },
    { value: 'oldest', label: this.t('idOrder.options.oldest') },
  ]);
  /**
   * Stable-identity view of the whole catalog. `getCatalogAbilityIndex` caches by
   * array identity, so rebuilding this per keystroke would turn its O(1) lookups
   * into repeated full-catalog scans.
   */
  public readonly allCatalogItems = computed(() => this.abilityCatalog()?.abilities ?? []);
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
  public readonly abilityTagSetSections = computed<AbilityTagSetPickerSection[]>(() =>
    [
      {
        category: 'captainAbility',
        label: this.t('filters.captainAbility.eyebrow'),
        items: this.availableCaptainAbilityCatalogItems(),
        captainAbility: true,
      },
      {
        category: 'special',
        label: this.t('filters.special.eyebrow'),
        items: this.availableSpecialAbilityCatalogItems(),
      },
      {
        category: 'crewmate',
        label: this.t('filters.crewmate.eyebrow'),
        items: this.availableCrewmateAbilityCatalogItems(),
      },
      {
        category: 'potential',
        label: this.t('filters.potential.eyebrow'),
        items: this.availablePotentialAbilityCatalogItems(),
      },
      {
        category: 'support',
        label: this.t('filters.support.eyebrow'),
        items: this.availableSupportAbilityCatalogItems(),
      },
    ].filter((section) => section.items.length > 0),
  );
  /** Ability keys per rail category, so a picked tag can be traced back to its chip. */
  private readonly abilityFilterCategoryKeys = computed(
    () =>
      new Map<CharacterBoxesAbilityFilterCategory, Set<string>>([
        [
          'captainAbility',
          new Set(this.availableCaptainAbilityCatalogItems().map((item) => item.key)),
        ],
        ['special', new Set(this.availableSpecialAbilityCatalogItems().map((item) => item.key))],
        ['crewmate', new Set(this.availableCrewmateAbilityCatalogItems().map((item) => item.key))],
        [
          'potential',
          new Set(this.availablePotentialAbilityCatalogItems().map((item) => item.key)),
        ],
        ['support', new Set(this.availableSupportAbilityCatalogItems().map((item) => item.key))],
      ]),
  );
  private readonly abilityFilterCategoryCounts = computed(() => {
    const counts = new Map<CharacterBoxesAbilityFilterCategory, number>();

    for (const set of this.tagSetSelection().sets) {
      for (const requirement of set.requirements) {
        const category = this.resolveAbilityFilterCategory(requirement);

        if (category) {
          counts.set(category, (counts.get(category) ?? 0) + 1);
        }
      }
    }

    return counts;
  });
  public readonly abilityFilterRailItems = computed<AbilityFilterRailItem[]>(() => [
    {
      category: 'captainAbility',
      label: this.t('filters.captainAbility.eyebrow'),
      count: this.abilityFilterCategoryCounts().get('captainAbility') ?? 0,
      disabled: !this.availableCaptainAbilityCatalogItems().length,
    },
    {
      category: 'special',
      label: this.t('filters.special.eyebrow'),
      count: this.abilityFilterCategoryCounts().get('special') ?? 0,
      disabled: !this.availableSpecialAbilityCatalogItems().length,
    },
    {
      category: 'crewmate',
      label: this.t('filters.crewmate.eyebrow'),
      count: this.abilityFilterCategoryCounts().get('crewmate') ?? 0,
      disabled: !this.availableCrewmateAbilityCatalogItems().length,
    },
    {
      category: 'potential',
      label: this.t('filters.potential.eyebrow'),
      count: this.abilityFilterCategoryCounts().get('potential') ?? 0,
      disabled: !this.availablePotentialAbilityCatalogItems().length,
    },
    {
      category: 'support',
      label: this.t('filters.support.eyebrow'),
      count: this.abilityFilterCategoryCounts().get('support') ?? 0,
      disabled: !this.availableSupportAbilityCatalogItems().length,
    },
  ]);
  public readonly totalAssignedCharacters = computed(() =>
    this.boxes().reduce((count, box) => count + box.characterIds.length, 0),
  );
  public readonly uniqueAssignedCharacters = computed(() => {
    const assignedCharacterIds = new Set(this.boxes().flatMap((box) => box.characterIds));

    return assignedCharacterIds.size;
  });
  public readonly selectedBoxCharacterCount = computed(
    () => this.selectedBox()?.characterIds.length ?? 0,
  );
  public readonly missingFavoriteIds = computed(() => {
    const selectedBox = this.selectedBox();

    if (!selectedBox) {
      return [];
    }

    return this.favoriteCharacterIds().filter(
      (favoriteCharacterId) => !selectedBox.characterIds.includes(favoriteCharacterId),
    );
  });
  public readonly missingFavoriteCount = computed(() => this.missingFavoriteIds().length);
  public readonly canAddFavoritesToSelectedBox = computed(
    () => Boolean(this.selectedBox()) && this.missingFavoriteCount() > 0,
  );
  public readonly hasInvalidCostRange = computed(() => {
    const range = this.costRange();

    return range.min !== null && range.max !== null && range.min > range.max;
  });
  public readonly costRangeValidationMessage = computed(() =>
    this.hasInvalidCostRange() ? this.t('filters.cost.invalidRange') : '',
  );
  public readonly canSelectAllFilteredCharacters = computed(
    () =>
      Boolean(this.selectedBox()) &&
      !this.hasInvalidCostRange() &&
      !this.selectingFilteredCharacters(),
  );
  public readonly boxNameValidationMessage = computed(() =>
    this.selectedBox() && this.boxNameDraft().trim().length === 0
      ? this.t('editor.nameRequired')
      : '',
  );
  public readonly isCompactDisplayMode = computed(() => this.displayMode() === 'compact');
  public readonly characterCardViews = computed<CharacterBoxCharacterCardView[]>(() =>
    this.characters().map((character) => ({
      character,
      subtitle: [character.type, character.primaryClass, character.secondaryClass]
        .filter((value): value is string => Boolean(value))
        .join(' • '),
      inSelectedBox: this.selectedBox()?.characterIds.includes(character.id) ?? false,
      isFavorite: this.isFavorite(character.id),
      favoriteAriaLabel: this.isFavorite(character.id)
        ? this.t('favorites.removeAria', { name: character.name })
        : this.t('favorites.addAria', { name: character.name }),
      membershipActionLabel: this.selectedBox()?.characterIds.includes(character.id)
        ? this.i18n.translate('common.actions.remove')
        : this.i18n.translate('common.actions.add'),
    })),
  );

  public readonly addIcon = addCircleOutline;
  public readonly boxesIcon = albumsOutline;
  public readonly unitsIcon = peopleOutline;
  public readonly layersIcon = layersOutline;
  public readonly searchIcon = searchOutline;
  public readonly deleteIcon = trashOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
  ) {
    this.boxes = this.userState.characterBoxes;
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    await Promise.all([
      this.userState.readyCharacterBoxes(),
      this.userState.readyFavoriteCharacterIds(),
      this.i18n.preloadScope('ability-tag-sets'),
      this.i18n.preloadScope('character-tag-sets'),
      this.i18n.preloadScope('character-tag-filter'),
    ]);
    const [summary, abilityCatalog] = await Promise.all([
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
    ]);
    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);

    if (this.boxes().length > 0) {
      this.selectBox(this.boxes()[0]!.id);
    }

    await this.loadCharacters(true);
  }

  public async createBox(): Promise<void> {
    const createdBox = await this.userState.saveCharacterBox({
      name: this.t('defaults.boxName', { count: this.boxes().length + 1 }),
      characterIds: [],
    });

    if (!createdBox) {
      return;
    }

    this.selectBox(createdBox.id);
  }

  public selectBox(boxId: string): void {
    const box = this.userState.getCharacterBoxById(boxId);

    this.selectedBoxId.set(box?.id ?? null);
    this.boxNameDraft.set(box?.name ?? '');
  }

  public async onBoxNameInput(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.boxNameDraft.set((event.detail.value ?? '').trimStart());

    const currentBox = this.selectedBox();

    if (!currentBox || this.boxNameDraft().trim().length === 0) {
      return;
    }

    const savedBox = await this.userState.saveCharacterBox({
      id: currentBox.id,
      name: this.boxNameDraft(),
      characterIds: currentBox.characterIds,
    });

    if (!savedBox) {
      return;
    }

    this.boxNameDraft.set(savedBox.name);
  }

  public async deleteSelectedBox(): Promise<void> {
    const currentBox = this.selectedBox();

    if (!currentBox) {
      return;
    }

    await this.userState.deleteCharacterBox(currentBox.id);
    const nextSelectedBox = this.boxes()[0] ?? null;

    this.selectedBoxId.set(nextSelectedBox?.id ?? null);
    this.boxNameDraft.set(nextSelectedBox?.name ?? '');
  }

  public async addFavoritesToSelectedBox(): Promise<void> {
    const currentBox = this.selectedBox();
    const missingFavoriteIds = this.missingFavoriteIds();

    if (!currentBox || missingFavoriteIds.length === 0) {
      return;
    }

    const savedBox = await this.userState.saveCharacterBox({
      id: currentBox.id,
      name: currentBox.name,
      characterIds: [...currentBox.characterIds, ...missingFavoriteIds],
    });

    if (!savedBox) {
      return;
    }

    this.selectBox(savedBox.id);
  }

  public async selectAllFilteredCharacters(): Promise<void> {
    const currentBox = this.selectedBox();

    if (!currentBox || this.hasInvalidCostRange() || this.selectingFilteredCharacters()) {
      return;
    }

    this.selectingFilteredCharacters.set(true);

    try {
      const filteredCharacterIds = await this.fetchAllFilteredCharacterIds();
      const currentCharacterIds = new Set(currentBox.characterIds);
      const missingCharacterIds = filteredCharacterIds.filter(
        (characterId) => !currentCharacterIds.has(characterId),
      );

      if (missingCharacterIds.length === 0) {
        return;
      }

      const savedBox = await this.userState.saveCharacterBox({
        id: currentBox.id,
        name: currentBox.name,
        characterIds: [...currentBox.characterIds, ...missingCharacterIds],
      });

      if (!savedBox) {
        return;
      }

      this.selectBox(savedBox.id);
    } finally {
      this.selectingFilteredCharacters.set(false);
    }
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

  public async onFavoriteFilterChange(
    input: string | CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    const value = this.resolveStringInput(input);

    this.selectedFavoriteFilter.set(
      value === 'favorites' || value === 'hideFavorites' ? value : 'all',
    );
    await this.loadCharacters(true);
  }

  public async onMembershipFilterChange(
    input: string | CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    const nextValue = this.resolveStringInput(input);

    this.selectedMembershipFilter.set(
      nextValue === 'inBox' || nextValue === 'notInBox' ? nextValue : 'all',
    );
    await this.loadCharacters(true);
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

  public async onCostRangeChange(
    bound: CharacterFilterCostBound,
    input: string | number | null | CustomEvent<{ value?: string | number | null }>,
  ): Promise<void> {
    const currentRange = this.costRange();

    this.costRange.set({
      ...currentRange,
      [bound]: this.resolveCostRangeBound(this.resolveCostInput(input)),
    });
    await this.loadCharacters(true);
  }

  public setDisplayMode(mode: CharacterBoxesDisplayMode): void {
    this.displayMode.set(mode);
  }

  /** Every rail chip opens the one tag-set modal; the chip only says which tags exist. */
  public openAbilityFilterCategory(_category: CharacterBoxesAbilityFilterCategory): void {
    if (!this.abilityTagSetSections().length) {
      return;
    }

    this.abilityTagSetPickerOpen.set(true);
  }

  public closeAbilityTagSetPicker(): void {
    this.abilityTagSetPickerOpen.set(false);
  }

  public async saveAbilityTagSetPicker(selection: AbilityFilterTagSetSelection): Promise<void> {
    this.tagSetSelection.set(cloneAbilityFilterTagSetSelection(selection));
    this.abilityTagSetPickerOpen.set(false);
    await this.loadCharacters(true);
  }

  /** Drops that category's tags from every set, and any set left empty by the drop. */
  public async clearAbilityFilterCategory(
    category: CharacterBoxesAbilityFilterCategory,
  ): Promise<void> {
    const selection = this.tagSetSelection();

    this.tagSetSelection.set({
      ...selection,
      sets: selection.sets
        .map((set) => ({
          ...set,
          requirements: set.requirements.filter(
            (requirement) => this.resolveAbilityFilterCategory(requirement) !== category,
          ),
        }))
        .filter((set) => set.requirements.length > 0),
    });
    await this.loadCharacters(true);
  }

  public async toggleFavorite(characterId: number, event?: Event): Promise<void> {
    event?.preventDefault();
    event?.stopPropagation();
    await this.userState.toggleFavorite(characterId);

    if (this.selectedFavoriteFilter() !== 'all') {
      await this.loadCharacters(true);
    }
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteCharacterIds().includes(characterId);
  }

  public getCharacterDetailLink(character: CharacterListItem | null): string[] | null {
    return character ? ['/characters', character.id.toString()] : null;
  }

  public async clearFilters(): Promise<void> {
    this.searchTerm.set('');
    this.typeQuery.set('');
    this.classQuery.set('');
    this.selectedType.set('');
    this.selectedClass.set('');
    this.selectedFavoriteFilter.set('all');
    this.selectedMembershipFilter.set('all');
    this.selectedSortMode.set('catalog');
    this.selectedIdOrder.set('newest');
    this.costRange.set({ min: null, max: null });
    this.abilityTagSetPickerOpen.set(false);
    this.tagSetSelection.set(createEmptyAbilityFilterTagSetSelection());
    this.characterTagSetSelection.set(createEmptyCharacterTagSetSelection());
    this.characterTagCharacterIds.set(undefined);
    await this.loadCharacters(true);
  }

  public async onCharacterTagFilterChange(change: CharacterTagFilterChange): Promise<void> {
    this.characterTagSetSelection.set(change.selection);
    this.characterTagCharacterIds.set(change.matchingCharacterIds);
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

  public async toggleCharacterMembership(characterId: number): Promise<void> {
    const currentBox = this.selectedBox();

    if (!currentBox) {
      return;
    }

    const nextCharacterIds = currentBox.characterIds.includes(characterId)
      ? currentBox.characterIds.filter((currentCharacterId) => currentCharacterId !== characterId)
      : [characterId, ...currentBox.characterIds];
    const savedBox = await this.userState.saveCharacterBox({
      id: currentBox.id,
      name: currentBox.name,
      characterIds: nextCharacterIds,
    });

    if (!savedBox) {
      return;
    }

    this.selectBox(savedBox.id);
  }

  public trackBox(_: number, box: CharacterBox): string {
    return box.id;
  }

  public trackCharacter(_: number, character: CharacterListItem): number {
    return character.id;
  }

  private async loadCharacters(reset: boolean): Promise<void> {
    if (reset) {
      this.loading.set(true);
    }

    const nextCharacters = await this.repository.searchDetailedCharacters(
      this.buildFilteredCharacterSearchQuery({
        limit: PAGE_SIZE,
        offset: reset ? 0 : this.characters().length,
      }),
    );

    this.characters.set(reset ? nextCharacters : [...this.characters(), ...nextCharacters]);
    this.hasMore.set(nextCharacters.length === PAGE_SIZE);
    this.loading.set(false);
  }

  private async fetchAllFilteredCharacterIds(): Promise<number[]> {
    const filteredCharacterIds: number[] = [];
    let offset = 0;

    while (true) {
      const nextCharacters = await this.repository.searchDetailedCharacters(
        this.buildFilteredCharacterSearchQuery({
          limit: FILTERED_SELECT_PAGE_SIZE,
          offset,
        }),
      );

      filteredCharacterIds.push(...nextCharacters.map((character) => character.id));

      if (nextCharacters.length < FILTERED_SELECT_PAGE_SIZE) {
        break;
      }

      offset += FILTERED_SELECT_PAGE_SIZE;
    }

    return [...new Set(filteredCharacterIds)];
  }

  private buildFilteredCharacterSearchQuery(input: {
    limit: number;
    offset: number;
  }): DetailedCharacterSearchQuery {
    const selectedBoxCharacterIds = this.selectedBox()?.characterIds ?? [];
    const favoriteCharacterIds =
      this.selectedFavoriteFilter() === 'favorites' ? this.favoriteCharacterIds() : undefined;
    const scopedAllowedCharacterIds =
      this.selectedMembershipFilter() === 'inBox'
        ? selectedBoxCharacterIds.filter(
            (characterId) =>
              favoriteCharacterIds === undefined || favoriteCharacterIds.includes(characterId),
          )
        : favoriteCharacterIds;
    const allowedCharacterIds = intersectAbilityMatchingCharacterIds([
      scopedAllowedCharacterIds,
      this.abilityFilterCharacterIds(),
      this.characterTagCharacterIds(),
    ]);
    const excludedCharacterIds = [
      ...(this.selectedMembershipFilter() === 'notInBox' ? selectedBoxCharacterIds : []),
      ...(this.selectedFavoriteFilter() === 'hideFavorites' ? this.favoriteCharacterIds() : []),
    ];

    return {
      searchTerm: this.searchTerm(),
      selectedTypes: this.selectedType() ? [this.selectedType()] : [],
      selectedTypesMatchMode: 'any',
      selectedClasses: this.selectedClass() ? [this.selectedClass()] : [],
      selectedClassesMatchMode: 'any',
      allowedCharacterIds,
      excludedCharacterIds: excludedCharacterIds.length
        ? [...new Set(excludedCharacterIds)]
        : undefined,
      sortMode: this.selectedSortMode(),
      idOrder: this.selectedIdOrder(),
      ...(this.hasActiveCostRange(this.costRange()) ? { costRange: { ...this.costRange() } } : {}),
      limit: input.limit,
      offset: input.offset,
    };
  }

  /**
   * Maps a picked tag back to the rail chip that owns it. Captain-scoped tags win
   * outright: their keys also live in the effect categories, so without the
   * `sourceScope` check a captain tag would be counted and cleared as a Special.
   */
  private resolveAbilityFilterCategory(
    requirement: AutoBuildAbilityRequirement,
  ): CharacterBoxesAbilityFilterCategory | null {
    const categoryKeys = this.abilityFilterCategoryKeys();

    if (
      requirement.sourceScope === 'captainAbility' &&
      categoryKeys.get('captainAbility')?.has(requirement.abilityKey)
    ) {
      return 'captainAbility';
    }

    for (const category of ['special', 'crewmate', 'potential', 'support'] as const) {
      if (categoryKeys.get(category)?.has(requirement.abilityKey)) {
        return category;
      }
    }

    return null;
  }

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  }

  private resolveStringInput(input: string | CustomEvent<{ value?: string | null }>): string {
    return typeof input === 'string' ? input : (input.detail.value ?? '');
  }

  private resolveCostInput(
    input: string | number | null | CustomEvent<{ value?: string | number | null }>,
  ): string | number | null {
    return typeof input === 'object' && input !== null && 'detail' in input
      ? (input.detail.value ?? null)
      : input;
  }

  private resolveCostRangeBound(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const nextValue = Number(value);

    return Number.isInteger(nextValue) && nextValue >= 0 ? nextValue : null;
  }

  private hasActiveCostRange(range: CharacterBoxesCostRange): boolean {
    return range.min !== null || range.max !== null;
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

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, params, 'character-boxes');
  }
}

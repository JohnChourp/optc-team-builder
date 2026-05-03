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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  checkmarkCircleOutline,
  peopleOutline,
  searchOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityRequirement,
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import { type AutoBuildCaptainAbilityCoverageMode } from '../../core/models/auto-team-builder.models';
import {
  type CaptainCoverageResult,
  resolveCaptainCoverage,
} from '../../core/services/captain-coverage.utils';
import {
  resolveCaptainTeamConditionStatus,
  type CaptainTeamConditionStatus,
} from '../../core/services/captain-team-condition-status.utils';
import {
  type CharacterDetailRecord,
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSortMode,
  type DatasetManifest,
} from '../../core/models/optc.models';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { resolveCharacterPartyConflictKeys } from '../../core/services/auto-team-builder.utils';
import {
  createAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from '../../core/services/ability-requirement-draft.utils';
import {
  getAbilityCatalogItemsByCategory,
  serializeCategoryAbilityDrafts,
  serializeSpecialAbilityDrafts,
} from '../../core/services/special-ability-filter.utils';
import {
  buildAbilityRequirementIdentity,
  matchesAbilityRequirement,
  matchesAnyAbilityRequirement,
} from '../../core/services/auto-team-builder-ability-match.utils';
import {
  AbilityFilterRailComponent,
  type AbilityFilterRailCategory,
  type AbilityFilterRailItem,
} from '../../shared/ability-filter-rail/ability-filter-rail.component';
import { CharacterImagePickerComponent } from '../../shared/character-image-picker/character-image-picker.component';
import { CaptainTeamConditionStatusComponent } from '../../shared/captain-team-condition-status/captain-team-condition-status.component';
import { SpecialAbilityPickerComponent } from '../../shared/special-ability-picker/special-ability-picker.component';

const MAX_CAPTAIN_LOOKUP_COUNT = 12000;
const CAPTAIN_COVERAGE_TEAM_SLOT_COUNT = 5;

type CaptainCoverageSortMode =
  | Extract<
      CharacterSortMode,
      'catalog' | 'captainAtkBoost' | 'captainAverageBoost' | 'captainHpBoost' | 'nameAsc'
    >
  | 'nameDesc';

interface CaptainCoverageCardView {
  character: CharacterListItem;
  coverage: CaptainCoverageResult;
  detailLink: string[];
  assignableSlotIndex: number | null;
  abilityMatchCount: number;
  selectedAbilityCount: number;
  matchedAbilityBadges: CaptainCoverageAbilityBadgeView[];
}

interface CaptainCoverageAbilityBadgeView {
  key: string;
  label: string;
}

@Component({
  selector: 'app-captain-coverage-page',
  standalone: true,
  imports: [
    AbilityFilterRailComponent,
    CaptainTeamConditionStatusComponent,
    CharacterImagePickerComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonMenuButton,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToggle,
    IonToolbar,
    RouterLink,
    SpecialAbilityPickerComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './captain-coverage.page.html',
  styleUrl: './captain-coverage.page.scss',
})
export class CaptainCoveragePage implements OnInit {
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly allCharacters = signal<CharacterListItem[]>([]);
  public readonly allCharacterDetailsById = signal<ReadonlyMap<number, CharacterDetailRecord>>(
    new Map(),
  );
  public readonly selectedCaptainDetail = signal<CharacterDetailRecord | null>(null);
  public readonly selectedTeamSlots =
    signal<Array<CharacterListItem | null>>(createEmptyTeamSlots());
  public readonly activeTeamSlotIndex = signal(0);
  public readonly teamPickerOpen = signal(false);
  public readonly maxTotalCost = signal<number | null>(null);
  public readonly allCaptains = signal<CharacterDetailRecord[]>([]);
  public readonly loading = signal(true);
  public readonly searchTerm = signal('');
  public readonly selectedSortMode = signal<CaptainCoverageSortMode>('catalog');
  public readonly selectedIdOrder = signal<CharacterIdOrder>('newest');
  public readonly abilityMatchRankingEnabled = signal(false);
  public readonly requireFullCaptainAbilityCoverage = signal(false);
  public readonly favoritesOnly = signal(false);
  public readonly hideFavorites = signal(false);
  public readonly specialAbilityPickerOpen = signal(false);
  public readonly specialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly crewmateAbilityPickerOpen = signal(false);
  public readonly crewmateAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly potentialAbilityPickerOpen = signal(false);
  public readonly potentialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly supportAbilityPickerOpen = signal(false);
  public readonly supportAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly favoriteIds;

  public readonly selectedCaptain = computed(() => this.selectedTeamSlots()[0] ?? null);
  public readonly selectedCaptainSubtitle = computed(() => {
    const captain = this.selectedCaptain();

    return captain
      ? [captain.type, captain.primaryClass, captain.secondaryClass]
          .filter((value): value is string => Boolean(value))
          .join(' / ')
      : '';
  });
  public readonly allowedCaptainIds = computed(() =>
    this.allCaptains().map((captain) => captain.id),
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
  public readonly selectedAbilityRequirements = computed<AutoBuildAbilityRequirement[]>(() => [
    ...this.specialAbilityRequirements(),
    ...this.crewmateAbilityRequirements(),
    ...this.potentialAbilityRequirements(),
    ...this.supportAbilityRequirements(),
  ]);
  public readonly abilityMatchRankingDisabled = computed(
    () => this.selectedAbilityRequirements().length === 0,
  );
  public readonly captainAbilityCoverageMode = computed<AutoBuildCaptainAbilityCoverageMode>(() =>
    this.requireFullCaptainAbilityCoverage() ? 'fullAbilityCoverage' : 'simpleBoostScope',
  );
  public readonly captainAbilityCoverageSupportLabel = computed(() =>
    this.requireFullCaptainAbilityCoverage()
      ? this.t('filters.captainAbilityCoverage.support.full')
      : this.t('filters.captainAbilityCoverage.support.simple'),
  );
  public readonly abilityFilterRailItems = computed<AbilityFilterRailItem[]>(() => [
    {
      category: 'special',
      label: this.t('filters.specialEyebrow'),
      count: this.specialAbilityDrafts().length,
      disabled: !this.availableSpecialAbilityCatalogItems().length,
    },
    {
      category: 'crewmate',
      label: this.t('filters.crewmateEyebrow'),
      count: this.crewmateAbilityDrafts().length,
      disabled: !this.availableCrewmateAbilityCatalogItems().length,
    },
    {
      category: 'potential',
      label: this.t('filters.potentialEyebrow'),
      count: this.potentialAbilityDrafts().length,
      disabled: !this.availablePotentialAbilityCatalogItems().length,
    },
    {
      category: 'support',
      label: this.t('filters.supportEyebrow'),
      count: this.supportAbilityDrafts().length,
      disabled: !this.availableSupportAbilityCatalogItems().length,
    },
  ]);

  public readonly resultCards = computed<CaptainCoverageCardView[]>(() => {
    const captain = this.selectedCaptainDetail();

    if (!captain) {
      return [];
    }

    const normalizedSearchTerm = this.searchTerm().trim().toLowerCase();
    const favoriteIdSet = new Set(this.favoriteIds());
    const selectedAbilityRequirements = this.selectedAbilityRequirements();
    const characterDetailsById = this.allCharacterDetailsById();
    const selectedConflictKeys = this.resolveSelectedTeamConflictKeys();
    const matchingCharacters = this.allCharacters()
      .map((character) => {
        const characterDetail = characterDetailsById.get(character.id);

        return {
          character,
          coverage: resolveCaptainCoverage(captain, character, {
            coverageMode: this.captainAbilityCoverageMode(),
            targetCharacterTags: characterDetail?.detail.characterTags ?? [],
          }),
        };
      })
      .filter(({ coverage }) => coverage.matches)
      .filter(({ character }) => !this.hasPartyConflict(character, selectedConflictKeys))
      .map(({ character, coverage }) => {
        const abilities = characterDetailsById.get(character.id)?.detail.builderAbilities ?? [];
        const abilityMatchCount = this.countMatchedAbilityRequirements(
          abilities,
          selectedAbilityRequirements,
        );

        return {
          character,
          coverage,
          assignableSlotIndex: this.findAssignableSubSlotIndex(character),
          abilityMatchCount,
          selectedAbilityCount: selectedAbilityRequirements.length,
          matchedAbilityBadges: this.buildMatchedAbilityBadges(
            abilities,
            selectedAbilityRequirements,
          ),
        };
      })
      .filter(({ abilityMatchCount }) =>
        selectedAbilityRequirements.length === 0 ? true : abilityMatchCount > 0,
      )
      .filter(({ assignableSlotIndex }) => assignableSlotIndex !== null)
      .filter(({ character }) => {
        if (this.favoritesOnly()) {
          return favoriteIdSet.has(character.id);
        }

        if (this.hideFavorites()) {
          return !favoriteIdSet.has(character.id);
        }

        return true;
      })
      .filter(({ character, coverage }) =>
        normalizedSearchTerm.length
          ? this.matchesSearchTerm(character, coverage, normalizedSearchTerm)
          : true,
      );

    return this.sortResultCards(
      matchingCharacters.map(
        ({
          character,
          coverage,
          assignableSlotIndex,
          abilityMatchCount,
          selectedAbilityCount,
          matchedAbilityBadges,
        }) => ({
          character,
          coverage,
          assignableSlotIndex,
          abilityMatchCount,
          selectedAbilityCount,
          matchedAbilityBadges,
          detailLink: ['/characters', String(character.id)],
        }),
      ),
    );
  });

  public readonly totalMatchingCharacters = computed(() => this.resultCards().length);
  public readonly teamBudgetCost = computed(() =>
    this.selectedTeamSlots().reduce((total, character) => total + (character?.cost ?? 0), 0),
  );
  public readonly teamRemainingCost = computed(() => {
    const maxTotalCost = this.maxTotalCost();

    return maxTotalCost === null ? 0 : Math.max(0, maxTotalCost - this.teamBudgetCost());
  });
  public readonly teamBudgetLabel = computed(() =>
    this.maxTotalCost() === null
      ? this.t('team.cost.default')
      : this.t('team.cost.active', {
          used: this.teamBudgetCost(),
          remaining: this.teamRemainingCost(),
          max: this.maxTotalCost() ?? 0,
        }),
  );
  public readonly teamBudgetErrorLabel = computed(() =>
    this.maxTotalCost() !== null && this.teamBudgetCost() > this.maxTotalCost()!
      ? this.t('team.cost.overBudget', {
          used: this.teamBudgetCost(),
          max: this.maxTotalCost()!,
        })
      : '',
  );
  public readonly teamPickerMaxCost = computed(() => {
    const maxTotalCost = this.maxTotalCost();

    if (maxTotalCost === null) {
      return null;
    }

    const activeIndex = this.activeTeamSlotIndex();
    const currentSlotCost = this.selectedTeamSlots()[activeIndex]?.cost ?? 0;

    return Math.max(0, maxTotalCost - this.teamBudgetCost() + currentSlotCost);
  });
  public readonly activeTeamSlotTitle = computed(() =>
    this.teamSlotLabel(this.activeTeamSlotIndex()),
  );
  public readonly activeTeamSlotAllowedCharacterIds = computed(() =>
    this.activeTeamSlotIndex() === 0 ? this.allowedCaptainIds() : null,
  );
  public readonly teamConditionStatus = computed<CaptainTeamConditionStatus | null>(() => {
    const captain = this.selectedCaptainDetail();

    if (!captain) {
      return null;
    }

    const slots = this.resolveSelectedTeamSlotDetails();

    return resolveCaptainTeamConditionStatus({
      expectedSlotCount: CAPTAIN_COVERAGE_TEAM_SLOT_COUNT,
      coverageMode: this.captainAbilityCoverageMode(),
      leaders: [
        {
          role: 'captain',
          label: this.t('team.slots.captain'),
          character: captain,
        },
      ],
      slotLabels: Array.from({ length: CAPTAIN_COVERAGE_TEAM_SLOT_COUNT }, (_value, index) =>
        this.teamSlotLabel(index),
      ),
      slots,
    });
  });

  public readonly coverageIcon = shieldCheckmarkOutline;
  public readonly targetIcon = peopleOutline;
  public readonly checkIcon = checkmarkCircleOutline;
  public readonly searchIcon = searchOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    this.loading.set(true);

    try {
      const [, summary, abilityCatalog, records] = await Promise.all([
        this.userState.ready(),
        this.repository.getDatasetManifest(),
        this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
        this.repository.searchDetailedCharacters({
          searchTerm: '',
          selectedTypes: [],
          selectedTypesMatchMode: 'any',
          selectedClasses: [],
          selectedClassesMatchMode: 'any',
          sortMode: 'catalog',
          idOrder: 'newest',
          limit: MAX_CAPTAIN_LOOKUP_COUNT,
          offset: 0,
        }),
        this.characterCatalogCache.ensureLoaded(),
      ]);

      this.summary.set(summary);
      this.abilityCatalog.set(abilityCatalog);
      this.allCharacters.set(this.characterCatalogCache.catalog());
      this.allCharacterDetailsById.set(new Map(records.map((record) => [record.id, record])));
      this.allCaptains.set(
        records.filter(
          (record) =>
            typeof record.detail.captainAbility === 'string' &&
            record.detail.captainAbility.trim().length > 0,
        ),
      );
    } finally {
      this.loading.set(false);
    }
  }

  public openTeamSlotPicker(index: number): void {
    if (index < 0 || index >= CAPTAIN_COVERAGE_TEAM_SLOT_COUNT) {
      return;
    }

    this.activeTeamSlotIndex.set(index);
    this.teamPickerOpen.set(true);
  }

  public closeTeamSlotPicker(): void {
    this.teamPickerOpen.set(false);
  }

  public async saveTeamSlotSelection(character: CharacterListItem): Promise<void> {
    const index = this.activeTeamSlotIndex();

    if (!this.canAssignTeamSlotCharacter(index, character)) {
      return;
    }

    if (index === 0 && !this.allowedCaptainIds().includes(character.id)) {
      return;
    }

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, slotIndex) => (slotIndex === index ? character : slot)),
    );
    this.teamPickerOpen.set(false);

    if (index === 0) {
      this.searchTerm.set('');
      this.selectedCaptainDetail.set(null);
      this.selectedCaptainDetail.set(await this.repository.getCharacterById(character.id));
    }
  }

  public assignCharacterFromResult(card: CaptainCoverageCardView): void {
    const slotIndex = card.assignableSlotIndex;

    if (slotIndex === null || !this.canAssignTeamSlotCharacter(slotIndex, card.character)) {
      return;
    }

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, index) => (index === slotIndex ? card.character : slot)),
    );
  }

  public clearTeamSlot(index: number, event?: Event): void {
    event?.stopPropagation();

    if (index < 0 || index >= CAPTAIN_COVERAGE_TEAM_SLOT_COUNT) {
      return;
    }

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, slotIndex) => (slotIndex === index ? null : slot)),
    );

    if (index === 0) {
      this.selectedCaptainDetail.set(null);
      this.searchTerm.set('');
    }
  }

  public onMaxTotalCostChange(event: CustomEvent<{ value?: string | number | null }>): void {
    this.maxTotalCost.set(normalizeCostValue(event.detail.value));
  }

  public toggleFavoritesOnly(): void {
    const nextValue = !this.favoritesOnly();
    this.favoritesOnly.set(nextValue);

    if (nextValue) {
      this.hideFavorites.set(false);
    }
  }

  public toggleHideFavorites(): void {
    const nextValue = !this.hideFavorites();
    this.hideFavorites.set(nextValue);

    if (nextValue) {
      this.favoritesOnly.set(false);
    }
  }

  public onSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.searchTerm.set((event.detail.value ?? '').trimStart());
  }

  public onSortModeChange(event: CustomEvent<{ value?: string | null }>): void {
    const value = event.detail.value;

    if (isCaptainCoverageSortMode(value)) {
      this.selectedSortMode.set(value);
    }
  }

  public onIdOrderChange(event: CustomEvent<{ value?: string | null }>): void {
    this.selectedIdOrder.set(normalizeCharacterIdOrder(event.detail.value));
  }

  public onAbilityMatchRankingChange(event: CustomEvent<{ checked?: boolean | null }>): void {
    this.abilityMatchRankingEnabled.set(Boolean(event.detail.checked));
  }

  public onRequireFullCaptainAbilityCoverageChange(
    event: CustomEvent<{ checked?: boolean | null }>,
  ): void {
    this.requireFullCaptainAbilityCoverage.set(Boolean(event.detail.checked));
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

  public saveSpecialAbilityPicker(drafts: AbilityRequirementDraft[]): void {
    this.specialAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeSpecialAbilityDrafts(drafts, this.availableSpecialAbilityCatalogItems()),
      ),
    );
    this.specialAbilityPickerOpen.set(false);
  }

  public clearSpecialAbilityFilters(): void {
    this.specialAbilityDrafts.set([]);
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

  public saveCrewmateAbilityPicker(drafts: AbilityRequirementDraft[]): void {
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
  }

  public clearCrewmateAbilityFilters(): void {
    this.crewmateAbilityDrafts.set([]);
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

  public savePotentialAbilityPicker(drafts: AbilityRequirementDraft[]): void {
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
  }

  public clearPotentialAbilityFilters(): void {
    this.potentialAbilityDrafts.set([]);
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

  public saveSupportAbilityPicker(drafts: AbilityRequirementDraft[]): void {
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
  }

  public clearSupportAbilityFilters(): void {
    this.supportAbilityDrafts.set([]);
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

  public clearAbilityFilterCategory(category: AbilityFilterRailCategory): void {
    switch (category) {
      case 'special':
        this.clearSpecialAbilityFilters();
        break;
      case 'crewmate':
        this.clearCrewmateAbilityFilters();
        break;
      case 'potential':
        this.clearPotentialAbilityFilters();
        break;
      case 'support':
        this.clearSupportAbilityFilters();
        break;
    }
  }

  public formatBoost(value: number): string {
    return value > 0 ? String(Number(value.toFixed(3))) : '-';
  }

  public trackCharacter(_index: number, card: CaptainCoverageCardView): number {
    return card.character.id;
  }

  public trackTeamSlot(index: number): number {
    return index;
  }

  public teamSlotLabel(index: number): string {
    return index === 0 ? this.t('team.slots.captain') : this.t('team.slots.sub', { index });
  }

  public canAssignTeamSlotCharacter(
    index: number,
    character: Pick<CharacterListItem, 'cost'>,
  ): boolean {
    const maxTotalCost = this.maxTotalCost();

    if (maxTotalCost === null) {
      return true;
    }

    const currentSlotCost = this.selectedTeamSlots()[index]?.cost ?? 0;

    return this.teamBudgetCost() - currentSlotCost + character.cost <= maxTotalCost;
  }

  private matchesSearchTerm(
    character: CharacterListItem,
    coverage: CaptainCoverageResult,
    searchTerm: string,
  ): boolean {
    return [
      character.id,
      character.name,
      character.type,
      character.primaryClass,
      character.secondaryClass ?? '',
      ...character.classes,
      coverage.captainText,
      ...coverage.chips.map((chip) => chip.label),
    ]
      .join(' ')
      .toLowerCase()
      .includes(searchTerm);
  }

  private hasPartyConflict(
    character: CharacterListItem,
    selectedConflictKeys: Set<string>,
  ): boolean {
    return resolveCharacterPartyConflictKeys(character).some((conflictKey) =>
      selectedConflictKeys.has(conflictKey),
    );
  }

  private resolveSelectedTeamConflictKeys(): Set<string> {
    return new Set(
      this.selectedTeamSlots()
        .filter((character): character is CharacterListItem => Boolean(character))
        .flatMap((character) => resolveCharacterPartyConflictKeys(character)),
    );
  }

  private findAssignableSubSlotIndex(character: CharacterListItem): number | null {
    for (let index = 1; index < CAPTAIN_COVERAGE_TEAM_SLOT_COUNT; index += 1) {
      if (this.selectedTeamSlots()[index] || !this.canAssignTeamSlotCharacter(index, character)) {
        continue;
      }

      return index;
    }

    return null;
  }

  private resolveSelectedTeamSlotDetails(): Array<CharacterDetailRecord | null> {
    const characterDetailsById = this.allCharacterDetailsById();

    return this.selectedTeamSlots().map((slot) =>
      slot ? (characterDetailsById.get(slot.id) ?? null) : null,
    );
  }

  private buildMatchedAbilityBadges(
    abilities: readonly NormalizedBuilderAbility[],
    requirements: readonly AutoBuildAbilityRequirement[],
  ): CaptainCoverageAbilityBadgeView[] {
    if (!requirements.length) {
      return [];
    }

    const badges: CaptainCoverageAbilityBadgeView[] = [];
    const seen = new Set<string>();
    const requirementList = [...requirements];

    for (const ability of abilities) {
      if (!matchesAnyAbilityRequirement(ability, requirementList)) {
        continue;
      }

      const key = [
        ability.key,
        ability.source,
        ability.minTurns ?? 'none',
        ability.slotTokens.join(','),
        ability.coverageMode ?? 'explicit',
      ].join('|');

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      badges.push({
        key,
        label: this.formatAbilityBadgeLabel(ability),
      });
    }

    return badges;
  }

  private countMatchedAbilityRequirements(
    abilities: readonly NormalizedBuilderAbility[],
    requirements: readonly AutoBuildAbilityRequirement[],
  ): number {
    if (!requirements.length || !abilities.length) {
      return 0;
    }

    const matchedRequirementIds = new Set<string>();

    for (const requirement of requirements) {
      if (!abilities.some((ability) => matchesAbilityRequirement(ability, requirement))) {
        continue;
      }

      matchedRequirementIds.add(buildAbilityRequirementIdentity(requirement));
    }

    return matchedRequirementIds.size;
  }

  private formatAbilityBadgeLabel(ability: NormalizedBuilderAbility): string {
    const metadata: string[] = [];

    if (ability.minTurns !== null) {
      metadata.push(
        this.i18n.translate('characterAbilityGroups.metadata.turns', {
          count: ability.minTurns,
        }),
      );
    }

    if (ability.slotTokens.length) {
      metadata.push(ability.slotTokens.join('/'));
    }

    const metadataSuffix = metadata.length ? ` (${metadata.join(', ')})` : '';

    return `${this.formatAbilitySourceLabel(ability.source)}: ${ability.label}${metadataSuffix}`;
  }

  private formatAbilitySourceLabel(source: AutoBuildAbilitySource): string {
    return this.i18n.translate(`characterAbilityGroups.sources.${source}`);
  }

  private sortResultCards(cards: CaptainCoverageCardView[]): CaptainCoverageCardView[] {
    return [...cards].sort((left, right) => {
      const sortMode = this.selectedSortMode();
      const idOrder = this.selectedIdOrder();

      if (this.abilityMatchRankingEnabled() && this.selectedAbilityRequirements().length > 0) {
        const abilityMatchDifference = right.abilityMatchCount - left.abilityMatchCount;

        if (abilityMatchDifference !== 0) {
          return abilityMatchDifference;
        }
      }

      if (sortMode === 'captainHpBoost') {
        return compareBoostCards(left, right, 'captainHpBoost', idOrder);
      }

      if (sortMode === 'captainAtkBoost') {
        return compareBoostCards(left, right, 'captainAtkBoost', idOrder);
      }

      if (sortMode === 'captainAverageBoost') {
        return compareBoostCards(left, right, 'captainAverageBoost', idOrder);
      }

      if (sortMode === 'nameAsc') {
        return compareNameCards(left, right, idOrder);
      }

      if (sortMode === 'nameDesc') {
        const nameDifference = right.character.name.localeCompare(left.character.name, undefined, {
          sensitivity: 'base',
        });

        return (
          nameDifference || compareCharacterIds(left.character.id, right.character.id, idOrder)
        );
      }

      return compareCharacterIds(left.character.id, right.character.id, idOrder);
    });
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(`captain-coverage.${key}`, params);
  }
}

function compareBoostCards(
  left: CaptainCoverageCardView,
  right: CaptainCoverageCardView,
  key: 'captainAtkBoost' | 'captainAverageBoost' | 'captainHpBoost',
  idOrder: CharacterIdOrder,
): number {
  const boostDifference = right.character[key] - left.character[key];

  if (boostDifference !== 0) {
    return boostDifference;
  }

  return compareCharacterIds(left.character.id, right.character.id, idOrder);
}

function compareNameCards(
  left: CaptainCoverageCardView,
  right: CaptainCoverageCardView,
  idOrder: CharacterIdOrder,
): number {
  return (
    left.character.name.localeCompare(right.character.name, undefined, { sensitivity: 'base' }) ||
    compareCharacterIds(left.character.id, right.character.id, idOrder)
  );
}

function compareCharacterIds(leftId: number, rightId: number, idOrder: CharacterIdOrder): number {
  return idOrder === 'oldest' ? leftId - rightId : rightId - leftId;
}

function isCaptainCoverageSortMode(
  value: string | null | undefined,
): value is CaptainCoverageSortMode {
  return (
    value === 'catalog' ||
    value === 'captainAtkBoost' ||
    value === 'captainAverageBoost' ||
    value === 'captainHpBoost' ||
    value === 'nameAsc' ||
    value === 'nameDesc'
  );
}

function normalizeCharacterIdOrder(value: string | null | undefined): CharacterIdOrder {
  return value === 'oldest' ? 'oldest' : 'newest';
}

function createEmptyTeamSlots(): Array<CharacterListItem | null> {
  return Array.from({ length: CAPTAIN_COVERAGE_TEAM_SLOT_COUNT }, () => null);
}

function normalizeCostValue(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

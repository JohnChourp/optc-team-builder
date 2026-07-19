import { Component, type OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  peopleOutline,
  saveOutline,
  searchOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';

import {
  type AbilityFilterTagSetSelection,
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import { type CaptainCoverageResult } from '../../core/services/captain-coverage.utils';
import { buildCaptainCoverageTierView } from '../../core/services/captain-coverage-tier-view.utils';
import {
  createCaptainCoverageFilterState,
  type CaptainCoverageFilterState,
  getCaptainCoverageAvailableTierNumbers,
  getCaptainCoverageTiers,
  hasCaptainCoverageSuperTandemData,
  hasCaptainCoverageSuperTypesClassesData,
  resolveCaptainCoverageFilterResult,
} from '../../core/services/captain-coverage-filter.utils';
import {
  resolveCaptainTeamConditionStatus,
  type CaptainTeamConditionStatus,
} from '../../core/services/captain-team-condition-status.utils';
import {
  type CharacterBox,
  type CharacterDetailRecord,
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSortMode,
  type DatasetManifest,
  type SavedTeam,
} from '../../core/models/optc.models';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { resolveCharacterPartyConflictKeys } from '../../core/services/auto-team-builder.utils';
import {
  cloneAbilityFilterTagSetSelection,
  countTagSetRequirements,
  createEmptyAbilityFilterTagSetSelection,
  flattenTagSetsToRequirements,
  resolveTagSetSelectionMatchingCharacterIds,
} from '../../core/services/ability-filter-tag-set.utils';
import {
  getAbilityCatalogItemsByCategory,
  getCaptainAbilityCatalogItems,
  isCaptainAbilityRequirement,
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
import {
  AbilityTagSetPickerComponent,
  type AbilityTagSetPickerSection,
} from '../../shared/ability-tag-set-picker/ability-tag-set-picker.component';
import { CharacterImagePickerComponent } from '../../shared/character-image-picker/character-image-picker.component';
import { CaptainTeamConditionStatusComponent } from '../../shared/captain-team-condition-status/captain-team-condition-status.component';
import { TeamCoverageSummaryComponent } from '../../shared/team-coverage-summary/team-coverage-summary.component';
import {
  CharacterFilterRowComponent,
  type CharacterFilterCostBound,
  type CharacterFilterCostRange,
  type CharacterFilterOption,
} from '../../shared/character-filter-row/character-filter-row.component';
import { CaptainCoverageStylePanelsComponent } from './captain-coverage-style-panels.component';

const MAX_CAPTAIN_LOOKUP_COUNT = 12000;
const CAPTAIN_COVERAGE_TEAM_SLOT_COUNT = 6;
const CAPTAIN_ABILITY_FILTER_CATEGORY: AbilityFilterRailCategory = 'captainAbility';
const CHARACTER_TAG_SUGGESTION_LIMIT = 12;

type CaptainCoverageSortMode =
  | Extract<
      CharacterSortMode,
      'catalog' | 'captainAtkBoost' | 'captainAverageBoost' | 'captainHpBoost' | 'nameAsc'
    >
  | 'nameDesc';
interface CaptainCoverageCardView {
  character: CharacterListItem;
  coverage: CaptainCoverageResult | null;
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

/** Rail-typed picker section, so chip counts can key off the same category union. */
interface CaptainCoverageAbilityTagSetSection extends AbilityTagSetPickerSection {
  category: AbilityFilterRailCategory;
}

@Component({
  selector: 'app-captain-coverage-page',
  standalone: true,
  imports: [
    AbilityFilterRailComponent,
    AbilityTagSetPickerComponent,
    CaptainTeamConditionStatusComponent,
    CaptainCoverageStylePanelsComponent,
    CharacterImagePickerComponent,
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
    IonToggle,
    IonToolbar,
    RouterLink,
    CharacterFilterRowComponent,
    TeamCoverageSummaryComponent,
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
  public readonly selectedFriendCaptainDetail = computed<CharacterDetailRecord | null>(() => {
    const friendCaptain = this.selectedTeamSlots()[1];

    return friendCaptain ? (this.allCharacterDetailsById().get(friendCaptain.id) ?? null) : null;
  });
  public readonly activeTeamSlotIndex = signal(0);
  public readonly teamPickerOpen = signal(false);
  public readonly teamName = signal('');
  public readonly currentTeamId = signal<string | null>(null);
  public readonly saveUiLocked = signal(false);
  public readonly saveFeedbackError = signal('');
  public readonly maxTotalCost = signal<number | null>(null);
  public readonly allCaptains = signal<CharacterDetailRecord[]>([]);
  public readonly loading = signal(true);
  public readonly searchTerm = signal('');
  public readonly typeQuery = signal('');
  public readonly classQuery = signal('');
  public readonly selectedType = signal('');
  public readonly selectedClass = signal('');
  public readonly coverageCostRange = signal<CharacterFilterCostRange>({
    min: null,
    max: null,
  });
  public readonly selectedSortMode = signal<CaptainCoverageSortMode>('catalog');
  public readonly selectedIdOrder = signal<CharacterIdOrder>('newest');
  public readonly abilityMatchRankingEnabled = signal(false);
  public readonly requireSuperTandemPresence = signal(false);
  public readonly requireSuperTypesClassesPresence = signal(false);
  public readonly requiredTierNumbers = signal<number[]>([]);
  public readonly tierCoverageMaxRender = 5;
  public readonly favoritesOnly = signal(false);
  public readonly hideFavorites = signal(false);
  public readonly availableCharacterTags = signal<string[]>([]);
  public readonly selectedCharacterTags = signal<string[]>([]);
  public readonly characterTagSearchTerm = signal('');
  public readonly abilityTagSetPickerOpen = signal(false);
  public readonly tagSetSelection = signal<AbilityFilterTagSetSelection>(
    createEmptyAbilityFilterTagSetSelection(),
  );
  public readonly favoriteIds;
  public readonly characterBoxes;
  public readonly selectedCharacterBoxId = signal<string | null>(null);

  public readonly selectedCaptain = computed(() => this.selectedTeamSlots()[0] ?? null);
  public readonly selectedCharacterBox = computed<CharacterBox | null>(() =>
    this.resolveCharacterBoxById(this.selectedCharacterBoxId()),
  );
  public readonly selectedCharacterBoxIds = computed(
    () => this.selectedCharacterBox()?.characterIds ?? [],
  );
  public readonly selectedCharacterBoxFavoriteCount = computed(() => {
    const selectedBox = this.selectedCharacterBox();

    if (!selectedBox) {
      return 0;
    }

    const favoriteIdSet = new Set(this.favoriteIds());

    return selectedBox.characterIds.filter((characterId) => favoriteIdSet.has(characterId)).length;
  });
  public readonly availableTypes = computed(() =>
    this.normalizeOptions(this.summary()?.availableTypes ?? []),
  );
  public readonly availableClasses = computed(() =>
    this.normalizeOptions(this.summary()?.availableClasses ?? []),
  );
  public readonly hasSelectedCharacterTags = computed(
    () => this.selectedCharacterTags().length > 0,
  );
  public readonly filteredCharacterTagSuggestions = computed<string[]>(() => {
    const searchTerm = this.normalizeCharacterTagSearchTerm(this.characterTagSearchTerm());

    if (!searchTerm) {
      return [];
    }

    const selectedTagKeys = new Set(this.selectedCharacterTags().map((tag) => tag.toLowerCase()));

    return this.availableCharacterTags()
      .filter((tag) => !selectedTagKeys.has(tag.toLowerCase()))
      .filter((tag) => tag.toLowerCase().includes(searchTerm))
      .sort((left, right) => {
        const leftStartsWith = left.toLowerCase().startsWith(searchTerm);
        const rightStartsWith = right.toLowerCase().startsWith(searchTerm);

        if (leftStartsWith !== rightStartsWith) {
          return leftStartsWith ? -1 : 1;
        }

        return left.localeCompare(right);
      })
      .slice(0, CHARACTER_TAG_SUGGESTION_LIMIT);
  });
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
  /**
   * Stable-identity view of the whole catalog. `getCatalogAbilityIndex` caches by
   * array identity, so rebuilding this per keystroke would silently turn its O(1)
   * lookups into repeated full-catalog scans.
   */
  public readonly allCatalogItems = computed<AutoBuildAbilityCatalogItem[]>(
    () => this.abilityCatalog()?.abilities ?? [],
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
  public readonly abilityTagSetPickerSections = computed<CaptainCoverageAbilityTagSetSection[]>(
    () => [
      {
        category: CAPTAIN_ABILITY_FILTER_CATEGORY,
        label: this.t('filters.captainAbilityEyebrow'),
        items: this.availableCaptainAbilityCatalogItems(),
        captainAbility: true,
      },
      {
        category: 'special',
        label: this.t('filters.specialEyebrow'),
        items: this.availableSpecialAbilityCatalogItems(),
      },
      {
        category: 'crewmate',
        label: this.t('filters.crewmateEyebrow'),
        items: this.availableCrewmateAbilityCatalogItems(),
      },
      {
        category: 'potential',
        label: this.t('filters.potentialEyebrow'),
        items: this.availablePotentialAbilityCatalogItems(),
      },
      {
        category: 'support',
        label: this.t('filters.supportEyebrow'),
        items: this.availableSupportAbilityCatalogItems(),
      },
    ],
  );
  /**
   * Rail category per ability key, built from the non-captain sections only:
   * captain membership is decided by the requirement's own source scope, because
   * the same key can live in both the captain section and a category section.
   */
  private readonly abilityFilterCategoryByAbilityKey = computed(() => {
    const categoryByKey = new Map<string, AbilityFilterRailCategory>();

    for (const section of this.abilityTagSetPickerSections()) {
      if (section.captainAbility) {
        continue;
      }

      for (const item of section.items) {
        categoryByKey.set(item.key, section.category);
      }
    }

    return categoryByKey;
  });
  private readonly tagSetRequirements = computed<AutoBuildAbilityRequirement[]>(() =>
    flattenTagSetsToRequirements(this.tagSetSelection()),
  );
  /** Non-captain requirements, kept apart so badges never cross source scopes. */
  public readonly selectedAbilityRequirements = computed<AutoBuildAbilityRequirement[]>(() =>
    this.tagSetRequirements().filter((requirement) => !isCaptainAbilityRequirement(requirement)),
  );
  public readonly captainAbilityRequirements = computed<AutoBuildAbilityRequirement[]>(() =>
    this.tagSetRequirements().filter((requirement) => isCaptainAbilityRequirement(requirement)),
  );
  public readonly selectedAbilityRequirementCount = computed(() =>
    countTagSetRequirements(this.tagSetSelection()),
  );
  /** How many requirements of each category the whole selection holds. */
  private readonly tagSetRequirementCountsByCategory = computed(() => {
    const categoryByKey = this.abilityFilterCategoryByAbilityKey();
    const counts = new Map<AbilityFilterRailCategory, number>();

    for (const requirement of this.tagSetRequirements()) {
      const category = this.resolveAbilityFilterRailCategory(requirement, categoryByKey);

      if (!category) {
        continue;
      }

      counts.set(category, (counts.get(category) ?? 0) + 1);
    }

    return counts;
  });
  public readonly tagSetMatchingCharacterIds = computed<number[] | undefined>(() =>
    resolveTagSetSelectionMatchingCharacterIds(this.tagSetSelection(), this.allCatalogItems()),
  );
  public readonly abilityMatchRankingDisabled = computed(
    () => this.selectedAbilityRequirementCount() === 0,
  );
  public readonly availableTierNumbers = computed<number[]>(() =>
    getCaptainCoverageAvailableTierNumbers(this.selectedCaptainDetail()),
  );
  public readonly captainTierBreakdown = computed(() =>
    getCaptainCoverageTiers(this.selectedCaptainDetail()).map(buildCaptainCoverageTierView),
  );
  public readonly hasTierCoverageData = computed<boolean>(
    () => this.availableTierNumbers().length > 0,
  );
  public readonly tierCoverageOptions = computed<number[]>(() => {
    const slots = Math.max(this.tierCoverageMaxRender, this.availableTierNumbers().length);
    return Array.from({ length: slots }, (_, index) => index + 1);
  });
  public readonly captainCoverageFilterState = computed<CaptainCoverageFilterState>(() => {
    const availableTiers = this.availableTierNumbers();
    const requestedTiers = this.requiredTierNumbers().filter((tier) =>
      availableTiers.includes(tier),
    );
    const abilityMatchingCharacterIds = this.tagSetMatchingCharacterIds();

    return createCaptainCoverageFilterState({
      // One resolved id index feeds both this per-character path and the page
      // level filter below, so the two can never disagree about a character.
      requiredAbilityCharacterIds: abilityMatchingCharacterIds
        ? new Set(abilityMatchingCharacterIds)
        : null,
      requireSuperTandem: this.requireSuperTandemPresence(),
      requireSuperTypesClasses: this.requireSuperTypesClassesPresence(),
      requireCaptainCoverage: true,
      requireFullCoverage: false,
      requiredTiers: requestedTiers,
    });
  });
  public readonly characterBoxSupportLabel = computed(() => {
    return this.buildCharacterBoxSupportText(this.selectedCharacterBox());
  });
  public readonly characterBoxFilterOptions = computed<CharacterFilterOption[]>(() => [
    {
      value: '',
      label: this.t('filters.characterBox.options.all'),
      supportText: this.buildCharacterBoxSupportText(null),
    },
    ...this.characterBoxes().map((box) => ({
      value: box.id,
      label: `${box.name} (${box.characterIds.length})`,
      supportText: this.buildCharacterBoxSupportText(box),
    })),
  ]);
  public readonly sortFilterOptions = computed<CharacterFilterOption[]>(() => [
    { value: 'catalog', label: this.t('sort.options.catalog') },
    { value: 'captainAverageBoost', label: this.t('sort.options.captainAverageBoost') },
    { value: 'captainAtkBoost', label: this.t('sort.options.captainAtkBoost') },
    { value: 'captainHpBoost', label: this.t('sort.options.captainHpBoost') },
    { value: 'nameAsc', label: this.t('sort.options.nameAsc') },
    { value: 'nameDesc', label: this.t('sort.options.nameDesc') },
  ]);
  public readonly idOrderFilterOptions = computed<CharacterFilterOption[]>(() => [
    { value: 'newest', label: this.t('idOrder.options.newest') },
    { value: 'oldest', label: this.t('idOrder.options.oldest') },
  ]);
  public readonly abilityFilterRailItems = computed<AbilityFilterRailItem[]>(() => {
    const countsByCategory = this.tagSetRequirementCountsByCategory();

    return this.abilityTagSetPickerSections().map((section) => ({
      category: section.category,
      label: section.label,
      count: countsByCategory.get(section.category) ?? 0,
      disabled: !section.items.length,
    }));
  });

  public readonly resultCards = computed<CaptainCoverageCardView[]>(() => {
    const captain = this.selectedCaptainDetail();
    const normalizedSearchTerm = this.searchTerm().trim().toLowerCase();
    const selectedType = this.selectedType();
    const selectedClass = this.selectedClass();
    const coverageCostRange = this.coverageCostRange();
    const favoriteIdSet = new Set(this.favoriteIds());
    const selectedCharacterBoxIdSet = this.selectedCharacterBox()
      ? new Set(this.selectedCharacterBoxIds())
      : null;
    const selectedAbilityRequirements = this.selectedAbilityRequirements();
    const captainAbilityRequirements = this.captainAbilityRequirements();
    const captainCoverageFilterState = this.captainCoverageFilterState();
    const requiredAbilityCharacterIds = captainCoverageFilterState.requiredAbilityCharacterIds;
    const selectedAbilityRequirementCount = this.selectedAbilityRequirementCount();
    const characterDetailsById = this.allCharacterDetailsById();
    const selectedConflictKeys = this.resolveSelectedTeamConflictKeys();
    const selectedCharacterTagKeys = new Set(
      this.selectedCharacterTags()
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    );
    const matchingCharacters = this.allCharacters()
      .filter((character) =>
        selectedCharacterBoxIdSet ? selectedCharacterBoxIdSet.has(character.id) : true,
      )
      // Ability tag sets resolve to character ids once, so the whole AND/OR
      // formula costs one membership test per character here.
      .filter((character) =>
        requiredAbilityCharacterIds ? requiredAbilityCharacterIds.has(character.id) : true,
      )
      .map((character) => {
        const characterDetail = characterDetailsById.get(character.id);
        const filterResult = captain
          ? resolveCaptainCoverageFilterResult(
              captain,
              {
                character,
                detail: characterDetail,
              },
              captainCoverageFilterState,
            )
          : null;

        return {
          character,
          characterDetail,
          coverage: filterResult?.coverage ?? null,
          matchesCaptainCoverageFilters: filterResult?.matches ?? true,
        };
      })
      .filter(({ matchesCaptainCoverageFilters }) => matchesCaptainCoverageFilters)
      .filter(({ characterDetail }) => this.matchesSuperPresenceFilters(characterDetail))
      .filter(({ character }) => !this.hasPartyConflict(character, selectedConflictKeys))
      .filter(({ characterDetail }) =>
        this.matchesSelectedCharacterTags(characterDetail, selectedCharacterTagKeys),
      )
      .map(({ character, characterDetail, coverage }) => {
        const detailAbilities = characterDetail?.detail.builderAbilities ?? [];
        const abilities = detailAbilities.filter((ability) => ability.source !== 'captainAbility');
        const captainAbilities = detailAbilities.filter(
          (ability) => ability.source === 'captainAbility',
        );
        const abilityMatchCount = this.countMatchedAbilityRequirements(
          abilities,
          selectedAbilityRequirements,
        );
        const captainAbilityMatchCount = this.countMatchedAbilityRequirements(
          captainAbilities,
          captainAbilityRequirements,
        );

        return {
          character,
          coverage,
          assignableSlotIndex: this.findAssignableSubSlotIndex(character),
          abilityMatchCount,
          captainAbilityMatchCount,
          selectedAbilityCount: selectedAbilityRequirementCount,
          matchedAbilityBadges: [
            ...this.buildMatchedAbilityBadges(abilities, selectedAbilityRequirements),
            ...this.buildMatchedAbilityBadges(captainAbilities, captainAbilityRequirements),
          ],
        };
      })
      .filter(({ assignableSlotIndex }) => assignableSlotIndex !== null)
      .filter(({ character }) => this.matchesSelectedType(character, selectedType))
      .filter(({ character }) => this.matchesSelectedClass(character, selectedClass))
      .filter(({ character }) => this.matchesCoverageCostRange(character, coverageCostRange))
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
          captainAbilityMatchCount,
          selectedAbilityCount,
          matchedAbilityBadges,
        }) => ({
          character,
          coverage,
          assignableSlotIndex,
          abilityMatchCount: abilityMatchCount + captainAbilityMatchCount,
          selectedAbilityCount,
          matchedAbilityBadges,
          detailLink: ['/characters', String(character.id)],
        }),
      ),
    );
  });

  public readonly totalMatchingCharacters = computed(() => this.resultCards().length);
  public readonly filledTeamSlotCount = computed(
    () => this.selectedTeamSlots().filter(Boolean).length,
  );
  public readonly saveDisabled = computed(
    () => this.saveUiLocked() || this.filledTeamSlotCount() === 0,
  );
  public readonly saveButtonLabel = computed(() =>
    this.saveUiLocked() ? this.t('team.save.savingLabel') : this.t('team.save.action'),
  );
  public readonly teamBudgetCost = computed(() =>
    this.selectedTeamSlots().reduce(
      (total, character, index) => (index === 1 ? total : total + (character?.cost ?? 0)),
      0,
    ),
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
    if (activeIndex === 1) {
      return null;
    }

    const currentSlotCost = this.selectedTeamSlots()[activeIndex]?.cost ?? 0;

    return Math.max(0, maxTotalCost - this.teamBudgetCost() + currentSlotCost);
  });
  public readonly activeTeamSlotTitle = computed(() =>
    this.teamSlotLabel(this.activeTeamSlotIndex()),
  );
  public readonly activeTeamSlotAllowedCharacterIds = computed(() =>
    this.activeTeamSlotIndex() === 0 || this.activeTeamSlotIndex() === 1
      ? this.allowedCaptainIds()
      : null,
  );
  public readonly teamConditionStatus = computed<CaptainTeamConditionStatus | null>(() => {
    const captain = this.selectedCaptainDetail();

    if (!captain) {
      return null;
    }

    const slots = this.resolveSelectedTeamSlotDetails();
    const friendCaptain = this.selectedFriendCaptainDetail();

    return resolveCaptainTeamConditionStatus({
      expectedSlotCount: CAPTAIN_COVERAGE_TEAM_SLOT_COUNT,
      coverageMode: 'simpleBoostScope',
      leaders: [
        {
          role: 'captain',
          label: this.t('team.slots.captain'),
          character: captain,
        },
        ...(friendCaptain
          ? [
              {
                role: 'friendCaptain' as const,
                label: this.t('team.slots.friendCaptain'),
                character: friendCaptain,
              },
            ]
          : []),
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
  public readonly errorIcon = alertCircleOutline;
  public readonly saveIcon = saveOutline;
  public readonly searchIcon = searchOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.favoriteIds = this.userState.favoriteCharacterIds;
    this.characterBoxes = this.userState.characterBoxes;
    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
  }

  public async ngOnInit(): Promise<void> {
    this.loading.set(true);

    try {
      const [, , summary, abilityCatalog, records, , availableCharacterTags] = await Promise.all([
        this.userState.readyFavoriteCharacterIds(),
        this.userState.readyCharacterBoxes(),
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
        this.loadAvailableCharacterTags(),
      ]);

      this.summary.set(summary);
      this.abilityCatalog.set(abilityCatalog);
      this.availableCharacterTags.set(availableCharacterTags);
      this.allCharacters.set(this.characterCatalogCache.catalog());
      this.allCharacterDetailsById.set(new Map(records.map((record) => [record.id, record])));
      this.allCaptains.set(
        records.filter(
          (record) =>
            typeof record.detail.captainAbility === 'string' &&
            record.detail.captainAbility.trim().length > 0,
        ),
      );
      this.clearMissingSelectedCharacterBox();
      await this.applySavedTeamFromRoute();
    } finally {
      this.loading.set(false);
    }
  }

  public async ionViewWillEnter(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.clearMissingSelectedCharacterBox();
    await this.applySavedTeamFromRoute();
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

    if ((index === 0 || index === 1) && !this.allowedCaptainIds().includes(character.id)) {
      return;
    }

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, slotIndex) => (slotIndex === index ? character : slot)),
    );
    this.clearSavedTeamDraftState();
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
    this.clearSavedTeamDraftState();
  }

  public clearTeamSlot(index: number, event?: Event): void {
    event?.stopPropagation();

    if (index < 0 || index >= CAPTAIN_COVERAGE_TEAM_SLOT_COUNT) {
      return;
    }

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, slotIndex) => (slotIndex === index ? null : slot)),
    );
    this.clearSavedTeamDraftState();

    if (index === 0) {
      this.selectedCaptainDetail.set(null);
      this.searchTerm.set('');
    }
  }

  public onTeamNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.teamName.set((event.detail.value ?? '').trimStart());
  }

  public async saveTeam(): Promise<void> {
    if (this.saveDisabled()) {
      return;
    }

    this.saveUiLocked.set(true);
    this.saveFeedbackError.set('');

    try {
      const saved = await this.userState.saveTeam({
        id: this.currentTeamId() ?? undefined,
        name: this.teamName(),
        notes: '',
        shipId: null,
        slots: this.buildSavedTeamSlots(),
      });

      this.currentTeamId.set(saved.id);
    } catch (error) {
      console.error(error);
      this.saveFeedbackError.set(this.t('team.save.error'));
    } finally {
      this.saveUiLocked.set(false);
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

  public onTypeQueryChange(input: string | CustomEvent<{ value?: string | null }>): void {
    const nextValue = this.resolveStringInput(input).trimStart();
    this.typeQuery.set(nextValue);

    if (this.selectedType() && nextValue.trim() !== this.selectedType()) {
      this.selectedType.set('');
    }
  }

  public onClassQueryChange(input: string | CustomEvent<{ value?: string | null }>): void {
    const nextValue = this.resolveStringInput(input).trimStart();
    this.classQuery.set(nextValue);

    if (this.selectedClass() && nextValue.trim() !== this.selectedClass()) {
      this.selectedClass.set('');
    }
  }

  public applyTypeFilter(type: string): void {
    this.typeQuery.set(type);
    this.selectedType.set(type);
  }

  public applyClassFilter(characterClass: string): void {
    this.classQuery.set(characterClass);
    this.selectedClass.set(characterClass);
  }

  public clearTypeFilter(): void {
    this.typeQuery.set('');
    this.selectedType.set('');
  }

  public clearClassFilter(): void {
    this.classQuery.set('');
    this.selectedClass.set('');
  }

  public onCharacterTagSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.characterTagSearchTerm.set((event.detail.value ?? '').toString());
  }

  public addSelectedCharacterTag(characterTag: string): void {
    const currentTags = this.selectedCharacterTags();
    const nextTags = this.resolveSelectedCharacterTags([...currentTags, characterTag]);

    if (nextTags.length === currentTags.length) {
      return;
    }

    this.selectedCharacterTags.set(nextTags);
    this.characterTagSearchTerm.set('');
  }

  public selectFirstCharacterTagSuggestion(): void {
    const [firstSuggestion] = this.filteredCharacterTagSuggestions();

    if (firstSuggestion) {
      this.addSelectedCharacterTag(firstSuggestion);
    }
  }

  public removeSelectedCharacterTag(characterTag: string): void {
    this.selectedCharacterTags.set(
      this.selectedCharacterTags().filter((selectedTag) => selectedTag !== characterTag),
    );
  }

  public clearSelectedCharacterTags(): void {
    this.selectedCharacterTags.set([]);
    this.characterTagSearchTerm.set('');
  }

  public onCoverageCostRangeChange(
    bound: CharacterFilterCostBound,
    input: string | number | null | CustomEvent<{ value?: string | number | null }>,
  ): void {
    this.coverageCostRange.update((currentRange) => ({
      ...currentRange,
      [bound]: normalizeCostValue(this.resolveCostInput(input)),
    }));
  }

  public onFavoritesOnlyFilterChange(checked: boolean): void {
    this.favoritesOnly.set(checked);

    if (checked) {
      this.hideFavorites.set(false);
    }
  }

  public onHideFavoritesFilterChange(checked: boolean): void {
    this.hideFavorites.set(checked);

    if (checked) {
      this.favoritesOnly.set(false);
    }
  }

  public onSortModeChange(input: string | CustomEvent<{ value?: string | null }>): void {
    const value = this.resolveStringInput(input);

    if (isCaptainCoverageSortMode(value)) {
      this.selectedSortMode.set(value);
    }
  }

  public onIdOrderChange(input: string | CustomEvent<{ value?: string | null }>): void {
    this.selectedIdOrder.set(normalizeCharacterIdOrder(this.resolveStringInput(input)));
  }

  public onAbilityMatchRankingChange(event: CustomEvent<{ checked?: boolean | null }>): void {
    this.abilityMatchRankingEnabled.set(Boolean(event.detail.checked));
  }

  public onRequireSuperTandemPresenceChange(
    event: CustomEvent<{ checked?: boolean | null }>,
  ): void {
    this.requireSuperTandemPresence.set(Boolean(event.detail.checked));
  }

  public isTierCoverageAvailable(tier: number): boolean {
    return this.availableTierNumbers().includes(tier);
  }

  public isTierCoverageActive(tier: number): boolean {
    return this.isTierCoverageAvailable(tier) && this.requiredTierNumbers().includes(tier);
  }

  public onTierCoverageToggle(tier: number, checked: boolean): void {
    const current = new Set(this.requiredTierNumbers());
    if (checked) {
      current.add(tier);
    } else {
      current.delete(tier);
    }
    this.requiredTierNumbers.set([...current].sort((a, b) => a - b));
  }

  public onRequireSuperTypesClassesPresenceChange(
    event: CustomEvent<{ checked?: boolean | null }>,
  ): void {
    this.requireSuperTypesClassesPresence.set(Boolean(event.detail.checked));
  }

  public onCharacterBoxChange(input: string | CustomEvent<{ value?: string | null }>): void {
    this.selectedCharacterBoxId.set(this.normalizeCharacterBoxId(this.resolveStringInput(input)));
  }

  /** Every rail chip opens the one tag-set modal; the chip only picks the scope. */
  public openAbilityFilterCategory(category: AbilityFilterRailCategory): void {
    const section = this.abilityTagSetPickerSections().find(
      (candidate) => candidate.category === category,
    );

    if (!section?.items.length) {
      return;
    }

    this.abilityTagSetPickerOpen.set(true);
  }

  public closeAbilityTagSetPicker(): void {
    this.abilityTagSetPickerOpen.set(false);
  }

  public saveAbilityTagSetSelection(selection: AbilityFilterTagSetSelection): void {
    this.tagSetSelection.set(cloneAbilityFilterTagSetSelection(selection));
    this.abilityTagSetPickerOpen.set(false);
  }

  /** Drops one category's tags from every set, and any set left empty by that. */
  public clearAbilityFilterCategory(category: AbilityFilterRailCategory): void {
    const categoryByKey = this.abilityFilterCategoryByAbilityKey();

    this.tagSetSelection.update((selection) => ({
      ...selection,
      sets: selection.sets
        .map((set) => ({
          ...set,
          requirements: set.requirements.filter(
            (requirement) =>
              this.resolveAbilityFilterRailCategory(requirement, categoryByKey) !== category,
          ),
        }))
        .filter((set) => set.requirements.length > 0),
    }));
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
    if (index === 0) {
      return this.t('team.slots.captain');
    }
    if (index === 1) {
      return this.t('team.slots.friendCaptain');
    }
    return this.t('team.slots.sub', { index: index - 1 });
  }

  public canAssignTeamSlotCharacter(
    index: number,
    character: Pick<CharacterListItem, 'cost'>,
  ): boolean {
    const maxTotalCost = this.maxTotalCost();

    if (maxTotalCost === null || index === 1) {
      return true;
    }

    const currentSlotCost = this.selectedTeamSlots()[index]?.cost ?? 0;

    return this.teamBudgetCost() - currentSlotCost + character.cost <= maxTotalCost;
  }

  private resolveAbilityFilterRailCategory(
    requirement: AutoBuildAbilityRequirement,
    categoryByKey: ReadonlyMap<string, AbilityFilterRailCategory>,
  ): AbilityFilterRailCategory | null {
    if (isCaptainAbilityRequirement(requirement)) {
      return CAPTAIN_ABILITY_FILTER_CATEGORY;
    }

    return categoryByKey.get(requirement.abilityKey) ?? null;
  }

  private matchesSearchTerm(
    character: CharacterListItem,
    coverage: CaptainCoverageResult | null,
    searchTerm: string,
  ): boolean {
    return [
      character.id,
      character.name,
      character.type,
      character.primaryClass,
      character.secondaryClass ?? '',
      ...character.classes,
      ...(coverage?.chips.map((chip) => chip.label) ?? []),
    ]
      .join(' ')
      .toLowerCase()
      .includes(searchTerm);
  }

  private matchesSuperPresenceFilters(
    characterDetail: CharacterDetailRecord | null | undefined,
  ): boolean {
    if (this.requireSuperTandemPresence() && !hasCaptainCoverageSuperTandemData(characterDetail)) {
      return false;
    }

    if (
      this.requireSuperTypesClassesPresence() &&
      !hasCaptainCoverageSuperTypesClassesData(characterDetail)
    ) {
      return false;
    }

    return true;
  }

  private matchesSelectedType(character: CharacterListItem, selectedType: string): boolean {
    if (!selectedType) {
      return true;
    }

    return character.type
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean)
      .includes(selectedType);
  }

  private matchesSelectedClass(character: CharacterListItem, selectedClass: string): boolean {
    return selectedClass ? character.classes.includes(selectedClass) : true;
  }

  private matchesSelectedCharacterTags(
    characterDetail: CharacterDetailRecord | undefined,
    selectedTagKeys: Set<string>,
  ): boolean {
    if (selectedTagKeys.size === 0) {
      return true;
    }

    const tags = characterDetail?.detail.characterTags ?? [];

    return tags.some((tag) => selectedTagKeys.has(tag.trim().toLowerCase()));
  }

  private matchesCoverageCostRange(
    character: CharacterListItem,
    range: CharacterFilterCostRange,
  ): boolean {
    if (range.min !== null && character.cost < range.min) {
      return false;
    }

    if (range.max !== null && character.cost > range.max) {
      return false;
    }

    return true;
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
    for (let index = 2; index < CAPTAIN_COVERAGE_TEAM_SLOT_COUNT; index += 1) {
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

  private resolveCharacterBoxById(characterBoxId: string | null): CharacterBox | null {
    if (!characterBoxId) {
      return null;
    }

    return this.characterBoxes().find((box) => box.id === characterBoxId) ?? null;
  }

  private normalizeCharacterBoxId(value: string | null | undefined): string | null {
    const normalizedBoxId = typeof value === 'string' ? value.trim() : '';

    if (!normalizedBoxId) {
      return null;
    }

    return this.resolveCharacterBoxById(normalizedBoxId)?.id ?? null;
  }

  private clearMissingSelectedCharacterBox(): void {
    if (this.selectedCharacterBoxId() && !this.selectedCharacterBox()) {
      this.selectedCharacterBoxId.set(null);
    }
  }

  private buildCharacterBoxSupportText(box: CharacterBox | null): string {
    if (!this.characterBoxes().length) {
      return this.t('filters.characterBox.support.noBoxes');
    }

    if (!box) {
      return this.t('filters.characterBox.support.all');
    }

    if (this.favoritesOnly()) {
      return this.t('filters.characterBox.support.withFavorites', {
        count: this.countCharacterBoxFavorites(box),
        total: box.characterIds.length,
      });
    }

    return this.t('filters.characterBox.support.withCount', {
      count: box.characterIds.length,
    });
  }

  private countCharacterBoxFavorites(box: CharacterBox): number {
    const favoriteIdSet = new Set(this.favoriteIds());

    return box.characterIds.filter((characterId) => favoriteIdSet.has(characterId)).length;
  }

  private async applySavedTeamFromRoute(): Promise<void> {
    const teamId = this.route.snapshot.queryParamMap.get('teamId')?.trim() ?? '';

    if (!teamId.length) {
      return;
    }

    await this.userState.readySavedTeams();
    const team = this.userState.getSavedTeamById(teamId);

    if (!team) {
      await this.clearSavedTeamQueryParam();
      return;
    }

    this.loadSavedTeamDraft(team);
    await this.clearSavedTeamQueryParam();
  }

  private loadSavedTeamDraft(team: SavedTeam): void {
    const characterDetailsById = this.allCharacterDetailsById();
    const sourceSlotIndexes = [0, 1, 2, 3, 4, 5];
    const selectedSlots = sourceSlotIndexes.map((slotIndex) => {
      const characterId = team.slots[slotIndex];

      return typeof characterId === 'number'
        ? (characterDetailsById.get(characterId) ?? null)
        : null;
    });
    const captain = selectedSlots[0] ?? null;

    this.closeTeamSlotPicker();
    this.selectedTeamSlots.set(selectedSlots);
    this.activeTeamSlotIndex.set(0);
    this.teamName.set(team.name);
    this.currentTeamId.set(null);
    this.saveFeedbackError.set('');
    this.saveUiLocked.set(false);
    this.searchTerm.set('');
    this.selectedCaptainDetail.set(captain);
  }

  private async clearSavedTeamQueryParam(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private buildSavedTeamSlots(): Array<number | null> {
    const slots = this.selectedTeamSlots();
    const captainId = slots[0]?.id ?? null;

    return [
      captainId,
      slots[1]?.id ?? captainId,
      slots[2]?.id ?? null,
      slots[3]?.id ?? null,
      slots[4]?.id ?? null,
      slots[5]?.id ?? null,
    ];
  }

  private clearSavedTeamDraftState(): void {
    this.currentTeamId.set(null);
    this.saveFeedbackError.set('');
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

  private normalizeOptions(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  private normalizeCharacterTagSearchTerm(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private resolveSelectedCharacterTags(value: string[] | string | null | undefined): string[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];
    const availableTagByKey = new Map(
      this.availableCharacterTags().map((tag) => [tag.toLowerCase(), tag] as const),
    );
    const uniqueTags = new Map<string, string>();

    for (const candidate of nextValues) {
      const normalizedTag = candidate.trim().replace(/\s+/g, ' ');
      const canonicalTag = availableTagByKey.get(normalizedTag.toLowerCase());

      if (canonicalTag && !uniqueTags.has(canonicalTag.toLowerCase())) {
        uniqueTags.set(canonicalTag.toLowerCase(), canonicalTag);
      }
    }

    return [...uniqueTags.values()];
  }

  private async loadAvailableCharacterTags(): Promise<string[]> {
    if (typeof this.repository.getAvailableCharacterTags !== 'function') {
      return [];
    }

    try {
      return await this.repository.getAvailableCharacterTags();
    } catch {
      return [];
    }
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

  private sortResultCards(cards: CaptainCoverageCardView[]): CaptainCoverageCardView[] {
    return [...cards].sort((left, right) => {
      const sortMode = this.selectedSortMode();
      const idOrder = this.selectedIdOrder();

      if (this.abilityMatchRankingEnabled() && this.selectedAbilityRequirementCount() > 0) {
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

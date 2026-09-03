import {
  Component,
  type ElementRef,
  type OnInit,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
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
  funnelOutline,
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
import {
  buildCaptainCoverageTierView,
  type CaptainCoverageTierViewModel,
} from '../../core/services/captain-coverage-tier-view.utils';
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
  type CharacterFacetSelection,
  type CharacterIdOrder,
  type CharacterListItem,
  type CharacterSortMode,
  type CharacterTagSetSelection,
  type DatasetManifest,
  type SavedTeam,
} from '../../core/models/optc.models';
import {
  countCharacterFacetMatches,
  createEmptyCharacterFacetSelection,
  matchesCharacterFacet,
} from '../../core/services/character-facet-filter.utils';
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
  buildCharacterTagMatchIndex,
  cloneCharacterTagSetSelection,
  countCharacterTagSetTags,
  countPopulatedCharacterTagSets,
  createEmptyCharacterTagSetSelection,
  expandCharacterTagsToSets,
  flattenCharacterTagSets,
  matchesCharacterTagSets,
} from '../../core/services/character-tag-set.utils';
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
  type AbilityFilterRailCategory,
} from '../../shared/ability-filter-rail/ability-filter-rail.component';
import {
  AbilityTagSetPickerComponent,
  type AbilityTagSetPickerSection,
} from '../../shared/ability-tag-set-picker/ability-tag-set-picker.component';
import {
  CharacterTagSetPickerComponent,
  type CharacterTagMatchIndex,
} from '../../shared/character-tag-set-picker/character-tag-set-picker.component';
import { CharacterFacetFilterComponent } from '../../shared/character-facet-filter/character-facet-filter.component';
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
/**
 * How many result cards the page paints before the "show more" control.
 *
 * Measured on 2026-09-02 (local production build, headless Chromium): opening
 * the ability modal with all 4,613 cards rendered costs 2,675 ms on a 4x
 * CPU-throttled phone profile, against 249 ms with 61 cards and 275 ms with
 * none - the modal itself is a quarter of a second and the rest is this list
 * being re-evaluated under default change detection. The heading still reports
 * the true total; only the painted slice is capped. Matches the Characters page.
 */
const RESULT_PAGE_SIZE = 100;

/**
 * Whether two result sets hold the same characters in the same order.
 *
 * The paging position must survive anything that rebuilds a card WITHOUT
 * changing which characters matched - assigning a result to the team is the
 * one that bites, because `resultCards` reads the team slots for the per-card
 * leader and sub-slot state. Comparing the array reference would collapse the
 * list back to page one on every add-to-team, set-leader and clear-slot.
 */
function isSameResultSequence(left: readonly number[], right: readonly number[]): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

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
  /** Raw coverage verdict, or `null` while no Captain is selected. */
  captainBoosted: boolean | null;
  /** False for the characters that carry no Captain Ability at all. */
  canBeLeader: boolean;
  /** False when the cost budget would reject this character in the leader slot. */
  leaderFitsBudget: boolean;
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
    AbilityTagSetPickerComponent,
    CaptainTeamConditionStatusComponent,
    CaptainCoverageStylePanelsComponent,
    CharacterFacetFilterComponent,
    CharacterTagSetPickerComponent,
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
  public readonly teamName = signal('');
  public readonly currentTeamId = signal<string | null>(null);
  public readonly saveUiLocked = signal(false);
  public readonly saveFeedbackError = signal('');
  public readonly maxTotalCost = signal<number | null>(null);
  public readonly allCaptains = signal<CharacterDetailRecord[]>([]);
  public readonly loading = signal(true);
  public readonly searchTerm = signal('');
  /**
   * How far "show more" has paged, tied to the characters it paged through.
   * Any change to which characters match resets the page; a change to how an
   * already-matching card renders does not.
   */
  private readonly loadMoreState = signal<{
    sourceIds: readonly number[];
    count: number;
  } | null>(null);
  public readonly typeFacet = signal<CharacterFacetSelection>(createEmptyCharacterFacetSelection());
  public readonly classFacet = signal<CharacterFacetSelection>(
    createEmptyCharacterFacetSelection(),
  );
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
  /**
   * Flat mirror of the tag-set selection, kept only as the legacy surface other
   * call sites read. The selection below is authoritative for filtering; this
   * is re-derived from it on every save so the two can never disagree.
   */
  public readonly selectedCharacterTags = signal<string[]>([]);
  public readonly characterTagSetPickerOpen = signal(false);
  public readonly characterTagSetSelection = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );
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
  /**
   * How many catalog characters match THIS facet alone. The page already holds
   * the whole catalog (it slurps every character up front and filters client
   * side), so the count is free — and it is what lets the control tell a
   * satisfiable-but-empty `all` pair apart from an arity-impossible one.
   */
  public readonly typeFacetMatchCount = computed(() =>
    countCharacterFacetMatches('type', this.allCharacters(), this.typeFacet()),
  );
  public readonly classFacetMatchCount = computed(() =>
    countCharacterFacetMatches('class', this.allCharacters(), this.classFacet()),
  );
  public readonly hasSelectedCharacterTags = computed(
    () => countPopulatedCharacterTagSets(this.characterTagSetSelection()) > 0,
  );
  public readonly characterTagFilterTriggerLabel = computed(() => {
    const selection = this.characterTagSetSelection();
    const groups = countPopulatedCharacterTagSets(selection);

    return groups
      ? this.t('filters.characterTags.trigger.active', {
          tags: countCharacterTagSetTags(selection),
          groups,
        })
      : this.t('filters.characterTags.trigger.empty');
  });
  public readonly characterTagFilterSupportText = computed(() => {
    if (countPopulatedCharacterTagSets(this.characterTagSetSelection()) < 2) {
      return this.t('filters.characterTags.support.empty');
    }

    return this.t(`filters.characterTags.support.${this.characterTagSetSelection().operator}`);
  });
  /**
   * `tag -> character ids carrying it`, so the picker can preview real match
   * counts instead of hiding every tally. Keys are lower-cased for lookup while
   * the catalog keeps the cased values the user actually sees.
   */
  public readonly characterTagMatchIndex = computed<CharacterTagMatchIndex>(() =>
    buildCharacterTagMatchIndex(this.allCharacterDetailsById().values()),
  );
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
   * Set form of the same ids. `resultCards` tests every character against it,
   * so an array scan here would turn one render into millions of comparisons.
   */
  private readonly allowedCaptainIdSet = computed(() => new Set(this.allowedCaptainIds()));
  /** True while at least one sub slot (index 2..5) is still empty. */
  public readonly hasFreeSubSlot = computed(() =>
    this.selectedTeamSlots()
      .slice(2)
      .some((slot) => !slot),
  );
  /**
   * Where the result-card leader button writes: the first empty leader slot,
   * and the Captain slot once both are taken, so the Captain can still be
   * swapped out of an otherwise full team.
   */
  public readonly leaderButtonSlotIndex = computed<0 | 1>(() => {
    const slots = this.selectedTeamSlots();

    if (!slots[0]) {
      return 0;
    }

    return slots[1] ? 0 : 1;
  });
  public readonly leaderButtonIcon = computed(() =>
    this.leaderButtonSlotIndex() === 0 ? this.coverageIcon : this.targetIcon,
  );
  public readonly leaderButtonLabel = computed(() =>
    this.t(
      this.leaderButtonSlotIndex() === 0
        ? 'team.actions.setAsCaptain'
        : 'team.actions.setAsFriendCaptain',
    ),
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
        description: this.t('filters.abilityTagSets.sections.captainAbility'),
        items: this.availableCaptainAbilityCatalogItems(),
        captainAbility: true,
      },
      {
        category: 'special',
        label: this.t('filters.specialEyebrow'),
        description: this.t('filters.abilityTagSets.sections.special'),
        items: this.availableSpecialAbilityCatalogItems(),
      },
      {
        category: 'crewmate',
        label: this.t('filters.crewmateEyebrow'),
        description: this.t('filters.abilityTagSets.sections.crewmate'),
        items: this.availableCrewmateAbilityCatalogItems(),
      },
      {
        category: 'potential',
        label: this.t('filters.potentialEyebrow'),
        description: this.t('filters.abilityTagSets.sections.potential'),
        items: this.availablePotentialAbilityCatalogItems(),
      },
      {
        category: 'support',
        label: this.t('filters.supportEyebrow'),
        description: this.t('filters.abilityTagSets.sections.support'),
        items: this.availableSupportAbilityCatalogItems(),
      },
    ],
  );
  /** Every ability kind lives in the one modal, so one empty section is fine. */
  public readonly hasAbilityFilterSections = computed(() =>
    this.abilityTagSetPickerSections().some((section) => section.items.length > 0),
  );
  public readonly populatedAbilityTagSets = computed(() =>
    this.tagSetSelection().sets.filter((set) => set.requirements.length > 0),
  );
  public readonly hasSelectedAbilityTags = computed(
    () => this.populatedAbilityTagSets().length > 0,
  );
  public readonly abilityFilterTriggerLabel = computed(() => {
    const groups = this.populatedAbilityTagSets().length;

    return groups
      ? this.t('filters.abilityTagSets.trigger.active', {
          tags: countTagSetRequirements(this.tagSetSelection()),
          groups,
        })
      : this.t('filters.abilityTagSets.trigger.empty');
  });
  public readonly abilityFilterSupportText = computed(() =>
    this.populatedAbilityTagSets().length
      ? this.t('filters.abilityTagSets.support.active')
      : this.t('filters.abilityTagSets.support.empty'),
  );
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
  /**
   * Tier number of the chip whose help popover is open, or null. Only one is
   * ever open: the popover is absolutely positioned above its chip, so two of
   * them would overlap each other rather than tile.
   */
  public readonly openTierHelp = signal<number | null>(null);
  private readonly tierBreakdownByTier = computed(
    () => new Map(this.captainTierBreakdown().map((view) => [view.tier, view])),
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
      // Deliberately off: picking a Captain must not hide anybody. The page
      // reports coverage per card instead, so only the filters the user picks
      // ever shrink the list (issue #268). The shared model keeps the flag, so
      // other callers can still require coverage.
      requireCaptainCoverage: false,
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
  public readonly resultCards = computed<CaptainCoverageCardView[]>(() => {
    const captain = this.selectedCaptainDetail();
    const normalizedSearchTerm = this.searchTerm().trim().toLowerCase();
    const typeFacet = this.typeFacet();
    const classFacet = this.classFacet();
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
    const characterTagSetSelection = this.characterTagSetSelection();
    const allowedCaptainIdSet = this.allowedCaptainIdSet();
    const hasFreeSubSlot = this.hasFreeSubSlot();
    const leaderButtonSlotIndex = this.leaderButtonSlotIndex();
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
        matchesCharacterTagSets(
          characterDetail?.detail.characterTags ?? [],
          characterTagSetSelection,
        ),
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
          // Raw verdict, not the filter's `matches`: coverage no longer gates
          // the list, so the only honest source for the badge is the coverage
          // result itself.
          captainBoosted: captain ? (coverage?.matches ?? false) : null,
          canBeLeader: allowedCaptainIdSet.has(character.id),
          leaderFitsBudget: this.canAssignTeamSlotCharacter(leaderButtonSlotIndex, character),
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
      // With a free sub slot this still hides whoever cannot take it (cost
      // budget). With every sub slot taken there is nothing to hide anyone
      // from, so the cards stay and only the sub button goes dead - otherwise
      // the leader button would be unreachable exactly when it is needed.
      .filter(({ assignableSlotIndex }) => !hasFreeSubSlot || assignableSlotIndex !== null)
      // One shared predicate: splits the comma-joined `type` column so a
      // dual-type character is found under either of its types regardless of
      // stored order, and reads the full `classes` array.
      .filter(({ character }) => matchesCharacterFacet('type', character, typeFacet))
      .filter(({ character }) => matchesCharacterFacet('class', character, classFacet))
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
          captainBoosted,
          canBeLeader,
          leaderFitsBudget,
          assignableSlotIndex,
          abilityMatchCount,
          captainAbilityMatchCount,
          selectedAbilityCount,
          matchedAbilityBadges,
        }) => ({
          character,
          coverage,
          captainBoosted,
          canBeLeader,
          leaderFitsBudget,
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
  private readonly resultCardIds = computed<readonly number[]>(() =>
    this.resultCards().map((card) => card.character.id),
  );
  private readonly visibleResultCount = computed(() => {
    const state = this.loadMoreState();

    return state && isSameResultSequence(state.sourceIds, this.resultCardIds())
      ? state.count
      : RESULT_PAGE_SIZE;
  });
  /** The painted slice; `totalMatchingCharacters` stays the real total. */
  public readonly visibleResultCards = computed<CaptainCoverageCardView[]>(() =>
    this.resultCards().slice(0, this.visibleResultCount()),
  );
  public readonly hasMoreResults = computed(
    () => this.resultCards().length > this.visibleResultCount(),
  );
  public readonly remainingResultCount = computed(() =>
    Math.max(0, this.resultCards().length - this.visibleResultCount()),
  );
  /** How many of the shown characters the selected Captain actually boosts. */
  public readonly boostedMatchingCharacters = computed(
    () => this.resultCards().filter((card) => card.captainBoosted === true).length,
  );
  /** The coverage count only means something once a Captain is in slot 1. */
  public readonly showsCoverageCount = computed(() => Boolean(this.selectedCaptainDetail()));
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

  @ViewChild('resultsPanel')
  private readonly resultsPanel?: ElementRef<HTMLElement>;

  public readonly coverageIcon = shieldCheckmarkOutline;
  public readonly targetIcon = peopleOutline;
  public readonly checkIcon = checkmarkCircleOutline;
  public readonly errorIcon = alertCircleOutline;
  public readonly saveIcon = saveOutline;
  public readonly searchIcon = searchOutline;
  public readonly characterTagFilterIcon = funnelOutline;

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
        this.i18n.preloadScope('ability-tag-sets'),
        this.i18n.preloadScope('character-tag-sets'),
      ]);

      this.summary.set(summary);
      this.abilityCatalog.set(abilityCatalog);
      this.availableCharacterTags.set(availableCharacterTags);
      this.seedCharacterTagSetSelection();
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

  /**
   * Team slots no longer open a picker modal. Characters come from the result
   * list only, so tapping a slot moves the user to that list instead of
   * doing nothing at all.
   */
  public scrollToResults(): void {
    this.resultsPanel?.nativeElement?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Sets the Captain (or Friend Captain) straight from a result card, so the
   * leader no longer has to come from the picker modal.
   */
  public async assignLeaderFromResult(card: CaptainCoverageCardView): Promise<void> {
    if (!card.canBeLeader || !card.leaderFitsBudget) {
      return;
    }

    await this.setTeamSlotCharacter(this.leaderButtonSlotIndex(), card.character);
  }

  /**
   * The single write path for every team slot. Both result-card buttons land
   * here, so their guards can never disagree.
   */
  public async setTeamSlotCharacter(index: number, character: CharacterListItem): Promise<void> {
    if (index < 0 || index >= CAPTAIN_COVERAGE_TEAM_SLOT_COUNT) {
      return;
    }

    if (!this.canAssignTeamSlotCharacter(index, character)) {
      return;
    }

    if ((index === 0 || index === 1) && !this.allowedCaptainIds().includes(character.id)) {
      return;
    }

    const pagedCount = this.visibleResultCount();

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, slotIndex) => (slotIndex === index ? character : slot)),
    );
    this.clearSavedTeamDraftState();

    if (index === 0) {
      // The search box is the user's own filter: picking a Captain from a
      // search result must not wipe what they typed (issue #268).
      this.selectedCaptainDetail.set(null);
      this.selectedCaptainDetail.set(await this.repository.getCharacterById(character.id));
    }

    this.keepPagePositionAfterTeamChange(pagedCount);
  }

  public assignCharacterFromResult(card: CaptainCoverageCardView): void {
    const slotIndex = card.assignableSlotIndex;

    if (slotIndex === null || !this.canAssignTeamSlotCharacter(slotIndex, card.character)) {
      return;
    }

    const pagedCount = this.visibleResultCount();

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, index) => (index === slotIndex ? card.character : slot)),
    );
    this.clearSavedTeamDraftState();
    this.keepPagePositionAfterTeamChange(pagedCount);
  }

  public clearTeamSlot(index: number, event?: Event): void {
    event?.stopPropagation();

    if (index < 0 || index >= CAPTAIN_COVERAGE_TEAM_SLOT_COUNT) {
      return;
    }

    const pagedCount = this.visibleResultCount();

    this.selectedTeamSlots.update((slots) =>
      slots.map((slot, slotIndex) => (slotIndex === index ? null : slot)),
    );
    this.clearSavedTeamDraftState();

    if (index === 0) {
      this.selectedCaptainDetail.set(null);
    }

    this.keepPagePositionAfterTeamChange(pagedCount);
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

  /**
   * The facet control owns its own Clear button, so these two handlers are the
   * page's ONLY write path for type/class — including the reset, which arrives
   * as an empty selection. This page has no clear-all button, which was already
   * true before the multi-select control landed.
   */
  public onTypeFacetChange(selection: CharacterFacetSelection): void {
    this.typeFacet.set(selection);
  }

  public onClassFacetChange(selection: CharacterFacetSelection): void {
    this.classFacet.set(selection);
  }

  public openCharacterTagSetPicker(): void {
    if (!this.availableCharacterTags().length) {
      return;
    }

    this.characterTagSetPickerOpen.set(true);
  }

  public closeCharacterTagSetPicker(): void {
    this.characterTagSetPickerOpen.set(false);
  }

  public saveCharacterTagSetSelection(selection: CharacterTagSetSelection): void {
    this.applyCharacterTagSetSelection(cloneCharacterTagSetSelection(selection));
    this.characterTagSetPickerOpen.set(false);
  }

  public clearSelectedCharacterTags(): void {
    this.applyCharacterTagSetSelection(createEmptyCharacterTagSetSelection());
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

  /**
   * Three states, not two: with no Captain picked at all, "Selected Captain has
   * no Tier N" would name a Captain the user never chose.
   */
  public tierCoverageChipTitle(tier: number): string {
    if (!this.selectedCaptainDetail()) {
      return this.t('filters.tierCoverage.chipNoCaptain');
    }

    return this.isTierCoverageAvailable(tier)
      ? this.t('filters.tierCoverage.chipAvailable', { tier })
      : this.t('filters.tierCoverage.chipUnavailable', { tier });
  }

  /** The tier's own breakdown, or null when this Captain has no such tier. */
  public tierHelpView(tier: number): CaptainCoverageTierViewModel | null {
    return this.tierBreakdownByTier().get(tier) ?? null;
  }

  public toggleTierHelp(tier: number): void {
    this.openTierHelp.update((open) => (open === tier ? null : tier));
  }

  public closeTierHelp(): void {
    this.openTierHelp.set(null);
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

  /** One trigger, one modal: every ability kind is a section inside it. */
  public openAbilityTagSetPicker(): void {
    if (!this.hasAbilityFilterSections()) {
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

  public clearSelectedAbilityTags(): void {
    this.tagSetSelection.update((selection) => ({ ...selection, sets: [] }));
  }

  /**
   * Re-anchors the "show more" position to the list as it now stands.
   *
   * A team write rebuilds `resultCards` and genuinely changes which characters
   * are listed - the character just assigned drops out while a sub slot is
   * still free. Without this the paging key reads that as a new result set and
   * throws the user back to page one at the exact moment they acted on a card,
   * unmounting the card they touched. A filter change still resets the page,
   * because nothing re-anchors there.
   */
  private keepPagePositionAfterTeamChange(count: number): void {
    if (count <= RESULT_PAGE_SIZE) {
      this.loadMoreState.set(null);

      return;
    }

    this.loadMoreState.set({ sourceIds: this.resultCardIds(), count });
  }

  public loadMoreResults(): void {
    this.loadMoreState.set({
      sourceIds: this.resultCardIds(),
      count: this.visibleResultCount() + RESULT_PAGE_SIZE,
    });
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

  /** Single write path, so the legacy flat mirror can never drift. */
  private applyCharacterTagSetSelection(selection: CharacterTagSetSelection): void {
    this.characterTagSetSelection.set(selection);
    this.selectedCharacterTags.set(flattenCharacterTagSets(selection));
  }

  /**
   * Migrates whatever flat tags the page already holds into one group.
   *
   * The legacy filter OR-ed the selected tags, so the faithful expansion is a
   * single `any` group — `requireAll` is false on purpose. Runs only while the
   * selection is still empty, so it never overwrites a user's own groups.
   */
  private seedCharacterTagSetSelection(): void {
    if (this.characterTagSetSelection().sets.length) {
      return;
    }

    this.applyCharacterTagSetSelection(
      expandCharacterTagsToSets(this.selectedCharacterTags(), false),
    );
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

    this.selectedTeamSlots.set(selectedSlots);
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

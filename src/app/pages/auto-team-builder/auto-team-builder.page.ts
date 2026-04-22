import { ScrollingModule } from '@angular/cdk/scrolling';
import { Component, OnDestroy, OnInit, computed, signal, type WritableSignal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { type ViewDidEnter, type ViewWillEnter } from '@ionic/angular';
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
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  alertCircleOutline,
  boatOutline,
  checkmarkCircleOutline,
  heart,
  heartOutline,
  layersOutline,
  optionsOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { LottieComponent, type AnimationOptions } from 'ngx-lottie';

import {
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
  createEmptyAutoBuildManualSlots,
} from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCoverageMode,
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicCatalogItem,
  type AutoBuildEnemyMechanicRequirement,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterDetailRecord,
  type CharacterListItem,
  type CharacterBox,
  type DatasetManifest,
  type ShipRecord,
} from '../../core/models/optc.models';
import {
  AutoTeamBuilderService,
  type AutoTeamBuildExecutionOptions,
} from '../../core/services/auto-team-builder.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { matchesAnyAbilityRequirement } from '../../core/services/auto-team-builder-ability-match.utils';
import { isAutoTeamBuildCancelledError } from '../../core/services/auto-team-builder.engine';
import { resolveAutoBuildShipSelection } from '../../core/services/auto-team-builder-ship.utils';
import { resolveCharacterPartyConflictKeys } from '../../core/services/auto-team-builder.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  AutoTeamSelectionImportError,
  type AutoTeamSelectionImportMessage,
  type AutoTeamSelectionImportResult,
  type AutoTeamSelectionImportState,
  type AutoTeamExportPayload,
  type AutoTeamSelectionExportPayload,
  buildAutoTeamExportPayload,
  buildAutoTeamSelectionExportPayload,
  downloadAutoTeamExport,
  downloadAutoTeamSelectionExport,
  parseAutoTeamSelectionImportPayload,
  sanitizeAutoTeamSelectionImportPayload,
} from './auto-team-builder-export.utils';
import { buildAutoTeamBuilderStateFromSavedEnemy } from './auto-team-builder-enemy-preset.utils';
import { buildAutoTeamBuilderStateFromSavedTeam } from './auto-team-builder-saved-team-preset.utils';
import { AbilityRequirementPickerComponent } from '../../shared/ability-requirement-picker/ability-requirement-picker.component';
import { EnemyMechanicPickerComponent } from '../../shared/enemy-mechanic-picker/enemy-mechanic-picker.component';
import {
  createAbilityRequirementDrafts,
  formatAbilityRequirementSummary,
  resolveAbilityRequirementVisual,
  serializeAbilityRequirementDrafts,
  type AbilityRequirementDraft,
  type AbilityRequirementVisualMeta,
} from '../../core/services/ability-requirement-draft.utils';
import {
  createEnemyMechanicDrafts,
  deriveAbilityRequirementsFromEnemyMechanics,
  formatEnemyMechanicSummary,
  getEnemyMechanicCatalogItems,
  mergeAbilityRequirements,
  resolveEnemyMechanicVisual,
  serializeEnemyMechanicDrafts,
  splitManualAbilityRequirementsFromEnemyMechanics,
  type EnemyMechanicDraft,
  type EnemyMechanicVisualMeta,
} from '../../core/services/enemy-mechanic-draft.utils';

type LoadingProgressRowTone = 'primary' | 'secondary' | 'fallback';

interface LoadingProgressRow {
  key:
    | 'message'
    | 'searchPasses'
    | 'workEstimate'
    | 'searchMeaning'
    | 'eta'
    | 'candidatePool'
    | 'droppedTypes'
    | 'droppedClasses'
    | 'leaderSuperEffects'
    | 'superSpecialCriteria';
  text: string;
  displayText: string;
  visible: boolean;
  tone: LoadingProgressRowTone;
}

interface CharacterAbilityChipView {
  key: string;
  label: string;
  highlighted: boolean;
  empty?: boolean;
}

interface AbilityRequirementSummaryChipView {
  draftId: string;
  label: string;
  visual: AbilityRequirementVisualMeta;
}

interface EnemyMechanicSummaryChipView {
  draftId: string;
  label: string;
  visual: EnemyMechanicVisualMeta;
}

interface ManualCharacterCardView {
  character: CharacterDetailRecord;
  subtitle: string;
  favoriteLabel: string | null;
  abilityChips: CharacterAbilityChipView[];
  isSelectedInActiveSlot: boolean;
  isSelectableInActiveSlot: boolean;
  actionLabel: string;
  selectionSupportLabel: string | null;
}

interface ShipCandidateCardView {
  ship: ShipRecord;
  subtitle: string;
  matchesManualSelection: boolean;
  isExcluded: boolean;
  isFavorite: boolean;
  isSelectableInManualPicker: boolean;
  manualPickerSupportLabel: string | null;
  isSelectableInExcludePicker: boolean;
  excludePickerSupportLabel: string | null;
}

interface ManualSlotCardView {
  role: AutoBuildManualSlotRole;
  title: string;
  support: string;
  selectedCharacters: CharacterListItem[];
  isLeaderSlot: boolean;
  isActive: boolean;
}

type TeamSlotViewModel = AutoBuildResult['slots'][number] & {
  trackKey: string;
  roleLabel: string;
  snippet: string;
  abilityChips: CharacterAbilityChipView[];
};

interface AppliedManualCharacterFilters {
  selectedTypes: AutoTeamBuilderType[];
  selectedClasses: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
}

interface ExcludedCharacterCardView {
  character: CharacterDetailRecord;
  subtitle: string;
  favoriteLabel: string | null;
  abilityChips: CharacterAbilityChipView[];
  isExcluded: boolean;
  isSelectable: boolean;
  actionLabel: string;
  selectionSupportLabel: string | null;
}

type PresetImportFeedbackTone = 'success' | 'warning' | 'error';

interface PresetImportFeedback {
  tone: PresetImportFeedbackTone;
  title: string;
  details: string[];
}

type CharacterPickerPanelKey = 'manual' | 'excluded';

interface CharacterPickerPanelState {
  offset: number;
  hasMore: boolean;
  loadingInitial: boolean;
  loadingMore: boolean;
  requestId: number;
}

interface ShipPickerPanelState {
  visibleCount: number;
  hasMore: boolean;
  loadingMore: boolean;
}

interface AutoTeamBuilderDefaultFilterState {
  selectedTypes: AutoTeamBuilderType[];
  selectedClasses: string[];
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSlotsInLeaderSuperEffectScope: boolean;
  requireUniqueBaseCharacterNames: boolean;
  favoritesOnly: boolean;
  favoriteShipsOnly: boolean;
}

const SAVE_TEAM_FEEDBACK_DURATION_MS = 3000;
const SAVE_TEAM_ANIMATION_PATH = 'assets/animations/save-team-loading.json';
const CHARACTER_PICKER_PAGE_SIZE = 10;
const CHARACTER_PICKER_SCROLL_LOAD_THRESHOLD = 4;
const SHIP_PICKER_PAGE_SIZE = 10;
const SHIP_PICKER_SCROLL_LOAD_THRESHOLD_PX = 144;
const MANUAL_CANDIDATE_VIEWPORT_ITEM_SIZE = 188;
const EXCLUDED_CANDIDATE_VIEWPORT_ITEM_SIZE = 236;
const EXTRA_DROP_ANY_ABILITY_KEY = 'extra_drop_any';
const EXTRA_DROP_GUARANTEED_ABILITY_KEY = 'extra_drop_guaranteed';
const EXTRA_DROP_ABILITY_KEY_SET = new Set([
  EXTRA_DROP_ANY_ABILITY_KEY,
  EXTRA_DROP_GUARANTEED_ABILITY_KEY,
]);

function createCharacterPickerPanelState(): CharacterPickerPanelState {
  return {
    offset: 0,
    hasMore: true,
    loadingInitial: false,
    loadingMore: false,
    requestId: 0,
  };
}

function createShipPickerPanelState(): ShipPickerPanelState {
  return {
    visibleCount: 0,
    hasMore: false,
    loadingMore: false,
  };
}

function buildDefaultAutoTeamBuilderFilterState(
  availableClasses: readonly string[],
): AutoTeamBuilderDefaultFilterState {
  return {
    selectedTypes: [...AUTO_TEAM_BUILDER_TYPES],
    selectedClasses: [...availableClasses],
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireUniqueBaseCharacterNames: true,
    favoritesOnly: true,
    favoriteShipsOnly: true,
  };
}

function resolveManualSlotRequiredAbilities(
  requirements: AutoBuildAbilityRequirement[],
  role: AutoBuildManualSlotRole,
): AutoBuildAbilityRequirement[] {
  return role === 'captain' || role === 'friendCaptain'
    ? requirements
    : requirements.filter((requirement) => !EXTRA_DROP_ABILITY_KEY_SET.has(requirement.abilityKey));
}

function matchesLeaderOnlyManualRequirements(
  character: Pick<CharacterDetailRecord, 'detail'>,
  requirements: AutoBuildAbilityRequirement[],
): boolean {
  const leaderOnlyRequirements = requirements.filter((requirement) =>
    EXTRA_DROP_ABILITY_KEY_SET.has(requirement.abilityKey),
  );

  return leaderOnlyRequirements.every((requirement) =>
    character.detail.builderAbilities.some((ability) =>
      matchesAnyAbilityRequirement(ability, [requirement]),
    ),
  );
}

@Component({
  selector: 'app-auto-team-builder-page',
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
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToggle,
    IonToolbar,
    ScrollingModule,
    LottieComponent,
    AbilityRequirementPickerComponent,
    EnemyMechanicPickerComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './auto-team-builder.page.html',
  styleUrl: './auto-team-builder.page.scss',
})
export class AutoTeamBuilderPage implements OnInit, OnDestroy, ViewDidEnter, ViewWillEnter {
  private buildAbortController: AbortController | null = null;
  private buildProgressTickerId: ReturnType<typeof globalThis.setInterval> | null = null;
  private currentBuildProgressSignature = '';
  private resetAfterBuildCancellation = false;
  private destroyed = false;
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly ships = signal<ShipRecord[]>([]);
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly enemyMechanicDrafts = signal<EnemyMechanicDraft[]>([]);
  public readonly enemyMechanicPickerOpen = signal(false);
  public readonly requiredAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly abilityPickerOpen = signal(false);
  public readonly manualSearchTerm = signal('');
  public readonly manualShipSearchTerm = signal('');
  public readonly excludeCharacterSearchTerm = signal('');
  public readonly excludeShipSearchTerm = signal('');
  private readonly manualCandidatePanelState = signal<CharacterPickerPanelState>(
    createCharacterPickerPanelState(),
  );
  public readonly manualCandidates = signal<CharacterDetailRecord[]>([]);
  public readonly manualCandidatesLoading = computed(
    () => this.manualCandidatePanelState().loadingInitial,
  );
  public readonly manualCandidatesLoadingMore = computed(
    () => this.manualCandidatePanelState().loadingMore,
  );
  public readonly manualCandidatesHasMore = computed(
    () => this.manualCandidatePanelState().hasMore,
  );
  private readonly excludedCandidatePanelState = signal<CharacterPickerPanelState>(
    createCharacterPickerPanelState(),
  );
  public readonly excludedCandidates = signal<CharacterDetailRecord[]>([]);
  public readonly excludedCandidatesLoading = computed(
    () => this.excludedCandidatePanelState().loadingInitial,
  );
  public readonly excludedCandidatesLoadingMore = computed(
    () => this.excludedCandidatePanelState().loadingMore,
  );
  public readonly excludedCandidatesHasMore = computed(
    () => this.excludedCandidatePanelState().hasMore,
  );
  private readonly manualShipPanelState = signal<ShipPickerPanelState>(
    createShipPickerPanelState(),
  );
  public readonly manualShipCandidatesLoadingMore = computed(
    () => this.manualShipPanelState().loadingMore,
  );
  public readonly manualShipCandidatesHasMore = computed(() => this.manualShipPanelState().hasMore);
  private readonly excludedShipPanelState = signal<ShipPickerPanelState>(
    createShipPickerPanelState(),
  );
  public readonly excludedShipCandidatesLoadingMore = computed(
    () => this.excludedShipPanelState().loadingMore,
  );
  public readonly excludedShipCandidatesHasMore = computed(
    () => this.excludedShipPanelState().hasMore,
  );
  public readonly shipPickerMode = signal<'characters' | 'ships'>('characters');
  public readonly excludePickerMode = signal<'characters' | 'ships'>('characters');
  public readonly manualSlots = signal<AutoBuildManualSlotSelection[]>(
    createEmptyAutoBuildManualSlots(),
  );
  public readonly activeManualSlotRole = signal<AutoBuildManualSlotRole>('captain');
  public readonly lockedCharacterRecords = signal<Record<number, CharacterListItem>>({});
  public readonly excludedCharacterIds = signal<number[]>([]);
  public readonly selectedManualShipId = signal<number | null>(null);
  public readonly excludedShipIds = signal<number[]>([]);
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
  public readonly requireAllSlotsInLeaderSuperEffectScope = signal(false);
  public readonly requireUniqueBaseCharacterNames = signal(false);
  public readonly selectedCharacterBoxId = signal<string | null>(null);
  public readonly favoritesOnly = signal(false);
  public readonly favoriteShipsOnly = signal(false);
  public readonly teamName = signal('');
  public readonly notes = signal('');
  public readonly building = signal(false);
  public readonly buildProgress = signal<AutoBuildProgressSnapshot | null>(null);
  private readonly buildProgressNowMs = signal(0);
  private readonly currentBuildStepStartedAtMs = signal<number | null>(null);
  public readonly result = signal<AutoBuildResult | null>(null);
  public readonly errorMessage = signal('');
  public readonly currentTeamId = signal<string | null>(null);
  public readonly saveUiLocked = signal(false);
  public readonly saveFeedbackVisible = signal(false);
  public readonly saveFeedbackError = signal('');
  public readonly candidatePoolBoxCreationPending = signal(false);
  public readonly favoriteCharacterIds;
  public readonly favoriteShipIds;
  public readonly characterBoxes;
  public readonly presetImportFeedback = signal<PresetImportFeedback | null>(null);
  public readonly candidatePoolBoxFeedback = signal<PresetImportFeedback | null>(null);
  public readonly loadedEnemyPresetName = signal<string | null>(null);
  public readonly saveAnimationOptions: AnimationOptions = {
    path: SAVE_TEAM_ANIMATION_PATH,
    renderer: 'svg',
    loop: true,
    autoplay: true,
  };

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly manualCandidateViewportItemSize = MANUAL_CANDIDATE_VIEWPORT_ITEM_SIZE;
  public readonly excludedCandidateViewportItemSize = EXCLUDED_CANDIDATE_VIEWPORT_ITEM_SIZE;
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly selectedManualShip = computed(
    () => this.ships().find((ship) => ship.id === this.selectedManualShipId()) ?? null,
  );
  public readonly hasSelectedManualShip = computed(() => Boolean(this.selectedManualShip()));
  public readonly excludedShips = computed(() => {
    const excludedShipIdSet = new Set(this.excludedShipIds());

    return this.ships().filter((ship) => excludedShipIdSet.has(ship.id));
  });
  public readonly hasExcludedShips = computed(() => this.excludedShipIds().length > 0);
  public readonly pageEnemyMechanics = computed(() => this.serializeEnemyMechanics());
  public readonly derivedRequiredAbilities = computed(() =>
    deriveAbilityRequirementsFromEnemyMechanics(this.pageEnemyMechanics()),
  );
  public readonly manualCandidateFilters = computed<AppliedManualCharacterFilters>(() => ({
    selectedTypes: [...this.selectedTypes()],
    selectedClasses: [...this.selectedClasses()],
    requiredAbilities: resolveManualSlotRequiredAbilities(
      this.pageRequiredAbilities(),
      this.activeManualSlotRole(),
    ).map((requirement) => ({
      ...requirement,
      slotTokens: [...requirement.slotTokens],
      requiredCharacterCount: 1,
    })),
  }));
  public readonly availableAbilityCatalogItems = computed(
    () => this.abilityCatalog()?.abilities ?? [],
  );
  public readonly availableEnemyMechanicCatalogItems = computed<
    AutoBuildEnemyMechanicCatalogItem[]
  >(() => getEnemyMechanicCatalogItems());
  public readonly abilityCatalogMap = computed(
    () => new Map(this.availableAbilityCatalogItems().map((item) => [item.key, item] as const)),
  );
  public readonly enemyMechanicCatalogMap = computed(
    () =>
      new Map(this.availableEnemyMechanicCatalogItems().map((item) => [item.key, item] as const)),
  );
  public readonly pageRequiredAbilities = computed(() =>
    mergeAbilityRequirements([
      ...this.derivedRequiredAbilities(),
      ...this.serializeManualRequiredAbilities(),
    ]),
  );
  public readonly hasSelectedClasses = computed(() => this.selectedClasses().length > 0);
  public readonly hasSelectedTypes = computed(() => this.selectedTypes().length > 0);
  public readonly hasRequiredAbilities = computed(() => this.pageRequiredAbilities().length > 0);
  public readonly enemyMechanicSummaryChips = computed<EnemyMechanicSummaryChipView[]>(() =>
    this.enemyMechanicDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveEnemyMechanicSelectedText(draft),
      visual: resolveEnemyMechanicVisual(draft.mechanicKey),
    })),
  );
  public readonly derivedRequiredAbilitySummaryChips = computed<
    AbilityRequirementSummaryChipView[]
  >(() =>
    this.derivedRequiredAbilities().map((requirement, index) => ({
      draftId: `derived-${requirement.abilityKey}-${index}`,
      label: this.formatAbilityRequirement(requirement),
      visual: resolveAbilityRequirementVisual(requirement.abilityKey),
    })),
  );
  public readonly requiredAbilitySummaryChips = computed<AbilityRequirementSummaryChipView[]>(() =>
    this.requiredAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly hasLoadedEnemyPreset = computed(() => Boolean(this.loadedEnemyPresetName()));
  public readonly lockedCharacterIds = computed(() => [
    ...new Set(this.manualSlots().flatMap((slot) => slot.characterIds)),
  ]);
  public readonly selectedLeaderIds = computed(() => {
    const leaderIds = [this.effectiveCaptainLeaderId(), this.effectiveFriendLeaderId()].filter(
      (characterId): characterId is number => characterId !== null,
    );

    return [...new Set(leaderIds)];
  });
  public readonly lockedCharacters = computed(() => {
    const lockedRecords = this.lockedCharacterRecords();

    return this.lockedCharacterIds()
      .map((characterId) => lockedRecords[characterId])
      .filter(Boolean);
  });
  public readonly excludedCharacters = computed(() => {
    const cachedRecords = this.lockedCharacterRecords();

    return this.excludedCharacterIds()
      .map((characterId) => cachedRecords[characterId])
      .filter(Boolean);
  });
  public readonly hasLockedCharacters = computed(() => this.lockedCharacterIds().length > 0);
  public readonly hasExcludedCharacters = computed(() => this.excludedCharacterIds().length > 0);
  public readonly hasSelectedLeaders = computed(() => this.selectedLeaderIds().length > 0);
  public readonly hasFavoriteShips = computed(() => this.favoriteShipIds().length > 0);
  public readonly availableFavoriteShipCount = computed(
    () => this.ships().filter((ship) => this.isFavoriteShip(ship.id)).length,
  );
  public readonly eligibleFavoriteShipCount = computed(
    () =>
      this.ships().filter((ship) => this.isFavoriteShip(ship.id) && !this.isExcludedShip(ship.id))
        .length,
  );
  public readonly hasDualLeaders = computed(
    () =>
      this.resolveManualSlotSelection('captain').characterIds.length > 0 &&
      this.resolveManualSlotSelection('friendCaptain').characterIds.length > 0,
  );
  public readonly effectiveCaptainLeaderId = computed(
    () => this.resolveManualSlotSelection('captain').characterIds[0] ?? null,
  );
  public readonly effectiveFriendLeaderId = computed(() => {
    const friendLeaderId = this.resolveManualSlotSelection('friendCaptain').characterIds[0] ?? null;

    return friendLeaderId ?? this.effectiveCaptainLeaderId();
  });
  public readonly manualSelectionCount = computed(() =>
    this.manualSlots().reduce((count, slot) => count + slot.characterIds.length, 0),
  );
  public readonly manualSlotCards = computed<ManualSlotCardView[]>(() => {
    const lockedRecords = this.lockedCharacterRecords();

    return this.manualSlots().map((slot) => ({
      role: slot.role,
      title: this.getManualSlotTitle(slot.role),
      support: this.getManualSlotSupport(slot.role, slot.characterIds.length),
      selectedCharacters: slot.characterIds
        .map((characterId) => lockedRecords[characterId])
        .filter(Boolean),
      isLeaderSlot: this.isLeaderManualSlotRole(slot.role),
      isActive: slot.role === this.activeManualSlotRole(),
    }));
  });
  public readonly activeManualSlot = computed(
    () =>
      this.manualSlotCards().find((slotCard) => slotCard.role === this.activeManualSlotRole()) ??
      this.manualSlotCards()[0] ??
      null,
  );
  public readonly activeManualSlotSelectedCharacters = computed(
    () => this.activeManualSlot()?.selectedCharacters ?? [],
  );
  public readonly clearAllButtonDisabled = computed(
    () =>
      this.building() ||
      (!this.hasLockedCharacters() && !this.result() && this.errorMessage().length === 0),
  );
  public readonly hasFavoriteCharacters = computed(() => this.favoriteCharacterIds().length > 0);
  public readonly selectedCharacterBox = computed<CharacterBox | null>(
    () =>
      this.characterBoxes().find(
        (characterBox: CharacterBox) => characterBox.id === this.selectedCharacterBoxId(),
      ) ?? null,
  );
  public readonly selectedCharacterBoxIds = computed(
    () => this.selectedCharacterBox()?.characterIds ?? [],
  );
  public readonly effectiveAutoBuildCandidateIds = computed<number[] | undefined>(() => {
    if (!this.selectedCharacterBox()) {
      return undefined;
    }

    return this.favoritesOnly()
      ? this.selectedCharacterBoxIds().filter((characterId) =>
          this.favoriteCharacterIds().includes(characterId),
        )
      : [...this.selectedCharacterBoxIds()];
  });
  public readonly buildBlockedByCharacterBox = computed(
    () => Boolean(this.selectedCharacterBox()) && this.selectedCharacterBoxIds().length === 0,
  );
  public readonly buildBlockedByCharacterBoxFavorites = computed(
    () =>
      Boolean(this.selectedCharacterBox()) &&
      this.hasFavoriteCharacters() &&
      this.favoritesOnly() &&
      this.selectedCharacterBoxIds().length > 0 &&
      (this.effectiveAutoBuildCandidateIds()?.length ?? 0) === 0,
  );
  public readonly buildBlockedByCharacterScope = computed(
    () => this.buildBlockedByCharacterBox() || this.buildBlockedByCharacterBoxFavorites(),
  );
  public readonly buildBlockedByFavorites = computed(
    () => this.favoritesOnly() && !this.hasFavoriteCharacters(),
  );
  public readonly buildDisabled = computed(
    () =>
      !this.hasSelectedClasses() ||
      !this.hasSelectedTypes() ||
      this.building() ||
      this.buildBlockedByCharacterScope() ||
      this.buildBlockedByFavorites(),
  );
  public readonly hasStrictFilters = computed(
    () =>
      this.requireAllSelectedTypesInTeam() ||
      this.requireAllSelectedClassesPerCharacter() ||
      this.requireAllSlotsInLeaderSuperEffectScope(),
  );
  public readonly allClassesSelected = computed(
    () =>
      this.availableClasses().length > 0 &&
      this.selectedClasses().length === this.availableClasses().length,
  );
  public readonly allTypesSelected = computed(
    () => this.selectedTypes().length === this.availableTypes.length,
  );
  public readonly teamStructureLabel = computed(() =>
    this.hasDualLeaders() ? this.t('hero.teamStructure.dual') : this.t('hero.teamStructure.single'),
  );
  public readonly selectAllTypesButtonLabel = computed(() =>
    this.allTypesSelected()
      ? this.t('filters.types.unselectAll')
      : this.t('filters.types.selectAll'),
  );
  public readonly selectAllClassesButtonLabel = computed(() =>
    this.allClassesSelected()
      ? this.t('filters.classes.unselectAll')
      : this.t('filters.classes.selectAll'),
  );
  public readonly typeSupportLabel = computed(() =>
    this.requireAllSelectedTypesInTeam()
      ? this.t('filters.types.support.strict')
      : this.t('filters.types.support.flexible'),
  );
  public readonly classSupportLabel = computed(() =>
    this.requireAllSelectedClassesPerCharacter()
      ? this.t('filters.classes.support.strict')
      : this.t('filters.classes.support.flexible'),
  );
  public readonly uniqueBaseCharacterNamesSupportLabel = computed(() =>
    this.requireUniqueBaseCharacterNames()
      ? this.t('filters.uniqueNames.support.strict')
      : this.t('filters.uniqueNames.support.flexible'),
  );
  public readonly leaderSuperEffectScopeSupportLabel = computed(() =>
    this.requireAllSlotsInLeaderSuperEffectScope()
      ? this.t('filters.leaderSuperEffectScope.support.strict')
      : this.t('filters.leaderSuperEffectScope.support.flexible'),
  );
  public readonly favoritesOnlySupportLabel = computed(() =>
    this.hasFavoriteCharacters()
      ? this.t('filters.favoritesOnly.support.withCount', {
          count: this.favoriteCharacterIds().length,
        })
      : this.t('filters.favoritesOnly.support.empty'),
  );
  public readonly selectedCharacterBoxLabel = computed(
    () => this.selectedCharacterBox()?.name ?? this.t('filters.characterBox.allCharacters'),
  );
  public readonly characterBoxSupportLabel = computed(() => {
    if (!this.selectedCharacterBox()) {
      return this.t('filters.characterBox.support.default');
    }

    if (this.buildBlockedByCharacterBox()) {
      return this.t('filters.characterBox.support.emptyBox', {
        name: this.selectedCharacterBox()!.name,
      });
    }

    if (this.buildBlockedByCharacterBoxFavorites()) {
      return this.t('filters.characterBox.support.emptyIntersection', {
        name: this.selectedCharacterBox()!.name,
      });
    }

    if (this.favoritesOnly()) {
      return this.t('filters.characterBox.support.selectedWithFavorites', {
        name: this.selectedCharacterBox()!.name,
        count: this.effectiveAutoBuildCandidateIds()?.length ?? 0,
      });
    }

    return this.t('filters.characterBox.support.selected', {
      name: this.selectedCharacterBox()!.name,
      count: this.selectedCharacterBoxIds().length,
    });
  });
  public readonly favoriteShipsOnlySupportLabel = computed(() => {
    if (!this.hasFavoriteShips()) {
      return this.t('filters.favoriteShipsOnly.support.empty');
    }

    return this.t('filters.favoriteShipsOnly.support.withCount', {
      count: this.favoriteShipIds().length,
    });
  });
  public readonly manualSlotSummaryLabel = computed(() =>
    this.t('manual.slotSummary', {
      slots: this.manualSlots().filter((slot) => slot.characterIds.length > 0).length,
      choices: this.manualSelectionCount(),
    }),
  );
  public readonly excludedSelectionSummaryLabel = computed(() =>
    this.t('exclude.summary', {
      characters: this.excludedCharacterIds().length,
      ships: this.excludedShipIds().length,
    }),
  );
  public readonly activeManualSlotSummaryLabel = computed(() => {
    const activeSlot = this.activeManualSlot();

    if (!activeSlot) {
      return this.t('manual.slotSelection.noneActive');
    }

    return this.t('manual.slotSelection.activeSummary', {
      role: activeSlot.title,
      count: activeSlot.selectedCharacters.length,
    });
  });
  public readonly activeManualSlotSupportLabel = computed(() => {
    const activeSlot = this.activeManualSlot();

    return activeSlot ? activeSlot.support : this.t('manual.slotSelection.noneActive');
  });
  public readonly manualFilterSummaryLabel = computed(() => {
    const filters = this.manualCandidateFilters();
    const parts: string[] = [];

    if (filters.selectedTypes.length > 0) {
      parts.push(
        this.t('manual.filters.parts.types', {
          values: filters.selectedTypes.join(' / '),
        }),
      );
    }

    if (filters.selectedClasses.length > 0) {
      parts.push(
        this.t('manual.filters.parts.classes', {
          values: filters.selectedClasses.join(' / '),
        }),
      );
    }

    if (filters.requiredAbilities.length > 0) {
      parts.push(
        this.t('manual.filters.parts.abilities', {
          values: filters.requiredAbilities
            .map((requirement) => this.formatAbilityRequirement(requirement))
            .join(' • '),
        }),
      );
    }

    return parts.length > 0
      ? this.t('manual.filters.active', { summary: parts.join(' • ') })
      : this.t('manual.filters.default');
  });
  public readonly manualCandidateCards = computed(() =>
    this.buildManualCharacterCards(
      this.manualCandidates(),
      this.manualCandidateFilters().requiredAbilities,
    ),
  );
  public readonly excludedCharacterCards = computed<ExcludedCharacterCardView[]>(() =>
    this.buildExcludedCharacterCards(
      this.excludedCandidates(),
      this.manualCandidateFilters().requiredAbilities,
    ),
  );
  public readonly manualShipCandidates = computed<ShipCandidateCardView[]>(() => {
    const searchTerm = this.manualShipSearchTerm().trim().toLowerCase();

    return this.ships()
      .filter((ship) => {
        if (searchTerm.length === 0) {
          return true;
        }

        return [ship.name, ship.description].some((value) =>
          value.toLowerCase().includes(searchTerm),
        );
      })
      .map((ship) => ({
        ship,
        subtitle: this.buildShipCardSubtitle(ship),
        matchesManualSelection: ship.id === this.selectedManualShipId(),
        isExcluded: this.excludedShipIds().includes(ship.id),
        isFavorite: this.isFavoriteShip(ship.id),
        isSelectableInManualPicker: !this.excludedShipIds().includes(ship.id),
        manualPickerSupportLabel: this.resolveManualShipSupportLabel(ship.id),
        isSelectableInExcludePicker: this.canExcludeShip(ship.id),
        excludePickerSupportLabel: this.resolveExcludedShipSupportLabel(ship.id),
      }));
  });
  public readonly visibleManualShipCandidates = computed<ShipCandidateCardView[]>(() =>
    this.manualShipCandidates().slice(0, this.manualShipPanelState().visibleCount),
  );
  public readonly excludedShipCandidates = computed<ShipCandidateCardView[]>(() => {
    const searchTerm = this.excludeShipSearchTerm().trim().toLowerCase();

    return this.ships()
      .filter((ship) => {
        if (searchTerm.length === 0) {
          return true;
        }

        return [ship.name, ship.description].some((value) =>
          value.toLowerCase().includes(searchTerm),
        );
      })
      .map((ship) => ({
        ship,
        subtitle: this.buildShipCardSubtitle(ship),
        matchesManualSelection: ship.id === this.selectedManualShipId(),
        isExcluded: this.excludedShipIds().includes(ship.id),
        isFavorite: this.isFavoriteShip(ship.id),
        isSelectableInManualPicker: !this.excludedShipIds().includes(ship.id),
        manualPickerSupportLabel: this.resolveManualShipSupportLabel(ship.id),
        isSelectableInExcludePicker: this.canExcludeShip(ship.id),
        excludePickerSupportLabel: this.resolveExcludedShipSupportLabel(ship.id),
      }));
  });
  public readonly visibleExcludedShipCandidates = computed<ShipCandidateCardView[]>(() =>
    this.excludedShipCandidates().slice(0, this.excludedShipPanelState().visibleCount),
  );
  public readonly manualShipCandidatesSummaryLabel = computed(() =>
    this.t('ships.count', { count: this.manualShipCandidates().length }),
  );
  public readonly shipPickerSupportLabel = computed(() => {
    const selectedShip = this.selectedManualShip();

    if (selectedShip) {
      return this.t('ships.manualOverride', { name: selectedShip.name });
    }

    return this.t('ships.autoRecommendation');
  });
  public readonly manualShipBlockedIds = computed(() => {
    const blockedShipIds = new Set(this.excludedShipIds());

    if (this.favoriteShipsOnly()) {
      for (const ship of this.ships()) {
        if (!this.isFavoriteShip(ship.id)) {
          blockedShipIds.add(ship.id);
        }
      }
    }

    return [...blockedShipIds];
  });
  public readonly manualShipSupportLabels = computed<Record<number, string>>(() => {
    const labels: Record<number, string> = {};

    for (const ship of this.ships()) {
      const supportLabel = this.resolveManualShipSupportLabel(ship.id);

      if (supportLabel) {
        labels[ship.id] = supportLabel;
      }
    }

    return labels;
  });
  public readonly excludedShipCandidatesSummaryLabel = computed(() =>
    this.t('exclude.candidates.countShips', { count: this.excludedShipCandidates().length }),
  );
  public readonly excludeShipPickerSupportLabel = computed(() => {
    if (this.favoriteShipsOnly()) {
      return this.t('exclude.shipSupport.favoriteShipMode');
    }

    if (this.hasExcludedShips()) {
      return this.t('exclude.shipSupport.withCount', { count: this.excludedShipIds().length });
    }

    return this.t('exclude.shipSupport.default');
  });
  public readonly typeStrictToggleLabel = computed(() => this.t('filters.types.toggle'));
  public readonly classStrictToggleLabel = computed(() => this.t('filters.classes.toggle'));
  public readonly leaderSuperEffectScopeToggleLabel = computed(() =>
    this.t('filters.leaderSuperEffectScope.toggle'),
  );
  public readonly uniqueBaseCharacterNamesToggleLabel = computed(() =>
    this.t('filters.uniqueNames.toggle'),
  );
  public readonly favoritesOnlyToggleLabel = computed(() => this.t('filters.favoritesOnly.toggle'));
  public readonly favoriteShipsOnlyToggleLabel = computed(() =>
    this.t('filters.favoriteShipsOnly.toggle'),
  );
  public readonly favoritesOnlyBlockedMessage = computed(() =>
    this.t('filters.favoritesOnly.blockedMessage'),
  );
  public readonly characterBoxBlockedMessage = computed(() => {
    if (this.buildBlockedByCharacterBox()) {
      return this.t('filters.characterBox.blocked.emptyBox', {
        name: this.selectedCharacterBox()?.name ?? '',
      });
    }

    if (this.buildBlockedByCharacterBoxFavorites()) {
      return this.t('filters.characterBox.blocked.emptyIntersection', {
        name: this.selectedCharacterBox()?.name ?? '',
      });
    }

    return '';
  });
  public readonly favoriteShipsOnlyResultWarning = computed(() => {
    if (!this.favoriteShipsOnly()) {
      return '';
    }

    if (this.availableFavoriteShipCount() === 0) {
      return this.t('ships.favoriteOnly.noFavorites');
    }

    if (this.eligibleFavoriteShipCount() === 0) {
      return this.t('ships.favoriteOnly.noneEligible');
    }

    return this.t('ships.favoriteOnly.noShipSelected');
  });
  public readonly selectedClassesLabel = computed(() =>
    this.formatSelectedValues(this.selectedClasses()),
  );
  public readonly selectedTypesLabel = computed(() =>
    this.formatSelectedTypes(this.selectedTypes()),
  );
  public readonly strictModeLabel = computed(() => {
    const strictModes: string[] = [];

    if (this.requireAllSelectedTypesInTeam()) {
      strictModes.push(this.t('hero.strictModes.typeCoverage'));
    }

    if (this.requireAllSelectedClassesPerCharacter()) {
      strictModes.push(this.t('hero.strictModes.perCharacterClasses'));
    }

    if (this.requireAllSlotsInLeaderSuperEffectScope()) {
      strictModes.push(this.t('hero.strictModes.leaderSuperEffectScope'));
    }

    return strictModes.length > 0
      ? this.t('hero.strictMode.strict', { modes: strictModes.join(' + ') })
      : this.t('hero.strictMode.flexible');
  });
  public readonly builderLabel = computed(() =>
    this.hasSelectedTypes()
      ? this.t('hero.builderLabel.withTypes', {
          types: this.selectedTypesLabel(),
          mode: this.strictModeLabel(),
        })
      : this.t('hero.builderLabel.default', { mode: this.strictModeLabel() }),
  );
  public readonly titleLabel = computed(() =>
    this.hasSelectedClasses() && this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? this.t('hero.title.withTypesStrict', { types: this.selectedTypesLabel() })
        : this.t('hero.title.withTypesFlexible', { types: this.selectedTypesLabel() })
      : this.hasStrictFilters()
        ? this.t('hero.title.defaultStrict')
        : this.t('hero.title.defaultFlexible'),
  );
  public readonly descriptionLabel = computed(() =>
    this.hasSelectedClasses() && this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? this.t('hero.description.withTypesStrict', { types: this.selectedTypesLabel() })
        : this.t('hero.description.withTypesFlexible', { types: this.selectedTypesLabel() })
      : this.hasStrictFilters()
        ? this.t('hero.description.defaultStrict')
        : this.t('hero.description.defaultFlexible'),
  );
  public readonly buildButtonLabel = computed(() =>
    this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? this.favoritesOnly()
          ? this.t('actions.build.favoriteStrict', { types: this.selectedTypesLabel() })
          : this.t('actions.build.strict', { types: this.selectedTypesLabel() })
        : this.favoritesOnly()
          ? this.t('actions.build.favoriteFlexible', { types: this.selectedTypesLabel() })
          : this.t('actions.build.flexible', { types: this.selectedTypesLabel() })
      : this.t('actions.build.selectTypes'),
  );
  public readonly saveButtonLabel = computed(() =>
    this.saveUiLocked() ? this.t('save.savingLabel') : this.t('save.saveOffline'),
  );
  public readonly loadingLabel = computed(
    () =>
      (this.buildProgress()?.messageKey
        ? this.t(this.buildProgress()!.messageKey, this.buildProgress()!.messageParams)
        : null) ??
      (this.hasSelectedTypes()
        ? this.t('progress.scoringWithTypes', { types: this.selectedTypesLabel() })
        : this.t('progress.scoringDefault')),
  );
  public readonly buildOverallProgressPercent = computed(() => {
    const progress = this.buildProgress();

    if (!progress || !progress.totalAttempts) {
      return 0;
    }

    if (progress.stage === 'completed') {
      return 100;
    }

    const currentAttempt = Math.min(progress.completedAttempts + 1, progress.totalAttempts);

    return Math.max(0, Math.min(100, Math.round((currentAttempt / progress.totalAttempts) * 100)));
  });
  public readonly buildOverallProgressLabel = computed(() =>
    this.t('progress.overallProgressPercent', { percent: this.buildOverallProgressPercent() }),
  );
  public readonly buildCurrentStepElapsedLabel = computed(() => {
    const progress = this.buildProgress();
    const startedAt = this.currentBuildStepStartedAtMs();

    if (!progress || startedAt === null || progress.stage === 'completed') {
      return '';
    }

    return this.t('progress.currentStepElapsed', {
      duration: this.formatLiveDuration(Math.max(0, this.buildProgressNowMs() - startedAt)),
    });
  });
  public readonly buildCandidateProgressLabel = computed(() => {
    const progress = this.buildProgress();

    return progress?.candidateCount
      ? this.t('progress.candidatePool', { count: progress.candidateCount })
      : '';
  });
  public readonly buildSearchPassesLabel = computed(() => {
    const progress = this.buildProgress();

    if (!progress?.totalAttempts || !progress.candidateCount) {
      return '';
    }

    return this.t(
      progress.attemptCountFinal ? 'progress.searchPasses' : 'progress.searchPassesGrowing',
      {
        attempts: progress.totalAttempts.toLocaleString(),
        count: progress.candidateCount.toLocaleString(),
      },
    );
  });
  public readonly buildWorkEstimateLabel = computed(() => {
    const progress = this.buildProgress();

    if (!progress?.totalAttempts || !progress.candidateCount) {
      return '';
    }

    const upperBoundChecks = progress.totalAttempts * progress.candidateCount;

    return this.t(
      progress.attemptCountFinal ? 'progress.workEstimate' : 'progress.workEstimateGrowing',
      {
        attempts: progress.totalAttempts.toLocaleString(),
        count: progress.candidateCount.toLocaleString(),
        total: upperBoundChecks.toLocaleString(),
      },
    );
  });
  public readonly buildSearchMeaningLabel = computed(() => {
    const progress = this.buildProgress();

    return progress ? this.t('progress.searchMeaning') : '';
  });
  public readonly buildDroppedTypesLabel = computed(() => {
    const droppedTypes = this.buildProgress()?.currentDroppedTypes ?? [];

    return droppedTypes.length > 0
      ? this.t('progress.ignoringTypes', { types: droppedTypes.join(' / ') })
      : '';
  });
  public readonly buildDroppedClassesLabel = computed(() => {
    const droppedClasses = this.buildProgress()?.currentDroppedClasses ?? [];

    return droppedClasses.length > 0
      ? this.t('progress.ignoringClasses', { classes: droppedClasses.join(' / ') })
      : '';
  });
  public readonly buildAllowedLeadersWithSuperEffectsLabel = computed(() =>
    this.buildProgress()?.currentAllowedLeadersWithSuperEffects
      ? this.t('progress.allowingLeadersWithSuperEffects')
      : '',
  );
  public readonly buildIgnoredLeaderSuperSpecialCriteriaLabel = computed(() =>
    this.buildProgress()?.currentIgnoredLeaderSuperSpecialCriteria
      ? this.t('progress.ignoringLeaderSuperSpecialCriteria')
      : '',
  );
  public readonly buildWorstCaseEtaLabel = computed(() => {
    const estimatedRemainingMs = this.buildProgress()?.estimatedRemainingMs;

    return typeof estimatedRemainingMs === 'number'
      ? this.t('progress.worstCaseEta', {
          duration: this.formatApproximateDuration(estimatedRemainingMs),
        })
      : '';
  });
  public readonly loadingProgressRows = computed<LoadingProgressRow[]>(() => {
    const rows: Array<Pick<LoadingProgressRow, 'key' | 'text' | 'tone'>> = [
      {
        key: 'message',
        text: this.loadingLabel(),
        tone: 'primary',
      },
      {
        key: 'searchPasses',
        text: this.buildSearchPassesLabel(),
        tone: 'secondary',
      },
      {
        key: 'workEstimate',
        text: this.buildWorkEstimateLabel(),
        tone: 'secondary',
      },
      {
        key: 'searchMeaning',
        text: this.buildSearchMeaningLabel(),
        tone: 'secondary',
      },
      {
        key: 'eta',
        text: this.buildWorstCaseEtaLabel(),
        tone: 'fallback',
      },
      {
        key: 'candidatePool',
        text: this.buildCandidateProgressLabel(),
        tone: 'secondary',
      },
      {
        key: 'droppedTypes',
        text: this.buildDroppedTypesLabel(),
        tone: 'fallback',
      },
      {
        key: 'droppedClasses',
        text: this.buildDroppedClassesLabel(),
        tone: 'fallback',
      },
      {
        key: 'leaderSuperEffects',
        text: this.buildAllowedLeadersWithSuperEffectsLabel(),
        tone: 'fallback',
      },
      {
        key: 'superSpecialCriteria',
        text: this.buildIgnoredLeaderSuperSpecialCriteriaLabel(),
        tone: 'fallback',
      },
    ];

    return rows.map((row) => ({
      ...row,
      displayText: row.text || '\u00A0',
      visible: row.text.length > 0,
    }));
  });
  public readonly cancelBuildButtonLabel = computed(() => this.t('actions.cancelBuild'));
  public readonly trackManualCandidateCardById = (
    _index: number,
    candidateCard: ManualCharacterCardView,
  ): number => candidateCard.character.id;
  public readonly trackExcludedCharacterCardById = (
    _index: number,
    candidateCard: ExcludedCharacterCardView,
  ): number => candidateCard.character.id;
  public readonly candidatePoolLabel = computed(() => {
    const isFavoritesOnly = this.result()?.input.favoritesOnly ?? this.favoritesOnly();

    if (this.hasSelectedTypes()) {
      return isFavoritesOnly
        ? this.t('results.candidatePool.favoritesWithTypes', {
            types: this.selectedTypesLabel(),
          })
        : this.t('results.candidatePool.withTypes', {
            types: this.selectedTypesLabel(),
          });
    }

    return isFavoritesOnly
      ? this.t('results.candidatePool.favoritesDefault')
      : this.t('results.candidatePool.default');
  });
  public readonly resultUsesFallback = computed(
    () => this.result()?.relaxation.usedFallback ?? false,
  );
  public readonly requestedResultClassesLabel = computed(() =>
    this.formatResultValues(this.result()?.requestedInput.selectedClasses ?? []),
  );
  public readonly effectiveResultClassesLabel = computed(() =>
    this.formatResultValues(this.result()?.input.selectedClasses ?? []),
  );
  public readonly requestedResultTypesLabel = computed(() =>
    this.formatResultValues(this.result()?.requestedInput.types ?? []),
  );
  public readonly effectiveResultTypesLabel = computed(() =>
    this.formatResultValues(this.result()?.input.types ?? []),
  );
  public readonly droppedResultTypes = computed(() => this.result()?.relaxation.droppedTypes ?? []);
  public readonly droppedResultClasses = computed(
    () => this.result()?.relaxation.droppedClasses ?? [],
  );
  public readonly resultAllowedLeadersWithSuperEffects = computed(
    () => this.result()?.relaxation.allowedLeadersWithSuperEffects ?? false,
  );
  public readonly resultIgnoredLeaderSuperSpecialCriteria = computed(
    () => this.result()?.relaxation.ignoredLeaderSuperSpecialCriteria ?? false,
  );
  public readonly selectedClassSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSelectedClassesPerCharacter()
        ? this.t('results.selectedClassSummary.strictPending')
        : this.t('results.selectedClassSummary.flexiblePending');
    }

    if (current.input.requireAllSelectedClassesPerCharacter) {
      return this.t('results.selectedClassSummary.strictResolved', {
        matching: current.slots.length,
        total: current.slots.length,
      });
    }

    if (current.input.selectedClasses.length === 0) {
      return this.t('results.selectedClassSummary.noRequirement');
    }

    return this.t('results.selectedClassSummary.coverage', {
      covered: current.coverage.coveredSelectedClasses.length,
      total: current.input.selectedClasses.length,
      matchingSlots: current.coverage.selectedClassMatches,
    });
  });
  public readonly selectedTypeSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSelectedTypesInTeam()
        ? this.t('results.selectedTypeSummary.strictPending')
        : this.t('results.selectedTypeSummary.flexiblePending');
    }

    if (current.input.types.length === 0) {
      return this.t('results.selectedTypeSummary.noRequirement');
    }

    return current.input.requireAllSelectedTypesInTeam
      ? this.t('results.selectedTypeSummary.strictResolved', {
          covered: current.coverage.coveredSelectedTypes.length,
          total: current.input.types.length,
        })
      : this.t('results.selectedTypeSummary.coverage', {
          covered: current.coverage.coveredSelectedTypes.length,
          total: current.input.types.length,
          matchingSlots: current.coverage.selectedTypeMatches,
        });
  });
  public readonly leaderCriteriaSourceLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t('results.leaderCriteria.sourceSingle');
    }

    return leaderCriteria.dualLeaderMode === 'intersection'
      ? this.t('results.leaderCriteria.sourceDual')
      : this.t('results.leaderCriteria.sourceSingle');
  });
  public readonly leaderCriteriaLeadersLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    return leaderCriteria?.leaderNames.length
      ? leaderCriteria.leaderNames.join(' / ')
      : this.t('results.none');
  });
  public readonly leaderCriteriaClassesLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t('results.leaderCriteria.noData');
    }

    return leaderCriteria.hasClassRestriction
      ? leaderCriteria.derivedAllowedClasses.join(' / ')
      : this.t('results.leaderCriteria.noClassRestriction');
  });
  public readonly leaderCriteriaTypesLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t('results.leaderCriteria.noData');
    }

    return leaderCriteria.hasTypeRestriction
      ? leaderCriteria.derivedAllowedTypes.join(' / ')
      : this.t('results.leaderCriteria.noTypeRestriction');
  });
  public readonly leaderCriteriaCostLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t('results.leaderCriteria.noData');
    }

    return leaderCriteria.hasCostRestriction
      ? this.t('results.leaderCriteria.costLimit', {
          cost: leaderCriteria.maxAllowedCost,
        })
      : this.t('results.leaderCriteria.noCostRestriction');
  });
  public readonly leaderCriteriaScopeSummaryLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t('results.leaderCriteria.scopePending');
    }

    if (
      !leaderCriteria.hasClassRestriction &&
      !leaderCriteria.hasTypeRestriction &&
      !leaderCriteria.hasCostRestriction
    ) {
      return this.t('results.leaderCriteria.noRestriction');
    }

    return this.t('results.leaderCriteria.scopeCoverage', {
      matching: leaderCriteria.matchingSlots,
      total: leaderCriteria.totalSlots,
    });
  });
  public readonly requiredAbilitySummaryLabel = computed(() => {
    const requirements = this.pageRequiredAbilities();
    const current = this.result();

    if (requirements.length === 0) {
      return this.t('results.requiredAbilities.none');
    }

    if (!current) {
      return this.t('results.requiredAbilities.pending', { count: requirements.length });
    }

    const matchedCount = current.coverage.abilityRequirements.matched.length;
    return this.t('results.requiredAbilities.coverage', {
      matched: matchedCount,
      total: requirements.length,
    });
  });
  public readonly matchedRequiredAbilityLabels = computed(() =>
    (this.result()?.coverage.abilityRequirements.matched ?? []).map((requirement) =>
      this.formatAbilityRequirement(requirement),
    ),
  );
  public readonly missingRequiredAbilityLabels = computed(() =>
    (this.result()?.coverage.abilityRequirements.missing ?? []).map((requirement) =>
      this.formatAbilityRequirement(requirement),
    ),
  );
  public readonly canDownloadSelectionJson = computed(
    () =>
      !this.building() &&
      (this.hasSelectedTypes() ||
        this.hasSelectedClasses() ||
        this.pageEnemyMechanics().length > 0 ||
        this.hasRequiredAbilities() ||
        this.requireAllSelectedTypesInTeam() ||
        this.requireAllSelectedClassesPerCharacter() ||
        this.requireUniqueBaseCharacterNames() ||
        this.favoritesOnly() ||
        this.favoriteShipsOnly() ||
        this.hasSelectedManualShip() ||
        this.hasLockedCharacters() ||
        this.hasExcludedCharacters() ||
        this.hasExcludedShips()),
  );
  public readonly canDownloadAbilityCatalogJson = computed(
    () => !this.building() && this.availableAbilityCatalogItems().length > 0,
  );
  public readonly downloadAbilityCatalogJsonLabel = computed(() =>
    this.t('actions.downloadAbilitiesJson'),
  );
  public readonly downloadSelectionJsonLabel = computed(() => this.t('actions.downloadPresetJson'));
  public readonly createCandidatePoolBoxLabel = computed(() =>
    this.t('actions.createCandidatePoolBox'),
  );
  public readonly canCreateCandidatePoolBox = computed(
    () => !this.building() && !this.candidatePoolBoxCreationPending(),
  );
  public readonly canDownloadTeamJson = computed(() => Boolean(this.result()));
  public readonly downloadTeamJsonLabel = computed(() => this.t('actions.downloadTeamJson'));
  public readonly teamSlots = computed<TeamSlotViewModel[]>(() => {
    const currentResult = this.result();
    const requirements = this.pageRequiredAbilities();

    return (
      currentResult?.slots.map((slot, index) => ({
        ...slot,
        trackKey:
          slot.role === 'sub'
            ? `sub:${index}:${slot.character.id}`
            : `${slot.role}:${slot.character.id}`,
        roleLabel: this.resolveRoleLabel(slot.role),
        snippet:
          slot.role === 'sub'
            ? slot.character.detail.specialText ||
              slot.character.detail.captainAbility ||
              this.t('results.teamSlots.noSnippet')
            : slot.character.detail.captainAbility ||
              slot.character.detail.specialText ||
              this.t('results.teamSlots.noSnippet'),
        abilityChips: this.buildAbilityChipViews(
          slot.character.detail.builderAbilities,
          requirements,
        ),
      })) ?? []
    );
  });

  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly coverageIcon = shieldHalfOutline;
  public readonly shipIcon = boatOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public readonly manualFilterIcon = optionsOutline;
  public readonly presetImportSuccessIcon = checkmarkCircleOutline;
  public readonly presetImportErrorIcon = alertCircleOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
    this.favoriteShipIds = this.userState.favoriteShipIds;
    this.characterBoxes = this.userState.characterBoxes;
    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    await Promise.all([
      this.i18n.preloadScope('ability-picker'),
      this.i18n.preloadScope('enemy-mechanics-picker'),
    ]);
    const shipsPromise =
      typeof this.repository.getShips === 'function'
        ? this.repository.getShips()
        : Promise.resolve([]);
    const [summary, abilityCatalog, ships] = await Promise.all([
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      shipsPromise,
    ]);
    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);
    this.ships.set(ships);
    await this.resetPageState();
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.stopBuildProgressTicker();
    this.cancelBuild();
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.resetPageState();
    const appliedSavedTeamPreset = await this.applySavedTeamPresetFromRoute();

    if (!appliedSavedTeamPreset) {
      await this.applyEnemyPresetFromRoute();
    }
  }

  public ionViewDidEnter(): void {
    console.log('AutoTeamBuilderPage component');
  }

  public async onClassChange(
    event: CustomEvent<{ value?: string[] | string | null }>,
  ): Promise<void> {
    this.selectedClasses.set(this.resolveSelectedClasses(event.detail.value));
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async onTypeChange(
    event: CustomEvent<{ value?: AutoTeamBuilderType[] | AutoTeamBuilderType | null }>,
  ): Promise<void> {
    this.selectedTypes.set(this.resolveSelectedTypes(event.detail.value));
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async onManualSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.manualSearchTerm.set((event.detail.value ?? '').trim());
    await this.refreshAppliedManualCandidates();
  }

  public onManualShipSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.manualShipSearchTerm.set((event.detail.value ?? '').trim());
    this.syncShipPickerPanelState('manual', { reset: true });
  }

  public async onManualCandidatesScrolledIndexChange(index: number): Promise<void> {
    await this.loadMoreCharacterPickerPanel('manual', index, this.manualCandidateCards().length);
  }

  public async onExcludeCharacterSearchChange(
    event: CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    this.excludeCharacterSearchTerm.set((event.detail.value ?? '').trim());
    await this.refreshAppliedExcludedCandidates();
  }

  public async onExcludedCandidatesScrolledIndexChange(index: number): Promise<void> {
    await this.loadMoreCharacterPickerPanel(
      'excluded',
      index,
      this.excludedCharacterCards().length,
    );
  }

  public onTeamNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.teamName.set((event.detail.value ?? '').trimStart());
  }

  public onNotesChange(event: CustomEvent<{ value?: string | null }>): void {
    this.notes.set((event.detail.value ?? '').toString());
  }

  public setShipPickerMode(mode: 'characters' | 'ships'): void {
    this.shipPickerMode.set(mode);
    this.syncShipPickerPanelState('manual', { reset: true });
  }

  public setExcludePickerMode(mode: 'characters' | 'ships'): void {
    this.excludePickerMode.set(mode);
    this.syncShipPickerPanelState('excluded', { reset: true });
  }

  public onExcludeShipSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.excludeShipSearchTerm.set((event.detail.value ?? '').trim());
    this.syncShipPickerPanelState('excluded', { reset: true });
  }

  public onManualShipListScroll(event: Event): void {
    this.loadMoreShipPickerPanelOnScroll('manual', event);
  }

  public onExcludedShipListScroll(event: Event): void {
    this.loadMoreShipPickerPanelOnScroll('excluded', event);
  }

  public selectManualShip(shipId: number): void {
    if (!this.canSelectManualShip(shipId)) {
      return;
    }

    this.selectedManualShipId.set(shipId);
    this.updateResultShipSelection();
  }

  public clearManualShipSelection(): void {
    this.selectedManualShipId.set(null);
    this.updateResultShipSelection();
  }

  public isSelectedManualShip(shipId: number): boolean {
    return this.selectedManualShipId() === shipId;
  }

  public toggleExcludedCharacter(character: CharacterDetailRecord): void {
    if (this.isExcludedCharacter(character.id)) {
      this.removeExcludedCharacter(character.id);
      return;
    }

    this.cacheCharacterRecord(character);
    this.removeCharacterFromAllManualSlots(character.id);
    this.excludedCharacterIds.update((currentIds) => [...currentIds, character.id]);
    this.resetBuildState();
  }

  public removeExcludedCharacter(characterId: number, event?: Event): void {
    event?.stopPropagation();
    this.excludedCharacterIds.update((currentIds) =>
      currentIds.filter((currentCharacterId) => currentCharacterId !== characterId),
    );
    this.resetBuildState();
  }

  public clearExcludedCharacters(): void {
    this.excludedCharacterIds.set([]);
    this.resetBuildState();
  }

  public toggleExcludedShip(shipId: number): void {
    if (this.isExcludedShip(shipId)) {
      this.removeExcludedShip(shipId);
      return;
    }

    if (this.selectedManualShipId() === shipId) {
      this.selectedManualShipId.set(null);
    }

    this.excludedShipIds.update((currentIds) => [...currentIds, shipId]);

    if (this.result()) {
      this.updateResultShipSelection();
    } else {
      this.resetBuildState();
    }

    this.syncShipPickerPanelStates();
  }

  public removeExcludedShip(shipId: number, event?: Event): void {
    event?.stopPropagation();
    this.excludedShipIds.update((currentIds) =>
      currentIds.filter((currentId) => currentId !== shipId),
    );

    if (this.result()) {
      this.updateResultShipSelection();
    } else {
      this.resetBuildState();
    }

    this.syncShipPickerPanelStates();
  }

  public clearExcludedShips(): void {
    this.excludedShipIds.set([]);

    if (this.result()) {
      this.updateResultShipSelection();
    } else {
      this.resetBuildState();
    }

    this.syncShipPickerPanelStates();
  }

  public isExcludedCharacter(characterId: number): boolean {
    return this.excludedCharacterIds().includes(characterId);
  }

  public isExcludedShip(shipId: number): boolean {
    return this.excludedShipIds().includes(shipId);
  }

  public openPresetFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onPresetFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = [...(target.files ?? [])];

    input.value = '';

    if (!file) {
      return;
    }

    await this.importSelectionPreset(file);
  }

  public clearAllManualSelections(): void {
    this.manualSlots.set(createEmptyAutoBuildManualSlots());
    this.activeManualSlotRole.set('captain');
    this.resetBuildState();
  }

  public selectManualSlot(role: AutoBuildManualSlotRole): void {
    this.activeManualSlotRole.set(role);
  }

  public onRequireAllSelectedTypesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedTypesInTeam.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireAllSelectedClassesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedClassesPerCharacter.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireAllSlotsInLeaderSuperEffectScopeToggle(
    event: CustomEvent<{ checked: boolean }>,
  ): void {
    this.requireAllSlotsInLeaderSuperEffectScope.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireUniqueBaseCharacterNamesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireUniqueBaseCharacterNames.set(event.detail.checked);
    this.resetBuildState();
  }

  public onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.favoritesOnly.set(event.detail.checked);
    this.resetBuildState();
  }

  public onCharacterBoxChange(event: CustomEvent<{ value?: string | null }>): void {
    const nextValue = typeof event.detail.value === 'string' ? event.detail.value.trim() : '';

    this.selectedCharacterBoxId.set(nextValue.length > 0 ? nextValue : null);
    this.resetBuildState();
  }

  public onFavoriteShipsOnlyToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.favoriteShipsOnly.set(event.detail.checked);
    this.reconcileFavoriteShipSelection();
  }

  public openEnemyMechanicPicker(): void {
    if (this.building()) {
      return;
    }

    this.enemyMechanicPickerOpen.set(true);
  }

  public closeEnemyMechanicPicker(): void {
    this.enemyMechanicPickerOpen.set(false);
  }

  public async saveEnemyMechanicPicker(drafts: AutoBuildEnemyMechanicRequirement[]): Promise<void> {
    this.enemyMechanicDrafts.set(createEnemyMechanicDrafts(drafts));
    this.enemyMechanicPickerOpen.set(false);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async clearEnemyMechanics(): Promise<void> {
    this.enemyMechanicDrafts.set([]);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public openAbilityPicker(): void {
    if (this.building() || !this.availableAbilityCatalogItems().length) {
      return;
    }

    this.abilityPickerOpen.set(true);
  }

  public closeAbilityPicker(): void {
    this.abilityPickerOpen.set(false);
  }

  public async saveAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    const requirements = serializeAbilityRequirementDrafts(drafts, {
      dedupe: true,
      catalogMap: this.abilityCatalogMap(),
    });

    this.requiredAbilityDrafts.set(createAbilityRequirementDrafts(requirements));
    this.abilityPickerOpen.set(false);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async clearRequiredAbilities(): Promise<void> {
    this.requiredAbilityDrafts.set([]);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public toggleCharacterInActiveManualSlot(character: CharacterDetailRecord): void {
    const activeRole = this.activeManualSlotRole();

    if (this.isCharacterSelectedInManualSlot(activeRole, character.id)) {
      this.removeCharacterFromManualSlot(activeRole, character.id);
      return;
    }

    if (!this.canAssignCharacterToManualSlot(activeRole, character)) {
      return;
    }

    this.cacheCharacterRecord(character);
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) =>
        slot.role === activeRole
          ? {
              ...slot,
              characterIds: [...slot.characterIds, character.id],
            }
          : slot,
      ),
    );
    this.resetBuildState();
  }

  public clearManualSlot(role: AutoBuildManualSlotRole, event?: Event): void {
    event?.stopPropagation();
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) =>
        slot.role === role
          ? {
              ...slot,
              characterIds: [],
            }
          : slot,
      ),
    );
    this.resetBuildState();
  }

  public removeCharacterFromManualSlot(
    role: AutoBuildManualSlotRole,
    characterId: number,
    event?: Event,
  ): void {
    event?.stopPropagation();
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) =>
        slot.role === role
          ? {
              ...slot,
              characterIds: slot.characterIds.filter(
                (selectedCharacterId) => selectedCharacterId !== characterId,
              ),
            }
          : slot,
      ),
    );
    this.resetBuildState();
  }

  public isCharacterSelectedInManualSlot(
    role: AutoBuildManualSlotRole,
    characterId: number,
  ): boolean {
    return this.resolveManualSlotSelection(role).characterIds.includes(characterId);
  }

  public canAssignCharacterToManualSlot(
    role: AutoBuildManualSlotRole,
    character: Pick<CharacterDetailRecord, 'id' | 'detail'>,
  ): boolean {
    if (this.isCharacterSelectedInManualSlot(role, character.id)) {
      return true;
    }

    if (this.isExcludedCharacter(character.id)) {
      return false;
    }

    if (this.isLeaderManualSlotRole(role)) {
      return !this.manualSlots().some(
        (slot) => this.isSubManualSlotRole(slot.role) && slot.characterIds.includes(character.id),
      );
    }

    return !this.manualSlots().some((slot) => slot.characterIds.includes(character.id));
  }

  public canExcludeCharacter(characterId: number): boolean {
    void characterId;
    return true;
  }

  public canExcludeShip(shipId: number): boolean {
    void shipId;
    return true;
  }

  public canSelectManualShip(shipId: number): boolean {
    if (this.isExcludedShip(shipId)) {
      return false;
    }

    if (this.favoriteShipsOnly() && !this.isFavoriteShip(shipId)) {
      return false;
    }

    return true;
  }

  public async selectAllTypes(): Promise<void> {
    if (this.allTypesSelected()) {
      this.selectedTypes.set([]);
      this.resetBuildState();
      await this.refreshCharacterPickPanels();

      return;
    }

    this.selectedTypes.set([...this.availableTypes]);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async selectAllClasses(): Promise<void> {
    if (this.allClassesSelected()) {
      this.selectedClasses.set([]);
      this.resetBuildState();
      await this.refreshCharacterPickPanels();

      return;
    }

    this.selectedClasses.set([...this.availableClasses()]);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async removeSelectedType(type: AutoTeamBuilderType): Promise<void> {
    this.selectedTypes.set(this.selectedTypes().filter((selectedType) => selectedType !== type));
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async removeSelectedClass(characterClass: string): Promise<void> {
    this.selectedClasses.set(
      this.selectedClasses().filter((selectedClass) => selectedClass !== characterClass),
    );
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async toggleFavorite(characterId: number): Promise<void> {
    await this.userState.toggleFavorite(characterId);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteCharacterIds().includes(characterId);
  }

  public async toggleShipFavorite(shipId: number): Promise<void> {
    await this.userState.toggleShipFavorite(shipId);
    this.reconcileFavoriteShipSelection();
  }

  public isFavoriteShip(shipId: number): boolean {
    return this.favoriteShipIds().includes(shipId);
  }

  public getCharacterDetailLink(
    character: Pick<CharacterListItem, 'id'> | null | undefined,
  ): string[] | null {
    return character ? ['/characters', character.id.toString()] : null;
  }

  public async buildTeam(): Promise<void> {
    if (this.buildDisabled()) {
      return;
    }

    const previousResult = this.result();
    const previousTeamId = this.currentTeamId();
    const abortController = new AbortController();

    this.buildAbortController = abortController;
    this.building.set(true);
    this.resetBuildState();
    this.startBuildProgressTicker();

    try {
      const executionOptions: AutoTeamBuildExecutionOptions = {
        signal: abortController.signal,
        onProgress: (snapshot) => this.handleBuildProgressSnapshot(snapshot),
        workerCount: this.userState.resolveAutoTeamBuilderWorkerCount(),
      };
      const nextResult = await this.autoTeamBuilder.buildTeam(
        this.selectedClasses(),
        this.selectedTypes(),
        {
          candidateCharacterIds: this.effectiveAutoBuildCandidateIds(),
          requireAllSelectedTypesInTeam: this.requireAllSelectedTypesInTeam(),
          requireAllSelectedClassesPerCharacter: this.requireAllSelectedClassesPerCharacter(),
          requireAllSlotsInLeaderSuperEffectScope: this.requireAllSlotsInLeaderSuperEffectScope(),
          requireUniqueBaseCharacterNames: this.requireUniqueBaseCharacterNames(),
          requiredAbilities: this.pageRequiredAbilities(),
          enemyMechanics: this.pageEnemyMechanics(),
          favoritesOnly: this.favoritesOnly(),
          favoriteCharacterIds: this.favoriteCharacterIds(),
          favoriteShipsOnly: this.favoriteShipsOnly(),
          favoriteShipIds: this.favoriteShipIds(),
          manualSlots: this.serializeManualSlots(),
          excludedCharacterIds: this.excludedCharacterIds(),
          manualShipId: this.selectedManualShipId(),
          excludedShipIds: this.excludedShipIds(),
        },
        executionOptions,
      );

      if (nextResult) {
        for (const slot of nextResult.slots) this.cacheCharacterRecord(slot.character);
      } else {
        this.errorMessage.set(this.resolveBuildFailureMessage());
      }

      this.result.set(nextResult);
    } catch (error) {
      if (isAutoTeamBuildCancelledError(error)) {
        if (this.resetAfterBuildCancellation) {
          return;
        }

        this.result.set(previousResult);
        this.currentTeamId.set(previousTeamId);
        this.errorMessage.set('');
        return;
      }

      console.error(error);
      this.errorMessage.set(this.t('errors.buildFailed'));
    } finally {
      this.buildAbortController = null;
      this.stopBuildProgressTicker();
      this.buildProgress.set(null);
      this.building.set(false);
    }
  }

  public cancelBuild(): void {
    this.buildAbortController?.abort();
  }

  public async resetPage(): Promise<void> {
    if (this.building()) {
      this.resetAfterBuildCancellation = true;
      this.cancelBuild();

      while (this.building()) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      }

      this.resetAfterBuildCancellation = false;
    }

    await this.resetPageState();
  }

  public buildTeamExportPayload(
    exportedAt = new Date().toISOString(),
  ): AutoTeamExportPayload | null {
    const current = this.result();

    if (!current) {
      return null;
    }

    return buildAutoTeamExportPayload(
      current,
      this.favoriteCharacterIds(),
      current.slots[0]?.character.id ?? null,
      current.slots[1]?.character.id ?? current.slots[0]?.character.id ?? null,
      exportedAt,
    );
  }

  public buildSelectionExportPayload(
    exportedAt = new Date().toISOString(),
  ): AutoTeamSelectionExportPayload | null {
    if (!this.canDownloadSelectionJson()) {
      return null;
    }

    return buildAutoTeamSelectionExportPayload({
      selectedTypes: this.selectedTypes(),
      selectedClasses: this.selectedClasses(),
      requiredAbilities: this.pageRequiredAbilities(),
      enemyMechanics: this.pageEnemyMechanics(),
      requireAllSelectedTypesInTeam: this.requireAllSelectedTypesInTeam(),
      requireAllSelectedClassesPerCharacter: this.requireAllSelectedClassesPerCharacter(),
      requireAllSlotsInLeaderSuperEffectScope: this.requireAllSlotsInLeaderSuperEffectScope(),
      requireUniqueBaseCharacterNames: this.requireUniqueBaseCharacterNames(),
      favoritesOnly: this.favoritesOnly(),
      favoriteCount: this.favoriteCharacterIds().length,
      favoriteShipsOnly: this.favoriteShipsOnly(),
      favoriteShipCount: this.favoriteShipIds().length,
      manualSlots: this.serializeManualSlots(),
      lockedCharacterIds: this.lockedCharacterIds(),
      lockedCharacters: this.lockedCharacters(),
      excludedCharacterIds: this.excludedCharacterIds(),
      excludedCharacters: this.excludedCharacters(),
      selectedLeaderIds: this.selectedLeaderIds(),
      captainLeaderId: this.effectiveCaptainLeaderId(),
      friendCaptainLeaderId: this.effectiveFriendLeaderId(),
      manualShipId: this.selectedManualShipId(),
      manualShip: this.selectedManualShip(),
      excludedShipIds: this.excludedShipIds(),
      excludedShips: this.excludedShips(),
      exportedAt,
    });
  }

  public downloadSelectionJson(): void {
    downloadAutoTeamSelectionExport(this.buildSelectionExportPayload());
  }

  public async createCandidatePoolBox(): Promise<void> {
    if (!this.canCreateCandidatePoolBox()) {
      return;
    }

    this.candidatePoolBoxCreationPending.set(true);
    this.candidatePoolBoxFeedback.set(null);

    try {
      const candidateRecords = await this.resolveCurrentCandidatePoolRecords();

      if (candidateRecords.length === 0) {
        this.candidatePoolBoxFeedback.set({
          tone: 'warning',
          title: this.t('candidatePoolBox.emptyTitle'),
          details: [this.t('candidatePoolBox.emptyDescription')],
        });
        return;
      }

      const savedBox = await this.userState.saveCharacterBox({
        name: this.buildNextCandidatePoolBoxName(),
        characterIds: candidateRecords.map((candidate) => candidate.id),
      });

      if (!savedBox) {
        this.candidatePoolBoxFeedback.set({
          tone: 'error',
          title: this.t('candidatePoolBox.saveFailedTitle'),
          details: [this.t('candidatePoolBox.saveFailedDescription')],
        });
        return;
      }

      this.selectedCharacterBoxId.set(savedBox.id);
      this.candidatePoolBoxFeedback.set({
        tone: 'success',
        title: this.t('candidatePoolBox.createdTitle', { name: savedBox.name }),
        details: [
          this.t('candidatePoolBox.createdDescription', {
            count: savedBox.characterIds.length,
          }),
        ],
      });
    } catch (error) {
      console.error(error);
      this.candidatePoolBoxFeedback.set({
        tone: 'error',
        title: this.t('candidatePoolBox.saveFailedTitle'),
        details: [this.t('candidatePoolBox.saveFailedDescription')],
      });
    } finally {
      this.candidatePoolBoxCreationPending.set(false);
    }
  }

  public downloadAbilityCatalogJson(): void {
    const catalog = this.abilityCatalog();

    if (!catalog) {
      return;
    }

    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(catalog, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = 'optc-auto-builder-abilities.json';
    anchor.style.display = 'none';
    document.body.append(anchor);

    try {
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    }
  }

  public downloadTeamJson(): void {
    downloadAutoTeamExport(this.buildTeamExportPayload());
  }

  public async saveTeam(): Promise<void> {
    const current = this.result();

    if (!current || this.saveUiLocked()) {
      return;
    }

    const startedAt = Date.now();

    this.saveUiLocked.set(true);
    this.saveFeedbackVisible.set(true);
    this.saveFeedbackError.set('');

    try {
      const saved = await this.userState.saveTeam({
        id: this.currentTeamId() ?? undefined,
        name: this.teamName(),
        notes: this.notes(),
        shipId: current.shipSelection?.ship.id ?? null,
        slots: current.slots.map((slot) => slot.character.id),
      });

      this.currentTeamId.set(saved.id);
      await this.waitForSaveFeedbackWindow(startedAt);

      if (this.destroyed) {
        return;
      }

      this.saveUiLocked.set(false);
      this.saveFeedbackVisible.set(false);
    } catch (error) {
      console.error(error);

      if (this.destroyed) {
        return;
      }

      this.saveUiLocked.set(false);
      this.saveFeedbackVisible.set(false);
      this.saveFeedbackError.set(this.t('save.error'));
    }
  }

  private resetBuildState(): void {
    this.stopBuildProgressTicker();
    this.buildProgress.set(null);
    this.result.set(null);
    this.errorMessage.set('');
    this.currentTeamId.set(null);
    this.resetSaveFeedbackState();
  }

  private handleBuildProgressSnapshot(snapshot: AutoBuildProgressSnapshot): void {
    const now = Date.now();
    const nextSignature = this.buildProgressSnapshotSignature(snapshot);

    this.buildProgressNowMs.set(now);

    if (nextSignature !== this.currentBuildProgressSignature) {
      this.currentBuildProgressSignature = nextSignature;
      this.currentBuildStepStartedAtMs.set(now);
    }

    this.buildProgress.set(snapshot);
  }

  private buildProgressSnapshotSignature(snapshot: AutoBuildProgressSnapshot): string {
    return [
      snapshot.stage,
      snapshot.completedAttempts,
      snapshot.currentDroppedTypes.join('|'),
      snapshot.currentDroppedClasses.join('|'),
      snapshot.currentAllowedLeadersWithSuperEffects ? '1' : '0',
      snapshot.currentIgnoredLeaderSuperSpecialCriteria ? '1' : '0',
      snapshot.messageKey,
      String(snapshot.messageParams?.['current'] ?? ''),
    ].join('::');
  }

  private startBuildProgressTicker(): void {
    this.stopBuildProgressTicker();
    this.buildProgressNowMs.set(Date.now());
    this.buildProgressTickerId = globalThis.setInterval(() => {
      this.buildProgressNowMs.set(Date.now());
    }, 1000);
  }

  private stopBuildProgressTicker(): void {
    if (this.buildProgressTickerId !== null) {
      globalThis.clearInterval(this.buildProgressTickerId);
      this.buildProgressTickerId = null;
    }

    this.currentBuildProgressSignature = '';
    this.currentBuildStepStartedAtMs.set(null);
  }

  private async resetPageState(): Promise<void> {
    const defaultFilters = buildDefaultAutoTeamBuilderFilterState(this.availableClasses());

    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.selectedTypes.set(defaultFilters.selectedTypes);
    this.selectedClasses.set(defaultFilters.selectedClasses);
    this.enemyMechanicDrafts.set([]);
    this.requiredAbilityDrafts.set([]);
    this.lockedCharacterRecords.set({});
    this.manualSearchTerm.set('');
    this.manualShipSearchTerm.set('');
    this.excludeCharacterSearchTerm.set('');
    this.excludeShipSearchTerm.set('');
    this.manualCandidates.set([]);
    this.manualCandidatePanelState.set(createCharacterPickerPanelState());
    this.excludedCandidates.set([]);
    this.excludedCandidatePanelState.set(createCharacterPickerPanelState());
    this.manualShipPanelState.set(createShipPickerPanelState());
    this.excludedShipPanelState.set(createShipPickerPanelState());
    this.shipPickerMode.set('characters');
    this.excludePickerMode.set('characters');
    this.manualSlots.set(createEmptyAutoBuildManualSlots());
    this.activeManualSlotRole.set('captain');
    this.excludedCharacterIds.set([]);
    this.selectedManualShipId.set(null);
    this.excludedShipIds.set([]);
    this.requireAllSelectedTypesInTeam.set(defaultFilters.requireAllSelectedTypesInTeam);
    this.requireAllSelectedClassesPerCharacter.set(
      defaultFilters.requireAllSelectedClassesPerCharacter,
    );
    this.requireAllSlotsInLeaderSuperEffectScope.set(
      defaultFilters.requireAllSlotsInLeaderSuperEffectScope,
    );
    this.requireUniqueBaseCharacterNames.set(defaultFilters.requireUniqueBaseCharacterNames);
    this.selectedCharacterBoxId.set(null);
    this.favoritesOnly.set(defaultFilters.favoritesOnly);
    this.favoriteShipsOnly.set(defaultFilters.favoriteShipsOnly);
    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
    this.notes.set('');
    this.presetImportFeedback.set(null);
    this.candidatePoolBoxFeedback.set(null);
    this.loadedEnemyPresetName.set(null);
    this.resetBuildState();
    this.syncShipPickerPanelStates();
    await this.refreshCharacterPickPanels();
  }

  private async importSelectionPreset(file: File): Promise<void> {
    try {
      const rawContent = await file.text();
      const payload = parseAutoTeamSelectionImportPayload(rawContent);
      const importedCharacterIds = [
        ...new Set([
          ...payload.manualSelection.lockedCharacterIds.filter((characterId) => characterId > 0),
          ...(Array.isArray(payload.manualSelection.excludedCharacterIds)
            ? payload.manualSelection.excludedCharacterIds.filter((characterId) => characterId > 0)
            : []),
          ...(Array.isArray(payload.manualSelection.manualSlots)
            ? payload.manualSelection.manualSlots.flatMap((slot) =>
                Array.isArray(slot.characterIds)
                  ? slot.characterIds.filter((characterId) => characterId > 0)
                  : [],
              )
            : []),
        ]),
      ];
      const availableLockedCharacters =
        await this.repository.getCharactersByIds(importedCharacterIds);
      const importResult = sanitizeAutoTeamSelectionImportPayload(payload, {
        availableTypes: this.availableTypes,
        availableClasses: this.availableClasses(),
        abilityCatalogItems: this.availableAbilityCatalogItems(),
        availableLockedCharacters,
        availableShips: this.ships(),
      });

      await this.applyImportedSelectionPreset(importResult, availableLockedCharacters, file.name);
    } catch (error) {
      this.presetImportFeedback.set({
        tone: 'error',
        title: this.t('preset.importFailedTitle'),
        details: [this.resolvePresetImportError(error)],
      });
    }
  }

  private async applyImportedSelectionPreset(
    importResult: AutoTeamSelectionImportResult,
    availableLockedCharacters: CharacterListItem[],
    fileName: string,
  ): Promise<void> {
    await this.applySelectionPresetState(importResult.state, availableLockedCharacters);

    this.presetImportFeedback.set({
      tone: importResult.warnings.length > 0 ? 'warning' : 'success',
      title:
        importResult.warnings.length > 0
          ? this.t('preset.appliedWithWarningsTitle')
          : this.t('preset.appliedTitle'),
      details:
        importResult.warnings.length > 0
          ? [
              this.t('preset.loadedFromFile', { fileName }),
              ...importResult.warnings.map((warning) => this.translateImportMessage(warning)),
            ]
          : [this.t('preset.loadedFromFile', { fileName })],
    });
  }

  private async applySelectionPresetState(
    state: AutoTeamSelectionImportState,
    availableLockedCharacters: CharacterListItem[] = [],
  ): Promise<void> {
    await this.resetPageState();

    this.selectedTypes.set([...state.selectedTypes]);
    this.selectedClasses.set([...state.selectedClasses]);
    this.enemyMechanicDrafts.set(createEnemyMechanicDrafts(state.enemyMechanics));
    const manualRequiredAbilities = splitManualAbilityRequirementsFromEnemyMechanics(
      state.requiredAbilities,
      state.enemyMechanics,
    );
    this.requiredAbilityDrafts.set(createAbilityRequirementDrafts(manualRequiredAbilities));
    this.lockedCharacterRecords.set({});
    for (const character of availableLockedCharacters) this.cacheCharacterRecord(character);
    this.manualSlots.set(
      state.manualSlots.map((slot) => ({
        role: slot.role,
        characterIds: [...slot.characterIds],
      })),
    );
    this.activeManualSlotRole.set(this.resolveInitialManualSlotRole(state.manualSlots));
    this.excludedCharacterIds.set([...state.excludedCharacterIds]);
    this.selectedManualShipId.set(state.manualShipId);
    this.excludedShipIds.set([...state.excludedShipIds]);
    this.requireAllSelectedTypesInTeam.set(state.requireAllSelectedTypesInTeam);
    this.requireAllSelectedClassesPerCharacter.set(state.requireAllSelectedClassesPerCharacter);
    this.requireAllSlotsInLeaderSuperEffectScope.set(state.requireAllSlotsInLeaderSuperEffectScope);
    this.requireUniqueBaseCharacterNames.set(state.requireUniqueBaseCharacterNames);
    this.selectedCharacterBoxId.set(null);
    this.favoritesOnly.set(state.favoritesOnly);
    this.favoriteShipsOnly.set(state.favoriteShipsOnly);
    this.reconcileFavoriteShipSelection();
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  private async applySavedTeamPresetFromRoute(): Promise<boolean> {
    const teamId = this.route.snapshot.queryParamMap.get('teamId')?.trim() ?? '';

    if (teamId.length === 0) {
      return false;
    }

    const team = this.userState.getSavedTeamById(teamId);

    if (!team) {
      await this.clearSavedTeamPresetQueryParam();
      return false;
    }

    const selectedCharacterIds = [
      ...new Set(
        team.slots.filter((characterId): characterId is number => typeof characterId === 'number'),
      ),
    ];
    const availableLockedCharacters =
      selectedCharacterIds.length > 0
        ? await this.repository.getCharactersByIds(selectedCharacterIds)
        : [];

    await this.applySelectionPresetState(
      buildAutoTeamBuilderStateFromSavedTeam(team, availableLockedCharacters, this.ships()),
      availableLockedCharacters,
    );
    await this.clearSavedTeamPresetQueryParam();
    return true;
  }

  private async applyEnemyPresetFromRoute(): Promise<void> {
    const enemyId = this.route.snapshot.queryParamMap.get('enemyId')?.trim() ?? '';

    if (enemyId.length === 0) {
      return;
    }

    const enemy = this.userState.getSavedEnemyById(enemyId);

    if (!enemy) {
      await this.clearEnemyPresetQueryParam();
      return;
    }

    await this.applySelectionPresetState(buildAutoTeamBuilderStateFromSavedEnemy(enemy));
    this.loadedEnemyPresetName.set(enemy.name);
    await this.clearEnemyPresetQueryParam();
  }

  private async clearSavedTeamPresetQueryParam(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async clearEnemyPresetQueryParam(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { enemyId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private resolveBuildFailureMessage(): string {
    if (this.buildBlockedByCharacterScope()) {
      return this.characterBoxBlockedMessage();
    }

    if (this.buildBlockedByFavorites()) {
      return this.favoritesOnlyBlockedMessage();
    }

    if (this.requireUniqueBaseCharacterNames()) {
      const manualConflictNames = this.resolveManualUniqueBaseNameConflictNames();

      if (manualConflictNames.length > 0) {
        return this.t('errors.uniqueNames.manualConflict', {
          names: manualConflictNames.join(' / '),
        });
      }
    }

    const lockedCount = this.manualSelectionCount();
    const leaderRequirementLabel = this.resolveLeaderFailureLabel();

    const activeRequirements: string[] = [];
    const favoritesScope = this.favoritesOnly() ? this.t('errors.requirements.favoritesScope') : '';

    if (this.requireAllSelectedTypesInTeam()) {
      activeRequirements.push(this.t('errors.requirements.typeCoverage'));
    }

    if (this.requireAllSelectedClassesPerCharacter()) {
      activeRequirements.push(this.t('errors.requirements.classCoverage'));
    }

    if (this.requireUniqueBaseCharacterNames()) {
      activeRequirements.push(this.t('errors.requirements.uniqueCharacterNames'));
    }

    if (this.hasRequiredAbilities()) {
      activeRequirements.push(
        this.t('errors.requirements.abilityCoverage', {
          abilities: this.pageRequiredAbilities()
            .map((requirement) => this.formatAbilityRequirement(requirement))
            .join(' • '),
        }),
      );
    }

    if (lockedCount) {
      if (this.hasStrictFilters()) {
        return this.t('errors.locked.strict', {
          lockedCount,
          leaderRequirement: leaderRequirementLabel,
        });
      }

      if (this.favoritesOnly()) {
        return this.t('errors.locked.favoritesFlexible', {
          types: this.selectedTypesLabel(),
          lockedCount,
          leaderRequirement: leaderRequirementLabel,
        });
      }

      if (activeRequirements.length > 0) {
        return this.t('errors.locked.requirementsFlexible', {
          types: this.selectedTypesLabel(),
          requirements: this.joinRequirementLabels(activeRequirements),
          lockedCount,
          leaderRequirement: leaderRequirementLabel,
        });
      }

      return this.t('errors.locked.defaultFlexible', {
        types: this.selectedTypesLabel(),
        lockedCount,
        leaderRequirement: leaderRequirementLabel,
      });
    }

    if (activeRequirements.length === 0 && this.favoritesOnly()) {
      if (this.hasStrictFilters()) {
        return this.t('errors.favorites.strict');
      }

      return this.t('errors.favorites.flexible', { types: this.selectedTypesLabel() });
    }

    if (activeRequirements.length === 0) {
      if (this.hasStrictFilters()) {
        return this.t('errors.default.strict', { types: this.selectedTypesLabel() });
      }

      return this.t('errors.default.flexible', { types: this.selectedTypesLabel() });
    }

    if (this.hasStrictFilters()) {
      return this.t('errors.requirements.strict', {
        types: this.selectedTypesLabel(),
        favoritesScope,
        requirements: this.joinRequirementLabels(activeRequirements),
      });
    }

    return this.t('errors.requirements.flexible', {
      types: this.selectedTypesLabel(),
      favoritesScope,
      requirements: this.joinRequirementLabels(activeRequirements),
    });
  }

  private async refreshAppliedManualCandidates(): Promise<void> {
    await this.refreshCharacterPickerPanel('manual');
  }

  private async refreshAppliedExcludedCandidates(): Promise<void> {
    await this.refreshCharacterPickerPanel('excluded');
  }

  private async refreshCharacterPickPanels(): Promise<void> {
    await Promise.all([
      this.refreshAppliedManualCandidates(),
      this.refreshAppliedExcludedCandidates(),
    ]);
  }

  private async refreshCharacterPickerPanel(panel: CharacterPickerPanelKey): Promise<void> {
    const panelState = this.getCharacterPickerPanelState(panel);
    const requestId = panelState().requestId + 1;

    this.getCharacterPickerCandidates(panel).set([]);
    panelState.set({
      ...createCharacterPickerPanelState(),
      loadingInitial: true,
      requestId,
    });

    try {
      const page = await this.searchDetailedCharacterPage(
        this.getCharacterPickerSearchTerm(panel),
        0,
        requestId,
        () => panelState().requestId,
      );

      if (page === null || requestId !== panelState().requestId) {
        return;
      }

      this.getCharacterPickerCandidates(panel).set(page.items);
      this.cacheCharacterRecords(page.items);
      panelState.update((currentState) =>
        currentState.requestId !== requestId
          ? currentState
          : {
              ...currentState,
              offset: page.nextOffset,
              hasMore: page.hasMore,
            },
      );
    } finally {
      panelState.update((currentState) =>
        currentState.requestId !== requestId
          ? currentState
          : {
              ...currentState,
              loadingInitial: false,
              loadingMore: false,
            },
      );
    }
  }

  private async loadMoreCharacterPickerPanel(
    panel: CharacterPickerPanelKey,
    scrolledIndex: number,
    itemCount: number,
  ): Promise<void> {
    const panelState = this.getCharacterPickerPanelState(panel);
    const currentState = panelState();

    if (
      currentState.loadingInitial ||
      currentState.loadingMore ||
      !currentState.hasMore ||
      itemCount === 0 ||
      scrolledIndex + CHARACTER_PICKER_SCROLL_LOAD_THRESHOLD < itemCount
    ) {
      return;
    }

    panelState.update((state) => ({
      ...state,
      loadingMore: true,
    }));

    try {
      const page = await this.searchDetailedCharacterPage(
        this.getCharacterPickerSearchTerm(panel),
        currentState.offset,
        currentState.requestId,
        () => panelState().requestId,
      );

      if (page === null || currentState.requestId !== panelState().requestId) {
        return;
      }

      const currentCandidates = this.getCharacterPickerCandidates(panel)();
      const seenCharacterIds = new Set(currentCandidates.map((candidate) => candidate.id));
      const nextCandidates = [...currentCandidates];

      for (const candidate of page.items) {
        if (seenCharacterIds.has(candidate.id)) {
          continue;
        }

        seenCharacterIds.add(candidate.id);
        nextCandidates.push(candidate);
      }

      this.getCharacterPickerCandidates(panel).set(nextCandidates);
      this.cacheCharacterRecords(page.items);
      panelState.update((state) =>
        state.requestId !== currentState.requestId
          ? state
          : {
              ...state,
              offset: page.nextOffset,
              hasMore: page.hasMore,
            },
      );
    } finally {
      panelState.update((state) =>
        state.requestId !== currentState.requestId
          ? state
          : {
              ...state,
              loadingMore: false,
            },
      );
    }
  }

  private async searchDetailedCharacterPage(
    searchTerm: string,
    offset: number,
    requestId: number,
    getActiveRequestId: () => number,
  ): Promise<{ items: CharacterDetailRecord[]; nextOffset: number; hasMore: boolean } | null> {
    const page = await this.repository.searchDetailedCharacters({
      searchTerm,
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'powerFirst',
      limit: CHARACTER_PICKER_PAGE_SIZE,
      offset,
    });

    if (requestId !== getActiveRequestId()) {
      return null;
    }

    return {
      items: this.dedupeCharacterRecords(page),
      nextOffset: offset + page.length,
      hasMore: page.length === CHARACTER_PICKER_PAGE_SIZE,
    };
  }

  private getCharacterPickerPanelState(
    panel: CharacterPickerPanelKey,
  ): WritableSignal<CharacterPickerPanelState> {
    return panel === 'manual' ? this.manualCandidatePanelState : this.excludedCandidatePanelState;
  }

  private getCharacterPickerCandidates(
    panel: CharacterPickerPanelKey,
  ): WritableSignal<CharacterDetailRecord[]> {
    return panel === 'manual' ? this.manualCandidates : this.excludedCandidates;
  }

  private getCharacterPickerSearchTerm(panel: CharacterPickerPanelKey): string {
    return panel === 'manual'
      ? this.manualSearchTerm().trim()
      : this.excludeCharacterSearchTerm().trim();
  }

  private dedupeCharacterRecords(records: CharacterDetailRecord[]): CharacterDetailRecord[] {
    const seenCharacterIds = new Set<number>();

    return records.filter((record) => {
      if (seenCharacterIds.has(record.id)) {
        return false;
      }

      seenCharacterIds.add(record.id);
      return true;
    });
  }

  private cacheCharacterRecords(characters: CharacterListItem[]): void {
    for (const character of characters) {
      this.cacheCharacterRecord(character);
    }
  }

  private updateResultShipSelection(): void {
    const currentResult = this.result();

    if (!currentResult) {
      return;
    }

    const manualShipId = this.selectedManualShipId();
    const excludedShipIds = [...this.excludedShipIds()];
    const nextResult: AutoBuildResult = {
      ...currentResult,
      input: {
        ...currentResult.input,
        favoriteShipsOnly: this.favoriteShipsOnly(),
        favoriteShipIds: [...this.favoriteShipIds()],
        manualShipId,
        excludedShipIds,
      },
      requestedInput: {
        ...currentResult.requestedInput,
        favoriteShipsOnly: this.favoriteShipsOnly(),
        favoriteShipIds: [...this.favoriteShipIds()],
        manualShipId,
        excludedShipIds,
      },
      shipSelection: null,
    };

    nextResult.shipSelection = resolveAutoBuildShipSelection(nextResult, this.ships());
    this.result.set(nextResult);
    this.currentTeamId.set(null);
  }

  private reconcileFavoriteShipSelection(): void {
    const selectedManualShipId = this.selectedManualShipId();

    if (selectedManualShipId !== null && !this.canSelectManualShip(selectedManualShipId)) {
      this.selectedManualShipId.set(null);
    }

    if (this.result()) {
      this.updateResultShipSelection();
    }

    this.syncShipPickerPanelStates();
  }

  private loadMoreShipPickerPanelOnScroll(panel: 'manual' | 'excluded', event: Event): void {
    const container = event.target as {
      scrollTop: number;
      clientHeight: number;
      scrollHeight: number;
    } | null;

    if (!this.shouldLoadMoreShipPickerPanel(container)) {
      return;
    }

    this.loadMoreShipPickerPanel(panel);
  }

  private shouldLoadMoreShipPickerPanel(
    container:
      | {
          scrollTop: number;
          clientHeight: number;
          scrollHeight: number;
        }
      | null
      | undefined,
  ): boolean {
    if (!container) {
      return false;
    }

    const remainingDistance =
      container.scrollHeight - (container.scrollTop + container.clientHeight);

    return remainingDistance <= SHIP_PICKER_SCROLL_LOAD_THRESHOLD_PX;
  }

  private loadMoreShipPickerPanel(panel: 'manual' | 'excluded'): void {
    const panelState = this.getShipPickerPanelState(panel);
    const currentState = panelState();

    if (!currentState.hasMore) {
      return;
    }

    const totalCount = this.getShipCandidateCards(panel).length;
    const nextVisibleCount = Math.min(
      currentState.visibleCount + SHIP_PICKER_PAGE_SIZE,
      totalCount,
    );

    panelState.set({
      ...currentState,
      loadingMore: true,
    });
    panelState.set({
      visibleCount: nextVisibleCount,
      hasMore: nextVisibleCount < totalCount,
      loadingMore: false,
    });
  }

  private syncShipPickerPanelStates(): void {
    this.syncShipPickerPanelState('manual');
    this.syncShipPickerPanelState('excluded');
  }

  private syncShipPickerPanelState(
    panel: 'manual' | 'excluded',
    options: { reset?: boolean } = {},
  ): void {
    const panelState = this.getShipPickerPanelState(panel);
    const currentState = panelState();
    const totalCount = this.getShipCandidateCards(panel).length;
    const initialVisibleCount = Math.min(totalCount, SHIP_PICKER_PAGE_SIZE);
    const nextVisibleCount = options.reset
      ? initialVisibleCount
      : totalCount === 0
        ? 0
        : currentState.visibleCount === 0
          ? initialVisibleCount
          : Math.min(currentState.visibleCount, totalCount);

    panelState.set({
      visibleCount: nextVisibleCount,
      hasMore: nextVisibleCount < totalCount,
      loadingMore: false,
    });
  }

  private getShipPickerPanelState(
    panel: 'manual' | 'excluded',
  ): WritableSignal<ShipPickerPanelState> {
    return panel === 'manual' ? this.manualShipPanelState : this.excludedShipPanelState;
  }

  private getShipCandidateCards(panel: 'manual' | 'excluded'): ShipCandidateCardView[] {
    return panel === 'manual' ? this.manualShipCandidates() : this.excludedShipCandidates();
  }

  private buildShipCardSubtitle(ship: ShipRecord): string {
    const description = ship.description.trim();

    return description.length > 132 ? `${description.slice(0, 129).trimEnd()}...` : description;
  }

  private cacheCharacterRecord(character: CharacterListItem): void {
    this.lockedCharacterRecords.update((currentRecords) => {
      if (currentRecords[character.id]) {
        return currentRecords;
      }

      return {
        ...currentRecords,
        [character.id]: character,
      };
    });
  }

  private removeCharacterFromAllManualSlots(characterId: number): void {
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) => ({
        ...slot,
        characterIds: slot.characterIds.filter(
          (selectedCharacterId) => selectedCharacterId !== characterId,
        ),
      })),
    );
  }

  private resolveManualSlotSelection(role: AutoBuildManualSlotRole): AutoBuildManualSlotSelection {
    return (
      this.manualSlots().find((slot) => slot.role === role) ?? {
        role,
        characterIds: [],
      }
    );
  }

  private serializeManualSlots(): AutoBuildManualSlotSelection[] {
    return this.manualSlots().map((slot) => ({
      role: slot.role,
      characterIds: [...slot.characterIds],
    }));
  }

  private resolveInitialManualSlotRole(
    manualSlots: AutoBuildManualSlotSelection[],
  ): AutoBuildManualSlotRole {
    return (
      manualSlots.find((slot) => slot.characterIds.length > 0)?.role ??
      AUTO_BUILD_MANUAL_SLOT_ROLES[0]
    );
  }

  private isLeaderManualSlotRole(role: AutoBuildManualSlotRole): boolean {
    return role === 'captain' || role === 'friendCaptain';
  }

  private isSubManualSlotRole(role: AutoBuildManualSlotRole): boolean {
    return !this.isLeaderManualSlotRole(role);
  }

  private getManualSlotTitle(role: AutoBuildManualSlotRole): string {
    switch (role) {
      case 'captain': {
        return this.t('manual.slots.roles.captain');
      }
      case 'friendCaptain': {
        return this.t('manual.slots.roles.friendCaptain');
      }
      case 'sub1': {
        return this.t('manual.slots.roles.sub1');
      }
      case 'sub2': {
        return this.t('manual.slots.roles.sub2');
      }
      case 'sub3': {
        return this.t('manual.slots.roles.sub3');
      }
      case 'sub4': {
        return this.t('manual.slots.roles.sub4');
      }
    }
  }

  private getManualSlotSupport(role: AutoBuildManualSlotRole, selectedCount: number): string {
    if (this.isLeaderManualSlotRole(role)) {
      return selectedCount
        ? this.t('manual.slots.support.leaderSelected', { count: selectedCount })
        : this.t('manual.slots.support.leaderEmpty');
    }

    return selectedCount
      ? this.t('manual.slots.support.subSelected', { count: selectedCount })
      : this.t('manual.slots.support.subEmpty');
  }

  private resolveManualCharacterSelectionSupport(
    characterId: number,
    activeRole: AutoBuildManualSlotRole,
  ): string | null {
    if (this.isExcludedCharacter(characterId)) {
      return this.t('manual.slotSelection.excluded');
    }

    const assignedRoles = this.manualSlots()
      .filter((slot) => slot.role !== activeRole && slot.characterIds.includes(characterId))
      .map((slot) => this.getManualSlotTitle(slot.role));

    if (assignedRoles.length === 0) {
      return null;
    }

    return this.t('manual.slotSelection.assignedTo', {
      slots: assignedRoles.join(' / '),
    });
  }

  private resolveExcludedCharacterSelectionSupport(characterId: number): string | null {
    const assignedRoles = this.manualSlots()
      .filter((slot) => slot.characterIds.includes(characterId))
      .map((slot) => this.getManualSlotTitle(slot.role));

    if (assignedRoles.length > 0) {
      return this.t('exclude.selectionSupport.removesLockedFrom', {
        slots: assignedRoles.join(' / '),
      });
    }

    return null;
  }

  private resolveManualShipSupportLabel(shipId: number): string | null {
    if (this.isExcludedShip(shipId)) {
      return this.t('ships.excluded');
    }

    if (this.favoriteShipsOnly() && !this.isFavoriteShip(shipId)) {
      return this.t('ships.favoriteOnly.blocked');
    }

    return null;
  }

  private resolveExcludedShipSupportLabel(shipId: number): string | null {
    if (this.selectedManualShipId() === shipId) {
      return this.t('exclude.selectionSupport.clearsManualShip');
    }

    return null;
  }

  private resolveLeaderFailureLabel(): string {
    if (this.hasDualLeaders()) {
      return this.t('errors.leaderRequirement.dual');
    }

    if (this.hasSelectedLeaders()) {
      return this.t('errors.leaderRequirement.single');
    }

    return '';
  }

  private resolveRoleLabel(role: 'captain' | 'friendCaptain' | 'sub'): string {
    switch (role) {
      case 'captain': {
        return this.t('results.teamSlots.roles.captain');
      }
      case 'friendCaptain': {
        return this.t('results.teamSlots.roles.friendCaptain');
      }
      default: {
        return this.t('results.teamSlots.roles.sub');
      }
    }
  }

  private serializeManualRequiredAbilities(): AutoBuildAbilityRequirement[] {
    return serializeAbilityRequirementDrafts(this.requiredAbilityDrafts(), {
      dedupe: true,
      catalogMap: this.abilityCatalogMap(),
    });
  }

  private serializeEnemyMechanics(): AutoBuildEnemyMechanicRequirement[] {
    return serializeEnemyMechanicDrafts(this.enemyMechanicDrafts());
  }

  public resolveAbilityCatalogItem(abilityKey: string): AutoBuildAbilityCatalogItem | undefined {
    return this.abilityCatalogMap().get(abilityKey);
  }

  public formatAbilityRequirement(requirement: AutoBuildAbilityRequirement): string {
    return formatAbilityRequirementSummary(
      requirement,
      (abilityKey) => {
        const catalogItem = this.resolveAbilityCatalogItem(abilityKey);

        return catalogItem ? this.formatAbilityCatalogItemLabel(catalogItem) : abilityKey;
      },
      {
        formatCharacters: (count) => this.t('abilities.requirement.characters', { count }),
        formatTurns: (count) => this.t('abilities.requirement.turns', { count }),
      },
    );
  }

  public formatEnemyMechanic(requirement: AutoBuildEnemyMechanicRequirement): string {
    return formatEnemyMechanicSummary(
      requirement,
      (mechanicKey) => this.enemyMechanicCatalogMap().get(mechanicKey)?.label ?? mechanicKey,
      {
        formatTurns: (count) => this.t('abilities.requirement.turns', { count }),
        resolveTriggerTag: (tag) => this.t(`enemyMechanics.tags.trigger.${tag}`),
        resolveResponseTag: (tag) => this.t(`enemyMechanics.tags.response.${tag}`),
        resolveConditionTag: (tag) => this.t(`enemyMechanics.tags.condition.${tag}`),
      },
    );
  }

  public resolveRequiredAbilitySelectedText(draft: AbilityRequirementDraft): string {
    if (draft.abilityKey.length === 0) {
      return this.t('abilities.select');
    }

    return this.formatAbilityRequirement({
      abilityKey: draft.abilityKey,
      minTurns: draft.minTurns,
      slotTokens: draft.slotTokens,
      requiredCharacterCount: draft.requiredCharacterCount ?? 1,
    });
  }

  public resolveEnemyMechanicSelectedText(draft: EnemyMechanicDraft): string {
    if (draft.mechanicKey.length === 0) {
      return this.t('abilities.select');
    }

    return this.formatEnemyMechanic({
      mechanicKey: draft.mechanicKey,
      category: draft.category,
      minTurns: draft.minTurns,
      triggerTags: [...draft.triggerTags],
      responseTags: [...draft.responseTags],
      conditionTags: [...draft.conditionTags],
      derivedAbilityKey: draft.derivedAbilityKey,
    });
  }

  private resolveSelectedClasses(value: string[] | string | null | undefined): string[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];
    const availableClassesSet = new Set(this.availableClasses());
    const uniqueValues = [...new Set(nextValues.map((characterClass) => characterClass.trim()))];

    return uniqueValues.filter(
      (characterClass) => characterClass.length && availableClassesSet.has(characterClass),
    );
  }

  private resolveSelectedTypes(
    value: AutoTeamBuilderType[] | AutoTeamBuilderType | null | undefined,
  ): AutoTeamBuilderType[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];
    const uniqueValues = [...new Set(nextValues)];

    return uniqueValues.filter((type): type is AutoTeamBuilderType =>
      this.availableTypes.includes(type),
    );
  }

  private buildManualCharacterCards(
    characters: CharacterDetailRecord[],
    highlightedRequirements: AutoBuildAbilityRequirement[],
  ): ManualCharacterCardView[] {
    const activeRole = this.activeManualSlotRole();
    const visibleCharacters =
      this.isLeaderManualSlotRole(activeRole) &&
      highlightedRequirements.some((requirement) =>
        EXTRA_DROP_ABILITY_KEY_SET.has(requirement.abilityKey),
      )
        ? characters.filter((character) =>
            matchesLeaderOnlyManualRequirements(character, highlightedRequirements),
          )
        : characters;

    return visibleCharacters.map((character) => {
      const isSelectedInActiveSlot = this.isCharacterSelectedInManualSlot(activeRole, character.id);

      return {
        character,
        subtitle: this.buildCharacterSubtitle(character),
        favoriteLabel: this.isFavorite(character.id) ? this.t('manual.favorite') : null,
        abilityChips: this.buildAbilityChipViews(
          character.detail.builderAbilities,
          highlightedRequirements,
          { includeEmptyState: false },
        ),
        isSelectedInActiveSlot,
        isSelectableInActiveSlot: this.canAssignCharacterToManualSlot(activeRole, character),
        actionLabel: isSelectedInActiveSlot
          ? this.i18n.translate('common.actions.remove')
          : this.t('manual.actions.addChoice'),
        selectionSupportLabel: this.resolveManualCharacterSelectionSupport(
          character.id,
          activeRole,
        ),
      };
    });
  }

  private buildExcludedCharacterCards(
    characters: CharacterDetailRecord[],
    highlightedRequirements: AutoBuildAbilityRequirement[],
  ): ExcludedCharacterCardView[] {
    return characters.map((character) => {
      const isExcluded = this.isExcludedCharacter(character.id);

      return {
        character,
        subtitle: this.buildCharacterSubtitle(character),
        favoriteLabel: this.isFavorite(character.id) ? this.t('manual.favorite') : null,
        abilityChips: this.buildAbilityChipViews(
          character.detail.builderAbilities,
          highlightedRequirements,
          { includeEmptyState: false },
        ),
        isExcluded,
        isSelectable: this.canExcludeCharacter(character.id),
        actionLabel: isExcluded
          ? this.i18n.translate('common.actions.remove')
          : this.t('exclude.actions.add'),
        selectionSupportLabel: this.resolveExcludedCharacterSelectionSupport(character.id),
      };
    });
  }

  private buildCharacterSubtitle(character: CharacterDetailRecord): string {
    const typeLabel = character.type
      .split(',')
      .map((value) => value.trim())
      .join(' • ');
    const classLabel = character.classes.join(' • ');

    return [typeLabel, classLabel].filter((value) => value.length).join(' • ');
  }

  private resolveManualUniqueBaseNameConflictNames(): string[] {
    const lockedRecords = this.lockedCharacterRecords();
    const filledSlots = this.manualSlots()
      .map((slot) => ({
        role: slot.role,
        records: slot.characterIds
          .map((characterId) => lockedRecords[characterId])
          .filter((record): record is CharacterListItem => Boolean(record)),
      }))
      .filter((slot) => slot.role !== 'friendCaptain' && slot.records.length > 0);

    if (
      filledSlots.length < 2 ||
      this.hasValidUniqueBaseNameAssignment(filledSlots, 0, new Set<string>())
    ) {
      return [];
    }

    const usageByConflictKey = new Map<string, Map<AutoBuildManualSlotRole, Set<string>>>();

    for (const slot of filledSlots) {
      const slotConflictKeys = new Set<string>();

      for (const record of slot.records) {
        const label = record.name
          .replace(/^[^A-Za-z0-9]+/, '')
          .replace(/\s+/g, ' ')
          .trim();

        for (const conflictKey of resolveCharacterPartyConflictKeys(record)) {
          if (conflictKey.length === 0 || slotConflictKeys.has(conflictKey)) {
            continue;
          }

          slotConflictKeys.add(conflictKey);
          const currentUsage = usageByConflictKey.get(conflictKey) ?? new Map();
          const slotLabels = currentUsage.get(slot.role) ?? new Set<string>();

          slotLabels.add(label);
          currentUsage.set(slot.role, slotLabels);
          usageByConflictKey.set(conflictKey, currentUsage);
        }
      }
    }

    return [
      ...new Set(
        [...usageByConflictKey.values()]
          .filter((usageByRole) => usageByRole.size > 1)
          .flatMap((usageByRole) => [...usageByRole.values()].flatMap((labels) => [...labels])),
      ),
    ];
  }

  private hasValidUniqueBaseNameAssignment(
    slots: Array<{ role: AutoBuildManualSlotRole; records: CharacterListItem[] }>,
    slotIndex: number,
    usedConflictKeys: Set<string>,
  ): boolean {
    if (slotIndex >= slots.length) {
      return true;
    }

    const slot = slots[slotIndex];

    for (const record of slot.records) {
      const partyConflictKeys = resolveCharacterPartyConflictKeys(record);

      if (
        partyConflictKeys.length === 0 ||
        partyConflictKeys.some((conflictKey) => usedConflictKeys.has(conflictKey))
      ) {
        continue;
      }

      const nextUsedConflictKeys = new Set(usedConflictKeys);
      partyConflictKeys.forEach((conflictKey) => nextUsedConflictKeys.add(conflictKey));

      if (this.hasValidUniqueBaseNameAssignment(slots, slotIndex + 1, nextUsedConflictKeys)) {
        return true;
      }
    }

    return false;
  }

  private buildAbilityChipViews(
    abilities: NormalizedBuilderAbility[],
    highlightedRequirements: AutoBuildAbilityRequirement[],
    options: { includeEmptyState?: boolean } = {},
  ): CharacterAbilityChipView[] {
    const includeEmptyState = options.includeEmptyState ?? true;

    if (abilities.length === 0) {
      if (!includeEmptyState) {
        return [];
      }

      return [
        {
          key: 'none',
          label: this.t('abilities.noneParsed'),
          highlighted: false,
          empty: true,
        },
      ];
    }

    const seen = new Set<string>();
    const chipViews: CharacterAbilityChipView[] = [];

    for (const ability of abilities) {
      const key = `${ability.key}|${ability.minTurns ?? 'none'}|${ability.slotTokens.join(',')}|${ability.source}|${ability.coverageMode ?? 'explicit'}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      chipViews.push({
        key,
        label: this.formatCharacterAbility(ability),
        highlighted:
          highlightedRequirements.length > 0 &&
          matchesAnyAbilityRequirement(ability, highlightedRequirements),
      });
    }

    return chipViews;
  }

  private formatCharacterAbility(ability: NormalizedBuilderAbility): string {
    const metadata: string[] = [];

    if (ability.minTurns !== null) {
      metadata.push(this.t('abilities.requirement.turns', { count: ability.minTurns }));
    }

    if (ability.slotTokens.length > 0) {
      metadata.push(ability.slotTokens.join(' / '));
    }

    const metadataSuffix = metadata.length > 0 ? ` (${metadata.join(' • ')})` : '';
    const sourceSuffix =
      ability.source === 'captainAbility' ? ` • ${this.t('abilities.captainSource')}` : '';

    return `${this.formatCharacterAbilityLabel(ability)}${metadataSuffix}${sourceSuffix}`;
  }

  public formatAbilityCatalogItemLabel(item: AutoBuildAbilityCatalogItem): string {
    const coverageModes = item.availableCoverageModes ?? ['explicit'];

    if (!coverageModes.includes('selectedDebuff')) {
      return item.label;
    }

    if (coverageModes.includes('explicit')) {
      return this.t('abilities.catalog.withSelectableDebuff', { label: item.label });
    }

    return this.t('abilities.catalog.selectableDebuffOnly', { label: item.label });
  }

  private formatCharacterAbilityLabel(ability: NormalizedBuilderAbility): string {
    const coverageMode = ability.coverageMode ?? 'explicit';
    const coverageSuffix = this.resolveCoverageModeLabel(coverageMode);

    return coverageSuffix ? `${ability.label} (${coverageSuffix})` : ability.label;
  }

  private resolveCoverageModeLabel(coverageMode: AutoBuildAbilityCoverageMode): string | null {
    return coverageMode === 'selectedDebuff' ? this.t('abilities.selectableDebuff') : null;
  }

  private formatSelectedTypes(types: AutoTeamBuilderType[]): string {
    return this.formatSelectedValues(types);
  }

  private formatResultValues(values: readonly string[]): string {
    return values.length > 0 ? this.formatSelectedValues(values) : this.t('results.none');
  }

  private formatSelectedValues(values: readonly string[]): string {
    return values.join(' / ');
  }

  private resolvePresetImportError(error: unknown): string {
    if (error instanceof AutoTeamSelectionImportError) {
      return this.t(error.key, error.parameters);
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return this.t('preset.importFailedDescription');
  }

  private formatApproximateDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));

    if (totalSeconds < 60) {
      return `~${totalSeconds}s`;
    }

    const totalMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (totalMinutes < 60) {
      return `~${totalMinutes}m ${seconds}s`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `~${hours}h ${minutes}m`;
  }

  private formatLiveDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));

    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}m ${seconds}s`;
  }

  private t(
    key: string,
    parameters?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    return this.i18n.translate(key, parameters, 'auto-team-builder');
  }

  private async resolveCurrentCandidatePoolRecords(): Promise<CharacterDetailRecord[]> {
    if (!this.hasSelectedTypes() || !this.hasSelectedClasses()) {
      return [];
    }

    const allowedCharacterIds = this.resolveCurrentAutoBuildAllowedCharacterIds();

    if (this.selectedCharacterBox() && allowedCharacterIds.length === 0) {
      return [];
    }

    return this.repository.getAutoBuilderCandidates(
      this.selectedTypes(),
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: this.selectedClasses(),
        allowedCharacterIds: allowedCharacterIds.length > 0 ? allowedCharacterIds : undefined,
        lockedCharacterIds: this.lockedCharacterIds(),
        excludedCharacterIds: this.excludedCharacterIds(),
      },
    );
  }

  private resolveCurrentAutoBuildAllowedCharacterIds(): number[] {
    if (this.selectedCharacterBox()) {
      return [...(this.effectiveAutoBuildCandidateIds() ?? [])];
    }

    return this.favoritesOnly() ? [...this.favoriteCharacterIds()] : [];
  }

  private buildNextCandidatePoolBoxName(): string {
    const existingNames = new Set(
      this.characterBoxes()
        .map((box) => box.name.trim().toLowerCase())
        .filter((name) => name.length > 0),
    );
    let count = 1;

    while (
      existingNames.has(this.t('candidatePoolBox.defaults.name', { count }).trim().toLowerCase())
    ) {
      count += 1;
    }

    return this.t('candidatePoolBox.defaults.name', { count });
  }

  private translateImportMessage(message: AutoTeamSelectionImportMessage): string {
    return this.t(message.key, message.params);
  }

  private joinRequirementLabels(labels: string[]): string {
    return labels.join(this.t('errors.requirements.separator'));
  }

  private resetSaveFeedbackState(): void {
    this.saveUiLocked.set(false);
    this.saveFeedbackVisible.set(false);
    this.saveFeedbackError.set('');
  }

  private async waitForSaveFeedbackWindow(startedAt: number): Promise<void> {
    const remainingDuration = SAVE_TEAM_FEEDBACK_DURATION_MS - (Date.now() - startedAt);

    if (remainingDuration <= 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, remainingDuration);
    });
  }
}

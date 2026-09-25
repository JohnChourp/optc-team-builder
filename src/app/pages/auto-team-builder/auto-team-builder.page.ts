import {
  Component,
  ElementRef,
  type OnDestroy,
  type OnInit,
  ViewChild,
  computed,
  signal,
  type WritableSignal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  buildFailureLines,
  resolveFailureFamily,
} from '../../core/services/failure-message.utils';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { AlertController, type ViewWillEnter } from '@ionic/angular';
import { IonCheckbox, IonIcon, IonInput, IonModal, IonSearchbar, IonSelect, IonTextarea, IonToggle } from '@ionic/angular';
import { IonButton } from '@ionic/angular/ion-button';
import { IonButtons } from '@ionic/angular/ion-buttons';
import { IonContent } from '@ionic/angular/ion-content';
import { IonFooter } from '@ionic/angular/ion-footer';
import { IonHeader } from '@ionic/angular/ion-header';
import { IonMenuButton } from '@ionic/angular/ion-menu-button';
import { IonSelectOption } from '@ionic/angular/ion-select-option';
import { IonSpinner } from '@ionic/angular/ion-spinner';
import { IonTitle } from '@ionic/angular/ion-title';
import { IonToolbar } from '@ionic/angular/ion-toolbar';
import {
  alertCircleOutline,
  boatOutline,
  checkmarkCircleOutline,
  closeOutline,
  cloudUploadOutline,
  copyOutline,
  createOutline,
  gitCompareOutline,
  heart,
  heartOutline,
  layersOutline,
  lockClosedOutline,
  lockOpenOutline,
  optionsOutline,
  shieldHalfOutline,
  sparklesOutline,
  swapHorizontalOutline,
} from 'ionicons/icons';

import {
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_BUILD_MANUAL_SUB_SLOT_ROLES,
  AUTO_BUILD_LEADER_BOOST_FILTERS,
  AUTO_TEAM_CANDIDATE_LIMIT,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildLeaderBoostFilter,
  type AutoBuildLeaderBoostRange,
  type AutoBuildLeaderBoostRanges,
  type AutoBuildCaptainBranchMode,
  type AutoBuildConstraints,
  type AutoTeamBuildExecutionPath,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoBuildProgressExclusionCounts,
  type AutoBuildProgressSnapshot,
  type AutoBuildRejectedCandidateReason,
  type AutoBuildReplacedCaptain,
  type AutoBuildResult,
  type AutoBuildSlotExplanationReason,
  type AutoBuildCostRange,
  type AutoBuildAvoidPreferRules,
  type AutoTeamBuilderType,
  createEmptyAutoBuildCostRange,
  createEmptyAutoBuildLeaderBoostRanges,
  createEmptyAutoBuildManualSlots,
  shouldTreatSelectedClassesAsNeutral,
} from '../../core/models/auto-team-builder.models';
import {
  normalizeAbilityEffectTargetScope,
  normalizeAbilityRequirementEffectValue,
  normalizeAbilityRequirementSourceScope,
  normalizeAbilityRequirementSlotScope,
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildBattleRequirement,
  type AutoBuildAbilityCoverageMode,
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicCatalogItem,
  type AutoBuildEnemyMechanicRequirement,
  type AutoBuildRequiredCharacterGroup,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterDetailRecord,
  type CharacterListItem,
  type CharacterBox,
  type CharacterTagSetSelection,
  type DatasetManifest,
  type SavedTeam,
  type ShipRecord,
} from '../../core/models/optc.models';
import {
  cloneCharacterTagSetSelection,
  countCharacterTagSetTags,
  countPopulatedCharacterTagSets,
  createCharacterTagSet,
  createEmptyCharacterTagSetSelection,
  expandCharacterTagsToSets,
  flattenCharacterTagSets,
} from '../../core/services/character-tag-set.utils';
import {
  AutoTeamBuilderService,
  isAutoTeamBuildSearchTooLargeError,
  type AutoTeamBuildExecutionOptions,
} from '../../core/services/auto-team-builder.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import { matchesAnyAbilityRequirement } from '../../core/services/auto-team-builder-ability-match.utils';
import type { AutoBuildInfeasibilityDiagnosis } from '../../core/services/auto-team-builder-infeasibility.utils';
import { isAutoTeamBuildCancelledError } from '../../core/services/auto-team-builder.engine';
import { resolveAutoBuildShipSelection } from '../../core/services/auto-team-builder-ship.utils';
import {
  resolveFinalReportRemedy,
  type FinalReportRemedy,
  type FinalReportRemedyContext,
} from '../../core/services/auto-team-builder-final-report-remedy.utils';
import {
  filterByRejectedGroupCode,
  groupRejectedCandidatesByDecisiveReason,
  resolveRejectedCandidateGroupCode,
  type RejectedCandidateGroupCode,
} from '../../core/services/auto-team-builder-rejected-candidate-groups.utils';
import {
  resolveCaptainTeamConditionStatus,
  type CaptainTeamConditionStatus,
} from '../../core/services/captain-team-condition-status.utils';
import {
  isVsCaptainCoverageBranchCaptain,
  resolveCaptainCoverage,
  resolveCaptainCoverageBranchDisplay,
  resolveCaptainCoverageBranchOptions,
  resolveCaptainCoverageFormOnlyClasses,
} from '../../core/services/captain-coverage.utils';
import {
  type FormOnlyClassMatch,
  mergeFormOnlyClassMatches,
  resolveFormOnlyClassMatch,
} from '../../core/services/character-facet-filter.utils';
import { FormClassMarkerComponent } from '../../shared/character-facet-filter/form-class-marker.component';
import { resolveCharacterFacetMatches } from '../../core/services/auto-team-builder.utils';
import {
  createEmptyAvoidPreferRules,
  hasAvoidPreferRules,
  normalizeAvoidPreferRules,
  toSparseAvoidPreferFields,
} from '../../core/services/auto-team-builder-avoid-prefer.utils';
import { resolveCharacterSameCharacterKeys } from '../../core/services/character-party-conflict-keys.utils';
import { isSupportOnlyCharacter } from '../../core/grammar/support-only-character';
import {
  buildMechanicChecklist,
  collectRequestedAbilityRequirements,
  type MechanicChecklistEntry,
} from '../../core/services/auto-team-builder-mechanic-checklist.utils';
import { type GameMode, GAME_MODES } from '../../core/services/character-mode-effects.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { PreferencesAdapterService } from '../../core/services/preferences-adapter.service';
import {
  AUTO_TEAM_BUILDER_RESULT_KEY,
  buildAutoTeamBuilderResultSnapshot,
  parseAutoTeamBuilderResultSnapshot,
  restoreAutoTeamBuilderResult,
  snapshotCharacterIds,
} from './auto-team-builder-result-snapshot.utils';
import {
  buildTeamModeEffects,
  type TeamModeEffectMember,
  type TeamModeEffects,
} from './team-mode-effects.utils';
import {
  buildSpecialChargeTimeline,
  clampTimelineTurns,
  DEFAULT_TIMELINE_TURNS,
  type SpecialChargeEntry,
  type SpecialChargeTimeline,
  type SpecialCooldownRecord,
} from './special-charge-timeline.utils';
import {
  buildStartOfQuestCutsBySlot,
  clampEventCutTurns,
  type StartCutPart,
} from './special-charge-start-cut.utils';
import {
  AUTO_TEAM_BUILDER_SELECTION_SESSION_KEY,
  isDefaultSelectionState,
  narrowToAvailable,
  parseSelectionState,
} from './auto-team-builder-selection-state.utils';
import {
  UserStateService,
  type AutoTeamBuilderWorkerMode,
} from '../../core/services/user-state.service';
import { classifyBrowserStorageFailure } from '../../core/services/browser-storage-error.utils';
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
import {
  AUTO_TEAM_DEBUG_REPORT_ISSUE_URL,
  type AutoTeamBuildFailureCode,
  type AutoTeamBuildStats,
  type AutoTeamDebugReport,
  type AutoTeamDebugReportContext,
  type AutoTeamDebugReportRequestSource,
  buildAutoTeamDebugReport,
  formatAutoTeamDebugReportMarkdown,
} from './auto-team-builder-debug-report.utils';
import { copyTextToClipboard } from '../../shared/clipboard/clipboard-copy.utils';
import { Capacitor } from '@capacitor/core';
import packageJson from '../../../../package.json';
import { buildSavedTeamsTransferPayload } from '../saved-teams/saved-teams-transfer.utils';
import { downloadSavedTeamsExport } from '../saved-teams/saved-teams-export.utils';
import {
  givePlayerFile,
  JSON_EXPORT_MIME_TYPE,
} from '../../core/services/player-file-delivery.utils';
import {
  AutoTeamCompareImportError,
  buildAutoTeamCompareDiff,
  buildAutoTeamCompareSnapshotFromCurrent,
  buildAutoTeamCompareSnapshotFromImportedSeed,
  buildAutoTeamCompareSnapshotFromSavedTeam,
  collectAutoTeamCompareSeedCharacterIds,
  isAutoTeamCompareUnnamedTeamKey,
  parseAutoTeamCompareImportPayload,
  type AutoTeamCompareDiff,
  type AutoTeamCompareImportedSeed,
  type AutoTeamCompareMetricDiffRow,
  type AutoTeamCompareSide,
  type AutoTeamCompareSnapshot,
  type AutoTeamCompareSource,
} from './auto-team-builder-team-compare.utils';
import {
  AbilityRequirementPickerComponent,
  type AbilityRequirementPickerLeaderBoostSettings,
} from '../../shared/ability-requirement-picker/ability-requirement-picker.component';
import { CaptainTeamConditionStatusComponent } from '../../shared/captain-team-condition-status/captain-team-condition-status.component';
import { TeamCoverageSummaryComponent } from '../../shared/team-coverage-summary/team-coverage-summary.component';
import { CharacterAbilityGroupsComponent } from '../../shared/character-ability-groups/character-ability-groups.component';
import {
  CharacterTagFilterComponent,
  type CharacterTagFilterChange,
} from '../../shared/character-tag-filter/character-tag-filter.component';
import { CharacterTagSetPickerComponent } from '../../shared/character-tag-set-picker/character-tag-set-picker.component';
import {
  createAbilityRequirementDrafts,
  formatAbilityRequirementSummary,
  resolveAbilityRequirementVisual,
  type AbilityRequirementDraft,
  type AbilityRequirementVisualMeta,
} from '../../core/services/ability-requirement-draft.utils';
import {
  createEnemyMechanicDrafts,
  deriveAbilityRequirementsFromEnemyMechanics,
  formatEnemyMechanicSummary,
  getEnemyMechanicCatalogItems,
  resolveEnemyMechanicVisual,
  serializeEnemyMechanicDrafts,
  splitManualAbilityRequirementsFromEnemyMechanics,
  type EnemyMechanicDraft,
  type EnemyMechanicVisualMeta,
} from '../../core/services/enemy-mechanic-draft.utils';
import {
  createCaptainAbilityDrafts,
  getAbilityCatalogItemsByCategory,
  getCaptainAbilityCatalogItems,
  intersectAbilityMatchingCharacterIds,
  isCaptainAbilityRequirement,
  resolveCategoryAbilityMatchingCharacterIds,
  resolveSpecialAbilityMatchingCharacterIds,
  serializeCaptainAbilityDrafts,
  serializeCategoryAbilityDrafts,
  serializeSpecialAbilityDrafts,
} from '../../core/services/special-ability-filter.utils';
import {
  addEmptyGroupToBattle,
  cloneBattleRequirements,
  createEmptyBattleRequirement,
  flattenBattleRequiredCharacterGroups,
  MAX_AUTO_BUILD_BATTLE_COUNT,
  normalizeBattleRequirementsWithLegacyFallback,
} from '../../core/services/auto-team-builder-battle.utils';
import {
  type AutoBuildCharacterRequirementFilters,
  extractAutoBuildCharacterRequirementFilters,
} from '../../core/services/auto-team-builder-character-filter.utils';
import { MAX_REQUIRED_CHARACTER_GROUPS } from '../../core/services/required-character-groups.utils';
import {
  AbilityFilterRailComponent,
  type AbilityFilterRailCategory,
  type AbilityFilterRailItem,
} from '../../shared/ability-filter-rail/ability-filter-rail.component';
import {
  AutoTeamBuilderActionsPanelComponent,
  AutoTeamBuilderCandidateCardPanelComponent,
  AutoTeamBuilderControlsPanelComponent,
  AutoTeamBuilderLoadingPanelComponent,
  AutoTeamBuilderManualChipActionsPanelComponent,
  AutoTeamBuilderManualChipPanelComponent,
  AutoTeamBuilderManualChipShipPanelComponent,
  AutoTeamBuilderManualPanelComponent,
  AutoTeamBuilderManualPickerPanelComponent,
  AutoTeamBuilderManualThumbPanelComponent,
  AutoTeamBuilderManualThumbStatePanelComponent,
  AutoTeamBuilderPageStylePanelsComponent,
  AutoTeamBuilderPickerPanelComponent,
  AutoTeamBuilderRequirementsPanelComponent,
  AutoTeamBuilderResultsPanelComponent,
} from './auto-team-builder-style-panels.component';
import { formattingLanguage } from '../../core/i18n/app-locale-format';
import { applyIonicModalDialogLabel } from '../../shared/a11y/ionic-modal-dialog-label.utils';

type LoadingProgressRowTone = 'primary' | 'secondary' | 'fallback' | 'warning';
type AutoBuildFinalReportState = 'passed' | 'relaxed' | 'notApplicable';

interface AutoTeamCompareSideState {
  source: AutoTeamCompareSource;
  savedTeamId: string;
  importDraft: string;
  importedLabel: string;
  importedRawContent: string;
  importedSeed: AutoTeamCompareImportedSeed | null;
}

interface AutoTeamCompareSidePayload {
  state: AutoTeamCompareSideState;
  seed: AutoTeamCompareImportedSeed | null;
  snapshot: AutoTeamCompareSnapshot | null;
  error: string;
  loading: boolean;
}

interface AutoTeamCompareSessionState {
  open: boolean;
  sides: Record<AutoTeamCompareSide, AutoTeamCompareSideState>;
}

interface AutoBuildFinalReportRow {
  key: string;
  title: string;
  detail: string;
  state: AutoBuildFinalReportState;
  stateLabel: string;
  /** What would un-relax this rule, or null when nothing is derivable - see the remedy utils. */
  remedy: string | null;
}

const AUTO_TEAM_COMPARE_SESSION_KEY = 'autoTeamBuilder.compareState.v1';

export type AutoTeamBuilderCollapsibleSection = 'captainFilters' | 'requiredCharacters' | 'exclude';
const AUTO_TEAM_COMPARE_SIDES: AutoTeamCompareSide[] = ['a', 'b'];

function createAutoTeamCompareSideState(
  source: AutoTeamCompareSource = 'current',
): AutoTeamCompareSideState {
  return {
    source,
    savedTeamId: '',
    importDraft: '',
    importedLabel: '',
    importedRawContent: '',
    importedSeed: null,
  };
}

function cloneAutoTeamCompareImportedSeed(
  seed: AutoTeamCompareImportedSeed | null,
): AutoTeamCompareImportedSeed | null {
  if (!seed) {
    return null;
  }

  return {
    ...seed,
    slotIds: [...seed.slotIds],
    characters: seed.characters ? [...seed.characters] : [],
  };
}

function cloneAutoTeamCompareSideState(
  state: AutoTeamCompareSideState,
): AutoTeamCompareSideState {
  return {
    ...state,
    importedSeed: cloneAutoTeamCompareImportedSeed(state.importedSeed),
  };
}

function clearImportedCompareSessionFields(
  state: AutoTeamCompareSideState,
): AutoTeamCompareSideState {
  return {
    ...state,
    importDraft: '',
    importedLabel: '',
    importedRawContent: '',
    importedSeed: null,
  };
}

function createAutoTeamCompareSidePayload(
  source: AutoTeamCompareSource = 'current',
): AutoTeamCompareSidePayload {
  return {
    state: createAutoTeamCompareSideState(source),
    seed: null,
    snapshot: null,
    error: '',
    loading: false,
  };
}

function cloneAutoTeamCompareSidePayload(
  payload: AutoTeamCompareSidePayload,
): AutoTeamCompareSidePayload {
  const seed = cloneAutoTeamCompareImportedSeed(payload.seed);

  return {
    state: cloneAutoTeamCompareSideState(payload.state),
    seed,
    snapshot: payload.snapshot,
    error: payload.error,
    loading: payload.loading,
  };
}

function settleSwappedComparePayload(
  payload: AutoTeamCompareSidePayload,
): AutoTeamCompareSidePayload {
  const clonedPayload = cloneAutoTeamCompareSidePayload(payload);

  return clonedPayload.loading
    ? {
        ...clonedPayload,
        snapshot: null,
        error: '',
        loading: false,
      }
    : clonedPayload;
}

function normalizeCompareSource(value: unknown): AutoTeamCompareSource {
  return value === 'saved' || value === 'imported' ? value : 'current';
}

function normalizeCompareSessionPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface LoadingProgressRow {
  key:
    | 'message'
    | 'currentStepElapsed'
    | 'favoriteScope'
    | 'leaderPair'
    | 'leaderScope'
    | 'leaderPairPosition'
    | 'attemptWork'
    | 'candidateChecks'
    | 'subPool'
    | 'searchNodes'
    | 'currentExclusions'
    | 'permanentExclusions'
    | 'activeWorkers'
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

type RequiredCharacterAbilityCategory = 'special' | 'crewmate' | 'potential' | 'support';

function isRequiredCharacterAbilityCategory(
  category: AbilityFilterRailCategory,
): category is RequiredCharacterAbilityCategory {
  return (
    category === 'special' ||
    category === 'crewmate' ||
    category === 'potential' ||
    category === 'support'
  );
}

interface RequiredCharacterGroupView {
  battleId: string;
  group: AutoBuildRequiredCharacterGroup;
  title: string;
  abilityCount: number;
  chips: AbilityRequirementSummaryChipView[];
}

interface RequiredBattleView {
  battle: AutoBuildBattleRequirement;
  title: string;
  requiredCharacterCount: number;
  groupViews: RequiredCharacterGroupView[];
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
  selectedBranchLabel: string | null;
  branchActions: ManualCaptainBranchActionView[];
}

type ManualSlotSelectedCharacterView = CharacterListItem & {
  isRequiredInManualSlot: boolean;
  branchLabel: string | null;
  /** 869f6td4p. Arrived with a saved team or a preset; the build never puts it in the crew. */
  supportOnly: boolean;
};

interface ManualCaptainBranchActionView {
  mode: AutoBuildCaptainBranchMode;
  label: string;
  displayName: string;
  selected: boolean;
  disabled: boolean;
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
  selectedCharacters: ManualSlotSelectedCharacterView[];
  requiredCharacterId: number | null;
  isLeaderSlot: boolean;
  isActive: boolean;
}

interface ManualCopyCharacterView {
  character: CharacterListItem;
  selected: boolean;
}

interface ManualCopyTargetSlotView {
  role: AutoBuildManualSlotRole;
  title: string;
  support: string;
  selectedCharacters: CharacterListItem[];
  selected: boolean;
  isSource: boolean;
}

type TeamSlotViewModel = AutoBuildResult['slots'][number] & {
  trackKey: string;
  roleLabel: string;
  manualSlotRole: AutoBuildManualSlotRole | null;
  characterTags: string[];
  captainBranchLabel: string | null;
  explanationSummaryLabel: string;
  explanationDetailLabels: string[];
  rejectedCandidateLabels: RejectedCandidateExplanationView[];
  rejectedCandidateGroups: RejectedCandidateGroupView[];
  hasStructuredExplanation: boolean;
  /** The character carries a local edit on this device, which changes what the builder sees. */
  hasLocalOverride: boolean;
  /**
   * 869f63gv6. A selected class, or a leader's class-scoped boost, this unit meets only after a
   * swap into one of its forms - said on the slot, never implied.
   */
  formClassMatch: FormOnlyClassMatch | null;
};

interface AutoTeamDebugReportFeedback {
  tone: 'success' | 'warning';
  title: string;
  details: string[];
  /** The report itself when the clipboard refused it, shown to copy by hand. */
  manualCopyText: string | null;
}

interface RejectedCandidateExplanationView {
  title: string;
  reasonLabels: string[];
  /** The reason that decided, which is what this candidate is grouped and filtered by. */
  groupCode: RejectedCandidateGroupCode;
}

/** One decisive-reason group in the rejected pool, with the count the reader actually reads. */
interface RejectedCandidateGroupView {
  code: RejectedCandidateGroupCode;
  count: number;
  label: string;
}

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

interface RequirementSourceCharacterCardView {
  character: CharacterDetailRecord;
  subtitle: string;
  characterTags: string[];
  characterNames: string[];
}

type PresetImportFeedbackTone = 'success' | 'warning' | 'error';

interface PresetImportFeedback {
  tone: PresetImportFeedbackTone;
  title: string;
  details: string[];
}

interface SimilarManualPickScore {
  character: CharacterDetailRecord;
  hasExactAbilityKeySet: boolean;
  overlapCount: number;
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
  characterTagSets: CharacterTagSetSelection;
  selectedCharacterNames: string[];
  leaderBoostFilters: AutoBuildLeaderBoostFilter[];
  leaderBoostRanges: AutoBuildLeaderBoostRanges;
  leaderCostRange: AutoBuildCostRange;
  subCostRange: AutoBuildCostRange;
  maxTotalCost: number | null;
  requireAllSelectedTypesInTeam: boolean;
  requireAllSelectedClassesPerCharacter: boolean;
  requireAllSelectedCharacterTagsInTeam: boolean;
  requireAllSelectedCharacterNamesInTeam: boolean;
  requireAllSlotsInLeaderSuperEffectScope: boolean;
  requireFullCaptainAbilityCoverage: boolean;
  requireBothLeadersFullCaptainAbilityCoverage: boolean;
  requireSuperSpecialCriteriaCoverage: boolean;
  requireSuperTandemCriteriaCoverage: boolean;
  requireUniqueBaseCharacterNames: boolean;
  favoritesOnly: boolean;
  allowAnyFriendCaptainAutoFill: boolean;
  favoriteShipsOnly: boolean;
}

const AUTO_TEAM_BUILD_BUTTON_LABEL = 'Auto Team Build';
const CHARACTER_PICKER_PAGE_SIZE = 100;
const SIMILAR_MANUAL_PICK_CANDIDATE_LIMIT = 10_000;
const SHIP_PICKER_PAGE_SIZE = 10;
const SHIP_PICKER_SCROLL_LOAD_THRESHOLD_PX = 144;
const GUIDED_AUTO_BUILD_SLOT_ORDER: AutoBuildManualSlotRole[] = [
  'captain',
  'sub1',
  'sub2',
  'sub3',
  'sub4',
  'friendCaptain',
];
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
    characterTagSets: createEmptyCharacterTagSetSelection(),
    selectedCharacterNames: [],
    leaderBoostFilters: [...AUTO_BUILD_LEADER_BOOST_FILTERS],
    leaderBoostRanges: createEmptyAutoBuildLeaderBoostRanges(),
    leaderCostRange: createEmptyAutoBuildCostRange(),
    subCostRange: createEmptyAutoBuildCostRange(),
    maxTotalCost: null,
    requireAllSelectedTypesInTeam: false,
    requireAllSelectedClassesPerCharacter: false,
    requireAllSelectedCharacterTagsInTeam: false,
    requireAllSelectedCharacterNamesInTeam: false,
    requireAllSlotsInLeaderSuperEffectScope: false,
    requireFullCaptainAbilityCoverage: true,
    requireBothLeadersFullCaptainAbilityCoverage: true,
    requireSuperSpecialCriteriaCoverage: true,
    requireSuperTandemCriteriaCoverage: true,
    requireUniqueBaseCharacterNames: true,
    favoritesOnly: false,
    allowAnyFriendCaptainAutoFill: false,
    favoriteShipsOnly: false,
  };
}

function resolveManualSlotRequiredAbilities(
  requirements: AutoBuildAbilityRequirement[],
  role: AutoBuildManualSlotRole,
): AutoBuildAbilityRequirement[] {
  const isLeaderRole = role === 'captain' || role === 'friendCaptain';

  return requirements.filter((requirement) => {
    if (EXTRA_DROP_ABILITY_KEY_SET.has(requirement.abilityKey)) {
      return isLeaderRole;
    }

    const slotScope = normalizeAbilityRequirementSlotScope(requirement.slotScope);
    const sourceScope = normalizeAbilityRequirementSourceScope(requirement.sourceScope);

    if (sourceScope === 'captainAbility') {
      return false;
    }

    return isLeaderRole ? slotScope !== 'sub' : slotScope !== 'leader';
  });
}

@Component({
  selector: 'app-auto-team-builder-page',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonCheckbox,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonInput,
    IonMenuButton,
    IonModal,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToggle,
    IonToolbar,
    AbilityFilterRailComponent,
    AbilityRequirementPickerComponent,
    CaptainTeamConditionStatusComponent,
    TeamCoverageSummaryComponent,
    CharacterAbilityGroupsComponent,
    CharacterTagFilterComponent,
    CharacterTagSetPickerComponent,
    FormClassMarkerComponent,
    AutoTeamBuilderActionsPanelComponent,
    AutoTeamBuilderCandidateCardPanelComponent,
    AutoTeamBuilderControlsPanelComponent,
    AutoTeamBuilderLoadingPanelComponent,
    AutoTeamBuilderManualChipActionsPanelComponent,
    AutoTeamBuilderManualChipPanelComponent,
    AutoTeamBuilderManualChipShipPanelComponent,
    AutoTeamBuilderManualPanelComponent,
    AutoTeamBuilderManualPickerPanelComponent,
    AutoTeamBuilderManualThumbPanelComponent,
    AutoTeamBuilderManualThumbStatePanelComponent,
    AutoTeamBuilderPageStylePanelsComponent,
    AutoTeamBuilderPickerPanelComponent,
    AutoTeamBuilderRequirementsPanelComponent,
    AutoTeamBuilderResultsPanelComponent,
    NgTemplateOutlet,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './auto-team-builder.page.html',
  styleUrl: './auto-team-builder.page.scss',
})
export class AutoTeamBuilderPage implements OnInit, OnDestroy, ViewWillEnter {
  /**
   * 869f138q3. Ionic gives the dialog inside a modal's shadow root no accessible name, so a screen
   * reader announces "dialog" and nothing else. Every `<ion-modal>` in this app binds this on
   * (didPresent); `npm run a11y:modal-labels` fails when one does not.
   */
  public labelModalDialog(event: Event, label: string): void {
    applyIonicModalDialogLabel(event, label);
  }

  @ViewChild(IonContent) private content?: IonContent;
  @ViewChild('buildSubmitButton', { read: ElementRef })
  private readonly buildSubmitButton?: ElementRef<HTMLElement>;
  @ViewChild('debugReportManualCopy')
  private readonly debugReportManualCopy?: ElementRef<HTMLTextAreaElement>;

  private buildAbortController: AbortController | null = null;
  private resetAfterBuildCancellation = false;
  private pauseAfterBuildCancellation = false;
  private destroyed = false;
  private readonly buildProgressNowMs = signal(0);
  private readonly buildProgressSnapshotReceivedAtMs = signal<number | null>(null);
  private readonly currentBuildStepStartedAtMs = signal<number | null>(null);
  private readonly buildProgressFloorPercent = signal(0);
  private progressTicker: ReturnType<typeof globalThis.setInterval> | null = null;
  private buildStartedAtMs: number | null = null;
  /*
   * What the last build was asked, as it was asked (869exmkdp): a report copied later must not pick
   * up a favourite starred since, and with no team there is no requested input on a result.
   */
  private lastBuildRequest: AutoTeamDebugReportRequestSource | null = null;
  private lastBuildContext: AutoTeamDebugReportContext | null = null;
  /** The team a guided build found but could not use - relaxed, or not lockable into its slot. */
  private unappliedGuidedResult: AutoBuildResult | null = null;
  /** Where the last build ran, as the service reported it (869exmmh5). */
  private lastExecutionPath: AutoTeamBuildExecutionPath | null = null;
  /** 869f2608x. Passed to the ability picker so term definitions render in the reader's language. */
  public readonly activeLanguage = () => this.i18n.activeLanguage();
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly ships = signal<ShipRecord[]>([]);
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly availableCharacterTags = signal<string[]>([]);
  /**
   * Source of truth for the character tag filter. The flat list the build
   * engine consumes is derived from it, never written directly, so the AND/OR
   * grouping can never drift out of sync with the tags actually being sent.
   */
  public readonly characterTagSets = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );
  public readonly characterTagSetPickerOpen = signal(false);
  public readonly selectedCharacterTags = computed(() =>
    flattenCharacterTagSets(this.characterTagSets()),
  );
  public readonly selectedCharacterNames = signal<string[]>([]);
  public readonly characterNameDraft = signal('');
  public readonly leaderBoostFilters = signal<AutoBuildLeaderBoostFilter[]>([
    ...AUTO_BUILD_LEADER_BOOST_FILTERS,
  ]);
  public readonly leaderBoostRanges = signal<AutoBuildLeaderBoostRanges>(
    createEmptyAutoBuildLeaderBoostRanges(),
  );
  public readonly leaderCostRange = signal<AutoBuildCostRange>(createEmptyAutoBuildCostRange());
  public readonly subCostRange = signal<AutoBuildCostRange>(createEmptyAutoBuildCostRange());
  public readonly maxTotalCost = signal<number | null>(null);
  public readonly enemyMechanicDrafts = signal<EnemyMechanicDraft[]>([]);
  public readonly enemyMechanicPickerOpen = signal(false);
  public readonly captainAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly captainAbilityPickerOpen = signal(false);
  public readonly requiredAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly abilityPickerOpen = signal(false);
  public readonly crewmateAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly crewmateAbilityPickerOpen = signal(false);
  public readonly potentialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly potentialAbilityPickerOpen = signal(false);
  public readonly supportAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly supportAbilityPickerOpen = signal(false);
  public readonly battleRequirements = signal<AutoBuildBattleRequirement[]>([]);
  public readonly activeRequiredCharacterGroupId = signal<string | null>(null);
  public readonly activeRequiredCharacterBattleId = signal<string | null>(null);
  public readonly activeRequiredCharacterAbilityCategory =
    signal<RequiredCharacterAbilityCategory>('special');
  public readonly requiredCharacterAbilityPickerOpen = signal(false);
  public readonly manualSearchTerm = signal('');
  public readonly requirementSourceSearchTerm = signal('');
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
  public readonly requirementSourceCandidates = signal<CharacterDetailRecord[]>([]);
  public readonly requirementSourceCandidatesLoading = signal(false);
  /** How many of the matching sources the pop-up renders; "Load more" raises it a page at a time. */
  public readonly requirementSourceVisibleCount = signal(CHARACTER_PICKER_PAGE_SIZE);
  /**
   * Every character that can be a requirement source, with the filters it carries - read once per
   * opening of the pop-up. Finding them parses each character's Captain Ability, about 300 ms on a
   * fast desktop for the whole catalogue, and that pass used to run on every keystroke and tag
   * change, as did the same parse again for each of ~350 rendered cards. Local character edits
   * cannot change while the pop-up is open, so one pass per opening stays correct.
   */
  private requirementSourceFilters: Promise<Map<number, AutoBuildCharacterRequirementFilters>> | null =
    null;
  private requirementSourceFiltersById: Map<number, AutoBuildCharacterRequirementFilters> | null =
    null;
  /**
   * Monotonic, and deliberately not reset with the page: a response is only applied if it belongs
   * to the latest request. The repository yields every 250 rows while decorating, so the pop-up's
   * first, unfiltered query used to land after a narrower one typed later and overwrite it.
   */
  private requirementSourceRequestId = 0;
  /*
   * Per-picker candidate tag filters. These only narrow the CANDIDATE LIST the
   * picker in question shows and are deliberately separate from
   * `characterTagSets`, which is the page-level gate demanding the built TEAM
   * cover those tags. Each picker keeps its own selection because the user sets
   * them independently.
   *
   * The ids are the shell's resolved match set: `undefined` means "no filter"
   * and `[]` means "nothing matches" — never conflated. Both are handed straight
   * to `searchDetailedCharacters({ allowedCharacterIds })`, so the gate is
   * applied inside the query, before any limit/offset, and paging plus
   * "load more" keep telling the truth.
   */
  public readonly manualPickerTagSelection = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );
  public readonly manualPickerTagCharacterIds = signal<number[] | undefined>(undefined);
  public readonly excludePickerTagSelection = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );
  public readonly excludePickerTagCharacterIds = signal<number[] | undefined>(undefined);
  public readonly requirementSourceTagSelection = signal<CharacterTagSetSelection>(
    createEmptyCharacterTagSetSelection(),
  );
  public readonly requirementSourceTagCharacterIds = signal<number[] | undefined>(undefined);
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
  public readonly manualPickerModalOpen = signal(false);
  public readonly excludePickerModalOpen = signal(false);
  public readonly pickerDisplayMode = signal<'list' | 'compact'>('compact');
  public readonly isPickerCompactMode = computed(() => this.pickerDisplayMode() === 'compact');
  public readonly requirementSourceModalOpen = signal(false);
  public readonly manualSlots = signal<AutoBuildManualSlotSelection[]>(
    createEmptyAutoBuildManualSlots(),
  );
  public readonly activeManualSlotRole = signal<AutoBuildManualSlotRole>('captain');
  public readonly manualCopyModalOpen = signal(false);
  public readonly manualCopySourceRole = signal<AutoBuildManualSlotRole>('captain');
  public readonly manualCopySelectedCharacterIds = signal<number[]>([]);
  public readonly manualCopyTargetRoles = signal<AutoBuildManualSlotRole[]>([]);
  public readonly lockedCharacterRecords = signal<Record<number, CharacterListItem>>({});
  public readonly excludedCharacterIds = signal<number[]>([]);
  public readonly selectedManualShipId = signal<number | null>(null);
  public readonly requireManualShip = signal(false);
  public readonly excludedShipIds = signal<number[]>([]);
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
  public readonly requireAllSelectedCharacterTagsInTeam = signal(false);
  public readonly requireAllSelectedCharacterNamesInTeam = signal(false);
  public readonly requireAllSlotsInLeaderSuperEffectScope = signal(false);
  public readonly requireFullCaptainAbilityCoverage = signal(true);
  public readonly requireBothLeadersFullCaptainAbilityCoverage = signal(true);
  public readonly requireSuperSpecialCriteriaCoverage = signal(true);
  public readonly requireSuperTandemCriteriaCoverage = signal(true);
  public readonly requireUniqueBaseCharacterNames = signal(true);
  public readonly selectedCharacterBoxId = signal<string | null>(null);
  /** Set when the reader arrived from a box asking what it can build. */
  public readonly loadedCharacterBoxPoolName = signal('');
  public readonly selectedExcludeCharacterBoxId = signal<string | null>(null);
  public readonly favoritesOnly = signal(false);
  public readonly allowAnyFriendCaptainAutoFill = signal(false);
  public readonly guidedAutoBuildEnabled = signal(false);
  /**
   * False until the page has finished loading AND finished the reset that
   * follows it. Every filter control is gated on it.
   *
   * `resetPageState()` wipes every filter signal back to its default, and
   * `ngOnInit` runs it only once the dataset resolves - while the filter panel
   * is rendered and interactive from the first paint. So a reader who pressed
   * anything during the load had it silently undone a moment later. Guided auto
   * build was the visible casualty: flip it while the page is still loading and
   * it switched itself back off.
   *
   * A control that is briefly unavailable while the page loads is honest. One
   * that accepts a press and then quietly discards it is not.
   */
  public readonly pageReady = signal(false);
  /**
   * What every control in the filter panel binds its `disabled` state to.
   *
   * The guard above shipped bound to ONE control - the guided auto build toggle
   * - while its own docstring claimed every filter control was gated on it. The
   * three toggles beside it (favourites only, favourite ships only, allow any
   * Friend Captain auto-fill) reset from the same four lines of
   * `resetPageState()`, so the mechanism was byte-identical and only one of the
   * four wore the guard. Twenty-seven controls bound `[disabled]="building()"`
   * alone, and `building()` is false for the whole of the initial load.
   *
   * Binding one expression rather than repeating the pair is the point: a
   * control added later inherits the guard instead of re-opening the hole, and
   * `auto-team-builder.page.spec.ts` asserts the bare form is gone.
   */
  public readonly controlsDisabled = computed(() => this.building() || !this.pageReady());
  /**
   * Bumped by every resetBuildState(), which is what every build-input mutator calls. A build
   * reads it once it has started and publishes nothing if it moved: the Types and Classes
   * selects were the two filter controls without the guard above, and a change made mid-build
   * put a team built for the old filters under the new ones. Disabling them closes that door;
   * this makes sure the next control that misses the guard cannot reopen it.
   */
  private buildInputRevision = 0;
  /** The revision the running build started from; null when no build is running. */
  private activeBuildInputRevision: number | null = null;
  /** The first load, so `ionViewWillEnter` can wait for it rather than race it. */
  private initialLoad: Promise<void> | null = null;
  public readonly favoriteShipsOnly = signal(false);
  public readonly teamName = signal('');
  public readonly notes = signal('');
  public readonly building = signal(false);
  /**
   * 869f127cc. A provisional team to look at while a long search runs. Replaced only by an attempt
   * earlier in the plan, and dropped the moment the real result lands - it is never the answer, and
   * nothing reads it back into the search.
   */
  public readonly previewResult = signal<AutoBuildResult | null>(null);
  public readonly previewSlotNames = computed(() =>
    (this.previewResult()?.slots ?? []).map((slot) => slot.character.name),
  );
  public readonly buildPaused = signal(false);
  public readonly buildProgress = signal<AutoBuildProgressSnapshot | null>(null);
  public readonly result = signal<AutoBuildResult | null>(null);
  /**
   * 869f2608f. The borrowed leaders this search also considered for the Friend Captain seat.
   *
   * Capped for the card rather than for the data: the engine already limits the leader pool, and a
   * chip row longer than a line stops being a shopping list and becomes a wall. The full list stays
   * on the result for anything that wants it.
   *
   * Deliberately NOT filtered by what the reader owns. A Friend Captain is borrowed from someone
   * else's crew, so their box constrains it in no way - that is the entire point of the seat, and
   * filtering here would quietly undo it.
   */
  public readonly friendCaptainAlternatives = computed(() =>
    (this.result()?.friendCaptainAlternatives ?? []).slice(0, 5),
  );

  /**
   * 869f1k107. How many stages the reader expects to fight, and the two cooldown columns for the
   * built team.
   *
   * The turn count cannot come from the dataset - its whole schema is seven tables and none is a
   * stage table - so it is one field the reader enters, which 869f12xbm established up front.
   */
  /**
   * 869f1mcdv. Which mode the reader is about to play, so the team can be read against it.
   *
   * `null` is "not asked", and the card stays away entirely - the app has never had a notion of a
   * game mode, and appearing unasked on every build would be a claim that the mode shaped the
   * result. It did not, and the card says so in as many words.
   */
  public readonly selectedGameMode = signal<GameMode | null>(null);
  /**
   * 869f1q90b. The reader's own boosted-unit list. Hand-entered because there is no boost data in
   * the dataset at all, and it steers RANKING rather than legality - a boosted character is
   * preferred among candidates the search would have accepted anyway.
   */
  public readonly boostedCharacterIds;
  public readonly boostedTeamMemberIds = computed(() => {
    const boosted = new Set(this.boostedCharacterIds());

    return (this.result()?.slots ?? [])
      .map((slot) => slot.character.id)
      .filter((characterId) => boosted.has(characterId));
  });
  public readonly availableGameModes = GAME_MODES;
  public readonly teamModeEffects = computed<TeamModeEffects | null>(() =>
    buildTeamModeEffects(this.result(), this.selectedGameMode()),
  );

  public readonly timelineTurns = signal(DEFAULT_TIMELINE_TURNS);
  /**
   * 869f63gm7. The cut the reader's event gives at the start - a Treasure Map booster's 10, say -
   * whether it reaches the whole team rather than only the Boosted list, and whether to count what
   * Limit Break unlocks. All three are the reader's to say: the dataset carries no event data, and
   * the app never assumes investment (869f13c8m), so the last one starts off.
   */
  public readonly timelineEventCut = signal(0);
  public readonly timelineEventCutWholeTeam = signal(false);
  public readonly timelineCountLimitBreak = signal(false);
  private readonly specialCooldowns = signal<ReadonlyMap<number, SpecialCooldownRecord>>(new Map());
  public readonly specialChargeTimeline = computed<SpecialChargeTimeline | null>(() =>
    buildSpecialChargeTimeline(
      this.result(),
      this.timelineTurns(),
      this.specialCooldowns(),
      buildStartOfQuestCutsBySlot(this.result(), {
        eventCutTurns: this.timelineEventCut(),
        eventCutWholeTeam: this.timelineEventCutWholeTeam(),
        boostedCharacterIds: this.boostedCharacterIds(),
        countLimitBreak: this.timelineCountLimitBreak(),
      }),
    ),
  );
  public readonly errorMessage = signal('');
  /** Why the last build shows no team, as a code the debug report can carry (869exmkf4). */
  public readonly lastBuildFailure = signal<AutoTeamBuildFailureCode | null>(null);
  /**
   * Issue #523. WHICH requirement the last failed search had no candidate for, as opposed to which
   * requirements it was given. Null until a search fails, and null again the moment an input moves.
   */
  public readonly lastBuildInfeasibility = signal<AutoBuildInfeasibilityDiagnosis | null>(null);
  /*
   * 869f333ey (D5). The Captain the search found when the pinned one provably could not lead the
   * crew. Guided mode rejects that team like any relaxed one - but it knows exactly what to offer,
   * so the failure card offers it: one click puts this Captain in the slot, and the next build
   * keeps every other setting the reader chose.
   */
  private readonly unappliedReplacedCaptain = signal<AutoBuildReplacedCaptain | null>(null);
  public readonly proposedCaptain = computed(() =>
    this.lastBuildFailure() === 'guidedRelaxedOnly' && this.errorMessage()
      ? this.unappliedReplacedCaptain()
      : null,
  );
  /**
   * 869f138r7. The characters in this result whose data the dataset marks as incomplete.
   *
   * They are NOT excluded from a build, and that is the deliberate half of this: nothing in the
   * shipped dataset sets the flag, so an incomplete character is almost always one the reader added
   * or edited themselves, and silently refusing to use it would be the app second-guessing them.
   * What was missing is the other half - saying so once one lands in a team, which the debug report
   * already did for a maintainer and nothing did for the player.
   */
  public readonly incompleteResultCharacterNames = computed(() => {
    const slots = this.result()?.slots ?? [];

    return [
      ...new Set(
        slots
          .filter((slot) => slot.character.isIncomplete)
          .map((slot) => slot.character.name),
      ),
    ];
  });

  /** The last build's timings, kept once it ends rather than dropped with the progress (869exmkep). */
  public readonly lastBuildStats = signal<AutoTeamBuildStats | null>(null);
  public readonly debugReportFeedback = signal<AutoTeamDebugReportFeedback | null>(null);
  public readonly debugReportIssueUrl = AUTO_TEAM_DEBUG_REPORT_ISSUE_URL;
  public readonly currentTeamId = signal<string | null>(null);
  public readonly saveUiLocked = signal(false);
  public readonly saveFeedbackError = signal('');
  public readonly candidatePoolBoxCreationPending = signal(false);
  public readonly favoriteCharacterIds;
  public readonly favoriteShipIds;
  public readonly characterBoxes;
  public readonly savedTeams;
  public readonly autoTeamBuilderWorkerPreference;
  public readonly autoTeamBuilderWorkerRuntime;
  public readonly autoTeamBuilderAvailableWorkerCounts;
  public readonly presetImportFeedback = signal<PresetImportFeedback | null>(null);
  public readonly candidatePoolBoxFeedback = signal<PresetImportFeedback | null>(null);
  public readonly compareStorageFeedback = signal<PresetImportFeedback | null>(null);
  public readonly manualSimilarPickFeedback = signal('');
  public readonly loadedEnemyPresetName = signal<string | null>(null);
  /**
   * 869f63gma. The avoid and prefer rules the loaded Saved Enemy (or preset) brought with it. Set
   * only by a preset, cleared by a reset or by the reader, and sent with every build.
   */
  private readonly avoidPreferRules = signal<AutoBuildAvoidPreferRules>(
    createEmptyAvoidPreferRules(),
  );
  public readonly openExplanationSlotKeys = signal<ReadonlySet<string>>(new Set());
  /**
   * Which decisive-reason group each slot's rejected list is narrowed to, keyed by the slot's
   * track key. Absent means the whole pool, which is the state every slot starts in - a filter
   * nobody asked for would hide candidates the reader opened the panel to see.
   */
  public readonly selectedRejectedGroupBySlotKey = signal<
    ReadonlyMap<string, RejectedCandidateGroupCode>
  >(new Map());
  public readonly compareModeOpen = signal(false);
  public readonly compareSides = AUTO_TEAM_COMPARE_SIDES;
  public readonly compareSidePayloads = signal<
    Record<AutoTeamCompareSide, AutoTeamCompareSidePayload>
  >({
    a: createAutoTeamCompareSidePayload('current'),
    b: createAutoTeamCompareSidePayload('current'),
  });
  private readonly compareRequestTokens: Record<AutoTeamCompareSide, number> = { a: 0, b: 0 };
  public readonly compareDiff = computed<AutoTeamCompareDiff | null>(() => {
    const left = this.resolveCompareSideSnapshot('a');
    const right = this.resolveCompareSideSnapshot('b');

    return left && right ? buildAutoTeamCompareDiff(left, right) : null;
  });

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly availableLeaderBoostFilters = AUTO_BUILD_LEADER_BOOST_FILTERS;
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
      ...(normalizeAbilityRequirementSlotScope(requirement.slotScope) !== 'any'
        ? { slotScope: normalizeAbilityRequirementSlotScope(requirement.slotScope) }
        : {}),
      ...(normalizeAbilityRequirementSourceScope(requirement.sourceScope)
        ? { sourceScope: normalizeAbilityRequirementSourceScope(requirement.sourceScope)! }
        : {}),
      ...(normalizeAbilityRequirementEffectValue(requirement.minEffectValue) !== null
        ? { minEffectValue: normalizeAbilityRequirementEffectValue(requirement.minEffectValue)! }
        : {}),
      ...(normalizeAbilityEffectTargetScope(requirement.effectTargetScope) !== 'any'
        ? { effectTargetScope: normalizeAbilityEffectTargetScope(requirement.effectTargetScope) }
        : {}),
    })),
  }));
  public readonly availableAbilityCatalogItems = computed(
    () => this.abilityCatalog()?.abilities ?? [],
  );
  public readonly currentCompareSnapshot = computed<AutoTeamCompareSnapshot | null>(() => {
    const current = this.result();

    return current
      ? buildAutoTeamCompareSnapshotFromCurrent(
          current,
          current.shipSelection?.ship ?? null,
          this.availableAbilityCatalogItems(),
        )
      : null;
  });
  public readonly availableSpecialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.availableAbilityCatalogItems(), 'special'),
  );
  public readonly availableCaptainAbilityCatalogItems = computed<AutoBuildAbilityCatalogItem[]>(
    () => getCaptainAbilityCatalogItems(this.availableAbilityCatalogItems()),
  );
  public readonly availableCrewmateAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.availableAbilityCatalogItems(), 'crewmate'),
  );
  public readonly availablePotentialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.availableAbilityCatalogItems(), 'potential'),
  );
  public readonly availableSupportAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.availableAbilityCatalogItems(), 'support'),
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
  public readonly pageRequiredAbilities = computed(() => this.serializeManualRequiredAbilities());
  public readonly pageBattleRequirements = computed(() =>
    cloneBattleRequirements(this.battleRequirements()),
  );
  public readonly pageRequiredCharacterGroups = computed(() =>
    flattenBattleRequiredCharacterGroups(this.pageBattleRequirements()),
  );
  public readonly hasSelectedClasses = computed(() => this.selectedClasses().length > 0);
  public readonly hasSelectedTypes = computed(() => this.selectedTypes().length > 0);
  public readonly hasSelectedCharacterTags = computed(
    () => this.selectedCharacterTags().length > 0,
  );
  public readonly hasSelectedCharacterNames = computed(
    () => this.selectedCharacterNames().length > 0,
  );
  public readonly hasRequiredAbilities = computed(() => this.pageRequiredAbilities().length > 0);
  public readonly specialFilterCharacterIds = computed(() =>
    resolveSpecialAbilityMatchingCharacterIds(
      this.pageRequiredAbilities(),
      this.availableSpecialAbilityCatalogItems(),
    ),
  );
  public readonly crewmateFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.pageRequiredAbilities(),
      this.availableCrewmateAbilityCatalogItems(),
      'crewmate',
    ),
  );
  public readonly potentialFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.pageRequiredAbilities(),
      this.availablePotentialAbilityCatalogItems(),
      'potential',
    ),
  );
  public readonly supportFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.pageRequiredAbilities(),
      this.availableSupportAbilityCatalogItems(),
      'support',
    ),
  );
  public readonly abilityFilterCharacterIds = computed(() =>
    intersectAbilityMatchingCharacterIds([
      this.specialFilterCharacterIds(),
      this.crewmateFilterCharacterIds(),
      this.potentialFilterCharacterIds(),
      this.supportFilterCharacterIds(),
    ]),
  );
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
  public readonly captainAbilitySummaryChips = computed<AbilityRequirementSummaryChipView[]>(() =>
    this.captainAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly captainLeaderBoostSummaryChips = computed<AbilityRequirementSummaryChipView[]>(
    () => {
      const chips: AbilityRequirementSummaryChipView[] = [];
      const filters = this.leaderBoostFilters();
      const ranges = this.leaderBoostRanges();

      if (!(filters.includes('HP') && filters.includes('ATK'))) {
        chips.push({
          draftId: 'leader-boost-priority',
          label: this.t('captainAbilityFilters.leaderBoost.priorityChip', {
            priority: this.leaderBoostFiltersLabel(),
          }),
          visual: resolveAbilityRequirementVisual('captain_leader_boost_priority'),
        });
      }

      if (this.hasActiveLeaderBoostRange(ranges.ATK)) {
        chips.push({
          draftId: 'leader-boost-atk',
          label: this.formatLeaderBoostRangeSummary('ATK', ranges.ATK),
          visual: resolveAbilityRequirementVisual('captain_atk_boost'),
        });
      }

      if (this.hasActiveLeaderBoostRange(ranges.HP)) {
        chips.push({
          draftId: 'leader-boost-hp',
          label: this.formatLeaderBoostRangeSummary('HP', ranges.HP),
          visual: resolveAbilityRequirementVisual('captain_hp_boost'),
        });
      }

      return chips;
    },
  );
  public readonly captainFilterSummaryChips = computed<AbilityRequirementSummaryChipView[]>(() => [
    ...this.captainAbilitySummaryChips(),
    ...this.captainLeaderBoostSummaryChips(),
  ]);
  public readonly requiredAbilitySummaryChips = computed<AbilityRequirementSummaryChipView[]>(() =>
    this.requiredAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly crewmateAbilitySummaryChips = computed<AbilityRequirementSummaryChipView[]>(() =>
    this.crewmateAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly potentialAbilitySummaryChips = computed<AbilityRequirementSummaryChipView[]>(() =>
    this.potentialAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly supportAbilitySummaryChips = computed<AbilityRequirementSummaryChipView[]>(() =>
    this.supportAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly requiredBattleViews = computed<RequiredBattleView[]>(() =>
    this.battleRequirements().map((battle, battleIndex) => ({
      battle,
      title: battle.title || this.t('requiredCharacters.battleTitle', { index: battleIndex + 1 }),
      requiredCharacterCount: battle.requiredCharacterGroups.length,
      groupViews: battle.requiredCharacterGroups.map((group, groupIndex) => ({
        battleId: battle.id,
        group,
        title: this.t('requiredCharacters.cardTitle', { index: groupIndex + 1 }),
        abilityCount: group.abilities.length,
        chips: group.abilities.map((requirement, abilityIndex) => ({
          draftId: `${battle.id}-${group.id}-${abilityIndex}`,
          label: this.formatAbilityRequirement(requirement),
          visual: resolveAbilityRequirementVisual(requirement.abilityKey),
        })),
      })),
    })),
  );
  public readonly canAddBattleRequirement = computed(
    () => !this.building() && this.battleRequirements().length < MAX_AUTO_BUILD_BATTLE_COUNT,
  );
  public readonly activeRequiredCharacterGroup = computed(() => {
    const activeBattleId = this.activeRequiredCharacterBattleId();
    const activeGroupId = this.activeRequiredCharacterGroupId();

    return (
      this.battleRequirements()
        .find((battle) => !activeBattleId || battle.id === activeBattleId)
        ?.requiredCharacterGroups.find((group) => group.id === activeGroupId) ?? null
    );
  });
  public readonly activeRequiredCharacterAbilityDrafts = computed(() =>
    createAbilityRequirementDrafts(
      this.activeRequiredCharacterGroup()?.abilities.filter(
        (requirement) =>
          this.resolveAbilityCatalogItem(requirement.abilityKey)?.category ===
            this.activeRequiredCharacterAbilityCategory() &&
          !isCaptainAbilityRequirement(requirement),
      ) ?? [],
    ),
  );
  public readonly activeRequiredCharacterCatalogItems = computed(() => {
    switch (this.activeRequiredCharacterAbilityCategory()) {
      case 'crewmate':
        return this.availableCrewmateAbilityCatalogItems();
      case 'potential':
        return this.availablePotentialAbilityCatalogItems();
      case 'support':
        return this.availableSupportAbilityCatalogItems();
      default:
        return this.availableSpecialAbilityCatalogItems();
    }
  });
  public readonly activeRequiredCharacterPickerTitle = computed(() =>
    this.t(`requiredCharacters.categories.${this.activeRequiredCharacterAbilityCategory()}`),
  );
  public readonly hasLoadedEnemyPreset = computed(() => Boolean(this.loadedEnemyPresetName()));
  /** 869f63gma. The active rules in the report's own words, so the page says them before a build. */
  public readonly avoidPreferRulesLabel = computed(() =>
    this.describeAvoidPreferRules(this.avoidPreferRules(), [], []),
  );
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
      .filter((character): character is CharacterListItem => character !== undefined);
  });
  public readonly excludedCharacters = computed(() => {
    const cachedRecords = this.lockedCharacterRecords();

    return this.excludedCharacterIds()
      .map((characterId) => cachedRecords[characterId])
      .filter((character): character is CharacterListItem => character !== undefined);
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
  /**
   * The Friend Captain the reader actually picked, with no fallback.
   *
   * `effectiveFriendLeaderId` above falls back to the Captain, which is right
   * for the two places that consume it - `selectedLeaderIds` dedupes, and the
   * candidate-pool coverage filter treats a duplicated leader entry as one - but
   * wrong for anything that RECORDS the selection. With the Captain slot filled
   * and the Friend Captain slot left empty, the exported preset said
   * `friendCaptainLeaderId: <captainId>` and labelled the Captain `'dual'`,
   * while `manualSlots` in the same file correctly showed that seat empty. The
   * file disagreed with itself about a rule the owner has stated: an empty seat
   * boosts nothing, and is never inferred by comparing the two seats.
   */
  public readonly selectedFriendLeaderId = computed(
    () => this.resolveManualSlotSelection('friendCaptain').characterIds[0] ?? null,
  );
  public readonly manualSelectionCount = computed(() =>
    this.manualSlots().reduce((count, slot) => count + slot.characterIds.length, 0),
  );
  public readonly manualSlotCards = computed<ManualSlotCardView[]>(() => {
    const lockedRecords = this.lockedCharacterRecords();

    return this.manualSlots().map((slot) => ({
      role: slot.role,
      title: this.getManualSlotTitle(slot.role),
      support: this.getManualSlotSupport(slot.role, slot.characterIds.length),
      requiredCharacterId: slot.requiredCharacterId ?? null,
      selectedCharacters: slot.characterIds
        .map((characterId) => lockedRecords[characterId])
        .filter((character): character is CharacterListItem => character !== undefined)
        .map((character) => ({
          ...character,
          isRequiredInManualSlot: character.id === slot.requiredCharacterId,
          branchLabel: this.resolveManualSlotCharacterBranchLabel(slot.role, character),
          supportOnly: isSupportOnlyCharacter(character),
        })),
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
  public readonly manualCopySourceCharacters = computed<ManualCopyCharacterView[]>(() => {
    const sourceIds = this.resolveManualSlotSelection(this.manualCopySourceRole()).characterIds;
    const selectedIdSet = new Set(this.manualCopySelectedCharacterIds());
    const lockedRecords = this.lockedCharacterRecords();

    return sourceIds
      .map((characterId) => lockedRecords[characterId])
      .filter((character): character is CharacterListItem => Boolean(character))
      .map((character) => ({
        character,
        selected: selectedIdSet.has(character.id),
      }));
  });
  public readonly manualCopySourceSlotTitle = computed(
    () =>
      this.manualSlotCards().find((slotCard) => slotCard.role === this.manualCopySourceRole())
        ?.title ?? '',
  );
  public readonly manualCopyTargetSlots = computed<ManualCopyTargetSlotView[]>(() => {
    const sourceRole = this.manualCopySourceRole();
    const selectedTargetRoleSet = new Set(this.manualCopyTargetRoles());

    return this.manualSlotCards().map((slotCard) => ({
      role: slotCard.role,
      title: slotCard.title,
      support: slotCard.support,
      selectedCharacters: slotCard.selectedCharacters,
      selected: selectedTargetRoleSet.has(slotCard.role),
      isSource: slotCard.role === sourceRole,
    }));
  });
  public readonly manualCopyApplyDisabled = computed(
    () =>
      this.building() ||
      this.manualCopySourceCharacters().length === 0 ||
      this.manualCopySelectedCharacterIds().length === 0 ||
      this.manualCopyTargetRoles().length === 0,
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
  public readonly selectedExcludeCharacterBox = computed<CharacterBox | null>(
    () =>
      this.characterBoxes().find(
        (characterBox: CharacterBox) => characterBox.id === this.selectedExcludeCharacterBoxId(),
      ) ?? null,
  );
  public readonly selectedExcludeCharacterBoxIds = computed(
    () => this.selectedExcludeCharacterBox()?.characterIds ?? [],
  );
  public readonly effectiveExcludedCharacterIds = computed(() => [
    ...new Set([...this.excludedCharacterIds(), ...this.selectedExcludeCharacterBoxIds()]),
  ]);
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
      this.controlsDisabled() ||
      this.buildBlockedByCharacterScope() ||
      this.buildBlockedByFavorites() ||
      this.hasInvalidLeaderBoostRanges(),
  );
  /**
   * Why Build is off, said under it (869exmktc). The button used to grey out without a word for no
   * types, no classes or an inverted Captain boost range - that range's own error line was computed
   * and never rendered. The favourites and box blocks already have a warning above the manual
   * slots, and a running or loading page needs none.
   */
  public readonly buildDisabledReason = computed(() => {
    if (
      this.controlsDisabled() ||
      this.buildBlockedByCharacterScope() ||
      this.buildBlockedByFavorites()
    ) {
      return '';
    }

    if (!this.hasSelectedTypes()) {
      return this.t('filters.types.required');
    }

    if (!this.hasSelectedClasses()) {
      return this.t('filters.classes.required');
    }

    return this.leaderBoostRangeErrorLabel();
  });
  /** The one tap that fixes the reason under Build, when there is one (869exmkbe). */
  public readonly buildDisabledFix = computed<'types' | 'classes' | null>(() => {
    if (
      this.controlsDisabled() ||
      this.buildBlockedByCharacterScope() ||
      this.buildBlockedByFavorites()
    ) {
      return null;
    }

    if (!this.hasSelectedTypes()) {
      return 'types';
    }

    return this.hasSelectedClasses() ? null : 'classes';
  });
  /**
   * The hero's status line (869exmkr2): ready to build, or the one thing missing, plus how many
   * slots are locked - said at the top instead of only under Build, far down the page.
   */
  public readonly buildReadinessLabel = computed(() => {
    if (!this.pageReady()) {
      return '';
    }

    // Said, not hidden, while a team is being built: the hero row does not reflow at start and end.
    if (this.building()) {
      return this.t('hero.meta.building');
    }

    if (!this.buildDisabled()) {
      return this.t('hero.meta.ready');
    }

    if (!this.hasSelectedTypes()) {
      return this.t('hero.meta.needsType');
    }

    if (!this.hasSelectedClasses()) {
      return this.t('hero.meta.needsClass');
    }

    if (this.hasInvalidLeaderBoostRanges()) {
      return this.t('hero.meta.needsBoostRange');
    }

    // Favourites-only or a character box that leaves nobody: the warning sits above the slots.
    return this.t('hero.meta.blocked');
  });
  public readonly lockedSlotsLabel = computed(() =>
    this.t('hero.meta.lockedSlots', {
      count: this.manualSlots().filter((slot) => slot.characterIds.length > 0).length,
      total: this.manualSlots().length,
    }),
  );
  /**
   * The first-visit "How this page works" card (869exmkpw; owner, 2026-09-11: on both builders,
   * inline, shown until dismissed). A handoff - a saved team or enemy opened here - already knows
   * what it wants, so the card stays out of its way for that visit.
   */
  public readonly introOpenedFromHandoff = signal(false);
  private readonly introShownOnRequest = signal(false);
  public readonly introVisible = computed(
    () => this.pageReady() && !this.introOpenedFromHandoff(),
  );
  public readonly introExpanded = computed(
    () => !this.userState.builderIntroDismissed().autoTeamBuilder || this.introShownOnRequest(),
  );
  /**
   * True until the player changes a build input on this visit, and again after a page reset.
   * Every such change - a pick, a filter, a rule, an exclude, a toggle, a box, an import, a build
   * itself - goes through `resetBuildState()`, which clears it. Searching and opening pickers
   * change no input, so they leave it alone.
   */
  private readonly buildInputsUntouched = signal(false);
  /**
   * Quick start (869exmkam; owner, 2026-09-11): shortcuts into flows that already exist - never
   * shipped preset teams, which go stale with every nightly data release and cannot know the
   * player's box. Offered only on a fresh page: gone with the first change the player makes, a
   * build started, paused or failed included, and never offered on a handoff.
   */
  public readonly quickStartVisible = computed(
    () => this.pageReady() && !this.introOpenedFromHandoff() && this.buildInputsUntouched(),
  );
  /**
   * Compact by default (869exmkqr; owner, 2026-09-11): these three sections start collapsed only
   * while they hold nothing, and a section with active rules is never hidden - it has no toggle.
   * Collapsing hides the explanation and the empty note; the summary and every button stay. A
   * section the player has worked in this visit stays open when they empty it, rather than
   * closing under the pointer.
   */
  private readonly expandedEmptySections = signal<ReadonlySet<AutoTeamBuilderCollapsibleSection>>(
    new Set(),
  );
  public readonly captainFiltersSectionEmpty = computed(
    () => this.captainFilterSummaryChips().length === 0,
  );
  // Every visit starts with one placeholder battle, so "empty" means no battle holds a character.
  public readonly requiredCharactersSectionEmpty = computed(() =>
    this.battleRequirements().every((battle) => battle.requiredCharacterGroups.length === 0),
  );
  public readonly excludeSectionEmpty = computed(
    () =>
      !this.hasExcludedCharacters() &&
      !this.hasExcludedShips() &&
      this.selectedExcludeCharacterBoxId() === null,
  );
  public readonly captainFiltersSectionExpanded = computed(
    () => !this.captainFiltersSectionEmpty() || this.expandedEmptySections().has('captainFilters'),
  );
  public readonly requiredCharactersSectionExpanded = computed(
    () =>
      !this.requiredCharactersSectionEmpty() ||
      this.expandedEmptySections().has('requiredCharacters'),
  );
  public readonly excludeSectionExpanded = computed(
    () => !this.excludeSectionEmpty() || this.expandedEmptySections().has('exclude'),
  );
  public readonly hasStrictFilters = computed(() => this.requireAllSlotsInLeaderSuperEffectScope());
  public readonly allClassesSelected = computed(
    () =>
      this.availableClasses().length > 0 &&
      this.selectedClasses().length === this.availableClasses().length,
  );
  public readonly allTypesSelected = computed(
    () => this.selectedTypes().length === this.availableTypes.length,
  );
  public readonly derivedRequireAllSelectedTypesInTeam = computed(() =>
    this.shouldRequireExactSelectedTypeCoverage(),
  );
  /**
   * Team-level coverage stays the semantic (a tag counts as satisfied when ANY
   * slot carries it), but the strictness is now the user's choice instead of
   * being force-enabled the moment a tag is picked.
   *
   * The engine only understands "cover every selected tag" or "treat them as
   * relaxable preferences", so a selection maps to strict only when it really
   * means AND across every tag. A set of one tag is AND and OR at once, hence
   * the length check — without it, picking a single tag (by far the common
   * case) would silently become a soft preference on the `'any'` default.
   */
  public readonly derivedRequireAllSelectedCharacterTagsInTeam = computed(() => {
    const selection = this.characterTagSets();
    const populatedSets = selection.sets.filter((set) => set.tags.length > 0);

    if (!populatedSets.length) {
      return false;
    }

    const everySetIsConjunctive = populatedSets.every(
      (set) => set.operator === 'all' || set.tags.length === 1,
    );

    return populatedSets.length === 1
      ? everySetIsConjunctive
      : everySetIsConjunctive && selection.operator === 'all';
  });
  public readonly derivedRequireAllSelectedCharacterNamesInTeam = computed(
    () => this.selectedCharacterNames().length > 0,
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
  public readonly leaderBoostFiltersLabel = computed(() =>
    this.leaderBoostFilters()
      .map((filter) => this.t(`filters.leaderBoost.options.${filter}`))
      .join(' / '),
  );
  public readonly leaderBoostSupportLabel = computed(() => {
    const filters = this.leaderBoostFilters();

    if (filters.length === 1 && filters[0] === 'HP') {
      return this.t('filters.leaderBoost.support.hp');
    }

    if (filters.length === 1 && filters[0] === 'ATK') {
      return this.t('filters.leaderBoost.support.atk');
    }

    return this.t('filters.leaderBoost.support.average');
  });
  public readonly hasInvalidLeaderBoostRanges = computed(() =>
    AUTO_BUILD_LEADER_BOOST_FILTERS.some((filter) => {
      const range = this.leaderBoostRanges()[filter];

      return range.min !== null && range.max !== null && range.min > range.max;
    }),
  );
  public readonly leaderBoostRangeErrorLabel = computed(() =>
    this.hasInvalidLeaderBoostRanges() ? this.t('filters.leaderBoost.range.invalid') : '',
  );
  public readonly hasActiveLeaderCostRange = computed(() =>
    this.hasActiveCostRange(this.leaderCostRange()),
  );
  public readonly hasActiveSubCostRange = computed(() =>
    this.hasActiveCostRange(this.subCostRange()),
  );
  public readonly hasActiveCostRanges = computed(
    () => this.hasActiveLeaderCostRange() || this.hasActiveSubCostRange(),
  );
  public readonly hasInvalidLeaderCostRange = computed(() =>
    this.hasInvalidCostRange(this.leaderCostRange()),
  );
  public readonly hasInvalidSubCostRange = computed(() =>
    this.hasInvalidCostRange(this.subCostRange()),
  );
  public readonly hasInvalidCostRanges = computed(
    () => this.hasInvalidLeaderCostRange() || this.hasInvalidSubCostRange(),
  );
  public readonly hasActiveMaxTotalCost = computed(() => this.maxTotalCost() !== null);
  public readonly manualTeamBudgetCost = computed(() =>
    this.resolveManualSlotsBudgetCost(this.manualSlots()),
  );
  public readonly manualTeamRemainingCost = computed(() =>
    this.resolveRemainingCostValue(this.manualTeamBudgetCost()),
  );
  public readonly manualTeamCostBudgetSupportLabel = computed(() =>
    this.hasActiveMaxTotalCost()
      ? this.t('filters.totalCost.support.active', {
          used: this.manualTeamBudgetCost(),
          remaining: this.manualTeamRemainingCost(),
          max: this.maxTotalCost() ?? 0,
        })
      : this.t('filters.totalCost.support.default'),
  );
  public readonly manualTeamCostBudgetErrorLabel = computed(() =>
    this.maxTotalCost() !== null && this.manualTeamBudgetCost() > this.maxTotalCost()!
      ? this.t('filters.totalCost.range.overBudget', {
          used: this.manualTeamBudgetCost(),
          max: this.maxTotalCost()!,
        })
      : '',
  );
  public readonly leaderCostRangeSupportLabel = computed(() =>
    this.hasActiveLeaderCostRange()
      ? this.t('filters.cost.leaders.support.active')
      : this.t('filters.cost.leaders.support.default'),
  );
  public readonly subCostRangeSupportLabel = computed(() =>
    this.hasActiveSubCostRange()
      ? this.t('filters.cost.subs.support.active')
      : this.t('filters.cost.subs.support.default'),
  );
  public readonly leaderCostRangeErrorLabel = computed(() =>
    this.hasInvalidLeaderCostRange() ? this.t('filters.cost.leaders.range.invalid') : '',
  );
  public readonly subCostRangeErrorLabel = computed(() =>
    this.hasInvalidSubCostRange() ? this.t('filters.cost.subs.range.invalid') : '',
  );
  /**
   * The rule each selection applies, said under its select. It used to be a visible toggle; once
   * the strictness was derived from the selection it was said nowhere, and a player picking three
   * classes could not know every unit had to hold all three.
   */
  public readonly typeSupportLabel = computed(() => {
    if (this.derivedRequireAllSelectedTypesInTeam()) {
      return this.t('filters.types.support.strict');
    }

    // "All selected" is no filter at all - said, so deselecting one reads as the change it is.
    return this.allTypesSelected() ? this.t('filters.types.support.all') : '';
  });
  public readonly classSupportLabel = computed(() => {
    if (!this.hasSelectedClasses()) {
      return '';
    }

    return this.allClassesSelected()
      ? this.t('filters.classes.support.all')
      : this.t('filters.classes.support.flexible');
  });
  public readonly characterTagSupportLabel = computed(() =>
    this.derivedRequireAllSelectedCharacterTagsInTeam()
      ? this.t('filters.characterTags.support.strict')
      : this.t('filters.characterTags.support.flexible'),
  );
  /** One chip per populated set, reading "Straw Hat Pirates or Heart Pirates". */
  public readonly characterTagSetGroups = computed(() =>
    this.characterTagSets()
      .sets.filter((set) => set.tags.length > 0)
      .map((set) => ({
        id: set.id,
        label: set.tags.join(
          set.operator === 'all'
            ? this.t('filters.characterTags.sets.joinAll')
            : this.t('filters.characterTags.sets.joinAny'),
        ),
      })),
  );
  public readonly characterTagSetSummaryLabel = computed(() => {
    const selection = this.characterTagSets();
    const tagCount = countCharacterTagSetTags(selection);

    if (!tagCount) {
      return this.t('filters.characterTags.sets.empty');
    }

    const setCount = countPopulatedCharacterTagSets(selection);

    if (setCount < 2) {
      return this.t('filters.characterTags.sets.summarySingleGroup', { tags: tagCount });
    }

    return this.t(
      selection.operator === 'all'
        ? 'filters.characterTags.sets.summaryAllGroups'
        : 'filters.characterTags.sets.summaryAnyGroup',
      { tags: tagCount, groups: setCount },
    );
  });
  public readonly characterTagSetTriggerLabel = computed(() =>
    countCharacterTagSetTags(this.characterTagSets())
      ? this.t('filters.characterTags.sets.edit')
      : this.t('filters.characterTags.sets.open'),
  );
  public readonly characterNameSupportLabel = computed(() =>
    this.t('filters.characterNames.support.flexible'),
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
      characters: this.effectiveExcludedCharacterIds().length,
      ships: this.excludedShipIds().length,
    }),
  );
  public readonly selectedExcludeCharacterBoxLabel = computed(
    () => this.selectedExcludeCharacterBox()?.name ?? this.t('exclude.characterBox.none'),
  );
  public readonly excludeCharacterBoxSupportLabel = computed(() => {
    const characterBox = this.selectedExcludeCharacterBox();

    if (!characterBox) {
      return this.t('exclude.characterBox.support.default');
    }

    if (this.selectedExcludeCharacterBoxIds().length === 0) {
      return this.t('exclude.characterBox.support.empty', {
        name: characterBox.name,
      });
    }

    return this.t('exclude.characterBox.support.selected', {
      name: characterBox.name,
      count: this.selectedExcludeCharacterBoxIds().length,
    });
  });
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
  public readonly requirementSourceCandidateCards = computed<RequirementSourceCharacterCardView[]>(
    () =>
      this.requirementSourceCandidates()
        .slice(0, this.requirementSourceVisibleCount())
        .map((character) => {
          // Read by the pass that found the sources, which always lands before the candidates.
          const requirements =
            this.requirementSourceFiltersById?.get(character.id) ??
            extractAutoBuildCharacterRequirementFilters(character);

          return {
            character,
            subtitle: this.buildCharacterSubtitle(character),
            characterTags: requirements.characterTags,
            characterNames: requirements.characterNames,
          };
        }),
  );
  public readonly requirementSourceCandidatesSummaryLabel = computed(() =>
    this.t('filters.characterRequirements.modal.count', {
      count: this.requirementSourceCandidates().length,
    }),
  );
  public readonly requirementSourceCandidatesHasMore = computed(
    () => this.requirementSourceCandidates().length > this.requirementSourceVisibleCount(),
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
  public readonly characterTagStrictToggleLabel = computed(() =>
    this.t('filters.characterTags.toggle'),
  );
  public readonly characterNameStrictToggleLabel = computed(() =>
    this.t('filters.characterNames.toggle'),
  );
  public readonly leaderSuperEffectScopeToggleLabel = computed(() =>
    this.t('filters.leaderSuperEffectScope.toggle'),
  );
  public readonly favoritesOnlyToggleLabel = computed(() => this.t('filters.favoritesOnly.toggle'));
  public readonly allowAnyFriendCaptainAutoFillToggleLabel = computed(() =>
    this.t('filters.allowAnyFriendCaptainAutoFill.toggle'),
  );
  public readonly allowAnyFriendCaptainAutoFillSupportLabel = computed(() =>
    this.t('filters.allowAnyFriendCaptainAutoFill.support'),
  );
  public readonly guidedAutoBuildToggleLabel = computed(() =>
    this.t('filters.guidedAutoBuild.toggle'),
  );
  public readonly guidedAutoBuildSupportLabel = computed(() => {
    const nextRole = this.resolveNextGuidedAutoBuildSlotRole();

    return nextRole
      ? this.t('filters.guidedAutoBuild.support.next', {
          role: this.getManualSlotTitle(nextRole),
        })
      : this.t('filters.guidedAutoBuild.support.complete');
  });
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
  public readonly selectedCharacterNamesLabel = computed(() =>
    this.formatSelectedValues(this.selectedCharacterNames()),
  );
  public readonly strictModeLabel = computed(() => {
    const strictModes: string[] = [];

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
  public readonly buildButtonLabel = computed(() => AUTO_TEAM_BUILD_BUTTON_LABEL);
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

    if (!progress) {
      return 0;
    }

    if (progress.stage === 'completed') {
      return 100;
    }

    return Math.max(this.buildProgressFloorPercent(), this.resolveBuildProgressPercent(progress));
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
  public readonly buildCurrentLeaderPairLabel = computed(() => {
    const progress = this.buildProgress();
    const captain = this.formatProgressLeaderLabel(
      progress?.currentCaptainName,
      progress?.currentCaptainId,
    );
    const friendCaptain = this.formatProgressLeaderLabel(
      progress?.currentFriendCaptainName,
      progress?.currentFriendCaptainId,
    );

    return captain || friendCaptain
      ? this.t('progress.leaderPair', {
          captain: captain || '-',
          friendCaptain: friendCaptain || '-',
        })
      : '';
  });
  public readonly buildFavoriteScopeLabel = computed(() => {
    if (!this.favoritesOnly()) {
      return '';
    }

    const progress = this.buildProgress();
    const favoriteCount = this.favoriteCharacterIds().length.toLocaleString(formattingLanguage());
    const candidateCount =
      typeof progress?.candidateCount === 'number'
        ? progress.candidateCount.toLocaleString(formattingLanguage())
        : null;
    const selectedBox = this.selectedCharacterBox();

    if (selectedBox) {
      const boxCount = (this.effectiveAutoBuildCandidateIds() ?? []).length.toLocaleString(formattingLanguage());

      return this.t(
        candidateCount ? 'progress.favoriteScopeWithBox' : 'progress.favoriteScopeWithBoxPending',
        {
          favoriteCount,
          boxCount,
          boxName: selectedBox.name,
          candidateCount: candidateCount ?? '',
        },
      );
    }

    return this.t(candidateCount ? 'progress.favoriteScope' : 'progress.favoriteScopePending', {
      favoriteCount,
      candidateCount: candidateCount ?? '',
    });
  });
  public readonly buildCurrentLeaderScopeRow = computed<Pick<LoadingProgressRow, 'text' | 'tone'>>(
    () => {
      const progress = this.buildProgress();
      const captain = this.resolveProgressLeaderScope(progress?.currentCaptainId, 'captain');
      const friendCaptain = this.resolveProgressLeaderScope(
        progress?.currentFriendCaptainId,
        'friendCaptain',
      );

      if (!captain && !friendCaptain) {
        return {
          text: '',
          tone: 'secondary',
        };
      }

      return {
        text: this.t('progress.leaderScope', {
          captain: captain?.label ?? '-',
          friendCaptain: friendCaptain?.label ?? '-',
        }),
        tone: captain?.isWarning || friendCaptain?.isWarning ? 'warning' : 'secondary',
      };
    },
  );
  public readonly buildLeaderPairPositionLabel = computed(() => {
    const progress = this.buildProgress();

    return typeof progress?.leaderPairIndex === 'number' &&
      typeof progress.totalLeaderPairs === 'number' &&
      progress.totalLeaderPairs > 0
      ? this.t('progress.leaderPairPosition', {
          current: progress.leaderPairIndex.toLocaleString(formattingLanguage()),
          total: progress.totalLeaderPairs.toLocaleString(formattingLanguage()),
        })
      : '';
  });
  public readonly buildAttemptWorkLabel = computed(() => {
    const progress = this.buildProgress();

    return typeof progress?.completedWorkUnits === 'number' &&
      typeof progress.totalWorkUnits === 'number' &&
      progress.totalWorkUnits > 0
      ? this.t('progress.attemptWork', {
          completed: progress.completedWorkUnits.toLocaleString(formattingLanguage()),
          total: progress.totalWorkUnits.toLocaleString(formattingLanguage()),
        })
      : '';
  });
  public readonly buildCandidateChecksLabel = computed(() => {
    const progress = this.buildProgress();

    return typeof progress?.checkedCandidates === 'number' &&
      typeof progress.totalCandidatesToCheck === 'number' &&
      progress.totalCandidatesToCheck > 0
      ? this.t('progress.candidateChecks', {
          checked: progress.checkedCandidates.toLocaleString(formattingLanguage()),
          total: progress.totalCandidatesToCheck.toLocaleString(formattingLanguage()),
        })
      : '';
  });
  public readonly buildSubPoolLabel = computed(() => {
    const subPoolSize = this.buildProgress()?.subPoolSize;

    return typeof subPoolSize === 'number'
      ? this.t('progress.subPool', { count: subPoolSize.toLocaleString(formattingLanguage()) })
      : '';
  });
  public readonly buildSearchNodesLabel = computed(() => {
    const searchNodesVisited = this.buildProgress()?.searchNodesVisited;

    return typeof searchNodesVisited === 'number'
      ? this.t('progress.searchNodes', { count: searchNodesVisited.toLocaleString(formattingLanguage()) })
      : '';
  });
  public readonly buildCurrentExclusionsLabel = computed(() =>
    this.formatProgressExclusionCounts(
      'progress.currentExclusions',
      this.buildProgress()?.currentExclusionCounts,
    ),
  );
  public readonly buildPermanentExclusionsLabel = computed(() =>
    this.formatProgressExclusionCounts(
      'progress.permanentExclusions',
      this.buildProgress()?.permanentExclusionCounts,
    ),
  );
  public readonly buildActiveWorkersLabel = computed(() => {
    const activeWorkerCount = this.buildProgress()?.activeWorkerCount;

    return typeof activeWorkerCount === 'number'
      ? this.t('progress.activeWorkers', { count: activeWorkerCount.toLocaleString(formattingLanguage()) })
      : '';
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
        attempts: progress.totalAttempts.toLocaleString(formattingLanguage()),
        count: progress.candidateCount.toLocaleString(formattingLanguage()),
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
        attempts: progress.totalAttempts.toLocaleString(formattingLanguage()),
        count: progress.candidateCount.toLocaleString(formattingLanguage()),
        total: upperBoundChecks.toLocaleString(formattingLanguage()),
      },
    );
  });
  public readonly buildSearchMeaningLabel = computed(() => {
    const progress = this.buildProgress();

    return progress ? this.t('progress.searchMeaning') : '';
  });
  public readonly buildEstimatedFinishLabel = computed(() => {
    const progress = this.buildProgress();
    const estimatedRemainingMs = progress ? this.resolveBuildEstimatedRemainingMs(progress) : null;

    return typeof estimatedRemainingMs === 'number' && estimatedRemainingMs > 0
      ? this.t('progress.estimatedFinish', {
          time: this.formatEtaClockTime(this.resolveBuildEtaNowMs() + estimatedRemainingMs),
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
        key: 'currentStepElapsed',
        text: this.buildCurrentStepElapsedLabel(),
        tone: 'secondary',
      },
      {
        key: 'leaderPair',
        text: this.buildCurrentLeaderPairLabel(),
        tone: 'secondary',
      },
      {
        key: 'leaderScope',
        text: this.buildCurrentLeaderScopeRow().text,
        tone: this.buildCurrentLeaderScopeRow().tone,
      },
      {
        key: 'leaderPairPosition',
        text: this.buildLeaderPairPositionLabel(),
        tone: 'secondary',
      },
      {
        key: 'attemptWork',
        text: this.buildAttemptWorkLabel(),
        tone: 'secondary',
      },
      {
        key: 'candidateChecks',
        text: this.buildCandidateChecksLabel(),
        tone: 'secondary',
      },
      {
        key: 'subPool',
        text: this.buildSubPoolLabel(),
        tone: 'secondary',
      },
      {
        key: 'searchNodes',
        text: this.buildSearchNodesLabel(),
        tone: 'secondary',
      },
      {
        key: 'currentExclusions',
        text: this.buildCurrentExclusionsLabel(),
        tone: 'secondary',
      },
      {
        key: 'permanentExclusions',
        text: this.buildPermanentExclusionsLabel(),
        tone: 'secondary',
      },
      {
        key: 'activeWorkers',
        text: this.buildActiveWorkersLabel(),
        tone: 'secondary',
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
        text: this.buildEstimatedFinishLabel(),
        tone: 'fallback',
      },
      {
        key: 'candidatePool',
        text: this.buildCandidateProgressLabel(),
        tone: 'secondary',
      },
      {
        key: 'favoriteScope',
        text: this.buildFavoriteScopeLabel(),
        tone: 'secondary',
      },
    ];

    return rows.map((row) => ({
      ...row,
      displayText: row.text || '\u00A0',
      visible: row.text.length > 0,
    }));
  });
  public readonly cancelBuildButtonLabel = computed(() => this.t('actions.cancelBuild'));
  public readonly pauseBuildButtonLabel = computed(() => this.t('actions.pauseBuild'));
  public readonly resumeBuildButtonLabel = computed(() => this.t('actions.resumeBuild'));
  public readonly pausedBuildTitle = computed(() => this.t('paused.title'));
  public readonly pausedBuildCopy = computed(() => this.t('paused.copy'));
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
  public readonly requestedResultCharacterTagsLabel = computed(() =>
    this.formatResultValues(this.result()?.requestedInput.selectedCharacterTags ?? []),
  );
  public readonly effectiveResultCharacterTagsLabel = computed(() =>
    this.formatResultValues(this.result()?.input.selectedCharacterTags ?? []),
  );
  public readonly requestedResultCharacterNamesLabel = computed(() =>
    this.formatResultValues(this.result()?.requestedInput.selectedCharacterNames ?? []),
  );
  public readonly effectiveResultCharacterNamesLabel = computed(() =>
    this.formatResultValues(this.result()?.input.selectedCharacterNames ?? []),
  );
  public readonly droppedResultTypes = computed(() => this.result()?.relaxation.droppedTypes ?? []);
  public readonly droppedResultClasses = computed(
    () => this.result()?.relaxation.droppedClasses ?? [],
  );
  public readonly droppedResultCharacterTags = computed(
    () => this.result()?.relaxation.droppedCharacterTags ?? [],
  );
  public readonly droppedResultCharacterNames = computed(
    () => this.result()?.relaxation.droppedCharacterNames ?? [],
  );
  public readonly resultAllowedLeadersWithSuperEffects = computed(
    () => this.result()?.relaxation.allowedLeadersWithSuperEffects ?? false,
  );
  public readonly resultIgnoredLeaderSuperSpecialCriteria = computed(
    () => this.result()?.relaxation.ignoredLeaderSuperSpecialCriteria ?? false,
  );
  public readonly ignoredSuperSpecialCriteriaCharacterNames = computed(
    () => this.result()?.relaxation.ignoredSuperSpecialCriteriaCharacterNames ?? [],
  );
  public readonly ignoredSuperSpecialCriteriaLabel = computed(() => {
    const names = this.ignoredSuperSpecialCriteriaCharacterNames();

    return names.length
      ? this.t('fallback.ignoredSuperSpecialCriteriaWithNames', {
          names: names.join(', '),
        })
      : this.t('fallback.ignoredSuperSpecialCriteria');
  });
  public readonly resultIgnoredSuperTandemCriteria = computed(
    () => this.result()?.relaxation.ignoredSuperTandemCriteria ?? false,
  );
  public readonly ignoredSuperTandemCriteriaCharacterNames = computed(
    () => this.result()?.relaxation.ignoredSuperTandemCriteriaCharacterNames ?? [],
  );
  public readonly ignoredSuperTandemCriteriaLabel = computed(() => {
    const names = this.ignoredSuperTandemCriteriaCharacterNames();

    return names.length
      ? this.t('fallback.ignoredSuperTandemCriteriaWithNames', {
          names: names.join(', '),
        })
      : this.t('fallback.ignoredSuperTandemCriteria');
  });
  public readonly finalReportRows = computed<AutoBuildFinalReportRow[]>(() => {
    const current = this.result();

    if (!current) {
      return [];
    }

    return this.buildFinalReportRows(current);
  });
  /**
   * 869f1935z. Covered / not covered / cannot be answered, for every enemy mechanic the reader
   * ticked - against the team that was actually built.
   *
   * Deliberately NOT folded into `finalReportRows`. That list is keyed on the rules the search
   * used, and fourteen of the catalogue's mechanics derive no rule at all, so they could never
   * appear there. Merging the two would also make a mechanic look like a search constraint the
   * reader could relax, which it is not.
   */
  public readonly mechanicChecklist = computed(() => {
    const current = this.result();

    if (!current) {
      return { entries: [], coveredCount: 0, notCoveredCount: 0, unanswerableCount: 0 };
    }

    /*
     * 869f1935z. The requested ability requirements are passed too, so a reader who described the
     * enemy through the ability picker instead of the mechanics panel still gets a checklist. Only
     * requirements naming exactly one catalogue mechanic are recognised, and they are marked as
     * inferred rather than presented as the reader's own selection.
     */
    return buildMechanicChecklist(
      current.input.enemyMechanics ?? [],
      current.slots,
      collectRequestedAbilityRequirements(current.input),
    );
  });
  public readonly mechanicChecklistSummaryLabel = computed(() => {
    const summary = this.mechanicChecklist();

    return this.t('mechanicChecklist.summary', {
      covered: summary.coveredCount,
      notCovered: summary.notCoveredCount,
      unanswerable: summary.unanswerableCount,
    });
  });
  /** A report exists to copy once a build has answered: with a team, or with why there is none. */
  public readonly canCopyDebugReport = computed(
    () => !this.building() && (this.result() !== null || this.lastBuildFailure() !== null),
  );
  /**
   * Owner, 2026-09-11 (D7): a local character edit changes what the builder sees, so the result
   * says so - a chip on each edited slot and this one line in the Final team report.
   */
  public readonly localOverrideNotice = computed(() => {
    const count = this.teamSlots().filter((slot) => slot.hasLocalOverride).length;

    return count ? this.t('results.localOverride.notice', { count }) : '';
  });
  /** The ability catalog failed to load, which leaves every ability filter empty (owner, D7). */
  public readonly abilityCatalogUnavailable = computed(
    () => this.pageReady() && this.abilityCatalog() === null,
  );
  public readonly selectedClassSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.hasSelectedClasses() && !this.allClassesSelected()
        ? this.t('results.selectedClassSummary.poolOnlyPending')
        : this.t('results.selectedClassSummary.flexiblePending');
    }

    if (current.input.selectedClasses.length === 0) {
      return this.t('results.selectedClassSummary.noRequirement');
    }

    // Under "characters of these classes", "1 / 2 selected classes covered" read as a shortfall.
    if (
      shouldTreatSelectedClassesAsNeutral(current.requestedInput) &&
      !this.sameUnorderedValues(current.requestedInput.selectedClasses, this.availableClasses())
    ) {
      return this.t('results.selectedClassSummary.poolResolved', {
        matching: current.coverage.selectedClassMatches,
        total: current.slots.length,
      });
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
      return this.derivedRequireAllSelectedTypesInTeam()
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
  public readonly selectedCharacterTagSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.derivedRequireAllSelectedCharacterTagsInTeam()
        ? this.t('results.selectedCharacterTagSummary.strictPending')
        : this.t('results.selectedCharacterTagSummary.flexiblePending');
    }

    if (current.input.selectedCharacterTags.length === 0) {
      return this.t('results.selectedCharacterTagSummary.noRequirement');
    }

    return current.input.requireAllSelectedCharacterTagsInTeam
      ? this.t('results.selectedCharacterTagSummary.strictResolved', {
          covered: current.coverage.coveredSelectedCharacterTags.length,
          total: current.input.selectedCharacterTags.length,
        })
      : this.t('results.selectedCharacterTagSummary.coverage', {
          covered: current.coverage.coveredSelectedCharacterTags.length,
          total: current.input.selectedCharacterTags.length,
          matchingSlots: current.coverage.selectedCharacterTagMatches,
        });
  });
  public readonly selectedCharacterNameSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.derivedRequireAllSelectedCharacterNamesInTeam()
        ? this.t('results.selectedCharacterNameSummary.strictPending')
        : this.t('results.selectedCharacterNameSummary.flexiblePending');
    }

    if (current.input.selectedCharacterNames.length === 0) {
      return this.t('results.selectedCharacterNameSummary.noRequirement');
    }

    return current.input.requireAllSelectedCharacterNamesInTeam
      ? this.t('results.selectedCharacterNameSummary.strictResolved', {
          covered: current.coverage.coveredSelectedCharacterNames.length,
          total: current.input.selectedCharacterNames.length,
        })
      : this.t('results.selectedCharacterNameSummary.coverage', {
          covered: current.coverage.coveredSelectedCharacterNames.length,
          total: current.input.selectedCharacterNames.length,
          matchingSlots: current.coverage.selectedCharacterNameMatches,
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
  public readonly leaderCriteriaCharacterTagsLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t('results.leaderCriteria.noData');
    }

    return leaderCriteria.hasCharacterTagRestriction
      ? leaderCriteria.derivedAllowedCharacterTags.join(' / ')
      : this.t('results.leaderCriteria.noCharacterTagRestriction');
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
      !leaderCriteria.hasCharacterTagRestriction
    ) {
      return this.t('results.leaderCriteria.noRestriction');
    }

    return this.t('results.leaderCriteria.scopeCoverage', {
      matching: leaderCriteria.matchingSlots,
      total: leaderCriteria.totalSlots,
    });
  });
  public readonly captainAbilityCoverageReportLabel = computed(() => {
    const status = this.resultTeamConditionStatus();

    if (!status) {
      return this.t('results.captainAbilityCoverage.pending');
    }

    if (status.state === 'full') {
      return this.t('results.captainAbilityCoverage.full');
    }

    return this.t('results.captainAbilityCoverage.partial', {
      matched: this.resolveCaptainCoverageMatchedSlotCount(status),
      total: this.resolveCaptainCoverageTotalSlotCount(status),
    });
  });
  public readonly captainAbilityCoverageMissingLabels = computed(() => {
    const status = this.resultTeamConditionStatus();

    if (!status || status.state === 'full') {
      return [];
    }

    return status.leaderStatuses
      .filter((leaderStatus) => leaderStatus.missingSlotLabels.length > 0)
      .map((leaderStatus) =>
        this.t('results.captainAbilityCoverage.missingLeaderSlots', {
          leader: leaderStatus.label,
          slots: leaderStatus.missingSlotLabels.join(' / '),
        }),
      );
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
  public readonly canDownloadSelectionJson = computed(() => true);
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
  public readonly downloadSavedTeamImportJsonLabel = computed(() =>
    this.t('actions.downloadSavedTeamImportJson'),
  );
  public readonly resultTeamConditionStatus = computed<CaptainTeamConditionStatus | null>(() => {
    const slots = this.teamSlots();

    if (!slots.length) {
      return null;
    }

    return resolveCaptainTeamConditionStatus({
      expectedSlotCount: 6,
      coverageMode:
        this.requireFullCaptainAbilityCoverage() ||
        this.requireBothLeadersFullCaptainAbilityCoverage()
          ? 'fullAbilityCoverage'
          : 'simpleBoostScope',
      leaders: [
        {
          role: 'captain',
          label: this.t('results.teamSlots.roles.captain'),
          character: slots.find((slot) => slot.role === 'captain')?.character ?? null,
          branchMode:
            slots.find((slot) => slot.role === 'captain')?.captainBranchSelection?.mode ?? null,
        },
        {
          role: 'friendCaptain',
          label: this.t('results.teamSlots.roles.friendCaptain'),
          character: slots.find((slot) => slot.role === 'friendCaptain')?.character ?? null,
          branchMode:
            slots.find((slot) => slot.role === 'friendCaptain')?.captainBranchSelection?.mode ??
            null,
        },
      ],
      slotLabels: this.resolveResultTeamConditionSlotLabels(slots),
      slots: slots.map((slot) => slot.character),
    });
  });
  public readonly resultCaptainDetail = computed(
    () => this.result()?.slots.find((slot) => slot.role === 'captain')?.character ?? null,
  );
  public readonly resultFriendCaptainDetail = computed(
    () => this.result()?.slots.find((slot) => slot.role === 'friendCaptain')?.character ?? null,
  );
  public readonly resultTeamMembers = computed(
    () => this.result()?.slots.map((slot) => slot.character) ?? [],
  );

  public readonly teamSlots = computed<TeamSlotViewModel[]>(() => {
    const currentResult = this.result();
    let subSlotIndex = 0;
    const leaders = (currentResult?.slots ?? [])
      .filter((slot) => slot.role === 'captain' || slot.role === 'friendCaptain')
      .map((slot) => slot.character);
    const selectedClassSelection = {
      values: currentResult?.requestedInput?.selectedClasses ?? [],
      matchMode: currentResult?.requestedInput?.requireAllSelectedClassesPerCharacter
        ? ('all' as const)
        : ('any' as const),
    };

    return (
      currentResult?.slots.map((slot, index) => {
        const manualSlotRole = this.resolveManualSlotRoleForResultSlot(slot.role, subSlotIndex);

        if (slot.role === 'sub') {
          subSlotIndex += 1;
        }

        const explanationView = this.buildSlotExplanationView(slot);

        return {
          ...slot,
          trackKey:
            slot.role === 'sub'
              ? `sub:${index}:${slot.character.id}`
              : `${slot.role}:${slot.character.id}`,
          roleLabel: this.resolveRoleLabel(slot.role),
          manualSlotRole,
          characterTags: (slot.character.detail.characterTags ?? []).filter(
            (tag) => tag.trim().length > 0,
          ),
          captainBranchLabel: slot.captainBranchSelection?.displayName ?? null,
          explanationSummaryLabel: explanationView.summaryLabel,
          explanationDetailLabels: explanationView.detailLabels,
          rejectedCandidateLabels: explanationView.rejectedCandidateLabels,
          rejectedCandidateGroups: explanationView.rejectedCandidateGroups,
          hasStructuredExplanation: explanationView.hasStructuredExplanation,
          hasLocalOverride: this.characterOverrides.overridesByCharacterId().has(slot.character.id),
          formClassMatch: mergeFormOnlyClassMatches(
            resolveFormOnlyClassMatch(slot.character, selectedClassSelection),
            ...leaders.map((leader) =>
              resolveCaptainCoverageFormOnlyClasses(resolveCaptainCoverage(leader, slot.character)),
            ),
          ),
        };
      }) ?? []
    );
  });

  private buildSlotExplanationView(slot: AutoBuildResult['slots'][number]): {
    detailLabels: string[];
    hasStructuredExplanation: boolean;
    rejectedCandidateLabels: RejectedCandidateExplanationView[];
    rejectedCandidateGroups: RejectedCandidateGroupView[];
    summaryLabel: string;
  } {
    const explanation = slot.explanation;

    if (!explanation) {
      return {
        summaryLabel: this.t('results.explanations.missing'),
        detailLabels: [],
        rejectedCandidateLabels: [],
        rejectedCandidateGroups: [],
        hasStructuredExplanation: false,
      };
    }

    const detailLabels = [...explanation.reasons, ...explanation.fallbackReasons].map((reason) =>
      this.formatSlotExplanationReason(reason),
    );

    return {
      summaryLabel: this.formatSlotExplanationReason(explanation.primaryReason),
      detailLabels,
      rejectedCandidateLabels: explanation.rejectedCandidates.map((candidate) => ({
        title: this.t('results.explanations.rejectedCandidateTitle', {
          name: candidate.characterName,
          id: candidate.characterId,
        }),
        reasonLabels: candidate.reasons.map((reason) =>
          this.formatRejectedCandidateReason(reason),
        ),
        groupCode: resolveRejectedCandidateGroupCode(candidate),
      })),
      rejectedCandidateGroups: groupRejectedCandidatesByDecisiveReason(
        explanation.rejectedCandidates,
      ).map((group) => ({
        ...group,
        label: this.formatRejectedCandidateReasonCode(group.code),
      })),
      hasStructuredExplanation: true,
    };
  }

  private formatRejectedCandidateReason(reason: AutoBuildRejectedCandidateReason): string {
    return this.formatRejectedCandidateReasonCode(reason.code);
  }

  /**
   * The same labels, addressed by code alone. A group header has a count and a reason and no
   * candidate behind it, so it has no `params` to interpolate - splitting the switch out is what
   * lets the chip and the line under it be worded by one place instead of two.
   */
  private formatRejectedCandidateReasonCode(code: RejectedCandidateGroupCode): string {
    switch (code) {
      case 'manualSlotLocked':
        return this.t('results.explanations.rejectedReasons.manualSlotLocked');
      case 'alreadySelected':
        return this.t('results.explanations.rejectedReasons.alreadySelected');
      case 'duplicateBaseConflict':
        return this.t('results.explanations.rejectedReasons.duplicateBaseConflict');
      case 'leaderScopeConstraint':
        return this.t('results.explanations.rejectedReasons.leaderScopeConstraint');
      case 'costConstraint':
        return this.t('results.explanations.rejectedReasons.costConstraint');
      case 'requiredConstraint':
        return this.t('results.explanations.rejectedReasons.requiredConstraint');
      case 'lowerRequirementDemand':
        return this.t('results.explanations.rejectedReasons.lowerRequirementDemand');
      case 'lowerCoverageContribution':
        return this.t('results.explanations.rejectedReasons.lowerCoverageContribution');
      case 'lowerSelectedFilterScore':
        return this.t('results.explanations.rejectedReasons.lowerSelectedFilterScore');
      case 'lowerLeaderCoverageScore':
        return this.t('results.explanations.rejectedReasons.lowerLeaderCoverageScore');
      case 'rankingTieBreak':
        return this.t('results.explanations.rejectedReasons.rankingTieBreak');
      default:
        return this.t('results.explanations.rejectedReasons.unknown');
    }
  }

  private formatSlotExplanationReason(reason: AutoBuildSlotExplanationReason): string {
    switch (reason.code) {
      case 'manualPick':
        return this.t('results.explanations.reasons.manualPick');
      case 'captainRole':
        return this.t('results.explanations.reasons.captainRole');
      case 'friendCaptainRole':
        return this.t('results.explanations.reasons.friendCaptainRole');
      case 'subRole':
        return this.t('results.explanations.reasons.subRole');
      case 'selectedTypeMatch':
        return this.t('results.explanations.reasons.selectedTypeMatch', {
          values: this.formatReasonStringList(reason, 'types'),
        });
      case 'selectedClassMatch':
        return this.t('results.explanations.reasons.selectedClassMatch', {
          values: this.formatReasonStringList(reason, 'classes'),
        });
      case 'selectedCharacterTagMatch':
        return this.t('results.explanations.reasons.selectedCharacterTagMatch', {
          values: this.formatReasonStringList(reason, 'tags'),
        });
      case 'selectedCharacterNameMatch':
        return this.t('results.explanations.reasons.selectedCharacterNameMatch', {
          values: this.formatReasonStringList(reason, 'names'),
        });
      case 'captainUniversalScope':
        return this.t('results.explanations.reasons.captainUniversalScope');
      case 'captainTypeScope':
        return this.t('results.explanations.reasons.captainTypeScope', {
          values: this.formatReasonStringList(reason, 'types'),
        });
      case 'captainClassScope':
        return this.t('results.explanations.reasons.captainClassScope', {
          values: this.formatReasonStringList(reason, 'classes'),
        });
      case 'leaderScopeMatch':
        return this.t('results.explanations.reasons.leaderScopeMatch');
      case 'requiredAbilityMatch':
        return this.t('results.explanations.reasons.requiredAbilityMatch', {
          count: this.getReasonNumberParam(reason, 'count'),
          values: this.formatReasonStringList(reason, 'abilityKeys'),
        });
      case 'battleRequirementMatch':
        return this.t('results.explanations.reasons.battleRequirementMatch', {
          battleCount: this.getReasonNumberParam(reason, 'battleCount'),
          groupCount: this.getReasonNumberParam(reason, 'groupCount'),
          values: this.formatReasonStringList(reason, 'abilityKeys'),
        });
      case 'burstRole':
        return this.t('results.explanations.reasons.burstRole', {
          values: this.formatCoverageRoleList(reason),
        });
      case 'consistencyRole':
        return this.t('results.explanations.reasons.consistencyRole', {
          values: this.formatCoverageRoleList(reason),
        });
      case 'utilityRole':
        return this.t('results.explanations.reasons.utilityRole', {
          values: this.formatCoverageRoleList(reason),
        });
      case 'rankingDemand':
        return this.t('results.explanations.reasons.rankingDemand');
      case 'rankingSelectedFilters':
        return this.t('results.explanations.reasons.rankingSelectedFilters');
      case 'rankingNewestId':
        return this.t('results.explanations.reasons.rankingNewestId');
      case 'fallbackUsed':
        return this.t('results.explanations.reasons.fallbackUsed');
      case 'fallbackDroppedTypes':
        return this.t('results.explanations.reasons.fallbackDroppedTypes', {
          values: this.formatReasonStringList(reason, 'types'),
        });
      case 'fallbackDroppedClasses':
        return this.t('results.explanations.reasons.fallbackDroppedClasses', {
          values: this.formatReasonStringList(reason, 'classes'),
        });
      case 'fallbackDroppedCharacterTags':
        return this.t('results.explanations.reasons.fallbackDroppedCharacterTags', {
          values: this.formatReasonStringList(reason, 'tags'),
        });
      case 'fallbackDroppedCharacterNames':
        return this.t('results.explanations.reasons.fallbackDroppedCharacterNames', {
          values: this.formatReasonStringList(reason, 'names'),
        });
      case 'fallbackAllowedSuperEffectLeaders':
        return this.t('results.explanations.reasons.fallbackAllowedSuperEffectLeaders');
      case 'fallbackIgnoredLeaderSuperScope':
        return this.t('results.explanations.reasons.fallbackIgnoredLeaderSuperScope');
      case 'fallbackIgnoredSuperSpecialCriteria':
        return this.t('results.explanations.reasons.fallbackIgnoredSuperSpecialCriteria', {
          values: this.formatReasonStringList(reason, 'names'),
        });
      case 'fallbackIgnoredSuperTandemCriteria':
        return this.t('results.explanations.reasons.fallbackIgnoredSuperTandemCriteria', {
          values: this.formatReasonStringList(reason, 'names'),
        });
      case 'fallbackIgnoredCaptainAbilityCoverage':
        return this.t('results.explanations.reasons.fallbackIgnoredCaptainAbilityCoverage');
      case 'fallbackDowngradedCaptainAbilityCoverage':
        return this.t('results.explanations.reasons.fallbackDowngradedCaptainAbilityCoverage');
      case 'fallbackReplacedCaptain':
        return this.t('results.explanations.reasons.fallbackReplacedCaptain', {
          from: String(reason.params?.['from'] ?? ''),
          to: String(reason.params?.['to'] ?? ''),
        });
      default:
        return this.t('results.explanations.unknown');
    }
  }

  private formatCoverageRoleList(reason: AutoBuildSlotExplanationReason): string {
    const roles = this.getReasonStringParamList(reason, 'roles').map((role) =>
      this.t(`results.explanations.coverageRoles.${role}`),
    );

    return this.formatList(roles);
  }

  private formatReasonStringList(
    reason: AutoBuildSlotExplanationReason,
    paramKey: string,
  ): string {
    return this.formatList(this.getReasonStringParamList(reason, paramKey));
  }

  private formatList(values: string[]): string {
    return values.length ? values.join(', ') : this.t('results.none');
  }

  private getReasonStringParamList(
    reason: AutoBuildSlotExplanationReason,
    paramKey: string,
  ): string[] {
    const value = reason.params?.[paramKey];

    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [];
  }

  private getReasonNumberParam(
    reason: AutoBuildSlotExplanationReason,
    paramKey: string,
  ): number {
    const value = reason.params?.[paramKey];

    return typeof value === 'number' ? value : 0;
  }

  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly coverageIcon = shieldHalfOutline;
  public readonly shipIcon = boatOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public readonly manualFilterIcon = optionsOutline;
  public readonly copyIcon = copyOutline;
  public readonly closeIcon = closeOutline;
  public readonly editIcon = createOutline;
  public readonly compareIcon = gitCompareOutline;
  public readonly compareImportIcon = cloudUploadOutline;
  public readonly compareSwapIcon = swapHorizontalOutline;
  public readonly similarPickIcon = sparklesOutline;
  public readonly requiredManualPickIcon = lockClosedOutline;
  public readonly optionalManualPickIcon = lockOpenOutline;
  public readonly presetImportSuccessIcon = checkmarkCircleOutline;
  public readonly presetImportErrorIcon = alertCircleOutline;
  public readonly readyIcon = checkmarkCircleOutline;
  public readonly notReadyIcon = alertCircleOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly alertController: AlertController,
    private readonly characterOverrides: CharacterOverridesService,
    private readonly preferences: PreferencesAdapterService,
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
    this.boostedCharacterIds = this.userState.boostedCharacterIds;
    this.favoriteShipIds = this.userState.favoriteShipIds;
    this.characterBoxes = this.userState.characterBoxes;
    this.savedTeams = this.userState.savedTeams;
    this.autoTeamBuilderWorkerPreference = this.userState.autoTeamBuilderWorkerPreference;
    this.autoTeamBuilderWorkerRuntime = computed(() =>
      this.userState.resolveAutoTeamBuilderWorkerPreference(),
    );
    this.autoTeamBuilderAvailableWorkerCounts = computed(() =>
      Array.from(
        { length: this.autoTeamBuilderWorkerRuntime().manualMaxCount },
        (_, index) => index + 1,
      ),
    );

    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
  }

  public async ngOnInit(): Promise<void> {
    this.initialLoad = this.loadInitialPageState();

    await this.initialLoad;
  }

  /**
   * The first load, kept as a promise so `ionViewWillEnter` can wait for it.
   *
   * It ends in `resetPageState()`, and `ionViewWillEnter` calls that too. Both
   * hooks fire on the first visit, `ngOnInit` is async, and the reset it owns
   * lands only once the dataset resolves - so the two used to race, and the
   * later one silently undid whatever the reader had pressed in between.
   * `guidedAutoBuildEnabled` was the visible casualty: flip Guided auto build
   * while the page is still loading and it switched itself back off.
   */
  private async loadInitialPageState(): Promise<void> {
    await Promise.all([
      this.userState.readyFavoriteCharacterIds(),
      this.userState.readyFavoriteShipIds(),
      /*
       * 869f1rmuu. Without this the signal is empty at build time even when a list is stored, so
       * the build silently runs with no boosts. Every unit test passed because the stubs
       * pre-populate the signal; a live pass caught it - the stored list read [4551,4520,4408] and
       * the input the engine got read [].
       */
      this.userState.readyBoostedCharacterIds(),
      this.userState.readyCharacterBoxes(),
      this.userState.readySavedTeams(),
      this.userState.readyAutoTeamBuilderWorkerPreference(),
      this.userState.readyBuilderIntroDismissed(),
      this.i18n.preloadScope('auto-team-builder'),
      this.i18n.preloadScope('ability-picker'),
      this.i18n.preloadScope('character-tag-filter'),
      this.i18n.preloadScope('character-tag-sets'),
      this.i18n.preloadScope('saved-teams'),
    ]);
    this.restoreCompareSessionState();
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
    void this.loadAvailableCharacterTags();
    await this.resetPageState();
    this.restoreSelectionState();
    await this.restoreResultSnapshot();
    await this.refreshAllCompareSnapshots();

    this.pageReady.set(true);
  }

  public ngOnDestroy(): void {
    this.destroyed = true;
    this.enemyMechanicPickerOpen.set(false);
    this.captainAbilityPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.crewmateAbilityPickerOpen.set(false);
    this.cancelBuild();
    this.stopBuildProgressTicker();
    this.closeManualPickerModal();
    this.closeExcludePickerModal();
    this.closeRequirementSourceModal();
  }

  public async ionViewWillEnter(): Promise<void> {
    // A handoff clears its query parameter once applied, so read it before anything awaits.
    const routeParams = this.route.snapshot.queryParamMap;

    this.introOpenedFromHandoff.set(
      Boolean(routeParams.get('teamId')?.trim() || routeParams.get('enemyId')?.trim()),
    );
    // Ionic keeps the page alive between visits; Show reopens the card for one visit only.
    this.introShownOnRequest.set(false);

    // Never reset ahead of the first load: `ngOnInit` owns that one and it is
    // the only reset that runs with the dataset in hand.
    await this.initialLoad;

    /*
     * `pageReady` is deliberately NOT lowered around this second reset.
     *
     * The same shape that made the initial load dishonest survives here in a
     * much narrower form: this `resetPageState()` wipes the filter signals
     * again, so a press landing inside it is discarded. Lowering `pageReady`
     * would close that - and would also grey out all twenty-eight controls on
     * EVERY return to the tab, because they all bind `controlsDisabled()` now.
     *
     * The trade is not close. The initial-load window spans a dataset
     * resolution; this one spans a synchronous signal reset with `initialLoad`
     * already settled, so there is no fetch inside it. Flickering the whole
     * filter bar on every tab entry to close a window that narrow would cost
     * the reader more than it returns.
     *
     * If `resetPageState()` ever grows an await, this reasoning expires.
     */
    await this.resetPageState();
    /*
     * 869f1935z. Restored BEFORE `pageReady`, so the persisting effect below never sees the
     * defaults this reset just wrote - and BEFORE the route preset, so an explicit preset link
     * still wins over what the reader was doing last time.
     */
    this.restoreSelectionState();

    this.pageReady.set(true);

    const appliedSavedTeamPreset = await this.applySavedTeamPresetFromRoute();

    if (!appliedSavedTeamPreset) {
      await this.applyEnemyPresetFromRoute();
    }

    /*
     * 869f12x47. Runs AFTER the two presets above, and on purpose.
     *
     * A saved team or a saved enemy describes what to build; a box describes
     * what you have to build it from. Arriving with both means "build this
     * enemy's answer out of this box", so the pool must be applied last - the
     * preset restores filter state wholesale and would otherwise wipe it.
     */
    await this.applyCharacterBoxPoolFromRoute();

    /*
     * 869f1k0zv. Last, and only when nothing above produced a result. A preset link says what to
     * build NOW; handing back the previous build over it would answer a question the reader did
     * not ask - the same ordering rule the box pool follows, for the same reason.
     */
    await this.restoreResultSnapshot();

    await this.refreshAllCompareSnapshots();
  }

  public async onAutoTeamBuilderWorkerModeChange(
    event: CustomEvent<{ value?: AutoTeamBuilderWorkerMode | null }>,
  ): Promise<void> {
    const mode = event.detail.value;

    if (mode !== 'auto' && mode !== 'manual') {
      return;
    }

    await this.userState.setAutoTeamBuilderWorkerPreference({
      ...this.autoTeamBuilderWorkerPreference(),
      mode,
    });
  }

  public async onAutoTeamBuilderManualWorkerCountChange(
    event: CustomEvent<{ value?: number | string | null }>,
  ): Promise<void> {
    const nextValue = Number(event.detail.value);

    if (!Number.isInteger(nextValue) || nextValue <= 0) {
      return;
    }

    await this.userState.setAutoTeamBuilderWorkerPreference({
      ...this.autoTeamBuilderWorkerPreference(),
      manualCount: nextValue,
    });
  }

  public async onClassChange(
    event: CustomEvent<{ value?: string[] | string | null }>,
  ): Promise<void> {
    // The select is disabled for the same window; this covers an event that arrives anyway.
    if (this.controlsDisabled()) {
      return;
    }

    this.selectedClasses.set(this.resolveSelectedClasses(event.detail.value));
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
    this.persistSelectionState();
  }

  public async onTypeChange(
    event: CustomEvent<{ value?: AutoTeamBuilderType[] | AutoTeamBuilderType | null }>,
  ): Promise<void> {
    // The select is disabled for the same window; this covers an event that arrives anyway.
    if (this.controlsDisabled()) {
      return;
    }

    this.selectedTypes.set(this.resolveSelectedTypes(event.detail.value));
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
    this.persistSelectionState();
  }

  public openCharacterTagSetPicker(): void {
    this.characterTagSetPickerOpen.set(true);
  }

  public closeCharacterTagSetPicker(): void {
    this.characterTagSetPickerOpen.set(false);
  }

  public saveCharacterTagSetSelection(selection: CharacterTagSetSelection): void {
    this.characterTagSetPickerOpen.set(false);
    this.characterTagSets.set(this.resolveCharacterTagSetSelection(selection));
    this.resetBuildState();
    this.persistSelectionState();
  }

  public onCharacterNameDraftChange(event: CustomEvent<{ value?: string | null }>): void {
    this.characterNameDraft.set((event.detail.value ?? '').toString());
  }

  public addCharacterNameFilter(): void {
    const nextName = this.normalizeCharacterNameFilter(this.characterNameDraft());

    if (nextName.length === 0) {
      return;
    }

    this.selectedCharacterNames.update((currentNames) =>
      currentNames.some((currentName) => currentName.toLowerCase() === nextName.toLowerCase())
        ? currentNames
        : [...currentNames, nextName],
    );
    this.characterNameDraft.set('');
    this.resetBuildState();
  }

  public removeSelectedCharacterName(characterName: string): void {
    this.selectedCharacterNames.set(
      this.selectedCharacterNames().filter((selectedName) => selectedName !== characterName),
    );
    this.resetBuildState();
    this.persistSelectionState();
  }

  public onLeaderBoostFilterChange(
    event: CustomEvent<{
      value?: AutoBuildLeaderBoostFilter[] | AutoBuildLeaderBoostFilter | null;
    }>,
  ): void {
    const nextFilters = this.resolveLeaderBoostFilters(event.detail.value);

    this.leaderBoostFilters.set(
      nextFilters.length ? nextFilters : [...AUTO_BUILD_LEADER_BOOST_FILTERS],
    );
    this.resetBuildState();
  }

  public onLeaderBoostRangeChange(
    filter: AutoBuildLeaderBoostFilter,
    bound: keyof AutoBuildLeaderBoostRange,
    event: CustomEvent<{ value?: string | number | null }>,
  ): void {
    this.keepSectionOpen('captainFilters');
    const nextBound = this.resolveLeaderBoostRangeBound(event.detail.value);
    const currentRanges = this.leaderBoostRanges();

    this.leaderBoostRanges.set({
      HP: { ...currentRanges.HP },
      ATK: { ...currentRanges.ATK },
      [filter]: {
        ...currentRanges[filter],
        [bound]: nextBound,
      },
    });
    this.resetBuildState();
  }

  public onLeaderCostRangeChange(
    bound: keyof AutoBuildCostRange,
    event: CustomEvent<{ value?: string | number | null }>,
  ): void {
    const nextBound = this.resolveCostRangeBound(event.detail.value);
    const currentRange = this.leaderCostRange();

    this.leaderCostRange.set({
      ...currentRange,
      [bound]: nextBound,
    });
    this.resetBuildState();
  }

  public onSubCostRangeChange(
    bound: keyof AutoBuildCostRange,
    event: CustomEvent<{ value?: string | number | null }>,
  ): void {
    const nextBound = this.resolveCostRangeBound(event.detail.value);
    const currentRange = this.subCostRange();

    this.subCostRange.set({
      ...currentRange,
      [bound]: nextBound,
    });
    this.resetBuildState();
  }

  public onMaxTotalCostChange(event: CustomEvent<{ value?: string | number | null }>): void {
    this.maxTotalCost.set(this.resolveCostRangeBound(event.detail.value));
    this.resetBuildState();
  }

  public async onManualSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.manualSearchTerm.set((event.detail.value ?? '').trim());
    await this.refreshAppliedManualCandidates();
  }

  public onManualShipSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.manualShipSearchTerm.set((event.detail.value ?? '').trim());
    this.syncShipPickerPanelState('manual', { reset: true });
  }

  public async loadMoreManualCharacterCandidates(): Promise<void> {
    await this.loadMoreCharacterPickerPanel('manual');
  }

  public async onExcludeCharacterSearchChange(
    event: CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    this.excludeCharacterSearchTerm.set((event.detail.value ?? '').trim());
    await this.refreshAppliedExcludedCandidates();
  }

  public async loadMoreExcludedCharacterCandidates(): Promise<void> {
    await this.loadMoreCharacterPickerPanel('excluded');
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

    if (mode === 'characters' && this.manualPickerModalOpen()) {
      void this.refreshAppliedManualCandidates({ force: true });
    }
  }

  public setExcludePickerMode(mode: 'characters' | 'ships'): void {
    this.excludePickerMode.set(mode);
    this.syncShipPickerPanelState('excluded', { reset: true });

    if (mode === 'characters' && this.excludePickerModalOpen()) {
      void this.refreshAppliedExcludedCandidates({ force: true });
    }
  }

  public async openManualPickerModal(): Promise<void> {
    if (this.building()) {
      return;
    }

    this.syncShipPickerPanelState('manual', { reset: true });
    this.manualPickerModalOpen.set(true);

    if (this.shipPickerMode() === 'characters') {
      await this.refreshAppliedManualCandidates({ force: true });
    }
  }

  public closeManualPickerModal(): void {
    this.manualPickerModalOpen.set(false);
    this.clearCharacterPickerTagFilter('manual');
  }

  public async openExcludePickerModal(): Promise<void> {
    if (this.building()) {
      return;
    }

    this.syncShipPickerPanelState('excluded', { reset: true });
    this.excludePickerModalOpen.set(true);

    if (this.excludePickerMode() === 'characters') {
      await this.refreshAppliedExcludedCandidates({ force: true });
    }
  }

  public closeExcludePickerModal(): void {
    this.excludePickerModalOpen.set(false);
    this.clearCharacterPickerTagFilter('excluded');
  }

  public setPickerDisplayMode(mode: 'list' | 'compact'): void {
    this.pickerDisplayMode.set(mode);
  }

  public async openRequirementSourceModal(): Promise<void> {
    if (this.building()) {
      return;
    }

    this.requirementSourceModalOpen.set(true);
    this.requirementSourceFilters = null;
    this.requirementSourceFiltersById = null;
    await this.refreshRequirementSourceCandidates();
  }

  public loadMoreRequirementSourceCandidates(): void {
    this.requirementSourceVisibleCount.update((count) => count + CHARACTER_PICKER_PAGE_SIZE);
  }

  public closeRequirementSourceModal(): void {
    // A response still in flight belongs to a list nobody is looking at.
    this.requirementSourceRequestId += 1;
    this.requirementSourceModalOpen.set(false);
    this.requirementSourceTagSelection.set(createEmptyCharacterTagSetSelection());
    this.requirementSourceTagCharacterIds.set(undefined);
  }

  public async onRequirementSourceSearchChange(
    event: CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    this.requirementSourceSearchTerm.set((event.detail.value ?? '').trim());
    await this.refreshRequirementSourceCandidates();
  }

  /**
   * Manual locks and excludes share the `CharacterPickerPanelKey` plumbing, so
   * both triggers land here — but on separate per-panel signals, because the two
   * filters are set independently.
   */
  public async onCharacterPickerTagFilterChange(
    panel: CharacterPickerPanelKey,
    change: CharacterTagFilterChange,
  ): Promise<void> {
    this.getCharacterPickerTagSelection(panel).set(change.selection);
    this.getCharacterPickerTagCharacterIds(panel).set(change.matchingCharacterIds);
    // Paging restarts from offset 0: the previous pages were fetched under the
    // old gate, so keeping them would mix filtered and unfiltered rows.
    await (panel === 'manual'
      ? this.refreshAppliedManualCandidates()
      : this.refreshAppliedExcludedCandidates());
  }

  public async onRequirementSourceTagFilterChange(change: CharacterTagFilterChange): Promise<void> {
    this.requirementSourceTagSelection.set(change.selection);
    this.requirementSourceTagCharacterIds.set(change.matchingCharacterIds);
    await this.refreshRequirementSourceCandidates();
  }

  public applyRequirementSourceCharacter(character: CharacterDetailRecord): void {
    const requirements = extractAutoBuildCharacterRequirementFilters(character);

    this.mergeSelectedCharacterTags(requirements.characterTags);
    this.mergeSelectedCharacterNames(requirements.characterNames);
    this.resetBuildState();
    this.closeRequirementSourceModal();
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
    this.requireManualShip.set(false);
    this.updateResultShipSelection();
  }

  public isSelectedManualShip(shipId: number): boolean {
    return this.selectedManualShipId() === shipId;
  }

  public onRequireManualShipToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireManualShip.set(event.detail.checked);
    this.resetBuildState();
  }

  public toggleExcludedCharacter(character: CharacterDetailRecord): void {
    if (this.isExcludedCharacter(character.id)) {
      this.removeExcludedCharacter(character.id);
      return;
    }

    if (!this.canExcludeCharacter(character.id)) {
      return;
    }

    this.cacheCharacterRecord(character);
    this.removeCharacterFromAllManualSlots(character.id);
    this.excludedCharacterIds.update((currentIds) => [...currentIds, character.id]);
    this.resetBuildState();
  }

  public removeExcludedCharacter(characterId: number, event?: Event): void {
    event?.stopPropagation();
    this.keepSectionOpen('exclude');
    this.excludedCharacterIds.update((currentIds) =>
      currentIds.filter((currentCharacterId) => currentCharacterId !== characterId),
    );
    this.resetBuildState();
  }

  public clearExcludedCharacters(): void {
    this.keepSectionOpen('exclude');
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
    this.keepSectionOpen('exclude');
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
    this.keepSectionOpen('exclude');
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

  public isEffectivelyExcludedCharacter(characterId: number): boolean {
    return this.effectiveExcludedCharacterIds().includes(characterId);
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

  public compareSidePayload(side: AutoTeamCompareSide): AutoTeamCompareSidePayload {
    return this.compareSidePayloads()[side];
  }

  public compareSideState(side: AutoTeamCompareSide): AutoTeamCompareSideState {
    return this.compareSidePayload(side).state;
  }

  public compareSideSnapshot(side: AutoTeamCompareSide): AutoTeamCompareSnapshot | null {
    return this.resolveCompareSideSnapshot(side);
  }

  public isSlotExplanationOpen(trackKey: string): boolean {
    return this.openExplanationSlotKeys().has(trackKey);
  }

  public isRejectedGroupSelected(trackKey: string, code: RejectedCandidateGroupCode): boolean {
    return this.selectedRejectedGroupBySlotKey().get(trackKey) === code;
  }

  /**
   * Clicking the selected group clears it. A chip that only ever narrows leaves the reader stuck
   * inside one reason with no way back to the pool they started from.
   */
  public onRejectedGroupToggle(trackKey: string, code: RejectedCandidateGroupCode): void {
    this.selectedRejectedGroupBySlotKey.update((current) => {
      const next = new Map(current);

      if (next.get(trackKey) === code) {
        next.delete(trackKey);
      } else {
        next.set(trackKey, code);
      }

      return next;
    });
  }

  public visibleRejectedCandidates(slot: TeamSlotViewModel): RejectedCandidateExplanationView[] {
    const selectedCode = this.selectedRejectedGroupBySlotKey().get(slot.trackKey) ?? null;

    return filterByRejectedGroupCode(slot.rejectedCandidateLabels, selectedCode);
  }

  public onSlotExplanationToggle(trackKey: string, event: Event): void {
    const isOpen = (event.currentTarget as HTMLDetailsElement | null)?.open ?? false;

    this.openExplanationSlotKeys.update((currentKeys) => {
      const nextKeys = new Set(currentKeys);

      if (isOpen) {
        nextKeys.add(trackKey);
      } else {
        nextKeys.delete(trackKey);
      }

      return nextKeys;
    });
  }

  public compareSideTitle(side: AutoTeamCompareSide): string {
    return side === 'a' ? this.t('compare.sideA') : this.t('compare.sideB');
  }

  public compareSourceLabel(source: AutoTeamCompareSource): string {
    return this.t(`compare.sources.${source}`);
  }

  public compareMetricDisplayValue(
    row: AutoTeamCompareMetricDiffRow,
    side: AutoTeamCompareSide,
  ): string {
    if (row.key === 'ship') {
      const value = side === 'a' ? row.aDisplayValue : row.bDisplayValue;

      return value === 'No' ? this.t('compare.shipPresence.absent') : value;
    }

    return side === 'a' ? row.aDisplayValue : row.bDisplayValue;
  }

  public compareMetricDeltaLabel(row: AutoTeamCompareMetricDiffRow): string {
    return row.key === 'ship' && row.deltaLabel === 'changed'
      ? this.t('compare.changed')
      : row.deltaLabel;
  }

  public compareSideSummary(side: AutoTeamCompareSide): string {
    const payload = this.compareSidePayload(side);
    const snapshot = this.resolveCompareSideSnapshot(side);

    if (payload.loading) {
      return this.t('compare.loading');
    }

    if (payload.error) {
      return payload.error;
    }

    if (snapshot) {
      return this.t('compare.snapshotSummary', {
        // 869f6td68. A team with no name of its own is named in the reader's language.
        name: snapshot.labelKey ? this.t(snapshot.labelKey) : snapshot.label,
        filled: snapshot.metrics.find((metric) => metric.key === 'filledSlots')?.value ?? 0,
      });
    }

    if (payload.state.source === 'current') {
      return this.t('compare.empty.current');
    }

    if (payload.state.source === 'saved') {
      return this.savedTeams().length
        ? this.t('compare.empty.savedSelection')
        : this.t('compare.empty.noSavedTeams');
    }

    return this.t('compare.empty.imported');
  }

  /**
   * While Required characters is compact, its placeholder battle - and that battle's own Add - is
   * hidden, so the summary row offers the same first step: a required character in the first
   * battle, or a first battle when a handoff left none.
   */
  public canAddFirstRequiredCharacter(): boolean {
    const firstBattle = this.battleRequirements()[0];

    return firstBattle
      ? this.canAddRequiredCharacterGroup(firstBattle.id)
      : this.canAddBattleRequirement();
  }

  public async addFirstRequiredCharacter(): Promise<void> {
    const firstBattle = this.battleRequirements()[0];

    this.keepSectionOpen('requiredCharacters');

    if (firstBattle) {
      await this.addRequiredCharacterGroup(firstBattle.id);
    } else {
      await this.addBattleRequirement();
    }
  }

  private keepSectionOpen(section: AutoTeamBuilderCollapsibleSection): void {
    if (!this.expandedEmptySections().has(section)) {
      this.expandedEmptySections.set(new Set([...this.expandedEmptySections(), section]));
    }
  }

  public toggleEmptySection(section: AutoTeamBuilderCollapsibleSection): void {
    const next = new Set(this.expandedEmptySections());

    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }

    this.expandedEmptySections.set(next);
  }

  public async dismissIntro(): Promise<void> {
    this.introShownOnRequest.set(false);
    await this.userState.setBuilderIntroDismissed('autoTeamBuilder', true);
  }

  public async quickStartFromCaptain(): Promise<void> {
    this.selectManualSlot('captain');
    // The picker keeps its Characters/Ships tab between openings, and a Captain is a character.
    this.shipPickerMode.set('characters');
    await this.openManualPickerModal();
  }

  public async quickStartGuided(): Promise<void> {
    this.setGuidedAutoBuildEnabled(true);
    await this.revealBuildButton();
  }

  public showIntro(): void {
    this.introShownOnRequest.set(true);
  }

  public toggleCompareMode(): void {
    this.compareModeOpen.update((open) => !open);
    this.persistCompareSessionState();

    if (this.compareModeOpen()) {
      void this.refreshAllCompareSnapshots();
    }
  }

  public onCompareSideSourceChange(
    side: AutoTeamCompareSide,
    event: CustomEvent<{ value?: string | null }>,
  ): void {
    const source = normalizeCompareSource(event.detail.value);

    this.updateCompareSidePayload(side, (payload) => ({
      ...payload,
      state: {
        ...(source === 'imported'
          ? payload.state
          : clearImportedCompareSessionFields(payload.state)),
        source,
      },
      seed: source === 'imported' ? payload.seed : null,
      snapshot: source === payload.state.source ? payload.snapshot : null,
      error: '',
      loading: false,
    }));
    this.persistCompareSessionState();
    void this.refreshCompareSideSnapshot(side);
  }

  public onCompareSavedTeamChange(
    side: AutoTeamCompareSide,
    event: CustomEvent<{ value?: string | null }>,
  ): void {
    const savedTeamId = String(event.detail.value ?? '').trim();

    this.updateCompareSidePayload(side, (payload) => ({
      ...payload,
      state: {
        ...payload.state,
        savedTeamId,
      },
      error: '',
    }));
    this.persistCompareSessionState();
    void this.refreshCompareSideSnapshot(side);
  }

  public onCompareImportDraftChange(
    side: AutoTeamCompareSide,
    event: CustomEvent<{ value?: string | null }>,
  ): void {
    const importDraft = event.detail.value ?? '';

    if (this.compareSidePayload(side).loading) {
      this.nextCompareRequestToken(side);
    }

    this.updateCompareSidePayload(side, (payload) => ({
      ...payload,
      state: {
        ...payload.state,
        importDraft,
        importedLabel: '',
        importedRawContent: '',
        importedSeed: null,
      },
      loading: false,
    }));
    this.persistCompareSessionState();
  }

  public async onCompareImportFileSelected(
    side: AutoTeamCompareSide,
    event: Event,
    input: HTMLInputElement,
  ): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = [...(target.files ?? [])];

    input.value = '';

    if (!file) {
      return;
    }

    await this.applyCompareImportRawContent(side, await file.text(), file.name);
  }

  public async applyCompareImportDraft(side: AutoTeamCompareSide): Promise<void> {
    const draft = this.compareSideState(side).importDraft;

    await this.applyCompareImportRawContent(side, draft, this.t('compare.import.pastedPayload'));
  }

  public swapCompareSides(): void {
    this.nextCompareRequestToken('a');
    this.nextCompareRequestToken('b');
    this.compareSidePayloads.update((current) => ({
      a: settleSwappedComparePayload(current.b),
      b: settleSwappedComparePayload(current.a),
    }));
    this.persistCompareSessionState();
    void this.refreshAllCompareSnapshots();
  }

  private updateCompareSidePayload(
    side: AutoTeamCompareSide,
    updater: (payload: AutoTeamCompareSidePayload) => AutoTeamCompareSidePayload,
  ): void {
    this.compareSidePayloads.update((current) => ({
      ...current,
      [side]: updater(cloneAutoTeamCompareSidePayload(current[side])),
    }));
  }

  private resolveCompareSideSnapshot(side: AutoTeamCompareSide): AutoTeamCompareSnapshot | null {
    const payload = this.compareSidePayloads()[side];

    if (payload.state.source === 'current') {
      return this.currentCompareSnapshot();
    }

    return payload.snapshot;
  }

  private async refreshAllCompareSnapshots(): Promise<void> {
    await Promise.all(AUTO_TEAM_COMPARE_SIDES.map((side) => this.refreshCompareSideSnapshot(side)));
  }

  private async refreshCompareSideSnapshot(side: AutoTeamCompareSide): Promise<void> {
    const payload = this.compareSidePayload(side);
    const requestToken = this.nextCompareRequestToken(side);

    if (payload.state.source === 'current') {
      this.updateCompareSidePayload(side, (current) => ({
        ...current,
        snapshot: null,
        error: '',
        loading: false,
      }));
      return;
    }

    if (payload.state.source === 'saved') {
      await this.refreshSavedCompareSnapshot(side, requestToken);
      return;
    }

    if (payload.state.importedSeed) {
      await this.refreshImportedCompareSnapshot(
        side,
        payload.state.importedSeed,
        payload.state.importedLabel || this.t('compare.import.restoredPayload'),
        requestToken,
      );
      return;
    }

    if (payload.state.importedRawContent.trim().length) {
      await this.applyCompareImportRawContent(
        side,
        payload.state.importedRawContent,
        payload.state.importedLabel || this.t('compare.import.restoredPayload'),
        requestToken,
      );
      return;
    }

    this.updateCompareSidePayload(side, (current) => ({
      ...current,
      loading: false,
    }));
  }

  private async refreshImportedCompareSnapshot(
    side: AutoTeamCompareSide,
    seed: AutoTeamCompareImportedSeed,
    sourceLabel: string,
    requestToken: number,
  ): Promise<void> {
    this.updateCompareSidePayload(side, (payload) => ({
      ...payload,
      loading: true,
    }));

    try {
      const characterMap = await this.loadCompareCharacterMap(
        collectAutoTeamCompareSeedCharacterIds(seed),
      );
      const snapshot = buildAutoTeamCompareSnapshotFromImportedSeed(
        seed,
        characterMap,
        this.resolveCompareShip(seed.shipId),
        this.availableAbilityCatalogItems(),
      );

      if (
        !this.isCompareRequestCurrent(side, requestToken) ||
        this.compareSideState(side).source !== 'imported'
      ) {
        return;
      }

      const compactSeed = cloneAutoTeamCompareImportedSeed(seed);

      this.updateCompareSidePayload(side, (payload) => ({
        ...payload,
        state: {
          ...payload.state,
          source: 'imported',
          importDraft: '',
          importedLabel: seed.label || sourceLabel,
          importedRawContent: '',
          importedSeed: compactSeed,
        },
        seed: compactSeed,
        snapshot,
        error: this.resolveCompareSnapshotWarning(snapshot),
        loading: false,
      }));
      this.persistCompareSessionState();
    } catch {
      if (
        !this.isCompareRequestCurrent(side, requestToken) ||
        this.compareSideState(side).source !== 'imported'
      ) {
        return;
      }

      this.updateCompareSidePayload(side, (payload) => ({
        ...payload,
        seed: null,
        snapshot: null,
        error: this.t('compare.errors.loadFailed'),
        loading: false,
      }));
    }
  }

  private async refreshSavedCompareSnapshot(
    side: AutoTeamCompareSide,
    requestToken: number,
  ): Promise<void> {
    await this.userState.readySavedTeams();

    if (!this.isCompareRequestCurrent(side, requestToken)) {
      return;
    }

    const payload = this.compareSidePayload(side);
    const fallbackTeam = this.savedTeams()[0] ?? null;
    const savedTeamId = payload.state.savedTeamId || fallbackTeam?.id || '';
    const savedTeam = this.savedTeams().find((team) => team.id === savedTeamId) ?? fallbackTeam;

    if (!savedTeam) {
      if (!this.isCompareRequestCurrent(side, requestToken)) {
        return;
      }

      this.updateCompareSidePayload(side, (current) => ({
        ...current,
        snapshot: null,
        error: this.t('compare.empty.noSavedTeams'),
        loading: false,
      }));
      return;
    }

    if (payload.state.source !== 'saved') {
      return;
    }

    this.updateCompareSidePayload(side, (current) => ({
      ...current,
      state: {
        ...current.state,
        savedTeamId: savedTeam.id,
      },
      error: '',
      loading: true,
    }));

    try {
      const characterMap = await this.loadCompareCharacterMap(
        savedTeam.slots.filter(
          (characterId): characterId is number => typeof characterId === 'number',
        ),
      );
      const snapshot = buildAutoTeamCompareSnapshotFromSavedTeam(
        savedTeam,
        characterMap,
        this.resolveCompareShip(savedTeam.shipId),
        this.availableAbilityCatalogItems(),
      );

      if (
        !this.isCompareRequestCurrent(side, requestToken) ||
        this.compareSideState(side).source !== 'saved' ||
        this.compareSideState(side).savedTeamId !== savedTeam.id
      ) {
        return;
      }

      this.updateCompareSidePayload(side, (current) => ({
        ...current,
        snapshot,
        error: this.resolveCompareSnapshotWarning(snapshot),
        loading: false,
      }));
      this.persistCompareSessionState();
    } catch {
      if (
        !this.isCompareRequestCurrent(side, requestToken) ||
        this.compareSideState(side).source !== 'saved'
      ) {
        return;
      }

      this.updateCompareSidePayload(side, (current) => ({
        ...current,
        snapshot: null,
        error: this.t('compare.errors.loadFailed'),
        loading: false,
      }));
    }
  }

  private async applyCompareImportRawContent(
    side: AutoTeamCompareSide,
    rawContent: string,
    sourceLabel: string,
    requestToken = this.nextCompareRequestToken(side),
  ): Promise<void> {
    this.updateCompareSidePayload(side, (payload) => ({
      ...payload,
      state: {
        ...payload.state,
        source: 'imported',
        importDraft: rawContent,
      },
      error: '',
      loading: true,
    }));

    try {
      const seed = parseAutoTeamCompareImportPayload(rawContent);
      const characterMap = await this.loadCompareCharacterMap(
        collectAutoTeamCompareSeedCharacterIds(seed),
      );
      const snapshot = buildAutoTeamCompareSnapshotFromImportedSeed(
        seed,
        characterMap,
        this.resolveCompareShip(seed.shipId),
        this.availableAbilityCatalogItems(),
      );

      const currentState = this.compareSideState(side);

      if (
        !this.isCompareRequestCurrent(side, requestToken) ||
        currentState.source !== 'imported' ||
        currentState.importDraft !== rawContent
      ) {
        return;
      }

      const compactSeed = cloneAutoTeamCompareImportedSeed(seed);

      this.updateCompareSidePayload(side, (payload) => ({
        ...payload,
        state: {
          ...payload.state,
          source: 'imported',
          importDraft: '',
          importedLabel: seed.label || sourceLabel,
          importedRawContent: '',
          importedSeed: compactSeed,
        },
        seed: compactSeed,
        snapshot,
        error: this.resolveCompareSnapshotWarning(snapshot),
        loading: false,
      }));
      this.persistCompareSessionState();
    } catch (error) {
      if (
        !this.isCompareRequestCurrent(side, requestToken) ||
        this.compareSideState(side).source !== 'imported'
      ) {
        return;
      }

      this.updateCompareSidePayload(side, (payload) => ({
        ...payload,
        state: {
          ...payload.state,
          source: 'imported',
          importDraft: rawContent,
          importedLabel: '',
          importedRawContent: '',
          importedSeed: null,
        },
        seed: null,
        snapshot: null,
        error: this.resolveCompareImportError(error),
        loading: false,
      }));
      this.persistCompareSessionState();
    }
  }

  private async loadCompareCharacterMap(
    characterIds: readonly number[],
  ): Promise<Map<number, CharacterDetailRecord>> {
    const uniqueCharacterIds = [...new Set(characterIds)];
    const entries = await Promise.all(
      uniqueCharacterIds.map(async (characterId) => {
        const character = await this.repository.getCharacterById(characterId);

        return character ? ([character.id, character] as const) : null;
      }),
    );

    return new Map(
      entries.filter((entry): entry is readonly [number, CharacterDetailRecord] => entry !== null),
    );
  }

  private resolveCompareShip(shipId: number | null | undefined): ShipRecord | null {
    return typeof shipId === 'number'
      ? (this.ships().find((ship) => ship.id === shipId) ?? null)
      : null;
  }

  private resolveCompareSnapshotWarning(snapshot: AutoTeamCompareSnapshot): string {
    return snapshot.missingCharacterCount > 0
      ? this.t('compare.errors.missingCharacters', { count: snapshot.missingCharacterCount })
      : '';
  }

  private resolveCompareImportError(error: Error | unknown): string {
    const errorKey =
      error instanceof AutoTeamCompareImportError ? error.key : 'compare.import.errors.invalid';
    const details = [this.t(errorKey)];
    const diagnostic = error instanceof AutoTeamCompareImportError ? error.diagnostic : null;

    if (diagnostic) {
      details.push(
        this.i18n.translate('import.diagnosticCode', { code: diagnostic.code }, 'saved-teams'),
        this.i18n.translate(diagnostic.recoveryKey, undefined, 'saved-teams'),
      );
    }

    return details.join(' ');
  }

  private nextCompareRequestToken(side: AutoTeamCompareSide): number {
    this.compareRequestTokens[side] += 1;

    return this.compareRequestTokens[side];
  }

  private isCompareRequestCurrent(side: AutoTeamCompareSide, requestToken: number): boolean {
    return this.compareRequestTokens[side] === requestToken;
  }

  private persistCompareSessionState(): void {
    try {
      globalThis.sessionStorage?.setItem(
        AUTO_TEAM_COMPARE_SESSION_KEY,
        JSON.stringify({
          open: this.compareModeOpen(),
          sides: {
            a: this.compareSidePayload('a').state,
            b: this.compareSidePayload('b').state,
          },
        } satisfies AutoTeamCompareSessionState),
      );
      this.compareStorageFeedback.set(null);
    } catch (error) {
      const code = classifyBrowserStorageFailure(error) ?? 'BROWSER_STORAGE_UNAVAILABLE';

      this.compareStorageFeedback.set(
        this.buildCompareStorageFeedback({
          code,
          detailKey:
            code === 'BROWSER_STORAGE_QUOTA_EXCEEDED'
              ? 'compare.storage.persistenceQuota'
              : 'compare.storage.persistenceUnavailable',
          recoveryKey:
            code === 'BROWSER_STORAGE_QUOTA_EXCEEDED'
              ? 'compare.storage.recovery.quota'
              : 'compare.storage.recovery.unavailable',
          titleKey: 'compare.storage.persistenceTitle',
        }),
      );
    }
  }

  /**
   * The four filters, and nothing else. See `auto-team-builder-selection-state.utils.ts`.
   *
   * Called from the reader-facing handlers rather than from an `effect`, which is how Saved Teams
   * already parks its own view state. An `effect` was the first attempt and cannot work here: the
   * page specs construct this class with `new`, so there is no injection context and `effect()`
   * throws NG0203 before a single test runs. Calling it from the handlers also keeps `restore`,
   * `reset` and the preset paths OUT of the write path, which is what they should be - none of
   * those is the reader choosing a filter.
   */
  /**
   * 869f1k0zv. The one seam every result write goes through, so persistence cannot be forgotten
   * at a new call site the way it was at all five of the existing ones.
   *
   * Writing is fire-and-forget on purpose: a result that cannot be parked is not a reason to
   * hold up the render, which is how `persistSelectionState` already degrades.
   *
   * **A null result does not forget the parked team.** `resetPageState()` runs on every page
   * load, so clearing here wiped the snapshot moments before the restore could read it - the
   * feature silently did nothing, and a test caught it. Forgetting is an intent, not a side
   * effect: it happens where the READER asks for it (`resetPage`, and applying a preset), and
   * when a restore is abandoned.
   */
  private applyResult(next: AutoBuildResult | null): void {
    this.result.set(next);
    void this.loadSpecialCooldowns(next);

    if (next) {
      void this.persistResultSnapshot(next);
    }
  }

  /**
   * 869f1k107. The two cooldown columns for whoever is on the team now.
   *
   * They are not on the builder's records: `CharacterProgression` is loaded per character on
   * purpose, because its evolution and drop payloads would be dead weight in every builder query.
   * So this reads just the two columns, for the six ids, in one query.
   *
   * Never rejects. A timeline that cannot be built leaves the rest of the result on screen - the
   * computed simply reports every member as unknown, which is the truth.
   */
  private async loadSpecialCooldowns(next: AutoBuildResult | null): Promise<void> {
    if (!next) {
      this.specialCooldowns.set(new Map());
      return;
    }

    try {
      const records = await this.repository.getSpecialCooldownsByIds(
        next.slots.map((slot) => slot.character.id),
      );

      this.specialCooldowns.set(new Map(records.map((record) => [record.characterId, record])));
    } catch {
      this.specialCooldowns.set(new Map());
    }
  }

  public chargeTimelineSummaryLabel(): string {
    const timeline = this.specialChargeTimeline();

    if (!timeline) {
      return '';
    }

    if (timeline.entries.length === 0) {
      return this.i18n.translate('chargeTimeline.summaryNone', undefined, 'auto-team-builder');
    }

    return this.i18n.translate(
      'chargeTimeline.summary',
      { ready: timeline.readyCount, total: timeline.entries.length, turns: timeline.turns },
      'auto-team-builder',
    );
  }

  public chargeTimelineEntryLabel(entry: SpecialChargeEntry): string {
    if (!entry.chargesInRun) {
      return this.i18n.translate(
        'chargeTimeline.entryShort',
        { turns: entry.shortfallTurns ?? 0 },
        'auto-team-builder',
      );
    }

    /*
     * A special that never speeds up reads oddly as "at max special level - at level 1 it takes
     * the same". `character-progression.presenter.ts` already collapses that case for the same
     * reason, and a live pass caught this one repeating the mistake.
     */
    const speedsUp = entry.baseTurns !== entry.maxLevelTurns;

    // 869f63gm7. The start of the quest took the whole cooldown - "with 20 turns to spare" would
    // bury the one thing worth saying.
    if (entry.maxLevelTurns === 0) {
      return this.i18n.translate(
        speedsUp ? 'chargeTimeline.entryAtStart' : 'chargeTimeline.entryAtStartFixed',
        { base: entry.baseTurns },
        'auto-team-builder',
      );
    }

    if (entry.spareTurns === 0) {
      return this.i18n.translate(
        speedsUp ? 'chargeTimeline.entryExact' : 'chargeTimeline.entryExactFixed',
        undefined,
        'auto-team-builder',
      );
    }

    return this.i18n.translate(
      speedsUp ? 'chargeTimeline.entryReady' : 'chargeTimeline.entryReadyFixed',
      { turns: entry.spareTurns ?? 0, base: entry.baseTurns },
      'auto-team-builder',
    );
  }

  public onGameModeChange(event: CustomEvent<{ value?: string | null }>): void {
    const value = event.detail.value;

    this.selectedGameMode.set(
      GAME_MODES.includes(value as GameMode) ? (value as GameMode) : null,
    );
  }

  /**
   * 869f1q90b. Marks the character boosted, or unmarks it.
   *
   * The reader edits this from the team in front of them - they read the event screen, then tick
   * the units it names. There is no picker because the list they care about is almost always
   * already on screen: the team the builder just produced.
   */
  public async toggleBoostedCharacter(characterId: number): Promise<void> {
    await this.userState.toggleBoostedCharacter(characterId);
  }

  public async clearBoostedCharacters(): Promise<void> {
    await this.userState.clearBoostedCharacterIds();
  }

  public isBoostedCharacter(characterId: number): boolean {
    return this.boostedCharacterIds().includes(characterId);
  }

  public boostedSummaryLabel(): string {
    return this.i18n.translate(
      'gameMode.boosted.summary',
      { marked: this.boostedCharacterIds().length, onTeam: this.boostedTeamMemberIds().length },
      'auto-team-builder',
    );
  }

  public gameModeLabel(mode: GameMode): string {
    return this.i18n.translate(`gameMode.modes.${mode}`, undefined, 'auto-team-builder');
  }

  public teamModeEffectLabel(member: TeamModeEffectMember): string {
    if (!member.effect) {
      return this.i18n.translate('gameMode.memberUnaffected', undefined, 'auto-team-builder');
    }

    if (member.effect.conditional && member.effect.scaling) {
      return this.i18n.translate('gameMode.memberBoth', undefined, 'auto-team-builder');
    }

    return this.i18n.translate(
      member.effect.conditional ? 'gameMode.memberConditional' : 'gameMode.memberScaling',
      undefined,
      'auto-team-builder',
    );
  }

  public teamModeEffectsSummaryLabel(): string {
    const effects = this.teamModeEffects();

    if (!effects) {
      return '';
    }

    return this.i18n.translate(
      effects.affectedCount === 0 ? 'gameMode.summaryNone' : 'gameMode.summary',
      {
        affected: effects.affectedCount,
        total: effects.members.length,
        mode: this.gameModeLabel(effects.mode),
      },
      'auto-team-builder',
    );
  }

  public onTimelineTurnsChange(event: Event): void {
    const raw = (event.target as HTMLInputElement | null)?.value ?? '';

    this.timelineTurns.set(clampTimelineTurns(Number(raw)));
  }

  public onTimelineEventCutChange(event: Event): void {
    const raw = (event.target as HTMLInputElement | null)?.value ?? '';

    this.timelineEventCut.set(clampEventCutTurns(Number(raw)));
  }

  public toggleTimelineEventCutWholeTeam(): void {
    this.timelineEventCutWholeTeam.update((wholeTeam) => !wholeTeam);
  }

  public toggleTimelineCountLimitBreak(): void {
    this.timelineCountLimitBreak.update((count) => !count);
  }

  /** The chip beside a name: "charges in 8", or "charged at the start" once nothing is left. */
  public chargeTimelineChargesLabel(entry: SpecialChargeEntry): string {
    return entry.maxLevelTurns === 0
      ? this.i18n.translate('chargeTimeline.chargesAtStart', undefined, 'auto-team-builder')
      : this.i18n.translate(
          'chargeTimeline.charges',
          { turns: entry.maxLevelTurns },
          'auto-team-builder',
        );
  }

  /** Who the event cut reaches while it is not given to the whole team. */
  public chargeTimelineCutReachLabel(): string {
    return this.i18n.translate(
      'chargeTimeline.cutReach',
      { count: this.boostedTeamMemberIds().length },
      'auto-team-builder',
    );
  }

  /**
   * 869f63gm7. The row's own account of its cut - "Cooldown cut at the start: 11 - 10 from the
   * event, 1 from the Captain." - so no number on the timeline is a black box. Empty when nothing
   * was cut.
   */
  public chargeTimelineStartCutLabel(entry: SpecialChargeEntry): string {
    if (!entry.startCut.length) {
      return '';
    }

    const sources = entry.startCut.map((part) => this.startCutPartLabel(part)).join(', ');
    const full = entry.startCut.some((part) => part.turns === null);

    return this.i18n.translate(
      full ? 'chargeTimeline.cutLineFull' : 'chargeTimeline.cutLine',
      {
        turns: entry.startCut.reduce((total, part) => total + (part.turns ?? 0), 0),
        sources,
      },
      'auto-team-builder',
    );
  }

  private startCutPartLabel(part: StartCutPart): string {
    return this.i18n.translate(
      `chargeTimeline.cutSources.${part.source}`,
      { amount: part.turns ?? 'MAX', name: part.fromName ?? '' },
      'auto-team-builder',
    );
  }

  private async persistResultSnapshot(next: AutoBuildResult | null): Promise<void> {
    try {
      if (!next) {
        await this.preferences.set({ key: AUTO_TEAM_BUILDER_RESULT_KEY, value: '' });
        return;
      }

      await this.preferences.set({
        key: AUTO_TEAM_BUILDER_RESULT_KEY,
        value: JSON.stringify(buildAutoTeamBuilderResultSnapshot(next)),
      });
    } catch {
      // Private browsing, a blocked store and a full quota all throw here. None of them is a
      // reason to lose the result that is already on screen.
    }
  }

  /**
   * Restores the last built team, or leaves the page as it is.
   *
   * Called after the route presets on purpose: a preset link says what to build NOW, so the
   * previous build is stale and must not be handed back over it. That is the same ordering rule
   * `applyCharacterBoxPoolFromRoute` follows, for the same reason.
   */
  private async restoreResultSnapshot(): Promise<void> {
    if (this.result()) {
      return;
    }

    let raw: string | null = null;

    try {
      raw = (await this.preferences.get({ key: AUTO_TEAM_BUILDER_RESULT_KEY })).value;
    } catch {
      return;
    }

    if (!raw) {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const snapshot = parseAutoTeamBuilderResultSnapshot(parsed);

    if (!snapshot) {
      return;
    }

    let characters: CharacterDetailRecord[] = [];

    try {
      characters = await this.repository.getDetailedCharactersByIds(snapshotCharacterIds(snapshot));
    } catch {
      return;
    }

    const restored = restoreAutoTeamBuilderResult(
      snapshot,
      new Map(characters.map((character) => [character.id, character])),
    );

    /*
     * `null` means the dataset can no longer supply every slot. The snapshot is dropped rather
     * than kept: it will never restore again, and leaving it there costs the reader quota for a
     * team they can no longer be shown.
     */
    if (!restored) {
      await this.persistResultSnapshot(null);
      return;
    }

    for (const slot of restored.slots) {
      this.cacheCharacterRecord(slot.character);
    }

    this.result.set(restored);
    await this.loadSpecialCooldowns(restored);
  }

  private persistSelectionState(): void {
    const state = {
      selectedTypes: [...this.selectedTypes()],
      selectedClasses: [...this.selectedClasses()],
      selectedCharacterNames: [...this.selectedCharacterNames()],
      characterTagSets: this.characterTagSets(),
    };

    try {
      if (isDefaultSelectionState(state)) {
        globalThis.sessionStorage?.removeItem(AUTO_TEAM_BUILDER_SELECTION_SESSION_KEY);
        return;
      }

      globalThis.sessionStorage?.setItem(
        AUTO_TEAM_BUILDER_SELECTION_SESSION_KEY,
        JSON.stringify(state),
      );
    } catch {
      // Private browsing and storage-blocked contexts throw. A selection that cannot be parked is
      // not a reason to break the page, which is how the compare state above already degrades.
    }
  }

  private restoreSelectionState(): void {
    let raw: string | null = null;

    try {
      raw = globalThis.sessionStorage?.getItem(AUTO_TEAM_BUILDER_SELECTION_SESSION_KEY) ?? null;
    } catch {
      return;
    }

    if (!raw) {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const state = parseSelectionState(parsed);

    /*
     * Narrowed to what this build still offers. A type or class upstream renamed away would
     * otherwise sit in the filter bar as a chip matching nothing, which reads as the builder being
     * broken rather than as a stale filter.
     */
    if (state.selectedTypes) {
      this.selectedTypes.set(
        narrowToAvailable(state.selectedTypes, this.availableTypes) as AutoTeamBuilderType[],
      );
    }

    if (state.selectedClasses) {
      this.selectedClasses.set(narrowToAvailable(state.selectedClasses, this.availableClasses()));
    }

    if (state.selectedCharacterNames) {
      this.selectedCharacterNames.set(state.selectedCharacterNames);
    }

    if (state.characterTagSets) {
      this.characterTagSets.set(state.characterTagSets);
    }
  }

  private restoreCompareSessionState(): void {
    try {
      const rawState = globalThis.sessionStorage?.getItem(AUTO_TEAM_COMPARE_SESSION_KEY);

      if (!rawState) {
        return;
      }

      const parsedState = JSON.parse(rawState) as Partial<AutoTeamCompareSessionState>;

      this.compareModeOpen.set(Boolean(parsedState.open));
      this.compareSidePayloads.set({
        a: {
          ...createAutoTeamCompareSidePayload(),
          state: this.normalizeCompareSideSessionState(parsedState.sides?.a),
        },
        b: {
          ...createAutoTeamCompareSidePayload(),
          state: this.normalizeCompareSideSessionState(parsedState.sides?.b),
        },
      });
    } catch (error) {
      const storageFailureCode = classifyBrowserStorageFailure(error);

      this.compareModeOpen.set(false);
      this.compareSidePayloads.set({
        a: createAutoTeamCompareSidePayload(),
        b: createAutoTeamCompareSidePayload(),
      });
      try {
        globalThis.sessionStorage?.removeItem(AUTO_TEAM_COMPARE_SESSION_KEY);
      } catch {
        // The visible warning below is enough to distinguish this browser-storage path.
      }
      this.compareStorageFeedback.set(
        storageFailureCode
          ? this.buildCompareStorageFeedback({
              code: storageFailureCode,
              detailKey: 'compare.storage.restoreUnavailable',
              recoveryKey:
                storageFailureCode === 'BROWSER_STORAGE_QUOTA_EXCEEDED'
                  ? 'compare.storage.recovery.quota'
                  : 'compare.storage.recovery.unavailable',
              titleKey: 'compare.storage.restoreUnavailableTitle',
            })
          : this.buildCompareStorageFeedback({
              code: 'AUTO_TEAM_COMPARE_SESSION_RESET',
              detailKey: 'compare.storage.restoreReset',
              recoveryKey: 'compare.storage.recovery.restoreReset',
              titleKey: 'compare.storage.restoreTitle',
            }),
      );
    }
  }

  private buildCompareStorageFeedback(input: {
    code: string;
    detailKey: string;
    recoveryKey: string;
    titleKey: string;
  }): PresetImportFeedback {
    return {
      details: [
        this.t(input.detailKey),
        this.t('compare.storage.diagnosticCode', { code: input.code }),
        this.t(input.recoveryKey),
      ],
      title: this.t(input.titleKey),
      tone: 'warning',
    };
  }

  private normalizeCompareSideSessionState(value: unknown): AutoTeamCompareSideState {
    if (!isRecord(value)) {
      return createAutoTeamCompareSideState();
    }

    const importedSeed = this.normalizeCompareImportedSeed(value['importedSeed']);

    return {
      source: normalizeCompareSource(value['source']),
      savedTeamId: typeof value['savedTeamId'] === 'string' ? value['savedTeamId'] : '',
      importDraft: typeof value['importDraft'] === 'string' ? value['importDraft'] : '',
      importedLabel:
        typeof value['importedLabel'] === 'string'
          ? value['importedLabel']
          : importedSeed?.label ?? '',
      importedRawContent:
        typeof value['importedRawContent'] === 'string' ? value['importedRawContent'] : '',
      importedSeed,
    };
  }

  private normalizeCompareImportedSeed(value: unknown): AutoTeamCompareImportedSeed | null {
    if (!isRecord(value)) {
      return null;
    }

    const rawSlotIds = Array.isArray(value['slotIds']) ? value['slotIds'] : [];
    const slotIds = AUTO_BUILD_MANUAL_SLOT_ROLES.map((_, index) =>
      normalizeCompareSessionPositiveInteger(rawSlotIds[index]),
    );
    const label = typeof value['label'] === 'string' ? value['label'].trim() : '';

    if (!label && slotIds.every((slotId) => slotId === null)) {
      return null;
    }

    return {
      label: label || this.t('compare.import.restoredPayload'),
      labelKey: isAutoTeamCompareUnnamedTeamKey(value['labelKey']) ? value['labelKey'] : null,
      shipId: normalizeCompareSessionPositiveInteger(value['shipId']),
      ship: isRecord(value['ship']) ? (value['ship'] as unknown as ShipRecord) : null,
      slotIds,
      characters: Array.isArray(value['characters'])
        ? (value['characters'] as CharacterDetailRecord[])
        : [],
    };
  }

  public clearAllManualSelections(): void {
    this.manualSlots.set(createEmptyAutoBuildManualSlots());
    this.activeManualSlotRole.set('captain');
    this.resetBuildState();
  }

  public selectManualSlot(role: AutoBuildManualSlotRole): void {
    this.activeManualSlotRole.set(role);
  }

  public openManualCopyModal(): void {
    if (this.building() || !this.hasLockedCharacters()) {
      return;
    }

    const sourceRole = this.resolveDefaultManualCopySourceRole();

    this.manualCopySourceRole.set(sourceRole);
    this.manualCopySelectedCharacterIds.set([
      ...this.resolveManualSlotSelection(sourceRole).characterIds,
    ]);
    this.manualCopyTargetRoles.set([]);
    this.manualCopyModalOpen.set(true);
  }

  public closeManualCopyModal(): void {
    this.manualCopyModalOpen.set(false);
  }

  public onManualCopySourceChange(event: CustomEvent<{ value?: string | null }>): void {
    const nextRole = this.normalizeManualSlotRole(event.detail.value);

    if (!nextRole) {
      return;
    }

    this.manualCopySourceRole.set(nextRole);
    this.manualCopySelectedCharacterIds.set([
      ...this.resolveManualSlotSelection(nextRole).characterIds,
    ]);
    this.manualCopyTargetRoles.update((currentRoles) =>
      currentRoles.filter((role) => role !== nextRole),
    );
  }

  public toggleManualCopyCharacter(
    characterId: number,
    event: CustomEvent<{ checked?: boolean }>,
  ): void {
    const checked = event.detail.checked === true;

    this.manualCopySelectedCharacterIds.update((currentIds) =>
      checked
        ? currentIds.includes(characterId)
          ? currentIds
          : [...currentIds, characterId]
        : currentIds.filter((currentId) => currentId !== characterId),
    );
  }

  public toggleManualCopyTarget(
    role: AutoBuildManualSlotRole,
    event: CustomEvent<{ checked?: boolean }>,
  ): void {
    if (role === this.manualCopySourceRole()) {
      return;
    }

    const checked = event.detail.checked === true;

    this.manualCopyTargetRoles.update((currentRoles) =>
      checked
        ? currentRoles.includes(role)
          ? currentRoles
          : [...currentRoles, role]
        : currentRoles.filter((currentRole) => currentRole !== role),
    );
  }

  public applyManualCopy(): void {
    if (this.manualCopyApplyDisabled()) {
      return;
    }

    const sourceSlot = this.resolveManualSlotSelection(this.manualCopySourceRole());
    const sourceCharacterIds = sourceSlot.characterIds;
    const selectedCharacterIdSet = new Set(this.manualCopySelectedCharacterIds());
    const copiedCharacterIds = sourceCharacterIds.filter((characterId) =>
      selectedCharacterIdSet.has(characterId),
    );
    const targetRoleSet = new Set(this.manualCopyTargetRoles());

    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) => {
        if (!targetRoleSet.has(slot.role)) {
          return slot;
        }

        const existingIdSet = new Set(slot.characterIds);
        const nextCharacterIds = [...slot.characterIds];
        let nextBranchSelections = slot.branchSelections ?? [];

        for (const characterId of copiedCharacterIds) {
          const character = this.lockedCharacterRecords()[characterId];

          if (
            character &&
            !existingIdSet.has(characterId) &&
            this.canAssignCharacterToManualSlot(slot.role, character)
          ) {
            existingIdSet.add(characterId);
            nextCharacterIds.push(characterId);
            const sourceBranchMode = sourceSlot.branchSelections?.find(
              (selection) => selection.characterId === characterId,
            )?.mode;

            if (sourceBranchMode) {
              nextBranchSelections =
                this.resolveNextManualSlotBranchSelections(
                  { ...slot, branchSelections: nextBranchSelections },
                  characterId,
                  sourceBranchMode,
                ) ?? [];
            }
          }
        }

        return {
          ...slot,
          characterIds: nextCharacterIds,
          requiredCharacterId: nextCharacterIds.includes(slot.requiredCharacterId ?? -1)
            ? slot.requiredCharacterId
            : null,
          ...(this.normalizeManualSlotBranchSelections({
            ...slot,
            characterIds: nextCharacterIds,
            branchSelections: nextBranchSelections,
          }).length
            ? {
                branchSelections: this.normalizeManualSlotBranchSelections({
                  ...slot,
                  characterIds: nextCharacterIds,
                  branchSelections: nextBranchSelections,
                }),
              }
            : {}),
        };
      }),
    );
    this.closeManualCopyModal();
    this.resetBuildState();
  }

  public onRequireAllSelectedTypesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedTypesInTeam.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireAllSelectedClassesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedClassesPerCharacter.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireAllSelectedCharacterTagsToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedCharacterTagsInTeam.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireAllSelectedCharacterNamesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedCharacterNamesInTeam.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireAllSlotsInLeaderSuperEffectScopeToggle(
    event: CustomEvent<{ checked: boolean }>,
  ): void {
    this.requireAllSlotsInLeaderSuperEffectScope.set(event.detail.checked);
    this.resetBuildState();
  }

  public onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.favoritesOnly.set(event.detail.checked);
    this.resetBuildState();
  }

  public onAllowAnyFriendCaptainAutoFillToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.allowAnyFriendCaptainAutoFill.set(event.detail.checked);
    this.resetBuildState();
  }

  public onGuidedAutoBuildToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.setGuidedAutoBuildEnabled(event.detail.checked);
  }

  public setGuidedAutoBuildEnabled(enabled: boolean): void {
    this.guidedAutoBuildEnabled.set(enabled);
    this.resetBuildState();
  }

  public onCharacterBoxChange(event: CustomEvent<{ value?: string | null }>): void {
    const nextValue = typeof event.detail.value === 'string' ? event.detail.value.trim() : '';

    this.selectedCharacterBoxId.set(nextValue.length > 0 ? nextValue : null);
    this.resetBuildState();
  }

  public onExcludeCharacterBoxChange(event: CustomEvent<{ value?: string | null }>): void {
    const nextValue = typeof event.detail.value === 'string' ? event.detail.value.trim() : '';

    this.keepSectionOpen('exclude');
    this.selectedExcludeCharacterBoxId.set(nextValue.length > 0 ? nextValue : null);
    this.removeCharactersFromAllManualSlots(this.selectedExcludeCharacterBoxIds());
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

  public openCaptainAbilityPicker(): void {
    if (this.building() || !this.availableCaptainAbilityCatalogItems().length) {
      return;
    }

    this.captainAbilityPickerOpen.set(true);
  }

  public closeCaptainAbilityPicker(): void {
    this.captainAbilityPickerOpen.set(false);
  }

  public async saveCaptainAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.keepSectionOpen('captainFilters');
    const requirements = serializeCaptainAbilityDrafts(
      drafts,
      this.availableCaptainAbilityCatalogItems(),
      { dedupe: false },
    );

    this.captainAbilityDrafts.set(
      createCaptainAbilityDrafts(requirements, this.availableCaptainAbilityCatalogItems()),
    );
    this.captainAbilityPickerOpen.set(false);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public saveCaptainLeaderBoostSettings(
    settings: AbilityRequirementPickerLeaderBoostSettings,
  ): void {
    this.keepSectionOpen('captainFilters');
    this.leaderBoostFilters.set(
      settings.filters.length ? [...settings.filters] : [...AUTO_BUILD_LEADER_BOOST_FILTERS],
    );
    this.leaderBoostRanges.set(this.cloneLeaderBoostRanges(settings.ranges));
  }

  public async clearCaptainAbilityFilters(): Promise<void> {
    this.keepSectionOpen('captainFilters');
    this.captainAbilityDrafts.set([]);
    this.leaderBoostFilters.set([...AUTO_BUILD_LEADER_BOOST_FILTERS]);
    this.leaderBoostRanges.set(createEmptyAutoBuildLeaderBoostRanges());
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public openAbilityPicker(): void {
    if (this.building() || !this.availableSpecialAbilityCatalogItems().length) {
      return;
    }

    this.abilityPickerOpen.set(true);
  }

  public closeAbilityPicker(): void {
    this.abilityPickerOpen.set(false);
  }

  public async saveAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    const requirements = serializeSpecialAbilityDrafts(
      drafts,
      this.availableSpecialAbilityCatalogItems(),
      { dedupe: false },
    );

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

  public openCrewmateAbilityPicker(): void {
    if (this.building() || !this.availableCrewmateAbilityCatalogItems().length) {
      return;
    }

    this.crewmateAbilityPickerOpen.set(true);
  }

  public closeCrewmateAbilityPicker(): void {
    this.crewmateAbilityPickerOpen.set(false);
  }

  public async saveCrewmateAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    const requirements = serializeCategoryAbilityDrafts(
      drafts,
      this.availableCrewmateAbilityCatalogItems(),
      'crewmate',
      { dedupe: false },
    );

    this.crewmateAbilityDrafts.set(createAbilityRequirementDrafts(requirements));
    this.crewmateAbilityPickerOpen.set(false);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async clearCrewmateAbilityFilters(): Promise<void> {
    this.crewmateAbilityDrafts.set([]);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public openPotentialAbilityPicker(): void {
    if (this.building() || !this.availablePotentialAbilityCatalogItems().length) {
      return;
    }

    this.potentialAbilityPickerOpen.set(true);
  }

  public closePotentialAbilityPicker(): void {
    this.potentialAbilityPickerOpen.set(false);
  }

  public async savePotentialAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    const requirements = serializeCategoryAbilityDrafts(
      drafts,
      this.availablePotentialAbilityCatalogItems(),
      'potential',
      { dedupe: false },
    );

    this.potentialAbilityDrafts.set(createAbilityRequirementDrafts(requirements));
    this.potentialAbilityPickerOpen.set(false);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async clearPotentialAbilityFilters(): Promise<void> {
    this.potentialAbilityDrafts.set([]);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public openSupportAbilityPicker(): void {
    if (this.building() || !this.availableSupportAbilityCatalogItems().length) {
      return;
    }

    this.supportAbilityPickerOpen.set(true);
  }

  public closeSupportAbilityPicker(): void {
    this.supportAbilityPickerOpen.set(false);
  }

  public async saveSupportAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    const requirements = serializeCategoryAbilityDrafts(
      drafts,
      this.availableSupportAbilityCatalogItems(),
      'support',
      { dedupe: false },
    );

    this.supportAbilityDrafts.set(createAbilityRequirementDrafts(requirements));
    this.supportAbilityPickerOpen.set(false);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async clearSupportAbilityFilters(): Promise<void> {
    this.supportAbilityDrafts.set([]);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public canAddRequiredCharacterGroup(battleId: string): boolean {
    const battle = this.battleRequirements().find((entry) => entry.id === battleId);

    return (
      !this.building() &&
      Boolean(battle) &&
      (battle?.requiredCharacterGroups.length ?? 0) < MAX_REQUIRED_CHARACTER_GROUPS
    );
  }

  public async addBattleRequirement(): Promise<void> {
    if (!this.canAddBattleRequirement()) {
      return;
    }

    this.battleRequirements.update((battles) => [
      ...battles,
      createEmptyBattleRequirement(battles.length),
    ]);
    // A battle added to a compact section must not appear hidden.
    this.keepSectionOpen('requiredCharacters');
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async addRequiredCharacterGroup(battleId: string): Promise<void> {
    if (!this.canAddRequiredCharacterGroup(battleId)) {
      return;
    }

    this.battleRequirements.update((battles) => addEmptyGroupToBattle(battles, battleId));
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async removeBattleRequirement(battleId: string): Promise<void> {
    if (this.battleRequirements().length <= 1) {
      return;
    }

    this.keepSectionOpen('requiredCharacters');
    this.battleRequirements.update((battles) => battles.filter((battle) => battle.id !== battleId));

    if (this.activeRequiredCharacterBattleId() === battleId) {
      this.requiredCharacterAbilityPickerOpen.set(false);
      this.activeRequiredCharacterBattleId.set(null);
      this.activeRequiredCharacterGroupId.set(null);
    }

    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async removeRequiredCharacterGroup(battleId: string, groupId: string): Promise<void> {
    this.keepSectionOpen('requiredCharacters');
    this.battleRequirements.update((battles) =>
      battles.map((battle) =>
        battle.id === battleId
          ? {
              ...battle,
              requiredCharacterGroups: battle.requiredCharacterGroups.filter(
                (group) => group.id !== groupId,
              ),
            }
          : battle,
      ),
    );

    if (
      this.activeRequiredCharacterBattleId() === battleId &&
      this.activeRequiredCharacterGroupId() === groupId
    ) {
      this.requiredCharacterAbilityPickerOpen.set(false);
      this.activeRequiredCharacterBattleId.set(null);
      this.activeRequiredCharacterGroupId.set(null);
    }

    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public openRequiredCharacterAbilityPicker(
    battleId: string,
    groupId: string,
    category: AbilityFilterRailCategory,
  ): void {
    if (this.building() || !isRequiredCharacterAbilityCategory(category)) {
      return;
    }

    this.activeRequiredCharacterBattleId.set(battleId);
    this.activeRequiredCharacterGroupId.set(groupId);
    this.activeRequiredCharacterAbilityCategory.set(category);
    this.requiredCharacterAbilityPickerOpen.set(true);
  }

  public requiredCharacterAbilityRailItems(
    view: RequiredCharacterGroupView,
  ): AbilityFilterRailItem[] {
    return [
      this.buildRequiredCharacterAbilityRailItem(view, 'special'),
      this.buildRequiredCharacterAbilityRailItem(view, 'crewmate'),
      this.buildRequiredCharacterAbilityRailItem(view, 'potential'),
      this.buildRequiredCharacterAbilityRailItem(view, 'support'),
    ];
  }

  public async clearRequiredCharacterAbilityCategory(
    battleId: string,
    groupId: string,
    category: AbilityFilterRailCategory,
  ): Promise<void> {
    if (this.building() || !isRequiredCharacterAbilityCategory(category)) {
      return;
    }

    this.battleRequirements.update((battles) =>
      battles.map((battle) =>
        battle.id === battleId
          ? {
              ...battle,
              requiredCharacterGroups: battle.requiredCharacterGroups.map((group) =>
                group.id === groupId
                  ? {
                      ...group,
                      abilities: group.abilities.filter(
                        (requirement) =>
                          !this.requiredCharacterRequirementMatchesCategory(requirement, category),
                      ),
                    }
                  : group,
              ),
            }
          : battle,
      ),
    );

    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public closeRequiredCharacterAbilityPicker(): void {
    this.requiredCharacterAbilityPickerOpen.set(false);
    this.activeRequiredCharacterBattleId.set(null);
    this.activeRequiredCharacterGroupId.set(null);
  }

  public async saveRequiredCharacterAbilityPicker(
    drafts: AbilityRequirementDraft[],
  ): Promise<void> {
    const activeGroupId = this.activeRequiredCharacterGroupId();
    const activeBattleId = this.activeRequiredCharacterBattleId();
    const category = this.activeRequiredCharacterAbilityCategory();

    if (!activeBattleId || !activeGroupId) {
      this.requiredCharacterAbilityPickerOpen.set(false);
      return;
    }

    const catalogItems = this.activeRequiredCharacterCatalogItems();
    const nextRequirements =
      category === 'special'
        ? serializeSpecialAbilityDrafts(drafts, catalogItems, { dedupe: false })
        : serializeCategoryAbilityDrafts(drafts, catalogItems, category, { dedupe: false });

    this.battleRequirements.update((battles) =>
      battles.map((battle) =>
        battle.id === activeBattleId
          ? {
              ...battle,
              requiredCharacterGroups: battle.requiredCharacterGroups.map((group) => {
                if (group.id !== activeGroupId) {
                  return group;
                }

                return {
                  ...group,
                  abilities: [
                    ...group.abilities.filter(
                      (requirement) =>
                        !this.requiredCharacterRequirementMatchesCategory(requirement, category),
                    ),
                    ...nextRequirements.map((requirement) => ({
                      ...requirement,
                      slotTokens: [...requirement.slotTokens],
                      requiredCharacterCount: 1,
                    })),
                  ],
                };
              }),
            }
          : battle,
      ),
    );
    this.requiredCharacterAbilityPickerOpen.set(false);
    this.activeRequiredCharacterBattleId.set(null);
    this.activeRequiredCharacterGroupId.set(null);
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async pickManualCharacterInActiveSlot(card: ManualCharacterCardView): Promise<void> {
    const activeRole = this.activeManualSlotRole();
    const isSelected = this.isCharacterSelectedInManualSlot(activeRole, card.character.id);

    if (isSelected || card.branchActions.length === 0) {
      this.toggleCharacterInActiveManualSlot(card.character);
      return;
    }

    if (!this.canAssignCharacterToManualSlot(activeRole, card.character)) {
      return;
    }

    const choosableActions = card.branchActions.filter((action) => !action.disabled);

    const [firstChoosableAction] = choosableActions;

    if (!firstChoosableAction) {
      return;
    }

    const defaultMode =
      choosableActions.find((action) => action.selected)?.mode ?? firstChoosableAction.mode;
    const alert = await this.alertController.create({
      header: card.character.name,
      message: this.t('manual.branchPicker.message'),
      cssClass: 'manual-branch-picker-alert',
      inputs: choosableActions.map((action) => ({
        type: 'radio',
        label: action.label,
        value: action.mode,
        checked: action.mode === defaultMode,
      })),
      buttons: [
        {
          text: this.i18n.translate('common.actions.cancel'),
          role: 'cancel',
        },
        {
          text: this.i18n.translate('common.actions.confirm'),
          handler: (mode: AutoBuildCaptainBranchMode | undefined) => {
            if (!mode) {
              return;
            }

            this.selectCaptainBranchInActiveManualSlot(card.character, mode);
          },
        },
      ],
    });

    await alert.present();
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
              requiredCharacterId: slot.requiredCharacterId ?? null,
              branchSelections: this.resolveNextManualSlotBranchSelections(
                slot,
                character.id,
                null,
              ),
            }
          : slot,
      ),
    );
    this.resetBuildState();
  }

  public selectCaptainBranchInActiveManualSlot(
    character: CharacterDetailRecord,
    mode: AutoBuildCaptainBranchMode,
    event?: Event,
  ): void {
    event?.preventDefault();
    event?.stopPropagation();

    const activeRole = this.activeManualSlotRole();

    if (
      !this.isLeaderManualSlotRole(activeRole) ||
      !this.canUseCaptainBranchMode(character, mode)
    ) {
      return;
    }

    const isSelected = this.isCharacterSelectedInManualSlot(activeRole, character.id);

    if (!isSelected && !this.canAssignCharacterToManualSlot(activeRole, character)) {
      return;
    }

    this.cacheCharacterRecord(character);
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.role !== activeRole) {
          return slot;
        }

        const characterIds = isSelected ? slot.characterIds : [...slot.characterIds, character.id];

        return {
          ...slot,
          characterIds,
          requiredCharacterId: slot.requiredCharacterId ?? null,
          branchSelections: this.resolveNextManualSlotBranchSelections(
            { ...slot, characterIds },
            character.id,
            mode,
          ),
        };
      }),
    );
    this.resetBuildState();
  }

  public addResultCharacterToManualSlot(slot: TeamSlotViewModel): void {
    const manualSlotRole = slot.manualSlotRole;

    if (!manualSlotRole || !this.canAddResultCharacterToManualSlot(slot)) {
      return;
    }

    this.cacheCharacterRecord(slot.character);
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((manualSlot) =>
        manualSlot.role === manualSlotRole
          ? {
              ...manualSlot,
              characterIds: [...manualSlot.characterIds, slot.character.id],
              requiredCharacterId: manualSlot.requiredCharacterId ?? null,
              branchSelections: this.resolveNextManualSlotBranchSelections(
                {
                  ...manualSlot,
                  characterIds: [...manualSlot.characterIds, slot.character.id],
                },
                slot.character.id,
                slot.captainBranchSelection?.mode ?? null,
              ),
            }
          : manualSlot,
      ),
    );
    this.currentTeamId.set(null);
    this.resetSaveFeedbackState();
  }

  public async addSimilarManualPick(
    role: AutoBuildManualSlotRole,
    character: CharacterListItem,
    event?: Event,
  ): Promise<void> {
    event?.stopPropagation();
    this.manualSimilarPickFeedback.set('');

    if (this.building() || !this.isCharacterSelectedInManualSlot(role, character.id)) {
      return;
    }

    const sourceCharacter = await this.resolveDetailedManualPickCharacter(character);

    if (!sourceCharacter) {
      this.manualSimilarPickFeedback.set(
        this.t('manual.similar.feedback.notFound', { name: character.name }),
      );
      return;
    }

    const similarPick = await this.resolveBestSimilarManualPick(role, sourceCharacter);

    if (!similarPick) {
      this.manualSimilarPickFeedback.set(
        this.t('manual.similar.feedback.notFound', { name: character.name }),
      );
      return;
    }

    this.cacheCharacterRecord(similarPick);
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) =>
        slot.role === role
          ? {
              ...slot,
              characterIds: [...slot.characterIds, similarPick.id],
              requiredCharacterId: slot.requiredCharacterId ?? null,
            }
          : slot,
      ),
    );
    this.resetBuildState();
    this.manualSimilarPickFeedback.set(
      this.t('manual.similar.feedback.added', {
        source: character.name,
        match: similarPick.name,
      }),
    );
  }

  public canAddResultCharacterToManualSlot(
    slot: Pick<TeamSlotViewModel, 'character' | 'manualSlotRole'>,
  ): boolean {
    const manualSlotRole = slot.manualSlotRole;

    if (
      !manualSlotRole ||
      this.isCharacterSelectedInManualSlot(manualSlotRole, slot.character.id)
    ) {
      return false;
    }

    return this.canAssignCharacterToManualSlot(manualSlotRole, slot.character);
  }

  public clearManualSlot(role: AutoBuildManualSlotRole, event?: Event): void {
    event?.stopPropagation();
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) =>
        slot.role === role
          ? {
              ...slot,
              characterIds: [],
              requiredCharacterId: null,
              branchSelections: undefined,
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
      currentSlots.map((slot) => {
        if (slot.role !== role) {
          return slot;
        }

        const characterIds = slot.characterIds.filter(
          (selectedCharacterId) => selectedCharacterId !== characterId,
        );
        const branchSelections = this.normalizeManualSlotBranchSelections({
          ...slot,
          characterIds,
          branchSelections: slot.branchSelections?.filter(
            (selection) => selection.characterId !== characterId,
          ),
        });

        return {
          ...slot,
          characterIds,
          requiredCharacterId:
            slot.requiredCharacterId === characterId ? null : slot.requiredCharacterId,
          ...(branchSelections.length ? { branchSelections } : { branchSelections: undefined }),
        };
      }),
    );
    this.resetBuildState();
  }

  public toggleRequiredManualSlotCharacter(
    role: AutoBuildManualSlotRole,
    characterId: number,
    event?: Event,
  ): void {
    event?.preventDefault();
    event?.stopPropagation();

    if (this.building()) {
      return;
    }

    // 869f6td4p. Requiring a pick forces it into the crew, so a Support-only one is never required.
    const supportOnly = isSupportOnlyCharacter(this.lockedCharacterRecords()[characterId]);

    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.role !== role || !slot.characterIds.includes(characterId)) {
          return slot;
        }

        if (supportOnly && slot.requiredCharacterId !== characterId) {
          return slot;
        }

        return {
          ...slot,
          requiredCharacterId: slot.requiredCharacterId === characterId ? null : characterId,
        };
      }),
    );
    this.resetBuildState();
  }

  public requiredManualPickButtonLabel(
    role: AutoBuildManualSlotRole,
    character: Pick<CharacterListItem, 'id' | 'name'>,
  ): string {
    if (this.resolveManualSlotSelection(role).requiredCharacterId === character.id) {
      return this.t('manual.required.actions.clearFor', { name: character.name });
    }

    // 869f6td4p. The toggle refuses a Support-only pick, so it says why instead of going quiet.
    return isSupportOnlyCharacter(this.lockedCharacterRecords()[character.id])
      ? this.t('manual.slotSelection.supportOnly')
      : this.t('manual.required.actions.requireFor', { name: character.name });
  }

  /**
   * 869f6td4p. The compact picker's thumbs are pictures only, so a refused one said nothing but its
   * name. When it cannot be picked its tooltip and accessible name carry the reason too, the one the
   * list view prints under the card. A native button, so a changing label reaches assistive tech.
   */
  public manualCandidateThumbLabel(card: ManualCharacterCardView): string {
    const blocked = !card.isSelectedInActiveSlot && !card.isSelectableInActiveSlot;

    return blocked && card.selectionSupportLabel
      ? `${card.character.name} - ${card.selectionSupportLabel}`
      : card.character.name;
  }

  public requiredManualPickButtonIcon(role: AutoBuildManualSlotRole, characterId: number): string {
    return this.resolveManualSlotSelection(role).requiredCharacterId === characterId
      ? this.requiredManualPickIcon
      : this.optionalManualPickIcon;
  }

  public isCharacterSelectedInManualSlot(
    role: AutoBuildManualSlotRole,
    characterId: number,
  ): boolean {
    return this.resolveManualSlotSelection(role).characterIds.includes(characterId);
  }

  public canAssignCharacterToManualSlot(
    role: AutoBuildManualSlotRole,
    character: Pick<CharacterDetailRecord, 'id' | 'cost'> &
      Partial<Pick<CharacterDetailRecord, 'detail'>>,
  ): boolean {
    if (this.isCharacterSelectedInManualSlot(role, character.id)) {
      return true;
    }

    // 869f6td4p. No crew slot takes a Support-only character, a leader slot included.
    if (isSupportOnlyCharacter(character)) {
      return false;
    }

    return (
      !this.isEffectivelyExcludedCharacter(character.id) &&
      this.characterFitsManualTeamBudget(role, character)
    );
  }

  private canUseCaptainBranchMode(
    character: CharacterDetailRecord,
    mode: AutoBuildCaptainBranchMode,
  ): boolean {
    const branchOptionCount = resolveCaptainCoverageBranchOptions(character).length;

    if (branchOptionCount !== 2) {
      return false;
    }

    return mode !== 'both' || !isVsCaptainCoverageBranchCaptain(character);
  }

  private resolveNextManualSlotBranchSelections(
    slot: AutoBuildManualSlotSelection,
    characterId: number,
    mode: AutoBuildCaptainBranchMode | null,
  ): AutoBuildManualSlotSelection['branchSelections'] {
    const nextSelections = (slot.branchSelections ?? []).filter(
      (selection) => selection.characterId !== characterId,
    );

    if (mode) {
      nextSelections.push({ characterId, mode });
    }

    const normalizedSelections = this.normalizeManualSlotBranchSelections({
      ...slot,
      branchSelections: nextSelections,
    });

    return normalizedSelections.length ? normalizedSelections : undefined;
  }

  private normalizeManualSlotBranchSelections(
    slot: Pick<AutoBuildManualSlotSelection, 'characterIds' | 'branchSelections'>,
  ): NonNullable<AutoBuildManualSlotSelection['branchSelections']> {
    const selectedIdSet = new Set(slot.characterIds);
    const seenIds = new Set<number>();
    const normalizedSelections: NonNullable<AutoBuildManualSlotSelection['branchSelections']> = [];

    for (const selection of slot.branchSelections ?? []) {
      if (
        !selectedIdSet.has(selection.characterId) ||
        seenIds.has(selection.characterId) ||
        !this.isAutoBuildCaptainBranchMode(selection.mode)
      ) {
        continue;
      }

      seenIds.add(selection.characterId);
      normalizedSelections.push({
        characterId: selection.characterId,
        mode: selection.mode,
      });
    }

    return normalizedSelections;
  }

  private isAutoBuildCaptainBranchMode(
    value: string | null | undefined,
  ): value is AutoBuildCaptainBranchMode {
    return value === 'character1' || value === 'character2' || value === 'both';
  }

  public canExcludeCharacter(characterId: number): boolean {
    return this.isExcludedCharacter(characterId)
      ? true
      : !this.selectedExcludeCharacterBoxIds().includes(characterId);
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
    this.persistSelectionState();
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
    this.persistSelectionState();
  }

  /**
   * The button beside Build's reason (869exmkbe). It only ever selects: `selectAllTypes()` toggles
   * back to none when everything is already selected, which a second tap before the button leaves
   * would do.
   */
  public async applyBuildDisabledFix(): Promise<void> {
    const fix = this.buildDisabledFix();

    if (fix === 'types') {
      this.selectedTypes.set([...this.availableTypes]);
    } else if (fix === 'classes') {
      this.selectedClasses.set([...this.availableClasses()]);
    } else {
      return;
    }

    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  public async removeSelectedType(type: AutoTeamBuilderType): Promise<void> {
    this.selectedTypes.set(this.selectedTypes().filter((selectedType) => selectedType !== type));
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
    this.persistSelectionState();
  }

  public async removeSelectedClass(characterClass: string): Promise<void> {
    this.selectedClasses.set(
      this.selectedClasses().filter((selectedClass) => selectedClass !== characterClass),
    );
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
    this.persistSelectionState();
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
    this.buildPaused.set(false);
    this.pauseAfterBuildCancellation = false;
    this.building.set(true);
    this.previewResult.set(null);
    this.resetBuildState();
    this.buildStartedAtMs = Date.now();
    const constraints = this.buildCurrentAutoTeamBuildConstraints();

    this.lastBuildRequest = {
      types: this.selectedTypes(),
      selectedClasses: this.selectedClasses(),
      ...constraints,
    };
    this.lastBuildContext = this.buildDebugReportContext();
    const buildInputRevision = this.buildInputRevision;
    this.activeBuildInputRevision = buildInputRevision;
    this.startBuildProgressTicker();
    void this.scrollToBottom();

    try {
      const executionOptions: AutoTeamBuildExecutionOptions = {
        signal: abortController.signal,
        onProgress: (snapshot) => this.handleBuildProgressSnapshot(snapshot),
        onExecutionPath: (path) => {
          if (buildInputRevision === this.buildInputRevision) {
            this.lastExecutionPath = path;
          }
        },
        onInfeasibility: (diagnosis) => {
          if (buildInputRevision === this.buildInputRevision) {
            this.lastBuildInfeasibility.set(diagnosis);
          }
        },
        onPreviewResult: (preview) => {
          // A preview from a search the reader has already replaced is not a preview of anything.
          if (buildInputRevision === this.buildInputRevision) {
            this.previewResult.set(preview);
          }
        },
        workerCount: this.userState.resolveAutoTeamBuilderWorkerCount(),
        getWorkerCount: () => this.userState.resolveAutoTeamBuilderWorkerCount(),
      };
      const guidedAutoBuildActive = this.guidedAutoBuildEnabled();
      const guidedSlotRole = guidedAutoBuildActive
        ? this.resolveNextGuidedAutoBuildSlotRole()
        : null;
      const nextResult = await this.runCurrentAutoTeamBuild(constraints, executionOptions);

      if (buildInputRevision !== this.buildInputRevision) {
        // The inputs changed while the search ran; the change already cleared the result.
        return;
      }

      if (nextResult) {
        if (guidedAutoBuildActive && nextResult.relaxation.usedFallback) {
          this.failBuild(
            'guidedRelaxedOnly',
            this.resolveGuidedRelaxedOnlyMessage(nextResult),
            nextResult,
          );
        } else if (guidedSlotRole) {
          if (!this.applyGuidedAutoBuildSlot(nextResult, guidedSlotRole)) {
            // A team came back, but not one this slot can take: say that, not "no team".
            this.failBuild('guidedSlotRejected', this.resolveBuildFailureMessage(), nextResult);
          }
        } else {
          for (const slot of nextResult.slots) this.cacheCharacterRecord(slot.character);

          this.applyResult(nextResult);
        }
      } else {
        this.failBuild('noTeam', this.resolveBuildFailureMessage());
      }

      void this.scrollToBottom();
    } catch (error) {
      // A build whose inputs changed answers nothing: no restore, no "search too large", no error.
      if (buildInputRevision !== this.buildInputRevision) {
        return;
      }

      if (isAutoTeamBuildCancelledError(error)) {
        if (this.resetAfterBuildCancellation) {
          return;
        }

        // The restored result is the earlier build's; what this cancelled one was asked, how long
        // it ran and where, describes nothing on screen.
        this.forgetCapturedBuildState();

        if (this.pauseAfterBuildCancellation) {
          this.applyResult(previousResult);
          this.currentTeamId.set(previousTeamId);
          this.errorMessage.set('');
          this.buildPaused.set(true);
          this.pauseAfterBuildCancellation = false;
          return;
        }

        this.applyResult(previousResult);
        this.currentTeamId.set(previousTeamId);
        this.errorMessage.set('');
        return;
      }

      if (isAutoTeamBuildSearchTooLargeError(error)) {
        this.failBuild('searchTooLarge', this.t('errors.searchTooLarge'));
        void this.scrollToBottom();
        return;
      }

      console.error(error);
      this.failBuild('buildFailed', this.t('errors.buildFailed'));
      void this.scrollToBottom();
    } finally {
      this.buildAbortController = null;
      this.activeBuildInputRevision = null;
      this.buildProgress.set(null);
      this.stopBuildProgressTicker();
      // In the `finally`, so a cancelled or failed search drops it too. A provisional team left on
      // screen after the search that produced it has stopped is worse than never showing one.
      this.previewResult.set(null);
      this.building.set(false);
    }
  }

  private runCurrentAutoTeamBuild(
    constraints: AutoBuildConstraints,
    executionOptions: AutoTeamBuildExecutionOptions,
  ): Promise<AutoBuildResult | null> {
    return this.autoTeamBuilder.buildTeam(
      this.selectedClasses(),
      this.selectedTypes(),
      constraints,
      executionOptions,
    );
  }

  /** Everything a build sends besides the types and classes; the debug report reads it too. */
  private buildCurrentAutoTeamBuildConstraints(): AutoBuildConstraints {
    return {
      candidateCharacterIds: this.effectiveAutoBuildCandidateIds(),
      selectedCharacterTags: this.selectedCharacterTags(),
      characterTagSets: this.characterTagSets(),
      selectedCharacterNames: this.selectedCharacterNames(),
      requireAllSelectedTypesInTeam: this.derivedRequireAllSelectedTypesInTeam(),
      // Any class selection means "characters of these classes": each unit holds at least one,
      // and the team need not include every class (owner, 2026-09-11, 869exmmfq). Two classes
      // used to mean "every unit holds both", which is not how a Fighter-and-Slasher captain
      // reads in-game - it boosts units of either class.
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedClassesInTeam: false,
      requireAllSelectedCharacterTagsInTeam: this.derivedRequireAllSelectedCharacterTagsInTeam(),
      requireAllSelectedCharacterNamesInTeam: this.derivedRequireAllSelectedCharacterNamesInTeam(),
      requireAllSlotsInLeaderSuperEffectScope: this.requireAllSlotsInLeaderSuperEffectScope(),
      requireFullCaptainAbilityCoverage: this.requireFullCaptainAbilityCoverage(),
      requireBothLeadersFullCaptainAbilityCoverage:
        this.requireBothLeadersFullCaptainAbilityCoverage(),
      strictSuperSpecialCriteriaCoverage: this.requireSuperSpecialCriteriaCoverage(),
      strictSuperTandemCriteriaCoverage: this.requireSuperTandemCriteriaCoverage(),
      requireUniqueBaseCharacterNames: true,
      requiredAbilities: this.pageRequiredAbilities(),
      requiredCharacterGroups: [],
      battleRequirements: this.pageBattleRequirements(),
      enemyMechanics: this.pageEnemyMechanics(),
      favoritesOnly: this.favoritesOnly(),
      boostedCharacterIds: [...this.boostedCharacterIds()],
      ...toSparseAvoidPreferFields(this.avoidPreferRules()),
      allowAnyFriendCaptainAutoFill: this.allowAnyFriendCaptainAutoFill(),
      favoriteCharacterIds: this.favoriteCharacterIds(),
      favoriteShipsOnly: this.favoriteShipsOnly(),
      favoriteShipIds: this.favoriteShipIds(),
      leaderBoostFilters: this.leaderBoostFilters(),
      leaderBoostRanges: this.cloneLeaderBoostRanges(this.leaderBoostRanges()),
      /*
       * 869f1935z. These five are written as constants on purpose, and the applier reads them back
       * as the same constants, so the pair round-trips a fixed value rather than the reader's.
       *
       * That is correct TODAY only because this screen exposes none of them: `maxTotalCost`, the
       * two cost ranges, `requireAllSelectedClassesPerCharacter` and `requireUniqueBaseCharacterNames`
       * have zero template references here, so there is no reader value to lose. Captain Coverage
       * does have a cost cap, which is why the fields exist on the shared payload at all.
       *
       * **Wire any of them to a control on this page and this becomes a silent data loss** - the
       * export writes the default, the import restores the default, and the reader's setting
       * disappears between the two with nothing on screen to explain it. That is exactly the shape
       * of the `enemyMechanicDrafts.set([])` defect this batch already fixed twice. Read the signal
       * here and in `applySelectionPresetState` in the same change.
       */
      leaderCostRange: createEmptyAutoBuildCostRange(),
      subCostRange: createEmptyAutoBuildCostRange(),
      maxTotalCost: null,
      manualSlots: this.serializeManualSlots(),
      excludedCharacterIds: this.effectiveExcludedCharacterIds(),
      manualShipId: this.selectedManualShipId(),
      requireManualShip: this.requireManualShip(),
      excludedShipIds: this.excludedShipIds(),
    };
  }

  private resolveNextGuidedAutoBuildSlotRole(): AutoBuildManualSlotRole | null {
    return (
      GUIDED_AUTO_BUILD_SLOT_ORDER.find(
        (role) => !this.isGuidedAutoBuildSlotLocked(this.resolveManualSlotSelection(role)),
      ) ?? null
    );
  }

  private isGuidedAutoBuildSlotLocked(slot: AutoBuildManualSlotSelection): boolean {
    return slot.requiredCharacterId != null && slot.characterIds.includes(slot.requiredCharacterId);
  }

  private applyGuidedAutoBuildSlot(
    result: AutoBuildResult,
    role: AutoBuildManualSlotRole,
  ): boolean {
    const resultSlot = this.resolveGuidedAutoBuildResultSlot(result, role);
    const manualSlot = this.resolveManualSlotSelection(role);

    if (
      !resultSlot ||
      this.isGuidedAutoBuildSlotLocked(manualSlot) ||
      (manualSlot.characterIds.length > 0 &&
        !manualSlot.characterIds.includes(resultSlot.character.id)) ||
      !this.canAssignCharacterToManualSlot(role, resultSlot.character)
    ) {
      return false;
    }

    this.cacheCharacterRecord(resultSlot.character);
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.role !== role) {
          return slot;
        }

        const characterIds = [resultSlot.character.id];
        const branchSelections = this.resolveNextManualSlotBranchSelections(
          { ...slot, characterIds },
          resultSlot.character.id,
          resultSlot.captainBranchSelection?.mode ?? null,
        );

        return {
          ...slot,
          characterIds,
          requiredCharacterId: resultSlot.character.id,
          ...(branchSelections ? { branchSelections } : { branchSelections: undefined }),
        };
      }),
    );
    this.activeManualSlotRole.set(role);
    this.currentTeamId.set(null);
    this.resetSaveFeedbackState();

    return true;
  }

  private resolveGuidedAutoBuildResultSlot(
    result: AutoBuildResult,
    role: AutoBuildManualSlotRole,
  ): AutoBuildResult['slots'][number] | null {
    if (role === 'captain' || role === 'friendCaptain') {
      return result.slots.find((slot) => slot.role === role) ?? null;
    }

    const subIndex = AUTO_BUILD_MANUAL_SUB_SLOT_ROLES.indexOf(role);

    return result.slots.filter((slot) => slot.role === 'sub')[subIndex] ?? null;
  }

  public cancelBuild(): void {
    this.pauseAfterBuildCancellation = false;
    this.buildPaused.set(false);
    this.buildAbortController?.abort();
  }

  public pauseBuild(): void {
    if (!this.building()) {
      return;
    }

    this.pauseAfterBuildCancellation = true;
    this.buildAbortController?.abort();
  }

  public async resumeBuild(): Promise<void> {
    if (!this.buildPaused()) {
      return;
    }

    this.buildPaused.set(false);
    this.pauseAfterBuildCancellation = false;
    await this.buildTeam();
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
    await this.persistResultSnapshot(null);
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
      /*
       * An absent Friend Captain seat is exported as NO friend leader, never as
       * the Captain. `?? current.slots[0]?.character.id` used to sit here, which
       * is the shape CLAUDE.md forbids - "never re-derive 'the reader picked
       * nobody' by comparing slots[1] to slots[0]" - because the Captain in both
       * seats is a legal team a reader may have chosen deliberately, and it is
       * indistinguishable from this.
       *
       * The engine fills both leader seats today, so the branch never ran and no
       * reader ever saw a wrong label. It is removed because the next person to
       * allow a partially built result would have shipped one silently.
       */
      current.slots[1]?.character.id ?? null,
      exportedAt,
    );
  }

  public buildSavedTeamImportPayload(exportedAt = new Date().toISOString()) {
    const current = this.result();

    if (!current) {
      return null;
    }

    const fallbackName = this.i18n.translate('common.defaults.newCrew');
    const normalizedName = this.teamName().trim() || fallbackName;
    const normalizedTimestamp = exportedAt.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-|-$/g, '');

    return buildSavedTeamsTransferPayload(
      [
        {
          id: `auto-team-builder-${normalizedTimestamp || Date.now()}`,
          name: normalizedName,
          notes: this.notes().trim(),
          shipId: current.shipSelection?.ship.id ?? null,
          slots: current.slots.map((slot) => slot.character.id),
          createdAt: exportedAt,
          updatedAt: exportedAt,
        },
      ],
      exportedAt,
    );
  }

  public buildSelectionExportPayload(
    exportedAt = new Date().toISOString(),
  ): AutoTeamSelectionExportPayload | null {
    if (!this.canDownloadSelectionJson()) {
      return null;
    }

    const generatedTeamExport = this.buildTeamExportPayload(exportedAt);
    const savedTeamImport = this.buildSavedTeamImportPayload(exportedAt);

    return buildAutoTeamSelectionExportPayload({
      selectedTypes: this.selectedTypes(),
      selectedClasses: this.selectedClasses(),
      selectedCharacterTags: this.selectedCharacterTags(),
      characterTagSets: this.characterTagSets(),
      selectedCharacterNames: this.selectedCharacterNames(),
      requiredAbilities: this.pageRequiredAbilities(),
      requiredCharacterGroups: [],
      battleRequirements: this.pageBattleRequirements(),
      enemyMechanics: this.pageEnemyMechanics(),
      requireAllSelectedTypesInTeam: this.derivedRequireAllSelectedTypesInTeam(),
      requireAllSelectedClassesPerCharacter: false,
      requireAllSelectedCharacterTagsInTeam: this.derivedRequireAllSelectedCharacterTagsInTeam(),
      requireAllSelectedCharacterNamesInTeam: this.derivedRequireAllSelectedCharacterNamesInTeam(),
      requireAllSlotsInLeaderSuperEffectScope: this.requireAllSlotsInLeaderSuperEffectScope(),
      requireFullCaptainAbilityCoverage: this.requireFullCaptainAbilityCoverage(),
      requireBothLeadersFullCaptainAbilityCoverage:
        this.requireBothLeadersFullCaptainAbilityCoverage(),
      requireSuperSpecialCriteriaCoverage: this.requireSuperSpecialCriteriaCoverage(),
      requireSuperTandemCriteriaCoverage: this.requireSuperTandemCriteriaCoverage(),
      requireUniqueBaseCharacterNames: true,
      favoritesOnly: this.favoritesOnly(),
      allowAnyFriendCaptainAutoFill: this.allowAnyFriendCaptainAutoFill(),
      favoriteCount: this.favoriteCharacterIds().length,
      favoriteShipsOnly: this.favoriteShipsOnly(),
      favoriteShipCount: this.favoriteShipIds().length,
      leaderBoostFilters: this.leaderBoostFilters(),
      leaderBoostRanges: this.cloneLeaderBoostRanges(this.leaderBoostRanges()),
      leaderCostRange: createEmptyAutoBuildCostRange(),
      subCostRange: createEmptyAutoBuildCostRange(),
      maxTotalCost: null,
      // 869f63gma. Read here AND in `applySelectionPresetState`, or a preset drops the enemy's rules.
      avoidPreferRules: this.avoidPreferRules(),
      manualSlots: this.serializeManualSlots(),
      lockedCharacterIds: this.lockedCharacterIds(),
      lockedCharacters: this.lockedCharacters(),
      excludedCharacterIds: this.excludedCharacterIds(),
      excludedCharacters: this.excludedCharacters(),
      selectedLeaderIds: this.selectedLeaderIds(),
      captainLeaderId: this.effectiveCaptainLeaderId(),
      friendCaptainLeaderId: this.selectedFriendLeaderId(),
      manualShipId: this.selectedManualShipId(),
      manualShip: this.selectedManualShip(),
      excludedShipIds: this.excludedShipIds(),
      excludedShips: this.excludedShips(),
      generatedTeamExport,
      savedTeamImport,
      exportedAt,
    });
  }

  /**
   * "Copy debug report" (869exmkf4; owner, 2026-09-11): the last build as text for a bug report.
   * When the clipboard refuses, the same text is shown to copy by hand. Nothing is sent anywhere:
   * the player pastes it where they choose, and the link beside it only opens a new GitHub issue.
   */
  public async copyDebugReport(): Promise<void> {
    if (!this.canCopyDebugReport()) {
      return;
    }

    const text = formatAutoTeamDebugReportMarkdown(this.buildDebugReport());
    const buildInputRevision = this.buildInputRevision;
    const failureKind = await copyTextToClipboard(text);

    // A change during the copy retired this report; its feedback would land on the next one.
    if (buildInputRevision !== this.buildInputRevision) {
      return;
    }

    this.debugReportFeedback.set(
      failureKind === null
        ? {
            tone: 'success',
            title: this.t('debugReport.copiedTitle'),
            details: [this.t('debugReport.copiedDescription')],
            manualCopyText: null,
          }
        : {
            tone: 'warning',
            title: this.t('debugReport.copyFailedTitle'),
            details: [this.t('debugReport.manualCopy')],
            manualCopyText: text,
          },
    );

    if (failureKind !== null) {
      this.focusDebugReportManualCopy();
    }
  }

  public buildDebugReport(createdAt = new Date().toISOString()): AutoTeamDebugReport {
    const result = this.result() ?? this.unappliedGuidedResult;

    return buildAutoTeamDebugReport({
      createdAt,
      app: {
        version: packageJson.version,
        platform: Capacitor.getPlatform(),
        language: this.i18n.activeLanguage(),
      },
      dataset: this.summary(),
      abilityCatalogGeneratedAt: this.abilityCatalog()?.generatedAt ?? null,
      localOverrideCharacterIds: [...this.characterOverrides.overridesByCharacterId().keys()],
      executionPath: this.lastExecutionPath,
      context: this.lastBuildContext ?? this.buildDebugReportContext(),
      // With no team there is no requested input on a result: report what the page sent.
      request: result?.requestedInput ??
        this.lastBuildRequest ?? {
          types: this.selectedTypes(),
          selectedClasses: this.selectedClasses(),
          ...this.buildCurrentAutoTeamBuildConstraints(),
        },
      result,
      failure: this.lastBuildFailure(),
      infeasibility: this.lastBuildInfeasibility(),
      rules: result ? this.buildFinalReportRows(result) : [],
      performance: this.lastBuildStats(),
    });
  }

  public selectDebugReportText(event: Event): void {
    (event.target as HTMLTextAreaElement | null)?.select?.();
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
          details: this.failureDetails('saveFailed', this.t('candidatePoolBox.saveFailedDescription')),
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
        details: this.failureDetails('saveFailed', this.t('candidatePoolBox.saveFailedDescription')),
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

    void givePlayerFile({
      filename: 'optc-auto-builder-abilities.json',
      contents: JSON.stringify(catalog, null, 2),
      mimeType: JSON_EXPORT_MIME_TYPE,
    });
  }

  public downloadTeamJson(): void {
    downloadAutoTeamExport(this.buildTeamExportPayload());
  }

  public downloadSavedTeamImportJson(): void {
    downloadSavedTeamsExport(this.buildSavedTeamImportPayload());
  }

  private resolveBuildProgressPercent(progress: AutoBuildProgressSnapshot): number {
    if (!progress.totalAttempts) {
      return 0;
    }

    if (progress.stage === 'completed') {
      return 100;
    }

    const innerProgress =
      typeof progress.completedWorkUnits === 'number' &&
      typeof progress.totalWorkUnits === 'number' &&
      progress.totalWorkUnits > 0
        ? Math.max(0, Math.min(1, progress.completedWorkUnits / progress.totalWorkUnits))
        : 0;
    const activeSearchProgress =
      progress.stage === 'exactAttempt' || progress.stage === 'fallbackAttempt'
        ? progress.completedAttempts + innerProgress
        : progress.completedAttempts;
    const percent = Math.round((activeSearchProgress / progress.totalAttempts) * 100);

    return Math.max(0, Math.min(99, percent));
  }

  private formatProgressExclusionCounts(
    translationKey: string,
    counts: AutoBuildProgressExclusionCounts | undefined,
  ): string {
    if (!counts || counts.total <= 0) {
      return '';
    }

    return this.t(translationKey, {
      total: counts.total.toLocaleString(formattingLanguage()),
      alreadyUsed: counts.alreadyUsed.toLocaleString(formattingLanguage()),
      duplicateBaseCharacter: counts.duplicateBaseCharacter.toLocaleString(formattingLanguage()),
      leaderScope: counts.leaderScope.toLocaleString(formattingLanguage()),
      costBudget: counts.costBudget.toLocaleString(formattingLanguage()),
      missingRequiredGroup: counts.missingRequiredGroup.toLocaleString(formattingLanguage()),
    });
  }

  public async saveTeam(): Promise<void> {
    const current = this.result();

    if (!current || this.saveUiLocked()) {
      return;
    }

    this.saveUiLocked.set(true);
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
      await this.refreshAllCompareSnapshots();
    } catch (error) {
      console.error(error);

      if (this.destroyed) {
        return;
      }

      this.saveFeedbackError.set(this.t('save.error'));
    } finally {
      if (!this.destroyed) {
        this.saveUiLocked.set(false);
      }
    }
  }

  /** A refused copy leaves the report in a textarea: focus it, which also selects the text. */
  private focusDebugReportManualCopy(): void {
    const focus = (): void => this.debugReportManualCopy?.nativeElement.focus?.();

    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(focus);
      return;
    }

    globalThis.setTimeout(focus, 0);
  }

  /** What the last build was asked, how long it took and where it ran: all of one build. */
  private forgetCapturedBuildState(): void {
    this.lastBuildRequest = null;
    this.lastBuildContext = null;
    this.unappliedGuidedResult = null;
    this.unappliedReplacedCaptain.set(null);
    this.lastExecutionPath = null;
    this.lastBuildStats.set(null);
  }

  private failBuild(
    code: AutoTeamBuildFailureCode,
    message: string,
    unappliedResult: AutoBuildResult | null = null,
  ): void {
    this.unappliedGuidedResult = unappliedResult;
    this.unappliedReplacedCaptain.set(unappliedResult?.relaxation.replacedCaptain ?? null);
    this.lastBuildFailure.set(code);
    this.errorMessage.set(message);
  }

  /** 869f333ey (D5). Puts the Captain the rejected team was led by into the Captain slot. */
  public useProposedCaptain(): void {
    const proposal = this.proposedCaptain();
    const resultSlot = this.unappliedGuidedResult?.slots.find((slot) => slot.role === 'captain');

    if (this.building() || !proposal || !resultSlot || resultSlot.character.id !== proposal.toCharacterId) {
      return;
    }

    this.cacheCharacterRecord(resultSlot.character);
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) => {
        if (slot.role !== 'captain') {
          return slot;
        }

        const characterIds = [resultSlot.character.id];
        const branchSelections = this.resolveNextManualSlotBranchSelections(
          { ...slot, characterIds },
          resultSlot.character.id,
          resultSlot.captainBranchSelection?.mode ?? null,
        );

        return {
          ...slot,
          characterIds,
          // A Captain the reader had locked stays locked - it is now this one.
          requiredCharacterId: slot.requiredCharacterId ? resultSlot.character.id : null,
          ...(branchSelections ? { branchSelections } : { branchSelections: undefined }),
        };
      }),
    );
    this.unappliedGuidedResult = null;
    this.unappliedReplacedCaptain.set(null);
    this.lastBuildFailure.set(null);
    this.errorMessage.set('');
    this.activeManualSlotRole.set('captain');
    this.currentTeamId.set(null);
    this.resetSaveFeedbackState();
  }

  private buildDebugReportContext(): AutoTeamDebugReportContext {
    const hasBox = this.selectedCharacterBox() !== null;
    const favoritesOnly = this.favoritesOnly();

    return {
      candidateSource: hasBox
        ? favoritesOnly
          ? 'boxFavorites'
          : 'box'
        : favoritesOnly
          ? 'favorites'
          : 'all',
      candidatePoolSize: this.effectiveAutoBuildCandidateIds()?.length ?? null,
      boxCharacterCount: hasBox ? this.selectedCharacterBoxIds().length : null,
      excludeBoxCharacterCount:
        this.selectedExcludeCharacterBox() === null
          ? null
          : this.selectedExcludeCharacterBoxIds().length,
      favoriteCharacterCount: this.favoriteCharacterIds().length,
      guidedAutoBuild: this.guidedAutoBuildEnabled(),
      workerCount: this.userState.resolveAutoTeamBuilderWorkerCount(),
    };
  }

  private resetBuildState(): void {
    this.buildInputRevision += 1;
    this.buildInputsUntouched.set(false);
    this.lastBuildInfeasibility.set(null);

    // An input changed under a running build - a page re-entry reset, a preset import. Stop the
    // search now rather than let it run on unseen with every control still locked. A build's own
    // reset runs before it records its revision, so it never stops itself.
    if (
      this.activeBuildInputRevision !== null &&
      this.activeBuildInputRevision !== this.buildInputRevision
    ) {
      this.buildAbortController?.abort();
    }

    this.buildPaused.set(false);
    this.buildProgress.set(null);
    this.buildProgressFloorPercent.set(0);
    this.applyResult(null);
    this.errorMessage.set('');
    this.lastBuildFailure.set(null);
    this.lastBuildStats.set(null);
    this.debugReportFeedback.set(null);
    this.forgetCapturedBuildState();
    this.manualSimilarPickFeedback.set('');
    this.currentTeamId.set(null);
    this.resetSaveFeedbackState();
  }

  private handleBuildProgressSnapshot(snapshot: AutoBuildProgressSnapshot): void {
    const previous = this.buildProgress();
    const receivedAt = Date.now();

    if (
      !previous ||
      this.resolveBuildProgressStepKey(previous) !== this.resolveBuildProgressStepKey(snapshot)
    ) {
      this.currentBuildStepStartedAtMs.set(receivedAt);
    }

    this.buildProgressFloorPercent.set(
      snapshot.stage === 'completed'
        ? 100
        : Math.max(this.buildProgressFloorPercent(), this.resolveBuildProgressPercent(snapshot)),
    );
    this.buildProgressSnapshotReceivedAtMs.set(receivedAt);
    this.buildProgress.set(snapshot);

    // The progress is dropped when the build ends; its last reading is what a report needs.
    if (snapshot.stage === 'completed' && this.buildStartedAtMs !== null) {
      this.lastBuildStats.set({
        wallMs: Math.max(0, receivedAt - this.buildStartedAtMs),
        searchMs: snapshot.elapsedMs,
        attemptsCompleted: snapshot.completedAttempts,
        totalAttempts: snapshot.totalAttempts,
        activeWorkers: snapshot.activeWorkerCount ?? null,
      });
    }
  }

  private resolveBuildProgressStepKey(snapshot: AutoBuildProgressSnapshot): string {
    const current = snapshot.messageParams?.['current'] ?? '';
    const total = snapshot.messageParams?.['total'] ?? '';

    return `${snapshot.stage}:${snapshot.messageKey}:${current}:${total}`;
  }

  private startBuildProgressTicker(): void {
    this.stopBuildProgressTicker();
    this.currentBuildStepStartedAtMs.set(Date.now());
    this.buildProgressNowMs.set(Date.now());
    this.buildProgressSnapshotReceivedAtMs.set(null);
    this.progressTicker = globalThis.setInterval(
      () => this.buildProgressNowMs.set(Date.now()),
      1000,
    );
  }

  private stopBuildProgressTicker(): void {
    if (this.progressTicker) {
      globalThis.clearInterval(this.progressTicker);
      this.progressTicker = null;
    }

    this.currentBuildStepStartedAtMs.set(null);
    this.buildProgressSnapshotReceivedAtMs.set(null);
  }

  private async loadAvailableCharacterTags(): Promise<void> {
    if (typeof this.repository.getAvailableCharacterTags !== 'function') {
      return;
    }

    try {
      this.availableCharacterTags.set(await this.repository.getAvailableCharacterTags());
    } catch {
      this.availableCharacterTags.set([]);
    }
  }

  private async resetPageState(): Promise<void> {
    const defaultFilters = buildDefaultAutoTeamBuilderFilterState(this.availableClasses());

    this.expandedEmptySections.set(new Set());
    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.crewmateAbilityPickerOpen.set(false);
    this.potentialAbilityPickerOpen.set(false);
    this.supportAbilityPickerOpen.set(false);
    this.requiredCharacterAbilityPickerOpen.set(false);
    this.activeRequiredCharacterBattleId.set(null);
    this.activeRequiredCharacterGroupId.set(null);
    this.selectedTypes.set(defaultFilters.selectedTypes);
    this.selectedClasses.set(defaultFilters.selectedClasses);
    this.characterTagSets.set(cloneCharacterTagSetSelection(defaultFilters.characterTagSets));
    this.characterTagSetPickerOpen.set(false);
    this.selectedCharacterNames.set(defaultFilters.selectedCharacterNames);
    this.characterNameDraft.set('');
    this.leaderBoostFilters.set(defaultFilters.leaderBoostFilters);
    this.leaderBoostRanges.set(this.cloneLeaderBoostRanges(defaultFilters.leaderBoostRanges));
    this.leaderCostRange.set({ ...defaultFilters.leaderCostRange });
    this.subCostRange.set({ ...defaultFilters.subCostRange });
    this.maxTotalCost.set(defaultFilters.maxTotalCost);
    this.enemyMechanicDrafts.set([]);
    this.captainAbilityDrafts.set([]);
    this.requiredAbilityDrafts.set([]);
    this.crewmateAbilityDrafts.set([]);
    this.potentialAbilityDrafts.set([]);
    this.supportAbilityDrafts.set([]);
    this.battleRequirements.set([createEmptyBattleRequirement(0)]);
    this.lockedCharacterRecords.set({});
    this.manualSearchTerm.set('');
    this.requirementSourceSearchTerm.set('');
    this.manualShipSearchTerm.set('');
    this.excludeCharacterSearchTerm.set('');
    this.excludeShipSearchTerm.set('');
    this.manualCandidates.set([]);
    this.manualCandidatePanelState.set(createCharacterPickerPanelState());
    this.excludedCandidates.set([]);
    this.excludedCandidatePanelState.set(createCharacterPickerPanelState());
    this.requirementSourceCandidates.set([]);
    this.requirementSourceCandidatesLoading.set(false);
    this.requirementSourceVisibleCount.set(CHARACTER_PICKER_PAGE_SIZE);
    this.requirementSourceFilters = null;
    this.requirementSourceFiltersById = null;
    this.requirementSourceRequestId += 1;
    this.clearCharacterPickerTagFilter('manual');
    this.clearCharacterPickerTagFilter('excluded');
    this.requirementSourceTagSelection.set(createEmptyCharacterTagSetSelection());
    this.requirementSourceTagCharacterIds.set(undefined);
    this.manualShipPanelState.set(createShipPickerPanelState());
    this.excludedShipPanelState.set(createShipPickerPanelState());
    this.shipPickerMode.set('characters');
    this.excludePickerMode.set('characters');
    this.manualPickerModalOpen.set(false);
    this.excludePickerModalOpen.set(false);
    this.requirementSourceModalOpen.set(false);
    this.manualSlots.set(createEmptyAutoBuildManualSlots());
    this.activeManualSlotRole.set('captain');
    this.excludedCharacterIds.set([]);
    this.selectedManualShipId.set(null);
    // The lock belongs to the ship it was set on, exactly as clearManualShipSelection() pairs
    // them. Left behind, it silently locks whichever ship is picked next - and, because every
    // preset import runs this reset first, the imported ship too.
    this.requireManualShip.set(false);
    this.excludedShipIds.set([]);
    this.requireAllSelectedTypesInTeam.set(defaultFilters.requireAllSelectedTypesInTeam);
    this.requireAllSelectedClassesPerCharacter.set(
      defaultFilters.requireAllSelectedClassesPerCharacter,
    );
    this.requireAllSelectedCharacterTagsInTeam.set(
      defaultFilters.requireAllSelectedCharacterTagsInTeam,
    );
    this.requireAllSelectedCharacterNamesInTeam.set(
      defaultFilters.requireAllSelectedCharacterNamesInTeam,
    );
    this.requireAllSlotsInLeaderSuperEffectScope.set(
      defaultFilters.requireAllSlotsInLeaderSuperEffectScope,
    );
    this.requireFullCaptainAbilityCoverage.set(defaultFilters.requireFullCaptainAbilityCoverage);
    this.requireBothLeadersFullCaptainAbilityCoverage.set(
      defaultFilters.requireBothLeadersFullCaptainAbilityCoverage,
    );
    this.requireSuperSpecialCriteriaCoverage.set(
      defaultFilters.requireSuperSpecialCriteriaCoverage,
    );
    this.requireSuperTandemCriteriaCoverage.set(defaultFilters.requireSuperTandemCriteriaCoverage);
    this.requireUniqueBaseCharacterNames.set(true);
    this.selectedCharacterBoxId.set(null);
    this.selectedExcludeCharacterBoxId.set(null);
    this.favoritesOnly.set(defaultFilters.favoritesOnly);
    this.allowAnyFriendCaptainAutoFill.set(defaultFilters.allowAnyFriendCaptainAutoFill);
    this.guidedAutoBuildEnabled.set(false);
    this.favoriteShipsOnly.set(defaultFilters.favoriteShipsOnly);
    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
    this.notes.set('');
    this.presetImportFeedback.set(null);
    this.candidatePoolBoxFeedback.set(null);
    this.loadedEnemyPresetName.set(null);
    this.avoidPreferRules.set(createEmptyAvoidPreferRules());
    this.resetBuildState();
    this.buildInputsUntouched.set(true);
    this.syncShipPickerPanelStates();
  }

  private async importSelectionPreset(file: File): Promise<void> {
    try {
      const rawContent = await file.text();
      const payload = parseAutoTeamSelectionImportPayload(rawContent);
      const importedCharacterIds = this.collectSelectionPresetImportCharacterIds(payload);
      // 869f6td4p. With their details, so a Support-only pick is marked and never required.
      const availableLockedCharacters =
        await this.repository.getDetailedCharactersByIds(importedCharacterIds);
      const importResult = sanitizeAutoTeamSelectionImportPayload(payload, {
        availableTypes: this.availableTypes,
        availableClasses: this.availableClasses(),
        abilityCatalogItems: this.availableAbilityCatalogItems(),
        availableLockedCharacters,
        availableShips: this.ships(),
      });

      await this.applyImportedSelectionPreset(
        importResult,
        availableLockedCharacters,
        file.name,
        payload,
      );
    } catch (error) {
      this.presetImportFeedback.set({
        tone: 'error',
        title: this.t('preset.importFailedTitle'),
        details: this.failureDetails('invalidFile', this.resolvePresetImportError(error), error),
      });
    }
  }

  private collectSelectionPresetImportCharacterIds(
    payload: AutoTeamSelectionExportPayload,
  ): number[] {
    const characterIds = new Set<number>();
    const addCharacterId = (characterId: unknown): void => {
      if (typeof characterId === 'number' && Number.isInteger(characterId) && characterId > 0) {
        characterIds.add(characterId);
      }
    };

    payload.manualSelection.lockedCharacterIds.forEach(addCharacterId);

    if (Array.isArray(payload.manualSelection.excludedCharacterIds)) {
      payload.manualSelection.excludedCharacterIds.forEach(addCharacterId);
    }

    if (Array.isArray(payload.manualSelection.manualSlots)) {
      payload.manualSelection.manualSlots.forEach((slot) => {
        if (Array.isArray(slot.characterIds)) {
          slot.characterIds.forEach(addCharacterId);
        }
      });
    }

    if (Array.isArray(payload.generatedTeamExport?.team)) {
      payload.generatedTeamExport.team.forEach((slot) => addCharacterId(slot.character?.id));
    }

    this.resolveEmbeddedPresetSavedTeam(payload)?.slots.forEach(addCharacterId);

    return [...characterIds];
  }

  private applyEmbeddedPresetTeam(
    payload: AutoTeamSelectionExportPayload,
    availableCharacters: CharacterListItem[],
    warnings: AutoTeamSelectionImportMessage[],
  ): void {
    const savedTeam = this.resolveEmbeddedPresetSavedTeam(payload);
    const generatedTeamSlotIds = Array.isArray(payload.generatedTeamExport?.team)
      ? payload.generatedTeamExport.team
          .slice()
          .sort((left, right) => left.slotIndex - right.slotIndex)
          .map((slot) => slot.character?.id)
      : null;
    const embeddedSlotIds = savedTeam?.slots ?? generatedTeamSlotIds;

    if (!embeddedSlotIds) {
      return;
    }

    const availableCharacterIdSet = new Set(availableCharacters.map((character) => character.id));
    const manualSlots = createEmptyAutoBuildManualSlots();
    let missingCharacterCount = 0;

    embeddedSlotIds.forEach((characterId, index) => {
      const role = AUTO_BUILD_MANUAL_SLOT_ROLES[index];

      if (!role || typeof characterId !== 'number' || characterId <= 0) {
        return;
      }

      if (!availableCharacterIdSet.has(characterId)) {
        missingCharacterCount += 1;
        return;
      }

      const manualSlot = manualSlots.find((slot) => slot.role === role);

      if (manualSlot) {
        manualSlot.characterIds = [characterId];
      }
    });

    if (missingCharacterCount > 0) {
      warnings.push({
        key: 'preset.warnings.missingLockedCharacters',
        params: { count: missingCharacterCount },
      });
    }

    this.cacheCharacterRecords(availableCharacters);
    this.manualSlots.set(manualSlots);
    this.activeManualSlotRole.set(this.resolveInitialManualSlotRole(manualSlots));
    this.applyEmbeddedPresetTeamShip(payload, savedTeam, warnings);

    if (savedTeam) {
      this.teamName.set(savedTeam.name);
      this.notes.set(savedTeam.notes);
    }
  }

  private applyEmbeddedPresetTeamShip(
    payload: AutoTeamSelectionExportPayload,
    savedTeam: SavedTeam | null,
    warnings: AutoTeamSelectionImportMessage[],
  ): void {
    const embeddedShipId =
      savedTeam?.shipId ?? payload.generatedTeamExport?.shipSelection?.ship.id ?? null;

    if (typeof embeddedShipId !== 'number') {
      this.selectedManualShipId.set(null);
      return;
    }

    const shipExists = this.ships().some((ship) => ship.id === embeddedShipId);

    if (shipExists) {
      this.selectedManualShipId.set(embeddedShipId);
      return;
    }

    this.selectedManualShipId.set(null);
    warnings.push({
      key: 'preset.warnings.missingManualShip',
      params: { count: 1 },
    });
  }

  private resolveEmbeddedPresetSavedTeam(
    payload: AutoTeamSelectionExportPayload,
  ): SavedTeam | null {
    if (!Array.isArray(payload.savedTeamImport?.teams)) {
      return null;
    }

    const team = payload.savedTeamImport.teams[0];

    return team && Array.isArray(team.slots) ? team : null;
  }

  private async applyImportedSelectionPreset(
    importResult: AutoTeamSelectionImportResult,
    availableLockedCharacters: CharacterListItem[],
    fileName: string,
    payload: AutoTeamSelectionExportPayload,
  ): Promise<void> {
    const warnings = [...importResult.warnings];

    await this.applySelectionPresetState(importResult.state, availableLockedCharacters);
    this.applyEmbeddedPresetTeam(payload, availableLockedCharacters, warnings);
    warnings.push(...this.resolvePresetFavoriteScopeWarnings(payload));

    this.presetImportFeedback.set({
      tone: warnings.length > 0 ? 'warning' : 'success',
      title:
        warnings.length > 0
          ? this.t('preset.appliedWithWarningsTitle')
          : this.t('preset.appliedTitle'),
      details:
        warnings.length > 0
          ? [
              this.t('preset.loadedFromFile', { fileName }),
              ...warnings.map((warning) => this.translateImportMessage(warning)),
            ]
          : [this.t('preset.loadedFromFile', { fileName })],
    });
  }

  private async applySelectionPresetState(
    state: AutoTeamSelectionImportState,
    availableLockedCharacters: CharacterListItem[] = [],
  ): Promise<void> {
    await this.resetPageState();
    await this.persistResultSnapshot(null);

    this.selectedTypes.set([...state.selectedTypes]);
    this.selectedClasses.set([...state.selectedClasses]);
    // SavedEnemy and saved-team presets predate tag sets and only carry the flat
    // list, so back-fill the equivalent grouping from the legacy strict flag
    // instead of dropping the operator the exporting user had chosen.
    this.characterTagSets.set(
      this.resolveCharacterTagSetSelection(
        state.characterTagSets ??
          expandCharacterTagsToSets(
            state.selectedCharacterTags ?? [],
            state.requireAllSelectedCharacterTagsInTeam,
          ),
      ),
    );
    this.mergeSelectedCharacterNames(state.selectedCharacterNames ?? []);
    this.leaderBoostFilters.set([...state.leaderBoostFilters]);
    this.leaderBoostRanges.set(this.cloneLeaderBoostRanges(state.leaderBoostRanges));
    /*
     * 869f1935z. The other half of the constant pair documented in `buildSelectionExportPayload`.
     * These read a constant because the exporter writes one; if either side starts carrying the
     * reader's value, BOTH must, or a preset silently resets a setting they chose.
     */
    this.leaderCostRange.set(createEmptyAutoBuildCostRange());
    this.subCostRange.set(createEmptyAutoBuildCostRange());
    this.maxTotalCost.set(null);
    const manualRequiredAbilities = splitManualAbilityRequirementsFromEnemyMechanics(
      state.requiredAbilities,
      state.enemyMechanics,
    );
    const nonCaptainRequiredAbilities = manualRequiredAbilities.filter(
      (requirement) => !isCaptainAbilityRequirement(requirement),
    );
    /*
     * 869f1935z. These used to be cleared, so loading a Saved Enemy threw away the mechanics the
     * reader had ticked on it.
     *
     * The five that map to an ability survived as CONSTRAINTS - `splitManualAbilityRequirements…`
     * above keeps them out of the manual list precisely because the drafts are meant to carry them
     * - but they arrived anonymous, so nothing on screen said which mechanic they came from. The
     * unmapped ones were worse: they derive no requirement at all, so with the drafts cleared they
     * vanished entirely. Tick "Block Orbs" on a Saved Enemy, open it here, build, and there was no
     * mention of it anywhere.
     *
     * That is the exact silence the mechanic checklist exists to break, and the preset path - the
     * main way an enemy reaches this page - defeated it.
     */
    this.enemyMechanicDrafts.set(createEnemyMechanicDrafts(state.enemyMechanics));
    this.captainAbilityDrafts.set(
      createCaptainAbilityDrafts(
        manualRequiredAbilities,
        this.availableCaptainAbilityCatalogItems(),
      ),
    );
    this.requiredAbilityDrafts.set([]);
    this.crewmateAbilityDrafts.set([]);
    this.potentialAbilityDrafts.set([]);
    this.supportAbilityDrafts.set([]);
    this.battleRequirements.set(
      normalizeBattleRequirementsWithLegacyFallback({
        battles: state.battleRequirements,
        requiredCharacterGroups: state.requiredCharacterGroups,
        requiredAbilities: nonCaptainRequiredAbilities,
        enemyMechanics: state.enemyMechanics,
      }),
    );
    this.lockedCharacterRecords.set({});
    for (const character of availableLockedCharacters) this.cacheCharacterRecord(character);
    this.manualSlots.set(
      state.manualSlots.map((slot) => {
        const normalizedSlot: AutoBuildManualSlotSelection = {
          role: slot.role,
          characterIds: [...slot.characterIds],
          requiredCharacterId:
            slot.requiredCharacterId != null && slot.characterIds.includes(slot.requiredCharacterId)
              ? slot.requiredCharacterId
              : null,
        };
        const branchSelections = this.normalizeManualSlotBranchSelections({
          ...normalizedSlot,
          branchSelections: slot.branchSelections,
        });

        return {
          ...normalizedSlot,
          ...(branchSelections.length ? { branchSelections } : {}),
        };
      }),
    );
    this.activeManualSlotRole.set(this.resolveInitialManualSlotRole(state.manualSlots));
    this.excludedCharacterIds.set([...state.excludedCharacterIds]);
    this.selectedManualShipId.set(state.manualShipId);
    this.excludedShipIds.set([...state.excludedShipIds]);
    this.requireAllSelectedTypesInTeam.set(false);
    this.requireAllSelectedClassesPerCharacter.set(false);
    this.requireAllSelectedCharacterTagsInTeam.set(state.requireAllSelectedCharacterTagsInTeam);
    this.requireAllSelectedCharacterNamesInTeam.set(false);
    this.requireAllSlotsInLeaderSuperEffectScope.set(state.requireAllSlotsInLeaderSuperEffectScope);
    this.requireFullCaptainAbilityCoverage.set(state.requireFullCaptainAbilityCoverage);
    this.requireBothLeadersFullCaptainAbilityCoverage.set(
      state.requireBothLeadersFullCaptainAbilityCoverage,
    );
    this.requireSuperSpecialCriteriaCoverage.set(state.requireSuperSpecialCriteriaCoverage);
    this.requireSuperTandemCriteriaCoverage.set(state.requireSuperTandemCriteriaCoverage);
    this.requireUniqueBaseCharacterNames.set(true);
    this.selectedCharacterBoxId.set(null);
    this.selectedExcludeCharacterBoxId.set(null);
    this.favoritesOnly.set(state.favoritesOnly);
    this.allowAnyFriendCaptainAutoFill.set(state.allowAnyFriendCaptainAutoFill);
    this.favoriteShipsOnly.set(state.favoriteShipsOnly);
    this.avoidPreferRules.set(state.avoidPreferRules ?? createEmptyAvoidPreferRules());
    this.reconcileFavoriteShipSelection();
    this.resetBuildState();
    await this.refreshCharacterPickPanels();
  }

  /** 869f63gma. Drops the loaded enemy's avoid and prefer rules and nothing else. */
  public clearAvoidPreferRules(): void {
    this.avoidPreferRules.set(createEmptyAvoidPreferRules());
    this.resetBuildState();
  }

  private async applySavedTeamPresetFromRoute(): Promise<boolean> {
    const teamId = this.route.snapshot.queryParamMap.get('teamId')?.trim() ?? '';

    if (teamId.length === 0) {
      return false;
    }

    await this.userState.readySavedTeams();
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
    // 869f6td4p. With their details, so a Support-only pick is marked and never required.
    const availableLockedCharacters =
      selectedCharacterIds.length > 0
        ? await this.repository.getDetailedCharactersByIds(selectedCharacterIds)
        : [];

    await this.applySelectionPresetState(
      buildAutoTeamBuilderStateFromSavedTeam(
        team,
        availableLockedCharacters,
        this.ships(),
        buildDefaultAutoTeamBuilderFilterState(this.availableClasses()),
      ),
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

    await this.userState.readySavedEnemies();
    const enemy = this.userState.getSavedEnemyById(enemyId);

    if (!enemy) {
      await this.clearEnemyPresetQueryParam();
      return;
    }

    await this.applySelectionPresetState(buildAutoTeamBuilderStateFromSavedEnemy(enemy));
    this.loadedEnemyPresetName.set(enemy.name);
    await this.clearEnemyPresetQueryParam();
  }

  /**
   * 869f12x47. "What can I build with only this box?"
   *
   * The builder already accepted a box as a pool restriction - that was this
   * subtask's "verify first", and the answer was yes: `selectedCharacterBoxId`
   * narrows the candidate pool and `characterBoxSupportLabel` already explains
   * the intersection. So the missing piece was never a second builder. It was
   * that a reader looking at a box had no way to ask the question without
   * leaving for the builder and setting the filter by hand.
   *
   * Hence a link and a preset, which is also what the parent's "no new route,
   * no new page" rule allows.
   */
  private async applyCharacterBoxPoolFromRoute(): Promise<void> {
    const characterBoxId = this.route.snapshot.queryParamMap.get('characterBoxId')?.trim() ?? '';

    if (characterBoxId.length === 0) {
      return;
    }

    await this.userState.readyCharacterBoxes();

    const characterBox = this.characterBoxes().find((box) => box.id === characterBoxId);

    if (!characterBox) {
      /*
       * A box deleted since the link was made. Clearing the parameter and
       * leaving the pool alone is the honest outcome: silently building from
       * everything would answer a different question than the one asked.
       */
      await this.clearCharacterBoxPoolQueryParam();

      return;
    }

    this.selectedCharacterBoxId.set(characterBox.id);
    this.loadedCharacterBoxPoolName.set(characterBox.name);
    await this.clearCharacterBoxPoolQueryParam();
  }

  private async clearCharacterBoxPoolQueryParam(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { characterBoxId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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

  /**
   * Issue #523. The sentence a failed search owes the reader: which requirement had nothing behind
   * it, and what to change. Returns null when the diagnosis found nothing to say, and the messages
   * below - which restate the request - are then still the best available answer.
   */
  private resolveInfeasibilityMessage(): string | null {
    const pinnedCaptainMessage = this.resolvePinnedCaptainInfeasibilityMessage();

    if (pinnedCaptainMessage) {
      return pinnedCaptainMessage;
    }

    const reason = this.lastBuildInfeasibility()?.reasons[0];

    if (!reason) {
      return null;
    }

    const requirement = reason.subject.abilities
      .map((ability) => this.formatAbilityRequirement(ability))
      .join(this.t('errors.impossible.separator'));
    const battle = reason.subject.battleTitle
      ? this.t('errors.impossible.battle', { battle: reason.subject.battleTitle })
      : '';

    if (reason.kind === 'noCandidateForRequirement') {
      return this.t('errors.impossible.noCandidate', {
        requirement,
        battle,
        poolSize: this.lastBuildInfeasibility()?.poolSize ?? 0,
      });
    }

    if (reason.kind === 'requirementOutsideLeaderScope') {
      return this.t('errors.impossible.outsideLeaderScope', {
        requirement,
        battle,
        matchCount: reason.poolMatchCount,
        leader: reason.leader.name,
      });
    }

    return this.t('errors.impossible.notEnough', {
      requirement,
      battle,
      matchCount: reason.poolMatchCount,
      requiredCount: reason.requiredCharacterCount,
    });
  }

  /*
   * 869f333ey (D6). When the pinned Captain provably could not lead the crew, that is the cause worth
   * naming - and the search already tried the other Captains that could, so say how that went too.
   */
  private resolvePinnedCaptainInfeasibilityMessage(): string | null {
    const pinned = this.lastBuildInfeasibility()?.pinnedCaptain;
    const reason = pinned?.impossibility[0];

    if (!pinned || !reason) {
      return null;
    }

    let cause: string;

    if (reason.kind === 'selectedTypeOutsideCaptainScope') {
      cause = this.t('errors.impossible.captainTypes', {
        captain: pinned.name,
        types: this.formatSelectedValues(reason.types),
      });
    } else if (reason.kind === 'requirementOutsideCaptainScope') {
      cause = this.t('errors.impossible.captainRequirement', {
        captain: pinned.name,
        requirement: reason.subject.abilities
          .map((ability) => this.formatAbilityRequirement(ability))
          .join(this.t('errors.impossible.separator')),
        battle: reason.subject.battleTitle
          ? this.t('errors.impossible.battle', { battle: reason.subject.battleTitle })
          : '',
      });
    } else {
      cause = this.t('errors.impossible.captainTooFew', {
        captain: pinned.name,
        count: reason.coveredCandidateCount,
      });
    }

    const alternatives = pinned.alternativeCaptainIds.length
      ? this.t('errors.impossible.captainAlternativesFailed', {
          count: pinned.alternativeCaptainIds.length,
        })
      : this.t('errors.impossible.captainNoAlternative');

    return cause + ' ' + alternatives;
  }

  private resolveBuildFailureMessage(): string {
    if (this.buildBlockedByCharacterScope()) {
      return this.characterBoxBlockedMessage();
    }

    if (this.buildBlockedByFavorites()) {
      return this.favoritesOnlyBlockedMessage();
    }

    const manualConflictNames = this.resolveManualUniqueBaseNameConflictNames();

    if (manualConflictNames.length > 0) {
      return this.t('errors.uniqueNames.manualConflict', {
        names: manualConflictNames.join(' / '),
      });
    }

    /*
     * Issue #523. Ahead of every message below, because they restate the request and this one
     * answers it. It only speaks when the pool really had nothing behind a requirement; otherwise
     * the older messages stand.
     */
    const infeasibilityMessage = this.resolveInfeasibilityMessage();

    if (infeasibilityMessage) {
      return infeasibilityMessage;
    }

    const lockedCount = this.manualSelectionCount();
    const leaderRequirementLabel = this.resolveLeaderFailureLabel();

    const activeRequirements: string[] = [];
    const favoritesScope = this.favoritesOnly() ? this.t('errors.requirements.favoritesScope') : '';

    // Only rules no fallback relaxes are named here (869exmktc). "Unique in-game identities" used to
    // head every failure: it applies to every team, so it blamed itself for all of them and left
    // the plain, favourites and locked-slot messages below unreachable - a manual pick that breaks
    // it has its own message above. The class pool and a Captain boost range were never named.
    if (this.hasSelectedClasses() && !this.allClassesSelected()) {
      activeRequirements.push(
        this.t('errors.requirements.classPool', {
          classes: this.formatSelectedValues(this.selectedClasses()),
        }),
      );
    }

    const leaderBoostRangeLabels = this.activeLeaderBoostRangeLabels();

    if (leaderBoostRangeLabels.length > 0) {
      activeRequirements.push(
        this.t('errors.requirements.leaderBoostRange', {
          range: leaderBoostRangeLabels.join(' • '),
        }),
      );
    }

    const battleRequirements = this.pageBattleRequirements();
    const abilityRequirementsForFailure = this.pageRequiredAbilities().filter(
      (requirement) =>
        battleRequirements.length === 0 ||
        normalizeAbilityRequirementSlotScope(requirement.slotScope) === 'leader',
    );

    if (abilityRequirementsForFailure.length > 0) {
      activeRequirements.push(
        this.t('errors.requirements.abilityCoverage', {
          abilities: abilityRequirementsForFailure
            .map((requirement) => this.formatAbilityRequirement(requirement))
            .join(' • '),
        }),
      );
    }

    if (battleRequirements.length > 0) {
      activeRequirements.push(
        this.t('errors.requirements.battleCoverage', {
          battles: battleRequirements
            .map((battle) => this.formatBattleRequirementForFailure(battle))
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

  /**
   * Guided auto build locks a slot only from a team that keeps every filter, so it refuses a relaxed
   * one - and used to say so with the generic "no team matched" text, although the result names
   * exactly what would have to give. The final report's own rule names say it here, plus the one
   * relaxation the report has no row for. A team whose fallback relaxed nothing visible still
   * gets a message that admits a team was found.
   */
  private resolveGuidedRelaxedOnlyMessage(result: AutoBuildResult): string {
    const replaced = result.relaxation.replacedCaptain;

    if (replaced) {
      // 869f333ey (D5). Name the Captain that works; the card beside this offers to set it.
      return this.t('errors.guided.replacedCaptain', { from: replaced.fromName, to: replaced.toName });
    }

    const droppedByRule: Record<string, readonly string[]> = {
      types: result.relaxation.droppedTypes,
      classes: result.relaxation.droppedClasses,
      characterTags: result.relaxation.droppedCharacterTags,
      characterNames: result.relaxation.droppedCharacterNames,
    };
    const relaxed = this.buildFinalReportRows(result)
      .filter((row) => row.state === 'relaxed')
      .map((row) => {
        const dropped = droppedByRule[row.key] ?? [];

        return dropped.length > 0
          ? `${row.title} (${this.formatSelectedValues(dropped)})`
          : row.title;
      });

    if (result.relaxation.allowedLeadersWithSuperEffects) {
      relaxed.push(this.t('fallback.allowedLeadersWithSuperEffects'));
    }

    return relaxed.length > 0
      ? this.t('errors.guided.relaxedOnly', { relaxed: relaxed.join(' • ') })
      : this.t('errors.guided.fallbackOnly');
  }

  private activeLeaderBoostRangeLabels(): string[] {
    const ranges = this.leaderBoostRanges();

    return AUTO_BUILD_LEADER_BOOST_FILTERS.filter((filter) =>
      this.hasActiveLeaderBoostRange(ranges[filter]),
    ).map((filter) => this.formatLeaderBoostRangeSummary(filter, ranges[filter]));
  }

  private async refreshAppliedManualCandidates(options: { force?: boolean } = {}): Promise<void> {
    if (
      (!options.force && !this.manualPickerModalOpen()) ||
      this.shipPickerMode() !== 'characters'
    ) {
      return;
    }

    await this.refreshCharacterPickerPanel('manual');
  }

  private async refreshAppliedExcludedCandidates(options: { force?: boolean } = {}): Promise<void> {
    if (
      (!options.force && !this.excludePickerModalOpen()) ||
      this.excludePickerMode() !== 'characters'
    ) {
      return;
    }

    await this.refreshCharacterPickerPanel('excluded');
  }

  private async refreshCharacterPickPanels(): Promise<void> {
    await Promise.all([
      this.refreshAppliedManualCandidates(),
      this.refreshAppliedExcludedCandidates(),
    ]);
  }

  private async refreshRequirementSourceCandidates(): Promise<void> {
    const requestId = ++this.requirementSourceRequestId;

    this.requirementSourceCandidatesLoading.set(true);
    this.requirementSourceVisibleCount.set(CHARACTER_PICKER_PAGE_SIZE);

    try {
      const sourceFilters = await this.resolveRequirementSourceFilters();
      const tagCharacterIds = this.requirementSourceTagCharacterIds();
      const tagCharacterIdSet = tagCharacterIds ? new Set(tagCharacterIds) : null;
      // The tag gate and the source set both apply in the query, before its limit.
      const allowedCharacterIds = [...sourceFilters.keys()].filter(
        (characterId) => !tagCharacterIdSet || tagCharacterIdSet.has(characterId),
      );
      const candidates = allowedCharacterIds.length
        ? await this.repository.searchDetailedCharacters({
            searchTerm: this.requirementSourceSearchTerm().trim(),
            selectedTypes: [],
            selectedClasses: [],
            allowedCharacterIds,
            sortMode: 'powerFirst',
            limit: allowedCharacterIds.length,
            offset: 0,
          })
        : [];

      if (requestId !== this.requirementSourceRequestId) {
        return;
      }

      const sourceCandidates = this.dedupeCharacterRecords(candidates);

      this.requirementSourceCandidates.set(sourceCandidates);
      this.cacheCharacterRecords(sourceCandidates);
    } finally {
      if (requestId === this.requirementSourceRequestId) {
        this.requirementSourceCandidatesLoading.set(false);
      }
    }
  }

  /** One Captain Ability pass per opening of the pop-up; see requirementSourceFilters. */
  private resolveRequirementSourceFilters(): Promise<
    Map<number, AutoBuildCharacterRequirementFilters>
  > {
    if (this.requirementSourceFilters) {
      return this.requirementSourceFilters;
    }

    const pass = this.repository
      .searchDetailedCharacters({
        searchTerm: '',
        selectedTypes: [],
        selectedClasses: [],
        sortMode: 'powerFirst',
        limit: 10_000,
        offset: 0,
      })
      .then((characters) => {
        const filtersById = new Map<number, AutoBuildCharacterRequirementFilters>();

        for (const character of this.dedupeCharacterRecords(characters)) {
          const filters = extractAutoBuildCharacterRequirementFilters(character);

          if (filters.characterNames.length > 0 || filters.characterTags.length > 0) {
            filtersById.set(character.id, filters);
          }
        }

        // A pass that a reopening or a reset has replaced must not refill the cards' lookup.
        if (this.requirementSourceFilters === pass) {
          this.requirementSourceFiltersById = filtersById;
        }

        return filtersById;
      });

    // A failed pass is not cached, so the next keystroke tries again instead of failing forever.
    pass.catch(() => {
      if (this.requirementSourceFilters === pass) {
        this.requirementSourceFilters = null;
      }
    });

    this.requirementSourceFilters = pass;

    return pass;
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
        this.getCharacterPickerTagCharacterIds(panel)(),
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

  private async loadMoreCharacterPickerPanel(panel: CharacterPickerPanelKey): Promise<void> {
    const panelState = this.getCharacterPickerPanelState(panel);
    const currentState = panelState();

    if (
      currentState.loadingInitial ||
      currentState.loadingMore ||
      !currentState.hasMore ||
      this.getCharacterPickerCandidates(panel)().length === 0
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
        this.getCharacterPickerTagCharacterIds(panel)(),
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
    allowedCharacterIds: number[] | undefined,
    offset: number,
    requestId: number,
    getActiveRequestId: () => number,
  ): Promise<{ items: CharacterDetailRecord[]; nextOffset: number; hasMore: boolean } | null> {
    const page = await this.repository.searchDetailedCharacters({
      searchTerm,
      selectedTypes: [],
      selectedClasses: [],
      // `undefined` leaves the query ungated; `[]` gates it to nothing. Passing
      // it here rather than filtering the page keeps the limit/offset honest.
      allowedCharacterIds,
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

  private getCharacterPickerTagSelection(
    panel: CharacterPickerPanelKey,
  ): WritableSignal<CharacterTagSetSelection> {
    return panel === 'manual' ? this.manualPickerTagSelection : this.excludePickerTagSelection;
  }

  private getCharacterPickerTagCharacterIds(
    panel: CharacterPickerPanelKey,
  ): WritableSignal<number[] | undefined> {
    return panel === 'manual'
      ? this.manualPickerTagCharacterIds
      : this.excludePickerTagCharacterIds;
  }

  /**
   * Every close path for a character picker runs through here. An in-modal
   * filter that survived a close would keep gating the next open with nothing
   * on screen to explain it.
   */
  private clearCharacterPickerTagFilter(panel: CharacterPickerPanelKey): void {
    this.getCharacterPickerTagSelection(panel).set(createEmptyCharacterTagSetSelection());
    this.getCharacterPickerTagCharacterIds(panel).set(undefined);
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
    this.applyResult(nextResult);
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
        requiredCharacterId:
          slot.requiredCharacterId === characterId ? null : slot.requiredCharacterId,
      })),
    );
  }

  private removeCharactersFromAllManualSlots(characterIds: number[]): void {
    if (characterIds.length === 0) {
      return;
    }

    const characterIdSet = new Set(characterIds);

    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) => ({
        ...slot,
        characterIds: slot.characterIds.filter(
          (selectedCharacterId) => !characterIdSet.has(selectedCharacterId),
        ),
        requiredCharacterId:
          slot.requiredCharacterId != null && characterIdSet.has(slot.requiredCharacterId)
            ? null
            : (slot.requiredCharacterId ?? null),
      })),
    );
  }

  private async resolveDetailedManualPickCharacter(
    character: CharacterListItem,
  ): Promise<CharacterDetailRecord | null> {
    if (this.isDetailedCharacterRecord(character)) {
      return character;
    }

    const [record] = await this.repository.searchDetailedCharacters({
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      allowedCharacterIds: [character.id],
      sortMode: 'newest',
      limit: 1,
      offset: 0,
    });

    return record ?? null;
  }

  private async resolveBestSimilarManualPick(
    role: AutoBuildManualSlotRole,
    sourceCharacter: CharacterDetailRecord,
  ): Promise<CharacterDetailRecord | null> {
    const candidates = await this.repository.searchDetailedCharacters({
      searchTerm: '',
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'newest',
      limit: SIMILAR_MANUAL_PICK_CANDIDATE_LIMIT,
      offset: 0,
    });
    const selectedInSlot = new Set(this.resolveManualSlotSelection(role).characterIds);
    const rankedCandidates = candidates
      .filter((candidate) => {
        if (
          candidate.id === sourceCharacter.id ||
          selectedInSlot.has(candidate.id) ||
          !this.canAssignCharacterToManualSlot(role, candidate)
        ) {
          return false;
        }

        return this.hasValidManualSlotAssignmentWithCandidate(role, candidate);
      })
      .map((candidate) => this.scoreSimilarManualPickCandidate(sourceCharacter, candidate))
      .filter((score): score is SimilarManualPickScore => score !== null)
      .sort((left, right) => {
        if (left.hasExactAbilityKeySet !== right.hasExactAbilityKeySet) {
          return left.hasExactAbilityKeySet ? -1 : 1;
        }

        if (left.overlapCount !== right.overlapCount) {
          return right.overlapCount - left.overlapCount;
        }

        return right.character.id - left.character.id;
      });

    return rankedCandidates[0]?.character ?? null;
  }

  private scoreSimilarManualPickCandidate(
    sourceCharacter: CharacterDetailRecord,
    candidate: CharacterDetailRecord,
  ): SimilarManualPickScore | null {
    const sourceAbilityKeys = this.resolveBuilderAbilityKeySet(sourceCharacter);
    const candidateAbilityKeys = this.resolveBuilderAbilityKeySet(candidate);
    const overlapCount = [...sourceAbilityKeys].filter((abilityKey) =>
      candidateAbilityKeys.has(abilityKey),
    ).length;
    const hasExactAbilityKeySet =
      sourceAbilityKeys.size === candidateAbilityKeys.size &&
      [...sourceAbilityKeys].every((abilityKey) => candidateAbilityKeys.has(abilityKey));

    if (!hasExactAbilityKeySet && overlapCount === 0) {
      return null;
    }

    return {
      character: candidate,
      hasExactAbilityKeySet,
      overlapCount,
    };
  }

  private resolveBuilderAbilityKeySet(character: CharacterDetailRecord): Set<string> {
    return new Set(
      character.detail.builderAbilities
        .map((ability) => ability.key.trim())
        .filter((abilityKey) => abilityKey.length > 0),
    );
  }

  private hasValidManualSlotAssignmentWithCandidate(
    role: AutoBuildManualSlotRole,
    candidate: CharacterListItem,
  ): boolean {
    const lockedRecords = {
      ...this.lockedCharacterRecords(),
      [candidate.id]: candidate,
    };
    const filledSlots = this.manualSlots()
      .map((slot) => ({
        role: slot.role,
        records: (slot.role === role ? [...slot.characterIds, candidate.id] : slot.characterIds)
          .map((characterId) => lockedRecords[characterId])
          .filter((record): record is CharacterListItem => Boolean(record)),
      }))
      .filter((slot) => slot.role !== 'friendCaptain' && slot.records.length > 0);

    if (filledSlots.length < 2) {
      return true;
    }

    return this.hasValidUniqueBaseNameAssignment(filledSlots, 0, new Set<string>());
  }

  private isDetailedCharacterRecord(
    character: CharacterListItem,
  ): character is CharacterDetailRecord {
    return 'detail' in character && 'detailImageUrl' in character;
  }

  private resolveManualSlotSelection(role: AutoBuildManualSlotRole): AutoBuildManualSlotSelection {
    return (
      this.manualSlots().find((slot) => slot.role === role) ?? {
        role,
        characterIds: [],
        requiredCharacterId: null,
      }
    );
  }

  private resolveDefaultManualCopySourceRole(): AutoBuildManualSlotRole {
    const activeRole = this.activeManualSlotRole();

    if (this.resolveManualSlotSelection(activeRole).characterIds.length > 0) {
      return activeRole;
    }

    return (
      this.manualSlots().find((slot) => slot.characterIds.length > 0)?.role ??
      AUTO_BUILD_MANUAL_SLOT_ROLES[0]
    );
  }

  private normalizeManualSlotRole(
    value: string | null | undefined,
  ): AutoBuildManualSlotRole | null {
    return typeof value === 'string' &&
      AUTO_BUILD_MANUAL_SLOT_ROLES.includes(value as AutoBuildManualSlotRole)
      ? (value as AutoBuildManualSlotRole)
      : null;
  }

  private serializeManualSlots(): AutoBuildManualSlotSelection[] {
    return this.manualSlots().map((slot) => ({
      role: slot.role,
      characterIds: [...slot.characterIds],
      requiredCharacterId:
        slot.requiredCharacterId != null && slot.characterIds.includes(slot.requiredCharacterId)
          ? slot.requiredCharacterId
          : null,
      ...(this.normalizeManualSlotBranchSelections(slot).length
        ? { branchSelections: this.normalizeManualSlotBranchSelections(slot) }
        : {}),
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
    if (this.isEffectivelyExcludedCharacter(characterId)) {
      return this.t('manual.slotSelection.excluded');
    }

    const character = this.lockedCharacterRecords()[characterId];

    if (character && !this.characterFitsManualTeamBudget(activeRole, character)) {
      return this.t('manual.slotSelection.costBudget');
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
    const excludeCharacterBox = this.selectedExcludeCharacterBox();

    if (
      excludeCharacterBox &&
      this.selectedExcludeCharacterBoxIds().includes(characterId) &&
      !this.isExcludedCharacter(characterId)
    ) {
      return this.t('exclude.selectionSupport.alreadyInBox', {
        name: excludeCharacterBox.name,
      });
    }

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

  private resolveManualSlotRoleForResultSlot(
    role: 'captain' | 'friendCaptain' | 'sub',
    subSlotIndex: number,
  ): AutoBuildManualSlotRole | null {
    if (role === 'captain' || role === 'friendCaptain') {
      return role;
    }

    return AUTO_BUILD_MANUAL_SUB_SLOT_ROLES[subSlotIndex] ?? null;
  }

  private buildRequiredCharacterAbilityRailItem(
    view: RequiredCharacterGroupView,
    category: RequiredCharacterAbilityCategory,
  ): AbilityFilterRailItem {
    return {
      category,
      label: this.t(`requiredCharacters.categories.${category}`),
      count: view.group.abilities.filter((requirement) =>
        this.requiredCharacterRequirementMatchesCategory(requirement, category),
      ).length,
      disabled: this.building() || this.resolveCategoryCatalogItems(category).length === 0,
    };
  }

  private requiredCharacterRequirementMatchesCategory(
    requirement: AutoBuildAbilityRequirement,
    category: RequiredCharacterAbilityCategory,
  ): boolean {
    return (
      this.resolveAbilityCatalogItem(requirement.abilityKey)?.category === category &&
      !isCaptainAbilityRequirement(requirement)
    );
  }

  private resolveCategoryCatalogItems(
    category: RequiredCharacterAbilityCategory,
  ): AutoBuildAbilityCatalogItem[] {
    switch (category) {
      case 'special':
        return this.availableSpecialAbilityCatalogItems();
      case 'crewmate':
        return this.availableCrewmateAbilityCatalogItems();
      case 'potential':
        return this.availablePotentialAbilityCatalogItems();
      case 'support':
        return this.availableSupportAbilityCatalogItems();
    }
  }

  private serializeManualRequiredAbilities(): AutoBuildAbilityRequirement[] {
    const captainRequirements = serializeCaptainAbilityDrafts(
      this.captainAbilityDrafts(),
      this.availableCaptainAbilityCatalogItems(),
      { dedupe: false },
    );
    const groupRequirements = this.pageRequiredCharacterGroups().flatMap((group) =>
      group.abilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
        requiredCharacterCount: 1,
      })),
    );

    if (groupRequirements.length) {
      return [...captainRequirements, ...groupRequirements];
    }

    return [
      ...captainRequirements,
      ...serializeSpecialAbilityDrafts(
        this.requiredAbilityDrafts(),
        this.availableSpecialAbilityCatalogItems(),
        { dedupe: false },
      ),
      ...serializeCategoryAbilityDrafts(
        this.crewmateAbilityDrafts(),
        this.availableCrewmateAbilityCatalogItems(),
        'crewmate',
        { dedupe: false },
      ),
      ...serializeCategoryAbilityDrafts(
        this.potentialAbilityDrafts(),
        this.availablePotentialAbilityCatalogItems(),
        'potential',
        { dedupe: false },
      ),
      ...serializeCategoryAbilityDrafts(
        this.supportAbilityDrafts(),
        this.availableSupportAbilityCatalogItems(),
        'support',
        { dedupe: false },
      ),
    ];
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
        formatSlotScope: (scope) => this.t(`abilities.requirement.slotScopes.${scope}`),
        formatSourceScope: (scope) => this.t(`abilities.requirement.sourceScopes.${scope}`),
        formatMinEffectValue: (value) => this.t('abilities.requirement.minEffectValue', { value }),
        formatEffectTargetScope: (scope) =>
          this.t(`abilities.requirement.effectTargetScopes.${scope}`),
      },
    );
  }

  public displayBuilderAbilities(character: CharacterDetailRecord): NormalizedBuilderAbility[] {
    return character.detail.builderAbilities.filter(
      (ability) => ability.source !== 'captainAbility',
    );
  }

  private formatBattleRequirementForFailure(battle: AutoBuildBattleRequirement): string {
    const groupLabels = battle.requiredCharacterGroups
      .map((group) =>
        group.abilities
          .map((requirement) => this.formatAbilityRequirement(requirement))
          .join(' + '),
      )
      .filter((label) => label.length > 0);
    const battleLabel = battle.title.trim().length ? battle.title.trim() : battle.id;

    return groupLabels.length ? `${battleLabel}: ${groupLabels.join(' / ')}` : battleLabel;
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
      slotScope: draft.slotScope,
      sourceScope: draft.sourceScope,
      minEffectValue: draft.minEffectValue,
      effectTargetScope: draft.effectTargetScope,
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

  private resolveSelectedCharacterTags(value: string[] | string | null | undefined): string[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];
    const availableTagByKey = new Map(
      this.availableCharacterTags().map((tag) => [tag.toLowerCase(), tag] as const),
    );
    const uniqueTags = new Map<string, string>();

    for (const value of nextValues) {
      const normalizedTag = value.trim().replace(/\s+/g, ' ');
      const canonicalTag = availableTagByKey.get(normalizedTag.toLowerCase());

      if (canonicalTag && !uniqueTags.has(canonicalTag.toLowerCase())) {
        uniqueTags.set(canonicalTag.toLowerCase(), canonicalTag);
      }
    }

    return [...uniqueTags.values()];
  }

  private normalizeCharacterNameFilter(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /**
   * Canonicalises every set's tags against the loaded catalog, dropping sets
   * left empty. Case is folded only to look the catalog value up — the stored
   * tag is the catalog's own casing, never the user's typing.
   */
  private resolveCharacterTagSetSelection(
    selection: CharacterTagSetSelection,
  ): CharacterTagSetSelection {
    const cloned = cloneCharacterTagSetSelection(selection);

    return {
      operator: cloned.operator,
      sets: cloned.sets
        .map((set) =>
          createCharacterTagSet(this.resolveSelectedCharacterTags(set.tags), set.operator, set.id),
        )
        .filter((set) => set.tags.length > 0),
    };
  }

  /**
   * Requirement-source characters contribute tags that should widen the current
   * filter, so they join the first group as alternatives (OR) rather than
   * tightening it — appending them to an `'all'` group would demand a single
   * character carry every affiliation at once.
   */
  private mergeSelectedCharacterTags(tags: string[]): void {
    const current = this.characterTagSets();
    const [firstSet, ...remainingSets] = current.sets;
    const existingTagCount = firstSet?.tags.length ?? 0;
    const mergedTags = this.resolveSelectedCharacterTags([...(firstSet?.tags ?? []), ...tags]);

    if (!mergedTags.length) {
      return;
    }

    // Re-applying a source that contributes nothing new must not rewrite the
    // operator the user picked; only a genuine widening switches the group to OR.
    const mergedOperator =
      mergedTags.length > existingTagCount ? 'any' : (firstSet?.operator ?? 'any');

    this.characterTagSets.set({
      operator: current.operator,
      sets: [createCharacterTagSet(mergedTags, mergedOperator, firstSet?.id), ...remainingSets],
    });
  }

  private mergeSelectedCharacterNames(names: string[]): void {
    const mergedNames = new Map<string, string>();

    for (const name of [...this.selectedCharacterNames(), ...names]) {
      const normalizedName = this.normalizeCharacterNameFilter(name);

      if (normalizedName.length > 0 && !mergedNames.has(normalizedName)) {
        mergedNames.set(normalizedName, normalizedName);
      }
    }

    this.selectedCharacterNames.set([...mergedNames.values()]);
  }

  private resolveLeaderBoostFilters(
    value: AutoBuildLeaderBoostFilter[] | AutoBuildLeaderBoostFilter | null | undefined,
  ): AutoBuildLeaderBoostFilter[] {
    const nextValues = Array.isArray(value) ? value : value ? [value] : [];
    const uniqueValues = [...new Set(nextValues)];

    return uniqueValues.filter((filter): filter is AutoBuildLeaderBoostFilter =>
      this.availableLeaderBoostFilters.includes(filter),
    );
  }

  private resolveLeaderBoostRangeBound(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const nextValue = Number(value);

    return Number.isFinite(nextValue) && nextValue >= 0 ? nextValue : null;
  }

  private resolveCostRangeBound(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const nextValue = Number(value);

    return Number.isInteger(nextValue) && nextValue >= 0 ? nextValue : null;
  }

  private hasActiveCostRange(range: AutoBuildCostRange): boolean {
    return range.min !== null || range.max !== null;
  }

  private hasInvalidCostRange(range: AutoBuildCostRange): boolean {
    return range.min !== null && range.max !== null && range.min > range.max;
  }

  private resolveCaptainCoverageMatchedSlotCount(status: CaptainTeamConditionStatus): number {
    return status.leaderStatuses.reduce(
      (total, leaderStatus) => total + leaderStatus.matchingSlotCount,
      0,
    );
  }

  private resolveCaptainCoverageTotalSlotCount(status: CaptainTeamConditionStatus): number {
    return status.expectedSlotCount * status.leaderStatuses.length;
  }

  private resolveResultTeamConditionSlotLabels(slots: TeamSlotViewModel[]): string[] {
    let subSlotIndex = 0;

    return slots.map((slot) => {
      if (slot.role !== 'sub') {
        return slot.roleLabel;
      }

      subSlotIndex += 1;
      return `${slot.roleLabel} ${subSlotIndex}`;
    });
  }

  private hasActiveLeaderBoostRange(range: AutoBuildLeaderBoostRange): boolean {
    return range.min !== null || range.max !== null;
  }

  private formatLeaderBoostRangeSummary(
    filter: AutoBuildLeaderBoostFilter,
    range: AutoBuildLeaderBoostRange,
  ): string {
    if (range.min !== null && range.max !== null) {
      return this.t('captainAbilityFilters.leaderBoost.rangeChip.between', {
        boost: this.t(`filters.leaderBoost.options.${filter}`),
        min: range.min,
        max: range.max,
      });
    }

    if (range.min !== null) {
      return this.t('captainAbilityFilters.leaderBoost.rangeChip.from', {
        boost: this.t(`filters.leaderBoost.options.${filter}`),
        min: range.min,
      });
    }

    if (range.max !== null) {
      return this.t('captainAbilityFilters.leaderBoost.rangeChip.to', {
        boost: this.t(`filters.leaderBoost.options.${filter}`),
        max: range.max,
      });
    }

    return this.t('captainAbilityFilters.leaderBoost.rangeChip.any', {
      boost: this.t(`filters.leaderBoost.options.${filter}`),
    });
  }

  private cloneLeaderBoostRanges(ranges: AutoBuildLeaderBoostRanges): AutoBuildLeaderBoostRanges {
    return {
      HP: { ...ranges.HP },
      ATK: { ...ranges.ATK },
    };
  }

  private buildManualCharacterCards(
    characters: CharacterDetailRecord[],
    highlightedRequirements: AutoBuildAbilityRequirement[],
  ): ManualCharacterCardView[] {
    const activeRole = this.activeManualSlotRole();

    return characters.map((character) => {
      const isSelectedInActiveSlot = this.isCharacterSelectedInManualSlot(activeRole, character.id);
      const selectedBranchLabel = this.resolveManualSlotCharacterBranchLabel(activeRole, character);

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
        // 869f6td4p. Marked, never hidden: the card stays in the picker and says why it is refused.
        selectionSupportLabel: isSupportOnlyCharacter(character)
          ? this.t('manual.slotSelection.supportOnly')
          : this.resolveManualCharacterSelectionSupport(character.id, activeRole),
        selectedBranchLabel,
        branchActions: this.resolveManualCandidateBranchActions(character, activeRole),
      };
    });
  }

  private resolveManualCandidateBranchActions(
    character: CharacterDetailRecord,
    role: AutoBuildManualSlotRole,
  ): ManualCaptainBranchActionView[] {
    if (!this.isLeaderManualSlotRole(role)) {
      return [];
    }

    const branchOptions = resolveCaptainCoverageBranchOptions(character);

    if (branchOptions.length !== 2) {
      return [];
    }

    const currentMode = this.resolveManualSlotCharacterBranchMode(role, character.id);
    const modes: AutoBuildCaptainBranchMode[] = isVsCaptainCoverageBranchCaptain(character)
      ? ['character1', 'character2']
      : ['character1', 'character2', 'both'];

    return modes.map((mode) => {
      const display = resolveCaptainCoverageBranchDisplay(character, mode);

      return {
        mode,
        label:
          mode === 'both'
            ? this.t('manual.branches.both')
            : this.t('manual.branches.side', { name: display.displayName }),
        displayName: display.displayName,
        selected: currentMode === mode,
        disabled:
          this.building() ||
          (!this.isCharacterSelectedInManualSlot(role, character.id) &&
            !this.canAssignCharacterToManualSlot(role, character)),
      };
    });
  }

  private resolveManualSlotCharacterBranchLabel(
    role: AutoBuildManualSlotRole,
    character: CharacterListItem,
  ): string | null {
    if (!this.isLeaderManualSlotRole(role)) {
      return null;
    }

    const mode = this.resolveManualSlotCharacterBranchMode(role, character.id);

    if (!mode) {
      return null;
    }

    if (this.isDetailedCharacterRecord(character)) {
      return resolveCaptainCoverageBranchDisplay(character, mode).displayName;
    }

    return this.resolveFallbackCaptainBranchDisplayName(mode);
  }

  private resolveManualSlotCharacterBranchMode(
    role: AutoBuildManualSlotRole,
    characterId: number,
  ): AutoBuildCaptainBranchMode | null {
    const mode = this.resolveManualSlotSelection(role).branchSelections?.find(
      (selection) => selection.characterId === characterId,
    )?.mode;

    return this.isAutoBuildCaptainBranchMode(mode) ? mode : null;
  }

  private resolveFallbackCaptainBranchDisplayName(mode: AutoBuildCaptainBranchMode): string {
    switch (mode) {
      case 'character1': {
        return 'Character 1';
      }
      case 'character2': {
        return 'Character 2';
      }
      default: {
        return this.t('manual.branches.both');
      }
    }
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

  private resolveRemainingCostValue(currentCost: number): number {
    const maxTotalCost = this.maxTotalCost();

    return maxTotalCost === null ? 0 : Math.max(0, maxTotalCost - currentCost);
  }

  private resolveManualSlotsBudgetCost(slots: AutoBuildManualSlotSelection[]): number {
    const lockedRecords = this.lockedCharacterRecords();

    return slots.reduce((total, slot) => {
      if (slot.role === 'friendCaptain') {
        return total;
      }

      return (
        total +
        slot.characterIds.reduce(
          (slotTotal, characterId) => slotTotal + (lockedRecords[characterId]?.cost ?? 0),
          0,
        )
      );
    }, 0);
  }

  private characterFitsManualTeamBudget(
    role: AutoBuildManualSlotRole,
    character: Pick<CharacterListItem, 'cost'>,
  ): boolean {
    void role;
    void character;

    return true;
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

        for (const conflictKey of resolveCharacterSameCharacterKeys(record)) {
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

    if (!slot) {
      return true;
    }

    for (const record of slot.records) {
      const partyConflictKeys = resolveCharacterSameCharacterKeys(record);

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
    const visibleAbilities = abilities.filter((ability) => ability.source !== 'captainAbility');

    if (visibleAbilities.length === 0) {
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

    for (const ability of visibleAbilities) {
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

  /** The catalogue's own English label - the game's term, which is how players say it. */
  public resolveMechanicLabel(mechanicKey: string): string {
    return this.enemyMechanicCatalogMap().get(mechanicKey)?.label ?? mechanicKey;
  }

  /** Inferred rows say so, so nothing claims the reader ticked something they did not. */
  public mechanicChecklistSourceLabel(entry: MechanicChecklistEntry): string {
    return entry.source === 'inferred' ? this.t('mechanicChecklist.inferred') : '';
  }

  public mechanicChecklistDetail(entry: MechanicChecklistEntry): string {
    if (entry.state === 'unanswerable') {
      // Said plainly, because "not covered" would send the reader hunting for a unit that does
      // not exist. No shipped ability answers these fourteen.
      return this.t('mechanicChecklist.details.unanswerable');
    }

    if (entry.state === 'covered') {
      return this.t('mechanicChecklist.details.covered', {
        slots: entry.coveringSlots.join(', '),
        names: entry.coveringCharacterNames.join(', '),
      });
    }

    /*
     * Partial coverage is not coverage, and saying only "not covered" would hide that the team is
     * one unit short rather than empty-handed.
     */
    if (entry.coveringSlots.length > 0) {
      return this.t('mechanicChecklist.details.partial', {
        have: entry.coveringSlots.length,
        need: entry.requiredCharacterCount,
      });
    }

    return this.t('mechanicChecklist.details.notCovered');
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

  private shouldRequireExactSelectedTypeCoverage(): boolean {
    return (
      this.hasSelectedTypes() &&
      !this.sameUnorderedValues(this.selectedTypes(), this.availableTypes)
    );
  }

  private buildFinalReportRows(result: AutoBuildResult): AutoBuildFinalReportRow[] {
    const teamSlotCount = this.countTeamSlots(result);

    return [
      this.buildSelectedFilterReportRow(
        'types',
        result.requestedInput.types,
        result.input.types,
        result.relaxation.droppedTypes,
        !(
          !result.requestedInput.requireAllSelectedTypesInTeam &&
          this.sameUnorderedValues(result.requestedInput.types, AUTO_TEAM_BUILDER_TYPES)
        ),
        teamSlotCount,
      ),
      this.buildSelectedClassReportRow(result),
      this.buildSelectedFilterReportRow(
        'characterTags',
        result.requestedInput.selectedCharacterTags ?? [],
        result.input.selectedCharacterTags ?? [],
        result.relaxation.droppedCharacterTags,
        (result.requestedInput.selectedCharacterTags ?? []).length > 0,
        teamSlotCount,
      ),
      this.buildSelectedFilterReportRow(
        'characterNames',
        result.requestedInput.selectedCharacterNames ?? [],
        result.input.selectedCharacterNames ?? [],
        result.relaxation.droppedCharacterNames,
        (result.requestedInput.selectedCharacterNames ?? []).length > 0,
        teamSlotCount,
      ),
      this.buildAvoidPreferReportRow(result),
      this.buildCaptainReportRow(result),
      this.buildLeaderSuperScopeReportRow(result),
      this.buildCaptainAbilityReportRow(result),
      this.buildSuperSpecialReportRow(result),
      this.buildSuperTandemReportRow(result),
    ];
  }

  private buildSelectedFilterReportRow(
    key: string,
    requestedValues: readonly string[],
    effectiveValues: readonly string[],
    droppedValues: readonly string[],
    applicable: boolean,
    teamSlotCount?: number,
  ): AutoBuildFinalReportRow {
    if (!applicable) {
      return this.buildFinalReportRow(
        key,
        'notApplicable',
        this.t(`report.rules.${key}.notApplicable`),
      );
    }

    if (droppedValues.length > 0) {
      return this.buildFinalReportRow(
        key,
        'relaxed',
        this.t(`report.rules.${key}.relaxed`, {
          requested: this.formatResultValues(requestedValues),
          effective: this.formatResultValues(effectiveValues),
          relaxed: this.formatResultValues(droppedValues),
        }),
        { requestedValues, droppedValues, teamSlotCount },
      );
    }

    return this.buildFinalReportRow(
      key,
      'passed',
      this.t(`report.rules.${key}.passed`, {
        value: this.formatResultValues(effectiveValues),
      }),
    );
  }

  /**
   * "Characters of these classes" asks nothing of the team as a whole, so the generic coverage
   * row said "No selected class coverage was requested" - under a class the player had picked.
   * The row reports what the rule does ask: that every unit hold one of the selected classes.
   * The builder cannot break that rule: its pool only holds those classes and no fallback drops
   * one. So the row always reads Passed, and when a unit falls outside them it says whose choice
   * that was - a manual pick, or a Friend Captain from "Allow any Friend Captain".
   */
  private buildSelectedClassReportRow(result: AutoBuildResult): AutoBuildFinalReportRow {
    const requestedClasses = result.requestedInput.selectedClasses;

    if (!shouldTreatSelectedClassesAsNeutral(result.requestedInput)) {
      return this.buildSelectedFilterReportRow(
        'classes',
        requestedClasses,
        result.input.selectedClasses,
        result.relaxation.droppedClasses,
        true,
      );
    }

    if (
      requestedClasses.length === 0 ||
      this.sameUnorderedValues(requestedClasses, this.availableClasses())
    ) {
      return this.buildFinalReportRow(
        'classes',
        'notApplicable',
        this.t('report.rules.classes.notApplicable'),
      );
    }

    const value = this.formatResultValues(requestedClasses);
    const matching = result.coverage.selectedClassMatches;
    const total = result.slots.length;

    return this.buildFinalReportRow(
      'classes',
      'passed',
      matching >= total
        ? this.t('report.rules.classes.poolPassed', { value })
        : this.t('report.rules.classes.poolPartial', { matching, total, value }),
    );
  }

  private buildLeaderSuperScopeReportRow(result: AutoBuildResult): AutoBuildFinalReportRow {
    if (result.relaxation.ignoredLeaderSuperEffectScope) {
      return this.buildFinalReportRow(
        'leaderSuperScope',
        'relaxed',
        this.t('report.rules.leaderSuperScope.relaxed'),
        {
          canAllowAnyFriendCaptain: !result.requestedInput.allowAnyFriendCaptainAutoFill,
        },
      );
    }

    if (result.requestedInput.requireAllSlotsInLeaderSuperEffectScope) {
      return this.buildFinalReportRow(
        'leaderSuperScope',
        'passed',
        this.t('report.rules.leaderSuperScope.passed'),
      );
    }

    return this.buildFinalReportRow(
      'leaderSuperScope',
      'notApplicable',
      this.t('report.rules.leaderSuperScope.notApplicable'),
    );
  }

  /**
   * 869f63gma. The loaded enemy's avoid and prefer rules, in one row. Relaxed only when the hard
   * avoid gave way - and then it names who the search let in. A soft avoid and a prefer are
   * rankings, so they can only have been applied: Passed.
   */
  private buildAvoidPreferReportRow(result: AutoBuildResult): AutoBuildFinalReportRow {
    const rules = normalizeAvoidPreferRules(result.requestedInput);

    if (!hasAvoidPreferRules(rules)) {
      return this.buildFinalReportRow(
        'avoidPrefer',
        'notApplicable',
        this.t('report.rules.avoidPrefer.notApplicable'),
      );
    }

    const relaxedValues = result.relaxation.relaxedAvoidedValues ?? [];
    const manualCharacterIds = new Set(
      result.requestedInput.manualSlots.flatMap((slot) => slot.characterIds),
    );
    const relaxedNames = relaxedValues.length
      ? result.slots
          .filter(
            (slot) =>
              !manualCharacterIds.has(slot.character.id) &&
              resolveCharacterFacetMatches(
                slot.character,
                rules.avoidedTypes,
                rules.avoidedClasses,
              ).length > 0,
          )
          .map((slot) => slot.character.name)
      : [];

    return this.buildFinalReportRow(
      'avoidPrefer',
      relaxedValues.length ? 'relaxed' : 'passed',
      this.describeAvoidPreferRules(rules, relaxedValues, relaxedNames),
    );
  }

  /**
   * 869f63gma. The rules in words: what the search keeps out, ranks lower or ranks higher - or, when
   * the hard avoid gave way, what it let in and who. The line before a build and the report row
   * after one are this one sentence, so they cannot disagree.
   */
  private describeAvoidPreferRules(
    rules: AutoBuildAvoidPreferRules,
    relaxedValues: readonly string[],
    relaxedNames: readonly string[],
  ): string {
    const avoided = [...rules.avoidedTypes, ...rules.avoidedClasses];
    const preferred = [...rules.preferredTypes, ...rules.preferredClasses];
    const sentences: string[] = [];

    if (relaxedValues.length) {
      sentences.push(
        this.t('report.rules.avoidPrefer.avoidRelaxed', {
          values: this.formatResultValues(relaxedValues),
          names: relaxedNames.join(', '),
        }),
      );
    } else if (avoided.length) {
      sentences.push(
        this.t(
          rules.avoidMode === 'soft'
            ? 'report.rules.avoidPrefer.avoidRanked'
            : 'report.rules.avoidPrefer.avoidKept',
          { values: this.formatResultValues(avoided) },
        ),
      );
    }

    if (preferred.length) {
      sentences.push(
        this.t('report.rules.avoidPrefer.preferRanked', {
          values: this.formatResultValues(preferred),
        }),
      );
    }

    return sentences.join(' ');
  }

  /* 869f333ey (D4). Whether the Captain the reader pinned is the one leading the team. */
  private buildCaptainReportRow(result: AutoBuildResult): AutoBuildFinalReportRow {
    const replaced = result.relaxation.replacedCaptain;

    if (replaced) {
      return this.buildFinalReportRow(
        'captain',
        'relaxed',
        this.t('report.rules.captain.relaxed', { from: replaced.fromName, to: replaced.toName }),
        { replacedCaptain: { fromName: replaced.fromName, toName: replaced.toName } },
      );
    }

    const pinnedCaptain = result.requestedInput.manualSlots.some(
      (slot) => slot.role === 'captain' && slot.characterIds.length > 0,
    );
    const captain = result.slots.find((slot) => slot.role === 'captain')?.character;

    if (pinnedCaptain && captain) {
      return this.buildFinalReportRow(
        'captain',
        'passed',
        this.t('report.rules.captain.passed', { captain: captain.name }),
      );
    }

    return this.buildFinalReportRow(
      'captain',
      'notApplicable',
      this.t('report.rules.captain.notApplicable'),
    );
  }

  private buildCaptainAbilityReportRow(result: AutoBuildResult): AutoBuildFinalReportRow {
    const requestedCaptainCoverage = Boolean(
      result.requestedInput.requireFullCaptainAbilityCoverage ||
      result.requestedInput.requireBothLeadersFullCaptainAbilityCoverage,
    );
    const missingLabels = this.captainAbilityCoverageMissingLabels();

    if (
      result.relaxation.ignoredCaptainAbilityCoverage ||
      result.relaxation.downgradedCaptainAbilityCoverageToSimple ||
      (requestedCaptainCoverage && missingLabels.length > 0)
    ) {
      return this.buildFinalReportRow(
        'captainAbility',
        'relaxed',
        missingLabels.length > 0
          ? this.t('report.rules.captainAbility.relaxedWithMissing', {
              missing: missingLabels.join(', '),
            })
          : this.t('report.rules.captainAbility.relaxed'),
        { missingCaptainAbilityLabels: missingLabels },
      );
    }

    if (requestedCaptainCoverage) {
      return this.buildFinalReportRow(
        'captainAbility',
        'passed',
        this.t('report.rules.captainAbility.passed'),
      );
    }

    return this.buildFinalReportRow(
      'captainAbility',
      'notApplicable',
      this.t('report.rules.captainAbility.notApplicable'),
    );
  }

  private buildSuperSpecialReportRow(result: AutoBuildResult): AutoBuildFinalReportRow {
    if (result.relaxation.ignoredLeaderSuperSpecialCriteria) {
      return this.buildFinalReportRow(
        'superSpecial',
        'relaxed',
        this.ignoredSuperSpecialCriteriaLabel(),
        {
          criteriaCharacterNames: result.relaxation.ignoredSuperSpecialCriteriaCharacterNames ?? [],
        },
      );
    }

    if (result.requestedInput.requireLeaderSuperSpecialCriteria) {
      return this.buildFinalReportRow(
        'superSpecial',
        'passed',
        this.t('report.rules.superSpecial.passed'),
      );
    }

    return this.buildFinalReportRow(
      'superSpecial',
      'notApplicable',
      this.t('report.rules.superSpecial.notApplicable'),
    );
  }

  private buildSuperTandemReportRow(result: AutoBuildResult): AutoBuildFinalReportRow {
    if (result.relaxation.ignoredSuperTandemCriteria) {
      return this.buildFinalReportRow(
        'superTandem',
        'relaxed',
        this.ignoredSuperTandemCriteriaLabel(),
        {
          criteriaCharacterNames: result.relaxation.ignoredSuperTandemCriteriaCharacterNames ?? [],
        },
      );
    }

    if (result.requestedInput.requireSuperTandemCriteria) {
      return this.buildFinalReportRow(
        'superTandem',
        'passed',
        this.t('report.rules.superTandem.passed'),
      );
    }

    return this.buildFinalReportRow(
      'superTandem',
      'notApplicable',
      this.t('report.rules.superTandem.notApplicable'),
    );
  }

  private buildFinalReportRow(
    key: string,
    state: AutoBuildFinalReportState,
    detail: string,
    remedyContext?: Omit<FinalReportRemedyContext, 'ruleKey'>,
  ): AutoBuildFinalReportRow {
    return {
      key,
      title: this.t(`report.rules.${key}.title`),
      detail,
      state,
      stateLabel: this.t(`report.states.${state}`),
      // Only a relaxed rule has anything to un-relax. A passed row with a remedy line would be
      // telling the reader to change a rule their team already kept.
      remedy:
        state === 'relaxed'
          ? this.formatFinalReportRemedy(
              resolveFinalReportRemedy({ ruleKey: key, ...(remedyContext ?? {}) }),
            )
          : null,
    };
  }

  /**
   * The remedy kinds, worded. Kept next to the row builder rather than inside the resolver so the
   * resolver stays a pure function over the relaxation record - it is the half that has to be
   * testable without a page, a DOM or a translation loader.
   */
  private formatFinalReportRemedy(remedy: FinalReportRemedy | null): string | null {
    if (!remedy) {
      return null;
    }

    switch (remedy.kind) {
      case 'reduceSelectionBy':
        return this.t('report.remedies.reduceSelectionBy', {
          count: remedy.count,
          values: this.formatResultValues(remedy.values),
        });
      case 'deselectValues':
        return this.t('report.remedies.deselectValues', {
          values: this.formatResultValues(remedy.values),
        });
      case 'allowAnyFriendCaptain':
        return this.t('report.remedies.allowAnyFriendCaptain');
      case 'coverCaptainAbilitySlots':
        return this.t('report.remedies.coverCaptainAbilitySlots', {
          count: remedy.missingCount,
        });
      case 'meetActivationCriteria':
        return this.t('report.remedies.meetActivationCriteria', {
          names: this.formatResultValues(remedy.characterNames),
        });
      case 'pinReplacementCaptain':
        return this.t('report.remedies.pinReplacementCaptain', {
          from: remedy.fromName,
          to: remedy.toName,
        });
      default:
        return null;
    }
  }

  /**
   * Seats on the built team, which is what a selected-filter rule can spread its values across.
   *
   * The team, not the free seats: a manually locked sub still carries its character's type, class
   * and tags, so it can satisfy a value the search never picked it for. `result.slots` rather than
   * the constant, so a team the search returned short is counted as it actually is.
   */
  private countTeamSlots(result: AutoBuildResult): number {
    return result.slots.length || AUTO_BUILD_MANUAL_SLOT_ROLES.length;
  }

  private formatSelectedValues(values: readonly string[]): string {
    return values.join(' / ');
  }

  private sameUnorderedValues<T>(left: readonly T[], right: readonly T[]): boolean {
    return (
      left.length === right.length &&
      left.every((value) => right.includes(value)) &&
      right.every((value) => left.includes(value))
    );
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

  private resolveBuildEstimatedRemainingMs(progress: AutoBuildProgressSnapshot): number | null {
    const snapshotReceivedAtMs = this.buildProgressSnapshotReceivedAtMs();
    const elapsedSinceSnapshotMs =
      snapshotReceivedAtMs === null
        ? 0
        : Math.max(0, this.resolveBuildEtaNowMs() - snapshotReceivedAtMs);

    if (typeof progress.estimatedRemainingMs === 'number' && progress.estimatedRemainingMs > 0) {
      return Math.max(0, progress.estimatedRemainingMs - elapsedSinceSnapshotMs);
    }

    if (
      typeof progress.completedWorkUnits !== 'number' ||
      typeof progress.totalWorkUnits !== 'number' ||
      progress.completedWorkUnits <= 0 ||
      progress.totalWorkUnits <= progress.completedWorkUnits ||
      progress.elapsedMs <= 0
    ) {
      return null;
    }

    const totalEstimatedMs =
      (progress.elapsedMs / progress.completedWorkUnits) * progress.totalWorkUnits;
    const currentElapsedMs = progress.elapsedMs + elapsedSinceSnapshotMs;

    return Math.max(0, totalEstimatedMs - currentElapsedMs);
  }

  private resolveBuildEtaNowMs(): number {
    const currentTickerValue = this.buildProgressNowMs();

    return currentTickerValue > 0 ? currentTickerValue : Date.now();
  }

  private formatEtaClockTime(timestampMs: number): string {
    const date = new Date(timestampMs);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  private formatLiveDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));

    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }

    const totalMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${totalMinutes}m ${seconds}s`;
  }

  private formatProgressLeaderLabel(name: string | undefined, id: number | undefined): string {
    if (name && typeof id === 'number') {
      return `${name} (#${id})`;
    }

    if (name) {
      return name;
    }

    return typeof id === 'number' ? `#${id}` : '';
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

    const records = await this.repository.getAutoBuilderCandidates(
      this.selectedTypes(),
      AUTO_TEAM_CANDIDATE_LIMIT,
      {
        selectedClasses: this.selectedClasses(),
        allowedCharacterIds: allowedCharacterIds.length > 0 ? allowedCharacterIds : undefined,
        lockedCharacterIds: this.lockedCharacterIds(),
        excludedCharacterIds: this.effectiveExcludedCharacterIds(),
      },
    );

    return this.autoTeamBuilder.resolveCaptainCoveredCandidateRecords(records, {
      captainCharacterId: this.effectiveCaptainLeaderId(),
      friendCaptainCharacterId: this.effectiveFriendLeaderId(),
      requireFullCaptainAbilityCoverage: this.requireFullCaptainAbilityCoverage(),
      requireBothLeadersFullCaptainAbilityCoverage:
        this.requireBothLeadersFullCaptainAbilityCoverage(),
    });
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

  private resolvePresetFavoriteScopeWarnings(
    payload: AutoTeamSelectionExportPayload,
  ): AutoTeamSelectionImportMessage[] {
    const warnings: AutoTeamSelectionImportMessage[] = [];

    if (
      payload.filters.favoritesOnly &&
      payload.filters.favoriteCount !== this.favoriteCharacterIds().length
    ) {
      warnings.push({
        key: 'preset.warnings.favoriteCountMismatch',
        params: {
          imported: payload.filters.favoriteCount,
          current: this.favoriteCharacterIds().length,
        },
      });
    }

    if (
      payload.filters.favoriteShipsOnly === true &&
      (payload.filters.favoriteShipCount ?? 0) !== this.favoriteShipIds().length
    ) {
      warnings.push({
        key: 'preset.warnings.favoriteShipCountMismatch',
        params: {
          imported: payload.filters.favoriteShipCount ?? 0,
          current: this.favoriteShipIds().length,
        },
      });
    }

    return warnings;
  }

  private resolveProgressLeaderScope(
    characterId: number | null | undefined,
    role: 'captain' | 'friendCaptain',
  ): { label: string; isWarning: boolean } | null {
    if (typeof characterId !== 'number' || !Number.isInteger(characterId) || characterId <= 0) {
      return null;
    }

    const isFavorite = this.favoriteCharacterIds().includes(characterId);
    const isManualLocked = this.manualSlots().some((slot) =>
      slot.characterIds.includes(characterId),
    );
    const isManualLeaderPick = this.manualSlots().some(
      (slot) => slot.role === role && slot.characterIds.includes(characterId),
    );

    if (this.favoritesOnly()) {
      if (isFavorite) {
        return {
          label: this.t('progress.leaderScopeFavorite'),
          isWarning: false,
        };
      }

      if (isManualLocked) {
        return {
          label: this.t('progress.leaderScopeManualOutsideFavorites'),
          isWarning: false,
        };
      }

      return {
        label: this.t('progress.leaderScopeUnexpectedOutsideFavorites'),
        isWarning: true,
      };
    }

    if (isManualLeaderPick || isManualLocked) {
      return {
        label: this.t('progress.leaderScopeManual'),
        isWarning: false,
      };
    }

    return null;
  }

  private joinRequirementLabels(labels: string[]): string {
    return labels.join(this.t('errors.requirements.separator'));
  }

  private resetSaveFeedbackState(): void {
    this.saveUiLocked.set(false);
    this.saveFeedbackError.set('');
  }

  /**
   * After Quick start turns guided build on (869exmkam): Build is the next step. The page bottom
   * can be the Compare panel rather than Build, and the button that was tapped unmounts with the
   * card, so bring Build itself into view and give it focus. ion-button does not delegate focus to
   * its native button, so that one is focused.
   */
  private async revealBuildButton(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => resolve());
        return;
      }

      globalThis.setTimeout(resolve, 0);
    });

    const button = this.buildSubmitButton?.nativeElement;

    button?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    (button?.shadowRoot?.querySelector<HTMLElement>('button') ?? button)?.focus?.({
      preventScroll: true,
    });
  }

  private async scrollToBottom(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => resolve());
        return;
      }

      globalThis.setTimeout(resolve, 0);
    });

    await this.content?.scrollToBottom(300);
  }

  /*
   * 869f135ra. The three sentences every failure owes the player - what
   * happened, whether their data is safe, and the one thing to try - in the same
   * words as every other screen. `extra` is whatever this page knows that the
   * vocabulary cannot: the name of the row that was skipped, the specific parse
   * error. It sits between the first and second sentence so the message still
   * ENDS on the thing to do.
   */
  private failureDetails(
    familyId: string,
    extra?: string | readonly string[] | null,
    error?: unknown,
  ): string[] {
    return [
      ...buildFailureLines(
        resolveFailureFamily(error, familyId),
        (key, params, scope) => this.i18n.translate(key, params, scope),
        extra ?? null,
      ),
    ];
  }

}

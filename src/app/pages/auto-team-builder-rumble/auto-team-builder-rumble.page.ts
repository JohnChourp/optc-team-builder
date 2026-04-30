import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonModal,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import {
  chevronDownOutline,
  chevronUpOutline,
  closeOutline,
  cloudUploadOutline,
  createOutline,
  refreshOutline,
  saveOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  AUTO_TEAM_BUILDER_TYPES,
  type AutoTeamBuilderType,
} from '../../core/models/auto-team-builder.models';
import {
  DEFAULT_RUMBLE_BUFF_FOCUS,
  RUMBLE_BUFF_FOCUS_RANKS,
  RUMBLE_BUFF_FOCUS_STATS,
  RUMBLE_ACTIVE_SLOT_COUNT,
  RUMBLE_BENCH_SLOT_COUNT,
  type NormalizedRumbleEffect,
  type NormalizedRumbleRoleTag,
  type RumbleBuffFocusPreference,
  type RumbleBuffFocusRank,
  type RumbleBuffFocusStat,
  type RumbleBuildInput,
  type RumbleBuildProgressSnapshot,
  type RumbleOpponentSlotContext,
  type RumbleTeamResult,
  type RumbleTeamSlot,
  type RumbleTeamSlotRole,
  type RumbleUnitScore,
} from '../../core/models/auto-team-builder-rumble.models';
import { type CharacterBox, type CharacterDetailRecord } from '../../core/models/optc.models';
import {
  AutoTeamBuilderRumbleService,
  type RumbleTeamBuildExecutionOptions,
} from '../../core/services/auto-team-builder-rumble.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import {
  UserStateService,
  type AutoTeamBuilderWorkerMode,
} from '../../core/services/user-state.service';
import * as rumbleExportUtils from './auto-team-builder-rumble-export.utils';
import {
  type RumbleBuilderSettingsExportPayload,
  type RumbleTeamExportPayload,
} from './auto-team-builder-rumble-export.utils';
import {
  RumbleBuilderImportError,
  buildOpponentCharacterIdSlotsFromImportPayload,
  buildSavedRumbleTeamResultSnapshot,
  buildSavedRumbleTeamResultSnapshotsFromImportPayload,
  parseRumbleBuilderSettingsImportPayload,
  parseRumbleTeamImportPayload,
} from './auto-team-builder-rumble-import.utils';
import {
  type SavedRumbleTeam,
  type SavedRumbleTeamResult,
  type SavedRumbleTeamSlot,
} from '../../core/models/saved-rumble-team.models';

type LoadingProgressRowTone = 'primary' | 'secondary' | 'fallback';

interface LoadingProgressRow {
  text: string;
  displayText: string;
  visible: boolean;
  tone: LoadingProgressRowTone;
}

type ManualPickerTeam = 'player' | 'opponent';
type OptionalRumbleTeamSlot = RumbleTeamSlot | null;

interface ManualSlotTarget {
  team: ManualPickerTeam;
  role: RumbleTeamSlotRole;
  index: number;
}

const RUMBLE_BUFF_STATS = ['HP', 'ATK', 'DEF', 'RCV', 'SPD', 'Special CT'] as const;
const RUMBLE_TEAM_COST_LIMIT = 300;

type RumbleBuffStat = (typeof RUMBLE_BUFF_STATS)[number];
type RumbleBuffFocusDirection = 'up' | 'down';

interface RumbleBuffSummaryRow {
  stat: RumbleBuffStat;
  label: string;
  value: string;
}

interface RumbleComparisonRow {
  labelKey: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
}

interface RumbleImportFeedback {
  details: string[];
  title: string;
  tone: 'error' | 'success' | 'warning';
}

const ROLE_LABELS: Record<NormalizedRumbleRoleTag, string> = {
  attacker: 'roleLabels.attacker',
  booster: 'roleLabels.booster',
  defender: 'roleLabels.defender',
  disruptor: 'roleLabels.disruptor',
  healer: 'roleLabels.healer',
  speed: 'roleLabels.speed',
};

function createEmptyRumbleSlots(count: number): OptionalRumbleTeamSlot[] {
  return Array.from({ length: count }, () => null);
}

@Component({
  selector: 'app-auto-team-builder-rumble-page',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonModal,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToggle,
    IonToolbar,
    RouterLink,
    TranslocoDirective,
  ],
  templateUrl: './auto-team-builder-rumble.page.html',
  styleUrl: './auto-team-builder-rumble.page.scss',
})
export class AutoTeamBuilderRumblePage implements OnInit, OnDestroy {
  public readonly teamResults = signal<RumbleTeamResult[]>([]);
  public readonly selectedTeamIndex = signal(0);
  public readonly currentResult = computed(
    () => this.teamResults()[this.selectedTeamIndex()] ?? null,
  );
  public readonly result = computed(() => this.currentResult());
  public readonly loading = signal(false);
  public readonly initialized = signal(false);
  public readonly errorMessage = signal('');
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly availableClasses = signal<string[]>([]);
  public readonly onlySelectedTypes = signal(false);
  public readonly onlySelectedClasses = signal(false);
  public readonly favoritesOnly = signal(false);
  public readonly selectedCharacterBoxId = signal<string | null>(null);
  public readonly buildProgress = signal<RumbleBuildProgressSnapshot | null>(null);
  public readonly manualPickerOpen = signal(false);
  public readonly manualPickerLoading = signal(false);
  public readonly manualPickerSearchTerm = signal('');
  public readonly manualPickerCandidates = signal<RumbleUnitScore[]>([]);
  public readonly manualPickerTarget = signal<ManualSlotTarget | null>(null);
  public readonly opponentActiveSlots = signal<OptionalRumbleTeamSlot[]>(
    createEmptyRumbleSlots(RUMBLE_ACTIVE_SLOT_COUNT),
  );
  public readonly opponentBenchSlots = signal<OptionalRumbleTeamSlot[]>(
    createEmptyRumbleSlots(RUMBLE_BENCH_SLOT_COUNT),
  );
  public readonly opponentAwarenessEnabled = signal(false);
  public readonly buffFocus = signal<RumbleBuffFocusPreference[]>(
    DEFAULT_RUMBLE_BUFF_FOCUS.map((preference) => ({ ...preference })),
  );
  public readonly excludedCharacterIds = signal<number[]>([]);
  public readonly importFeedback = signal<RumbleImportFeedback | null>(null);
  private readonly excludedCharacterRecordsById = signal<Record<number, CharacterDetailRecord>>({});
  private readonly buildProgressNowMs = signal(0);
  private readonly currentBuildStepStartedAtMs = signal<number | null>(null);
  private buildAbortController: AbortController | null = null;
  private progressTicker: ReturnType<typeof globalThis.setInterval> | null = null;

  public readonly activeSlotTargetCount = RUMBLE_ACTIVE_SLOT_COUNT;
  public readonly benchSlotTargetCount = RUMBLE_BENCH_SLOT_COUNT;
  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly sparklesIcon = sparklesOutline;
  public readonly refreshIcon = refreshOutline;
  public readonly shieldIcon = shieldHalfOutline;
  public readonly editIcon = createOutline;
  public readonly closeIcon = closeOutline;
  public readonly importIcon = cloudUploadOutline;
  public readonly saveIcon = saveOutline;
  public readonly promoteIcon = chevronUpOutline;
  public readonly demoteIcon = chevronDownOutline;
  public readonly favoriteCharacterIds;
  public readonly characterBoxes;
  public readonly autoTeamBuilderWorkerPreference;
  public readonly autoTeamBuilderWorkerRuntime;
  public readonly autoTeamBuilderAvailableWorkerCounts;
  public readonly buffFocusRanks = RUMBLE_BUFF_FOCUS_RANKS;

  public readonly hasResult = computed(() => this.currentResult() !== null);
  public readonly hasAlternateTeams = computed(() => this.teamResults().length > 1);
  public readonly currentSelectedCount = computed(() => this.currentResult()?.selectedCount ?? 0);
  public readonly currentRequiredSlotCount = computed(() => {
    const currentResult = this.currentResult();

    return currentResult
      ? this.resolveRequiredSlotCount(currentResult)
      : this.activeSlotTargetCount + this.benchSlotTargetCount;
  });
  public readonly currentDroppedClasses = computed(
    () => this.currentResult()?.droppedClasses ?? [],
  );
  public readonly hasFavoriteCharacters = computed(() => this.favoriteCharacterIds().length > 0);
  public readonly selectedCharacterBox = computed(() =>
    this.resolveCharacterBoxById(this.selectedCharacterBoxId()),
  );
  public readonly selectedCharacterBoxCharacterIds = computed(
    () => this.selectedCharacterBox()?.characterIds ?? [],
  );
  public readonly selectedCharacterBoxFavoriteCount = computed(() => {
    const boxCharacterIds = new Set(this.selectedCharacterBoxCharacterIds());

    if (!boxCharacterIds.size) {
      return 0;
    }

    return this.favoriteCharacterIds().filter((characterId) => boxCharacterIds.has(characterId))
      .length;
  });
  public readonly buildBlockedByFavorites = computed(
    () => this.favoritesOnly() && !this.hasFavoriteCharacters(),
  );
  public readonly buildBlockedByCharacterBox = computed(
    () =>
      Boolean(this.selectedCharacterBox()) && this.selectedCharacterBoxCharacterIds().length === 0,
  );
  public readonly buildBlockedByBoxFavorites = computed(
    () =>
      this.favoritesOnly() &&
      Boolean(this.selectedCharacterBox()) &&
      this.hasFavoriteCharacters() &&
      this.selectedCharacterBoxCharacterIds().length > 0 &&
      this.selectedCharacterBoxFavoriteCount() === 0,
  );
  public readonly buildDisabled = computed(
    () =>
      this.loading() ||
      this.buildBlockedByFavorites() ||
      this.buildBlockedByCharacterBox() ||
      this.buildBlockedByBoxFavorites() ||
      !this.initialized(),
  );
  public readonly excludedCharacters = computed(() => {
    const recordsById = this.excludedCharacterRecordsById();

    return this.excludedCharacterIds()
      .map((characterId) => recordsById[characterId] ?? null)
      .filter((character): character is CharacterDetailRecord => Boolean(character));
  });
  public readonly hasExcludedCharacters = computed(() => this.excludedCharacterIds().length > 0);
  public readonly opponentAwarenessSupportLabel = computed(() =>
    this.opponentAwarenessEnabled()
      ? this.t('opponent.awarenessSupport.enabled', {
          count: this.collectOpponentTeamSlots().length,
        })
      : this.t('opponent.awarenessSupport.disabled'),
  );
  public readonly opponentDebuffRuleLabel = computed(() =>
    this.opponentAwarenessEnabled() && this.collectOpponentTeamSlots().length > 0
      ? this.t('opponent.debuffRule.enabled')
      : this.t('opponent.debuffRule.disabled'),
  );
  public readonly canDownloadSettingsJson = computed(() => this.initialized());
  public readonly canSaveRumbleTeam = computed(() => this.initialized() && !this.loading());
  public readonly canDownloadTeamJson = computed(() => {
    const currentResult = this.currentResult();

    return Boolean(
      currentResult &&
      !this.strictTypeBlockedStateVisible() &&
      currentResult.selectedCount >= this.resolveRequiredSlotCount(currentResult) &&
      currentResult.activeSlots.length + currentResult.benchSlots.length > 0,
    );
  });
  public readonly selectedTypesLabel = computed(() =>
    this.selectedTypes().length ? this.selectedTypes().join(' / ') : this.t('filters.types.empty'),
  );
  public readonly selectedClassesLabel = computed(() =>
    this.selectedClasses().length
      ? this.selectedClasses().join(' / ')
      : this.t('filters.classes.empty'),
  );
  public readonly allTypesSelected = computed(
    () => this.selectedTypes().length === this.availableTypes.length,
  );
  public readonly allClassesSelected = computed(
    () =>
      this.availableClasses().length > 0 &&
      this.selectedClasses().length === this.availableClasses().length,
  );
  public readonly selectAllTypesButtonLabel = computed(() =>
    this.allTypesSelected() ? this.t('filters.types.clearAll') : this.t('filters.types.selectAll'),
  );
  public readonly selectAllClassesButtonLabel = computed(() =>
    this.allClassesSelected()
      ? this.t('filters.classes.clearAll')
      : this.t('filters.classes.selectAll'),
  );
  public readonly favoritesOnlySupportLabel = computed(() =>
    this.hasFavoriteCharacters()
      ? this.t('filters.favoritesOnly.support.withCount', {
          count: this.favoriteCharacterIds().length,
        })
      : this.t('filters.favoritesOnly.support.empty'),
  );
  public readonly characterBoxSupportLabel = computed(() => {
    const selectedBox = this.selectedCharacterBox();

    if (!this.characterBoxes().length) {
      return this.t('filters.characterBox.support.noBoxes');
    }

    if (!selectedBox) {
      return this.t('filters.characterBox.support.all');
    }

    if (this.favoritesOnly()) {
      return this.t('filters.characterBox.support.withFavorites', {
        count: this.selectedCharacterBoxFavoriteCount(),
        total: selectedBox.characterIds.length,
      });
    }

    return this.t('filters.characterBox.support.withCount', {
      count: selectedBox.characterIds.length,
    });
  });
  public readonly onlySelectedTypesSupportLabel = computed(() =>
    this.onlySelectedTypes()
      ? this.t('filters.types.onlySupport.strict')
      : this.t('filters.types.onlySupport.soft'),
  );
  public readonly onlySelectedClassesSupportLabel = computed(() =>
    this.onlySelectedClasses()
      ? this.t('filters.classes.onlySupport.strict')
      : this.t('filters.classes.onlySupport.soft'),
  );
  public readonly emptyStateVisible = computed(() => {
    const currentResult = this.currentResult();

    return Boolean(
      currentResult &&
      !this.loading() &&
      !this.errorMessage() &&
      !this.strictTypeBlockedStateVisible() &&
      currentResult.candidateCount === 0,
    );
  });
  public readonly insufficientStateVisible = computed(() => {
    const currentResult = this.currentResult();

    if (!currentResult) {
      return false;
    }

    return (
      !this.loading() &&
      !this.errorMessage() &&
      !this.strictTypeBlockedStateVisible() &&
      currentResult.selectedCount < this.resolveRequiredSlotCount(currentResult) &&
      currentResult.candidateCount > 0
    );
  });
  public readonly strictTypeBlockedStateVisible = computed(() => {
    const currentResult = this.currentResult();

    return Boolean(
      currentResult &&
      !this.loading() &&
      !this.errorMessage() &&
      (currentResult.input.onlySelectedTypes || currentResult.input.onlySelectedClasses) &&
      currentResult.selectedCount === 0,
    );
  });
  public readonly relaxedStateVisible = computed(() => {
    const currentResult = this.currentResult();

    return Boolean(
      currentResult &&
      !this.loading() &&
      currentResult.selectedCount > 0 &&
      currentResult.droppedClasses.length > 0,
    );
  });
  public readonly comparisonRows = computed(() => {
    const currentResult = this.currentResult();
    const otherResult = this.resolveOtherResult();

    if (!currentResult || !otherResult) {
      return [];
    }

    return [
      this.buildComparisonRow(
        'comparison.score',
        currentResult.totalScore - otherResult.totalScore,
      ),
      this.buildComparisonRow(
        'comparison.rumbleCost',
        this.resolveRumbleCostTotal(this.collectTeamCostSlots(currentResult)) -
          this.resolveRumbleCostTotal(this.collectTeamCostSlots(otherResult)),
        true,
      ),
      this.buildComparisonRow(
        'comparison.roles',
        currentResult.roleCoverage.length - otherResult.roleCoverage.length,
      ),
      this.buildComparisonRow(
        'comparison.types',
        currentResult.typeCoverage.length - otherResult.typeCoverage.length,
      ),
      this.buildComparisonRow(
        'comparison.classes',
        currentResult.classCoverage.length - otherResult.classCoverage.length,
      ),
      this.buildComparisonRow(
        'comparison.buffs',
        this.resolveTeamBuffTotal(currentResult) - this.resolveTeamBuffTotal(otherResult),
      ),
    ];
  });
  public readonly buildOverallProgressPercent = computed(() => {
    const progress = this.buildProgress();

    if (!progress) {
      return 0;
    }

    if (progress.stage === 'completed') {
      return 100;
    }

    const totalAttempts = Math.max(1, progress.totalAttempts);
    const totalPhases = totalAttempts + 1;
    const innerProgress =
      typeof progress.completedWorkUnits === 'number' &&
      typeof progress.totalWorkUnits === 'number' &&
      progress.totalWorkUnits > 0
        ? Math.max(0, Math.min(1, progress.completedWorkUnits / progress.totalWorkUnits))
        : 0;
    const completedSearchPhases =
      progress.stage === 'scoringCandidates' || progress.stage === 'loadingCandidates' ? 0 : 1;
    const completedAttemptProgress =
      progress.stage === 'attempt' ||
      progress.stage === 'selectingSlots' ||
      progress.stage === 'improvingTeam'
        ? Math.max(0, Math.min(totalAttempts, progress.completedAttempts + innerProgress))
        : Math.max(0, Math.min(totalAttempts, progress.completedAttempts));
    const percent = Math.round(
      ((completedSearchPhases + completedAttemptProgress) / totalPhases) * 100,
    );

    return Math.max(0, Math.min(99, percent));
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
  public readonly loadingLabel = computed(() => {
    const progress = this.buildProgress();

    return progress
      ? this.t(progress.messageKey, progress.messageParams)
      : this.t('states.loading');
  });
  public readonly loadingProgressRows = computed<LoadingProgressRow[]>(() => {
    const progress = this.buildProgress();
    const rows: Array<Pick<LoadingProgressRow, 'text' | 'tone'>> = [
      {
        text: this.loadingLabel(),
        tone: 'primary',
      },
      {
        text: progress?.candidateCount
          ? this.t('progress.candidatePool', { count: progress.candidateCount })
          : '',
        tone: 'secondary',
      },
      {
        text: progress?.totalAttempts
          ? this.t('progress.searchPasses', {
              attempts: progress.totalAttempts.toLocaleString(),
              count: progress.candidateCount.toLocaleString(),
            })
          : '',
        tone: 'secondary',
      },
      {
        text:
          typeof progress?.checkedCandidates === 'number' &&
          typeof progress.totalCandidatesToCheck === 'number' &&
          progress.totalCandidatesToCheck > 0
            ? this.t('progress.candidateChecks', {
                checked: progress.checkedCandidates.toLocaleString(),
                total: progress.totalCandidatesToCheck.toLocaleString(),
              })
            : '',
        tone: 'secondary',
      },
      {
        text:
          typeof progress?.currentSlot === 'number' &&
          typeof progress.totalSlots === 'number' &&
          progress.totalSlots > 0
            ? this.t('progress.slotProgress', {
                current: progress.currentSlot,
                total: progress.totalSlots,
              })
            : '',
        tone: 'secondary',
      },
      {
        text:
          typeof progress?.retainedVariants === 'number'
            ? this.t('progress.retainedVariants', {
                count: progress.retainedVariants.toLocaleString(),
              })
            : '',
        tone: 'secondary',
      },
      {
        text:
          typeof progress?.activeWorkerCount === 'number'
            ? this.t('progress.activeWorkers', { count: progress.activeWorkerCount })
            : '',
        tone: 'secondary',
      },
      {
        text: progress?.currentDroppedClasses.length
          ? this.t('progress.ignoringClasses', {
              classes: progress.currentDroppedClasses.join(' / '),
            })
          : '',
        tone: 'fallback',
      },
      {
        text:
          typeof progress?.estimatedRemainingMs === 'number'
            ? this.t('progress.worstCaseEta', {
                duration: this.formatApproximateDuration(progress.estimatedRemainingMs),
              })
            : '',
        tone: 'fallback',
      },
    ];

    return rows.map((row) => ({
      ...row,
      displayText: row.text || '\u00A0',
      visible: row.text.length > 0,
    }));
  });
  public readonly manualPickerResults = computed(() => {
    const searchTerm = this.manualPickerSearchTerm().trim().toLowerCase();
    const target = this.manualPickerTarget();
    const selectedIds = this.resolveSelectedCharacterIds(target);

    return this.manualPickerCandidates()
      .filter((candidate) => this.manualPickerCandidateMatchesScope(candidate, target))
      .filter((candidate) => !selectedIds.has(candidate.character.id))
      .filter((candidate) => {
        if (!searchTerm) {
          return true;
        }

        const haystack = [
          candidate.character.id.toString(),
          candidate.character.name,
          candidate.character.type,
          ...candidate.character.classes,
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(searchTerm);
      })
      .slice(0, 80);
  });

  public constructor(
    private readonly rumbleBuilder: AutoTeamBuilderRumbleService,
    private readonly repository: OptcRepositoryService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
    this.characterBoxes = this.userState.characterBoxes;
    this.autoTeamBuilderWorkerPreference = this.userState.autoTeamBuilderWorkerPreference;
    this.autoTeamBuilderWorkerRuntime = computed(() =>
      this.userState.resolveAutoTeamBuilderWorkerPreference(),
    );
    this.autoTeamBuilderAvailableWorkerCounts = computed(() =>
      Array.from(
        { length: this.autoTeamBuilderWorkerRuntime().manualMaxCount },
        (_value, index) => index + 1,
      ),
    );
  }

  public async ngOnInit(): Promise<void> {
    await Promise.all([this.i18n.preloadScope('auto-team-builder-rumble'), this.userState.ready()]);
    const manifest = await this.repository.getDatasetManifest();

    this.availableClasses.set([...manifest.availableClasses]);
    this.initialized.set(true);
    await this.applySavedRumbleTeamFromRoute();
  }

  public ngOnDestroy(): void {
    this.cancelBuild();
    this.stopBuildProgressTicker();
  }

  public async buildTeam(): Promise<void> {
    this.clearMissingSelectedCharacterBox();

    if (
      !this.initialized() ||
      this.buildBlockedByFavorites() ||
      this.buildBlockedByCharacterBox() ||
      this.buildBlockedByBoxFavorites()
    ) {
      return;
    }

    const previousTeamResults = this.teamResults();
    const previousTeamIndex = this.selectedTeamIndex();
    const abortController = new AbortController();

    this.buildAbortController = abortController;
    this.loading.set(true);
    this.errorMessage.set('');
    this.teamResults.set([]);
    this.selectedTeamIndex.set(0);
    this.buildProgress.set(null);
    this.startBuildProgressTicker();

    try {
      const executionOptions: RumbleTeamBuildExecutionOptions = {
        signal: abortController.signal,
        onProgress: (snapshot) => this.handleBuildProgressSnapshot(snapshot),
        workerCount: this.userState.resolveAutoTeamBuilderWorkerCount(),
        getWorkerCount: () => this.userState.resolveAutoTeamBuilderWorkerCount(),
      };
      const candidateCharacterIds = await this.resolveCandidateCharacterIdsForBuild();

      if (abortController.signal.aborted) {
        throw new Error('Rumble team build cancelled.');
      }

      const baseInput: Partial<RumbleBuildInput> = {
        types: this.selectedTypes(),
        selectedClasses: this.selectedClasses(),
        onlySelectedTypes: this.onlySelectedTypes(),
        onlySelectedClasses: this.onlySelectedClasses(),
        favoritesOnly: this.favoritesOnly(),
        favoriteCharacterIds: this.favoriteCharacterIds(),
        characterBoxId: this.selectedCharacterBox()?.id ?? null,
        candidateCharacterIds,
        opponentSlots: this.opponentAwarenessEnabled() ? this.buildOpponentSlotContexts() : [],
        buffFocus: this.buffFocus(),
      };
      const fullTeamResults = await this.rumbleBuilder.buildBestTeams(
        {
          ...baseInput,
          requireFullTeam: true,
        },
        executionOptions,
        1,
      );

      if (abortController.signal.aborted) {
        throw new Error('Rumble team build cancelled.');
      }

      const activeOnlyResults = await this.rumbleBuilder.buildBestTeams(
        {
          ...baseInput,
          requireFullTeam: false,
        },
        {
          ...executionOptions,
          resultMode: 'closestCost',
        },
        1,
      );

      this.teamResults.set(this.combineGeneratedTeamResults(fullTeamResults, activeOnlyResults));
      this.selectedTeamIndex.set(0);
    } catch (error) {
      if (abortController.signal.aborted || this.isRumbleBuildCancelledError(error)) {
        this.teamResults.set(previousTeamResults);
        this.selectedTeamIndex.set(previousTeamIndex);
        this.errorMessage.set('');
        return;
      }

      this.teamResults.set([]);
      this.selectedTeamIndex.set(0);
      this.errorMessage.set(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : this.t('states.errorFallback'),
      );
    } finally {
      if (this.buildAbortController === abortController) {
        this.buildAbortController = null;
      }

      this.stopBuildProgressTicker();
      this.buildProgress.set(null);
      this.loading.set(false);
    }
  }

  public cancelBuild(): void {
    this.buildAbortController?.abort();
  }

  public buildSettingsExportPayload(
    exportedAt = new Date().toISOString(),
  ): RumbleBuilderSettingsExportPayload {
    return rumbleExportUtils.buildRumbleBuilderSettingsExportPayload({
      exportedAt,
      settings: this.buildCurrentRumbleSettings(),
      favoriteCount: this.favoriteCharacterIds().length,
      workerPreference: this.autoTeamBuilderWorkerPreference(),
    });
  }

  public buildTeamExportPayload(
    exportedAt = new Date().toISOString(),
  ): RumbleTeamExportPayload | null {
    return this.canDownloadTeamJson()
      ? rumbleExportUtils.buildRumbleTeamExportPayload(this.currentResult(), exportedAt, {
          allResults: this.teamResults(),
          selectedTeamIndex: this.selectedTeamIndex(),
          opponentSlots: this.collectOpponentTeamSlots(),
        })
      : null;
  }

  public downloadSettingsJson(): void {
    if (!this.canDownloadSettingsJson()) {
      return;
    }

    rumbleExportUtils.downloadRumbleBuilderSettingsExport(this.buildSettingsExportPayload());
  }

  public downloadTeamJson(): void {
    rumbleExportUtils.downloadRumbleTeamExport(this.buildTeamExportPayload());
  }

  public openFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onSettingsFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = '';

    if (!file) {
      return;
    }

    await this.importSettingsJson(file);
  }

  public async onTeamFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = '';

    if (!file) {
      return;
    }

    await this.importTeamJson(file);
  }

  public async saveCurrentRumbleTeam(): Promise<void> {
    if (!this.canSaveRumbleTeam()) {
      return;
    }

    const defaultName = this.buildDefaultRumbleTeamName();
    const promptedName =
      typeof globalThis.prompt === 'function'
        ? globalThis.prompt(this.t('save.prompt'), defaultName)
        : defaultName;
    const name = promptedName?.trim();

    if (!name) {
      return;
    }

    const savedRumbleTeam = await this.userState.saveRumbleTeam({
      name,
      notes: '',
      settings: this.buildCurrentRumbleSettings(),
      teams: this.teamResults()
        .slice(0, 2)
        .map((result) => buildSavedRumbleTeamResultSnapshot(result)),
      selectedTeamIndex: this.selectedTeamIndex(),
      opponentActiveCharacterIds: this.opponentActiveSlots().map(
        (slot) => slot?.unit.character.id ?? null,
      ),
      opponentBenchCharacterIds: this.opponentBenchSlots().map(
        (slot) => slot?.unit.character.id ?? null,
      ),
      opponentAwarenessEnabled: this.opponentAwarenessEnabled(),
    });

    this.importFeedback.set({
      tone: 'success',
      title: this.t('save.successTitle'),
      details: [this.t('save.successDetail', { name: savedRumbleTeam.name })],
    });
  }

  public onTypeChange(
    event: CustomEvent<{ value?: AutoTeamBuilderType[] | AutoTeamBuilderType | null }>,
  ): void {
    this.selectedTypes.set(this.resolveSelectedTypes(event.detail.value));
    this.resetBuildState();
  }

  public onClassChange(event: CustomEvent<{ value?: string[] | string | null }>): void {
    this.selectedClasses.set(this.resolveSelectedClasses(event.detail.value));
    this.resetBuildState();
  }

  public onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.favoritesOnly.set(event.detail.checked);
    this.resetBuildState();
  }

  public onCharacterBoxChange(event: CustomEvent<{ value?: string | null }>): void {
    this.selectedCharacterBoxId.set(this.normalizeCharacterBoxId(event.detail.value));
    this.resetBuildState();
  }

  public onOnlySelectedTypesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.onlySelectedTypes.set(event.detail.checked);
    this.resetBuildState();
  }

  public onOnlySelectedClassesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.onlySelectedClasses.set(event.detail.checked);
    this.resetBuildState();
  }

  public selectTeam(index: number): void {
    if (this.loading() || index < 0 || index >= this.teamResults().length) {
      return;
    }

    this.selectedTeamIndex.set(index);
  }

  public onOpponentAwarenessToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.opponentAwarenessEnabled.set(event.detail.checked);
    this.resetBuildState();
  }

  public buffFocusLabelKey(rank: RumbleBuffFocusRank): string {
    return `filters.buffFocus.ranks.${rank}`;
  }

  public buffFocusStatsForRank(rank: RumbleBuffFocusRank): RumbleBuffFocusStat[] {
    return this.buffFocus()
      .filter((preference) => preference.rank === rank)
      .map((preference) => preference.stat);
  }

  public canMoveBuffFocusStat(
    stat: RumbleBuffFocusStat,
    direction: RumbleBuffFocusDirection,
  ): boolean {
    const rankIndex = this.resolveBuffFocusRankIndex(this.resolveBuffFocusRank(stat));

    return direction === 'up'
      ? rankIndex > 0
      : rankIndex >= 0 && rankIndex < RUMBLE_BUFF_FOCUS_RANKS.length - 1;
  }

  public moveBuffFocusStat(stat: RumbleBuffFocusStat, direction: RumbleBuffFocusDirection): void {
    if (this.loading()) {
      return;
    }

    const currentRankIndex = this.resolveBuffFocusRankIndex(this.resolveBuffFocusRank(stat));
    const nextRankIndex = direction === 'up' ? currentRankIndex - 1 : currentRankIndex + 1;
    const nextRank = RUMBLE_BUFF_FOCUS_RANKS[nextRankIndex];

    if (!nextRank) {
      return;
    }

    this.buffFocus.update((currentFocus) =>
      RUMBLE_BUFF_FOCUS_STATS.map((currentStat) => {
        const currentPreference = currentFocus.find(
          (preference) => preference.stat === currentStat,
        );

        return {
          stat: currentStat,
          rank:
            currentStat === stat
              ? nextRank
              : (currentPreference?.rank ??
                DEFAULT_RUMBLE_BUFF_FOCUS.find((preference) => preference.stat === currentStat)
                  ?.rank ??
                'ignored'),
        };
      }),
    );
    this.resetBuildState();
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

  public selectAllTypes(): void {
    this.selectedTypes.set(this.allTypesSelected() ? [] : [...this.availableTypes]);
    this.resetBuildState();
  }

  public selectAllClasses(): void {
    this.selectedClasses.set(this.allClassesSelected() ? [] : [...this.availableClasses()]);
    this.resetBuildState();
  }

  public removeSelectedType(type: AutoTeamBuilderType): void {
    this.selectedTypes.update((current) => current.filter((value) => value !== type));
    this.resetBuildState();
  }

  public removeSelectedClass(characterClass: string): void {
    this.selectedClasses.update((current) => current.filter((value) => value !== characterClass));
    this.resetBuildState();
  }

  public getCharacterDetailLink(slot: RumbleTeamSlot): string[] {
    return ['/characters', slot.unit.character.id.toString()];
  }

  public formatSlotTooltip(slot: RumbleTeamSlot): string {
    const character = slot.unit.character;
    const typeClassLine = [character.type, character.primaryClass].filter(Boolean).join(' • ');

    return typeClassLine ? `${character.name}\n${typeClassLine}` : character.name;
  }

  public formatScore(value: number): string {
    return Math.round(value).toLocaleString('en-US');
  }

  public formatTeamRumbleCostUsage(result: RumbleTeamResult): string {
    return this.formatRumbleCostUsage(this.collectTeamCostSlots(result));
  }

  public opponentRumbleCostUsage(): string {
    return this.formatRumbleCostUsage(this.collectOpponentTeamSlots());
  }

  public getSlotTotalBuffRows(slot: RumbleTeamSlot): RumbleBuffSummaryRow[] {
    const currentResult = this.result();

    if (!currentResult) {
      return [];
    }

    return this.getTeamSlotTotalBuffRows(slot, currentResult.activeSlots);
  }

  public getOpponentSlotTotalBuffRows(slot: RumbleTeamSlot): RumbleBuffSummaryRow[] {
    return this.getTeamSlotTotalBuffRows(
      slot,
      this.opponentActiveSlots().filter((activeSlot): activeSlot is RumbleTeamSlot =>
        Boolean(activeSlot),
      ),
    );
  }

  public getTeamSlotTotalBuffRows(
    slot: RumbleTeamSlot,
    slots: RumbleTeamSlot[],
  ): RumbleBuffSummaryRow[] {
    const totals = this.resolveSlotTotalBuffs(slot, slots);

    return RUMBLE_BUFF_STATS.map((stat) => ({ stat, total: totals[stat] }))
      .filter(({ total }) => total > 0)
      .map(({ stat, total }) => ({
        stat,
        label: this.formatBuffStatLabel(stat),
        value: `+${this.formatBuffTotal(total)}`,
      }));
  }

  public async openManualCharacterPicker(slot: RumbleTeamSlot): Promise<void> {
    return this.openManualCharacterPickerForTarget({
      team: 'player',
      role: slot.role,
      index: slot.index,
    });
  }

  public openOpponentCharacterPicker(role: RumbleTeamSlotRole, index: number): Promise<void> {
    return this.openManualCharacterPickerForTarget({ team: 'opponent', role, index });
  }

  private async openManualCharacterPickerForTarget(target: ManualSlotTarget): Promise<void> {
    this.manualPickerTarget.set(target);
    this.manualPickerSearchTerm.set('');
    this.manualPickerOpen.set(true);

    if (this.manualPickerCandidates().length) {
      return;
    }

    this.manualPickerLoading.set(true);

    try {
      const candidates = await this.repository.getRumbleBuilderCandidates();
      this.manualPickerCandidates.set(this.rumbleBuilder.scoreCandidates(candidates));
    } finally {
      this.manualPickerLoading.set(false);
    }
  }

  public closeManualCharacterPicker(): void {
    this.manualPickerOpen.set(false);
    this.manualPickerTarget.set(null);
    this.manualPickerSearchTerm.set('');
  }

  public onManualPickerSearch(event: CustomEvent<{ value?: string | null }>): void {
    this.manualPickerSearchTerm.set(event.detail.value ?? '');
  }

  public selectManualCharacter(candidate: RumbleUnitScore): void {
    const target = this.manualPickerTarget();
    const currentResult = this.result();

    if (!target) {
      return;
    }

    if (target.team === 'opponent') {
      this.selectOpponentCharacter(target, candidate);
      this.closeManualCharacterPicker();
      return;
    }

    if (!currentResult) {
      return;
    }

    const replacementSlot = this.createManualSlot(target.role, target.index, candidate);
    const activeSlots =
      target.role === 'active'
        ? this.replaceSlot(currentResult.activeSlots, replacementSlot)
        : currentResult.activeSlots;
    const benchSlots =
      target.role === 'bench'
        ? this.replaceSlot(currentResult.benchSlots, replacementSlot)
        : currentResult.benchSlots;
    const selectedSlots = [...activeSlots, ...benchSlots];

    this.updateCurrentResult({
      ...currentResult,
      activeSlots,
      benchSlots,
      selectedCount: selectedSlots.length,
      totalScore: selectedSlots.reduce((total, slot) => total + slot.score, 0),
      roleCoverage: this.collectRoleCoverage(selectedSlots),
      typeCoverage: this.collectTypeCoverage(selectedSlots),
      classCoverage: this.collectClassCoverage(selectedSlots),
      topFactors: this.buildManualTopFactors(selectedSlots),
    });
    this.closeManualCharacterPicker();
  }

  public clearOpponentSlot(role: RumbleTeamSlotRole, index: number): void {
    if (role === 'active') {
      this.opponentActiveSlots.update((slots) => this.replaceOptionalSlot(slots, index, null));
      this.resetBuildStateAfterOpponentChange();
      return;
    }

    this.opponentBenchSlots.update((slots) => this.replaceOptionalSlot(slots, index, null));
    this.resetBuildStateAfterOpponentChange();
  }

  public async excludeCharacter(slot: RumbleTeamSlot): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.cacheExcludedCharacter(slot.unit.character);
    this.excludedCharacterIds.update((currentIds) =>
      currentIds.includes(slot.unit.character.id)
        ? currentIds
        : [...currentIds, slot.unit.character.id],
    );
    this.errorMessage.set('');
    await this.buildTeam();
  }

  public removeExcludedCharacter(characterId: number): void {
    this.excludedCharacterIds.update((currentIds) =>
      currentIds.filter((currentId) => currentId !== characterId),
    );
    this.resetBuildState();
  }

  public clearExcludedCharacters(): void {
    this.excludedCharacterIds.set([]);
    this.resetBuildState();
  }

  public roleLabelKey(role: NormalizedRumbleRoleTag): string {
    return ROLE_LABELS[role];
  }

  public benchSectionCopy(_result: RumbleTeamResult): string {
    return this.t('bench.copy', { count: this.benchSlotTargetCount });
  }

  public resolveRequiredSlotCount(result: RumbleTeamResult): number {
    return result.input.requireFullTeam
      ? this.activeSlotTargetCount + this.benchSlotTargetCount
      : this.activeSlotTargetCount;
  }

  private combineGeneratedTeamResults(
    fullTeamResults: RumbleTeamResult[],
    activeOnlyResults: RumbleTeamResult[],
  ): RumbleTeamResult[] {
    const fullTeamResult = fullTeamResults[0] ?? null;
    const activeOnlyResult = activeOnlyResults[0] ?? null;

    if (!fullTeamResult) {
      return activeOnlyResult ? [activeOnlyResult] : [];
    }

    return activeOnlyResult && activeOnlyResult.selectedCount > 0
      ? [fullTeamResult, activeOnlyResult]
      : [fullTeamResult];
  }

  private buildCurrentRumbleSettings(): RumbleBuildInput {
    this.clearMissingSelectedCharacterBox();

    return {
      types: [...this.selectedTypes()],
      selectedClasses: [...this.selectedClasses()],
      onlySelectedTypes: this.onlySelectedTypes(),
      onlySelectedClasses: this.onlySelectedClasses(),
      favoritesOnly: this.favoritesOnly(),
      favoriteCharacterIds: [...this.favoriteCharacterIds()],
      characterBoxId: this.selectedCharacterBox()?.id ?? null,
      opponentSlots: [],
      buffFocus: this.buffFocus().map((preference) => ({ ...preference })),
      requireFullTeam: true,
    };
  }

  private async importSettingsJson(file: File): Promise<void> {
    try {
      const payload = parseRumbleBuilderSettingsImportPayload(await file.text());

      this.applyRumbleSettings(payload.settings);
      this.importFeedback.set({
        tone: 'success',
        title: this.t('import.settingsSuccessTitle'),
        details: [this.t('import.loadedFromFile', { fileName: file.name })],
      });
    } catch (error) {
      this.importFeedback.set({
        tone: 'error',
        title: this.t('import.errorTitle'),
        details: [this.resolveImportError(error)],
      });
    }
  }

  private async importTeamJson(file: File): Promise<void> {
    try {
      const payload = parseRumbleTeamImportPayload(await file.text());
      const snapshots = buildSavedRumbleTeamResultSnapshotsFromImportPayload(payload);
      const opponentSlots = buildOpponentCharacterIdSlotsFromImportPayload(payload);
      const applyResult = await this.applyRumbleTeamSnapshots({
        opponentActiveCharacterIds: opponentSlots.active,
        opponentBenchCharacterIds: opponentSlots.bench,
        selectedTeamIndex: payload.selectedTeamIndex,
        teams: snapshots,
      });
      const unknownSlotCount = applyResult.unknownSlotCount + opponentSlots.unknownSlotCount;

      this.importFeedback.set({
        tone: unknownSlotCount > 0 ? 'warning' : 'success',
        title: this.t(unknownSlotCount > 0 ? 'import.teamWarningTitle' : 'import.teamSuccessTitle'),
        details: [
          this.t('import.loadedFromFile', { fileName: file.name }),
          this.t('import.teamStats.loadedTeams', { count: applyResult.teamCount }),
          ...(unknownSlotCount > 0
            ? [this.t('import.teamStats.unknownSlots', { count: unknownSlotCount })]
            : []),
        ],
      });
    } catch (error) {
      this.importFeedback.set({
        tone: 'error',
        title: this.t('import.errorTitle'),
        details: [this.resolveImportError(error)],
      });
    }
  }

  private applyRumbleSettings(settings: RumbleBuildInput): void {
    this.selectedTypes.set(this.resolveSelectedTypes(settings.types));
    this.selectedClasses.set(this.resolveSelectedClasses(settings.selectedClasses));
    this.onlySelectedTypes.set(Boolean(settings.onlySelectedTypes));
    this.onlySelectedClasses.set(Boolean(settings.onlySelectedClasses));
    this.favoritesOnly.set(Boolean(settings.favoritesOnly));
    this.selectedCharacterBoxId.set(this.normalizeCharacterBoxId(settings.characterBoxId));
    this.buffFocus.set(this.resolveImportedBuffFocus(settings.buffFocus));
    this.errorMessage.set('');
  }

  private async applySavedRumbleTeamFromRoute(): Promise<void> {
    const savedRumbleTeamId =
      this.route.snapshot.queryParamMap.get('savedRumbleTeamId')?.trim() ?? '';

    if (!savedRumbleTeamId.length) {
      return;
    }

    const savedRumbleTeam = this.userState.getSavedRumbleTeamById(savedRumbleTeamId);

    if (!savedRumbleTeam) {
      await this.clearSavedRumbleTeamQueryParam();
      return;
    }

    await this.loadSavedRumbleTeam(savedRumbleTeam);
    await this.clearSavedRumbleTeamQueryParam();
  }

  private async loadSavedRumbleTeam(savedRumbleTeam: SavedRumbleTeam): Promise<void> {
    this.applyRumbleSettings(savedRumbleTeam.settings);
    this.opponentAwarenessEnabled.set(savedRumbleTeam.opponentAwarenessEnabled);
    const applyResult = await this.applyRumbleTeamSnapshots(savedRumbleTeam);

    this.importFeedback.set({
      tone: applyResult.unknownSlotCount > 0 ? 'warning' : 'success',
      title: this.t(applyResult.unknownSlotCount > 0 ? 'load.warningTitle' : 'load.successTitle'),
      details: [
        this.t('load.loadedSavedTeam', { name: savedRumbleTeam.name }),
        ...(applyResult.unknownSlotCount > 0
          ? [this.t('import.teamStats.unknownSlots', { count: applyResult.unknownSlotCount })]
          : []),
      ],
    });
  }

  private async clearSavedRumbleTeamQueryParam(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { savedRumbleTeamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async applyRumbleTeamSnapshots(input: {
    opponentActiveCharacterIds: Array<number | null>;
    opponentBenchCharacterIds: Array<number | null>;
    selectedTeamIndex: number;
    teams: SavedRumbleTeamResult[];
  }): Promise<{ teamCount: number; unknownSlotCount: number }> {
    const characterIds = this.collectRumbleSnapshotCharacterIds(input);
    const characters = characterIds.length
      ? await this.repository.getDetailedCharactersByIds(characterIds)
      : [];
    const scoredCandidates = this.rumbleBuilder.scoreCandidates(characters);
    const scoreByCharacterId = new Map(
      scoredCandidates.map((candidate) => [candidate.character.id, candidate] as const),
    );
    let unknownSlotCount = 0;
    const teamResults = input.teams
      .map((team) => {
        const hydrated = this.hydrateSavedRumbleTeamResult(team, scoreByCharacterId);

        unknownSlotCount += hydrated.unknownSlotCount;

        return hydrated.result;
      })
      .filter((result): result is RumbleTeamResult => Boolean(result))
      .slice(0, 2);
    const hydratedOpponent = this.hydrateOpponentSlots(input, scoreByCharacterId);

    unknownSlotCount += hydratedOpponent.unknownSlotCount;
    this.teamResults.set(teamResults);
    this.selectedTeamIndex.set(
      input.selectedTeamIndex >= 0 && input.selectedTeamIndex < teamResults.length
        ? input.selectedTeamIndex
        : 0,
    );
    this.opponentActiveSlots.set(hydratedOpponent.activeSlots);
    this.opponentBenchSlots.set(hydratedOpponent.benchSlots);
    this.errorMessage.set('');

    return { teamCount: teamResults.length, unknownSlotCount };
  }

  private collectRumbleSnapshotCharacterIds(input: {
    opponentActiveCharacterIds: Array<number | null>;
    opponentBenchCharacterIds: Array<number | null>;
    teams: SavedRumbleTeamResult[];
  }): number[] {
    return [
      ...new Set(
        [
          ...input.teams.flatMap((team) => [
            ...team.activeSlots.map((slot) => slot.characterId),
            ...team.benchSlots.map((slot) => slot.characterId),
          ]),
          ...input.opponentActiveCharacterIds,
          ...input.opponentBenchCharacterIds,
        ].filter((characterId): characterId is number => typeof characterId === 'number'),
      ),
    ];
  }

  private hydrateSavedRumbleTeamResult(
    snapshot: SavedRumbleTeamResult,
    scoreByCharacterId: Map<number, RumbleUnitScore>,
  ): { result: RumbleTeamResult | null; unknownSlotCount: number } {
    let unknownSlotCount = 0;
    const activeSlots = snapshot.activeSlots
      .map((slot) => {
        const hydratedSlot = this.hydrateSavedRumbleTeamSlot(slot, scoreByCharacterId);

        if (!hydratedSlot) {
          unknownSlotCount += 1;
        }

        return hydratedSlot;
      })
      .filter((slot): slot is RumbleTeamSlot => Boolean(slot));
    const benchSlots = snapshot.benchSlots
      .map((slot) => {
        const hydratedSlot = this.hydrateSavedRumbleTeamSlot(slot, scoreByCharacterId);

        if (!hydratedSlot) {
          unknownSlotCount += 1;
        }

        return hydratedSlot;
      })
      .filter((slot): slot is RumbleTeamSlot => Boolean(slot));
    const selectedSlots = [...activeSlots, ...benchSlots];

    if (!selectedSlots.length) {
      return { result: null, unknownSlotCount };
    }

    return {
      result: {
        ...snapshot,
        activeSlots,
        benchSlots,
        selectedCount: selectedSlots.length,
        totalScore: selectedSlots.reduce((total, slot) => total + slot.score, 0),
        roleCoverage: this.collectRoleCoverage(selectedSlots),
        typeCoverage: this.collectTypeCoverage(selectedSlots),
        classCoverage: this.collectClassCoverage(selectedSlots),
        topFactors: snapshot.topFactors.length
          ? [...snapshot.topFactors]
          : this.buildManualTopFactors(selectedSlots),
      },
      unknownSlotCount,
    };
  }

  private hydrateSavedRumbleTeamSlot(
    slot: SavedRumbleTeamSlot,
    scoreByCharacterId: Map<number, RumbleUnitScore>,
  ): RumbleTeamSlot | null {
    const unit = scoreByCharacterId.get(slot.characterId);

    if (!unit) {
      return null;
    }

    const hydratedSlot = this.createManualSlot(slot.role, slot.index, unit);

    return {
      ...hydratedSlot,
      score: Number.isFinite(slot.score) ? slot.score : hydratedSlot.score,
      reasonChips: slot.reasonChips.length ? [...slot.reasonChips] : hydratedSlot.reasonChips,
    };
  }

  private hydrateOpponentSlots(
    input: {
      opponentActiveCharacterIds: Array<number | null>;
      opponentBenchCharacterIds: Array<number | null>;
    },
    scoreByCharacterId: Map<number, RumbleUnitScore>,
  ): {
    activeSlots: OptionalRumbleTeamSlot[];
    benchSlots: OptionalRumbleTeamSlot[];
    unknownSlotCount: number;
  } {
    let unknownSlotCount = 0;
    const activeSlots = Array.from({ length: RUMBLE_ACTIVE_SLOT_COUNT }, (_value, index) => {
      const characterId = input.opponentActiveCharacterIds[index];

      if (typeof characterId !== 'number') {
        return null;
      }

      const unit = scoreByCharacterId.get(characterId);

      if (!unit) {
        unknownSlotCount += 1;
        return null;
      }

      return this.createManualSlot('active', index, unit);
    });
    const benchSlots = Array.from({ length: RUMBLE_BENCH_SLOT_COUNT }, (_value, index) => {
      const characterId = input.opponentBenchCharacterIds[index];

      if (typeof characterId !== 'number') {
        return null;
      }

      const unit = scoreByCharacterId.get(characterId);

      if (!unit) {
        unknownSlotCount += 1;
        return null;
      }

      return this.createManualSlot('bench', index, unit);
    });

    return { activeSlots, benchSlots, unknownSlotCount };
  }

  private resolveImportedBuffFocus(
    buffFocus: RumbleBuffFocusPreference[] | undefined,
  ): RumbleBuffFocusPreference[] {
    return RUMBLE_BUFF_FOCUS_STATS.map((stat) => {
      const preference = buffFocus?.find((currentPreference) => currentPreference.stat === stat);

      return {
        stat,
        rank:
          preference && RUMBLE_BUFF_FOCUS_RANKS.includes(preference.rank)
            ? preference.rank
            : (DEFAULT_RUMBLE_BUFF_FOCUS.find(
                (defaultPreference) => defaultPreference.stat === stat,
              )?.rank ?? 'ignored'),
      };
    });
  }

  private buildDefaultRumbleTeamName(): string {
    const now = new Date();
    const timestamp =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-` +
      `${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return this.t('save.defaultName', { timestamp });
  }

  private resolveImportError(error: RumbleBuilderImportError | Error | unknown): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.t(error.key);
    }

    return this.t('import.errors.generic');
  }

  private resetBuildState(): void {
    if (this.loading()) {
      return;
    }

    this.teamResults.set([]);
    this.selectedTeamIndex.set(0);
    this.errorMessage.set('');
  }

  private updateCurrentResult(updatedResult: RumbleTeamResult): void {
    const targetIndex = this.selectedTeamIndex();

    this.teamResults.update((results) =>
      results.map((result, index) => (index === targetIndex ? updatedResult : result)),
    );
  }

  private resolveOtherResult(): RumbleTeamResult | null {
    return this.teamResults().find((_result, index) => index !== this.selectedTeamIndex()) ?? null;
  }

  private buildComparisonRow(
    labelKey: string,
    delta: number,
    lowerIsBetter = false,
  ): RumbleComparisonRow {
    const roundedDelta = Math.round(delta);
    const tone =
      roundedDelta === 0
        ? 'neutral'
        : lowerIsBetter
          ? roundedDelta < 0
            ? 'positive'
            : 'negative'
          : roundedDelta > 0
            ? 'positive'
            : 'negative';

    return {
      labelKey,
      value: this.formatSignedNumber(roundedDelta),
      tone,
    };
  }

  private formatSignedNumber(value: number): string {
    if (value > 0) {
      return `+${value.toLocaleString('en-US')}`;
    }

    return value.toLocaleString('en-US');
  }

  private createManualSlot(
    role: RumbleTeamSlotRole,
    index: number,
    unit: RumbleUnitScore,
  ): RumbleTeamSlot {
    const score = Math.round(unit.baseScore * (role === 'bench' ? 0.45 : 1));

    return {
      role,
      index,
      unit,
      score,
      reasonChips: role === 'bench' ? ['Bench value', ...unit.reasonChips] : unit.reasonChips,
    };
  }

  private replaceSlot(slots: RumbleTeamSlot[], replacement: RumbleTeamSlot): RumbleTeamSlot[] {
    return slots.map((slot) => (slot.index === replacement.index ? replacement : slot));
  }

  private replaceOptionalSlot(
    slots: OptionalRumbleTeamSlot[],
    index: number,
    replacement: OptionalRumbleTeamSlot,
  ): OptionalRumbleTeamSlot[] {
    return slots.map((slot, slotIndex) => (slotIndex === index ? replacement : slot));
  }

  private selectOpponentCharacter(target: ManualSlotTarget, candidate: RumbleUnitScore): void {
    const replacementSlot = this.createManualSlot(target.role, target.index, candidate);

    if (target.role === 'active') {
      this.opponentActiveSlots.update((slots) =>
        this.replaceOptionalSlot(slots, target.index, replacementSlot),
      );
      this.resetBuildStateAfterOpponentChange();
      return;
    }

    this.opponentBenchSlots.update((slots) =>
      this.replaceOptionalSlot(slots, target.index, replacementSlot),
    );
    this.resetBuildStateAfterOpponentChange();
  }

  private resetBuildStateAfterOpponentChange(): void {
    if (this.opponentAwarenessEnabled()) {
      this.resetBuildState();
    }
  }

  private resolveBuffFocusRank(stat: RumbleBuffFocusStat): RumbleBuffFocusRank {
    return (
      this.buffFocus().find((preference) => preference.stat === stat)?.rank ??
      DEFAULT_RUMBLE_BUFF_FOCUS.find((preference) => preference.stat === stat)?.rank ??
      'ignored'
    );
  }

  private resolveBuffFocusRankIndex(rank: RumbleBuffFocusRank): number {
    return Math.max(0, RUMBLE_BUFF_FOCUS_RANKS.indexOf(rank));
  }

  private resolveSelectedCharacterIds(target: ManualSlotTarget | null): Set<number> {
    if (target?.team === 'opponent') {
      return new Set(
        this.collectOpponentTeamSlots()
          .filter((slot) => !(slot.role === target.role && slot.index === target.index))
          .map((slot) => slot.unit.character.id),
      );
    }

    const currentResult = this.result();
    const selectedIds = new Set<number>(this.excludedCharacterIds());

    if (!currentResult) {
      return selectedIds;
    }

    [...currentResult.activeSlots, ...currentResult.benchSlots].forEach((slot) => {
      if (target && slot.role === target.role && slot.index === target.index) {
        return;
      }

      selectedIds.add(slot.unit.character.id);
    });

    return selectedIds;
  }

  private async resolveCandidateCharacterIdsForBuild(): Promise<number[] | undefined> {
    const selectedBox = this.selectedCharacterBox();
    const excludedIds = new Set(this.excludedCharacterIds());

    if (selectedBox) {
      const favoriteIds = this.favoritesOnly() ? new Set(this.favoriteCharacterIds()) : null;

      return [...new Set(selectedBox.characterIds)].filter(
        (characterId) =>
          !excludedIds.has(characterId) && (!favoriteIds || favoriteIds.has(characterId)),
      );
    }

    if (!excludedIds.size) {
      return undefined;
    }

    const candidates = await this.repository.getRumbleBuilderCandidates();

    candidates.forEach((candidate) => {
      if (excludedIds.has(candidate.id)) {
        this.cacheExcludedCharacter(candidate);
      }
    });

    return candidates
      .map((candidate) => candidate.id)
      .filter((candidateId) => !excludedIds.has(candidateId));
  }

  private manualPickerCandidateMatchesScope(
    candidate: RumbleUnitScore,
    target: ManualSlotTarget | null,
  ): boolean {
    if (target?.team === 'opponent') {
      return true;
    }

    const selectedBox = this.selectedCharacterBox();

    if (selectedBox && !selectedBox.characterIds.includes(candidate.character.id)) {
      return false;
    }

    return !this.favoritesOnly() || this.favoriteCharacterIds().includes(candidate.character.id);
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

  private cacheExcludedCharacter(character: CharacterDetailRecord): void {
    this.excludedCharacterRecordsById.update((current) => ({
      ...current,
      [character.id]: character,
    }));
  }

  private collectRoleCoverage(slots: RumbleTeamSlot[]): NormalizedRumbleRoleTag[] {
    return [...new Set(slots.flatMap((slot) => slot.unit.normalized.roleTags))].sort();
  }

  private collectTypeCoverage(slots: RumbleTeamSlot[]): string[] {
    return [
      ...new Set(slots.flatMap((slot) => this.resolveCharacterTypes(slot.unit.character))),
    ].sort();
  }

  private collectClassCoverage(slots: RumbleTeamSlot[]): string[] {
    return [...new Set(slots.flatMap((slot) => slot.unit.character.classes))].sort();
  }

  private buildManualTopFactors(slots: RumbleTeamSlot[]): string[] {
    const bestUnits = [...slots]
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((slot) => slot.unit.character.name);
    const cooldowns = slots
      .map((slot) => slot.unit.normalized.cooldown)
      .filter((cooldown): cooldown is number => cooldown !== null);
    const fastestCooldown = cooldowns.length ? Math.min(...cooldowns) : null;

    return [
      bestUnits.length ? `Core power: ${bestUnits.join(', ')}` : null,
      fastestCooldown ? `Fastest CT: ${fastestCooldown}` : null,
    ].filter((factor): factor is string => Boolean(factor));
  }

  private resolveCharacterTypes(character: CharacterDetailRecord): string[] {
    return character.type
      .split(/[,/]+/)
      .map((type) => type.trim().toUpperCase())
      .filter((type) => type.length > 0);
  }

  private collectTeamSlots(result: RumbleTeamResult): RumbleTeamSlot[] {
    return [...result.activeSlots, ...result.benchSlots];
  }

  private collectTeamCostSlots(result: RumbleTeamResult): RumbleTeamSlot[] {
    return result.input.requireFullTeam ? this.collectTeamSlots(result) : result.activeSlots;
  }

  private collectOpponentTeamSlots(): RumbleTeamSlot[] {
    return [...this.opponentActiveSlots(), ...this.opponentBenchSlots()].filter(
      (slot): slot is RumbleTeamSlot => Boolean(slot),
    );
  }

  private formatRumbleCostUsage(slots: RumbleTeamSlot[]): string {
    return `${this.resolveRumbleCostTotal(slots).toLocaleString('en-US')} / ${RUMBLE_TEAM_COST_LIMIT.toLocaleString('en-US')}`;
  }

  private resolveRumbleCostTotal(slots: RumbleTeamSlot[]): number {
    return slots.reduce((total, slot) => total + this.resolveSlotRumbleCost(slot), 0);
  }

  private resolveSlotRumbleCost(slot: RumbleTeamSlot): number {
    const cost = slot.unit.normalized.cost;

    return typeof cost === 'number' && Number.isFinite(cost) && cost > 0 ? cost : 0;
  }

  private resolveTeamBuffTotal(result: RumbleTeamResult): number {
    return result.activeSlots.reduce(
      (teamTotal, slot) =>
        teamTotal +
        Object.values(this.resolveSlotTotalBuffs(slot, result.activeSlots)).reduce(
          (slotTotal, value) => slotTotal + value,
          0,
        ),
      0,
    );
  }

  private buildOpponentSlotContexts(): RumbleOpponentSlotContext[] {
    return this.collectOpponentTeamSlots().map((slot) => ({
      characterId: slot.unit.character.id,
      role: slot.role,
      index: slot.index,
    }));
  }

  private resolveSlotTotalBuffs(
    targetSlot: RumbleTeamSlot,
    slots: RumbleTeamSlot[],
  ): Record<RumbleBuffStat, number> {
    const totals = this.createEmptyBuffTotals();

    for (const sourceSlot of slots) {
      for (const effect of this.resolveMaxLevelBuffEffects(sourceSlot)) {
        const stats = this.resolveBuffStats(effect);

        if (!stats.length || !this.effectAppliesToSlot(effect, targetSlot, sourceSlot, slots)) {
          continue;
        }

        const value = effect.level ?? effect.amount ?? 1;

        if (value <= 0) {
          continue;
        }

        stats.forEach((stat) => {
          totals[stat] += value;
        });
      }
    }

    return totals;
  }

  private createEmptyBuffTotals(): Record<RumbleBuffStat, number> {
    return RUMBLE_BUFF_STATS.reduce(
      (totals, stat) => ({
        ...totals,
        [stat]: 0,
      }),
      {} as Record<RumbleBuffStat, number>,
    );
  }

  private resolveMaxLevelBuffEffects(slot: RumbleTeamSlot): NormalizedRumbleEffect[] {
    return [...slot.unit.normalized.passiveEffects, ...slot.unit.normalized.specialEffects].filter(
      (effect) =>
        effect.sourceLevel !== null &&
        effect.sourceLevel === effect.maxSourceLevel &&
        this.isPositiveRumbleBuff(effect),
    );
  }

  private isPositiveRumbleBuff(effect: NormalizedRumbleEffect): boolean {
    const normalizedEffect = effect.effect.toLowerCase();

    return (
      effect.targetScope !== 'enemies' &&
      (normalizedEffect.includes('buff') ||
        normalizedEffect.includes('boost') ||
        normalizedEffect.includes('recharge'))
    );
  }

  private resolveBuffStats(effect: NormalizedRumbleEffect): RumbleBuffStat[] {
    const rawStats = effect.attributes.length
      ? effect.attributes
      : effect.type
        ? [effect.type]
        : [];
    const stats = rawStats
      .map((stat) => this.normalizeBuffStat(stat))
      .filter((stat): stat is RumbleBuffStat => Boolean(stat));

    return [...new Set(stats)];
  }

  private effectAppliesToSlot(
    effect: NormalizedRumbleEffect,
    targetSlot: RumbleTeamSlot,
    sourceSlot: RumbleTeamSlot,
    slots: RumbleTeamSlot[],
  ): boolean {
    const eligibleSlots = this.resolveEligibleBuffTargetSlots(effect, sourceSlot, slots);

    if (!eligibleSlots.some((slot) => slot.unit.character.id === targetSlot.unit.character.id)) {
      return false;
    }

    if (effect.targetCount === null || effect.targetCount <= 0) {
      return true;
    }

    return this.resolveLimitedBuffTargetSlots(effect, eligibleSlots, slots).some(
      (slot) => slot.unit.character.id === targetSlot.unit.character.id,
    );
  }

  private resolveEligibleBuffTargetSlots(
    effect: NormalizedRumbleEffect,
    sourceSlot: RumbleTeamSlot,
    slots: RumbleTeamSlot[],
  ): RumbleTeamSlot[] {
    if (effect.targetScope === 'crew') {
      return slots;
    }

    if (effect.targetScope === 'self') {
      return slots.filter((slot) => slot.unit.character.id === sourceSlot.unit.character.id);
    }

    if (effect.targetScope === 'unknown') {
      return slots;
    }

    if (effect.targetScope !== 'subset') {
      return [];
    }

    return slots.filter((slot) =>
      effect.targetTokens.some((token) =>
        this.resolveCharacterMatchTokens(slot.unit.character).has(this.normalizeMatchToken(token)),
      ),
    );
  }

  private resolveLimitedBuffTargetSlots(
    effect: NormalizedRumbleEffect,
    eligibleSlots: RumbleTeamSlot[],
    slots: RumbleTeamSlot[],
  ): RumbleTeamSlot[] {
    const targetCount = Math.max(0, Math.floor(effect.targetCount ?? 0));

    if (!targetCount) {
      return [];
    }

    const targetStat = effect.targetStat ? this.normalizeBuffStat(effect.targetStat) : null;
    const priority = effect.targetPriority?.toLowerCase() ?? '';
    const direction = priority.includes('low') ? 1 : priority.includes('high') ? -1 : 0;
    const orderedSlots = [...eligibleSlots].sort((left, right) => {
      if (targetStat && direction !== 0) {
        const leftValue = this.resolveTargetStatValue(left, targetStat);
        const rightValue = this.resolveTargetStatValue(right, targetStat);
        const valueDifference = (leftValue - rightValue) * direction;

        if (valueDifference !== 0) {
          return valueDifference;
        }
      }

      return slots.indexOf(left) - slots.indexOf(right);
    });

    return orderedSlots.slice(0, targetCount);
  }

  private resolveTargetStatValue(slot: RumbleTeamSlot, stat: RumbleBuffStat): number {
    switch (stat) {
      case 'HP':
        return slot.unit.character.stats?.max.hp ?? 0;
      case 'ATK':
        return slot.unit.character.stats?.max.atk ?? 0;
      case 'DEF':
        return slot.unit.normalized.def ?? 0;
      case 'RCV':
        return slot.unit.character.stats?.max.rcv ?? 0;
      case 'SPD':
        return slot.unit.normalized.spd ?? 0;
      case 'Special CT':
        return slot.unit.normalized.cooldown ?? 0;
    }
  }

  private resolveCharacterMatchTokens(character: CharacterDetailRecord): Set<string> {
    const tokens = new Set<string>();

    this.resolveCharacterTypes(character).forEach((type) => {
      tokens.add(this.normalizeMatchToken(type));
      tokens.add(this.normalizeMatchToken(`[${type}]`));
    });
    character.classes.forEach((characterClass) =>
      tokens.add(this.normalizeMatchToken(characterClass)),
    );
    character.detail?.characterTags?.forEach((tag) => tokens.add(this.normalizeMatchToken(tag)));

    return tokens;
  }

  private normalizeBuffStat(value: string): RumbleBuffStat | null {
    const normalized = value
      .replace(/^\[([^\]]+)\]$/, '$1')
      .trim()
      .toLowerCase();

    if (normalized === 'special ct' || normalized === 'ct' || normalized === 'special cooldown') {
      return 'Special CT';
    }

    if (normalized === 'speed') {
      return 'SPD';
    }

    return RUMBLE_BUFF_STATS.find((stat) => stat.toLowerCase() === normalized) ?? null;
  }

  private normalizeMatchToken(value: string): string {
    return value
      .replace(/^\[([^\]]+)\]$/, '$1')
      .trim()
      .toLowerCase();
  }

  private formatBuffTotal(value: number): string {
    return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1);
  }

  private formatBuffStatLabel(stat: RumbleBuffStat): string {
    return stat === 'Special CT' ? 'CT' : stat;
  }

  private handleBuildProgressSnapshot(snapshot: RumbleBuildProgressSnapshot): void {
    const previous = this.buildProgress();

    if (!previous || previous.stage !== snapshot.stage) {
      this.currentBuildStepStartedAtMs.set(Date.now());
    }

    this.buildProgress.set(snapshot);
  }

  private startBuildProgressTicker(): void {
    this.stopBuildProgressTicker();
    this.currentBuildStepStartedAtMs.set(Date.now());
    this.buildProgressNowMs.set(Date.now());
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
  }

  private resolveSelectedTypes(
    value: AutoTeamBuilderType[] | AutoTeamBuilderType | null | undefined,
  ): AutoTeamBuilderType[] {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const availableTypeSet = new Set<AutoTeamBuilderType>(this.availableTypes);

    return [...new Set(values.filter((type) => availableTypeSet.has(type)))];
  }

  private resolveSelectedClasses(value: string[] | string | null | undefined): string[] {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const availableClassSet = new Set(this.availableClasses());
    const selected: string[] = [];

    values.forEach((currentClass) => {
      const normalizedClass = currentClass.trim();

      if (
        normalizedClass.length &&
        availableClassSet.has(normalizedClass) &&
        !selected.includes(normalizedClass)
      ) {
        selected.push(normalizedClass);
      }
    });

    return selected;
  }

  private formatApproximateDuration(milliseconds: number): string {
    const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));

    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}m ${seconds}s`;
  }

  private formatLiveDuration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));

    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}m ${seconds}s`;
  }

  private isRumbleBuildCancelledError(error: unknown): boolean {
    return error instanceof Error && error.message === 'Rumble team build cancelled.';
  }

  private t(
    key: string,
    parameters?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    return this.i18n.translate(key, parameters, 'auto-team-builder-rumble');
  }
}

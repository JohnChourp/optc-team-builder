import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  closeOutline,
  createOutline,
  flashOutline,
  refreshOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  AUTO_TEAM_BUILDER_TYPES,
  type AutoTeamBuilderType,
} from '../../core/models/auto-team-builder.models';
import {
  RUMBLE_ACTIVE_SLOT_COUNT,
  RUMBLE_BENCH_SLOT_COUNT,
  type NormalizedRumbleRoleTag,
  type RumbleBuildProgressSnapshot,
  type RumbleTeamResult,
  type RumbleTeamSlot,
  type RumbleTeamSlotRole,
  type RumbleUnitScore,
} from '../../core/models/auto-team-builder-rumble.models';
import { type CharacterDetailRecord } from '../../core/models/optc.models';
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

type LoadingProgressRowTone = 'primary' | 'secondary' | 'fallback';

interface LoadingProgressRow {
  text: string;
  displayText: string;
  visible: boolean;
  tone: LoadingProgressRowTone;
}

interface ManualSlotTarget {
  role: RumbleTeamSlotRole;
  index: number;
}

const ROLE_LABELS: Record<NormalizedRumbleRoleTag, string> = {
  attacker: 'roleLabels.attacker',
  booster: 'roleLabels.booster',
  defender: 'roleLabels.defender',
  disruptor: 'roleLabels.disruptor',
  healer: 'roleLabels.healer',
  speed: 'roleLabels.speed',
};

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
  public readonly result = signal<RumbleTeamResult | null>(null);
  public readonly loading = signal(false);
  public readonly initialized = signal(false);
  public readonly errorMessage = signal('');
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly availableClasses = signal<string[]>([]);
  public readonly onlySelectedTypes = signal(false);
  public readonly onlySelectedClasses = signal(false);
  public readonly favoritesOnly = signal(false);
  public readonly buildProgress = signal<RumbleBuildProgressSnapshot | null>(null);
  public readonly manualPickerOpen = signal(false);
  public readonly manualPickerLoading = signal(false);
  public readonly manualPickerSearchTerm = signal('');
  public readonly manualPickerCandidates = signal<RumbleUnitScore[]>([]);
  public readonly manualPickerTarget = signal<ManualSlotTarget | null>(null);
  public readonly excludedCharacterIds = signal<number[]>([]);
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
  public readonly flashIcon = flashOutline;
  public readonly editIcon = createOutline;
  public readonly closeIcon = closeOutline;
  public readonly favoriteCharacterIds;
  public readonly autoTeamBuilderWorkerPreference;
  public readonly autoTeamBuilderWorkerRuntime;
  public readonly autoTeamBuilderAvailableWorkerCounts;

  public readonly hasResult = computed(() => this.result() !== null);
  public readonly hasFavoriteCharacters = computed(() => this.favoriteCharacterIds().length > 0);
  public readonly buildBlockedByFavorites = computed(
    () => this.favoritesOnly() && !this.hasFavoriteCharacters(),
  );
  public readonly buildDisabled = computed(
    () => this.loading() || this.buildBlockedByFavorites() || !this.initialized(),
  );
  public readonly excludedCharacters = computed(() => {
    const recordsById = this.excludedCharacterRecordsById();

    return this.excludedCharacterIds()
      .map((characterId) => recordsById[characterId] ?? null)
      .filter((character): character is CharacterDetailRecord => Boolean(character));
  });
  public readonly hasExcludedCharacters = computed(() => this.excludedCharacterIds().length > 0);
  public readonly canDownloadSettingsJson = computed(() => this.initialized());
  public readonly canDownloadTeamJson = computed(() => {
    const currentResult = this.result();

    return Boolean(
      currentResult &&
      !this.strictTypeBlockedStateVisible() &&
      currentResult.selectedCount > 0 &&
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
  public readonly emptyStateVisible = computed(
    () => {
      const currentResult = this.result();

      return Boolean(
        currentResult &&
          !this.loading() &&
          !this.errorMessage() &&
          !this.strictTypeBlockedStateVisible() &&
          currentResult.candidateCount === 0,
      );
    },
  );
  public readonly insufficientStateVisible = computed(() => {
    const currentResult = this.result();

    return (
      !this.loading() &&
      !this.errorMessage() &&
      Boolean(currentResult) &&
      !this.strictTypeBlockedStateVisible() &&
      (currentResult?.selectedCount ?? 0) <
        this.activeSlotTargetCount + this.benchSlotTargetCount &&
      (currentResult?.candidateCount ?? 0) > 0
    );
  });
  public readonly strictTypeBlockedStateVisible = computed(() => {
    const currentResult = this.result();

    return Boolean(
      currentResult &&
      !this.loading() &&
      !this.errorMessage() &&
      (currentResult.input.onlySelectedTypes || currentResult.input.onlySelectedClasses) &&
      currentResult.selectedCount === 0,
    );
  });
  public readonly relaxedStateVisible = computed(() => {
    const currentResult = this.result();

    return Boolean(
      currentResult &&
      !this.loading() &&
      currentResult.selectedCount > 0 &&
      currentResult.droppedClasses.length > 0,
    );
  });
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
    const selectedIds = this.resolveSelectedCharacterIds(this.manualPickerTarget());

    return this.manualPickerCandidates()
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
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
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
    await Promise.all([this.i18n.preloadScope('auto-team-builder-rumble')]);
    const manifest = await this.repository.getDatasetManifest();

    this.availableClasses.set([...manifest.availableClasses]);
    this.initialized.set(true);
  }

  public ngOnDestroy(): void {
    this.cancelBuild();
    this.stopBuildProgressTicker();
  }

  public async buildTeam(): Promise<void> {
    if (!this.initialized() || this.buildBlockedByFavorites()) {
      return;
    }

    const previousResult = this.result();
    const abortController = new AbortController();

    this.buildAbortController = abortController;
    this.loading.set(true);
    this.errorMessage.set('');
    this.result.set(null);
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

      this.result.set(
        await this.rumbleBuilder.buildBestTeam(
          {
            types: this.selectedTypes(),
            selectedClasses: this.selectedClasses(),
            onlySelectedTypes: this.onlySelectedTypes(),
            onlySelectedClasses: this.onlySelectedClasses(),
            favoritesOnly: this.favoritesOnly(),
            favoriteCharacterIds: this.favoriteCharacterIds(),
            candidateCharacterIds,
          },
          executionOptions,
        ),
      );
    } catch (error) {
      if (abortController.signal.aborted || this.isRumbleBuildCancelledError(error)) {
        this.result.set(previousResult);
        this.errorMessage.set('');
        return;
      }

      this.result.set(null);
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
      settings: {
        types: [...this.selectedTypes()],
        selectedClasses: [...this.selectedClasses()],
        onlySelectedTypes: this.onlySelectedTypes(),
        onlySelectedClasses: this.onlySelectedClasses(),
        favoritesOnly: this.favoritesOnly(),
        favoriteCharacterIds: [...this.favoriteCharacterIds()],
      },
      favoriteCount: this.favoriteCharacterIds().length,
      workerPreference: this.autoTeamBuilderWorkerPreference(),
    });
  }

  public buildTeamExportPayload(
    exportedAt = new Date().toISOString(),
  ): RumbleTeamExportPayload | null {
    return this.canDownloadTeamJson()
      ? rumbleExportUtils.buildRumbleTeamExportPayload(this.result(), exportedAt)
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

  public onOnlySelectedTypesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.onlySelectedTypes.set(event.detail.checked);
    this.resetBuildState();
  }

  public onOnlySelectedClassesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.onlySelectedClasses.set(event.detail.checked);
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

  public formatScore(value: number): string {
    return Math.round(value).toLocaleString('en-US');
  }

  public formatSlotLabel(slot: RumbleTeamSlot): string {
    return slot.role === 'active'
      ? this.t('slot.activeLabel', { index: slot.index + 1 })
      : this.t('slot.benchLabel', { index: slot.index + 1 });
  }

  public hasRumbleDetailRows(slot: RumbleTeamSlot): boolean {
    const normalized = slot.unit.normalized;

    return Boolean(
      normalized.maxPassiveLevel ||
        normalized.maxSpecialLevel ||
        normalized.maxPassiveEffects.length ||
        normalized.maxSpecialEffects.length ||
        normalized.baseResistances.length,
    );
  }

  public formatResistanceList(slot: RumbleTeamSlot): string {
    return slot.unit.normalized.baseResistances.join(' • ');
  }

  public async openManualCharacterPicker(slot: RumbleTeamSlot): Promise<void> {
    this.manualPickerTarget.set({ role: slot.role, index: slot.index });
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

    if (!target || !currentResult) {
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

    this.result.set({
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

  private resetBuildState(): void {
    if (this.loading()) {
      return;
    }

    this.result.set(null);
    this.errorMessage.set('');
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

  private resolveSelectedCharacterIds(target: ManualSlotTarget | null): Set<number> {
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
    const excludedIds = new Set(this.excludedCharacterIds());

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
    return [...new Set(slots.flatMap((slot) => this.resolveCharacterTypes(slot.unit.character)))].sort();
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

import { Component, type OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { type ViewWillEnter } from '@ionic/angular';
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
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import {
  alertCircleOutline,
  boatOutline,
  checkmarkCircleOutline,
  closeOutline,
  createOutline,
  funnelOutline,
  peopleOutline,
  trashOutline,
} from 'ionicons/icons';

import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import { type AutoBuildCaptainBranchMode } from '../../core/models/auto-team-builder.models';
import {
  type CharacterDetailRecord,
  type DatasetManifest,
  type SavedTeam,
  type ShipRecord,
} from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  resolveCaptainTeamConditionStatus,
  type CaptainTeamConditionStatus,
} from '../../core/services/captain-team-condition-status.utils';
import {
  isVsCaptainCoverageBranchCaptain,
  resolveCaptainCoverageBranchDisplay,
  resolveCaptainCoverageBranchOptions,
} from '../../core/services/captain-coverage.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { CaptainTeamConditionStatusComponent } from '../../shared/captain-team-condition-status/captain-team-condition-status.component';
import { TeamCoverageSummaryComponent } from '../../shared/team-coverage-summary/team-coverage-summary.component';
import { CharacterAbilityGroupsComponent } from '../../shared/character-ability-groups/character-ability-groups.component';
import { ShipPickerComponent } from '../../shared/ship-picker/ship-picker.component';

const MANUAL_TEAM_SLOT_COUNT = 6;
const MANUAL_TEAM_FRIEND_CAPTAIN_SLOT_INDEX = 1;

interface ManualTeamCandidateCardView {
  character: CharacterDetailRecord;
  subtitle: string;
  isAssignedToActiveSlot: boolean;
  isAssignedToAnotherSlot: boolean;
  isAssignableToActiveSlot: boolean;
  actionLabel: string;
  supportLabel: string | null;
}

interface ManualTeamSummaryMetricView {
  key: string;
  label: string;
  value: string;
  support: string | null;
}

interface ManualTeamValidationMessageView {
  key: string;
  title: string;
  copy: string;
  tone: 'warning' | 'error';
}

interface ManualTeamCaptainBranchOptionView {
  mode: AutoBuildCaptainBranchMode;
  label: string;
  selected: boolean;
}

interface ManualTeamCaptainScopeChipView {
  key: string;
  label: string;
}

interface ManualTeamDragState {
  characterId: number;
  sourceSlotIndex: number | null;
}

function createEmptyManualTeamSlots(): Array<CharacterDetailRecord | null> {
  return Array.from({ length: MANUAL_TEAM_SLOT_COUNT }, () => null);
}

@Component({
  selector: 'app-manual-team-builder-page',
  standalone: true,
  imports: [
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
    IonTextarea,
    IonTitle,
    IonToolbar,
    CaptainTeamConditionStatusComponent,
    TeamCoverageSummaryComponent,
    CharacterAbilityGroupsComponent,
    RouterLink,
    ShipPickerComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './manual-team-builder.page.html',
  styleUrl: './manual-team-builder.page.scss',
})
export class ManualTeamBuilderPage implements OnInit, ViewWillEnter {
  public readonly loading = signal(true);
  public readonly slots = signal<Array<CharacterDetailRecord | null>>(createEmptyManualTeamSlots());
  public readonly selectedSlotIndex = signal(0);
  public readonly searchTerm = signal('');
  public readonly candidates = signal<CharacterDetailRecord[]>([]);
  public readonly pickerModalOpen = signal(false);
  public readonly shipPickerOpen = signal(false);
  public readonly teamName = signal('');
  public readonly notes = signal('');
  public readonly currentTeamId = signal<string | null>(null);
  public readonly saveUiLocked = signal(false);
  public readonly saveFeedbackError = signal('');
  public readonly selectedShipId = signal<number | null>(null);
  public readonly maxTotalCost = signal<number | null>(null);
  public readonly ships = signal<ShipRecord[]>([]);
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly availableCharacterTags = signal<string[]>([]);
  public readonly selectedTypeFilter = signal('');
  public readonly selectedClassFilter = signal('');
  public readonly selectedCharacterTagFilter = signal('');
  public readonly candidateMinCost = signal<number | null>(null);
  public readonly candidateMaxCost = signal<number | null>(null);
  public readonly candidatesLoading = signal(false);
  public readonly dragState = signal<ManualTeamDragState | null>(null);
  public readonly activeDropSlotIndex = signal<number | null>(null);
  public readonly invalidDropSlotIndex = signal<number | null>(null);
  public readonly dragFeedbackMessage = signal('');
  public readonly captainBranchModes = signal<Record<number, AutoBuildCaptainBranchMode | null>>({
    0: null,
    1: null,
  });
  public readonly favoriteShipIds;

  public readonly availableTypes = computed(() => this.summary()?.availableTypes ?? []);
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly hasActiveCandidateFilters = computed(
    () =>
      this.selectedTypeFilter().length > 0 ||
      this.selectedClassFilter().length > 0 ||
      this.selectedCharacterTagFilter().length > 0 ||
      this.candidateMinCost() !== null ||
      this.candidateMaxCost() !== null,
  );
  public readonly candidateFilterErrorLabel = computed(() => {
    const min = this.candidateMinCost();
    const max = this.candidateMaxCost();

    return min !== null && max !== null && min > max
      ? this.t('picker.filters.costError', { min, max })
      : '';
  });
  public readonly filledSlotCount = computed(() => this.slots().filter(Boolean).length);
  public readonly saveDisabled = computed(
    () => this.saveUiLocked() || this.filledSlotCount() === 0,
  );
  public readonly selectedShip = computed(
    () => this.ships().find((ship) => ship.id === this.selectedShipId()) ?? null,
  );
  public readonly selectedShipLabel = computed(() => {
    const selectedShip = this.selectedShip();

    return selectedShip ? selectedShip.name : this.t('ship.none');
  });
  public readonly budgetCost = computed(() =>
    this.slots().reduce((total, character, index) => {
      if (!character || index === MANUAL_TEAM_FRIEND_CAPTAIN_SLOT_INDEX) {
        return total;
      }

      return total + character.cost;
    }, 0),
  );
  public readonly totalHp = computed(() => this.sumSlotStat('hp'));
  public readonly totalAtk = computed(() => this.sumSlotStat('atk'));
  public readonly totalRcv = computed(() => this.sumSlotStat('rcv'));
  public readonly remainingCost = computed(() => {
    const maxTotalCost = this.maxTotalCost();

    return maxTotalCost === null ? 0 : Math.max(0, maxTotalCost - this.budgetCost());
  });
  public readonly teamSummaryMetrics = computed<ManualTeamSummaryMetricView[]>(() => [
    {
      key: 'filled',
      label: this.t('summary.metrics.filled.label'),
      value: this.t('summary.metrics.filled.value', {
        filled: this.filledSlotCount(),
        total: MANUAL_TEAM_SLOT_COUNT,
      }),
      support: null,
    },
    {
      key: 'hp',
      label: this.t('summary.metrics.hp.label'),
      value: this.formatNumber(this.totalHp()),
      support: this.t('summary.metrics.hp.support'),
    },
    {
      key: 'atk',
      label: this.t('summary.metrics.atk.label'),
      value: this.formatNumber(this.totalAtk()),
      support: this.t('summary.metrics.atk.support'),
    },
    {
      key: 'rcv',
      label: this.t('summary.metrics.rcv.label'),
      value: this.formatNumber(this.totalRcv()),
      support: this.t('summary.metrics.rcv.support'),
    },
    {
      key: 'cost',
      label: this.t('summary.metrics.cost.label'),
      value:
        this.maxTotalCost() === null
          ? this.formatNumber(this.budgetCost())
          : this.t('summary.metrics.cost.valueWithMax', {
              used: this.budgetCost(),
              max: this.maxTotalCost() ?? 0,
            }),
      support:
        this.maxTotalCost() === null
          ? this.t('summary.metrics.cost.supportNoMax')
          : this.t('summary.metrics.cost.supportWithMax', { remaining: this.remainingCost() }),
    },
  ]);
  public readonly costBudgetSupportLabel = computed(() =>
    this.maxTotalCost() === null
      ? this.t('costBudget.support.default')
      : this.t('costBudget.support.active', {
          used: this.budgetCost(),
          remaining: this.remainingCost(),
          max: this.maxTotalCost() ?? 0,
        }),
  );
  public readonly costBudgetErrorLabel = computed(() =>
    this.maxTotalCost() !== null && this.budgetCost() > this.maxTotalCost()!
      ? this.t('costBudget.range.overBudget', {
          used: this.budgetCost(),
          max: this.maxTotalCost()!,
        })
      : '',
  );
  public readonly candidateCards = computed<ManualTeamCandidateCardView[]>(() => {
    const activeIndex = this.selectedSlotIndex();
    const slots = this.slots();

    return this.candidates().map((character) => {
      const assignedSlotIndex = slots.findIndex((slot) => slot?.id === character.id);
      const isAssignableToActiveSlot = this.canAssignCharacterToSlot(activeIndex, character);

      return {
        character,
        subtitle: this.buildCharacterSubtitle(character),
        isAssignedToActiveSlot: assignedSlotIndex === activeIndex,
        isAssignedToAnotherSlot: assignedSlotIndex !== -1 && assignedSlotIndex !== activeIndex,
        isAssignableToActiveSlot,
        actionLabel:
          assignedSlotIndex === activeIndex ? this.t('actions.assigned') : this.t('actions.assign'),
        supportLabel: isAssignableToActiveSlot
          ? null
          : this.t('picker.costBlocked', { max: this.maxTotalCost() ?? 0 }),
      };
    });
  });
  public readonly conditionStatus = computed<CaptainTeamConditionStatus>(() =>
    resolveCaptainTeamConditionStatus({
      expectedSlotCount: MANUAL_TEAM_SLOT_COUNT,
      leaders: [
        {
          role: 'captain',
          label: this.t('condition.roles.captain'),
          character: this.slots()[0] ?? null,
          branchMode: this.captainBranchModes()[0] ?? null,
        },
        {
          role: 'friendCaptain',
          label: this.t('condition.roles.friendCaptain'),
          character: this.slots()[1] ?? null,
          branchMode: this.captainBranchModes()[1] ?? null,
        },
      ],
      slotLabels: this.slots().map((_slot, index) =>
        this.t('condition.slotLabel', { slot: index + 1 }),
      ),
      slots: this.slots(),
    }),
  );
  public readonly validationMessages = computed<ManualTeamValidationMessageView[]>(() => {
    const messages: ManualTeamValidationMessageView[] = [];
    const costError = this.costBudgetErrorLabel();

    if (costError) {
      messages.push({
        key: 'cost',
        title: this.t('validation.cost.title'),
        copy: costError,
        tone: 'error',
      });
    }

    for (const leaderStatus of this.conditionStatus().leaderStatuses) {
      if (!leaderStatus.characterId) {
        messages.push({
          key: `${leaderStatus.role}:missing`,
          title: this.t('validation.captain.missing.title', { role: leaderStatus.label }),
          copy: this.t('validation.captain.missing.copy'),
          tone: 'warning',
        });
        continue;
      }

      if (!leaderStatus.hasCaptainAbility) {
        messages.push({
          key: `${leaderStatus.role}:ability`,
          title: this.t('validation.captain.ability.title', { role: leaderStatus.label }),
          copy: this.t('validation.captain.ability.copy', {
            name: leaderStatus.characterName ?? leaderStatus.label,
          }),
          tone: 'warning',
        });
        continue;
      }

      if (leaderStatus.missingSlotLabels.length) {
        messages.push({
          key: `${leaderStatus.role}:coverage`,
          title: this.t('validation.captain.coverage.title', { role: leaderStatus.label }),
          copy: this.t('validation.captain.coverage.copy', {
            slots: leaderStatus.missingSlotLabels.join(', '),
          }),
          tone: 'error',
        });
      }

      if (!leaderStatus.tagConditionsSatisfied) {
        messages.push({
          key: `${leaderStatus.role}:tags`,
          title: this.t('validation.captain.tags.title', { role: leaderStatus.label }),
          copy: this.t('validation.captain.tags.copy'),
          tone: 'error',
        });
      }
    }

    return messages;
  });

  public readonly closeIcon = closeOutline;
  public readonly editIcon = createOutline;
  public readonly filterIcon = funnelOutline;
  public readonly pageIcon = peopleOutline;
  public readonly shipIcon = boatOutline;
  public readonly successIcon = checkmarkCircleOutline;
  public readonly errorIcon = alertCircleOutline;
  public readonly trashIcon = trashOutline;

  public constructor(
    private readonly userState: UserStateService,
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.favoriteShipIds = this.userState.favoriteShipIds;
    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
  }

  public async ngOnInit(): Promise<void> {
    await Promise.all([
      this.userState.readyFavoriteShipIds(),
      this.i18n.preloadScope('manual-team-builder'),
      this.i18n.preloadScope('ship-picker'),
    ]);
    const [ships, summary, abilityCatalog, availableCharacterTags] = await Promise.all([
      this.repository.getShips(),
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog(),
      this.repository.getAvailableCharacterTags().catch(() => []),
    ]);

    this.ships.set(ships);
    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);
    this.availableCharacterTags.set(availableCharacterTags);
    this.loading.set(false);
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.userState.readyFavoriteShipIds();

    if (!this.ships().length) {
      await this.refreshShips();
    }

    await this.applySavedTeamFromRoute();
  }

  public onTeamNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.teamName.set((event.detail.value ?? '').trimStart());
  }

  public onNotesChange(event: CustomEvent<{ value?: string | null }>): void {
    this.notes.set((event.detail.value ?? '').toString());
  }

  public onMaxTotalCostChange(event: CustomEvent<{ value?: string | number | null }>): void {
    this.maxTotalCost.set(this.resolveCostBound(event.detail.value));
  }

  public async onSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.searchTerm.set((event.detail.value ?? '').trim());
    await this.refreshCandidates();
  }

  public async onTypeFilterChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedTypeFilter.set((event.detail.value ?? '').trim());
    await this.refreshCandidates();
  }

  public async onClassFilterChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.selectedClassFilter.set((event.detail.value ?? '').trim());
    await this.refreshCandidates();
  }

  public async onCharacterTagFilterChange(
    event: CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    this.selectedCharacterTagFilter.set((event.detail.value ?? '').trim());
    await this.refreshCandidates();
  }

  public async onCandidateMinCostChange(
    event: CustomEvent<{ value?: string | number | null }>,
  ): Promise<void> {
    this.candidateMinCost.set(this.resolveCostBound(event.detail.value));
    await this.refreshCandidates();
  }

  public async onCandidateMaxCostChange(
    event: CustomEvent<{ value?: string | number | null }>,
  ): Promise<void> {
    this.candidateMaxCost.set(this.resolveCostBound(event.detail.value));
    await this.refreshCandidates();
  }

  public async clearCandidateFilters(): Promise<void> {
    this.selectedTypeFilter.set('');
    this.selectedClassFilter.set('');
    this.selectedCharacterTagFilter.set('');
    this.candidateMinCost.set(null);
    this.candidateMaxCost.set(null);
    await this.refreshCandidates();
  }

  public async openCharacterPicker(index: number): Promise<void> {
    if (!this.isValidSlotIndex(index)) {
      return;
    }

    this.selectedSlotIndex.set(index);
    await this.refreshCandidates();
    this.pickerModalOpen.set(true);
  }

  public closeCharacterPicker(): void {
    this.pickerModalOpen.set(false);
  }

  public selectSlot(index: number): void {
    if (!this.isValidSlotIndex(index)) {
      return;
    }

    this.selectedSlotIndex.set(index);
  }

  public openShipPicker(): void {
    this.shipPickerOpen.set(true);
  }

  public closeShipPicker(): void {
    this.shipPickerOpen.set(false);
  }

  public saveShipSelection(shipId: number | null): void {
    this.selectedShipId.set(shipId);
    this.closeShipPicker();
  }

  public async toggleShipFavorite(shipId: number): Promise<void> {
    await this.userState.toggleShipFavorite(shipId);
  }

  public async openSlotDetail(index: number): Promise<void> {
    if (!this.isValidSlotIndex(index)) {
      return;
    }

    const character = this.slots()[index];
    const detailLink = this.getCharacterDetailLink(character);

    if (!detailLink) {
      return;
    }

    await this.router.navigate(detailLink);
  }

  public assignCharacter(character: CharacterDetailRecord): void {
    if (!this.assignCharacterToSlot(this.selectedSlotIndex(), character)) {
      return;
    }

    this.closeCharacterPicker();
  }

  public clearSlot(index: number, event?: Event): void {
    event?.stopPropagation();

    if (!this.isValidSlotIndex(index)) {
      return;
    }

    this.slots.update((currentSlots) =>
      currentSlots.map((slot, slotIndex) => (slotIndex === index ? null : slot)),
    );
    this.clearCaptainBranchMode(index);
    this.currentTeamId.set(null);
    this.saveFeedbackError.set('');
  }

  public onCaptainBranchModeChange(
    index: number,
    event: CustomEvent<{ value?: string | null }>,
  ): void {
    const mode = this.normalizeCaptainBranchMode(event.detail.value);

    if (!this.isValidSlotIndex(index) || !mode) {
      return;
    }

    this.setCaptainBranchMode(index, mode);
    this.currentTeamId.set(null);
  }

  public onCandidateDragStart(event: DragEvent, character: CharacterDetailRecord): void {
    this.dragState.set({ characterId: character.id, sourceSlotIndex: null });
    this.dragFeedbackMessage.set('');
    event.dataTransfer?.setData('text/plain', character.id.toString());
    event.dataTransfer?.setDragImage?.(event.currentTarget as Element, 24, 24);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  public onSlotDragStart(event: DragEvent, index: number): void {
    const character = this.slots()[index];

    if (!character) {
      return;
    }

    this.dragState.set({ characterId: character.id, sourceSlotIndex: index });
    this.dragFeedbackMessage.set('');
    event.dataTransfer?.setData('text/plain', character.id.toString());

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  public onDragEnd(): void {
    this.dragState.set(null);
    this.activeDropSlotIndex.set(null);
    this.invalidDropSlotIndex.set(null);
  }

  public onSlotDragOver(event: DragEvent, index: number): void {
    const character = this.resolveDraggedCharacter();

    if (!character || !this.isValidSlotIndex(index)) {
      return;
    }

    event.preventDefault();
    const canDrop = this.canDropCharacterToSlot(
      index,
      character,
      this.dragState()?.sourceSlotIndex,
    );
    this.activeDropSlotIndex.set(index);
    this.invalidDropSlotIndex.set(canDrop ? null : index);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = canDrop
        ? this.dragState()?.sourceSlotIndex === null
          ? 'copy'
          : 'move'
        : 'none';
    }
  }

  public onSlotDragLeave(index: number): void {
    if (this.activeDropSlotIndex() === index) {
      this.activeDropSlotIndex.set(null);
    }

    if (this.invalidDropSlotIndex() === index) {
      this.invalidDropSlotIndex.set(null);
    }
  }

  public onSlotDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    const character = this.resolveDraggedCharacter();
    const dragState = this.dragState();

    if (!character || !dragState || !this.isValidSlotIndex(index)) {
      this.onDragEnd();
      return;
    }

    if (!this.canDropCharacterToSlot(index, character, dragState.sourceSlotIndex)) {
      this.dragFeedbackMessage.set(this.t('drag.invalidCost', { max: this.maxTotalCost() ?? 0 }));
      this.onDragEnd();
      return;
    }

    if (dragState.sourceSlotIndex === null) {
      this.assignCharacterToSlot(index, character);
    } else {
      this.swapSlotCharacters(dragState.sourceSlotIndex, index);
    }

    this.onDragEnd();
  }

  public onClearDropZoneDragOver(event: DragEvent): void {
    if (this.dragState()?.sourceSlotIndex === null || this.dragState() === null) {
      return;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  public onClearDropZoneDrop(event: DragEvent): void {
    event.preventDefault();
    const sourceSlotIndex = this.dragState()?.sourceSlotIndex;

    if (sourceSlotIndex !== null && sourceSlotIndex !== undefined) {
      this.clearSlot(sourceSlotIndex);
    }

    this.onDragEnd();
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
        notes: this.notes(),
        shipId: this.selectedShipId(),
        slots: this.slots().map((character) => character?.id ?? null),
      });

      this.currentTeamId.set(saved.id);
    } catch (error) {
      console.error(error);
      this.saveFeedbackError.set(this.t('save.error'));
    } finally {
      this.saveUiLocked.set(false);
    }
  }

  public resetPage(): void {
    this.closeCharacterPicker();
    this.closeShipPicker();
    this.slots.set(createEmptyManualTeamSlots());
    this.selectedSlotIndex.set(0);
    this.searchTerm.set('');
    this.candidates.set([]);
    this.selectedTypeFilter.set('');
    this.selectedClassFilter.set('');
    this.selectedCharacterTagFilter.set('');
    this.candidateMinCost.set(null);
    this.candidateMaxCost.set(null);
    this.selectedShipId.set(null);
    this.maxTotalCost.set(null);
    this.captainBranchModes.set({ 0: null, 1: null });
    this.onDragEnd();
    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
    this.notes.set('');
    this.currentTeamId.set(null);
    this.saveFeedbackError.set('');
    this.saveUiLocked.set(false);
  }

  public getCharacterDetailLink(
    character: Pick<CharacterDetailRecord, 'id'> | null | undefined,
  ): string[] | null {
    return character ? ['/characters', character.id.toString()] : null;
  }

  public slotIsDropTarget(index: number): boolean {
    return this.activeDropSlotIndex() === index;
  }

  public slotIsInvalidDropTarget(index: number): boolean {
    return this.invalidDropSlotIndex() === index;
  }

  public slotHasValidation(index: number): boolean {
    if (this.costBudgetErrorLabel() && index !== MANUAL_TEAM_FRIEND_CAPTAIN_SLOT_INDEX) {
      return Boolean(this.slots()[index]);
    }

    const label = this.t('condition.slotLabel', { slot: index + 1 });

    return this.conditionStatus().leaderStatuses.some((status) =>
      status.missingSlotLabels.includes(label),
    );
  }

  public slotStatLabel(character: CharacterDetailRecord, stat: 'hp' | 'atk' | 'rcv'): string {
    return this.formatNumber(character.stats.max[stat] ?? 0);
  }

  public slotAbilityPreview(character: CharacterDetailRecord): string {
    return (
      character.detail.captainAbility ??
      character.detail.specialText ??
      character.detail.specialName ??
      this.t('slots.noAbilityPreview')
    );
  }

  public captainBranchOptions(index: number): ManualTeamCaptainBranchOptionView[] {
    const character = this.slots()[index];

    if (!this.isLeaderSlotIndex(index) || !character) {
      return [];
    }

    const branchOptions = resolveCaptainCoverageBranchOptions(character);

    if (branchOptions.length !== 2) {
      return [];
    }

    const modes: AutoBuildCaptainBranchMode[] = isVsCaptainCoverageBranchCaptain(character)
      ? ['character1', 'character2']
      : ['character1', 'character2', 'both'];
    const currentMode =
      this.captainBranchModes()[index] ?? this.resolveDefaultCaptainBranchMode(character);

    return modes.map((mode) => ({
      mode,
      label:
        mode === 'both'
          ? this.t('captainHelper.branches.both')
          : this.t('captainHelper.branches.side', {
              name: resolveCaptainCoverageBranchDisplay(character, mode).displayName,
            }),
      selected: currentMode === mode,
    }));
  }

  public captainScopeChips(index: number): ManualTeamCaptainScopeChipView[] {
    const character = this.slots()[index];

    if (!this.isLeaderSlotIndex(index) || !character) {
      return [];
    }

    const entries = character.detail.captainAbilityCoverage?.entries ?? [];
    const mode =
      this.captainBranchModes()[index] ?? this.resolveDefaultCaptainBranchMode(character);

    if (entries.length) {
      return entries.flatMap((entry) => {
        const firstScope = entry.tiers[0]?.scope ?? 'none';
        const secondScope = entry.tiers[1]?.scope ?? entry.tiers[0]?.scope ?? 'none';

        if (mode === 'character1') {
          return [
            {
              key: `${entry.key}:first`,
              label: this.t('captainHelper.scopeChip', {
                label: entry.label,
                scope: this.t(`captainHelper.scopes.${firstScope}`),
              }),
            },
          ];
        }

        if (mode === 'character2') {
          return [
            {
              key: `${entry.key}:second`,
              label: this.t('captainHelper.scopeChip', {
                label: entry.label,
                scope: this.t(`captainHelper.scopes.${secondScope}`),
              }),
            },
          ];
        }

        return [
          {
            key: `${entry.key}:first`,
            label: this.t('captainHelper.scopeChip', {
              label: entry.label,
              scope: this.t(`captainHelper.scopes.${firstScope}`),
            }),
          },
          {
            key: `${entry.key}:second`,
            label: this.t('captainHelper.scopeChip', {
              label: entry.label,
              scope: this.t(`captainHelper.scopes.${secondScope}`),
            }),
          },
        ];
      });
    }

    return character.detail.captainAbility
      ? [
          {
            key: `${character.id}:raw`,
            label: this.t('captainHelper.rawScope'),
          },
        ]
      : [];
  }

  public highlightedRequirementsForCharacter(
    character: CharacterDetailRecord,
  ): AutoBuildAbilityRequirement[] {
    return character.detail.builderAbilities.map((ability) => ({
      abilityKey: ability.key,
      minTurns: ability.minTurns,
      requiredCharacterCount: 1,
      slotTokens: ability.slotTokens,
    }));
  }

  private async refreshShips(): Promise<void> {
    this.ships.set(await this.repository.getShips());
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

    await this.loadSavedTeam(team);
    await this.clearSavedTeamQueryParam();
  }

  private async loadSavedTeam(team: SavedTeam): Promise<void> {
    const characterIds = [
      ...new Set(
        team.slots.filter((characterId): characterId is number => typeof characterId === 'number'),
      ),
    ];
    const availableCharacters = characterIds.length
      ? await this.repository.getDetailedCharactersByIds(characterIds)
      : [];
    const characterMap = new Map(
      availableCharacters.map((character) => [character.id, character] as const),
    );
    const availableShipIds = new Set(this.ships().map((ship) => ship.id));

    this.closeCharacterPicker();
    this.closeShipPicker();
    this.slots.set(
      Array.from({ length: MANUAL_TEAM_SLOT_COUNT }, (_value, index) => {
        const characterId = team.slots[index];

        return typeof characterId === 'number' ? (characterMap.get(characterId) ?? null) : null;
      }),
    );
    this.selectedSlotIndex.set(0);
    this.searchTerm.set('');
    this.candidates.set([]);
    this.captainBranchModes.set(this.resolveCaptainBranchModesForSlots(this.slots()));
    this.selectedShipId.set(
      typeof team.shipId === 'number' && availableShipIds.has(team.shipId) ? team.shipId : null,
    );
    this.maxTotalCost.set(null);
    this.teamName.set(team.name);
    this.notes.set(team.notes);
    this.currentTeamId.set(team.id);
    this.saveFeedbackError.set('');
    this.saveUiLocked.set(false);
  }

  private async clearSavedTeamQueryParam(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { teamId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async refreshCandidates(): Promise<void> {
    if (this.candidateFilterErrorLabel()) {
      this.candidates.set([]);
      return;
    }

    this.candidatesLoading.set(true);

    try {
      const candidates = this.selectedCharacterTagFilter()
        ? await this.loadTagFilteredCandidates()
        : await this.repository.searchDetailedCharacters({
            searchTerm: this.searchTerm().trim(),
            selectedTypes: this.selectedTypeFilter() ? [this.selectedTypeFilter()] : [],
            selectedTypesMatchMode: 'any',
            selectedClasses: this.selectedClassFilter() ? [this.selectedClassFilter()] : [],
            selectedClassesMatchMode: 'any',
            costRange: {
              min: this.candidateMinCost(),
              max: this.candidateMaxCost(),
            },
            sortMode: 'powerFirst',
            limit: 48,
            offset: 0,
          });

      this.candidates.set(this.dedupeCharacterRecords(candidates));
    } finally {
      this.candidatesLoading.set(false);
    }
  }

  private canAssignCharacterToSlot(
    slotIndex: number,
    character: Pick<CharacterDetailRecord, 'cost'>,
  ): boolean {
    const maxTotalCost = this.maxTotalCost();

    if (maxTotalCost === null) {
      return true;
    }

    if (slotIndex === MANUAL_TEAM_FRIEND_CAPTAIN_SLOT_INDEX) {
      return true;
    }

    const currentSlot = this.slots()[slotIndex];
    const currentSlotCost = currentSlot?.cost ?? 0;

    return this.budgetCost() - currentSlotCost + character.cost <= maxTotalCost;
  }

  private assignCharacterToSlot(index: number, character: CharacterDetailRecord): boolean {
    if (!this.isValidSlotIndex(index)) {
      return false;
    }

    if (!this.canAssignCharacterToSlot(index, character)) {
      this.dragFeedbackMessage.set(this.t('drag.invalidCost', { max: this.maxTotalCost() ?? 0 }));
      return false;
    }

    this.slots.update((currentSlots) =>
      currentSlots.map((slot, slotIndex) => (slotIndex === index ? character : slot)),
    );
    this.setDefaultCaptainBranchMode(index, character);
    this.currentTeamId.set(null);
    this.saveFeedbackError.set('');
    this.dragFeedbackMessage.set('');

    return true;
  }

  private swapSlotCharacters(sourceIndex: number, targetIndex: number): void {
    if (
      !this.isValidSlotIndex(sourceIndex) ||
      !this.isValidSlotIndex(targetIndex) ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    const slots = [...this.slots()];
    const sourceCharacter = slots[sourceIndex] ?? null;
    const targetCharacter = slots[targetIndex] ?? null;
    slots[sourceIndex] = targetCharacter;
    slots[targetIndex] = sourceCharacter;
    this.slots.set(slots);
    this.captainBranchModes.set(this.resolveCaptainBranchModesForSlots(slots));
    this.currentTeamId.set(null);
    this.saveFeedbackError.set('');
    this.dragFeedbackMessage.set('');
  }

  private canDropCharacterToSlot(
    targetIndex: number,
    character: CharacterDetailRecord,
    sourceSlotIndex: number | null | undefined,
  ): boolean {
    if (!this.isValidSlotIndex(targetIndex)) {
      return false;
    }

    const maxTotalCost = this.maxTotalCost();

    if (maxTotalCost === null) {
      return true;
    }

    const nextSlots = [...this.slots()];

    if (
      sourceSlotIndex !== null &&
      sourceSlotIndex !== undefined &&
      this.isValidSlotIndex(sourceSlotIndex)
    ) {
      const targetCharacter = nextSlots[targetIndex] ?? null;
      nextSlots[sourceSlotIndex] = targetCharacter;
    }

    nextSlots[targetIndex] = character;

    return this.resolveBudgetCost(nextSlots) <= maxTotalCost;
  }

  private resolveDraggedCharacter(): CharacterDetailRecord | null {
    const dragState = this.dragState();

    if (!dragState) {
      return null;
    }

    if (dragState.sourceSlotIndex !== null && this.isValidSlotIndex(dragState.sourceSlotIndex)) {
      return this.slots()[dragState.sourceSlotIndex] ?? null;
    }

    return this.candidates().find((candidate) => candidate.id === dragState.characterId) ?? null;
  }

  private async loadTagFilteredCandidates(): Promise<CharacterDetailRecord[]> {
    const searchTerm = this.searchTerm().trim().toLowerCase();
    const selectedType = this.selectedTypeFilter().trim().toUpperCase();
    const selectedClass = this.selectedClassFilter().trim();
    const selectedTag = this.selectedCharacterTagFilter().trim().toLowerCase();
    const minCost = this.candidateMinCost();
    const maxCost = this.candidateMaxCost();
    const records = await this.repository.getDetailedCharacterCatalog();

    return records
      .filter((character) => {
        if (
          searchTerm.length > 0 &&
          !`${character.searchText ?? ''} ${character.name} ${character.id}`
            .toLowerCase()
            .includes(searchTerm)
        ) {
          return false;
        }

        if (
          selectedType.length > 0 &&
          !character.type
            .split(',')
            .map((type) => type.trim().toUpperCase())
            .includes(selectedType)
        ) {
          return false;
        }

        if (selectedClass.length > 0 && !character.classes.includes(selectedClass)) {
          return false;
        }

        if (selectedTag.length > 0) {
          const characterTags = (character.detail.characterTags ?? []).map((tag) =>
            tag.trim().toLowerCase(),
          );

          if (!characterTags.includes(selectedTag)) {
            return false;
          }
        }

        if (minCost !== null && character.cost < minCost) {
          return false;
        }

        if (maxCost !== null && character.cost > maxCost) {
          return false;
        }

        return true;
      })
      .sort((left, right) => right.id - left.id)
      .slice(0, 48);
  }

  private resolveBudgetCost(slots: readonly (CharacterDetailRecord | null)[]): number {
    return slots.reduce((total, character, index) => {
      if (!character || index === MANUAL_TEAM_FRIEND_CAPTAIN_SLOT_INDEX) {
        return total;
      }

      return total + character.cost;
    }, 0);
  }

  private sumSlotStat(stat: 'hp' | 'atk' | 'rcv'): number {
    return this.slots().reduce((total, character) => total + (character?.stats.max[stat] ?? 0), 0);
  }

  private formatNumber(value: number): string {
    return Number.isFinite(value) ? value.toLocaleString() : '0';
  }

  private setDefaultCaptainBranchMode(index: number, character: CharacterDetailRecord): void {
    if (!this.isLeaderSlotIndex(index)) {
      this.clearCaptainBranchMode(index);
      return;
    }

    this.setCaptainBranchMode(index, this.resolveDefaultCaptainBranchMode(character));
  }

  private setCaptainBranchMode(index: number, mode: AutoBuildCaptainBranchMode | null): void {
    this.captainBranchModes.update((currentModes) => ({
      ...currentModes,
      [index]: mode,
    }));
  }

  private clearCaptainBranchMode(index: number): void {
    this.setCaptainBranchMode(index, null);
  }

  private resolveCaptainBranchModesForSlots(
    slots: readonly (CharacterDetailRecord | null)[],
  ): Record<number, AutoBuildCaptainBranchMode | null> {
    return {
      0: slots[0] ? this.resolveDefaultCaptainBranchMode(slots[0]) : null,
      1: slots[1] ? this.resolveDefaultCaptainBranchMode(slots[1]) : null,
    };
  }

  private resolveDefaultCaptainBranchMode(
    character: CharacterDetailRecord,
  ): AutoBuildCaptainBranchMode | null {
    const branchOptions = resolveCaptainCoverageBranchOptions(character);

    if (branchOptions.length !== 2) {
      return null;
    }

    return isVsCaptainCoverageBranchCaptain(character) ? 'character1' : 'both';
  }

  private normalizeCaptainBranchMode(
    value: string | null | undefined,
  ): AutoBuildCaptainBranchMode | null {
    return value === 'character1' || value === 'character2' || value === 'both' ? value : null;
  }

  private isLeaderSlotIndex(index: number): boolean {
    return index === 0 || index === MANUAL_TEAM_FRIEND_CAPTAIN_SLOT_INDEX;
  }

  private buildCharacterSubtitle(character: CharacterDetailRecord): string {
    const typeLabel = character.type
      .split(',')
      .map((value) => value.trim())
      .join(' / ');
    const classLabel = character.classes.join(' / ');

    return [typeLabel, classLabel].filter((value) => value.length).join(' - ');
  }

  private dedupeCharacterRecords(characters: CharacterDetailRecord[]): CharacterDetailRecord[] {
    const seen = new Set<number>();
    const records: CharacterDetailRecord[] = [];

    for (const character of characters) {
      if (seen.has(character.id)) {
        continue;
      }

      seen.add(character.id);
      records.push(character);
    }

    return records;
  }

  private resolveCostBound(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const nextValue = Number(value);

    return Number.isInteger(nextValue) && nextValue >= 0 ? nextValue : null;
  }

  private isValidSlotIndex(index: number): boolean {
    return index >= 0 && index < MANUAL_TEAM_SLOT_COUNT;
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, params, 'manual-team-builder');
  }
}

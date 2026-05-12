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
  peopleOutline,
} from 'ionicons/icons';

import {
  type CharacterDetailRecord,
  type SavedTeam,
  type ShipRecord,
} from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  resolveCaptainTeamConditionStatus,
  type CaptainTeamConditionStatus,
} from '../../core/services/captain-team-condition-status.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { CaptainTeamConditionStatusComponent } from '../../shared/captain-team-condition-status/captain-team-condition-status.component';
import { ShipPickerComponent } from '../../shared/ship-picker/ship-picker.component';

const MANUAL_TEAM_SLOT_COUNT = 6;
const MANUAL_TEAM_FRIEND_CAPTAIN_SLOT_INDEX = 1;

interface ManualTeamCandidateCardView {
  character: CharacterDetailRecord;
  subtitle: string;
  isAssignedToActiveSlot: boolean;
  isAssignedToAnotherSlot: boolean;
  actionLabel: string;
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
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
    CaptainTeamConditionStatusComponent,
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
  public readonly favoriteShipIds;

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
  public readonly remainingCost = computed(() => {
    const maxTotalCost = this.maxTotalCost();

    return maxTotalCost === null ? 0 : Math.max(0, maxTotalCost - this.budgetCost());
  });
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

    return this.candidates()
      .filter((character) => this.canAssignCharacter(character))
      .map((character) => {
        const assignedSlotIndex = slots.findIndex((slot) => slot?.id === character.id);

        return {
          character,
          subtitle: this.buildCharacterSubtitle(character),
          isAssignedToActiveSlot: assignedSlotIndex === activeIndex,
          isAssignedToAnotherSlot: assignedSlotIndex !== -1 && assignedSlotIndex !== activeIndex,
          actionLabel:
            assignedSlotIndex === activeIndex
              ? this.t('actions.assigned')
              : this.t('actions.assign'),
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
        },
        {
          role: 'friendCaptain',
          label: this.t('condition.roles.friendCaptain'),
          character: this.slots()[1] ?? null,
        },
      ],
      slotLabels: this.slots().map((_slot, index) =>
        this.t('condition.slotLabel', { slot: index + 1 }),
      ),
      slots: this.slots(),
    }),
  );

  public readonly closeIcon = closeOutline;
  public readonly editIcon = createOutline;
  public readonly pageIcon = peopleOutline;
  public readonly shipIcon = boatOutline;
  public readonly successIcon = checkmarkCircleOutline;
  public readonly errorIcon = alertCircleOutline;

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
    await this.refreshShips();
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
    if (!this.canAssignCharacter(character)) {
      return;
    }

    const selectedSlotIndex = this.selectedSlotIndex();
    this.slots.update((currentSlots) =>
      currentSlots.map((slot, index) => (index === selectedSlotIndex ? character : slot)),
    );
    this.currentTeamId.set(null);
    this.saveFeedbackError.set('');
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
    this.currentTeamId.set(null);
    this.saveFeedbackError.set('');
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
    this.selectedShipId.set(null);
    this.maxTotalCost.set(null);
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
    const candidates = await this.repository.searchDetailedCharacters({
      searchTerm: this.searchTerm().trim(),
      selectedTypes: [],
      selectedClasses: [],
      sortMode: 'powerFirst',
      limit: 24,
      offset: 0,
    });

    this.candidates.set(this.dedupeCharacterRecords(candidates));
  }

  private canAssignCharacter(character: Pick<CharacterDetailRecord, 'cost'>): boolean {
    const maxTotalCost = this.maxTotalCost();

    if (maxTotalCost === null) {
      return true;
    }

    const activeIndex = this.selectedSlotIndex();

    if (activeIndex === MANUAL_TEAM_FRIEND_CAPTAIN_SLOT_INDEX) {
      return true;
    }

    const currentSlot = this.slots()[activeIndex];
    const currentSlotCost = currentSlot?.cost ?? 0;

    return this.budgetCost() - currentSlotCost + character.cost <= maxTotalCost;
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

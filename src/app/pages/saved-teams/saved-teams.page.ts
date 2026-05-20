import { Component, type OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type ViewWillEnter } from '@ionic/angular';
import {
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
  cloudUploadOutline,
  documentTextOutline,
  peopleOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  type CharacterDetailRecord,
  type CharacterListItem,
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
import { TeamCoverageSummaryComponent } from '../../shared/team-coverage-summary/team-coverage-summary.component';
import {
  buildSavedTeamsTransferPayload,
  clearUnavailableSavedTeamSlots,
  downloadSavedTeamsExport,
  parseSavedTeamsImportPayload,
  sanitizeSavedTeamsImportPayload,
  type SavedTeamsImportError,
} from './saved-teams-transfer.utils';

interface SavedTeamPreviewCard {
  hasShipThumbnail: boolean;
  ship: ShipRecord | null;
  shipDisplayName: string;
  shipThumbUrl: string | null;
  team: SavedTeam;
  slots: Array<CharacterDetailRecord | null>;
  conditionStatus: CaptainTeamConditionStatus;
}

interface SavedTeamsImportFeedback {
  details: string[];
  title: string;
  tone: 'error' | 'success' | 'warning';
}

@Component({
  selector: 'app-saved-teams-page',
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
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
    CaptainTeamConditionStatusComponent,
    TeamCoverageSummaryComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './saved-teams.page.html',
  styleUrl: './saved-teams.page.scss',
})
export class SavedTeamsPage implements OnInit, ViewWillEnter {
  public readonly loading = signal(true);
  public readonly savedTeams;
  public readonly savedTeamCards = signal<SavedTeamPreviewCard[]>([]);
  public readonly selectedTeamIds = signal<string[]>([]);
  public readonly selectedTeamIdSet = computed(() => new Set(this.selectedTeamIds()));
  public readonly selectedCount = computed(() => this.selectedTeamIds().length);
  public readonly hasSelection = computed(() => this.selectedCount() > 0);
  public readonly allSelected = computed(() => {
    const teamCards = this.savedTeamCards();

    return (
      teamCards.length > 0 &&
      teamCards.every((teamCard) => this.selectedTeamIdSet().has(teamCard.team.id))
    );
  });
  public readonly importModalOpen = signal(false);
  public readonly draggingImportFile = signal(false);
  public readonly importFileName = signal('');
  public readonly importFeedback = signal<SavedTeamsImportFeedback | null>(null);
  public readonly importing = signal(false);
  public readonly editModalOpen = signal(false);
  public readonly editingTeam = signal<SavedTeam | null>(null);
  public readonly editTeamName = signal('');
  public readonly editNotes = signal('');
  public readonly savingEdit = signal(false);
  public readonly openTeamModalOpen = signal(false);
  public readonly openingTeam = signal<SavedTeam | null>(null);
  public readonly uploadIcon = cloudUploadOutline;
  public readonly fileIcon = documentTextOutline;
  public readonly closeIcon = closeOutline;
  public readonly successIcon = checkmarkCircleOutline;
  public readonly errorIcon = alertCircleOutline;
  public readonly shipIcon = boatOutline;
  public readonly autoBuilderIcon = sparklesOutline;
  public readonly captainCoverageIcon = shieldCheckmarkOutline;
  public readonly manualBuilderIcon = peopleOutline;

  public constructor(
    private readonly userState: UserStateService,
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
  ) {
    this.savedTeams = this.userState.savedTeams;
  }

  public async ngOnInit(): Promise<void> {
    await Promise.all([this.userState.readySavedTeams(), this.i18n.preloadScope('saved-teams')]);
    await this.refreshSavedTeamCards();
  }

  public async ionViewWillEnter(): Promise<void> {
    await Promise.all([this.userState.readySavedTeams(), this.i18n.preloadScope('saved-teams')]);
    await this.refreshSavedTeamCards();
  }

  public ionViewDidEnter(): void {
    console.log('SavedTeamsPage component');
  }

  public getTeamBuilderQueryParams(team: Pick<SavedTeam, 'id'>): { teamId: string } {
    return { teamId: team.id };
  }

  public openTeamDestinationModal(team: SavedTeam): void {
    this.openingTeam.set(team);
    this.openTeamModalOpen.set(true);
  }

  public closeOpenTeamModal(): void {
    this.openTeamModalOpen.set(false);
  }

  public resetOpenTeamModal(): void {
    this.openTeamModalOpen.set(false);
    this.openingTeam.set(null);
  }

  public getCharacterDetailLink(
    character: Pick<CharacterListItem, 'id'> | null | undefined,
  ): string[] | null {
    return character ? ['/characters', character.id.toString()] : null;
  }

  public isSelected(teamId: string): boolean {
    return this.selectedTeamIdSet().has(teamId);
  }

  public onTeamSelectionChange(teamId: string, event: CustomEvent<{ checked: boolean }>): void {
    this.setTeamSelection(teamId, event.detail.checked);
  }

  public onSelectAllChange(event: CustomEvent<{ checked: boolean }>): void {
    if (event.detail.checked) {
      this.selectedTeamIds.set(this.savedTeamCards().map((teamCard) => teamCard.team.id));
      return;
    }

    this.selectedTeamIds.set([]);
  }

  public exportSelectedTeams(): void {
    if (!this.hasSelection()) {
      return;
    }

    const selectedTeamIds = this.selectedTeamIdSet();
    const payload = buildSavedTeamsTransferPayload(
      this.savedTeams().filter((team) => selectedTeamIds.has(team.id)),
    );

    downloadSavedTeamsExport(payload);
  }

  public exportTeam(team: SavedTeam): void {
    downloadSavedTeamsExport(buildSavedTeamsTransferPayload([team]));
  }

  public resetPage(): void {
    this.selectedTeamIds.set([]);
    this.editModalOpen.set(false);
    this.importModalOpen.set(false);
    this.openTeamModalOpen.set(false);
    this.openingTeam.set(null);
    this.resetEditState();
    this.resetImportState();
  }

  public async confirmAndDeleteTeam(teamId: string): Promise<void> {
    const team = this.savedTeams().find((entry) => entry.id === teamId);

    if (
      !team ||
      !this.confirmDelete(
        this.i18n.translate('confirm.deleteSingle', { name: team.name }, 'saved-teams'),
      )
    ) {
      return;
    }

    await this.userState.deleteTeam(teamId);
    await this.refreshSavedTeamCards();
  }

  public async confirmAndDeleteSelectedTeams(): Promise<void> {
    const selectedTeamIds = this.selectedTeamIds();

    if (
      !selectedTeamIds.length ||
      !this.confirmDelete(
        this.i18n.translate(
          'confirm.deleteSelected',
          { count: selectedTeamIds.length },
          'saved-teams',
        ),
      )
    ) {
      return;
    }

    await this.userState.deleteTeams(selectedTeamIds);
    await this.refreshSavedTeamCards();
  }

  public openEditModal(team: SavedTeam): void {
    this.editingTeam.set(team);
    this.editTeamName.set(team.name);
    this.editNotes.set(team.notes);
    this.savingEdit.set(false);
    this.editModalOpen.set(true);
  }

  public closeEditModal(): void {
    this.editModalOpen.set(false);
    this.resetEditState();
  }

  public openImportModal(): void {
    this.resetImportState();
    this.importModalOpen.set(true);
  }

  public closeImportModal(): void {
    this.importModalOpen.set(false);
    this.resetImportState();
  }

  public onEditTeamNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.editTeamName.set((event.detail.value ?? '').trimStart());
  }

  public onEditNotesChange(event: CustomEvent<{ value?: string | null }>): void {
    this.editNotes.set((event.detail.value ?? '').toString());
  }

  public async saveEditedTeam(): Promise<void> {
    const team = this.editingTeam();

    if (!team || this.savingEdit()) {
      return;
    }

    this.savingEdit.set(true);

    try {
      await this.userState.saveTeam({
        id: team.id,
        name: this.editTeamName(),
        notes: this.editNotes(),
        shipId: team.shipId,
        slots: team.slots,
      });
      await this.refreshSavedTeamCards();
      this.closeEditModal();
    } finally {
      this.savingEdit.set(false);
    }
  }

  public openFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = '';

    if (!file) {
      return;
    }

    await this.importSavedTeams(file);
  }

  public onImportDragOver(event: DragEvent): void {
    event.preventDefault();
    this.draggingImportFile.set(true);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  public onImportDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.draggingImportFile.set(false);
  }

  public async onImportDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.draggingImportFile.set(false);

    const [file] = Array.from(event.dataTransfer?.files ?? []);

    if (!file) {
      return;
    }

    await this.importSavedTeams(file);
  }

  private async refreshSavedTeamCards(): Promise<void> {
    this.loading.set(true);
    const teams = this.savedTeams();

    if (!teams.length) {
      this.savedTeamCards.set([]);
      this.pruneSelection();
      this.loading.set(false);
      return;
    }

    const characterIds = [
      ...new Set(
        teams.flatMap((team) =>
          team.slots.filter((slotId): slotId is number => typeof slotId === 'number'),
        ),
      ),
    ];
    const [characters, ships] = await Promise.all([
      this.repository.getDetailedCharactersByIds(characterIds),
      this.repository.getShips(),
    ]);
    const characterMap = new Map(characters.map((character) => [character.id, character] as const));
    const shipMap = new Map(ships.map((ship) => [ship.id, ship] as const));

    this.savedTeamCards.set(
      teams.map((team) => {
        const ship = typeof team.shipId === 'number' ? (shipMap.get(team.shipId) ?? null) : null;
        const shipThumbUrl = ship?.thumbUrl ?? null;

        const slots = team.slots.map((slotId) =>
          typeof slotId === 'number' ? (characterMap.get(slotId) ?? null) : null,
        );

        return {
          team,
          ship,
          shipDisplayName:
            ship?.name ?? this.i18n.translate('ship.noShipLabel', undefined, 'saved-teams'),
          shipThumbUrl,
          hasShipThumbnail: Boolean(shipThumbUrl),
          slots,
          conditionStatus: this.resolveSavedTeamConditionStatus(slots),
        };
      }),
    );
    this.pruneSelection();
    this.loading.set(false);
  }

  private resolveSavedTeamConditionStatus(
    slots: Array<CharacterDetailRecord | null>,
  ): CaptainTeamConditionStatus {
    return resolveCaptainTeamConditionStatus({
      expectedSlotCount: 6,
      leaders: [
        {
          role: 'captain',
          label: this.i18n.translate('condition.roles.captain', undefined, 'saved-teams'),
          character: slots[0] ?? null,
        },
        {
          role: 'friendCaptain',
          label: this.i18n.translate('condition.roles.friendCaptain', undefined, 'saved-teams'),
          character: slots[1] ?? null,
        },
      ],
      slotLabels: slots.map((_slot, index) =>
        this.i18n.translate('condition.slotLabel', { slot: index + 1 }, 'saved-teams'),
      ),
      slots,
    });
  }

  private setTeamSelection(teamId: string, selected: boolean): void {
    const selectedTeamIds = this.selectedTeamIds();

    if (selected) {
      if (selectedTeamIds.includes(teamId)) {
        return;
      }

      this.selectedTeamIds.set([...selectedTeamIds, teamId]);
      return;
    }

    this.selectedTeamIds.set(selectedTeamIds.filter((selectedTeamId) => selectedTeamId !== teamId));
  }

  private pruneSelection(): void {
    const availableTeamIds = new Set(this.savedTeamCards().map((teamCard) => teamCard.team.id));

    this.selectedTeamIds.set(
      this.selectedTeamIds().filter((teamId) => availableTeamIds.has(teamId)),
    );
  }

  private confirmDelete(message: string): boolean {
    return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
  }

  private resetEditState(): void {
    this.editingTeam.set(null);
    this.editTeamName.set('');
    this.editNotes.set('');
    this.savingEdit.set(false);
  }

  private resetImportState(): void {
    this.draggingImportFile.set(false);
    this.importFileName.set('');
    this.importFeedback.set(null);
    this.importing.set(false);
  }

  private async importSavedTeams(file: File): Promise<void> {
    this.importing.set(true);
    this.importFileName.set(file.name);
    this.importFeedback.set(null);

    try {
      const rawContent = await file.text();
      const payload = parseSavedTeamsImportPayload(rawContent);
      const sanitizedImport = sanitizeSavedTeamsImportPayload(payload, {
        untitledTeamName: this.i18n.translate('common.defaults.untitledCrew'),
      });
      const candidateCharacterIds = [
        ...new Set(
          sanitizedImport.teams.flatMap((team) =>
            team.slots.filter((slotId): slotId is number => typeof slotId === 'number'),
          ),
        ),
      ];
      const availableCharacters = candidateCharacterIds.length
        ? await this.repository.getCharactersByIds(candidateCharacterIds)
        : [];
      const slotSanitizeResult = clearUnavailableSavedTeamSlots(
        sanitizedImport.teams,
        new Set(availableCharacters.map((character) => character.id)),
      );
      const mergeResult = await this.userState.mergeImportedTeams(slotSanitizeResult.teams);

      await this.refreshSavedTeamCards();
      this.importFeedback.set(
        this.buildImportFeedback({
          addedCount: mergeResult.addedCount,
          duplicateIdCount: sanitizedImport.duplicateIdCount,
          fileName: file.name,
          invalidTeamCount: sanitizedImport.invalidTeamCount,
          unknownSlotCount: slotSanitizeResult.unknownSlotCount,
          updatedCount: mergeResult.updatedCount,
        }),
      );
    } catch (error) {
      this.importFeedback.set({
        tone: 'error',
        title: this.i18n.translate('import.errorTitle', undefined, 'saved-teams'),
        details: [this.resolveImportError(error as SavedTeamsImportError)],
      });
    } finally {
      this.importing.set(false);
    }
  }

  private buildImportFeedback(stats: {
    addedCount: number;
    duplicateIdCount: number;
    fileName: string;
    invalidTeamCount: number;
    unknownSlotCount: number;
    updatedCount: number;
  }): SavedTeamsImportFeedback {
    const details = [
      this.i18n.translate('import.loadedFromFile', { fileName: stats.fileName }, 'saved-teams'),
    ];

    if (stats.addedCount > 0) {
      details.push(
        this.i18n.translate('import.stats.added', { count: stats.addedCount }, 'saved-teams'),
      );
    }

    if (stats.updatedCount > 0) {
      details.push(
        this.i18n.translate('import.stats.updated', { count: stats.updatedCount }, 'saved-teams'),
      );
    }

    if (stats.invalidTeamCount > 0) {
      details.push(
        this.i18n.translate(
          'import.stats.invalid',
          { count: stats.invalidTeamCount },
          'saved-teams',
        ),
      );
    }

    if (stats.duplicateIdCount > 0) {
      details.push(
        this.i18n.translate(
          'import.stats.duplicates',
          { count: stats.duplicateIdCount },
          'saved-teams',
        ),
      );
    }

    if (stats.unknownSlotCount > 0) {
      details.push(
        this.i18n.translate(
          'import.stats.unknownSlots',
          { count: stats.unknownSlotCount },
          'saved-teams',
        ),
      );
    }

    return {
      tone:
        stats.invalidTeamCount > 0 || stats.duplicateIdCount > 0 || stats.unknownSlotCount > 0
          ? 'warning'
          : 'success',
      title: this.i18n.translate(
        stats.invalidTeamCount > 0 || stats.duplicateIdCount > 0 || stats.unknownSlotCount > 0
          ? 'import.warningTitle'
          : 'import.successTitle',
        undefined,
        'saved-teams',
      ),
      details,
    };
  }

  private resolveImportError(error: SavedTeamsImportError | Error | unknown): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'saved-teams');
    }

    return this.i18n.translate('import.errors.generic', undefined, 'saved-teams');
  }
}

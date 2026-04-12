import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type ViewWillEnter } from '@ionic/angular';
import {
  IonButton,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import {
  boatOutline,
  closeOutline,
} from 'ionicons/icons';

import { type CharacterListItem, type SavedTeam, type ShipRecord } from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  buildSavedTeamsTransferPayload,
  downloadSavedTeamsExport,
} from './saved-teams-transfer.utils';

interface SavedTeamPreviewCard {
  hasShipThumbnail: boolean;
  ship: ShipRecord | null;
  shipDisplayName: string;
  shipThumbUrl: string | null;
  team: SavedTeam;
  slots: Array<CharacterListItem | null>;
}

@Component({
  selector: 'app-saved-teams-page',
  standalone: true,
  imports: [
    IonButton,
    IonCheckbox,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonModal,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
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
  public readonly editModalOpen = signal(false);
  public readonly editingTeam = signal<SavedTeam | null>(null);
  public readonly editTeamName = signal('');
  public readonly editNotes = signal('');
  public readonly savingEdit = signal(false);
  public readonly closeIcon = closeOutline;
  public readonly shipIcon = boatOutline;

  public constructor(
    private readonly userState: UserStateService,
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
  ) {
    this.savedTeams = this.userState.savedTeams;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    await this.refreshSavedTeamCards();
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.userState.ready();
    await this.refreshSavedTeamCards();
  }

  public ionViewDidEnter(): void {
    console.log('SavedTeamsPage component');
  }

  public getTeamBuilderQueryParams(team: Pick<SavedTeam, 'id'>): { teamId: string } {
    return { teamId: team.id };
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
    this.resetEditState();
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
      this.repository.getCharactersByIds(characterIds),
      this.repository.getShips(),
    ]);
    const characterMap = new Map(characters.map((character) => [character.id, character] as const));
    const shipMap = new Map(ships.map((ship) => [ship.id, ship] as const));

    this.savedTeamCards.set(
      teams.map((team) => {
        const ship = typeof team.shipId === 'number' ? (shipMap.get(team.shipId) ?? null) : null;
        const shipThumbUrl = ship?.thumbUrl ?? null;

        return {
          team,
          ship,
          shipDisplayName:
            ship?.name ?? this.i18n.translate('ship.noShipLabel', undefined, 'saved-teams'),
          shipThumbUrl,
          hasShipThumbnail: Boolean(shipThumbUrl),
          slots: team.slots.map((slotId) =>
            typeof slotId === 'number' ? (characterMap.get(slotId) ?? null) : null,
          ),
        };
      }),
    );
    this.pruneSelection();
    this.loading.set(false);
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
}

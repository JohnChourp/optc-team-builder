import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type ViewWillEnter } from '@ionic/angular';
import {
  IonButton,
  IonButtons,
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
import { closeOutline, createOutline, shieldHalfOutline } from 'ionicons/icons';

import { type CharacterListItem } from '../../core/models/optc.models';
import { type SavedRumbleTeam } from '../../core/models/saved-rumble-team.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';

interface SavedRumbleTeamPreviewCard {
  opponentCount: number;
  team: SavedRumbleTeam;
  teamCount: number;
  slots: Array<CharacterListItem | null>;
  updatedLabel: string;
}

@Component({
  selector: 'app-saved-rumble-teams-page',
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
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
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './saved-rumble-teams.page.html',
  styleUrl: './saved-rumble-teams.page.scss',
})
export class SavedRumbleTeamsPage implements OnInit, ViewWillEnter {
  public readonly loading = signal(true);
  public readonly savedRumbleTeams;
  public readonly savedRumbleTeamCards = signal<SavedRumbleTeamPreviewCard[]>([]);
  public readonly editModalOpen = signal(false);
  public readonly editingRumbleTeam = signal<SavedRumbleTeam | null>(null);
  public readonly editRumbleTeamName = signal('');
  public readonly editNotes = signal('');
  public readonly savingEdit = signal(false);
  public readonly hasSavedRumbleTeams = computed(() => this.savedRumbleTeams().length > 0);
  public readonly shieldIcon = shieldHalfOutline;
  public readonly editIcon = createOutline;
  public readonly closeIcon = closeOutline;

  public constructor(
    private readonly userState: UserStateService,
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
  ) {
    this.savedRumbleTeams = this.userState.savedRumbleTeams;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    await this.refreshSavedRumbleTeamCards();
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.userState.ready();
    await this.refreshSavedRumbleTeamCards();
  }

  public getRumbleBuilderQueryParams(team: Pick<SavedRumbleTeam, 'id'>): {
    savedRumbleTeamId: string;
  } {
    return { savedRumbleTeamId: team.id };
  }

  public getCharacterDetailLink(
    character: Pick<CharacterListItem, 'id'> | null | undefined,
  ): string[] | null {
    return character ? ['/characters', character.id.toString()] : null;
  }

  public openEditModal(team: SavedRumbleTeam): void {
    this.editingRumbleTeam.set(team);
    this.editRumbleTeamName.set(team.name);
    this.editNotes.set(team.notes);
    this.savingEdit.set(false);
    this.editModalOpen.set(true);
  }

  public closeEditModal(): void {
    this.editModalOpen.set(false);
    this.resetEditState();
  }

  public onEditRumbleTeamNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.editRumbleTeamName.set((event.detail.value ?? '').trimStart());
  }

  public onEditNotesChange(event: CustomEvent<{ value?: string | null }>): void {
    this.editNotes.set((event.detail.value ?? '').toString());
  }

  public async saveEditedRumbleTeam(): Promise<void> {
    const team = this.editingRumbleTeam();

    if (!team || this.savingEdit()) {
      return;
    }

    this.savingEdit.set(true);

    try {
      await this.userState.saveRumbleTeam({
        ...team,
        name: this.editRumbleTeamName(),
        notes: this.editNotes(),
      });
      await this.refreshSavedRumbleTeamCards();
      this.closeEditModal();
    } finally {
      this.savingEdit.set(false);
    }
  }

  public async confirmAndDeleteRumbleTeam(rumbleTeamId: string): Promise<void> {
    const team = this.savedRumbleTeams().find((entry) => entry.id === rumbleTeamId);

    if (
      !team ||
      !this.confirmDelete(
        this.i18n.translate('confirm.deleteSingle', { name: team.name }, 'saved-rumble-teams'),
      )
    ) {
      return;
    }

    await this.userState.deleteRumbleTeam(rumbleTeamId);
    await this.refreshSavedRumbleTeamCards();
  }

  private async refreshSavedRumbleTeamCards(): Promise<void> {
    this.loading.set(true);
    const rumbleTeams = this.savedRumbleTeams();

    if (!rumbleTeams.length) {
      this.savedRumbleTeamCards.set([]);
      this.loading.set(false);
      return;
    }

    const characterIds = [
      ...new Set(
        rumbleTeams.flatMap((team) => [
          ...this.resolvePreviewCharacterIds(team),
          ...team.opponentActiveCharacterIds,
          ...team.opponentBenchCharacterIds,
        ]),
      ),
    ].filter((characterId): characterId is number => typeof characterId === 'number');
    const characters = characterIds.length
      ? await this.repository.getCharactersByIds(characterIds)
      : [];
    const characterMap = new Map(characters.map((character) => [character.id, character] as const));

    this.savedRumbleTeamCards.set(
      rumbleTeams.map((team) => ({
        team,
        teamCount: team.teams.length,
        opponentCount: [
          ...team.opponentActiveCharacterIds,
          ...team.opponentBenchCharacterIds,
        ].filter((characterId): characterId is number => typeof characterId === 'number').length,
        updatedLabel: this.formatUpdatedLabel(team.updatedAt),
        slots: this.resolvePreviewCharacterIds(team).map(
          (characterId) => characterMap.get(characterId) ?? null,
        ),
      })),
    );
    this.loading.set(false);
  }

  private resolvePreviewCharacterIds(team: SavedRumbleTeam): number[] {
    const firstTeam = team.teams[team.selectedTeamIndex] ?? team.teams[0] ?? null;

    if (!firstTeam) {
      return [];
    }

    return [
      ...firstTeam.activeSlots.map((slot) => slot.characterId),
      ...firstTeam.benchSlots.map((slot) => slot.characterId),
    ].slice(0, 8);
  }

  private formatUpdatedLabel(updatedAt: string): string {
    const date = new Date(updatedAt);

    if (Number.isNaN(date.getTime())) {
      return updatedAt;
    }

    return date.toLocaleString();
  }

  private confirmDelete(message: string): boolean {
    return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
  }

  private resetEditState(): void {
    this.editingRumbleTeam.set(null);
    this.editRumbleTeamName.set('');
    this.editNotes.set('');
    this.savingEdit.set(false);
  }
}

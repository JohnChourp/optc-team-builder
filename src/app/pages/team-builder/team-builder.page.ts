import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonSearchbar,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { boatOutline, heart, heartOutline } from 'ionicons/icons';

import { type AutoBuildAbilityCatalog } from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterListItem,
  type SavedTeam,
  type ShipRecord,
} from '../../core/models/optc.models';
import {
  createAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from '../../core/services/ability-requirement-draft.utils';
import { CharacterCatalogCacheService } from '../../core/services/character-catalog-cache.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { AppI18nService } from '../../core/services/app-i18n.service';
import {
  getAbilityCatalogItemsByCategory,
  intersectAbilityMatchingCharacterIds,
  resolveCategoryAbilityMatchingCharacterIds,
  resolveSpecialAbilityMatchingCharacterIds,
  serializeCategoryAbilityDrafts,
  serializeSpecialAbilityDrafts,
} from '../../core/services/special-ability-filter.utils';
import { UserStateService } from '../../core/services/user-state.service';
import { SpecialAbilityPickerComponent } from '../../shared/special-ability-picker/special-ability-picker.component';
import { ShipPickerComponent } from '../../shared/ship-picker/ship-picker.component';

type TeamBuilderCandidateDisplayMode = 'list' | 'compact';

interface TeamBuilderCandidateCardView {
  character: CharacterListItem;
  subtitle: string;
  isFavorite: boolean;
  favoriteAriaLabel: string;
}

@Component({
  selector: 'app-team-builder-page',
  standalone: true,
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonSearchbar,
    IonTextarea,
    IonTitle,
    IonToolbar,
    RouterLink,
    ShipPickerComponent,
    SpecialAbilityPickerComponent,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './team-builder.page.html',
  styleUrl: './team-builder.page.scss',
})
export class TeamBuilderPage implements OnInit {
  public readonly ships = signal<ShipRecord[]>([]);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly candidateSearchTerm = signal('');
  public readonly specialAbilityPickerOpen = signal(false);
  public readonly specialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly crewmateAbilityPickerOpen = signal(false);
  public readonly crewmateAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly potentialAbilityPickerOpen = signal(false);
  public readonly potentialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly supportAbilityPickerOpen = signal(false);
  public readonly supportAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly candidateDisplayMode = signal<TeamBuilderCandidateDisplayMode>('list');
  public readonly candidateCharacters = signal<CharacterListItem[]>([]);
  public readonly slotCharacters = signal<Array<CharacterListItem | null>>(
    Array.from({ length: 6 }, () => null),
  );
  public readonly selectedSlotIndex = signal(0);
  public readonly selectedShipId = signal<number | null>(null);
  public readonly shipPickerOpen = signal(false);
  public readonly teamName = signal('');
  public readonly notes = signal('');
  public readonly savedTeams;
  public readonly favoriteIds;
  public readonly favoriteShipIds;
  public readonly teamTotals = signal({ hp: 0, atk: 0, rcv: 0, cost: 0 });
  public readonly currentTeamId = signal<string | null>(null);
  public readonly selectedShip = computed(
    () => this.ships().find((ship) => ship.id === this.selectedShipId()) ?? null,
  );
  public readonly selectedShipTitle = computed(
    () => this.selectedShip()?.name ?? this.i18n.translate('form.noShip', undefined, 'team-builder'),
  );
  public readonly selectedShipSubtitle = computed(() => {
    const selectedShip = this.selectedShip();

    if (!selectedShip) {
      return this.i18n.translate('form.noShipCopy', undefined, 'team-builder');
    }

    return this.buildShipSubtitle(selectedShip.description);
  });
  public readonly isCompactCandidateDisplayMode = computed(
    () => this.candidateDisplayMode() === 'compact',
  );
  public readonly availableSpecialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.abilityCatalog()?.abilities ?? [], 'special'),
  );
  public readonly availableCrewmateAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.abilityCatalog()?.abilities ?? [], 'crewmate'),
  );
  public readonly availablePotentialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.abilityCatalog()?.abilities ?? [], 'potential'),
  );
  public readonly availableSupportAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.abilityCatalog()?.abilities ?? [], 'support'),
  );
  public readonly specialAbilityRequirements = computed(() =>
    serializeSpecialAbilityDrafts(
      this.specialAbilityDrafts(),
      this.availableSpecialAbilityCatalogItems(),
    ),
  );
  public readonly crewmateAbilityRequirements = computed(() =>
    serializeCategoryAbilityDrafts(
      this.crewmateAbilityDrafts(),
      this.availableCrewmateAbilityCatalogItems(),
      'crewmate',
    ),
  );
  public readonly potentialAbilityRequirements = computed(() =>
    serializeCategoryAbilityDrafts(
      this.potentialAbilityDrafts(),
      this.availablePotentialAbilityCatalogItems(),
      'potential',
    ),
  );
  public readonly supportAbilityRequirements = computed(() =>
    serializeCategoryAbilityDrafts(
      this.supportAbilityDrafts(),
      this.availableSupportAbilityCatalogItems(),
      'support',
    ),
  );
  public readonly specialFilterCharacterIds = computed(() =>
    resolveSpecialAbilityMatchingCharacterIds(
      this.specialAbilityRequirements(),
      this.availableSpecialAbilityCatalogItems(),
    ),
  );
  public readonly crewmateFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.crewmateAbilityRequirements(),
      this.availableCrewmateAbilityCatalogItems(),
      'crewmate',
    ),
  );
  public readonly potentialFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.potentialAbilityRequirements(),
      this.availablePotentialAbilityCatalogItems(),
      'potential',
    ),
  );
  public readonly supportFilterCharacterIds = computed(() =>
    resolveCategoryAbilityMatchingCharacterIds(
      this.supportAbilityRequirements(),
      this.availableSupportAbilityCatalogItems(),
      'support',
    ),
  );
  public readonly candidateCardViews = computed<TeamBuilderCandidateCardView[]>(() =>
    this.candidateCharacters().map((candidate) => {
      const isFavorite = this.isFavorite(candidate.id);

      return {
        character: candidate,
        subtitle: [candidate.type, candidate.primaryClass, candidate.secondaryClass]
          .filter((value): value is string => Boolean(value))
          .join(' • '),
        isFavorite,
        favoriteAriaLabel: this.i18n.translate(
          isFavorite ? 'assign.removeFavoriteAria' : 'assign.addFavoriteAria',
          undefined,
          'team-builder',
        ),
      };
    }),
  );
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public readonly shipIcon = boatOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly characterCatalogCache: CharacterCatalogCacheService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
  ) {
    this.savedTeams = this.userState.savedTeams;
    this.favoriteIds = this.userState.favoriteCharacterIds;
    this.favoriteShipIds = this.userState.favoriteShipIds;
    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    const [ships, abilityCatalog] = await Promise.all([
      this.repository.getShips(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      this.characterCatalogCache.ensureLoaded(),
    ]);
    this.ships.set(ships);
    this.abilityCatalog.set(abilityCatalog);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public async onSearchCandidates(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.candidateSearchTerm.set((event.detail.value ?? '').trim());
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public setCandidateDisplayMode(displayMode: TeamBuilderCandidateDisplayMode): void {
    this.candidateDisplayMode.set(displayMode);
  }

  public openSpecialAbilityPicker(): void {
    if (!this.availableSpecialAbilityCatalogItems().length) {
      return;
    }

    this.specialAbilityPickerOpen.set(true);
  }

  public closeSpecialAbilityPicker(): void {
    this.specialAbilityPickerOpen.set(false);
  }

  public async saveSpecialAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.specialAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeSpecialAbilityDrafts(drafts, this.availableSpecialAbilityCatalogItems()),
      ),
    );
    this.specialAbilityPickerOpen.set(false);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public async clearSpecialAbilityFilters(): Promise<void> {
    this.specialAbilityDrafts.set([]);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public openCrewmateAbilityPicker(): void {
    if (!this.availableCrewmateAbilityCatalogItems().length) {
      return;
    }

    this.crewmateAbilityPickerOpen.set(true);
  }

  public closeCrewmateAbilityPicker(): void {
    this.crewmateAbilityPickerOpen.set(false);
  }

  public async saveCrewmateAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.crewmateAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(
          drafts,
          this.availableCrewmateAbilityCatalogItems(),
          'crewmate',
        ),
      ),
    );
    this.crewmateAbilityPickerOpen.set(false);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public async clearCrewmateAbilityFilters(): Promise<void> {
    this.crewmateAbilityDrafts.set([]);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public openPotentialAbilityPicker(): void {
    if (!this.availablePotentialAbilityCatalogItems().length) {
      return;
    }

    this.potentialAbilityPickerOpen.set(true);
  }

  public closePotentialAbilityPicker(): void {
    this.potentialAbilityPickerOpen.set(false);
  }

  public async savePotentialAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.potentialAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(
          drafts,
          this.availablePotentialAbilityCatalogItems(),
          'potential',
        ),
      ),
    );
    this.potentialAbilityPickerOpen.set(false);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public async clearPotentialAbilityFilters(): Promise<void> {
    this.potentialAbilityDrafts.set([]);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public openSupportAbilityPicker(): void {
    if (!this.availableSupportAbilityCatalogItems().length) {
      return;
    }

    this.supportAbilityPickerOpen.set(true);
  }

  public closeSupportAbilityPicker(): void {
    this.supportAbilityPickerOpen.set(false);
  }

  public async saveSupportAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.supportAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(drafts, this.availableSupportAbilityCatalogItems(), 'support'),
      ),
    );
    this.supportAbilityPickerOpen.set(false);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public async clearSupportAbilityFilters(): Promise<void> {
    this.supportAbilityDrafts.set([]);
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public onTeamNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.teamName.set((event.detail.value ?? '').trimStart());
  }

  public onNotesChange(event: CustomEvent<{ value?: string | null }>): void {
    this.notes.set((event.detail.value ?? '').toString());
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

  public selectSlot(index: number): void {
    this.selectedSlotIndex.set(index);
  }

  public async assignCharacter(character: CharacterListItem): Promise<void> {
    const next = [...this.slotCharacters()];
    next[this.selectedSlotIndex()] = character;
    this.slotCharacters.set(next);
    await this.refreshTeamTotals();
  }

  public async clearSlot(index: number): Promise<void> {
    const next = [...this.slotCharacters()];
    next[index] = null;
    this.slotCharacters.set(next);
    await this.refreshTeamTotals();
  }

  public async saveTeam(): Promise<void> {
    const saved = await this.userState.saveTeam({
      id: this.currentTeamId() ?? undefined,
      name: this.teamName(),
      notes: this.notes(),
      shipId: this.selectedShipId(),
      slots: this.slotCharacters().map((character) => character?.id ?? null),
    });

    this.currentTeamId.set(saved.id);
  }

  public async loadTeam(team: SavedTeam): Promise<void> {
    await this.characterCatalogCache.ensureLoaded();
    const characters = this.characterCatalogCache.getCharactersByIds(
      team.slots.filter((value): value is number => typeof value === 'number'),
    );
    const characterMap = new Map(characters.map((character) => [character.id, character]));
    const slots = team.slots.map((characterId) =>
      characterId ? (characterMap.get(characterId) ?? null) : null,
    );

    this.currentTeamId.set(team.id);
    this.teamName.set(team.name);
    this.notes.set(team.notes);
    this.selectedShipId.set(team.shipId);
    this.slotCharacters.set(slots);
    await this.refreshTeamTotals();
  }

  public async deleteTeam(teamId: string): Promise<void> {
    await this.userState.deleteTeam(teamId);

    if (this.currentTeamId() === teamId) {
      this.resetEditor();
    }
  }

  public async resetPage(): Promise<void> {
    this.candidateSearchTerm.set('');
    this.specialAbilityPickerOpen.set(false);
    this.specialAbilityDrafts.set([]);
    this.crewmateAbilityPickerOpen.set(false);
    this.crewmateAbilityDrafts.set([]);
    this.potentialAbilityPickerOpen.set(false);
    this.potentialAbilityDrafts.set([]);
    this.supportAbilityPickerOpen.set(false);
    this.supportAbilityDrafts.set([]);
    this.selectedSlotIndex.set(0);
    this.resetEditor();
    await this.refreshCandidateCharacters(this.candidateSearchTerm());
  }

  public async toggleFavorite(characterId: number, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.userState.toggleFavorite(characterId);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteIds().includes(characterId);
  }

  public getCharacterDetailLink(character: CharacterListItem | null): string[] | null {
    return character ? ['/characters', character.id.toString()] : null;
  }

  private async refreshCandidateCharacters(searchTerm: string): Promise<void> {
    await this.characterCatalogCache.ensureLoaded();
    this.candidateCharacters.set(
      this.characterCatalogCache.queryCharacters({
        searchTerm,
        typeFilter: '',
        classFilter: '',
        allowedCharacterIds: intersectAbilityMatchingCharacterIds([
          this.specialFilterCharacterIds(),
          this.crewmateFilterCharacterIds(),
          this.potentialFilterCharacterIds(),
          this.supportFilterCharacterIds(),
        ]),
        limit: 24,
        offset: 0,
      }),
    );
  }

  private async refreshTeamTotals(): Promise<void> {
    const selected = this.slotCharacters().filter((character): character is CharacterListItem =>
      Boolean(character),
    );

    this.teamTotals.set(
      selected.reduce(
        (totals, character) => ({
          hp: totals.hp + (character.stats.max.hp ?? 0),
          atk: totals.atk + (character.stats.max.atk ?? 0),
          rcv: totals.rcv + (character.stats.max.rcv ?? 0),
          cost: totals.cost + character.cost,
        }),
        { hp: 0, atk: 0, rcv: 0, cost: 0 },
      ),
    );
  }

  private buildShipSubtitle(description: string): string {
    const normalizedDescription = description.trim();

    return normalizedDescription.length > 132
      ? `${normalizedDescription.slice(0, 129).trimEnd()}...`
      : normalizedDescription;
  }

  private resetEditor(): void {
    this.currentTeamId.set(null);
    this.teamName.set(this.i18n.translate('common.defaults.newCrew'));
    this.notes.set('');
    this.selectedShipId.set(null);
    this.shipPickerOpen.set(false);
    this.selectedSlotIndex.set(0);
    this.slotCharacters.set(Array.from({ length: 6 }, () => null));
    this.teamTotals.set({ hp: 0, atk: 0, rcv: 0, cost: 0 });
  }
}

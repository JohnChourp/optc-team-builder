import { Component, type OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
  copyOutline,
  documentTextOutline,
  downloadOutline,
  linkOutline,
  peopleOutline,
  shareSocialOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  type AutoBuildAbilityCoverageMode,
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
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
  buildSavedTeamJson,
  buildSavedTeamShareCode,
  buildSavedTeamShareUrl,
  buildSavedTeamsJson,
  buildSavedTeamsTransferPayload,
  clearUnavailableSavedTeamSlots,
  downloadSavedTeamsExport,
  parseSavedTeamsImportContent,
  sanitizeSavedTeamsImportPayload,
  type SavedTeamsImportError,
} from './saved-teams-transfer.utils';
import { SavedTeamsStylePanelsComponent } from './saved-teams-style-panels.component';

interface SavedTeamPreviewCard {
  abilityIdentitySets: Record<SavedTeamAbilityOrigin, Set<string>>;
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

type SavedTeamAbilityOrigin = 'leader' | 'crew';
type SavedTeamAbilityCategory = 'captain' | 'special' | 'crewmate' | 'potential' | 'support';

interface SavedTeamAbilityFacet {
  category: SavedTeamAbilityCategory;
  coverageMode: AutoBuildAbilityCoverageMode;
  identity: string;
  label: string;
  metadataLabel: string;
  minTurns: number | null;
  selected: boolean;
  slotTokens: string[];
  source: AutoBuildAbilitySource;
  teamCount: number;
}

type SavedTeamAbilityFacetBase = Omit<SavedTeamAbilityFacet, 'selected'>;

interface SavedTeamAbilityCategoryGroup {
  abilityCount: number;
  abilities: SavedTeamAbilityFacet[];
  category: SavedTeamAbilityCategory;
  label: string;
}

interface SavedTeamAbilityFilterSection {
  categories: SavedTeamAbilityCategoryGroup[];
  copy: string;
  hasSelection: boolean;
  origin: SavedTeamAbilityOrigin;
  selectedCount: number;
  title: string;
}

const SAVED_TEAM_ABILITY_ORIGINS: SavedTeamAbilityOrigin[] = ['leader', 'crew'];
const SAVED_TEAM_ABILITY_CATEGORIES: SavedTeamAbilityCategory[] = [
  'captain',
  'special',
  'crewmate',
  'potential',
  'support',
];

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
    SavedTeamsStylePanelsComponent,
    TeamCoverageSummaryComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './saved-teams.page.html',
  styleUrl: './saved-teams.page.scss',
})
export class SavedTeamsPage implements OnInit {
  public readonly loading = signal(true);
  public readonly savedTeams;
  public readonly savedTeamCards = signal<SavedTeamPreviewCard[]>([]);
  public readonly selectedLeaderAbilityIds = signal<string[]>([]);
  public readonly selectedCrewAbilityIds = signal<string[]>([]);
  public readonly selectedLeaderAbilityIdSet = computed(
    () => new Set(this.selectedLeaderAbilityIds()),
  );
  public readonly selectedCrewAbilityIdSet = computed(() => new Set(this.selectedCrewAbilityIds()));
  public readonly hasAbilityFilters = computed(
    () => this.selectedLeaderAbilityIds().length > 0 || this.selectedCrewAbilityIds().length > 0,
  );
  public readonly selectedAbilityFilterCount = computed(
    () => this.selectedLeaderAbilityIds().length + this.selectedCrewAbilityIds().length,
  );
  private readonly abilityFacetBasesByOrigin = computed<
    Record<SavedTeamAbilityOrigin, SavedTeamAbilityFacetBase[]>
  >(() => ({
    leader: this.buildAbilityFacetBases('leader'),
    crew: this.buildAbilityFacetBases('crew'),
  }));
  public readonly filteredSavedTeamCards = computed(() =>
    this.savedTeamCards().filter((teamCard) => this.matchesSelectedAbilityFilters(teamCard)),
  );
  public readonly selectedTeamIds = signal<string[]>([]);
  public readonly selectedTeamIdSet = computed(() => new Set(this.selectedTeamIds()));
  public readonly selectedCount = computed(() => this.selectedTeamIds().length);
  public readonly hasSelection = computed(() => this.selectedCount() > 0);
  public readonly allSelected = computed(() => {
    const teamCards = this.filteredSavedTeamCards();

    return (
      teamCards.length > 0 &&
      teamCards.every((teamCard) => this.selectedTeamIdSet().has(teamCard.team.id))
    );
  });
  public readonly abilityFilterSections = computed<SavedTeamAbilityFilterSection[]>(() => [
    this.buildAbilityFilterSection('leader'),
    this.buildAbilityFilterSection('crew'),
  ]);
  public readonly hasAbilityFiltersAvailable = computed(() =>
    this.abilityFilterSections().some((section) =>
      section.categories.some((category) => category.abilityCount > 0),
    ),
  );
  public readonly savedTeamTotalLabel = computed(() =>
    this.hasAbilityFilters()
      ? this.i18n.translate(
          'totalFiltered',
          { count: this.filteredSavedTeamCards().length, total: this.savedTeams().length },
          'saved-teams',
        )
      : this.i18n.translate('total', { count: this.savedTeams().length }, 'saved-teams'),
  );
  public readonly importModalOpen = signal(false);
  public readonly draggingImportFile = signal(false);
  public readonly importFileName = signal('');
  public readonly importTextContent = signal('');
  public readonly importFeedback = signal<SavedTeamsImportFeedback | null>(null);
  public readonly importing = signal(false);
  public readonly actionFeedback = signal<SavedTeamsImportFeedback | null>(null);
  public readonly editModalOpen = signal(false);
  public readonly editingTeam = signal<SavedTeam | null>(null);
  public readonly editTeamName = signal('');
  public readonly editNotes = signal('');
  public readonly savingEdit = signal(false);
  public readonly openTeamModalOpen = signal(false);
  public readonly openingTeam = signal<SavedTeam | null>(null);
  public readonly uploadIcon = cloudUploadOutline;
  public readonly fileIcon = documentTextOutline;
  public readonly copyIcon = copyOutline;
  public readonly downloadIcon = downloadOutline;
  public readonly linkIcon = linkOutline;
  public readonly shareIcon = shareSocialOutline;
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
    this.applySavedTeamsStorageRecoveryFeedback();
    await this.refreshSavedTeamCards();
  }

  public async ionViewWillEnter(): Promise<void> {
    await Promise.all([this.userState.readySavedTeams(), this.i18n.preloadScope('saved-teams')]);
    this.applySavedTeamsStorageRecoveryFeedback();
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
      this.selectedTeamIds.set(this.filteredSavedTeamCards().map((teamCard) => teamCard.team.id));
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

  public async copySelectedTeamsJson(): Promise<void> {
    if (!this.hasSelection()) {
      return;
    }

    const selectedTeamIds = this.selectedTeamIdSet();

    await this.copyTextToClipboardWithFeedback(
      buildSavedTeamsJson(this.savedTeams().filter((team) => selectedTeamIds.has(team.id))),
      this.i18n.translate(
        'share.copiedSelectedJson',
        { count: this.selectedCount() },
        'saved-teams',
      ),
    );
  }

  public exportTeam(team: SavedTeam): void {
    downloadSavedTeamsExport(buildSavedTeamsTransferPayload([team]));
  }

  public async copyTeamShareLink(team: SavedTeam): Promise<void> {
    await this.copyTextToClipboardWithFeedback(
      buildSavedTeamShareUrl(team),
      this.i18n.translate('share.copiedLink', { name: team.name }, 'saved-teams'),
    );
  }

  public async copyTeamShareCode(team: SavedTeam): Promise<void> {
    await this.copyTextToClipboardWithFeedback(
      buildSavedTeamShareCode(team),
      this.i18n.translate('share.copiedCode', { name: team.name }, 'saved-teams'),
    );
  }

  public async copyTeamJson(team: SavedTeam): Promise<void> {
    await this.copyTextToClipboardWithFeedback(
      buildSavedTeamJson(team),
      this.i18n.translate('share.copiedJson', { name: team.name }, 'saved-teams'),
    );
  }

  public resetPage(): void {
    this.selectedTeamIds.set([]);
    this.clearAllAbilityFilters();
    this.editModalOpen.set(false);
    this.importModalOpen.set(false);
    this.openTeamModalOpen.set(false);
    this.openingTeam.set(null);
    this.actionFeedback.set(null);
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

  public onImportTextChange(event: CustomEvent<{ value?: string | null }>): void {
    this.importTextContent.set((event.detail.value ?? '').toString());
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

  public async importPastedTeams(): Promise<void> {
    const rawContent = this.importTextContent().trim();

    if (!rawContent.length || this.importing()) {
      return;
    }

    await this.importSavedTeamsContent(
      rawContent,
      this.i18n.translate('import.pastedSource', undefined, 'saved-teams'),
    );
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

  public isAbilityFilterSelected(origin: SavedTeamAbilityOrigin, identity: string): boolean {
    return this.resolveSelectedAbilitySet(origin).has(identity);
  }

  public toggleAbilityFilter(origin: SavedTeamAbilityOrigin, identity: string): void {
    this.setAbilityFilterSelection(
      origin,
      identity,
      !this.isAbilityFilterSelected(origin, identity),
    );
  }

  public clearAbilityFilterSection(origin: SavedTeamAbilityOrigin): void {
    this.setSelectedAbilityIds(origin, []);
    this.pruneSelection();
  }

  public clearAllAbilityFilters(): void {
    this.selectedLeaderAbilityIds.set([]);
    this.selectedCrewAbilityIds.set([]);
    this.pruneSelection();
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
        const abilityIdentitySets = this.buildTeamAbilityIdentitySets(slots);

        return {
          team,
          ship,
          shipDisplayName:
            ship?.name ?? this.i18n.translate('ship.noShipLabel', undefined, 'saved-teams'),
          shipThumbUrl,
          hasShipThumbnail: Boolean(shipThumbUrl),
          slots,
          abilityIdentitySets,
          conditionStatus: this.resolveSavedTeamConditionStatus(slots),
        };
      }),
    );
    this.pruneAbilitySelections();
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
    const availableTeamIds = new Set(
      this.filteredSavedTeamCards().map((teamCard) => teamCard.team.id),
    );

    this.selectedTeamIds.set(
      this.selectedTeamIds().filter((teamId) => availableTeamIds.has(teamId)),
    );
  }

  private pruneAbilitySelections(): void {
    for (const origin of SAVED_TEAM_ABILITY_ORIGINS) {
      const availableAbilityIds = new Set(
        this.savedTeamCards().flatMap((teamCard) => [
          ...teamCard.abilityIdentitySets[origin].values(),
        ]),
      );
      const nextAbilityIds = this.resolveSelectedAbilityIds(origin).filter((abilityId) =>
        availableAbilityIds.has(abilityId),
      );

      this.setSelectedAbilityIds(origin, nextAbilityIds);
    }
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
    this.importTextContent.set('');
    this.importFeedback.set(null);
    this.importing.set(false);
  }

  private async copyTextToClipboardWithFeedback(
    text: string,
    successMessage: string,
  ): Promise<void> {
    this.actionFeedback.set(null);

    try {
      const clipboard = globalThis.navigator?.clipboard;

      if (!clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }

      await clipboard.writeText(text);
      this.actionFeedback.set({
        tone: 'success',
        title: this.i18n.translate('share.successTitle', undefined, 'saved-teams'),
        details: [successMessage],
      });
    } catch {
      this.actionFeedback.set({
        tone: 'error',
        title: this.i18n.translate('share.errorTitle', undefined, 'saved-teams'),
        details: [this.i18n.translate('share.errors.clipboard', undefined, 'saved-teams')],
      });
    }
  }

  private buildAbilityFilterSection(origin: SavedTeamAbilityOrigin): SavedTeamAbilityFilterSection {
    const facets = this.resolveAbilityFacets(origin);
    const selectedIds = this.resolveSelectedAbilitySet(origin);
    const categories = SAVED_TEAM_ABILITY_CATEGORIES.map((category) => {
      const abilities = facets.filter((facet) => facet.category === category);

      return {
        abilityCount: abilities.length,
        abilities,
        category,
        label: this.i18n.translate(
          `abilityFilters.categories.${category}`,
          undefined,
          'saved-teams',
        ),
      };
    });

    return {
      categories,
      copy: this.i18n.translate(`abilityFilters.sections.${origin}.copy`, undefined, 'saved-teams'),
      hasSelection: selectedIds.size > 0,
      origin,
      selectedCount: selectedIds.size,
      title: this.i18n.translate(
        `abilityFilters.sections.${origin}.title`,
        undefined,
        'saved-teams',
      ),
    };
  }

  private resolveAbilityFacets(origin: SavedTeamAbilityOrigin): SavedTeamAbilityFacet[] {
    const selectedIds = this.resolveSelectedAbilitySet(origin);

    return this.abilityFacetBasesByOrigin()[origin].map((facet) => ({
      ...facet,
      selected: selectedIds.has(facet.identity),
    }));
  }

  private buildAbilityFacetBases(origin: SavedTeamAbilityOrigin): SavedTeamAbilityFacetBase[] {
    const facets = new Map<string, SavedTeamAbilityFacetBase & { teamIds: Set<string> }>();

    for (const teamCard of this.savedTeamCards()) {
      const teamAbilityIdentities = new Set<string>();

      for (const slotIndex of this.resolveOriginSlotIndexes(origin)) {
        const slot = teamCard.slots[slotIndex];

        if (!slot) {
          continue;
        }

        for (const ability of slot.detail.builderAbilities) {
          const identity = this.buildAbilityIdentity(ability);
          const existingFacet = facets.get(identity);

          teamAbilityIdentities.add(identity);

          if (existingFacet) {
            continue;
          }

          facets.set(identity, {
            category: this.resolveAbilityCategory(ability.source),
            coverageMode: ability.coverageMode ?? 'explicit',
            identity,
            label: ability.label,
            metadataLabel: this.formatAbilityMetadata(ability),
            minTurns: ability.minTurns,
            slotTokens: [...ability.slotTokens],
            source: ability.source,
            teamCount: 0,
            teamIds: new Set<string>(),
          });
        }
      }

      for (const identity of teamAbilityIdentities) {
        facets.get(identity)?.teamIds.add(teamCard.team.id);
      }
    }

    return [...facets.values()]
      .map(({ teamIds, ...facet }) => ({
        ...facet,
        teamCount: teamIds.size,
      }))
      .sort((left, right) => {
        const categoryDifference =
          SAVED_TEAM_ABILITY_CATEGORIES.indexOf(left.category) -
          SAVED_TEAM_ABILITY_CATEGORIES.indexOf(right.category);

        return (
          categoryDifference ||
          left.label.localeCompare(right.label) ||
          left.metadataLabel.localeCompare(right.metadataLabel)
        );
      });
  }

  private buildTeamAbilityIdentitySets(
    slots: Array<CharacterDetailRecord | null>,
  ): Record<SavedTeamAbilityOrigin, Set<string>> {
    return {
      leader: new Set(
        this.resolveSlotAbilities(slots, 'leader').map((ability) =>
          this.buildAbilityIdentity(ability),
        ),
      ),
      crew: new Set(
        this.resolveSlotAbilities(slots, 'crew').map((ability) =>
          this.buildAbilityIdentity(ability),
        ),
      ),
    };
  }

  private resolveSlotAbilities(
    slots: Array<CharacterDetailRecord | null>,
    origin: SavedTeamAbilityOrigin,
  ): NormalizedBuilderAbility[] {
    return this.resolveOriginSlotIndexes(origin).flatMap(
      (slotIndex) => slots[slotIndex]?.detail.builderAbilities ?? [],
    );
  }

  private resolveOriginSlotIndexes(origin: SavedTeamAbilityOrigin): number[] {
    return origin === 'leader' ? [0, 1] : [2, 3, 4, 5];
  }

  private matchesSelectedAbilityFilters(teamCard: SavedTeamPreviewCard): boolean {
    return (
      this.matchesSelectedAbilityOrigin(teamCard, 'leader') &&
      this.matchesSelectedAbilityOrigin(teamCard, 'crew')
    );
  }

  private matchesSelectedAbilityOrigin(
    teamCard: SavedTeamPreviewCard,
    origin: SavedTeamAbilityOrigin,
  ): boolean {
    const selectedAbilityIds = this.resolveSelectedAbilityIds(origin);

    if (!selectedAbilityIds.length) {
      return true;
    }

    const teamAbilityIds = teamCard.abilityIdentitySets[origin];

    return selectedAbilityIds.every((abilityId) => teamAbilityIds.has(abilityId));
  }

  private setAbilityFilterSelection(
    origin: SavedTeamAbilityOrigin,
    identity: string,
    selected: boolean,
  ): void {
    const currentIds = this.resolveSelectedAbilityIds(origin);

    if (selected) {
      if (!currentIds.includes(identity)) {
        this.setSelectedAbilityIds(origin, [...currentIds, identity]);
      }
    } else {
      this.setSelectedAbilityIds(
        origin,
        currentIds.filter((abilityId) => abilityId !== identity),
      );
    }

    this.pruneSelection();
  }

  private resolveSelectedAbilityIds(origin: SavedTeamAbilityOrigin): string[] {
    return origin === 'leader' ? this.selectedLeaderAbilityIds() : this.selectedCrewAbilityIds();
  }

  private resolveSelectedAbilitySet(origin: SavedTeamAbilityOrigin): Set<string> {
    return origin === 'leader'
      ? this.selectedLeaderAbilityIdSet()
      : this.selectedCrewAbilityIdSet();
  }

  private setSelectedAbilityIds(origin: SavedTeamAbilityOrigin, abilityIds: string[]): void {
    const nextAbilityIds = [...new Set(abilityIds)];

    if (origin === 'leader') {
      this.selectedLeaderAbilityIds.set(nextAbilityIds);
      return;
    }

    this.selectedCrewAbilityIds.set(nextAbilityIds);
  }

  private buildAbilityIdentity(ability: NormalizedBuilderAbility): string {
    return [
      ability.key,
      ability.source,
      ability.minTurns ?? 'none',
      ability.slotTokens.join(','),
      ability.coverageMode ?? 'explicit',
    ].join('|');
  }

  private resolveAbilityCategory(source: AutoBuildAbilitySource): SavedTeamAbilityCategory {
    switch (source) {
      case 'captainAbility':
        return 'captain';
      case 'sailorAbilities':
        return 'crewmate';
      case 'potentialAbilities':
        return 'potential';
      case 'supportData':
        return 'support';
      case 'specialText':
      case 'superSpecialText':
      case 'superTandemData':
      case 'finalTapData':
      case 'rushSugoSpecialData':
        return 'special';
    }
  }

  private formatAbilityMetadata(ability: NormalizedBuilderAbility): string {
    const metadata = [
      ability.minTurns === null
        ? null
        : this.i18n.translate(
            'abilityFilters.metadata.turns',
            { count: ability.minTurns },
            'saved-teams',
          ),
      ability.slotTokens.length ? ability.slotTokens.join(' / ') : null,
      this.i18n.translate(`abilityFilters.sources.${ability.source}`, undefined, 'saved-teams'),
      ability.coverageMode === 'selectedDebuff'
        ? this.i18n.translate('abilityFilters.metadata.selectableDebuff', undefined, 'saved-teams')
        : null,
    ].filter((value): value is string => Boolean(value));

    return metadata.join(' - ');
  }

  private async importSavedTeams(file: File): Promise<void> {
    this.importFileName.set(file.name);

    await this.importSavedTeamsContent(await file.text(), file.name);
  }

  private async importSavedTeamsContent(rawContent: string, sourceLabel: string): Promise<void> {
    this.importing.set(true);
    this.importFeedback.set(null);

    try {
      const payload = parseSavedTeamsImportContent(rawContent);
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
          fileName: sourceLabel,
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

  private applySavedTeamsStorageRecoveryFeedback(): void {
    const summary = this.userState.savedTeamsStorageRecovery();

    if (!summary) {
      return;
    }

    const details: string[] = [];

    if (summary.reset) {
      details.push(this.i18n.translate('storageRecovery.reset', undefined, 'saved-teams'));
    }

    if (summary.repairedCount > 0) {
      details.push(
        this.i18n.translate(
          'storageRecovery.repaired',
          { count: summary.repairedCount },
          'saved-teams',
        ),
      );
    }

    if (summary.droppedCount > 0) {
      details.push(
        this.i18n.translate(
          'storageRecovery.dropped',
          { count: summary.droppedCount },
          'saved-teams',
        ),
      );
    }

    this.actionFeedback.set({
      details,
      title: this.i18n.translate('storageRecovery.title', undefined, 'saved-teams'),
      tone: 'warning',
    });
  }

  private resolveImportError(error: SavedTeamsImportError | Error | unknown): string {
    if (error && typeof error === 'object' && 'key' in error && typeof error.key === 'string') {
      return this.i18n.translate(error.key, undefined, 'saved-teams');
    }

    return this.i18n.translate('import.errors.generic', undefined, 'saved-teams');
  }
}

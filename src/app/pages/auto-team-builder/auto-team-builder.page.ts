import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { type ViewWillEnter } from '@ionic/angular';
import {
  heart,
  heartOutline,
  layersOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../../core/models/auto-team-builder.models';
import { type CharacterListItem, type DatasetManifest } from '../../core/models/optc.models';
import { AutoTeamBuilderService } from '../../core/services/auto-team-builder.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  type AutoTeamExportPayload,
  buildAutoTeamExportPayload,
  downloadAutoTeamExport,
} from './auto-team-builder-export.utils';

@Component({
  selector: 'app-auto-team-builder-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
  templateUrl: './auto-team-builder.page.html',
  styleUrl: './auto-team-builder.page.scss',
})
export class AutoTeamBuilderPage implements OnInit, ViewWillEnter {
  public readonly maxLockedCharacters = 5;
  public readonly maxLeaderCharacters = 2;
  private readonly manualSearchLimit = 24;
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly manualSearchTerm = signal('');
  public readonly manualCandidates = signal<CharacterListItem[]>([]);
  public readonly lockedCharacterIds = signal<number[]>([]);
  public readonly lockedCharacterRecords = signal<Record<number, CharacterListItem>>({});
  public readonly selectedLeaderIds = signal<number[]>([]);
  public readonly captainLeaderId = signal<number | null>(null);
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
  public readonly requireAllSpecialsSupportTeam = signal(false);
  public readonly favoritesOnly = signal(false);
  public readonly building = signal(false);
  public readonly result = signal<AutoBuildResult | null>(null);
  public readonly errorMessage = signal('');
  public readonly favoriteCharacterIds;

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly hasSelectedClasses = computed(() => this.selectedClasses().length > 0);
  public readonly hasSelectedTypes = computed(() => this.selectedTypes().length > 0);
  public readonly lockedCharacters = computed(() => {
    const lockedRecords = this.lockedCharacterRecords();

    return this.lockedCharacterIds()
      .map((characterId) => lockedRecords[characterId])
      .filter((character): character is CharacterListItem => Boolean(character));
  });
  public readonly hasLockedCharacters = computed(() => this.lockedCharacterIds().length > 0);
  public readonly lockedLimitReached = computed(
    () => this.lockedCharacterIds().length >= this.maxLockedCharacters,
  );
  public readonly selectedLeaderCharacters = computed(() => {
    const lockedRecords = this.lockedCharacterRecords();

    return this.selectedLeaderIds()
      .map((characterId) => lockedRecords[characterId])
      .filter((character): character is CharacterListItem => Boolean(character));
  });
  public readonly hasSelectedLeaders = computed(() => this.selectedLeaderIds().length > 0);
  public readonly hasDualLeaders = computed(() => this.selectedLeaderIds().length === 2);
  public readonly leaderLimitReached = computed(
    () => this.selectedLeaderIds().length >= this.maxLeaderCharacters,
  );
  public readonly effectiveCaptainLeaderId = computed(() => {
    const leaderIds = this.selectedLeaderIds();

    if (!leaderIds.length) {
      return null;
    }

    if (leaderIds.length === 1) {
      return leaderIds[0];
    }

    const currentCaptainLeaderId = this.captainLeaderId();

    return currentCaptainLeaderId && leaderIds.includes(currentCaptainLeaderId)
      ? currentCaptainLeaderId
      : leaderIds[0];
  });
  public readonly effectiveFriendLeaderId = computed(() => {
    const leaderIds = this.selectedLeaderIds();

    if (!leaderIds.length) {
      return null;
    }

    if (leaderIds.length === 1) {
      return leaderIds[0];
    }

    const captainLeaderId = this.effectiveCaptainLeaderId();

    return leaderIds.find((characterId) => characterId !== captainLeaderId) ?? null;
  });
  public readonly leaderRoleMap = computed<Record<number, string>>(() => {
    const leaderIds = this.selectedLeaderIds();

    if (!leaderIds.length) {
      return {};
    }

    if (leaderIds.length === 1) {
      return {
        [leaderIds[0]]: 'Captain / Friend Captain',
      };
    }

    const captainLeaderId = this.effectiveCaptainLeaderId();
    const friendLeaderId = this.effectiveFriendLeaderId();

    return {
      ...(captainLeaderId ? { [captainLeaderId]: 'Captain' } : {}),
      ...(friendLeaderId ? { [friendLeaderId]: 'Friend Captain' } : {}),
    };
  });
  public readonly clearAllButtonDisabled = computed(
    () =>
      this.building() ||
      (!this.hasLockedCharacters() && !this.result() && !this.errorMessage().length),
  );
  public readonly hasFavoriteCharacters = computed(() => this.favoriteCharacterIds().length > 0);
  public readonly buildBlockedByFavorites = computed(
    () => this.favoritesOnly() && !this.hasFavoriteCharacters(),
  );
  public readonly buildDisabled = computed(
    () =>
      !this.hasSelectedClasses() ||
      !this.hasSelectedTypes() ||
      this.building() ||
      this.buildBlockedByFavorites(),
  );
  public readonly hasStrictFilters = computed(
    () => this.requireAllSelectedTypesInTeam() || this.requireAllSelectedClassesPerCharacter(),
  );
  public readonly allClassesSelected = computed(
    () =>
      this.availableClasses().length > 0 &&
      this.selectedClasses().length === this.availableClasses().length,
  );
  public readonly allTypesSelected = computed(
    () => this.selectedTypes().length === this.availableTypes.length,
  );
  public readonly teamStructureLabel = computed(() =>
    this.hasDualLeaders()
      ? 'Captain + Friend captain + 4 subs'
      : 'Captain + 4 subs + same friend captain',
  );
  public readonly selectAllTypesButtonLabel = computed(() =>
    this.allTypesSelected() ? 'Unselect all types' : 'Select all types',
  );
  public readonly selectAllClassesButtonLabel = computed(() =>
    this.allClassesSelected() ? 'Unselect all classes' : 'Select all classes',
  );
  public readonly typeSupportLabel = computed(() =>
    this.requireAllSelectedTypesInTeam()
      ? 'Κάθε selected type πρέπει να εμφανιστεί τουλάχιστον μία φορά στο final team.'
      : 'Το auto-build προσπαθεί πρώτα να καλύψει όλα τα selected types και μετά κάνει fallback μόνο στο result panel αν χρειαστεί.',
  );
  public readonly classSupportLabel = computed(() =>
    this.requireAllSelectedClassesPerCharacter()
      ? 'Κάθε chosen unit πρέπει να έχει όλα τα selected classes.'
      : 'Το auto-build προσπαθεί πρώτα να καλύψει όλα τα selected classes στο team και μετά κάνει fallback χωρίς να πειράζει τα πάνω filters.',
  );
  public readonly specialSupportLabel = computed(() =>
    this.requireAllSpecialsSupportTeam()
      ? 'Κάθε slot πρέπει να έχει special που ενισχύει όλους τους τελικούς teammates. Το requirement δεν χαλαρώνει στο fallback.'
      : 'Προαιρετικό hard filter που κρατά μόνο units με special το οποίο καλύπτει όλο το final team.',
  );
  public readonly favoritesOnlySupportLabel = computed(() =>
    this.hasFavoriteCharacters()
      ? `Το candidate pool περιορίζεται στα ${this.favoriteCharacterIds().length} favorites.`
      : 'Δεν υπάρχουν ακόμα favorites. Πρόσθεσε favorites για να χρησιμοποιήσεις αυτό το mode.',
  );
  public readonly lockedSummaryLabel = computed(
    () =>
      `${this.lockedCharacterIds().length} / ${this.maxLockedCharacters} χειροκίνητα locked units`,
  );
  public readonly leaderSummaryLabel = computed(
    () => `${this.selectedLeaderIds().length} / ${this.maxLeaderCharacters} selected leaders`,
  );
  public readonly manualPickerSupportLabel = computed(() =>
    this.lockedLimitReached()
      ? 'Έχεις κλειδώσει το μέγιστο των 5 μοναδικών χαρακτήρων.'
      : 'Διάλεξε μέχρι 5 χαρακτήρες που θέλεις να μείνουν στο team και όρισε προαιρετικά έως 2 από αυτούς ως leaders.',
  );
  public readonly leaderPickerSupportLabel = computed(() => {
    if (!this.hasLockedCharacters()) {
      return 'Κλείδωσε πρώτα manual picks για να μπορείς να ορίσεις leaders.';
    }

    if (!this.hasSelectedLeaders()) {
      return 'Μπορείς να επιλέξεις έως 2 leaders από τα locked manual picks.';
    }

    if (!this.hasDualLeaders()) {
      return 'Με 1 leader, ο ίδιος χαρακτήρας θα χρησιμοποιηθεί και ως Captain και ως Friend Captain.';
    }

    return 'Με 2 leaders, όρισε ποιος είναι ο δικός σου Captain και ποιος ο Friend Captain.';
  });
  public readonly typeStrictToggleLabel = 'Require all selected types in team';
  public readonly classStrictToggleLabel = 'Require all selected classes on every character';
  public readonly specialSupportToggleLabel = 'Require every special to buff the full team';
  public readonly favoritesOnlyToggleLabel = 'Use only favorites';
  public readonly favoritesOnlyBlockedMessage =
    'Δεν υπάρχουν favorites. Πρόσθεσε χαρακτήρες στα favorites ή απενεργοποίησε το toggle.';
  public readonly selectedClassesLabel = computed(() =>
    this.formatSelectedValues(this.selectedClasses()),
  );
  public readonly selectedTypesLabel = computed(() =>
    this.formatSelectedTypes(this.selectedTypes()),
  );
  public readonly strictModeLabel = computed(() => {
    const strictModes: string[] = [];

    if (this.requireAllSelectedTypesInTeam()) {
      strictModes.push('type coverage');
    }

    if (this.requireAllSelectedClassesPerCharacter()) {
      strictModes.push('per-character classes');
    }

    return strictModes.length ? `Strict ${strictModes.join(' + ')}` : 'Flexible coverage';
  });
  public readonly builderLabel = computed(() =>
    this.hasSelectedTypes()
      ? `Generic ${this.selectedTypesLabel()} burst builder • ${this.strictModeLabel()}`
      : `Generic burst builder • ${this.strictModeLabel()}`,
  );
  public readonly titleLabel = computed(() =>
    this.hasSelectedClasses() && this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? `Διάλεξε classes και χτίσε αυτόματα ένα ${this.selectedTypesLabel()} mixed team με strict constraints.`
        : `Διάλεξε classes και types για να χτίσεις αυτόματα ένα ${this.selectedTypesLabel()} mixed team με smart fallback.`
      : this.hasStrictFilters()
        ? 'Διάλεξε types και classes για να χτίσεις αυτόματα ένα mixed team με strict constraints.'
        : 'Διάλεξε types και classes για να χτίσεις αυτόματα ένα mixed team με smart fallback.',
  );
  public readonly descriptionLabel = computed(() =>
    this.hasSelectedClasses() && this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? `Το v1 χρησιμοποιεί recent usable ${this.selectedTypesLabel()} units με readable captain, special, και sailor texts για να φτιάξει ένα high-damage team που τηρεί τα ενεργά strict filters.`
        : `Το v1 προσπαθεί πρώτα να καλύψει όλα τα selected classes και types με recent usable ${this.selectedTypesLabel()} units και κάνει relaxed fallback μόνο αν χρειαστεί.`
      : this.hasStrictFilters()
        ? 'Το v1 χρησιμοποιεί recent usable units με readable captain, special, και sailor texts για να φτιάξει ένα high-damage team που τηρεί τα ενεργά strict filters.'
        : 'Το v1 προσπαθεί πρώτα να καλύψει όλα τα selected classes και types και κάνει relaxed fallback μόνο αν χρειαστεί.',
  );
  public readonly buildButtonLabel = computed(() =>
    this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? this.favoritesOnly()
          ? `Build favorite-only strict ${this.selectedTypesLabel()} mixed team`
          : `Build strict ${this.selectedTypesLabel()} mixed team`
        : this.favoritesOnly()
          ? `Build favorite-only flexible ${this.selectedTypesLabel()} mixed team`
          : `Build flexible ${this.selectedTypesLabel()} mixed team`
      : 'Select types to build team',
  );
  public readonly loadingLabel = computed(() =>
    this.hasSelectedTypes()
      ? `Γίνεται scoring των πιο πρόσφατων usable ${this.selectedTypesLabel()} χαρακτήρων...`
      : 'Γίνεται scoring των πιο πρόσφατων usable χαρακτήρων...',
  );
  public readonly candidatePoolLabel = computed(() => {
    const isFavoritesOnly = this.result()?.input.favoritesOnly ?? this.favoritesOnly();
    const poolPrefix = isFavoritesOnly ? 'favorites-only ' : '';

    return this.hasSelectedTypes()
      ? `${poolPrefix}recent usable ${this.selectedTypesLabel()} records`
      : `${poolPrefix}recent usable records`;
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
  public readonly droppedResultTypes = computed(() => this.result()?.relaxation.droppedTypes ?? []);
  public readonly droppedResultClasses = computed(
    () => this.result()?.relaxation.droppedClasses ?? [],
  );
  public readonly selectedClassSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSelectedClassesPerCharacter()
        ? 'Strict class mode ενεργό: κάθε chosen unit πρέπει να έχει όλα τα selected classes.'
        : 'Flexible mode: δοκιμάζεται πλήρης class coverage και μετά relaxed fallback αν χρειαστεί.';
    }

    if (current.input.requireAllSelectedClassesPerCharacter) {
      return `${current.slots.length} / ${current.slots.length} slots match all selected classes`;
    }

    if (!current.input.selectedClasses.length) {
      return 'Το final fallback κράτησε ομάδα χωρίς class requirement.';
    }

    return `${current.coverage.coveredSelectedClasses.length} / ${current.input.selectedClasses.length} classes covered • ${current.coverage.selectedClassMatches} / 6 matching slots`;
  });
  public readonly selectedTypeSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSelectedTypesInTeam()
        ? 'Strict type mode ενεργό: κάθε selected type πρέπει να εμφανιστεί στο final team.'
        : 'Flexible mode: δοκιμάζεται πλήρης type coverage και μετά relaxed fallback αν χρειαστεί.';
    }

    if (!current.input.types.length) {
      return 'Δεν έμεινε type requirement στο final fallback.';
    }

    return current.input.requireAllSelectedTypesInTeam
      ? `${current.coverage.coveredSelectedTypes.length} / ${current.input.types.length} types covered • strict team coverage on`
      : `${current.coverage.coveredSelectedTypes.length} / ${current.input.types.length} types covered • ${current.coverage.selectedTypeMatches} / 6 matching slots`;
  });
  public readonly leaderCriteriaSourceLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return 'Captain ability';
    }

    return leaderCriteria.dualLeaderMode === 'intersection'
      ? 'Captain ability • dual leader intersection'
      : 'Captain ability';
  });
  public readonly leaderCriteriaLeadersLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    return leaderCriteria?.leaderNames.length ? leaderCriteria.leaderNames.join(' / ') : 'None';
  });
  public readonly leaderCriteriaClassesLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return 'No leader data';
    }

    return leaderCriteria.hasClassRestriction
      ? leaderCriteria.derivedAllowedClasses.join(' / ')
      : 'No leader class restriction';
  });
  public readonly leaderCriteriaTypesLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return 'No leader data';
    }

    return leaderCriteria.hasTypeRestriction
      ? leaderCriteria.derivedAllowedTypes.join(' / ')
      : 'No leader type restriction';
  });
  public readonly leaderCriteriaScopeSummaryLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return 'Το leader scope θα εμφανιστεί μετά το build.';
    }

    if (!leaderCriteria.hasClassRestriction && !leaderCriteria.hasTypeRestriction) {
      return 'Ο leader δεν επέβαλε class/type restriction στο final team.';
    }

    return `${leaderCriteria.matchingSlots} / ${leaderCriteria.totalSlots} slots match leader scope`;
  });
  public readonly specialSupportSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSpecialsSupportTeam()
        ? 'Special support mode ενεργό: κάθε special πρέπει να ενισχύει όλο το final team.'
        : 'Special support filter off.';
    }

    const { specialSupport } = current.coverage;

    return specialSupport.enabled
      ? `${specialSupport.matchingSlots} / ${specialSupport.totalSlots} slots buff the full team • hard filter on`
      : `${specialSupport.matchingSlots} / ${specialSupport.totalSlots} slots would pass teamwide special support`;
  });
  public readonly canDownloadTeamJson = computed(() => Boolean(this.result()));
  public readonly downloadTeamJsonLabel = 'Download team JSON';
  public readonly teamSlots = computed(
    () =>
      this.result()?.slots.map((slot) => ({
        ...slot,
        roleLabel: this.resolveRoleLabel(slot.role),
        snippet:
          slot.role === 'sub'
            ? slot.character.detail.specialText ||
              slot.character.detail.captainAbility ||
              'No detail snippet available.'
            : slot.character.detail.captainAbility ||
              slot.character.detail.specialText ||
              'No detail snippet available.',
      })) ?? [],
  );

  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly coverageIcon = shieldHalfOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
    private readonly userState: UserStateService,
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    this.summary.set(await this.repository.getDatasetManifest());
    await this.resetPageState();
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.resetPageState();
  }

  public async onClassChange(
    event: CustomEvent<{ value?: string[] | string | null }>,
  ): Promise<void> {
    this.selectedClasses.set(this.resolveSelectedClasses(event.detail.value));
    this.resetBuildState();
  }

  public async onTypeChange(
    event: CustomEvent<{ value?: AutoTeamBuilderType[] | AutoTeamBuilderType | null }>,
  ): Promise<void> {
    this.selectedTypes.set(this.resolveSelectedTypes(event.detail.value));
    this.resetBuildState();
  }

  public async onManualSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    const searchTerm = (event.detail.value ?? '').trim();
    this.manualSearchTerm.set(searchTerm);
    await this.refreshManualCandidates(searchTerm);
  }

  public lockCharacter(character: CharacterListItem): void {
    if (this.isLockedCharacter(character.id) || this.lockedLimitReached()) {
      return;
    }

    this.cacheCharacterRecord(character);
    this.lockedCharacterIds.set([...this.lockedCharacterIds(), character.id]);
    this.syncLeaderSelectionWithLockedCharacters();
    this.resetBuildState();
  }

  public removeLockedCharacter(characterId: number): void {
    this.lockedCharacterIds.set(
      this.lockedCharacterIds().filter(
        (selectedCharacterId) => selectedCharacterId !== characterId,
      ),
    );
    this.syncLeaderSelectionWithLockedCharacters();
    this.resetBuildState();
  }

  public clearAllManualSelections(): void {
    this.lockedCharacterIds.set([]);
    this.syncLeaderSelectionWithLockedCharacters();
    this.resetBuildState();
  }

  public isLockedCharacter(characterId: number): boolean {
    return this.lockedCharacterIds().includes(characterId);
  }

  public onRequireAllSelectedTypesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedTypesInTeam.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireAllSelectedClassesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedClassesPerCharacter.set(event.detail.checked);
    this.resetBuildState();
  }

  public onRequireAllSpecialsSupportToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSpecialsSupportTeam.set(event.detail.checked);
    this.resetBuildState();
  }

  public onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.favoritesOnly.set(event.detail.checked);
    this.resetBuildState();
  }

  public toggleLeaderCharacter(characterId: number): void {
    if (!this.isLockedCharacter(characterId)) {
      return;
    }

    if (this.isLeaderCharacter(characterId)) {
      this.selectedLeaderIds.set(
        this.selectedLeaderIds().filter((selectedLeaderId) => selectedLeaderId !== characterId),
      );
      this.syncLeaderSelectionWithLockedCharacters();
      this.resetBuildState();

      return;
    }

    if (this.leaderLimitReached()) {
      return;
    }

    this.selectedLeaderIds.set([...this.selectedLeaderIds(), characterId]);
    this.syncLeaderSelectionWithLockedCharacters();
    this.resetBuildState();
  }

  public isLeaderCharacter(characterId: number): boolean {
    return this.selectedLeaderIds().includes(characterId);
  }

  public isCaptainLeader(characterId: number): boolean {
    return this.effectiveCaptainLeaderId() === characterId;
  }

  public setCaptainLeader(characterId: number): void {
    if (!this.hasDualLeaders() || !this.isLeaderCharacter(characterId)) {
      return;
    }

    this.captainLeaderId.set(characterId);
    this.resetBuildState();
  }

  public swapLeaderAssignments(): void {
    if (!this.hasDualLeaders()) {
      return;
    }

    const friendLeaderId = this.effectiveFriendLeaderId();

    if (!friendLeaderId) {
      return;
    }

    this.captainLeaderId.set(friendLeaderId);
    this.resetBuildState();
  }

  public selectAllTypes(): void {
    if (this.allTypesSelected()) {
      this.selectedTypes.set([]);
      this.resetBuildState();

      return;
    }

    this.selectedTypes.set([...this.availableTypes]);
    this.resetBuildState();
  }

  public selectAllClasses(): void {
    if (this.allClassesSelected()) {
      this.selectedClasses.set([]);
      this.resetBuildState();

      return;
    }

    this.selectedClasses.set([...this.availableClasses()]);
    this.resetBuildState();
  }

  public removeSelectedType(type: AutoTeamBuilderType): void {
    this.selectedTypes.set(this.selectedTypes().filter((selectedType) => selectedType !== type));
    this.resetBuildState();
  }

  public removeSelectedClass(characterClass: string): void {
    this.selectedClasses.set(
      this.selectedClasses().filter((selectedClass) => selectedClass !== characterClass),
    );
    this.resetBuildState();
  }

  public async toggleFavorite(characterId: number): Promise<void> {
    await this.userState.toggleFavorite(characterId);
  }

  public isFavorite(characterId: number): boolean {
    return this.favoriteCharacterIds().includes(characterId);
  }

  public async buildTeam(): Promise<void> {
    if (this.buildDisabled()) {
      return;
    }

    this.building.set(true);
    this.result.set(null);
    this.errorMessage.set('');

    try {
      const nextResult = await this.autoTeamBuilder.buildTeam(
        this.selectedClasses(),
        this.selectedTypes(),
        {
          requireAllSelectedTypesInTeam: this.requireAllSelectedTypesInTeam(),
          requireAllSelectedClassesPerCharacter: this.requireAllSelectedClassesPerCharacter(),
          requireAllSpecialsSupportTeam: this.requireAllSpecialsSupportTeam(),
          favoritesOnly: this.favoritesOnly(),
          favoriteCharacterIds: this.favoriteCharacterIds(),
          lockedCharacterIds: this.lockedCharacterIds(),
          captainCharacterId: this.effectiveCaptainLeaderId(),
          friendCaptainCharacterId: this.effectiveFriendLeaderId(),
        },
      );

      if (!nextResult) {
        this.errorMessage.set(this.resolveBuildFailureMessage());
      } else {
        nextResult.slots.forEach((slot) => this.cacheCharacterRecord(slot.character));
      }

      this.result.set(nextResult);
    } catch (error) {
      console.error(error);
      this.errorMessage.set('Κάτι πήγε στραβά όσο γινόταν το auto build.');
    } finally {
      this.building.set(false);
    }
  }

  public buildTeamExportPayload(exportedAt = new Date().toISOString()): AutoTeamExportPayload | null {
    const current = this.result();

    if (!current) {
      return null;
    }

    return buildAutoTeamExportPayload(
      current,
      this.favoriteCharacterIds(),
      this.effectiveCaptainLeaderId(),
      this.effectiveFriendLeaderId(),
      exportedAt,
    );
  }

  public downloadTeamJson(): void {
    downloadAutoTeamExport(this.buildTeamExportPayload());
  }

  private resetBuildState(): void {
    this.result.set(null);
    this.errorMessage.set('');
  }

  private async resetPageState(): Promise<void> {
    this.selectedTypes.set([]);
    this.selectedClasses.set([]);
    this.manualSearchTerm.set('');
    this.lockedCharacterIds.set([]);
    this.selectedLeaderIds.set([]);
    this.captainLeaderId.set(null);
    this.requireAllSelectedTypesInTeam.set(false);
    this.requireAllSelectedClassesPerCharacter.set(false);
    this.requireAllSpecialsSupportTeam.set(false);
    this.favoritesOnly.set(false);
    this.resetBuildState();
    await this.refreshManualCandidates('');
  }

  private resolveBuildFailureMessage(): string {
    if (this.buildBlockedByFavorites()) {
      return this.favoritesOnlyBlockedMessage;
    }

    const lockedCount = this.lockedCharacterIds().length;
    const leaderRequirementLabel = this.resolveLeaderFailureLabel();

    if (lockedCount > this.maxLockedCharacters) {
      return `Μπορείς να κλειδώσεις μέχρι ${this.maxLockedCharacters} χαρακτήρες. Πάτα Clear All και επίλεξε ξανά.`;
    }

    const activeRequirements: string[] = [];
    const favoritesScope = this.favoritesOnly() ? ' μέσα στα favorites σου' : '';

    if (this.requireAllSelectedTypesInTeam()) {
      activeRequirements.push('τουλάχιστον έναν χαρακτήρα από κάθε selected type');
    }

    if (this.requireAllSelectedClassesPerCharacter()) {
      activeRequirements.push('χαρακτήρες που έχουν όλα τα selected classes');
    }

    if (this.requireAllSpecialsSupportTeam()) {
      activeRequirements.push('specials που ενισχύουν όλο το final team');
    }

    if (lockedCount) {
      if (this.hasStrictFilters()) {
        return `Δεν βρέθηκε ομάδα που να κρατάει τους ${lockedCount} manual χαρακτήρες${leaderRequirementLabel} και να ικανοποιεί τα strict constraints. Το fallback είναι απενεργοποιημένο όσο strict mode είναι ενεργό.`;
      }

      if (this.favoritesOnly()) {
        return `Δοκιμάστηκαν όλα τα flexible combinations για usable ${this.selectedTypesLabel()} team που να κρατάει τους ${lockedCount} manual χαρακτήρες${leaderRequirementLabel} στα favorites σου, αλλά δεν βρέθηκε λύση. Αφαίρεσε κάποια manual picks ή πάτα Clear All.`;
      }

      if (activeRequirements.length) {
        return `Δεν βρέθηκαν αρκετοί usable ${this.selectedTypesLabel()} χαρακτήρες για ${activeRequirements.join(' και ')} ενώ κρατάμε ${lockedCount} manual picks${leaderRequirementLabel}. Το flexible fallback εξαντλήθηκε χωρίς valid team.`;
      }

      return `Δοκιμάστηκαν όλα τα flexible combinations, αλλά δεν βρέθηκε usable ${this.selectedTypesLabel()} team που να κρατάει τους ${lockedCount} manual χαρακτήρες${leaderRequirementLabel}. Αφαίρεσε κάποια manual picks ή πάτα Clear All.`;
    }

    if (!activeRequirements.length && this.favoritesOnly()) {
      if (this.hasStrictFilters()) {
        return `Δεν βρέθηκε ομάδα μέσα στα favorites σου που να ικανοποιεί τα strict constraints. Το fallback είναι απενεργοποιημένο σε strict mode.`;
      }

      return `Δοκιμάστηκαν όλα τα flexible combinations, αλλά δεν βρέθηκε usable ${this.selectedTypesLabel()} team μέσα στα favorites σου.`;
    }

    if (!activeRequirements.length) {
      if (this.hasStrictFilters()) {
        return `Δεν βρέθηκε usable ${this.selectedTypesLabel()} team που να ικανοποιεί τα strict constraints. Το fallback είναι απενεργοποιημένο σε strict mode.`;
      }

      return `Δοκιμάστηκαν όλα τα flexible combinations, αλλά δεν βρέθηκε usable ${this.selectedTypesLabel()} team που να ταιριάζει στα current filters.`;
    }

    if (this.hasStrictFilters()) {
      return `Δεν βρέθηκαν αρκετοί usable ${this.selectedTypesLabel()} χαρακτήρες${favoritesScope} για ${activeRequirements.join(' και ')}. Το fallback είναι απενεργοποιημένο σε strict mode.`;
    }

    return `Δεν βρέθηκαν αρκετοί usable ${this.selectedTypesLabel()} χαρακτήρες${favoritesScope} για ${activeRequirements.join(' και ')}. Το flexible fallback εξαντλήθηκε χωρίς valid team.`;
  }

  private async refreshManualCandidates(searchTerm: string): Promise<void> {
    const candidates = await this.repository.searchCharacters({
      searchTerm,
      typeFilter: '',
      classFilter: '',
      limit: this.manualSearchLimit,
      offset: 0,
    });

    this.manualCandidates.set(candidates);
    candidates.forEach((candidate) => this.cacheCharacterRecord(candidate));
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

  private syncLeaderSelectionWithLockedCharacters(): void {
    const lockedCharacterIdSet = new Set(this.lockedCharacterIds());
    const nextLeaderIds = this.selectedLeaderIds()
      .filter((characterId) => lockedCharacterIdSet.has(characterId))
      .slice(0, this.maxLeaderCharacters);

    this.selectedLeaderIds.set(nextLeaderIds);

    if (!nextLeaderIds.length) {
      this.captainLeaderId.set(null);

      return;
    }

    if (nextLeaderIds.length === 1) {
      this.captainLeaderId.set(nextLeaderIds[0]);

      return;
    }

    const currentCaptainLeaderId = this.captainLeaderId();

    this.captainLeaderId.set(
      currentCaptainLeaderId && nextLeaderIds.includes(currentCaptainLeaderId)
        ? currentCaptainLeaderId
        : nextLeaderIds[0],
    );
  }

  private resolveLeaderFailureLabel(): string {
    if (this.hasDualLeaders()) {
      return ' με τους 2 selected leaders στα captain slots και μόνο units που ενισχύουν και οι 2 leaders';
    }

    if (this.hasSelectedLeaders()) {
      return ' με τον selected leader και στα 2 captain slots και μόνο units που ενισχύει ο leader';
    }

    return '';
  }

  private resolveRoleLabel(role: 'captain' | 'friendCaptain' | 'sub'): string {
    switch (role) {
      case 'captain':
        return 'Captain';
      case 'friendCaptain':
        return 'Friend Captain';
      default:
        return 'Sub';
    }
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

  private formatSelectedTypes(types: AutoTeamBuilderType[]): string {
    return this.formatSelectedValues(types);
  }

  private formatResultValues(values: readonly string[]): string {
    return values.length ? this.formatSelectedValues(values) : 'None';
  }

  private formatSelectedValues(values: readonly string[]): string {
    return values.join(' / ');
  }
}

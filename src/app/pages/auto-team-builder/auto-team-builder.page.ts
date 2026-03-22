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
import {
  heart,
  heartOutline,
  layersOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  AUTO_TEAM_BUILDER_DEFAULT_TYPE,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../../core/models/auto-team-builder.models';
import { type CharacterListItem, type DatasetManifest } from '../../core/models/optc.models';
import { AutoTeamBuilderService } from '../../core/services/auto-team-builder.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';

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
export class AutoTeamBuilderPage implements OnInit {
  public readonly maxLockedCharacters = 5;
  private readonly manualSearchLimit = 24;
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([AUTO_TEAM_BUILDER_DEFAULT_TYPE]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly manualSearchTerm = signal('');
  public readonly manualCandidates = signal<CharacterListItem[]>([]);
  public readonly lockedCharacterIds = signal<number[]>([]);
  public readonly lockedCharacterRecords = signal<Record<number, CharacterListItem>>({});
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
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
  public readonly selectAllTypesButtonLabel = computed(() =>
    this.allTypesSelected() ? 'Unselect all types' : 'Select all types',
  );
  public readonly selectAllClassesButtonLabel = computed(() =>
    this.allClassesSelected() ? 'Unselect all classes' : 'Select all classes',
  );
  public readonly typeSupportLabel = computed(() =>
    this.requireAllSelectedTypesInTeam()
      ? 'Κάθε selected type πρέπει να εμφανιστεί τουλάχιστον μία φορά στο final team.'
      : 'Τα selected types μένουν candidate-pool filter και soft preference, χωρίς υποχρεωτική πλήρη κάλυψη.',
  );
  public readonly classSupportLabel = computed(() =>
    this.requireAllSelectedClassesPerCharacter()
      ? 'Κάθε chosen unit πρέπει να έχει όλα τα selected classes.'
      : 'Τα selected classes μένουν soft preference μόνο και δεν απαιτούνται σε κάθε χαρακτήρα.',
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
  public readonly manualPickerSupportLabel = computed(() =>
    this.lockedLimitReached()
      ? 'Έχεις κλειδώσει το μέγιστο των 5 μοναδικών χαρακτήρων.'
      : 'Διάλεξε χαρακτήρες που θέλεις να μείνουν σταθεροί και το auto-build θα γεμίσει τα υπόλοιπα slots.',
  );
  public readonly typeStrictToggleLabel = 'Require all selected types in team';
  public readonly classStrictToggleLabel = 'Require all selected classes on every character';
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
        : `Διάλεξε classes και types για να χτίσεις αυτόματα ένα flexible ${this.selectedTypesLabel()} mixed team.`
      : this.hasStrictFilters()
        ? 'Διάλεξε types και classes για να χτίσεις αυτόματα ένα mixed team με strict constraints.'
        : 'Διάλεξε types και classes για να χτίσεις αυτόματα ένα flexible mixed team.',
  );
  public readonly descriptionLabel = computed(() =>
    this.hasSelectedClasses() && this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? `Το v1 χρησιμοποιεί recent usable ${this.selectedTypesLabel()} units με readable captain, special, και sailor texts για να φτιάξει ένα high-damage team που τηρεί τα ενεργά strict filters.`
        : `Το v1 χρησιμοποιεί recent usable ${this.selectedTypesLabel()} units με readable captain, special, και sailor texts για να φτιάξει ένα generic high-damage team με soft preference στα selected classes και types.`
      : this.hasStrictFilters()
        ? 'Το v1 χρησιμοποιεί recent usable units με readable captain, special, και sailor texts για να φτιάξει ένα high-damage team που τηρεί τα ενεργά strict filters.'
        : 'Το v1 χρησιμοποιεί recent usable units με readable captain, special, και sailor texts για να φτιάξει ένα generic high-damage team με soft preference στα selected classes και types.',
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
  public readonly selectedClassSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSelectedClassesPerCharacter()
        ? 'Strict class mode ενεργό: κάθε chosen unit πρέπει να έχει όλα τα selected classes.'
        : 'Τα selected classes μένουν soft preference μόνο όταν το strict class toggle είναι off.';
    }

    if (current.input.requireAllSelectedClassesPerCharacter) {
      return `${current.slots.length} / ${current.slots.length} slots match all selected classes`;
    }

    return `${current.coverage.coveredSelectedClasses.length} / ${current.input.selectedClasses.length} classes covered • ${current.coverage.selectedClassMatches} / 6 matching slots`;
  });
  public readonly selectedTypeSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSelectedTypesInTeam()
        ? 'Strict type mode ενεργό: κάθε selected type πρέπει να εμφανιστεί στο final team.'
        : 'Τα selected types παραμένουν candidate filter, αλλά η πλήρης κάλυψη είναι προαιρετική.';
    }

    return current.input.requireAllSelectedTypesInTeam
      ? `${current.coverage.coveredSelectedTypes.length} / ${current.input.types.length} types covered • strict team coverage on`
      : `${current.coverage.coveredSelectedTypes.length} / ${current.input.types.length} types covered • ${current.coverage.selectedTypeMatches} / 6 matching slots`;
  });
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
    await this.refreshManualCandidates('');
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
    this.resetBuildState();
  }

  public removeLockedCharacter(characterId: number): void {
    this.lockedCharacterIds.set(
      this.lockedCharacterIds().filter(
        (selectedCharacterId) => selectedCharacterId !== characterId,
      ),
    );
    this.resetBuildState();
  }

  public clearAllManualSelections(): void {
    this.lockedCharacterIds.set([]);
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

  public onFavoritesOnlyToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.favoritesOnly.set(event.detail.checked);
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
          favoritesOnly: this.favoritesOnly(),
          favoriteCharacterIds: this.favoriteCharacterIds(),
          lockedCharacterIds: this.lockedCharacterIds(),
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

  private resetBuildState(): void {
    this.result.set(null);
    this.errorMessage.set('');
  }

  private resolveBuildFailureMessage(): string {
    if (this.buildBlockedByFavorites()) {
      return this.favoritesOnlyBlockedMessage;
    }

    const lockedCount = this.lockedCharacterIds().length;

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

    if (lockedCount) {
      if (this.favoritesOnly()) {
        return `Δεν βρέθηκε usable ${this.selectedTypesLabel()} team που να κρατάει τους ${lockedCount} manual χαρακτήρες στα favorites σου. Αφαίρεσε κάποια manual picks ή πάτα Clear All.`;
      }

      if (activeRequirements.length) {
        return `Δεν βρέθηκαν αρκετοί usable ${this.selectedTypesLabel()} χαρακτήρες για ${activeRequirements.join(' και ')} ενώ κρατάμε ${lockedCount} manual picks. Αφαίρεσε κάποια manual picks ή πάτα Clear All.`;
      }

      return `Δεν βρέθηκε usable ${this.selectedTypesLabel()} team που να κρατάει τους ${lockedCount} manual χαρακτήρες. Αφαίρεσε κάποια manual picks ή πάτα Clear All.`;
    }

    if (!activeRequirements.length && this.favoritesOnly()) {
      return `Δεν βρέθηκε usable ${this.selectedTypesLabel()} team μέσα στα favorites σου.`;
    }

    if (!activeRequirements.length) {
      return `Δεν βρέθηκε usable ${this.selectedTypesLabel()} team που να ταιριάζει στα current filters.`;
    }

    return `Δεν βρέθηκαν αρκετοί usable ${this.selectedTypesLabel()} χαρακτήρες${favoritesScope} για ${activeRequirements.join(' και ')}.`;
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

  private formatSelectedValues(values: readonly string[]): string {
    return values.join(' / ');
  }
}

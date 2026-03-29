import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
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
  alertCircleOutline,
  checkmarkCircleOutline,
  heart,
  heartOutline,
  layersOutline,
  optionsOutline,
  shieldHalfOutline,
  sparklesOutline,
} from 'ionicons/icons';

import {
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
} from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCoverageMode,
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterDetailRecord,
  type CharacterListItem,
  type DatasetManifest,
} from '../../core/models/optc.models';
import {
  AutoTeamBuilderService,
  type AutoTeamBuildExecutionOptions,
} from '../../core/services/auto-team-builder.service';
import {
  matchesAnyAbilityRequirement,
  builderAbilitiesMatchAllRequirements,
} from '../../core/services/auto-team-builder-ability-match.utils';
import { isAutoTeamBuildCancelledError } from '../../core/services/auto-team-builder.engine';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import {
  type AutoTeamSelectionImportResult,
  type AutoTeamExportPayload,
  type AutoTeamSelectionExportPayload,
  buildAutoTeamExportPayload,
  buildAutoTeamSelectionExportPayload,
  downloadAutoTeamExport,
  downloadAutoTeamSelectionExport,
  parseAutoTeamSelectionImportPayload,
  sanitizeAutoTeamSelectionImportPayload,
} from './auto-team-builder-export.utils';

type LoadingProgressRowTone = 'primary' | 'secondary' | 'fallback';

interface LoadingProgressRow {
  key: 'message' | 'attempt' | 'candidatePool' | 'droppedTypes' | 'droppedClasses';
  text: string;
  displayText: string;
  visible: boolean;
  tone: LoadingProgressRowTone;
}

interface AbilityRequirementDraft {
  draftId: string;
  abilityKey: string;
  minTurns: number | null;
  slotTokens: string[];
  requiredCharacterCount: number | null;
}

interface CharacterAbilityChipView {
  key: string;
  label: string;
  highlighted: boolean;
  empty?: boolean;
}

interface ManualCharacterCardView {
  character: CharacterDetailRecord;
  subtitle: string;
  favoriteLabel: string | null;
  abilityChips: CharacterAbilityChipView[];
}

type TeamSlotViewModel = AutoBuildResult['slots'][number] & {
  roleLabel: string;
  snippet: string;
  abilityChips: CharacterAbilityChipView[];
};

interface AppliedManualCharacterFilters {
  selectedTypes: AutoTeamBuilderType[];
  selectedClasses: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
}

type PresetImportFeedbackTone = 'success' | 'warning' | 'error';

interface PresetImportFeedback {
  tone: PresetImportFeedbackTone;
  title: string;
  details: string[];
}

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
export class AutoTeamBuilderPage implements OnInit, OnDestroy, ViewWillEnter {
  public readonly maxLockedCharacters = 5;
  public readonly maxLeaderCharacters = 2;
  private readonly manualSearchLimit = 24;
  private buildAbortController: AbortController | null = null;
  private appliedManualCandidateSearchRequestId = 0;
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly requiredAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly manualSearchTerm = signal('');
  public readonly manualCandidates = signal<CharacterDetailRecord[]>([]);
  public readonly manualCandidatesLoading = signal(false);
  public readonly lockedCharacterIds = signal<number[]>([]);
  public readonly lockedCharacterRecords = signal<Record<number, CharacterListItem>>({});
  public readonly selectedLeaderIds = signal<number[]>([]);
  public readonly captainLeaderId = signal<number | null>(null);
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
  public readonly requireAllSpecialsSupportTeam = signal(false);
  public readonly favoritesOnly = signal(false);
  public readonly building = signal(false);
  public readonly buildProgress = signal<AutoBuildProgressSnapshot | null>(null);
  public readonly result = signal<AutoBuildResult | null>(null);
  public readonly errorMessage = signal('');
  public readonly favoriteCharacterIds;
  public readonly presetImportFeedback = signal<PresetImportFeedback | null>(null);

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly manualCandidateFilters = computed<AppliedManualCharacterFilters>(() => ({
    selectedTypes: [...this.selectedTypes()],
    selectedClasses: [...this.selectedClasses()],
    requiredAbilities: this.serializeAbilityRequirementDrafts(this.requiredAbilityDrafts(), true),
  }));
  public readonly availableAbilityCatalogItems = computed(
    () => this.abilityCatalog()?.abilities ?? [],
  );
  public readonly abilityCatalogMap = computed(
    () => new Map(this.availableAbilityCatalogItems().map((item) => [item.key, item] as const)),
  );
  public readonly pageRequiredAbilities = computed(() => this.serializeRequiredAbilities());
  public readonly hasSelectedClasses = computed(() => this.selectedClasses().length > 0);
  public readonly hasSelectedTypes = computed(() => this.selectedTypes().length > 0);
  public readonly hasRequiredAbilities = computed(() => this.pageRequiredAbilities().length > 0);
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
      : 'Διάλεξε μέχρι 5 χαρακτήρες που θέλεις να μείνουν στο team. Τα manual picks ακολουθούν αυτόματα τα selected Types, Classes και Ability requirements από πάνω.',
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
  public readonly manualFilterSummaryLabel = computed(() => {
    const filters = this.manualCandidateFilters();
    const parts: string[] = [];

    if (filters.selectedTypes.length) {
      parts.push(`types: ${filters.selectedTypes.join(' / ')}`);
    }

    if (filters.selectedClasses.length) {
      parts.push(`classes: ${filters.selectedClasses.join(' / ')}`);
    }

    if (filters.requiredAbilities.length) {
      parts.push(
        `abilities: ${filters.requiredAbilities
          .map((requirement) => this.formatAbilityRequirement(requirement))
          .join(' • ')}`,
      );
    }

    return parts.length
      ? `Τα manual picks ακολουθούν live τα πάνω filters: ${parts.join(' • ')}`
      : 'Τα manual picks δείχνουν το default pool μέχρι να διαλέξεις Types, Classes ή Ability requirements.';
  });
  public readonly manualCandidatesSummaryLabel = computed(() => {
    if (this.manualCandidatesLoading()) {
      return 'Γίνεται φόρτωση manual candidates...';
    }

    return `${this.manualCandidates().length} manual candidates`;
  });
  public readonly manualFilterAppliedAbilityLabels = computed(() =>
    this.manualCandidateFilters().requiredAbilities.map((requirement) =>
      this.formatAbilityRequirement(requirement),
    ),
  );
  public readonly hasAppliedManualFilters = computed(
    () =>
      this.manualCandidateFilters().selectedTypes.length > 0 ||
      this.manualCandidateFilters().selectedClasses.length > 0 ||
      this.manualCandidateFilters().requiredAbilities.length > 0,
  );
  public readonly manualCandidatePoolSupportLabel = computed(() =>
    this.hasAppliedManualFilters()
      ? 'Live αποτέλεσμα από τα current page filters και το search.'
      : 'Top characters από το default pool.',
  );
  public readonly manualCandidateCards = computed(() =>
    this.buildManualCharacterCards(
      this.manualCandidates(),
      this.manualCandidateFilters().requiredAbilities,
    ),
  );
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
  public readonly loadingLabel = computed(
    () =>
      this.buildProgress()?.message ??
      (this.hasSelectedTypes()
        ? `Γίνεται scoring των πιο πρόσφατων usable ${this.selectedTypesLabel()} χαρακτήρων...`
        : 'Γίνεται scoring των πιο πρόσφατων usable χαρακτήρων...'),
  );
  public readonly buildAttemptProgressLabel = computed(() => {
    const progress = this.buildProgress();

    if (!progress || !progress.totalAttempts) {
      return '';
    }

    const currentAttempt =
      progress.stage === 'completed'
        ? progress.completedAttempts
        : Math.min(progress.completedAttempts + 1, progress.totalAttempts);

    return `Attempt ${currentAttempt} / ${progress.totalAttempts}`;
  });
  public readonly buildCandidateProgressLabel = computed(() => {
    const progress = this.buildProgress();

    return progress?.candidateCount
      ? `${progress.candidateCount} candidates στο current search pool`
      : '';
  });
  public readonly buildDroppedTypesLabel = computed(() => {
    const droppedTypes = this.buildProgress()?.currentDroppedTypes ?? [];

    return droppedTypes.length ? `Ignoring types: ${droppedTypes.join(' / ')}` : '';
  });
  public readonly buildDroppedClassesLabel = computed(() => {
    const droppedClasses = this.buildProgress()?.currentDroppedClasses ?? [];

    return droppedClasses.length ? `Ignoring classes: ${droppedClasses.join(' / ')}` : '';
  });
  public readonly loadingProgressRows = computed<LoadingProgressRow[]>(() => {
    const rows: Array<Pick<LoadingProgressRow, 'key' | 'text' | 'tone'>> = [
      {
        key: 'message',
        text: this.loadingLabel(),
        tone: 'primary',
      },
      {
        key: 'attempt',
        text: this.buildAttemptProgressLabel(),
        tone: 'secondary',
      },
      {
        key: 'candidatePool',
        text: this.buildCandidateProgressLabel(),
        tone: 'secondary',
      },
      {
        key: 'droppedTypes',
        text: this.buildDroppedTypesLabel(),
        tone: 'fallback',
      },
      {
        key: 'droppedClasses',
        text: this.buildDroppedClassesLabel(),
        tone: 'fallback',
      },
    ];

    return rows.map((row) => ({
      ...row,
      displayText: row.text || '\u00A0',
      visible: row.text.length > 0,
    }));
  });
  public readonly cancelBuildButtonLabel = 'Cancel build';
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
  public readonly requiredAbilitySummaryLabel = computed(() => {
    const requirements = this.serializeRequiredAbilities();
    const current = this.result();

    if (!requirements.length) {
      return 'Δεν έχουν οριστεί extra ability requirements.';
    }

    if (!current) {
      return `${requirements.length} selected ability requirements πριν το build.`;
    }

    const matchedCount = current.coverage.abilityRequirements.matched.length;
    return `${matchedCount} / ${requirements.length} selected ability requirements covered`;
  });
  public readonly matchedRequiredAbilityLabels = computed(() =>
    (this.result()?.coverage.abilityRequirements.matched ?? []).map((requirement) =>
      this.formatAbilityRequirement(requirement),
    ),
  );
  public readonly missingRequiredAbilityLabels = computed(() =>
    (this.result()?.coverage.abilityRequirements.missing ?? []).map((requirement) =>
      this.formatAbilityRequirement(requirement),
    ),
  );
  public readonly canDownloadSelectionJson = computed(
    () =>
      !this.building() &&
      (this.hasSelectedTypes() ||
        this.hasSelectedClasses() ||
        this.hasRequiredAbilities() ||
        this.requireAllSelectedTypesInTeam() ||
        this.requireAllSelectedClassesPerCharacter() ||
        this.requireAllSpecialsSupportTeam() ||
        this.favoritesOnly() ||
        this.hasLockedCharacters() ||
        this.hasSelectedLeaders()),
  );
  public readonly canDownloadAbilityCatalogJson = computed(
    () => !this.building() && this.availableAbilityCatalogItems().length > 0,
  );
  public readonly downloadAbilityCatalogJsonLabel = 'Download abilities JSON';
  public readonly downloadSelectionJsonLabel = 'Download preset JSON';
  public readonly canDownloadTeamJson = computed(() => Boolean(this.result()));
  public readonly downloadTeamJsonLabel = 'Download team JSON';
  public readonly teamSlots = computed<TeamSlotViewModel[]>(() => {
    const currentResult = this.result();
    const requirements = this.pageRequiredAbilities();

    return (
      currentResult?.slots.map((slot) => ({
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
        abilityChips: this.buildAbilityChipViews(
          slot.character.detail.builderAbilities,
          requirements,
        ),
      })) ?? []
    );
  });

  public readonly sparklesIcon = sparklesOutline;
  public readonly layersIcon = layersOutline;
  public readonly coverageIcon = shieldHalfOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public readonly manualFilterIcon = optionsOutline;
  public readonly presetImportSuccessIcon = checkmarkCircleOutline;
  public readonly presetImportErrorIcon = alertCircleOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
    private readonly userState: UserStateService,
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    const [summary, abilityCatalog] = await Promise.all([
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
    ]);
    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);
    await this.resetPageState();
  }

  public ngOnDestroy(): void {
    this.cancelBuild();
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.resetPageState();
  }

  public async onClassChange(
    event: CustomEvent<{ value?: string[] | string | null }>,
  ): Promise<void> {
    this.selectedClasses.set(this.resolveSelectedClasses(event.detail.value));
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async onTypeChange(
    event: CustomEvent<{ value?: AutoTeamBuilderType[] | AutoTeamBuilderType | null }>,
  ): Promise<void> {
    this.selectedTypes.set(this.resolveSelectedTypes(event.detail.value));
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async onManualSearchChange(event: CustomEvent<{ value?: string | null }>): Promise<void> {
    this.manualSearchTerm.set((event.detail.value ?? '').trim());
    await this.refreshAppliedManualCandidates();
  }

  public openPresetFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onPresetFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = '';

    if (!file) {
      return;
    }

    await this.importSelectionPreset(file);
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

  public async addRequiredAbility(): Promise<void> {
    const [firstItem] = this.availableAbilityCatalogItems();
    this.requiredAbilityDrafts.set([
      ...this.requiredAbilityDrafts(),
      this.createAbilityRequirementDraft(firstItem),
    ]);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async removeRequiredAbility(draftId: string): Promise<void> {
    this.requiredAbilityDrafts.set(
      this.requiredAbilityDrafts().filter((draft) => draft.draftId !== draftId),
    );
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async clearRequiredAbilities(): Promise<void> {
    this.requiredAbilityDrafts.set([]);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async onRequiredAbilityKeyChange(
    draftId: string,
    event: CustomEvent<{ value?: string | null }>,
  ): Promise<void> {
    const abilityKey = (event.detail.value ?? '').trim();
    const catalogItem = abilityKey ? this.abilityCatalogMap().get(abilityKey) : null;

    this.updateRequiredAbilityDraft(draftId, (draft) => ({
      ...draft,
      abilityKey,
      minTurns: catalogItem?.supportsTurns ? (draft.minTurns ?? 1) : null,
      slotTokens:
        catalogItem?.supportsSlotTokens && draft.slotTokens.length
          ? draft.slotTokens.filter((token) => catalogItem.availableSlotTokens.includes(token))
          : [],
    }));
    await this.refreshAppliedManualCandidates();
  }

  public async onRequiredAbilityTurnsChange(draftId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const nextValue = input?.value?.trim() ?? '';
    const minTurns = /^\d+$/.test(nextValue) && Number(nextValue) > 0 ? Number(nextValue) : null;

    this.updateRequiredAbilityDraft(draftId, (draft) => ({
      ...draft,
      minTurns,
    }));
    await this.refreshAppliedManualCandidates();
  }

  public async onRequiredAbilityCountChange(draftId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const nextValue = input?.value?.trim() ?? '';
    const requiredCharacterCount =
      /^\d+$/.test(nextValue) && Number(nextValue) > 0 ? Number(nextValue) : null;

    this.updateRequiredAbilityDraft(draftId, (draft) => ({
      ...draft,
      requiredCharacterCount,
    }));
    await this.refreshAppliedManualCandidates();
  }

  public async onRequiredAbilitySlotTokensChange(
    draftId: string,
    event: CustomEvent<{ value?: string[] | string | null }>,
  ): Promise<void> {
    const nextValues = Array.isArray(event.detail.value)
      ? event.detail.value
      : event.detail.value
        ? [event.detail.value]
        : [];
    const slotTokens = [...new Set(nextValues.map((token) => token.trim().toUpperCase()))].filter(
      (token) => token.length,
    );

    this.updateRequiredAbilityDraft(draftId, (draft) => ({
      ...draft,
      slotTokens,
    }));
    await this.refreshAppliedManualCandidates();
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

  public async selectAllTypes(): Promise<void> {
    if (this.allTypesSelected()) {
      this.selectedTypes.set([]);
      this.resetBuildState();
      await this.refreshAppliedManualCandidates();

      return;
    }

    this.selectedTypes.set([...this.availableTypes]);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async selectAllClasses(): Promise<void> {
    if (this.allClassesSelected()) {
      this.selectedClasses.set([]);
      this.resetBuildState();
      await this.refreshAppliedManualCandidates();

      return;
    }

    this.selectedClasses.set([...this.availableClasses()]);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async removeSelectedType(type: AutoTeamBuilderType): Promise<void> {
    this.selectedTypes.set(this.selectedTypes().filter((selectedType) => selectedType !== type));
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async removeSelectedClass(characterClass: string): Promise<void> {
    this.selectedClasses.set(
      this.selectedClasses().filter((selectedClass) => selectedClass !== characterClass),
    );
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
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

    const previousResult = this.result();
    const abortController = new AbortController();

    this.buildAbortController = abortController;
    this.building.set(true);
    this.buildProgress.set(null);
    this.result.set(null);
    this.errorMessage.set('');

    try {
      const executionOptions: AutoTeamBuildExecutionOptions = {
        signal: abortController.signal,
        onProgress: (snapshot) => this.buildProgress.set(snapshot),
      };
      const nextResult = await this.autoTeamBuilder.buildTeam(
        this.selectedClasses(),
        this.selectedTypes(),
        {
          requireAllSelectedTypesInTeam: this.requireAllSelectedTypesInTeam(),
          requireAllSelectedClassesPerCharacter: this.requireAllSelectedClassesPerCharacter(),
          requireAllSpecialsSupportTeam: this.requireAllSpecialsSupportTeam(),
          requiredAbilities: this.serializeRequiredAbilities(),
          favoritesOnly: this.favoritesOnly(),
          favoriteCharacterIds: this.favoriteCharacterIds(),
          lockedCharacterIds: this.lockedCharacterIds(),
          captainCharacterId: this.effectiveCaptainLeaderId(),
          friendCaptainCharacterId: this.effectiveFriendLeaderId(),
        },
        executionOptions,
      );

      if (!nextResult) {
        this.errorMessage.set(this.resolveBuildFailureMessage());
      } else {
        nextResult.slots.forEach((slot) => this.cacheCharacterRecord(slot.character));
      }

      this.result.set(nextResult);
    } catch (error) {
      if (isAutoTeamBuildCancelledError(error)) {
        this.result.set(previousResult);
        this.errorMessage.set('');
        return;
      }

      console.error(error);
      this.errorMessage.set('Κάτι πήγε στραβά όσο γινόταν το auto build.');
    } finally {
      this.buildAbortController = null;
      this.buildProgress.set(null);
      this.building.set(false);
    }
  }

  public cancelBuild(): void {
    this.buildAbortController?.abort();
  }

  public buildTeamExportPayload(
    exportedAt = new Date().toISOString(),
  ): AutoTeamExportPayload | null {
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

  public buildSelectionExportPayload(
    exportedAt = new Date().toISOString(),
  ): AutoTeamSelectionExportPayload | null {
    if (!this.canDownloadSelectionJson()) {
      return null;
    }

    return buildAutoTeamSelectionExportPayload({
      selectedTypes: this.selectedTypes(),
      selectedClasses: this.selectedClasses(),
      requiredAbilities: this.serializeRequiredAbilities(),
      requireAllSelectedTypesInTeam: this.requireAllSelectedTypesInTeam(),
      requireAllSelectedClassesPerCharacter: this.requireAllSelectedClassesPerCharacter(),
      requireAllSpecialsSupportTeam: this.requireAllSpecialsSupportTeam(),
      favoritesOnly: this.favoritesOnly(),
      favoriteCount: this.favoriteCharacterIds().length,
      lockedCharacterIds: this.lockedCharacterIds(),
      lockedCharacters: this.lockedCharacters(),
      selectedLeaderIds: this.selectedLeaderIds(),
      captainLeaderId: this.effectiveCaptainLeaderId(),
      friendCaptainLeaderId: this.effectiveFriendLeaderId(),
      exportedAt,
    });
  }

  public downloadSelectionJson(): void {
    downloadAutoTeamSelectionExport(this.buildSelectionExportPayload());
  }

  public downloadAbilityCatalogJson(): void {
    const catalog = this.abilityCatalog();

    if (!catalog) {
      return;
    }

    const objectUrl = URL.createObjectURL(
      new Blob([JSON.stringify(catalog, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = 'optc-auto-builder-abilities.json';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);

    try {
      anchor.click();
    } finally {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    }
  }

  public downloadTeamJson(): void {
    downloadAutoTeamExport(this.buildTeamExportPayload());
  }

  private resetBuildState(): void {
    this.buildProgress.set(null);
    this.result.set(null);
    this.errorMessage.set('');
  }

  private async resetPageState(): Promise<void> {
    this.selectedTypes.set([]);
    this.selectedClasses.set([]);
    this.requiredAbilityDrafts.set([]);
    this.lockedCharacterRecords.set({});
    this.manualSearchTerm.set('');
    this.manualCandidates.set([]);
    this.manualCandidatesLoading.set(false);
    this.lockedCharacterIds.set([]);
    this.selectedLeaderIds.set([]);
    this.captainLeaderId.set(null);
    this.requireAllSelectedTypesInTeam.set(false);
    this.requireAllSelectedClassesPerCharacter.set(false);
    this.requireAllSpecialsSupportTeam.set(false);
    this.favoritesOnly.set(false);
    this.presetImportFeedback.set(null);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  private async importSelectionPreset(file: File): Promise<void> {
    try {
      const rawContent = await file.text();
      const payload = parseAutoTeamSelectionImportPayload(rawContent);
      const availableLockedCharacters = await this.repository.getCharactersByIds([
        ...new Set(
          payload.manualSelection.lockedCharacterIds.filter((characterId) => characterId > 0),
        ),
      ]);
      const importResult = sanitizeAutoTeamSelectionImportPayload(payload, {
        availableTypes: this.availableTypes,
        availableClasses: this.availableClasses(),
        abilityCatalogItems: this.availableAbilityCatalogItems(),
        availableLockedCharacters,
        maxLockedCharacters: this.maxLockedCharacters,
        maxLeaderCharacters: this.maxLeaderCharacters,
      });

      await this.applyImportedSelectionPreset(importResult, availableLockedCharacters, file.name);
    } catch (error) {
      this.presetImportFeedback.set({
        tone: 'error',
        title: 'Preset import failed.',
        details: [this.resolvePresetImportError(error)],
      });
    }
  }

  private async applyImportedSelectionPreset(
    importResult: AutoTeamSelectionImportResult,
    availableLockedCharacters: CharacterListItem[],
    fileName: string,
  ): Promise<void> {
    await this.resetPageState();

    const importedLockedCharacterMap = new Map(
      availableLockedCharacters.map((character) => [character.id, character] as const),
    );

    this.selectedTypes.set([...importResult.state.selectedTypes]);
    this.selectedClasses.set([...importResult.state.selectedClasses]);
    this.requiredAbilityDrafts.set(
      importResult.state.requiredAbilities.map((requirement) => ({
        draftId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        abilityKey: requirement.abilityKey,
        minTurns: requirement.minTurns,
        slotTokens: [...requirement.slotTokens],
        requiredCharacterCount: requirement.requiredCharacterCount,
      })),
    );
    this.lockedCharacterRecords.set({});
    importResult.state.lockedCharacterIds.forEach((characterId) => {
      const character = importedLockedCharacterMap.get(characterId);

      if (character) {
        this.cacheCharacterRecord(character);
      }
    });
    this.lockedCharacterIds.set([...importResult.state.lockedCharacterIds]);
    this.selectedLeaderIds.set([...importResult.state.selectedLeaderIds]);
    this.captainLeaderId.set(importResult.state.captainLeaderId);
    this.requireAllSelectedTypesInTeam.set(importResult.state.requireAllSelectedTypesInTeam);
    this.requireAllSelectedClassesPerCharacter.set(
      importResult.state.requireAllSelectedClassesPerCharacter,
    );
    this.requireAllSpecialsSupportTeam.set(importResult.state.requireAllSpecialsSupportTeam);
    this.favoritesOnly.set(importResult.state.favoritesOnly);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();

    this.presetImportFeedback.set({
      tone: importResult.warnings.length ? 'warning' : 'success',
      title: importResult.warnings.length ? 'Preset applied with warnings.' : 'Preset applied.',
      details: importResult.warnings.length
        ? [`Loaded settings from ${fileName}.`, ...importResult.warnings]
        : [`Loaded settings from ${fileName}.`],
    });
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

    if (this.hasRequiredAbilities()) {
      activeRequirements.push(
        `abilities που να καλύπτουν ${this.serializeRequiredAbilities()
          .map((requirement) => this.formatAbilityRequirement(requirement))
          .join(' • ')}`,
      );
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

  private async refreshAppliedManualCandidates(): Promise<void> {
    const requestId = ++this.appliedManualCandidateSearchRequestId;
    const filters = this.manualCandidateFilters();
    this.manualCandidatesLoading.set(true);

    try {
      const candidates = await this.repository.searchDetailedCharacters({
        searchTerm: this.manualSearchTerm().trim(),
        selectedTypes: filters.selectedTypes,
        selectedTypesMatchMode: 'any',
        selectedClasses: filters.selectedClasses,
        selectedClassesMatchMode: 'any',
        limit: this.manualSearchLimit,
        offset: 0,
      });
      const filteredCandidates = candidates.filter((candidate) =>
        this.matchesManualCharacterFilters(candidate, filters),
      );

      if (requestId !== this.appliedManualCandidateSearchRequestId) {
        return;
      }

      this.manualCandidates.set(filteredCandidates);
      filteredCandidates.forEach((candidate) => this.cacheCharacterRecord(candidate));
    } finally {
      if (requestId !== this.appliedManualCandidateSearchRequestId) {
        return;
      }

      this.manualCandidatesLoading.set(false);
    }
  }

  private matchesManualCharacterFilters(
    candidate: CharacterDetailRecord,
    filters: AppliedManualCharacterFilters,
  ): boolean {
    if (
      filters.requiredAbilities.length &&
      !builderAbilitiesMatchAllRequirements(
        candidate.detail.builderAbilities,
        filters.requiredAbilities,
      )
    ) {
      return false;
    }

    return true;
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

  private createAbilityRequirementDraft(
    item: AutoBuildAbilityCatalogItem | undefined,
  ): AbilityRequirementDraft {
    return {
      draftId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      abilityKey: item?.key ?? '',
      minTurns: item?.supportsTurns ? 1 : null,
      slotTokens: [],
      requiredCharacterCount: 1,
    };
  }

  private updateRequiredAbilityDraft(
    draftId: string,
    updater: (draft: AbilityRequirementDraft) => AbilityRequirementDraft,
  ): void {
    this.requiredAbilityDrafts.set(
      this.requiredAbilityDrafts().map((draft) =>
        draft.draftId === draftId ? updater(draft) : draft,
      ),
    );
    this.resetBuildState();
  }

  private serializeRequiredAbilities(): AutoBuildAbilityRequirement[] {
    return this.serializeAbilityRequirementDrafts(this.requiredAbilityDrafts());
  }

  private serializeAbilityRequirementDrafts(
    drafts: AbilityRequirementDraft[],
    forceSingleCharacterCount = false,
  ): AutoBuildAbilityRequirement[] {
    const requirements = new Map<string, AutoBuildAbilityRequirement>();

    drafts.forEach((draft) => {
      const abilityKey = draft.abilityKey.trim();

      if (!abilityKey.length) {
        return;
      }

      const minTurns =
        draft.minTurns !== null && Number.isFinite(draft.minTurns) && draft.minTurns > 0
          ? Math.floor(draft.minTurns)
          : null;
      const slotTokens = [
        ...new Set(draft.slotTokens.map((token) => token.trim().toUpperCase())),
      ].filter((token) => token.length);
      const requiredCharacterCount = forceSingleCharacterCount
        ? 1
        : this.normalizeRequiredCharacterCount(draft.requiredCharacterCount);
      const identity = `${abilityKey}|${minTurns ?? 'none'}|${slotTokens.join(',')}`;
      const existingRequirement = requirements.get(identity);

      if (existingRequirement) {
        existingRequirement.requiredCharacterCount = Math.max(
          existingRequirement.requiredCharacterCount,
          requiredCharacterCount,
        );
        return;
      }

      requirements.set(identity, {
        abilityKey,
        minTurns,
        slotTokens,
        requiredCharacterCount,
      });
    });

    return [...requirements.values()];
  }

  public resolveAbilityCatalogItem(abilityKey: string): AutoBuildAbilityCatalogItem | undefined {
    return this.abilityCatalogMap().get(abilityKey);
  }

  public formatAbilityRequirement(requirement: AutoBuildAbilityRequirement): string {
    const catalogItem = this.resolveAbilityCatalogItem(requirement.abilityKey);
    const label = catalogItem
      ? this.formatAbilityCatalogItemLabel(catalogItem)
      : requirement.abilityKey;
    const suffixes: string[] = [];

    if (requirement.requiredCharacterCount > 1) {
      suffixes.push(`>=${requirement.requiredCharacterCount} chars`);
    }

    if (requirement.minTurns !== null) {
      suffixes.push(`${requirement.minTurns} turns`);
    }

    if (requirement.slotTokens.length) {
      suffixes.push(requirement.slotTokens.join(' / '));
    }

    return suffixes.length ? `${label} (${suffixes.join(' • ')})` : label;
  }

  public resolveRequiredAbilitySelectedText(draft: AbilityRequirementDraft): string {
    if (!draft.abilityKey.length) {
      return 'Select ability';
    }

    return this.formatAbilityRequirement({
      abilityKey: draft.abilityKey,
      minTurns: draft.minTurns,
      slotTokens: draft.slotTokens,
      requiredCharacterCount: this.normalizeRequiredCharacterCount(draft.requiredCharacterCount),
    });
  }

  private normalizeRequiredCharacterCount(value: number | null | undefined): number {
    return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1;
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

  private buildManualCharacterCards(
    characters: CharacterDetailRecord[],
    highlightedRequirements: AutoBuildAbilityRequirement[],
  ): ManualCharacterCardView[] {
    return characters.map((character) => ({
      character,
      subtitle: this.buildCharacterSubtitle(character),
      favoriteLabel: this.isFavorite(character.id) ? 'Favorite' : null,
      abilityChips: this.buildAbilityChipViews(
        character.detail.builderAbilities,
        highlightedRequirements,
      ),
    }));
  }

  private buildCharacterSubtitle(character: CharacterDetailRecord): string {
    const typeLabel = character.type
      .split(',')
      .map((value) => value.trim())
      .join(' • ');
    const classLabel = character.classes.join(' • ');

    return [typeLabel, classLabel].filter((value) => value.length).join(' • ');
  }

  private buildAbilityChipViews(
    abilities: NormalizedBuilderAbility[],
    highlightedRequirements: AutoBuildAbilityRequirement[],
  ): CharacterAbilityChipView[] {
    if (!abilities.length) {
      return [
        {
          key: 'none',
          label: 'No parsed abilities',
          highlighted: false,
          empty: true,
        },
      ];
    }

    const seen = new Set<string>();
    const chipViews: CharacterAbilityChipView[] = [];

    abilities.forEach((ability) => {
      const key = `${ability.key}|${ability.minTurns ?? 'none'}|${ability.slotTokens.join(',')}|${ability.source}|${ability.coverageMode ?? 'explicit'}`;

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      chipViews.push({
        key,
        label: this.formatCharacterAbility(ability),
        highlighted:
          highlightedRequirements.length > 0 &&
          matchesAnyAbilityRequirement(ability, highlightedRequirements),
      });
    });

    return chipViews;
  }

  private formatCharacterAbility(ability: NormalizedBuilderAbility): string {
    const metadata: string[] = [];

    if (ability.minTurns !== null) {
      metadata.push(`${ability.minTurns} turns`);
    }

    if (ability.slotTokens.length) {
      metadata.push(ability.slotTokens.join(' / '));
    }

    const metadataSuffix = metadata.length ? ` (${metadata.join(' • ')})` : '';
    const sourceSuffix = ability.source === 'captainAbility' ? ' • Captain' : '';

    return `${this.formatCharacterAbilityLabel(ability)}${metadataSuffix}${sourceSuffix}`;
  }

  public formatAbilityCatalogItemLabel(item: AutoBuildAbilityCatalogItem): string {
    const coverageModes = item.availableCoverageModes ?? ['explicit'];

    if (!coverageModes.includes('selectedDebuff')) {
      return item.label;
    }

    if (coverageModes.includes('explicit')) {
      return `${item.label} (includes selectable debuff counters)`;
    }

    return `${item.label} (selectable debuff)`;
  }

  private formatCharacterAbilityLabel(ability: NormalizedBuilderAbility): string {
    const coverageMode = ability.coverageMode ?? 'explicit';
    const coverageSuffix = this.resolveCoverageModeLabel(coverageMode);

    return coverageSuffix ? `${ability.label} (${coverageSuffix})` : ability.label;
  }

  private resolveCoverageModeLabel(coverageMode: AutoBuildAbilityCoverageMode): string | null {
    return coverageMode === 'selectedDebuff' ? 'selectable debuff' : null;
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

  private resolvePresetImportError(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return 'The selected file could not be imported as an Auto Team Builder preset.';
  }
}

import { Component, OnDestroy, OnInit, computed, signal } from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { TranslocoDirective, TranslocoPipe } from "@jsverse/transloco";
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from "@ionic/angular/standalone";
import { type ViewWillEnter } from "@ionic/angular";
import {
  alertCircleOutline,
  boatOutline,
  checkmarkCircleOutline,
  heart,
  heartOutline,
  layersOutline,
  optionsOutline,
  shieldHalfOutline,
  sparklesOutline,
} from "ionicons/icons";

import {
  AUTO_BUILD_MANUAL_SLOT_ROLES,
  AUTO_TEAM_BUILDER_TYPES,
  type AutoBuildManualSlotRole,
  type AutoBuildManualSlotSelection,
  type AutoBuildProgressSnapshot,
  type AutoBuildResult,
  type AutoTeamBuilderType,
  createEmptyAutoBuildManualSlots,
} from "../../core/models/auto-team-builder.models";
import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCoverageMode,
  type AutoBuildAbilityRequirement,
  type NormalizedBuilderAbility,
} from "../../core/models/auto-team-builder-ability.models";
import {
  type CharacterDetailRecord,
  type CharacterListItem,
  type DatasetManifest,
  type ShipRecord,
} from "../../core/models/optc.models";
import {
  AutoTeamBuilderService,
  type AutoTeamBuildExecutionOptions,
} from "../../core/services/auto-team-builder.service";
import { AppI18nService } from "../../core/services/app-i18n.service";
import {
  matchesAnyAbilityRequirement,
  builderAbilitiesMatchAllRequirements,
} from "../../core/services/auto-team-builder-ability-match.utils";
import { isAutoTeamBuildCancelledError } from "../../core/services/auto-team-builder.engine";
import { resolveAutoBuildShipSelection } from "../../core/services/auto-team-builder-ship.utils";
import { OptcRepositoryService } from "../../core/services/optc-repository.service";
import { UserStateService } from "../../core/services/user-state.service";
import {
  AutoTeamSelectionImportError,
  type AutoTeamSelectionImportMessage,
  type AutoTeamSelectionImportResult,
  type AutoTeamSelectionImportState,
  type AutoTeamExportPayload,
  type AutoTeamSelectionExportPayload,
  buildAutoTeamExportPayload,
  buildAutoTeamSelectionExportPayload,
  downloadAutoTeamExport,
  downloadAutoTeamSelectionExport,
  parseAutoTeamSelectionImportPayload,
  sanitizeAutoTeamSelectionImportPayload,
} from "./auto-team-builder-export.utils";
import { buildAutoTeamBuilderStateFromSavedEnemy } from "./auto-team-builder-enemy-preset.utils";
import { AbilityRequirementPickerComponent } from "../../shared/ability-requirement-picker/ability-requirement-picker.component";
import {
  createAbilityRequirementDrafts,
  formatAbilityRequirementSummary,
  resolveAbilityRequirementVisual,
  serializeAbilityRequirementDrafts,
  type AbilityRequirementDraft,
  type AbilityRequirementVisualMeta,
} from "../../core/services/ability-requirement-draft.utils";

type LoadingProgressRowTone = "primary" | "secondary" | "fallback";

interface LoadingProgressRow {
  key: "message" | "attempt" | "candidatePool" | "droppedTypes" | "droppedClasses";
  text: string;
  displayText: string;
  visible: boolean;
  tone: LoadingProgressRowTone;
}

interface CharacterAbilityChipView {
  key: string;
  label: string;
  highlighted: boolean;
  empty?: boolean;
}

interface AbilityRequirementSummaryChipView {
  draftId: string;
  label: string;
  visual: AbilityRequirementVisualMeta;
}

interface ManualCharacterCardView {
  character: CharacterDetailRecord;
  subtitle: string;
  favoriteLabel: string | null;
  abilityChips: CharacterAbilityChipView[];
  isSelectedInActiveSlot: boolean;
  isSelectableInActiveSlot: boolean;
  actionLabel: string;
  selectionSupportLabel: string | null;
}

interface ShipCandidateCardView {
  ship: ShipRecord;
  subtitle: string;
  matchesManualSelection: boolean;
}

interface ManualSlotCardView {
  role: AutoBuildManualSlotRole;
  title: string;
  support: string;
  selectedCharacters: CharacterListItem[];
  isLeaderSlot: boolean;
  isActive: boolean;
}

type TeamSlotViewModel = AutoBuildResult["slots"][number] & {
  roleLabel: string;
  snippet: string;
  abilityChips: CharacterAbilityChipView[];
};

interface AppliedManualCharacterFilters {
  selectedTypes: AutoTeamBuilderType[];
  selectedClasses: string[];
  requiredAbilities: AutoBuildAbilityRequirement[];
}

type PresetImportFeedbackTone = "success" | "warning" | "error";

interface PresetImportFeedback {
  tone: PresetImportFeedbackTone;
  title: string;
  details: string[];
}

@Component({
  selector: "app-auto-team-builder-page",
  standalone: true,
  imports: [
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToggle,
    IonToolbar,
    AbilityRequirementPickerComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: "./auto-team-builder.page.html",
  styleUrl: "./auto-team-builder.page.scss",
})
export class AutoTeamBuilderPage implements OnInit, OnDestroy, ViewWillEnter {
  private readonly manualSearchLimit = 24;
  private buildAbortController: AbortController | null = null;
  private resetAfterBuildCancellation = false;
  private appliedManualCandidateSearchRequestId = 0;
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly ships = signal<ShipRecord[]>([]);
  public readonly selectedTypes = signal<AutoTeamBuilderType[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly requiredAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly abilityPickerOpen = signal(false);
  public readonly manualSearchTerm = signal("");
  public readonly shipSearchTerm = signal("");
  public readonly manualCandidates = signal<CharacterDetailRecord[]>([]);
  public readonly manualCandidatesLoading = signal(false);
  public readonly shipPickerMode = signal<"characters" | "ships">("characters");
  public readonly manualSlots = signal<AutoBuildManualSlotSelection[]>(
    createEmptyAutoBuildManualSlots(),
  );
  public readonly activeManualSlotRole = signal<AutoBuildManualSlotRole>("captain");
  public readonly lockedCharacterRecords = signal<Record<number, CharacterListItem>>({});
  public readonly selectedManualShipId = signal<number | null>(null);
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
  public readonly requireAllSpecialsSupportTeam = signal(false);
  public readonly favoritesOnly = signal(false);
  public readonly teamName = signal("");
  public readonly notes = signal("");
  public readonly building = signal(false);
  public readonly buildProgress = signal<AutoBuildProgressSnapshot | null>(null);
  public readonly result = signal<AutoBuildResult | null>(null);
  public readonly errorMessage = signal("");
  public readonly currentTeamId = signal<string | null>(null);
  public readonly favoriteCharacterIds;
  public readonly presetImportFeedback = signal<PresetImportFeedback | null>(null);
  public readonly loadedEnemyPresetName = signal<string | null>(null);

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly selectedManualShip = computed(
    () => this.ships().find((ship) => ship.id === this.selectedManualShipId()) ?? null,
  );
  public readonly hasSelectedManualShip = computed(() => Boolean(this.selectedManualShip()));
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
  public readonly requiredAbilitySummaryChips = computed<AbilityRequirementSummaryChipView[]>(() =>
    this.requiredAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly hasLoadedEnemyPreset = computed(() => Boolean(this.loadedEnemyPresetName()));
  public readonly lockedCharacterIds = computed(() => [
    ...new Set(this.manualSlots().flatMap((slot) => slot.characterIds)),
  ]);
  public readonly selectedLeaderIds = computed(() => {
    const leaderIds = [this.effectiveCaptainLeaderId(), this.effectiveFriendLeaderId()].filter(
      (characterId): characterId is number => characterId !== null,
    );

    return [...new Set(leaderIds)];
  });
  public readonly lockedCharacters = computed(() => {
    const lockedRecords = this.lockedCharacterRecords();

    return this.lockedCharacterIds()
      .map((characterId) => lockedRecords[characterId])
      .filter(Boolean);
  });
  public readonly hasLockedCharacters = computed(() => this.lockedCharacterIds().length > 0);
  public readonly hasSelectedLeaders = computed(() => this.selectedLeaderIds().length > 0);
  public readonly hasDualLeaders = computed(
    () =>
      this.resolveManualSlotSelection("captain").characterIds.length > 0 &&
      this.resolveManualSlotSelection("friendCaptain").characterIds.length > 0,
  );
  public readonly effectiveCaptainLeaderId = computed(
    () => this.resolveManualSlotSelection("captain").characterIds[0] ?? null,
  );
  public readonly effectiveFriendLeaderId = computed(() => {
    const friendLeaderId = this.resolveManualSlotSelection("friendCaptain").characterIds[0] ?? null;

    return friendLeaderId ?? this.effectiveCaptainLeaderId();
  });
  public readonly manualSelectionCount = computed(() =>
    this.manualSlots().reduce((count, slot) => count + slot.characterIds.length, 0),
  );
  public readonly manualSlotCards = computed<ManualSlotCardView[]>(() => {
    const lockedRecords = this.lockedCharacterRecords();

    return this.manualSlots().map((slot) => ({
      role: slot.role,
      title: this.getManualSlotTitle(slot.role),
      support: this.getManualSlotSupport(slot.role, slot.characterIds.length),
      selectedCharacters: slot.characterIds
        .map((characterId) => lockedRecords[characterId])
        .filter(Boolean),
      isLeaderSlot: this.isLeaderManualSlotRole(slot.role),
      isActive: slot.role === this.activeManualSlotRole(),
    }));
  });
  public readonly activeManualSlot = computed(
    () =>
      this.manualSlotCards().find((slotCard) => slotCard.role === this.activeManualSlotRole()) ??
      this.manualSlotCards()[0] ??
      null,
  );
  public readonly activeManualSlotSelectedCharacters = computed(
    () => this.activeManualSlot()?.selectedCharacters ?? [],
  );
  public readonly clearAllButtonDisabled = computed(
    () =>
      this.building() ||
      (!this.hasLockedCharacters() && !this.result() && this.errorMessage().length === 0),
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
    this.hasDualLeaders() ? this.t("hero.teamStructure.dual") : this.t("hero.teamStructure.single"),
  );
  public readonly selectAllTypesButtonLabel = computed(() =>
    this.allTypesSelected()
      ? this.t("filters.types.unselectAll")
      : this.t("filters.types.selectAll"),
  );
  public readonly selectAllClassesButtonLabel = computed(() =>
    this.allClassesSelected()
      ? this.t("filters.classes.unselectAll")
      : this.t("filters.classes.selectAll"),
  );
  public readonly typeSupportLabel = computed(() =>
    this.requireAllSelectedTypesInTeam()
      ? this.t("filters.types.support.strict")
      : this.t("filters.types.support.flexible"),
  );
  public readonly classSupportLabel = computed(() =>
    this.requireAllSelectedClassesPerCharacter()
      ? this.t("filters.classes.support.strict")
      : this.t("filters.classes.support.flexible"),
  );
  public readonly specialSupportLabel = computed(() =>
    this.requireAllSpecialsSupportTeam()
      ? this.t("filters.specialSupport.support.strict")
      : this.t("filters.specialSupport.support.flexible"),
  );
  public readonly favoritesOnlySupportLabel = computed(() =>
    this.hasFavoriteCharacters()
      ? this.t("filters.favoritesOnly.support.withCount", {
          count: this.favoriteCharacterIds().length,
        })
      : this.t("filters.favoritesOnly.support.empty"),
  );
  public readonly manualSlotSummaryLabel = computed(() =>
    this.t("manual.slotSummary", {
      slots: this.manualSlots().filter((slot) => slot.characterIds.length > 0).length,
      choices: this.manualSelectionCount(),
    }),
  );
  public readonly activeManualSlotSummaryLabel = computed(() => {
    const activeSlot = this.activeManualSlot();

    if (!activeSlot) {
      return this.t("manual.slotSelection.noneActive");
    }

    return this.t("manual.slotSelection.activeSummary", {
      role: activeSlot.title,
      count: activeSlot.selectedCharacters.length,
    });
  });
  public readonly activeManualSlotSupportLabel = computed(() => {
    const activeSlot = this.activeManualSlot();

    return activeSlot ? activeSlot.support : this.t("manual.slotSelection.noneActive");
  });
  public readonly manualFilterSummaryLabel = computed(() => {
    const filters = this.manualCandidateFilters();
    const parts: string[] = [];

    if (filters.selectedTypes.length > 0) {
      parts.push(
        this.t("manual.filters.parts.types", {
          values: filters.selectedTypes.join(" / "),
        }),
      );
    }

    if (filters.selectedClasses.length > 0) {
      parts.push(
        this.t("manual.filters.parts.classes", {
          values: filters.selectedClasses.join(" / "),
        }),
      );
    }

    if (filters.requiredAbilities.length > 0) {
      parts.push(
        this.t("manual.filters.parts.abilities", {
          values: filters.requiredAbilities
            .map((requirement) => this.formatAbilityRequirement(requirement))
            .join(" • "),
        }),
      );
    }

    return parts.length > 0
      ? this.t("manual.filters.active", { summary: parts.join(" • ") })
      : this.t("manual.filters.default");
  });
  public readonly manualCandidatesSummaryLabel = computed(() => {
    if (this.manualCandidatesLoading()) {
      return this.t("manual.candidates.loading");
    }

    return this.t("manual.candidates.count", { count: this.manualCandidateCards().length });
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
    this.isLeaderManualSlotRole(this.activeManualSlotRole())
      ? this.t("manual.candidatePool.leaderOnly")
      : this.hasAppliedManualFilters()
        ? this.t("manual.candidatePool.filtered")
        : this.t("manual.candidatePool.default"),
  );
  public readonly manualCandidateCards = computed(() =>
    this.buildManualCharacterCards(
      this.manualCandidates().filter((candidate) =>
        this.matchesActiveManualSlot(candidate, this.activeManualSlotRole()),
      ),
      this.manualCandidateFilters().requiredAbilities,
    ),
  );
  public readonly shipCandidates = computed<ShipCandidateCardView[]>(() => {
    const searchTerm = this.shipSearchTerm().trim().toLowerCase();

    return this.ships()
      .filter((ship) => {
        if (searchTerm.length === 0) {
          return true;
        }

        return [ship.name, ship.description].some((value) =>
          value.toLowerCase().includes(searchTerm),
        );
      })
      .map((ship) => ({
        ship,
        subtitle: this.buildShipCardSubtitle(ship),
        matchesManualSelection: ship.id === this.selectedManualShipId(),
      }));
  });
  public readonly shipCandidatesSummaryLabel = computed(() => {
    return this.t("ships.count", { count: this.shipCandidates().length });
  });
  public readonly shipPickerSupportLabel = computed(() => {
    const selectedShip = this.selectedManualShip();

    if (selectedShip) {
      return this.t("ships.manualOverride", { name: selectedShip.name });
    }

    return this.t("ships.autoRecommendation");
  });
  public readonly typeStrictToggleLabel = computed(() => this.t("filters.types.toggle"));
  public readonly classStrictToggleLabel = computed(() => this.t("filters.classes.toggle"));
  public readonly specialSupportToggleLabel = computed(() =>
    this.t("filters.specialSupport.toggle"),
  );
  public readonly favoritesOnlyToggleLabel = computed(() => this.t("filters.favoritesOnly.toggle"));
  public readonly favoritesOnlyBlockedMessage = computed(() =>
    this.t("filters.favoritesOnly.blockedMessage"),
  );
  public readonly selectedClassesLabel = computed(() =>
    this.formatSelectedValues(this.selectedClasses()),
  );
  public readonly selectedTypesLabel = computed(() =>
    this.formatSelectedTypes(this.selectedTypes()),
  );
  public readonly strictModeLabel = computed(() => {
    const strictModes: string[] = [];

    if (this.requireAllSelectedTypesInTeam()) {
      strictModes.push(this.t("hero.strictModes.typeCoverage"));
    }

    if (this.requireAllSelectedClassesPerCharacter()) {
      strictModes.push(this.t("hero.strictModes.perCharacterClasses"));
    }

    return strictModes.length > 0
      ? this.t("hero.strictMode.strict", { modes: strictModes.join(" + ") })
      : this.t("hero.strictMode.flexible");
  });
  public readonly builderLabel = computed(() =>
    this.hasSelectedTypes()
      ? this.t("hero.builderLabel.withTypes", {
          types: this.selectedTypesLabel(),
          mode: this.strictModeLabel(),
        })
      : this.t("hero.builderLabel.default", { mode: this.strictModeLabel() }),
  );
  public readonly titleLabel = computed(() =>
    this.hasSelectedClasses() && this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? this.t("hero.title.withTypesStrict", { types: this.selectedTypesLabel() })
        : this.t("hero.title.withTypesFlexible", { types: this.selectedTypesLabel() })
      : this.hasStrictFilters()
        ? this.t("hero.title.defaultStrict")
        : this.t("hero.title.defaultFlexible"),
  );
  public readonly descriptionLabel = computed(() =>
    this.hasSelectedClasses() && this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? this.t("hero.description.withTypesStrict", { types: this.selectedTypesLabel() })
        : this.t("hero.description.withTypesFlexible", { types: this.selectedTypesLabel() })
      : this.hasStrictFilters()
        ? this.t("hero.description.defaultStrict")
        : this.t("hero.description.defaultFlexible"),
  );
  public readonly buildButtonLabel = computed(() =>
    this.hasSelectedTypes()
      ? this.hasStrictFilters()
        ? this.favoritesOnly()
          ? this.t("actions.build.favoriteStrict", { types: this.selectedTypesLabel() })
          : this.t("actions.build.strict", { types: this.selectedTypesLabel() })
        : this.favoritesOnly()
          ? this.t("actions.build.favoriteFlexible", { types: this.selectedTypesLabel() })
          : this.t("actions.build.flexible", { types: this.selectedTypesLabel() })
      : this.t("actions.build.selectTypes"),
  );
  public readonly loadingLabel = computed(
    () =>
      (this.buildProgress()?.messageKey
        ? this.t(this.buildProgress()!.messageKey, this.buildProgress()!.messageParams)
        : null) ??
      (this.hasSelectedTypes()
        ? this.t("progress.scoringWithTypes", { types: this.selectedTypesLabel() })
        : this.t("progress.scoringDefault")),
  );
  public readonly buildAttemptProgressLabel = computed(() => {
    const progress = this.buildProgress();

    if (!progress || !progress.totalAttempts) {
      return "";
    }

    const currentAttempt =
      progress.stage === "completed"
        ? progress.completedAttempts
        : Math.min(progress.completedAttempts + 1, progress.totalAttempts);

    return this.t("progress.attemptProgress", {
      current: currentAttempt,
      total: progress.totalAttempts,
    });
  });
  public readonly buildCandidateProgressLabel = computed(() => {
    const progress = this.buildProgress();

    return progress?.candidateCount
      ? this.t("progress.candidatePool", { count: progress.candidateCount })
      : "";
  });
  public readonly buildDroppedTypesLabel = computed(() => {
    const droppedTypes = this.buildProgress()?.currentDroppedTypes ?? [];

    return droppedTypes.length > 0
      ? this.t("progress.ignoringTypes", { types: droppedTypes.join(" / ") })
      : "";
  });
  public readonly buildDroppedClassesLabel = computed(() => {
    const droppedClasses = this.buildProgress()?.currentDroppedClasses ?? [];

    return droppedClasses.length > 0
      ? this.t("progress.ignoringClasses", { classes: droppedClasses.join(" / ") })
      : "";
  });
  public readonly loadingProgressRows = computed<LoadingProgressRow[]>(() => {
    const rows: Array<Pick<LoadingProgressRow, "key" | "text" | "tone">> = [
      {
        key: "message",
        text: this.loadingLabel(),
        tone: "primary",
      },
      {
        key: "attempt",
        text: this.buildAttemptProgressLabel(),
        tone: "secondary",
      },
      {
        key: "candidatePool",
        text: this.buildCandidateProgressLabel(),
        tone: "secondary",
      },
      {
        key: "droppedTypes",
        text: this.buildDroppedTypesLabel(),
        tone: "fallback",
      },
      {
        key: "droppedClasses",
        text: this.buildDroppedClassesLabel(),
        tone: "fallback",
      },
    ];

    return rows.map((row) => ({
      ...row,
      displayText: row.text || "\u00A0",
      visible: row.text.length > 0,
    }));
  });
  public readonly cancelBuildButtonLabel = computed(() => this.t("actions.cancelBuild"));
  public readonly candidatePoolLabel = computed(() => {
    const isFavoritesOnly = this.result()?.input.favoritesOnly ?? this.favoritesOnly();

    if (this.hasSelectedTypes()) {
      return isFavoritesOnly
        ? this.t("results.candidatePool.favoritesWithTypes", {
            types: this.selectedTypesLabel(),
          })
        : this.t("results.candidatePool.withTypes", {
            types: this.selectedTypesLabel(),
          });
    }

    return isFavoritesOnly
      ? this.t("results.candidatePool.favoritesDefault")
      : this.t("results.candidatePool.default");
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
        ? this.t("results.selectedClassSummary.strictPending")
        : this.t("results.selectedClassSummary.flexiblePending");
    }

    if (current.input.requireAllSelectedClassesPerCharacter) {
      return this.t("results.selectedClassSummary.strictResolved", {
        matching: current.slots.length,
        total: current.slots.length,
      });
    }

    if (current.input.selectedClasses.length === 0) {
      return this.t("results.selectedClassSummary.noRequirement");
    }

    return this.t("results.selectedClassSummary.coverage", {
      covered: current.coverage.coveredSelectedClasses.length,
      total: current.input.selectedClasses.length,
      matchingSlots: current.coverage.selectedClassMatches,
    });
  });
  public readonly selectedTypeSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSelectedTypesInTeam()
        ? this.t("results.selectedTypeSummary.strictPending")
        : this.t("results.selectedTypeSummary.flexiblePending");
    }

    if (current.input.types.length === 0) {
      return this.t("results.selectedTypeSummary.noRequirement");
    }

    return current.input.requireAllSelectedTypesInTeam
      ? this.t("results.selectedTypeSummary.strictResolved", {
          covered: current.coverage.coveredSelectedTypes.length,
          total: current.input.types.length,
        })
      : this.t("results.selectedTypeSummary.coverage", {
          covered: current.coverage.coveredSelectedTypes.length,
          total: current.input.types.length,
          matchingSlots: current.coverage.selectedTypeMatches,
        });
  });
  public readonly leaderCriteriaSourceLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t("results.leaderCriteria.sourceSingle");
    }

    return leaderCriteria.dualLeaderMode === "intersection"
      ? this.t("results.leaderCriteria.sourceDual")
      : this.t("results.leaderCriteria.sourceSingle");
  });
  public readonly leaderCriteriaLeadersLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    return leaderCriteria?.leaderNames.length
      ? leaderCriteria.leaderNames.join(" / ")
      : this.t("results.none");
  });
  public readonly leaderCriteriaClassesLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t("results.leaderCriteria.noData");
    }

    return leaderCriteria.hasClassRestriction
      ? leaderCriteria.derivedAllowedClasses.join(" / ")
      : this.t("results.leaderCriteria.noClassRestriction");
  });
  public readonly leaderCriteriaTypesLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t("results.leaderCriteria.noData");
    }

    return leaderCriteria.hasTypeRestriction
      ? leaderCriteria.derivedAllowedTypes.join(" / ")
      : this.t("results.leaderCriteria.noTypeRestriction");
  });
  public readonly leaderCriteriaScopeSummaryLabel = computed(() => {
    const leaderCriteria = this.result()?.coverage.leaderCriteria;

    if (!leaderCriteria) {
      return this.t("results.leaderCriteria.scopePending");
    }

    if (!leaderCriteria.hasClassRestriction && !leaderCriteria.hasTypeRestriction) {
      return this.t("results.leaderCriteria.noRestriction");
    }

    return this.t("results.leaderCriteria.scopeCoverage", {
      matching: leaderCriteria.matchingSlots,
      total: leaderCriteria.totalSlots,
    });
  });
  public readonly specialSupportSummaryLabel = computed(() => {
    const current = this.result();

    if (!current) {
      return this.requireAllSpecialsSupportTeam()
        ? this.t("results.specialSupport.pendingStrict")
        : this.t("results.specialSupport.pendingOff");
    }

    const { specialSupport } = current.coverage;

    return specialSupport.enabled
      ? this.t("results.specialSupport.enabled", {
          matching: specialSupport.matchingSlots,
          total: specialSupport.totalSlots,
        })
      : this.t("results.specialSupport.disabled", {
          matching: specialSupport.matchingSlots,
          total: specialSupport.totalSlots,
        });
  });
  public readonly requiredAbilitySummaryLabel = computed(() => {
    const requirements = this.serializeRequiredAbilities();
    const current = this.result();

    if (requirements.length === 0) {
      return this.t("results.requiredAbilities.none");
    }

    if (!current) {
      return this.t("results.requiredAbilities.pending", { count: requirements.length });
    }

    const matchedCount = current.coverage.abilityRequirements.matched.length;
    return this.t("results.requiredAbilities.coverage", {
      matched: matchedCount,
      total: requirements.length,
    });
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
        this.hasSelectedManualShip() ||
        this.hasLockedCharacters()),
  );
  public readonly canDownloadAbilityCatalogJson = computed(
    () => !this.building() && this.availableAbilityCatalogItems().length > 0,
  );
  public readonly downloadAbilityCatalogJsonLabel = computed(() =>
    this.t("actions.downloadAbilitiesJson"),
  );
  public readonly downloadSelectionJsonLabel = computed(() => this.t("actions.downloadPresetJson"));
  public readonly canDownloadTeamJson = computed(() => Boolean(this.result()));
  public readonly downloadTeamJsonLabel = computed(() => this.t("actions.downloadTeamJson"));
  public readonly teamSlots = computed<TeamSlotViewModel[]>(() => {
    const currentResult = this.result();
    const requirements = this.pageRequiredAbilities();

    return (
      currentResult?.slots.map((slot) => ({
        ...slot,
        roleLabel: this.resolveRoleLabel(slot.role),
        snippet:
          slot.role === "sub"
            ? slot.character.detail.specialText ||
              slot.character.detail.captainAbility ||
              this.t("results.teamSlots.noSnippet")
            : slot.character.detail.captainAbility ||
              slot.character.detail.specialText ||
              this.t("results.teamSlots.noSnippet"),
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
  public readonly shipIcon = boatOutline;
  public readonly favoriteIcon = heart;
  public readonly favoriteOutlineIcon = heartOutline;
  public readonly manualFilterIcon = optionsOutline;
  public readonly presetImportSuccessIcon = checkmarkCircleOutline;
  public readonly presetImportErrorIcon = alertCircleOutline;

  public constructor(
    private readonly repository: OptcRepositoryService,
    private readonly autoTeamBuilder: AutoTeamBuilderService,
    private readonly userState: UserStateService,
    private readonly i18n: AppI18nService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.favoriteCharacterIds = this.userState.favoriteCharacterIds;
    this.teamName.set(this.i18n.translate("common.defaults.newCrew"));
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    await this.i18n.preloadScope("ability-picker");
    const shipsPromise =
      typeof this.repository.getShips === "function"
        ? this.repository.getShips()
        : Promise.resolve([]);
    const [summary, abilityCatalog, ships] = await Promise.all([
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      shipsPromise,
    ]);
    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);
    this.ships.set(ships);
    await this.resetPageState();
  }

  public ngOnDestroy(): void {
    this.abilityPickerOpen.set(false);
    this.cancelBuild();
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.resetPageState();
    await this.applyEnemyPresetFromRoute();
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
    this.manualSearchTerm.set((event.detail.value ?? "").trim());
    await this.refreshAppliedManualCandidates();
  }

  public onTeamNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.teamName.set((event.detail.value ?? "").trimStart());
  }

  public onNotesChange(event: CustomEvent<{ value?: string | null }>): void {
    this.notes.set((event.detail.value ?? "").toString());
  }

  public setShipPickerMode(mode: "characters" | "ships"): void {
    this.shipPickerMode.set(mode);
  }

  public onShipSearchChange(event: CustomEvent<{ value?: string | null }>): void {
    this.shipSearchTerm.set((event.detail.value ?? "").trim());
  }

  public selectManualShip(shipId: number): void {
    this.selectedManualShipId.set(shipId);
    this.updateResultShipSelection();
  }

  public clearManualShipSelection(): void {
    this.selectedManualShipId.set(null);
    this.updateResultShipSelection();
  }

  public isSelectedManualShip(shipId: number): boolean {
    return this.selectedManualShipId() === shipId;
  }

  public openPresetFilePicker(input: HTMLInputElement): void {
    input.click();
  }

  public async onPresetFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = [...target.files ?? []];

    input.value = "";

    if (!file) {
      return;
    }

    await this.importSelectionPreset(file);
  }

  public clearAllManualSelections(): void {
    this.manualSlots.set(createEmptyAutoBuildManualSlots());
    this.activeManualSlotRole.set("captain");
    this.resetBuildState();
  }

  public selectManualSlot(role: AutoBuildManualSlotRole): void {
    this.activeManualSlotRole.set(role);
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

  public openAbilityPicker(): void {
    if (this.building() || !this.availableAbilityCatalogItems().length) {
      return;
    }

    this.abilityPickerOpen.set(true);
  }

  public closeAbilityPicker(): void {
    this.abilityPickerOpen.set(false);
  }

  public async saveAbilityPicker(drafts: AbilityRequirementDraft[]): Promise<void> {
    this.requiredAbilityDrafts.set(drafts);
    this.abilityPickerOpen.set(false);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public async clearRequiredAbilities(): Promise<void> {
    this.requiredAbilityDrafts.set([]);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  public toggleCharacterInActiveManualSlot(character: CharacterDetailRecord): void {
    const activeRole = this.activeManualSlotRole();

    if (this.isCharacterSelectedInManualSlot(activeRole, character.id)) {
      this.removeCharacterFromManualSlot(activeRole, character.id);
      return;
    }

    if (!this.canAssignCharacterToManualSlot(activeRole, character)) {
      return;
    }

    this.cacheCharacterRecord(character);
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) =>
        slot.role === activeRole
          ? {
              ...slot,
              characterIds: [...slot.characterIds, character.id],
            }
          : slot,
      ),
    );
    this.resetBuildState();
  }

  public clearManualSlot(role: AutoBuildManualSlotRole, event?: Event): void {
    event?.stopPropagation();
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) =>
        slot.role === role
          ? {
              ...slot,
              characterIds: [],
            }
          : slot,
      ),
    );
    this.resetBuildState();
  }

  public removeCharacterFromManualSlot(
    role: AutoBuildManualSlotRole,
    characterId: number,
    event?: Event,
  ): void {
    event?.stopPropagation();
    this.manualSlots.update((currentSlots) =>
      currentSlots.map((slot) =>
        slot.role === role
          ? {
              ...slot,
              characterIds: slot.characterIds.filter(
                (selectedCharacterId) => selectedCharacterId !== characterId,
              ),
            }
          : slot,
      ),
    );
    this.resetBuildState();
  }

  public isCharacterSelectedInManualSlot(
    role: AutoBuildManualSlotRole,
    characterId: number,
  ): boolean {
    return this.resolveManualSlotSelection(role).characterIds.includes(characterId);
  }

  public canAssignCharacterToManualSlot(
    role: AutoBuildManualSlotRole,
    character: Pick<CharacterDetailRecord, "id" | "detail">,
  ): boolean {
    if (this.isCharacterSelectedInManualSlot(role, character.id)) {
      return true;
    }

    if (this.isLeaderManualSlotRole(role)) {
      if (!this.isLeaderCapableCharacter(character)) {
        return false;
      }

      return !this.manualSlots().some(
        (slot) =>
          this.isSubManualSlotRole(slot.role) && slot.characterIds.includes(character.id),
      );
    }

    return !this.manualSlots().some((slot) => slot.characterIds.includes(character.id));
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

  public getCharacterDetailLink(
    character: Pick<CharacterListItem, "id"> | null | undefined,
  ): string[] | null {
    return character ? ["/characters", character.id.toString()] : null;
  }

  public async buildTeam(): Promise<void> {
    if (this.buildDisabled()) {
      return;
    }

    const previousResult = this.result();
    const previousTeamId = this.currentTeamId();
    const abortController = new AbortController();

    this.buildAbortController = abortController;
    this.building.set(true);
    this.resetBuildState();

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
          manualSlots: this.serializeManualSlots(),
          manualShipId: this.selectedManualShipId(),
        },
        executionOptions,
      );

      if (nextResult) {
        for (const slot of nextResult.slots) this.cacheCharacterRecord(slot.character);
      } else {
        this.errorMessage.set(this.resolveBuildFailureMessage());
      }

      this.result.set(nextResult);
    } catch (error) {
      if (isAutoTeamBuildCancelledError(error)) {
        if (this.resetAfterBuildCancellation) {
          return;
        }

        this.result.set(previousResult);
        this.currentTeamId.set(previousTeamId);
        this.errorMessage.set("");
        return;
      }

      console.error(error);
      this.errorMessage.set(this.t("errors.buildFailed"));
    } finally {
      this.buildAbortController = null;
      this.buildProgress.set(null);
      this.building.set(false);
    }
  }

  public cancelBuild(): void {
    this.buildAbortController?.abort();
  }

  public async resetPage(): Promise<void> {
    if (this.building()) {
      this.resetAfterBuildCancellation = true;
      this.cancelBuild();

      while (this.building()) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      }

      this.resetAfterBuildCancellation = false;
    }

    await this.resetPageState();
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
      current.slots[0]?.character.id ?? null,
      current.slots[1]?.character.id ?? current.slots[0]?.character.id ?? null,
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
      manualSlots: this.serializeManualSlots(),
      lockedCharacterIds: this.lockedCharacterIds(),
      lockedCharacters: this.lockedCharacters(),
      selectedLeaderIds: this.selectedLeaderIds(),
      captainLeaderId: this.effectiveCaptainLeaderId(),
      friendCaptainLeaderId: this.effectiveFriendLeaderId(),
      manualShipId: this.selectedManualShipId(),
      manualShip: this.selectedManualShip(),
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
        type: "application/json;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = "optc-auto-builder-abilities.json";
    anchor.style.display = "none";
    document.body.append(anchor);

    try {
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    }
  }

  public downloadTeamJson(): void {
    downloadAutoTeamExport(this.buildTeamExportPayload());
  }

  public async saveTeam(): Promise<void> {
    const current = this.result();

    if (!current) {
      return;
    }

    const saved = await this.userState.saveTeam({
      id: this.currentTeamId() ?? undefined,
      name: this.teamName(),
      notes: this.notes(),
      shipId: current.shipSelection?.ship.id ?? null,
      slots: current.slots.map((slot) => slot.character.id),
    });

    this.currentTeamId.set(saved.id);
  }

  private resetBuildState(): void {
    this.buildProgress.set(null);
    this.result.set(null);
    this.errorMessage.set("");
    this.currentTeamId.set(null);
  }

  private async resetPageState(): Promise<void> {
    this.abilityPickerOpen.set(false);
    this.selectedTypes.set([]);
    this.selectedClasses.set([]);
    this.requiredAbilityDrafts.set([]);
    this.lockedCharacterRecords.set({});
    this.manualSearchTerm.set("");
    this.shipSearchTerm.set("");
    this.manualCandidates.set([]);
    this.manualCandidatesLoading.set(false);
    this.shipPickerMode.set("characters");
    this.manualSlots.set(createEmptyAutoBuildManualSlots());
    this.activeManualSlotRole.set("captain");
    this.selectedManualShipId.set(null);
    this.requireAllSelectedTypesInTeam.set(false);
    this.requireAllSelectedClassesPerCharacter.set(false);
    this.requireAllSpecialsSupportTeam.set(false);
    this.favoritesOnly.set(false);
    this.teamName.set(this.i18n.translate("common.defaults.newCrew"));
    this.notes.set("");
    this.presetImportFeedback.set(null);
    this.loadedEnemyPresetName.set(null);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  private async importSelectionPreset(file: File): Promise<void> {
    try {
      const rawContent = await file.text();
      const payload = parseAutoTeamSelectionImportPayload(rawContent);
      const importedCharacterIds = [
        ...new Set([
          ...payload.manualSelection.lockedCharacterIds.filter((characterId) => characterId > 0),
          ...(Array.isArray(payload.manualSelection.manualSlots)
            ? payload.manualSelection.manualSlots.flatMap((slot) =>
                Array.isArray(slot.characterIds)
                  ? slot.characterIds.filter((characterId) => characterId > 0)
                  : [],
              )
            : []),
        ]),
      ];
      const availableLockedCharacters = await this.repository.getCharactersByIds(importedCharacterIds);
      const importResult = sanitizeAutoTeamSelectionImportPayload(payload, {
        availableTypes: this.availableTypes,
        availableClasses: this.availableClasses(),
        abilityCatalogItems: this.availableAbilityCatalogItems(),
        availableLockedCharacters,
        availableShips: this.ships(),
      });

      await this.applyImportedSelectionPreset(importResult, availableLockedCharacters, file.name);
    } catch (error) {
      this.presetImportFeedback.set({
        tone: "error",
        title: this.t("preset.importFailedTitle"),
        details: [this.resolvePresetImportError(error)],
      });
    }
  }

  private async applyImportedSelectionPreset(
    importResult: AutoTeamSelectionImportResult,
    availableLockedCharacters: CharacterListItem[],
    fileName: string,
  ): Promise<void> {
    await this.applySelectionPresetState(importResult.state, availableLockedCharacters);

    this.presetImportFeedback.set({
      tone: importResult.warnings.length > 0 ? "warning" : "success",
      title: importResult.warnings.length > 0
        ? this.t("preset.appliedWithWarningsTitle")
        : this.t("preset.appliedTitle"),
      details: importResult.warnings.length > 0
        ? [
            this.t("preset.loadedFromFile", { fileName }),
            ...importResult.warnings.map((warning) => this.translateImportMessage(warning)),
          ]
        : [this.t("preset.loadedFromFile", { fileName })],
    });
  }

  private async applySelectionPresetState(
    state: AutoTeamSelectionImportState,
    availableLockedCharacters: CharacterListItem[] = [],
  ): Promise<void> {
    await this.resetPageState();

    this.selectedTypes.set([...state.selectedTypes]);
    this.selectedClasses.set([...state.selectedClasses]);
    this.requiredAbilityDrafts.set(createAbilityRequirementDrafts(state.requiredAbilities));
    this.lockedCharacterRecords.set({});
    for (const character of availableLockedCharacters) this.cacheCharacterRecord(character);
    this.manualSlots.set(
      state.manualSlots.map((slot) => ({
        role: slot.role,
        characterIds: [...slot.characterIds],
      })),
    );
    this.activeManualSlotRole.set(this.resolveInitialManualSlotRole(state.manualSlots));
    this.selectedManualShipId.set(state.manualShipId);
    this.requireAllSelectedTypesInTeam.set(state.requireAllSelectedTypesInTeam);
    this.requireAllSelectedClassesPerCharacter.set(state.requireAllSelectedClassesPerCharacter);
    this.requireAllSpecialsSupportTeam.set(state.requireAllSpecialsSupportTeam);
    this.favoritesOnly.set(state.favoritesOnly);
    this.resetBuildState();
    await this.refreshAppliedManualCandidates();
  }

  private async applyEnemyPresetFromRoute(): Promise<void> {
    const enemyId = this.route.snapshot.queryParamMap.get("enemyId")?.trim() ?? "";

    if (enemyId.length === 0) {
      return;
    }

    const enemy = this.userState.getSavedEnemyById(enemyId);

    if (!enemy) {
      await this.clearEnemyPresetQueryParam();
      return;
    }

    await this.applySelectionPresetState(buildAutoTeamBuilderStateFromSavedEnemy(enemy));
    this.loadedEnemyPresetName.set(enemy.name);
    await this.clearEnemyPresetQueryParam();
  }

  private async clearEnemyPresetQueryParam(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { enemyId: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  private resolveBuildFailureMessage(): string {
    if (this.buildBlockedByFavorites()) {
      return this.favoritesOnlyBlockedMessage();
    }

    const lockedCount = this.manualSelectionCount();
    const leaderRequirementLabel = this.resolveLeaderFailureLabel();

    const activeRequirements: string[] = [];
    const favoritesScope = this.favoritesOnly() ? this.t("errors.requirements.favoritesScope") : "";

    if (this.requireAllSelectedTypesInTeam()) {
      activeRequirements.push(this.t("errors.requirements.typeCoverage"));
    }

    if (this.requireAllSelectedClassesPerCharacter()) {
      activeRequirements.push(this.t("errors.requirements.classCoverage"));
    }

    if (this.requireAllSpecialsSupportTeam()) {
      activeRequirements.push(this.t("errors.requirements.specialCoverage"));
    }

    if (this.hasRequiredAbilities()) {
      activeRequirements.push(
        this.t("errors.requirements.abilityCoverage", {
          abilities: this.serializeRequiredAbilities()
            .map((requirement) => this.formatAbilityRequirement(requirement))
            .join(" • "),
        }),
      );
    }

    if (lockedCount) {
      if (this.hasStrictFilters()) {
        return this.t("errors.locked.strict", {
          lockedCount,
          leaderRequirement: leaderRequirementLabel,
        });
      }

      if (this.favoritesOnly()) {
        return this.t("errors.locked.favoritesFlexible", {
          types: this.selectedTypesLabel(),
          lockedCount,
          leaderRequirement: leaderRequirementLabel,
        });
      }

      if (activeRequirements.length > 0) {
        return this.t("errors.locked.requirementsFlexible", {
          types: this.selectedTypesLabel(),
          requirements: this.joinRequirementLabels(activeRequirements),
          lockedCount,
          leaderRequirement: leaderRequirementLabel,
        });
      }

      return this.t("errors.locked.defaultFlexible", {
        types: this.selectedTypesLabel(),
        lockedCount,
        leaderRequirement: leaderRequirementLabel,
      });
    }

    if (activeRequirements.length === 0 && this.favoritesOnly()) {
      if (this.hasStrictFilters()) {
        return this.t("errors.favorites.strict");
      }

      return this.t("errors.favorites.flexible", { types: this.selectedTypesLabel() });
    }

    if (activeRequirements.length === 0) {
      if (this.hasStrictFilters()) {
        return this.t("errors.default.strict", { types: this.selectedTypesLabel() });
      }

      return this.t("errors.default.flexible", { types: this.selectedTypesLabel() });
    }

    if (this.hasStrictFilters()) {
      return this.t("errors.requirements.strict", {
        types: this.selectedTypesLabel(),
        favoritesScope,
        requirements: this.joinRequirementLabels(activeRequirements),
      });
    }

    return this.t("errors.requirements.flexible", {
      types: this.selectedTypesLabel(),
      favoritesScope,
      requirements: this.joinRequirementLabels(activeRequirements),
    });
  }

  private async refreshAppliedManualCandidates(): Promise<void> {
    const requestId = ++this.appliedManualCandidateSearchRequestId;
    const filters = this.manualCandidateFilters();
    this.manualCandidatesLoading.set(true);

    try {
      const candidates = await this.repository.searchDetailedCharacters({
        searchTerm: this.manualSearchTerm().trim(),
        selectedTypes: filters.selectedTypes,
        selectedTypesMatchMode: "any",
        selectedClasses: filters.selectedClasses,
        selectedClassesMatchMode: "any",
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
      for (const candidate of filteredCandidates) this.cacheCharacterRecord(candidate);
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
      filters.requiredAbilities.length > 0 &&
      !builderAbilitiesMatchAllRequirements(
        candidate.detail.builderAbilities,
        filters.requiredAbilities,
      )
    ) {
      return false;
    }

    return true;
  }

  private updateResultShipSelection(): void {
    const currentResult = this.result();

    if (!currentResult) {
      return;
    }

    const manualShipId = this.selectedManualShipId();
    const nextResult: AutoBuildResult = {
      ...currentResult,
      input: {
        ...currentResult.input,
        manualShipId,
      },
      requestedInput: {
        ...currentResult.requestedInput,
        manualShipId,
      },
      shipSelection: null,
    };

    nextResult.shipSelection = resolveAutoBuildShipSelection(nextResult, this.ships());
    this.result.set(nextResult);
    this.currentTeamId.set(null);
  }

  private buildShipCardSubtitle(ship: ShipRecord): string {
    const description = ship.description.trim();

    return description.length > 132 ? `${description.slice(0, 129).trimEnd()}...` : description;
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

  private resolveManualSlotSelection(role: AutoBuildManualSlotRole): AutoBuildManualSlotSelection {
    return (
      this.manualSlots().find((slot) => slot.role === role) ?? {
        role,
        characterIds: [],
      }
    );
  }

  private serializeManualSlots(): AutoBuildManualSlotSelection[] {
    return this.manualSlots().map((slot) => ({
      role: slot.role,
      characterIds: [...slot.characterIds],
    }));
  }

  private resolveInitialManualSlotRole(
    manualSlots: AutoBuildManualSlotSelection[],
  ): AutoBuildManualSlotRole {
    return (
      manualSlots.find((slot) => slot.characterIds.length > 0)?.role ??
      AUTO_BUILD_MANUAL_SLOT_ROLES[0]
    );
  }

  private isLeaderManualSlotRole(role: AutoBuildManualSlotRole): boolean {
    return role === "captain" || role === "friendCaptain";
  }

  private isSubManualSlotRole(role: AutoBuildManualSlotRole): boolean {
    return !this.isLeaderManualSlotRole(role);
  }

  private isLeaderCapableCharacter(
    character: Pick<CharacterDetailRecord, "detail">,
  ): boolean {
    return Boolean(character.detail.captainAbility?.trim().length);
  }

  private matchesActiveManualSlot(
    character: CharacterDetailRecord,
    role: AutoBuildManualSlotRole,
  ): boolean {
    return this.isLeaderManualSlotRole(role) ? this.isLeaderCapableCharacter(character) : true;
  }

  private getManualSlotTitle(role: AutoBuildManualSlotRole): string {
    switch (role) {
      case "captain": {
        return this.t("manual.slots.roles.captain");
      }
      case "friendCaptain": {
        return this.t("manual.slots.roles.friendCaptain");
      }
      case "sub1": {
        return this.t("manual.slots.roles.sub1");
      }
      case "sub2": {
        return this.t("manual.slots.roles.sub2");
      }
      case "sub3": {
        return this.t("manual.slots.roles.sub3");
      }
      case "sub4": {
        return this.t("manual.slots.roles.sub4");
      }
    }
  }

  private getManualSlotSupport(role: AutoBuildManualSlotRole, selectedCount: number): string {
    if (this.isLeaderManualSlotRole(role)) {
      return selectedCount
        ? this.t("manual.slots.support.leaderSelected", { count: selectedCount })
        : this.t("manual.slots.support.leaderEmpty");
    }

    return selectedCount
      ? this.t("manual.slots.support.subSelected", { count: selectedCount })
      : this.t("manual.slots.support.subEmpty");
  }

  private resolveManualCharacterSelectionSupport(
    characterId: number,
    activeRole: AutoBuildManualSlotRole,
  ): string | null {
    const assignedRoles = this.manualSlots()
      .filter((slot) => slot.role !== activeRole && slot.characterIds.includes(characterId))
      .map((slot) => this.getManualSlotTitle(slot.role));

    if (assignedRoles.length === 0) {
      return null;
    }

    return this.t("manual.slotSelection.assignedTo", {
      slots: assignedRoles.join(" / "),
    });
  }

  private resolveLeaderFailureLabel(): string {
    if (this.hasDualLeaders()) {
      return this.t("errors.leaderRequirement.dual");
    }

    if (this.hasSelectedLeaders()) {
      return this.t("errors.leaderRequirement.single");
    }

    return "";
  }

  private resolveRoleLabel(role: "captain" | "friendCaptain" | "sub"): string {
    switch (role) {
      case "captain": {
        return this.t("results.teamSlots.roles.captain");
      }
      case "friendCaptain": {
        return this.t("results.teamSlots.roles.friendCaptain");
      }
      default: {
        return this.t("results.teamSlots.roles.sub");
      }
    }
  }

  private serializeRequiredAbilities(): AutoBuildAbilityRequirement[] {
    return serializeAbilityRequirementDrafts(this.requiredAbilityDrafts(), {
      dedupe: true,
      catalogMap: this.abilityCatalogMap(),
    });
  }

  private serializeAbilityRequirementDrafts(
    drafts: AbilityRequirementDraft[],
    forceSingleCharacterCount = false,
  ): AutoBuildAbilityRequirement[] {
    return serializeAbilityRequirementDrafts(drafts, {
      dedupe: true,
      forceSingleCharacterCount,
      catalogMap: this.abilityCatalogMap(),
    });
  }

  public resolveAbilityCatalogItem(abilityKey: string): AutoBuildAbilityCatalogItem | undefined {
    return this.abilityCatalogMap().get(abilityKey);
  }

  public formatAbilityRequirement(requirement: AutoBuildAbilityRequirement): string {
    return formatAbilityRequirementSummary(
      requirement,
      (abilityKey) => {
        const catalogItem = this.resolveAbilityCatalogItem(abilityKey);

        return catalogItem ? this.formatAbilityCatalogItemLabel(catalogItem) : abilityKey;
      },
      {
        formatCharacters: (count) => this.t("abilities.requirement.characters", { count }),
        formatTurns: (count) => this.t("abilities.requirement.turns", { count }),
      },
    );
  }

  public resolveRequiredAbilitySelectedText(draft: AbilityRequirementDraft): string {
    if (draft.abilityKey.length === 0) {
      return this.t("abilities.select");
    }

    return this.formatAbilityRequirement({
      abilityKey: draft.abilityKey,
      minTurns: draft.minTurns,
      slotTokens: draft.slotTokens,
      requiredCharacterCount: draft.requiredCharacterCount ?? 1,
    });
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
    const activeRole = this.activeManualSlotRole();

    return characters.map((character) => ({
      character,
      subtitle: this.buildCharacterSubtitle(character),
      favoriteLabel: this.isFavorite(character.id) ? this.t("manual.favorite") : null,
      abilityChips: this.buildAbilityChipViews(
        character.detail.builderAbilities,
        highlightedRequirements,
      ),
      isSelectedInActiveSlot: this.isCharacterSelectedInManualSlot(activeRole, character.id),
      isSelectableInActiveSlot: this.canAssignCharacterToManualSlot(activeRole, character),
      actionLabel: this.isCharacterSelectedInManualSlot(activeRole, character.id)
        ? this.t("common.actions.remove")
        : this.t("manual.actions.addChoice"),
      selectionSupportLabel: this.resolveManualCharacterSelectionSupport(
        character.id,
        activeRole,
      ),
    }));
  }

  private buildCharacterSubtitle(character: CharacterDetailRecord): string {
    const typeLabel = character.type
      .split(",")
      .map((value) => value.trim())
      .join(" • ");
    const classLabel = character.classes.join(" • ");

    return [typeLabel, classLabel].filter((value) => value.length).join(" • ");
  }

  private buildAbilityChipViews(
    abilities: NormalizedBuilderAbility[],
    highlightedRequirements: AutoBuildAbilityRequirement[],
  ): CharacterAbilityChipView[] {
    if (abilities.length === 0) {
      return [
        {
          key: "none",
          label: this.t("abilities.noneParsed"),
          highlighted: false,
          empty: true,
        },
      ];
    }

    const seen = new Set<string>();
    const chipViews: CharacterAbilityChipView[] = [];

    for (const ability of abilities) {
      const key = `${ability.key}|${ability.minTurns ?? "none"}|${ability.slotTokens.join(",")}|${ability.source}|${ability.coverageMode ?? "explicit"}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      chipViews.push({
        key,
        label: this.formatCharacterAbility(ability),
        highlighted:
          highlightedRequirements.length > 0 &&
          matchesAnyAbilityRequirement(ability, highlightedRequirements),
      });
    }

    return chipViews;
  }

  private formatCharacterAbility(ability: NormalizedBuilderAbility): string {
    const metadata: string[] = [];

    if (ability.minTurns !== null) {
      metadata.push(this.t("abilities.requirement.turns", { count: ability.minTurns }));
    }

    if (ability.slotTokens.length > 0) {
      metadata.push(ability.slotTokens.join(" / "));
    }

    const metadataSuffix = metadata.length > 0 ? ` (${metadata.join(" • ")})` : "";
    const sourceSuffix =
      ability.source === "captainAbility" ? ` • ${this.t("abilities.captainSource")}` : "";

    return `${this.formatCharacterAbilityLabel(ability)}${metadataSuffix}${sourceSuffix}`;
  }

  public formatAbilityCatalogItemLabel(item: AutoBuildAbilityCatalogItem): string {
    const coverageModes = item.availableCoverageModes ?? ["explicit"];

    if (!coverageModes.includes("selectedDebuff")) {
      return item.label;
    }

    if (coverageModes.includes("explicit")) {
      return this.t("abilities.catalog.withSelectableDebuff", { label: item.label });
    }

    return this.t("abilities.catalog.selectableDebuffOnly", { label: item.label });
  }

  private formatCharacterAbilityLabel(ability: NormalizedBuilderAbility): string {
    const coverageMode = ability.coverageMode ?? "explicit";
    const coverageSuffix = this.resolveCoverageModeLabel(coverageMode);

    return coverageSuffix ? `${ability.label} (${coverageSuffix})` : ability.label;
  }

  private resolveCoverageModeLabel(coverageMode: AutoBuildAbilityCoverageMode): string | null {
    return coverageMode === "selectedDebuff" ? this.t("abilities.selectableDebuff") : null;
  }

  private formatSelectedTypes(types: AutoTeamBuilderType[]): string {
    return this.formatSelectedValues(types);
  }

  private formatResultValues(values: readonly string[]): string {
    return values.length > 0 ? this.formatSelectedValues(values) : this.t("results.none");
  }

  private formatSelectedValues(values: readonly string[]): string {
    return values.join(" / ");
  }

  private resolvePresetImportError(error: unknown): string {
    if (error instanceof AutoTeamSelectionImportError) {
      return this.t(error.key, error.parameters);
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    return this.t("preset.importFailedDescription");
  }

  private t(
    key: string,
    parameters?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    return this.i18n.translate(key, parameters, "auto-team-builder");
  }

  private translateImportMessage(message: AutoTeamSelectionImportMessage): string {
    return this.t(message.key, message.params);
  }

  private joinRequirementLabels(labels: string[]): string {
    return labels.join(this.t("errors.requirements.separator"));
  }
}

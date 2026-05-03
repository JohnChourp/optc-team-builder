import { Component, OnInit, computed, signal } from '@angular/core';
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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { addCircleOutline, closeOutline } from 'ionicons/icons';

import { AUTO_TEAM_BUILDER_TYPES } from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityRequirement,
  type AutoBuildBattleRequirement,
  type AutoBuildEnemyMechanicCatalogItem,
  type AutoBuildEnemyMechanicRequirement,
  type AutoBuildRequiredCharacterGroup,
} from '../../core/models/auto-team-builder-ability.models';
import {
  type CharacterListItem,
  type DatasetManifest,
  type SavedEnemy,
} from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { AbilityRequirementPickerComponent } from '../../shared/ability-requirement-picker/ability-requirement-picker.component';
import {
  AbilityFilterRailComponent,
  type AbilityFilterRailItem,
} from '../../shared/ability-filter-rail/ability-filter-rail.component';
import { CharacterImagePickerComponent } from '../../shared/character-image-picker/character-image-picker.component';
import {
  createAbilityRequirementDrafts,
  formatAbilityRequirementSummary,
  resolveAbilityRequirementVisual,
  resolvePositiveInteger,
  type AbilityRequirementDraft,
  type AbilityRequirementVisualMeta,
} from '../../core/services/ability-requirement-draft.utils';
import {
  createEnemyMechanicDrafts,
  deriveAbilityRequirementsFromEnemyMechanics,
  formatEnemyMechanicSummary,
  getEnemyMechanicCatalogItems,
  resolveEnemyMechanicVisual,
  resolveEnemyMechanicCatalogItem,
  serializeEnemyMechanicDrafts,
  splitManualAbilityRequirementsFromEnemyMechanics,
  type EnemyMechanicDraft,
  type EnemyMechanicVisualMeta,
} from '../../core/services/enemy-mechanic-draft.utils';
import {
  createCategoryAbilityDrafts,
  createSpecialAbilityDrafts,
  getAbilityCatalogItemsByCategory,
  isCaptainAbilityRequirement,
  serializeCategoryAbilityDrafts,
  serializeSpecialAbilityDrafts,
} from '../../core/services/special-ability-filter.utils';
import {
  addEmptyGroupToBattle,
  cloneBattleRequirements,
  createAutoBuildBattleRequirement,
  createEmptyBattleRequirement,
  flattenBattleRequiredCharacterGroups,
  MAX_AUTO_BUILD_BATTLE_COUNT,
  normalizeBattleRequirementsWithLegacyFallback,
} from '../../core/services/auto-team-builder-battle.utils';
import {
  expandRequiredAbilitiesToCharacterGroups,
  MAX_REQUIRED_CHARACTER_GROUPS,
} from '../../core/services/required-character-groups.utils';
import {
  buildSavedEnemiesTransferPayload,
  downloadSavedEnemiesExport,
} from './saved-enemies-transfer.utils';
import {
  parseSavedEnemyText,
  type ParsedEnemyTextAbilityCandidate,
  type ParsedEnemyTextResult,
  type ParsedEnemyTextWarning,
} from './saved-enemies-text-parser.utils';

interface SavedEnemyAbilitySummaryChipView {
  draftId: string;
  label: string;
  visual: AbilityRequirementVisualMeta;
}

interface SavedEnemyMechanicSummaryChipView {
  draftId: string;
  label: string;
  visual: EnemyMechanicVisualMeta;
}

type RequiredCharacterAbilityCategory = 'special' | 'crewmate' | 'potential' | 'support';

interface SavedEnemyRequiredCharacterGroupView {
  battleId: string;
  group: AutoBuildRequiredCharacterGroup;
  title: string;
  abilityCount: number;
  chips: SavedEnemyAbilitySummaryChipView[];
}

interface SavedEnemyBattleView {
  battle: AutoBuildBattleRequirement;
  title: string;
  requiredCharacterCount: number;
  groupViews: SavedEnemyRequiredCharacterGroupView[];
}

interface ParsedEnemyTextAbilityCandidateView {
  identity: string;
  label: string;
  sourceLine: string;
  visual: AbilityRequirementVisualMeta;
  candidate: ParsedEnemyTextAbilityCandidate;
}

interface ParsedEnemyTextAbilityCategorySectionView {
  category: AutoBuildAbilityCategory;
  candidates: ParsedEnemyTextAbilityCandidateView[];
}

@Component({
  selector: 'app-saved-enemies-page',
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
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
    CharacterImagePickerComponent,
    AbilityRequirementPickerComponent,
    AbilityFilterRailComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './saved-enemies.page.html',
  styleUrl: './saved-enemies.page.scss',
})
export class SavedEnemiesPage implements OnInit, ViewWillEnter {
  private static readonly parsedAbilityCategoryOrder: AutoBuildAbilityCategory[] = [
    'special',
    'crewmate',
    'potential',
    'support',
  ];

  public readonly loading = signal(true);
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly savedEnemies;
  public readonly selectedEnemyIds = signal<string[]>([]);
  public readonly selectedEnemyIdSet = computed(() => new Set(this.selectedEnemyIds()));
  public readonly selectedCount = computed(() => this.selectedEnemyIds().length);
  public readonly hasSelection = computed(() => this.selectedCount() > 0);
  public readonly allSelected = computed(() => {
    const savedEnemies = this.savedEnemies();
    const selectedEnemyIdSet = this.selectedEnemyIdSet();

    return (
      savedEnemies.length > 0 && savedEnemies.every((enemy) => selectedEnemyIdSet.has(enemy.id))
    );
  });
  public readonly editorOpen = signal(false);
  public readonly editingEnemy = signal<SavedEnemy | null>(null);
  public readonly enemyName = signal('');
  public readonly enemyNotes = signal('');
  public readonly enemyImageDataUrl = signal<string | null>(null);
  public readonly enemyImageErrorMessage = signal('');
  public readonly processingEnemyImage = signal(false);
  public readonly characterImagePickerOpen = signal(false);
  public readonly enemyTextPasteValue = signal('');
  public readonly enemyTextParseResult = signal<ParsedEnemyTextResult | null>(null);
  public readonly enemyTextParseErrorMessage = signal('');
  public readonly parsedAbilitySelectionOpen = signal(false);
  public readonly selectedParsedAbilityCandidateIds = signal<string[]>([]);
  public readonly selectedTypes = signal<string[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly enemyMechanicDrafts = signal<EnemyMechanicDraft[]>([]);
  public readonly enemyMechanicPickerOpen = signal(false);
  public readonly requiredAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly abilityPickerOpen = signal(false);
  public readonly crewmateAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly crewmateAbilityPickerOpen = signal(false);
  public readonly potentialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly potentialAbilityPickerOpen = signal(false);
  public readonly supportAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly supportAbilityPickerOpen = signal(false);
  public readonly battleRequirements = signal<AutoBuildBattleRequirement[]>([]);
  public readonly activeRequiredCharacterGroupId = signal<string | null>(null);
  public readonly activeRequiredCharacterBattleId = signal<string | null>(null);
  public readonly activeRequiredCharacterAbilityCategory =
    signal<RequiredCharacterAbilityCategory>('special');
  public readonly requiredCharacterAbilityPickerOpen = signal(false);
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
  public readonly savingEnemy = signal(false);
  public readonly addIcon = addCircleOutline;
  public readonly closeIcon = closeOutline;

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly allTypesSelected = computed(
    () => this.selectedTypes().length === this.availableTypes.length,
  );
  public readonly allClassesSelected = computed(
    () =>
      this.availableClasses().length > 0 &&
      this.selectedClasses().length === this.availableClasses().length,
  );
  public readonly selectAllTypesButtonLabel = computed(() =>
    this.i18n.translate(
      this.allTypesSelected() ? 'editor.typesActions.clear' : 'editor.typesActions.selectAll',
      undefined,
      'saved-enemies',
    ),
  );
  public readonly selectAllClassesButtonLabel = computed(() =>
    this.i18n.translate(
      this.allClassesSelected() ? 'editor.classesActions.clear' : 'editor.classesActions.selectAll',
      undefined,
      'saved-enemies',
    ),
  );
  public readonly availableAbilityCatalogItems = computed(
    () => this.abilityCatalog()?.abilities ?? [],
  );
  public readonly availableSpecialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.availableAbilityCatalogItems(), 'special'),
  );
  public readonly availableCrewmateAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.availableAbilityCatalogItems(), 'crewmate'),
  );
  public readonly availablePotentialAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.availableAbilityCatalogItems(), 'potential'),
  );
  public readonly availableSupportAbilityCatalogItems = computed(() =>
    getAbilityCatalogItemsByCategory(this.availableAbilityCatalogItems(), 'support'),
  );
  public readonly availableEnemyMechanicCatalogItems = computed<
    AutoBuildEnemyMechanicCatalogItem[]
  >(() => getEnemyMechanicCatalogItems());
  public readonly abilityCatalogMap = computed(
    () => new Map(this.availableAbilityCatalogItems().map((item) => [item.key, item] as const)),
  );
  public readonly enemyMechanicCatalogMap = computed(
    () =>
      new Map(this.availableEnemyMechanicCatalogItems().map((item) => [item.key, item] as const)),
  );
  public readonly enemyMechanicSummaryChips = computed<SavedEnemyMechanicSummaryChipView[]>(() =>
    this.enemyMechanicDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveEnemyMechanicSelectedText(draft),
      visual: resolveEnemyMechanicVisual(draft.mechanicKey),
    })),
  );
  public readonly derivedRequiredAbilities = computed<AutoBuildAbilityRequirement[]>(() =>
    deriveAbilityRequirementsFromEnemyMechanics(this.serializeEnemyMechanics()),
  );
  public readonly derivedRequiredAbilitySummaryChips = computed<SavedEnemyAbilitySummaryChipView[]>(
    () =>
      this.derivedRequiredAbilities().map((requirement, index) => ({
        draftId: `derived-${requirement.abilityKey}-${index}`,
        label: this.formatAbilityRequirement(requirement),
        visual: resolveAbilityRequirementVisual(requirement.abilityKey),
      })),
  );
  public readonly requiredAbilitySummaryChips = computed<SavedEnemyAbilitySummaryChipView[]>(() =>
    this.requiredAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly crewmateAbilitySummaryChips = computed<SavedEnemyAbilitySummaryChipView[]>(() =>
    this.crewmateAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly potentialAbilitySummaryChips = computed<SavedEnemyAbilitySummaryChipView[]>(() =>
    this.potentialAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly supportAbilitySummaryChips = computed<SavedEnemyAbilitySummaryChipView[]>(() =>
    this.supportAbilityDrafts().map((draft) => ({
      draftId: draft.draftId,
      label: this.resolveRequiredAbilitySelectedText(draft),
      visual: resolveAbilityRequirementVisual(draft.abilityKey),
    })),
  );
  public readonly battleRequirementViews = computed<SavedEnemyBattleView[]>(() =>
    this.battleRequirements().map((battle, battleIndex) => ({
      battle,
      title: this.i18n.translate(
        'editor.requiredCharacters.battleTitle',
        { index: battleIndex + 1 },
        'saved-enemies',
      ),
      requiredCharacterCount: battle.requiredCharacterGroups.length,
      groupViews: battle.requiredCharacterGroups.map((group, groupIndex) => ({
        battleId: battle.id,
        group,
        title: this.i18n.translate(
          'editor.requiredCharacters.cardTitle',
          { index: groupIndex + 1 },
          'saved-enemies',
        ),
        abilityCount: group.abilities.length,
        chips: group.abilities.map((requirement, abilityIndex) => ({
          draftId: `${battle.id}-${group.id}-${abilityIndex}`,
          label: this.formatAbilityRequirement(requirement),
          visual: resolveAbilityRequirementVisual(requirement.abilityKey),
        })),
      })),
    })),
  );
  public readonly canAddBattleRequirement = computed(
    () => !this.savingEnemy() && this.battleRequirements().length < MAX_AUTO_BUILD_BATTLE_COUNT,
  );
  public readonly activeRequiredCharacterGroup = computed(() => {
    const activeBattleId = this.activeRequiredCharacterBattleId();
    const activeGroupId = this.activeRequiredCharacterGroupId();

    return (
      this.battleRequirements()
        .find((battle) => !activeBattleId || battle.id === activeBattleId)
        ?.requiredCharacterGroups.find((group) => group.id === activeGroupId) ?? null
    );
  });
  public readonly activeRequiredCharacterAbilityDrafts = computed(() =>
    createAbilityRequirementDrafts(
      this.activeRequiredCharacterGroup()?.abilities.filter(
        (requirement) =>
          this.abilityCatalogMap().get(requirement.abilityKey)?.category ===
            this.activeRequiredCharacterAbilityCategory() &&
          !isCaptainAbilityRequirement(requirement),
      ) ?? [],
    ),
  );
  public readonly activeRequiredCharacterCatalogItems = computed(() => {
    switch (this.activeRequiredCharacterAbilityCategory()) {
      case 'crewmate':
        return this.availableCrewmateAbilityCatalogItems();
      case 'potential':
        return this.availablePotentialAbilityCatalogItems();
      case 'support':
        return this.availableSupportAbilityCatalogItems();
      default:
        return this.availableSpecialAbilityCatalogItems();
    }
  });
  public readonly activeRequiredCharacterPickerTitle = computed(() =>
    this.i18n.translate(
      `editor.requiredCharacters.categories.${this.activeRequiredCharacterAbilityCategory()}`,
      undefined,
      'saved-enemies',
    ),
  );
  public readonly enemyTextParseFeedback = computed<{
    details: string[];
    title: string;
    tone: 'error' | 'success' | 'warning';
  } | null>(() => {
    const result = this.enemyTextParseResult();

    if (!result) {
      return null;
    }

    return {
      tone: result.warnings.length > 0 ? 'warning' : 'success',
      title: this.i18n.translate(
        result.warnings.length > 0
          ? 'editor.paste.feedback.warningTitle'
          : 'editor.paste.feedback.successTitle',
        undefined,
        'saved-enemies',
      ),
      details: [
        this.i18n.translate(
          'editor.paste.feedback.summary',
          {
            abilityCount: result.matchedAbilityCount,
            mechanicCount: result.matchedMechanicCount,
            warningCount: result.warnings.length,
          },
          'saved-enemies',
        ),
      ],
    };
  });
  public readonly enemyTextParseWarningMessages = computed<string[]>(
    () =>
      this.enemyTextParseResult()?.warnings.map((warning) =>
        this.translateEnemyTextWarning(warning),
      ) ?? [],
  );
  public readonly selectedParsedAbilityCandidateIdSet = computed(
    () => new Set(this.selectedParsedAbilityCandidateIds()),
  );
  public readonly parsedAbilitySelectionSections = computed<
    ParsedEnemyTextAbilityCategorySectionView[]
  >(() => {
    const parsedResult = this.enemyTextParseResult();

    return SavedEnemiesPage.parsedAbilityCategoryOrder.map((category) => ({
      category,
      candidates:
        parsedResult?.parsedAbilityCandidates
          .filter((candidate) => candidate.category === category)
          .map((candidate) => ({
            identity: this.buildParsedAbilityCandidateIdentity(candidate),
            label: this.formatAbilityRequirement({
              abilityKey: candidate.abilityKey,
              minTurns: candidate.minTurns,
              slotTokens: candidate.slotTokens,
              requiredCharacterCount: candidate.requiredCharacterCount,
            }),
            sourceLine: candidate.sourceLine,
            visual: resolveAbilityRequirementVisual(candidate.abilityKey),
            candidate,
          })) ?? [],
    }));
  });
  public readonly hasSavedEnemies = computed(() => this.savedEnemies().length > 0);
  public readonly canSaveEnemy = computed(
    () => this.selectedTypes().length > 0 && this.selectedClasses().length > 0,
  );

  private readonly maxEnemyImageDimension = 1200;

  public constructor(
    private readonly userState: UserStateService,
    private readonly repository: OptcRepositoryService,
    private readonly i18n: AppI18nService,
  ) {
    this.savedEnemies = this.userState.savedEnemies;
  }

  public async ngOnInit(): Promise<void> {
    await this.userState.ready();
    await Promise.all([
      this.i18n.preloadScope('ability-picker'),
      this.i18n.preloadScope('character-image-picker'),
      this.i18n.preloadScope('enemy-mechanics-picker'),
    ]);
    const [summary, abilityCatalog] = await Promise.all([
      this.repository.getDatasetManifest(),
      this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
    ]);

    this.summary.set(summary);
    this.abilityCatalog.set(abilityCatalog);
    this.loading.set(false);
  }

  public async ionViewWillEnter(): Promise<void> {
    await this.userState.ready();
    this.loading.set(false);
  }

  public ionViewDidEnter(): void {
    console.log('SavedEnemiesPage component');
  }

  public getEnemyBuilderQueryParams(enemy: SavedEnemy): { enemyId: string } {
    return { enemyId: enemy.id };
  }

  public isSelected(enemyId: string): boolean {
    return this.selectedEnemyIdSet().has(enemyId);
  }

  public onEnemySelectionChange(enemyId: string, event: CustomEvent<{ checked: boolean }>): void {
    this.setEnemySelection(enemyId, event.detail.checked);
  }

  public onSelectAllChange(event: CustomEvent<{ checked: boolean }>): void {
    if (event.detail.checked) {
      this.selectedEnemyIds.set(this.savedEnemies().map((enemy) => enemy.id));
      return;
    }

    this.selectedEnemyIds.set([]);
  }

  public resetSelection(): void {
    this.selectedEnemyIds.set([]);
  }

  public openCreateModal(): void {
    this.editingEnemy.set(null);
    this.enemyName.set('');
    this.enemyNotes.set('');
    this.enemyImageDataUrl.set(null);
    this.enemyImageErrorMessage.set('');
    this.processingEnemyImage.set(false);
    this.characterImagePickerOpen.set(false);
    this.resetEnemyTextParseState();
    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.crewmateAbilityPickerOpen.set(false);
    this.potentialAbilityPickerOpen.set(false);
    this.supportAbilityPickerOpen.set(false);
    this.requiredCharacterAbilityPickerOpen.set(false);
    this.activeRequiredCharacterBattleId.set(null);
    this.activeRequiredCharacterGroupId.set(null);
    this.selectedTypes.set([...this.availableTypes]);
    this.selectedClasses.set([...this.availableClasses()]);
    this.enemyMechanicDrafts.set([]);
    this.requiredAbilityDrafts.set([]);
    this.crewmateAbilityDrafts.set([]);
    this.potentialAbilityDrafts.set([]);
    this.supportAbilityDrafts.set([]);
    this.battleRequirements.set([createEmptyBattleRequirement(0)]);
    this.requireAllSelectedTypesInTeam.set(false);
    this.requireAllSelectedClassesPerCharacter.set(false);
    this.savingEnemy.set(false);
    this.editorOpen.set(true);
  }

  public openEditModal(enemy: SavedEnemy): void {
    this.editingEnemy.set(enemy);
    this.enemyName.set(enemy.name);
    this.enemyNotes.set(enemy.notes);
    this.enemyImageDataUrl.set(enemy.imageDataUrl);
    this.enemyImageErrorMessage.set('');
    this.processingEnemyImage.set(false);
    this.characterImagePickerOpen.set(false);
    this.resetEnemyTextParseState();
    this.enemyTextPasteValue.set(enemy.rawEnemyText);
    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.crewmateAbilityPickerOpen.set(false);
    this.potentialAbilityPickerOpen.set(false);
    this.supportAbilityPickerOpen.set(false);
    this.requiredCharacterAbilityPickerOpen.set(false);
    this.activeRequiredCharacterBattleId.set(null);
    this.activeRequiredCharacterGroupId.set(null);
    this.selectedTypes.set([...enemy.selectedTypes]);
    this.selectedClasses.set([...enemy.selectedClasses]);
    this.enemyMechanicDrafts.set([]);
    const manualRequiredAbilities = splitManualAbilityRequirementsFromEnemyMechanics(
      enemy.requiredAbilities,
      enemy.enemyMechanics,
    );
    const migratedRequiredAbilities = [
      ...manualRequiredAbilities,
      ...deriveAbilityRequirementsFromEnemyMechanics(enemy.enemyMechanics),
    ];
    this.requiredAbilityDrafts.set(
      createSpecialAbilityDrafts(migratedRequiredAbilities, this.availableAbilityCatalogItems()),
    );
    this.crewmateAbilityDrafts.set(
      createCategoryAbilityDrafts(
        migratedRequiredAbilities,
        this.availableAbilityCatalogItems(),
        'crewmate',
      ),
    );
    this.potentialAbilityDrafts.set(
      createCategoryAbilityDrafts(
        migratedRequiredAbilities,
        this.availableAbilityCatalogItems(),
        'potential',
      ),
    );
    this.supportAbilityDrafts.set(
      createCategoryAbilityDrafts(
        migratedRequiredAbilities,
        this.availableAbilityCatalogItems(),
        'support',
      ),
    );
    this.battleRequirements.set(
      normalizeBattleRequirementsWithLegacyFallback({
        battles: enemy.battleRequirements,
        requiredAbilities: manualRequiredAbilities,
        requiredCharacterGroups: enemy.requiredCharacterGroups,
        enemyMechanics: enemy.enemyMechanics,
      }),
    );
    this.requireAllSelectedTypesInTeam.set(enemy.requireAllSelectedTypesInTeam);
    this.requireAllSelectedClassesPerCharacter.set(enemy.requireAllSelectedClassesPerCharacter);
    this.savingEnemy.set(false);
    this.editorOpen.set(true);
  }

  public closeEditor(): void {
    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.crewmateAbilityPickerOpen.set(false);
    this.potentialAbilityPickerOpen.set(false);
    this.supportAbilityPickerOpen.set(false);
    this.requiredCharacterAbilityPickerOpen.set(false);
    this.activeRequiredCharacterGroupId.set(null);
    this.editorOpen.set(false);
    this.editingEnemy.set(null);
    this.savingEnemy.set(false);
    this.enemyImageErrorMessage.set('');
    this.processingEnemyImage.set(false);
    this.characterImagePickerOpen.set(false);
    this.resetEnemyTextParseState();
  }

  public onEnemyNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.enemyName.set((event.detail.value ?? '').trimStart());
  }

  public onEnemyNotesChange(event: CustomEvent<{ value?: string | null }>): void {
    this.enemyNotes.set((event.detail.value ?? '').toString());
  }

  public openEnemyImagePicker(input: HTMLInputElement): void {
    if (this.savingEnemy() || this.processingEnemyImage()) {
      return;
    }

    input.click();
  }

  public openCharacterImagePicker(): void {
    if (this.savingEnemy() || this.processingEnemyImage()) {
      return;
    }

    this.characterImagePickerOpen.set(true);
  }

  public closeCharacterImagePicker(): void {
    this.characterImagePickerOpen.set(false);
  }

  public async onEnemyImageSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = [...(target.files ?? [])];

    input.value = '';

    if (!file) {
      return;
    }

    await this.loadEnemyImage(file);
  }

  public removeEnemyImage(): void {
    this.enemyImageDataUrl.set(null);
    this.enemyImageErrorMessage.set('');
  }

  public async applyCharacterImageSelection(character: CharacterListItem): Promise<void> {
    if (this.savingEnemy() || this.processingEnemyImage()) {
      return;
    }

    this.processingEnemyImage.set(true);
    this.enemyImageErrorMessage.set('');

    try {
      const rawImageDataUrl = await this.readImageUrlAsDataUrl(character.imageUrl);
      const resizedImageDataUrl = await this.resizeImageDataUrl(
        rawImageDataUrl,
        this.maxEnemyImageDimension,
      );

      this.enemyImageDataUrl.set(resizedImageDataUrl);
      this.characterImagePickerOpen.set(false);
    } catch {
      this.enemyImageErrorMessage.set(
        this.i18n.translate('editor.image.errors.characterLoadFailed', undefined, 'saved-enemies'),
      );
    } finally {
      this.processingEnemyImage.set(false);
    }
  }

  public onTypeChange(event: CustomEvent<{ value?: string[] | string | null }>): void {
    this.selectedTypes.set(this.resolveSelectedValues(event.detail.value));
  }

  public onClassChange(event: CustomEvent<{ value?: string[] | string | null }>): void {
    this.selectedClasses.set(this.resolveSelectedValues(event.detail.value));
  }

  public selectAllTypes(): void {
    if (this.allTypesSelected()) {
      this.selectedTypes.set([]);
      return;
    }

    this.selectedTypes.set([...this.availableTypes]);
  }

  public selectAllClasses(): void {
    if (this.availableClasses().length === 0) {
      this.selectedClasses.set([]);
      return;
    }

    if (this.allClassesSelected()) {
      this.selectedClasses.set([]);
      return;
    }

    this.selectedClasses.set([...this.availableClasses()]);
  }

  public openAbilityPicker(): void {
    if (this.savingEnemy() || this.availableSpecialAbilityCatalogItems().length === 0) {
      return;
    }

    this.abilityPickerOpen.set(true);
  }

  public closeAbilityPicker(): void {
    this.abilityPickerOpen.set(false);
  }

  public saveAbilityPicker(drafts: AbilityRequirementDraft[]): void {
    this.requiredAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeSpecialAbilityDrafts(drafts, this.availableSpecialAbilityCatalogItems(), {
          dedupe: false,
        }),
      ),
    );
    this.abilityPickerOpen.set(false);
  }

  public openCrewmateAbilityPicker(): void {
    if (this.savingEnemy() || this.availableCrewmateAbilityCatalogItems().length === 0) {
      return;
    }

    this.crewmateAbilityPickerOpen.set(true);
  }

  public closeCrewmateAbilityPicker(): void {
    this.crewmateAbilityPickerOpen.set(false);
  }

  public saveCrewmateAbilityPicker(drafts: AbilityRequirementDraft[]): void {
    this.crewmateAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(
          drafts,
          this.availableCrewmateAbilityCatalogItems(),
          'crewmate',
          { dedupe: false },
        ),
      ),
    );
    this.crewmateAbilityPickerOpen.set(false);
  }

  public openPotentialAbilityPicker(): void {
    if (this.savingEnemy() || this.availablePotentialAbilityCatalogItems().length === 0) {
      return;
    }

    this.potentialAbilityPickerOpen.set(true);
  }

  public closePotentialAbilityPicker(): void {
    this.potentialAbilityPickerOpen.set(false);
  }

  public savePotentialAbilityPicker(drafts: AbilityRequirementDraft[]): void {
    this.potentialAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(
          drafts,
          this.availablePotentialAbilityCatalogItems(),
          'potential',
          { dedupe: false },
        ),
      ),
    );
    this.potentialAbilityPickerOpen.set(false);
  }

  public openSupportAbilityPicker(): void {
    if (this.savingEnemy() || this.availableSupportAbilityCatalogItems().length === 0) {
      return;
    }

    this.supportAbilityPickerOpen.set(true);
  }

  public closeSupportAbilityPicker(): void {
    this.supportAbilityPickerOpen.set(false);
  }

  public saveSupportAbilityPicker(drafts: AbilityRequirementDraft[]): void {
    this.supportAbilityDrafts.set(
      createAbilityRequirementDrafts(
        serializeCategoryAbilityDrafts(
          drafts,
          this.availableSupportAbilityCatalogItems(),
          'support',
          {
            dedupe: false,
          },
        ),
      ),
    );
    this.supportAbilityPickerOpen.set(false);
  }

  public canAddRequiredCharacterGroup(battleId: string): boolean {
    const battle = this.battleRequirements().find((entry) => entry.id === battleId);

    return (
      !this.savingEnemy() &&
      Boolean(battle) &&
      (battle?.requiredCharacterGroups.length ?? 0) < MAX_REQUIRED_CHARACTER_GROUPS
    );
  }

  public addBattleRequirement(): void {
    if (!this.canAddBattleRequirement()) {
      return;
    }

    this.battleRequirements.update((battles) => [
      ...battles,
      createEmptyBattleRequirement(battles.length),
    ]);
  }

  public addRequiredCharacterGroup(battleId: string): void {
    if (!this.canAddRequiredCharacterGroup(battleId)) {
      return;
    }

    this.battleRequirements.update((battles) => addEmptyGroupToBattle(battles, battleId));
  }

  public removeBattleRequirement(battleId: string): void {
    if (this.battleRequirements().length <= 1) {
      return;
    }

    this.battleRequirements.update((battles) => battles.filter((battle) => battle.id !== battleId));

    if (this.activeRequiredCharacterBattleId() === battleId) {
      this.requiredCharacterAbilityPickerOpen.set(false);
      this.activeRequiredCharacterBattleId.set(null);
      this.activeRequiredCharacterGroupId.set(null);
    }
  }

  public removeRequiredCharacterGroup(battleId: string, groupId: string): void {
    this.battleRequirements.update((battles) =>
      battles.map((battle) =>
        battle.id === battleId
          ? {
              ...battle,
              requiredCharacterGroups: battle.requiredCharacterGroups.filter(
                (group) => group.id !== groupId,
              ),
            }
          : battle,
      ),
    );

    if (
      this.activeRequiredCharacterBattleId() === battleId &&
      this.activeRequiredCharacterGroupId() === groupId
    ) {
      this.requiredCharacterAbilityPickerOpen.set(false);
      this.activeRequiredCharacterBattleId.set(null);
      this.activeRequiredCharacterGroupId.set(null);
    }
  }

  public openRequiredCharacterAbilityPicker(
    battleId: string,
    groupId: string,
    category: RequiredCharacterAbilityCategory,
  ): void {
    if (this.savingEnemy()) {
      return;
    }

    this.activeRequiredCharacterBattleId.set(battleId);
    this.activeRequiredCharacterGroupId.set(groupId);
    this.activeRequiredCharacterAbilityCategory.set(category);
    this.requiredCharacterAbilityPickerOpen.set(true);
  }

  public requiredCharacterAbilityRailItems(
    view: SavedEnemyRequiredCharacterGroupView,
  ): AbilityFilterRailItem[] {
    return [
      this.buildRequiredCharacterAbilityRailItem(view, 'special'),
      this.buildRequiredCharacterAbilityRailItem(view, 'crewmate'),
      this.buildRequiredCharacterAbilityRailItem(view, 'potential'),
      this.buildRequiredCharacterAbilityRailItem(view, 'support'),
    ];
  }

  public clearRequiredCharacterAbilityCategory(
    battleId: string,
    groupId: string,
    category: RequiredCharacterAbilityCategory,
  ): void {
    if (this.savingEnemy()) {
      return;
    }

    this.battleRequirements.update((battles) =>
      battles.map((battle) =>
        battle.id === battleId
          ? {
              ...battle,
              requiredCharacterGroups: battle.requiredCharacterGroups.map((group) =>
                group.id === groupId
                  ? {
                      ...group,
                      abilities: group.abilities.filter(
                        (requirement) =>
                          !this.requiredCharacterRequirementMatchesCategory(requirement, category),
                      ),
                    }
                  : group,
              ),
            }
          : battle,
      ),
    );
  }

  public closeRequiredCharacterAbilityPicker(): void {
    this.requiredCharacterAbilityPickerOpen.set(false);
    this.activeRequiredCharacterBattleId.set(null);
    this.activeRequiredCharacterGroupId.set(null);
  }

  public saveRequiredCharacterAbilityPicker(drafts: AbilityRequirementDraft[]): void {
    const activeGroupId = this.activeRequiredCharacterGroupId();
    const activeBattleId = this.activeRequiredCharacterBattleId();
    const category = this.activeRequiredCharacterAbilityCategory();

    if (!activeBattleId || !activeGroupId) {
      this.requiredCharacterAbilityPickerOpen.set(false);
      return;
    }

    const catalogItems = this.activeRequiredCharacterCatalogItems();
    const nextRequirements =
      category === 'special'
        ? serializeSpecialAbilityDrafts(drafts, catalogItems, { dedupe: false })
        : serializeCategoryAbilityDrafts(drafts, catalogItems, category, { dedupe: false });

    this.battleRequirements.update((battles) =>
      battles.map((battle) =>
        battle.id === activeBattleId
          ? {
              ...battle,
              requiredCharacterGroups: battle.requiredCharacterGroups.map((group) => {
                if (group.id !== activeGroupId) {
                  return group;
                }

                return {
                  ...group,
                  abilities: [
                    ...group.abilities.filter(
                      (requirement) =>
                        !this.requiredCharacterRequirementMatchesCategory(requirement, category),
                    ),
                    ...nextRequirements.map((requirement) => ({
                      ...requirement,
                      slotTokens: [...requirement.slotTokens],
                      requiredCharacterCount: 1,
                    })),
                  ],
                };
              }),
            }
          : battle,
      ),
    );
    this.requiredCharacterAbilityPickerOpen.set(false);
    this.activeRequiredCharacterBattleId.set(null);
    this.activeRequiredCharacterGroupId.set(null);
  }

  public onEnemyPasteTextChange(event: CustomEvent<{ value?: string | null }>): void {
    this.enemyTextPasteValue.set((event.detail.value ?? '').toString());
    this.enemyTextParseResult.set(null);
    this.enemyTextParseErrorMessage.set('');
    this.parsedAbilitySelectionOpen.set(false);
    this.selectedParsedAbilityCandidateIds.set([]);
  }

  public parseEnemyText(): void {
    if (this.savingEnemy()) {
      return;
    }

    if (this.enemyTextPasteValue().trim().length === 0) {
      this.enemyTextParseResult.set(null);
      this.enemyTextParseErrorMessage.set(
        this.i18n.translate('editor.paste.errors.empty', undefined, 'saved-enemies'),
      );
      return;
    }

    const parsedResult = parseSavedEnemyText(this.enemyTextPasteValue(), {
      abilityCatalogItems: this.availableAbilityCatalogItems(),
    });

    this.enemyTextParseResult.set(parsedResult);
    this.enemyTextParseErrorMessage.set('');
    this.selectedParsedAbilityCandidateIds.set(
      parsedResult.parsedAbilityCandidates
        .filter((candidate) => candidate.category === 'special')
        .map((candidate) => this.buildParsedAbilityCandidateIdentity(candidate)),
    );
    this.parsedAbilitySelectionOpen.set(parsedResult.parsedAbilityCandidates.length > 0);
  }

  public applyParsedEnemyText(): void {
    if (this.savingEnemy()) {
      return;
    }

    const parsedResult = this.enemyTextParseResult();

    if (!parsedResult) {
      return;
    }

    const selectedCandidateIdSet = this.selectedParsedAbilityCandidateIdSet();
    const selectedRequirements = parsedResult.parsedAbilityCandidates
      .filter((candidate) =>
        selectedCandidateIdSet.has(this.buildParsedAbilityCandidateIdentity(candidate)),
      )
      .map((candidate) => ({
        abilityKey: candidate.abilityKey,
        minTurns: candidate.minTurns,
        slotTokens: [...candidate.slotTokens],
        requiredCharacterCount: candidate.requiredCharacterCount,
      }));

    this.enemyMechanicDrafts.set([]);
    this.requiredAbilityDrafts.set(
      createSpecialAbilityDrafts(selectedRequirements, this.availableAbilityCatalogItems()),
    );
    this.crewmateAbilityDrafts.set(
      createCategoryAbilityDrafts(
        selectedRequirements,
        this.availableAbilityCatalogItems(),
        'crewmate',
      ),
    );
    this.potentialAbilityDrafts.set(
      createCategoryAbilityDrafts(
        selectedRequirements,
        this.availableAbilityCatalogItems(),
        'potential',
      ),
    );
    this.supportAbilityDrafts.set(
      createCategoryAbilityDrafts(
        selectedRequirements,
        this.availableAbilityCatalogItems(),
        'support',
      ),
    );
    this.battleRequirements.set([
      createAutoBuildBattleRequirement({
        id: 'battle-1',
        title: 'Battle 1',
        enemyMechanics: parsedResult.enemyMechanics,
        requiredCharacterGroups:
          expandRequiredAbilitiesToCharacterGroups(selectedRequirements).groups,
      }),
    ]);
    this.parsedAbilitySelectionOpen.set(false);
  }

  public closeParsedAbilitySelection(): void {
    this.parsedAbilitySelectionOpen.set(false);
  }

  public isParsedAbilityCandidateSelected(identity: string): boolean {
    return this.selectedParsedAbilityCandidateIdSet().has(identity);
  }

  public toggleParsedAbilityCandidate(
    identity: string,
    event: CustomEvent<{ checked: boolean }>,
  ): void {
    const selectedIds = this.selectedParsedAbilityCandidateIds();

    if (event.detail.checked) {
      if (!selectedIds.includes(identity)) {
        this.selectedParsedAbilityCandidateIds.set([...selectedIds, identity]);
      }

      return;
    }

    this.selectedParsedAbilityCandidateIds.set(
      selectedIds.filter((selectedIdentity) => selectedIdentity !== identity),
    );
  }

  public selectAllParsedAbilityCandidates(category: AutoBuildAbilityCategory): void {
    const nextIds = new Set(this.selectedParsedAbilityCandidateIds());

    this.parsedAbilitySelectionSections()
      .find((section) => section.category === category)
      ?.candidates.forEach((candidate) => nextIds.add(candidate.identity));

    this.selectedParsedAbilityCandidateIds.set([...nextIds]);
  }

  public clearParsedAbilityCandidates(category: AutoBuildAbilityCategory): void {
    const categoryIds = new Set(
      this.parsedAbilitySelectionSections()
        .find((section) => section.category === category)
        ?.candidates.map((candidate) => candidate.identity) ?? [],
    );

    this.selectedParsedAbilityCandidateIds.set(
      this.selectedParsedAbilityCandidateIds().filter((identity) => !categoryIds.has(identity)),
    );
  }

  public formatParsedAbilityCategoryLabel(category: AutoBuildAbilityCategory): string {
    switch (category) {
      case 'crewmate':
        return this.i18n.translate('editor.crewmateFilters.title', undefined, 'saved-enemies');
      case 'potential':
        return this.i18n.translate('editor.potentialFilters.title', undefined, 'saved-enemies');
      case 'support':
        return this.i18n.translate('editor.supportFilters.title', undefined, 'saved-enemies');
      default:
        return this.i18n.translate('editor.specialFilters.title', undefined, 'saved-enemies');
    }
  }

  public hasAllParsedAbilityCandidatesSelected(category: AutoBuildAbilityCategory): boolean {
    const section = this.parsedAbilitySelectionSections().find(
      (candidateSection) => candidateSection.category === category,
    );

    return Boolean(
      section &&
      section.candidates.length > 0 &&
      section.candidates.every((candidate) =>
        this.isParsedAbilityCandidateSelected(candidate.identity),
      ),
    );
  }

  public openEnemyMechanicPicker(): void {
    if (this.savingEnemy()) {
      return;
    }

    this.enemyMechanicPickerOpen.set(true);
  }

  public closeEnemyMechanicPicker(): void {
    this.enemyMechanicPickerOpen.set(false);
  }

  public saveEnemyMechanicPicker(drafts: AutoBuildEnemyMechanicRequirement[]): void {
    this.enemyMechanicDrafts.set(createEnemyMechanicDrafts(drafts));
    this.enemyMechanicPickerOpen.set(false);
  }

  public clearEnemyMechanics(): void {
    this.enemyMechanicDrafts.set([]);
  }

  public clearRequiredAbilities(): void {
    this.requiredAbilityDrafts.set([]);
  }

  public clearCrewmateAbilityFilters(): void {
    this.crewmateAbilityDrafts.set([]);
  }

  public clearPotentialAbilityFilters(): void {
    this.potentialAbilityDrafts.set([]);
  }

  public clearSupportAbilityFilters(): void {
    this.supportAbilityDrafts.set([]);
  }

  public async saveEnemy(): Promise<void> {
    if (this.savingEnemy() || this.processingEnemyImage() || !this.canSaveEnemy()) {
      return;
    }

    this.savingEnemy.set(true);

    try {
      const battleRequirements = cloneBattleRequirements(this.battleRequirements());
      const requiredCharacterGroups = flattenBattleRequiredCharacterGroups(battleRequirements);

      await this.userState.saveEnemy({
        id: this.editingEnemy()?.id ?? undefined,
        name: this.enemyName().trim(),
        notes: this.enemyNotes(),
        rawEnemyText: this.enemyTextPasteValue(),
        imageDataUrl: this.enemyImageDataUrl(),
        selectedTypes: this.selectedTypes(),
        selectedClasses: this.selectedClasses(),
        requiredAbilities: this.effectiveRequiredAbilities(),
        ...(requiredCharacterGroups.length ? { requiredCharacterGroups } : {}),
        ...(battleRequirements.length ? { battleRequirements } : {}),
        enemyMechanics: this.serializeEnemyMechanics(),
        requireAllSelectedTypesInTeam: this.requireAllSelectedTypesInTeam(),
        requireAllSelectedClassesPerCharacter: this.requireAllSelectedClassesPerCharacter(),
      });
      this.closeEditor();
    } finally {
      this.savingEnemy.set(false);
    }
  }

  public async confirmAndDeleteEnemy(enemyId: string): Promise<void> {
    const enemy = this.userState.getSavedEnemyById(enemyId);

    if (
      !enemy ||
      !this.confirmDelete(
        this.i18n.translate('confirm.deleteSingle', { name: enemy.name }, 'saved-enemies'),
      )
    ) {
      return;
    }

    await this.userState.deleteEnemy(enemyId);
    this.setEnemySelection(enemyId, false);
  }

  public exportSelectedEnemies(): void {
    if (!this.hasSelection()) {
      return;
    }

    const selectedEnemyIdSet = this.selectedEnemyIdSet();

    downloadSavedEnemiesExport(
      buildSavedEnemiesTransferPayload(
        this.savedEnemies().filter((enemy) => selectedEnemyIdSet.has(enemy.id)),
      ),
    );
  }

  public exportEnemy(enemy: SavedEnemy): void {
    downloadSavedEnemiesExport(buildSavedEnemiesTransferPayload([enemy]));
  }

  public async confirmAndDeleteSelectedEnemies(): Promise<void> {
    const selectedEnemyIds = this.selectedEnemyIds();

    if (
      !selectedEnemyIds.length ||
      !this.confirmDelete(
        this.i18n.translate(
          'confirm.deleteSelected',
          { count: selectedEnemyIds.length },
          'saved-enemies',
        ),
      )
    ) {
      return;
    }

    await this.userState.deleteEnemies(selectedEnemyIds);
    this.selectedEnemyIds.set([]);
  }

  public formatAbilityRequirement(requirement: AutoBuildAbilityRequirement): string {
    return formatAbilityRequirementSummary(
      requirement,
      (abilityKey) => this.abilityCatalogMap().get(abilityKey)?.label ?? abilityKey,
      {
        formatCharacters: (count) =>
          this.i18n.translate('editor.requirementSummary.characters', { count }, 'saved-enemies'),
        formatTurns: (count) =>
          this.i18n.translate('editor.requirementSummary.turns', { count }, 'saved-enemies'),
        formatSlotScope: (scope) =>
          this.i18n.translate(
            `editor.requirementSummary.slotScopes.${scope}`,
            undefined,
            'saved-enemies',
          ),
        formatSourceScope: (scope) =>
          this.i18n.translate(
            `editor.requirementSummary.sourceScopes.${scope}`,
            undefined,
            'saved-enemies',
          ),
      },
    );
  }

  public formatEnemyMechanic(requirement: AutoBuildEnemyMechanicRequirement): string {
    return formatEnemyMechanicSummary(
      requirement,
      (mechanicKey) => this.enemyMechanicCatalogMap().get(mechanicKey)?.label ?? mechanicKey,
      {
        formatTurns: (count) =>
          this.i18n.translate('editor.requirementSummary.turns', { count }, 'saved-enemies'),
        resolveTriggerTag: (tag) =>
          this.i18n.translate(
            `editor.enemyMechanics.tags.trigger.${tag}`,
            undefined,
            'saved-enemies',
          ),
        resolveResponseTag: (tag) =>
          this.i18n.translate(
            `editor.enemyMechanics.tags.response.${tag}`,
            undefined,
            'saved-enemies',
          ),
        resolveConditionTag: (tag) =>
          this.i18n.translate(
            `editor.enemyMechanics.tags.condition.${tag}`,
            undefined,
            'saved-enemies',
          ),
      },
    );
  }

  private buildRequiredCharacterAbilityRailItem(
    view: SavedEnemyRequiredCharacterGroupView,
    category: RequiredCharacterAbilityCategory,
  ): AbilityFilterRailItem {
    return {
      category,
      label: this.i18n.translate(
        `editor.requiredCharacters.categories.${category}`,
        undefined,
        'saved-enemies',
      ),
      count: view.group.abilities.filter((requirement) =>
        this.requiredCharacterRequirementMatchesCategory(requirement, category),
      ).length,
      disabled: this.savingEnemy() || this.resolveCategoryCatalogItems(category).length === 0,
    };
  }

  private requiredCharacterRequirementMatchesCategory(
    requirement: AutoBuildAbilityRequirement,
    category: RequiredCharacterAbilityCategory,
  ): boolean {
    return (
      this.resolveAbilityCatalogItem(requirement.abilityKey)?.category === category &&
      !isCaptainAbilityRequirement(requirement)
    );
  }

  private resolveAbilityCatalogItem(abilityKey: string) {
    return this.abilityCatalogMap().get(abilityKey);
  }

  private resolveCategoryCatalogItems(
    category: RequiredCharacterAbilityCategory,
  ): AutoBuildAbilityCatalog['abilities'] {
    switch (category) {
      case 'crewmate':
        return this.availableCrewmateAbilityCatalogItems();
      case 'potential':
        return this.availablePotentialAbilityCatalogItems();
      case 'support':
        return this.availableSupportAbilityCatalogItems();
      default:
        return this.availableSpecialAbilityCatalogItems();
    }
  }

  public resolveRequiredAbilitySelectedText(draft: AbilityRequirementDraft): string {
    if (draft.abilityKey.length === 0) {
      return this.i18n.translate('common.actions.select');
    }

    return this.formatAbilityRequirement({
      abilityKey: draft.abilityKey,
      minTurns: draft.minTurns,
      slotTokens: draft.slotTokens,
      requiredCharacterCount: resolvePositiveInteger(draft.requiredCharacterCount) ?? 1,
      slotScope: draft.slotScope,
      sourceScope: draft.sourceScope,
    });
  }

  public resolveEnemyMechanicSelectedText(draft: EnemyMechanicDraft): string {
    if (draft.mechanicKey.length === 0) {
      return this.i18n.translate('common.actions.select');
    }

    return this.formatEnemyMechanic({
      mechanicKey: draft.mechanicKey,
      category: draft.category,
      minTurns: draft.minTurns,
      requiredCharacterCount: resolvePositiveInteger(draft.requiredCharacterCount) ?? undefined,
      triggerTags: [...draft.triggerTags],
      responseTags: [...draft.responseTags],
      conditionTags: [...draft.conditionTags],
      derivedAbilityKey: draft.derivedAbilityKey,
    });
  }

  private serializeRequiredAbilities(): AutoBuildAbilityRequirement[] {
    const draftRequirements = [
      ...serializeSpecialAbilityDrafts(
        this.requiredAbilityDrafts(),
        this.availableSpecialAbilityCatalogItems(),
        { dedupe: false },
      ),
      ...serializeCategoryAbilityDrafts(
        this.crewmateAbilityDrafts(),
        this.availableCrewmateAbilityCatalogItems(),
        'crewmate',
        { dedupe: false },
      ),
      ...serializeCategoryAbilityDrafts(
        this.potentialAbilityDrafts(),
        this.availablePotentialAbilityCatalogItems(),
        'potential',
        { dedupe: false },
      ),
      ...serializeCategoryAbilityDrafts(
        this.supportAbilityDrafts(),
        this.availableSupportAbilityCatalogItems(),
        'support',
        { dedupe: false },
      ),
    ];

    if (draftRequirements.length) {
      return draftRequirements;
    }

    return flattenBattleRequiredCharacterGroups(this.battleRequirements()).flatMap((group) =>
      group.abilities.map((requirement) => ({
        ...requirement,
        slotTokens: [...requirement.slotTokens],
        requiredCharacterCount: 1,
      })),
    );
  }

  private serializeEnemyMechanics(): AutoBuildEnemyMechanicRequirement[] {
    return serializeEnemyMechanicDrafts(this.enemyMechanicDrafts());
  }

  private effectiveRequiredAbilities(): AutoBuildAbilityRequirement[] {
    return this.serializeRequiredAbilities();
  }

  private async loadEnemyImage(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      this.enemyImageErrorMessage.set(
        this.i18n.translate('editor.image.errors.invalidType', undefined, 'saved-enemies'),
      );
      return;
    }

    this.processingEnemyImage.set(true);
    this.enemyImageErrorMessage.set('');

    try {
      const rawImageDataUrl = await this.readBlobAsDataUrl(file);
      const resizedImageDataUrl = await this.resizeImageDataUrl(
        rawImageDataUrl,
        this.maxEnemyImageDimension,
      );

      this.enemyImageDataUrl.set(resizedImageDataUrl);
    } catch {
      this.enemyImageErrorMessage.set(
        this.i18n.translate('editor.image.errors.loadFailed', undefined, 'saved-enemies'),
      );
    } finally {
      this.processingEnemyImage.set(false);
    }
  }

  private async readImageUrlAsDataUrl(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Unable to load image from ${imageUrl}.`);
    }

    return this.readBlobAsDataUrl(await response.blob());
  }

  private readBlobAsDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Unable to read image data.'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read image data.'));
      reader.readAsDataURL(blob);
    });
  }

  private resizeImageDataUrl(imageDataUrl: string, maxDimension: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          reject(new Error('Unable to create image canvas.'));
          return;
        }

        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.onerror = () => reject(new Error('Unable to load image.'));
      image.src = imageDataUrl;
    });
  }

  private resolveSelectedValues(value?: string[] | string | null): string[] {
    if (Array.isArray(value)) {
      return [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return [value.trim()];
    }

    return [];
  }

  private setEnemySelection(enemyId: string, checked: boolean): void {
    const normalizedEnemyId = enemyId.trim();

    if (!normalizedEnemyId.length) {
      return;
    }

    const selectedEnemyIds = this.selectedEnemyIds();

    if (checked) {
      if (selectedEnemyIds.includes(normalizedEnemyId)) {
        return;
      }

      this.selectedEnemyIds.set([...selectedEnemyIds, normalizedEnemyId]);
      return;
    }

    this.selectedEnemyIds.set(
      selectedEnemyIds.filter((selectedEnemyId) => selectedEnemyId !== normalizedEnemyId),
    );
  }

  private confirmDelete(message: string): boolean {
    return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
  }

  private createParsedEnemyMechanicDrafts(
    requirements: AutoBuildEnemyMechanicRequirement[],
  ): EnemyMechanicDraft[] {
    return requirements.map((requirement, index) => ({
      draftId: `parsed-mechanic-${Date.now()}-${index}`,
      mechanicKey: requirement.mechanicKey,
      category: requirement.category,
      minTurns: requirement.minTurns,
      requiredCharacterCount: resolvePositiveInteger(requirement.requiredCharacterCount),
      triggerTags: [...requirement.triggerTags],
      responseTags: [...requirement.responseTags],
      conditionTags: [...requirement.conditionTags],
      derivedAbilityKey:
        requirement.derivedAbilityKey ??
        resolveEnemyMechanicCatalogItem(requirement.mechanicKey)?.derivedAbilityKey ??
        null,
    }));
  }

  private translateEnemyTextWarning(warning: ParsedEnemyTextWarning): string {
    if (warning.kind === 'unmatched') {
      return this.i18n.translate(
        'editor.paste.warnings.unmatched',
        { line: warning.line },
        'saved-enemies',
      );
    }

    return this.i18n.translate(
      'editor.paste.warnings.precisionLoss',
      {
        line: warning.line,
        resolvedAs: this.resolveParsedEnemyTextWarningLabel(warning),
      },
      'saved-enemies',
    );
  }

  private resolveParsedEnemyTextWarningLabel(warning: ParsedEnemyTextWarning): string {
    if (!warning.resolvedKey) {
      return this.i18n.translate('common.actions.select');
    }

    if (warning.matchKind === 'ability') {
      return this.abilityCatalogMap().get(warning.resolvedKey)?.label ?? warning.resolvedKey;
    }

    return this.enemyMechanicCatalogMap().get(warning.resolvedKey)?.label ?? warning.resolvedKey;
  }

  private resetEnemyTextParseState(): void {
    this.enemyTextPasteValue.set('');
    this.enemyTextParseResult.set(null);
    this.enemyTextParseErrorMessage.set('');
    this.parsedAbilitySelectionOpen.set(false);
    this.selectedParsedAbilityCandidateIds.set([]);
  }

  private buildParsedAbilityCandidateIdentity(candidate: ParsedEnemyTextAbilityCandidate): string {
    return [candidate.category, candidate.abilityKey.trim(), candidate.slotTokens.join(',')].join(
      '|',
    );
  }
}

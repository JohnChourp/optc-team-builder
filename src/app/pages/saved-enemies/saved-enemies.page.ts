import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type ViewWillEnter } from '@ionic/angular';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { addCircleOutline, closeOutline } from 'ionicons/icons';

import { AUTO_TEAM_BUILDER_TYPES } from '../../core/models/auto-team-builder.models';
import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityRequirement,
  type AutoBuildEnemyMechanicCatalogItem,
  type AutoBuildEnemyMechanicRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import { type DatasetManifest, type SavedEnemy } from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';
import { AbilityRequirementPickerComponent } from '../../shared/ability-requirement-picker/ability-requirement-picker.component';
import { EnemyMechanicPickerComponent } from '../../shared/enemy-mechanic-picker/enemy-mechanic-picker.component';
import {
  createAbilityRequirementDrafts,
  formatAbilityRequirementSummary,
  resolveAbilityRequirementVisual,
  resolvePositiveInteger,
  serializeAbilityRequirementDrafts,
  type AbilityRequirementDraft,
  type AbilityRequirementVisualMeta,
} from '../../core/services/ability-requirement-draft.utils';
import {
  createEnemyMechanicDrafts,
  deriveAbilityRequirementsFromEnemyMechanics,
  formatEnemyMechanicSummary,
  getEnemyMechanicCatalogItems,
  mergeAbilityRequirements,
  resolveEnemyMechanicVisual,
  serializeEnemyMechanicDrafts,
  splitManualAbilityRequirementsFromEnemyMechanics,
  type EnemyMechanicDraft,
  type EnemyMechanicVisualMeta,
} from '../../core/services/enemy-mechanic-draft.utils';

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

@Component({
  selector: 'app-saved-enemies-page',
  standalone: true,
  imports: [
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonModal,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToggle,
    IonToolbar,
    AbilityRequirementPickerComponent,
    EnemyMechanicPickerComponent,
    RouterLink,
    TranslocoDirective,
    TranslocoPipe,
  ],
  templateUrl: './saved-enemies.page.html',
  styleUrl: './saved-enemies.page.scss',
})
export class SavedEnemiesPage implements OnInit, ViewWillEnter {
  private readonly maxEnemyImageDimension = 1200;

  public readonly loading = signal(true);
  public readonly summary = signal<DatasetManifest | null>(null);
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly savedEnemies;
  public readonly editorOpen = signal(false);
  public readonly editingEnemy = signal<SavedEnemy | null>(null);
  public readonly enemyName = signal('');
  public readonly enemyNotes = signal('');
  public readonly enemyImageDataUrl = signal<string | null>(null);
  public readonly enemyImageErrorMessage = signal('');
  public readonly processingEnemyImage = signal(false);
  public readonly selectedTypes = signal<string[]>([]);
  public readonly selectedClasses = signal<string[]>([]);
  public readonly enemyMechanicDrafts = signal<EnemyMechanicDraft[]>([]);
  public readonly enemyMechanicPickerOpen = signal(false);
  public readonly requiredAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly abilityPickerOpen = signal(false);
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
  public readonly requireAllSpecialsSupportTeam = signal(false);
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
      this.allClassesSelected()
        ? 'editor.classesActions.clear'
        : 'editor.classesActions.selectAll',
      undefined,
      'saved-enemies',
    ),
  );
  public readonly availableAbilityCatalogItems = computed(
    () => this.abilityCatalog()?.abilities ?? [],
  );
  public readonly availableEnemyMechanicCatalogItems = computed<AutoBuildEnemyMechanicCatalogItem[]>(
    () => getEnemyMechanicCatalogItems(),
  );
  public readonly abilityCatalogMap = computed(
    () => new Map(this.availableAbilityCatalogItems().map((item) => [item.key, item] as const)),
  );
  public readonly enemyMechanicCatalogMap = computed(
    () =>
      new Map(
        this.availableEnemyMechanicCatalogItems().map((item) => [item.key, item] as const),
      ),
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
  public readonly hasSavedEnemies = computed(() => this.savedEnemies().length > 0);
  public readonly canSaveEnemy = computed(
    () => this.selectedTypes().length > 0 && this.selectedClasses().length > 0,
  );

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

  public getEnemyBuilderQueryParams(enemy: SavedEnemy): { enemyId: string } {
    return { enemyId: enemy.id };
  }

  public openCreateModal(): void {
    this.editingEnemy.set(null);
    this.enemyName.set('');
    this.enemyNotes.set('');
    this.enemyImageDataUrl.set(null);
    this.enemyImageErrorMessage.set('');
    this.processingEnemyImage.set(false);
    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.selectedTypes.set(['DEX']);
    this.selectedClasses.set([]);
    this.enemyMechanicDrafts.set([]);
    this.requiredAbilityDrafts.set([]);
    this.requireAllSelectedTypesInTeam.set(false);
    this.requireAllSelectedClassesPerCharacter.set(false);
    this.requireAllSpecialsSupportTeam.set(false);
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
    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.selectedTypes.set([...enemy.selectedTypes]);
    this.selectedClasses.set([...enemy.selectedClasses]);
    this.enemyMechanicDrafts.set(createEnemyMechanicDrafts(enemy.enemyMechanics));
    this.requiredAbilityDrafts.set(
      createAbilityRequirementDrafts(
        splitManualAbilityRequirementsFromEnemyMechanics(
          enemy.requiredAbilities,
          enemy.enemyMechanics,
        ),
      ),
    );
    this.requireAllSelectedTypesInTeam.set(enemy.requireAllSelectedTypesInTeam);
    this.requireAllSelectedClassesPerCharacter.set(enemy.requireAllSelectedClassesPerCharacter);
    this.requireAllSpecialsSupportTeam.set(enemy.requireAllSpecialsSupportTeam);
    this.savingEnemy.set(false);
    this.editorOpen.set(true);
  }

  public closeEditor(): void {
    this.enemyMechanicPickerOpen.set(false);
    this.abilityPickerOpen.set(false);
    this.editorOpen.set(false);
    this.editingEnemy.set(null);
    this.savingEnemy.set(false);
    this.enemyImageErrorMessage.set('');
    this.processingEnemyImage.set(false);
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

  public async onEnemyImageSelected(event: Event, input: HTMLInputElement): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

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
    if (this.savingEnemy() || !this.availableAbilityCatalogItems().length) {
      return;
    }

    this.abilityPickerOpen.set(true);
  }

  public closeAbilityPicker(): void {
    this.abilityPickerOpen.set(false);
  }

  public saveAbilityPicker(drafts: AbilityRequirementDraft[]): void {
    this.requiredAbilityDrafts.set(drafts);
    this.abilityPickerOpen.set(false);
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

  public onRequireAllSelectedTypesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedTypesInTeam.set(event.detail.checked);
  }

  public onRequireAllSelectedClassesToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSelectedClassesPerCharacter.set(event.detail.checked);
  }

  public onRequireAllSpecialsSupportToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.requireAllSpecialsSupportTeam.set(event.detail.checked);
  }

  public async saveEnemy(): Promise<void> {
    if (this.savingEnemy() || this.processingEnemyImage() || !this.canSaveEnemy()) {
      return;
    }

    this.savingEnemy.set(true);

    try {
      await this.userState.saveEnemy({
        id: this.editingEnemy()?.id ?? undefined,
        name: this.enemyName().trim(),
        notes: this.enemyNotes(),
        imageDataUrl: this.enemyImageDataUrl(),
        selectedTypes: this.selectedTypes(),
        selectedClasses: this.selectedClasses(),
        requiredAbilities: this.effectiveRequiredAbilities(),
        enemyMechanics: this.serializeEnemyMechanics(),
        requireAllSelectedTypesInTeam: this.requireAllSelectedTypesInTeam(),
        requireAllSelectedClassesPerCharacter: this.requireAllSelectedClassesPerCharacter(),
        requireAllSpecialsSupportTeam: this.requireAllSpecialsSupportTeam(),
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
  }

  public formatAbilityRequirement(requirement: AutoBuildAbilityRequirement): string {
    return formatAbilityRequirementSummary(
      requirement,
      (abilityKey) => this.abilityCatalogMap().get(abilityKey)?.label ?? abilityKey,
      {
        formatCharacters: (count) =>
          this.i18n.translate(
            'editor.requirementSummary.characters',
            { count },
            'saved-enemies',
          ),
        formatTurns: (count) =>
          this.i18n.translate('editor.requirementSummary.turns', { count }, 'saved-enemies'),
      },
    );
  }

  public formatEnemyMechanic(requirement: AutoBuildEnemyMechanicRequirement): string {
    return formatEnemyMechanicSummary(
      requirement,
      (mechanicKey) =>
        this.enemyMechanicCatalogMap().get(mechanicKey)?.label ?? mechanicKey,
      {
        formatTurns: (count) =>
          this.i18n.translate('editor.requirementSummary.turns', { count }, 'saved-enemies'),
        resolveTriggerTag: (tag) =>
          this.i18n.translate(`editor.enemyMechanics.tags.trigger.${tag}`, undefined, 'saved-enemies'),
        resolveResponseTag: (tag) =>
          this.i18n.translate(`editor.enemyMechanics.tags.response.${tag}`, undefined, 'saved-enemies'),
        resolveConditionTag: (tag) =>
          this.i18n.translate(
            `editor.enemyMechanics.tags.condition.${tag}`,
            undefined,
            'saved-enemies',
          ),
      },
    );
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
      triggerTags: [...draft.triggerTags],
      responseTags: [...draft.responseTags],
      conditionTags: [...draft.conditionTags],
      derivedAbilityKey: draft.derivedAbilityKey,
    });
  }

  private serializeRequiredAbilities(): AutoBuildAbilityRequirement[] {
    return serializeAbilityRequirementDrafts(this.requiredAbilityDrafts(), {
      dedupe: false,
      catalogMap: this.abilityCatalogMap(),
    });
  }

  private serializeEnemyMechanics(): AutoBuildEnemyMechanicRequirement[] {
    return serializeEnemyMechanicDrafts(this.enemyMechanicDrafts());
  }

  private effectiveRequiredAbilities(): AutoBuildAbilityRequirement[] {
    return mergeAbilityRequirements([
      ...this.derivedRequiredAbilities(),
      ...this.serializeRequiredAbilities(),
    ]);
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
      const rawImageDataUrl = await this.readFileAsDataUrl(file);
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

  private readFileAsDataUrl(file: File): Promise<string> {
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
      reader.readAsDataURL(file);
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

  private confirmDelete(message: string): boolean {
    return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
  }
}

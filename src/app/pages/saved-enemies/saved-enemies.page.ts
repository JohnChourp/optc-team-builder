import { CommonModule } from '@angular/common';
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
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityRequirement,
} from '../../core/models/auto-team-builder-ability.models';
import { type DatasetManifest, type SavedEnemy } from '../../core/models/optc.models';
import { AppI18nService } from '../../core/services/app-i18n.service';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { UserStateService } from '../../core/services/user-state.service';

interface EnemyAbilityRequirementDraft {
  draftId: string;
  abilityKey: string;
  minTurns: number | null;
  slotTokens: string[];
  requiredCharacterCount: number | null;
}

@Component({
  selector: 'app-saved-enemies-page',
  standalone: true,
  imports: [
    CommonModule,
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
  public readonly requiredAbilityDrafts = signal<EnemyAbilityRequirementDraft[]>([]);
  public readonly requireAllSelectedTypesInTeam = signal(false);
  public readonly requireAllSelectedClassesPerCharacter = signal(false);
  public readonly requireAllSpecialsSupportTeam = signal(false);
  public readonly savingEnemy = signal(false);
  public readonly addIcon = addCircleOutline;
  public readonly closeIcon = closeOutline;

  public readonly availableTypes = AUTO_TEAM_BUILDER_TYPES;
  public readonly availableClasses = computed(() => this.summary()?.availableClasses ?? []);
  public readonly availableAbilityCatalogItems = computed(
    () => this.abilityCatalog()?.abilities ?? [],
  );
  public readonly abilityCatalogMap = computed(
    () => new Map(this.availableAbilityCatalogItems().map((item) => [item.key, item] as const)),
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
    this.selectedTypes.set(['DEX']);
    this.selectedClasses.set([]);
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
    this.selectedTypes.set([...enemy.selectedTypes]);
    this.selectedClasses.set([...enemy.selectedClasses]);
    this.requiredAbilityDrafts.set(
      enemy.requiredAbilities.map((requirement) => this.createDraft(requirement)),
    );
    this.requireAllSelectedTypesInTeam.set(enemy.requireAllSelectedTypesInTeam);
    this.requireAllSelectedClassesPerCharacter.set(enemy.requireAllSelectedClassesPerCharacter);
    this.requireAllSpecialsSupportTeam.set(enemy.requireAllSpecialsSupportTeam);
    this.savingEnemy.set(false);
    this.editorOpen.set(true);
  }

  public closeEditor(): void {
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

  public addRequiredAbility(): void {
    const [firstAbility] = this.availableAbilityCatalogItems();

    if (!firstAbility) {
      return;
    }

    this.requiredAbilityDrafts.update((currentDrafts) => [
      ...currentDrafts,
      this.createDraft({
        abilityKey: firstAbility.key,
        minTurns: firstAbility.supportsTurns ? 1 : null,
        slotTokens: [],
        requiredCharacterCount: 1,
      }),
    ]);
  }

  public removeRequiredAbility(draftId: string): void {
    this.requiredAbilityDrafts.update((currentDrafts) =>
      currentDrafts.filter((draft) => draft.draftId !== draftId),
    );
  }

  public onRequiredAbilityKeyChange(
    draftId: string,
    event: CustomEvent<{ value?: string | null }>,
  ): void {
    const abilityKey = (event.detail.value ?? '').trim();

    this.requiredAbilityDrafts.update((currentDrafts) =>
      currentDrafts.map((draft) => {
        if (draft.draftId !== draftId) {
          return draft;
        }

        const ability = this.abilityCatalogMap().get(abilityKey);

        return {
          ...draft,
          abilityKey,
          minTurns: ability?.supportsTurns ? (draft.minTurns ?? 1) : null,
          slotTokens: ability?.supportsSlotTokens ? draft.slotTokens : [],
        };
      }),
    );
  }

  public onRequiredAbilityCountChange(draftId: string, event: Event): void {
    this.updateRequiredAbilityDraft(draftId, {
      requiredCharacterCount: this.resolvePositiveInteger((event.target as HTMLInputElement).value),
    });
  }

  public onRequiredAbilityTurnsChange(draftId: string, event: Event): void {
    this.updateRequiredAbilityDraft(draftId, {
      minTurns: this.resolvePositiveInteger((event.target as HTMLInputElement).value),
    });
  }

  public onRequiredAbilitySlotTokensChange(
    draftId: string,
    event: CustomEvent<{ value?: string[] | string | null }>,
  ): void {
    this.updateRequiredAbilityDraft(draftId, {
      slotTokens: this.resolveSelectedValues(event.detail.value).map((token) =>
        token.toUpperCase(),
      ),
    });
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
    if (this.savingEnemy() || !this.canSaveEnemy()) {
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
        requiredAbilities: this.serializeRequiredAbilities(),
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
    const label =
      this.abilityCatalogMap().get(requirement.abilityKey)?.label ?? requirement.abilityKey;
    const metadata: string[] = [];

    if (requirement.requiredCharacterCount > 1) {
      metadata.push(
        this.i18n.translate(
          'editor.requirementSummary.characters',
          { count: requirement.requiredCharacterCount },
          'saved-enemies',
        ),
      );
    }

    if (requirement.minTurns) {
      metadata.push(
        this.i18n.translate(
          'editor.requirementSummary.turns',
          { count: requirement.minTurns },
          'saved-enemies',
        ),
      );
    }

    if (requirement.slotTokens.length) {
      metadata.push(requirement.slotTokens.join(' / '));
    }

    return metadata.length ? `${label} (${metadata.join(' • ')})` : label;
  }

  public formatAbilityCatalogItemLabel(item: AutoBuildAbilityCatalogItem): string {
    return item.label;
  }

  public resolveAbilityCatalogItem(abilityKey: string): AutoBuildAbilityCatalogItem | null {
    return this.abilityCatalogMap().get(abilityKey) ?? null;
  }

  private createDraft(requirement: AutoBuildAbilityRequirement): EnemyAbilityRequirementDraft {
    return {
      draftId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      abilityKey: requirement.abilityKey,
      minTurns: requirement.minTurns,
      slotTokens: [...requirement.slotTokens],
      requiredCharacterCount: requirement.requiredCharacterCount,
    };
  }

  private updateRequiredAbilityDraft(
    draftId: string,
    patch: Partial<EnemyAbilityRequirementDraft>,
  ): void {
    this.requiredAbilityDrafts.update((currentDrafts) =>
      currentDrafts.map((draft) =>
        draft.draftId === draftId
          ? {
              ...draft,
              ...patch,
            }
          : draft,
      ),
    );
  }

  private serializeRequiredAbilities(): AutoBuildAbilityRequirement[] {
    return this.requiredAbilityDrafts().reduce<AutoBuildAbilityRequirement[]>(
      (requirements, draft) => {
        const abilityKey = draft.abilityKey.trim();

        if (!abilityKey.length) {
          return requirements;
        }

        requirements.push({
          abilityKey,
          minTurns: draft.minTurns && draft.minTurns > 0 ? draft.minTurns : null,
          slotTokens: [
            ...new Set(
              draft.slotTokens.map((token) => token.trim()).filter((token) => token.length > 0),
            ),
          ],
          requiredCharacterCount:
            draft.requiredCharacterCount && draft.requiredCharacterCount > 0
              ? draft.requiredCharacterCount
              : 1,
        });

        return requirements;
      },
      [],
    );
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

  private resolvePositiveInteger(value: string): number | null {
    const parsedValue = Number.parseInt(value, 10);

    return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
  }

  private confirmDelete(message: string): boolean {
    return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false;
  }
}

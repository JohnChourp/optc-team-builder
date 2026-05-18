import { CommonModule } from '@angular/common';
import { Component, type OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import {
  type AutoBuildAbilityCatalog,
  type AutoBuildAbilityCatalogItem,
  type AutoBuildAbilityCategory,
  type AutoBuildAbilityRequirement,
  type AutoBuildAbilitySource,
  type NormalizedBuilderAbility,
} from '../../core/models/auto-team-builder-ability.models';
import { type CharacterDetail, type CharacterDetailRecord } from '../../core/models/optc.models';
import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import {
  createEditableCharacterOverridePayload,
  createLocalCharacterOverrideFromRecord,
  normalizeCharacterDetailInput,
  normalizeLocalCharacterOverride,
} from '../../core/services/character-overrides.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import {
  createAbilityRequirementDrafts,
  type AbilityRequirementDraft,
} from '../../core/services/ability-requirement-draft.utils';
import {
  createCategoryAbilityDrafts,
  getAbilityCatalogItemsByCategory,
  serializeCategoryAbilityDrafts,
  serializeSpecialAbilityDrafts,
} from '../../core/services/special-ability-filter.utils';
import {
  AbilityFilterRailComponent,
  type AbilityFilterRailCategory,
} from '../../shared/ability-filter-rail/ability-filter-rail.component';
import { SpecialAbilityPickerComponent } from '../../shared/special-ability-picker/special-ability-picker.component';
import { ToolbarBackButtonComponent } from '../../shared/toolbar-back-button/toolbar-back-button.component';

type EditorFeedbackTone = 'error' | 'success';
type BuilderAbilityFilterCategory = Exclude<AbilityFilterRailCategory, 'captainAbility'>;

function isBuilderAbilityFilterCategory(
  category: AbilityFilterRailCategory,
): category is BuilderAbilityFilterCategory {
  return (
    category === 'special' ||
    category === 'crewmate' ||
    category === 'potential' ||
    category === 'support'
  );
}

interface EditorFeedback {
  message: string;
  tone: EditorFeedbackTone;
}

@Component({
  selector: 'app-character-edit-page',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToggle,
    IonToolbar,
    AbilityFilterRailComponent,
    SpecialAbilityPickerComponent,
    ToolbarBackButtonComponent,
    TranslocoDirective,
  ],
  templateUrl: './character-edit.page.html',
  styleUrl: './character-edit.page.scss',
})
export class CharacterEditPage implements OnInit {
  public readonly character = signal<CharacterDetailRecord | null>(null);
  public readonly loading = signal(true);
  public readonly saving = signal(false);
  public readonly feedback = signal<EditorFeedback | null>(null);
  public readonly advancedJsonValue = signal('');
  public readonly advancedJsonDirty = signal(false);
  public readonly name = signal('');
  public readonly type = signal('');
  public readonly primaryClass = signal('');
  public readonly secondaryClass = signal('');
  public readonly isIncomplete = signal(false);
  public readonly stars = signal('');
  public readonly cost = signal('');
  public readonly combo = signal('');
  public readonly minHp = signal('');
  public readonly minAtk = signal('');
  public readonly minRcv = signal('');
  public readonly maxHp = signal('');
  public readonly maxAtk = signal('');
  public readonly maxRcv = signal('');
  public readonly growth = signal('');
  public readonly detailDraft = signal<CharacterDetail>(normalizeCharacterDetailInput(0, null));
  public readonly abilityCatalog = signal<AutoBuildAbilityCatalog | null>(null);
  public readonly specialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly specialAbilityPickerOpen = signal(false);
  public readonly crewmateAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly crewmateAbilityPickerOpen = signal(false);
  public readonly potentialAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly potentialAbilityPickerOpen = signal(false);
  public readonly supportAbilityDrafts = signal<AbilityRequirementDraft[]>([]);
  public readonly supportAbilityPickerOpen = signal(false);
  public readonly thumbnailImageDataUrl = signal<string | null>(null);
  public readonly detailImageDataUrl = signal<string | null>(null);
  public readonly thumbnailPreviewUrl = computed(
    () => this.thumbnailImageDataUrl() ?? this.character()?.imageUrl ?? '',
  );
  public readonly detailPreviewUrl = computed(
    () =>
      this.detailImageDataUrl() ??
      this.character()?.detailImageUrl ??
      this.character()?.imageUrl ??
      '',
  );
  public readonly canSave = computed(
    () => !this.loading() && !this.saving() && this.character() !== null,
  );
  public readonly hasExistingOverride = computed(() => {
    const currentCharacter = this.character();

    return currentCharacter ? this.characterOverrides.hasOverride(currentCharacter.id) : false;
  });
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
  private readonly abilityCatalogMap = computed(
    () => new Map(this.availableAbilityCatalogItems().map((item) => [item.key, item] as const)),
  );

  private readonly thumbnailMaxDimension = 320;
  private readonly detailMaxDimension = 1200;

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly repository: OptcRepositoryService,
    private readonly characterOverrides: CharacterOverridesService,
  ) {}

  public async ngOnInit(): Promise<void> {
    const characterId = Number(this.route.snapshot.paramMap.get('id'));

    if (!Number.isInteger(characterId) || characterId <= 0) {
      this.loading.set(false);
      return;
    }

    await this.loadCharacter(characterId);
  }

  public onNameChange(event: CustomEvent<{ value?: string | null }>): void {
    this.name.set((event.detail.value ?? '').toString());
    this.syncAdvancedJsonFromStructured();
  }

  public onTypeChange(event: CustomEvent<{ value?: string | null }>): void {
    this.type.set((event.detail.value ?? '').toString().toUpperCase());
    this.syncAdvancedJsonFromStructured();
  }

  public onPrimaryClassChange(event: CustomEvent<{ value?: string | null }>): void {
    this.primaryClass.set((event.detail.value ?? '').toString());
    this.syncAdvancedJsonFromStructured();
  }

  public onSecondaryClassChange(event: CustomEvent<{ value?: string | null }>): void {
    this.secondaryClass.set((event.detail.value ?? '').toString());
    this.syncAdvancedJsonFromStructured();
  }

  public onIncompleteChange(event: CustomEvent<{ checked: boolean }>): void {
    this.isIncomplete.set(event.detail.checked);
    this.syncAdvancedJsonFromStructured();
  }

  public onNumericInputChange(
    field:
      | 'stars'
      | 'cost'
      | 'combo'
      | 'minHp'
      | 'minAtk'
      | 'minRcv'
      | 'maxHp'
      | 'maxAtk'
      | 'maxRcv'
      | 'growth',
    event: CustomEvent<{ value?: string | number | null }>,
  ): void {
    const nextValue = event.detail.value?.toString() ?? '';

    switch (field) {
      case 'stars':
        this.stars.set(nextValue);
        break;
      case 'cost':
        this.cost.set(nextValue);
        break;
      case 'combo':
        this.combo.set(nextValue);
        break;
      case 'minHp':
        this.minHp.set(nextValue);
        break;
      case 'minAtk':
        this.minAtk.set(nextValue);
        break;
      case 'minRcv':
        this.minRcv.set(nextValue);
        break;
      case 'maxHp':
        this.maxHp.set(nextValue);
        break;
      case 'maxAtk':
        this.maxAtk.set(nextValue);
        break;
      case 'maxRcv':
        this.maxRcv.set(nextValue);
        break;
      case 'growth':
        this.growth.set(nextValue);
        break;
    }

    this.syncAdvancedJsonFromStructured();
  }

  public onAdvancedJsonChange(event: CustomEvent<{ value?: string | null }>): void {
    this.advancedJsonValue.set((event.detail.value ?? '').toString());
    this.advancedJsonDirty.set(true);
    this.feedback.set(null);
  }

  public async onThumbnailFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    await this.loadSelectedImage(event, input, 'thumbnail');
  }

  public async onDetailFileSelected(event: Event, input: HTMLInputElement): Promise<void> {
    await this.loadSelectedImage(event, input, 'detail');
  }

  public clearThumbnailImage(): void {
    this.thumbnailImageDataUrl.set(null);
  }

  public clearDetailImage(): void {
    this.detailImageDataUrl.set(null);
  }

  public openBuilderAbilityPicker(category: AbilityFilterRailCategory): void {
    if (!isBuilderAbilityFilterCategory(category)) {
      return;
    }

    if (!this.resolveCategoryCatalogItems(category).length) {
      return;
    }

    switch (category) {
      case 'crewmate':
        this.crewmateAbilityPickerOpen.set(true);
        break;
      case 'potential':
        this.potentialAbilityPickerOpen.set(true);
        break;
      case 'support':
        this.supportAbilityPickerOpen.set(true);
        break;
      default:
        this.specialAbilityPickerOpen.set(true);
        break;
    }
  }

  public closeBuilderAbilityPicker(category: BuilderAbilityFilterCategory): void {
    switch (category) {
      case 'crewmate':
        this.crewmateAbilityPickerOpen.set(false);
        break;
      case 'potential':
        this.potentialAbilityPickerOpen.set(false);
        break;
      case 'support':
        this.supportAbilityPickerOpen.set(false);
        break;
      default:
        this.specialAbilityPickerOpen.set(false);
        break;
    }
  }

  public saveBuilderAbilityPicker(
    category: BuilderAbilityFilterCategory,
    drafts: AbilityRequirementDraft[],
  ): void {
    const catalogItems = this.resolveCategoryCatalogItems(category);
    const nextDrafts = createAbilityRequirementDrafts(
      category === 'special'
        ? serializeSpecialAbilityDrafts(drafts, catalogItems)
        : serializeCategoryAbilityDrafts(drafts, catalogItems, category),
    );

    this.setBuilderAbilityDrafts(category, nextDrafts);
    this.closeBuilderAbilityPicker(category);
    this.syncBuilderAbilitiesFromDrafts();
    this.syncAdvancedJsonFromStructured();
  }

  public clearBuilderAbilityCategory(category: AbilityFilterRailCategory): void {
    if (!isBuilderAbilityFilterCategory(category)) {
      return;
    }

    this.setBuilderAbilityDrafts(category, []);
    this.syncBuilderAbilitiesFromDrafts();
    this.syncAdvancedJsonFromStructured();
  }

  public applyAdvancedJson(): void {
    const parsedOverride = this.parseAdvancedJson();

    if (!parsedOverride) {
      return;
    }

    this.applyOverrideToDraft(parsedOverride);
    this.feedback.set(null);
  }

  public async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }

    if (this.advancedJsonDirty()) {
      const parsedOverride = this.parseAdvancedJson();

      if (!parsedOverride) {
        return;
      }

      this.applyOverrideToDraft(parsedOverride);
    }

    const characterId = this.character()?.id;

    if (!characterId) {
      return;
    }

    const normalizedOverride = normalizeLocalCharacterOverride(
      this.buildStructuredOverrideInput(characterId),
      this.characterOverrides.getOverrideByCharacterId(characterId),
    );

    if (!normalizedOverride) {
      this.feedback.set({
        tone: 'error',
        message: 'The current draft is missing required character fields.',
      });
      return;
    }

    this.saving.set(true);

    try {
      await this.characterOverrides.saveOverride(normalizedOverride);
      await this.router.navigate(['/characters', characterId]);
    } finally {
      this.saving.set(false);
    }
  }

  public async resetLocalChanges(): Promise<void> {
    const characterId = this.character()?.id;

    if (
      !characterId ||
      !this.hasExistingOverride() ||
      (typeof globalThis.confirm === 'function' &&
        !globalThis.confirm('Delete the current local override for this character?'))
    ) {
      return;
    }

    await this.characterOverrides.deleteOverride(characterId);
    await this.loadCharacter(characterId);
  }

  private async loadCharacter(characterId: number): Promise<void> {
    this.loading.set(true);
    this.feedback.set(null);

    try {
      await this.characterOverrides.ready();
      const [character, abilityCatalog] = await Promise.all([
        this.repository.getCharacterById(characterId),
        this.repository.getAutoBuilderAbilityCatalog().catch(() => null),
      ]);

      this.character.set(character);
      this.abilityCatalog.set(abilityCatalog);

      if (character) {
        this.seedDraft(character);
      }
    } finally {
      this.loading.set(false);
    }
  }

  private seedDraft(character: CharacterDetailRecord): void {
    const override = createLocalCharacterOverrideFromRecord(
      character,
      this.characterOverrides.getOverrideByCharacterId(character.id),
    );
    const [primaryClass, secondaryClass] = override.classes;

    this.name.set(override.name);
    this.type.set(override.type);
    this.primaryClass.set(primaryClass ?? '');
    this.secondaryClass.set(secondaryClass ?? '');
    this.isIncomplete.set(override.isIncomplete);
    this.stars.set(String(override.stars));
    this.cost.set(String(override.cost));
    this.combo.set(String(override.combo));
    this.minHp.set(this.formatNullableNumber(override.minHp));
    this.minAtk.set(this.formatNullableNumber(override.minAtk));
    this.minRcv.set(this.formatNullableNumber(override.minRcv));
    this.maxHp.set(this.formatNullableNumber(override.maxHp));
    this.maxAtk.set(this.formatNullableNumber(override.maxAtk));
    this.maxRcv.set(this.formatNullableNumber(override.maxRcv));
    this.growth.set(this.formatNullableNumber(override.growth));
    this.detailDraft.set(normalizeCharacterDetailInput(character.id, override.detail));
    this.seedBuilderAbilityDrafts(this.detailDraft().builderAbilities);
    this.thumbnailImageDataUrl.set(override.images.thumbnailDataUrl);
    this.detailImageDataUrl.set(override.images.detailDataUrl);
    this.advancedJsonDirty.set(false);
    this.advancedJsonValue.set(
      JSON.stringify(createEditableCharacterOverridePayload(override), null, 2),
    );
  }

  private buildStructuredOverrideInput(characterId: number) {
    const classes = [this.primaryClass(), this.secondaryClass()]
      .map((value) => value.trim())
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

    return {
      characterId,
      name: this.name().trim(),
      isIncomplete: this.isIncomplete(),
      type: this.type().trim().toUpperCase(),
      classes,
      stars: this.parseRequiredInteger(this.stars()),
      cost: this.parseRequiredInteger(this.cost()),
      combo: this.parseRequiredInteger(this.combo()),
      minHp: this.parseNullableNumber(this.minHp()),
      minAtk: this.parseNullableNumber(this.minAtk()),
      minRcv: this.parseNullableNumber(this.minRcv()),
      maxHp: this.parseNullableNumber(this.maxHp()),
      maxAtk: this.parseNullableNumber(this.maxAtk()),
      maxRcv: this.parseNullableNumber(this.maxRcv()),
      growth: this.parseNullableNumber(this.growth()),
      detail: this.detailDraft(),
      images: {
        thumbnailDataUrl: this.thumbnailImageDataUrl(),
        detailDataUrl: this.detailImageDataUrl(),
      },
    };
  }

  private syncAdvancedJsonFromStructured(): void {
    const characterId = this.character()?.id;

    if (!characterId || this.advancedJsonDirty()) {
      return;
    }

    const normalizedOverride = normalizeLocalCharacterOverride(
      this.buildStructuredOverrideInput(characterId),
      this.characterOverrides.getOverrideByCharacterId(characterId),
    );

    if (!normalizedOverride) {
      return;
    }

    this.advancedJsonValue.set(
      JSON.stringify(createEditableCharacterOverridePayload(normalizedOverride), null, 2),
    );
  }

  private parseAdvancedJson() {
    const characterId = this.character()?.id;

    if (!characterId) {
      return null;
    }

    try {
      const parsedValue = JSON.parse(this.advancedJsonValue()) as Record<string, unknown>;
      const normalizedOverride = normalizeLocalCharacterOverride(
        {
          ...parsedValue,
          characterId,
          images: {
            thumbnailDataUrl: this.thumbnailImageDataUrl(),
            detailDataUrl: this.detailImageDataUrl(),
          },
        },
        this.characterOverrides.getOverrideByCharacterId(characterId),
      );

      if (!normalizedOverride) {
        throw new Error('The advanced JSON does not match the expected override shape.');
      }

      this.feedback.set(null);
      return normalizedOverride;
    } catch (error) {
      this.feedback.set({
        tone: 'error',
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : 'The advanced JSON is not valid.',
      });
      return null;
    }
  }

  private applyOverrideToDraft(override: ReturnType<typeof normalizeLocalCharacterOverride>): void {
    if (!override) {
      return;
    }

    const [primaryClass, secondaryClass] = override.classes;

    this.name.set(override.name);
    this.type.set(override.type);
    this.primaryClass.set(primaryClass ?? '');
    this.secondaryClass.set(secondaryClass ?? '');
    this.isIncomplete.set(override.isIncomplete);
    this.stars.set(String(override.stars));
    this.cost.set(String(override.cost));
    this.combo.set(String(override.combo));
    this.minHp.set(this.formatNullableNumber(override.minHp));
    this.minAtk.set(this.formatNullableNumber(override.minAtk));
    this.minRcv.set(this.formatNullableNumber(override.minRcv));
    this.maxHp.set(this.formatNullableNumber(override.maxHp));
    this.maxAtk.set(this.formatNullableNumber(override.maxAtk));
    this.maxRcv.set(this.formatNullableNumber(override.maxRcv));
    this.growth.set(this.formatNullableNumber(override.growth));
    this.detailDraft.set(normalizeCharacterDetailInput(override.characterId, override.detail));
    this.seedBuilderAbilityDrafts(this.detailDraft().builderAbilities);
    this.advancedJsonDirty.set(false);
    this.advancedJsonValue.set(
      JSON.stringify(createEditableCharacterOverridePayload(override), null, 2),
    );
  }

  private seedBuilderAbilityDrafts(abilities: readonly NormalizedBuilderAbility[]): void {
    const requirements = abilities.map((ability) => this.createBuilderAbilityRequirement(ability));
    const catalogItems = this.availableAbilityCatalogItems();

    this.specialAbilityDrafts.set(
      createCategoryAbilityDrafts(requirements, catalogItems, 'special'),
    );
    this.crewmateAbilityDrafts.set(
      createCategoryAbilityDrafts(requirements, catalogItems, 'crewmate'),
    );
    this.potentialAbilityDrafts.set(
      createCategoryAbilityDrafts(requirements, catalogItems, 'potential'),
    );
    this.supportAbilityDrafts.set(
      createCategoryAbilityDrafts(requirements, catalogItems, 'support'),
    );
  }

  private syncBuilderAbilitiesFromDrafts(): void {
    const currentDetail = this.detailDraft();
    const existingAbilityMap = new Map(
      currentDetail.builderAbilities.map((ability) => [ability.key, ability] as const),
    );
    const serializedRequirements = [
      ...serializeSpecialAbilityDrafts(
        this.specialAbilityDrafts(),
        this.availableSpecialAbilityCatalogItems(),
      ),
      ...serializeCategoryAbilityDrafts(
        this.crewmateAbilityDrafts(),
        this.availableCrewmateAbilityCatalogItems(),
        'crewmate',
      ),
      ...serializeCategoryAbilityDrafts(
        this.potentialAbilityDrafts(),
        this.availablePotentialAbilityCatalogItems(),
        'potential',
      ),
      ...serializeCategoryAbilityDrafts(
        this.supportAbilityDrafts(),
        this.availableSupportAbilityCatalogItems(),
        'support',
      ),
    ];
    const selectedKeys = new Set(
      serializedRequirements.map((requirement) => requirement.abilityKey),
    );
    const nextBuilderAbilities = [
      ...currentDetail.builderAbilities.filter(
        (ability) => !this.abilityCatalogMap().has(ability.key) && !selectedKeys.has(ability.key),
      ),
      ...serializedRequirements.map((requirement) =>
        this.createBuilderAbilityFromRequirement(requirement, existingAbilityMap),
      ),
    ];

    this.detailDraft.set({
      ...currentDetail,
      builderAbilities: nextBuilderAbilities,
    });
  }

  private createBuilderAbilityRequirement(
    ability: NormalizedBuilderAbility,
  ): AutoBuildAbilityRequirement {
    return {
      abilityKey: ability.key,
      minTurns: ability.minTurns,
      slotTokens: [...ability.slotTokens],
      requiredCharacterCount: 1,
    };
  }

  private createBuilderAbilityFromRequirement(
    requirement: AutoBuildAbilityRequirement,
    existingAbilityMap: ReadonlyMap<string, NormalizedBuilderAbility>,
  ): NormalizedBuilderAbility {
    const existingAbility = existingAbilityMap.get(requirement.abilityKey);
    const catalogItem = this.abilityCatalogMap().get(requirement.abilityKey);

    return {
      key: requirement.abilityKey,
      label: existingAbility?.label ?? catalogItem?.label ?? requirement.abilityKey,
      minTurns: requirement.minTurns,
      isCompleteRemoval:
        existingAbility?.isCompleteRemoval ?? requirement.abilityKey.startsWith('remove_'),
      slotTokens: [...requirement.slotTokens],
      source: existingAbility?.source ?? this.resolveBuilderAbilitySource(catalogItem?.category),
      coverageMode:
        existingAbility?.coverageMode ??
        (catalogItem?.availableCoverageModes?.includes('explicit') ? 'explicit' : undefined),
    };
  }

  private setBuilderAbilityDrafts(
    category: BuilderAbilityFilterCategory,
    drafts: AbilityRequirementDraft[],
  ): void {
    switch (category) {
      case 'crewmate':
        this.crewmateAbilityDrafts.set(drafts);
        break;
      case 'potential':
        this.potentialAbilityDrafts.set(drafts);
        break;
      case 'support':
        this.supportAbilityDrafts.set(drafts);
        break;
      default:
        this.specialAbilityDrafts.set(drafts);
        break;
    }
  }

  private resolveCategoryCatalogItems(
    category: BuilderAbilityFilterCategory,
  ): AutoBuildAbilityCatalogItem[] {
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

  private resolveBuilderAbilitySource(
    category: AutoBuildAbilityCategory | undefined,
  ): AutoBuildAbilitySource {
    switch (category) {
      case 'crewmate':
        return 'sailorAbilities';
      case 'potential':
        return 'potentialAbilities';
      case 'support':
        return 'supportData';
      default:
        return 'specialText';
    }
  }

  private async loadSelectedImage(
    event: Event,
    input: HTMLInputElement,
    slot: 'thumbnail' | 'detail',
  ): Promise<void> {
    const target = event.target as HTMLInputElement;
    const [file] = Array.from(target.files ?? []);

    input.value = '';

    if (!file || !file.type.startsWith('image/')) {
      return;
    }

    const resizedImageDataUrl = await this.resizeImageDataUrl(
      await this.readBlobAsDataUrl(file),
      slot === 'thumbnail' ? this.thumbnailMaxDimension : this.detailMaxDimension,
    );

    if (slot === 'thumbnail') {
      this.thumbnailImageDataUrl.set(resizedImageDataUrl);
      return;
    }

    this.detailImageDataUrl.set(resizedImageDataUrl);
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

  private parseRequiredInteger(value: string): number {
    return Number.isInteger(Number(value)) ? Number(value) : Number.NaN;
  }

  private parseNullableNumber(value: string): number | null {
    if (!value.trim().length) {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  private formatNullableNumber(value: number | null): string {
    return value === null ? '' : String(value);
  }
}

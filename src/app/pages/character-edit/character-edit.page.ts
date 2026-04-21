import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
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

import { type CharacterDetail, type CharacterDetailRecord } from '../../core/models/optc.models';
import { CharacterOverridesService } from '../../core/services/character-overrides.service';
import {
  createEditableCharacterOverridePayload,
  createLocalCharacterOverrideFromRecord,
  normalizeCharacterDetailInput,
  normalizeLocalCharacterOverride,
} from '../../core/services/character-overrides.utils';
import { OptcRepositoryService } from '../../core/services/optc-repository.service';
import { ToolbarBackButtonComponent } from '../../shared/toolbar-back-button/toolbar-back-button.component';

type EditorFeedbackTone = 'error' | 'success';

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
  public readonly maxLevel = signal('');
  public readonly maxExperience = signal('');
  public readonly minHp = signal('');
  public readonly minAtk = signal('');
  public readonly minRcv = signal('');
  public readonly maxHp = signal('');
  public readonly maxAtk = signal('');
  public readonly maxRcv = signal('');
  public readonly growth = signal('');
  public readonly detailDraft = signal<CharacterDetail>(normalizeCharacterDetailInput(0, null));
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
      | 'maxLevel'
      | 'maxExperience'
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
      case 'maxLevel':
        this.maxLevel.set(nextValue);
        break;
      case 'maxExperience':
        this.maxExperience.set(nextValue);
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
      const character = await this.repository.getCharacterById(characterId);

      this.character.set(character);

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
    this.maxLevel.set(String(override.maxLevel));
    this.maxExperience.set(this.formatNullableNumber(override.maxExperience));
    this.minHp.set(this.formatNullableNumber(override.minHp));
    this.minAtk.set(this.formatNullableNumber(override.minAtk));
    this.minRcv.set(this.formatNullableNumber(override.minRcv));
    this.maxHp.set(this.formatNullableNumber(override.maxHp));
    this.maxAtk.set(this.formatNullableNumber(override.maxAtk));
    this.maxRcv.set(this.formatNullableNumber(override.maxRcv));
    this.growth.set(this.formatNullableNumber(override.growth));
    this.detailDraft.set(normalizeCharacterDetailInput(character.id, override.detail));
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
      maxLevel: this.parseRequiredInteger(this.maxLevel()),
      maxExperience: this.parseNullableNumber(this.maxExperience()),
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
    this.maxLevel.set(String(override.maxLevel));
    this.maxExperience.set(this.formatNullableNumber(override.maxExperience));
    this.minHp.set(this.formatNullableNumber(override.minHp));
    this.minAtk.set(this.formatNullableNumber(override.minAtk));
    this.minRcv.set(this.formatNullableNumber(override.minRcv));
    this.maxHp.set(this.formatNullableNumber(override.maxHp));
    this.maxAtk.set(this.formatNullableNumber(override.maxAtk));
    this.maxRcv.set(this.formatNullableNumber(override.maxRcv));
    this.growth.set(this.formatNullableNumber(override.growth));
    this.detailDraft.set(normalizeCharacterDetailInput(override.characterId, override.detail));
    this.advancedJsonDirty.set(false);
    this.advancedJsonValue.set(
      JSON.stringify(createEditableCharacterOverridePayload(override), null, 2),
    );
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
